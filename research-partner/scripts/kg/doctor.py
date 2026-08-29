"""scripts/kg/doctor.py — vault health check.

Three things, matching Spec 1 §3.3/§4.6:
1. Obsidian link resolution — the way Obsidian actually resolves [[wikilinks]]
   (filenames + frontmatter aliases), checked identically in note BODIES and
   in frontmatter typed-relation properties. Ported from the pre-Spec-1
   scripts/check_vault.py (the checker that caught real breakage the
   upstream skill's JSON-only checker missed).
2. Compiled-graph invariants — run the same compile_graph() build.py uses,
   flag unknown-type entities, and surface anything parked in .kg/legacy/
   (orphaned relations/measurements) so it never silently disappears.
3. Obsidian version / required community plugins for Phase B (Breadcrumbs,
   Templater, QuickAdd) — names any missing plugin and the feature it
   disables, per the Phase B acceptance criterion that nothing degrades
   silently.
4. Phase C retrieval readiness (Spec 2 §1 entry conditions / §2.6) — is the
   node/FTS/embedding schema present, how much of the vault is embedded, and
   which embedding backend is actually reachable right now. Never silent:
   if embeddings aren't available, this says so and says why.
5. Phase D lifecycle & analytics readiness (spec-2-phase-CD-retrieval.md §3) —
   whether the optional analytics dependencies (networkx, python-louvain,
   pypdf/pdfplumber, requests, bs4) are installed, whether `kg communities
   --write` has ever run, and how stale the gaps report is relative to the
   last `kg build`.
"""
import os, sys, re, json, glob, argparse, importlib

sys.path.insert(0, os.path.dirname(__file__))
import parse as P
import build as B
import embed as E

REQUIRED_PLUGINS = {
    "breadcrumbs": "typed-relation trail/matrix panels and the Mermaid graph in map.md",
    "templater-obsidian": "the note-class templates (deterministic note creation)",
    "quickadd": "the human-side capture macros (New claim / New question / Log a source / ...)",
}


def _vault_wide_files(root):
    """Every markdown file in the vault, not just notes/ — index.md, AGENTS.md,
    README.md, project-log.md carry links too and Obsidian resolves them the
    same way. Excludes _to_delete, _meta, and non-vault dirs."""
    files = []
    for f in glob.glob(os.path.join(root, "**", "*.md"), recursive=True):
        rel = os.path.relpath(f, root)
        parts = rel.split(os.sep)
        if parts[0] in ("_to_delete", "scripts", "inbox", ".kg", ".git", ".obsidian"):
            continue
        if "_meta" in parts:
            continue
        files.append(f)
    return sorted(files)


NON_MARKDOWN_LINKABLE_GLOBS = ("*.base", "*.canvas")  # Obsidian resolves these by full filename


def _non_markdown_targets(root):
    """.base/.canvas files (and similar) are valid [[wikilink]] / ![[embed]] targets in
    Obsidian, resolved by their full filename including extension -- unlike notes, which
    resolve by stem. bases/*.base (Phase B) needs this or every ![[x.base#View]] embed in
    index.md reads as a dead link."""
    names = set()
    for pattern in NON_MARKDOWN_LINKABLE_GLOBS:
        for f in glob.glob(os.path.join(root, "**", pattern), recursive=True):
            rel = os.path.relpath(f, root)
            if rel.split(os.sep)[0] in ("_to_delete", ".git", ".kg"):
                continue
            name = os.path.basename(f)
            names.add(name)
            names.add(name.lower())
    return names


# Characters Obsidian refuses in a filename. This matters for link CHECKING, not
# just for file creation: Obsidian validates a [[target]] as a candidate filename
# BEFORE it ever consults frontmatter aliases. So a target containing any of these
# can never resolve — an alias that happens to match it is unreachable, and its
# only real effect is to make a naive checker report green on a vault where every
# citation is dead. That is exactly how 341 broken citations once shipped behind
# an "All invariants pass." So: illegal characters are a hard error here, and an
# alias carrying one is never admitted as a resolution target.
ILLEGAL_TARGET_CHARS = set('*"\\/<>:|?')


def _is_unresolvable_target(t):
    return bool(set(t) & ILLEGAL_TARGET_CHARS)


