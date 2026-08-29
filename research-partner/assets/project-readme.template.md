# {{PROJECT_TITLE}}

A research vault built with the `research-partner` skill.

**Project question:** {{PROJECT_QUESTION}}

## What's here

- `index.md` — the dashboard. Start here.
- `map.md` — every note, clustered by research angle. Generated.
- `notes/` — atomic notes, one idea per file. **The only source of truth.**
- `bases/` — Obsidian Bases views behind the dashboard
- `gaps-report.md` — what's thin, what's unsourced, what to connect next. Generated.
- `project-log.md` — decisions and additions over time
- `AGENTS.md` — instructions for a Claude session resuming this project
- `scripts/kg/` — the compiler that turns the notes into a queryable graph
- `.kg/` — build output. Regenerable, gitignored, safe to delete.

## Reading it as a human

Open this directory in Obsidian and start at `index.md`. Every `[[double-bracketed]]` reference is clickable, the graph view is colour-coded by note type and research angle, and the Breadcrumbs panel on each note shows its typed relations.

It also works in any wikilink-aware markdown editor — you just lose the dashboards.

## Continuing it with Claude

`cd` into this directory and start a Claude session. `AGENTS.md` loads automatically, and `.mcp.json` gives the session graph tools (search, context, neighbours, paths, gaps, contradictions) with no setup.

## Keeping it healthy

```bash
bash scripts/rebuild.sh      # build → generate → doctor, after any note change
```

`kg doctor` must end **PASS**. It resolves every link the way Obsidian does, so a PASS means every link in the vault is actually clickable — which is not something a green check can be assumed to mean. See `AGENTS.md` for the full command surface.
