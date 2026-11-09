#!/usr/bin/env python3
"""Regression test for plan.py. Builds throwaway git repos in a temp dir and drives
every subcommand through them. Standard library only.

    python selftest.py          # prints one line per check, exits 1 on any failure
    python selftest.py -v       # also prints plan.py's output for failed checks
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAN = HERE / "plan.py"
VERBOSE = "-v" in sys.argv
results = []


def env():
    e = dict(os.environ)
    e.update({"GIT_AUTHOR_NAME": "Self Test", "GIT_AUTHOR_EMAIL": "selftest@example.invalid",
              "GIT_COMMITTER_NAME": "Self Test", "GIT_COMMITTER_EMAIL": "selftest@example.invalid",
              "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": EMPTY_CFG, "SF_TODAY": "2026-01-15",
              "PYTHONIOENCODING": "utf-8"})
    return e


def sh(args, cwd):
    r = subprocess.run(args, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace", env=env())
    if r.returncode != 0:
        raise RuntimeError("%s failed in %s:\n%s%s" % (" ".join(args), cwd, r.stdout, r.stderr))
    return r.stdout.strip()


def plan(cwd, *args, expect=0):
    r = subprocess.run([sys.executable, str(PLAN), *args], cwd=str(cwd), capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env())
    out = r.stdout
    data = None
    if "--json" in args:
        try:
            data = json.loads(out)
        except ValueError:
            data = None
    ok = r.returncode == expect
    if not ok:
        check("exit code %d for `plan.py %s`" % (expect, " ".join(args)), False,
              "got %d\n%s\n%s" % (r.returncode, out, r.stderr))
    return r.returncode, out + r.stderr, data


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print("%s  %s" % ("PASS" if cond else "FAIL", name))
    if not cond and (VERBOSE or detail):
        print("      " + str(detail).replace("\n", "\n      ")[:1500])


def write(p, text):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def read(p):
    return Path(p).read_text(encoding="utf-8")


def make_repo(root, name, commits=4):
    d = root / name
    d.mkdir()
    sh(["git", "init", "-q", "-b", "main"], d)
    write(d / "src" / "app.py", "def total(items):\n    return sum(items)\n")
    write(d / "src" / "store.py", "DATA = []\n")
    write(d / "src" / "cli.py", "import sys\n")
    write(d / "tests" / "test_app.py", "from src.app import total\n\n\ndef test_total():\n    assert total([1, 2]) == 3\n")
    sh(["git", "add", "-A"], d)
    sh(["git", "commit", "-q", "-m", "feat: initial app"], d)
    for i in range(commits - 1):
        write(d / "src" / "app.py", read(d / "src" / "app.py") + "# rev %d\n" % i)
        sh(["git", "commit", "-q", "-am", "fix: tidy %d" % i], d)
    return d


PRODUCT_OK = """# Product: Payment export

## Problem
"I cannot get last month's payments out to my accountant without retyping them."

## Success metric
Share of monthly closes finished without a support ticket, from the helpdesk report: 62% today, 85% target.

## Announcement — the blog post before the feature
You can now download any month's payments as a spreadsheet in one click.

## Scope
- In: one-click monthly download
- Out: scheduled delivery
- Deferred: custom date ranges

## Riskiest assumption
Accountants accept a spreadsheet rather than a feed into their own tool.

## Rough size
3–5 points

## Screens
no UI
"""

ARCH_OK = """# Architecture: Payment export

## Fit
Touches `src/app.py` and `src/store.py`.

## Endpoints
none

## Data
No new tables; reads DATA.

## Flow
cli -> app.export -> store.read

## External
none

## Decisions
- Write CSV with the standard library — instead of a spreadsheet package — because it adds no dependency

## Load-bearing bets
- DATA fits in memory: proven by spike (see research)

## Where a human must stay in the loop
Slice 3 changes the public command line.
"""

DESIGN_OK = """# Program Design: Payment export

## Files
- src/export.py: new, the export function

## Types & signatures
```python
def export(month: str) -> str: ...
```

## Call stack
cli.main -> export.export -> store.read

## Test plan
1. test_export_header — header row is present
2. test_export_rows — one row per payment
3. test_cli_flag — the flag reaches export

## Least confident decisions
1. CSV rather than a spreadsheet file
"""

SLICES_BAD = """# Slices: Payment export

- Plan and design: 1 (research and four gates)

