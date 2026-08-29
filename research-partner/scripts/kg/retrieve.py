"""scripts/kg/retrieve.py — kg search / neighbors / path / subgraph / context
(Spec 2 Phase C §2.3-2.4). Read-only: opens .kg/graph.sqlite immutable, never
writes. This is the module every agent turn calls instead of grepping the
vault (spec's framing) — `context()` is the one function meant for that.
"""
import os, sys, sqlite3, argparse, json, time, math, struct, re

sys.path.insert(0, os.path.dirname(__file__))
import parse as P
import embed as E

DEFAULT_K = 12
FTS_POOL = 30
VEC_POOL = 30

# Graph-expansion predicate weights (spec §2.4 step 4): evidence/supports
# outrank the generic `about` link.
PREDICATE_WEIGHT = {
    "evidence": 1.0, "supports": 0.9, "contradicts": 0.9, "answers": 0.85,
    "cites": 0.7, "about": 0.5, "raises": 0.6, "qualifies": 0.7,
}
DEFAULT_PREDICATE_WEIGHT = 0.4


def connect_ro(root):
    """Read-only, lock-free connection. `immutable=1` tells sqlite the file
    won't change for the life of the connection, which sidesteps the FUSE
    mount's lack of real POSIX byte-range locking entirely for reads (only
    writers need the copy-out/copy-in dance build.py uses)."""
    path = os.path.join(root, ".kg", "graph.sqlite")
    if not os.path.exists(path):
        raise SystemExit("no .kg/graph.sqlite -- run `kg build` first")
    uri = f"file:{path}?mode=ro&immutable=1"
    con = sqlite3.connect(uri, uri=True)
    con.row_factory = sqlite3.Row
    return con


# --------------------------------------------------------------------------
# lexical + semantic search, fused

def _fts_query(q):
    """FTS5 MATCH syntax is picky about punctuation; reduce the query to a
    bag of OR'd terms so a natural-language question never raises a syntax
    error. Good enough for BM25 ranking over a personal-vault-sized corpus."""
    terms = re.findall(r"[A-Za-z0-9']+", q)
    terms = [t for t in terms if len(t) > 1]
    if not terms:
        return None
    return " OR ".join(f'"{t}"' for t in terms)


def lexical_search(con, query, k=FTS_POOL, note_type=None):
    fq = _fts_query(query)
    if not fq:
        return []
    sql = ("SELECT n.id, n.title, n.note_type, n.path, n.status, n.confidence, n.tier, "
           "bm25(nodes_fts) AS score FROM nodes_fts "
           "JOIN nodes n ON n.id = nodes_fts.id "
           "WHERE nodes_fts MATCH ?")
    params = [fq]
    if note_type:
        sql += " AND n.note_type = ?"
        params.append(note_type)
    sql += " ORDER BY score LIMIT ?"  # bm25: lower is better
    params.append(k)
    try:
        rows = con.execute(sql, params).fetchall()
    except sqlite3.OperationalError:
        return []
    # normalize to "higher is better" for fusion
    return [(r["id"], -r["score"], dict(r)) for r in rows]


def _unpack(blob, dim):
    return struct.unpack(f"<{dim}f", blob)


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def embeddings_available(con):
    row = con.execute("SELECT COUNT(*) AS n FROM embeddings").fetchone()
    return bool(row and row["n"])


def semantic_search(root, con, query, k=VEC_POOL, note_type=None):
    if not embeddings_available(con):
        return [], None
    cfg = E.load_config(root)
    backend, _ = E.resolve_backend(root, cfg, verbose=False)
    if backend.name == "none":
        return [], None
    try:
        qvec = backend.embed([query])[0]
    except E.EmbedUnavailable:
        return [], None
    qdim = len(qvec)

    sql = ("SELECT n.id, n.title, n.note_type, n.path, n.status, n.confidence, n.tier, "
           "v.dim, v.vector FROM embeddings v JOIN nodes n ON n.id = v.node_id")
    params = []
    if note_type:
        sql += " WHERE n.note_type = ?"
        params.append(note_type)
    rows = con.execute(sql, params).fetchall()
    scored = []
    for r in rows:
        if r["dim"] != qdim:
            continue  # embedded with a different model/dim than the live query -- skip, don't crash
        vec = _unpack(r["vector"], r["dim"])
        sim = _cosine(qvec, vec)
        scored.append((r["id"], sim, dict(r)))
    scored.sort(key=lambda t: t[1], reverse=True)
    return scored[:k], backend.name


