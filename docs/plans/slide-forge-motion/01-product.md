# Product: slide-forge v3.6 — motion that follows the content

## Problem

Someone asks Claude for a deck, opens it, and presents it. What they see:

> "Some slides come alive and some just sit there. On my numbers slide the figures count up —
> nice. The bullet list on the very next slide just *appears*, all at once, like a screenshot.
> My agenda animates in one by one but the comparison table doesn't. Every title is styled the
> same, but only two of them ever move. It looks like a different person built each slide."

And when they try to calm it down:

> "I set the motion to 'none' because I present to a hospital board and the swooshing was too
> much. Half my text disappeared. Not 'stopped moving' — *gone*. I had to put it back."

Three separate complaints underneath that, all confirmed by measurement:

1. **Motion is decided by the slide shape, not by what's on the slide.** A title behaves one way
   on the opening slide and another way everywhere else. A list of five things animates in
   sequence on an agenda and lands as a block on a comparison. Nobody chose this — it is an
   accident of which slide shape got motion attention when it was first built. **15 of the 31
   slide shapes have no entrance motion at all.** Titles move on **2 of the 23** shapes that have
   one. Lists arrive in sequence on **10 of 20**. That's **31 elements on a full deck behaving
   unlike an identical element elsewhere in the same deck.**

2. **Turning motion down destroys content.** The one documented way to quiet a slide
   (`"ambient":"none"`, which the reference tells people to use, and which can be set deck-wide)
   silences the animation *and strands the animated content in its hidden starting state*. It is
   invisible for the rest of the presentation. Measured: a title that settles at full opacity
   normally has **zero animations and stays fully transparent** with that one setting on. The
   exported PDF is fine — this only bites in the room, while presenting.

3. **Claude can't actually direct any of this when it builds the deck.** Writing a deck, the only
   motion decisions available are "pick a background texture" and "make this number count up."
   Everything else is a fixed consequence of the slide shape chosen for other reasons — content
   fit, not motion. So no matter how carefully the deck is written, the motion is whatever the
   shapes happened to come with. There is no way to say *this deck should be calm* or *build this
   list up point by point as I talk*.

4. **And when you can step through a list, there is only one way for the words to arrive.**
   Revealing a point at a time is one decision; *how* that point lands is a different one, and
   people have strong preferences about it — some want the line to type out, some want it to wipe
   in, and a lot of presenters don't want anything hidden at all: they want the whole list on the
   slide with the current line lit and the rest dimmed back, so the room can see the shape of the
   argument while you talk to one part of it. Today that is one fixed animation with no say in it,
   no default you can set once for a deck, and no way to make a single dense slide behave
   differently from the rest.

There is also a smaller, visible bug: lists animate in sequence only up to six items. On a
nine-item list, items **1, 7, 8 and 9 all appear together**, then 2 through 6 trail in after
them. It reads as broken rather than staggered.

## Success metric

**Inconsistent elements on the audit deck: 31 today → 0.**

An "inconsistent element" is one that behaves differently from an identical element elsewhere in
the same deck — a title that doesn't move while other titles do, a list that lands as a block
while other lists arrive in sequence. Measured by a repeatable audit that renders every slide
shape and every section type once and compares like against like. The audit is the metric: it
runs in the test suite, prints the count, and fails the build if it goes above zero.

Three supporting numbers, same audit, all currently failing:

| | today | target |
|---|---|---|
| Elements left invisible at any motion setting | every entrance element on a quieted slide | **0** |
| Slide shapes with no entrance motion | 15 of 31 | **0** (`raw` excepted — it is deliberately hand-authored) |
| Longest list that staggers correctly | 6 items | **unbounded** |
| Ways a stepped point can arrive | 1, fixed | **5**, with a deck default that can be overridden per slide |

## Announcement — the blog post before the feature

**Motion that follows your content, not your layout.**

Until now, whether something on your slide moved depended on which slide shape it landed in — a
title glided in on the opening slide and simply appeared on the next twelve. As of 3.6, motion is
a property of *what an element is*, not *where it sits*: every title enters the same way, every
list arrives in sequence, every figure and quote and picture behaves the way its kind behaves,
across all 31 slide shapes and all 12 section types. You also get one dial for the whole deck —
**calm**, **standard**, or **expressive** — plus a real **off** that actually leaves your content
on the screen, which the old "none" setting did not. And when you want to talk through a list point
by point, you can ask for that up front and choose how each point arrives: it can appear, wipe in,
type out, land word by word, or — if you'd rather hide nothing at all — sit on the slide from the
start while the spotlight moves down it. Set that once for the deck, change it on the one slide
that needs to be different. Nothing you have already made changes unless you want it to.

## Screens

Three mockups in `./mockups/`, all live — they animate, so you can judge the actual feel rather
than read a description of it.

- `01-audit.html` — **the problem, made visible.** The same four content elements (title, list,
  figure, number) shown as they behave today across four different slide shapes, side by side, with
  the inconsistency called out. Includes the disappearing-content bug reproduced live.
- `02-motion-roles.html` — **the proposal.** The same elements under the new model, with a
  live **calm / standard / expressive / off** switch, so the four settings can be compared by
  watching them. Also demonstrates an unbounded stagger on a nine-item list.
- `03-build-steps.html` — **talking through a list, and how the words arrive.** A slide that
  reveals point by point on click, with all five reveal styles switchable live (appear, wipe,
  typewriter, word by word, spotlight) and the **deck default → this slide** override shown as two
  separate controls, so the cascade is visible rather than described. Also demonstrates that with
  motion off, every style leaves the whole list on the slide.
