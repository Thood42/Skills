# software-factory v2 — design and decision record

Status: **v2 built 2026-11-09 (`metadata.version` 2.0.0); eval runs not yet done** — branch
`claude/software-factory-v2`. The first commit on this branch imports the installed v1 `SKILL.md`
verbatim, so v2 is reviewable as a diff against what ran before.

This document began as the upgrade proposal and is kept as the decision record. §1–§7 are the
proposal as agreed, §8 records Trevor's decisions, and §10 says where the build departs from the
proposal and what has and has not been verified.

## Contents

1. What v1 is and what it gets right
2. Evidence: two real runs of v1 in this repo
3. What Dex Horthy has said since v1 was written
4. Proposed upgrades (numbered, each with the reason)
5. Proposed layout of v2
6. Compatibility: existing plan folders and the VS Code skill overlay
7. Implementation and evaluation plan
8. Decisions taken (2026-11-09)
9. Sources
10. As built: departures from the proposal, and verification

---

## 1. What v1 is and what it gets right

v1 is one 168-line `SKILL.md`: Dex Horthy's four-gate workflow (Product → Architecture →
Program Design → Vertical Slices), a fixed approval question at every gate, a `docs/plans/<slug>/`
folder with a `00-status.md` state file and one doc per gate, a resume rule, three standing rules
(compact at every boundary, keep diffs reviewable, real tests only) and an optional ADR nudge.

Things v1 gets right and that v2 must keep unchanged:

- **The four gates in that order, never merged in Full mode, no implementation code before
  Gate 4 approval.** This is the whole point and the other skill in this repo depends on it (§6).
- **The exact approval question** — "Approve Gate N, or what should change?" — and the rule that
  anything other than a clear yes means revise and re-ask.
- **Gate 1 bans tech talk**, and the "blog post before the feature" test.
- **Gate 3 as "the step everyone skips"**: files, types and signatures with no bodies, call stack,
  test plan before tests exist, least-confident decisions.
- **Slice 1 is a tracer bullet; horizontal building is banned.**
- **Files on disk are the memory.** The resume rule and "nothing important may exist only in
  chat" are what make a fresh session possible.
- **Real tests only** and the ban on weakening tests to get to green.
- The skip list (trivial tweaks, "just vibe it", throwaway code) and the single clarifying
  question when unsure.

v2 is additive on top of these. The change is in what the protocol is silent about, and in how
slices run once the plan is approved (§4, upgrades 3 and 5).

## 2. Evidence: two real runs of v1 in this repo

`docs/plans/slide-forge-composer/` (7 slices, 2026-08-15) and `docs/plans/slide-forge-motion/`
(7 slices, 2026-08-15/16) are complete v1 runs, both shipped. Reading them against the template
shows what the sessions had to invent because the skill gave it no home. Every item below is
something that appeared in those files, not a hypothetical.

| What the runs invented | Where it shows | What it tells us |
| --- | --- | --- |
| A **measured baseline** before Gate 1 — "real browser, not grep", a table of counts per layout, two defects "reproduced, not inferred" | motion `00-status.md` → Notes | The research step exists in practice but has no artifact; it was shoved into the status file. |
| **"Decisions taken by the user"** — three places the user overrode the recommendation, with the reason | motion `00-status.md` | The protocol records approvals but not disagreements, which are the decisions a fresh session most needs. |
| **Gate amendment at approval** — "approve, with this one change", folded into the doc | motion `00-status.md` → "Gate 1 amendment" | The protocol's binary yes/revise has a common third outcome: approve-with-amendment. |
| **Load-bearing bet proven before designing on it** — measured that 18/20 containers already carry `data-arr` before committing Gate 2 to that assumption | motion → "Gate 2 measurement" | Spikes that de-risk an architecture are a real step, currently invisible. |
| A **Progress log** per slice with proof details | both `00-status.md` (composer 170 lines, motion **600 lines**) | The "state file" became a journal. A fresh session now reads 600 lines to find three checkboxes. |
| **Post-ship bug hunt** rounds from real user feedback | motion `00-status.md` ×2 | Work after the last slice has no phase; it was appended to the log. |
| **Honest proof when screenshots failed** — "proof is measured values, not an image", plus a "test trap worth remembering" | both runs | "Prove it works" needs a standard for what counts, and for saying what could not be verified. |
| **Constraints carried in** — size budget, parity baseline of 7 diffs, which tool runs Node | motion → Notes | Non-negotiable environment facts belong in a fixed place, up front. |
| **Predecessor pointer** — "read composer's status first, its sizing notes are load-bearing" | motion → Notes | Features build on earlier plans; the folder needs a link field. |
| **Scope section in Gate 1** — "Capabilities (proposed scope — confirm which are in)" + "Wave-2 deliberately out (deferred, not forgotten)" | composer `01-product.md`, `04-slices.md` | Gate 1 has no scope/non-goals section, so it was improvised. |
| **Slices as paragraphs, each with "Proof:" and the Gate 3 test numbers it turns green** | composer `04-slices.md` | "One line per slice" was too thin to be useful; the Proof line and test references were the valuable part. |
| **One commit per slice, one docs commit at Gate 4 approval** | `git log -- docs/plans` | Version-control rhythm emerged on its own; the skill says nothing about it. |

Two further observations from the same files:

- The status file's **"Notes for a fresh session"** did the work of a research doc, a decision
  record, a constraints list and a predecessor link at once. Splitting those apart is most of §4.
- Both runs record **"Screenshots were unavailable this session"** and compensate with measured
  values. That is the right behaviour, and v2 should make it the stated standard rather than
  something the session has to rediscover.

## 3. What Dex Horthy has said since v1 was written

v1 encodes the four layers from Dex's 2025 talks. Three later pieces add rules worth folding in
(details and dates in §9):

- **Research → Plan → Implement with "frequent intentional compaction"** (HumanLayer, Aug 2025).
  Research is its own phase with its own artifact; the cited failure was a plan built on
  research that "did not go deep enough". Keep context utilization in the **40–60% range**,
  compact by writing a markdown artifact and starting a fresh session. Humans should focus
  review on research and plans: "a bad line of a plan could lead to hundreds of bad lines of
  code." v1 has the compaction rule but no research artifact and no utilization heuristic.
