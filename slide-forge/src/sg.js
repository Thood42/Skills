/* =====================================================================
   SG — slide globals: deterministic-render flag, seeded RNG, lazy lib loader.
   Defined FIRST so every later script (bespoke runtime, chart/3D snippets,
   library integrations) can rely on it. Why this exists:

   - Reproducibility. Library visuals (Chart.js, Three.js, GSAP) animate via
     requestAnimationFrame, which the headless renderer freezes at an arbitrary
     mid-frame, so two captures of the "same" deck differ. SG.static lets every
     integration JUMP TO ITS FINISHED STATE during capture while the LIVE deck
     still animates for the audience. The renderer sets <html data-static>.
   - Determinism. Anything generative (particles, jitter, demo data) must draw
     from SG.rng (a seeded PRNG), never bare Math.random(), so the same deck
     renders the same pixels every time. Set the seed via <html data-seed="N">.
   - On-demand libs. SG.loadLib(name) injects a vendored script only when needed
     (e.g. heavy Three.js on the one slide that uses it).
   ===================================================================== */
(function(){
  var W = window, SG = W.SG = W.SG || {};
  var root = document.documentElement;

  /* Static (frozen, final-state) capture mode: renderer sets data-static; also
     honoured for ?static and reduced-motion users so they see finished visuals. */
  SG.static = root.hasAttribute('data-static')
    || /[?&]static(?:=1|\b)/.test(location.search)
    || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Seeded PRNG (mulberry32). SG.makeRng(seed) gives an independent stream;
     SG.rng is the deck-wide default seeded from <html data-seed> (fallback 1). */
  SG.makeRng = function(seed){
    var a = (seed>>>0) || 1;
    return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a);
      t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  };
  SG.rng = SG.makeRng(parseInt(root.getAttribute('data-seed')||'1',10));

  /* Registry of vendored libs, name -> {src, global?, type?}. Paths are relative
     to the deck (libs are staged into ./lib/ by bundle.py). UMD libs are usually
     just <script src="lib/..."> tags in <head>; loadLib is for lazy/ESM ones. */
  SG.libs = SG.libs || {
    chartjs:  { src:'lib/chartjs/chart.umd.min.js',     global:'Chart',   type:'umd' },
    mermaid:  { src:'lib/mermaid/mermaid.min.js',       global:'mermaid', type:'umd' },
    katex:    { src:'lib/katex/katex.min.js',           global:'katex',   type:'umd' },
    gsap:     { src:'lib/gsap/gsap.min.js',             global:'gsap',    type:'umd' },
    highlight:{ src:'lib/highlight/highlight.min.js',   global:'hljs',    type:'umd' },
    three:    { src:'lib/three/three.module.min.js',                      type:'esm' }
  };
  SG.loadScript = function(src){ return new Promise(function(res,rej){
    var s=document.createElement('script'); s.src=src; s.async=false;
    s.onload=function(){res();}; s.onerror=function(){rej(new Error('failed to load '+src));};
    document.head.appendChild(s); }); };
  SG.loadLib = function(name){
    var spec = SG.libs[name];
    if(!spec) return Promise.reject(new Error('unknown lib: '+name));
    if(spec.global && W[spec.global]) return Promise.resolve(W[spec.global]);
    if(spec.type==='esm') return import(spec.src);
    return SG.loadScript(spec.src).then(function(){ return spec.global?W[spec.global]:undefined; });
  };

  /* Lets the renderer know all on-enter / async work has settled (mermaid SVG,
     loaded libs, count-ups). Snippets call SG.ready(promise) to register work;
     render.sh waits for window.__SG_READY before screenshotting in static mode. */
  SG._pending = [];
  SG.ready = function(p){ if(p&&p.then) SG._pending.push(p); };
  W.addEventListener('load', function(){
    Promise.all(SG._pending).then(function(){ W.__SG_READY = true; })
                            .catch(function(){ W.__SG_READY = true; });
  });
})();
