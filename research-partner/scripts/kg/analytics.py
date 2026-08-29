"""scripts/kg/analytics.py — graph analytics: community detection, gap
scanning, contradiction scanning, and link suggestion.

Ownership rule, same as generate.py: this module owns notes/communities/*.md
completely for the generated portion of each file. A hand-written analyst
paragraph between the ANALYST SUMMARY markers is read back and preserved
across regeneration; everything else is rebuilt every `kg communities --write`.

Leiden vs Louvain: Leiden (multi-level, guarantees well-connected
communities) was the initial target. This ships Louvain instead (the
`community` package / python-louvain, built on networkx) because it installs
from a pure-Python wheel; leidenalg needs igraph's compiled C extension, which is a
much heavier and more failure-prone dependency to ask a personal vault
install to build. Louvain and Leiden both optimize modularity; Leiden's
guarantee over Louvain (no arbitrarily disconnected community) matters most
on large or adversarial graphs. On a ~230-node personal vault the practical
difference is small. `_run_louvain` is the one function to swap for
`leidenalg` if that ever becomes a real constraint -- nothing else here
would need to change.

Nothing in this module edits an existing note's prose, and `suggest_links`
is never auto-applied -- per spec §3.2 it is surfaced in a generated report
for a human to act on.
"""
import os, sys, sqlite3, json, hashlib, datetime as _dt

sys.path.insert(0, os.path.dirname(__file__))
import parse as P
import build as B
from retrieve import _unpack, _cosine, connect_ro

# See generate.py — never freeze the clock at packaging time.
import datetime as _dt0
TODAY = _dt0.date.today().isoformat()

try:
    import networkx as nx
    HAVE_NETWORKX = True
except ImportError:
    HAVE_NETWORKX = False

# Backend chain, best first:
#   1. networkx's own louvain_communities (networkx >= 3.0) -- no extra install at
#      all, takes an explicit seed, and is the reason `python-louvain` stopped being
#      a dependency: that package fails to build against modern setuptools
#      ("AttributeError: install_layout"), which is exactly the install-risk this
#      module's docstring says to avoid.
#   2. python-louvain, if the user happens to have it.
#   3. connected components -- coarse, never silent.
try:
    from networkx.algorithms.community import louvain_communities as _nx_louvain
    HAVE_NX_LOUVAIN = True
except ImportError:
    HAVE_NX_LOUVAIN = False

try:
    import community as _louvain
    HAVE_LOUVAIN = True
except ImportError:
    HAVE_LOUVAIN = False

SUMMARY_START = "<!-- ANALYST SUMMARY: start (preserved across `kg communities --write`) -->"
SUMMARY_END = "<!-- ANALYST SUMMARY: end -->"
PLACEHOLDER_SUMMARY = (
    "_(no analyst summary written yet -- run a real review pass over this cluster's members "
    "and replace this paragraph; anything between the two ANALYST SUMMARY markers survives the "
    "next `kg communities --write` verbatim.)_"
)


# --------------------------------------------------------------------------
# graph construction shared by communities + link suggestion

def _build_nx_graph(con):
    """Undirected projection of the compiled edge table: one node per row in
    `nodes`, one edge per (subject, object) pair in `edges` (multiplicity
    collapsed to an edge weight). Isolated nodes are included so every note
    lands in *some* community, even if it's a singleton."""
    if not HAVE_NETWORKX:
        return None
    G = nx.Graph()
    # Exclude community-type nodes themselves: a community's own generated
    # note becoming a node in *this* graph on the next `kg communities
    # --write` would (a) be nonsensical -- a community should never contain
    # another community as a member -- and (b) perturb Louvain's greedy
    # local-search order even though the note carries no real edges,
    # because node insertion order affects which near-tied moves the
    # heuristic takes. Filtering these out keeps the input graph identical
    # across rebuilds whenever the underlying notes haven't changed, which
    # is what the "stable across two consecutive builds" acceptance
    # criterion (spec-2-phase-CD-retrieval.md §3.5) actually requires.
    ids = [r["id"] for r in con.execute(
        "SELECT id FROM nodes WHERE note_type != 'community' ORDER BY id")]
    G.add_nodes_from(ids)
    node_set = set(ids)
    for r in con.execute("SELECT subject, object FROM edges ORDER BY subject, predicate, object"):
        s, o = r["subject"], r["object"]
        if s in node_set and o in node_set and s != o:
            if G.has_edge(s, o):
                G[s][o]["weight"] += 1
            else:
                G.add_edge(s, o, weight=1)
    return G