def _resolution_targets(files, root=None):
    """filenames + frontmatter aliases, exactly as Obsidian resolves them —
    including Obsidian's filename-legality gate, which runs first."""
    targets, alias_owner = set(), {}
    for f in files:
        stem = os.path.basename(f)[:-3]
        targets.add(stem)
        targets.add(stem.lower())
        text = open(f, encoding="utf-8").read()
        fm, _, _ = P.split_frontmatter(text)
        for a in (fm or {}).get("aliases") or []:
            a = str(a)
            if _is_unresolvable_target(a):
                continue  # unreachable as a link target; never a valid resolution
            targets.add(a)
            targets.add(a.lower())
            alias_owner.setdefault(a.lower(), stem)
    if root:
        targets |= _non_markdown_targets(root)
    return targets, alias_owner


def check_links(root):
    files = _vault_wide_files(root)
    targets, alias_owner = _resolution_targets(files, root)
    violations = []
    by_kind = {"line-wrapped": 0, "unresolvable-citation": 0, "unresolvable-target": 0,
               "dead-citation": 0, "dead-link": 0}

    for f in files:
        rel = os.path.relpath(f, root)
        text = open(f, encoding="utf-8").read()
        fm, body, _ = P.split_frontmatter(text)

        # body wikilinks
        for wl in P.wikilinks_in(body):
            if wl["line_wrapped"]:
                violations.append(("line-wrapped", rel, wl["raw"][:60]))
                by_kind["line-wrapped"] += 1
                continue
            t = wl["target"]
            # Legality gate first — an alias can never rescue an illegal target.
            if t and _is_unresolvable_target(t):
                kind = "unresolvable-citation" if t.lower().startswith("source:") \
                    else "unresolvable-target"
                bad = "".join(sorted(set(t) & ILLEGAL_TARGET_CHARS))
                hint = f" -- illegal character(s) {bad!r} in link target"
                if t.lower().startswith("source:"):
                    hint += f'; write [[{t.split(":", 1)[1].strip()}|{t}]] instead'
                violations.append((kind, rel, t + hint))
                by_kind.setdefault(kind, 0)
                by_kind[kind] += 1
                continue
            if not t or t in targets or t.lower() in targets:
                continue
            kind = "dead-citation" if t.lower().startswith("source:") else "dead-link"
            violations.append((kind, rel, t))
            by_kind[kind] += 1

        # frontmatter typed-relation wikilinks — same resolver, per the
        # Bug-1/Bug-3 class fix (spec §6 risk table)
        for rel_edge in P.relations_of(fm or {}):
            t = rel_edge["target"]
            if t and _is_unresolvable_target(t):
                bad = "".join(sorted(set(t) & ILLEGAL_TARGET_CHARS))
                violations.append(("unresolvable-target", rel,
                                   f'{rel_edge["predicate"]}: [[{t}]] -- illegal character(s) {bad!r}'))
                by_kind.setdefault("unresolvable-target", 0)
                by_kind["unresolvable-target"] += 1
                continue
            if not t or t in targets or t.lower() in targets:
                continue
            violations.append(("dead-link-in-frontmatter", rel, f'{rel_edge["predicate"]}: [[{t}]]'))
            by_kind.setdefault("dead-link-in-frontmatter", 0)
            by_kind["dead-link-in-frontmatter"] += 1

    return violations, by_kind, len(files), len(targets), len(alias_owner)


def check_graph(root):
    """Returns (graph, problems, notes). `problems` are fail-worthy (parse
    errors, entities the graph can't identify at all). `notes` are informational
    — expected, already-explained residue (e.g. orphaned relations parked in
    .kg/legacy/ during migration) that should never block `kg doctor` forever."""
    records, n_files, n_errors = P.parse_vault(root)
    problems, notes = [], []
    if n_errors:
        for r in records:
            if r.get("errors") or r.get("fatal_error"):
                problems.append(f'parse error in {r["path"]}: {r.get("errors") or r.get("fatal_error")}')
    graph = B.compile_graph(records, root)
    for w in graph["warnings"]:
        problems.append(w)

    legacy_dir = os.path.join(root, ".kg", "legacy")
    for fn, label in (("orphan-relations.json", "relations"), ("orphan-measurements.json", "measurements")):
        p = os.path.join(legacy_dir, fn)
        if os.path.exists(p):
            n = len(json.load(open(p, encoding="utf-8")))
            if n:
                notes.append(f"{n} orphaned {label} parked in .kg/legacy/{fn} — no owning note found "
                              f"during migration; still compiled by `kg build`, never lost, but not "
                              f"discoverable from any note's frontmatter. Review and place by hand if it matters.")
    return graph, problems, notes


