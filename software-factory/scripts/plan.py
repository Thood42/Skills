#!/usr/bin/env python3
"""software-factory plan helper.

One call instead of many: locate and mount the plan store, scaffold a plan, report
where a plan stands, lint it, record gate approvals, commit a slice with a structured
message, render review walkthroughs, build the work-item breakdown, and harvest what
the default branch should keep.

Standard library only. Python 3.8+.  Usage: python plan.py <command> --help
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import html
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
TPL = SKILL / "assets" / "templates"
WALK = SKILL / "assets" / "walkthrough"

SCALE = (0.5, 1, 2, 3, 5, 8)
PROOF_KINDS = ("test-output", "command-output", "measured", "screenshot")
GATE_NAMES = {"1": "Product", "2": "Architecture", "3": "Program Design", "4": "Slice plan"}
GATE_DOCS = {"1": "01-product.md", "2": "02-architecture.md", "3": "03-program-design.md",
             "4": "04-slices.md"}
STORE_MARKER = ".plan-store"
WALK_FALLBACK = ".plan-walkthroughs"

DEFAULTS = {
    "planStore": {"mode": "branch", "branch": "plans", "mount": ".plans", "url": ""},
    "vcs": {"branchPrefix": "", "baseBranch": ""},
    "knowledge": {"architecture": "", "adr": "", "agentFile": ""},
    "workItems": {"tool": "", "process": "agile", "pointHours": 8},
}

MAPPINGS = {
    "ado": {
        "agile": {"epic": "Epic", "feature": "Feature", "story": "User Story", "task": "Task", "bug": "Bug"},
        "scrum": {"epic": "Epic", "feature": "Feature", "story": "Product Backlog Item", "task": "Task", "bug": "Bug"},
        "cmmi": {"epic": "Epic", "feature": "Feature", "story": "Requirement", "task": "Task", "bug": "Bug"},
        "basic": {"epic": "Epic", "feature": "Epic", "story": "Issue", "task": "Task", "bug": "Issue"},
    },
    "jira": {
        "default": {"epic": "Epic", "feature": "Epic", "story": "Story", "task": "Sub-task", "bug": "Bug"},
    },
}
ADO_STORY_POINT_FIELD = {"agile": "Story Points", "scrum": "Effort", "cmmi": "Size", "basic": "Effort"}
STATES = {
    "ado": {"new": "New", "active": "Active", "closed": "Closed"},
    "jira": {"new": "To Do", "active": "In Progress", "closed": "Done"},
}

SRC_EXT = {".py", ".js", ".ts", ".tsx", ".jsx", ".cs", ".go", ".rs", ".java", ".kt", ".rb", ".php",
           ".c", ".cc", ".cpp", ".h", ".swift", ".scala", ".sql", ".sh", ".ps1", ".vue", ".svelte"}
ARCH_CANDIDATES = ("docs/architecture.md", "ARCHITECTURE.md", "docs/ARCHITECTURE.md",
                   "docs/architecture/README.md", "architecture.md")
ADR_CANDIDATES = ("docs/adr", "doc/adr", "docs/decisions", "docs/architecture/decisions", "adr")
AGENT_CANDIDATES = ("AGENTS.md", "CLAUDE.md")

BANNED = [
    (r"\bdatabases?\b", "database"), (r"\bschemas?\b", "schema"), (r"\bendpoints?\b", "endpoint"),
    (r"\bSQL\b", "SQL"), (r"\bmigrations?\b", "migration"), (r"\bmicroservices?\b", "microservice"),
    (r"\bGraphQL\b", "GraphQL"), (r"\bREST(?:ful)? API\b", "REST API"), (r"\bforeign keys?\b", "foreign key"),
    (r"\b[\w/-]+\.(?:py|ts|tsx|js|jsx|cs|go|rs|java|kt|rb|php|sql|cpp|c|h)\b", "a source file name"),
]

GATE_RE = re.compile(r"^- (Gate (\d) [—–-] [^:]+|Plan[^:]*): (.*)$")
SLICE_RE = re.compile(r"^- \[( |x|X)\] Slice (\d+)\s*[—–-]\s*(.*)$")
SLICE_H = re.compile(r"^#{2,3} Slice (\d+)\s*[—–-]\s*(.*)$")
FIELD_RE = re.compile(r"^- (What|Tests|Proof|Needs user present|Points|Work item|Tasks|Kind):\s*(.*)$")
TASK_RE = re.compile(r"^\s{2,}- (.+?)(?:\s+[—–-]\s+([\d.]+))?\s*$")


class PlanError(Exception):
    pass


# ----------------------------------------------------------------------------- small helpers

def today():
    return os.environ.get("SF_TODAY") or dt.date.today().isoformat()


def read(p):
    return Path(p).read_text(encoding="utf-8").replace("\r\n", "\n")


def write(p, s):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)


def fill(text, mapping):
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(mapping.get(m.group(1), m.group(0))), text)


def fmt_pts(x):
    if x is None:
        return ""
    return str(int(x)) if float(x) == int(x) else ("%g" % x)


def slugify(s, words=7):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return "-".join(s.split("-")[:words]) or "decision"


def git_try(*a, cwd=None, stdin=None):
    try:
        r = subprocess.run(["git", "-c", "core.quotepath=false", *a], cwd=str(cwd) if cwd else None,
                           input=stdin, capture_output=True, text=True, encoding="utf-8",
                           errors="replace")
    except FileNotFoundError:
        raise PlanError("git is not installed or not on PATH")
    return r.returncode, (r.stdout or "").rstrip("\n"), (r.stderr or "").strip()


def git(*a, cwd=None, stdin=None):
    rc, out, err = git_try(*a, cwd=cwd, stdin=stdin)
    if rc != 0:
        raise PlanError("git %s failed: %s" % (" ".join(a), err or out))
    return out


def strip_comments(text):
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def strip_code(text):
    """Blank out fenced code blocks and inline code, keeping line count."""
    out, fenced = [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            out.append("")
        elif fenced:
            out.append("")
        else:
            out.append(re.sub(r"`[^`]*`", "", line))
    return "\n".join(out)


def placeholders(text):
    """Template placeholders left in a doc: <...> at the start of a line or field value."""
    clean = strip_code(strip_comments_keep_lines(text))
    found = []
    for m in re.finditer(r"(?m)(^[ \t]*|^[ \t]*[-*] (?:[A-Za-z][^:<>\n]*:)?[ \t]*|: )<[^<>]{2,}>", clean):
        found.append((clean.count("\n", 0, m.start()) + 1, m.group(0).strip()[:60]))
    return found


def strip_comments_keep_lines(text):
    return re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def without_placeholders(text):
    """Drop comments and unfilled <placeholders>, keeping the line count."""
    clean = strip_comments_keep_lines(text)
    return re.sub(r"(?m)(^[ \t]*|^[ \t]*[-*] |: )<[^<>]{2,}>\.?",
                  lambda m: m.group(1) + "\n" * m.group(0).count("\n"), clean)


def split_sections(text, level=2):
    """Ordered [(heading, body)] for headings of the given level, ignoring code fences."""
    prefix = "#" * level + " "
    out, cur, buf, fenced = [], None, [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fenced = not fenced
        if not fenced and line.startswith(prefix):
            if cur is not None:
                out.append((cur, "\n".join(buf).strip("\n")))
            cur, buf = line[len(prefix):].strip(), []
        elif cur is not None:
            buf.append(line)
    if cur is not None:
        out.append((cur, "\n".join(buf).strip("\n")))
    return out


def section(text, name, level=2):
    for h, body in split_sections(text, level):
        if h.lower().startswith(name.lower()):
            return body
    return ""


def section_bounds(lines, heading):
    start = None
    for i, l in enumerate(lines):
        if l.strip() == "## " + heading:
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("## "):
            end = j
            break
    return start, end


def section_append(text, heading, line):
    lines = text.split("\n")
    b = section_bounds(lines, heading)
    if b is None:
        while lines and lines[-1] == "":
            lines.pop()
        lines += ["", "## " + heading, line, ""]
    else:
        s, e = b
        k = e
        while k > s + 1 and lines[k - 1].strip() == "":
            k -= 1
        lines.insert(k, line)
    return "\n".join(lines)


def section_set_kv(text, heading, key, value):
    lines = text.split("\n")
    b = section_bounds(lines, heading)
    new = "- %s: %s" % (key, value)
    if b is not None:
        s, e = b
        for i in range(s + 1, e):
            if re.match(r"^- %s:" % re.escape(key), lines[i]):
                lines[i] = new.rstrip()
                return "\n".join(lines)
    return section_append(text, heading, new.rstrip())


# ----------------------------------------------------------------------------- context

class Ctx:
    """Where we are: the code worktree, the main worktree, the config, the plan store."""

    def __init__(self, cwd=None):
        cwd = Path(cwd or os.getcwd()).resolve()
        rc, top, _ = git_try("rev-parse", "--show-toplevel", cwd=cwd)
        self.is_git = rc == 0 and bool(top)
        if self.is_git:
            top = Path(top)
            if (top / STORE_MARKER).exists():  # called from inside the mounted plan store
                rc2, up, _ = git_try("rev-parse", "--show-toplevel", cwd=top.parent)
                if rc2 == 0 and up:
                    top = Path(up)
            self.root = top
            self.main = self._main_worktree()
        else:
            self.root = self.main = cwd
        self.cfg = json.loads(json.dumps(DEFAULTS))
        cfg_file = self.root / ".software-factory.json"
        self.cfg_file = cfg_file
        if cfg_file.exists():
            try:
                user = json.loads(read(cfg_file))
            except ValueError as e:
                raise PlanError(".software-factory.json is not valid JSON: %s" % e)
            for k, v in user.items():
                if isinstance(v, dict) and isinstance(self.cfg.get(k), dict):
                    self.cfg[k].update(v)
                else:
                    self.cfg[k] = v
        self.mode = self.cfg["planStore"]["mode"] if self.is_git else "in-tree"
        if self.mode not in ("branch", "external", "in-tree"):
            raise PlanError("planStore.mode must be branch, external or in-tree")

    def _main_worktree(self):
        rc, out, _ = git_try("worktree", "list", "--porcelain", cwd=self.root)
        if rc == 0:
            blocks = out.split("\n\n")
            if blocks and blocks[0].startswith("worktree ") and "\nbare" not in blocks[0]:
                return Path(blocks[0].split("\n")[0][9:])
        return self.root

    # -- plan store
    @property
    def store_branch(self):
        return self.cfg["planStore"]["branch"]

    def mount_path(self):
        if self.mode == "in-tree":
            return self.root / "docs" / "plans"
        if self.mode == "branch":
            rc, out, _ = git_try("worktree", "list", "--porcelain", cwd=self.root)
            if rc == 0:
                for block in out.split("\n\n"):
                    lines = block.split("\n")
                    if "branch refs/heads/" + self.store_branch in lines and lines[0].startswith("worktree "):
                        p = Path(lines[0][9:])
                        if p.exists():
                            return p
        return self.main / self.cfg["planStore"]["mount"]

    def is_mounted(self):
        if self.mode == "in-tree":
            return True
        return (self.mount_path() / ".git").exists()

    def store_label(self):
        if self.mode == "branch":
            return "branch `%s` mounted at %s" % (self.store_branch, self.cfg["planStore"]["mount"])
        if self.mode == "external":
            return "external repo %s mounted at %s" % (self.cfg["planStore"]["url"] or "(unset)",
                                                        self.cfg["planStore"]["mount"])
        return "in-tree at docs/plans"

    def plan_dir(self, slug, must_exist=True):
        intree = self.root / "docs" / "plans" / slug
        if intree.is_dir():
            return intree
        if self.mode != "in-tree" and not self.is_mounted() and must_exist:
            mount_store(self)
        p = self.mount_path() / slug
        if must_exist and not p.is_dir():
            raise PlanError("no plan '%s' in %s (looked in %s and docs/plans/)" % (slug, self.store_label(), p))
        return p

    def plan_is_intree(self, slug):
        return (self.root / "docs" / "plans" / slug).is_dir() or self.mode == "in-tree"

    # -- conventions
    def default_branch(self):
        if self.cfg["vcs"]["baseBranch"]:
            return self.cfg["vcs"]["baseBranch"]
        rc, out, _ = git_try("symbolic-ref", "--short", "refs/remotes/origin/HEAD", cwd=self.root)
        if rc == 0 and "/" in out:
            return out.split("/", 1)[1]
        for b in ("main", "master"):
            for ref in ("refs/heads/" + b, "refs/remotes/origin/" + b):
                if git_try("rev-parse", "--verify", "--quiet", ref, cwd=self.root)[0] == 0:
                    return b
        rc, out, _ = git_try("branch", "--show-current", cwd=self.root)
        return out or "main"

    def branch_prefix(self):
        if self.cfg["vcs"]["branchPrefix"]:
            return self.cfg["vcs"]["branchPrefix"].rstrip("/")
        rc, out, _ = git_try("for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes",
                             cwd=self.root)
        counts = {}
        for name in out.split("\n") if rc == 0 else []:
            name = re.sub(r"^origin/", "", name.strip())
            if "/" in name and not name.startswith(("HEAD", "plan/")):
                pre = name.split("/", 1)[0]
                counts[pre] = counts.get(pre, 0) + 1
        return max(counts, key=counts.get) if counts else "feature"

    def knowledge(self):
        k = self.cfg["knowledge"]

        def pick(configured, candidates, default, want_dir=False):
            if configured:
                return configured
            for c in candidates:
                p = self.root / c
                if (p.is_dir() if want_dir else p.is_file()):
                    return c
            return default

        arch = pick(k["architecture"], ARCH_CANDIDATES, "docs/architecture.md")
        adr = pick(k["adr"], ADR_CANDIDATES, "docs/adr", want_dir=True)
        agent = pick(k["agentFile"], AGENT_CANDIDATES, "AGENTS.md")
        return {"architecture": arch, "architecture_exists": (self.root / arch).is_file(),
                "adr": adr, "adr_exists": (self.root / adr).is_dir(),
                "agent_file": agent, "agent_file_exists": (self.root / agent).is_file()}

    def classify(self):
        """fresh | existing, with the evidence."""
        if self.is_git:
            rc, n, _ = git_try("rev-list", "--count", "HEAD", cwd=self.root)
            commits = int(n) if rc == 0 and n.isdigit() else 0
            rc, files, _ = git_try("ls-files", cwd=self.root)
            names = files.split("\n") if rc == 0 and files else []
            if commits == 0:
                names = [str(p.relative_to(self.root)) for p in self.root.rglob("*")
                         if p.is_file() and ".git" not in p.parts and self.cfg["planStore"]["mount"] not in p.parts]
        else:
            commits = 0
            names = [str(p.relative_to(self.root)) for p in self.root.rglob("*") if p.is_file()]
        src = [n for n in names if Path(n).suffix.lower() in SRC_EXT]
        kind = "fresh" if len(src) <= 2 and commits <= 3 else "existing"
        return kind, "%d commit(s), %d source file(s)" % (commits, len(src))

    def exclude(self, *patterns):
        if not self.is_git:
            return
        rc, out, _ = git_try("rev-parse", "--git-common-dir", cwd=self.root)
        if rc != 0:
            return
        gd = Path(out) if Path(out).is_absolute() else (self.root / out)
        f = gd / "info" / "exclude"
        cur = read(f) if f.exists() else ""
        add = [p for p in patterns if p not in cur.split("\n")]
        if add:
            write(f, cur + ("" if cur.endswith("\n") or not cur else "\n") + "\n".join(add) + "\n")


def conventional(ctx):
    rc, out, _ = git_try("log", "-30", "--format=%s", cwd=ctx.root)
    subs = [s for s in out.split("\n") if s and not s.startswith("Merge ")] if rc == 0 else []
    if len(subs) < 3:
        return True
    hits = sum(1 for s in subs if re.match(r"^[a-z]+(\([^)]+\))?!?: ", s))
    return hits >= 0.6 * len(subs)


# ----------------------------------------------------------------------------- plan store

def mount_store(ctx, fetch=False):
    """Make sure the plan store is on disk. Returns (path, created)."""
    if ctx.mode == "in-tree":
        p = ctx.mount_path()
        p.mkdir(parents=True, exist_ok=True)
        return p, False
    mount = ctx.mount_path()
    name = ctx.cfg["planStore"]["mount"]
    ctx.exclude("/" + name + "/", "/" + WALK_FALLBACK + "/")
    if (mount / ".git").exists():
        return mount, False
    if mount.exists() and any(mount.iterdir()):
        raise PlanError("%s exists and is not a plan-store checkout; move it or set planStore.mount" % mount)
    created = False
    if ctx.mode == "external":
        url = ctx.cfg["planStore"]["url"]
        if not url:
            raise PlanError("planStore.mode is external but planStore.url is empty")
        git("clone", "-q", url, str(mount), cwd=ctx.main)
        if git_try("rev-parse", "--verify", "--quiet", "HEAD", cwd=mount)[0] != 0:
            created = True
    else:
        br = ctx.store_branch
        git_try("worktree", "prune", cwd=ctx.main)
        if fetch:
            git_try("fetch", "-q", "origin", br, cwd=ctx.main)
        if git_try("rev-parse", "--verify", "--quiet", "refs/heads/" + br, cwd=ctx.main)[0] == 0:
            git("worktree", "add", "-q", str(mount), br, cwd=ctx.main)
        elif git_try("rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + br, cwd=ctx.main)[0] == 0:
            git("worktree", "add", "-q", "--track", "-b", br, str(mount), "origin/" + br, cwd=ctx.main)
        else:
            tree = git("mktree", cwd=ctx.main, stdin="")
            sha = git("commit-tree", tree, "-m", "chore(plans): initialise plan store", cwd=ctx.main)
            git("update-ref", "refs/heads/" + br, sha, cwd=ctx.main)
            git("worktree", "add", "-q", str(mount), br, cwd=ctx.main)
            created = True
    if created or not (mount / STORE_MARKER).exists():
        write(mount / STORE_MARKER, "software-factory plan store v1\n")
        if not (mount / "INDEX.md").exists():
            write(mount / "INDEX.md", read(TPL / "INDEX.md"))
        if not (mount / "estimates.csv").exists():
            write(mount / "estimates.csv",
                  "slug,item,title,points_estimated,points_actual,elapsed_hours,confidence,date\n")
        if not (mount / ".gitignore").exists():
            write(mount / ".gitignore", "walkthrough/\n")
        git("add", "-A", cwd=mount)
        if git("status", "--porcelain", cwd=mount):
            git("commit", "-q", "-m", "chore(plans): seed plan store", cwd=mount)
    return mount, created


def store_commit(ctx, slug, message):
    """Commit plan state. In the store for branch/external; nothing for in-tree (caller decides)."""
    if ctx.plan_is_intree(slug):
        return None
    mount = ctx.mount_path()
    git("add", "-A", cwd=mount)
    if not git("status", "--porcelain", cwd=mount):
        return None
    git("commit", "-q", "-m", message, cwd=mount)
    return git("rev-parse", "--short", "HEAD", cwd=mount)


def index_update(ctx, slug, **fields):
    if ctx.plan_is_intree(slug):
        return
    f = ctx.mount_path() / "INDEX.md"
    text = read(f) if f.exists() else read(TPL / "INDEX.md")
    keys = ["slug", "state", "tier", "work_item", "branch", "commit", "paths", "started"]
    cur = dict.fromkeys(keys, "")
    cur["slug"] = slug
    lines = text.rstrip("\n").split("\n")
    at = None
    for i, l in enumerate(lines):
        if l.startswith("- %s · " % slug):
            parts = [p.strip() for p in l[2:].split(" · ")]
            cur.update(dict(zip(keys, parts + [""] * len(keys))))
            at = i
    for k, v in fields.items():
        if v is not None:
            cur[k] = str(v)
    line = "- " + " · ".join(cur[k] or "-" for k in keys)
    if at is None:
        lines.append(line)
    else:
        lines[at] = line
    write(f, "\n".join(lines) + "\n")


def index_entries(ctx):
    f = ctx.mount_path() / "INDEX.md"
    out = []
    if ctx.mode == "in-tree" or not f.exists():
        return out
    keys = ["slug", "state", "tier", "work_item", "branch", "commit", "paths", "started"]
    for l in read(f).split("\n"):
        if l.startswith("- ") and " · " in l:
            parts = [p.strip() for p in l[2:].split(" · ")]
            out.append(dict(zip(keys, parts + [""] * len(keys))))
    return out


# ----------------------------------------------------------------------------- parsing plans

def gate_state(rest):
    r = rest.replace("*", "").strip()
    if r.upper().startswith("APPROVED"):
        return "approved"
    if r.lower().startswith("in progress"):
        return "in progress"
    return "pending"


def parse_status(text):
    st = {"title": "", "tier": "Full", "project": "", "gates": [], "slices": [], "kv": {}, "lists": {}}
    sec = None
    for i, line in enumerate(strip_comments_keep_lines(text).split("\n")):
        if line.startswith("# "):
            st["title"] = re.sub(r"^Status:\s*", "", line[2:].strip())
            continue
        if line.startswith("## "):
            sec = line[3:].strip()
            continue
        if sec is None:
            m = GATE_RE.match(line)
            if m:
                key = m.group(2) or "plan"
                st["gates"].append({"key": key, "label": m.group(1), "state": gate_state(m.group(3)),
                                    "raw": m.group(3).strip(), "line": i})
                continue
            m = re.match(r"^- (Tier|Project):\s*(.*)$", line)
            if m:
                st[m.group(1).lower()] = m.group(2).strip()
        elif sec == "Slices":
            m = SLICE_RE.match(line)
            if m:
                rest = m.group(3).strip()
                sha = None
                ms = re.search(r"\s*\(([0-9a-f]{7,40})\)\s*$", rest)
                if ms:
                    sha, rest = ms.group(1), rest[:ms.start()].rstrip()
                unv = None
                mu = re.search(r"\s+[—–-]\s+UNVERIFIED:?\s*(.*)$", rest)
                if mu:
                    unv, rest = mu.group(1).strip() or "no reason given", rest[:mu.start()].rstrip()
                st["slices"].append({"n": int(m.group(2)), "done": m.group(1).lower() == "x",
                                     "title": rest, "sha": sha, "unverified": unv, "line": i})
        else:
            if line.startswith("- "):
                st["lists"].setdefault(sec, []).append(line[2:].strip())
                m = re.match(r"^- ([A-Za-z][^:]*):\s*(.*)$", line)
                if m:
                    st["kv"].setdefault(sec, {})[m.group(1).strip()] = m.group(2).strip()
    return st


def clean_value(v):
    v = (v or "").strip()
    return "" if re.fullmatch(r"<[^>]*>", v) else v


def parse_points(v):
    v = clean_value(v)
    m = re.match(r"^\s*(\d+(?:\.\d+)?)", v)
    if not m:
        return None, "", ""
    basis = re.search(r"basis:\s*([^;)]*)", v)
    conf = re.search(r"confidence:\s*(high|medium|low)\b", v, re.I)
    return float(m.group(1)), clean_value(basis.group(1)) if basis else "", conf.group(1).lower() if conf else ""


def slices_doc(pdir):
    for name in ("04-slices.md", "plan.md"):
        if (pdir / name).is_file():
            return pdir / name
    return None


def parse_slices(pdir):
    doc = slices_doc(pdir)
    out = {"doc": doc.name if doc else None, "plan_points": None, "slices": []}
    if not doc:
        return out
    cur, last, in_tasks, fenced = None, None, False, False
    for i, line in enumerate(strip_comments_keep_lines(read(doc)).split("\n")):
        if line.lstrip().startswith("```"):
            fenced = not fenced
        if fenced:
            continue
        m = SLICE_H.match(line)
        if m:
            cur = {"n": int(m.group(1)), "title": clean_value(m.group(2)) or m.group(2).strip(), "what": "",
                   "tests": "", "proof": "", "needs_user": None, "points": None, "basis": "",
                   "confidence": "", "work_item": "", "kind": "story", "tasks": [], "line": i + 1}
            out["slices"].append(cur)
            last, in_tasks = None, False
            continue
        if line.startswith("#"):
            cur, last, in_tasks = None, None, False
            continue
        mp = re.match(r"^- Plan and design:\s*(.*)$", line)
        if mp and cur is None:
            out["plan_points"] = parse_points(mp.group(1))[0]
            continue
        if cur is None:
            continue
        m = FIELD_RE.match(line)
        if m:
            key, val = m.group(1), m.group(2)
            in_tasks = key == "Tasks"
            last = None
            if key == "What":
                cur["what"], last = clean_value(val), "what"
            elif key == "Tests":
                cur["tests"], last = clean_value(val), "tests"
            elif key == "Proof":
                cur["proof"], last = clean_value(val), "proof"
            elif key == "Needs user present":
                v = clean_value(val).lower()
                cur["needs_user"] = True if v.startswith("y") else False if v.startswith("n") else None
            elif key == "Points":
                cur["points"], cur["basis"], cur["confidence"] = parse_points(val)
            elif key == "Work item":
                cur["work_item"] = clean_value(val)
            elif key == "Kind":
                cur["kind"] = "bug" if "bug" in val.lower() else "story"
            continue
        if in_tasks:
            mt = TASK_RE.match(line)
            if mt and clean_value(mt.group(1)) and not mt.group(1).lstrip().startswith("<"):
                cur["tasks"].append({"title": mt.group(1).strip(),
                                     "points": float(mt.group(2)) if mt.group(2) else None})
                continue
        if last and line.startswith("  ") and line.strip():
            cur[last] = (cur[last] + " " + line.strip()).strip()
    return out


def load_plan(ctx, slug):
    pdir = ctx.plan_dir(slug)
    sf = pdir / "00-status.md"
    if not sf.is_file():
        raise PlanError("%s has no 00-status.md" % pdir)
    return pdir, sf, parse_status(read(sf)), parse_slices(pdir)


def next_action(st, sl):
    for g in st["gates"]:
        if g["state"] != "approved":
            n = g["key"]
            name = "the plan" if n == "plan" else "Gate %s — %s" % (n, GATE_NAMES.get(n, ""))
            doc = "plan.md" if n == "plan" else GATE_DOCS.get(n, "")
            return {"kind": "gate", "gate": n, "state": g["state"], "doc": doc,
                    "text": "%s is %s: write or revise %s, run `check --gate %s`, summarise, then ask "
                            "\"Approve %s, or what should change?\"" % (name, g["state"], doc, n,
                                                                         "the plan" if n == "plan" else "Gate " + n)}
    by_n = {s["n"]: s for s in sl["slices"]}
    for s in st["slices"]:
        if s["done"]:
            continue
        d = by_n.get(s["n"], {})
        if s["unverified"]:
            return {"kind": "paused", "slice": s["n"],
                    "text": "Slice %d is UNVERIFIED (%s): paused until it is proven or the user accepts it"
                            % (s["n"], s["unverified"])}
        if d.get("needs_user"):
            return {"kind": "needs-user", "slice": s["n"],
                    "text": "Slice %d — %s needs the user present: confirm before starting" % (s["n"], s["title"])}
        return {"kind": "slice", "slice": s["n"], "text": "Build slice %d — %s" % (s["n"], s["title"])}
    if not st["slices"]:
        return {"kind": "gate", "gate": "4", "text": "No slices recorded yet"}
    harvest = st["kv"].get("Pointers", {}).get("Harvest", "")
    if not harvest or harvest.lower().startswith("pending"):
        return {"kind": "closeout", "text": "All slices done: run `harvest`, make the edits it lists, "
                                            "commit them, then `harvest --done`"}
    return {"kind": "complete", "text": "Plan complete and harvested"}


def set_gate_line(text, key, state, note=""):
    lines = text.split("\n")
    for i, line in enumerate(lines):
        m = GATE_RE.match(line)
        if m and (m.group(2) or "plan") == key:
            val = {"approved": "APPROVED " + today(), "in-progress": "in progress", "pending": "pending"}[state]
            lines[i] = "- %s: %s%s" % (m.group(1), val, " (%s)" % note if note else "")
            return "\n".join(lines)
    raise PlanError("no gate line for '%s' in 00-status.md" % key)


def set_slice_line(text, n, title, done, sha=None, unverified=None):
    new = "- [%s] Slice %d — %s" % ("x" if done else " ", n, title)
    if unverified:
        new += " — UNVERIFIED: " + unverified
    if sha:
        new += " (%s)" % sha
    lines = text.split("\n")
    for i, line in enumerate(lines):
        m = SLICE_RE.match(line)
        if m and int(m.group(2)) == n:
            lines[i] = new
            return "\n".join(lines)
    return section_append(text, "Slices", new)


def sync_status_slices(text, sl):
    have = {s["n"] for s in parse_status(text)["slices"]}
    for s in sl["slices"]:
        if s["n"] not in have:
            text = section_append(text, "Slices", "- [ ] Slice %d — %s" % (s["n"], s["title"]))
    return text


def slice_commits(ctx, slug, n):
    """Commits for a slice, oldest first, found by their `Plan: <slug> slice N` trailer."""
    if not ctx.is_git:
        return []
    rc, out, _ = git_try("log", "--all", "--extended-regexp", "--reverse", "--format=%H",
                         "--grep", "^Plan: %s slice %d$" % (re.escape(slug), n), cwd=ctx.root)
    return [s for s in out.split("\n") if s] if rc == 0 else []


# ----------------------------------------------------------------------------- checks

def run_checks(ctx, slug, gate=None, closeout=False, rules=None):
    pdir, sf, st, sl = load_plan(ctx, slug)
    lite = st["tier"].lower().startswith("lite") or (pdir / "plan.md").is_file() and not (pdir / "01-product.md").is_file()
    F = []

    def add(level, file, msg, line=None):
        F.append({"level": level, "file": file, "line": line, "message": msg})

    if not st["gates"]:
        add("error", "00-status.md", "no gate lines found (expected '- Gate 1 — Product: pending' …)")
    gstate = {g["key"]: g["state"] for g in st["gates"]}

    def want(g):
        """Check gate g's doc now? Yes when asked for it, or when no gate was named and it is in play."""
        if gate is not None:
            return gate == g or (gate == "plan")
        return gstate.get(g, gstate.get("plan", "pending")) != "pending"

    def strict(g):
        return gate == g or gate == "plan"

    def doc_checks(g, name, required, recommended, body=None):
        f = pdir / name
        if body is None:
            if not f.is_file():
                if strict(g):
                    add("error", name, "missing")
                return None
            body = read(f)
        heads = [h.lower() for h, _ in split_sections(body, 2 if not lite else 3)]
        if not lite:
            for r in required:
                if not any(h.startswith(r.lower()) for h in heads):
                    add("error", name, "missing section '## %s'" % r)
            for r in recommended:
                if not any(h.startswith(r.lower()) for h in heads):
                    add("warning", name, "no '## %s' section (added in v2)" % r)
        for ln, snip in placeholders(body):
            add("error" if strict(g) else "warning", name, "template placeholder left in: %s" % snip, ln)
        return body

    # Gate 1 — product: no tech talk
    if want("1"):
        if lite:
            full = read(pdir / "plan.md") if (pdir / "plan.md").is_file() else ""
            body, name = section(full, "Product"), "plan.md"
            if not body and strict("1"):
                add("error", name, "missing '## Product' section")
        else:
            name = "01-product.md"
            body = doc_checks("1", name, ["Problem", "Success metric", "Announcement"],
                              ["Scope", "Riskiest assumption", "Rough size"])
        if body:
            text = strip_code(without_placeholders(body))
            for i, line in enumerate(text.split("\n"), 1):
                if line.startswith("#"):
                    continue
                for rx, label in BANNED:
                    m = re.search(rx, line, re.I)
                    if m:
                        add("error", name, "tech talk in the product gate: '%s' (%s) — move it to Gate 2"
                            % (m.group(0), label), i if not lite else None)
    if want("2") and not lite:
        doc_checks("2", "02-architecture.md", ["Fit", "Flow"],
                   ["Decisions", "Load-bearing bets", "Where a human must stay in the loop"])
    if want("3") and not lite:
        doc_checks("3", "03-program-design.md",
                   ["Files", "Types & signatures", "Test plan", "Least confident decisions"], [])
    if lite and want("4") and (pdir / "plan.md").is_file():
        full = read(pdir / "plan.md")
        for r in ("Product", "Architecture", "Program design", "Slices"):
            if not section(full, r):
                add("error", "plan.md", "missing or empty section '## %s' (Lite keeps all four)" % r)
        for ln, snip in placeholders(full):
            add("error" if strict("4") else "warning", "plan.md", "template placeholder left in: %s" % snip, ln)

    # Gate 4 — slices
    if want("4"):
        name = sl["doc"] or "04-slices.md"
        if not sl["slices"]:
            add("error", name, "no slices found (expected '## Slice 1 — …' entries)")
        if sl["plan_points"] is None and sl["slices"]:
            add("error", name, "'- Plan and design: <points>' is unestimated")
        tests_known = set()
        g3 = pdir / "03-program-design.md"
        src = section(read(g3), "Test plan") if g3.is_file() else section(read(pdir / name), "Program design") if (pdir / name).is_file() else ""
        tests_known = {int(x) for x in re.findall(r"(?m)^\s*(\d+)[.)]", src)}
        nums = [s["n"] for s in sl["slices"]]
        if nums != list(range(1, len(nums) + 1)) and nums:
            add("warning", name, "slice numbers are not 1..N in order: %s" % nums)
        for s in sl["slices"]:
            tag = "Slice %d" % s["n"]
            if not s["what"]:
                add("error", name, "%s has no 'What'" % tag, s["line"])
            if not s["proof"]:
                add("error", name, "%s has no 'Proof' — name how it will be shown to work before building it" % tag, s["line"])
            elif re.search(r"\b(by inspection|should work|looks right|reasoning)\b", s["proof"], re.I):
                add("warning", name, "%s proof reads like reasoning, not something run or measured" % tag, s["line"])
            if s["needs_user"] is None:
                add("error", name, "%s has no 'Needs user present: yes|no'" % tag, s["line"])
            if s["points"] is None:
                add("error", name, "%s is unestimated ('Points: <n> (basis: …; confidence: …)')" % tag, s["line"])
            else:
                if s["points"] > 8:
                    add("error", name, "%s is %s points — over 8 means split the slice" % (tag, fmt_pts(s["points"])), s["line"])
                elif s["points"] not in SCALE:
                    add("warning", name, "%s uses %s points; the scale is 0.5, 1, 2, 3, 5, 8" % (tag, fmt_pts(s["points"])), s["line"])
                if not s["confidence"]:
                    add("warning", name, "%s estimate has no confidence (high | medium | low)" % tag, s["line"])
                if not s["basis"]:
                    add("warning", name, "%s estimate has no basis" % tag, s["line"])
                tsum = sum(t["points"] or 0 for t in s["tasks"])
                if s["tasks"] and tsum > s["points"] + 1e-9:
                    add("warning", name, "%s tasks add up to %s, more than the slice's %s" % (tag, fmt_pts(tsum), fmt_pts(s["points"])), s["line"])
            if tests_known:
                for t in re.findall(r"\d+", s["tests"]):
                    if int(t) not in tests_known:
                        add("warning", name, "%s refers to test %s, which is not in the Gate 3 test plan" % (tag, t), s["line"])
        have = {s["n"] for s in st["slices"]}
        missing = [n for n in nums if n not in have]
        if missing and gstate.get("4", gstate.get("plan")) == "approved":
            add("warning", "00-status.md", "slices %s are in %s but not in the status checklist" % (missing, name))

    # extra rules from an overlay
    for r in rules or []:
        if r.get("gate") and gate is not None and str(r["gate"]) != gate:
            continue
        f = pdir / r["file"]
        if not f.is_file():
            continue
        found = re.search(r["pattern"], read(f), re.M) is not None
        if found != bool(r.get("present", True)):
            add(r.get("level", "error"), r["file"], r.get("message", "rule failed: %s" % r["pattern"]))

    # close-out
    if closeout:
        for s in st["slices"]:
            if not s["done"]:
                add("error", "00-status.md", "Slice %d is not done%s" % (s["n"], " (UNVERIFIED)" if s["unverified"] else ""))
        harvest = st["kv"].get("Pointers", {}).get("Harvest", "")
        if not harvest or harvest.lower().startswith("pending"):
            add("error", "00-status.md", "harvest not recorded: run `harvest --done` or `harvest --none \"reason\"`")
        if ctx.is_git:
            rc, files, _ = git_try("ls-files", cwd=ctx.root)
            tracked = files.split("\n") if rc == 0 and files else []
            mount = ctx.cfg["planStore"]["mount"].strip("/") + "/"
            leaked = [t for t in tracked if t.startswith(mount) or t.startswith("docs/plans/%s/" % slug)
                      or t.startswith(WALK_FALLBACK + "/")]
            if leaked and ctx.mode != "in-tree":
                add("error", leaked[0], "%d planning file(s) are tracked on the code branch; plans belong in the plan store" % len(leaked))
            elif leaked:
                add("warning", leaked[0], "in-tree plan folder still on the branch: run `retire %s`" % slug)
        k = ctx.knowledge()
        if k["architecture_exists"]:
            arch = read(ctx.root / k["architecture"])
            for i, line in enumerate(arch.split("\n"), 1):
                m = re.match(r"^Paths:\s*(.*)$", line)
                if not m or "<" in m.group(1):
                    continue
                for p in [x.strip().strip("`") for x in m.group(1).split(",")]:
                    if p and not (ctx.root / p).exists():
                        add("error", k["architecture"], "section names a path that no longer exists: %s" % p, i)
            if re.search(r"\b(previously|formerly|no longer|until recently|was changed|as of 20\d\d)\b", arch, re.I):
                add("warning", k["architecture"], "reads like change history; this file states the present only")
            for ln, snip in placeholders(arch):
                add("error", k["architecture"], "unfilled section (%s): write it or delete the section — "
                    "only what is known belongs on the default branch" % snip, ln)
                break
        if k["adr_exists"]:
            for f in sorted((ctx.root / k["adr"]).glob("*.md")):
                t = read(f)
                if re.search(r"(?im)^[-*\s]*status:?\s*\**superseded", t):
                    add("warning", "%s/%s" % (k["adr"], f.name), "superseded ADR still on the code branch: run `supersede`")
                if ("software-factory: plan=%s " % slug) in t and placeholders(t.replace("Supersedes: none", "")):
                    add("error", "%s/%s" % (k["adr"], f.name), "ADR stub still has unfilled sections (context, consequences, revisit when)")
    return F


