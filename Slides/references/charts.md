# Charts — Chart.js (and D3 when you outgrow it)

Use Chart.js when slidegen's inline-SVG charts aren't enough: a second y-axis, mixed
bar+line, time-series, many series, or rich built-in interactivity. For ≤ a few simple
series, stay on `slidegen.py chart …` — it's lighter and already offline/themed.

## Setup
`<meta name="deck-libs" content="chartjs">` and, in `<head>`:
`<script src="lib/chartjs/chart.umd.min.js"></script>`

## Themed, deterministic Chart.js slide

Give the chart its own slide with a sized wrapper (Chart.js fills its canvas's box).
The two non-negotiables — `animation:false` under `SG.static`, and seeded data via
`SG.rng` — are what keep the headless render reproducible.

```html
<section class="slide" data-i="6">
  <div class="eyebrow-row"><span class="kicker">Adoption</span></div>
  <h2 class="title">Two metrics, two axes</h2>
  <div style="position:relative; flex:1; min-height:0; margin-top:24px">
    <canvas id="c6"></canvas>
  </div>
  <div class="pager">06 / 12</div>
  <div class="progress" style="width:50%"></div>
</section>

<script>
(function(){
  var css = getComputedStyle(document.documentElement);
  var CYAN=css.getPropertyValue('--cyan').trim(), INDIGO=css.getPropertyValue('--indigo').trim();
  var MUTE=css.getPropertyValue('--muted').trim(), GRID=css.getPropertyValue('--grid').trim();
  function build(){
    var ctx = document.getElementById('c6');
    if(!ctx || ctx.__done) return; ctx.__done = true;
    new Chart(ctx, {
      data:{ labels:['Q1','Q2','Q3','Q4'],
        datasets:[
          { type:'bar',  label:'Signups', data:[120,180,240,320], backgroundColor:INDIGO+'cc', yAxisID:'y' },
          { type:'line', label:'Conversion %', data:[4.1,5.0,6.3,7.1], borderColor:CYAN,
            backgroundColor:'transparent', tension:.35, yAxisID:'y1' } ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        animation: (window.SG && SG.static) ? false : {duration:900},  // FREEZE for capture
        plugins:{ legend:{ labels:{ color:MUTE } } },
        scales:{
          x:{ ticks:{color:MUTE}, grid:{color:GRID} },
          y:{ position:'left',  ticks:{color:MUTE}, grid:{color:GRID} },
          y1:{ position:'right', ticks:{color:MUTE}, grid:{display:false} } }
      }});
  }
  // Build when its slide first activates (and once now if already active).
  var s=document.querySelector('[data-i="6"]');
  if(s.classList.contains('active')) build();
  new MutationObserver(function(){ if(s.classList.contains('active')) build(); })
    .observe(s,{attributes:true,attributeFilter:['class']});
})();
</script>
```

### Notes / gotchas
- **Wrapper must be sized.** Chart.js reads the canvas parent's height; inside a flex slide
  give the wrapper `flex:1; min-height:0; position:relative`. Without `min-height:0` a flex
  child won't shrink and the canvas balloons.
- **Build on slide-activate, not DOMContentLoaded**, so it lays out at full size and (re)draws
  correctly when navigated to — mirrors the bespoke runtime's pattern.
- **Colors come from `:root`** via `getComputedStyle`; never hard-code hexes, so retheming the
  deck retints the chart. Append alpha as a hex suffix (`+'cc'`) for fills.
- **Seed any generated data** with `SG.rng` (e.g. `Array.from({length:30},()=>SG.rng()*100)`).

## D3 (lazy)
Fetch on demand: `python3 scripts/libfetch.py d3`. Use only when you're hand-building a viz
Chart.js can't express (force-directed graphs, custom layouts, geo projections). You own the
render loop, so: drive any randomness through `SG.rng`, and when `SG.static` is true skip
`.transition()` (apply final attrs directly) so the capture is the end state. Read `:root`
colors the same way as above.
