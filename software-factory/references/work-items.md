# Work items and estimates

## Contents
- What this gives the user
- The hierarchy
- Estimating in story points
- Where the numbers live
- Linking to a tracker
- Exporting an import file
- Writing to a tracker directly
- Keeping states in step

## What this gives the user

The plan, expressed the way their team tracks work: a hierarchy of items with a size on each,
tied to items in Azure DevOps or Jira. It falls out of the gates rather than being written
separately. Gate 1 supplies the feature and its description, Gate 4 supplies the stories, Gate
3's files and tests supply the tasks.

## The hierarchy

Azure DevOps **Agile process** by default, with Jira alongside:

| Plan artefact | Azure DevOps (Agile) | Jira | Notes |
| --- | --- | --- | --- |
| A programme the plan belongs to | Epic | Epic | Optional. Always an existing item the user names; never created here. |
| The plan | Feature | Epic | Title from the plan; description is the Gate 1 announcement. |
| The planning work itself | User Story "Plan and design" | Story | Research, the gates and their reviews. A person's review time is effort. |
| One slice | User Story | Story | Acceptance criteria are the slice's proof and the tests it turns green. |
| A unit of work inside a slice | Task | Sub-task | From the slice's `Tasks:` list. |
| A post-ship fix (`- Kind: bug`) | Bug | Bug | |

A slice is a story, not a task, because a slice ends in a working state the user can see, which
is what a story is.

**Lite tier** is one level flatter: the plan is a User Story and its slices are Tasks.

**Other processes.** Set `workItems.process` with
`plan.py config --set workItems.process=scrum` (Product Backlog Item), `cmmi` (Requirement) or
`basic` (Epic → Issue → Task). For a custom scheme, set `workItems.mapping`, for example
`plan.py config --set workItems.mapping='{"story":"Change Request"}'`. The breakdown itself
does not change, only the names.

## Estimating in story points

**1 point = one 8-hour block of human effort to do the work by hand.** The estimate is for a
competent engineer who knows the codebase, writing the code and its tests and getting it
reviewed. It is deliberately not agent time: a team's planning and velocity are built on human
effort, and that is the number they can compare with everything else on their board.

Scale: **0.5, 1, 2, 3, 5, 8.** Over 8 means the slice is too big to be one slice; split it.

| Points | Roughly | Typical shape |
| --- | --- | --- |
| 0.5 | half a day | one file and its test; a tracer bullet through existing layers |
| 1 | a day | one rule or one screen state with tests, inside one module |
| 2 | two days | touches two or three modules, or one new integration point |
| 3 | most of a week's focus | a new piece with real unknowns, or a data change with migration |
| 5 | a week | probably two slices pretending to be one; justify it or split |
| 8 | the ceiling | only with a stated reason it cannot be cut |

For each estimate give:

- **Basis** — what it counts: files, tests, integration points, unknowns. "Two files, three
  tests, one new query" lets a reviewer disagree usefully.
- **Confidence** — high, medium or low. Low confidence is information: it usually means the
  research did not reach that area or a spike is missing. Say so rather than padding the number.

Two estimates appear in a plan:

- **A rough range at Gate 1** ("5–8 points"), from the scope alone. It exists so the decision
  to build has a cost next to it.
- **Firm points per slice at Gate 4**, when the files and tests are known. Approving the slice
  plan approves these. `plan.py check --gate 4` refuses an unestimated slice.

If the store holds history (`plan.py context` reports it as estimate calibration), use it: if
past stories ran 1.4 times their estimate, say so next to the total.

When a gate is reopened, re-estimate the slices it touches and leave the old number visible in
the slice entry ("Points: 2 (was 1; the lock rule also applies to drafts)").

## Where the numbers live

`04-slices.md` (or the Slices section of a Lite `plan.md`) is the single source:

```markdown
- Plan and design: 1

## Slice 2 — real rows
- Points: 2 (basis: store read, row format, two tests; confidence: medium)
- Work item: 5002
- Tasks:
  - read payments for a month — 1
  - format rows and totals — 0.5
  - tests 2 and 3 — 0.5
```

`plan.py work-items <slug>` turns that into `05-work-items.md` (a readable table with the
total) and `work-items.json` (the same data for tools). Both are regenerated whenever a gate is
approved or a slice is committed. Edit the slice plan, never the generated files.

Task points should add up to no more than their slice. Tasks are optional; a slice with none is
exported as a story alone.

## Linking to a tracker

When the user names existing items, record them and let everything else follow:

- In `00-status.md` under **Work items**: `- Tool: ado` (or `jira`), `- Feature: 4321` for the
  item this plan corresponds to, `- Epic: 4000` for its parent if they gave one.
- In each slice: `- Work item: 5002` once a story exists for it.
- Task IDs: `plan.py work-items <slug> --link slice-2.task-1=5010`.

From then on `plan.py commit` puts the reference in each slice commit's subject — `AB#5002` for
Azure Boards, the issue key such as `PAY-117` for Jira — which both tools turn into a link from
the work item to the commit.

Items the user named are **linked, not created**: they are marked as existing and nothing here
changes them.

## Exporting an import file

`plan.py work-items <slug> --export ado` or `--export jira` writes a CSV into the plan folder
for the tool's bulk import. Nothing is sent anywhere.

- **Azure DevOps** — hierarchy through indented `Title 1`, `Title 2`, `Title 3` columns, with
  `Work Item Type`, points in `Story Points` on stories (the equivalent field for other
  processes), `Effort` on the feature and hours in `Original Estimate` on tasks.
- **Jira** — `Issue ID` and `Parent` columns, parents listed before children, points in
  `Story Points`, task time in `Original Estimate` in seconds.

Tell the user two things when handing the file over. First, to try it on a test project or with
two or three rows before importing the lot, because field names and required fields vary with
how a tracker is configured, and company-managed Jira projects may want an epic-link column
instead of `Parent`. Second, that a row carrying an existing ID updates that item on import,
including its title, so that row should be checked or removed first.

## Writing to a tracker directly

Where a connector or command-line tool for the tracker is available, items can be created and
updated directly instead of through a file. Doing so changes a board other people rely on, so:

- Ask first, for this plan, naming what will be created ("1 feature link, 5 stories, 9 tasks
  under Feature 4321"). An earlier yes for another plan does not carry over.
- Create only what the breakdown contains. Never touch items it does not mention.
- Write the IDs that come back into the slice plan and the status file, then run
  `plan.py work-items <slug>` so the JSON matches.

Without that go-ahead, the import file is the deliverable.

## Keeping states in step

`work-items.json` mirrors progress: New → Active → Closed (To Do → In Progress → Done for
Jira), driven by gate approvals and slice ticks. If the user has approved direct writes, apply
those state changes to the tracker as slices complete; otherwise mention at close-out that the
board needs updating and regenerate the export.