# ----------------------------------------------------------------------------- work items

def build_work_items(ctx, slug, tool_override=None):
    pdir, sf, st, sl = load_plan(ctx, slug)
    wi = st["kv"].get("Work items", {})
    tool = (tool_override or wi.get("Tool", "") or ctx.cfg["workItems"]["tool"] or "").lower().strip()
    tool = {"azure devops": "ado", "azure boards": "ado", "azdo": "ado"}.get(tool, tool)
    if tool in ("none", "-", ""):
        tool_eff, linked = "ado", False
    else:
        tool_eff, linked = tool, True
    if tool_eff not in MAPPINGS:
        raise PlanError("unknown work-item tool '%s' (use ado or jira)" % tool_eff)
    process = ctx.cfg["workItems"]["process"].lower() if tool_eff == "ado" else "default"
    mapping = dict(MAPPINGS[tool_eff].get(process) or list(MAPPINGS[tool_eff].values())[0])
    mapping.update(ctx.cfg["workItems"].get("mapping") or {})
    hours = ctx.cfg["workItems"]["pointHours"]
    lite = st["tier"].lower().startswith("lite")
    old_ids = {}
    jf = pdir / "work-items.json"
    if jf.is_file():
        try:
            old_ids = json.loads(read(jf)).get("ids", {})
        except ValueError:
            old_ids = {}
    states = STATES[tool_eff]
    gstate = {g["key"]: g["state"] for g in st["gates"]}
    plan_ok = gstate.get("4", gstate.get("plan", "pending")) == "approved"
    any_gate = any(g["state"] != "pending" for g in st["gates"])
    done = {s["n"]: s["done"] for s in st["slices"]}
    first_open = next((s["n"] for s in st["slices"] if not s["done"]), None)

    product = ""
    if (pdir / "01-product.md").is_file():
        product = without_placeholders(section(read(pdir / "01-product.md"), "Announcement")).strip()
    elif (pdir / "plan.md").is_file():
        m = re.search(r"(?m)^- Announcement:\s*(.*)$", without_placeholders(read(pdir / "plan.md")))
        product = m.group(1).strip() if m else ""

    def state_for_slice(n):
        if done.get(n):
            return states["closed"]
        return states["active"] if plan_ok and n == first_open else states["new"]

    top_type = "story" if lite else "feature"
    child_type = "task" if lite else "story"
    top_id = wi.get("Feature", "") if not lite else wi.get("Story", wi.get("Feature", ""))
    top = {"key": top_type, "type": top_type, "title": st["title"] or slug, "id": top_id or old_ids.get(top_type, ""),
           "existing": bool(top_id), "description": product, "children": []}
    top["children"].append({
        "key": "plan", "type": child_type, "title": "Plan and design: " + (st["title"] or slug),
        "id": old_ids.get("plan", ""), "points": sl["plan_points"], "basis": "research, the gates and their reviews",
        "confidence": "high" if sl["plan_points"] is not None else "",
        "state": states["closed"] if plan_ok else states["active"] if any_gate else states["new"],
        "acceptance": "All gates approved by the user.", "tags": [], "children": []})
    for s in sl["slices"]:
        kids = []
        if not lite:
            for j, t in enumerate(s["tasks"], 1):
                key = "slice-%d.task-%d" % (s["n"], j)
                kids.append({"key": key, "type": "task", "title": t["title"], "id": old_ids.get(key, ""),
                             "points": t["points"], "state": states["closed"] if done.get(s["n"]) else states["new"],
                             "children": []})
        key = "slice-%d" % s["n"]
        acc = "Proof: %s" % s["proof"] if s["proof"] else ""
        if s["tests"]:
            acc += ("\n" if acc else "") + "Tests green: %s" % s["tests"]
        top["children"].append({
            "key": key, "type": "bug" if s["kind"] == "bug" else child_type,
            "title": "Slice %d — %s" % (s["n"], s["title"]), "id": s["work_item"] or old_ids.get(key, ""),
            "points": s["points"], "basis": s["basis"], "confidence": s["confidence"],
            "state": state_for_slice(s["n"]), "description": s["what"], "acceptance": acc,
            "tags": ["needs-user-present"] if s["needs_user"] else [], "children": kids})
    total = sum((c["points"] or 0) for c in top["children"])
    top["points"] = total
    n_done = sum(1 for s in st["slices"] if s["done"])
    top["state"] = (states["closed"] if st["slices"] and n_done == len(st["slices"])
                    else states["active"] if any_gate else states["new"])
    ids = dict(old_ids)

    def collect(it):
        if it.get("id"):
            ids[it["key"]] = it["id"]
        for c in it["children"]:
            collect(c)
    collect(top)
    epic = wi.get("Epic", "") or old_ids.get("epic", "")
    if epic:
        ids["epic"] = epic
    data = {"schema": 1, "slug": slug, "tool": tool_eff, "linked": linked, "process": process,
            "point_hours": hours, "mapping": mapping, "tier": "Lite" if lite else "Full",
            "epic": {"id": epic, "existing": True} if epic else None,
            "total_points": total, "ids": ids, "items": [top]}
    return pdir, data


