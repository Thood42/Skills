# The gates in detail

## Contents
- What a gate is for
- The approval summary
- Reviews sent from the plan home page
- Gate 1 — Product
- Gate 2 — Architecture
- Gate 3 — Program Design
- Gate 4 — Vertical Slices
- The Lite tier
- Backtracking

## What a gate is for

Each gate produces one document a person can read in a few minutes and answer with "right" or
"wrong". The order matters because each gate narrows the next: product decides what is worth
building, architecture decides how it fits the system, program design decides the shape of the
code, and slices decide the order it gets built in. Deciding them out of order means deciding
the later ones blind.

The gates exist because structural decisions are cheapest at the start and because an agent,
left alone, makes them silently in the middle of implementation. Nothing in a model's training
punishes a poor design that happens to pass its tests. The gate is where a human supplies that
judgement, while changing course still costs one sentence.

Write each gate doc from its template in `assets/templates/`. Keep the template's headings:
other skills and the helper script rely on them. Replace every `<placeholder>`; where a section
does not apply, write "none" rather than leaving it. `plan.py check <slug> --gate N` reports
anything left over.

## The approval summary

When a gate doc is ready, the user sees a summary, not the document:

- 5–10 bullets, each one a **decision** ("Export is a download, not an email") rather than a
  description of the document ("The doc covers export options").
- The plan home page link, so they can read the whole document, comment on any section and
  sign off in one place.
- Anything you are unsure about, stated as a question they can answer.
- Then the exact question: **"Approve Gate N, or what should change?"**

Lead with the decisions most likely to be wrong. A summary that only lists safe choices wastes
the one moment the user is paying attention.

## Reviews sent from the plan home page

The home page lets the user review properly instead of replying from memory: every section of
every gate document has a comment box, and when a gate is waiting there is a three-way decision
— approve, approve with the changes in the comments, or changes needed. Two buttons send it
back. "Copy review for chat" puts it on the clipboard to paste into the conversation;
"Download review file" saves it for `plan.py review <slug>` to pick up.

A pasted review looks like this:

```
Plan review: Payment export (pay-export), Gate 2 — Architecture
Decision: Approve, with the changes in my comments
Overall: Good direction.
Comments (2):
1. [02-architecture.md › Data] Keep the month as text, not a date.
2. [02-architecture.md › Decisions] Say why a spreadsheet package was rejected.
```

How to act on one:

- **Approve** — a clear yes. Any comments are notes: answer them, then record the approval.
- **Approve, with the changes in my comments** — fold every comment into the document, record
  the approval with one `--amend` per change, and tell the user what each became. Ask again
  only where a change altered a decision they have not seen in its new form.
- **Changes needed** — revise the document for every comment and ask the approval question
  again. The home page will show the gate as waiting once more.
- **No decision** while a gate is waiting — address the comments and ask again.
- **Feedback with nothing waiting** (comments on approved gates or on slices) — answer each. A
  comment that overturns an approved decision is a backtrack; a correction to built work is a
  post-ship slice.

Always reply comment by comment: quote or number it, say what changed, or say why it was not
changed. A comment that is silently dropped teaches the user that the page is not worth using.

`plan.py review` warns when the plan changed after the review was written. Say so, and check
each comment still points at something that exists before acting on it.

The review file counts because the user said in the conversation that they sent it. Do not go
looking for review files and act on them unprompted.

## Gate 1 — Product

The only gate with a ban list. Databases, schemas, endpoints, architecture, file names,
languages and libraries do not appear. The reason is that the moment tech enters, the
conversation becomes about how, and the question of whether this is the right thing to build
never gets asked. If a technical thought comes up, write it down for Gate 2 and keep going.

- **Problem** — in the end-user's own words, as a quote if you have one. If it reads like a
  developer's ticket, rewrite it.
- **Success metric** — one number tied to the business and how it will be measured. For
  internal tools: minutes saved per task, weekly users, tickets on the workflow replaced. If
  nobody can say how it will be measured, say so plainly; that is a finding.
- **Announcement** — the blog post before the feature, three to six sentences to users. If it
  cannot be written, the feature is not understood yet.
- **Scope** — in, out, and deferred. "Deferred" is the valuable one: it records things the user
  wants that this plan deliberately does not deliver, so nobody slips them back in mid-build.
- **Riskiest assumption** — the belief that, if false, makes this the wrong thing to build.
- **Rough size** — a story-point range. The user decides whether to build at all at this gate,
  and that decision should have a cost beside it. See `work-items.md` for the scale.
- **Screens** — for anything with a UI, one plain HTML file per screen in `mockups/`. No
  framework, no build step, throwaway by design. Iterate with the user until they say "yes,
  that." Open each mockup and look at it before showing it. For no UI, write "no UI".

