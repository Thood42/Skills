# Code highlighting (highlight.js) & media

## highlight.js — accurate multi-language highlighting

For a **short** snippet in one language, the template's hand-spanned `.code-panel`
(`.k/.fn/.s/.c/.n`) is best — full control, zero deps. Reach for highlight.js when the code is
**long** or **multi-language** and hand-spanning every token is impractical.

Setup: `<meta name="deck-libs" content="highlight">` plus:
```html
<link rel="stylesheet" href="lib/highlight/styles/github-dark.min.css">
<script src="lib/highlight/highlight.min.js"></script>
```

highlight.js does no animation, so it's fully deterministic — no `SG.static` handling needed.
Mark up a block and highlight it:

```html
<pre style="flex:1; min-height:0; overflow:auto; border-radius:12px"><code class="language-python">
def attention(q, k, v):
    w = softmax(q @ k.T / d ** 0.5)
    return w @ v
</code></pre>
<script> if(window.hljs) hljs.highlightAll(); </script>
```

### Make it match the deck
The stock `github-dark` theme uses its own background and palette, which can clash with the
slide. Override the few surfaces with your `:root` vars so it reads as part of the deck:

```html
<style>
  .hljs{ background:var(--panel) !important; color:var(--ink); }
  .hljs-keyword,.hljs-built_in{ color:var(--indigo) !important; }
  .hljs-string,.hljs-number{ color:var(--mint) !important; }
  .hljs-title,.hljs-function .hljs-title{ color:var(--cyan) !important; }
  .hljs-comment{ color:var(--faint) !important; font-style:italic; }
  pre code.hljs{ padding:20px 24px; font-family:var(--font-mono); font-size:16px; line-height:1.5; }
</style>
```

Gotchas:
- Keep the code **short enough to read on a slide** — highlighting doesn't fix a 40-line wall.
  Prefer the essential 5–12 lines.
- The leading newline after `<code …>` is fine; highlight.js trims it. Don't HTML-escape inside
  by hand — put raw code in and let the browser handle it (avoid stray `<`/`>` though;
  escape those as `&lt;`/`&gt;`).
- `language-xxx` class picks the grammar; omit it to let hljs auto-detect (less reliable).

## Media (images, video, embeds)

These need no library, just offline discipline so they appear in renders:
- **Images:** reference a local file copied next to the deck (or base64-embed small ones inline).
  Remote URLs won't appear in offline PNG renders — same rule as CDN scripts.
- **Video:** `<video>` won't show a meaningful frame in a static screenshot. For inspection,
  put a poster image (`poster="…"`) so the capture shows something; the live deck still plays.
- **Maps / rich embeds:** prefer a static exported image on the slide over a live iframe, which
  needs network and won't render offline. If you truly need interactivity, accept that the PNG
  inspection will show a blank frame and verify that slide live.