- **"Why Software Factories Fail" / comprehension debt** (Dex at AI Engineer World's Fair; Addy
  Osmani's write-up, Jul 2026). Running a fully automated loop for months with no human reading
  code ended in a painful manual debugging effort. The failure is "quiet and late". The fix is
  **back pressure**: autonomy must not exceed what can be cheaply and reliably verified, and a
  human stays in the loop where a wrong call is expensive (auth, billing, public API). Reviewing
  a 200-line plan beats reviewing 2000 lines of code. v2 takes this seriously precisely because
  it makes slices autonomous (§4, upgrade 3): the per-slice walkthrough is the back pressure.
- **Four-layer program design, restated** (Dex with David Ondrej, Aug 2026): each layer is a
  cheap artifact reviewable in minutes; make structural decisions early, "when the model is
  sharpest"; "there is no penalty for bad design" in model training, so the gates supply the
  penalty. He also scopes the full ceremony to teams of roughly five-plus engineers with paying
  users — which argues for a lighter tier for smaller work (§4, upgrade 1).

## 4. Proposed upgrades

Each one says why, so the skill can explain the reasoning to the model rather than issue a bare
rule. Upgrades 3, 5, 8 and 9 were reshaped by Trevor's decisions (§8); upgrades 11, 12 and 13
were added by them.

### Upgrade 1 — A **Lite** tier, chosen by the user, never by the agent

**Why.** v1 is binary: full four-gate ceremony or nothing. Dex himself scopes the full flow to
larger teams. Medium tasks (a 100–300 line change with a design decision in it) currently get
either too much process or none.

**What.** Keep **Full** exactly as v1. Add **Lite**: one `plan.md` holding the four gate sections
in order (Product · Architecture · Program Design · Slices), **one** approval on the whole plan,
no mockups, then slices as usual with the same proof rule. Lite follows the basics of every gate
in a less stringent manner — each section may be a few lines, but none may be skipped, because
the point of the sections is to force the decision, not to produce prose.

The tier is **offered, not decided**: when a task qualifies for the workflow the agent proposes a
tier with a one-line reason and the user picks. Default proposal is Full for anything that adds a
screen, endpoint, table or external dependency, Lite otherwise. If Lite reveals a decision the
user should see before the rest, the agent upgrades to Full from that gate onward, never the
reverse.

### Upgrade 2 — **Research** becomes a real phase with a real artifact (`00-research.md`)

**Why.** Both runs did it anyway and parked it in the status file. HumanLayer's named failure
mode is a plan built on shallow research. v1 only says "read the relevant existing code" at Gate 2.

**What.** Before Gate 1 for a brownfield change, write `00-research.md`: how the relevant code
works today (with file:line references), the measured baseline where there is one, confirmed
defects marked **reproduced** vs **inferred**, constraints carried in (budgets, baselines, tool
quirks), the predecessor plan if any, and open questions for the user. Research is **not a gate**
(no approval needed) but its summary is shown to the user, because Dex's rule is to spend human
attention on research and plans. Where the harness has subagents, the research can run in one so
the main context stays lean; the artifact is what comes back.

**Exception (Trevor):** when the user supplies the context the implementation must consider
*exclusively* — a spec, a ticket, a design doc, "use only this" — the research phase is skipped
and `00-research.md` holds a pointer to that context plus the constraints carried in. The agent
does not go looking for more; it designs against what it was given.

The Gate 2 "load-bearing bet" pattern gets a name: **spike** — a measurement or throwaway
experiment that proves an assumption the architecture rests on, recorded in `00-research.md`
with its result, before the gate doc is written.

### Upgrade 3 — **Autonomous slices**: the commit is the record, the walkthrough is the review

**Why.** v1 stops after every slice with "Continue to slice N+1, or re-steer?". Once the slice
plan is approved that stop mostly costs the user a round trip, and the two runs show the
real history was already in git (one commit per slice). At the same time the 600-line
progress log proves the per-slice notes have value; they just belong somewhere that is not the
state file. Trevor's direction: slices run autonomously, the slice commit is the historical note,
and each slice produces an HTML review walkthrough of its own changes.

**What.**
- After Gate 4 approval, slices run **without stopping** between them. Each slice ends with:
  prove it (upgrade 4) → commit with a structured message (upgrade 8) → generate the slice
  walkthrough (upgrade 5) → tick the box in `00-status.md` → next slice.
- The run **pauses** only for: a slice flagged *needs user present* in `04-slices.md` (Gate 2's
  back-pressure list: auth, billing, public API, data deletion, anything irreversible); a slice
  whose proof came out **UNVERIFIED**; a backtrack (a later slice invalidates an approved gate);
  or a failing test the agent cannot make pass honestly. Everything else continues.
- At the end of the last slice the agent reports once: slices done, walkthrough index, anything
  UNVERIFIED, ADRs due.
- The **slice commit message** carries the note the old progress log carried: slice number and
  title, what landed, proof summary, surprises and test traps, Gate 3 tests turned green,
  and the code-tour paragraph the walkthrough is rendered from (upgrade 12). A
  resuming session reads `git log` for the plan's branch; humans read the walkthrough. There is
  no `05-log.md`. When the plan is linked to a tracker (upgrade 11), the subject also carries the
  story's ID (`AB#1234` / `PROJ-123`) so the commit shows up on the work item.
- `00-status.md` stays the **state file** and gets a hard shape: gate lines, slice checkboxes,
  **Decisions taken by the user**, **Amendments at approval**, **Version control** (branch,
  override), **Work items** (tool, Feature/Epic ID, story IDs per slice, points total),
  **Pointers** (predecessor, research doc, walkthrough index, ADRs), and a short "Notes for a
  fresh session". Target: under 80 lines for the life of the feature.

Backward compatible: a v1 folder with everything in `00-status.md` still resumes; the agent
simply starts committing per slice from the next slice.

### Upgrade 4 — A **proof standard** and an honesty rule for slices

**Why.** "Prove it works" is right but under-specified. Both runs had to decide for themselves
what to do when the browser pane would not composite, and both landed on "measured values, not an
image, and say so". The VS Code skill in this repo solved the same problem with an **INCOMPLETE**
verdict that is never reported as a pass. Autonomous slices make this more important, not less:
the user is not watching, so the proof has to be trustworthy on its own.

**What.** A short `references/proof.md`: the acceptable kinds of proof in order of strength
(test output → executed command output → measured values → screenshot → reasoning alone, which
is **not** proof), the rule that each slice names its proof *before* it is built (in
`04-slices.md`), and the honesty rule: a slice whose proof could not be produced is reported
**UNVERIFIED** with the reason, is not checked off, pauses the run, and is listed in the
walkthrough. "Test trap" notes go in the slice commit body so the next slice does not rediscover
them.

### Upgrade 5 — **HTML review walkthroughs**: per slice, and one for the whole plan

**Why.** Dex's post-mortem: the humans stopped reading code and could not help when the agent
got stuck. If slices run autonomously (upgrade 3) the user will read even less code unless the
skill produces something worth reading. Trevor's direction: each slice gets a review walkthrough
in HTML of that slice's changes alone, maintained alongside a walkthrough of the plan as a whole.

**What.**
- `<plan folder>/walkthrough/slice-N.html` — one self-contained HTML file per slice, no
  framework, no network: the slice's goal (from `04-slices.md`), the files touched with the
  diff of **that slice's commit only** rendered readably, a short code tour (where the new logic
  lives, the one function to read if you read only one, what was surprising), the proof with
  its kind and verdict, and the Gate 3 tests it turned green.
