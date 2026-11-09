---
name: software-factory
description: "Dex Horthy's four-gate feature workflow — Product, Architecture, Program Design, Vertical Slices — with the user's explicit approval at every gate before any implementation code exists, then slices built autonomously, each proven, committed and given an HTML review walkthrough. Plans live in a separate plan store so code branches stay clean, the work is broken into an Agile work-item hierarchy with story-point estimates for Azure DevOps or Jira, and lasting decisions are harvested into an architecture doc and ADRs. Use whenever the user starts a new feature or a new project, asks to plan, spec, scope, estimate or design something before building it, wants a PRD, design doc, slice plan or work-item breakdown, says to resume or continue an existing plan, or gives any task that will change several files or produce a large diff, even if they never say the word plan. Not for trivial tweaks like renames, copy changes or one-line config edits."
compatibility: Python 3.8+ and git for the helper script (scripts/plan.py). Without them the workflow still runs by copying the templates by hand.
metadata:
  version: "2.0.0"
---

# The Software Factory Playbook

Dex Horthy's (HumanLayer) workflow: make every important decision **before** implementation
code exists, where changing it costs a sentence instead of a rewrite. Four gates, in order,
each one a cheap document a human can review in minutes. Models pay no penalty for bad design
on their own; the gates are the penalty. A bad line in a plan becomes hundreds of bad lines of
code, so the user's attention is spent on research and plans, and the code follows.

**Full tier:** stop at each gate for explicit approval. Never merge gates. Never write
implementation code before the Gate 4 slice plan is approved. After that, slices run on their
own, and each one leaves proof, a commit and a review page behind.

## When to run it

Run the workflow when the task is a real feature: it will create or change several files, add
an endpoint, table or screen, or produce a diff the user would hate to review in one go
(roughly 100+ lines).

Skip it entirely and just do the task when any of these hold:

- Trivial tweak: rename, typo, copy change, style tweak, small config edit.
- The user says to skip the process ("just vibe it", "quick and dirty", "no process").
- The user says the code is throwaway or pure prototyping.

When the task qualifies, **offer a tier** in one line and let the user choose; never pick
silently. Propose Full for anything that adds a screen, endpoint, table or external dependency,
Lite otherwise:

- **Full** — four gate documents, four approvals. As described below.
- **Lite** — one `plan.md` holding the same four sections, one approval, no mockups. Every
  section is still required because each one forces a decision; each may be a few lines. If a
  Lite plan turns up a decision the user should see on its own, move to Full from that gate.
  Never move from Full to Lite on your own.

If unsure whether the task qualifies at all, ask once: "This looks big enough for the gated
workflow — Full, Lite, or just do it?" Respect the answer.

## The helper script

`scripts/plan.py` does the bookkeeping in single calls so your context goes to the thinking.
Run it from the user's repository with this skill's directory as the prefix:

```
python <skill-dir>/scripts/plan.py <command> [--json]
```

| When | Command | What it saves you |
| --- | --- | --- |
| First contact with a repo | `config` | Detects fresh vs existing project, default branch, commit style, where the architecture doc and ADRs live |
| Starting a plan | `init <slug> [--lite] --title "…"` | Mounts the plan store, copies the templates, cuts the feature branch |
| Starting research | `context --area <path>` | Architecture doc, ADRs in force, earlier plans, estimate history in one read |
| Any session start | `status <slug>` then `digest <slug>` | The next action, then a compact view of every gate doc |
| Before asking for approval | `check <slug> --gate N`, then `gate <slug> N in-progress` | Lints the gate doc, marks it as awaiting sign-off and refreshes the plan home page |
| The user says they sent a review | `review <slug>` | Reads the review they exported from the home page, records it, lists every comment |
| After the user answers | `gate <slug> N approved [--amend "…"] [--decision "…"]` | Records the approval, amendments and overrides, commits the plan state |
| After each slice | `commit <slug> --slice N …` then `walkthrough <slug> --slice N` | The structured commit, the ticked checkbox, the review page |
| Slice plan drafted | `work-items <slug> [--export ado\|jira]` | The work-item hierarchy, totals and import file |
| After the last slice | `harvest <slug>` … `harvest <slug> --done`, `check <slug> --closeout` | What the default branch should keep, and proof nothing else leaked onto it |

