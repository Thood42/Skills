# Interview Guide

Question bank for Phase 2 of the research-partner skill. Draw from these, don't march through them.

The goal of the interview is **scope, not depth**. You are not trying to teach or extract the user's full understanding — you are trying to figure out *what shape of knowledge graph will actually be useful to them*. Once the scope is sharp enough that you can brief five subagents without ambiguity, you're done.

---

## The dimensions

### 1. Purpose

- What's this for? A decision you're making, a talk you're giving, a class you're teaching, a book you're writing, or curiosity?
- If it's for a specific output — what's the format and audience?
- What does *not* having this knowledge cost you right now?

### 2. Existing footing

- What do you already know about this topic? (One paragraph is fine.)
- What have you already read or listened to on this?
- Where do you notice your gaps?
- Any strong priors we should note — positions you already hold that the research might update or reinforce?

### 3. Depth vs. breadth

- Do you want a wide survey of the whole territory, or a deep dive into one part?
- If deep — which part? If wide — is there a canonical "map" of the field you'd want the graph to mirror?

### 4. Time horizon

- Is this a weekend deep-dive, an ongoing project over months, or open-ended?
- (This affects how much scaffolding to build vs. how much to leave for later.)

### 5. Sources

- What kinds of sources count? Peer-reviewed only, open web, primary texts, expert blogs, video lectures, interviews?
- What's the quality bar? "As long as it's cited" vs. "only recent work from acknowledged experts"?
- Any specific sources you already trust or distrust?

#### 5b. Sourcing tier — ask it explicitly

> "Does this need academic-grade sourcing — citekeys, page-level provenance, an explicit credibility rating on every source — or is a good open-web standard fine?"

This is not a quality question, it is a plumbing question, and the answer changes what you build:

- **Academic tier** → Zotero Integration goes in the stack, the Zotero citekey becomes the canonical `source_id` rather than a hand-rolled handle, and `credibility` becomes a required property on every `source` note. Wire it from the start; retrofitting hand-rolled source notes to Zotero later is genuinely painful.
- **Open-web tier** → source notes carry a `tier` (primary / analyst / journalism / reference / secondary) and that is enough.

If they are unsure, ask what happens to the output: something that will be cited by other people wants the academic tier; something that informs a decision they will make themselves does not.

### 6. In / out of scope

- What sub-topics *must* be included?
- What sub-topics are tempting but you want to keep out (adjacent rabbit holes)?
- Any specific angles you *don't* want the research to take (e.g., "I want the philosophical argument, not the neuroscience")?

### 7. Success criteria

- How will you know this project has "worked" for you?
- What's the first thing you'd want to do with the knowledge graph a week from now?

---

## Domain-flavored variants

### Historical topics (e.g., "the history of monetary policy")

- What era anchors the story for you — where does it start?
- Are we tracking events, ideas, institutions, or people? (Or all of them, weighted how?)
- Is this a "how did we get here" story pointing at the present, or a self-contained historical study?

### Scientific / technical topics (e.g., "protein folding")

- Do you want the current scientific state, the historical development, or both?
- What's your baseline — no background, undergrad-level, working practitioner?
- Are experimental methods in scope, or is it just the theory / results?

### Philosophical / argumentative topics (e.g., "substrate-independence of consciousness")

- Are you researching the argument to evaluate it, defend it, refute it, or map the landscape?
- Do you want the intellectual history, the current state of debate, or both?
- Should the graph give equal weight to opposing positions, or center one and treat others as critique?

### Learning-a-skill topics (e.g., "systems programming in Rust")

- Are you optimizing for building working understanding, passing an exam, or shipping a specific project?
- Do you learn best from theory-first, project-first, or example-first materials?
- Which parts of the ecosystem do you *not* want to touch yet?

---

## When to stop asking

You have enough scope when you can, without further consultation, produce all six of these:

1. A one-sentence project question a subagent can orient to
2. **3–6 research angles**, each with a name, a one-line blurb, and a clear boundary against its neighbours
3. For each angle, 3–5 topics in scope
4. A clear "not this" boundary — the out-of-scope list
5. A source-quality bar, including the sourcing tier from 5b
6. **The open threads**, specific enough to become `question` notes with priorities

Items 2 and 6 are the ones people under-invest in. The angles become tag slugs, graph colours and `map.md` sections; the open threads become the work queue that Phase 6 pulls from for the life of the project. Vague angles produce a graph that is bloated and shapeless; vague threads produce a queue nobody can act on.

If any of the six still feels vague, ask one more question. If they are all sharp, move to Phase 3.

### Domain predicates — usually inferred, occasionally asked

Phase 3 also proposes 0–6 domain predicates beyond the core vocabulary. You can normally infer these from the topic (a legal project wants `overrules` / `overruled-by`; a biology project `expressed-in`), so do not spend an interview question on it — propose them in the scope summary and let the user correct. Only ask directly if the topic has an obvious relational structure you cannot name confidently.

**A rough calibration:** 5 questions is often too few for anything but the narrowest topics. 12+ questions is a sign you're asking questions that aren't sharpening scope — pause and check what you're actually uncertain about. Most projects land around 7–9 questions when in "continue at will" mode.

## When the user pins a low question count

If the user picked mode (a) with a low ceiling (e.g., "ask me 5 questions then go"), **make the first question about existing footing.** Their answer tells you whether the ceiling is going to work: a user who already knows the terminology and has read the canonical texts can be scoped in 5 questions on a narrow topic; a user starting cold on a broad topic almost cannot. If the ceiling looks like it will leave scope under-specified, say so once — "Given how much ground this covers, 5 questions is going to leave the graph pretty coarse. Want to raise the ceiling or should I proceed and note gaps aggressively?" — and take their answer. Do not silently blow past the count they set.