## Slice 1 — tracer bullet: hardcoded export
- What: export() returns a fixed header, wired to the CLI
- Tests: 1
- Proof: run the test suite; run the CLI and show the header
- Needs user present: no
- Points: 0.5 (basis: one new file, one test; confidence: high)
- Work item: 5001
- Tasks:
  - write export skeleton — 0.25
  - write header test — 0.25

## Slice 2 — real rows
- What: read the store and emit one row per payment
- Tests: 2
- Proof: run the test suite
- Needs user present: no
- Points:
- Work item:
- Tasks:

## Slice 3 — CLI flag
- What: add the --export flag
- Tests: 3
- Proof: run the CLI with the flag
- Needs user present: yes
- Points: 1 (basis: argument parsing; confidence: medium)
- Work item:

## Post-ship
"""


def scenario_existing(root):
    d = make_repo(root, "existing")
    rc, out, cfg = plan(d, "config", "--json")
    check("config: classifies a 4-commit, 4-file repo as existing", cfg and cfg["project"] == "existing", out)
    check("config: default branch detected as main", cfg and cfg["default_branch"] == "main", out)

    rc, out, init = plan(d, "init", "pay-export", "--title", "Payment export", "--json")
    pdir = Path(init["path"]) if init else d / ".plans" / "pay-export"
    check("init: plan folder is in the mounted store, not the code tree", pdir.parent.name == ".plans" and (pdir / "00-status.md").is_file(), out)
    check("init: feature branch cut from main", sh(["git", "branch", "--show-current"], d) == "feature/pay-export", out)
    check("init: plans branch exists and shares no history with main",
          sh(["git", "rev-list", "--count", "plans"], d) != "" and
          subprocess.run(["git", "merge-base", "main", "plans"], cwd=str(d), capture_output=True, env=env()).returncode != 0)
    check("init: code worktree stays clean (store is ignored)", sh(["git", "status", "--porcelain"], d) == "")
    check("init: nothing from the store is tracked on the code branch", ".plans" not in sh(["git", "ls-files"], d))
    check("init: status records tier, project and branch",
          "- Tier: Full" in read(pdir / "00-status.md") and "- Code branch: feature/pay-export" in read(pdir / "00-status.md"))

    rc, out, _ = plan(d, "check", "pay-export", "--gate", "1", expect=1)
    check("check gate 1: an untouched template fails on placeholders", "placeholder" in out, out)
    write(pdir / "01-product.md", PRODUCT_OK.replace("in one click.", "in one click from a new endpoint backed by export.py."))
    rc, out, _ = plan(d, "check", "pay-export", "--gate", "1", expect=1)
    check("check gate 1: tech talk is rejected", "endpoint" in out and "source file name" in out, out)
    rc, out, _ = plan(d, "gate", "pay-export", "1", "approved", expect=2)
    check("gate: refuses to record approval while checks fail", "cannot record approval" in out, out)
    write(pdir / "01-product.md", PRODUCT_OK)
    plan(d, "check", "pay-export", "--gate", "1")

    # plan home page and review round trip
    home = Path(init["home"]) if init and init.get("home") else pdir / "walkthrough" / "index.html"
    check("home: the plan has a home page from the moment it is created", home.is_file() and home.name == "index.html", str(home))
    rc, out, g = plan(d, "gate", "pay-export", "1", "in-progress", "--json")
    page = read(home)
    check("home: a gate presented for approval shows as waiting on the user, open and commentable",
          "Gate 1 is waiting on you" in page and '<details class="doc await" open' in page
          and 'data-target="01-product.md" data-section="Problem"' in page and "Sign off: Gate 1" in page, page[:300])
    check("home: route shows one station per gate plus build and close-out, with the waiting one marked",
          page.count('<li class="station ') == 6 and 'class="station is-current needs-you"' in page and "--stations: 6" in page)
    check("home: theme switch, live updates and print controls are present, and both themes are defined",
          'id="theme"' in page and 'id="live"' in page and 'id="print"' in page
          and ':root[data-theme="dark"]' in page and "prefers-color-scheme: dark" in page and "@media print" in page)
    meta = json.loads(page.split("var PLAN = ", 1)[1].split(";\n", 1)[0])
    check("home: embedded plan data is valid and names the gate", meta["slug"] == "pay-export" and meta["gate"] == "gate1" and meta["awaiting"] is True, meta)
    check("home: page is self-contained (no network references)", "http://" not in page and "https://" not in page)
    review = {"kind": "software-factory-review", "schema": 1, "slug": "pay-export", "gate": "gate1", "gateLabel": "Gate 1 — Product",
              "awaiting": True, "version": meta["version"], "exported": "2026-01-15T10:30:00.000Z", "decision": "approve-with-changes",
              "overall": "Good direction.",
              "comments": [{"target": "01-product.md", "section": "Scope", "text": "Refunds must be in scope."},
                           {"target": "01-product.md", "section": "Success metric", "text": "Name who\nowns the number."}]}
    write(d / "plan-review-pay-export-gate1-20260115-1030.json", json.dumps(review))
    write(d / "plan-review-pay-export-v2-gate1-20260115-1031.json", json.dumps(dict(review, slug="pay-export-v2")))
    rc, out, r = plan(d, "review", "pay-export", "--json")
    check("review: finds the user's exported review, ignoring another plan with a longer slug",
          r and r["decision"] == "approve-with-changes" and len(r["comments"]) == 2 and r["gate"] == "1" and not r["stale"], out)
    check("review: recorded in the plan folder and committed to the store",
          r and r["recorded"] and Path(r["recorded"]).is_file() and "review received" in sh(["git", "log", "-1", "--format=%s", "plans"], d), out)
    rc, out, _ = plan(d, "review", "pay-export")
    check("review: readable digest says what to do, and a second import is not recorded twice",
          "[01-product.md › Scope] Refunds must be in scope." in out and "Name who owns the number." in out
          and "already recorded earlier" in out and "--amend" in out, out)
    os.remove(d / "plan-review-pay-export-gate1-20260115-1030.json")
    os.remove(d / "plan-review-pay-export-v2-gate1-20260115-1031.json")
    write(d / "old-review.json", json.dumps(dict(review, version="0000000000", overall="changed")))
    rc, out, r = plan(d, "review", "pay-export", "--file", "old-review.json", "--json")
    check("review: warns when the plan changed after the review was written", r and r["stale"], out)
    os.remove(d / "old-review.json")
    check("review: nothing from the review flow touched the code branch", sh(["git", "status", "--porcelain"], d) == "")

    rc, out, g = plan(d, "gate", "pay-export", "1", "approved", "--amend", "also cover refunds",
                      "--decision", "keep CSV — because accountants asked for it", "--json")
    st = read(pdir / "00-status.md")
    check("gate: approval, amendment and user decision land in the status file",
          "- Gate 1 — Product: APPROVED 2026-01-15" in st and "also cover refunds" in st and "keep CSV" in st, st)
    check("gate: plan-state commit made on the plans branch", "Gate 1 approved" in sh(["git", "log", "-1", "--format=%s", "plans"], d))

    write(pdir / "02-architecture.md", ARCH_OK)
    write(pdir / "03-program-design.md", DESIGN_OK)
    plan(d, "gate", "pay-export", "2", "approved")
    plan(d, "gate", "pay-export", "3", "approved")
    write(pdir / "04-slices.md", SLICES_BAD)
    rc, out, _ = plan(d, "check", "pay-export", "--gate", "4", expect=1)
    check("check gate 4: an unestimated slice is an error", "Slice 2 is unestimated" in out, out)
    plan(d, "gate", "pay-export", "4", "approved", expect=2)
    write(pdir / "04-slices.md", SLICES_BAD.replace("- Points:\n- Work item:\n- Tasks:",
                                                    "- Points: 2 (basis: store read, row format; confidence: medium)\n- Work item:\n- Tasks:"))
    st = read(pdir / "00-status.md").replace("- Tool: none", "- Tool: ado").replace("- Feature:", "- Feature: 4321")
    write(pdir / "00-status.md", st)
    rc, out, g = plan(d, "gate", "pay-export", "4", "approved", "--json")
    st = read(pdir / "00-status.md")
    check("gate 4: slice checklist synced into the status file", st.count("\n- [ ] Slice") == 3, st)
    wi = json.loads(read(pdir / "work-items.json"))
    check("work items: total is plan + slices (1 + 0.5 + 2 + 1)", wi["total_points"] == 4.5, wi["total_points"])
    top = wi["items"][0]
    check("work items: feature is linked, not created", top["type"] == "feature" and top["id"] == "4321" and top["existing"])
    check("work items: one story per slice plus plan-and-design, tasks beneath",
          [c["type"] for c in top["children"]] == ["story"] * 4 and len(top["children"][1]["children"]) == 2)
    check("work items: needs-user-present becomes a tag", top["children"][3]["tags"] == ["needs-user-present"])
    check("work items: readable view written", "User Story" in read(pdir / "05-work-items.md"))

    rc, out, s = plan(d, "status", "pay-export", "--json")
    check("status: next action is slice 1", s and s["next"]["kind"] == "slice" and s["next"]["slice"] == 1, out)

    # slice 1
    write(d / "src" / "export.py", "def export(month):\n    return 'date,amount\\n'\n")
    rc, out, _ = plan(d, "commit", "pay-export", "--slice", "1", "--all", "--tour", "x", expect=2)
    check("commit: refuses without a proof kind (reasoning is not proof)", "Reasoning alone is not proof" in out, out)
    rc, out, c = plan(d, "commit", "pay-export", "--slice", "1", "--all", "--proof-kind", "test-output",
                      "--proof", "4 passed in 0.02s", "--tour", "New logic is in src/export.py; read export().",
                      "--notes", "pytest must run from the repo root", "--trailer", "Co-Authored-By: Pair <pair@example.invalid>", "--json")
    msg = sh(["git", "log", "-1", "--format=%B"], d)
    check("commit: structured message with proof, tour and Plan trailer",
          "Proof (test-output): 4 passed" in msg and "Code tour:" in msg and "Plan: pay-export slice 1" in msg and "Co-Authored-By: Pair" in msg, msg)
    check("commit: conventional subject carries the work item reference", msg.split("\n")[0] == "feat: hardcoded export (slice 1) AB#5001", msg.split("\n")[0])
    check("commit: code commit contains code only", sh(["git", "show", "--name-only", "--format=", "HEAD"], d) == "src/export.py")
    check("commit: slice ticked with its commit sha", c and ("- [x] Slice 1 — tracer bullet: hardcoded export (%s)" % c["code_commit"]) in read(pdir / "00-status.md"),
          read(pdir / "00-status.md"))
    check("commit: run continues to slice 2", c and c["pause"] is False and c["next"]["slice"] == 2, out)

    # slice 2: unverified, then proven
    write(d / "src" / "export.py", read(d / "src" / "export.py") + "# rows\n")
    rc, out, c = plan(d, "commit", "pay-export", "--slice", "2", "--all", "--unverified", "no test runner in this sandbox",
                      "--tour", "rows are built in export()", "--json")
    check("commit: UNVERIFIED slice is not ticked and pauses the run",
          c and c["pause"] and "- [ ] Slice 2 — real rows — UNVERIFIED: no test runner" in read(pdir / "00-status.md"), read(pdir / "00-status.md"))
    rc, out, s = plan(d, "status", "pay-export", "--json")
    check("status: reports the pause", s and s["next"]["kind"] == "paused", out)
    rc, out, c = plan(d, "commit", "pay-export", "--slice", "2", "--proof-only", "--proof-kind", "command-output",
                      "--proof", "python -m pytest: 5 passed", "--json")
    check("commit --proof-only: proves an already-committed slice and pauses for the needs-user slice",
          c and c["done"] and c["pause"] and c["next"]["kind"] == "needs-user"
          and c["subject"] == "test: prove real rows (slice 2)", out)

    # slice 3
    write(d / "src" / "cli.py", "import sys\nFLAG = '--export'\n")
    sh(["git", "add", "src/cli.py"], d)
    plan(d, "commit", "pay-export", "--slice", "3", "--proof-kind", "measured", "--proof", "flag parsed: exit 0",
         "--tour", "FLAG constant in src/cli.py")
    rc, out, s = plan(d, "status", "pay-export", "--json")
    check("status: after the last slice the next action is close-out", s and s["next"]["kind"] == "closeout", out)

    # walkthroughs
    rc, out, w = plan(d, "walkthrough", "pay-export", "--json")
    wdir = pdir / "walkthrough"
    check("walkthrough: one page per slice and an index", all((wdir / n).is_file() for n in ("slice-1.html", "slice-2.html", "slice-3.html", "index.html")), out)
    p1 = read(wdir / "slice-1.html") if (wdir / "slice-1.html").is_file() else ""
    check("walkthrough: slice page shows this slice's diff, tour and proof",
          'class="l add"' in p1 and "src/export.py" in p1 and "read export()" in p1 and "4 passed" in p1 and "src/cli.py" not in p1)
    p2 = read(wdir / "slice-2.html") if (wdir / "slice-2.html").is_file() else ""
    check("walkthrough: a slice with two commits shows both, keeping the tour from the first and the proof from the second",
          p2.count("<h3>Commit") == 2 and "rows are built in export()" in p2 and "5 passed" in p2, p2[:400])
    ix = read(wdir / "index.html") if (wdir / "index.html").is_file() else ""
    check("walkthrough: index links slices and shows gate docs and user decisions",
          'href="slice-3.html"' in ix and "Gate 2 — Architecture" in ix and "keep CSV" in ix)
    check("home: every slice is commentable and the page reports that close-out is next",
          ix.count('class="slice" data-target="slice-') == 3 and "Close-out is next" in ix and "Your feedback" in ix, ix[:300])
    check("home: approved gates are stamped with their date, and effort is charted per slice with a total",
          ix.count('class="stamp"') == 4 and "15 Jan 2026" in ix and ix.count('class="erow"') == 4
          and "4.5<small>points</small>" in ix and "36 hours" in ix, ix[:300])
    check("slice page: carries the same theme switch and links back to the plan",
          'id="theme"' in p1 and 'href="index.html"' in p1 and 'details class="file"' in p1)
    check("walkthrough: pages are not committed anywhere",
          sh(["git", "status", "--porcelain"], d / ".plans") == "" and "walkthrough" not in sh(["git", "ls-tree", "-r", "--name-only", "plans"], d))

    # exports
    rc, out, e = plan(d, "work-items", "pay-export", "--export", "ado", "--json")
    csv_ado = read(pdir / "work-items-ado.csv").lstrip("\ufeff")
    check("export ado: Title 1..3 hierarchy columns, story points and task hours",
          csv_ado.split("\n")[0].startswith("ID,Work Item Type,Title 1,Title 2,Title 3,State,Effort,Story Points,Original Estimate")
          and "4321,Feature,Payment export" in csv_ado and ",Task,,,write export skeleton,,,,2," in csv_ado, csv_ado)
    plan(d, "work-items", "pay-export", "--export", "jira")
    csv_jira = read(pdir / "work-items-jira.csv").lstrip("\ufeff")
    check("export jira: Issue ID / Parent columns, sub-tasks point at their story",
          csv_jira.split("\n")[0].startswith("Issue ID,Parent,Issue Type,Summary") and "\n4,3,Sub-task,write export skeleton" in csv_jira, csv_jira)
    check("export jira: does not change the plan's own hierarchy", json.loads(read(pdir / "work-items.json"))["tool"] == "ado")

    # harvest
    rc, out, h = plan(d, "harvest", "pay-export", "--json")
    tos = [i["to"] for i in h["items"]] if h else []
    check("harvest: lists architecture doc, an ADR per decision, guarded areas and agent notes",
          "docs/architecture.md" in tos and sum(1 for t in tos if t.startswith("docs/adr/000")) == 2
          and any("Guarded areas" in t for t in tos) and any("AGENTS.md" in t for t in tos), out)
    rc, out, h = plan(d, "harvest", "pay-export", "--stubs", "--json")
    adrs = sorted(p.name for p in (d / "docs" / "adr").glob("*.md"))
    check("harvest --stubs: creates architecture doc, two numbered ADRs and the agent file",
          (d / "docs" / "architecture.md").is_file() and len(adrs) == 2 and adrs[0].startswith("0001-") and (d / "AGENTS.md").is_file(), adrs)
    rc, out, h2 = plan(d, "harvest", "pay-export", "--stubs", "--json")
    check("harvest --stubs: idempotent", len(list((d / "docs" / "adr").glob("*.md"))) == 2 and not h2["created"], out)
    rc, out, _ = plan(d, "check", "pay-export", "--closeout", expect=1)
    check("check closeout: fails until the harvest is recorded, and on unfilled stubs",
          "harvest not recorded" in out and "unfilled section" in out and "ADR stub still has unfilled sections" in out, out)
    write(d / "docs" / "architecture.md", "# Architecture\n\n## Modules and boundaries\nPaths: src/\nThe CLI calls the export module, which reads the store.\n\n"
          "## Guarded areas\nThe public command line.\n")
    for f in (d / "docs" / "adr").glob("*.md"):
        t = read(f)
        for ph in ("<the situation and the forces at play when this was decided>", "<what becomes easier, what becomes harder, what this commits us to>",
                   "<the concrete trigger that should reopen this decision>", "<what else was considered, and why not>"):
            t = t.replace(ph, "Recorded for the test.")
        write(f, t)
    sh(["git", "add", "-A"], d)
    sh(["git", "commit", "-q", "-m", "docs: architecture and decisions for payment export"], d)
    plan(d, "harvest", "pay-export", "--done")
    check("harvest --done: pointer, estimate log and index updated",
          "- Harvest: " in read(pdir / "00-status.md") and "pending" not in read(pdir / "00-status.md").split("- Harvest:")[1].split("\n")[0]
          and read(d / ".plans" / "estimates.csv").count("pay-export,") == 4
          and "- pay-export · closed · Full · 4321" in read(d / ".plans" / "INDEX.md"), read(d / ".plans" / "INDEX.md"))
    plan(d, "check", "pay-export", "--closeout")
    arch = read(d / "docs" / "architecture.md").replace("Paths: src/", "Paths: src/, gone/", 1)
    write(d / "docs" / "architecture.md", arch)
    rc, out, _ = plan(d, "check", "pay-export", "--closeout", expect=1)
    check("check closeout: flags an architecture section whose path is gone", "gone/" in out, out)
    sh(["git", "checkout", "-q", "--", "docs/architecture.md"], d)
    check("close-out: no planning file anywhere on the feature branch",
          not [f for f in sh(["git", "ls-files"], d).split("\n") if f.startswith((".plans", "docs/plans", ".plan-walkthroughs"))])

    # supersede, context, digest
    write(d / "docs" / "adr" / "0009-old-choice.md", "# 9. Old choice\n\n- Status: accepted\n\n## Decision\nUse XML.\n")
    sh(["git", "add", "-A"], d)
    sh(["git", "commit", "-q", "-m", "docs: adr 9"], d)
    plan(d, "supersede", "docs/adr/0009-old-choice.md", "--by", "0010")
    check("supersede: ADR archived in the store and its removal staged",
          "Status: superseded by 0010" in read(d / ".plans" / "adr-archive" / "0009-old-choice.md")
          and "D  docs/adr/0009-old-choice.md" in sh(["git", "status", "--porcelain"], d))
    sh(["git", "commit", "-q", "-m", "docs: supersede adr 9"], d)
    rc, out, _ = plan(d, "context", "--area", "src")
    check("context: architecture, ADRs in force and earlier plans in one call",
          "decisions in force" in out and "0001-" in out and "pay-export · closed" in out and "0009" not in out, out)
    rc, out, _ = plan(d, "digest", "pay-export")
    check("digest: compact view of every gate doc", "===== 01-product.md" in out and "## Problem" in out and "===== 04-slices.md" in out, out[:600])

    # linked worktree resolves to the same store
    wt = root / "existing-wt"
    sh(["git", "worktree", "add", "-q", "-b", "feature/other", str(wt), "main"], d)
    rc, out, p = plan(wt, "path", "pay-export", "--json")
    check("linked worktree: finds the plan in the main checkout's store", p and Path(p["path"]).resolve() == pdir.resolve(), out)
    return d


LITE_PLAN = """# Plan: Greeting tool

