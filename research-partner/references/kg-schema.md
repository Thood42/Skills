# Schema

The contract every note obeys. Subagents get this file's §1–§4 in their brief.

**The governing principle: `notes/*.md` is the only source of truth.** Everything else — `.kg/*.json`, `graph.sqlite`, entity hubs, source hubs, community notes, `map.md`, `gaps-report.md` — is a build product of `kg build` / `kg generate`, regenerable from the notes and safe to delete. Never hand-edit a build product; edit the note and rebuild.

---

## 1. The four link laws

Non-negotiable. Each one is a hard invariant — see `hardening-ledger.md` Class 1 for why.

1. **`[[file-stem|Display Text]]`, always.** The target is a real filename that exists.
2. **No `* " \ / < > : | ?` in a link target, ever.** Obsidian checks the target as a candidate filename *before* it looks at aliases, so those characters make a link permanently unresolvable and no alias can save it. Citations are `[[conway-2015-summit|Source: conway-2015-summit]]`, never `[[Source: conway-2015-summit]]`.
3. **Never rely on an alias for resolution.** Aliases are for search and autocomplete. Point links at filenames.
4. **Never let a wikilink wrap across a line break.** Keep it on one line however long.

Inside a markdown table cell, use the bare `[[handle]]` form — escaping a pipe as `\|` leaks a backslash into the parsed target.

---

## 2. Note types

Six, each with a Templater template in `templates/` and a Bases view in `bases/`.

| `note-type` | Lives in | Written by | Purpose |
|---|---|---|---|
| `concept` | `notes/*.md` | agent / human | An idea, method, theory, event, pattern. The atomic note. |
| `claim` | `notes/claims/` | agent / human | A defeasible assertion with evidence and a confidence. |
| `question` | `notes/questions/` | agent / human | An open thread. The work queue for Phase 6. |
| `source` | `notes/sources/` | **generated** | One bibliographic item. Identity fields preserved across regeneration. |
| `entity` | `notes/entities/` | **generated** | A person, org, work, place. Hub page for anything linkable without its own concept note. |
| `community` | `notes/communities/` | **generated** | A cluster summary — the global-search layer. Analyst prose preserved. |

Type is taken from the `note-type` property, falling back to the containing folder. `notes/_meta/` is excluded from the graph entirely — it is documentation, not content.

**Generated does not mean untouchable.** `generate.py` reads identity fields (`entity-type`, `aliases`, `tier`, `authors`, `url`, `year`, `created`) back out of each hub's own frontmatter before rewriting it, so a human correcting an entity's type in Obsidian keeps that correction. Only the derived body — relations, backlinks, cited-by — is rebuilt. The analyst prose in a community note is preserved inside its `<!-- ANALYST SUMMARY -->` markers.

---

## 3. The frontmatter contract

```yaml
---
note-type: claim
title: "Dollar hegemony was entrenched by design, not accident"
aliases: ["Dollar hegemony was entrenched by design"]
status: verified            # seed | draft | verified | stale | disputed   (question: open | researching | answered)
confidence: 0.75            # 0–1, agent-assigned, human-overridable
stance: supports            # claim notes: supports | refutes | qualifies
tags: [history]             # first tag is the research angle → graph colour + map.md cluster
created: 2026-08-29
updated: 2026-08-29
review-after: 2026-11-29

# --- typed relations: list-of-link, one key per predicate ---
about: ["[[bretton-woods-agreement|Bretton Woods Agreement]]"]
supports: ["[[us-monetary-dominance|US Monetary Dominance]]"]
contradicts: ["[[accidental-hegemony-thesis|Accidental Hegemony Thesis]]"]
evidence: ["[[conway-2015-summit|Source: conway-2015-summit]]"]
answers: ["[[q-was-dollar-centrality-intentional|Was dollar centrality intentional?]]"]

# --- provenance ---
asserted-by: agent          # agent | user | source
extraction-run: 2026-08-29-baseline
valid-from: 1944-07         # optional temporal validity
valid-to: 1971-08
---
```

