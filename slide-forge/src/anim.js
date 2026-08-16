(function(){
  /* R = "resolve to finished state immediately" - true for reduced-motion users
     AND during static capture, so headless renders show the final frame, not a
     frozen mid-animation. (See the SG block in <head>.) */
  var R = (window.SG && SG.static) || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================================
     SG.motion (v3.6) — role-driven entrance motion. JS never picks an
     animation; it only resolves a preset/reveal and stamps data-role + --i
     so anim.css can do the rest (see docs/plans/slide-forge-motion). This
     slice: the tracer — resolve() is hardcoded, roleOf() only recognizes an
     already-authored data-role or a data-arr container ("list"). Slice 2
     widens both into the full vocabulary. */
  window.SG = window.SG || {};
  SG.motion = SG.motion || {};
  SG.motion.ROLES = ['title','kicker','lead','body','meta','list','group',
                      'figure','number','quote','chrome'];

  /* Resolve one element's role. Precedence: authored data-role > data-arr
     container ("list") > null (not animated). Widened in slice 2. */
  SG.motion.roleOf = function(node){
    var r = node.getAttribute && node.getAttribute('data-role');
    if(r) return r;
    if(node.hasAttribute && node.hasAttribute('data-arr')) return 'list';
    return null; };

  /* The deck -> slide cascade. Hardcoded to 'standard' until slice 2 reads
     defaults.motion / slide.motion. Never reads the DOM. */
  SG.motion.resolve = function(slide, data){
    return { motion:'standard', reveal:null, stepped:false }; };

  /* One pass over a freshly built <section>: stamps data-motion, gives every
     [data-arr] container role="list", and assigns --i to its children in
     document order (a single counter that continues across every list in
     the section, so later lists don't restart the stagger at 0). --m-span
     is the running total, which slice 2's stagger cap divides against.
     Idempotent: safe to call again on the same section. */
  SG.motion.tag = function(sec, resolved){
    resolved = resolved || SG.motion.resolve();
    sec.setAttribute('data-motion', resolved.motion);
    var i = 0;
    var lists = sec.querySelectorAll('[data-arr]');
    for(var li=0; li<lists.length; li++){
      var list = lists[li], role = SG.motion.roleOf(list);
      if(role && !list.hasAttribute('data-role')) list.setAttribute('data-role', role);
      var kids = list.children;
      for(var k=0; k<kids.length; k++){ kids[k].style.setProperty('--i', String(i++)); }
    }
    sec.style.setProperty('--m-span', String(i)); };

  function fmtC(n){var a=Math.abs(n),T=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
    for(var i=0;i<T.length;i++){if(a>=T[i][0])return (n/T[i][0]).toFixed(1).replace(/\.0$/,'')+T[i][1];}
    return String(Math.round(n));}
  function count(el,to,dur,fmt,suf){var render=function(v){return (fmt==='compact'?fmtC(v):Math.round(v).toLocaleString())+(suf||'');};
    if(R||!dur){el.textContent=render(to);return;}var t0=null;
    (function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,3);
      el.textContent=render(to*e);if(p<1)requestAnimationFrame(step);})(performance.now());}
  function activate(slide){
    /* v3.6 motion system: one class on the section drives every [data-role]
       rule (see anim.css). Toggled the same way as .sg-onenter->.run below,
       so re-entering a slide replays the entrance. Guarded: wire()'s
       "standalone" fallback calls activate(document) when no .slide exists
       yet (the very first DOMContentLoaded tick, before SG.render has run),
       and document has no classList. */
    if(slide.classList){ slide.classList.remove('mrun'); void slide.offsetWidth; slide.classList.add('mrun'); }
    slide.querySelectorAll('.sg-onenter').forEach(function(n){
      n.classList.remove('run');
      /* build steps only apply when the deck opts in (defaults.buildSteps);
         otherwise click-trigger elements behave as normal on-enter */
      var G=window.SG;
      if(n.getAttribute('data-anim-trigger')==='click'
        && G&&G.data&&G.data.defaults&&G.data.defaults.buildSteps) return;
      void n.offsetWidth; n.classList.add('run');});
    slide.querySelectorAll('.sg-count').forEach(function(n){
      count(n,parseFloat(n.dataset.to),R?0:(+n.dataset.dur||1200),n.dataset.fmt||'plain',n.dataset.suffix||'');});
    slide.querySelectorAll('.sg-ring').forEach(function(n){
      var p=+n.dataset.p||0,v=n.querySelector('.sg-ring-v');
      if(R){n.style.setProperty('--p',p); if(v)count(v,p,0,'plain',n.dataset.suffix||'%');return;}
      var t0=null;(function step(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/1200),e=1-Math.pow(1-k,3);
        n.style.setProperty('--p',p*e);if(k<1)requestAnimationFrame(step);})(performance.now());
      if(v)count(v,p,1200,'plain',n.dataset.suffix||'%');});
    slide.querySelectorAll('.sg-draw').forEach(function(c){
      c.querySelectorAll('path,line,polyline,circle,rect,ellipse,polygon').forEach(function(p){
        try{p.style.setProperty('--len', Math.ceil(p.getTotalLength()));}catch(e){}});
      c.classList.remove('run'); void c.offsetWidth; c.classList.add('run');});
  }
  function deactivate(slide){
    /* reset entrance state so it replays next time the slide is shown */
    slide.classList.remove('mrun');
    slide.querySelectorAll('.sg-onenter,.sg-draw').forEach(function(n){n.classList.remove('run');});
    slide.querySelectorAll('.sg-count').forEach(function(n){n.textContent='0';});
  }
  function wire(root){
    /* accept a whole deck OR a single .slide section (targeted re-render) */
    var slides=(root.classList&&root.classList.contains('slide'))
      ? [root] : [].slice.call(root.querySelectorAll('.slide'));
    if(!slides.length){activate(root);return;}              /* standalone: run now */
    slides.forEach(function(s){
      if(s.classList.contains('active'))activate(s);
      var on0=s.classList.contains('active');
      new MutationObserver(function(){var on=s.classList.contains('active');
        if(on&&!on0){activate(s);} else if(!on&&on0){deactivate(s);} on0=on;})
        .observe(s,{attributes:true,attributeFilter:['class']});});
  }
  /* Exposed so the engine can (re)wire observers AFTER each data-driven render -
     at DOMContentLoaded the deck is still empty, so wiring only there leaves the
     first slide's entrance animations (.sg-onenter, opacity:0 base) without their
     .run class: invisible text on load. SG.render calls SG.wireAnims(deck). */
  window.SG=window.SG||{}; window.SG.wireAnims=wire;   /* no local var: would hoist and shadow the global SG read at the top of this IIFE */
  if(document.readyState!=='loading')wire(document);
  else document.addEventListener('DOMContentLoaded',function(){wire(document);});
})();