## Product
- Problem: "I want the tool to greet me by name."
- Success metric: zero support questions about how to set a name, from the helpdesk tag
- Announcement: The tool now greets you by name.
- Scope: in — a name option; out — languages; deferred — none
- Rough size: 1 point

## Architecture
- Fit: one new module
- Data and flow: main calls greet
- External: none
- Decisions: none
- Human in the loop: nowhere

## Program design
- Files: greet.py (new)
- Signatures: greet(name: str) -> str
- Test plan: 1. test_greet returns the name
- Least confident: none

## Slices
- Plan and design: 0.5

### Slice 1 — tracer bullet: hardcoded greeting
- What: greet() returns a fixed string and main prints it
- Tests: 1
- Proof: run the test
- Needs user present: no
- Points: 0.5 (basis: one file; confidence: high)
- Work item:
"""


def scenario_fresh_lite(root):
    d = root / "fresh"
    d.mkdir()
    sh(["git", "init", "-q", "-b", "main"], d)
    rc, out, init = plan(d, "init", "greeting", "--lite", "--json")
    pdir = Path(init["path"]) if init else d / ".plans" / "greeting"
    check("fresh: an empty repo is classified as a fresh project", init and init["project"] == "fresh", out)
    check("fresh: an initial commit is made so a branch can be cut", sh(["git", "rev-list", "--count", "main"], d) == "1" and
          sh(["git", "branch", "--show-current"], d) == "feature/greeting", out)
    check("fresh: research doc says there is nothing to research", "fresh project: nothing to research" in read(pdir / "00-research.md"))
    check("lite: one plan.md and a single approval line", (pdir / "plan.md").is_file() and not (pdir / "01-product.md").exists()
          and "- Plan (all four sections): pending" in read(pdir / "00-status.md"))
    rc, out, _ = plan(d, "check", "greeting", "--gate", "plan", expect=1)
    check("lite: untouched plan fails the check", "placeholder" in out, out)
    write(pdir / "plan.md", LITE_PLAN.replace("greet me by name.", "greet me by name via a new endpoint."))
    rc, out, _ = plan(d, "check", "greeting", "--gate", "plan", expect=1)
    check("lite: the product section still bans tech talk", "endpoint" in out, out)
    write(pdir / "plan.md", LITE_PLAN)
    plan(d, "gate", "greeting", "plan", "approved")
    wi = json.loads(read(pdir / "work-items.json"))
    check("lite: hierarchy is one level flatter (story with tasks)",
          wi["items"][0]["type"] == "story" and [c["type"] for c in wi["items"][0]["children"]] == ["task", "task"] and wi["total_points"] == 1.0, wi)
    rc, out, s = plan(d, "status", "greeting", "--json")
    check("lite: next action is slice 1", s and s["next"]["kind"] == "slice", out)
    write(d / "greet.py", "def greet(name):\n    return 'hello'\n")
    rc, out, c = plan(d, "commit", "greeting", "--slice", "1", "--all", "--unverified", "no test runner yet",
                      "--tour", "greet() in greet.py", "--json")
    check("lite: an unverified slice is recorded but not done", c and not c["done"] and c["pause"], out)
    rc, out, c = plan(d, "commit", "greeting", "--slice", "1", "--proof-only", "--unverified", "no test runner yet",
                      "--accepted-by-user", "fine, I will run it myself", "--json")
    msg = sh(["git", "log", "-1", "--format=%B"], d)
    check("accepted-by-user: ticks the slice and records the user's words",
          c and c["done"] and "Accepted by the user: fine, I will run it myself" in msg
          and "- [x] Slice 1" in read(pdir / "00-status.md"), msg)
    check("fresh: the plan store never lands on the code branch", sh(["git", "ls-files"], d) == "greet.py", sh(["git", "ls-files"], d))


V1_STATUS = """# Status: Old feature