def work_items_markdown(data):
    m, hrs = data["mapping"], data["point_hours"]
    tool = {"ado": "Azure DevOps (%s process)" % data["process"].capitalize(), "jira": "Jira"}[data["tool"]]
    top = data["items"][0]
    out = ["# Work items: %s" % top["title"], "",
           "Generated by `plan.py work-items` from the slice plan — edit points and tasks there, not here.", "",
           "- Hierarchy: %s%s" % (tool, "" if data["linked"] else " — default mapping, not linked to a tracker"),
           "- 1 point = one %d-hour block of human effort to do the work by hand" % hrs,
           "- Total: **%s points** (%s hours)" % (fmt_pts(data["total_points"]), fmt_pts(data["total_points"] * hrs)),
           ]
    if data.get("epic"):
        out.append("- Parent %s: %s (existing, linked)" % (m["epic"], data["epic"]["id"]))
    out += ["", "| Type | Title | Points | Confidence | State | ID |", "| --- | --- | --- | --- | --- | --- |"]

    def row(it, depth):
        pre = ("&nbsp;&nbsp;&nbsp;" * depth + "↳ ") if depth else ""
        ident = it.get("id") or ""
        if ident and it.get("existing"):
            ident += " (existing)"
        out.append("| %s%s | %s | %s | %s | %s | %s |" % (pre, m[it["type"]], it["title"].replace("|", "\\|"),
                                                           fmt_pts(it.get("points")), it.get("confidence", "") or "",
                                                           it.get("state", ""), ident))
        for c in it["children"]:
            row(c, depth + 1)
    row(top, 0)
    out += ["", "## Basis for each estimate", ""]
    for c in top["children"]:
        out.append("- **%s** — %s point(s): %s" % (c["title"], fmt_pts(c.get("points")) or "?",
                                                    c.get("basis") or "no basis recorded"))
    low = [c["title"] for c in top["children"] if c.get("confidence") == "low"]
    if low:
        out += ["", "## Low confidence", "",
                "These estimates are weak; research or a spike is probably missing:", ""] + ["- " + t for t in low]
    return "\n".join(out) + "\n"