def _community_id(members):
    h = hashlib.sha1(",".join(sorted(members)).encode("utf-8")).hexdigest()[:10]
    return f"community-{h}"


# --------------------------------------------------------------------------
# 3.1 communities

def detect_communities(con, resolution=1.0, seed=42):
    """Returns {"members": {community_id: [node_id, ...]}, "backend": str,
    "warnings": [str, ...]}. Never raises for a missing optional dependency
    -- degrades to connected-components and says so, same discipline as
    embed.py's backend chain."""
    warnings = []
    G = _build_nx_graph(con)
    if G is None:
        warnings.append("networkx not installed -- run `pip install networkx` "
                         "for real community detection; falling back to one community per "
                         "connected component of the raw edge graph (coarse, no modularity "
                         "optimization).")
        return _fallback_components(con, warnings)

    if not (HAVE_NX_LOUVAIN or HAVE_LOUVAIN):
        warnings.append("no Louvain implementation available -- networkx is installed but "
                         "predates networkx.algorithms.community.louvain_communities "
                         "(networkx >= 3.0), and python-louvain is absent; falling back to "
                         "connected components (coarse). `pip install -U networkx` fixes this.")
        return _fallback_components(con, warnings, G=G)

    if G.number_of_edges() == 0:
        warnings.append("compiled graph has 0 edges -- nothing to cluster.")
        return {"members": {}, "backend": "louvain", "warnings": warnings}

    if HAVE_NX_LOUVAIN:
        # sorted() on each community, and a fixed seed, keep this deterministic --
        # see hardening-ledger.md R3: Louvain's greedy tie-breaking is sensitive to
        # node insertion order, which is why generated nodes never enter this graph
        # and every underlying query carries an explicit ORDER BY.
        groups = _nx_louvain(G, weight="weight", resolution=resolution, seed=seed)
        members = {_community_id(sorted(m)): sorted(m) for m in groups}
        return {"members": members, "backend": "louvain-networkx", "warnings": warnings}

    partition = _louvain.best_partition(G, weight="weight", resolution=resolution,
                                          random_state=seed)
    by_index = {}
    for node_id, idx in partition.items():
        by_index.setdefault(idx, []).append(node_id)
    members = {_community_id(m): sorted(m) for m in by_index.values()}
    return {"members": members, "backend": "louvain-python-louvain", "warnings": warnings}


def _fallback_components(con, warnings, G=None):
    if G is not None:
        comps = [sorted(c) for c in nx.connected_components(G)]
    else:
        # no networkx at all -- do it by hand with a union-find over edges
        parent = {}

        def find(x):
            while parent.get(x, x) != x:
                x = parent.setdefault(x, x)
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        ids = [r["id"] for r in con.execute("SELECT id FROM nodes WHERE note_type != 'community'")]
        for i in ids:
            parent.setdefault(i, i)
        for r in con.execute("SELECT subject, object FROM edges"):
            if r["subject"] in parent and r["object"] in parent:
                union(r["subject"], r["object"])
        groups = {}
        for i in ids:
            groups.setdefault(find(i), []).append(i)
        comps = [sorted(g) for g in groups.values()]
    members = {_community_id(c): c for c in comps}
    return {"members": members, "backend": "connected-components-fallback", "warnings": warnings}


def _existing_summary(path):
    if not os.path.exists(path):
        return None
    text = open(path, encoding="utf-8").read()
    if SUMMARY_START in text and SUMMARY_END in text:
        start = text.index(SUMMARY_START) + len(SUMMARY_START)
        end = text.index(SUMMARY_END)
        return text[start:end].strip()
    return None


