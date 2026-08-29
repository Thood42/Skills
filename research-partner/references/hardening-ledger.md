# Hardening ledger

The hard invariants this design depends on, grouped by failure class, each with the rule that enforces it and why the rule exists.

Read this before Phase 4. Most of these are easy to violate silently — they don't error, they just quietly stop working — and only become visible when a human opens the vault, or when the same command runs twice in a row at real scale.

---

## The meta-lesson

Almost every entry below falls into one of three shapes. Learn to smell these:

1. **A checker can validate a mirror of the data instead of the thing the user touches.** JSON can be perfectly coherent while Obsidian cannot resolve a single link in it. A green check is only evidence if you have tried to make it red.
2. **A config key can be present but in the wrong bucket, and nothing errors.** Breadcrumbs edge fields, Bases `groupBy`, a trail's field-group label. Declarative config fails *silently* — it renders empty, it does not throw.
3. **Something can run once and look fine.** Run it twice. Some of the worst failure modes here only appear on the second consecutive rebuild.

---

## Class 1 — Link resolution

Obsidian resolves `[[target]]` against exactly two things, in this order: **a real filename**, then **a frontmatter `aliases:` entry**. It never reads any JSON index. The filename check comes first, which is the part that bites hardest.

### L1 — `:` in a link target can never resolve.

`:` is illegal in a filename on Windows, so Obsidian rejects a target like `[[Source: <handle>]]` before it ever reaches alias lookup — it shows *"File name cannot contain any of the following characters: `* " \ / < > : | ?`"* and offers to create a file it then cannot create.

Adding `Source: <handle>` as an alias does **not** help. Alias lookup is never reached.

> **Rule.** Never put `* " \ / < > : | ?` in a link target. Write `[[conway-2015|Source: conway-2015]]` — same rendered text, resolvable target.
> **Enforced by:** `doctor.py`'s `ILLEGAL_TARGET_CHARS` legality gate, which runs *before* alias resolution and reports `UNRESOLVABLE-CITATION` with the corrected form.

### L2 — Anything linkable must exist as a file, not just a JSON row.

If people, organizations, works and sources are recorded only as JSON rows while notes wikilink them by name, the wikilink is valid to a checker that reads the JSON (it matches an entity `name`) and dead in Obsidian (no file, no alias).

Worse: a dead wikilink in Obsidian is not inert. Clicking one *creates* a stray note at the vault root.

> **Rule.** Anything that can be linked must exist as a file.
> **Enforced by:** `generate.py` projects the compiled graph into `notes/entities/*.md` and `notes/sources/*.md`, including stub hubs for slugs that are referenced but never defined. Identity fields (`entity-type`, `aliases`, `tier`, `authors`) are read back from each hub's own frontmatter, so human edits survive regeneration.

### L3 — Aliases are a fallback, not a resolution strategy.

Aliases fail on illegal characters and they depend on the metadata cache being built. On a large vault, clicking a *valid* alias link before indexing finishes can create a stray file instead of navigating.

> **Rule.** Always `[[real-file-stem|Display Text]]`. Keep aliases for search and autocomplete; never point a link at one.

### L4 — A line-wrapped wikilink is a broken wikilink.

Markdown line-wrapping inside `[[...]]` silently breaks the link. Easy for a subagent to produce when a display name is long.

> **Rule.** Every wikilink stays on one line, however long the line gets.
> **Enforced by:** `parse.py` flags `line_wrapped`; `doctor.py` reports `LINE-WRAPPED`.

### L5 — A link checker must resolve links the way Obsidian actually does.

Three properties all have to hold, and dropping any one of them makes the checker untrustworthy in a way that is hard to notice:

| Property | If missing |
|---|---|
| Recursive file scan, not just the top-level notes folder | Notes in subfolders are never checked *and* never counted as valid targets |
| Frontmatter `aliases:` read during resolution | Links that do work get reported dead — the check is untrustworthy in both directions |
| Illegal-character targets rejected as unresolvable, not looked up in a JSON store | The checker can specifically bless the one link form Obsidian can never resolve |

> **Rule.** The checker resolves links **exactly the way Obsidian does** — recursive filenames plus frontmatter aliases, minus anything filename-illegal — over *every* markdown file in the vault, not just `notes/`. `index.md`, `AGENTS.md` and `README.md` carry links too.
> **Enforced by:** `doctor.py`'s `_vault_wide_files()` + `_resolution_targets()`.

### L6 — This class of bug regresses easily, including through templates.

Two ways it has come back:

- A `source.md` template can carry `aliases: ["Source: <handle>", ...]`. That alias is unreachable as a link target, and its only practical effect is to make `doctor` resolve the bare `[[Source: x]]` form and report green — reintroducing the L1 hole through a template. Fix: the alias stays out of the template, and the legality gate runs before alias lookup so no alias can recreate the hole.
- Breadcrumbs' trail view can be configured with `field_group_labels: ["part-of"]`. `part-of` is an edge *field*, not a field *group*. The trail then renders nothing on every note, with no error — easy to miss because it's simple to verify the Matrix panel and never check the Trail.

