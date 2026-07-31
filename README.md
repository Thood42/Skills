# Claude Skills Workspace

Development workspace for custom Claude Skills that generate **self-contained HTML
presentations** — one `.html` file, opens offline in any browser, no install.

## Structure

```
Skills/
├── Slides/                         base skill: data-driven HTML deck generator (present only)
├── slide-forge/                    advanced skill: same engine + an in-deck EDITOR  ← active
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
└── CLAUDE.md                       working notes for Claude sessions — source of truth
```

`slide-forge` v3: layouts render node trees with authored identity (`data-el`/`data-bind`/
`data-arr`), giving deterministic text write-back, overrides that survive list edits, true
width/height resize with text reflow, and targeted per-slide re-render. See `CLAUDE.md` and
`slides-editor-plan.md` §10.