def _lexical_only_reason(con):
    """Why semantic search didn't contribute this run -- distinct messages
    for 'nothing embedded yet' vs 'vectors exist but no backend reachable
    right now', so `kg search`/`kg context` never blur the two."""
    if not embeddings_available(con):
        return "no embeddings computed yet -- run `kg embed`"
    return "embedding backend unreachable this run -- vectors exist on disk; see `kg doctor`"


def reciprocal_rank_fusion(ranked_lists, rrf_k=60):
    """ranked_lists: list of [(id, score, meta), ...] already sorted best-first.
    Returns [(id, fused_score, meta), ...] sorted best-first."""
    fused = {}
    meta_by_id = {}
    for lst in ranked_lists:
        for rank, (nid, _score, meta) in enumerate(lst):
            fused[nid] = fused.get(nid, 0.0) + 1.0 / (rrf_k + rank + 1)
            meta_by_id.setdefault(nid, meta)
    out = [(nid, score, meta_by_id[nid]) for nid, score in fused.items()]
    out.sort(key=lambda t: t[1], reverse=True)
    return out


def search(root, query, k=DEFAULT_K, note_type=None, hops=0):
    con = connect_ro(root)
    try:
        lex = lexical_search(con, query, k=FTS_POOL, note_type=note_type)
        sem, backend_name = semantic_search(root, con, query, k=VEC_POOL, note_type=note_type)
        fused = reciprocal_rank_fusion([lex, sem]) if sem else lex
        top = fused[:k]
        results = [{"id": nid, "score": round(score, 4), "title": meta.get("title"),
                    "note_type": meta.get("note_type"), "path": meta.get("path"),
                    "status": meta.get("status"), "confidence": meta.get("confidence")}
                   for nid, score, meta in top]
        if hops:
            seeds = [r["id"] for r in results]
            expanded = set()
            for sid in seeds:
                for nb in neighbors(root, sid, depth=hops, _con=con)["neighbors"]:
                    expanded.add(nb["id"])
            expanded -= set(seeds)
            for nid in expanded:
                row = con.execute("SELECT id, title, note_type, path, status, confidence "
                                   "FROM nodes WHERE id = ?", (nid,)).fetchone()
                if row:
                    results.append({"id": row["id"], "score": None, "title": row["title"],
                                     "note_type": row["note_type"], "path": row["path"],
                                     "status": row["status"], "confidence": row["confidence"],
                                     "via_expansion": True})
        return {"mode": "hybrid" if sem else "lexical-only",
                "lexical_only_reason": None if sem else _lexical_only_reason(con),
                "embedding_backend": backend_name, "results": results}
    finally:
        con.close()


# --------------------------------------------------------------------------
# graph traversal

def _edge_rows(con, node_id):
    """Both directions: (predicate, other_id, direction, value/unit/as_of)."""
    out = []
    for r in con.execute("SELECT * FROM edges WHERE subject = ?", (node_id,)):
        out.append({"predicate": r["predicate"], "other": r["object"], "direction": "out",
                    "value": r["value"], "unit": r["unit"], "as_of": r["as_of"]})
    for r in con.execute("SELECT * FROM edges WHERE object = ?", (node_id,)):
        if r["subject"] == node_id:
            continue
        out.append({"predicate": r["predicate"], "other": r["subject"], "direction": "in",
                    "value": r["value"], "unit": r["unit"], "as_of": r["as_of"]})
    return out


def neighbors(root, note_id, predicate=None, depth=2, _con=None):
    con = _con or connect_ro(root)
    try:
        visited = {note_id}
        frontier = [note_id]
        found = []
        for _ in range(max(depth, 0)):
            next_frontier = []
            for nid in frontier:
                for edge in _edge_rows(con, nid):
                    if predicate and edge["predicate"] != predicate:
                        continue
                    other = edge["other"]
                    if other in visited or not other:
                        continue
                    visited.add(other)
                    next_frontier.append(other)
                    row = con.execute("SELECT id, title, note_type, path FROM nodes WHERE id = ?",
                                       (other,)).fetchone()
                    found.append({"id": other, "title": row["title"] if row else other,
                                  "note_type": row["note_type"] if row else None,
                                  "via": edge["predicate"], "direction": edge["direction"],
                                  "from": nid})
            frontier = next_frontier
            if not frontier:
                break
        return {"root": note_id, "depth": depth, "predicate": predicate, "neighbors": found}
    finally:
        if not _con:
            con.close()