- Gate 1 — Product: **APPROVED 2025-08-15** (with one amendment, folded in)
- Gate 2 — Architecture: APPROVED 2025-08-15
- Gate 3 — Program Design: APPROVED 2025-08-15
- Gate 4 — Slice plan: **APPROVED 2025-08-16** (user directed implementation to begin)

## Slices
- [x] Slice 1 — tracer: one role end to end
- [ ] Slice 2 — full vocabulary

## Progress log
- Slice 1 done.

## Notes for a fresh session
Something decided in chat.
"""


def scenario_v1_and_intree(root):
    d = make_repo(root, "v1")
    write(d / "docs" / "plans" / "old-feature" / "00-status.md", V1_STATUS)
    write(d / "docs" / "plans" / "old-feature" / "04-slices.md", "# Slices\n\n- [ ] **Slice 1 — tracer.** thing\n- [ ] **Slice 2 — rest.** thing\n")
    write(d / "docs" / "plans" / "old-feature" / "mockups" / "a.html", "<p>mock</p>\n")
    sh(["git", "add", "-A"], d)
    sh(["git", "commit", "-q", "-m", "docs: plan"], d)
    rc, out, s = plan(d, "status", "old-feature", "--json")
    check("v1 folder: read in place, bold approvals understood, resumes at slice 2",
          s and all(g["state"] == "approved" for g in s["gates"]) and s["next"]["kind"] == "slice" and s["next"]["slice"] == 2
          and "docs" in s["path"], out)
    rc, out, _ = plan(d, "context")
    check("v1 folder: context offers migration rather than moving it", "migrate" in out and "old-feature" in out, out)
    plan(d, "migrate", "old-feature")
    check("migrate: folder (with mockups) is in the store and its removal is staged",
          (d / ".plans" / "old-feature" / "mockups" / "a.html").is_file() and not (d / "docs" / "plans" / "old-feature").exists()
          and "D  docs/plans/old-feature/00-status.md" in sh(["git", "status", "--porcelain"], d), sh(["git", "status", "--porcelain"], d))

    e = make_repo(root, "intree")
    plan(e, "config", "--set", "planStore.mode=in-tree")
    rc, out, init = plan(e, "init", "small-thing", "--no-branch", "--json")
    check("in-tree mode: plan folder under docs/plans, no branch cut",
          init and Path(init["path"]) == e / "docs" / "plans" / "small-thing" and sh(["git", "branch", "--show-current"], e) == "main"
          and "Override: commit on the current branch" in read(e / "docs" / "plans" / "small-thing" / "00-status.md"), out)
    sh(["git", "add", ".software-factory.json"], e)
    sh(["git", "commit", "-q", "-m", "chore: settings"], e)
    plan(e, "save", "small-thing", "-m", "docs: plan small-thing")
    check("in-tree mode: save commits the plan on the code branch", "docs/plans/small-thing/00-status.md" in sh(["git", "ls-files"], e))
    plan(e, "retire", "small-thing")
    check("retire: tag keeps the folder, removal staged",
          "00-status.md" in sh(["git", "ls-tree", "-r", "--name-only", "plan/small-thing"], e)
          and "D  docs/plans/small-thing/00-status.md" in sh(["git", "status", "--porcelain"], e))


def scenario_nongit_and_external(root):
    d = root / "plain"
    d.mkdir()
    write(d / "notes.txt", "hello\n")
    rc, out, init = plan(d, "init", "idea", "--json")
    check("no git: falls back to docs/plans in the folder", init and Path(init["path"]) == d.resolve() / "docs" / "plans" / "idea" and init["code_branch"] == "", out)

    bare = root / "planning.git"
    sh(["git", "init", "-q", "--bare", "-b", "main", str(bare)], root)
    x = make_repo(root, "ext")
    plan(x, "config", "--set", "planStore.mode=external", "--set", "planStore.url=%s" % bare.as_posix())
    rc, out, init = plan(x, "init", "shared-plan", "--json")
    check("external store: plans live in a separate repository clone",
          init and (x / ".plans" / ".git").is_dir() and (x / ".plans" / "shared-plan" / "00-status.md").is_file()
          and "plan(shared-plan): start" in sh(["git", "log", "-1", "--format=%s"], x / ".plans"), out)
    check("external store: code repo has no plans branch", "plans" not in sh(["git", "branch", "--format=%(refname:short)"], x).split("\n"))


def scenario_rules(root):
    d = make_repo(root, "rules")
    rc, out, init = plan(d, "init", "ext-thing", "--json")
    pdir = Path(init["path"])
    write(pdir / "02-architecture.md", ARCH_OK)
    write(root / "rules.json", json.dumps([{"file": "02-architecture.md", "pattern": "^## Contribution points",
                                             "present": True, "level": "error", "gate": 2,
                                             "message": "overlay: Gate 2 needs a Contribution points section"}]))
    rc, out, _ = plan(d, "check", "ext-thing", "--gate", "2", "--rules", str(root / "rules.json"), expect=1)
    check("overlay rules: an extra rule file adds a blocking check", "overlay: Gate 2 needs" in out, out)


def main():
    global EMPTY_CFG
    root = Path(tempfile.mkdtemp(prefix="sf-selftest-")).resolve()
    EMPTY_CFG = str(root / "empty.gitconfig")
    write(EMPTY_CFG, "")
    try:
        for fn in (scenario_existing, scenario_fresh_lite, scenario_v1_and_intree, scenario_nongit_and_external, scenario_rules):
            try:
                fn(root)
            except Exception as e:  # a crash in one scenario is a failure, not the end of the run
                check("%s ran to completion" % fn.__name__, False, repr(e))
    finally:
        if "--keep" in sys.argv:
            print("kept: %s" % root)
        else:
            def onerr(func, path, exc):
                try:
                    os.chmod(path, 0o700)
                    func(path)
                except Exception:
                    pass
            shutil.rmtree(root, onerror=onerr)
    failed = [n for n, ok in results if not ok]
    print("\n%d checks, %d failed" % (len(results), len(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
