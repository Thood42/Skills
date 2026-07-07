# Theme gallery — 10 drop-in palettes

Pick a theme **with the user before building** (see SKILL.md → *Choosing a theme*), then
apply it. Every theme is a complete, turnkey swap: a Google-Fonts `<link>` plus a `:root`
block. Nothing else in the deck changes — all color/type flows from these variables.

## How the variables map
The template references three accent slots by the names `--cyan`, `--indigo`, `--mint`
everywhere (kicker, progress bar, glow, chart strokes). **Keep those names** — in each theme
below they simply hold that theme's accent-1 / accent-2 / accent-3 colors (so "Royal Velvet"
puts violet in `--cyan`, etc.). `--stage` is the backdrop behind the slide; `--dot` tints the
subtle dot-grid texture. Light themes set both to light values; that's what makes them read
correctly. `--pad` is unchanged.

## How to apply (2 edits)
1. **Swap the font `<link>`** in the deck `<head>` for the theme's `<link>` line.
2. **Replace the `:root{ … }` block** values with the theme's block (keep your `--pad`).
Then render as usual — the golden-frame check still applies.

Display faces are deliberately distinctive (avoid Arial/Inter/Roboto). Each stack ends in a
`DejaVu` fallback so the deck still renders offline / if the CDN font fails.

---

## 1 · Midnight Neon  (dark · default)
Cool, techy, high-contrast — the original. Cyan/indigo/mint on near-black.
```html
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#05080f; --bg-2:#0a1122;
  --ink:#eaf1fb; --muted:#93a2bd; --faint:#5a6a86;
  --cyan:#3ce8ff; --indigo:#7c8cff; --mint:#44f3c4;
  --panel:rgba(255,255,255,.040); --panel-2:rgba(255,255,255,.065);
  --brd:rgba(255,255,255,.10); --brd-2:rgba(124,140,255,.28); --grid:rgba(124,140,255,.10);
  --glow-cyan:0 0 34px rgba(60,232,255,.40); --stage:#02040a; --dot:rgba(124,140,255,.10);
  --font-display:'Sora','DejaVu Sans',system-ui,sans-serif;
  --font-body:'IBM Plex Sans','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 2 · Solar Flare  (dark · warm)
Energetic amber→orange→gold on warm charcoal. Good for launches, momentum, growth.
```html
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#140b05; --bg-2:#1d1006;
  --ink:#fff3e6; --muted:#d6b59a; --faint:#8a6f5a;
  --cyan:#ffb020; --indigo:#ff6a3d; --mint:#ffd166;
  --panel:rgba(255,240,225,.05); --panel-2:rgba(255,240,225,.08);
  --brd:rgba(255,200,150,.14); --brd-2:rgba(255,122,60,.30); --grid:rgba(255,150,80,.10);
  --glow-cyan:0 0 34px rgba(255,160,40,.40); --stage:#0b0603; --dot:rgba(255,150,80,.10);
  --font-display:'Unbounded','DejaVu Sans',system-ui,sans-serif;
  --font-body:'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'Space Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 3 · Evergreen  (dark · organic)
Emerald/teal/lime with a serif display. Calm, natural, sustainability/health/finance.
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Spectral:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#04110d; --bg-2:#07191a;
  --ink:#e8f6ee; --muted:#97b6a8; --faint:#5d7a6e;
  --cyan:#3ddc97; --indigo:#1fb6a6; --mint:#b6e84a;
  --panel:rgba(230,255,240,.045); --panel-2:rgba(230,255,240,.07);
  --brd:rgba(255,255,255,.10); --brd-2:rgba(45,210,160,.30); --grid:rgba(60,200,150,.10);
  --glow-cyan:0 0 34px rgba(52,224,161,.38); --stage:#02100b; --dot:rgba(60,200,150,.10);
  --font-display:'Fraunces','Georgia','DejaVu Serif',serif;
  --font-body:'Spectral','Georgia','DejaVu Serif',serif;
  --font-mono:'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 4 · Monolith  (dark · monochrome + 1)