`<command> --help` lists every option. If Python or git is missing, copy the files in
`assets/templates/` into `docs/plans/<slug>/` by hand and keep the same file names and rules.

## Where things live

Two places, with different jobs. `references/plan-store.md` and `references/knowledge.md` have
the detail.

- **The plan store holds the working papers.** By default an orphan `plans` branch of the same
  repository, mounted as a folder at `.plans/` and ignored by the code branches. Each plan is a
  folder there. `plan.py path <slug>` prints it; always use that rather than assuming a path.
  A plan that already lives at `docs/plans/<slug>/` (the v1 layout) is used where it is.
- **The default branch states the present.** Code, an architecture doc that describes the
  system as it is now, the decisions currently in force (ADRs), and a short section in the
  agent file. No plan documents, no mockups, no walkthrough pages, no change history.

```
<plan folder>/
  00-status.md          state file: tier, gate approvals, slice checklist, user decisions,
                        amendments, version control, work items, pointers
  00-research.md        what is true today, constraints, spikes
  01-product.md         Gate 1      mockups/   one plain HTML file per screen
  02-architecture.md    Gate 2
  03-program-design.md  Gate 3
  04-slices.md          Gate 4: slices with proof, estimate and tasks
  05-work-items.md      generated view of the work-item hierarchy (+ work-items.json)
  reviews/              reviews the user sent from the home page, as received
  walkthrough/          generated pages, never committed:
    index.html          the plan home page (below)
    slice-N.html        one review page per built slice
```

**The plan home page.** Every plan has one page that shows all of it: where it stands and
whether anything is waiting on the user, every gate document in full, the slices with their
review pages, the work items and the decisions taken. The script regenerates it whenever the
plan's state changes and prints its path as `plan home page: …`. Give the user that one link
whenever you report on a plan. On it they can comment on any section or slice, choose a
decision when a gate is waiting, and send it all back with one button — see the approval
protocol. It is a static file: they reload it to see the latest state, or switch on "Live
updates" to have it refresh itself during a meeting. It has light and dark themes and prints
cleanly, so it is the thing to put on screen when a wider group reviews the plan.

**Resume rule.** At the start of any session where a plan exists for the feature being
discussed, run `status` and `digest` before anything else, then continue from the first
unapproved gate or the first unchecked slice. Never redo an approved gate unless the user asks
or a later gate invalidated it. Entries under "Decisions taken by the user" are settled: do not
reopen or quietly undo them.

**Keep `00-status.md` short.** It is a state file, read at every resume. History goes in
commits, reasoning goes in the gate docs. If it passes about 80 lines, something is in the
wrong place.

## Starting a plan

1. `plan.py init <slug> --title "<feature name>"` (add `--lite` for Lite). Read its output: it
   says whether this is a **fresh** or an **existing** project, what conventions it found, and
   which branch it created. Tell the user all three in one or two lines so they can correct
   any of them.
2. **Existing project → research first.** Run `plan.py context --area <path>` and read the
   code the feature touches. Fill `00-research.md`: how it works today with file:line
   references, measured baselines, defects marked reproduced or inferred, constraints carried
   in, open questions. Research is not a gate, but show the user a short summary of it. See
   `references/research.md` for how deep is deep enough and for spikes.
3. **User-supplied context that is meant to be exclusive** (a spec, a ticket, "use only this")
   → skip codebase research. Point `00-research.md` at that context, list the constraints it
   states, and design against it without going looking for more.
4. **Fresh project → nothing to research.** Record the user's context and constraints. The
   first plan's Gate 2 becomes the architecture doc, and slice 1 also stands up the project
   skeleton and the test runner so that later slices have something to prove against.

## The approval protocol (every gate)

1. Write the gate doc from its template. Run `plan.py check <slug> --gate N` and fix what it
   reports.
2. `plan.py gate <slug> N in-progress`. The home page now shows this gate as waiting on the
   user, with its document open for comment.
3. Present a summary: at most 5–10 bullet decisions, then the plan home page link as the place
   to read the full document, comment and sign off. Do not paste the whole doc into chat.
