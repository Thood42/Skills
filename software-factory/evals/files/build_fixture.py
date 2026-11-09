#!/usr/bin/env python3
"""Builds the working directory for one eval case.

    python build_fixture.py <case-name> <target-dir>

Every case starts from the same small project ("tasktrack", a command-line to-do list) and
adds what the case needs: a plan at a particular stage, existing conventions, slice commits.
Plans are created through scripts/plan.py so the fixtures are in exactly the state the skill
would have left them in. Standard library only.
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLAN = HERE.parent.parent / "scripts" / "plan.py"
ENV = dict(os.environ, SF_TODAY="2026-10-20", PYTHONIOENCODING="utf-8")


def sh(args, cwd):
    r = subprocess.run(args, cwd=str(cwd), capture_output=True, text=True, encoding="utf-8", errors="replace", env=ENV)
    if r.returncode != 0:
        sys.exit("fixture step failed: %s\n%s%s" % (" ".join(map(str, args)), r.stdout, r.stderr))
    return r.stdout.strip()


def plan(repo, *args):
    return sh([sys.executable, str(PLAN), *args], repo)


def write(p, text):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(text.lstrip("\n"))


def commit(repo, message, add=True):
    if add:
        sh(["git", "add", "-A"], repo)
    sh(["git", "commit", "-q", "-m", message], repo)


# ----------------------------------------------------------------------------- the project

STORE_PY = '''
"""Tasks are kept in one JSON file: a list of {"id", "title", "done"} records."""
import json
import os

DEFAULT_PATH = os.environ.get("TASKTRACK_FILE", "tasks.json")


def load(path=None):
    path = path or DEFAULT_PATH
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(tasks, path=None):
    with open(path or DEFAULT_PATH, "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)


def add(title, path=None):
    tasks = load(path)
    task = {"id": max((t["id"] for t in tasks), default=0) + 1, "title": title, "done": False}
    tasks.append(task)
    save(tasks, path)
    return task


def complete(task_id, path=None):
    tasks = load(path)
    for task in tasks:
        if task["id"] == task_id:
            task["done"] = True
            save(tasks, path)
            return task
    raise KeyError(task_id)
'''

CLI_PY = '''
"""Command line: tasktrack add "title" | list | done <id>"""
import argparse
import sys

from . import store


def build_parser():
    parser = argparse.ArgumentParser(prog="tasktrack")
    sub = parser.add_subparsers(dest="command", required=True)
    p_add = sub.add_parser("add", help="add a task")
    p_add.add_argument("title")
    sub.add_parser("list", help="list tasks")
    p_done = sub.add_parser("done", help="mark a task done")
    p_done.add_argument("id", type=int)
    return parser


def format_task(task):
    return "[%s] %d  %s" % ("x" if task["done"] else " ", task["id"], task["title"])


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.command == "add":
        task = store.add(args.title)
        print("added %d" % task["id"])
    elif args.command == "list":
        for task in store.load():
            print(format_task(task))
    elif args.command == "done":
        try:
            store.complete(args.id)
        except KeyError:
            print("no task %d" % args.id, file=sys.stderr)
            return 1
    return 0
'''

MAIN_PY = '''
import sys

from .cli import main

sys.exit(main())
'''

TEST_STORE = '''
import os
import tempfile
import unittest

from tasktrack import store


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "tasks.json")

    def tearDown(self):
        self.dir.cleanup()

    def test_add_assigns_increasing_ids(self):
        first = store.add("one", self.path)
        second = store.add("two", self.path)
        self.assertEqual((first["id"], second["id"]), (1, 2))

    def test_complete_marks_done(self):
        task = store.add("one", self.path)
        store.complete(task["id"], self.path)
        self.assertTrue(store.load(self.path)[0]["done"])

    def test_complete_unknown_id_raises(self):
        with self.assertRaises(KeyError):
            store.complete(99, self.path)


if __name__ == "__main__":
    unittest.main()
'''

README = '''
# tasktrack

A small command-line to-do list.

    python -m tasktrack add "write the report"
    python -m tasktrack list
    python -m tasktrack done 1

Tasks are saved in `tasks.json` in the current folder (set `TASKTRACK_FILE` to use another file).

Run the tests with `python -m unittest discover -s tests`.
'''


def mk_repo(dest, branch="main"):
    dest = Path(dest).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    sh(["git", "init", "-q", "-b", branch], dest)
    sh(["git", "config", "user.name", "Eval User"], dest)
    sh(["git", "config", "user.email", "eval@example.invalid"], dest)
    sh(["git", "config", "commit.gpgsign", "false"], dest)
    write(dest / ".gitignore", "__pycache__/\ntasks.json\n")
    write(dest / "tasktrack" / "__init__.py", '"""tasktrack: a small command-line to-do list."""\n')
    write(dest / "tasktrack" / "store.py", STORE_PY)
    commit(dest, "feat: task store")
    write(dest / "tasktrack" / "cli.py", CLI_PY)
    write(dest / "tasktrack" / "__main__.py", MAIN_PY)
    commit(dest, "feat: command line")
    write(dest / "tests" / "__init__.py", "")
    write(dest / "tests" / "test_store.py", TEST_STORE)
    commit(dest, "test: store")
    write(dest / "README.md", README)
    commit(dest, "docs: readme")
    return dest


# ----------------------------------------------------------------------------- gate doc builders

def product(title, problem, metric, announce, s_in, s_out, deferred, risk, size, screens="no UI"):
    return """
