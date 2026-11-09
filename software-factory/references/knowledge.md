# Durable knowledge: what the default branch keeps

## Contents
- The rule
- Where long-term knowledge lives
- Fresh project or existing one
- The architecture doc
- ADRs: decisions in force
- The close-out harvest
- What the next plan reads
- Common mistakes

## The rule

The default branch is clean and relevant to the current state of the code. It answers "how
does this system work and what are we committed to?" It does not answer "how did we get here?"
— git and the plan store answer that.

So when a plan finishes, a small part of it is carried onto the default branch and the rest
stays behind. The test for each piece: **will a future decision or a future session go wrong
without it?** If yes, it is written down as a present-tense fact or a decision in force. If no,
it stays in the plan store.

The failure this prevents is a real one: a later feature whose notes say "read the old plan's
status file first, its sizing rules are load-bearing". Knowledge that later work depends on must
never be left in a plan.

## Where long-term knowledge lives

Defaults are below. **A repository's own convention wins**: `plan.py config` reports the
architecture doc, ADR folder and agent file it found, and those are used as they are.

| Location | Holds | How it changes |
| --- | --- | --- |
| `docs/architecture.md` | The system as it is now | Rewritten in place |
| `docs/adr/NNNN-<slug>.md` | Decisions currently in force | A new file per decision; superseded ones leave |
| `AGENTS.md` or `CLAUDE.md` (whichever exists; `AGENTS.md` if neither) | How to build, test and run; tool quirks; pointers to the two above and to the plan store | One short delimited section maintained by this skill; the rest of the file is the user's |
| `docs/external/` | Things outside the repository an agent needs to know exist: environment variable names, dashboards, test accounts | Updated when they change |

## Fresh project or existing one

`plan.py init` classifies the repository from its history and source files and says which it
found. Tell the user in one line; they may know better.

| | Fresh project | Existing project |
| --- | --- | --- |
| Research | None. Record the user's context and constraints. | The research phase, starting from `plan.py context`. |
| Architecture doc | **Seeded from the first plan's Gate 2 as soon as that gate is approved.** That gate is the architecture. | Used if present. If absent, write a baseline for **the area this feature touches only**. The doc grows one feature at a time. |
| ADRs | The first ADR records the foundational choices (stack, structure, test approach) at Gate 2. | Existing folder, numbering and format adopted. No ADRs invented after the fact for old decisions. |
| Slice 1 | The tracer bullet also stands up the skeleton, the test runner and a way to run the result, so every later slice has something to prove against. | The tracer bullet runs through the existing structure. |
| Conventions | The defaults here. | Detected and followed: default branch, commit style, docs locations, tracker. |

Never turn an existing project's first plan into a documentation project. Describing code the
feature does not touch is unrequested work and is usually wrong in the details.

For a fresh project at Gate 2 approval: `plan.py harvest <slug> --stubs` creates the
architecture doc, an ADR stub per recorded decision and the agent-file section. Fill them in
from the approved gate and commit them with slice 1.

## The architecture doc

It states the present. Rules that keep it that way:

- **Edit in place.** When the system changes, the description changes. Nothing is appended as a
  dated entry.
- **No history.** No dates, no "previously", no "as of", no plan names as required reading. If
  a sentence explains how something came to be, it belongs in an ADR's context section.
- **Only what is known.** Delete any template section you cannot fill. An empty heading or a
  leftover placeholder is worse than no heading.
- **Name the paths.** Put a `Paths:` line under each section that describes code
  (`Paths: src/export/, src/store.py`). `plan.py check --closeout` flags sections whose paths
  no longer exist, which is how stale descriptions get found.
- **Split when long.** Past about 300 lines, move areas into `docs/architecture/<area>.md` and
  keep the top file as the overview and index.

Sections (use the ones that apply): purpose and context · modules and boundaries · data · key
flows · external dependencies · invariants and baselines · guarded areas · conventions · open
questions.

Two sections carry weight for later plans. **Invariants and baselines** holds what must stay
true — budgets, test baselines, compatibility promises — so the next plan's research finds them
without archaeology. **Guarded areas** lists where a human must stay in the loop, and the next
plan's Gate 4 uses it to mark slices that need the user present.

## ADRs: decisions in force

One file per decision, from `assets/templates/adr.md`:

- **Context** — the situation and forces at the time. This is the one place history belongs.
- **Decision** — what was decided, stated so it can be read cold.
- **Alternatives rejected** — what else was on the table and why not. Without this a later
  session will propose the rejected option again.
