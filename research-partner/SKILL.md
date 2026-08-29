---
name: research-partner
description: Bootstrap a scoped research project into a persistent, queryable knowledge vault, and keep it alive afterwards. Trigger whenever the user wants to start a new research or learning project, build a knowledge base on a topic, or organize notes around a specific inquiry — phrases like "I want to research X", "help me build a knowledge base about Y", "start a research project on Z", "help me learn about", or "set up an Obsidian project for". Also triggers on "migrate my research vault" / "upgrade my old research project" for vaults built on the older flat-JSON layout. The skill probes the notes target and Obsidian plugin stack, runs a scoping interview that first negotiates its own length, dispatches parallel research subagents that write atomic markdown notes (the only source of truth), compiles those notes into a SQLite knowledge graph with hybrid lexical+vector+graph retrieval exposed over MCP, and emits an AGENTS.md so future sessions resume by cd'ing there. Do NOT trigger for one-off factual questions, quick web lookups, or continuing a project that already has an AGENTS.md.
---

# Research Partner

Bootstrap a scoped research project into a durable, resumable, **queryable** knowledge vault — and keep it alive after session one.

A single bootstrap run produces:
- a vault of atomic markdown notes carrying typed relations in frontmatter,
- a compiled graph (`.kg/graph.sqlite` + JSON views) with hybrid retrieval over it,
- an Obsidian vault that opens and works with **no manual configuration**,
- graph tools served over MCP, so a fresh `cd project && claude` has them automatically,
- an `AGENTS.md` that makes every later session resumable.

---

## Architecture, in one paragraph

**Notes are the only source of truth.** `.kg/graph.sqlite`, every `.kg/*.json` view, the generated entity/source hubs, community notes and `map.md` are all build products of `kg build` / `kg generate` — regenerable, gitignorable, never hand-edited. Typed relations live directly in each note's frontmatter as list-of-link properties, so Obsidian's own graph view follows them and Breadcrumbs renders them as trail/matrix panels — no separate relation store to keep in sync. Retrieval is real hybrid search (`kg context`: BM25 + vectors + graph expansion + community lift), not grep, and it is served over MCP so a fresh session gets graph tools automatically. `kg doctor` resolves every link **exactly the way Obsidian does** — recursive filenames plus frontmatter aliases, illegal filename characters rejected before alias lookup — and must end PASS before any phase is considered done. Bootstrap does not end the project: Phases 6 and 7 are the growth loop and maintenance pass that keep the vault current after session one.

**Read `references/hardening-ledger.md` before you write a single note.** It is the set of hard invariants this design depends on, each with the rule that enforces it and why the rule exists. Most of them are easy to violate silently and only become visible once a human opens the vault.

---

## When to use

**Use this skill when the user says something like:**
- "I want to start a research project on the history of monetary policy"
- "Help me build a knowledge base about protein folding"
- "Set up an Obsidian project on X"
- "I want to get serious about learning Y — help me structure it"
- "Migrate my old research vault to the new format" → jump straight to **Phase 0**, for vaults on the older flat-JSON layout

**Do NOT use this skill for:**
- One-off factual questions ("what year did Bretton Woods collapse?")
- Quick web lookups
- Continuing a project that already has an `AGENTS.md` — tell the user to `cd` into the project and start a fresh session; the AGENTS.md loads automatically. (If they want you to continue *from here*, read that AGENTS.md and follow its resume instructions — do not re-run this skill.)
- Ad-hoc note-taking

---

## The seven phases

| # | Phase | Job |
|---|---|---|
| 0 | Migration | Only for vaults on the older flat-JSON layout. `kg migrate`. |
| 1 | Environment + stack probe | Where the notes live, and what Obsidian can render. |
| 2 | Interview shape negotiation, then scoping | What are they actually researching? |
| 3 | Scope lock-in + question seeding | Mirror it back; turn open threads into `question` notes. |
| 4 | Baseline build | Parallel subagents write notes. Compile, verify, cluster. |
| 5 | Emission | AGENTS.md, dashboard, config, MCP wiring. |
| 6 | Growth loop | Second session onward: gaps and questions drive dispatch. |
| 7 | Maintenance | Review queue, contradictions, stale notes, digests. |

Phases 1–5 are the bootstrap. 6 and 7 are what a resumed session does. Do not skip or merge phases without cause. **The user's time in the interview is expensive; subagent research is cheap.** Spend accordingly.