# Product: %s

## Problem
%s

## Success metric
%s

## Announcement — the blog post before the feature
%s

## Scope
- In: %s
- Out: %s
- Deferred: %s

## Riskiest assumption
%s

## Rough size
%s

## Screens
%s
""" % (title, problem, metric, announce, s_in, s_out, deferred, risk, size, screens)


def architecture(title, fit, data, flow, decisions, bets, human, endpoints="none", external="none"):
    return """
# Architecture: %s

## Fit
%s

## Endpoints
%s

## Data
%s

## Flow
%s

## External
%s

## Decisions
%s

## Load-bearing bets
%s

## Where a human must stay in the loop
%s
""" % (title, fit, endpoints, data, flow, external, decisions, bets, human)


def design(title, files, sigs, calls, tests, least):
    return """
# Program Design: %s

## Files
%s

## Types & signatures
```python
%s
```

## Call stack
%s

## Test plan
%s

## Least confident decisions
%s
""" % (title, files, sigs, calls, tests, least)


def slices(title, plan_points, entries):
    out = ["# Slices: %s" % title, "",
           "Build order. 1 point = one 8-hour block of human effort to do the work by hand.", "",
           "- Plan and design: %s" % plan_points, ""]
    for i, e in enumerate(entries, 1):
        out += ["## Slice %d — %s" % (i, e["title"]), "- What: %s" % e["what"], "- Tests: %s" % e["tests"],
                "- Proof: %s" % e["proof"], "- Needs user present: %s" % e.get("user", "no"),
                "- Points: %s" % e["points"], "- Work item:", "- Tasks:"]
        out += ["  - %s" % t for t in e.get("tasks", [])]
        out.append("")
    out += ["## Post-ship", ""]
    return "\n".join(out)


def research(title, source, today, baseline="none", defects="none", constraints="none", spikes="none"):
    return """
# Research: %s

## Context source
%s

## How it works today
%s

## Measured baseline
%s

## Defects found
%s

## Constraints carried in
%s

## Spikes
%s

## Predecessors
none

## Open questions for the user
none
""" % (title, source, today, baseline, defects, constraints, spikes)


TODAY_TASKTRACK = ("`tasktrack/cli.py:9` builds the argument parser; `main` (`tasktrack/cli.py:25`) dispatches on "
                   "`args.command`. Tasks are plain dicts loaded and saved whole by `tasktrack/store.py:8` and "
                   "`:16`. `format_task` (`cli.py:21`) renders one line per task.")
CONSTRAINTS = ("Standard library only. `python -m unittest discover -s tests` passes (3 tests) and must keep passing. "
               "The saved file must stay readable by older versions: new fields are optional.")


def approve(repo, slug, *gates):
    for g in gates:
        plan(repo, "gate", slug, g, "approved")


# ----------------------------------------------------------------------------- cases

def case_feature_on_small_repo(d):
    mk_repo(d)


def case_trivial_tweak_skips(d):
    mk_repo(d)


def case_lite_tier_medium_task(d):
    mk_repo(d)


def case_exclusive_context_skips_research(d):
    r = mk_repo(d)
    write(r / "specs" / "reminders-spec.md", """
# Reminders — specification (agreed with the team, 2026-10-12)

## What
A task can carry a reminder time. `tasktrack remind` prints every task whose reminder time has
passed and which is not done, oldest first.

## Rules
1. `tasktrack add "title" --remind "2026-11-03 09:00"` stores the reminder. Local time, minute precision.
2. A task without a reminder never appears in `tasktrack remind`.
3. Completing a task silences its reminder.
4. An unparseable time is rejected with a message and exit code 2; nothing is saved.
5. Files written by older versions (no reminder field) keep loading.