- `<plan folder>/walkthrough/index.html` — the **plan walkthrough**, regenerated after every
  slice: the four gate summaries (decisions, not full docs), the slice list with status and a
  link to each slice page, decisions taken by the user, anything UNVERIFIED. This is the page a
  reviewer opens to understand the feature end to end without reading the gate docs.
- Both are **generated by a script** from git and the plan folder (upgrade 9), so producing them
  costs the agent one tool call and almost no tokens. The agent writes only the code-tour
  paragraph; the diff, file list and plan summaries come from the data.
- The walkthroughs are **derived, not stored on a code branch**: everything in them comes from
  the slice's code commit (diff, code tour, proof) and the plan folder, so any page can be
  regenerated at any time. They are written into the plan store's mount (upgrade 12) and never
  reach the default branch.

### Upgrade 6 — Gate template refinements (small, each backed by §2)

- **Gate 1** gains **Scope — in / out / deferred** (the composer run improvised it), a
  **Riskiest assumption** line (what would make this the wrong thing to build) and a **Rough
  size** (a story-point range, upgrade 11) so the build-or-not decision has a cost next to it.
- **Gate 2** gains **Load-bearing bets** (assumptions a spike should prove — ties to upgrade 2)
  and **Where a human must stay in the loop** (auth, billing, public API, data deletion — Dex's
  back-pressure list), which Gate 4 turns into *needs user present* flags on slices.
- **Gate 3** keeps all five sections; **Test plan** entries get stable numbers so slices can
  reference them (the composer run did exactly this with "Tests 1–3, 10").
- **Gate 4** slices become a fixed mini-template per slice: *what · tests it turns green · proof ·
  needs user present (y/n) · story points (basis, confidence) · work item ID once linked*. "One
  line per slice" is dropped; it was never what got written. The Gate 4 summary ends with the
  work-item breakdown and its points total (upgrade 11).
- **After the last slice**: a **Post-ship** section in `04-slices.md` where bug-hunt rounds from
  real use are added as further slices (same commit + walkthrough rhythm), and a prompt to write
  the ADR(s) the gates promised.

### Upgrade 7 — Approval protocol: the third outcome

**Why.** The motion run's Gate 1 was approved "with one amendment, folded in". v1 only knows
yes or revise-and-re-ask.

**What.** Approve-with-amendment is explicit: fold the amendment into the gate doc, record it
under **Amendments at approval** in the status file, mark the gate APPROVED. Ask again only if
the amendment changes a decision the user has not seen in its new form. Also record every place
the user chose against the recommendation under **Decisions taken by the user**, with the
reason, because those are the decisions a later session is most likely to "helpfully" undo.

### Upgrade 8 — Version control by default, and a context budget (standing rules)

**Version control (Trevor's default).** When the plan folder is created, the agent creates a
**new branch off the repo's default branch** (detected from `origin/HEAD`, falling back to
`main`/`master`), named `<prefix>/<slug>` where the prefix follows the host's convention if one
is visible (this repo uses `claude/`), else `feature/`. From then on: one docs commit when Gate 4
is approved (the plan), one commit per slice with the slice number in the subject and the
structured note in the body. Plan state is committed in the plan store (upgrade 12): on the
`plans` branch by default, or in the same commit as the slice in `in-tree` mode.
The user can override any of this — commit to the current branch, a different prefix or name, no
commits at all — and the override is recorded in `00-status.md` → **Version control** so a fresh
session honours it. Repo-level commit rules (conventional commits, attribution lines, sign-off)
always apply on top. The agent never pushes or opens a PR unless asked.

**Compaction gets a number.** Keep utilization roughly in the 40–60% band (HumanLayer's
heuristic); at a gate or slice boundary when above it, write the artifact and recommend a fresh
session rather than pushing on. Gates and slices *are* the compaction points; the artifacts and
commits are what survive. Autonomous slices make this a self-check the agent runs at every slice
boundary, not something the user has to notice.

### Upgrade 9 — Progressive disclosure and scripts that save tool calls and tokens

**Why.** v1 is a single file, which is fine at 168 lines but not after the above. The repo's
other skills keep `SKILL.md` as a router with detail in `references/` and templates in `assets/`.
Trevor's direction: scripts are welcome wherever they cut tool calls or tokens during planning
and slicing — reading a 600-line status file to find a checkbox, hand-rendering a diff into HTML,
or re-reading four gate docs on resume are all things a script does in one call.

**What.** One **zero-dependency Python script**, `scripts/plan.py`, stdlib only (Python is on
practically every machine the skill will meet; this repo already uses it):

