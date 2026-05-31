# Diagrams (Mermaid) & Math (KaTeX)

## Mermaid — flowcharts, sequence, state, gantt, ER

Declare a diagram as text and let Mermaid lay it out. Don't hand-draw boxes/arrows for
anything Mermaid can express.

Setup: `<meta name="deck-libs" content="mermaid">` + `<script src="lib/mermaid/mermaid.min.js"></script>`

Mermaid renders **asynchronously**, so register it with `SG.ready` so the renderer waits for
the SVG before screenshotting. Initialise with `startOnLoad:false` and a dark theme, then run
it yourself and theme the result via CSS variables.

```html
<section class="slide" data-i="4">
  <div class="eyebrow-row"><span class="kicker">How it flows</span></div>
  <h2 class="title">Request lifecycle</h2>
  <div class="mermaid" id="m4" style="flex:1; min-height:0; margin-top:20px; display:grid; place-items:center">
graph LR
  A[Client] --> B{Auth?}
  B -- yes --> C[API]
  B -- no  --> D[Login]
  C --> E[(DB)]
  </div>
  <div class="pager">04 / 12</div>
  <div class="progress" style="width:33%"></div>
</section>

<script>
(function(){
  if(!window.mermaid) return;
  var css=getComputedStyle(document.documentElement);
  mermaid.initialize({ startOnLoad:false, theme:'dark', securityLevel:'loose',
    themeVariables:{
      fontFamily: css.getPropertyValue('--font-body').trim(),
      primaryColor: 'rgba(124,140,255,.12)',
      primaryBorderColor: css.getPropertyValue('--cyan').trim(),
      primaryTextColor: css.getPropertyValue('--ink').trim(),
      lineColor: css.getPropertyValue('--indigo').trim() } });
  var p = mermaid.run({ querySelector:'#m4' });   // returns a promise
  if(window.SG) SG.ready(p);
})();
</script>
```

Gotchas:
- The diagram text inside `.mermaid` is **whitespace-sensitive** — keep it left-aligned at the
  element's start, not indented to match the HTML.
- Mermaid has no per-frame animation, so it's deterministic once the SVG exists — the only
  trick is *waiting* for it, which `SG.ready` handles.
- It's a large file; only add it to decks that actually show a diagram.

## KaTeX — LaTeX math

Setup: `<meta name="deck-libs" content="katex">` plus **both** the JS and CSS:
```html
<link rel="stylesheet" href="lib/katex/katex.min.css">
<script src="lib/katex/katex.min.js"></script>
```
The CSS pulls in KaTeX's fonts. In `stage`/`folder` bundles those live in `lib/katex/fonts/`;
in a `single` bundle `bundle.py` base64-embeds them into the inlined CSS, so the equation still
renders in one portable file. Don't drop the CSS — without it math renders unstyled.

Render specific spans (synchronous, fully deterministic — no `SG.static` handling needed):

```html
<div class="hero-num" id="eq" style="font-size:42px"></div>
<script>
  if(window.katex) katex.render("\\hat{y} = \\sigma\\!\\left(\\sum_i w_i x_i + b\\right)",
    document.getElementById('eq'), { displayMode:true, throwOnError:false });
</script>
```

For inline math in body copy, wrap a `<span>` per expression and call `katex.render` on each
(or `renderMathInElement` if you also vendor the auto-render extension). KaTeX inherits text
color from the slide, so it themes for free; size it via the surrounding element.