def check_plugins(root):
    cp_path = os.path.join(root, ".obsidian", "community-plugins.json")
    enabled = set()
    if os.path.exists(cp_path):
        try:
            enabled = set(json.load(open(cp_path, encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    plugins_dir = os.path.join(root, ".obsidian", "plugins")
    installed = set(os.listdir(plugins_dir)) if os.path.isdir(plugins_dir) else set()

    findings = []
    for pid, feature in REQUIRED_PLUGINS.items():
        if pid in enabled:
            continue
        if pid in installed:
            findings.append(f"{pid}: installed but not enabled -> disables {feature}")
        else:
            findings.append(f"{pid}: not installed -> disables {feature}")

    core = json.load(open(os.path.join(root, ".obsidian", "core-plugins.json"), encoding="utf-8")) \
        if os.path.exists(os.path.join(root, ".obsidian", "core-plugins.json")) else {}
    if not core.get("bases", False):
        findings.append("core plugin 'bases' is off -> the six bases/*.base files (Phase B) won't render")

    findings.append("Obsidian app version is not recorded inside the vault (.obsidian/ has no version file) "
                     "— verify manually you are on 1.13+ (Breadcrumbs' floor); Bases needs 1.10+.")
    return findings


def check_retrieval(root):
    """Returns a list of report lines. Never raises -- a missing/partial
    Phase C setup is reported, not fatal to `kg doctor` as a whole."""
    import sqlite3
    lines = []
    sqlite_path = os.path.join(root, ".kg", "graph.sqlite")
    if not os.path.exists(sqlite_path):
        lines.append("no .kg/graph.sqlite -- run `kg build` first (Phase C can't start)")
        return lines

    tmp = B._copy_to_tmp(sqlite_path)
    try:
        con = sqlite3.connect(tmp) if tmp else None
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')")} \
            if con else set()
        required = {"nodes", "edges", "nodes_fts", "embed_state", "embeddings", "communities"}
        missing = required - tables
        if missing:
            lines.append(f"graph.sqlite missing table(s) {sorted(missing)} -- run `kg build` "
                         "(schema is older than Spec 2 Phase C)")
        else:
            n_nodes = con.execute("SELECT COUNT(*) FROM nodes WHERE body != ''").fetchone()[0]
            n_embedded = con.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]
            n_questions = con.execute("SELECT COUNT(*) FROM nodes WHERE note_type = 'question'").fetchone()[0]
            models = [r[0] for r in con.execute("SELECT DISTINCT model FROM embed_state") if r[0]]
            pct = round(100 * n_embedded / n_nodes, 1) if n_nodes else 0.0
            lines.append(f"nodes with body text: {n_nodes}, embedded: {n_embedded} ({pct}%)"
                         + (f", model(s) on record: {', '.join(models)}" if models else ", no embeddings yet"))
            lines.append(f"question notes: {n_questions}"
                         + ("" if n_questions >= 3 else
                            " -- below the 3 needed for `kg eval`'s intended hand-labeled-style eval set "
                            "(it falls back to a source-citation proxy; see eval_retrieval.py docstring)"))
    finally:
        if tmp:
            os.remove(tmp)

    cfg_path = os.path.join(root, ".kg", "config.toml")
    if not os.path.exists(cfg_path):
        lines.append("no .kg/config.toml yet -- `kg embed` creates one with defaults on first run")
    else:
        cfg = E.load_config(root)
        backend, notes = E.resolve_backend(root, cfg, verbose=False)
        lines.append(f"configured backend chain: {cfg['backend']} -> {cfg.get('fallback')} -> none; "
                     f"currently resolves to: {backend.name}")
        for n in notes:
            lines.append(f"  {n}")
        if backend.name == "none":
            lines.append("  -> kg search/context will run lexical-only until a reachable backend embeds the vault")
    return lines


# `community` (python-louvain) is deliberately not listed here. networkx >= 3.0 ships
# louvain_communities itself, analytics.py prefers it, and python-louvain fails to
# build against modern setuptools -- listing it as optional would just invite users into
# a broken install for no gain.
OPTIONAL_DEPS = {
    "networkx": "community detection (`kg communities`) and link suggestion (`kg gaps`) -- "
                "needs >= 3.0 for modularity-optimized Louvain; below that, and without "
                "python-louvain, communities falls back to plain connected components, "
                "which is coarse but never silent about it",
    "pypdf": "PDF text extraction (`kg ingest <file>.pdf`)",
    "pdfplumber": "PDF text extraction fallback for pages pypdf can't read",
    "requests": "URL fetching (`kg ingest <url>`)",
    "bs4": "HTML text extraction (`kg ingest <url>`) -- pip name is `beautifulsoup4`",
}


def check_lifecycle(root):
    """Returns a list of report lines for Phase D. Never raises -- same
    discipline as check_retrieval: a missing optional dependency or an
    analytics step that hasn't run yet is reported, not fatal."""
    lines = []
    for mod, feature in OPTIONAL_DEPS.items():
        try:
            importlib.import_module(mod)
        except ImportError:
            lines.append(f"optional dependency '{mod}' not installed -> disables {feature}")

    sqlite_path = os.path.join(root, ".kg", "graph.sqlite")
    if not os.path.exists(sqlite_path):
        lines.append("no .kg/graph.sqlite -- run `kg build` first (Phase D can't start)")
        return lines
    import sqlite3
    tmp = B._copy_to_tmp(sqlite_path)
    if tmp:
        try:
            con = sqlite3.connect(tmp)
            n_comm_rows = con.execute("SELECT COUNT(*) FROM communities").fetchone()[0]
            n_comm_ids = con.execute("SELECT COUNT(DISTINCT community_id) FROM communities").fetchone()[0]
            n_comm_notes = con.execute(
                "SELECT COUNT(*) FROM nodes WHERE note_type = 'community'").fetchone()[0]
            if n_comm_rows == 0:
                lines.append("communities table is empty -- `kg communities --write` has never run "
                             "(or every note has been deleted since); `kg context`'s community-lift "
                             "step is using the tag-cluster stand-in.")
            else:
                lines.append(f"communities: {n_comm_rows} (node, community) row(s) across "
                             f"{n_comm_ids} cluster(s), {n_comm_notes} with a written summary note")
            n_seed = con.execute(
                "SELECT COUNT(*) FROM nodes WHERE status = 'seed'").fetchone()[0]
            if n_seed:
                lines.append(f"{n_seed} note(s) at status: seed -- review via the Inbox view "
                             "(bases/inbox.base) before treating them as real evidence")
        finally:
            os.remove(tmp)

    gaps_report = os.path.join(root, "gaps-report.md")
    if not os.path.exists(gaps_report):
        lines.append("no gaps-report.md yet -- run `kg gaps`")
    else:
        build_mtime = os.path.getmtime(sqlite_path)
        report_mtime = os.path.getmtime(gaps_report)
        if report_mtime < build_mtime:
            lines.append("gaps-report.md is older than the last `kg build` -- "
                         "re-run `kg gaps` to refresh it")
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = args.root or P.vault_root()

    print(f"vault root: {root}\n")

    print("=== 1. Obsidian link resolution ===")
    violations, by_kind, n_files, n_targets, n_alias = check_links(root)
    for kind, rel, detail in violations:
        print(f"{kind.upper():24s}{rel}: {detail}")
    print(f"\n{n_files} markdown files scanned, {n_targets} resolvable targets ({n_alias} via frontmatter alias)")
    print("violations:", by_kind, "| total:", sum(by_kind.values()))

    print("\n=== 2. Compiled-graph invariants ===")
    graph, problems, notes = check_graph(root)
    print("stats:", json.dumps(graph["stats"], indent=2))
    if problems:
        for p in problems:
            print("PROBLEM:", p)
    else:
        print("no invariant problems.")
    for n in notes:
        print("NOTE:", n)

    print("\n=== 3. Obsidian version / Phase B plugins ===")
    for f in check_plugins(root):
        print("-", f)

    print("\n=== 4. Phase C retrieval readiness ===")
    for f in check_retrieval(root):
        print("-", f)

    print("\n=== 5. Phase D lifecycle & analytics readiness ===")
    for f in check_lifecycle(root):
        print("-", f)

    total_violations = sum(by_kind.values())
    ok = total_violations == 0 and not problems
    print(f"\n{'PASS' if ok else 'FAIL'} — {total_violations} link violation(s), {len(problems)} graph problem(s)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
