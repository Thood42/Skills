"""scripts/kg/migrate.py — one-shot migration from the legacy flat-JSON
vault layout to the current graph-native frontmatter layout.

Idempotent (a note already carrying `note-type:` is left alone) and
--dry-run by default. Reads the legacy entities.json/relations.json/
sources.json/measurements.json as migration INPUT (their content is
transcribed into note frontmatter, then those JSON files become pure
build OUTPUT going forward).
"""
import os, sys, re, json, glob, argparse, difflib, shutil
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
import parse as P

# See generate.py — never freeze the clock at packaging time.
TODAY = date.today()


def add_months(d, months):
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def yq(s):
    return json.dumps(str(s), ensure_ascii=False)


def flow_list(items):
    return "[" + ", ".join(yq(i) for i in items) + "]"


def load_json(root, name, default):
    p = os.path.join(root, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def wikilink_for(slug, entities, sources, notes_by_stem):
    """Best-effort display text for a slug being turned into [[slug|Display]]."""
    if slug in notes_by_stem:
        return notes_by_stem[slug]["frontmatter"].get("title") or slug
    if slug in entities:
        return entities[slug].get("name") or slug
    if slug in sources:
        return sources[slug].get("title") or slug
    return slug


class MatchIndex:
    """Tiered subject/object -> owning concept-note resolver, built from the
    legacy `entities:` frontmatter list (pre-migration) plus body wikilinks."""

    def __init__(self, records):
        self.concept = [r for r in records if r["note_type"] == "concept"]
        self.ents_of = {}
        self.body_of = {}
        for r in self.concept:
            ents = r["frontmatter"].get("entities") or []
            self.ents_of[r["stem"]] = set(ents)
            self.body_of[r["stem"]] = {wl["target"] for wl in r["body_wikilinks"]}
        self.stems = {r["stem"] for r in self.concept}

    def owner_for(self, subject, obj=None, faithful_only=True):
        """Find the concept note that can honestly assert `subject --predicate--> obj`
        as ITS OWN frontmatter claim. Only tiers where the note's subject-entity
        actually IS the relation's subject are used for frontmatter lifting
        (faithful_only=True) — a note whose entities: list contains only the
        OBJECT, not the subject, would otherwise get a backwards-looking claim
        (e.g. the Antichamber note asserting `backed: [[antichamber]]` for a
        relation whose real subject was `indiefund`). Those go to the orphan
        file instead, still compiled into relations.json but never written
        into a note's frontmatter."""
        # tier 0: subject IS a concept note
        if subject in self.stems:
            return subject, "self"
        # tier 1: both subject and object in one note's entities:
        if obj:
            for stem, ents in self.ents_of.items():
                if subject in ents and obj in ents:
                    return stem, "both-in-entities"
        # tier 2: subject in a note's entities:
        for stem, ents in self.ents_of.items():
            if subject in ents:
                return stem, "subject-in-entities"
        if faithful_only:
            return None, None
        # tier 3: object in a note's entities:
        if obj:
            for stem, ents in self.ents_of.items():
                if obj in ents:
                    return stem, "object-in-entities"
        # tier 4: subject or object appears in a note's body wikilinks
        for stem, targets in self.body_of.items():
            if subject in targets or (obj and obj in targets):
                return stem, "body-wikilink"
        return None, None


def build_new_concept_frontmatter(old_fm, evidence_count, lifted_relations, entities, sources, notes_by_stem):
    kind = old_fm.get("type", "concept")
    title = old_fm.get("title", "")
    aliases = old_fm.get("aliases", [title] if title else [])
    tags = old_fm.get("tags", [])
    created_s = old_fm.get("created")
    try:
        created = date.fromisoformat(str(created_s))
    except Exception:
        created = TODAY
    status = "draft" if evidence_count >= 2 else "seed"
    confidence = 0.65 if evidence_count >= 2 else 0.5

    about = []
    for slug in (old_fm.get("entities") or []):
        about.append(f"[[{slug}|{wikilink_for(slug, entities, sources, notes_by_stem)}]]")
    evidence = []
    for h in (old_fm.get("sources") or []):
        evidence.append(f"[[{h}|{wikilink_for(h, entities, sources, notes_by_stem)}]]")

    lines = [
        "---",
        "note-type: concept",
        f"concept-kind: {kind}",
        f"title: {yq(title)}",
        f"aliases: {flow_list(aliases)}",
        f"status: {status}",
        f"confidence: {confidence}",
        f"tags: {flow_list(tags)}",
        f"created: {created.isoformat()}",
        f"updated: {TODAY.isoformat()}",
        f"review-after: {add_months(created, 3).isoformat()}",
        "",
        f"about: {flow_list(about) if about else '[]'}",
        f"evidence: {flow_list(evidence) if evidence else '[]'}",
    ]
    extra_keys = []
    for predicate, targets in sorted(lifted_relations.items()):
        rendered = [f"[[{t}|{wikilink_for(t, entities, sources, notes_by_stem)}]]" for t in targets]
        lines.append(f"{predicate}: {flow_list(rendered)}")
        extra_keys.append(predicate)
    lines += [
        "supports: []",
        "contradicts: []",
        "raises: []",
        "",
        "asserted-by: agent",
        f"extraction-run: {TODAY.isoformat()}-baseline",
        "---",
    ]
    return "\n".join(lines) + "\n", extra_keys


def measurements_table(rows):
    out = ["", "## Measurements", "",
           "| Predicate | Value | Source | As of | Context |",
           "|---|---|---|---|---|"]
    for r in rows:
        src = f'[[{r["source"]}]]' if r.get("source") else ""
        out.append(f'| {r["predicate"]} | {r.get("value","")} | {src} | {r.get("date") or ""} | {r.get("context") or ""} |')
    return "\n".join(out) + "\n"


def migrate_concept_note(r, notes_by_stem, entities, sources, match_index, rel_by_owner, meas_by_owner):
    old_fm = r["frontmatter"]
    if old_fm.get("note-type"):
        return None  # already migrated
    evidence_count = len(set(old_fm.get("sources") or []))
    lifted = {}
    for rel in rel_by_owner.get(r["stem"], []):
        lifted.setdefault(rel["predicate"], [])
        if rel["object"] not in lifted[rel["predicate"]]:
            lifted[rel["predicate"]].append(rel["object"])
    new_fm_text, extra_keys = build_new_concept_frontmatter(
        old_fm, evidence_count, lifted, entities, sources, notes_by_stem)

    body = r["body"]
    # strip a stale Measurements section if a prior partial run left one (idempotency safety)
    body = re.sub(r"\n##\s*Measurements\s*\n.*?(?=\n##\s|\Z)", "\n", body, flags=re.DOTALL)
    rows = meas_by_owner.get(r["stem"], [])
    if rows:
        body = body.rstrip("\n") + "\n" + measurements_table(rows)

    new_text = new_fm_text + body
    return new_text, extra_keys


def migrate_entity_note(r):
    old_fm = r["frontmatter"]
    if old_fm.get("note-type"):
        return None
    entity_type = old_fm.get("type", "concept")
    lines = ["---", "note-type: entity", f"entity-type: {entity_type}",
              f"entity: {old_fm.get('entity', r['stem'])}",
              f"title: {yq(old_fm.get('title', r['stem']))}",
              f"aliases: {flow_list(old_fm.get('aliases') or [old_fm.get('title', r['stem'])])}",
              f"tags: {flow_list(old_fm.get('tags') or ['entity'])}",
              f"created: {old_fm.get('created', TODAY.isoformat())}",
              "---"]
    return "\n".join(lines) + "\n" + r["body"]


def migrate_source_note(r):
    old_fm = r["frontmatter"]
    if old_fm.get("note-type"):
        return None
    lines = ["---", "note-type: source", f"handle: {old_fm.get('handle', r['stem'])}"]
    if old_fm.get("source-type"):
        lines.append(f"source-type: {old_fm['source-type']}")
    lines.append(f"title: {yq(old_fm.get('title', r['stem']))}")
    lines.append(f"aliases: {flow_list(old_fm.get('aliases') or [])}")
    lines.append(f"tags: {flow_list(old_fm.get('tags') or ['source'])}")
    if old_fm.get("tier"):
        lines.append(f"tier: {old_fm['tier']}")
    if old_fm.get("authors"):
        lines.append(f"authors: {flow_list(old_fm['authors']) if isinstance(old_fm['authors'], list) else yq(old_fm['authors'])}")
    if old_fm.get("year"):
        lines.append(f"year: {old_fm['year']}")
    if old_fm.get("url"):
        lines.append(f"url: {yq(old_fm['url'])}")
    lines.append("---")
    return "\n".join(lines) + "\n" + r["body"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    ap.add_argument("--apply", action="store_true", help="write changes (default is dry-run)")
    args = ap.parse_args()
    root = args.root or P.vault_root()

    entities = dict(load_json(root, "entities.json", []))
    sources = dict(load_json(root, "sources.json", []))
    relations = load_json(root, "relations.json", [])
    measurements = load_json(root, "measurements.json", [])

    records, n_files, n_errors = P.parse_vault(root)
    if n_errors:
        print(f"REFUSING to migrate: {n_errors} parse error(s) in the vault. Run parse.py to see them.")
        return 1
    notes_by_stem = {r["stem"]: r for r in records}

    match_index = MatchIndex(records)
    rel_by_owner, orphan_rels = {}, []
    rel_provenance = {}
    for rel in relations:
        owner, tier = match_index.owner_for(rel["subject"], rel["object"], faithful_only=True)
        if owner is None:
            orphan_rels.append(rel)
        else:
            rel_by_owner.setdefault(owner, []).append(rel)
            rel_provenance.setdefault(owner, []).append((rel, tier))

    meas_by_owner, orphan_meas = {}, []
    for row in measurements:
        owner, tier = match_index.owner_for(row["subject"])
        if owner is None:
            orphan_meas.append(row)
        else:
            meas_by_owner.setdefault(owner, []).append(row)

    changes = []  # (path, new_text)
    skipped_already = 0
    for r in records:
        if r["note_type"] == "concept":
            result = migrate_concept_note(r, notes_by_stem, entities, sources, match_index, rel_by_owner, meas_by_owner)
        elif r["note_type"] == "entity":
            result = migrate_entity_note(r)
        elif r["note_type"] == "source":
            result = migrate_source_note(r)
        else:
            result = None
        if result is None:
            skipped_already += 1
            continue
        new_text = result[0] if isinstance(result, tuple) else result
        changes.append((os.path.join(root, r["path"]), new_text))

    print(f"files already migrated (skipped): {skipped_already}")
    print(f"files to change: {len(changes)}")
    print(f"relations lifted onto notes: {sum(len(v) for v in rel_by_owner.values())} / {len(relations)}  "
          f"(orphaned: {len(orphan_rels)})")
    print(f"measurements placed onto notes: {sum(len(v) for v in meas_by_owner.values())} / {len(measurements)}  "
          f"(orphaned: {len(orphan_meas)})")

    if not args.apply:
        # print a diff for the first few files, and a summary for the rest
        for i, (path, new_text) in enumerate(changes):
            old_text = open(path, encoding="utf-8").read()
            if old_text == new_text:
                continue
            if i < 3:
                rel = os.path.relpath(path, root)
                print(f"\n--- diff: {rel} ---")
                diff = difflib.unified_diff(old_text.splitlines(keepends=True),
                                             new_text.splitlines(keepends=True), lineterm="")
                print("".join(list(diff)[:60]))
        print(f"\n(dry run — pass --apply to write. {len(changes)} files would change.)")
        if orphan_rels:
            print(f"\norphan relations (no owning note found), see --apply output for .kg/legacy/orphan-relations.json:")
            for r in orphan_rels:
                print(" ", r)
        if orphan_meas:
            print("orphan measurements:")
            for r in orphan_meas:
                print(" ", r)
        return 0

    # --apply: write files
    for path, new_text in changes:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(new_text)

    for d in ("notes/claims", "notes/questions", "notes/communities"):
        dp = os.path.join(root, d)
        os.makedirs(dp, exist_ok=True)
        gk = os.path.join(dp, ".gitkeep")
        if not os.path.exists(gk):
            open(gk, "w").close()

    legacy_dir = os.path.join(root, ".kg", "legacy")
    os.makedirs(legacy_dir, exist_ok=True)
    if orphan_rels:
        json.dump(orphan_rels, open(os.path.join(legacy_dir, "orphan-relations.json"), "w", encoding="utf-8"), indent=2)
    if orphan_meas:
        json.dump(orphan_meas, open(os.path.join(legacy_dir, "orphan-measurements.json"), "w", encoding="utf-8"), indent=2)

    report = [
        "# Migration report — legacy flat-JSON layout -> graph-native layout", "",
        f"- files migrated: {len(changes)}",
        f"- relations lifted onto notes: {sum(len(v) for v in rel_by_owner.values())} / {len(relations)}",
        f"- relations orphaned (kept in .kg/legacy/orphan-relations.json, still compiled by `kg build`): {len(orphan_rels)}",
        f"- measurements placed onto notes: {sum(len(v) for v in meas_by_owner.values())} / {len(measurements)}",
        f"- measurements orphaned: {len(orphan_meas)}",
    ]
    open(os.path.join(legacy_dir, "migration-report.md"), "w", encoding="utf-8").write("\n".join(report) + "\n")

    print(f"APPLIED. {len(changes)} files written. Report: .kg/legacy/migration-report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
