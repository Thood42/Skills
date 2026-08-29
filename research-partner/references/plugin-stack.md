# Plugin stack

What this skill assumes Obsidian can do, what it degrades to, and what it deliberately refuses to depend on.

**Last verified: 2026-08-29**, against a real vault on Obsidian 1.13 with Breadcrumbs 4.21.11, QuickAdd 2.23.0 and Templater 2.25.0 installed and enabled. Re-evaluate when Obsidian's Bases syntax changes, or when any required plugin goes twelve months without a release.

**The governing rule: declare a stack, then degrade loudly.** No plugin is needed for the vault to be *correct* — `kg` reads markdown and needs nothing installed. Plugins are what make the modelling visible to the human. When one is missing, `kg doctor` names it and names the feature it disables. Silent feature loss is not acceptable.

---

## Obsidian core — no install needed

| Capability | Needs | Used for |
|---|---|---|
| **Properties** (typed frontmatter) | 1.4+ | The entire schema. Types are what make Bases and Breadcrumbs work at all. |
| **Bases** | 1.9+; `list` and `map` views added in 1.10 | Every dashboard view. Replaces every Dataview query this skill would otherwise need. |
| **Canvas** | core | Cluster and argument maps, exported per community. |
| **Graph view** with colour groups | core | Type- and angle-coloured global graph, configured in `.obsidian/graph.json`. |
| **Web Clipper** (browser extension) | current | Human-side source capture into the same schema. |

**Minimum Obsidian version: 1.10** for Bases, **1.13** if Breadcrumbs is installed (its current release line requires it). `kg doctor` section 3 checks this — and notes honestly that the version is not recorded inside the vault, so it cannot always verify it for you.

### The Bases trap

`groupBy` must carry **both** `property` and `direction`. Omitting `direction` does not degrade that one view — it invalidates the **entire `.base` file**, so sibling views with no `groupBy` at all break as collateral damage. This cost a full round of "why is every dashboard embed erroring". See `hardening-ledger.md` C1.

---

## Required community plugins

Required in the sense that Phase 5's shipped config assumes them. Everything still compiles without them.

### Breadcrumbs — fixes the invisible-structure problem

Reads typed frontmatter links, derives implied relations from declared inverses, and renders trail / matrix / tree views plus Mermaid blocks and Canvas export. This is what turns the typed relations from an agent-only layer into navigable UI for the human.

**The trap, twice over:**
- Matrix, Trail and Prev/Next read **only** the `ups` / `downs` / `sames` / `nexts` / `prevs` field *groups*. A predicate declared in `edge_fields` but assigned to no group renders as "No outgoing edges" on a note that plainly has that edge.
- A view's `field_group_labels` must name a **group**, not a field. Pointing the trail at `"part-of"` (a field) makes it render nothing, silently.

Both are prevented by generating the config: `assets/predicates.json` → `init_project.py config` → `types.json` + `edge_fields` + `edge_field_groups` together, with `init_project.py verify` failing if any predicate is ungrouped or any view names a non-existent group.

### Templater — deterministic note creation

One template per note class in `templates/`, wired through `folder_templates` so creating a file in `notes/claims/` gets the claim shape automatically. Agent and human emit byte-identical frontmatter, which is what stops schema drift at the source rather than repairing it in the compiler.

Note: `trigger_on_file_creation_mode: "folder"` is the current-schema equivalent of the older `enable_folder_templates` boolean. If you inherit a vault seeded with the boolean, it still works — Templater migrates it.

### QuickAdd — human-side capture

Capture macros for new claim / new question / log a source / log a measurement. Makes the vault pleasant to contribute to without an agent in the loop, which is the difference between a vault the user maintains and one they only ever read.

---

## Optional: Local REST API — the live write channel

Not required, and nothing in the read path depends on it. What it buys:

