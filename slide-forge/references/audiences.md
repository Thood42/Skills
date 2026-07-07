# Audience strategies — how to construct the content

A deck's *look* is the theme; its *substance* is the strategy. The same facts become a
different deck for a CFO than for an engineering review. Pick a strategy **with the user
before planning the narrative** (see SKILL.md → *Choosing an audience strategy*), then build
the slide arc from that strategy's playbook below.

The cross-cutting rules in SKILL.md still apply (one idea per slide, short text, structured
layouts). What changes per strategy is the **arc, what you lead with, what you cut, the
density, and the tone**. Two principles do most of the work:

- **BLUF — bottom line up front.** For any deck that drives a decision (executive, business
  case, status, research), the recommendation/answer goes near the front, not the end. The
  audience decides whether to dig in; don't make them wait for the payoff.
- **Match density to the audience.** The more senior or time-poor the audience, the less text
  and the bigger the numbers. Push depth, methodology, and raw data into an appendix the deck
  *points to* rather than walks through.

## Quick pick

| Strategy | Audience | The question they're really asking | Typical length |
|---|---|---|---|
| Executive Briefing | C-suite / senior leaders | "What's the decision and what do you need from me?" | 5–8 |
| Business Case | Budget owners / sponsors / finance | "Is this worth the money and risk?" | 8–12 |
| Technical Deep-Dive | Engineers / analysts / peers | "Is this rigorous and correct? How does it work?" | 10–16 |
| Training / Workshop | Learners | "How do I understand and apply this?" | 12–25 |
| Architecture Review | Architects / senior eng / reviewers | "Is this design sound? What are the tradeoffs?" | 10–18 |
| Research Findings | Research peers / stakeholders | "What did you find, how reliable, what does it mean?" | 8–14 |
| Project Status | Stakeholders / sponsors | "Are we on track? What's at risk? What do you need?" | 6–10 |
| Postmortem | Eng / leadership / customers | "What broke, why, how bad, how do we prevent it?" | 8–12 |

---

## 1 · Executive Briefing
**Audience & question:** senior leaders, time-poor — "What's the decision, and what do you need from me?"
**Goal:** drive a decision or alignment fast.
**Arc:** cover (topic + the ask in the subtitle) → **BLUF**: recommendation + the specific ask
(`bignum`/statement) → why now / urgency → 2–3 evidence slides (`stat-grid`, one `chart`) →
options + recommendation (`comparison`) → risks & mitigations (one slide) → the ask + next steps (`closing`).
**Lead with** the conclusion and the number that matters (impact in $, time, or risk).
**Cut to appendix:** methodology, implementation detail, exhaustive data.
**Density & tone:** very low text, large figures, confident and concise.
**Favored visuals:** `bignum`, `stat-grid`, `comparison`, KPI `gauge`/`ring`.
**Suggested themes:** Monolith, Deep Ocean, Midnight Neon.
**Pitfalls:** burying the ask; detail overload; ending without a clear decision.

## 2 · Business Case / Investment Proposal
**Audience & question:** budget owners, finance, sponsors — "Is this worth the money and risk, and what's the return?"
**Goal:** secure approval / funding.
**Arc:** cover → problem + **cost of inaction** (quantified) → proposed solution (concise) →
expected benefits (`stat-grid`) → financials: cost, ROI, payback (`chart` + a small table) →
options incl. **do-nothing** (`comparison`) → risks & assumptions → timeline/milestones
(`timeline`) → the ask: amount + decision + next step (`closing`).
**Lead with** the size of the problem and the headline return (ROI / payback period).
**Cut to appendix:** deep technical design, vendor minutiae.
**Density & tone:** medium; numbers are the argument; businesslike.
**Favored visuals:** bar/line `chart`, payback `gauge`, `comparison`, `timeline`.
**Suggested themes:** Deep Ocean, Arctic, Monolith.
**Pitfalls:** vague benefits; no baseline to compare against; omitting the do-nothing option; hand-wavy financials.

## 3 · Technical Deep-Dive / Analysis
**Audience & question:** engineers, analysts, technical peers — "Is this rigorous and correct? How does it actually work?"
**Goal:** build understanding and defend conclusions with evidence.
**Arc:** cover → context + problem statement → approach/methodology → **headline finding**
(`bignum`) → detailed analysis (multiple `chart`s) → mechanism/how-it-works (`pipeline`,
`code`, or Mermaid diagram) → tradeoffs & limitations → conclusions + recommendations → appendix pointers.
**Lead with** the finding, then the evidence that earns it.
**Emphasize:** data, transparent methodology, edge cases, reproducibility.
**Density & tone:** higher density is OK but stay structured — prefer charts/diagrams/code over prose; precise and neutral.
**Favored visuals:** line/scatter `chart` (Chart.js), `code` (highlight.js), `pipeline`, Mermaid, `comparison`.
**Suggested themes:** Midnight Neon, Monolith, Evergreen.
**Pitfalls:** data with no takeaway; hiding limitations; walls of code (show the essential 5–12 lines).

