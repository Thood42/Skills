# software-factory v2 — upgrade proposal

Status: **draft for Trevor's review** — 2026-11-09, branch `claude/software-factory-v2`.
The commit before this one imports the installed v1 `SKILL.md` verbatim, so the eventual v2 lands
as a reviewable diff against what runs today.

This document is the proposal only. Nothing in the skill has changed yet. The decisions it asks
for are listed at the end; once they are settled, the implementation plan in §7 applies.

## Contents

1. What v1 is and what it gets right
2. Evidence: two real runs of v1 in this repo
3. What Dex Horthy has said since v1 was written
4. Proposed upgrades (numbered, each with the reason)
5. Proposed layout of v2
6. Compatibility: existing plan folders and the VS Code skill overlay
7. Implementation and evaluation plan
8. Open decisions for Trevor
9. Sources

---

## 1. What v1 is and what it gets right

v1 is one 168-line `SKILL.md`: Dex Horthy's four-gate workflow (Product → Architecture →
Program Design → Vertical Slices), a fixed approval question at every gate, a `docs/plans/<slug>/`
folder with a `00-status.md` state file and one doc per gate, a resume rule, three standing rules
(compact at every boundary, keep diffs reviewable, real tests only) and an optional ADR nudge.

Things v1 gets right and that v2 must keep unchanged:

- **The four gates in that order, never merged, no implementation code before Gate 4 approval.**
  This is the whole point and the other skill in this repo depends on it (§6).
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

v2 is additive on top of these. The change is in what the protocol is silent about.

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
  a 200-line plan beats reviewing 2000 lines of code. v1's "keep diffs reviewable" nudge is the
  seed of this; v2 should make comprehension an explicit per-slice deliverable.
- **Four-layer program design, restated** (Dex with David Ondrej, Aug 2026): each layer is a
  cheap artifact reviewable in minutes; make structural decisions early, "when the model is
  sharpest"; "there is no penalty for bad design" in model training, so the gates supply the
  penalty. He also scopes the full ceremony to teams of roughly five-plus engineers with paying
  users — which argues for a lighter tier for smaller work (§4, upgrade 1).

## 4. Proposed upgrades

Ordered by how much the evidence in §2 and §3 supports them. Each one says why, so the skill can
explain the reasoning to the model rather than issue a bare rule.

### Upgrade 1 — A **Lite** tier, chosen by the user, never by the agent

**Why.** v1 is binary: full four-gate ceremony or nothing. Dex himself scopes the full flow to
larger teams. Medium tasks (a 100–300 line change with a design decision in it) currently get
either too much process or none. The runs in this repo were genuinely large; a lot of day-to-day
work is not.

**What.** Keep **Full** exactly as v1. Add **Lite**: one `plan.md` holding the four gate sections
in order (Product · Architecture · Program Design · Slices), **one** approval on the whole plan,
no mockups, then slices as usual with the same proof rule. The gates still exist and are still
in order; what Lite merges is the number of stop-and-ask moments, not the thinking.

The tier is **offered, not decided**: when a task qualifies for the workflow the agent proposes a
tier with a one-line reason and the user picks. Default proposal is Full for anything that adds a
screen, endpoint, table or external dependency, Lite otherwise. "Never merge gates" stays true
for Full; Lite is a separate mode the user has opted into. If Lite reveals a decision the user
should see before the rest, the agent upgrades to Full from that gate onward — never the reverse.

### Upgrade 2 — **Research** becomes a real phase with a real artifact (`00-research.md`)

**Why.** Both runs did it anyway (the "measured baseline", "two confirmed defects",
"constraints carried in") and parked it in the status file. HumanLayer's named failure mode is
a plan built on shallow research. v1 only says "read the relevant existing code" at Gate 2.

**What.** Before Gate 1 for a brownfield change, write `00-research.md`: how the relevant code
works today (with file:line references), the measured baseline where there is one, confirmed
defects marked **reproduced** vs **inferred**, constraints carried in (budgets, baselines, tool
quirks), the predecessor plan if any, and open questions for the user. Research is **not a gate**
(no approval needed) but it is shown to the user as a summary, because Dex's rule is to spend
human attention on research and plans. Where the harness has subagents, the research can run in
one so the main context stays lean — the artifact is what comes back.

The Gate 2 "load-bearing bet" pattern gets a name: **spike** — a measurement or throwaway
experiment that proves an assumption the architecture rests on, recorded in `00-research.md`
with its result, before the gate doc is written.

### Upgrade 3 — Split the state file from the journal

**Why.** `00-status.md` grew to 600 lines in the motion run. A resuming session has to read it
all to find the first unchecked slice. The state file's job is to be scannable in ten seconds.

**What.**
- `00-status.md` stays the **state file** and gets a hard shape: gate lines, slice checkboxes,
  **Decisions taken by the user** (new, fixed section), **Amendments at approval** (new),
  **Pointers** (predecessor plan, research doc, ADRs written), and a *short* "Notes for a fresh
  session". Target: under 80 lines for the life of the feature.