## Gate 2 — Architecture

Read the code first. On an existing project that reading is the research phase
(`research.md`); the architecture doc must describe a fit with the system as it is, not as you
imagine it.

- **Fit** — which existing modules or services this touches, and how.
- **Endpoints** — route, verb, purpose, one line each, or "none".
- **Data** — new or changed tables or collections, with outlines of the queries that will hit
  them. The queries matter: a table designed without its queries is designed for nothing.
- **Flow** — the call order for the main path, end to end.
- **External** — third-party APIs, environment variable **names** (never values), webhooks.
- **Decisions** — one line each: "<decision> — instead of <alternative> — because <reason>".
  Only real forks belong here, the ones a reasonable engineer might have taken the other way.
  At close-out each becomes an ADR, so write them to be read cold.
- **Load-bearing bets** — assumptions the design rests on. Each should be proven by a spike
  before the gate is presented, or marked "unproven" so the user sees the risk.
- **Where a human must stay in the loop** — auth, billing, public API changes, data deletion,
  migrations, anything irreversible or expensive to get wrong. Slices that touch these are
  marked "Needs user present: yes" in Gate 4. Autonomy should not run ahead of what can be
  cheaply and reliably checked.

On a fresh project this gate is the architecture. When it is approved, seed the architecture
doc and the first ADR from it (`plan.py harvest <slug> --stubs`, then fill them in).

## Gate 3 — Program Design

The step everyone skips, and the one that saves the most. It captures what the agent would
otherwise decide alone, mid-implementation, where nobody sees it.

- **Files** — every file created or changed, with a line on why it lives there.
- **Types & signatures** — code blocks with types and method signatures and **no bodies**. A
  reader should be able to say "right" or "wrong" in seconds.
- **Call stack** — for each main flow, what calls what, top to bottom.
- **Test plan** — numbered test names and what each asserts, written before any test exists.
  Number them; slices refer to tests by number.
- **Least confident decisions** — a numbered list of the calls most worth challenging while
  changing them is free. Be honest here. It is the most useful section for the reviewer.

## Gate 4 — Vertical Slices

`04-slices.md` lists slices in build order. One line per slice is not enough; each entry holds:

```markdown
## Slice 3 — reject exports for a locked month
- What: export returns a clear refusal when the month is locked
- Tests: 4, 5
- Proof: run the suite; run the export against a locked month and show the refusal
- Needs user present: no
- Points: 1 (basis: one rule, two tests, touches the export module only; confidence: high)
- Work item:
- Tasks:
  - add the locked-month rule — 0.5
  - tests 4 and 5 — 0.5
```

Rules:

- **Slice 1 is the tracer bullet.** Mocked or hardcoded, but wired through every layer and
  running. It proves the path exists before anything real is built on it. On a fresh project
  it also creates the skeleton, the test runner and whatever is needed to run the result.
- **Slice 2** makes the single happy path real.
- **Slice 3 onward**, one capability per slice, each ending working and testable.
- **No horizontal building.** A plan whose first three slices are "data layer", "services" and
  "API" has nothing to show until the fourth. Re-cut it.
- **Proof is named now**, not after the slice is built. A slice whose proof cannot be named is
  not understood yet. `proof.md` lists what counts.
- **Needs user present** follows from Gate 2's human-in-the-loop list.
- **Points** follow `work-items.md`. An unestimated slice blocks the gate.
- Put `- Plan and design: <points>` at the top for the research and gate work itself; a
  person's review time is real effort.

The summary for this gate includes the slice list, the total points, and any slice that needs
the user present. `plan.py work-items <slug>` prints the breakdown.

## The Lite tier

Lite is for work big enough to deserve a decision on paper but not four meetings. One file,
`plan.md`, with four sections — Product, Architecture, Program design, Slices — and one
approval for the whole thing.

- Every section is required. Each may be a few lines.
- The Product section still bans tech talk, for the same reason.
- No mockups. If the work needs mockups, it needs Full.
- Slices use the same entry format as Full, with `###` headings, the same proof rule and the
  same estimates.
- The approval question is "Approve the plan, or what should change?" and it is recorded with
  `plan.py gate <slug> plan approved`.
- If writing the plan turns up a decision the user ought to weigh on its own — a data model, a
  public interface, something irreversible — say so and move to Full from that gate onward.

## Backtracking

Later work sometimes shows an approved decision was wrong. When it does:

1. Stop. Do not patch around it in code.
2. Fix the earlier gate doc.
3. `plan.py gate <slug> N in-progress`.
4. Present what changed and why, and ask the approval question for that gate again.
5. Re-estimate any slices the change touches, keeping the old number visible in the doc.

A plan that never backtracks was either very lucky or not being honest with itself.