## 4 · Training / Workshop
**Audience & question:** learners — "How do I understand this and apply it myself?"
**Goal:** comprehension, retention, and ability to apply.
**Arc (scaffolded):** cover + **learning objectives** ("what you'll be able to do") → agenda/roadmap
→ why it matters → concept slides, **one concept each, building up** (a `divider` per module) →
worked example (`code`/walkthrough) → checkpoint / "your turn" exercise → common mistakes & tips →
recap of key takeaways + resources (`closing`).
**Emphasize:** explicit objectives, progressive scaffolding, concrete examples, repetition, active practice.
**Density & tone:** low per slide, more slides; chunk heavily with section dividers; warm and encouraging.
**Favored visuals:** step `pipeline`, `code`, before/after `comparison`, agenda `timeline`, checkmark animations.
**Suggested themes:** Coral Sunset, Arctic, Sandstone.
**Pitfalls:** too much at once; no worked examples; no recap; passive (no exercises or checkpoints).

## 5 · Architecture Review
**Audience & question:** architects, senior engineers, reviewers — "Is this design sound, and what are the tradeoffs and risks?"
**Goal:** get design feedback / approval and surface risks early.
**Arc:** cover → goals & constraints (functional + **non-functional**: scale, latency, cost,
security) → current state/context → proposed architecture (**Mermaid system diagram**) →
component breakdown / data flow (`pipeline`, sequence diagram) → key decisions & **alternatives
considered** (`comparison`/decision table) → tradeoffs (e.g. consistency vs availability, build
vs buy) → risks, failure modes, mitigations → scalability/cost/security → open questions + decisions needed.
**Emphasize:** how the design meets the requirements, explicit tradeoffs, the alternatives you
rejected and why, failure modes, and the non-functional requirements.
**Density & tone:** diagram-led; analytical and candid about tradeoffs.
**Favored visuals:** Mermaid (system + sequence diagrams), `pipeline` data-flow, `comparison`/decision tables.
**Suggested themes:** Midnight Neon, Deep Ocean, Monolith.
**Pitfalls:** diagrams with no rationale; hiding the alternatives; ignoring NFRs (security/scale/cost); no explicit open questions.

## 6 · Research Findings
**Audience & question:** research peers and stakeholders — "What did you find, how reliable is it, and what does it mean?"
**Goal:** communicate findings credibly and draw out implications.
**Arc:** cover (title + **headline finding** in the subtitle) → question/hypothesis & why it
matters → method (data, sample, approach — concise) → **headline result** (`bignum`) →
results in detail (multiple `chart`s, with annotations) → interpretation / what it means →
limitations, caveats, confidence → implications & next steps (`closing`).
**Lead with** the finding; support it afterwards. Report effect sizes and confidence, not just direction.
**Density & tone:** chart-led; objective and measured — never overclaim.
**Favored visuals:** line/bar/scatter/distribution `chart`s, `stat-grid`, on-chart annotations.
**Suggested themes:** Editorial Paper, Arctic, Evergreen.
**Pitfalls:** leading with method instead of the result; overclaiming beyond the data; ignoring limitations; a chart with no interpretation.

## 7 · Project Status / Update
**Audience & question:** stakeholders and sponsors — "Are we on track, what's at risk, and what do you need from me?"
**Goal:** align on progress, surface risks, and get unblocked.
**Arc:** cover (project + period) → **TL;DR health** (Red/Amber/Green at a glance) →
progress since last update (key accomplishments) → metrics/KPIs vs plan (`chart`, `gauge`) →
milestones done vs upcoming (`timeline`) → risks/issues/blockers **with owners** → asks /
decisions needed → next steps.
**Lead with** overall health (RAG) and the deltas since last time; end on clear asks.
**Density & tone:** concise; honest — no surprises; show red when it's red.
**Favored visuals:** status badges, KPI `gauge`/`ring`, `timeline`, `stat-grid`, trend/burn-down `chart`.
**Suggested themes:** Deep Ocean, Monolith, Arctic.
**Pitfalls:** sandbagging or hiding red; mistaking activity for progress; no clear asks; risks without owners.

## 8 · Postmortem / Incident Review
**Audience & question:** engineering, leadership, sometimes customers — "What happened, why, how bad, and how do we prevent recurrence?"
**Goal:** blameless learning plus concrete, owned remediation.
**Arc:** cover (incident + date + severity) → **impact summary** (who/what affected, duration,
users/$ — `bignum`/`stat-grid`) → **timeline** of events (detection → mitigation → resolution) →
root cause(s) (the real "why", e.g. 5-whys — `pipeline`/Mermaid) → what went well / what went
wrong → contributing factors → remediation / action items **with owners + dates** (table/checklist)
→ lessons learned (`closing`).
**Emphasize:** a blameless, systems-focused tone; an accurate timeline; the true root cause (not
the symptom); and concrete action items that have owners and dates.
**Density & tone:** factual and calm; focus on systems and process, never individuals.
**Favored visuals:** `timeline` (central), impact `bignum`, cause `pipeline`/Mermaid, action-item table.
**Suggested themes:** Editorial Paper, Monolith, Midnight Neon.
**Pitfalls:** blame; a vague root cause that stops at the symptom; action items without owners/dates; not quantifying impact.

---

## Choosing well when the request is mixed
Real requests often blend strategies (e.g. "an exec readout of our architecture review"). When
that happens, pick the **primary audience and decision** as the spine (here: Executive — the
exec wants the decision and risks), and borrow a few slides from the secondary (a single Mermaid
system diagram instead of the full architecture walk). Don't try to serve two masters across the
whole deck; lead with the one whose decision the deck exists to drive, and appendix the rest.
