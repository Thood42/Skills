(function(){
  /* R = "resolve to finished state immediately" - true for reduced-motion users
     AND during static capture, so headless renders show the final frame, not a
     frozen mid-animation. (See the SG block in <head>.) */
  var R = (window.SG && SG.static) || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmtC(n){var a=Math.abs(n),T=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
    for(var i=0;i<T.length;i++){if(a>=T[i][0])return (n/T[i][0]).toFixed(1).replace(/\.0$/,'')+T[i][1];}
    return String(Math.round(n));}
  function count(el,to,dur,fmt,suf){var render=function(v){return (fmt==='compact'?fmtC(v):Math.round(v).toLocaleString())+(suf||'');};
    if(R||!dur){el.textContent=render(to);return;}var t0=null;
    (function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,3);
      el.textContent=render(to*e);if(p<1)requestAnimationFrame(step);})(performance.now());}
  function activate(slide){
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
    slide.querySelectorAll('.sg-onenter,.sg-draw').forEach(function(n){n.classList.remove('run');});
    slide.querySelectorAll('.sg-count').forEach(function(n){n.textContent='0';});
  }
  function wire(root){
    var slides=root.querySelectorAll('.slide');
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
