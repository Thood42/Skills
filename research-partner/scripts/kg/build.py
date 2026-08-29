"""scripts/kg/build.py — compile parsed notes into .kg/graph.sqlite,
.kg/entities.json, .kg/relations.json, .kg/sources.json, .kg/measurements.json.

Notes are the source of truth (Spec 1 Phase A, §1.2). This script only reads
notes/ and writes .kg/ — it never edits a note.

Spec 2 Phase C additions (§2.1): `graph.sqlite` gained a full node index over
every note's body (not just entities/sources), an FTS5 table for lexical
search, and an embeddings/embed_state pair for incremental vector search.
`kg build` never computes embeddings itself (that stays cheap and fast, per
Spec 1's <5s target) — it only carries forward embedding rows whose content
hash still matches, so a separate `kg embed` run only pays for what changed.
See embed.py.
"""
import os, sys, json, sqlite3, re, argparse, time, hashlib, tempfile, struct, datetime

sys.path.insert(0, os.path.dirname(__file__))
import parse as P

MEASUREMENTS_HEADER_RE = re.compile(r"^\|\s*Predicate\s*\|\s*Value\s*\|\s*Source\s*\|\s*As of\s*\|\s*Context\s*\|\s*$", re.I | re.M)


def index_by_stem(records):
    return {r["stem"]: r for r in records}


def title_of(record):
    fm = record.get("frontmatter") or {}
    t = fm.get("title")
    if t:
        return str(t)
    return record["stem"]


def parse_measurement_rows(body):
    """Parse a `## Measurements` markdown table (see generate.py for the
    exact format written). Returns list of {predicate, value, source, as_of, context}."""
    rows = []
    m = re.search(r"^##\s*Measurements\s*$", body, re.M)
    if not m:
        return rows
    rest = body[m.end():]
    lines = rest.splitlines()
    i = 0
    # skip blank lines up to the header row
    while i < len(lines) and not lines[i].strip().startswith("|"):
        if lines[i].strip() and not lines[i].strip().startswith("|"):
            break
        i += 1
    if i >= len(lines) or not MEASUREMENTS_HEADER_RE.match(lines[i].strip()):
        return rows
    i += 2  # header + separator
    while i < len(lines) and lines[i].strip().startswith("|"):
        cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        if len(cells) >= 5:
            predicate, value, source, as_of, context = cells[0], cells[1], cells[2], cells[3], cells[4]
            src_target = None
            wl = P.wikilinks_in(source)
            if wl:
                src_target = wl[0]["target"]
            rows.append({
                "predicate": predicate, "value": value,
                "source": src_target or (source or None) or None,
                "as_of": as_of or None, "context": context or None,
            })
        i += 1
    return rows