def _render_community_note(community_id, members, con, level=0, backend="louvain"):
    rows = {r["id"]: dict(r) for r in con.execute(
        "SELECT id, title, note_type, tags, confidence FROM nodes WHERE id IN (%s)"
        % ",".join("?" * len(members)), members)}
    by_type = {}
    tag_freq = {}
    for mid in members:
        r = rows.get(mid) or {"title": mid, "note_type": "?", "tags": None, "confidence": None}
        by_type.setdefault(r["note_type"] or "?", []).append((mid, r["title"]))
        for t in json.loads(r["tags"]) if r.get("tags") else []:
            tag_freq[t] = tag_freq.get(t, 0) + 1
    top_tags = sorted(tag_freq.items(), key=lambda kv: kv[1], reverse=True)[:5]

    lines = [
        "---", "note-type: community", f"title: {json.dumps('Community: ' + community_id)}",
        f"members: [{', '.join(json.dumps(f'[[{m}]]') for m in members)}]",
        f"member-count: {len(members)}", f"level: {level}",
        f"top-tags: [{', '.join(json.dumps(t) for t, _ in top_tags)}]",
        f"generated-at: {TODAY}", "---", "",
        f"# Community: {community_id}", "",
        f"> [!info] Generated by `kg communities --write` (backend: {backend}). {len(members)} "
        f"members. Membership is deterministic given an unchanged graph (fixed random seed) -- "
        f"this file's id and member list are stable across rebuilds with no note changes.",
        "",
        SUMMARY_START,
        PLACEHOLDER_SUMMARY,
        SUMMARY_END,
        "",
        "## Members by type", "",
    ]
    for nt in sorted(by_type):
        lines.append(f"### {nt} ({len(by_type[nt])})")
        for mid, title in sorted(by_type[nt], key=lambda t: t[1] or ""):
            lines.append(f"- [[{mid}|{title or mid}]]")
        lines.append("")
    if top_tags:
        lines.append("## Dominant tags")
        lines.append("")
        for t, n in top_tags:
            lines.append(f"- `{t}` — {n} member(s)")
        lines.append("")
    lines += ["---", "",
              "*Generated by `scripts/kg/analytics.py` via `kg communities --write`. "
              "Everything above is rebuilt every run **except** the text between the two "
              "ANALYST SUMMARY markers, which is read back and preserved.*"]
    return "\n".join(lines) + "\n"


def write_communities(root, con, result, min_size=3):
    """Writes notes/communities/<id>.md for every community with >= min_size
    members, preserving any hand-written analyst paragraph. Communities
    below min_size are still recorded in the sqlite `communities` table (so
    `kg context` can still look up membership) but get no note -- too small
    to summarize meaningfully. Stale community notes (an id no longer
    produced this run) are moved to _to_delete/, same convention as
    generate.py's stub-hub cleanup."""
    comm_dir = os.path.join(root, "notes", "communities")
    os.makedirs(comm_dir, exist_ok=True)
    existing = {f for f in os.listdir(comm_dir) if f.endswith(".md")}
    written, changed = 0, 0
    kept_files = set()
    for community_id, members in result["members"].items():
        if len(members) < min_size:
            continue
        fname = f"{community_id}.md"
        kept_files.add(fname)
        path = os.path.join(comm_dir, fname)
        preserved = _existing_summary(path)
        content = _render_community_note(community_id, members, con, backend=result["backend"])
        if preserved:
            content = content.replace(PLACEHOLDER_SUMMARY, preserved)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        written += 1
        if old != content:
            changed += 1
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(content)

    stale = existing - kept_files - {".gitkeep"}
    if stale:
        to_delete = os.path.join(root, "_to_delete")
        os.makedirs(to_delete, exist_ok=True)
        for fname in sorted(stale):
            try:
                os.rename(os.path.join(comm_dir, fname), os.path.join(to_delete, fname))
            except OSError:
                pass
    return written, changed, sorted(stale)


def write_communities_table(sqlite_path, result, level=0):
    """Replaces the `communities` table's rows with the freshly computed
    partition -- FUSE-safe copy-out/edit/copy-in, same pattern as
    build.write_embeddings. Records EVERY community regardless of min_size
    so `kg context`'s community lookup works even for small clusters (it
    just won't find a summary note for them and says so)."""
    tmp = B._copy_to_tmp(sqlite_path)
    if not tmp:
        return 0
    con = sqlite3.connect(tmp)
    con.execute("DELETE FROM communities")
    n = 0
    for community_id, members in result["members"].items():
        for m in members:
            con.execute("INSERT INTO communities VALUES (?,?,?)", (m, level, community_id))
            n += 1
    con.commit()
    con.close()
    B._copy_bytes(tmp, sqlite_path)
    return n


