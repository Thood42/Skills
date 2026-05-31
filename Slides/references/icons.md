# Icons — offline, themeable, paste-ready line icons

Text-only slides look bare. These ~30 line icons give slides visual anchors without any
dependency: they're inline SVG, so they ship inside the single-file deck and render offline.
Because they use `stroke="currentColor"`, they pick up whatever text color you set — so they
**theme automatically** (set the parent's `color` to a `:root` accent and the icon follows).

## The wrapper (use once per icon)
Every icon below is just the *inner* markup. Drop it inside this wrapper and set the size +
color on the wrapper or the `<svg>`:

```html
<span style="color:var(--cyan)">
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- paste an icon's inner markup here -->
  </svg>
</span>
```

- **Color:** the icon inherits `color`. Use `var(--cyan)`, `var(--indigo)`, `var(--mint)`, or `var(--muted)`.
- **Size:** set `width`/`height` on the `<svg>` (24–48px reads well on a 1280×720 slide).
- **Self-draw animation (optional):** add `class="sg-draw sg-onenter"` to the `<svg>` and the
  runtime traces each stroke on slide-enter (see SKILL.md → animations). Keep `fill="none"`.
- **In the pipeline layout:** the template's `.ico` uses unicode glyphs; swap in one of these
  SVGs for a cleaner look (size ~30px).

## Icon set (inner markup)

**Status & actions**
- `check` — `<path d="M5 13l4 4L19 7"/>`
- `check-circle` — `<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>`
- `x` — `<path d="M6 6l12 12M18 6L6 18"/>`
- `plus` — `<path d="M12 5v14M5 12h14"/>`
- `alert` — `<path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>`
- `info` — `<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>`

**Arrows & flow**
- `arrow-right` — `<path d="M5 12h14M13 6l6 6-6 6"/>`
- `arrow-up-right` — `<path d="M7 17L17 7M9 7h8v8"/>`
- `chevron-right` — `<path d="M9 6l6 6-6 6"/>`
- `trending-up` — `<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>`
- `refresh` — `<path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/><path d="M3 20v-4h4"/>`

**Data & systems**
- `chart-bar` — `<path d="M3 21h18"/><path d="M6 21v-7"/><path d="M12 21V5"/><path d="M18 21v-10"/>`
- `database` — `<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.6 3.1 3 7 3s7-1.4 7-3V6"/><path d="M5 12c0 1.6 3.1 3 7 3s7-1.4 7-3"/>`
- `server` — `<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>`
- `cloud` — `<path d="M7 18a4 4 0 01-.5-8 6 6 0 0111.4 1.5A3.5 3.5 0 0117 18H7z"/>`
- `code` — `<path d="M9 8l-5 4 5 4M15 8l5 4-5 4"/>`
- `globe` — `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>`
- `layers` — `<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>`

**Security**
- `lock` — `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>`
- `shield` — `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/>`
- `key` — `<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M14 9l2 2"/>`

**People & comms**
- `user` — `<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>`
- `users` — `<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5 7-5s7 1.5 7 5"/><path d="M16 4a3.5 3.5 0 110 7"/><path d="M18 20c0-3-1-4.5-3-5.3"/>`
- `mail` — `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>`
- `link` — `<path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 016 6l-1 1"/><path d="M13 18l-1 1a4 4 0 01-6-6l1-1"/>`

**Objects & ideas**
- `lightbulb` — `<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 00-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 00-4-10z"/>`
- `target` — `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12h.01"/>`
- `rocket` — `<path d="M12 3c3 2 5 6 5 10l-3 3h-4l-3-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 17l-2 4M15 17l2 4"/>`
- `bolt` — `<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>`
- `clock` — `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`
- `calendar` — `<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>`
- `document` — `<path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>`
- `folder` — `<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>`
- `gear` — `<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>`
- `star` — `<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8L12 3z"/>`
- `eye` — `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`

## Want a different icon?
These are intentionally simple line glyphs. If you need something not here, hand-draw it in the
same 24×24, `fill="none"`, `stroke-width="2"`, round-cap style so it matches — or, for a richer
pictographic icon, generate an SVG and inline it. Avoid raster icon fonts (they don't theme and
bloat the deck); for photos/logos use `scripts/embed_image.py` instead.