- `05-log.md` is the **append-only journal**: one entry per slice (what landed, proof, surprises,
  test traps), plus post-ship entries. A resuming session reads the status file first and the
  log only for the slice it is about to continue.
- The resume rule is updated accordingly: status → gate docs → the latest log entry.

Backward compatible: a v1 folder with everything in `00-status.md` still resumes; the agent
simply starts the log at the next slice.

### Upgrade 4 — A **proof standard** and an honesty rule for slices

**Why.** "Prove it works — run it, curl it, or browser-test it" is right but under-specified.
Both runs had to decide for themselves what to do when the browser pane would not composite,
and both landed on "measured values, not an image, and say so". The VS Code skill in this repo
solved the same problem with an **INCOMPLETE** verdict that is never reported as a pass.

**What.** A short `references/proof.md`: the acceptable kinds of proof in order of strength
(test output → executed command output → measured values → screenshot → reasoning alone, which
is **not** proof), the rule that each slice names its proof *before* it is built (in
`04-slices.md`, as the composer run did), and the honesty rule: a slice whose proof could not
be produced is reported **UNVERIFIED** with the reason, checked off only when the user accepts
that, and listed in the log. "Test trap" notes (environment quirks that produce false readings)
go in the log so the next slice does not rediscover them.

### Upgrade 5 — **Comprehension checkpoints** against comprehension debt

**Why.** Dex's post-mortem on his own factory: the humans stopped reading code and lost the
ability to help when the agent got stuck. v1's nudge ("if the user hasn't looked at code in a
long stretch…") is vague about what to show.

**What.** After every slice, alongside the proof, a **code tour**: at most ten lines naming the
files touched, where the new logic lives, the one function to read if you read only one, and
anything surprising. Every third slice, or whenever the user has not opened code in a while, the
agent asks the user to actually open one named file before continuing. The reasoning given to
the model: the user's ability to rescue the project later depends on staying oriented now, and
ten lines per slice is the cheapest insurance there is.

### Upgrade 6 — Gate template refinements (small, each backed by §2)

- **Gate 1** gains **Scope — in / out / deferred** (the composer run improvised it) and a
  **Riskiest assumption** line (what would make this the wrong thing to build).
- **Gate 2** gains **Load-bearing bets** (assumptions a spike should prove — ties to upgrade 2)
  and **Where a human must stay in the loop** (auth, billing, public API, data deletion — Dex's
  back-pressure list), which later tells Gate 4 which slices need the user present.
- **Gate 3** keeps all five sections; **Test plan** entries get stable numbers so slices can
  reference them (the composer run did exactly this with "Tests 1–3, 10").
- **Gate 4** slices become a fixed mini-template per slice: *what · tests it turns green · proof ·
  needs user present (y/n)*. "One line per slice" is dropped; it was never what got written.
- **After the last slice**: a named **Post-ship** section in the log for bug-hunt rounds from real
  use, so they are not orphaned, and a prompt to write the ADR(s) the gates promised.

### Upgrade 7 — Approval protocol: the third outcome

**Why.** The motion run's Gate 1 was approved "with one amendment, folded in". v1 only knows
yes or revise-and-re-ask.

**What.** Approve-with-amendment is explicit: fold the amendment into the gate doc, record it
under **Amendments at approval** in the status file, mark the gate APPROVED. Ask again only if
the amendment changes a decision the user has not seen in its new form. Also record every place
the user chose against the recommendation under **Decisions taken by the user**, with the
reason, because those are the decisions a later session is most likely to "helpfully" undo.

### Upgrade 8 — Context budget and version-control rhythm (standing rules)

- **Compaction gets a number.** Keep utilization roughly in the 40–60% band (HumanLayer's
  heuristic); at a gate or slice boundary when above it, write the artifact and recommend a
  fresh session rather than pushing on. Gates and slices *are* the compaction points; the
  artifacts are what survive.
- **Commit rhythm, if the user allows commits:** one docs commit when Gate 4 is approved (the
  plan), one commit per slice with the slice number in the subject, plan-doc updates in the
  same commit as the slice they describe. Observed in both runs; making it explicit keeps the
  history reviewable slice by slice. This never overrides a user's or repo's own commit rules.

### Upgrade 9 — Progressive disclosure and a small helper script

**Why.** v1 is a single file, which is fine at 168 lines but not after the above. The repo's
other skills (and the skill-creator guidance) keep `SKILL.md` as a router and push detail into
`references/` and templates into `assets/`.

**What.** Layout in §5. Plus one **zero-dependency Python script**, `scripts/plan.py`, with three
subcommands: `init <slug> [--lite]` copies the templates into `docs/plans/<slug>/` with the slug
and date filled in; `status <slug>` prints the first unapproved gate or first unchecked slice
(the resume rule made mechanical, so a fresh session does not misread a 600-line file);
`check <slug>` lints the folder — Gate 1 doc contains none of the banned tech words, every slice
has a Proof line, every status line is well-formed, log entries reference existing slices.
Python because it is on practically every machine the skill will meet and this repo already
uses it for slide-forge; stdlib only, so it runs anywhere `python3` does.

