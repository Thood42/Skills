# Deck assets

Populate these folders with your own files; `scripts/assets.py` inlines whatever
a deck references so the exported `.html` stays a single, offline file.

- `icons/`  — SVG line/solid icons. Author with `stroke="currentColor"` (or
  `fill="currentColor"` for solid) so they inherit the slide's theme color and
  recolor under per-slide overrides. Reference by filename (without `.svg`):
  `{ "icon": "rocket" }`  or  `{ "icon": "rocket", "color": "--mint" }`.
- `images/` — PNG / JPG / SVG artwork. Reference by filename (without extension):
  `{ "image": "architecture" }`. PNG/JPG are base64-embedded; SVG becomes a
  data URI. Only referenced images are embedded, so unused files add no weight.
- `styles/` — one optional brand `.css`. Inlined after `:root`.

Regenerate the index any time with: `python3 scripts/assets.py manifest`
