# Turning a document into a deck

A very common request is "make a deck from this" — a report, a one-pager, meeting notes, a
spec, a .docx or .pdf. The trap is to transcribe the document slide-for-paragraph, which
produces a wall-of-text deck nobody wants. A document and a deck have different jobs: the
document is the full record; the deck is the *argument*, one idea per slide. Your task is to
**distill and re-sequence**, not transcribe.

## Workflow

1. **Read the source.** Use the right tool for the format: the `pdf` skill for `.pdf`, the
   `docx` skill for Word, plain Read for `.md`/`.txt`. Pull out the structure (headings),
   the key claims, the numbers, and any figures/tables.

2. **Pick the audience strategy first** (see `references/audiences.md`). The same document
   becomes a different deck for an exec vs. a technical review. The strategy decides the arc,
   what you lead with, and what gets cut. Ask the user if it isn't obvious from their request.

3. **Distill to one idea per slide.** For each point that earns a slide, keep the *takeaway*
   (a ≤6-word title) and the single supporting fact, stat, quote, or visual. Everything else —
   caveats, derivations, appendices — either gets cut or moves to a closing "appendix" slide
   the deck points to. A 12-page report is usually 8–14 slides, not 40.

4. **Map content to layouts.** Numbers → `stat-grid`/`bignum`; a trend or table → a `chart`
   (slidegen.py or Chart.js); a process → `pipeline`; a decision → `comparison`; history →
   `timeline`; a system → a Mermaid diagram. Reach for a structured layout before a bullet list.

5. **Write the outline as JSON** in the shape `scripts/build_deck.py` expects
   (`build_deck.py --sample` shows every layout), then build:
   `python3 scripts/build_deck.py --outline outline.json --theme <theme> --out deck.html`.
   That stamps the slides with correct numbering so you can focus on content.

6. **Fill, refine, lint, render.** Hand-edit any charts/diagrams, then
   `python3 scripts/lint_deck.py deck.html` and `./render.sh deck.html N shots` to inspect.

## Distilling — a worked sketch

A source paragraph:

> "In Q3, after migrating the read path to an edge cache, we observed p99 latency hold at
> roughly 180ms even as request volume grew from 1.0M to 3.1M peak RPS, while infrastructure
> spend per request fell about 42% due to fewer database round-trips."

becomes a single `bignum` slide:

- title/kicker: "The headline"
- hero number: **180** (with a count-up)
- subtitle: "ms at p99 — unchanged while load tripled, because the hot path no longer touches the database."

The 42% and the 3.1× go on a separate `stat-grid` slide. One idea per slide; the prose's three
clauses become three slides, each landing one point.

## Keep the source honest
Don't invent numbers or sharpen claims beyond what the document supports — a deck that
overstates the source is worse than no deck. If the document is vague, the deck should be too
(or flag the gap to the user), not paper over it with false precision.