- **Consequences** — what it makes easier, harder, or commits the project to.
- **Revisit when** — a concrete trigger: "when exports exceed 50,000 rows", "if a second
  payment provider is added". A decision with no trigger gets either reopened constantly or
  never.

What deserves an ADR: each line in Gate 2's Decisions section, every entry under "Decisions
taken by the user" (the user chose against a recommendation; a later session will make the
same recommendation unless it is written down), and any "least confident" item from Gate 3 that
was settled and matters beyond this feature.

**Superseding.** When a new decision replaces an old one, the new ADR's `Supersedes:` line
names it, and the old file leaves the default branch:

```
plan.py supersede docs/adr/0007-store-exports-as-xml.md --by 0012
```

moves it to the store's `adr-archive/` and stages the removal. The ADR folder then lists only
what currently binds the code, and the archive keeps the full chain. This departs from the
usual practice of keeping superseded ADRs in place; it follows from the rule at the top of this
file. If the user's team prefers the usual practice, keep the file and set its status to
superseded instead.

## The close-out harvest

This runs straight after the last slice, without asking the user first, and before any pull
request. It needs no approval because it decides nothing: everything it writes down was agreed
at a gate. If a slice is still unverified, the run is paused and close-out waits.

1. `plan.py harvest <slug>` prints what the plan owes the default branch and where each piece
   goes. `--stubs` creates any missing file.
2. Make the edits.
3. Commit them as the **last commit on the feature branch**. It is the only content derived
   from planning that reaches a code pull request, so a reviewer sees the description of the
   system change alongside the code that changed it.
4. `plan.py harvest <slug> --done` records the commit, logs the estimates and closes the
   plan's index line. If the plan changed nothing durable, say so instead:
   `plan.py harvest <slug> --none "<why>"`.
5. `plan.py check <slug> --closeout`.
6. Report to the user once: what was built, the plan home page, which sections of the
   architecture doc changed, which ADRs were written or superseded, and anything unverified.

| Part of the plan | Needed later? | Goes to |
| --- | --- | --- |
| Gate 2 fit, endpoints, data, flow | Yes, as current state | Architecture doc, edited in place |
| Gate 2 decisions and their alternatives | Yes | An ADR each |
| Decisions taken by the user | Yes, most of all | An ADR each |
| Gate 3 least-confident items that were settled and outlive the feature | Yes | An ADR, or a line under conventions |
| Gate 2 human-in-the-loop list | Yes | Architecture doc → guarded areas |
| Research: constraints, measured baselines, bets that held | Yes | Architecture doc → invariants and baselines |
| Test traps and tool quirks from slice commit notes | Yes | Agent file → working notes |
| Gate 1 deferred scope | Yes, as work | Tracker backlog if linked; otherwise architecture doc → open questions |
| Gate 1 announcement | Sometimes | The changelog or release notes, if the repository keeps one |
| Estimates against what happened | Yes, for estimating | `estimates.csv` in the plan store (written by `--done`) |
| Gate 3 files, signatures, test plan | No — the code and tests are the truth now | Plan store only |
| Slice list, status, work-item breakdown | No — git and the tracker hold it | Plan store only |
| Mockups, walkthroughs, problem statement, success metric | No | Plan store only |

The harvest makes no new decisions. Everything in it was approved at a gate, so it needs no
approval of its own; list it in the final report.

## What the next plan reads

`plan.py context --area <path>` returns, in one call: the architecture sections for that area,
the ADRs in force, the agent file's working notes, earlier plans that touched the same paths,
and how past estimates compared with reality.

Earlier plans are background. If one seems to contain something binding that is not in the
architecture doc or an ADR, that is a gap in a past harvest: fix it now by writing the fact
where it belongs, and mention it to the user.

## Common mistakes

- **Copying the gate docs into `docs/`.** They are working papers. Harvest the conclusions.
- **Writing the architecture doc as a changelog.** "Added an export module" is history. "Exports
  are produced by `src/export/`" is architecture.
- **An ADR per trivial choice.** If nobody would ever argue for the alternative, it is not a
  decision worth recording.
- **Leaving stubs.** A stub ADR with placeholder sections fails `check --closeout`. Fill it or
  delete it.
- **Documenting the whole codebase** on an existing project's first plan. Describe what the
  feature touched.