| Subcommand | Does | Saves |
| --- | --- | --- |
| `init <slug> [--lite]` | classifies the repo as fresh or existing, mounts the plan store, copies templates into the plan folder, fills slug/date, creates the feature branch (unless overridden) | a dozen Write calls and the branch bookkeeping |
| `status <slug>` | prints the first unapproved gate or first unchecked slice, plus the version-control override | reading the whole status file on resume |
| `digest <slug>` | a compact digest of every gate doc: headings, decisions, slice list, user decisions, amendments | re-reading four docs in full on resume |
| `check <slug>` | lints the folder: Gate 1 free of banned tech words, every slice has Proof and needs-user-present, status lines well-formed, pointers resolve | a self-review pass done by reading |
| `walkthrough <slug> --slice N` | renders `walkthrough/slice-N.html` from the slice commit's diff + the slice entry + a code-tour paragraph passed in; regenerates `index.html` | hand-writing HTML and pasting diffs |
| `commit <slug> --slice N` | builds the structured slice commit message from the slice entry, proof and linked story ID, commits on the plan branch (respecting overrides and repo rules) | composing the message by hand each slice |
| `work-items <slug> [--export ado\|jira] [--sync]` | builds `05-work-items.md` + `work-items.json` from the gate docs (Feature ← Gate 1, Stories ← slices, Tasks ← Gate 3), leaves points for the agent to fill; `--sync` mirrors slice checkboxes to item states; `--export` writes the tool's bulk-import CSV | writing the breakdown by hand and re-deriving it after every gate change |
| `mount` / `path <slug>` | fetches the plan store and adds its worktree (creating it on first use); prints where a plan folder is | the worktree bookkeeping, and any hardcoded plan path in the skill or an overlay |
| `context [--area <path>]` | one digest of what a new plan must know: architecture doc sections for the area, ADRs in force, agent-file notes, earlier plans that touched the same paths, estimate calibration | opening five files and a branch at the start of every plan |
| `harvest <slug>` | at close-out, lists what each gate doc owes the default branch (architecture sections to update, ADR drafts from recorded decisions, deferred scope) and what it found already done | re-reading the whole plan to work out what is worth keeping |
| `migrate <slug>` | moves a v1 in-tree plan folder into the plan store and removes it from the branch | doing it by hand |

`check` also accepts extra rule files so an overlay (§6) can add lint rules. Each subcommand has
a `--json` flag so the agent can read the result without parsing prose.

### Upgrade 10 — Description tuned for triggering

v1's description relies on the user saying "feature". v2 should also fire on "plan this",
"spec", "PRD", "design doc", "break this into slices", "what's the first slice", "resume the plan
in docs/plans/…", and on the agent's own judgement that a task will touch several files. Keep the
explicit negatives (renames, copy, one-line config). The skill-creator's description optimizer is
the tool for this, run last.

### Upgrade 11 — **Work items**: an Agile hierarchy with story-point estimates, tied to Azure DevOps or Jira

**Why (Trevor).** The plan folder, the slices and the commits describe the work in the agent's
terms. Teams track work in Azure DevOps or Jira, and want this effort to show up there as real
work items with a size on them, in the hierarchy their process already uses. The gates already
contain everything a work-item breakdown needs — Gate 1 has the user-facing value, Gate 3 has
the files and tests, Gate 4 has the increments — so the breakdown should fall out of the plan
rather than be written separately, and it should carry an estimate a planning meeting can use.

**What.**

*Hierarchy.* `<plan folder>/05-work-items.md` (human-readable) plus `work-items.json`
(export-ready) describe the plan in the **Azure DevOps Agile process hierarchy by default**,
with a Jira mapping alongside:

| Plan artefact | Azure DevOps (Agile) | Jira (default scheme) | Content |
| --- | --- | --- | --- |
| A programme the plan belongs to (optional; usually an existing item the user names) | Epic | Epic (parent) | linked, never created by the agent |
| The plan (its folder in the plan store) | **Feature** | **Epic** | Gate 1 announcement + success metric as the description; scope in/out; rough size |
| One slice | **User Story** | **Story** | slice goal as the story; acceptance criteria = the slice's Proof and the Gate 3 tests it turns green; *needs user present* → tag |
| The plan and gate work itself | User Story "Plan & design" under the Feature | Story | research, Gates 1–4, approvals — human review time is real effort |
| A unit of work inside a slice | **Task** | Sub-task | derived from Gate 3: files created/changed grouped sensibly, tests, the walkthrough/review |
| Post-ship fix | Bug (linked to the Feature) | Bug | from the Post-ship section of `04-slices.md` |

Slices map to stories, not tasks, because the slice rule ("ends in a working, testable state the
user can see") is the definition of a story. The mapping is a table in `references/work-items.md`
and a `mapping` block in `work-items.json`, so a team on Scrum/CMMI/Basic or a custom Jira scheme
changes names once, not the breakdown.

*Estimates.* Every Task and Story carries **story points where 1 point = one 8-hour block of
human effort to implement by hand**. Scale: 0.5, 1, 2, 3, 5, 8; anything larger is a sign the
slice should split. The estimate is **human** effort, deliberately not agent wall-clock, because
that is the number a team's velocity and planning are built on; the agent's actual time can be
recorded beside it as `agent_hours` so the two can be compared over time. Rules:

- A **rough size** goes on the Feature at Gate 1 (a points range, e.g. "8–13"), because that is
  when the user decides whether to build at all.
- **Firm points per Story and Task at Gate 4**, when slices and Gate 3 files are known. The
  breakdown and its total are part of the Gate 4 summary, so approving the slice plan approves
  the estimate.
- Each estimate records its **basis** (files, tests, unknowns) and a **confidence** (high /
  medium / low). Low confidence on a story is a flag that research or a spike is missing.
- Reopening a gate re-estimates the stories it touches; the old number is kept in the file.
- Lite tier produces the same structure one level flatter: the plan is a Story, slices are Tasks.

*Tying it to the tool.* Two directions, both optional:

- **Linking.** The user names an existing Feature/Epic (or any item) and `00-status.md` →
  **Work items** records the IDs. Every slice commit message references its story
  (`AB#1234` for Azure Boards, `PROJ-123` for Jira), which both tools turn into a link
  automatically. Story and task state are mirrored from the slice checkboxes (`New` → `Active`
  → `Closed`; `To Do` → `In Progress` → `Done`) in `work-items.json` on every slice.
- **Export / create.** `plan.py work-items --export ado|jira` writes a CSV in the shape each
  tool's bulk import accepts (Azure Boards' `Title 1…Title 4` hierarchy columns; Jira's
  `Parent` / `Issue ID` columns), with points in the right field. Where an Azure DevOps or Jira
  connector or CLI is present, the agent may create or update items directly, but only after the
  user says so for that plan — writing to a team's board is an outward-facing action and never
  happens on the agent's own judgement. The export file is the default; the connector is the
  shortcut.

