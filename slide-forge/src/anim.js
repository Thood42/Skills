(function(){
  /* R = "resolve to finished state immediately" - true for reduced-motion users
     AND during static capture, so headless renders show the final frame, not a
     frozen mid-animation. (See the SG block in <head>.) */
  var R = (window.SG && SG.static) || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =====================================================================
     SG.motion (v3.6) — role-driven entrance motion. JS never picks an
     animation; it only resolves a preset/reveal and stamps data-role + --i
     so anim.css can do the rest (see docs/plans/slide-forge-motion). Slice 2:
     the full role vocabulary (FIELD_ROLE + CLASS_ROLE), the real deck->slide
     cascade, and a section-wide tag() pass. */
  window.SG = window.SG || {};
  SG.motion = SG.motion || {};
  SG.motion.ROLES = ['title','kicker','lead','body','meta','list','group',
                      'figure','number','quote','chrome'];

  /* data-bind's LAST path segment -> role. Derived from the ~20 field names
     layouts actually author (measured at Gate 2, see 03-program-design.md). */
  SG.motion.FIELD_ROLE = {
    title:'title', kicker:'kicker', subtitle:'lead', sub:'lead',
    lead:'lead', body:'body', head:'title', desc:'body',
    quote:'quote', by:'meta', label:'meta', note:'meta',
    caption:'meta', value:'number', year:'meta', tag:'meta',
    name:'body', statement:'quote', index:'meta', accent:'title' };

  /* class/tag table for what data-arr and data-bind cannot speak for.
     h1.title is its own entry: two layouts (cover, closing) build a title
     that mixes bound and unbound content (an inline accent span alongside
     plain text), so they key it (`key:'title'`) instead of binding it
     (`bind:'title'`) — FIELD_ROLE alone would miss them, and "every title
     enters the same way" is the headline promise, not an edge case. */
  SG.motion.CLASS_ROLE = [
    ['h1.title', 'title'],
    ['.chart-anim,.tbl-wrap,.code-panel,.ms-media,.fig-img,img,svg', 'figure'],
    ['.sg-count,.hero-num,.num,.sg-ring', 'number'],
    ['.rail,.quote-mark,.tl-track,.tl-spark,.vs-rail,.divline,' +
     '.pager,.progress,.amb,.dotrow,.code-sweep', 'chrome'] ];

  /* Resolve one element's role. Precedence: authored data-role (baked in at
     build time via N()'s role: attr, or set by an earlier tag() pass) >
     data-arr container ("list") > data-bind field > class table > null
     (not animated). */
  SG.motion.roleOf = function(node){
    var r = node.getAttribute && node.getAttribute('data-role');
    if(r) return r;
    if(node.hasAttribute && node.hasAttribute('data-arr')) return 'list';
    var bind = node.getAttribute && node.getAttribute('data-bind');
    if(bind){
      var seg = bind.split('.'), field = seg[seg.length-1];
      if(SG.motion.FIELD_ROLE[field]) return SG.motion.FIELD_ROLE[field];
    }
    for(var i=0; i<SG.motion.CLASS_ROLE.length; i++){
      try{ if(node.matches && node.matches(SG.motion.CLASS_ROLE[i][0])) return SG.motion.CLASS_ROLE[i][1]; }
      catch(e){}
    }
    return null; };

  /* The deck -> slide cascade. Never reads the DOM. overrides[key].anim (a
     per-element choice) wins over all of this, but that's enforced in CSS
     (:not([data-anim])) rather than here. */
  SG.motion.resolve = function(slide, data){
    slide = slide || {};
    data = data || (window.SG && SG.data) || {};
    var defaults = data.defaults || {};
    var motion = slide.motion || defaults.motion || 'standard';
    var revealSrc = slide.reveal || defaults.reveal || null;
    return {
      motion: motion,
      reveal: revealSrc ? {style: revealSrc.style || 'appear', unit: revealSrc.unit || 'item'} : null,
      stepped: !!revealSrc };
  };

  /* The ordered step units for a slide: children of the FIRST
     [data-role="list"] (unit:'item' — a list is almost always what a
     presenter means by "step through this"), or, when the section has no
     list at all, its own top-level roled blocks excluding chrome
     (unit:'block' — e.g. stepping through kicker -> title -> body on a
     dense text slide). Whichever branch applies is the ONLY source of
     truth for what a step is: tag() marks exactly these elements with
     data-step, and the CSS reveal rules target data-step, so JS and CSS
     structurally cannot disagree. */
  SG.motion.steps = function(sec){
    var list = sec.querySelector('[data-role="list"]');
    if(list) return [].slice.call(list.children);
    return [].slice.call(sec.children).filter(function(c){
      var r = c.getAttribute('data-role'); return r && r!=='chrome'; });
  };

  /* Withholding styles (appear/wipe/typewriter/words) hide what's next;
     the focusing style (spotlight) hides nothing and moves a .live marker
     instead. Both advance identically via SG.stepNext(). */
  SG.motion.isFocusing = function(style){ return style==='spotlight'; };

  /* Split a step unit's text into per-word (.wd) spans, each holding
     per-character (.ch) spans, for the two reveal styles that need
     something finer than "the whole unit". PRESENT MODE ONLY: refuses
     while document.body carries .forge-edit, because wrapping the inside
     of a [data-bind] leaf would fight the editor's contenteditable commit
     path (which writes an edited element's live text back to the content
     field on Enter/blur — span markup landing in there would corrupt the
     deck JSON, not just look wrong). Rebuilt from the unit's OWN live text
     every time a slide activates (never touches SG.data), so nothing here
     is ever persisted — the next render starts from data again. Walks
     every text node inside the unit, not just its direct text, so an
     item's internal structure (an h3 title, a p description) keeps its
     own elements; only the text itself is replaced, with one counter
     continuing in reading order across every text node in the unit.
     Idempotent via data-split: calling it twice on an already-split unit
     (its text nodes are now single characters) would double-wrap and
     mangle them, so a second call is a no-op unless the unit is re-split
     by a fresh render (which starts from a fresh, unsplit DOM). */
  SG.motion.split = function(unit, style){
    if(style!=='typewriter' && style!=='words') return;
    if(document.body && document.body.classList.contains('forge-edit')) return;
    if(unit.getAttribute('data-split')===style) return;
    var ci=0, wi=0;
    var walker=document.createTreeWalker(unit, NodeFilter.SHOW_TEXT, null);
    var texts=[], n;
    while((n=walker.nextNode())) if(n.nodeValue) texts.push(n);
    texts.forEach(function(textNode){
      var words=textNode.nodeValue.split(' ');
      var frag=document.createDocumentFragment();
      words.forEach(function(w,k){
        var wd=document.createElement('span'); wd.className='wd';
        wd.style.setProperty('--i', String(wi++));
        for(var i=0;i<w.length;i++){
          var ch=document.createElement('span'); ch.className='ch';
          ch.style.setProperty('--i', String(ci++)); ch.textContent=w[i];
          wd.appendChild(ch);
        }
        frag.appendChild(wd);
        if(k<words.length-1){
          var sp=document.createElement('span'); sp.className='ch';
          sp.style.setProperty('--i', String(ci++)); sp.textContent=' ';
          frag.appendChild(sp);
        }
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
    unit.setAttribute('data-split', style);
  };

  /* Set a custom property by editing the style ATTRIBUTE STRING directly,
     never via el.style.setProperty(). Some elements this walk touches
     already carry a hand-authored inline style with a var()-in-shorthand
     value (e.g. figure's no-image fallback: `background:linear-gradient(
     135deg,var(--bg-2),var(--bg))`); routing even an unrelated custom
     property through the CSSOM forces the whole attribute to be re-parsed
     and re-serialized, and at least one CSS engine in this project's tooling
     (jsdom's cssstyle) drops values it can't round-trip when it does that —
     silently deleting the background. Plain string editing can't trigger
     that class of bug in ANY engine, browsers included, and is idempotent
     (replaces a prior value for the same property instead of appending). */
  function setProp(el, name, val){
    var decls = (el.getAttribute('style')||'').split(';').map(function(s){ return s.trim(); })
      .filter(function(s){ return s && s.slice(0,s.indexOf(':')).trim()!==name; });
    decls.push(name+':'+val);
    el.setAttribute('style', decls.join(';')+';'); }

  /* One pass over a freshly built <section>: stamps data-motion/data-reveal,
     then walks the whole section in document order assigning role + a single
     monotonic --i (list children continue the parent's sequence, so a title
     before a list doesn't reset the count to 0). --m-span is the running
     total, which the stagger cap (anim.css) divides against — never let it
     hit 0, calc(x/0) is invalid CSS.
     List ITEMS are a "blocked" subtree: once inside one, FIELD_ROLE/CLASS_ROLE
     tagging stops (the item itself is the animated unit via the CSS
     `[data-role="list"]>*` rule; independently tagging a nested title/label
     inside it would double-animate the same visual motion). An authored
     data-role (e.g. group on .cmp) is never blocked — roleOf() reads it
     before FIELD_ROLE/CLASS_ROLE even run, and the walk still descends into
     a group's own children (a group can contain further lists/titles).
     Idempotent: safe to call again on the same section. */
  SG.motion.tag = function(sec, resolved){
    resolved = resolved || SG.motion.resolve();
    sec.setAttribute('data-motion', resolved.motion);
    if(resolved.reveal) sec.setAttribute('data-reveal', resolved.reveal.style);
    else sec.removeAttribute('data-reveal');
    var i = 0;
    function walk(el, blocked){
      var kids = el.children;
      for(var k=0; k<kids.length; k++){
        var child = kids[k];
        if(child.hasAttribute('data-arr')){
          if(!child.hasAttribute('data-role')) child.setAttribute('data-role','list');
          var items = child.children;
          for(var ii=0; ii<items.length; ii++){ setProp(items[ii], '--i', String(i++)); }
          for(var ij=0; ij<items.length; ij++){ walk(items[ij], true); }
          continue;
        }
        if(!blocked){
          var role = SG.motion.roleOf(child);
          if(role){
            if(!child.hasAttribute('data-role')) child.setAttribute('data-role', role);
            /* chrome never animates, so it never needs --i */
            if(role!=='chrome') setProp(child, '--i', String(i++));
          }
        }
        walk(child, blocked);
      }
    }
    walk(sec, false);
    setProp(sec, '--m-span', String(Math.max(1,i)));
    /* Slide-level reveal (slice 4): mark the step units data-step so the
       CSS reveal rules and SG.stepNext() both key off the exact same set
       SG.motion.steps() computes. Untagged (no leftover data-step) when the
       slide isn't stepped, so an edit that removes a slide's reveal doesn't
       leave stale markers behind on re-tag. */
    var wasStepped = sec.hasAttribute('data-reveal');
    if(wasStepped){
      SG.motion.steps(sec).forEach(function(u,idx){ u.setAttribute('data-step', String(idx)); });
    } else {
      [].slice.call(sec.querySelectorAll('[data-step]')).forEach(function(u){
        u.removeAttribute('data-step'); u.classList.remove('shown','live'); });
    } };

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
    /* slide-level reveal (slice 4): every (re)activation restarts the walk
       from the top, matching how entrance motion itself replays on
       re-entry — a presenter returning to a slide expects to step through
       it again, not resume mid-list. */
    if(slide.querySelectorAll){
      slide.querySelectorAll('[data-step]').forEach(function(n){ n.classList.remove('shown','live'); });
      var revealStyle = slide.getAttribute && slide.getAttribute('data-reveal');
      if(revealStyle==='typewriter' || revealStyle==='words'){
        SG.motion.steps(slide).forEach(function(u){ SG.motion.split(u, revealStyle); });
      }
    }
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
    slide.querySelectorAll('[data-step]').forEach(function(n){n.classList.remove('shown','live');});
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