> **Rule.** Regression-test the checker itself. Before believing a PASS, write a note containing one instance of each known-bad form and confirm `doctor` fails on all of them.

---

## Class 2 — Declarative config that fails silently

### C1 — Bases: `groupBy` without `direction` invalidates the entire file.

A `groupBy` missing its `direction` key doesn't just degrade that one view — it invalidates the **entire `.base` file**. A view with no `groupBy` at all in the same file breaks as collateral damage, which reads like a much bigger failure than a one-key typo.

> **Rule.** `groupBy` always carries both `property` and `direction`. A single view's syntax error takes down every view in that file, so verify each `.base` renders, not just the one you edited.

### C2 — A predicate in `edge_fields` but in no field group renders as nothing.

Breadcrumbs' Matrix / Trail / Prev-Next views read **only** the `ups` / `downs` / `sames` / `nexts` / `prevs` field groups. A predicate seeded into `edge_fields` but never assigned to a bucket shows as "No outgoing edges" on a note with real, correctly-typed frontmatter.

> **Rule.** Every predicate lands in exactly one field group, and its inverse in the opposite one.
> **Enforced by:** `assets/predicates.json` is the single registry; `init_project.py config` generates `types.json`, Breadcrumbs `edge_fields` *and* `edge_field_groups` from it together; `init_project.py verify` fails if any predicate is in `edge_fields` but no group, or if the trail names a non-existent group.

### C3 — Hand-maintaining one vocabulary in more than one place lets copies diverge invisibly.

If the predicate list has to appear identically in `.obsidian/types.json`, Breadcrumbs' config, and `AGENTS.md`, hand-keeping all three lets them drift — and divergence here is invisible. The note looks right, the panel is empty, nothing errors.

> **Rule.** One registry, generated outputs. Edit `kg-config.json` or `assets/predicates.json`, then run `init_project.py config`. Never hand-edit the three outputs.

---

## Class 3 — Rebuild cycles and determinism

These only show up on the **second consecutive** run at real scale (hundreds of notes). Code review and small-fixture tests don't catch them.

### R1 — Self-reference feedback loop.

A community note's generated `members:` frontmatter is a list of wikilinks. If the relation detector is fully generic, it compiles that list as real typed edges — so the community note joins the graph as a node with an edge to each of its own members, which changes its membership on the next clustering pass, which changes its content-hashed id, which orphans the note it had just written.

> **Rule.** Display-only wikilink lists are excluded from edge detection.
> **Enforced by:** `NON_RELATION_LIST_KEYS = {"aliases", "tags", "notes", "members"}` in `parse.py`. Add to it whenever you introduce a frontmatter list that is for humans to read, not for the graph to traverse.

### R2 — Silent data loss on rebuild.

`write_sqlite()` recreates the schema on every build (see F1 below). Any table not derived fresh from the notes on that run needs an explicit carry-forward path, or it gets silently emptied on every `kg build`.

> **Rule.** Any table not derived from notes on this run needs an explicit carry-forward path, filtered to nodes still present.

### R3 — Order-dependent non-determinism.

Even with R1 and R2 handled, two no-op rebuild cycles can produce different partitions: generated community notes, interleaved alphabetically among the real files, change `nx.Graph()`'s node insertion order and perturb Louvain's greedy tie-breaking — despite carrying no edges at all.

> **Rule.** Generated nodes never enter the clustering graph, and every underlying query carries an explicit `ORDER BY`.
> **Verified by:** two consecutive `communities --write` + `build` cycles with no note changes must produce byte-identical community sizes, ids and file listings. Measure it; do not assume it.

### R4 — An exclusion rule can cut both ways.

`gaps-report.md` is placed in `notes/_meta/` to keep it out of the graph, using `parse.py`'s `_meta` exclusion rule. But `doctor.py`'s `_vault_wide_files()` also excludes `_meta` paths from its link-resolution *targets* — so `index.md`'s `![[gaps-report]]` embed can become a dead link to a file that plainly exists. A `kg doctor` that goes PASS → FAIL right after a routine change is a real regression, not something to note and move past.

> **Rule.** Generated vault-level reports go at the vault root, next to `map.md`. An exclusion that hides a file from the graph also hides it from the resolver.

---

## Class 4 — Filesystem and environment

### F1 — SQLite over a FUSE mount: "disk I/O error".

`sqlite3` cannot write directly to this class of mount — no real POSIX byte-range locking.

> **Rule.** Build `graph.sqlite` in a real temp path and copy the bytes into place. This forces a full rewrite every build, which is what makes R2's carry-forward logic load-bearing rather than an optimization.

