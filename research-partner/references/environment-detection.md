# Environment Detection

Full decision tree for Phase 1. The core rule: **the user always confirms the target before you write.**

Phase 1 has two halves. **1a** decides where the notes live (this file's decision tree). **1b** probes what Obsidian can actually render (`plugin-stack.md`). Do both before the interview — 1b's answer changes what you promise in Phase 5, and 1a's answer changes your write path for everything after.

---

## 0. Is this already a graph-native vault, or an older one?

Check this before anything else, because both answers skip most of what follows.

| Signal | Meaning | Do |
|---|---|---|
| `AGENTS.md` exists at the path | An active project | **Don't run this skill.** Tell the user to `cd` there and start a fresh session. If they want you to continue from here, read that AGENTS.md and follow its resume instructions. |
| `kg-config.json` + `scripts/kg/` exist | Already on the current layout | Same as above — this is a live vault. |
| Root-level `entities.json` / `relations.json` / `sources.json`, no `kg-config.json` | An **older flat-JSON vault** | Go to **Phase 0** and run `kg migrate`. Do not rebuild by hand and do not scaffold over it. |
| A directory exists at the target slug but is none of the above | Unknown | Ask before touching it. `init_project.py init` refuses to write into a non-empty directory, deliberately. |

---

## Decision tree

```
1. Is there an Obsidian MCP server in the current tool list?
   (look for tools matching mcp__obsidian__*, obsidian_*, mcp__obsidian-mcp__*)
   ├── YES → List available vaults. If multiple, ask which. If one, confirm it.
   │         → Ask for the subdirectory to use (default: "research-projects/<slug>")
   │         → Proceed with MCP as the write layer.
   └── NO  → Continue to 2.

2. Is $OBSIDIAN_VAULT set?
   ├── YES → Confirm the path with the user: "You have $OBSIDIAN_VAULT set to <path>.
   │         Should I create the project inside <path>/research-projects/<slug>?"
   │         → On yes, use filesystem writes.
   └── NO  → Continue to 3.

3. Is a Logseq, Foam, or Basic Memory MCP server present?
   ├── YES → Surface the choice:
   │         "I see you have <tool> connected. I can use that, or I can
   │          create a plain markdown graph you can open in anything.
   │          What's your preference?"
   │         → On <tool>, use its MCP.
   │         → On markdown, continue to 4.
   └── NO  → Continue to 4.

4. Ask the user:
   "I don't detect an existing notes system. Options:
    (a) Point me at an existing vault or notes directory (paste the path)
    (b) Create a fresh markdown graph in a local directory
        (Obsidian-compatible — you can move it into a vault later)
    (c) Let me know if you use a different tool I should support"
   → Proceed with whatever they choose.
```

---

## Common cases and how to handle them

### The user has Obsidian but no MCP server installed

Very common. Ask: "Do you want to point me at your vault directly by path? I'll write files there directly — I won't touch anything outside the project subdirectory I create."

### The user has the vault open in Obsidian right now

Ask. It changes the write channel:

- **Open + Local REST API installed** → write through the plugin. The user watches notes appear, and you can open the note you just wrote in their UI.
- **Open, no Local REST API** → filesystem writes are fine, but Obsidian's metadata cache may lag. Tell the user to expect a beat before links resolve, and do not let a mid-build click on a not-yet-indexed link fool either of you into thinking a link is dead (see `hardening-ledger.md` L3).
- **Closed** → filesystem writes.

Never mix both channels in one session.

### The user's vault is in iCloud / Dropbox / synced storage

Warn about sync races: "Your vault looks like it's in iCloud/Dropbox — if Obsidian is open on another device, there's a small risk of merge conflicts. Want me to proceed anyway, or wait until you've closed other clients?"

Do not treat this as a blocker — most users know their sync setup and can decide.

### The user has a git-tracked vault

Ask if they want an initial commit at the end of Phase 4: "You mentioned your vault is git-tracked. Want me to make a commit after the baseline build (`Initial research-partner scaffold for <project>`), so you can see the diff cleanly?"

Ask; don't just do it — commits touch git config and history.

### The vault is read-only or the path doesn't exist

Do not fall back silently. Tell the user, ask for a different path.

### The filesystem doesn't allow deletes

Common on mounted/bridged filesystems and in sandboxed sessions. This is handled, not blocking: generators never delete — superseded files move to `_to_delete/` and are reported. Tell the user that folder is theirs to empty, once, and move on. Do not spend the session trying to work around it.

### SQLite fails with "disk I/O error"

The target is on a FUSE or network mount without real POSIX byte-range locking. `build.py` already handles this by building `graph.sqlite` in a temp path and copying the bytes in. If you see this error from anything else, apply the same pattern rather than giving up on the index.

### The user wants everything in a specific non-research subdirectory

Respect their layout. If they have `~/vaults/knowledge/projects/`, use that. Don't force `research-projects/` on them.

---

## Confirming the project subdirectory

Once the target vault/directory is settled, propose the project subdirectory name:

- Default: `<target>/research-projects/<slug>/`
- `<slug>` is a short kebab-case rendering of the project title. Derive it from the user's initial framing, but confirm before creating.
- If a directory with that slug already exists, do NOT overwrite. Ask: "There's already a `<slug>` project here. Should I: (a) pick a different slug, (b) resume it (I'll switch out of this skill), or (c) put this in a new directory alongside?"

---

## What to do with `~` and relative paths

Users will paste paths in many forms:

- `~/vaults/research` — expand `~` explicitly (use `os.path.expanduser` in Python, or `${HOME}/...` in shell).
- `./notes` — resolve against the current working directory. Print the absolute path back to the user for confirmation.
- Windows-style paths on WSL — normalize but confirm.

Always echo the resolved absolute path back before creating anything: "I'll create `/home/trevor/vaults/research/research-projects/monetary-policy/`. OK to proceed?"


---

## Writing into an existing vault vs. a dedicated one

Phase 5 writes `.obsidian/` config — property types, graph colour groups, Breadcrumbs edge fields, Templater folder templates, QuickAdd macros. **In an existing personal vault that is a real intrusion**: graph colour groups and property types are vault-global, not per-folder, and you would be reshaping settings the user tuned for their own notes.

Surface the choice rather than deciding for them:

> "Phase 5 writes Obsidian config — graph colours, property types, Breadcrumbs relations. Those are vault-wide settings, so in your main vault they'd affect your existing notes too. I can either (a) put this in a dedicated research vault so nothing of yours is touched, or (b) write into this vault and show you the diff first. Which do you want?"

If they choose (b): back up the four files you will touch (`types.json`, `graph.json`, `community-plugins.json`, and any existing plugin `data.json`) into `.kg/legacy/obsidian-backup/` before writing, and say you did.

---

## Confirming, before any write

Echo the resolved absolute path and wait:

> "I'll create `/home/trevor/vaults/research/research-projects/monetary-policy/` — a fresh directory, nothing existing gets touched. OK to proceed?"

A stray write into someone's real vault is unrecoverable trust-wise, and no amount of "it was only a scaffold" fixes it afterwards.