def export_csv(data, target):
    m, hrs = data["mapping"], data["point_hours"]
    top = data["items"][0]
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    if target == "ado":
        chain = ([{"key": "epic", "type": "epic", "title": "(existing %s %s — replace with its real title)" % (m["epic"], data["epic"]["id"]),
                   "id": data["epic"]["id"], "children": [top]}] if data.get("epic") else [top])
        depth_max = 0

        def depth(it, d):
            nonlocal depth_max
            depth_max = max(depth_max, d)
            for c in it["children"]:
                depth(c, d + 1)
        depth(chain[0], 1)
        titles = ["Title %d" % i for i in range(1, depth_max + 1)]
        sp = ADO_STORY_POINT_FIELD.get(data["process"], "Story Points")
        cols = ["ID", "Work Item Type"] + titles + ["State", "Effort", sp, "Original Estimate", "Tags",
                                                     "Description", "Acceptance Criteria"]
        cols = list(dict.fromkeys(cols))
        w.writerow(cols)

        def emit(it, d):
            r = dict.fromkeys(cols, "")
            r["ID"] = it.get("id", "")
            r["Work Item Type"] = m[it["type"]]
            r["Title %d" % d] = it["title"]
            r["State"] = it.get("state", "") if it.get("id") else ""
            pts = it.get("points")
            if pts is not None:
                if it["type"] == "task":
                    r["Original Estimate"] = fmt_pts(pts * hrs)
                elif it["type"] in ("feature", "epic"):
                    r["Effort"] = fmt_pts(pts)
                else:
                    r[sp] = fmt_pts(pts)
            r["Tags"] = "; ".join(it.get("tags", []))
            r["Description"] = it.get("description", "")
            r["Acceptance Criteria"] = it.get("acceptance", "")
            w.writerow([r[c] for c in cols])
            for c in it["children"]:
                emit(c, d + 1)
        emit(chain[0], 1)
    else:
        cols = ["Issue ID", "Parent", "Issue Type", "Summary", "Story Points", "Original Estimate",
                "Labels", "Status", "Issue Key", "Description"]
        w.writerow(cols)
        counter = [0]

        def emit(it, parent):
            counter[0] += 1
            me = counter[0]
            pts = it.get("points")
            desc = it.get("description", "")
            if it.get("acceptance"):
                desc += ("\n\n" if desc else "") + "Acceptance criteria:\n" + it["acceptance"]
            w.writerow([me, parent, m[it["type"]], it["title"],
                        fmt_pts(pts) if pts is not None and it["type"] != "task" else "",
                        int(pts * hrs * 3600) if pts is not None and it["type"] == "task" else "",
                        " ".join(it.get("tags", [])), it.get("state", "") if it.get("id") else "",
                        it.get("id", ""), desc])
            for c in it["children"]:
                emit(c, me)
        parent = ""
        if data.get("epic"):
            counter[0] += 1
            w.writerow([counter[0], "", m["epic"], "(existing epic — replace with its real summary)", "", "", "", "",
                        data["epic"]["id"], ""])
            parent = counter[0]
        emit(top, parent)
    return buf.getvalue()


def write_work_items(ctx, slug, tool=None):
    pdir, data = build_work_items(ctx, slug, tool)
    write(pdir / "work-items.json", json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    write(pdir / "05-work-items.md", work_items_markdown(data))
    return pdir, data


# ----------------------------------------------------------------------------- walkthroughs

def inline_md(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    return s


def md_to_html(text):
    """Small, forgiving Markdown renderer: headings, lists, tables, fenced code, paragraphs."""
    lines = strip_comments(text).split("\n")
    out, i, para, in_list = [], 0, [], None

    def flush():
        nonlocal para, in_list
        if para:
            out.append("<p>%s</p>" % "<br>".join(inline_md(p) for p in para))
            para = []
        if in_list:
            out.append("</%s>" % in_list)
            in_list = None

    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith("```"):
            flush()
            j, code = i + 1, []
            while j < len(lines) and not lines[j].lstrip().startswith("```"):
                code.append(lines[j])
                j += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(code), quote=False))
            i = j + 1
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush()
            lvl = min(6, len(m.group(1)) + 2)
            out.append("<h%d>%s</h%d>" % (lvl, inline_md(m.group(2)), lvl))
        elif line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|?\s*$", lines[i + 1]):
            flush()
            head = [c.strip() for c in line.strip().strip("|").split("|")]
            rows, j = [], i + 2
            while j < len(lines) and lines[j].startswith("|"):
                rows.append([c.strip() for c in re.split(r"(?<!\\)\|", lines[j].strip().strip("|"))])
                j += 1
            t = ["<div class=\"tablewrap\"><table><thead><tr>%s</tr></thead><tbody>" % "".join("<th>%s</th>" % inline_md(h) for h in head)]
            for r in rows:
                t.append("<tr>%s</tr>" % "".join("<td>%s</td>" % inline_md(c.replace("\\|", "|").replace("&nbsp;", "\u00a0")) for c in r))
            out.append("".join(t) + "</tbody></table></div>")
            i = j
            continue
        elif re.match(r"^\s*([-*]|\d+[.)])\s+", line):
            if para:
                out.append("<p>%s</p>" % "<br>".join(inline_md(p) for p in para))
                para = []
            kind = "ol" if re.match(r"^\s*\d+[.)]\s+", line) else "ul"
            if in_list != kind:
                if in_list:
                    out.append("</%s>" % in_list)
                out.append("<%s>" % kind)
                in_list = kind
            body = re.sub(r"^\s*([-*]|\d+[.)])\s+", "", line)
            body = re.sub(r"^\[( |x|X)\]\s+", lambda mm: "☑ " if mm.group(1).lower() == "x" else "☐ ", body)
            out.append("<li>%s</li>" % inline_md(body))
        elif not line.strip():
            flush()
        elif in_list and line.startswith("  "):
            out[-1] = out[-1][:-5] + " " + inline_md(line.strip()) + "</li>"
        else:
            if in_list:
                out.append("</%s>" % in_list)
                in_list = None
            para.append(line.strip())
        i += 1
    flush()
    return "\n".join(out)


def parse_commit_body(body):
    paras = body.strip().split("\n\n")
    if paras and all(re.match(r"^[A-Za-z][A-Za-z-]*: .+", l) for l in paras[-1].split("\n") if l) and \
            any(l.startswith("Plan: ") for l in paras[-1].split("\n")):
        paras = paras[:-1]
    f = {"what": "", "proof": "", "proof_kind": "", "tests": "", "notes": "", "tour": "", "other": ""}
    cur = "other"
    for line in "\n\n".join(paras).split("\n"):
        m = re.match(r"^(What|Tests|Notes):\s*(.*)$", line)
        mp = re.match(r"^Proof(?: \(([^)]*)\))?:\s*(.*)$", line)
        mt = re.match(r"^Code tour:\s*(.*)$", line)
        if m:
            cur = m.group(1).lower()
            f[cur] = m.group(2)
        elif mp:
            cur = "proof"
            f["proof_kind"], f["proof"] = mp.group(1) or "", mp.group(2)
        elif mt:
            cur = "tour"
            f["tour"] = mt.group(1)
        else:
            f[cur] = (f[cur] + "\n" + line) if f[cur] else line
    return {k: v.strip() for k, v in f.items()}


def parse_diff(text, cap=600):
    files, cur = [], None
    for line in text.split("\n"):
        if line.startswith("diff --git "):
            m = re.match(r"diff --git a/(.*) b/(.*)$", line)
            cur = {"path": m.group(2) if m else line[11:], "lines": [], "binary": False, "status": "modified", "more": 0}
            files.append(cur)
        elif cur is None:
            continue
        elif line.startswith("new file mode"):
            cur["status"] = "added"
        elif line.startswith("deleted file mode"):
            cur["status"] = "deleted"
        elif line.startswith("rename from "):
            cur["status"] = "renamed from " + line[12:]
        elif line.startswith(("Binary files", "GIT binary patch")):
            cur["binary"] = True
        elif line.startswith(("index ", "--- ", "+++ ", "similarity index", "rename to", "old mode", "new mode")):
            continue
        elif len(cur["lines"]) >= cap:
            cur["more"] += 1
        else:
            cur["lines"].append(line)
    return files


def render_diff(sha, files):
    out = []
    for f in files:
        adds = sum(1 for l in f["lines"] if l.startswith("+"))
        dels = sum(1 for l in f["lines"] if l.startswith("-"))
        rows = []
        for l in f["lines"]:
            cls = "add" if l.startswith("+") else "del" if l.startswith("-") else "hunk" if l.startswith("@@") else "ctx"
            rows.append("<div class=\"l %s\">%s</div>" % (cls, html.escape(l, quote=False) or " "))
        if f["binary"]:
            rows.append("<div class=\"l note\">binary file — not shown</div>")
        if f["more"]:
            rows.append("<div class=\"l note\">… %d more lines. Full diff: git show %s -- %s</div>"
                        % (f["more"], sha[:10], html.escape(f["path"])))
        out.append("<details><summary><span class=\"path\">%s</span><span class=\"chip\">%s</span>"
                   "<span class=\"delta\"><span class=\"plus\">+%d</span> <span class=\"minus\">−%d</span></span>"
                   "</summary><div class=\"diff\">%s</div></details>"
                   % (html.escape(f["path"]), html.escape(f["status"]), adds, dels, "\n".join(rows)))
    return "\n".join(out)


def walk_dir(ctx, slug, pdir):
    if ctx.plan_is_intree(slug):
        ctx.exclude("/" + WALK_FALLBACK + "/")
        return ctx.main / WALK_FALLBACK / slug
    return pdir / "walkthrough"


def chip(text, cls=""):
    return "<span class=\"chip %s\">%s</span>" % (cls, html.escape(text))


def plan_version(pdir):
    """Short hash of the plan's content, so a review can tell whether the plan changed under it."""
    h = hashlib.sha1()
    for name in ("00-status.md", "00-research.md", "01-product.md", "02-architecture.md",
                 "03-program-design.md", "04-slices.md", "plan.md"):
        f = pdir / name
        if f.is_file():
            h.update(read(f).encode("utf-8"))
    return h.hexdigest()[:10]


def human_status(st, sl):
    """(kind, label, sentence, gate) describing where the plan stands, in the reader's terms."""
    nxt = next_action(st, sl)
    k = nxt["kind"]
    total = len(st["slices"])
    if k == "gate":
        g = nxt.get("gate", "")
        name = "the plan" if g == "plan" else "Gate %s — %s" % (g, GATE_NAMES.get(g, ""))
        if nxt.get("state") == "in progress":
            return "waiting", "Waiting on you", "Review %s below and sign off." % name, g
        return "drafting", "In progress", "%s is being drafted." % (name[:1].upper() + name[1:]), g
    if k == "slice":
        t = next((s["title"] for s in st["slices"] if s["n"] == nxt["slice"]), "")
        return "building", "Building", "Slice %d of %d: %s." % (nxt["slice"], total, t), None
    if k == "paused":
        why = next((s["unverified"] for s in st["slices"] if s["n"] == nxt["slice"]), "")
        return "paused", "Paused — needs you", "Slice %d could not be proven: %s" % (nxt["slice"], why), None
    if k == "needs-user":
        return "waiting", "Waiting on you", "Slice %d needs you present before it starts." % nxt["slice"], None
    if k == "closeout":
        return "building", "Nearly done", "All %d slices are built. Close-out is next." % total, None
    return "complete", "Complete", "Every slice is built and the plan has been harvested.", None


def render_home(ctx, slug):
    """The plan's home page: status, every gate doc, slices, and a review form. Returns its path."""
    pdir, sf, st, sl = load_plan(ctx, slug)
    out_dir = walk_dir(ctx, slug, pdir)
    out_dir.mkdir(parents=True, exist_ok=True)
    kind, label, sentence, gate = human_status(st, sl)
    awaiting = kind == "waiting" and gate is not None
    lite = (pdir / "plan.md").is_file() and not (pdir / "01-product.md").is_file()
    await_doc = ("plan.md" if gate == "plan" or lite else GATE_DOCS.get(gate or "", "")) if awaiting else ""
    by_n = {s["n"]: s for s in sl["slices"]}
    done = sum(1 for s in st["slices"] if s["done"])
    pts = (sl["plan_points"] or 0) + sum(s["points"] or 0 for s in sl["slices"])
    vc, wi = st["kv"].get("Version control", {}), st["kv"].get("Work items", {})

    chips = [chip(st["tier"] or "Full"), chip((st["project"] or "?") + " project")]
    if vc.get("Code branch"):
        chips.append(chip("branch " + vc["Code branch"]))
    if pts:
        chips.append(chip("%s points" % fmt_pts(pts)))
    if wi.get("Tool", "none").lower() not in ("", "none"):
        chips.append(chip("%s %s" % (wi["Tool"], wi.get("Feature") or "")))

    steps = []
    gstate = {g["key"]: g["state"] for g in st["gates"]}
    for g in st["gates"]:
        name = "Plan" if g["key"] == "plan" else "Gate %s · %s" % (g["key"], GATE_NAMES.get(g["key"], ""))
        cls = "done" if g["state"] == "approved" else "current" if g["key"] == gate else ""
        word = {"approved": "approved", "in progress": "awaiting sign-off" if awaiting and g["key"] == gate else "in progress",
                "pending": "not started"}[g["state"]]
        steps.append("<li class=\"%s\"><strong>%s</strong><span>%s</span></li>" % (cls, html.escape(name), word))
    all_gates = bool(st["gates"]) and all(g["state"] == "approved" for g in st["gates"])
    steps.append("<li class=\"%s\"><strong>Slices</strong><span>%s</span></li>"
                 % ("done" if st["slices"] and done == len(st["slices"]) else "current" if all_gates else "",
                    "%d of %d built" % (done, len(st["slices"])) if st["slices"] else "not planned yet"))
    harvest = st["kv"].get("Pointers", {}).get("Harvest", "pending")
    closed = bool(harvest) and not harvest.lower().startswith("pending")
    steps.append("<li class=\"%s\"><strong>Close-out</strong><span>%s</span></li>" % ("done" if closed else "", "done" if closed else "not yet"))

    def sec_html(target, heading, body_html, tag="section", cls="sec"):
        return ("<%s class=\"%s\" data-target=\"%s\" data-section=\"%s\"><div class=\"sec-head\"><h3>%s</h3>"
                "<button type=\"button\" class=\"cbtn\">Comment</button></div><div class=\"sec-body\">%s</div>"
                "<div class=\"cbox\" hidden><label class=\"visually-hidden\" for=\"c-%s\">Comment on %s</label>"
                "<textarea id=\"c-%s\" rows=\"3\" placeholder=\"Your comment on this part\"></textarea></div></%s>"
                % (tag, cls, html.escape(target, quote=True), html.escape(heading, quote=True), inline_md(heading), body_html,
                   hashlib.sha1((target + heading).encode("utf-8")).hexdigest()[:8], html.escape(heading, quote=True),
                   hashlib.sha1((target + heading).encode("utf-8")).hexdigest()[:8], tag))

    docs = []
    names = [("00-research.md", "Research", None), ("01-product.md", "Gate 1 — Product", "1"),
             ("02-architecture.md", "Gate 2 — Architecture", "2"), ("03-program-design.md", "Gate 3 — Program design", "3"),
             ("04-slices.md", "Gate 4 — Slice plan", "4"), ("plan.md", "The plan (Lite)", "plan")]
    for name, title, key in names:
        f = pdir / name
        if not f.is_file():
            continue
        text = without_placeholders(read(f))
        parts = [sec_html(name, h, md_to_html(body)) for h, body in split_sections(text, 2) if body.strip()]
        if not parts:
            continue
        state = gstate.get(key, "") if key else ""
        badge = (chip("awaiting your sign-off", "warn") if name == await_doc else chip("approved", "ok") if state == "approved"
                 else chip(state) if state else "")
        docs.append("<details class=\"doc%s\"%s><summary>%s %s <span class=\"path\">%s</span></summary><div class=\"body\">%s</div></details>"
                    % (" await" if name == await_doc else "", " open" if name == await_doc else "", html.escape(title), badge, name, "\n".join(parts)))

    slices, attention = [], []
    nums = [s["n"] for s in st["slices"]] or [s["n"] for s in sl["slices"]]
    stat = {s["n"]: s for s in st["slices"]}
    for n in nums:
        d, s = by_n.get(n, {}), stat.get(n, {})
        title = d.get("title") or s.get("title") or "slice %d" % n
        commits = slice_commits(ctx, slug, n)
        bits = [chip("done", "ok") if s.get("done") else chip("UNVERIFIED", "bad") if s.get("unverified") else chip("not built yet")]
        if d.get("points") is not None:
            bits.append(chip("%s point(s)" % fmt_pts(d["points"])))
        if d.get("needs_user"):
            bits.append(chip("needs you present", "warn"))
        if commits:
            bits.append(chip("commit " + commits[-1][:10]))
        body = "<p class=\"meta\">%s</p>" % " ".join(bits)
        if d.get("what"):
            body += "<p>%s</p>" % inline_md(d["what"])
        if d.get("proof"):
            body += "<p class=\"meta\">Proof planned: %s</p>" % inline_md(d["proof"])
        if s.get("unverified"):
            body += "<p><strong>Not proven:</strong> %s</p>" % html.escape(s["unverified"])
            attention.append("<li>Slice %d is <strong>UNVERIFIED</strong>: %s</li>" % (n, html.escape(s["unverified"])))
        elif d.get("needs_user") and not s.get("done"):
            attention.append("<li>Slice %d needs you present before it starts.</li>" % n)
        if (out_dir / ("slice-%d.html" % n)).exists():
            body += "<p><a href=\"slice-%d.html\">Open the review page for this slice</a> (code tour, proof and diff)</p>" % n
        slices.append(sec_html("slice-%d" % n, "Slice %d — %s" % (n, title), body, tag="article", cls="slice"))

    def bullets(items, empty):
        return "<ul>%s</ul>" % "".join("<li>%s</li>" % inline_md(x) for x in items) if items else "<p class=\"meta\">%s</p>" % empty

    work = ""
    if (pdir / "05-work-items.md").is_file():
        work = ("<section><h2>Work items and estimate</h2><details class=\"doc\"><summary>%s points in total <span class=\"path\">05-work-items.md</span></summary>"
                "<div class=\"body\">%s</div></details></section>" % (fmt_pts(pts), md_to_html(read(pdir / "05-work-items.md"))))
    gate_label = ("the whole plan" if gate == "plan" else "Gate %s — %s" % (gate, GATE_NAMES.get(gate, ""))) if gate else \
        ("slices" if all_gates else "general feedback")
    plan_json = json.dumps({"slug": slug, "title": st["title"] or slug, "gate": ("gate" + gate if gate and gate != "plan" else gate or "feedback"),
                            "gateLabel": gate_label, "awaiting": awaiting, "version": plan_version(pdir)},
                           ensure_ascii=False).replace("</", "<\\/")
    if awaiting:
        so_title = "Sign off: %s" % (gate_label[:1].upper() + gate_label[1:])
        so_help = ("Read the open document below, comment where something should change, choose a decision, then send your review "
                   "with the button at the bottom of the page.")
    else:
        so_title = "Your feedback"
        so_help = ("Nothing is waiting for your sign-off right now. You can still comment on any part of the plan or any slice; "
                   "send it with the button at the bottom of the page and it will be treated as feedback.")
    page = fill(read(WALK / "index.html"), {
        "css": read(WALK / "style.css"), "slug": html.escape(slug), "plan_title": html.escape(st["title"] or slug),
        "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"), "chips": "\n    ".join(chips),
        "now_class": kind, "now_label": html.escape(label), "now_text": html.escape(sentence),
        "steps": "\n  ".join(steps), "signoff_title": html.escape(so_title), "signoff_help": so_help,
        "decision_hidden": "" if awaiting else "hidden",
        "attention_section": ("<section><h2>Needs your attention</h2><div class=\"card warnbox\"><ul>%s</ul></div></section>" % "".join(attention)) if attention else "",
        "docs": "\n".join(docs) or "<p class=\"meta\">No plan documents yet.</p>",
        "slices": "\n".join(slices) or "<p class=\"meta\">The slice plan has not been written yet.</p>",
        "work_items_section": work,
        "decisions": bullets(st["lists"].get("Decisions taken by the user", []), "None recorded."),
        "amendments": bullets(st["lists"].get("Amendments at approval", []), "None recorded."),
        "plan_json": plan_json})
    write(out_dir / "index.html", page)
    return str(out_dir / "index.html")


