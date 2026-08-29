"""scripts/kg/parse.py — markdown + frontmatter -> node & edge records.

Shared by build.py, migrate.py, doctor.py, generate.py. No side effects:
this module only reads.
"""
import os, re, glob
import yaml

FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)
WIKILINK_RE = re.compile(r"\[\[([^\]]+?)\]\]", re.DOTALL)

# Directories under notes/ that are excluded from parsing entirely (docs, not graph nodes).
EXCLUDED_DIRS = {"_meta"}
# Folder name -> note-type for notes living in a typed subfolder.
FOLDER_NOTE_TYPE = {
    "entities": "entity",
    "sources": "source",
    "claims": "claim",
    "questions": "question",
    "communities": "community",
}

# Frontmatter keys that are never relation/edge lists even though they are
# YAML lists (so the generic wikilink-list detector in relations_of() doesn't
# misfire on them). `members` (Phase D community notes) is the important one:
# it's a real Obsidian-visible wikilink list, but if it compiled as a graph
# edge, a community note would gain a live edge back to every one of its own
# members -- pulling the community note itself into the graph component on
# the *next* `kg communities --write`, which changes its member count, which
# changes its content-hashed id, which orphans the old note. A community's
# roster is display-only; the graph already knows the real edges.
NON_RELATION_LIST_KEYS = {"aliases", "tags", "notes", "members"}


class ParseError(Exception):
    pass


def vault_root(start=None):
    """Walk upward from `start` (default cwd) to find the vault root, identified
    by the presence of a notes/ directory."""
    d = os.path.abspath(start or os.getcwd())
    while True:
        if os.path.isdir(os.path.join(d, "notes")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise ParseError("could not locate vault root (no notes/ directory found)")
        d = parent


def strip_code(text):
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"``[^`]*``|`[^`\n]*`", "", text)
    return text


def split_frontmatter(text):
    """Return (frontmatter_dict_or_None, body, error_or_None)."""
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text, "no frontmatter block"
    raw = m.group(1)
    body = text[m.end():]
    try:
        fm = yaml.safe_load(raw)
    except yaml.YAMLError as e:
        return None, body, f"yaml error: {e}"
    if fm is None:
        fm = {}
    if not isinstance(fm, dict):
        return None, body, "frontmatter is not a mapping"
    return fm, body, None


def wikilinks_in(text):
    """Yield dicts for every [[...]] occurrence in body text (code blocks excluded)."""
    out = []
    for m in WIKILINK_RE.finditer(strip_code(text)):
        raw = m.group(1)
        wrapped = "\n" in raw
        target = raw.split("|")[0].split("#")[0].strip()
        display = raw.split("|", 1)[1].strip() if "|" in raw else target
        out.append({"raw": raw, "target": target, "display": display, "line_wrapped": wrapped})
    return out


def _is_wikilink_str(s):
    return isinstance(s, str) and bool(re.fullmatch(r"\[\[.+?\]\]", s.strip()))


def relations_of(fm):
    """Generic predicate detector: any frontmatter key whose value is a
    non-empty list where every element is a `[[stem|Display]]`-shaped string
    is treated as a typed relation (edge) list, predicate = the key name.
    This works for both the schema's declared predicates (about, evidence,
    supports, ...) and any domain predicate a project defines for itself
    (licensed_under, announced, ...) without a hardcoded vocabulary.
    """
    rels = []
    for key, val in (fm or {}).items():
        if key in NON_RELATION_LIST_KEYS:
            continue
        if not isinstance(val, list) or not val:
            continue
        if not all(_is_wikilink_str(v) for v in val):
            continue
        for v in val:
            inner = v.strip()[2:-2]
            target = inner.split("|")[0].split("#")[0].strip()
            display = inner.split("|", 1)[1].strip() if "|" in inner else target
            rels.append({"predicate": key, "target": target, "display": display})
    return rels


def infer_note_type(relpath, fm):
    """note-type, post- or pre-migration. Post-migration notes declare
    `note-type` explicitly; pre-migration notes are inferred from folder +
    legacy `type:`."""
    if isinstance(fm, dict) and fm.get("note-type"):
        return fm["note-type"]
    parts = relpath.split(os.sep)
    if len(parts) >= 2 and parts[0] == "notes" and parts[1] in FOLDER_NOTE_TYPE:
        return FOLDER_NOTE_TYPE[parts[1]]
    # bare notes/*.md: legacy type: source is only used for sources dir today,
    # so anything here is a concept note (event/concept/pattern/case-study).
    return "concept"


def parse_file(path, root):
    relpath = os.path.relpath(path, root)
    stem = os.path.basename(path)[:-3]
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as e:
        return {"path": relpath, "stem": stem, "fatal_error": str(e)}
    fm, body, err = split_frontmatter(text)
    record = {
        "path": relpath,
        "stem": stem,
        "frontmatter": fm or {},
        "body": body,
        "errors": [err] if err else [],
    }
    record["note_type"] = infer_note_type(relpath, fm)
    record["body_wikilinks"] = wikilinks_in(body)
    record["relations"] = relations_of(fm)
    return record


def discover_files(root):
    """All markdown note files under notes/, excluding _meta and anything
    outside notes/ (scripts/, inbox/, _to_delete/, .kg/)."""
    files = []
    for f in glob.glob(os.path.join(root, "notes", "**", "*.md"), recursive=True):
        rel = os.path.relpath(f, root)
        parts = rel.split(os.sep)
        if any(p in EXCLUDED_DIRS for p in parts):
            continue
        files.append(f)
    return sorted(files)


def parse_vault(root):
    """Returns (records, file_count, parse_error_count)."""
    files = discover_files(root)
    records = []
    for f in files:
        records.append(parse_file(f, root))
    n_errors = sum(1 for r in records if r.get("errors") or r.get("fatal_error"))
    return records, len(files), n_errors


if __name__ == "__main__":
    import sys, json
    root = vault_root()
    records, n, errs = parse_vault(root)
    print(f"vault root: {root}")
    print(f"files discovered: {n}")
    print(f"parse errors: {errs}")
    for r in records:
        if r.get("errors") or r.get("fatal_error"):
            print(" ERROR", r["path"], r.get("errors") or r.get("fatal_error"))
    by_type = {}
    for r in records:
        by_type[r["note_type"]] = by_type.get(r["note_type"], 0) + 1
    print("by note_type:", json.dumps(by_type, indent=2))