---

## Phase 0 — Migration (older flat-JSON vaults only)

If the user points at a project that has root-level `entities.json` / `relations.json` / `sources.json` and no `kg-config.json`, it predates the graph-native layout. Do not rebuild it by hand.

```bash
cd <vault>
python3 -m scripts.kg migrate              # dry run — ALWAYS look at this first
python3 -m scripts.kg migrate --apply
bash scripts/rebuild.sh                    # build → generate → doctor
```

Before `--apply`: the working tree must be clean if it is git-tracked, and you say so. Migration is idempotent, but "idempotent" is not "reversible" and the user should be able to `git diff` it.

Migration lifts every JSON triple onto the subject note's frontmatter. A triple whose subject is not actually the note it was attached to cannot be lifted faithfully — those go to `.kg/legacy/orphan-relations.json`, still compiled, never silently dropped. **Report the orphan count to the user.** It is a real finding about their old data, not noise.

Afterwards, reconcile counts out loud: entities in, entities out, relations in, relations lifted + orphaned. Numbers that do not add up mean data loss, and you should stop rather than proceed.

---

## Phase 1 — Environment and plugin-stack probe

Decide *where* notes live before asking a single research question. This sets the write path for everything after.

**1a — Notes target.** Follow the decision tree in `references/environment-detection.md`. In short: Obsidian MCP tools → `$OBSIDIAN_VAULT` → other notes-system MCP → ask. Always echo the resolved absolute path and get confirmation before writing. A stray write into someone's real vault is unrecoverable trust-wise.

**1b — Plugin-stack probe.** This is what makes Phase 5's config assets worth shipping. Read `references/plugin-stack.md`. Check `.obsidian/community-plugins.json` (or hit the Local REST API's `/commands/`) for:

- **Required:** Breadcrumbs, Templater, QuickAdd
- **Write channel (optional):** Local REST API — lets you write into an *open* vault and open the note you just wrote in the user's UI
- **Recommended:** Smart Connections, Linter, Zotero Integration (academic tier)

Report the gap explicitly and say what each missing plugin disables. Do not degrade silently. The vault still works without them: `kg` reads markdown and needs no plugin at all.

Also check the Obsidian version. Bases needs **1.10+**; Breadcrumbs' current line needs **1.13+**.

**1c — Scaffold.**

```bash
python3 scripts/init_project.py init <project-root> \
  --title "<Project Title>" \
  --angles "<angle-slug>,<angle-slug>,..."           # filled in after Phase 3
python3 scripts/init_project.py verify <project-root>
```

`init_project.py` refuses to write into a non-empty directory. Angles can be left empty here and filled in after Phase 3 by editing `kg-config.json` and re-running `init_project.py config <root>`.

---

## Phase 2 — Interview shape negotiation, then scoping

**2a — Negotiate the interview's shape first.** One exchange, not a nested interview:

> "Before I dig in — how do you want to shape the interview? I can:
> (a) ask a fixed short set of 5 questions, then start researching
> (b) keep going until the scope is well-defined (usually 8–12 questions, with a mid-check where I summarize so you can course-correct)
> (c) skip most of it and go with just a title — I'll make reasonable assumptions you can correct later
>
> Which suits you?"

Wait for an answer. Do not proceed until they pick.

**2b — Scoping questions.** Draw from `references/interview-guide.md`. Ask one at a time or in tight clusters of 2–3; never a wall. Summarize every 3–4 questions.

One question in the bank matters more than it looks: **the sourcing tier.** "Does this need academic-grade sourcing — citekeys, page-level provenance, a credibility bar — or is a good open-web standard fine?" The answer decides whether Zotero Integration goes in the stack and whether `credibility` becomes a required property on `source` notes.

---

## Phase 3 — Scope lock-in and question seeding

Produce a **Scope Summary**:

```
## Scope
- Title: <short project title>
- Question: <the one sentence the project is trying to answer>
- Audience: <who this is for>
- Depth vs. breadth: <one line>
- Time horizon: <one line>
- Sources: <kinds of sources, quality bar, academic tier yes/no>
- In scope: <3–7 bullets>
- Out of scope: <3–7 bullets>
- Success looks like: <one sentence>
```

Then propose two things the scope implies:

1. **Research angles** (3–6). These become tag slugs, graph-view colour groups, and the top-level structure of `map.md`. Write them into `kg-config.json`'s `angles` with a one-line blurb each.
2. **Domain predicates** (0–6). Beyond the core vocabulary, does this topic need its own relations? A legal project might want `overrules` / `overruled-by`; a biology project `expressed-in`. Write them into `kg-config.json`'s `domain_predicates`, then `init_project.py config <root>` — that single command regenerates Obsidian's property types, Breadcrumbs' edge fields *and* their field-group assignments together, which is the only reason they cannot drift apart.

Present the scope and ask: **"Ready to build the baseline knowledge graph? Reply 'go' or tell me what to adjust."**

Wait for an explicit go. "Sure I guess" is a yellow flag — ask a clarifier before spending subagent budget.

**Then seed `question` notes.** Every open thread in the scope becomes a real note in `notes/questions/` with `status: open` and a `priority`. This matters: Phase 4's angles are derived from these questions rather than from a fixed list, and Phase 6 has a work queue to pull from instead of prose bullets nobody acts on.

---

## Phase 4 — Baseline build

The main session **dispatches and consolidates**. It does not do the research and does not try to hold subagent output in working memory.

**Default configuration:**
- One subagent per angle (typically 3–6), in parallel via a single message with multiple `Task` calls
- Each scope-boxed to ~3–5 authoritative sources
- Total: ~15–25 sources, ~30–60 atomic notes

If the environment cannot run parallel `Task` calls, run them sequentially. Same output, serialized.

**Subagents write notes only.** No JSON. Every structural fact goes in frontmatter. See `references/subagent-dispatch.md` for the brief template — it must carry the scope verbatim, the angle, the frontmatter contract, the relevant template, and the four link laws below.

### The four link laws — put these in every subagent brief

These are not style preferences. Violating any of them silently produces an unresolvable link.

1. **Every link is `[[file-stem|Display Text]]`.** Target is a real filename. Never a bare display name, never a target that does not exist as a file.
2. **Never put `:` (or `* " \ / < > | ?`) in a link target.** Obsidian validates the target as a candidate filename *before* it consults aliases, and those characters are illegal in filenames. A citation written `[[Source: conway-2015]]` can never resolve, and no alias can rescue it. Write `[[conway-2015|Source: conway-2015]]`.
3. **Never rely on aliases for resolution.** Aliases are a fallback path that fails on illegal characters and races the metadata cache. Keep them in frontmatter for search and autocomplete; never point a link at one.
4. **Never let a link wrap across a line break.** Markdown line-wrapping inside `[[...]]` silently breaks it. Keep each wikilink on one line, however long.

### After subagents return — the hard gate

```bash
python3 -m scripts.kg build       # notes → .kg/*.json + graph.sqlite
python3 -m scripts.kg generate    # graph → notes/entities/*.md, notes/sources/*.md, map.md
python3 -m scripts.kg doctor      # link resolution + invariants + readiness
```

**`kg doctor` must end PASS before you move to Phase 5.** Not "mostly passing", not "one known issue". If a subagent's notes fail it, fix them or send that subagent's work back and re-dispatch — do not absorb the drift. Every link-level disaster in this skill's history got through because something reported green.

Then:

```bash
python3 -m scripts.kg embed                    # optional but do it if a backend is reachable
python3 -m scripts.kg communities --write      # cluster summaries — the global-search layer
python3 -m scripts.kg gaps                     # writes gaps-report.md
```

Deduplication is **not** a manual chore — it is a merge rule in the compiler (slug normalization + alias table). What you do by hand is review the fuzzy-match report once and approve it.

Community summaries are written by *you*, from actually reading each cluster's member list, inside the `<!-- ANALYST SUMMARY -->` markers so rebuilds preserve them. A generated stub with no analysis in it is worse than no community note.

---

## Phase 5 — Emission

Write `<project-root>/AGENTS.md` from `assets/AGENTS.md.template`. This is what makes the project resumable; treat it as mandatory, not a nicety.

It must carry: the scope summary verbatim; the vault layout and naming conventions; the **predicate table** (generated — do not retype it); the four link laws; the `kg` command surface; how to add a finding; the open `question` notes; the date started and last updated; and a one-line resume instruction.