## Out of scope
Notifications, recurring reminders, time zones.

## Done when
The five rules each have a test, and the README documents both commands.
""")
    commit(r, "docs: reminders specification")


V1_STATUS = """
# Status: Due dates

- Gate 1 — Product: APPROVED 2026-10-14
- Gate 2 — Architecture: APPROVED 2026-10-15
- Gate 3 — Program Design: pending
- Gate 4 — Slice plan: pending

## Slices

## Notes for a fresh session
- The user wants overdue tasks listed first, then the rest in the order they were added.
- Dates only, no times: decided at Gate 1 on 2026-10-14.
"""


def case_resume_mid_plan(d):
    r = mk_repo(d)
    p = r / "docs" / "plans" / "due-dates"
    write(p / "00-status.md", V1_STATUS)
    write(p / "01-product.md", """
# Product: Due dates

## Problem
"I add things to the list and then miss them, because nothing tells me what is late."

## Success metric
Tasks completed after their date, counted from the saved list each Friday: 9 last month, target 3.

## Announcement — the blog post before the feature
tasktrack now understands deadlines. Give a task a date when you add it, and the list shows what is
overdue at the top, marked so you cannot miss it. Ask for only the overdue ones when that is all
you want to see.

## Screens
no UI
""")
    write(p / "02-architecture.md", """
# Architecture: Due dates

## Fit
Touches `tasktrack/store.py` (a task gains an optional `due` field) and `tasktrack/cli.py` (an
option on `add`, a marker in `list`, a new `overdue` command). A new module `tasktrack/dates.py`
holds parsing and comparison so the store stays free of date logic.

## Endpoints
none

## Data
One optional field per task: `"due": "2026-11-03"` (ISO date string, absent when not set). Older
files load unchanged because the field is read with a default.

## Flow
`add --due` → `dates.parse` → `store.add(title, due=...)`. `list` → `store.load` →
`dates.is_overdue(task, today)` → overdue first, then the rest in insertion order.