*Generation.* `plan.py work-items <slug>` builds the skeleton from the gate docs (Feature from
Gate 1, Stories from slices, Tasks from Gate 3 files and tests) with points left blank; the agent
fills in points, basis and confidence. `check` fails a Gate 4 approval request if any story is
unestimated.

### Upgrade 12 — **Plan store**: plans live off the code branches

**Why (Trevor).** Planning docs accumulate forever and none of them describe the code as it is
today. Measured in this repo: the two finished plan folders are 188 KB (about 7% of the tracked
tree, a third of it throwaway mockups) and 18 of 67 commits on `master` touch them. v2 would
make it worse, since a walkthrough page embeds a diff git already stores. The default branch
should hold the code and what is true about it now; the working papers belong elsewhere.

**What.** Where a plan folder lives is a per-repo setting, the **plan store**, with three modes:

| Mode | Where plans live | When |
| --- | --- | --- |
| `branch` (**default**) | an orphan branch `plans`, one folder per plan, mounted as a git worktree at `.plans/` (ignored through `.git/info/exclude`, so not even `.gitignore` changes) | any git repo |
| `external` | the same layout in another repository (a planning repo, an Azure DevOps or GitHub wiki repo), mounted the same way | planning data must stay out of clones entirely, or plans span several repos |
| `in-tree` | `docs/plans/<slug>/` on the feature branch, as v1 | no git, a harness that cannot hold a second worktree, or the user prefers it. The folder is **retired** at close-out: removed from the branch, preserved under a `plan/<slug>` tag |

```
plans                      (orphan branch — shares no history with the code)
├── INDEX.md               one line per plan: slug · state · work item · code branch · merge commit · paths touched
├── estimates.csv          points estimated vs. actual per story — calibration for later estimates
├── <slug>/                00-status.md … 05-work-items.md, work-items.json, mockups/  (Lite: plan.md)
│   └── walkthrough/       rendered on demand, ignored by default
└── adr-archive/           superseded ADRs moved off the default branch (upgrade 13)
```

- **The agent still works on ordinary files.** `plan.py mount` fetches the store and adds the
  worktree, creating the orphan branch on first use (`git worktree add --orphan` on Git 2.42+,
  a plumbing fallback below that). `plan.py path <slug>` prints the plan folder and every other
  subcommand resolves it the same way, so nothing in the skill or an overlay hardcodes
  `docs/plans/`.
- **Two commits per slice, linked both ways.** The code commit on the feature branch carries a
  `Plan: <slug> slice N` trailer (and the work-item reference). The plan-state commit on the
  store records that code commit's SHA beside the slice checkbox. `plan.py commit` makes both.
  This trades v1's single atomic commit for a code history with no planning noise; the two links
  are what a resuming session follows.
- **Walkthrough pages are derived.** They render from the code commit and the plan folder into
  `<plan folder>/walkthrough/`, which the store ignores by default. That is why the code-tour
  paragraph lives in the slice commit body (upgrade 3): with it there, every page is
  regenerable. A team that wants the pages browsable can commit them to the store or publish
  them as a pull-request or pipeline artifact; they never go on a code branch.
- **Resume rule** becomes mount → status → digest. A fresh clone resumes with one command.
- **Pushing** follows the same rule as code: never unless asked. When the user asks to push the
  feature branch, the agent offers to push the store with it, because an unpushed plan exists
  on one machine only.
- **Concurrency.** Plans occupy disjoint folders and `INDEX.md` is one line per plan, so
  parallel sessions rarely conflict; a rejected push is rebased.
- **Settings** live in `.software-factory.json` at the root of the default branch, written only
  when something differs from the defaults (store mode or location, branch prefix, tracker and
  hierarchy mapping, knowledge paths). With defaults, the existence of the `plans` branch is the
  signal a new session looks for.

### Upgrade 13 — **Durable knowledge**: the default branch states the present

**Why (Trevor).** Once plans live elsewhere, the default branch has to carry forward exactly
what future work needs and nothing else: it should be clean and relevant to the current state of
the code. v1 only offers an optional ADR nudge. The cost of that shows in the motion run, whose
notes say "read composer's `00-status.md` before touching sections; its sizing semantics are
load-bearing" — a new feature depending on an old plan's working notes. Knowledge that later
work depends on must not be left in a plan.

**What — where long-term knowledge lives.** Defaults below; a repo's existing convention always
wins (the skill looks for `docs/adr`, `doc/adr`, `docs/decisions`, `ARCHITECTURE.md`,
`AGENTS.md`, `CLAUDE.md` and uses what it finds).

| Location | Holds | Edited how |
| --- | --- | --- |
| `docs/architecture.md` (splits into `docs/architecture/<area>.md` past ~300 lines) | **the system as it is now**: purpose and context · modules and boundaries · data · key flows · external dependencies (names, never values) · invariants and baselines (budgets, test baselines) · guarded areas where a human stays in the loop · conventions · open questions | **rewritten in place**. No change narrative, no dates, no "previously". Each section names the paths it describes so a lint can flag sections whose paths are gone |
| `docs/adr/NNNN-<slug>.md` | **decisions in force**: context, decision, alternatives rejected, consequences, and a "revisit when" trigger | append a new one. When a decision is superseded, the new ADR says what it replaces and the old file moves to the store's `adr-archive/`, so the folder only ever lists what currently binds the code |
| the agent entry file (`AGENTS.md` or `CLAUDE.md`, whichever exists; `AGENTS.md` if neither) | how to build, test and run; tool quirks and test traps; pointers to the two above and to the plan store | the skill maintains one short delimited section and leaves the rest alone |
| `docs/external/` | things outside the repo an agent must know exist (unchanged from v1) | as v1 |

Moving superseded ADRs off the default branch departs from the classic "never delete an ADR"
practice. It follows from the requirement that the default branch describe the present; the
archive keeps the full chain and each ADR in force links back into it.

**What — fresh project or existing one.** `plan.py init` classifies the repo from its commit
count, tracked source files and manifests, states its reading in one line, and the user can
correct it.