def path(root, a, b, max_hops=4):
    con = connect_ro(root)
    try:
        if a == b:
            return {"found": True, "hops": []}
        visited = {a: None}  # node -> (prev, edge_info)
        frontier = [a]
        for _ in range(max_hops):
            next_frontier = []
            for nid in frontier:
                for edge in _edge_rows(con, nid):
                    other = edge["other"]
                    if not other or other in visited:
                        continue
                    visited[other] = (nid, edge)
                    if other == b:
                        # walk back
                        chain = []
                        cur = b
                        while visited[cur] is not None:
                            prev, e = visited[cur]
                            chain.append({"from": prev, "to": cur, "predicate": e["predicate"],
                                         "direction": e["direction"]})
                            cur = prev
                        chain.reverse()
                        return {"found": True, "hops": chain}
                    next_frontier.append(other)
            frontier = next_frontier
            if not frontier:
                break
        return {"found": False, "hops": [], "max_hops": max_hops}
    finally:
        con.close()


def subgraph(root, note_id, depth=2, fmt="md"):
    con = connect_ro(root)
    try:
        result = neighbors(root, note_id, depth=depth, _con=con)
        root_row = con.execute("SELECT id, title, note_type FROM nodes WHERE id = ?", (note_id,)).fetchone()
        root_title = root_row["title"] if root_row else note_id
    finally:
        con.close()

    if fmt == "md":
        lines = [f"# Subgraph: {root_title} (`{note_id}`, depth {depth})", ""]
        for n in result["neighbors"]:
            arrow = "->" if n["direction"] == "out" else "<-"
            lines.append(f"- {n['from']} {arrow}[{n['via']}]{arrow} **{n['title']}** (`{n['id']}`, {n['note_type']})")
        return "\n".join(lines)

    if fmt == "mermaid":
        lines = ["```mermaid", "flowchart LR"]
        seen_edges = set()
        for n in result["neighbors"]:
            src, dst = (n["from"], n["id"]) if n["direction"] == "out" else (n["id"], n["from"])
            key = (src, n["via"], dst)
            if key in seen_edges:
                continue
            seen_edges.add(key)

            def safe(s):
                return re.sub(r"[^A-Za-z0-9_]", "_", s)
            lines.append(f'    {safe(src)}["{src}"] -->|{n["via"]}| {safe(dst)}["{dst}"]')
        lines.append("```")
        return "\n".join(lines)

    if fmt == "canvas":
        nodes, edges, placed = [], [], {note_id: (0, 0)}
        nodes.append({"id": note_id, "type": "text", "text": root_title, "x": 0, "y": 0, "width": 260, "height": 80})
        col_w, row_h = 320, 120
        for i, n in enumerate(result["neighbors"]):
            x, y = col_w, i * row_h
            placed[n["id"]] = (x, y)
            nodes.append({"id": n["id"], "type": "text", "text": n["title"], "x": x, "y": y,
                          "width": 260, "height": 80})
            src, dst = (n["from"], n["id"]) if n["direction"] == "out" else (n["id"], n["from"])
            edges.append({"id": f'{src}-{n["via"]}-{dst}', "fromNode": src, "toNode": dst, "label": n["via"]})
        return json.dumps({"nodes": nodes, "edges": edges}, indent=2)

    raise ValueError(f"unknown format: {fmt}")


# --------------------------------------------------------------------------
# kg context — the hybrid retrieval algorithm (spec §2.4)

TIER_RANK = {"primary": 4, "analyst": 3, "secondary": 2, "blog": 1}


def _tags_of(con, node_id):
    row = con.execute("SELECT tags FROM nodes WHERE id = ?", (node_id,)).fetchone()
    if not row or not row["tags"]:
        return []
    try:
        return json.loads(row["tags"])
    except (TypeError, ValueError):
        return []


def _tag_clusters(con, seed_ids, limit_per_tag=5):
    """Phase D hasn't shipped community summaries yet (spec §2.4 step 5 /
    §2.1); per the spec, the angle/topic tag stands in as the coarse
    grouping signal until it does. Returns {tag: [(id, title), ...]} for
    every tag any seed carries, excluding the seeds themselves."""
    seed_tags = {}
    for sid in seed_ids:
        for t in _tags_of(con, sid):
            seed_tags.setdefault(t, set()).add(sid)
    clusters = {}
    for tag, owning_seeds in seed_tags.items():
        rows = con.execute(
            "SELECT id, title FROM nodes WHERE tags LIKE ? AND note_type IN "
            "('concept','claim','question') ORDER BY id LIMIT ?",
            (f'%"{tag}"%', limit_per_tag + len(owning_seeds)),
        ).fetchall()
        members = [(r["id"], r["title"]) for r in rows if r["id"] not in seed_ids]
        if members:
            clusters[tag] = members[:limit_per_tag]
    return clusters