## External
none
""")
    commit(r, "docs: due dates plan, gates 1-2 approved")


LIST_FILTER_SLICES = [
    {"title": "tracer bullet: a status option that reaches a filter function",
     "what": "`list --status open|done|all` is accepted and passed to a new `filter_tasks(tasks, status)` in the store module, which for now returns every task unchanged",
     "tests": "1",
     "proof": "run the test suite; run `python -m tasktrack list --status done` and show it exits 0",
     "points": "0.5 (basis: one option, one new function, one test; confidence: high)",
     "tasks": ["add the option and wire it through — 0.25", "test 1 — 0.25"]},
    {"title": "real filtering",
     "what": "`filter_tasks` returns only open or only done tasks; `all` and no option keep today's output",
     "tests": "2, 3",
     "proof": "run the test suite; add two tasks, complete one, and show that `list --status done` prints only the completed one",
     "points": "0.5 (basis: one function body, two tests; confidence: high)",
     "tasks": ["implement the filter — 0.25", "tests 2 and 3 — 0.25"]},
]


def plan_list_filter(r):
    plan(r, "init", "list-filter", "--title", "Filter the list by status")
    p = Path(plan(r, "path", "list-filter"))
    write(p / "00-research.md", research("Filter the list by status", "codebase research", TODAY_TASKTRACK,
                                         constraints=CONSTRAINTS))
    write(p / "01-product.md", product(
        "Filter the list by status",
        '"Once I have forty tasks the finished ones bury the ones I still have to do."',
        "Lines a person has to read to find their open tasks, counted on the team's shared list: 43 today, at most the number of open tasks (11) after.",
        "tasktrack can now show just what is left to do. Ask the list for open tasks and the finished ones step aside; ask for done ones when you want to see what you got through.",
        "choosing open, done or all when listing", "sorting, searching by text", "remembering the last choice",
        "People want a filter rather than finished tasks being hidden by default.", "1–2 points"))
    write(p / "02-architecture.md", architecture(
        "Filter the list by status",
        "Touches `tasktrack/cli.py` (one option on `list`) and `tasktrack/store.py` (one pure function).",
        "No change to what is saved.",
        "`list --status X` → `store.load` → `store.filter_tasks(tasks, X)` → `format_task` per line.",
        "- Filter in a pure function in the store module — instead of inside the command handler — because it can be tested without the command line",
        "- none: nothing here rests on an untested assumption",
        "nowhere"))
    write(p / "03-program-design.md", design(
        "Filter the list by status",
        "- tasktrack/store.py: add `filter_tasks`\n- tasktrack/cli.py: `--status` on the `list` subparser, pass it through\n- tests/test_filter.py: new",
        "def filter_tasks(tasks: list, status: str = \"all\") -> list: ...",
        "cli.main → store.load → store.filter_tasks → cli.format_task",
        "1. test_filter_all_returns_everything — `all` returns the input list\n2. test_filter_open_excludes_done — only tasks with done false\n3. test_filter_done_excludes_open — only tasks with done true",
        "1. `all` as the default value rather than no filtering argument at all"))
    write(p / "04-slices.md", slices("Filter the list by status", "0.5", LIST_FILTER_SLICES))
    approve(r, "list-filter", "1", "2", "3", "4")
    return p


def case_autonomous_slices_with_walkthrough(d):
    r = mk_repo(d)
    plan_list_filter(r)


def case_slice_proof_unverifiable(d):
    r = mk_repo(d)
    plan(r, "init", "overdue-digest", "--title", "Daily digest to the team channel")
    p = Path(plan(r, "path", "overdue-digest"))
    write(p / "00-research.md", research("Daily digest to the team channel", "codebase research", TODAY_TASKTRACK,
                                         constraints=CONSTRAINTS + " The team channel's incoming address is given at run time in the TASKTRACK_WEBHOOK_URL environment variable; it is not set on development machines."))
    write(p / "01-product.md", product(
        "Daily digest to the team channel",
        '"Nobody opens the list. If it does not show up where we already talk, it does not get done."',
        "Open tasks older than a week, counted every Monday: 14 today, target 5.",
        "tasktrack can now tell your team what is still open. One command sends a short summary of open tasks to your team channel, so the list comes to you.",
        "a summary of open tasks sent to one channel on request", "scheduling, per-person summaries", "choosing which tasks are included",
        "The team reads the channel more reliably than they open the list.", "2–3 points"))
    write(p / "02-architecture.md", architecture(
        "Daily digest to the team channel",
        "New module `tasktrack/digest.py` (build the text, send it); one new subcommand in `tasktrack/cli.py`.",
        "No change to what is saved.",
        "`digest` → `store.load` → `digest.build_text` → `digest.send(text, url)` → HTTP POST to the channel's incoming address.",
        "- Send with the standard library's urllib — instead of adding the requests package — because the project has no dependencies today",
        "- The channel accepts a JSON body with a `text` field: unproven (cannot be reached from a development machine)",
        "Sending to the real channel: it is visible to the whole team.",
        external="The channel's incoming address, from the environment variable TASKTRACK_WEBHOOK_URL."))
    write(p / "03-program-design.md", design(
        "Daily digest to the team channel",
        "- tasktrack/digest.py: new — `build_text`, `send`\n- tasktrack/cli.py: `digest` subcommand, `--dry-run` prints instead of sending\n- tests/test_digest.py: new",
        "def build_text(tasks: list) -> str: ...\ndef send(text: str, url: str, opener=None) -> int: ...  # returns the HTTP status",
        "cli.main → store.load → digest.build_text → digest.send",
        "1. test_build_text_lists_open_tasks — done tasks are left out\n2. test_build_text_empty — says there is nothing open\n3. test_send_posts_json — the injected opener receives a JSON body with a text field",
        "1. Injecting the opener for tests rather than patching urllib"))
    write(p / "04-slices.md", slices("Daily digest to the team channel", "1", [
        {"title": "tracer bullet: a digest command that prints the summary",
         "what": "`tasktrack digest --dry-run` builds the summary text from the saved tasks and prints it; nothing is sent",
         "tests": "1, 2", "proof": "run the test suite; run `python -m tasktrack digest --dry-run` and show the text",
         "points": "0.5 (basis: one module, two tests; confidence: high)"},
        {"title": "send the digest to the team channel",
         "what": "without `--dry-run`, the summary is posted to the address in TASKTRACK_WEBHOOK_URL; a missing variable is a clear error",
         "tests": "3",
         "proof": "run the test suite; then post once to the real address and confirm the message appears in the team's #tasks channel",
         "points": "1 (basis: one function, one test, one external call that cannot be exercised locally; confidence: medium)"},
    ]))
    approve(r, "overdue-digest", "1", "2", "3", "4")
    write(r / "tasktrack" / "digest.py", '''
"""Build the open-task summary for the team channel."""


def build_text(tasks):
    open_tasks = [t for t in tasks if not t["done"]]
    if not open_tasks:
        return "Nothing open. Nice."
    lines = ["%d open task(s):" % len(open_tasks)] + ["- %s" % t["title"] for t in open_tasks]
    return "\\n".join(lines)
''')
    cli = (r / "tasktrack" / "cli.py").read_text(encoding="utf-8")
    cli = cli.replace("from . import store", "from . import digest, store")
    cli = cli.replace('    p_done = sub.add_parser("done", help="mark a task done")',
                      '    p_digest = sub.add_parser("digest", help="summarise open tasks for the team channel")\n'
                      '    p_digest.add_argument("--dry-run", action="store_true", help="print instead of sending")\n'
                      '    p_done = sub.add_parser("done", help="mark a task done")')
    cli = cli.replace('    elif args.command == "done":',
                      '    elif args.command == "digest":\n'
                      '        text = digest.build_text(store.load())\n'
                      '        if args.dry_run:\n'
                      '            print(text)\n'
                      '        else:\n'
                      '            print("sending is not built yet; use --dry-run", file=sys.stderr)\n'
                      '            return 1\n'
                      '    elif args.command == "done":')
    write(r / "tasktrack" / "cli.py", cli)
    write(r / "tests" / "test_digest.py", '''
import unittest

from tasktrack import digest


class DigestTextTest(unittest.TestCase):
    def test_build_text_lists_open_tasks(self):
        text = digest.build_text([{"id": 1, "title": "a", "done": False}, {"id": 2, "title": "b", "done": True}])
        self.assertIn("- a", text)
        self.assertNotIn("- b", text)

    def test_build_text_empty(self):
        self.assertIn("Nothing open", digest.build_text([]))


if __name__ == "__main__":
    unittest.main()
''')
    plan(r, "commit", "overdue-digest", "--slice", "1", "--all", "--proof-kind", "test-output",
         "--proof", "python -m unittest discover -s tests: 5 tests OK (2 new; both failed before digest.py existed). "
                    "`python -m tasktrack digest --dry-run` printed 'Nothing open. Nice.' on an empty list.",
         "--tour", "The summary text is built in tasktrack/digest.py::build_text; read that. cli.py only wires the "
                   "`digest` subcommand to it. Without --dry-run the command refuses on purpose: sending is slice 2.")


def case_work_items_hierarchy_and_points(d):
    r = mk_repo(d)
    plan(r, "init", "recurring-tasks", "--title", "Recurring tasks")
    p = Path(plan(r, "path", "recurring-tasks"))
    write(p / "00-research.md", research("Recurring tasks", "codebase research", TODAY_TASKTRACK, constraints=CONSTRAINTS))
    write(p / "01-product.md", product(
        "Recurring tasks",
        '"Every Monday I retype the same six chores. I forget one about once a month."',
        "Repeating chores missed in a month, from the team's own tally: 4 today, target 0.",
        "tasktrack now repeats what repeats. Mark a task as daily, weekly or monthly, and when you finish it the next one is already on your list with the right date.",
        "daily, weekly and monthly repeats; the next task appears when the current one is completed",
        "custom intervals, skipping an occurrence", "pausing a repeat",
        "People want the next occurrence created on completion rather than on a calendar schedule.", "3–5 points"))
    write(p / "02-architecture.md", architecture(
        "Recurring tasks",
        "Touches `tasktrack/store.py` (optional `repeat` and `due` fields; `complete` creates the next task), `tasktrack/cli.py` (`--repeat` on `add`), and a new `tasktrack/recur.py` for the date arithmetic.",
        "Two optional fields per task: `repeat` (daily | weekly | monthly) and `due` (ISO date). Absent on older files, which keep loading.",
        "`add --repeat weekly` → `store.add`. `done 3` → `store.complete` → if the task repeats, `recur.next_due` → `store.add` for the next occurrence.",
        "- Create the next occurrence when the current one is completed — instead of generating occurrences on a schedule — because nothing runs in the background today\n- Month arithmetic clamps to the last day of the month — instead of rolling into the next month — because that is what people expect of a monthly chore",
        "- Completing a task and adding the next one can be written in a single save: proven by spike (two writes in one save call, file intact after an interrupt)",
        "nowhere"))
    write(p / "03-program-design.md", design(
        "Recurring tasks",
        "- tasktrack/recur.py: new — `next_due`\n- tasktrack/store.py: `add` accepts `repeat` and `due`; `complete` adds the next occurrence\n- tasktrack/cli.py: `--repeat` and `--due` on `add`; `list` shows the due date and a repeat marker\n- tests/test_recur.py, tests/test_store_repeat.py: new",
        "def next_due(due: str, repeat: str) -> str: ...\ndef add(title, path=None, repeat=None, due=None) -> dict: ...\ndef complete(task_id, path=None) -> dict: ...  # unchanged signature; may append one task",
        "cli.main → store.complete → recur.next_due → store.add",
        "1. test_next_due_daily — one day later\n2. test_next_due_weekly — seven days later\n3. test_next_due_monthly_clamps — 31 January gives 28 or 29 February\n4. test_complete_repeating_adds_next — one new open task with the next date\n5. test_complete_plain_adds_nothing — non-repeating tasks behave as today\n6. test_old_file_loads — a file with no repeat or due fields still loads\n7. test_add_rejects_unknown_repeat — a clear error, nothing saved",
        "1. `complete` doing two things (mark done, add next) rather than the command handler doing the second"))
    approve(r, "recurring-tasks", "1", "2", "3")


def case_fresh_project_seeds_architecture(d):
    r = Path(d).resolve()
    r.mkdir(parents=True, exist_ok=True)
    sh(["git", "init", "-q", "-b", "main"], r)
    sh(["git", "config", "user.name", "Eval User"], r)
    sh(["git", "config", "user.email", "eval@example.invalid"], r)
    sh(["git", "config", "commit.gpgsign", "false"], r)
    plan(r, "init", "habit-tracker", "--title", "Habit tracker")
    p = Path(plan(r, "path", "habit-tracker"))
    write(p / "00-research.md", research(
        "Habit tracker", "fresh project: nothing to research",
        "Nothing exists yet. The user wants a command-line tool in Python, standard library only, that one person runs on their own machine.",
        constraints="Python 3.10+, no third-party packages, works offline, data stays in a file the user can read."))
    write(p / "01-product.md", product(
        "Habit tracker",
        '"I keep meaning to build habits and I never know whether I actually kept one up. I want to tick it off and see my streak."',
        "Days in a row the user logs at least one habit, read from the tool's own record: target 30.",
        "Meet habit, a tiny tool for keeping promises to yourself. Tell it what you did today and it tells you how many days in a row you have kept it up.",
        "logging a habit for today; showing the current streak for each habit", "reminders, charts, syncing between machines",
        "logging for a past day", "A streak number is enough encouragement without reminders.", "2–3 points"))
    plan(r, "gate", "habit-tracker", "1", "approved")
    write(p / "02-architecture.md", architecture(
        "Habit tracker",
        "A new project. One package, `habit/`, with three modules: `log.py` (read and append entries), `streaks.py` (pure streak arithmetic), `cli.py` (two commands). Tests in `tests/` run with the standard library's unittest.",
        "One append-only text file, `habits.csv` in the user's home folder (override with the HABIT_FILE environment variable): one line per entry, `date,habit`. Read whole, appended one line at a time.",
        "`habit did reading` → `cli` → `log.append(today, \"reading\")`. `habit streaks` → `log.read()` → `streaks.current(entries, today)` → one line per habit.",
        "- Keep entries in an append-only CSV file — instead of a JSON document rewritten on every change — because an interrupted write can lose at most one line and the user can read the file\n- Compute streaks on demand from the entries — instead of storing a running count — because a stored count goes wrong the first time a line is edited by hand",
        "- Reading the whole file on every command stays fast for years of daily use: proven by spike (3,650 lines read and counted in under 10 ms)",
        "nowhere", external="none (HABIT_FILE is an optional environment variable naming the data file)"))
    plan(r, "gate", "habit-tracker", "2", "in-progress")


def case_existing_project_adopts_conventions(d):
    r = mk_repo(d, branch="trunk")
    write(r / "doc" / "adr" / "0007-tasks-live-in-one-json-file.md", """