Also emit or confirm:
- `index.md` — the dashboard, as live Base embeds (open questions, contested ground, inbox, gaps, review queue)
- `bases/*.base` — seven views
- `.obsidian/` — generated config (types, graph colours, Breadcrumbs, Templater, QuickAdd)
- `.mcp.json` — so a fresh session in this directory gets graph tools
- `README.md` — human landing page
- `project-log.md` — append this session

Offer, don't impose: a git commit if the vault is tracked, and a weekly digest scheduled task (Phase 7).

**Hand back** with: where it lives, counts (notes / entities / relations / sources / questions), the biggest gaps, anything `doctor` flagged as degraded, and how to resume.

---

## Phase 6 — Growth loop (second session onward)

This is what a resumed session does, and it is why `question` notes exist.

1. `kg gaps` and `bases/questions.base#Open` → pick the work.
2. Choose a question or gap. Dispatch a scope-boxed subagent for it, using the same brief template and the same four link laws.
3. `kg build && kg generate && kg doctor` — PASS or fix.
4. Update the question note: `status: researching` → `answered`, with `answered-by` pointing at what closed it.
5. Re-run `kg communities --write` if membership moved materially; append to `project-log.md`.

A resumed session should never make the user restate scope. If you find yourself asking what the project is about, you skipped reading `AGENTS.md`.

---

## Phase 7 — Maintenance

Read `references/maintenance.md`. The recurring jobs:

- **Review queue** — `bases/review.base` (`status: stale` or `review-after <= today`).
- **Inbox triage** — `bases/inbox.base` lists every `status: seed` note. Ingested and agent-seeded claims are candidates, not evidence; promote or reject them deliberately.
- **Contradiction triage** — `kg contradictions` gives explicit `contradicts` edges plus latent tension candidates. Latent candidates are a *similarity heuristic*, not detected disagreement. Say so when you surface them.
- **Community regeneration** — when membership shifts materially, rewrite the affected summaries. Do not let a stale summary describe a cluster that has moved.
- **Suggested links** — Adamic–Adar candidates in `gaps-report.md`. Surfaced for human judgment, **never auto-applied**.
- **Ingestion** — `kg ingest <path|url>` lands `source` + candidate `claim` notes at `status: seed`, into the Inbox.

---

## The `kg` command surface

```
kg migrate  [--apply]        legacy flat-JSON layout → graph-native layout (dry-run by default)
kg build    [--dry-run]      notes/ → .kg/*.json + graph.sqlite  (incremental, ~1s at 250 notes)
kg generate [--dry-run]      graph → entity/source hub notes + map.md
kg doctor                    link resolution + invariants + plugin/retrieval/analytics readiness
kg embed    [--all]          embed changed notes (LM Studio → fastembed → none)
kg search   "<q>" [--k 12] [--type claim] [--hops 1]
kg neighbors <note> [--predicate supports] [--depth 2]
kg path      <a> <b> [--max-hops 4]
kg subgraph  <note> [--depth 2] [--format md|mermaid|canvas]
kg context   "<q>" [--budget 8000]     ← the retrieval pack an agent should consume
kg eval                      measured hybrid-vs-lexical recall
kg communities [--write] [--min-size 3] [--resolution 1.0]
kg gaps                      low-degree / unsourced / low-confidence / stale + suggested links
kg contradictions            explicit contradicts edges + latent tension candidates
kg ingest    <path|url>      → source + candidate claim notes at status: seed
```

All run as `python3 -m scripts.kg <cmd>` from the vault root. Seven of them are also served over MCP via `.mcp.json`.

**Use `kg context`, not grep.** That is the entire point of the retrieval layer. Read `references/retrieval.md` for when to reach for which command.

---

## Directory layout of the emitted project

```
<project-root>/
├── AGENTS.md                  resumption artifact — read on `cd + claude`
├── README.md                  human landing page
├── index.md                   dashboard of live Base embeds
├── map.md                     GENERATED — tag-clustered index
├── gaps-report.md             GENERATED — kg gaps output
├── project-log.md             decisions and additions over time
├── kg-config.json             project vocabulary: angles + domain predicates
├── .mcp.json                  wires the graph tools for a fresh session
├── notes/                     THE ONLY SOURCE OF TRUTH
│   ├── *.md                   concept notes
│   ├── claims/  questions/    claim and question notes
│   ├── sources/  entities/    GENERATED hubs (identity fields preserved)
│   ├── communities/           GENERATED summaries (analyst text preserved)
│   └── _meta/schema.md        the contract; excluded from the graph
├── bases/*.base               seven Obsidian Bases views
├── templates/*.md             six Templater note classes
├── scripts/kg/                the compiler + retrieval + analytics
├── .obsidian/                 GENERATED config — opens as a working vault
└── .kg/                       BUILD OUTPUT — gitignored, regenerable, never hand-edited
```