| | Fresh project | Existing project |
| --- | --- | --- |
| Research | nothing to research; `00-research.md` holds the user's context and constraints | the research phase (upgrade 2), starting from `plan.py context` |
| Architecture doc | **seeded from the first plan's Gate 2** on approval; that gate is the architecture | used if present. If absent, research writes a baseline for **the area this feature touches only**, and the doc grows one feature at a time — never a big-bang documentation exercise |
| ADRs | ADR 0001 records the foundational choices (stack, structure, test approach) at Gate 2 | existing ADR folder and numbering adopted; none invented retroactively for old decisions |
| Slice 1 | the tracer bullet also stands up the skeleton, the test runner and CI, so the proof standard has something to run from the start | the tracer bullet runs through the existing structure |
| Conventions | the skill's defaults (plan store `branch`, `docs/` locations, branch prefix) | detected and adopted: default branch, commit style, docs locations, tracker. Existing in-tree plan folders are offered `plan.py migrate`, never moved silently |

**What — the close-out harvest.** After the last slice and before the user is asked about a
pull request, the agent harvests the plan: `plan.py harvest <slug>` lists what each gate doc owes
the default branch, the agent makes those edits, and they land as the **last commit on the
feature branch**. That commit is the only planning-derived content in the code pull request, so
a reviewer sees how the description of the system changed alongside the code that changed it.

| Part of the plan | Needed later? | Goes to |
| --- | --- | --- |
| Gate 2 fit, endpoints, data, flow | yes, as current state | `docs/architecture.md`, edited in place |
| Gate 2 decisions with alternatives; **Decisions taken by the user**; resolved "least confident" items from Gate 3 | yes — these are the ones a later session would otherwise undo | an ADR each, with the "revisit when" trigger |
| Gate 2 "where a human must stay in the loop" | yes — the next plan uses it to flag slices | architecture doc → guarded areas |
| Research: constraints carried in, measured baselines, load-bearing bets that held | yes | architecture doc → invariants and baselines |
| Test traps and tool quirks from slice commits | yes | agent entry file |
| Gate 1 scope marked deferred | yes, as work | tracker items if linked, else architecture doc → open questions |
| Gate 1 announcement | sometimes | the changelog or release notes, if the repo keeps one |
| Estimated vs. actual points | yes, for estimating | `estimates.csv` in the plan store |
| Gate 3 files, types, signatures, test plan | no — the code and tests are now the truth | plan store only |
| Slice list, status, work-item breakdown, mockups, walkthroughs, problem statement, success metric | no | plan store only (the tracker and git hold the history) |

`plan.py check` fails close-out if the harvest commit is missing and the status file does not
say "no architecture change", and flags architecture sections whose named paths no longer exist.
The harvest introduces no new decisions — everything in it was approved at a gate — so it needs
no extra approval; it is listed in the final report.

**What — the read path for the next plan.** A new plan starts from `plan.py context`: the
architecture sections for the area, ADRs in force, the agent file's notes, earlier plans in the
store that touched the same paths (from `INDEX.md`), and the estimate calibration. Old plans are
consulted for background and never required reading, because anything binding was harvested.

### Explicitly not proposed

- No change to the four gates, their order, or the approval question.
- No writes to Azure DevOps, Jira or any tracker without the user's explicit go-ahead for that
  plan; the CSV export is always available instead.
- No automatic gate approval, no "agent approves its own gate" path, no skipping Gate 3. Slices
  are autonomous; gates are not.
- No framework- or language-specific content; overlays (§6) are where that lives.
- No bundled mockup framework; plain HTML throwaway mockups stay as they are.
- No pushing, PR creation or merging by the agent unless asked.
- No retroactive documentation of an existing codebase and no invented ADRs for decisions made
  before the skill was in use; the knowledge layer grows only where features touch.
- No plan history on the default branch: no plan index, no superseded ADRs, no change narrative.

## 5. Proposed layout of v2

```
software-factory/
├── SKILL.md                 router (~200 lines): when to run, tiers, the protocol, autonomous
│                            slice loop, standing rules, index into references/ — keeps every v1 rule
├── references/
│   ├── gates.md             gate-by-gate guidance with the reasoning, banned words, examples
│   ├── proof.md             proof kinds, UNVERIFIED rule, code-tour paragraph format
│   ├── research.md          what deep-enough research looks like; spikes; subagent use; the
│   │                        "user-supplied exclusive context" exception
│   ├── work-items.md        hierarchy mappings (ADO Agile default, Scrum/CMMI/Basic, Jira),
│   │                        estimation rules (1 pt = one 8-hour block), export/link/sync rules
│   ├── plan-store.md        the three modes, mounting, commit linking, retirement, migration
│   ├── knowledge.md         architecture doc and ADR rules, fresh vs existing project, the
│   │                        close-out harvest table
│   └── overlay-contract.md  how other skills extend the gates (see §6)
├── assets/
│   ├── templates/           copied by plan.py init, hand-copyable without it
│   │   ├── 00-status.md  00-research.md  01-product.md  02-architecture.md
│   │   ├── 03-program-design.md  04-slices.md  05-work-items.md  plan.md (Lite)
│   │   ├── architecture.md  adr.md  agent-section.md  INDEX.md
│   └── walkthrough/         HTML shell + CSS the walkthrough renderer fills (no network, no JS deps)
├── scripts/
│   ├── plan.py              init | mount | path | status | digest | context | check | walkthrough |
│   │                        commit | work-items | harvest | migrate — stdlib only
│   └── selftest.py          exercises every subcommand on a temp repo
├── evals/                   test cases (§7), skill-creator case-folder format
└── DESIGN.md                this proposal, renamed once implementation starts; then the decision record
```

`SKILL.md` stays readable top to bottom without opening anything else; the references hold the
"why" and the long examples.

## 6. Compatibility

**Existing plan folders.** `docs/plans/slide-forge-composer/` and `slide-forge-motion/` must
still resume under v2 without edits. They will: the status line format is unchanged, the new
status sections are optional, and the absence of a plan branch or walkthroughs simply means
they start from the next slice.