# 7. Tasks live in one JSON file

- Status: accepted

## Context
The tool is used by one person on one machine. Anything that needs a server or a lock is more
than the problem asks for.

## Decision
All tasks are kept in a single JSON file, read whole and written whole on every change.

## Consequences
Simple and inspectable. Not safe for two processes writing at once. New task fields must be
optional so older files keep loading.

## Revisit when
The list is shared between people, or the file passes a few thousand tasks.
""")
    write(r / "CLAUDE.md", """
# tasktrack — notes for agents

- Run tests with `python -m unittest discover -s tests`. They must pass before any commit.
- Standard library only. Do not add dependencies.
- Decisions are recorded in `doc/adr/` (note: `doc`, not `docs`), numbered four digits.
- Branches are named `feat/<topic>` and cut from `trunk`.
""")
    commit(r, "docs: adr 7 and agent notes")
    sh(["git", "branch", "feat/colour-output"], r)
    sh(["git", "branch", "feat/export"], r)


EXPORT_PY = '''
"""Write tasks as CSV text."""
import csv
import io

HEADER = ["id", "title", "done"]


def to_csv(tasks):
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\\n")
    writer.writerow(HEADER)
    for task in tasks:
        writer.writerow([task["id"], task["title"], "yes" if task["done"] else "no"])
    return buf.getvalue()
'''

TEST_EXPORT = '''
import unittest

from tasktrack import export


class ExportTest(unittest.TestCase):
    def test_header_row(self):
        self.assertEqual(export.to_csv([]).splitlines()[0], '"id","title","done"')

    def test_one_row_per_task(self):
        text = export.to_csv([{"id": 1, "title": "a", "done": False}, {"id": 2, "title": "b", "done": True}])
        self.assertEqual(len(text.splitlines()), 3)

    def test_every_field_is_quoted(self):
        text = export.to_csv([{"id": 1, "title": "plain", "done": False}])
        self.assertEqual(text.splitlines()[1], '"1","plain","no"')


if __name__ == "__main__":
    unittest.main()
'''


def case_close_out_leaves_default_branch_current(d):
    r = mk_repo(d)
    write(r / "docs" / "architecture.md", """