### Upgrade 10 — Description tuned for triggering

v1's description is accurate but relies on the user saying "feature". v2 should also fire on
"plan this", "spec", "PRD", "design doc", "break this into slices", "what's the first slice",
"resume the plan in docs/plans/…", and on the agent's own judgement that a task will touch
several files. Keep the explicit negatives (renames, copy, one-line config). The skill-creator's
description optimizer (20 should/should-not-trigger prompts, run against the live model) is the
tool for this, run last.

### Explicitly not proposed

- No change to the four gates, their order, or the approval question.
- No automatic gate approval, no "agent approves its own gate" path, no skipping Gate 3.
- No framework- or language-specific content; overlays (§6) are where that lives.
- No bundled mockup framework; plain HTML throwaway mockups stay as they are.

## 5. Proposed layout of v2

```
software-factory/
├── SKILL.md                 router (~200 lines): when to run, tiers, the protocol, standing
│                            rules, index into references/ — keeps every v1 rule
├── references/
│   ├── gates.md             gate-by-gate guidance with the reasoning, banned words, examples
│   ├── proof.md             proof kinds, UNVERIFIED rule, code-tour format
│   ├── research.md          what deep-enough research looks like; spikes; subagent use
│   └── overlay-contract.md  how other skills extend the gates (see §6)
├── assets/templates/        copied verbatim by plan.py init, hand-copyable without it
│   ├── 00-status.md  00-research.md  01-product.md  02-architecture.md
│   ├── 03-program-design.md  04-slices.md  05-log.md  plan.md (Lite)  adr.md
├── scripts/
│   └── plan.py              init | status | check — stdlib only
├── evals/                   test cases (§7), skill-creator case-folder format
└── DESIGN.md                this proposal, renamed once accepted; then the decision record
```

`SKILL.md` stays readable top to bottom without opening anything else; the references hold the
"why" and the long examples.

## 6. Compatibility

**Existing plan folders.** `docs/plans/slide-forge-composer/` and `slide-forge-motion/` must
still resume under v2 without edits. They will: the status line format is unchanged, the new
status sections are optional, and a missing `05-log.md` simply means the log starts now.

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
- new in v2 and available to overlays: the research artifact, the proof standard, the Lite tier
  (an overlay may require Full), and the `plan.py check` hook for extra lint rules.

The VS Code skill's "condensed protocol (only if software-factory is unavailable)" needs no
change for v2, since every v1 rule it restates survives.

## 7. Implementation and evaluation plan

Done with the skill-creator loop, on this branch:

1. **Snapshot the baseline.** The v1 `SKILL.md` already committed here is the baseline skill
   for every eval run (`old_skill/` configuration).
2. **Write v2** per §4–§5. SKILL.md first, then references, templates, `plan.py` with its own
   small test (init → check passes; a Gate 1 doc with "endpoint" in it → check fails).
3. **Test cases** (evals/, one folder each, prompts only at first):
   - `feature-on-small-repo` — a feature request against a tiny fixture repo. Expected: research
     summary, `00-status.md` + `01-product.md` written, no code, the approval question asked,
     tier offered.
   - `resume-mid-plan` — fixture `docs/plans/<slug>/` with Gates 1–2 approved and Gate 3 absent.
     Expected: Gate 1 and 2 not redone, Gate 3 doc produced, status updated.
   - `trivial-tweak-skips` — a rename. Expected: no plan folder, the task just done.
   - `lite-tier-medium-task` — a medium task where the user asks for the light version.
     Expected: single `plan.md`, one approval, slices follow.
   - `slice-proof-unverifiable` — a slice whose proof tool is unavailable in the fixture.
     Expected: UNVERIFIED reported, slice not checked off, log entry.
4. **Run with-skill (v2) and old-skill (v1) in parallel**, grade with assertions on the files
   produced (these are objectively checkable: files exist, banned words absent from Gate 1,
   approval question asked verbatim, no `src/` changes before Gate 4), aggregate, open the
   viewer for Trevor's review, iterate.
5. **Description optimization** last, with the trigger eval set reviewed by Trevor.
6. **Update `README.md` and `CLAUDE.md`** to list the skill; open the PR to `master`.

Package as `software-factory.skill` (gitignored, like the others). Name stays `software-factory`;
`metadata.version` becomes `2.0.0`.

## 8. Open decisions for Trevor

1. **Lite tier (upgrade 1):** include it, or keep v1's binary full-or-skip? It is the only
   proposal that touches the spirit of "never merge gates", even though the user opts in.
2. **Research as its own phase (upgrade 2):** always for brownfield, or only when the agent
   judges the code non-trivial?
3. **Comprehension checkpoints (upgrade 5):** ask the user to open a file every third slice, or
   only provide the code tour and leave the nudge to judgement?
4. **`plan.py` (upgrade 9):** worth having, or keep the skill script-free and template-only?
5. **Commit rhythm (upgrade 8):** state it in the skill, or leave version control entirely to
   the host repo's rules?
6. Anything from the two real runs you remember wanting that §2 missed.

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