def compile_graph(records, root):
    by_stem = index_by_stem(records)
    documented_types = {"concept", "claim", "question", "source", "community"}
    documented_stems = {r["stem"] for r in records if r["note_type"] in documented_types}
    entity_hub_stems = {r["stem"] for r in records if r["note_type"] == "entity"}

    # every relation/body-wikilink target that isn't a documented note is an entity reference
    referenced = set()
    for r in records:
        for rel in r["relations"]:
            referenced.add(rel["target"])
        for wl in r["body_wikilinks"]:
            referenced.add(wl["target"])

    entity_slugs = entity_hub_stems | (referenced - documented_stems)

    entities = {}
    unknown_entities = []
    for slug in sorted(entity_slugs):
        hub = by_stem.get(slug)
        if hub and hub["note_type"] == "entity":
            fm = hub["frontmatter"]
            entities[slug] = {
                "type": fm.get("entity-type") or fm.get("type") or "unknown",
                "name": fm.get("title") or slug,
                "aliases": fm.get("aliases") or [],
                "notes": [],
                "summary": _first_paragraph(hub["body"]),
            }
        else:
            unknown_entities.append(slug)
            entities[slug] = {"type": "unknown", "name": slug, "aliases": [], "notes": [], "summary": ""}

    # notes[] backref: which concept/claim/question notes touch each entity
    for r in records:
        if r["note_type"] not in {"concept", "claim", "question"}:
            continue
        touched = {rel["target"] for rel in r["relations"]} | {wl["target"] for wl in r["body_wikilinks"]}
        for slug in touched:
            if slug in entities:
                notes_list = entities[slug]["notes"]
                if r["stem"] not in notes_list:
                    notes_list.append(r["stem"])

    # relations: every generic typed-relation edge found on any note
    relations = []
    for r in records:
        for rel in r["relations"]:
            relations.append({
                "subject": r["stem"],
                "predicate": rel["predicate"],
                "object": rel["target"],
                "subject_note_type": r["note_type"],
            })

    # sources: from notes/sources/*.md frontmatter
    sources = {}
    for r in records:
        if r["note_type"] != "source":
            continue
        fm = r["frontmatter"]
        handle = fm.get("handle") or r["stem"]
        entry = {"title": fm.get("title") or handle}
        for k_src, k_dst in (("source-type", "type"), ("tier", "tier"), ("year", "year"),
                              ("url", "url"), ("authors", "authors"), ("publisher", "publisher")):
            if fm.get(k_src) is not None:
                entry[k_dst] = fm[k_src]
        sources[handle] = entry

    # measurements: parsed from each note's `## Measurements` table
    measurements = []
    for r in records:
        for row in parse_measurement_rows(r["body"]):
            measurements.append({"subject": r["stem"], **row})

    warnings = []
    if unknown_entities:
        warnings.append(f"{len(unknown_entities)} entity reference(s) with no hub note and no prior "
                         f"identity data (type=unknown): {', '.join(unknown_entities[:20])}"
                         + (" ..." if len(unknown_entities) > 20 else ""))

    return {
        "entities": entities,
        "relations": relations,
        "sources": sources,
        "measurements": measurements,
        "warnings": warnings,
        "stats": {
            "files": len(records),
            "concept": sum(1 for r in records if r["note_type"] == "concept"),
            "claim": sum(1 for r in records if r["note_type"] == "claim"),
            "question": sum(1 for r in records if r["note_type"] == "question"),
            "entity": len(entities),
            "source": len(sources),
            "relations": len(relations),
            "measurements": len(measurements),
        },
    }


def _first_paragraph(body):
    for block in re.split(r"\n\s*\n", body):
        b = block.strip()
        if not b or b.startswith("#") or b.startswith(">"):
            continue
        return re.sub(r"\s+", " ", b)[:400]
    return ""


# --------------------------------------------------------------------------
# Phase C: full node/document index (every note's body, not just entities
# and sources) — this is what nodes_fts and embeddings are built over.

def compile_documents(records):
    """id -> {id, note_type, title, path, status, confidence, updated,
    content_hash, body}. One entry per parsed note of any note_type,
    keyed by stem. `body` is the raw markdown body (frontmatter stripped),
    unmodified — good enough for FTS and for embedding, and cheap to store."""
    docs = {}
    for r in records:
        if r.get("fatal_error"):
            continue
        fm = r.get("frontmatter") or {}
        body = (r.get("body") or "").strip()
        content_hash = hashlib.sha1(body.encode("utf-8")).hexdigest()
        updated = fm.get("updated")
        tags = fm.get("tags") or []
        docs[r["stem"]] = {
            "id": r["stem"],
            "note_type": r["note_type"],
            "title": title_of(r),
            "path": r["path"],
            "status": fm.get("status"),
            "confidence": fm.get("confidence"),
            "updated": str(updated) if updated is not None else None,
            "content_hash": content_hash,
            "body": body,
            "tags": json.dumps([str(t) for t in tags], ensure_ascii=False) if tags else None,
            "tier": fm.get("tier"),
        }
    return docs