# Architecture

This file describes the system as it is now. Edit it in place when the system changes.

## Purpose and context
tasktrack is a command-line to-do list for one person on one machine.

## Modules and boundaries
Paths: tasktrack/cli.py, tasktrack/store.py
`cli.py` parses arguments and prints. `store.py` loads and saves tasks. The command line calls the
store; the store knows nothing about the command line.

## Data
Paths: tasktrack/store.py
One JSON file holding a list of task records (`id`, `title`, `done`), read and written whole.

## Invariants and baselines
- Standard library only.
- `python -m unittest discover -s tests` passes.
- New task fields are optional so older files keep loading.

## Conventions
Pure functions in their own module, tested without the command line.
""")
    write(r / "docs" / "adr" / "0002-tasks-live-in-one-json-file.md", """
# 0002. Tasks live in one JSON file

- Status: accepted
- Supersedes: none

## Context
One person, one machine.

## Decision
All tasks are kept in a single JSON file, read and written whole.

## Alternatives rejected
- An embedded database: more than the problem asks for.

## Consequences
Simple and inspectable; not safe for concurrent writers.

## Revisit when
The list is shared between people.
""")
    write(r / "docs" / "adr" / "0003-machine-readable-output-is-xml.md", """
# 0003. Machine-readable output is XML