**Plan store and existing in-tree plans.** v2 reads a plan wherever it is: if
`docs/plans/<slug>/` exists on the branch it is used in place (that is `in-tree` mode for that
plan), and the user is offered `plan.py migrate` once. The two finished plans on `master` here
are candidates for migration to the `plans` branch, with their load-bearing notes harvested into
slide-forge's own docs first; that is a separate change, made only on Trevor's say-so.

**The VS Code skill overlay.** `building-vscode-extensions/workflows/feature.md` loads
software-factory and adds VS Code sections to each gate doc, appends a review verdict before the
approval question, and extends `00-status.md`. Its `DESIGN.md` states the contract in one line:
"software-factory stays a separate skill and owns the gate protocol; this skill overlays it."
v2 makes that contract explicit in `references/overlay-contract.md`:

- the four gate doc filenames and their top-level section headings are **stable**; overlays add
  sections, never rename or remove them;
- the approval question is stable and overlays may prefix a one-line verdict to it (as the VS
  Code skill already does);
- `00-status.md` has named sections an overlay may append to, and a `## Overlay` block it owns;
- an overlay may add a **per-slice gate** that runs before the slice commit (the VS Code skill's
  slice review gate is exactly this) and may flag slices *needs user present*;
- the plan folder is whatever `plan.py path <slug>` prints. An overlay that still writes to
  `docs/plans/<feature-slug>/` keeps working (v2 treats that plan as `in-tree`), and moves to the
  plan store by replacing the hardcoded path with that call;
- the knowledge layer is shared: an overlay's own durable docs (the VS Code skill's `AGENTS.md`,
  ADRs and `docs/reviews/`) follow the same present-state rule and may add rows to the harvest
  table;