# --------------------------------------------------------------------------
# FUSE-safe sqlite I/O. This vault folder is a FUSE mount without real POSIX
# byte-range locking, so sqlite's rollback-journal machinery fails there
# with "disk I/O error" the moment a connection is opened directly on a path
# under it. Every read or write of graph.sqlite goes through a real-tmp-path
# copy, exactly the pattern write_sqlite already used in Phase A.

def _copy_to_tmp(path):
    """Copy an existing file at `path` to a fresh real-fs tmp path. Returns
    the tmp path, or None if `path` doesn't exist (or isn't readable)."""
    if not os.path.exists(path):
        return None
    fd, tmp_path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    try:
        with open(path, "rb") as src, open(tmp_path, "wb") as dst:
            dst.write(src.read())
    except OSError:
        os.remove(tmp_path)
        return None
    return tmp_path


def _copy_bytes(tmp_path, dest_path):
    """Move the finished tmp sqlite file's bytes into `dest_path`, clearing
    any stale journal/wal/shm siblings first."""
    legacy_dir = os.path.join(os.path.dirname(dest_path), "legacy")
    for suffix in ("-journal", "-wal", "-shm"):
        stale = dest_path + suffix
        if os.path.exists(stale):
            try:
                os.makedirs(legacy_dir, exist_ok=True)
                os.rename(stale, os.path.join(legacy_dir, os.path.basename(stale) + ".stale"))
            except OSError:
                pass
    with open(tmp_path, "rb") as src_fh:
        data = src_fh.read()
    with open(dest_path, "wb") as dst_fh:
        dst_fh.write(data)
    os.remove(tmp_path)