- Status: accepted
- Supersedes: none

## Context
The reporting tool the team used in 2025 consumed XML only.

## Decision
Any machine-readable output tasktrack produces is XML.

## Alternatives rejected
- CSV: the reporting tool could not read it.

## Consequences
Verbose, but one format everywhere.

## Revisit when
The reporting tool is replaced.
""")
    commit(r, "docs: architecture and decisions")
    plan(r, "init", "csv-export", "--title", "Export tasks as a spreadsheet file")
    p = Path(plan(r, "path", "csv-export"))
    write(p / "00-research.md", research(
        "Export tasks as a spreadsheet file", "codebase research", TODAY_TASKTRACK,
        constraints=CONSTRAINTS + " ADR 0003 says machine-readable output is XML; the reporting tool it was written for was retired in 2026.",
        spikes="- Quoting every field keeps the finance import happy: tested by importing a 3-row sample into the finance sheet — accepted; the same sample with mixed quoting was rejected."))
    write(p / "01-product.md", product(
        "Export tasks as a spreadsheet file",
        '"At month end I copy the list into a spreadsheet by hand for finance. It takes twenty minutes and I get rows wrong."',
        "Minutes spent producing the month-end sheet, timed by the person who does it: 20 today, target under 1.",
        "tasktrack can now hand your list to a spreadsheet. One command writes every task to a file that opens cleanly in any spreadsheet tool and imports into the finance sheet as it is.",
        "writing all tasks to a spreadsheet-readable file", "choosing columns, exporting a date range", "exporting only open tasks",
        "Finance needs the whole list rather than a filtered one.", "1–2 points"))
    write(p / "02-architecture.md", architecture(
        "Export tasks as a spreadsheet file",
        "New module `tasktrack/export.py` (a pure function from tasks to text); one new `export` subcommand in `tasktrack/cli.py` that prints it.",
        "No change to what is saved.",
        "`export` → `store.load` → `export.to_csv(tasks)` → printed to standard output for the user to redirect to a file.",
        "- Export as CSV — instead of XML as ADR 0003 set out — because the reporting tool that needed XML was retired and every consumer now opens spreadsheets",
        "- The finance sheet accepts fully quoted CSV: proven by spike (see research)",
        "nowhere"))
    write(p / "03-program-design.md", design(
        "Export tasks as a spreadsheet file",
        "- tasktrack/export.py: new — `to_csv`\n- tasktrack/cli.py: `export` subcommand\n- tests/test_export.py: new",
        "def to_csv(tasks: list) -> str: ...",
        "cli.main → store.load → export.to_csv → print",
        "1. test_header_row — the first line names the columns\n2. test_one_row_per_task — one line per task after the header\n3. test_every_field_is_quoted — numbers and plain words are quoted too",
        "1. Printing to standard output rather than taking a file name"))
    write(p / "04-slices.md", slices("Export tasks as a spreadsheet file", "0.5", [
        {"title": "tracer bullet: an export command that prints the header",
         "what": "`tasktrack export` prints the column header row and nothing else", "tests": "1",
         "proof": "run the test suite; run `python -m tasktrack export` and show the header",
         "points": "0.5 (basis: one module, one subcommand, one test; confidence: high)"},
        {"title": "real rows, every field quoted",
         "what": "one row per task after the header, every field quoted", "tests": "2, 3",
         "proof": "run the test suite; add two tasks and show the three-line output",
         "points": "0.5 (basis: one loop, two tests; confidence: high)"},
    ]))
    plan(r, "gate", "csv-export", "1", "approved")
    plan(r, "gate", "csv-export", "2", "approved")
    plan(r, "gate", "csv-export", "3", "approved", "--decision",
         "quote every field, not only the fields that need it — because the finance import rejects mixed quoting")
    plan(r, "gate", "csv-export", "4", "approved")
    # slice 1
    write(r / "tasktrack" / "export.py", EXPORT_PY.replace(
        '    for task in tasks:\n        writer.writerow([task["id"], task["title"], "yes" if task["done"] else "no"])\n', ""))
    cli = (r / "tasktrack" / "cli.py").read_text(encoding="utf-8")
    cli = cli.replace("from . import store", "from . import export, store")
    cli = cli.replace('    p_done = sub.add_parser("done", help="mark a task done")',
                      '    sub.add_parser("export", help="print every task as CSV")\n'
                      '    p_done = sub.add_parser("done", help="mark a task done")')
    cli = cli.replace('    elif args.command == "done":',
                      '    elif args.command == "export":\n'
                      '        sys.stdout.write(export.to_csv(store.load()))\n'
                      '    elif args.command == "done":')
    write(r / "tasktrack" / "cli.py", cli)
    write(r / "tests" / "test_export.py", TEST_EXPORT.split("    def test_one_row_per_task")[0].rstrip() + '\n\n\nif __name__ == "__main__":\n    unittest.main()\n')
    plan(r, "commit", "csv-export", "--slice", "1", "--all", "--proof-kind", "test-output",
         "--proof", "python -m unittest discover -s tests: 4 tests OK (test_header_row new; it failed before export.py existed). "
                    "`python -m tasktrack export` printed \"id\",\"title\",\"done\".",
         "--tour", "tasktrack/export.py::to_csv is the whole feature; read that. cli.py gains an `export` subcommand that writes "
                   "its result to standard output. Rows are deliberately missing: that is slice 2.",
         "--notes", "Run the tests from the repository root; from inside tests/ the tasktrack package is not importable.")
    # slice 2
    write(r / "tasktrack" / "export.py", EXPORT_PY)
    write(r / "tests" / "test_export.py", TEST_EXPORT)
    plan(r, "commit", "csv-export", "--slice", "2", "--all", "--proof-kind", "command-output",
         "--proof", "python -m unittest discover -s tests: 6 tests OK. After adding two tasks, `python -m tasktrack export` printed "
                    "three lines: the header, \"1\",\"write report\",\"no\" and \"2\",\"send invoice\",\"no\".",
         "--tour", "The loop in export.py::to_csv writes one row per task. csv.QUOTE_ALL is what quotes every field, including "
                   "the id; that is the decision the user took at Gate 3, not an accident. `done` is written as yes/no, not true/false.")


CASES = {name[5:].replace("_", "-"): fn for name, fn in list(globals().items()) if name.startswith("case_")}


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in CASES:
        sys.exit("usage: build_fixture.py <case> <target-dir>\ncases: %s" % ", ".join(sorted(CASES)))
    target = Path(sys.argv[2])
    if target.exists() and any(p.name != ".git" for p in target.iterdir()) and (target / ".git").exists():
        sys.exit("%s already holds a repository; give an empty directory" % target)
    CASES[sys.argv[1]](target)
    print("fixture '%s' ready in %s" % (sys.argv[1], target.resolve()))


if __name__ == "__main__":
    main()