### F2 — A path bug can write a generated directory to the vault root instead of under `.kg/`.

> **Rule.** After any migration or generation step, list what actually landed. Do not infer the tree from the code.

### F3 — No delete permission means a superseded file can shadow a real note.

When the session cannot `rm` in the user's folders, a stale generated file surviving next to its replacement is a real failure mode, not a hypothetical.

> **Rule.** Generators own a directory completely and diff against it. Files no longer referenced move to `_to_delete/` and are **reported**, never assumed overwritten. Tell the user that folder is theirs to empty.

### F4 — A markdown table's `\|` escape can leak a backslash into a link target.

Pipe-escaping inside a table cell corrupts the parsed wikilink target.

> **Rule.** Use the bare `[[handle]]` form inside table cells.

### F5 — An optional dependency that cannot be installed is not optional, it is a trap.

`python-louvain`, once listed as the optional dependency for modularity-optimized clustering, fails to build against modern setuptools (`AttributeError: install_layout`). Suggesting it puts the user's environment in a broken state.

> **Rule.** Prefer a capability already present in a dependency you have. networkx 3.0+ ships `louvain_communities` in core, with an explicit `seed`, so the extra package buys nothing. Before listing an optional dependency, install it in a clean environment.

### F6 — A sandbox cannot reach the user's own localhost.

Not a bug, but it will happen to you. A cloud session's shell is network-isolated from the host machine's localhost services, so LM Studio at `127.0.0.1:1234` is unreachable from it — and a model download from `huggingface.co` may be blocked by the egress allowlist on top of that.

> **Rule.** The `lmstudio → fastembed → none` chain prints each failure by name and degrades to lexical-only, never silently. Say which mode you are in. The fix is one `kg embed` from a real terminal on the user's machine, not a code change — and everything downstream picks up whatever is in `graph.sqlite` regardless of which environment computed it.

---

## Class 5 — Reuse and honesty

### U1 — A frozen clock is a bug that only shows up in production.

Hardcoding `TODAY = "<some fixed date>"` anywhere is harmless in a single throwaway run and silently wrong forever once the code ships — it stamps every generated note with the same `created:` date, breaking `review-after`, the stale-question scan, and the review queue.

> **Rule.** No date literal in shipped code. `date.today()`, always.

### U2 — Project vocabulary hardcoded in the compiler is a reuse bug, not just a correctness one.

If `generate.py` carried one project's own research angles as a dict, and a template prompted for them by name, the compiler could not serve a second topic without editing Python.

> **Rule.** Project vocabulary lives in `kg-config.json`. Code reads it and tolerates its absence.

### U3 — Partial coverage has to say so, or search quietly lies.

If only entity and source nodes are indexed with body text — and concept, claim and question prose, i.e. most of the actual content, is not — `kg search` still works, still returns results, and quietly cannot see the majority of the corpus.

> **Rule.** Index every note's body. When a capability is partial, the tool's own output says so: every `kg search` / `kg context` result carries `"mode"` and, when degraded, `"lexical_only_reason"`.

### U4 — Don't name a heuristic after the thing you wish it measured.

The latent-tension scan is embedding similarity plus a shared `about` target with no declared relationship. The schema has no `stance` comparison behind it. Calling that "contradiction detection" would be an overclaim.

> **Rule.** It is called a **latent tension candidate**, in the code and in every report. Name heuristics after what they compute.

---

## The regression checklist

Run this before declaring any vault done. Each line maps to an entry above.

```bash
# 1. The checker can actually fail  (L1, L3, L4, L5, L6)
#    Write a scratch note containing:
#      [[Source: some-handle]]                      -> UNRESOLVABLE-CITATION
#      [[definitely-not-a-file|Nope]]                -> DEAD-LINK
#      a wikilink broken across a line break          -> LINE-WRAPPED
python3 -m scripts.kg build && python3 -m scripts.kg doctor    # must FAIL, then delete the note

# 2. Determinism  (R1, R2, R3)
python3 -m scripts.kg communities --write && md5sum notes/communities/*.md > /tmp/a
python3 -m scripts.kg build && python3 -m scripts.kg communities --write
md5sum notes/communities/*.md > /tmp/b && diff /tmp/a /tmp/b     # must be identical

# 3. Config consistency  (C2, C3)
python3 scripts/init_project.py verify .                          # must PASS

# 4. The real gate  (everything)
bash scripts/rebuild.sh                                           # doctor must end PASS

# 5. Human verification  (C1, L2, L6)
#    Open the vault in Obsidian and confirm, by clicking:
#      - every index.md Base embed renders with columns
#      - the Breadcrumbs Matrix AND Trail populate on a real note
#      - a citation link navigates to a source note
#      - the graph view shows the configured colour groups
```

Step 5 is not optional. Every entry in Class 1 and Class 2 is the kind of failure a human opening the app catches, and none of them would surface any other way.
