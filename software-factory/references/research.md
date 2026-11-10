# Research

## Contents
- Why research is its own phase
- Which kind of start this is
- What goes in `00-research.md`
- How deep is deep enough
- Spikes
- Using a subagent
- Showing it to the user

## Why research is its own phase

A plan is only as good as its picture of the code. The best-documented failure of this style of
work is a plan that looked sound and was built on research that did not go deep enough: the
design assumed something about the system that was not true, and nobody found out until the
implementation was most of the way in.

Research gets its own artifact so that the picture is written down where the user can correct
it, and so that the architecture gate cites evidence instead of a memory of having read some
files.

## Which kind of start this is

| Situation | What to do |
| --- | --- |
| **Existing project**, no special instruction | Research the area the feature touches. Start with `plan.py context --area <path>`, then read the code. |
| **The user supplies the context and means it to be exclusive** — a spec, a ticket, a design doc, "work from this only" | Do not research the codebase beyond what is needed to place files. Set "Context source" to the pointer, list the constraints that context states, and design against it. If it contradicts what you can plainly see, say so once and let the user decide. |
| **Fresh project** | Nothing to research. Record the user's context and constraints. `plan.py init` writes "fresh project: nothing to research" for you. |

When it is unclear whether supplied context is meant to be exclusive, ask once.

## What goes in `00-research.md`

- **Context source** — which of the three starts above.
- **How it works today** — the relevant paths through the code, with `file:line` references.
  What calls what, where the data lives, where the feature will attach.
- **Measured baseline** — numbers obtained by running something, with the method, so the
  measurement can be repeated after the change. "31 of 62 layouts animate" beats "many".
- **Defects found** — each marked **REPRODUCED** (and how) or **INFERRED** (and from what).
  The distinction matters: inferred defects have a habit of not existing.
- **Constraints carried in** — budgets, test baselines, tool quirks, conventions the feature
  must not break.
- **Spikes** — see below.
- **Predecessors** — earlier plans or ADRs that bind this work. An ADR in force is binding. An
  earlier plan is background only; if something in it still binds, it should have been
  harvested, and noticing that it was not is itself a finding.
- **Open questions for the user** — numbered, so they can answer by number.

## How deep is deep enough

Deep enough means you could answer these without opening the code again:

1. Where exactly does the new behaviour attach, and what calls that place?
2. What existing behaviour could this break, and which test would notice?
3. What does the code already do that the feature can reuse?
4. Which of your beliefs about this area did you verify by running something, and which did you
   only read?

If the fourth answer is "none were run", the research is a reading, not a finding. Run
something.

Stop when further reading stops changing the design. Research has no approval gate precisely so
that it can be as short as the feature allows.

## Spikes

A spike is a throwaway experiment that tests an assumption the architecture will rest on. Use
one whenever the design depends on a claim that is cheap to check and expensive to be wrong
about: that a container already carries the attribute you plan to key on, that a query is fast
enough, that a library does what its documentation says.

- Do it before writing the Gate 2 doc, so the gate is presented with the bet already proven.
- Record it in `00-research.md`: the assumption, what was run, the result.
- Throw the code away. A spike that turns into the implementation skipped Gates 2 to 4.
- If the spike fails, that is the cheapest possible moment to learn it. Redesign.

## Using a subagent

Where the environment offers subagents, research is a good use of one: it reads widely and only
the conclusion needs to come back. Give it the area, the questions above and the template, and
have it return the filled research doc. Read what comes back critically; it is a report, and the
claims marked as run should say what was run.

Without subagents, do the research inline and keep your notes in the doc rather than in the
conversation.

## Showing it to the user

Research is not a gate and needs no approval. Still, give the user five lines or so before Gate
1: what you found, anything surprising, and the open questions. A person's attention is worth
most at the research and plan stages, and a wrong assumption caught here costs nothing.