def _real_communities(con, seed_ids):
    """Phase D (spec §2.4 step 5): if `kg communities --write` has run, look
    up each seed's community_id and pull that community's own generated
    note (its `id` in `nodes` equals its community_id by construction — see
    analytics.py). Returns {community_id: (title, body)} for every distinct
    community any seed belongs to that actually has a summary note (a
    community below analytics.py's --min-size has a sqlite row but no note,
    and is silently skipped here in favor of the tag-cluster fallback)."""
    if not seed_ids:
        return {}
    has_table = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='communities'").fetchone()
    if not has_table:
        return {}
    placeholders = ",".join("?" * len(seed_ids))
    community_ids = {r["community_id"] for r in con.execute(
        f"SELECT DISTINCT community_id FROM communities WHERE node_id IN ({placeholders}) AND level = 0",
        seed_ids)}
    if not community_ids:
        return {}
    out = {}
    for cid in community_ids:
        row = con.execute("SELECT id, title, body FROM nodes WHERE id = ? AND note_type = 'community'",
                           (cid,)).fetchone()
        if row:
            out[cid] = (row["title"], row["body"] or "")
    return out


def context(root, query, budget=8000):
    con = connect_ro(root)
    try:
        lex = lexical_search(con, query, k=FTS_POOL)
        sem, backend_name = semantic_search(root, con, query, k=VEC_POOL)
        fused = reciprocal_rank_fusion([lex, sem]) if sem else lex
        seeds = fused[:8]

        # graph expansion: 1-hop for everything, 2-hop for question seeds,
        # weighted so evidence/supports edges are preferred when trimming.
        expanded = {}  # id -> (weight, meta)
        for nid, score, meta in seeds:
            expanded[nid] = (1.0, meta)
            note_type = meta.get("note_type")
            depth = 2 if note_type == "question" else 1
            nb = neighbors(root, nid, depth=depth, _con=con)["neighbors"]
            for n in nb:
                w = PREDICATE_WEIGHT.get(n["via"], DEFAULT_PREDICATE_WEIGHT)
                if n["id"] not in expanded or w > expanded[n["id"]][0]:
                    row = con.execute("SELECT id, title, note_type, path, status, confidence, tier "
                                       "FROM nodes WHERE id = ?", (n["id"],)).fetchone()
                    if row:
                        expanded[n["id"]] = (w, dict(row))

        # order per spec: community summaries -> claims (w/ confidence) ->
        # concepts -> source excerpts. No community notes exist yet
        # (Phase D), so that bucket is empty and said so explicitly.
        buckets = {"community": [], "claim": [], "concept": [], "question": [],
                   "entity": [], "source": [], "other": []}
        for nid, (weight, meta) in expanded.items():
            nt = meta.get("note_type") or "other"
            bucket = nt if nt in buckets else "other"
            buckets[bucket].append((weight, nid, meta))
        for b in buckets.values():
            b.sort(key=lambda t: t[0], reverse=True)

        node_bodies = {}
        for row in con.execute("SELECT id, body FROM nodes"):
            node_bodies[row["id"]] = row["body"]

        # provenance: which source(s) back each note, and that source's tier
        # (spec §2.4 step 6: "analyst-tier evidence sorts above blog-tier at
        # equal relevance")
        sources_by_note = {}
        for r in con.execute("SELECT subject, object FROM edges WHERE predicate = 'evidence'"):
            sources_by_note.setdefault(r["subject"], []).append(r["object"])
        tier_by_source = {r["id"]: r["tier"] for r in
                           con.execute("SELECT id, tier FROM nodes WHERE note_type = 'source'")}

        header = [
            f"# Context pack: {query!r}",
            f"mode: {'hybrid (lexical + semantic)' if sem else 'lexical-only (' + _lexical_only_reason(con) + ')'}"
            + (f", backend: {backend_name}" if backend_name else ""),
            "",
        ]
        chars_budget = budget * 4  # ~4 chars/token heuristic
        used = sum(len(h) for h in header)
        out = list(header)

        order = ["community", "claim", "concept", "question", "entity", "source", "other"]
        seed_ids = [nid for nid, _score, _meta in seeds]
        real_communities = _real_communities(con, seed_ids)
        out.append("## Community context")
        if real_communities:
            for cid, (title, body) in real_communities.items():
                excerpt = (body or "").strip()[:600]
                block = f"### {title} (`{cid}`)\n{excerpt}\n"
                out.append(block)
                used += len(block)
        else:
            clusters = _tag_clusters(con, seed_ids)
            if clusters:
                out.append("_(no community summary note covers this query's seeds yet — the "
                           "angle/topic tag stands in as the coarse grouping signal per spec §2.4 "
                           "step 5; run `kg communities --write` to replace this with real clusters)_")
                for tag, members in clusters.items():
                    line = f"- **{tag}**: " + ", ".join(f"{title} (`{mid}`)" for mid, title in members)
                    out.append(line)
                    used += len(line)
            else:
                note = "_(no community summaries yet — run `kg communities --write` — and no " \
                       "shared tags found across this query's seeds to stand in for one)_"
                out.append(note)
                used += len(note)
        out.append("")

        section_titles = {"claim": "Claims", "concept": "Concepts", "question": "Questions",
                          "entity": "Entities", "source": "Sources", "other": "Other"}
        for bucket_name in order:
            items = buckets[bucket_name]
            if not items or bucket_name == "community":
                continue
            if bucket_name == "source":
                items = sorted(items, key=lambda t: (TIER_RANK.get(t[2].get("tier"), 0), t[0]), reverse=True)
            section_lines = [f"## {section_titles.get(bucket_name, bucket_name.capitalize())}"]
            for weight, nid, meta in items:
                if used >= chars_budget:
                    break
                body = (node_bodies.get(nid) or "")[:1200]
                conf = meta.get("confidence")
                srcs = sources_by_note.get(nid, [])
                tier = meta.get("tier") or (tier_by_source.get(nid) if bucket_name == "source" else None)
                prov = f"source_id: {nid}" + (f", tier: {tier}" if tier else "") \
                       + (f", confidence: {conf}" if conf is not None else "") \
                       + (f", evidence: {', '.join(srcs)}" if srcs else "")
                block = f"### {meta.get('title')} (`{nid}`)\n{body}\n\n_{prov}_\n"
                section_lines.append(block)
                used += len(block)
            if len(section_lines) > 1:
                out.extend(section_lines)

        out.append("---")
        out.append(f"_provenance: {len(expanded)} node(s) considered, {used} of ~{chars_budget} char budget used "
                   f"(~{budget} token budget). Every block above is traceable to its source note by id._")
        return "\n".join(out)
    finally:
        con.close()