def refresh_home(ctx, slug):
    """Regenerate the home page after a state change. Never fails the command that called it."""
    try:
        return render_home(ctx, slug)
    except Exception:
        return None


def render_walkthrough(ctx, slug, only=None):
    pdir, sf, st, sl = load_plan(ctx, slug)
    out_dir = walk_dir(ctx, slug, pdir)
    out_dir.mkdir(parents=True, exist_ok=True)
    css = read(WALK / "style.css")
    by_n = {s["n"]: s for s in sl["slices"]}
    total = max(len(st["slices"]), len(sl["slices"]))
    written = []
    nums = [s["n"] for s in st["slices"]] or [s["n"] for s in sl["slices"]]
    stat = {s["n"]: s for s in st["slices"]}
    for n in nums:
        d, s = by_n.get(n, {}), stat.get(n, {})
        commits = slice_commits(ctx, slug, n)
        title = d.get("title") or s.get("title") or "slice %d" % n
        page = ""
        if commits and (only is None or n in only):
            last = commits[-1]
            body = parse_commit_body(git("show", "-s", "--format=%b", last, cwd=ctx.root))
            for older in reversed(commits[:-1]):  # a proof-only commit may carry no tour or notes
                ob = parse_commit_body(git("show", "-s", "--format=%b", older, cwd=ctx.root))
                for key in ("what", "tour", "notes", "tests"):
                    body[key] = body[key] or ob[key]
            subject = git("show", "-s", "--format=%s", last, cwd=ctx.root)
            when = git("show", "-s", "--format=%ad", "--date=short", last, cwd=ctx.root)
            diffs, table = [], ["<table><thead><tr><th>File</th><th>Change</th><th class=\"num\">+</th><th class=\"num\">−</th></tr></thead><tbody>"]
            for c in commits:
                files = parse_diff(git("show", "--format=", "--patch", "--no-color", "--no-ext-diff", "-M", c, cwd=ctx.root))
                if len(commits) > 1:
                    diffs.append("<h3>Commit <code>%s</code> — %s</h3>" % (c[:10], html.escape(git("show", "-s", "--format=%s", c, cwd=ctx.root))))
                diffs.append(render_diff(c, files))
                for f in files:
                    table.append("<tr><td><code>%s</code></td><td>%s</td><td class=\"num\">%d</td><td class=\"num\">%d</td></tr>"
                                 % (html.escape(f["path"]), html.escape(f["status"]),
                                    sum(1 for l in f["lines"] if l.startswith("+")),
                                    sum(1 for l in f["lines"] if l.startswith("-"))))
            table.append("</tbody></table>")
            unv = "UNVERIFIED" in body["proof"].upper() or bool(s.get("unverified"))
            chips = [chip("done", "ok") if s.get("done") else chip("UNVERIFIED", "bad") if unv else chip("not checked off", "warn"),
                     chip("commit " + last[:10]), chip(when)]
            if d.get("points") is not None:
                chips.append(chip("%s point(s)" % fmt_pts(d["points"])))
            if d.get("needs_user"):
                chips.append(chip("needs user present", "warn"))
            if d.get("work_item"):
                chips.append(chip("work item " + d["work_item"]))
            proof = ""
            if body["proof_kind"]:
                proof += "<p>%s</p>" % chip(body["proof_kind"], "ok")
            proof += md_to_html(body["proof"] or "No proof recorded in the commit message.")
            if d.get("proof"):
                proof += "<p class=\"meta\">Planned proof: %s</p>" % inline_md(d["proof"])
            if body["tests"] or d.get("tests"):
                proof += "<p class=\"meta\">Tests turned green: %s</p>" % inline_md(body["tests"] or d.get("tests"))
            notes = ""
            extra = "\n\n".join(x for x in (body["notes"], body["other"]) if x)
            if extra:
                notes = "<section><h2>Notes, surprises and test traps</h2><div class=\"card\">%s</div></section>" % md_to_html(extra)
            idx = nums.index(n)
            nav = []
            if idx > 0:
                nav.append("<a href=\"slice-%d.html\">← slice %d</a>" % (nums[idx - 1], nums[idx - 1]))
            nav.append("<a href=\"index.html\">plan walkthrough</a>")
            if idx + 1 < len(nums):
                nav.append("<a href=\"slice-%d.html\">slice %d →</a>" % (nums[idx + 1], nums[idx + 1]))
            page = fill(read(WALK / "slice.html"), {
                "css": css, "n": n, "total": total, "plan_title": html.escape(st["title"] or slug),
                "slice_title": html.escape(title), "chips": "\n    ".join(chips),
                "what": md_to_html(body["what"] or d.get("what") or subject),
                "tour": md_to_html(body["tour"] or "No code tour was recorded in this slice's commit message."),
                "proof": proof, "notes_section": notes, "file_table": "".join(table),
                "diffs": "\n".join(diffs), "nav": "<p>%s</p>" % " · ".join(nav), "sha": last[:10]})
            write(out_dir / ("slice-%d.html" % n), page)
            written.append(str(out_dir / ("slice-%d.html" % n)))
    written.append(render_home(ctx, slug))
    return out_dir, written


# ----------------------------------------------------------------------------- commands

def emit(args, data, text):
    if getattr(args, "json", False):
        print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
    else:
        print(text)


def cmd_config(args):
    ctx = Ctx(args.cwd)
    if args.set:
        cur = json.loads(read(ctx.cfg_file)) if ctx.cfg_file.exists() else {}
        for kv in args.set:
            if "=" not in kv:
                raise PlanError("--set expects key.path=value")
            k, v = kv.split("=", 1)
            node = cur
            parts = k.split(".")
            if parts[0] not in DEFAULTS:
                raise PlanError("unknown setting '%s' (top-level keys: %s)" % (k, ", ".join(DEFAULTS)))
            for p in parts[:-1]:
                node = node.setdefault(p, {})
            try:
                node[parts[-1]] = json.loads(v)
            except ValueError:
                node[parts[-1]] = v
        write(ctx.cfg_file, json.dumps(cur, indent=2) + "\n")
        ctx = Ctx(args.cwd)
    k = ctx.knowledge()
    kind, why = ctx.classify()
    data = {"root": str(ctx.root), "git": ctx.is_git, "project": kind, "evidence": why,
            "plan_store": {"mode": ctx.mode, "label": ctx.store_label(), "path": str(ctx.mount_path()),
                           "mounted": ctx.is_mounted()},
            "default_branch": ctx.default_branch() if ctx.is_git else None,
            "branch_prefix": ctx.branch_prefix() if ctx.is_git else None,
            "conventional_commits": conventional(ctx) if ctx.is_git else None,
            "knowledge": k, "work_items": ctx.cfg["workItems"],
            "config_file": str(ctx.cfg_file) if ctx.cfg_file.exists() else None}
    text = "\n".join([
        "root: %s (%s project: %s)" % (ctx.root, kind, why),
        "plan store: %s%s" % (ctx.store_label(), "" if ctx.is_mounted() else " (not mounted)"),
        "default branch: %s · branch prefix: %s/ · conventional commits: %s"
        % (data["default_branch"], data["branch_prefix"], data["conventional_commits"]),
        "architecture doc: %s%s" % (k["architecture"], "" if k["architecture_exists"] else " (absent)"),
        "ADRs: %s/%s" % (k["adr"], "" if k["adr_exists"] else " (absent)"),
        "agent file: %s%s" % (k["agent_file"], "" if k["agent_file_exists"] else " (absent)"),
        "settings file: %s" % (data["config_file"] or "none (defaults)")])
    emit(args, data, text)


def cmd_mount(args):
    ctx = Ctx(args.cwd)
    path, created = mount_store(ctx, fetch=args.fetch)
    plans = sorted(p.name for p in path.iterdir() if p.is_dir() and (p / "00-status.md").exists()) if path.exists() else []
    emit(args, {"path": str(path), "created": created, "mode": ctx.mode, "plans": plans},
         "%s%s\nplans: %s" % (path, " (created)" if created else "", ", ".join(plans) or "none"))


def cmd_path(args):
    ctx = Ctx(args.cwd)
    p = ctx.plan_dir(args.slug, must_exist=not args.any)
    emit(args, {"path": str(p), "exists": p.is_dir(), "in_tree": ctx.plan_is_intree(args.slug)}, str(p))


def cmd_init(args):
    ctx = Ctx(args.cwd)
    slug = args.slug
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
        raise PlanError("slug must be lowercase letters, digits and hyphens")
    if args.store:
        ctx.mode = args.store if ctx.is_git or args.store == "in-tree" else "in-tree"
    kind, why = ctx.classify()
    notes = []
    base = code_branch = ""
    if ctx.is_git:
        if git_try("rev-parse", "--verify", "--quiet", "HEAD", cwd=ctx.root)[0] != 0 and not args.no_branch:
            git("commit", "-q", "--allow-empty", "-m", "chore: initial commit", cwd=ctx.root)
            notes.append("repo had no commits: made an empty initial commit so a feature branch can be cut")
        base = args.base or ctx.default_branch()
    store, created = mount_store(ctx)
    if created:
        notes.append("created the plan store (%s)" % ctx.store_label())
    pdir = ctx.plan_dir(slug, must_exist=False)
    if pdir.exists() and any(pdir.iterdir()):
        raise PlanError("plan '%s' already exists at %s — use `status %s`" % (slug, pdir, slug))
    title = args.title or slug.replace("-", " ").capitalize()
    lite = args.lite
    if ctx.is_git and not args.no_branch:
        code_branch = args.branch or "%s/%s" % (ctx.branch_prefix(), slug)
        cur = git_try("branch", "--show-current", cwd=ctx.root)[1]
        if cur == code_branch:
            notes.append("already on %s" % code_branch)
        elif git_try("rev-parse", "--verify", "--quiet", "refs/heads/" + code_branch, cwd=ctx.root)[0] == 0:
            git("switch", "-q", code_branch, cwd=ctx.root)
            notes.append("switched to existing branch %s" % code_branch)
        else:
            start = base if git_try("rev-parse", "--verify", "--quiet", "refs/heads/" + base, cwd=ctx.root)[0] == 0 \
                else "origin/" + base if git_try("rev-parse", "--verify", "--quiet", "refs/remotes/origin/" + base, cwd=ctx.root)[0] == 0 else "HEAD"
            git("switch", "-q", "-c", code_branch, start, cwd=ctx.root)
            notes.append("created branch %s from %s" % (code_branch, start))
    elif ctx.is_git:
        code_branch = git_try("branch", "--show-current", cwd=ctx.root)[1]
        notes.append("no branch created (override): staying on %s" % code_branch)
    gates = ("- Plan (all four sections): pending" if lite else
             "\n".join("- Gate %s — %s: pending" % (k, v) for k, v in GATE_NAMES.items()))
    m = {"title": title, "slug": slug, "date": today(), "tier": "Lite" if lite else "Full",
         "project": kind, "gates": gates, "code_branch": code_branch or "none (not a git repo)",
         "base": base or "none", "store": ctx.store_label()}
    files = ["00-status.md", "00-research.md"] + (["plan.md"] if lite else
                                                    ["01-product.md", "02-architecture.md", "03-program-design.md", "04-slices.md"])
    for name in files:
        write(pdir / name, fill(read(TPL / name), m))
    if args.no_branch:
        s = read(pdir / "00-status.md")
        write(pdir / "00-status.md", section_set_kv(s, "Version control", "Override", "commit on the current branch (%s)" % code_branch))
    if kind == "fresh":
        s = read(pdir / "00-research.md")
        write(pdir / "00-research.md", s.replace(
            '<one of: "codebase research" | "user-supplied, exclusive: <pointer to the spec, ticket or doc>" | "fresh project: nothing to research">',
            "fresh project: nothing to research"))
    index_update(ctx, slug, state="planning", tier=m["tier"], branch=code_branch, started=today())
    store_commit(ctx, slug, "plan(%s): start" % slug)
    k = ctx.knowledge()
    home = refresh_home(ctx, slug)
    data = {"slug": slug, "path": str(pdir), "home": home, "tier": m["tier"], "project": kind, "evidence": why,
            "code_branch": code_branch, "base": base, "store": ctx.store_label(), "files": files,
            "knowledge": k, "notes": notes,
            "next": ("Fresh project: skip codebase research; record the user's context and constraints in 00-research.md, then Gate 1."
                     if kind == "fresh" else
                     "Existing project: run `context`, research the area, fill 00-research.md, then Gate 1.")}
    text = "\n".join(["plan folder: %s" % pdir, "tier: %s · project: %s (%s)" % (m["tier"], kind, why),
                      "code branch: %s (base %s)" % (code_branch or "-", base or "-"),
                      "files: " + ", ".join(files), "plan home page: %s" % home] + ["note: " + n for n in notes] + ["next: " + data["next"]])
    emit(args, data, text)


