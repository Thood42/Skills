# Templates & brand kits — reuse a look, reuse a structure

Two reuse mechanisms landed in v2 phase 4. Both are plain JSON — no server, no registry.

## Brand kit (`brand` in deck-data)

```jsonc
"brand": {
  "name": "Acme",
  "logo": "brand-logo",                  // asset name in deck-assets; auto-placed on cover + closing
  "colors": { "accent1": "#E4572E",      // → --cyan   (primary accent)
              "accent2": "#17BEBB",      // → --indigo
              "accent3": "#FFC914" },    // → --mint
  "fonts":  { "display": "Archivo", "body": "Hanken Grotesk" }   // families from the embedded font set
}
```

A brand **overlays** the active theme: colors land on the accent slots, fonts swap the font
variables — so brand × theme compose (any of the 11 themes can wear Acme's colors, and every
chart/ambient/layout recolors, because nothing hard-codes color). The editor's **Brand kit** panel
(Deck section) has pickers for all of this plus a logo upload that inlines the image into
`deck-assets` so the file stays single-file.

When authoring for a user: ask "brand kit? (logo / colors / fonts — or skip)". If they give a hex or
two, put them in `accent1/2`; don't invent a full kit from nothing.

## Masters — "Save as layout" (`masters` in deck-data)

Any hand-tuned slide can be stored as a reusable pattern *within the deck*: Slide panel →
**★ Save as layout**. Stored shape:

```jsonc
"masters": { "Section intro": {
  "base": "divider",                     // the built-in layout it renders through
  "content": { "index": "01", "title": "Section", "subtitle": "" },
  "ambient": "glow",                     // optional: theme, overrides, freeObjects also kept
} }
```

The **＋ Slide** menu lists masters under "My layouts" beside the built-ins. Inserting one clones
its content/overrides/free objects (fresh ids).

## Template packs — decks as templates (`templates/*.json`)

A pack is one JSON file: theme + defaults + optional brand/masters + **slide skeletons**
(layout order with placeholder text). Skill-side tooling:

```
python3 scripts/deckdata.py template extract deck.html pack.json   # deck -> pack (content stripped)
python3 scripts/deckdata.py template apply pack.json new-deck.html # pack -> fresh deck skeleton
```

`apply` targets a fresh copy of `editor-template.html`; then author content into the skeleton
(`extract`/`inject` as usual). This is the org-template story: "build this deck using my team's
template" = apply their pack, then fill it in.

Curated packs shipped in `templates/`:

| Pack | Theme | Structure |
|---|---|---|
| `training-workshop` | Deep Ocean | cover → agenda → divider → editorial → stats → comparison → line chart → quote → closing |
| `exec-briefing` | Monolith | cover → hero → stats → bar chart → options table → 2×2 matrix → timeline → the ask |
| `product-launch` | Solar Flare | cover → manifesto → problem → before/after → metrics → leaderboard → quote → CTA |
| `research-readout` | Editorial Paper | cover → contents → method → bar-h chart → findings table → voices → recommendations → next |
