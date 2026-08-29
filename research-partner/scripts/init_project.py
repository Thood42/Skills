#!/usr/bin/env python3
"""research-partner — project scaffolder and config generator.

    init_project.py init   <root> --title "..." [--angles a,b,c] [--domain-predicates ...]
    init_project.py config <root>          # regenerate .obsidian/* from the registries
    init_project.py verify <root>          # structural check of the scaffold itself

`init` lays down the vault: directory layout, the kg compiler, bases,
templates, Obsidian config, .mcp.json and the starter markdown. `config` is
idempotent and safe to re-run whenever kg-config.json or assets/predicates.json
changes — it is the only thing that should ever write .obsidian/types.json,
.obsidian/graph.json or the Breadcrumbs edge fields.

WHY A GENERATOR AND NOT THREE CHECKED-IN FILES
The predicate vocabulary has to appear, identically, in Obsidian's property
types, in Breadcrumbs' edge fields *and* field groups, and in AGENTS.md. Kept by
hand they drift, and the failure is silent: a note shows the right frontmatter,
Breadcrumbs' Matrix says "No outgoing edges", and nothing errors. One registry,
three generated outputs.
"""
import argparse
import json
import os
import shutil
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(SKILL_ROOT, "assets")

NOTE_DIRS = ["notes", "notes/claims", "notes/questions", "notes/sources",
             "notes/entities", "notes/communities", "notes/_meta"]
OTHER_DIRS = ["bases", "templates", "scripts/kg", "docs", ".kg",
              ".obsidian/plugins/breadcrumbs", ".obsidian/plugins/quickadd",
              ".obsidian/plugins/templater-obsidian"]

# Graph-view colours for the universal note types. Angle tag groups are appended
# per project from kg-config.json.
NOTE_TYPE_COLORS = {
    "entity": 10133670,
    "claim": 2541274,
    "question": 15490984,
    "source": 9268835,
    "community": 7451452,
}
# Palette cycled through for the project's own research angles.
ANGLE_PALETTE = [5017087, 3129201, 15902298, 13073919, 16739179, 16765286,
                 4374132, 14707506]


# --------------------------------------------------------------------------- #
# registries
# --------------------------------------------------------------------------- #

def load_predicates():
    with open(os.path.join(ASSETS, "predicates.json"), encoding="utf-8") as fh:
        return json.load(fh)