- Write into an **open** vault and have the user watch notes appear
- Open the note you just wrote in their UI
- Reach a local vault from a remote or cloud session
- Ships its own MCP server at `https://127.0.0.1:27124/mcp/` (Streamable HTTP, bearer-token auth)

Setup is manual and worth saying out loud: install, enable, generate a key, and either trust the certificate or enable "Serve on Local Network" plus insecure HTTP for the plain-HTTP port (27123). The key goes in a gitignored file — the shipped `.gitignore` already excludes `*-api-key.txt`.

**When the vault is closed, write to the filesystem. When it is open and this plugin is available, write through it. Never both in one session.**

---

## Recommended, individually skippable

| Plugin | Buys | Caveat |
|---|---|---|
| **Smart Connections** | Local offline embedding index + Connections/Lookup views, so the *human* gets a semantic layer of their own | Its Bases-function integration (`score_connection`, `list_connections`) is a paid tier — verify before relying on it. Overlapping with `kg embed` is fine; different consumers. |
| **Linter** | Enforces frontmatter key order, date formats and YAML hygiene on save | Keeps notes machine-friendly after a human edits them. Genuinely reduces parse errors. |
| **Zotero Integration** | Citations, bibliographies and PDF annotations from Zotero; the citekey becomes the canonical `source_id` | Only for the academic sourcing tier. If the user says yes in Phase 2, wire it from the start — retrofitting hand-rolled source notes to Zotero is painful. |
| **Excalidraw** | Hand-drawn argument maps; prerequisite for ExcaliBrain | |
| **ExcaliBrain** | Local typed-graph navigator (parents/children/friends/siblings) | Requires **Dataview + Excalidraw**. The one place this skill still touches Dataview. Opt-in tier; Breadcrumbs covers the core need. |
| **Note Toolbar** / **Homepage** | Dashboard entry point and per-note-type action bars | Pure polish. |

---

## Deliberately not depended on

**Graph Analysis.** Its co-citation, link-prediction and community-detection ideas are exactly right, and its last release is roughly four years old with no recent commits. **This skill implements those algorithms itself** in `analytics.py` and writes the results back as notes — a dependency-free feature that can be regression-tested.

**Dataview** as a core dependency. Stagnant upstream; Bases covers the querying. Retained only as a transitive dependency of ExcaliBrain for users who want that tier.

**Datacore.** Promising — React views, WYSIWYG tables — but still 0.1.x. Revisit at 1.0.

**Leiden via `leidenalg`.** The spec suggested Leiden; `analytics.py` uses Louvain instead, to avoid a compiled C-extension dependency that fails to install in ways that are tedious to diagnose on a user's machine. Both optimize modularity; Leiden's extra guarantee matters most on large or adversarial graphs, not on a few hundred notes.

**`python-louvain`.** The obvious Louvain package, deliberately not depended on. It fails to build against modern setuptools (`AttributeError: install_layout`), and **networkx 3.0+ ships `louvain_communities` in core** — same algorithm, an explicit `seed` parameter for determinism, no extra install. `analytics.py` prefers networkx-native, falls back to `python-louvain` if it happens to be present, and falls back again to connected components. Listing an optional dependency that reliably fails to install just invites users into a broken install for no gain.

---

## The probe (Phase 1b)

Read `.obsidian/community-plugins.json` for the enabled list, or hit the Local REST API's `/commands/` if it is running. Then report the gap plainly:

> "Breadcrumbs isn't installed — without it the typed relations still compile and `kg` still queries them, but you won't see the trail or matrix panels in Obsidian, so the structure stays agent-only. Want me to seed the config anyway so it works the moment you install it?"

Seeding config for a plugin that is not yet installed is correct and safe — the generated `types.json`, `edge_fields` and `edge_field_groups` all validate against the real plugin schemas once installed. Just say that is what you are doing.

`kg doctor` section 3 does this check on every run, so the gap stays visible rather than being a Phase 1 note nobody re-reads.
