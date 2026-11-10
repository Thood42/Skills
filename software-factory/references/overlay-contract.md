# Overlay contract

Other skills can layer domain content onto these gates — for example a skill for one platform
that adds its own sections to each gate doc and its own review before each approval. This file
says what such a skill may rely on, what it may add, and what it must leave alone.

## Contents
- What is stable
- What an overlay may add
- What an overlay must not do
- When both skills are loaded
- Changes from v1

## What is stable

An overlay can depend on these not changing within a major version:

- **The four gates and their order**: Product, Architecture, Program Design, Vertical Slices.
  No implementation code before the slice plan is approved.
- **The approval question**: "Approve Gate N, or what should change?" Anything but a clear yes
  means revise and ask again.
- **File names in the plan folder**: `00-status.md`, `00-research.md`, `01-product.md`,
  `02-architecture.md`, `03-program-design.md`, `04-slices.md`, `mockups/`.
- **Top-level headings** in each gate doc, as in `assets/templates/`.
- **Status file shape**: gate lines of the form `- Gate N — <name>: pending | in progress |
  APPROVED <date>` before the first heading; slice lines of the form `- [ ] Slice N — <title>`
  under `## Slices`.
- **Slice entries**: `## Slice N — <title>` with `- What:`, `- Tests:`, `- Proof:`,
  `- Needs user present:`, `- Points:`, `- Work item:`, `- Tasks:`.
- **The slice commit trailer**: `Plan: <slug> slice N`.
- **The resume rule**: status first, then the gate docs, continue from the first unapproved
  gate or unchecked slice.

## What an overlay may add

- **Sections in a gate doc.** Add headings; do not rename or remove the existing ones. If a
  template section does not fit the domain (a desktop extension has no endpoints), write
  "none" under it and add the domain's own section beside it.
- **A verdict before the approval question.** One line, ahead of the stable question:
  "Best-practice review: PASS. Approve Gate 2, or what should change?"
- **An `## Overlay` section in `00-status.md`** that the overlay owns. Keep it short; the status
  file is read at every resume.
- **Extra lint rules.** `plan.py check <slug> --gate N --rules <file.json>` takes a list of
  rules:

  ```json
  [
    { "file": "02-architecture.md", "pattern": "^## Contribution points", "present": true,
      "gate": 2, "level": "error", "message": "Gate 2 needs a Contribution points section" }
  ]
  ```

  `pattern` is a regular expression matched per line; `present: false` forbids a match.
- **A gate before each slice commit.** An overlay may require its own review to pass between
  proving a slice and `plan.py commit`. A slice that fails it is not committed as done; if it
  cannot be made to pass, it is recorded as unverified with the reason.
- **"Needs user present" on more slices**, for risks specific to the domain.
- **A stricter tier.** An overlay may require Full and refuse Lite.
- **Work-item fields.** Through `workItems.mapping` in the settings, or by post-processing
  `work-items.json`.
- **Rows in the close-out harvest**, for durable files the overlay maintains.
- **Its verdict on the plan home page.** Anything the overlay appends to a gate document under
  its own `##` heading appears on the home page as a commentable section.

## What an overlay must not do

- Merge, reorder or skip gates, or approve a gate on the user's behalf.
- Assume where the plan folder is. Ask the script: `plan.py path <slug>`. Under v2 the default
  location is the plan store, not `docs/plans/<slug>/`.
- Put planning files on a code branch. Durable outputs follow `knowledge.md`: they state the
  present or record a decision in force.
- Weaken the proof standard or report an unverified slice as done.
- Write to a tracker without the user's go-ahead for that plan.

## When both skills are loaded

The overlay names this skill and adds to it; this skill's protocol runs. Where the overlay's
text says `docs/plans/<slug>/`, read it as "the plan folder". Where the two give different
instructions on a point this file lists as stable, this skill wins; on domain content, the
overlay wins.

A condensed copy of the protocol inside an overlay, for use when this skill is not installed,
should say which version it was condensed from. A v1 condensation still describes a valid run:
it produces an in-tree plan with a stop after every slice.

## Changes from v1

For authors of overlays written against v1:

| v1 | v2 |
| --- | --- |
| Plan folder is always `docs/plans/<slug>/` | Plan store by default; a folder already at `docs/plans/<slug>/` is still used in place |
| Stop after every slice and ask whether to continue | Slices run without stopping and close-out follows the last one; pauses only for needs-user-present, unverified proof, backtracking or a test that cannot honestly pass |
| Progress notes accumulate in `00-status.md` | The slice commit message is the record; the status file stays a short state file |
| Slice plan is one line per slice | Structured slice entries with proof, estimate and tasks |
| No research artifact | `00-research.md` |
| ADRs optional | Close-out harvest into the architecture doc and ADRs |
| — | Lite tier, work-item hierarchy, walkthrough pages |