def write_sqlite(graph, path, documents=None):
    """Builds the sqlite file in a real (non-FUSE) tmp location, then copies
    the finished bytes into the vault. Before doing so, pulls forward any
    embedding rows from the *current* graph.sqlite whose content_hash still
    matches — otherwise a full rebuild (which this always is, per the FUSE
    note above) would silently discard every embedding on every `kg build`.
    """
    documents = documents or {}

    old_embeddings = {}  # id -> {content_hash, model, dim, vector, embedded_at}
    old_communities = []  # [(node_id, level, community_id), ...]
    old_tmp = _copy_to_tmp(path)
    if old_tmp:
        try:
            ocon = sqlite3.connect(old_tmp)
            has_tables = {row[0] for row in ocon.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
            if {"embed_state", "embeddings"} <= has_tables:
                for node_id, content_hash, model, dim, vector, embedded_at in ocon.execute(
                    "SELECT e.node_id, e.content_hash, e.model, e.dim, v.vector, e.embedded_at "
                    "FROM embed_state e JOIN embeddings v ON v.node_id = e.node_id"
                ):
                    old_embeddings[node_id] = {"content_hash": content_hash, "model": model,
                                                "dim": dim, "vector": vector, "embedded_at": embedded_at}
            if "communities" in has_tables:
                # Phase D (spec §3.1): `kg communities --write` populates this table
                # directly, between `kg build` runs. A full rebuild recreates every
                # table from scratch (see the FUSE note above) -- without carrying
                # this forward the same way embeddings are, every `kg build` after
                # `kg communities --write` would silently erase community membership.
                old_communities = list(ocon.execute(
                    "SELECT node_id, level, community_id FROM communities"))
            ocon.close()
        except sqlite3.DatabaseError:
            pass
        finally:
            os.remove(old_tmp)

    fd, tmp_path = tempfile.mkstemp(suffix=".sqlite")
    os.close(fd)
    os.remove(tmp_path)
    con = sqlite3.connect(tmp_path)
    cur = con.cursor()
    cur.execute("""CREATE TABLE nodes (
        id TEXT PRIMARY KEY, kind TEXT, note_type TEXT, title TEXT,
        path TEXT, status TEXT, confidence REAL, updated TEXT,
        content_hash TEXT, body TEXT, tags TEXT, tier TEXT
    )""")
    cur.execute("""CREATE TABLE edges (
        subject TEXT, predicate TEXT, object TEXT,
        value TEXT, unit TEXT, as_of TEXT, source_note TEXT
    )""")
    cur.execute("CREATE VIRTUAL TABLE nodes_fts USING fts5(id UNINDEXED, title, body)")
    cur.execute("""CREATE TABLE embed_state (
        node_id TEXT PRIMARY KEY, content_hash TEXT, model TEXT, dim INTEGER, embedded_at TEXT
    )""")
    cur.execute("CREATE TABLE embeddings (node_id TEXT PRIMARY KEY, dim INTEGER, vector BLOB)")
    # Phase D stub -- populated by `kg communities --write` when that ships; an
    # empty table today so Phase C code can query it unconditionally.
    cur.execute("CREATE TABLE communities (node_id TEXT, level INTEGER, community_id TEXT)")

    seen = set()
    for nid, doc in documents.items():
        cur.execute("INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            nid, "note", doc["note_type"], doc.get("title") or nid, doc.get("path"),
            doc.get("status"), doc.get("confidence"), doc.get("updated"),
            doc.get("content_hash"), doc.get("body") or "", doc.get("tags"), doc.get("tier"),
        ))
        cur.execute("INSERT INTO nodes_fts (id, title, body) VALUES (?,?,?)",
                    (nid, doc.get("title") or nid, doc.get("body") or ""))
        seen.add(nid)

    # entity/source nodes documents didn't already cover (e.g. a referenced
    # slug with no hub note yet -- generate.py's stub-hub case)
    for slug, e in graph["entities"].items():
        if slug in seen:
            continue
        cur.execute("INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (slug, "entity", "entity", e["name"], None, None, None, None, None,
                     e.get("summary") or "", None, None))
        cur.execute("INSERT INTO nodes_fts (id, title, body) VALUES (?,?,?)",
                    (slug, e["name"], e.get("summary") or ""))
        seen.add(slug)
    for h, s in graph["sources"].items():
        if h in seen:
            continue
        cur.execute("INSERT OR REPLACE INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (h, "source", "source", s.get("title", h), None, None, None, None, None,
                     "", None, s.get("tier")))
        cur.execute("INSERT INTO nodes_fts (id, title, body) VALUES (?,?,?)", (h, s.get("title", h), ""))
        seen.add(h)

    for rel in graph["relations"]:
        cur.execute("INSERT INTO edges (subject, predicate, object, source_note) VALUES (?,?,?,?)",
                    (rel["subject"], rel["predicate"], rel["object"], rel["subject"]))
    for m in graph["measurements"]:
        cur.execute("INSERT INTO edges (subject, predicate, object, value, unit, as_of, source_note) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (m["subject"], m["predicate"], m.get("source"), m.get("value"), m.get("unit"),
                     m.get("as_of"), m["subject"]))

    carried = 0
    for nid, doc in documents.items():
        old = old_embeddings.get(nid)
        if old and old["content_hash"] == doc.get("content_hash"):
            cur.execute("INSERT INTO embed_state VALUES (?,?,?,?,?)",
                        (nid, old["content_hash"], old["model"], old["dim"], old["embedded_at"]))
            cur.execute("INSERT INTO embeddings VALUES (?,?,?)", (nid, old["dim"], old["vector"]))
            carried += 1

    carried_communities = 0
    for node_id, level, community_id in old_communities:
        if node_id in seen:
            cur.execute("INSERT INTO communities VALUES (?,?,?)", (node_id, level, community_id))
            carried_communities += 1

    con.commit()
    con.close()
    _copy_bytes(tmp_path, path)
    return {"carried_embeddings": carried, "carried_communities": carried_communities}