# --------------------------------------------------------------------------
# 3.2 gaps

def find_gaps(root, con):
    out = {"low_degree_entities": [], "unsourced_notes": [], "low_confidence_notes": [],
           "stale_questions": []}

    degree = {}
    for r in con.execute("SELECT subject AS n FROM edges UNION ALL SELECT object AS n FROM edges"):
        degree[r["n"]] = degree.get(r["n"], 0) + 1
    for r in con.execute("SELECT id, title FROM nodes WHERE note_type = 'entity'"):
        if degree.get(r["id"], 0) <= 1:
            out["low_degree_entities"].append((r["id"], r["title"], degree.get(r["id"], 0)))

    sourced = {r["subject"] for r in con.execute("SELECT subject FROM edges WHERE predicate = 'evidence'")}
    for r in con.execute("SELECT id, title FROM nodes WHERE note_type IN ('concept','claim')"):
        if r["id"] not in sourced:
            out["unsourced_notes"].append((r["id"], r["title"]))

    for r in con.execute("SELECT id, title, confidence FROM nodes "
                          "WHERE note_type IN ('concept','claim') AND confidence IS NOT NULL "
                          "AND confidence < 0.4"):
        out["low_confidence_notes"].append((r["id"], r["title"], r["confidence"]))

    today = _dt.date.fromisoformat(TODAY)
    for f in P.discover_files(root):
        rel = os.path.relpath(f, root)
        if not rel.startswith(os.path.join("notes", "questions")):
            continue
        fm, _, _ = P.split_frontmatter(open(f, encoding="utf-8").read())
        if not fm or fm.get("status") != "open":
            continue
        created = fm.get("created")
        try:
            age_days = (today - _dt.date.fromisoformat(str(created))).days
        except (ValueError, TypeError):
            age_days = None
        if age_days is not None and age_days > 30:
            stem = os.path.basename(f)[:-3]
            out["stale_questions"].append((stem, fm.get("title") or stem, age_days))

    return out


# --------------------------------------------------------------------------
# 3.2 contradictions

def find_contradictions(root, con, sim_threshold=0.88):
    out = {"explicit": [], "latent": [], "warnings": []}

    for r in con.execute(
        "SELECT e.subject, s.title AS s_title, e.object, o.title AS o_title FROM edges e "
        "JOIN nodes s ON s.id = e.subject JOIN nodes o ON o.id = e.object "
        "WHERE e.predicate = 'contradicts'"
    ):
        out["explicit"].append((r["subject"], r["s_title"], r["object"], r["o_title"]))

    # Latent: no `stance` field exists anywhere in this vault's schema (checked
    # against the migrated frontmatter), so a genuine opposing-stance scan per
    # spec §3.2 has nothing to key on yet. What the data *does* support: pairs
    # of concept/claim notes that (a) are highly similar in embedding space,
    # (b) share an `about` target, and (c) have no declared relationship
    # (supports/contradicts/qualifies) between them. That is a real, useful
    # signal (two notes independently saying something about the same thing,
    # never cross-referenced) but it is NOT the same claim as "opposing
    # stance" -- reported as "latent tension candidates", not contradictions,
    # so this never overclaims what it found.
    if not con.execute("SELECT COUNT(*) AS n FROM embeddings").fetchone()["n"]:
        out["warnings"].append("no embeddings on disk -- run `kg embed`; latent-tension scan skipped.")
        return out

    about = {}
    for r in con.execute("SELECT subject, object FROM edges WHERE predicate = 'about'"):
        about.setdefault(r["object"], set()).add(r["subject"])

    declared = set()
    for r in con.execute("SELECT subject, object FROM edges "
                          "WHERE predicate IN ('supports','contradicts','qualifies')"):
        declared.add(frozenset((r["subject"], r["object"])))

    vecs = {}
    for r in con.execute(
        "SELECT n.id, v.dim, v.vector FROM embeddings v JOIN nodes n ON n.id = v.node_id "
        "WHERE n.note_type IN ('concept','claim')"
    ):
        vecs[r["id"]] = _unpack(r["vector"], r["dim"])

    seen_pairs = set()
    for target, subjects in about.items():
        subs = [s for s in subjects if s in vecs]
        for i in range(len(subs)):
            for j in range(i + 1, len(subs)):
                a, b = subs[i], subs[j]
                pair = frozenset((a, b))
                if pair in declared or pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                sim = _cosine(vecs[a], vecs[b])
                if sim >= sim_threshold:
                    titles = {r["id"]: r["title"] for r in con.execute(
                        "SELECT id, title FROM nodes WHERE id IN (?,?)", (a, b))}
                    out["latent"].append((a, titles.get(a, a), b, titles.get(b, b), round(sim, 3), target))
    out["latent"].sort(key=lambda t: t[4], reverse=True)
    return out