**Relation properties must be list-of-link.** That exact shape — a YAML list whose every element is a `"[[stem|Display]]"` string — is what makes the compiler treat the key as a predicate, what Obsidian's graph view follows, and what Breadcrumbs renders. A bare string, or a list of plain names, compiles to nothing and errors nowhere.

The compiler detects predicates **generically**: any frontmatter key whose value is a non-empty list of wikilink strings is an edge list, with the key as the predicate. There is no hardcoded vocabulary, which is why domain predicates work without touching code. The exceptions are `aliases`, `tags`, `notes` and `members` — display-only lists, excluded by name (`NON_RELATION_LIST_KEYS`). **If you add a frontmatter list meant for humans to read rather than the graph to traverse, add it there**, or it will compile into phantom edges.

### Provenance is not decoration

`asserted-by`, `extraction-run` and `status` are what let a later session tell settled research from a seeded guess. An agent-written claim starts at `status: seed`, `asserted-by: agent`. It becomes `verified` when a human or a later pass confirms it — never by default, and never as a side effect of being regenerated.

---

## 4. Predicates

The core vocabulary, generated into Obsidian's property types and Breadcrumbs' config from `assets/predicates.json`. Each has a declared inverse and a Breadcrumbs field-group bucket.

**Structural** — `about` / `about-of`, `part-of` / `has-part`, `instance-of` / `has-instance`, `precedes` / `follows`
**Epistemic** — `supports` / `supported-by`, `contradicts` *(symmetric)*, `qualifies` / `qualified-by`, `evidence` / `evidence-for`, `raises` / `raised-by`, `answers` / `answered-by`
**Bibliographic** — `authored-by` / `author-of`, `published-by` / `publisher-of`, `cites` / `cited-by`

`notes/_meta/schema.md` in every emitted project carries the full generated table with buckets and descriptions.

**Write the forward direction only.** Breadcrumbs derives the inverse — write `supports` once and get `supported-by` free. Writing both creates redundant edges that survive rebuilds and inflate degree counts.

**Domain predicates** go in `kg-config.json`'s `domain_predicates`, then `python3 scripts/init_project.py config .`. That one command regenerates `.obsidian/types.json`, Breadcrumbs' `edge_fields` **and** its `edge_field_groups` together. Do not hand-edit any of the three: a predicate that lands in `edge_fields` but no group renders as "No outgoing edges" on a note that plainly has that edge, silently.

---

## 5. Measurements — quantitative claims with provenance

Optional, and worth using for any topic with numbers in it. A `## Measurements` table on a concept or claim note compiles into `.kg/measurements.json` and `bases/measurements.base`:

```markdown
## Measurements

| Predicate | Value | Source | As of | Context |
|---|---|---|---|---|
| median-revenue | $1,136 | [[conway-2015-summit]] | 2024 | first-year, all releases |
```

Bare `[[handle]]` in the Source cell — see §1. Bases queries files, not rows inside a file, so `measurements.base` lists notes *containing* measurements rather than one row per measurement. That is a Bases limitation, documented in the base file itself, not an oversight.

---

## 6. Naming

- **Note files:** kebab-case slug of the title. `bretton-woods-agreement.md`.
- **Question notes:** prefix `q-`. `q-was-dollar-centrality-intentional.md`.
- **Source notes:** the citation handle — `<author>-<year>-<shortname>`. `conway-2015-summit.md`.
- **Entity hubs:** kebab-case of the canonical name. `john-maynard-keynes.md`.
- **Community notes:** generated, content-hashed. Never rename by hand.

Slug collisions are resolved by the compiler's merge rule (normalization + alias table), not by hand. When two subagents create the same entity under different names, the merge report shows it and you approve it once.

---

## 7. Note body

150–400 words, one idea. Prose, not bullet soup. Every factual claim carries an inline citation `[[handle|Source: handle]]`. Link concepts on first mention.

A note that cannot cite a real source does not go in the graph. If a subagent cannot find a citation, it reports the gap — it does not write the note.