def pending_embeddings(sqlite_path, force_all=False):
    """{node_id: {id, title, body, content_hash, note_type}} for every node
    with body text that has no current-hash embedding row yet. Consumed by
    embed.py; `force_all=True` (kg embed --all) ignores the hash check."""
    tmp = _copy_to_tmp(sqlite_path)
    if not tmp:
        return {}
    try:
        con = sqlite3.connect(tmp)
        rows = con.execute(
            "SELECT n.id, n.title, n.body, n.content_hash, n.note_type "
            "FROM nodes n LEFT JOIN embed_state e ON e.node_id = n.id "
            "WHERE n.body IS NOT NULL AND n.body != '' "
            "AND (? OR e.node_id IS NULL OR e.content_hash != n.content_hash)",
            (1 if force_all else 0,),
        ).fetchall()
        con.close()
    finally:
        os.remove(tmp)
    return {r[0]: {"id": r[0], "title": r[1], "body": r[2], "content_hash": r[3], "note_type": r[4]}
            for r in rows}


def write_embeddings(sqlite_path, computed, pending, model_name, dim):
    """computed: {node_id: [float, ...]}. Writes/replaces embed_state +
    embeddings rows for those ids directly into the existing graph.sqlite
    (copy-out, edit, copy-in — same FUSE-safety pattern as write_sqlite).
    Leaves nodes/edges untouched. Returns the number of rows written."""
    if not computed:
        return 0
    tmp = _copy_to_tmp(sqlite_path)
    if not tmp:
        return 0
    con = sqlite3.connect(tmp)
    now = datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    n = 0
    for nid, vec in computed.items():
        doc = pending.get(nid, {})
        blob = struct.pack(f"<{len(vec)}f", *vec)
        con.execute("INSERT OR REPLACE INTO embed_state VALUES (?,?,?,?,?)",
                    (nid, doc.get("content_hash"), model_name, len(vec), now))
        con.execute("INSERT OR REPLACE INTO embeddings VALUES (?,?,?)", (nid, len(vec), blob))
        n += 1
    con.commit()
    con.close()
    _copy_bytes(tmp, sqlite_path)
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    ap.add_argument("--dry-run", action="store_true", help="parse and report only, write nothing")
    args = ap.parse_args()

    t0 = time.time()
    root = args.root or P.vault_root()
    records, n_files, n_errors = P.parse_vault(root)
    print(f"vault root: {root}")
    print(f"files parsed: {n_files}  parse errors: {n_errors}")
    if n_errors:
        for r in records:
            if r.get("errors") or r.get("fatal_error"):
                print("  ERROR", r["path"], r.get("errors") or r.get("fatal_error"))

    graph = compile_graph(records, root)
    documents = compile_documents(records)
    print("stats:", json.dumps(graph["stats"], indent=2))
    for w in graph["warnings"]:
        print("WARNING:", w)

    if args.dry_run:
        print(f"(dry run — nothing written) [{time.time()-t0:.2f}s]")
        return 0 if n_errors == 0 else 1

    kg_dir = os.path.join(root, ".kg")
    os.makedirs(kg_dir, exist_ok=True)
    with open(os.path.join(kg_dir, "entities.json"), "w", encoding="utf-8") as fh:
        json.dump(sorted(graph["entities"].items()), fh, indent=2, ensure_ascii=False)
    with open(os.path.join(kg_dir, "relations.json"), "w", encoding="utf-8") as fh:
        json.dump(graph["relations"], fh, indent=2, ensure_ascii=False)
    with open(os.path.join(kg_dir, "sources.json"), "w", encoding="utf-8") as fh:
        json.dump(sorted(graph["sources"].items()), fh, indent=2, ensure_ascii=False)
    with open(os.path.join(kg_dir, "measurements.json"), "w", encoding="utf-8") as fh:
        json.dump(graph["measurements"], fh, indent=2, ensure_ascii=False)
    carry = write_sqlite(graph, os.path.join(kg_dir, "graph.sqlite"), documents)

    print(f"wrote .kg/{{entities,relations,sources,measurements}}.json + graph.sqlite "
          f"(carried {carry['carried_embeddings']} embedding(s), "
          f"{carry['carried_communities']} communit(y/ies) row(s) forward)  [{time.time()-t0:.2f}s]")
    return 0 if n_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