# --------------------------------------------------------------------------
# 3.2 link suggestion (Adamic-Adar) — surfaced only, never auto-applied

def suggest_links(con, top_n=20):
    G = _build_nx_graph(con)
    if G is None:
        return [], "networkx not installed -- run `pip install networkx` for link suggestions"
    if G.number_of_edges() == 0:
        return [], "compiled graph has 0 edges -- nothing to project links from"
    pairs = list(nx.non_edges(G))
    scored = list(nx.adamic_adar_index(G, pairs))
    scored = [(u, v, s) for u, v, s in scored if s > 0]
    scored.sort(key=lambda t: t[2], reverse=True)
    top = scored[:top_n]
    if not top:
        return [], None
    ids = {u for u, v, s in top} | {v for u, v, s in top}
    titles = {r["id"]: r["title"] for r in con.execute(
        "SELECT id, title FROM nodes WHERE id IN (%s)" % ",".join("?" * len(ids)), list(ids))}
    return [(u, titles.get(u, u), v, titles.get(v, v), round(s, 3)) for u, v, s in top], None


# --------------------------------------------------------------------------
# generated report, embedded on the dashboard

def write_gaps_report(root, con):
    gaps = find_gaps(root, con)
    contra = find_contradictions(root, con)
    links, link_warning = suggest_links(con)

    lines = [
        "# Gaps, contradictions, and suggested links", "",
        "> [!info] Generated by `kg gaps` (Spec 2 Phase D §3.2). Regenerated every run — "
        "never hand-edit. Nothing here is applied automatically; every item is a suggestion "
        "for a human (or a dispatched research subagent) to act on.",
        "",
        "## Low-degree entities (≤ 1 connection)", "",
    ]
    if gaps["low_degree_entities"]:
        for nid, title, d in sorted(gaps["low_degree_entities"], key=lambda t: t[1] or ""):
            lines.append(f"- [[{nid}|{title}]] — degree {d}")
    else:
        lines.append("_none_")
    lines += ["", "## Notes with no evidence", ""]
    if gaps["unsourced_notes"]:
        for nid, title in sorted(gaps["unsourced_notes"], key=lambda t: t[1] or ""):
            lines.append(f"- [[{nid}|{title}]]")
    else:
        lines.append("_none_")
    lines += ["", "## Claims/concepts with confidence < 0.4", ""]
    if gaps["low_confidence_notes"]:
        for nid, title, conf in sorted(gaps["low_confidence_notes"], key=lambda t: t[2]):
            lines.append(f"- [[{nid}|{title}]] — confidence {conf}")
    else:
        lines.append("_none_")
    lines += ["", "## Questions open longer than 30 days", ""]
    if gaps["stale_questions"]:
        for nid, title, age in sorted(gaps["stale_questions"], key=lambda t: -t[2]):
            lines.append(f"- [[{nid}|{title}]] — open {age} days")
    else:
        lines.append("_none — no open question is older than 30 days._")

    lines += ["", "## Contradictions — explicit (`contradicts` edges)", ""]
    if contra["explicit"]:
        for s, st, o, ot in contra["explicit"]:
            lines.append(f"- [[{s}|{st}]] ↔ [[{o}|{ot}]]")
    else:
        lines.append("_none — this vault has no `claim`-type notes with `contradicts` populated yet "
                     "(the migration kept everything as `note-type: concept`)._")
    lines += ["", "## Latent tension candidates (similar + same target + undeclared relationship)", ""]
    lines.append("_Not the same as a contradiction — see `analytics.py`'s docstring on why this vault "
                 "can't yet detect opposing `stance`. These are worth a human look, nothing more._")
    lines.append("")
    if contra["latent"]:
        for a, at, b, bt, sim, target in contra["latent"]:
            lines.append(f"- [[{a}|{at}]] & [[{b}|{bt}]] — similarity {sim}, both `about` `{target}`")
    elif contra["warnings"]:
        for w in contra["warnings"]:
            lines.append(f"_{w}_")
    else:
        lines.append("_none found above threshold._")

    lines += ["", "## Suggested links (Adamic–Adar) — never auto-applied", ""]
    if link_warning:
        lines.append(f"_{link_warning}_")
    elif links:
        for u, ut, v, vt, score in links:
            lines.append(f"- [[{u}|{ut}]] ↔ [[{v}|{vt}]] — score {score}")
    else:
        lines.append("_no candidate pairs scored above 0 (graph too sparse or too fully connected)._")

    lines += ["", "---", "", f"*Generated {TODAY} by `scripts/kg/analytics.py` via `kg gaps`.*"]
    content = "\n".join(lines) + "\n"

    # Written at vault ROOT (same convention as generate.py's map.md), not
    # under notes/ -- parse.discover_files only globs notes/**/*.md, so a
    # root-level file is automatically invisible to the graph compiler
    # without needing the EXCLUDED_DIRS mechanism. Root-level also matters
    # for doctor.check_links: its _vault_wide_files() explicitly skips any
    # notes/_meta/ path when resolving [[wikilinks]], so a report living
    # there would make index.md's own ![[gaps-report]] embed register as a
    # dead link even though the file exists on disk.
    path = os.path.join(root, "gaps-report.md")
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    changed = old != content
    if changed:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
    return path, changed, gaps, contra, links