---

## Anti-patterns — things this skill must not do

- **Don't trust a green checker you haven't tried to break.** Before believing `doctor`, feed it a note with a known-bad link and confirm it fails. A checker that validates the wrong thing can print "All invariants pass." on a vault full of dead links.
- **Don't hand-edit anything under `.kg/`, or the generated regions of hub and community notes.** They are build products. Edit the notes and rebuild.
- **Don't hand-maintain the predicate vocabulary in more than one place.** Edit `kg-config.json` / `assets/predicates.json`, then `init_project.py config`. Hand-kept copies is how Breadcrumbs ends up rendering "No outgoing edges" on a note that plainly has edges.
- **Don't let subagents write JSON.** Notes only. A second, hand-written source of truth drifts from the notes by construction.
- **Don't skip the scope negotiation.** A generic pass on an unfocused topic produces a graph that is simultaneously bloated and useless.
- **Don't do the research inline in the main session.** Dispatch and consolidate.
- **Don't fabricate sources.** No real citation → the claim does not go in the graph.
- **Don't overwrite the user's existing files.** Every write lands inside the project directory the skill created.
- **Don't treat AGENTS.md as optional.** Without it the project cannot be resumed and the whole value proposition collapses.
- **Don't proceed past a failing `kg doctor`.** Fix it or say plainly that you did not.
- **Don't overclaim what the analytics measure.** "Latent tension candidate" is similarity plus a shared subject. It is not detected disagreement. Say what the heuristic actually does.
- **Don't turn the interview into a nested interview.** One shape negotiation, then the questions.

---

## Fallbacks

**No parallel subagents (Claude.ai, some Cowork configurations):** run the angles sequentially. Same output.

**No web search:** say so up front; ask the user to paste source texts, PDFs or URLs; proceed with what they give you. `kg ingest` handles local PDFs.

**No embedding backend reachable:** expected, and handled. `kg embed` tries LM Studio (`127.0.0.1:1234`) then `fastembed`, and reports each failure by name. Retrieval degrades to lexical + graph expansion, which is genuinely useful — it just is not hybrid. Say which mode you are in; every `kg search` / `kg context` result already carries `"mode"`. Note that a sandboxed session is often network-isolated from the user's own localhost: the fix is one `kg embed` from a real terminal on their machine, not a code change.

**No modularity-optimized clustering available:** `kg communities` prefers networkx's own `louvain_communities` (networkx 3.0+, no extra install), then `python-louvain`, then connected components — coarser, never silent. If you see the fallback, `pip install -U networkx` is the fix.

**Obsidian not installed / user has no notes system:** the vault is plain markdown and works without it. `kg` needs no plugin. Note in AGENTS.md that it is portable into Obsidian by opening the folder as a vault.

**No delete permission on the target filesystem:** generators never delete. Superseded files move to `_to_delete/` and are reported. Tell the user that folder is theirs to empty.

---

## References

Read the file for the phase you are in. Don't preload them.

- `references/hardening-ledger.md` — **read first.** The hard invariants this design depends on, and the rule that enforces each one.
- `references/kg-schema.md` — note types, the frontmatter contract, predicates, link laws
- `references/environment-detection.md` — Phase 1 decision tree
- `references/plugin-stack.md` — required / recommended / deliberately excluded, with dates
- `references/interview-guide.md` — Phase 2 question bank
- `references/subagent-dispatch.md` — brief template, angle derivation, consolidation checklist
- `references/retrieval.md` — what `kg context` does and when to call which command
- `references/maintenance.md` — Phases 6 and 7 playbook

## Scripts

- `scripts/init_project.py` — `init` scaffolds a project; `config` regenerates Obsidian config from the predicate registry; `verify` structurally checks the scaffold. Never mkdir a project by hand.
- `scripts/kg/` — the compiler, retrieval and analytics package, copied into each project.
- `scripts/rebuild.sh` — `build → generate → doctor`, in that order, copied into each project.