def load_project_config(root):
    path = os.path.join(root, "kg-config.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def predicate_set(root):
    """Core predicates plus whatever this project declared. Returns the flat list
    of registry entries, core first, in declaration order."""
    reg = load_predicates()
    preds = list(reg["core"])
    for p in load_project_config(root).get("domain_predicates", []) or []:
        if not isinstance(p, dict) or not p.get("label"):
            continue
        p.setdefault("inverse", None)
        p.setdefault("bucket", "sames")
        p.setdefault("inverse_bucket", "sames" if p["inverse"] else None)
        p.setdefault("group", "domain")
        p.setdefault("description", "")
        preds.append(p)
    return preds


def all_labels(preds):
    """Every property key the vault may carry, forward and inverse."""
    out = []
    for p in preds:
        out.append(p["label"])
        if p.get("inverse"):
            out.append(p["inverse"])
    return out


# --------------------------------------------------------------------------- #
# generated Obsidian config
# --------------------------------------------------------------------------- #

def gen_types_json(preds):
    """Obsidian property types. Relation properties must be `multitext` — that is
    what makes them list-of-link, which is what Breadcrumbs and the graph view read."""
    types = {"aliases": "aliases", "cssclasses": "multitext", "tags": "tags"}
    for label in all_labels(preds):
        types[label] = "multitext"
    # Non-relation typed properties used by the schema.
    types.update({
        "note-type": "text", "entity-type": "text", "source-type": "text",
        "status": "text", "stance": "text", "confidence": "number",
        "priority": "text", "credibility": "text", "citekey": "text",
        "url": "text", "year": "number", "authors": "multitext",
        "created": "date", "updated": "date", "review-after": "date",
        "valid-from": "text", "valid-to": "text",
        "asserted-by": "text", "extraction-run": "text",
        "members": "multitext", "generated-at": "date",
    })
    # Breadcrumbs' own reserved note-level fields.
    for bc in ("BC-tag-note-tag", "BC-tag-note-field", "BC-regex-note-regex",
               "BC-regex-note-field", "BC-folder-note-field", "BC-list-note-field",
               "BC-dataview-note-query", "BC-dataview-note-field",
               "BC-traverse-note-field"):
        types[bc] = "text"
    for bc in ("BC-tag-note-exact", "BC-folder-note-recurse",
               "BC-list-note-exclude-index", "BC-ignore-in-edges", "BC-ignore-out-edges"):
        types[bc] = "checkbox"
    return {"types": types}


def gen_breadcrumbs(preds, skeleton):
    """Rewrite edge_fields + edge_field_groups from the registry, leaving every
    other Breadcrumbs setting in the shipped skeleton untouched."""
    data = json.loads(json.dumps(skeleton))  # deep copy

    data["edge_fields"] = [{"label": lbl} for lbl in all_labels(preds)]

    buckets = {"ups": ["up"], "downs": ["down"], "sames": ["same"],
               "nexts": ["next"], "prevs": ["prev"]}
    for p in preds:
        b = p.get("bucket")
        if b in buckets:
            buckets[b].append(p["label"])
        if p.get("inverse") and p.get("inverse_bucket") in buckets:
            buckets[p["inverse_bucket"]].append(p["inverse"])

    data["edge_field_groups"] = [{"label": k, "fields": v} for k, v in buckets.items()]

    # Load-bearing: these views read group labels, never field labels.
    data.setdefault("views", {}).setdefault("page", {}).setdefault("trail", {})
    data["views"]["page"]["trail"]["field_group_labels"] = ["ups"]
    data["views"]["page"].setdefault("prev_next", {})["field_group_labels"] = {
        "prev": ["prevs"], "next": ["nexts"]}
    return data


def gen_graph_json(cfg, skeleton):
    """Graph-view colour groups: the five universal note types, plus one per
    research angle so the shape of the project is legible at a glance."""
    data = json.loads(json.dumps(skeleton))
    groups = []
    for i, angle in enumerate(cfg.get("angles", {}) or {}):
        groups.append({"query": f"tag:#{angle}",
                       "color": {"a": 1, "rgb": ANGLE_PALETTE[i % len(ANGLE_PALETTE)]}})
    for note_type, rgb in NOTE_TYPE_COLORS.items():
        groups.append({"query": f"[note-type: {note_type}]", "color": {"a": 1, "rgb": rgb}})
    data["colorGroups"] = groups
    return data


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def cmd_config(root, quiet=False):
    """Regenerate every derived .obsidian file. Idempotent."""
    preds = predicate_set(root)
    cfg = load_project_config(root)

    with open(os.path.join(ASSETS, "obsidian-config", "plugins", "breadcrumbs",
                           "data.json"), encoding="utf-8") as fh:
        bc_skeleton = json.load(fh)
    with open(os.path.join(ASSETS, "obsidian-config", "graph.json"), encoding="utf-8") as fh:
        graph_skeleton = json.load(fh)

    write_json(os.path.join(root, ".obsidian", "types.json"), gen_types_json(preds))
    write_json(os.path.join(root, ".obsidian", "graph.json"), gen_graph_json(cfg, graph_skeleton))
    write_json(os.path.join(root, ".obsidian", "plugins", "breadcrumbs", "data.json"),
               gen_breadcrumbs(preds, bc_skeleton))

    if not quiet:
        n_dom = len(cfg.get("domain_predicates", []) or [])
        print(f"config: {len(preds)} predicates ({len(preds) - n_dom} core + {n_dom} domain), "
              f"{len(all_labels(preds))} properties typed, "
              f"{len(cfg.get('angles', {}) or {})} angle colour groups")
        print("  wrote .obsidian/types.json, .obsidian/graph.json, "
              ".obsidian/plugins/breadcrumbs/data.json")
    return 0


# --------------------------------------------------------------------------- #
# scaffold
# --------------------------------------------------------------------------- #

GITIGNORE = """# Build products — regenerable from notes/ with `kg build`.
.kg/
__pycache__/
*.pyc

# Obsidian per-machine UI state.
.obsidian/workspace.json
.obsidian/workspace-mobile.json

# Secrets: the Local REST API bearer token, if you use that channel.
vault-api-key.txt
*-api-key.txt
"""

MCP_JSON = {
    "mcpServers": {
        "kg": {
            "command": "python3",
            "args": ["-m", "scripts.kg.mcp_server"],
        }
    }
}


def copy_tree(src, dst, quiet=False):
    os.makedirs(dst, exist_ok=True)
    n = 0
    for name in sorted(os.listdir(src)):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if os.path.isdir(s):
            n += copy_tree(s, d, quiet=True)
        elif name != "__pycache__":
            shutil.copy2(s, d)
            n += 1
    return n


def cmd_init(root, title, angles, domain_predicates):
    if os.path.exists(root) and os.listdir(root):
        print(f"REFUSING: {root} exists and is not empty. "
              f"init_project.py never writes into a directory it does not own.")
        return 1

    for d in NOTE_DIRS + OTHER_DIRS:
        os.makedirs(os.path.join(root, d), exist_ok=True)

    # --- kg-config.json: the project's own vocabulary -----------------------
    angle_map = {a: "" for a in angles} if isinstance(angles, list) else dict(angles or {})
    cfg = {
        "_comment": "Project vocabulary. `angles` keys are the tags used on concept "
                    "notes; their values are the one-line blurbs that appear in map.md "
                    "and drive the graph-view colour groups. `domain_predicates` extends "
                    "the core registry in the skill's assets/predicates.json. After "
                    "editing either, re-run scripts/init_project.py config .",
        "title": title,
        "created": date.today().isoformat(),
        "angles": angle_map,
        "domain_predicates": domain_predicates or [],
    }
    write_json(os.path.join(root, "kg-config.json"), cfg)

    # --- the compiler and the vault UX --------------------------------------
    n_kg = copy_tree(os.path.join(SKILL_ROOT, "scripts", "kg"),
                     os.path.join(root, "scripts", "kg"))
    n_bases = copy_tree(os.path.join(ASSETS, "bases"), os.path.join(root, "bases"))
    n_tpl = copy_tree(os.path.join(ASSETS, "templates"), os.path.join(root, "templates"))

    # concept.md's angle picker is project vocabulary, not skill vocabulary.
    concept = os.path.join(root, "templates", "concept.md")
    with open(concept, encoding="utf-8") as fh:
        body = fh.read()
    body = body.replace("__ANGLES__", json.dumps(list(angle_map) or ["untagged"]))
    with open(concept, "w", encoding="utf-8") as fh:
        fh.write(body)

    oc = os.path.join(ASSETS, "obsidian-config")
    for name in ("app.json", "appearance.json", "community-plugins.json", "core-plugins.json"):
        shutil.copy2(os.path.join(oc, name), os.path.join(root, ".obsidian", name))
    for plug in ("quickadd", "templater-obsidian"):
        shutil.copy2(os.path.join(oc, "plugins", plug, "data.json"),
                     os.path.join(root, ".obsidian", "plugins", plug, "data.json"))

    # types.json / graph.json / breadcrumbs are GENERATED, never copied.
    cmd_config(root, quiet=True)

    write_json(os.path.join(root, ".mcp.json"), MCP_JSON)
    with open(os.path.join(root, ".gitignore"), "w", encoding="utf-8") as fh:
        fh.write(GITIGNORE)

    shutil.copy2(os.path.join(SKILL_ROOT, "scripts", "rebuild.sh"),
                 os.path.join(root, "scripts", "rebuild.sh"))
    try:
        os.chmod(os.path.join(root, "scripts", "rebuild.sh"), 0o755)
    except OSError:
        pass

    # --- starter markdown ----------------------------------------------------
    with open(os.path.join(root, "notes", "_meta", "schema.md"), "w", encoding="utf-8") as fh:
        fh.write(schema_reference(predicate_set(root)))
    # index.md and README.md land as templates with {{PLACEHOLDERS}} intact —
    # Phase 5 fills them once the real counts and "start here" notes exist.
    for tpl, dest in (("index.template.md", "index.md"),
                      ("project-readme.template.md", "README.md")):
        with open(os.path.join(ASSETS, tpl), encoding="utf-8") as fh:
            body = fh.read().replace("{{PROJECT_TITLE}}", title)
        with open(os.path.join(root, dest), "w", encoding="utf-8") as fh:
            fh.write(body)

    with open(os.path.join(root, "project-log.md"), "w", encoding="utf-8") as fh:
        fh.write(f"# Project log\n\n## {date.today().isoformat()} — scaffolded\n\n"
                 f"Created by research-partner. Angles: "
                 f"{', '.join(angle_map) or '(none yet)'}.\n")

    # gaps-report.md must exist from the start: index.md embeds it, and a missing
    # embed target is a dead link that fails `kg doctor` (hardening-ledger R4).
    with open(os.path.join(root, "gaps-report.md"), "w", encoding="utf-8") as fh:
        fh.write("# Gaps report\n\n_Not generated yet — run `python3 -m scripts.kg gaps`._\n")

    print(f"scaffolded {root}")
    print(f"  {n_kg} compiler modules, {n_bases} bases, {n_tpl} templates")
    print(f"  angles: {', '.join(angle_map) or '(none yet)'}")
    print(f"  next: seed notes/, then `cd {root} && bash scripts/rebuild.sh`")
    return 0


def schema_reference(preds):
    """notes/_meta/schema.md — the in-vault contract. Excluded from the graph by
    parse.py's _meta rule, so it documents without polluting."""
    lines = ["# Schema reference", "",
             "Generated by `scripts/init_project.py`. This file lives under `notes/_meta/`,",
             "which the compiler excludes from the graph — it is documentation, not a node.",
             "", "## Predicates", "",
             "| Property | Inverse | Breadcrumbs group | Meaning |",
             "|---|---|---|---|"]
    for p in preds:
        lines.append(f"| `{p['label']}` | "
                     f"{('`' + p['inverse'] + '`') if p.get('inverse') else '_symmetric_'} | "
                     f"{p.get('bucket', '')} | {p.get('description', '')} |")
    lines += ["", "Every relation property is a **list of wikilinks**:", "",
              "```yaml", 'about: ["[[bretton-woods-agreement|Bretton Woods Agreement]]"]',
              "```", "",
              "Always `[[file-stem|Display Text]]`. Never a bare display name, never a",
              "`:` inside the link target — Obsidian validates the target as a filename",
              "before it ever consults aliases, and `:` is illegal in filenames.", ""]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# verify
# --------------------------------------------------------------------------- #

def cmd_verify(root):
    """Structural check of the scaffold. `kg doctor` checks the CONTENT; this
    checks that the scaffold itself is intact and internally consistent."""
    problems = []
    for d in NOTE_DIRS + OTHER_DIRS:
        if not os.path.isdir(os.path.join(root, d)):
            problems.append(f"missing directory: {d}")
    for f in ("kg-config.json", ".mcp.json", ".gitignore",
              ".obsidian/types.json", ".obsidian/graph.json",
              ".obsidian/plugins/breadcrumbs/data.json",
              "scripts/kg/build.py", "scripts/kg/doctor.py"):
        if not os.path.exists(os.path.join(root, f)):
            problems.append(f"missing file: {f}")

    if not problems:
        preds = predicate_set(root)
        labels = set(all_labels(preds))
        with open(os.path.join(root, ".obsidian", "types.json"), encoding="utf-8") as fh:
            typed = set(json.load(fh)["types"])
        with open(os.path.join(root, ".obsidian", "plugins", "breadcrumbs",
                               "data.json"), encoding="utf-8") as fh:
            bc = json.load(fh)
        bc_fields = {f["label"] for f in bc["edge_fields"]}
        grouped = {f for g in bc["edge_field_groups"] for f in g["fields"]}

        for missing in sorted(labels - typed):
            problems.append(f"predicate '{missing}' not typed in .obsidian/types.json")
        for missing in sorted(labels - bc_fields):
            problems.append(f"predicate '{missing}' missing from Breadcrumbs edge_fields")
        # The bug this check exists for.
        for missing in sorted(labels - grouped):
            problems.append(f"predicate '{missing}' is in edge_fields but in NO field group "
                            f"— Breadcrumbs will render it as 'No outgoing edges'")
        groups = {g["label"] for g in bc["edge_field_groups"]}
        for needed in ("ups", "downs", "sames", "nexts", "prevs"):
            if needed not in groups:
                problems.append(f"Breadcrumbs field group '{needed}' missing")
        trail = bc.get("views", {}).get("page", {}).get("trail", {}).get("field_group_labels", [])
        if not set(trail) & groups:
            problems.append(f"trail.field_group_labels {trail} names no real field group "
                            f"— the Breadcrumbs trail will silently render nothing")

    if problems:
        print(f"FAIL — {len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("PASS — scaffold intact, predicate registry consistent across "
          "types.json / Breadcrumbs fields / Breadcrumbs groups")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init")
    p_init.add_argument("root")
    p_init.add_argument("--title", required=True)
    p_init.add_argument("--angles", default="",
                        help="comma-separated tag slugs for the research angles")
    p_init.add_argument("--domain-predicates", default="",
                        help="JSON list of extra predicate registry entries")

    p_cfg = sub.add_parser("config")
    p_cfg.add_argument("root")

    p_ver = sub.add_parser("verify")
    p_ver.add_argument("root")

    args = ap.parse_args()
    if args.cmd == "init":
        angles = [a.strip() for a in args.angles.split(",") if a.strip()]
        dom = json.loads(args.domain_predicates) if args.domain_predicates else []
        return cmd_init(args.root, args.title, angles, dom)
    if args.cmd == "config":
        return cmd_config(args.root)
    return cmd_verify(args.root)


if __name__ == "__main__":
    sys.exit(main())