Slate greys with a single electric-blue accent. Minimal, modern, design-forward.
```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#0c0d10; --bg-2:#15171c;
  --ink:#f2f4f8; --muted:#9aa0ac; --faint:#5e6470;
  --cyan:#5b8cff; --indigo:#c8cdd8; --mint:#9aa3b2;
  --panel:rgba(255,255,255,.04); --panel-2:rgba(255,255,255,.07);
  --brd:rgba(255,255,255,.10); --brd-2:rgba(91,140,255,.30); --grid:rgba(255,255,255,.06);
  --glow-cyan:0 0 34px rgba(91,140,255,.35); --stage:#060708; --dot:rgba(255,255,255,.06);
  --font-display:'Archivo','DejaVu Sans',system-ui,sans-serif;
  --font-body:'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'Space Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 5 · Royal Velvet  (dark · elegant)
Violet/purple with gold. Premium, editorial, awards/brand/luxury.
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800&family=Lora:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#0e0718; --bg-2:#160a26;
  --ink:#f3ecff; --muted:#b6a6cf; --faint:#7c6b9a;
  --cyan:#b98cff; --indigo:#8a5cff; --mint:#ffcf6b;
  --panel:rgba(245,235,255,.05); --panel-2:rgba(245,235,255,.08);
  --brd:rgba(255,255,255,.10); --brd-2:rgba(138,92,255,.32); --grid:rgba(160,120,255,.10);
  --glow-cyan:0 0 34px rgba(160,110,255,.40); --stage:#07030f; --dot:rgba(160,120,255,.10);
  --font-display:'Playfair Display','Georgia','DejaVu Serif',serif;
  --font-body:'Lora','Georgia','DejaVu Serif',serif;
  --font-mono:'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 6 · Coral Sunset  (dark · warm/friendly)
Coral, peach, warm yellow. Approachable, consumer, marketing, social.
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#160a10; --bg-2:#21101a;
  --ink:#ffeef2; --muted:#d6a9b8; --faint:#93697a;
  --cyan:#ff6f91; --indigo:#ff9671; --mint:#ffc75f;
  --panel:rgba(255,235,240,.05); --panel-2:rgba(255,235,240,.08);
  --brd:rgba(255,255,255,.10); --brd-2:rgba(255,111,145,.30); --grid:rgba(255,140,160,.10);
  --glow-cyan:0 0 34px rgba(255,111,145,.38); --stage:#0b0408; --dot:rgba(255,140,160,.10);
  --font-display:'Syne','DejaVu Sans',system-ui,sans-serif;
  --font-body:'Manrope','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 7 · Deep Ocean  (dark · cool/corporate)
Azure/blue/teal. Trustworthy, enterprise, data, SaaS.
```html
<link href="https://fonts.googleapis.com/css2?family=Epilogue:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=Fira+Code:wght@400;500;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#021018; --bg-2:#04212e;
  --ink:#e6f6ff; --muted:#93b8c9; --faint:#587886;
  --cyan:#38d6ff; --indigo:#3b82f6; --mint:#2ee6c6;
  --panel:rgba(225,245,255,.045); --panel-2:rgba(225,245,255,.07);
  --brd:rgba(255,255,255,.10); --brd-2:rgba(56,150,255,.30); --grid:rgba(56,180,220,.10);
  --glow-cyan:0 0 34px rgba(56,214,255,.38); --stage:#01080f; --dot:rgba(56,180,220,.10);
  --font-display:'Epilogue','DejaVu Sans',system-ui,sans-serif;
  --font-body:'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'Fira Code','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 8 · Editorial Paper  (light · print)
Cream paper, ink-black text, one crimson accent + goldenrod. Serif. Reports, essays, journalism.
```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600;700&family=Source+Serif+4:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#f6f1e7; --bg-2:#efe7d6;
  --ink:#1c1a17; --muted:#4f4a42; --faint:#8a8377;
  --cyan:#c0392b; --indigo:#1c1a17; --mint:#b8860b;
  --panel:rgba(20,18,15,.04); --panel-2:rgba(20,18,15,.07);
  --brd:rgba(20,18,15,.14); --brd-2:rgba(192,57,43,.35); --grid:rgba(20,18,15,.08);
  --glow-cyan:0 0 18px rgba(192,57,43,.18); --stage:#e9e1d2; --dot:rgba(20,18,15,.10);
  --font-display:'Newsreader','Georgia','DejaVu Serif',serif;
  --font-body:'Source Serif 4','Georgia','DejaVu Serif',serif;
  --font-mono:'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 9 · Arctic  (light · clean)
White/ice, azure + teal. Crisp, airy, product, healthcare, modern corporate.
```html
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#ffffff; --bg-2:#eef4fb;
  --ink:#0d1b2a; --muted:#43566b; --faint:#8496a8;
  --cyan:#0091d5; --indigo:#3a5bd9; --mint:#16b8a6;
  --panel:rgba(13,27,42,.035); --panel-2:rgba(13,27,42,.06);
  --brd:rgba(13,27,42,.12); --brd-2:rgba(0,145,213,.32); --grid:rgba(13,27,42,.06);
  --glow-cyan:0 0 18px rgba(0,145,213,.20); --stage:#e4edf6; --dot:rgba(13,27,42,.07);
  --font-display:'Bricolage Grotesque','DejaVu Sans',system-ui,sans-serif;
  --font-body:'Manrope','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'Space Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

## 10 · Sandstone  (light · warm/earthy)
Warm beige, terracotta + olive + ochre. Serif display. Architecture, craft, food, travel.
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```
```css
:root{
  --bg:#f4ece0; --bg-2:#ece0cf;
  --ink:#2a2118; --muted:#5b4f40; --faint:#91836f;
  --cyan:#c1632d; --indigo:#7a7a2e; --mint:#b8902f;
  --panel:rgba(42,33,24,.04); --panel-2:rgba(42,33,24,.07);
  --brd:rgba(42,33,24,.14); --brd-2:rgba(193,99,45,.34); --grid:rgba(42,33,24,.08);
  --glow-cyan:0 0 18px rgba(193,99,45,.18); --stage:#e6d8c4; --dot:rgba(42,33,24,.09);
  --font-display:'Fraunces','Georgia','DejaVu Serif',serif;
  --font-body:'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif;
  --font-mono:'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace;
  --pad:70px 88px;
}
```

---

## Light-theme note
Themes 8–10 are light. They already set `--ink/--muted` dark, `--panel/--brd` as dark-on-light
translucencies, and a light `--stage`/`--dot`, so the deck inverts cleanly. The ambient glow
alphas are lowered (additive glow reads as haze on light backgrounds). If a specific glow still
looks heavy on a light slide, drop its `--glow-cyan` alpha further. Everything else is automatic.

## Making your own
Start from the closest theme, change the two `--bg*` stops and the three accents
(`--cyan/--indigo/--mint`), and let `--brd-2`, `--grid`, and `--glow-cyan` echo accent-1. Keep a
distinctive display face with a `DejaVu` fallback. That's it — the rest of the deck follows.