def cmd_status(args):
    ctx = Ctx(args.cwd)
    pdir, sf, st, sl = load_plan(ctx, args.slug)
    nxt = next_action(st, sl)
    vc, wi = st["kv"].get("Version control", {}), st["kv"].get("Work items", {})
    pts = (sl["plan_points"] or 0) + sum(s["points"] or 0 for s in sl["slices"])
    data = {"slug": args.slug, "path": str(pdir), "title": st["title"], "tier": st["tier"], "project": st["project"],
            "gates": [{"gate": g["key"], "state": g["state"], "raw": g["raw"]} for g in st["gates"]],
            "slices": [{"n": s["n"], "title": s["title"], "done": s["done"], "sha": s["sha"],
                        "unverified": s["unverified"]} for s in st["slices"]],
            "next": nxt, "version_control": vc, "work_items": wi, "points": pts,
            "user_decisions": st["lists"].get("Decisions taken by the user", []),
            "amendments": st["lists"].get("Amendments at approval", [])}
    lines = ["%s — %s (%s, %s project)" % (args.slug, st["title"], st["tier"], st["project"] or "?"),
             "folder: %s" % pdir]
    for g in st["gates"]:
        lines.append("  %-28s %s" % (g["label"], g["raw"]))
    done = sum(1 for s in st["slices"] if s["done"])
    if st["slices"]:
        lines.append("slices: %d of %d done%s" % (done, len(st["slices"]), ", %s points planned" % fmt_pts(pts) if pts else ""))
        for s in st["slices"]:
            lines.append("  [%s] %d — %s%s" % ("x" if s["done"] else " ", s["n"], s["title"],
                                               "  UNVERIFIED: " + s["unverified"] if s["unverified"] else ""))
    if vc:
        lines.append("version control: branch %s · override: %s" % (vc.get("Code branch", "?"), vc.get("Override", "none")))
    if wi.get("Tool", "none").lower() not in ("", "none"):
        lines.append("work items: %s · feature %s · epic %s" % (wi.get("Tool"), wi.get("Feature") or "-", wi.get("Epic") or "-"))
    if data["user_decisions"]:
        lines.append("decisions taken by the user (do not undo):")
        lines += ["  - " + d for d in data["user_decisions"]]
    data["home"] = refresh_home(ctx, args.slug)
    lines.append("plan home page: %s" % data["home"])
    lines.append("NEXT: " + nxt["text"])
    emit(args, data, "\n".join(lines))


def cmd_digest(args):
    ctx = Ctx(args.cwd)
    pdir, sf, st, sl = load_plan(ctx, args.slug)
    out = []
    order = ["00-status.md", "00-research.md", "01-product.md", "02-architecture.md", "03-program-design.md",
             "04-slices.md", "plan.md"]
    for name in order:
        f = pdir / name
        if not f.is_file():
            continue
        text = without_placeholders(read(f))
        out.append("===== %s" % name)
        if name == "00-status.md" or args.full:
            out.append("\n".join(l for l in text.split("\n") if l.strip()))
            continue
        for h, body in split_sections(text, 2):
            lines = [l for l in body.split("\n") if l.strip() and l.strip() not in ("-", "- In:", "- Out:", "- Deferred:")]
            lines = [l for l in lines if not re.match(r"^- [A-Za-z ]+:\s*$", l)]
            if not lines:
                continue
            out.append("## " + h)
            out += lines[:args.lines]
            if len(lines) > args.lines:
                out.append("   … %d more line(s) in %s" % (len(lines) - args.lines, name))
    emit(args, {"digest": "\n".join(out)}, "\n".join(out))


def cmd_context(args):
    ctx = Ctx(args.cwd)
    k = ctx.knowledge()
    areas = [a.strip("/\\").replace("\\", "/") for a in (args.area or [])]
    out, data = [], {"knowledge": k, "architecture": "", "adrs": [], "plans": [], "estimates": None}
    kind, why = ctx.classify()
    out.append("project: %s (%s)" % (kind, why))
    if k["architecture_exists"]:
        text = read(ctx.root / k["architecture"])
        if areas and len(text.split("\n")) > 150:
            keep = []
            for h, body in split_sections(text, 2):
                mp = re.search(r"(?m)^Paths:\s*(.*)$", body)
                paths = [p.strip().strip("`").strip("/") for p in mp.group(1).split(",")] if mp else []
                if not paths or any(a.startswith(p) or p.startswith(a) for a in areas for p in paths if p):
                    keep.append("## %s\n%s" % (h, body))
            text = "\n\n".join(keep)
        data["architecture"] = text
        out += ["", "===== %s (the system as it is now)" % k["architecture"], text.strip()]
    else:
        out += ["", "no architecture doc yet (%s): research writes a baseline for the area this feature touches" % k["architecture"]]
    if k["adr_exists"]:
        out += ["", "===== decisions in force (%s/)" % k["adr"]]
        for f in sorted((ctx.root / k["adr"]).glob("*.md")):
            t = read(f)
            title = next((l[2:].strip() for l in t.split("\n") if l.startswith("# ")), f.stem)
            ms = re.search(r"(?im)^[-*\s]*status:?\s*\**\s*([A-Za-z]+)", t)
            status = ms.group(1).lower() if ms else "?"
            dec = " ".join(without_placeholders(section(t, "Decision")).split())[:220]
            data["adrs"].append({"file": f.name, "title": title, "status": status, "decision": dec})
            out.append("- %s [%s] %s%s" % (f.name, status, title, " — " + dec if dec else ""))
    else:
        out += ["", "no ADR folder yet (%s/)" % k["adr"]]
    if k["agent_file_exists"]:
        t = read(ctx.root / k["agent_file"])
        m = re.search(r"<!-- software-factory:start -->(.*?)<!-- software-factory:end -->", t, re.S)
        if m:
            out += ["", "===== %s (software-factory section)" % k["agent_file"], m.group(1).strip()]
        else:
            out += ["", "agent file: %s (read it; no software-factory section yet)" % k["agent_file"]]
    if ctx.mode != "in-tree" and (ctx.is_mounted() or git_try("rev-parse", "--verify", "--quiet", "refs/heads/" + ctx.store_branch, cwd=ctx.root)[0] == 0):
        if not ctx.is_mounted():
            mount_store(ctx)
        entries = index_entries(ctx)
        rel = []
        for e in entries:
            paths = [p.strip().strip("/") for p in e["paths"].split(",") if p.strip() and p.strip() != "-"]
            if not areas or any(a.startswith(p) or p.startswith(a) for a in areas for p in paths):
                rel.append(e)
        data["plans"] = rel
        if rel:
            out += ["", "===== earlier plans%s (background only; anything binding was harvested)" % (" touching " + ", ".join(areas) if areas else "")]
            out += ["- %s · %s · %s · paths: %s" % (e["slug"], e["state"], e["started"], e["paths"]) for e in rel]
        est = ctx.mount_path() / "estimates.csv"
        if est.is_file():
            rows = [r for r in csv.DictReader(io.StringIO(read(est))) if r.get("points_estimated")]
            pairs = [(float(r["points_estimated"]), float(r["points_actual"])) for r in rows if r.get("points_actual")]
            if pairs:
                ratio = sum(a for _, a in pairs) / max(1e-9, sum(e for e, _ in pairs))
                data["estimates"] = {"stories": len(pairs), "actual_over_estimated": round(ratio, 2)}
                out += ["", "estimate calibration: across %d stories, actual effort ran %.2f× the estimate" % (len(pairs), ratio)]
            elif rows:
                out += ["", "estimate history: %d stories recorded, no actuals filled in yet" % len(rows)]
    intree = ctx.root / "docs" / "plans"
    if intree.is_dir() and ctx.mode != "in-tree":
        old = sorted(p.name for p in intree.iterdir() if p.is_dir())
        if old:
            out += ["", "in-tree plan folders found (v1 layout): %s — offer `migrate <slug>`; never move them silently" % ", ".join(old)]
            data["in_tree_plans"] = old
    emit(args, data, "\n".join(out))


def cmd_check(args):
    ctx = Ctx(args.cwd)
    rules = []
    for rf in args.rules or []:
        rules += json.loads(read(rf))
    F = run_checks(ctx, args.slug, gate=args.gate, closeout=args.closeout, rules=rules)
    errs = [f for f in F if f["level"] == "error"]
    lines = ["%s %s%s: %s" % (f["level"].upper(), f["file"], ":%d" % f["line"] if f["line"] else "", f["message"]) for f in F]
    lines.append("%d error(s), %d warning(s)" % (len(errs), len(F) - len(errs)))
    emit(args, {"ok": not errs, "errors": len(errs), "warnings": len(F) - len(errs), "findings": F}, "\n".join(lines))
    return 1 if errs else 0


def cmd_gate(args):
    ctx = Ctx(args.cwd)
    pdir, sf, st, sl = load_plan(ctx, args.slug)
    key = args.gate
    state = args.state
    if state == "approved" and not args.force:
        errs = [f for f in run_checks(ctx, args.slug, gate=key) if f["level"] == "error"]
        if errs:
            raise PlanError("cannot record approval of gate %s: %d check error(s). Run `check %s --gate %s`, fix them, "
                            "and ask again if the doc changed.\n  - %s"
                            % (key, len(errs), args.slug, key, "\n  - ".join(e["message"] for e in errs[:6])))
    text = read(sf)
    text = set_gate_line(text, key, state, args.note or "")
    label = "the plan" if key == "plan" else "Gate %s" % key
    for a in args.amend or []:
        text = section_append(text, "Amendments at approval", "- %s, %s: %s" % (today(), label, a))
    for d in args.decision or []:
        text = section_append(text, "Decisions taken by the user", "- %s, %s: %s" % (today(), label, d))
    if key in ("4", "plan"):
        text = sync_status_slices(text, sl)
    write(sf, text)
    hints = []
    if state == "approved" and key in ("4", "plan"):
        _, wdata = write_work_items(ctx, args.slug)
        index_update(ctx, args.slug, state="building", work_item=wdata["items"][0].get("id") or None)
        hints.append("slice checklist synced into 00-status.md; work items regenerated")
        hints.append("slices now run without stopping: build → prove → `commit --slice N` → `walkthrough` → next")
    if state == "approved" and key == "2" and st["project"].lower().startswith("fresh"):
        k = ctx.knowledge()
        hints.append("fresh project: seed %s and ADR 0001 from this gate now — `harvest %s --stubs`" % (k["architecture"], args.slug))
    sha = store_commit(ctx, args.slug, "plan(%s): %s %s" % (args.slug, label, state.replace("-", " ")))
    st2 = parse_status(read(sf))
    nxt = next_action(st2, parse_slices(pdir))
    home = refresh_home(ctx, args.slug)
    if state == "in-progress":
        hints.append("give the user the plan home page link: they can read the doc, comment and sign off there")
    emit(args, {"gate": key, "state": state, "store_commit": sha, "hints": hints, "home": home, "next": nxt},
         "\n".join(["%s recorded as %s" % (label, state), "plan home page: %s" % home] + ["hint: " + h for h in hints] + ["NEXT: " + nxt["text"]]))


def cmd_save(args):
    ctx = Ctx(args.cwd)
    pdir = ctx.plan_dir(args.slug)
    msg = args.message or "plan(%s): update" % args.slug
    if ctx.plan_is_intree(args.slug):
        if not ctx.is_git:
            emit(args, {"committed": False}, "not a git repo: nothing to commit")
            return
        git("add", "--", str(pdir), cwd=ctx.root)
        if git_try("diff", "--cached", "--quiet", "--", str(pdir), cwd=ctx.root)[0] == 0:
            emit(args, {"committed": False}, "plan folder unchanged")
            return
        git("commit", "-q", "-m", msg, "--", str(pdir), cwd=ctx.root)
        emit(args, {"committed": True, "where": "code branch"}, "committed plan folder on the code branch (in-tree mode)")
        return
    sha = store_commit(ctx, args.slug, msg)
    refresh_home(ctx, args.slug)
    emit(args, {"committed": bool(sha), "sha": sha, "where": "plan store"},
         "plan store commit %s" % sha if sha else "plan store unchanged")


def cmd_commit(args):
    ctx = Ctx(args.cwd)
    if not ctx.is_git:
        raise PlanError("not a git repository: record the slice by ticking it in 00-status.md")
    pdir, sf, st, sl = load_plan(ctx, args.slug)
    n = args.slice
    d = next((s for s in sl["slices"] if s["n"] == n), None)
    if d is None:
        raise PlanError("slice %d is not in %s" % (n, sl["doc"]))
    for name in ("proof", "tour", "notes", "unverified"):  # "@file" reads the text from a file
        v = getattr(args, name)
        if v and v.startswith("@") and Path(v[1:]).is_file():
            setattr(args, name, read(v[1:]).strip())
    unv = (args.unverified or "").strip()
    accepted = (args.accepted_by_user or "").strip()
    if accepted and not unv:
        raise PlanError("--accepted-by-user goes with --unverified: it records the user accepting an unproven slice")
    if not unv:
        if args.proof_kind not in PROOF_KINDS:
            raise PlanError("--proof-kind must be one of %s. Reasoning alone is not proof: if nothing could be "
                            "run or measured, pass --unverified \"reason\" instead" % ", ".join(PROOF_KINDS))
        if not (args.proof or "").strip():
            raise PlanError("--proof is required: what was run or measured, and the result")
    if not (args.tour or "").strip() and not args.proof_only:
        raise PlanError("--tour is required: where the new logic lives, the one function to read, what was surprising")
    override = st["kv"].get("Version control", {}).get("Override", "none").lower()
    no_commit = "no commit" in override
    intree = ctx.plan_is_intree(args.slug)
    title = re.sub(r"^tracer(?: bullet)?:\s*", "", d["title"], flags=re.I)
    tool = (st["kv"].get("Work items", {}).get("Tool", "") or ctx.cfg["workItems"]["tool"] or "").lower()
    wid = d["work_item"]
    ctype = args.type or ("test" if args.proof_only else "fix" if d["kind"] == "bug" else "feat")
    if args.proof_only:
        title = "prove " + title
    if args.subject:
        subject = args.subject
    elif conventional(ctx):
        subject = "%s%s: %s (slice %d)" % (ctype, "(%s)" % args.scope if args.scope else "", title, n)
    else:
        subject = "Slice %d: %s" % (n, title)
    if wid and wid not in subject:
        if tool in ("ado", "azure devops", "azure boards"):
            subject += " AB#%s" % wid.lstrip("#")
        elif tool == "jira":
            subject = "%s %s" % (wid, subject)
        else:
            subject += " [%s]" % wid
    body = ["What: %s" % (d["what"] or title)]
    if unv:
        body.append("Proof: UNVERIFIED — %s%s" % (unv, " Accepted by the user: %s" % accepted if accepted else ""))
    else:
        body.append("Proof (%s): %s" % (args.proof_kind, args.proof.strip()))
    done = not unv or bool(accepted)
    flag = None if done else unv
    if d["tests"]:
        body.append("Tests: %s" % d["tests"])
    if args.notes:
        body.append("Notes: %s" % args.notes.strip())
    tour = "\n\nCode tour:\n%s" % args.tour.strip() if (args.tour or "").strip() else ""
    msg = "%s\n\n%s%s\n\nPlan: %s slice %d\n" % (subject, "\n".join(body), tour, args.slug, n)
    for t in args.trailer or []:
        msg += t.strip() + "\n"
    sha = None
    text = set_slice_line(read(sf), n, d["title"], done=done, unverified=flag)
    if no_commit:
        write(sf, text)
    else:
        if args.all:
            git("add", "-A", cwd=ctx.root)
        if intree:
            write(sf, text)
            git("add", "--", str(pdir), cwd=ctx.root)
        if git_try("diff", "--cached", "--quiet", cwd=ctx.root)[0] == 0 and not args.proof_only:
            raise PlanError("nothing is staged: stage this slice's changes (git add …) or pass --all. "
                            "To record proof for a slice whose code is already committed, pass --proof-only")
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8", newline="\n") as tf:
            tf.write(msg)
        try:
            git("commit", "-q", "--allow-empty", "-F", tf.name, cwd=ctx.root)
        finally:
            os.unlink(tf.name)
        sha = git("rev-parse", "--short", "HEAD", cwd=ctx.root)
        if not intree:
            write(sf, set_slice_line(read(sf), n, d["title"], done=done, sha=sha, unverified=flag))
    if (pdir / "work-items.json").is_file():
        write_work_items(ctx, args.slug)
    st2 = parse_status(read(sf))
    all_done = st2["slices"] and all(s["done"] for s in st2["slices"])
    index_update(ctx, args.slug, state="done" if all_done else "building", commit=sha)
    store_sha = store_commit(ctx, args.slug, "plan(%s): slice %d %s%s" % (args.slug, n, "done" if done else "UNVERIFIED",
                                                                           " (%s)" % sha if sha else ""))
    nxt = next_action(st2, parse_slices(pdir))
    refresh_home(ctx, args.slug)
    pause = not done or nxt["kind"] in ("needs-user", "paused", "closeout", "complete")
    data = {"slice": n, "code_commit": sha, "plan_commit": store_sha, "subject": subject, "unverified": bool(unv),
            "done": done, "pause": pause, "next": nxt}
    lines = ["slice %d %s%s" % (n, "committed" if done else "recorded as UNVERIFIED", " as %s: %s" % (sha, subject) if sha else " (no commit: override)")]
    if store_sha:
        lines.append("plan store commit %s" % store_sha)
    lines.append("then: `walkthrough %s --slice %d`" % (args.slug, n))
    lines.append(("PAUSE — " if pause else "CONTINUE — ") + nxt["text"])
    emit(args, data, "\n".join(lines))


