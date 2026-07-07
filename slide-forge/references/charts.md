# Charts & tables — author data, never SVG

Since v2, the `chart` layout is **data-driven**: you write labels + series, the in-file renderer
(`SG.charts`) draws theme-token SVG. Never hand-write chart SVG unless the figure is truly bespoke
(then use the `svg`/`body` escape hatch, which still works).

## chart

```jsonc
{ "layout": "chart",
  "content": {
    "kicker": "Revenue", "title": "Revenue by quarter",
    "type": "bar",                    // bar | bar-h | stacked | line | area | pie | donut | scatter
    "data": {
      "labels": ["Q1","Q2","Q3","Q4"],
      "series": [ { "name": "2025", "values": [4.1, 5.0, 5.8, 7.2] },
                  { "name": "2026", "values": [5.2, 6.1, 7.4, 9.0] } ]
    },
    "options": { "unit": "$M",        // suffix on tick + value labels
                 "showValues": true,  // value labels on bars/points (auto-hidden at 3+ series)
                 "yMax": null },      // force the axis ceiling; null = auto ("nice" 1/2/2.5/5×10^k)
    "note": "Source: finance close, Jun 2026"
  } }
```

Rules:
- **Every series needs exactly one value per label** — the renderer (and `validate.py`) reject
  mismatched lengths.
- `pie`/`donut` read only the **first** series; each label is a slice. The side legend shows values
  (+ percentages when `showValues`).
- `scatter` plots each series' values as unconnected points at the label positions.
- Colors come from `--chart-1…6` (accents 1–3 + derived mixes) — charts recolor with the **theme**
  and with **brand kits** automatically. Never hard-code a color in chart data.
- Charts animate on slide-enter (bars grow, lines draw) and resolve to the finished frame for
  PDF/static capture and reduced-motion users.
- In the editor, selecting a chart slide shows a **mini data grid** (labels × series with add/remove
  and a type switcher) — edits preview live.

## table

```jsonc
{ "layout": "table",
  "content": {
    "title": "Plan comparison",
    "columns": ["", "Starter", "Pro"],
    "rows": [ ["Seats", "5", "50"],
              ["SSO", "—", "✓"] ],
    "options": { "highlightCol": 2,   // 0-based column index to tint (omit for none)
                 "compact": false },  // denser padding for big tables
    "note": "Prices as of July 2026"
  } }
```

- First column renders as row headers (display font, ink color). Cells accept the usual inline
  markers (`**bold**`, `[[glow]]`, `` `mono` ``).
- Keep tables ≤ ~7 rows × 5 columns on a slide; use `compact` beyond that, or split the slide.