# --------------------------------------------------------------------------
# CLI

def main():
    import argparse
    ap = argparse.ArgumentParser(prog="kg analytics")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("communities")
    sp.add_argument("--resolution", type=float, default=1.0)
    sp.add_argument("--write", action="store_true")
    sp.add_argument("--min-size", type=int, default=3)

    sub.add_parser("gaps")
    sub.add_parser("contradictions")

    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = args.root or P.vault_root()
    sqlite_path = os.path.join(root, ".kg", "graph.sqlite")
    con = connect_ro(root)
    try:
        if args.cmd == "communities":
            result = detect_communities(con, resolution=args.resolution)
            sizes = sorted((len(m) for m in result["members"].values()), reverse=True)
            print(f"backend: {result['backend']}")
            for w in result["warnings"]:
                print("-", w)
            print(f"{len(result['members'])} communit(y/ies) found; sizes: {sizes}")
            if args.write:
                con.close()
                n_rows = write_communities_table(sqlite_path, result)
                con = connect_ro(root)
                written, changed, stale = write_communities(root, con, result, min_size=args.min_size)
                print(f"sqlite: {n_rows} (node, community) row(s) written")
                print(f"notes: {written} community note(s) at/above size {args.min_size}, "
                      f"{changed} changed this run")
                if stale:
                    print(f"moved {len(stale)} stale community note(s) to _to_delete/: {stale}")
        elif args.cmd == "gaps":
            path, changed, gaps, contra, links = write_gaps_report(root, con)
            print(f"low-degree entities: {len(gaps['low_degree_entities'])}")
            print(f"unsourced notes: {len(gaps['unsourced_notes'])}")
            print(f"low-confidence notes: {len(gaps['low_confidence_notes'])}")
            print(f"stale questions (>30d open): {len(gaps['stale_questions'])}")
            print(f"contradictions -- explicit: {len(contra['explicit'])}, "
                  f"latent tension candidates: {len(contra['latent'])}")
            print(f"suggested links: {len(links)}")
            print(f"report {'written' if changed else 'unchanged'}: "
                  f"{os.path.relpath(path, root)}")
        elif args.cmd == "contradictions":
            contra = find_contradictions(root, con)
            print(json.dumps(contra, indent=2, ensure_ascii=False))
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
