# The plan store

## Contents
- Why plans do not live on code branches
- The three modes
- What is in the store
- Mounting and finding a plan
- Commits: code and plan state
- Pushing and sharing
- Existing v1 plan folders
- In-tree mode: retiring a plan
- Settings
- Troubleshooting

## Why plans do not live on code branches

Planning documents pile up forever and none of them describes the code as it is today. Kept in
the tree they pad every clone, show up in every code review, and leave the next reader unable
to tell a current description from a historical one. The default branch should hold the code
and what is true about it now. The working papers go somewhere else, still versioned and still
one command away.

## The three modes

| Mode | Where plans live | Use when |
| --- | --- | --- |
| `branch` (default) | An orphan branch named `plans` in the same repository, checked out as a second worktree at `.plans/` | Any git repository |
| `external` | The same layout in another repository, cloned at `.plans/` | Planning data must stay out of clones entirely, or plans span several repositories |
| `in-tree` | `docs/plans/<slug>/` on the feature branch, as in v1 | No git, an environment that cannot keep a second worktree, or the user prefers it |

An orphan branch shares no history with the code, so merging a feature never brings plans along
and a single-branch clone never downloads them. `.plans/` is ignored through
`.git/info/exclude`, so the code branches do not even carry an ignore rule for it.

Switch modes with `plan.py config --set planStore.mode=in-tree` (or `external` together with
`planStore.url=<repository>`). A folder that is not a git repository always uses `in-tree`.

## What is in the store

```
plans                      (orphan branch)
├── INDEX.md               one line per plan: slug · state · tier · work item · code branch ·
│                          last or merge commit · paths touched · started
├── estimates.csv          points estimated, actuals when a team fills them in, elapsed hours
├── <slug>/                the plan folder (see SKILL.md)
│   └── walkthrough/       rendered pages — ignored, never committed
└── adr-archive/           superseded ADRs moved off the default branch
```

`INDEX.md` and `estimates.csv` are maintained by the script. `INDEX.md` is how `plan.py context`
finds earlier plans that touched the same paths.

## Mounting and finding a plan

- `plan.py mount` makes the store available, creating the branch on first use. `--fetch` pulls
  the branch from `origin` first; use it on a fresh clone.
- `plan.py path <slug>` prints a plan's folder. Use it instead of assuming `.plans/<slug>`: a
  plan in the v1 location is used where it is, and the store may be mounted beside a different
  checkout.
- A branch can be checked out in one place only. If the session runs in a linked worktree, the
  script finds the store already mounted next to the main checkout and uses that one. The path
  it prints may therefore be outside the current folder; read and write it by that path.

Resuming in a fresh clone: `plan.py mount --fetch`, `plan.py status <slug>`,
`plan.py digest <slug>`.

## Commits: code and plan state

Each slice produces two commits, and each points at the other:

- On the **feature branch**, the code, with the structured message and a `Plan: <slug> slice N`
  trailer. Nothing from the plan folder is in it.
- On the **store**, the plan state: the ticked checkbox with the code commit's short hash, the
  regenerated work items, the index line.

`plan.py commit` makes both. `plan.py gate` and `plan.py save` commit plan state alone. The
trailer is what `plan.py walkthrough` and `plan.py harvest` use to find a slice's commits, so
do not strip it when rewording a message.

In `in-tree` mode there is one commit: the plan folder rides along with the code.

## Pushing and sharing

Nothing is pushed unless the user asks. When they ask to push the feature branch, offer to push
the store with it:

```bash
git -C .plans push -u origin plans
```

Say why: a plan that exists on one machine is lost with that machine, and a teammate cannot
resume from it. If a push is rejected because someone else pushed first, rebase the store
(`git -C .plans pull --rebase`) and push again; plans occupy separate folders and `INDEX.md` is
one line per plan, so conflicts are rare and small.

Branch protection or pipelines that run on every branch may need to leave `plans` alone. Tell
the user if their repository has rules that would catch it.

## Existing v1 plan folders

A folder at `docs/plans/<slug>/` keeps working exactly where it is: `status`, `digest`, `check`
and `commit` all operate on it, and that plan behaves as `in-tree` whatever the repository's
mode.

`plan.py context` lists such folders. Offer to move them; never move them unasked:

```
plan.py migrate <slug>
```

copies the folder into the store, commits it there and stages its removal from the code branch
for the user to commit. Before migrating a finished plan, check whether anything in it still
binds the code (the "notes for a fresh session" are the usual place) and harvest that into the
architecture doc or an ADR first. See `knowledge.md`.

## In-tree mode: retiring a plan

In `in-tree` mode the folder would otherwise stay on the default branch for good. At close-out:

```
plan.py retire <slug>
```

tags the last commit that contains the folder as `plan/<slug>` and stages its removal. The plan
stays readable (`git show plan/<slug>:docs/plans/<slug>/00-status.md`) and the tree stays
current. Tags need pushing separately if the plan should be shared.

## Settings

Settings live in `.software-factory.json` at the root of the default branch, and the file is
only created when something differs from the defaults:

```json
{
  "planStore": { "mode": "branch", "branch": "plans", "mount": ".plans", "url": "" },
  "vcs": { "branchPrefix": "", "baseBranch": "" },
  "knowledge": { "architecture": "", "adr": "", "agentFile": "" },
  "workItems": { "tool": "", "process": "agile", "pointHours": 8 }
}
```

Empty values mean "detect": the default branch from `origin/HEAD`, the branch prefix from the
branches that already exist, the architecture doc and ADR folder from the usual locations.
`plan.py config` prints what was detected.

## Troubleshooting

- **".plans exists and is not a plan-store checkout"** — something else is using that folder.
  Move it, or set `planStore.mount` to another name.
- **"'plans' is already checked out"** — the store is mounted beside another checkout of this
  repository. `plan.py path <slug>` finds it; nothing needs fixing.
- **The store folder was deleted by hand** — run `git worktree prune`, then `plan.py mount`.
  The branch still has everything that was committed.
- **`.plans` shows up in `git status`** — the exclude entry is missing; `plan.py mount` puts it
  back. Never add `.plans` to a commit.
