# {{PROJECT_TITLE}}

> **Project question:** {{PROJECT_QUESTION}}

{{NOTES_COUNT}} concept notes · {{ENTITIES_COUNT}} entities · {{RELATIONS_COUNT}} relations · {{SOURCES_COUNT}} sources · {{QUESTIONS_COUNT}} open questions — compiled from the notes themselves by `kg build`, not hand-maintained. Run `bash scripts/rebuild.sh` to refresh every count and view on this page.

Every claim is cited. Sources carry a `tier` in their own frontmatter (`primary` / `analyst` / `journalism` / `reference` / `secondary`) — weight them accordingly; `secondary` means the figure may well be right but the methodology is thin.

---

## Start here

The notes that carry the most weight for the project question. Read these first.

{{START_HERE_LINKS}}

For the full note list by topic cluster, see [[map|the cluster map]] — generated from tags, refreshed by `kg generate`.

> [!question] Open threads
> ![[questions.base#Open]]

## Contested ground

Claims whose `contradicts` property points at another claim — surfaced, not resolved.

![[claims.base#Disputed]]

## The graph right now

![[entities.base#All entities]]

## Evidence base

![[sources.base#By tier]]

## Needs review

Notes past their `review-after` date, or explicitly marked `status: stale`.

![[review.base#Due for review]]

## Inbox

Candidate notes from `kg ingest` — a PDF or URL chunked into a `source` note plus draft `claim` notes, all at `status: seed`. Nothing here counts as evidence until a human promotes it.

![[inbox.base#Needs review]]

## Gaps and suggested links

![[gaps-report]]