def cmd_home(args):
    ctx = Ctx(args.cwd)
    path = render_home(ctx, args.slug)
    emit(args, {"home": path}, "plan home page: %s" % path)


def find_review_file(ctx, slug, pdir):
    cands = []
    for folder in (pdir, ctx.root, Path.home() / "Downloads"):
        if not folder.is_dir():
            continue
        for f in folder.glob("plan-review-%s-*.json" % slug):
            try:  # another plan's slug may merely start with this one
                if f.is_file() and json.loads(read(f).lstrip("﻿")).get("slug") == slug:
                    cands.append(f)
            except (ValueError, OSError):
                continue
    return max(cands, key=lambda f: f.stat().st_mtime) if cands else None


def cmd_review(args):
    """Read a review exported from the plan home page, record it in the plan folder, print it."""
    ctx = Ctx(args.cwd)
    pdir, sf, st, sl = load_plan(ctx, args.slug)
    src = Path(args.file) if args.file else find_review_file(ctx, args.slug, pdir)
    if src is None or not src.is_file():
        raise PlanError("no review file found for '%s'. Looked for plan-review-%s-*.json in the plan folder, %s and %s. "
                        "If the user pasted their review into the chat, act on that text directly."
                        % (args.slug, args.slug, ctx.root, Path.home() / "Downloads"))
    try:
        data = json.loads(read(src).lstrip("﻿"))
    except ValueError as e:
        raise PlanError("%s is not valid JSON: %s" % (src, e))
    if data.get("kind") != "software-factory-review":
        raise PlanError("%s is not a review exported from a plan home page" % src)
    if data.get("slug") != args.slug:
        raise PlanError("that review is for plan '%s', not '%s'" % (data.get("slug"), args.slug))
    comments = [c for c in data.get("comments", []) if (c.get("text") or "").strip()]
    decision = data.get("decision") or "none"
    stale = data.get("version") and data["version"] != plan_version(pdir)
    digest = hashlib.sha1(json.dumps([decision, data.get("overall"), comments], sort_keys=True).encode("utf-8")).hexdigest()[:10]
    rdir = pdir / "reviews"
    known = {f.stem.rsplit("-", 1)[-1] for f in rdir.glob("*.json")} if rdir.is_dir() else set()
    recorded = None
    if digest not in known:
        stamp = re.sub(r"[^0-9]", "", str(data.get("exported", "")))[:12] or dt.datetime.now().strftime("%Y%m%d%H%M")
        recorded = rdir / ("%s-%s-%s.json" % (data.get("gate") or "feedback", stamp, digest))
        write(recorded, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        store_commit(ctx, args.slug, "plan(%s): review received (%s, %s)" % (args.slug, data.get("gateLabel") or data.get("gate"), decision))
    gate = str(data.get("gate") or "").replace("gate", "")
    how = {
        "approve": "A clear yes. If there are comments, they are notes, not conditions: answer them, then `gate %s %s approved`." % (args.slug, gate),
        "approve-with-changes": "Approved on condition. Fold every comment into the doc, then `gate %s %s approved --amend \"<what changed>\"` "
                                "(one --amend per change). Ask again only if a change alters a decision the user has not seen." % (args.slug, gate),
        "changes": "Not approved. Revise the doc to address every comment, then ask the approval question again.",
        "feedback": "No sign-off was pending. Treat each comment as feedback: answer it, and say what you changed or why not.",
        "none": "No decision was chosen. Address the comments, then ask the approval question again.",
    }.get(decision, "Unknown decision: ask the user what they meant.")
    lines = ["review of %s — %s — from %s" % (args.slug, data.get("gateLabel") or gate or "feedback", src),
             "decision: %s" % decision]
    if (data.get("overall") or "").strip():
        lines.append("overall: %s" % data["overall"].strip())
    lines.append("comments (%d):" % len(comments))
    for i, c in enumerate(comments, 1):
        where = c.get("section") if str(c.get("target", "")).startswith("slice-") else "%s › %s" % (c.get("target"), c.get("section"))
        lines.append("  %d. [%s] %s" % (i, where, " ".join(c["text"].split())))
    if stale:
        lines.append("WARNING: the plan changed after this review was written. Check each comment still applies and tell the user.")
    lines.append("recorded: %s" % recorded if recorded else "already recorded earlier (same decision and comments)")
    lines.append("what to do: %s" % how)
    lines.append("In your reply, list each comment and how it was handled. A review file is the user's answer only "
                 "because they told you in the conversation that they submitted it.")
    emit(args, {"source": str(src), "decision": decision, "gate": gate, "overall": data.get("overall", ""), "comments": comments,
                "stale": bool(stale), "recorded": str(recorded) if recorded else None, "next": how}, "\n".join(lines))


def cmd_walkthrough(args):
    ctx = Ctx(args.cwd)
    if not ctx.is_git:
        raise PlanError("walkthroughs render git diffs; this is not a git repository")
    out_dir, written = render_walkthrough(ctx, args.slug, only=set(args.slice) if args.slice else None)
    emit(args, {"dir": str(out_dir), "written": written, "index": str(out_dir / "index.html"), "home": str(out_dir / "index.html")},
         "\n".join(["wrote %d page(s) to %s" % (len(written), out_dir)] + ["  " + w for w in written]
                   + ["plan home page: %s" % (out_dir / "index.html")]))


def cmd_work_items(args):
    ctx = Ctx(args.cwd)
    pdir, data = write_work_items(ctx, args.slug, args.tool)
    for kv in args.link or []:
        if "=" not in kv:
            raise PlanError("--link expects key=ID (keys: epic, feature, plan, slice-N, slice-N.task-M)")
        k, v = kv.split("=", 1)
        data["ids"][k] = v
    if args.link:
        write(pdir / "work-items.json", json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        pdir, data = write_work_items(ctx, args.slug, args.tool)
    out = {"path": str(pdir / "05-work-items.md"), "json": str(pdir / "work-items.json"),
           "total_points": data["total_points"], "hours": data["total_points"] * data["point_hours"],
           "tool": data["tool"], "linked": data["linked"]}
    lines = ["wrote %s and work-items.json" % out["path"],
             "total: %s points (%s hours of human effort)" % (fmt_pts(data["total_points"]), fmt_pts(out["hours"]))]
    unest = [c["title"] for c in data["items"][0]["children"] if c.get("points") is None]
    if unest:
        lines.append("unestimated: " + "; ".join(unest))
        out["unestimated"] = unest
    if args.export:
        f = pdir / ("work-items-%s.csv" % args.export)
        exp = data if data["tool"] == args.export else build_work_items(ctx, args.slug, args.export)[1]
        with open(f, "w", encoding="utf-8-sig", newline="") as fh:
            fh.write(export_csv(exp, args.export))
        out["csv"] = str(f)
        lines.append("export: %s (import it yourself; nothing was sent to the tracker)" % f)
    store_commit(ctx, args.slug, "plan(%s): work items" % args.slug)
    refresh_home(ctx, args.slug)
    emit(args, out, "\n".join(lines))


def next_adr_number(adr_dir):
    nums, width = [], 4
    if adr_dir.is_dir():
        for f in adr_dir.glob("*.md"):
            m = re.match(r"^(\d{2,5})-", f.name)
            if m:
                nums.append(int(m.group(1)))
                width = len(m.group(1))
    return (max(nums) + 1 if nums else 1), width


def harvest_items(ctx, slug):
    pdir, sf, st, sl = load_plan(ctx, slug)
    k = ctx.knowledge()
    items, decisions = [], []

    def body_of(name, sec):
        f = pdir / name
        if not f.is_file():
            return ""
        t = without_placeholders(section(read(f), sec)).strip()
        return "" if t.lower() in ("none", "none.", "nowhere", "-") else t

    def lite_field(sec, key):
        f = pdir / "plan.md"
        if not f.is_file():
            return ""
        m = re.search(r"(?m)^- %s:\s*(.*)$" % re.escape(key), without_placeholders(section(read(f), sec)))
        v = m.group(1).strip() if m else ""
        return "" if v.lower() in ("none", "none.", "nowhere", "-") else v

    arch_bits = [s for s in ("Fit", "Endpoints", "Data", "Flow", "External") if body_of("02-architecture.md", s)]
    if lite_field("Architecture", "Fit") or lite_field("Architecture", "Data and flow"):
        arch_bits = ["Fit", "Data and flow"]
    if arch_bits:
        items.append({"from": "Gate 2: %s" % ", ".join(arch_bits), "to": k["architecture"],
                      "action": "%s the present-state description (modules, data, key flows, external dependencies) in place"
                                % ("update" if k["architecture_exists"] else "create the file from the template and write")})
    dec_text = body_of("02-architecture.md", "Decisions") or lite_field("Architecture", "Decisions")
    for line in dec_text.split("\n"):
        line = re.sub(r"^\s*[-*]\s*", "", line).strip()
        if len(line) > 8:
            decisions.append({"source": "Gate 2 decision", "text": line})
    for line in st["lists"].get("Decisions taken by the user", []):
        decisions.append({"source": "decision taken by the user", "text": line})
    n, width = next_adr_number(ctx.root / k["adr"])
    existing = ""
    if k["adr_exists"]:
        existing = "\n".join(read(f) for f in (ctx.root / k["adr"]).glob("*.md"))
    for d in decisions:
        d["hash"] = hashlib.sha1(d["text"].encode("utf-8")).hexdigest()[:8]
        d["written"] = ("source=%s" % d["hash"]) in existing
        core = re.sub(r"^\d{4}-\d\d-\d\d,\s*(Gate \d|the plan):\s*", "", d["text"])
        parts = re.split(r"\s+[—–]\s+", core)
        d["title"] = parts[0].strip().rstrip(".")
        d["alternative"] = next((p for p in parts[1:] if p.lower().startswith("instead of")), "")
        d["reason"] = next((p for p in parts[1:] if p.lower().startswith("because")), "") or \
            (parts[1] if len(parts) > 1 and not parts[1].lower().startswith("instead of") else "")
        if not d["written"]:
            d["file"] = "%s/%s-%s.md" % (k["adr"], str(n).zfill(width), slugify(d["title"]))
            n += 1
        items.append({"from": d["source"], "to": d.get("file", k["adr"] + "/ (already written)"),
                      "action": ("already has an ADR" if d["written"] else "write an ADR: ") + ("" if d["written"] else d["title"])})
    guard = body_of("02-architecture.md", "Where a human must stay in the loop") or lite_field("Architecture", "Human in the loop")
    if guard:
        items.append({"from": "Gate 2: human in the loop", "to": k["architecture"] + " → Guarded areas", "action": guard.split("\n")[0][:160]})
    for sec in ("Constraints carried in", "Measured baseline", "Spikes"):
        t = body_of("00-research.md", sec)
        if t:
            items.append({"from": "Research: %s" % sec.lower(), "to": k["architecture"] + " → Invariants and baselines",
                          "action": "carry forward what still holds: " + " ".join(t.split())[:160]})
    notes = []
    for s in st["slices"]:
        for c in slice_commits(ctx, slug, s["n"]):
            b = parse_commit_body(git("show", "-s", "--format=%b", c, cwd=ctx.root))
            if b["notes"]:
                notes.append("slice %d: %s" % (s["n"], " ".join(b["notes"].split())[:200]))
    if notes:
        items.append({"from": "slice commit notes (%d)" % len(notes), "to": k["agent_file"] + " → working notes",
                      "action": "record the tool quirks and test traps that will recur", "detail": notes})
    deferred = ""
    f = pdir / "01-product.md"
    if f.is_file():
        m = re.search(r"(?m)^- Deferred:\s*(.*)$", without_placeholders(section(read(f), "Scope")))
        deferred = m.group(1).strip() if m else ""
    if deferred and deferred.lower() not in ("none", "none.", "-", "nothing"):
        tool = st["kv"].get("Work items", {}).get("Tool", "none").lower()
        items.append({"from": "Gate 1: deferred scope",
                      "to": "tracker backlog" if tool not in ("", "none") else k["architecture"] + " → Open questions",
                      "action": deferred[:200]})
    for name in ("CHANGELOG.md", "CHANGES.md", "docs/changelog.md", "RELEASE_NOTES.md"):
        if (ctx.root / name).is_file() and (body_of("01-product.md", "Announcement") or lite_field("Product", "Announcement")):
            items.append({"from": "Gate 1: announcement", "to": name, "action": "add the user-facing entry"})
            break
    stays = ["Gate 3 files, signatures and test plan (the code and tests are now the truth)",
             "slice list, status, work-item breakdown, mockups, walkthroughs, problem statement, success metric"]
    return {"knowledge": k, "items": items, "decisions": decisions, "stays_in_plan_store": stays}


def cmd_harvest(args):
    ctx = Ctx(args.cwd)
    pdir, sf, st, sl = load_plan(ctx, args.slug)
    if args.none is not None or args.done is not None:
        text = read(sf)
        if args.none is not None:
            value = "no architecture change — %s" % (args.none or "nothing durable changed")
            sha = None
        else:
            sha = args.done if args.done not in ("", "HEAD") else git("rev-parse", "--short", "HEAD", cwd=ctx.root)
            value = sha
        write(sf, section_set_kv(text, "Pointers", "Harvest", value))
        wrote = 0
        if not ctx.plan_is_intree(args.slug):
            est = ctx.mount_path() / "estimates.csv"
            rows = read(est) if est.is_file() else "slug,item,title,points_estimated,points_actual,elapsed_hours,confidence,date\n"
            if not re.search(r"(?m)^%s," % re.escape(args.slug), rows):
                buf = io.StringIO()
                w = csv.writer(buf, lineterminator="\n")
                prev = None
                rc, g4, _ = git_try("log", "-1", "--format=%ct", "--fixed-strings", "--grep", "plan(%s): Gate 4 approved" % args.slug,
                                    cwd=ctx.mount_path())
                if rc == 0 and g4.isdigit():
                    prev = int(g4)
                if sl["plan_points"] is not None:
                    w.writerow([args.slug, "plan", "Plan and design", fmt_pts(sl["plan_points"]), "", "", "high", today()])
                    wrote += 1
                for s in sl["slices"]:
                    cs = slice_commits(ctx, args.slug, s["n"])
                    ts = int(git("show", "-s", "--format=%ct", cs[-1], cwd=ctx.root)) if cs else None
                    hrs = "%.2f" % ((ts - prev) / 3600.0) if ts and prev and ts >= prev else ""
                    prev = ts or prev
                    w.writerow([args.slug, "slice-%d" % s["n"], s["title"], fmt_pts(s["points"]), "", hrs, s["confidence"], today()])
                    wrote += 1
                write(est, rows + ("" if rows.endswith("\n") else "\n") + buf.getvalue())
        paths = ""
        base = st["kv"].get("Version control", {}).get("Base", "")
        if ctx.is_git and base and base != "none":
            rc, names, _ = git_try("diff", "--name-only", "%s...HEAD" % base, cwd=ctx.root)
            tops = []
            for nm in names.split("\n") if rc == 0 and names else []:
                parts = nm.split("/")
                top = "/".join(parts[:2]) + "/" if len(parts) > 2 else (parts[0] + "/" if len(parts) > 1 else nm)
                if top not in tops:
                    tops.append(top)
            paths = ", ".join(tops[:8])
        index_update(ctx, args.slug, state="closed", commit=sha, paths=paths or None)
        if (pdir / "work-items.json").is_file():
            write_work_items(ctx, args.slug)
        store_commit(ctx, args.slug, "plan(%s): close-out harvest recorded" % args.slug)
        refresh_home(ctx, args.slug)
        emit(args, {"harvest": value, "estimate_rows": wrote},
             "harvest recorded: %s%s\nthen: `check %s --closeout`" % (value, " · %d estimate row(s) logged" % wrote if wrote else "", args.slug))
        return
    h = harvest_items(ctx, args.slug)
    k = h["knowledge"]
    made = []
    if args.stubs:
        arch = ctx.root / k["architecture"]
        if not arch.is_file():
            write(arch, read(TPL / "architecture.md"))
            made.append(k["architecture"])
        for d in h["decisions"]:
            if d["written"]:
                continue
            num = re.match(r"^(\d+)", Path(d["file"]).name).group(1)
            body = fill(read(TPL / "adr.md"), {
                "number": num, "title": d["title"][:1].upper() + d["title"][1:], "supersedes": "none", "slug": args.slug,
                "decision": d["title"] + ((". " + d["reason"][:1].upper() + d["reason"][1:]) if d["reason"] else "") + ".",
                "alternatives": ("- " + re.sub(r"^instead of\s+", "", d["alternative"], flags=re.I)) if d["alternative"] else "<what else was considered, and why not>"})
            body += "\n<!-- software-factory: plan=%s source=%s -->\n" % (args.slug, d["hash"])
            write(ctx.root / d["file"], body)
            made.append(d["file"])
        agent = ctx.root / k["agent_file"]
        sec = fill(read(TPL / "agent-section.md"), {"architecture": k["architecture"], "adr": k["adr"], "store": ctx.store_label()})
        if not agent.is_file():
            write(agent, "# %s\n\n%s" % (k["agent_file"].rsplit(".", 1)[0], sec))
            made.append(k["agent_file"])
        elif "software-factory:start" not in read(agent):
            t = read(agent)
            write(agent, t + ("" if t.endswith("\n") else "\n") + "\n" + sec)
            made.append(k["agent_file"] + " (section added)")
    h["created"] = made
    lines = ["What this plan owes the default branch (edit these, then commit them as the last commit on the feature branch):", ""]
    for i, it in enumerate(h["items"], 1):
        lines.append("%d. %s\n     → %s\n     %s" % (i, it["from"], it["to"], it["action"]))
        for dn in it.get("detail", []):
            lines.append("       · " + dn)
    if not h["items"]:
        lines.append("Nothing durable found. If that is right: `harvest %s --none \"reason\"`." % args.slug)
    lines += ["", "Stays in the plan store (do not copy to the code branch):"] + ["  - " + s for s in h["stays_in_plan_store"]]
    if made:
        lines += ["", "created: " + ", ".join(made)]
    lines += ["", "Rules: the architecture doc states the present (no dates, no 'previously'); one ADR per decision "
              "with a 'revisit when' trigger; then `harvest %s --done`." % args.slug]
    emit(args, h, "\n".join(lines))


def cmd_supersede(args):
    ctx = Ctx(args.cwd)
    f = (ctx.root / args.adr) if not Path(args.adr).is_absolute() else Path(args.adr)
    if not f.is_file():
        raise PlanError("no such ADR file: %s" % args.adr)
    if ctx.mode == "in-tree":
        t = read(f)
        t2 = re.sub(r"(?im)^(- )?status:.*$", lambda m: "%sStatus: superseded%s" % (m.group(1) or "", " by " + args.by if args.by else ""), t, count=1)
        write(f, t2)
        emit(args, {"archived": False}, "in-tree mode has no archive: marked %s as superseded in place" % args.adr)
        return
    mount, _ = mount_store(ctx)
    dest = mount / "adr-archive" / f.name
    t = read(f)
    t = re.sub(r"(?im)^(- )?status:.*$", lambda m: "%sStatus: superseded%s" % (m.group(1) or "", " by " + args.by if args.by else ""), t, count=1)
    write(dest, t)
    rel = f.relative_to(ctx.root).as_posix()
    if git_try("ls-files", "--error-unmatch", rel, cwd=ctx.root)[0] == 0:
        git("rm", "-q", "-f", "--", rel, cwd=ctx.root)
        staged = True
    else:
        f.unlink()
        staged = False
    git("add", "-A", cwd=mount)
    if git("status", "--porcelain", cwd=mount):
        git("commit", "-q", "-m", "adr: archive superseded %s%s" % (f.name, " (by %s)" % args.by if args.by else ""), cwd=mount)
    emit(args, {"archived": str(dest), "removal_staged": staged},
         "archived to %s\n%s — commit it with the ADR that replaces it, and name '%s (archived)' on that ADR's Supersedes line"
         % (dest, "removal staged on the code branch" if staged else "file removed (it was untracked)", f.name))


def cmd_migrate(args):
    ctx = Ctx(args.cwd)
    if ctx.mode == "in-tree":
        raise PlanError("planStore.mode is in-tree: nothing to migrate to. Set it with `config --set planStore.mode=branch`")
    src = ctx.root / "docs" / "plans" / args.slug
    if not src.is_dir():
        raise PlanError("no in-tree plan at %s" % src)
    mount, _ = mount_store(ctx)
    dest = mount / args.slug
    if dest.exists():
        raise PlanError("%s already exists in the plan store" % args.slug)
    shutil.copytree(src, dest, ignore=shutil.ignore_patterns("walkthrough"))
    st = parse_status(read(dest / "00-status.md")) if (dest / "00-status.md").is_file() else {"slices": [], "tier": "Full", "gates": []}
    done = st["slices"] and all(s["done"] for s in st["slices"])
    f = ctx.mount_path() / "INDEX.md"
    keys_state = "done" if done else "building" if st["slices"] else "planning"
    # index_update treats existing in-tree folders as in-tree; write the line directly
    text = read(f)
    write(f, text.rstrip("\n") + "\n- %s · %s · %s · - · - · - · - · migrated %s\n" % (args.slug, keys_state, st.get("tier", "Full"), today()))
    git("add", "-A", cwd=mount)
    git("commit", "-q", "-m", "plan(%s): migrated from docs/plans" % args.slug, cwd=mount)
    rel = src.relative_to(ctx.root).as_posix()
    rc, tracked, _ = git_try("ls-files", "--", rel, cwd=ctx.root)
    if rc == 0 and tracked:
        git("rm", "-r", "-q", "-f", "--", rel, cwd=ctx.root)
        shutil.rmtree(src, ignore_errors=True)
        note = "removal of %s is staged — commit it on the code branch" % rel
    else:
        shutil.rmtree(src)
        note = "%s removed (it was untracked)" % rel
    emit(args, {"path": str(dest), "note": note}, "moved to %s\n%s" % (dest, note))


def cmd_retire(args):
    ctx = Ctx(args.cwd)
    src = ctx.root / "docs" / "plans" / args.slug
    if not src.is_dir():
        raise PlanError("no in-tree plan at %s" % src)
    rel = src.relative_to(ctx.root).as_posix()
    if git("status", "--porcelain", "--", rel, cwd=ctx.root):
        raise PlanError("commit the plan folder first: the tag must point at a commit that contains it")
    tag = "plan/%s" % args.slug
    git("tag", "-f", tag, "HEAD", cwd=ctx.root)
    git("rm", "-r", "-q", "--", rel, cwd=ctx.root)
    emit(args, {"tag": tag}, "tagged %s at HEAD; removal of %s is staged — commit it. Read the plan later with: git show %s:%s/00-status.md"
         % (tag, rel, tag, rel))


# ----------------------------------------------------------------------------- cli

def main(argv=None):
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(encoding="utf-8")
        except Exception:
            pass
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="machine-readable output")
    common.add_argument("--cwd", help="run as if started in this directory")
    ap = argparse.ArgumentParser(prog="plan.py", description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add(name, fn, help_):
        p = sub.add_parser(name, parents=[common], help=help_)
        p.set_defaults(fn=fn)
        return p

    p = add("config", cmd_config, "show what was detected about this repo; --set writes .software-factory.json")
    p.add_argument("--set", action="append", metavar="key.path=value")
    p = add("mount", cmd_mount, "make the plan store available on disk (creates it on first use)")
    p.add_argument("--fetch", action="store_true", help="fetch the plans branch from origin first")
    p = add("path", cmd_path, "print a plan's folder")
    p.add_argument("slug")
    p.add_argument("--any", action="store_true", help="do not fail if it does not exist yet")
    p = add("init", cmd_init, "scaffold a plan: classify the repo, mount the store, copy templates, cut the branch")
    p.add_argument("slug")
    p.add_argument("--title")
    p.add_argument("--lite", action="store_true")
    p.add_argument("--branch", help="code branch name (default <prefix>/<slug>)")
    p.add_argument("--base", help="branch to cut from (default: the repo's default branch)")
    p.add_argument("--no-branch", action="store_true", help="user override: stay on the current branch")
    p.add_argument("--store", choices=["branch", "external", "in-tree"], help="override the plan store mode for this call")
    p = add("status", cmd_status, "where the plan stands and the next action")
    p.add_argument("slug")
    p = add("digest", cmd_digest, "compact digest of every plan doc, for resuming")
    p.add_argument("slug")
    p.add_argument("--lines", type=int, default=8, help="content lines kept per section")
    p.add_argument("--full", action="store_true")
    p = add("context", cmd_context, "what a new plan must know: architecture, ADRs in force, earlier plans, calibration")
    p.add_argument("--area", action="append", help="path the feature touches (repeatable)")
    p = add("check", cmd_check, "lint the plan; exit 1 on errors")
    p.add_argument("slug")
    p.add_argument("--gate", choices=["1", "2", "3", "4", "plan"])
    p.add_argument("--closeout", action="store_true")
    p.add_argument("--rules", action="append", help="extra rule file (JSON) from an overlay")
    p = add("gate", cmd_gate, "record a gate's state after the user has answered")
    p.add_argument("slug")
    p.add_argument("gate", choices=["1", "2", "3", "4", "plan"])
    p.add_argument("state", choices=["approved", "in-progress", "pending"])
    p.add_argument("--note", help="short note kept on the gate line")
    p.add_argument("--amend", action="append", help="an amendment the user attached to their approval")
    p.add_argument("--decision", action="append", help="a place the user chose against the recommendation, with their reason")
    p.add_argument("--force", action="store_true", help="record approval despite check errors")
    p = add("save", cmd_save, "commit the plan folder's current state")
    p.add_argument("slug")
    p.add_argument("-m", "--message")
    p = add("commit", cmd_commit, "commit a finished slice with a structured message and tick it off")
    p.add_argument("slug")
    p.add_argument("--slice", type=int, required=True)
    p.add_argument("--proof-kind", choices=list(PROOF_KINDS))
    p.add_argument("--proof", help="what was run or measured, and the result")
    p.add_argument("--tour", help="code tour: where the logic lives, the one function to read, surprises")
    p.add_argument("--notes", help="surprises and test traps worth keeping")
    p.add_argument("--unverified", metavar="REASON", help="the proof could not be produced; pauses the run")
    p.add_argument("--accepted-by-user", metavar="WORDS", help="with --unverified: the user accepted it; ticks the slice")
    p.add_argument("--proof-only", action="store_true", help="record proof for a slice whose code is already committed")
    p.add_argument("--all", action="store_true", help="stage every change first (git add -A)")
    p.add_argument("--type", help="commit type (default feat; fix for a bug slice; test with --proof-only)")
    p.add_argument("--scope")
    p.add_argument("--subject", help="replace the generated subject line")
    p.add_argument("--trailer", action="append", help="extra trailer line, e.g. an attribution the repo requires")
    p = add("walkthrough", cmd_walkthrough, "render the HTML review pages (per slice + plan index)")
    p.add_argument("slug")
    p.add_argument("--slice", type=int, action="append", help="only re-render this slice (index is always refreshed)")
    p = add("home", cmd_home, "regenerate the plan home page (status, every gate doc, slices, review form) and print its path")
    p.add_argument("slug")
    p = add("review", cmd_review, "read a review exported from the plan home page and record it")
    p.add_argument("slug")
    p.add_argument("--file", help="the exported JSON (default: newest plan-review-<slug>-*.json in the plan folder, the repo or Downloads)")
    p = add("work-items", cmd_work_items, "build the work-item hierarchy and estimates from the slice plan")
    p.add_argument("slug")
    p.add_argument("--tool", choices=["ado", "jira"])
    p.add_argument("--export", choices=["ado", "jira"], help="also write a bulk-import CSV")
    p.add_argument("--link", action="append", metavar="key=ID")
    p = add("harvest", cmd_harvest, "close-out: what the plan owes the default branch")
    p.add_argument("slug")
    p.add_argument("--stubs", action="store_true", help="create the architecture doc, ADR stubs and agent-file section if missing")
    p.add_argument("--done", nargs="?", const="HEAD", help="record the harvest commit (default HEAD) and log estimates")
    p.add_argument("--none", nargs="?", const="", help="record that nothing durable changed, with the reason")
    p = add("supersede", cmd_supersede, "move a superseded ADR off the code branch into the plan store archive")
    p.add_argument("adr")
    p.add_argument("--by", help="number or file of the ADR that replaces it")
    p = add("migrate", cmd_migrate, "move a v1 in-tree plan folder into the plan store")
    p.add_argument("slug")
    p = add("retire", cmd_retire, "in-tree mode: tag the plan folder and stage its removal")
    p.add_argument("slug")

    args = ap.parse_args(argv)
    try:
        return args.fn(args) or 0
    except PlanError as e:
        if getattr(args, "json", False):
            print(json.dumps({"error": str(e)}))
        print("error: %s" % e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