# --------------------------------------------------------------------------
# CLI

def _print_json(obj):
    print(json.dumps(obj, indent=2, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(prog="kg", description="kg search/context/neighbors/path/subgraph")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("search")
    sp.add_argument("query")
    sp.add_argument("--k", type=int, default=DEFAULT_K)
    sp.add_argument("--type", dest="note_type", default=None)
    sp.add_argument("--hops", type=int, default=0)

    sp = sub.add_parser("neighbors")
    sp.add_argument("note")
    sp.add_argument("--predicate", default=None)
    sp.add_argument("--depth", type=int, default=2)

    sp = sub.add_parser("path")
    sp.add_argument("a")
    sp.add_argument("b")
    sp.add_argument("--max-hops", type=int, default=4)

    sp = sub.add_parser("subgraph")
    sp.add_argument("note")
    sp.add_argument("--depth", type=int, default=2)
    sp.add_argument("--format", dest="fmt", choices=["md", "mermaid", "canvas"], default="md")

    sp = sub.add_parser("context")
    sp.add_argument("query")
    sp.add_argument("--budget", type=int, default=8000)

    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = args.root or P.vault_root()

    t0 = time.time()
    if args.cmd == "search":
        _print_json(search(root, args.query, k=args.k, note_type=args.note_type, hops=args.hops))
    elif args.cmd == "neighbors":
        _print_json(neighbors(root, args.note, predicate=args.predicate, depth=args.depth))
    elif args.cmd == "path":
        _print_json(path(root, args.a, args.b, max_hops=args.max_hops))
    elif args.cmd == "subgraph":
        print(subgraph(root, args.note, depth=args.depth, fmt=args.fmt))
    elif args.cmd == "context":
        print(context(root, args.query, budget=args.budget))
    if os.environ.get("KG_TIMING"):
        print(f"\n[{time.time()-t0:.3f}s]", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
