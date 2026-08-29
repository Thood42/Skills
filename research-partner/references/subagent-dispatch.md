# Subagent dispatch

How Phase 4 (baseline build) and Phase 6 (growth loop) hand work out.

**The main session dispatches and consolidates. It does not do the research, and it does not try to hold subagent output in working memory.** That division is what lets the baseline build scale past what one context window can hold.

---

## Deriving the angles

Angles are derived from the `question` notes seeded in Phase 3, not picked from a fixed generic list — generic angles produce a generic graph.

Start from the scope's open threads, then sanity-check the set against these archetypes — most projects want 3–6 and should include at least the last one:

1. **Historical / genealogical** — where did this come from? Key figures, texts, inflection points.
2. **Canonical sources** — the field's foundational or most-cited works, and their central claims.
3. **Contemporary state** — current consensus, active debates, open questions.
4. **Mechanism / how it actually works** — the operational middle that surveys skip.
5. **Adjacent domains** — neighbouring fields that inform this one; productive borrowings.
6. **Critics and dissent** — the strongest case *against* the mainstream framing, steelmanned.

Angle six is not optional. A vault that cannot represent disagreement is a summary, not a research corpus, and `contradicts` edges are the most valuable thing in it.

Each angle becomes: one subagent, one tag slug, one graph-view colour group, one `map.md` section, one blurb in `kg-config.json`.

---

## The brief template

Fill every slot. A brief that omits the link laws produces notes that fail `kg doctor`, and then you are repairing links instead of researching.

```
You are researching one angle of a scoped project. Write atomic markdown notes
into an existing knowledge vault. Do not write JSON, do not modify existing
notes, do not touch anything outside the paths named below.

## Project scope (verbatim — do not reinterpret)
<the full Scope Summary block from Phase 3>

## Your angle
<angle name>: <2–3 sentences on what this angle covers and, importantly, what it
does NOT cover — the boundary with the adjacent angles>

## Questions you are trying to move
<the question notes assigned to this angle, by filename and title>

## Budget
3–5 authoritative sources. 6–12 atomic notes. Depth over coverage: a well-sourced
note on one real mechanism beats four thin summaries.

## Where to write
- Concept notes:  <root>/notes/<kebab-slug>.md
- Claim notes:    <root>/notes/claims/<kebab-slug>.md
- Source notes:   <root>/notes/sources/<handle>.md
Do NOT create files anywhere else. Do NOT create entity notes — those are
generated from your links by `kg generate`.

## Note format
<paste kg-schema.md §1–§4, or the relevant templates/ file verbatim>

Tag every concept note with `<angle-slug>` as its FIRST tag.
Set `asserted-by: agent`, `extraction-run: <YYYY-MM-DD>-baseline`,
`status: seed`, and an honest `confidence` (0–1).

## The four link laws — violating any of these breaks the vault
1. Every link is [[file-stem|Display Text]] — the target is a real filename.
2. NEVER put : * " \ / < > | ? in a link target. Obsidian validates the target
   as a filename before consulting aliases, so those characters make the link
   permanently unresolvable. Citations are [[conway-2015|Source: conway-2015]],
   never [[Source: conway-2015]].
3. Never rely on an alias to resolve a link. Point at filenames.
4. Never let a wikilink wrap across a line break. One line, however long.

## Sourcing bar
<from the interview: peer-reviewed only / open web / primary texts / mixed>
<if academic tier: every source note carries a citekey and a credibility rating>

Cite every factual claim inline. If you cannot find a real citation for a claim,
report it as a gap — do not write the note. Never fabricate a source, a URL, a
page number, or a figure.

## What to return
A short report, NOT the notes themselves:
- files created, by path
- sources used, with URLs
- 3–6 findings that surprised you or complicate the scope
- gaps: what you could not source, and what you would chase next
- any entity or concept you linked to but did not write — so the main session
  knows a hub will be generated for it
```

---

## Dispatch mechanics

- **Parallel.** One message, multiple `Task` calls. Subagents that share an angle boundary still work independently; the compiler resolves overlap.
- **Sequential fallback.** If the environment cannot run parallel `Task` calls, run the angles one at a time. Identical output, just serialized.
- **Never** give two subagents the same angle "for coverage". You get duplicate notes under near-identical slugs and a merge report to wade through.
- **Do** tell each subagent the *other* angles by name. The boundary is what stops overlap.

---

## Consolidation checklist

Run in this order. Do not reorder — `generate` reads what `build` compiled, and `doctor` validates hubs that `generate` has not created yet.

```bash
python3 -m scripts.kg build       # notes → .kg/*.json + graph.sqlite
python3 -m scripts.kg generate    # graph → entity/source hubs + map.md
python3 -m scripts.kg doctor      # THE GATE
```

**1. Parse errors must be zero.** `build` refuses to proceed past them and so should you. A parse error is almost always malformed YAML from a subagent — fix the note.

**2. Read the entity warning.** `build` warns about entity references with no hub and no prior identity data. Those become stub hubs, which is correct — but a long list means subagents were linking to names rather than slugs, and it is worth spot-checking a few.

**3. `kg doctor` must end PASS.** Zero dead links, zero unresolvable targets, zero line-wrapped links, zero graph problems. If a subagent's output fails, fix the notes or re-dispatch that angle. **Do not absorb the drift** — a vault that ships with 3 dead links ships with 300 six sessions later.

Before you trust the PASS, make it fail once: drop in a scratch note with `[[Source: x]]`, a link to a nonexistent file, and a line-wrapped link. Confirm all three are reported, then delete it. See `hardening-ledger.md`'s regression checklist.

**4. Review the merge report.** Subagents independently create entities for the same person under different names. The compiler normalizes and aliases; you approve the fuzzy matches once. This is a one-time review, not a recurring per-session dedupe chore.

**5. Then the derived layers.**

```bash
python3 -m scripts.kg embed                 # if a backend is reachable
python3 -m scripts.kg communities --write
python3 -m scripts.kg gaps
python3 -m scripts.kg doctor                # again — communities and gaps add files with links
```

**6. Write the community summaries yourself.** `communities --write` creates the notes and the member lists; the analyst prose inside `<!-- ANALYST SUMMARY -->` is yours to write, from actually reading each cluster's members. 150–250 words. A generated stub with no analysis in it is worse than no community note, because it looks like a finding.

**7. Note the gaps honestly.** Not everything must be filled now. What matters is that each gap becomes a `question` note with a `priority`, so Phase 6 has somewhere to start. Prose bullets in a report are gaps nobody acts on.

---

## Phase 6 dispatch (growth loop)

Same template, narrower input. Pick one open `question` note or one item from `gaps-report.md`, brief a single subagent on it, and give it the question note's filename so it can set `answers:` on what it writes.

On return: build → generate → doctor → update the question note's `status` to `answered` with `answered-by` populated → append to `project-log.md`. Re-run `communities --write` only if membership moved materially.

A resumed session should never ask the user to restate scope. If you are asking, you did not read `AGENTS.md`.
