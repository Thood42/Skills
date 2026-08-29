# Claude Skills Workspace

Development workspace for custom Claude Skills. Two skills live here today:
**slide-forge**, which generates self-contained HTML presentations, and
**research-partner**, which bootstraps Obsidian-based research vaults with a
queryable knowledge graph.

## Structure

```
Skills/
├── slide-forge/                    HTML deck generator + in-deck EDITOR  ← active
│   ├── SKILL.md                    authoring workflow (copy template, replace deck-data JSON)
│   ├── editor-template.html        the deliverable: deck + editor in one file (BUILT — edit src/)
│   ├── src/                        engine/editor source; scripts/build.py assembles the template
│   ├── scripts/                    build.py · validate.py · assets.py · deckdata.py
│   ├── references/                 layouts · themes · charts · audiences · templates · editor
│   ├── templates/                  curated template packs (apply with deckdata.py)
│   └── tests/                      jsdom parity + editor data-layer tests (needs Node)
├── slides-editor-plan.md           architecture & decision record (§10 = v3 ADR)
├── slide-forge-design-critique.md  2026-07-06 design review that motivated the v3 engine
├── slide-forge-media-plan.md       plan: images/diagrams, links, sandboxed iframe embeds
├── slide-forge-editor-ux-plan.md   design handoff behind the v4 editor UX overhaul
├── research-partner/               Obsidian research-vault bootstrapper + knowledge graph
│   ├── SKILL.md                    seven-phase workflow: probe → interview → build → emit → grow
│   ├── scripts/                    init_project.py · scripts/kg/ (compiler, retrieval, MCP server)
│   ├── references/                 kg-schema · retrieval · interview-guide · hardening-ledger · …
│   └── assets/                     note/base templates, Obsidian config, AGENTS.md template
└── CLAUDE.md                       working notes for Claude sessions — source of truth
```

`slide-forge` v3: layouts render node trees with authored identity (`data-el`/`data-bind`/
`data-arr`), giving deterministic text write-back, overrides that survive list edits, true
width/height resize with text reflow, and targeted per-slide re-render. See `CLAUDE.md` and
`slides-editor-plan.md` §10.

`slide-forge` v4 (editor UX): the sidebar is an "On this slide" list of plain-language element
names instead of a node tree, the inspector is contextual, the stage zooms and can focus-follow
the selection, and ⊞ Insert drops any element from any layout onto a slide. Additive — present
mode and the data model are unchanged. See `slide-forge-editor-ux-plan.md` and
`slide-forge/references/editor.md`.