- new in v2 and available to overlays: the research artifact, the proof standard, the Lite tier
  (an overlay may require Full), extra `plan.py check` rules, extra sections in the slice
  walkthrough, and extra work-item fields or tags (an overlay may, for example, add an "Area
  Path" or a component to every item it generates).

The VS Code skill's "condensed protocol (only if software-factory is unavailable)" needs no
change for v2, since every v1 rule it restates survives.

## 7. Implementation and evaluation plan

Done with the skill-creator loop, on this branch:

1. **Baseline.** The v1 `SKILL.md` committed here is the `old_skill` configuration for every
   eval run.
2. **Write v2** per §4–§5: `SKILL.md`, references, templates, the walkthrough shell, `plan.py`
   with `selftest.py` (init → check passes; a Gate 1 doc containing "endpoint" → check fails;
   walkthrough renders from a synthetic commit; commit respects an override; work-items builds
   the hierarchy from fixture gate docs, `check` rejects an unestimated story, the ADO and Jira
   CSVs have the columns each importer expects; mount creates the orphan branch and worktree on
   a temp repo; a slice produces a linked pair of commits; harvest lists the right destinations;
   migrate moves an in-tree folder and leaves the code branch without it).
3. **Test cases** (`evals/`, one folder each, prompts first, assertions while runs are in flight):
   - `feature-on-small-repo` — a feature request against a tiny fixture repo. Expected: research
     summary, plan folder and branch created, `01-product.md` without tech talk, no code, tier
     offered, the approval question asked verbatim.
   - `exclusive-context-skips-research` — the user hands over a spec and says to use only it.
     Expected: no codebase research, `00-research.md` points at the spec, Gate 1 proceeds.
   - `resume-mid-plan` — fixture `docs/plans/<slug>/` with Gates 1–2 approved and Gate 3 absent.
     Expected: Gates 1–2 not redone, Gate 3 doc produced, status updated.
   - `trivial-tweak-skips` — a rename. Expected: no plan folder, the task just done.
   - `lite-tier-medium-task` — the user asks for the light version. Expected: single `plan.md`
     with all four sections, one approval, slices follow.
   - `autonomous-slices-with-walkthrough` — fixture with Gate 4 approved and two small slices.
     Expected: both slices implemented without a stop between them, one commit each on the plan
     branch, `walkthrough/slice-1.html`, `slice-2.html` and `index.html` present, boxes ticked.
   - `slice-proof-unverifiable` — a slice whose proof tool is unavailable in the fixture.
     Expected: UNVERIFIED reported, slice not checked off, run paused with the reason.
   - `work-items-hierarchy-and-points` — fixture with Gates 1–3 approved; the user says the work
     is tracked in Azure DevOps under Feature 4321 and asks for the slice plan. Expected:
     `04-slices.md` with points per slice, `05-work-items.md` + `work-items.json` with the Feature
     linked (not created), one Story per slice and Tasks beneath, every item estimated with basis
     and confidence, the Gate 4 summary quoting the total, an ADO-shaped CSV on request, and no
     call to any tracker API.
   - `fresh-project-seeds-architecture` — an empty repo and a request to build a small service.
     Expected: classified as a fresh project, plan folder created in the plan store (not on the
     code branch), no codebase research, and once Gate 2 is approved in the fixture conversation
     `docs/architecture.md` and ADR 0001 exist and describe the approved design.
   - `existing-project-adopts-conventions` — fixture repo with `doc/adr/0007-*.md`, a
     `CLAUDE.md`, no architecture doc and a `main` default branch. Expected: classified as
     existing, ADR folder and numbering reused, baseline architecture notes limited to the area
     touched, no new `AGENTS.md`, feature branch cut from `main`.
   - `close-out-leaves-default-branch-current` — fixture with all slices done. Expected: a
     harvest commit that edits the architecture doc in place and adds an ADR for the recorded
     user decision, no plan docs, walkthroughs or mockups anywhere in the feature branch's tree,
     the plan's `INDEX.md` line updated in the store, and a superseded ADR moved to the archive.
4. **Run with-skill (v2) and old-skill (v1) in parallel**, grade with assertions on the files and
   git state produced (all objectively checkable), aggregate, open the viewer for Trevor's review,
   iterate.
5. **Description optimization** last, with the trigger eval set reviewed by Trevor.
6. **Update `README.md` and `CLAUDE.md`** to list the skill; open the PR to `master`.

Package as `software-factory.skill` (gitignored, like the others). Name stays `software-factory`;
`metadata.version` becomes `2.0.0`.

## 8. Decisions taken (2026-11-09)

Trevor's answers to the open questions, recorded here so no later session re-litigates them:

1. **Lite tier: in.** It follows the basics of every gate in a less stringent manner (upgrade 1).
2. **Research phase: in**, except when the user provides the context the implementation should
   consider exclusively; then it is skipped and the research doc points at that context
   (upgrade 2).
3. **Slices run autonomously** once the slice plan is approved. The slice commit is the
   historical note of what changed. Every slice produces an **HTML review walkthrough** of that
   slice's changes alone, and a **plan walkthrough** is maintained alongside (upgrades 3 and 5).
   The per-slice "continue or re-steer?" stop is gone; pauses are reserved for needs-user-present
   slices, UNVERIFIED proof, backtracks and honest test failures.
4. **Scripts: encouraged** wherever they reduce tool calls or token consumption during planning
   and slicing (upgrade 9).
5. **Version control default:** commits on a **new branch based on the repo's default branch**;
   the user can override this for their own setup, and the override is recorded in the status
   file (upgrade 8).
6. **Work items: in.** The plan is broken down into a task-list structure that can be tied to a
   work item in Azure DevOps or Jira, expressed in the **Agile process hierarchy by default**
   (Epic → Feature → User Story → Task, with a Jira mapping), and given a **rough estimate of
   human effort in story points where 1 point = one 8-hour block** (upgrade 11). Linking and CSV
   export are the default; direct writes to a tracker need the user's go-ahead per plan.
7. **Plan store: in.** Plans live on a separate branch (an orphan `plans` branch by default, an
   external repo or in-tree as alternatives) so they do not bloat the repo's code branches as it
   grows (upgrade 12).
8. **The default branch stays clean and relevant to the current state of the code.** The skill
   distinguishes a fresh project from an existing one, gives long-term architecture decisions a
   fixed home (a present-state architecture doc and ADRs in force), and harvests into them only
   the parts of a plan that future decisions or workflows need; everything else stays in the
   plan store (upgrade 13). This also moves the plan index off the default branch.

## 9. Sources

- HumanLayer, "Advanced Context Engineering for Coding Agents" (Dex Horthy, 2025-08-29) —
  research/plan/implement, frequent intentional compaction, the 40–60% utilization band:
  https://www.humanlayer.com/blog/advanced-context-engineering
- Addy Osmani, "Software Factories, Light and Dark" (2026-07-20), on Dex's AI Engineer World's
  Fair talk "Harness Engineering is not Enough: Why Software Factories Fail" — comprehension
  debt, back pressure, 200-line plan vs 2000-line diff:
  https://addyosmani.com/blog/software-factories/
- Summary of Dex Horthy with David Ondrej, "the four-layer program design system" (2026-08-07) —
  the four layers restated, "no penalty for bad design", five-plus-engineer scoping:
  https://openclawdatabase.com/news/videos/2026-08-07-program-design-system-agentic-engineering/
- This repo: `docs/plans/slide-forge-composer/` and `docs/plans/slide-forge-motion/` (complete
  v1 runs), `building-vscode-extensions/workflows/feature.md` and `DESIGN.md` (the overlay).

## 10. As built: departures from the proposal, and verification

**Departures.** Each was a simplification found while building; none changes a decision in §8.

- **Estimates and tasks have one home.** Points, basis, confidence and tasks are written in
  `04-slices.md`; `plan.py work-items` generates `05-work-items.md` and `work-items.json` from
  it. The proposal had the script emit a skeleton with blank points to fill in afterwards, which
  would have left two places to keep in step.
- **More subcommands than the table in upgrade 9.** `config` (what was detected; `--set` writes
  settings), `gate` (records an approval, amendment or user decision and commits plan state, and
  refuses to record an approval while `check` reports errors), `save`, `supersede` (archives a
  superseded ADR) and `retire` (in-tree mode: tag the folder and stage its removal).
- **The store is mounted beside the main checkout.** A branch can be checked out once, so a
  session running in a linked worktree uses the store already mounted next to the main checkout
  instead of trying to mount a second copy.
- **Walkthrough location in in-tree mode.** Pages go to an ignored `.plan-walkthroughs/<slug>/`
  beside the checkout, since the plan folder itself is tracked in that mode.
- **Close-out is stricter.** `check --closeout` also fails on an architecture doc or ADR stub
  with unfilled sections, so template text cannot reach the default branch.
- **Unverified slices have two exits.** `--proof-only` records proof for a slice whose code is
  already committed; `--accepted-by-user "<their words>"` records the user accepting it unproven.
- **`estimates.csv` logs elapsed hours** between slice commits automatically and leaves actual
  points blank for a team to fill in; the script cannot know human effort after the fact.
- **A repository with no commits** gets an empty initial commit from `init` so that a feature
  branch can be cut from the default branch.
- **`building-vscode-extensions` is unchanged.** Its feature workflow still names
  `docs/plans/<feature-slug>/`. v2's SKILL.md tells the model to read that as "the plan folder",
  and a plan actually created at that path is used in place. Moving that skill to
  `plan.py path` is a separate change.

**Verified.**

- `scripts/selftest.py`: 71 checks across an existing project, a fresh project on the Lite tier,
  a v1 in-tree folder (read in place, then migrated), in-tree mode with retire, a non-git folder,
  an external store, a linked worktree and an overlay rule file. All pass on Windows with
  Git 2.44 and Python 3.11.
- Walkthrough pages rendered in a real browser at desktop and phone widths: no console errors,
  no horizontal overflow, slice links resolve.
- Every eval fixture builds through `evals/files/build_fixture.py`, and each resulting plan
  passes `plan.py check`.
- `quick_validate` from skill-creator accepts the skill.

**Not verified.**

- **No eval has been run.** How a model behaves with this SKILL.md — whether it offers the tier,
  runs slices without stopping, records an unprovable slice honestly — is untested. The eleven
  cases in `evals/` exist for that; v1 as first committed on this branch is the baseline.
- **Tracker imports.** The Azure DevOps and Jira CSV shapes follow the vendors' documented
  hierarchy columns (`Title 1..N`; `Issue ID` / `Parent`). Field names for points and estimates
  were not tried against a live board, and company-managed Jira projects may want an epic-link
  column instead of `Parent`. `references/work-items.md` tells the user to trial a few rows first.
- Linux and macOS, and Git older than 2.44.
- Description triggering has not been optimized.