4. Ask exactly: **"Approve Gate N, or what should change?"** (Lite: "Approve the plan, or what
   should change?")
5. The answer can arrive three ways, and each is the user's answer:
   - typed in the conversation;
   - a review pasted from the home page (it starts "Plan review:" and carries a decision and
     numbered comments);
   - the user saying they downloaded or submitted their review — then run
     `plan.py review <slug>`, which finds the file, records it and lists the comments.

   A review file you find on disk is **not** an answer until the user says in the conversation
   that they sent it. When an answer carries comments, deal with every one and say in your
   reply what you did with each: changed, or not changed and why.
6. Three outcomes (for Lite, the gate name is `plan` in place of N):
   - **A clear yes** → `plan.py gate <slug> N approved`.
   - **Yes, with a change** → fold the change into the doc, then
     `plan.py gate <slug> N approved --amend "<what changed>"`. Ask again only if the change
     alters a decision the user has not seen in its new form.
   - **Anything else** → revise the doc to address the answer and ask again.
7. Whenever the user chooses against your recommendation, record it with
   `--decision "<what they chose> — <their reason>"`. Those are the decisions a later session
   is most likely to undo by being helpful.
8. **Backtracking:** if later work shows an approved decision is wrong, stop, fix the earlier
   doc, set that gate back with `plan.py gate <slug> N in-progress`, and get it re-approved
   before continuing.

The script records approvals; it never grants them. Only the user's answer in the conversation
approves a gate.

## The gates

Templates are in `assets/templates/`; `references/gates.md` has the reasoning, examples and the
Lite equivalents. The rules that matter most:

**Gate 1 — Product (no tech talk).** The problem in the end-user's words, one real success
metric and how it is measured, the announcement written before the feature, scope (in / out /
deferred), the riskiest assumption, and a rough size in story points. Databases, schemas,
endpoints, architecture and file names are banned here; if tech appears, it belongs in Gate 2.
For anything with a UI, make one plain HTML file per screen in `mockups/` — no framework,
throwaway by design — and iterate until the user says "yes, that."

**Gate 2 — Architecture.** Read the real code before writing; never design against an imagined
codebase. Fit, endpoints, data, flow, external dependencies (env var names, never values). Also:
the decisions made with the alternative each one beat, the load-bearing bets and the spike that
proved each, and where a human must stay in the loop (auth, billing, public API, deletion,
anything irreversible).

**Gate 3 — Program Design (the step everyone skips).** Every file created or changed, types
and signatures with no bodies, the call stack, a numbered test plan written before any test
exists, and the least confident decisions. These are the choices that would otherwise be made
silently mid-implementation.

**Gate 4 — Vertical Slices.** One entry per slice in build order, each with what it delivers,
the Gate 3 tests it turns green, the proof named in advance, whether the user must be present,
an estimate, and its tasks.

- **Slice 1 is the tracer bullet:** mocked or hardcoded, but wired end to end and running where
  the user can see it.
- **Slice 2** replaces the mocks with real logic for the single happy path.
- **Slice 3+** one capability each — a rule, error handling, an edge case — each ending in a
  working, testable state.
- **Banned:** horizontal building (all the data layer, then all services, then all UI, with
  nothing testable until the end).
- **Estimates** are story points of *human* effort: 1 point = one 8-hour block to do the work
  by hand. Scale 0.5, 1, 2, 3, 5, 8; a slice over 8 gets split. Give each a basis and a
  confidence. Low confidence usually means research or a spike is missing.
- The Gate 4 summary includes the work-item breakdown and the total, so approving the slice
  plan approves the estimate. See `references/work-items.md`.

## Building slices

Once the slice plan is approved, build the slices one after another **without stopping to ask**.
For each slice:

1. Build it. Tests first where the test plan names them.
2. **Prove it** the way the slice said it would be proven: run it, test it, measure it. Read
   `references/proof.md` once before the first slice. Reasoning is not proof.
3. Stage the slice's changes and record it:
   ```
   python <skill-dir>/scripts/plan.py commit <slug> --slice N \
     --proof-kind test-output --proof "<what ran, and the result>" \
     --tour "<where the new logic lives, the one function to read, what was surprising>" \
     [--notes "<test traps, tool quirks>"] [--trailer "<attribution line your environment requires>"]
   ```
   The commit message is the historical record of the slice. Longer text can be passed as
   `@file`.
4. `plan.py walkthrough <slug> --slice N` renders the review page for that slice alone and
   refreshes the plan walkthrough.
5. Read the script's last line. `CONTINUE` → next slice. `PAUSE` → stop and tell the user why.

**Pause only when:**

- the next slice is marked "Needs user present: yes";
- a slice could not be proven — record it with `--unverified "<reason>"`, never as done. Report
  it plainly. It is ticked only once it is proven (`--proof-only`) or the user accepts it in
  words (`--accepted-by-user`);
- a slice shows an approved gate was wrong — backtrack through the approval protocol;
- a test cannot be made to pass honestly.

When the last slice is done, report once: slices completed, the plan home page link, anything
unverified, and what close-out will do.

**Comments on built slices.** The user can comment on any slice from the home page at any
time. Treat each comment as feedback on finished work: a correction becomes a further slice
under Post-ship in the slice plan and goes through the same build, prove, commit loop; a
comment that shows an approved gate was wrong is a backtrack. Never amend a slice's commit to
absorb a comment — the next commit is the record of the change.

**Why the walkthrough matters.** Running slices without stopping only works if the user can
still follow the code. Teams that stopped reading what their agents wrote found out late, when
the agent hit a bug it could not solve and nobody else understood the system either. The code
tour and the per-slice page are how the user stays oriented. Write the tour for someone who
will read ten lines and no more.

## Close-out

After the last slice and before any talk of a pull request:

1. `plan.py harvest <slug>` lists what the plan owes the default branch: architecture as built,
   one ADR per decision (including every decision the user took), guarded areas, baselines,
   test traps for the agent file. `--stubs` creates the missing files.
2. Make those edits and commit them as the **last commit on the feature branch**. The
   architecture doc is rewritten in place to describe the present. Delete any section you
   cannot fill. See `references/knowledge.md`.
3. `plan.py harvest <slug> --done`, then `plan.py check <slug> --closeout`. The check fails if
   any planning file is tracked on the code branch.
4. Tell the user the feature is ready, with the walkthrough path. Push, open a pull request or
   merge only when asked.

Bugs found in real use after shipping are added to `04-slices.md` under Post-ship as further
slices and go through the same build, prove, commit, walkthrough loop.

## Standing rules

- **Version control.** By default the work happens on a new branch cut from the repository's
  default branch, one commit per slice. The user can override any of it: `init --no-branch`
  stays on the current branch, `--branch <name>` and `--base <branch>` choose others, and
  "Override: no commits" in the status file makes `plan.py commit` tick the slice without
  committing. Record the override under "Version control" in the status file and honour it in
  every later session. The repository's own commit rules always apply. Never push, open a pull
  request or merge unless asked.
- **Compact at every boundary.** Each gate and each slice ends with everything decided written
  down — nothing important may exist only in chat. A fresh session must be able to continue
  from the plan store and git alone. Aim to keep context use around the middle of the window
  (roughly 40–60%); at a boundary above that, tell the user this is a safe point to start a
  fresh session, or stop cleanly at the boundary if no user is present and the harness cannot
  compact.
- **Real tests only.** Never write a test that passes against the pre-change code — a test
  that cannot fail tests nothing. Never comment out, skip or weaken a test to get to green.
- **Trackers.** Linking to existing work items and producing an import file are always fine.
  Creating or changing items in Azure DevOps, Jira or any tracker needs the user's go-ahead for
  that plan, every time.
- **Other skills' plans.** When another skill layers its own content onto these gates (see
  `references/overlay-contract.md`) and names `docs/plans/<slug>/` as the plan folder, read
  that as "the plan folder" — whatever `plan.py path` prints.

## Reference files

| File | Read it when |
| --- | --- |
| `references/gates.md` | Writing any gate doc; the Lite equivalents; what a good approval summary looks like |
| `references/research.md` | Before research on an existing project; spikes; exclusive context; using a subagent |
| `references/proof.md` | Before the first slice; any time a proof is in doubt; writing the code tour |
| `references/work-items.md` | Drafting Gate 4 estimates; linking to Azure DevOps or Jira; exporting |
| `references/plan-store.md` | Anything about where plans live: modes, mounting, pushing, migrating a v1 folder |
| `references/knowledge.md` | Close-out; fresh versus existing projects; architecture doc and ADR rules |
| `references/overlay-contract.md` | Another skill extends these gates, or you are writing one that does |
