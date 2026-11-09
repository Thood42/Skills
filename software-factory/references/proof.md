# Proof, honesty and the code tour

## Contents
- Why this matters more once slices run on their own
- What counts as proof
- Naming the proof in advance
- When the proof cannot be produced
- Test traps
- The code tour
- The walkthrough pages

## Why this matters more once slices run on their own

After the slice plan is approved nobody is watching each slice land. The user's trust rests on
two things you leave behind: evidence that the slice works, and an explanation short enough
that they will read it. If either is weak, the speed gained by not stopping is borrowed against
the day something breaks and nobody understands the code.

## What counts as proof

In order of strength. Use the strongest one available, and say which kind it is with
`--proof-kind`.

| Kind | What it is | Example of the `--proof` text |
| --- | --- | --- |
| `test-output` | The tests named for the slice were run and passed | "pytest tests/test_export.py: 6 passed in 0.4s (tests 4 and 5 new; both failed before the change)" |
| `command-output` | The thing itself was run and its output observed | "`tool export 2026-03` printed a 12-row CSV with the header date,amount,payee" |
| `measured` | A value was read from the running system | "last list item starts at 0.64s; 9 distinct delays for 9 items" |
| `screenshot` | An image of the running result was captured and looked at | "screenshot of the export dialog shows the locked-month message" |

Not proof:

- Reasoning. "The logic handles the empty case" is a claim about the code, not an observation
  of it. The script refuses a slice recorded this way.
- A test that passes against the code as it was before the change. A test that cannot fail
  tests nothing. Where a test is new, say that it failed first.
- A proof of something adjacent. Passing unit tests do not show the screen renders.

Put the result in the proof text, not just the command. "Ran the tests" says nothing; "6
passed" says something.

## Naming the proof in advance

Each slice names its proof in `04-slices.md` before it is built. That does two things: it shows
at Gate 4 whether the slice is concrete enough to be checked at all, and it stops the proof
from being chosen afterwards to fit whatever happened to work.

If the planned proof turns out to be the wrong one, use a better one and say in `--notes` why
it changed.

## When the proof cannot be produced

Sometimes the environment cannot run the thing: no browser, no network, a service that is not
reachable, a test runner that will not start. Then:

1. Try the next kind down the table. No screenshot? Measure values from the page. No browser?
   Run what can be run headless.
2. If nothing that touches the running result is possible, record the slice as **UNVERIFIED**:

   ```
   plan.py commit <slug> --slice N --unverified "<what could not be run, and why>" --tour "…"
   ```

   The code is committed so the work is not lost. The slice is **not** ticked, the run pauses,
   and the walkthrough shows it in red.
3. Tell the user plainly: what was built, what could not be checked, what they can run to check
   it.
4. It becomes done in one of two ways. Either it is proven later
   (`plan.py commit <slug> --slice N --proof-only --proof-kind … --proof "…"`), or the user
   says in words that they accept it
   (`plan.py commit <slug> --slice N --proof-only --unverified "<reason>" --accepted-by-user "<their words>"`).

Never report an unverified slice as done, and never pick a weaker claim to avoid saying
"unverified". A missing proof stated honestly costs a minute. A false "done" costs the user's
trust in every other tick on the list.

## Test traps

Environments lie in repeatable ways: a hidden browser tab that never advances animations, a
preview that reports reduced motion, a command that must run from a particular folder. When you
hit one, write it in `--notes`. It lands in the commit, the next slice's author (possibly you,
in a fresh session) sees it in the log, and close-out moves it into the agent file so the
project stops rediscovering it.

## The code tour

The tour is three to ten lines for a reader who will read those lines and nothing else. It
answers:

- **Where does the new logic live?** File and function.
- **If I read one thing, what should it be?** Name it.
- **What was surprising?** Anything that did not go the way the plan said, any shortcut taken,
  anything that looks wrong but is deliberate.
- **What did this slice deliberately not do?** So nobody goes looking for it.

Do not narrate the diff; the page shows the diff. Do not praise the code. Write what a
colleague would want to hear before reviewing it.

Example:

> The rule lives in `export/rules.py::is_locked`; `export_month` calls it before reading
> anything. Read `is_locked` — it treats a month with no close record as open, which is the
> behaviour the product gate asked for but looks like a bug at first glance. Nothing here
> handles partial months; that is slice 5.

## The walkthrough pages

`plan.py walkthrough <slug> --slice N` writes two self-contained pages into the plan folder's
`walkthrough/` directory:

- `slice-N.html` — that slice only: what it set out to do, the tour, the proof, the files
  changed and the diff of that slice's commit.
- `index.html` — the plan walkthrough: gate states, every slice with its state and a link,
  decisions the user took, anything unverified, and each gate doc folded away underneath.

Both are generated entirely from the slice commit and the plan folder, which is why the tour
and proof go in the commit message. They are never committed to a code branch and can be
re-rendered at any time. Give the user the path to `index.html` in the final report.
