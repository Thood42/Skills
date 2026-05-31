#!/usr/bin/env python3
"""
slidegen.py — generate self-contained HTML for deck animations and interactive charts.

Everything it emits is a single fragment (scoped <style> + markup + optional <script>)
that you paste straight into a slide in reference-deck.html. Output inherits the deck's
CSS variables (--cyan, --indigo, --mint, --ink, ...), so it re-themes automatically.

USAGE
  python3 slidegen.py list                      # list animations + chart types
  python3 slidegen.py anims                      # the whole animation stylesheet + runtime
                                                 #   (drop once into the deck <head>)
  python3 slidegen.py anim <name> [--demo]       # one animation: CSS (+ example markup)
  python3 slidegen.py anim kinetic --text "Headline"   # per-letter kinetic markup
  python3 slidegen.py anim word-spin --text "build,design,ship"  # rotating word cycler
  python3 slidegen.py chart <line|bar|donut|pie|radial|gauge>   # a chart fragment (demo data)
        [--data file.json | -]                   #   or pipe/point at your own JSON
        [--id NAME] [--title T]
  python3 slidegen.py gallery [-o out.html]      # standalone page showing everything

ANIMATIONS (23 total; apply the class; entrance ones also need class "sg-onenter")
  Continuous:   shimmer · aurora · neon-flicker · float · gradient-text · gradient-border
                glow-pulse · spinner · progress · skeleton · glass · dots · bars · wiggle
                word-spin (generated — has its own <style> block)
  On-enter:     fade-rise · reveal-wipe · typewriter · kinetic · draw-path · check
  JS-driven:    count-up · ring

CHART JSON
  line  : {"title","y_log":bool,"x":[...],"series":[{"name","values":[...]}],
           "annotations":[{"i":int,"text"}]}
  bar   : {"title","unit","value_labels":bool,"x":[...],"series":[{"name","values":[...]}]}
  donut : {"title","unit","segments":[{"label","value"}]}
  pie   : {"title","unit","inner":0,"segments":[{"label","value"}]}
  radial: {"title","unit","max":100,"segments":[{"label","value"}]}
  gauge : {"title","value","max":100,"unit","%","caption":""}
"""
import sys, json, math, argparse, secrets

# ----------------------------------------------------------------------------- helpers
def uid(prefix="sg"):
    return prefix + secrets.token_hex(3)

def fmt_compact(n):
    a = abs(n)
    for div, suf in ((1e12,"T"),(1e9,"B"),(1e6,"M"),(1e3,"K")):
        if a >= div:
            s = f"{n/div:.1f}".rstrip("0").rstrip(".")
            return s + suf
    return str(int(round(n)))

def _esc(s):
    return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def kinetic_spans(text):
    """Wrap each character of `text` in an indexed span for the kinetic animation."""
    out=[]
    for i,ch in enumerate(text):
        out.append(f'<span style="--i:{i}">{"&nbsp;" if ch==" " else _esc(ch)}</span>')
    return '<span class="sg-kinetic sg-onenter">'+"".join(out)+'</span>'

def build_word_spin(words, u=None):
    """Vertical rotating word cycler ('we build X / Y / Z'). Returns (css, html).
    Self-contained: keyframe is scoped to a unique class and adapts to the word count.
    A duplicate of the first word is appended so the loop wraps seamlessly."""
    u = u or uid("ws")
    n = max(1, len(words))
    LH = 1.25  # line height, em
    track = list(words) + [words[0]]
    spans = "".join(f'<span>{_esc(w)}</span>' for w in track)
    stops=[]
    for k in range(n+1):
        base = k*100/n; y = -k*LH
        stops.append(f"{base:.2f}%{{transform:translateY({y:.3f}em)}}")
        if k < n:
            stops.append(f"{base+(100/n)*0.72:.2f}%{{transform:translateY({y:.3f}em)}}")
    dur = max(6, round(n*2.2))
    css = (f".{u}{{display:inline-flex;flex-direction:column;height:{LH}em;line-height:{LH}em;"
           f"overflow:hidden;vertical-align:bottom}}"
           f".{u} .ws-track{{display:flex;flex-direction:column}}"
           f".{u} .ws-track span{{height:{LH}em;line-height:{LH}em;white-space:nowrap}}"
           f"@media (prefers-reduced-motion: no-preference){{"
           f"@keyframes ws_{u}{{{''.join(stops)}}}"
           f".{u} .ws-track{{animation:ws_{u} {dur}s infinite}}}}")
    html = f'<span class="{u}"><span class="ws-track">{spans}</span></span>'
    return css, html

# Shared JS used by charts: reduced-motion flag, count-up, and an "activate on slide
# enter (or immediately if standalone)" helper. Kept compact and duplicated per fragment
# so each chart works on its own.
RUNTIME = r"""
(function(){
  if(window.__sgrt)return; window.__sgrt=1;
  var R = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__sgReduce = R;
  window.__sgFmtCompact = function(n){var a=Math.abs(n);
    var T=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
    for(var i=0;i<T.length;i++){if(a>=T[i][0]){var s=(n/T[i][0]).toFixed(1).replace(/\.0$/,'');return s+T[i][1];}}
    return String(Math.round(n));};
  window.__sgCount = function(el,to,dur,kind,unit){
    var render=function(v){return kind==='compact'?window.__sgFmtCompact(v):(Math.round(v)+(unit||''));};
    if(R||!dur){el.textContent=render(to);return;}
    var t0=null;function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/dur);
      var e=1-Math.pow(1-p,3);el.textContent=render(to*e);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);};
  window.__sgWhenActive = function(node,cb){
    var slide=node.closest&&node.closest('.slide');
    if(!slide){cb();return;}
    if(slide.classList.contains('active')){cb();}
    var run=false;
    new MutationObserver(function(){var on=slide.classList.contains('active');
      if(on&&!run){run=true;cb();} if(!on){run=false;}})
      .observe(slide,{attributes:true,attributeFilter:['class']});
  };
})();
"""

# ============================================================================ ANIMATIONS
# Each entry: css (keyframes + classes) and an example markup string.
ANIM_CSS = r"""
/* ===== slidegen animation library — drop once into the deck <head> ===== */
/* Base (resting / reduced-motion) appearance — always present and looks complete. */
.sg-shimmer{color:var(--ink)}
.sg-neon-flicker{color:var(--cyan);text-shadow:0 0 18px rgba(60,232,255,.55)}
.sg-aurora{background:linear-gradient(120deg,rgba(60,232,255,.16),rgba(124,140,255,.16),rgba(68,243,196,.14),rgba(124,140,255,.16));background-size:300% 300%}
.sg-typewriter{display:inline-block}
@media (prefers-reduced-motion: no-preference){
  /* 1 fade-rise — staggered entrance for lists/cards (needs .sg-onenter -> .run) */
  @keyframes sgFadeRise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
  .sg-fade-rise{opacity:0}
  .sg-fade-rise.run{animation:sgFadeRise .7s cubic-bezier(.2,.7,.2,1) both}
  .sg-stagger.run>*{opacity:0;animation:sgFadeRise .7s cubic-bezier(.2,.7,.2,1) both}
  .sg-stagger.run>*:nth-child(2){animation-delay:.08s}
  .sg-stagger.run>*:nth-child(3){animation-delay:.16s}
  .sg-stagger.run>*:nth-child(4){animation-delay:.24s}
  .sg-stagger.run>*:nth-child(5){animation-delay:.32s}
  .sg-stagger.run>*:nth-child(6){animation-delay:.40s}

  /* 2 shimmer — holographic light sweep across text */
  @keyframes sgShimmer{0%{background-position:-180% 0}100%{background-position:180% 0}}
  .sg-shimmer{background:linear-gradient(100deg,var(--ink) 30%,var(--cyan) 50%,var(--ink) 70%);
    background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
    animation:sgShimmer 4.5s linear infinite}

  /* 3 aurora — slow animated gradient backdrop (apply to a container) */
  @keyframes sgAurora{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
  .sg-aurora{background:linear-gradient(120deg,
      rgba(60,232,255,.16),rgba(124,140,255,.16),rgba(68,243,196,.14),rgba(124,140,255,.16));
    background-size:300% 300%;animation:sgAurora 18s ease infinite}

  /* 4 neon-flicker — occasional neon flicker, mostly steady */
  @keyframes sgFlicker{0%,18%,22%,25%,53%,57%,100%{opacity:1;text-shadow:0 0 18px rgba(60,232,255,.55)}
    20%,24%,55%{opacity:.72;text-shadow:none}}
  .sg-neon-flicker{color:var(--cyan);animation:sgFlicker 6s linear infinite}

  /* 5 float — gentle continuous bob for accents/icons */
  @keyframes sgFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .sg-float{animation:sgFloat 6s ease-in-out infinite}

  /* 6 reveal-wipe — clip-path wipe-in (needs .sg-onenter -> .run) */
  @keyframes sgWipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
  .sg-reveal-wipe{clip-path:inset(0 100% 0 0)}
  .sg-reveal-wipe.run{animation:sgWipe .9s cubic-bezier(.6,.05,.2,1) both}

  /* 7 typewriter — single line types in (needs .sg-onenter -> .run) */
  @keyframes sgType{from{width:0}to{width:100%}}
  @keyframes sgCaret{50%{border-color:transparent}}
  .sg-typewriter{display:inline-block;overflow:hidden;white-space:nowrap;width:0;
    border-right:.08em solid var(--cyan);vertical-align:bottom}
  .sg-typewriter.run{animation:sgType 2.2s steps(34,end) both, sgCaret .8s step-end infinite}
}

/* 8 count-up — see runtime; markup: <span class="sg-count" data-to data-suffix data-fmt> */
/* 9 ring — animated KPI ring; markup below */
.sg-ring{position:relative;width:150px;height:150px;border-radius:50%;display:grid;place-items:center;
  background:conic-gradient(var(--cyan) calc(var(--p,0)*1%), rgba(124,140,255,.14) 0);
  transition:background .1s linear}
.sg-ring::before{content:"";position:absolute;inset:12px;border-radius:50%;background:var(--bg-2,#0a1122)}
.sg-ring .sg-ring-v{position:relative;font-family:var(--font-display);font-weight:800;font-size:34px;color:var(--ink)}

/* ===== extended effects (batch 2) — each has a resting base + motion in the no-pref query ===== */

/* 10 gradient-text — animated gradient fill on text */
.sg-gradient-text{background:linear-gradient(90deg,var(--cyan),var(--indigo),var(--mint),var(--cyan));
  background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;background-position:0% 50%}

/* 11 gradient-border — animated gradient ring around a box (padding-box trick) */
.sg-gradient-border{position:relative;border:2px solid transparent;border-radius:16px;
  background:linear-gradient(var(--bg-2,#0a1122),var(--bg-2,#0a1122)) padding-box,
    linear-gradient(120deg,var(--cyan),var(--indigo),var(--mint),var(--cyan)) border-box;
  background-size:auto,300% 300%;background-position:0 0,0% 50%}

/* 12 glow-pulse — soft pulsing glow (text + .box variant) */
.sg-glow-pulse{color:var(--cyan);text-shadow:0 0 18px rgba(60,232,255,.45)}
.sg-glow-pulse-box{box-shadow:0 0 18px rgba(60,232,255,.22)}

/* 13 kinetic — per-letter staggered headline (needs .sg-onenter; wrap letters in <span style="--i:N">) */
.sg-kinetic{display:inline-block}
.sg-kinetic span{display:inline-block;white-space:pre}

/* 14 spinner — pure-CSS loader */
.sg-spinner{width:46px;height:46px;border-radius:50%;
  border:4px solid rgba(124,140,255,.20);border-top-color:var(--cyan)}

/* 15 progress — indeterminate progress bar */
.sg-progress{position:relative;width:220px;height:8px;border-radius:99px;background:rgba(124,140,255,.16);overflow:hidden}
.sg-progress::after{content:"";position:absolute;top:0;left:0;height:100%;width:40%;border-radius:99px;
  background:linear-gradient(90deg,var(--cyan),var(--indigo))}

/* 16 skeleton — loading placeholder with shimmer sweep */
.sg-skeleton{position:relative;overflow:hidden;border-radius:10px;background:rgba(255,255,255,.06)}
.sg-skeleton.line{height:14px;margin:9px 0}
.sg-skeleton.line.short{width:55%}

/* 17 glass — glassmorphic card (styling effect; reads best over a colourful backdrop) */
.sg-glass{background:rgba(255,255,255,.07);
  -webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);
  border:1px solid rgba(255,255,255,.18);border-radius:18px;
  box-shadow:0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.14)}

/* 18 draw-path — self-drawing stroke; runtime measures each shape and sets --len, then adds .run.
   Base (visible) lives outside the motion query so reduced-motion users see the finished stroke. */
.sg-draw{overflow:visible}

@media (prefers-reduced-motion: no-preference){
  @keyframes sgGradText{0%{background-position:0% 50%}100%{background-position:300% 50%}}
  .sg-gradient-text{animation:sgGradText 6s linear infinite}

  @keyframes sgGradBorder{0%{background-position:0 0,0% 50%}100%{background-position:0 0,300% 50%}}
  .sg-gradient-border{animation:sgGradBorder 6s linear infinite}

  @keyframes sgGlowPulse{0%,100%{text-shadow:0 0 14px rgba(60,232,255,.30)}
    50%{text-shadow:0 0 30px rgba(60,232,255,.75),0 0 52px rgba(124,140,255,.35)}}
  .sg-glow-pulse{animation:sgGlowPulse 3.2s ease-in-out infinite}
  @keyframes sgGlowBox{0%,100%{box-shadow:0 0 14px rgba(60,232,255,.18)}50%{box-shadow:0 0 34px rgba(60,232,255,.55)}}
  .sg-glow-pulse-box{animation:sgGlowBox 3.2s ease-in-out infinite}

  @keyframes sgKinetic{from{opacity:0;transform:translateY(.5em) rotate(4deg)}to{opacity:1;transform:none}}
  .sg-kinetic span{opacity:0}
  .sg-kinetic.run span{animation:sgKinetic .55s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*.045s)}

  @keyframes sgSpin{to{transform:rotate(360deg)}}
  .sg-spinner{animation:sgSpin .9s linear infinite}

  @keyframes sgProg{0%{left:-40%}100%{left:100%}}
  .sg-progress::after{animation:sgProg 1.3s ease-in-out infinite}

  @keyframes sgSkel{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
  .sg-skeleton::after{content:"";position:absolute;inset:0;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.13),transparent);animation:sgSkel 1.5s ease-in-out infinite}

  @keyframes sgDraw{from{stroke-dashoffset:var(--len,1000)}to{stroke-dashoffset:0}}
  .sg-draw path,.sg-draw line,.sg-draw polyline,.sg-draw circle,.sg-draw rect,.sg-draw ellipse,.sg-draw polygon{
    stroke-dasharray:var(--len,1000);stroke-dashoffset:var(--len,1000)}
  .sg-draw.run path,.sg-draw.run line,.sg-draw.run polyline,.sg-draw.run circle,.sg-draw.run rect,.sg-draw.run ellipse,.sg-draw.run polygon{
    animation:sgDraw 1.8s ease forwards}
}

/* ===== extended effects (batch 3) ===== */

/* 19 dots — three bouncing dots loader */
.sg-dots{display:inline-flex;gap:9px;align-items:flex-end}
.sg-dots i{width:13px;height:13px;border-radius:50%;background:var(--cyan);display:block}

/* 20 bars — equalizer-style vertical bars (decorative/loading accent) */
.sg-bars{display:inline-flex;align-items:flex-end;gap:6px;height:64px}
.sg-bars i{width:11px;height:40%;border-radius:4px;display:block;background:linear-gradient(180deg,var(--cyan),var(--indigo))}

/* 21 wiggle — subtle periodic attention nudge for a CTA/callout */
.sg-wiggle{display:inline-block;transform-origin:center}

/* 22 check — self-drawing success checkmark (needs .sg-onenter -> .run) */
.sg-check{display:inline-block;overflow:visible}

@media (prefers-reduced-motion: no-preference){
  @keyframes sgDot{0%,80%,100%{transform:translateY(0);opacity:.55}40%{transform:translateY(-11px);opacity:1}}
  .sg-dots i{animation:sgDot 1.2s ease-in-out infinite}
  .sg-dots i:nth-child(2){animation-delay:.16s} .sg-dots i:nth-child(3){animation-delay:.32s}

  @keyframes sgBars{0%,100%{height:28%}50%{height:100%}}
  .sg-bars i{animation:sgBars 1.4s ease-in-out infinite}
  .sg-bars i:nth-child(2){animation-delay:.18s} .sg-bars i:nth-child(3){animation-delay:.36s}
  .sg-bars i:nth-child(4){animation-delay:.54s} .sg-bars i:nth-child(5){animation-delay:.72s}
  .sg-bars i:nth-child(6){animation-delay:.9s}

  @keyframes sgWiggle{0%,92%,100%{transform:rotate(0)}94%{transform:rotate(-3deg)}96%{transform:rotate(3deg)}98%{transform:rotate(-2deg)}}
  .sg-wiggle{animation:sgWiggle 4.5s ease-in-out infinite}

  .sg-check circle{stroke-dasharray:160;stroke-dashoffset:160}
  .sg-check .tick{stroke-dasharray:60;stroke-dashoffset:60}
  @keyframes sgCheckDraw{to{stroke-dashoffset:0}}
  .sg-check.run circle{animation:sgCheckDraw .6s ease forwards}
  .sg-check.run .tick{animation:sgCheckDraw .4s ease .55s forwards}
}
"""

ANIM_RUNTIME = r"""
(function(){
  var R = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmtC(n){var a=Math.abs(n),T=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
    for(var i=0;i<T.length;i++){if(a>=T[i][0])return (n/T[i][0]).toFixed(1).replace(/\.0$/,'')+T[i][1];}
    return String(Math.round(n));}
  function count(el,to,dur,fmt,suf){var render=function(v){return (fmt==='compact'?fmtC(v):Math.round(v).toLocaleString())+(suf||'');};
    if(R||!dur){el.textContent=render(to);return;}var t0=null;
    (function step(ts){if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/dur),e=1-Math.pow(1-p,3);
      el.textContent=render(to*e);if(p<1)requestAnimationFrame(step);})(performance.now());}
  function activate(slide){
    slide.querySelectorAll('.sg-onenter').forEach(function(n){
      n.classList.remove('run'); void n.offsetWidth; n.classList.add('run');});
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
  if(document.readyState!=='loading')wire(document);
  else document.addEventListener('DOMContentLoaded',function(){wire(document);});
})();
"""

ANIM_DEMOS = {
  "fade-rise":   '<div class="sg-stagger sg-onenter"><div>First</div><div>Second</div><div>Third</div></div>',
  "shimmer":     '<h1 class="sg-shimmer">Shimmering headline</h1>',
  "aurora":      '<div class="sg-aurora" style="padding:40px;border-radius:16px">Aurora background</div>',
  "neon-flicker":'<h1 class="sg-neon-flicker">Neon sign</h1>',
  "float":       '<div class="sg-float" style="font-size:40px">◉</div>',
  "reveal-wipe": '<h1 class="sg-reveal-wipe sg-onenter">Wiped into view</h1>',
  "typewriter":  '<span class="sg-typewriter sg-onenter">Typed on entry…</span>',
  "count-up":    '<span class="sg-count" data-to="175" data-suffix="B" data-fmt="plain" data-dur="1400" style="font-size:60px;font-family:var(--font-mono);color:var(--cyan)">0</span>',
  "ring":        '<div class="sg-ring" data-p="86" data-suffix="%"><span class="sg-ring-v">0</span></div>',
  "gradient-text":   '<h1 class="sg-gradient-text">Gradient flow</h1>',
  "gradient-border": '<div class="sg-gradient-border" style="padding:26px 30px">Gradient border</div>',
  "glow-pulse":      '<h1 class="sg-glow-pulse">Pulsing glow</h1>',
  "kinetic":         None,  # generated via kinetic_spans() — see ANIM_DEMOS init below
  "spinner":         '<div class="sg-spinner"></div>',
  "progress":        '<div class="sg-progress"></div>',
  "skeleton":        '<div style="width:100%"><div class="sg-skeleton line" style="width:70%"></div><div class="sg-skeleton line"></div><div class="sg-skeleton line short"></div></div>',
  "glass":           '<div style="position:relative;padding:24px;border-radius:18px;background:linear-gradient(120deg,#2a3a7a,#3cc6e8 60%,#44f3c4)"><div class="sg-glass" style="padding:20px 24px;color:#fff">Glassmorphic</div></div>',
  "draw-path":       '<svg class="sg-draw" viewBox="0 0 220 70" width="220" height="70" fill="none" stroke="var(--cyan)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 40 q30 -34 60 0 t60 0 t60 0"/><path d="M14 58 H206" stroke="var(--indigo)" stroke-width="2"/></svg>',
  "dots":            '<div class="sg-dots"><i></i><i></i><i></i></div>',
  "bars":            '<div class="sg-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div>',
  "wiggle":          '<div class="sg-wiggle" style="padding:12px 22px;border-radius:10px;background:var(--cyan);color:#04141a;font-family:var(--font-display);font-weight:700">Call to action</div>',
  "check":           '<svg class="sg-check sg-onenter" viewBox="0 0 52 52" width="64" height="64" fill="none" stroke="var(--mint)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="26" r="24"/><path class="tick" d="M16 27 L23 34 L37 18"/></svg>',
}
ANIM_DEMOS["kinetic"] = kinetic_spans("Kinetic type")
ANIM_NAMES = list(ANIM_DEMOS.keys())

# ================================================================================ CHARTS
PALETTE = "var(--cyan,#3ce8ff)|var(--indigo,#7c8cff)|var(--mint,#44f3c4)|#ffcf7a|#ff7ab6".split("|")

def _scope_vars(u):
    return (f".{u}{{position:relative;--c1:var(--cyan,#3ce8ff);--c2:var(--indigo,#7c8cff);"
            f"--c3:var(--mint,#44f3c4);--c4:#ffcf7a;--c5:#ff7ab6;"
            f"--gridc:var(--grid,rgba(124,140,255,.10));--faintc:var(--faint,#5a6a86);"
            f"--inkc:var(--ink,#eaf1fb);--mutedc:var(--muted,#93a2bd)}}")

# ---- LINE ----
def build_line(spec, u):
    W,H = 1000,460; L,Rm,T,B = 70,28,40,52
    pw,ph = W-L-Rm, H-T-B; baseY=T+ph
    xs = spec["x"]; n=len(xs)
    series = spec["series"]; ylog = spec.get("y_log",False)
    vals=[v for s in series for v in s["values"]]
    if ylog:
        lo=math.floor(math.log10(min(v for v in vals if v>0)))
        hi=math.ceil(math.log10(max(vals))); hi=max(hi,lo+1)
        def Y(v): return baseY-(math.log10(max(v,10**lo))-lo)/(hi-lo)*ph
        grid=[(10**p) for p in range(lo,hi+1)]
        glabel=lambda v: "10"+ "".join("⁰¹²³⁴⁵⁶⁷⁸⁹"[int(d)] for d in str(int(round(math.log10(v)))))
    else:
        hi=max(vals); 
        nice=10**math.floor(math.log10(hi)) if hi>0 else 1
        hi=math.ceil(hi/nice)*nice; lo=0
        def Y(v): return baseY-(v-lo)/(hi-lo)*ph
        grid=[lo+(hi-lo)*k/4 for k in range(5)]
        glabel=lambda v: fmt_compact(v)
    def X(i): return L if n==1 else L+i*pw/(n-1)

    parts=[]
    # gridlines + y labels
    for gv in grid:
        y=Y(gv)
        parts.append(f'<line x1="{L}" y1="{y:.1f}" x2="{W-Rm}" y2="{y:.1f}" class="gl"/>')
        parts.append(f'<text x="{L-12}" y="{y+4:.1f}" class="yl" text-anchor="end">{glabel(gv)}</text>')
    # x labels (thin out if many)
    step=max(1, n//8)
    for i,xl in enumerate(xs):
        if i%step==0 or i==n-1:
            parts.append(f'<text x="{X(i):.1f}" y="{baseY+26}" class="xl" text-anchor="middle">{xl}</text>')
    # series
    for si,s in enumerate(series):
        col=PALETTE[si%len(PALETTE)]
        pts=[(X(i),Y(v)) for i,v in enumerate(s["values"])]
        d="M"+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
        area=d+f" L{pts[-1][0]:.1f},{baseY} L{pts[0][0]:.1f},{baseY} Z"
        parts.append(f'<path class="area" d="{area}" fill="url(#{u}grad{si})"/>')
        parts.append(f'<path class="ln" data-s="{si}" d="{d}" stroke="{col}"/>')
        for i,(x,y) in enumerate(pts):
            lbl=fmt_compact(s["values"][i])
            parts.append(f'<g class="pt" data-s="{si}" data-i="{i}" data-v="{s["values"][i]}" '
                         f'data-x="{x:.1f}" data-y="{y:.1f}" data-lbl="{lbl}">'
                         f'<circle class="hit" cx="{x:.1f}" cy="{y:.1f}" r="22"/>'
                         f'<circle class="dot" cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{col}"/></g>')
    # annotations
    for a in spec.get("annotations",[]):
        si=a.get("s",0); i=a["i"]; x=X(i); y=Y(series[si]["values"][i])
        parts.append(f'<text x="{x:.1f}" y="{y-14:.1f}" class="anno" text-anchor="middle">{a["text"]}</text>')
    # gradients defs
    defs="".join(f'<linearGradient id="{u}grad{si}" x1="0" y1="0" x2="0" y2="1">'
                 f'<stop offset="0%" stop-color="{PALETTE[si%len(PALETTE)]}" stop-opacity=".30"/>'
                 f'<stop offset="100%" stop-color="{PALETTE[si%len(PALETTE)]}" stop-opacity="0"/>'
                 f'</linearGradient>' for si in range(len(series)))
    guide=f'<line class="guide" x1="0" y1="{T}" x2="0" y2="{baseY}" opacity="0"/>'
    tip=(f'<g class="tip" opacity="0" pointer-events="none">'
         f'<rect class="tipbg" rx="7" x="0" y="0" width="120" height="46"/>'
         f'<text class="tt1" x="12" y="19"></text><text class="tt2" x="12" y="37"></text></g>')
    title=spec.get("title","")
    css=f"""
{_scope_vars(u)}
.{u} svg{{width:100%;height:100%;overflow:visible}}
.{u} .gl{{stroke:var(--gridc)}} .{u} .yl,.{u} .xl{{fill:var(--faintc);font:13px var(--font-mono,monospace)}}
.{u} .ln{{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}}
.{u} .dot{{transition:r .15s}} .{u} .hit{{fill:transparent}}
.{u} .pt{{cursor:pointer}} .{u} .pt:hover .dot{{r:7}}
.{u} .anno{{fill:var(--inkc);font:13px var(--font-mono,monospace)}}
.{u} .guide{{stroke:var(--c1);stroke-dasharray:3 4;opacity:.0}}
.{u} .tipbg{{fill:var(--bg-2,#0a1122);stroke:var(--brd-2,rgba(124,140,255,.28))}}
.{u} .tt1{{fill:var(--mutedc);font:12px var(--font-mono,monospace)}}
.{u} .tt2{{fill:var(--inkc);font:600 15px var(--font-display,sans-serif)}}
@media (prefers-reduced-motion: no-preference){{
  .{u} .ln{{stroke-dasharray:var(--len);stroke-dashoffset:var(--len)}}
  .{u}.run .ln{{transition:stroke-dashoffset 1.3s ease}}
  .{u}.run .ln{{stroke-dashoffset:0}}
  .{u} .area,.{u} .pt{{opacity:0}} .{u}.run .area,.{u}.run .pt{{opacity:1;transition:opacity .8s ease .5s}}
}}
"""
    head=(f'<div class="sg-chart-head"><div class="sg-chart-title">{title}</div></div>' if title else "")
    svg=(f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" '
         f'xmlns="http://www.w3.org/2000/svg"><defs>{defs}</defs>{guide}'
         + "".join(parts) + tip + '</svg>')
    js=f"""
{RUNTIME.strip()}
(function(){{
  var root=document.currentScript.closest('.{u}');
  var svg=root.querySelector('svg'), tip=svg.querySelector('.tip'),
      guide=svg.querySelector('.guide'), bg=tip.querySelector('.tipbg'),
      t1=tip.querySelector('.tt1'), t2=tip.querySelector('.tt2');
  var names={json.dumps([s["name"] for s in series])};
  root.querySelectorAll('.ln').forEach(function(p){{var len=p.getTotalLength();
    p.style.setProperty('--len',len);}});
  function showPt(g){{
    var x=+g.dataset.x,y=+g.dataset.y;
    guide.setAttribute('x1',x);guide.setAttribute('x2',x);guide.setAttribute('opacity','.5');
    t1.textContent=names[+g.dataset.s]||''; t2.textContent=g.dataset.lbl;
    var w=Math.max(t1.getComputedTextLength(),t2.getComputedTextLength())+24;
    bg.setAttribute('width',w);
    var tx=Math.min(Math.max(x-w/2,4),{W}-w-4), ty=y-60; if(ty<0)ty=y+16;
    tip.setAttribute('transform','translate('+tx+','+ty+')');
    t1.setAttribute('x',tx+12-tx);  // texts are relative to group
    tip.setAttribute('opacity','1');
  }}
  function hide(){{tip.setAttribute('opacity','0');guide.setAttribute('opacity','0');}}
  root.querySelectorAll('.pt').forEach(function(g){{
    g.addEventListener('mouseenter',function(){{showPt(g);}});
    g.addEventListener('mouseleave',hide);}});
  window.__sgWhenActive(root,function(){{
    root.classList.add('run');
  }});
}})();
"""
    return css, f'<div class="{u} sg-chart">{head}{svg}<script>{js}</script></div>'

# ---- BAR ----
def build_bar(spec, u):
    W,H = 1000,460; L,Rm,T,B = 64,28,46,52
    pw,ph=W-L-Rm,H-T-B; baseY=T+ph
    xs=spec["x"]; vals=spec["series"][0]["values"]; n=len(xs)
    unit=spec.get("unit",""); show=spec.get("value_labels",True)
    hi=max(vals); nice=10**math.floor(math.log10(hi)) if hi>0 else 1
    hiN=math.ceil(hi/nice)*nice or 1
    def Y(v): return baseY-(v/hiN)*ph
    slot=pw/n; bw=slot*0.56
    parts=[]
    for k in range(5):
        gv=hiN*k/4; y=baseY-(gv/hiN)*ph
        parts.append(f'<line x1="{L}" y1="{y:.1f}" x2="{W-Rm}" y2="{y:.1f}" class="gl"/>')
        parts.append(f'<text x="{L-12}" y="{y+4:.1f}" class="yl" text-anchor="end">{fmt_compact(gv)}</text>')
    for i,(xl,v) in enumerate(zip(xs,vals)):
        cx=L+slot*i+slot/2; x=cx-bw/2; y=Y(v); h=baseY-y
        col=PALETTE[i%len(PALETTE)]
        parts.append(f'<g class="bar" data-i="{i}" data-v="{v}">'
                     f'<rect class="br" x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{h:.1f}" '
                     f'rx="6" fill="{col}" style="transform-origin:{cx:.1f}px {baseY}px"/>'
                     f'<rect class="hit" x="{x:.1f}" y="{T}" width="{bw:.1f}" height="{ph}" fill="transparent"/>'
                     f'<text class="bv {"on" if show else ""}" x="{cx:.1f}" y="{y-12:.1f}" text-anchor="middle" '
                     f'data-v="{v}" data-suf="{unit}">{int(round(v))}{unit}</text>'
                     f'<text class="bx" x="{cx:.1f}" y="{baseY+26}" text-anchor="middle">{xl}</text></g>')
    title=spec.get("title","")
    css=f"""
{_scope_vars(u)}
.{u} svg{{width:100%;height:100%;overflow:visible}}
.{u} .gl{{stroke:var(--gridc)}} .{u} .yl,.{u} .bx{{fill:var(--faintc);font:13px var(--font-mono,monospace)}}
.{u} .br{{transition:filter .15s, opacity .15s}}
.{u} .bar{{cursor:pointer}}
.{u} .bv{{fill:var(--inkc);font:600 15px var(--font-mono,monospace);opacity:0;transition:opacity .15s}}
.{u} .bv.on{{opacity:1}}
.{u}.hot .bar:not(.hot) .br{{opacity:.35}}
.{u} .bar.hot .br{{filter:drop-shadow(0 0 14px var(--c1))}}
.{u} .bar.hot .bv{{opacity:1}}
@media (prefers-reduced-motion: no-preference){{
  .{u} .br{{transform:scaleY(0)}} .{u}.run .br{{transition:transform .9s cubic-bezier(.2,.7,.2,1),filter .15s,opacity .15s}}
  .{u}.run .br{{transform:scaleY(1)}}
}}
"""
    head=(f'<div class="sg-chart-head"><div class="sg-chart-title">{title}</div></div>' if title else "")
    svg=(f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">'
         + "".join(parts) + '</svg>')
    js=f"""
{RUNTIME.strip()}
(function(){{
  var root=document.currentScript.closest('.{u}');
  root.querySelectorAll('.bar').forEach(function(b){{
    b.addEventListener('mouseenter',function(){{root.classList.add('hot');b.classList.add('hot');}});
    b.addEventListener('mouseleave',function(){{root.classList.remove('hot');b.classList.remove('hot');}});}});
  window.__sgWhenActive(root,function(){{
    root.classList.add('run');
    root.querySelectorAll('.bv').forEach(function(t){{
      window.__sgCount(t,+t.dataset.v,1000,'plain',t.dataset.suf);}});
  }});
}})();
"""
    return css, f'<div class="{u} sg-chart">{head}{svg}<script>{js}</script></div>'

# ---- DONUT ----
def build_donut(spec, u):
    W,H=460,460; cx,cy,r,sw=230,230,150,40
    segs=spec["segments"]; total=sum(s["value"] for s in segs); unit=spec.get("unit","")
    C=2*math.pi*r; off=0.0; parts=[]
    for i,s in enumerate(segs):
        frac=s["value"]/total if total else 0
        col=PALETTE[i%len(PALETTE)]
        dash=f"{frac*C:.2f} {C-frac*C:.2f}"
        parts.append(f'<circle class="seg" data-i="{i}" data-label="{s["label"]}" data-v="{s["value"]}" '
                     f'cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="{sw}" '
                     f'stroke-dasharray="{dash}" stroke-dashoffset="{-off*C:.2f}" '
                     f'transform="rotate(-90 {cx} {cy})"/>')
        off+=frac
    title=spec.get("title","")
    pct0=f'{(segs[0]["value"]/total*100):.0f}' if total else '0'
    center=(f'<text class="cv" x="{cx}" y="{cy-2}" text-anchor="middle">100{unit}</text>'
            f'<text class="cl" x="{cx}" y="{cy+26}" text-anchor="middle">total</text>')
    # legend
    leg="".join(f'<div class="lg"><i style="background:{PALETTE[i%len(PALETTE)]}"></i>'
                f'<span>{s["label"]}</span><b>{int(round(s["value"]))}{unit}</b></div>'
                for i,s in enumerate(segs))
    css=f"""
{_scope_vars(u)}
.{u}{{display:flex;flex-direction:column;gap:18px;height:100%}}
.{u} .sg-donut-body{{display:flex;align-items:center;justify-content:center;gap:48px;flex:1;min-height:0}}
.{u} .donut-wrap{{width:auto;height:100%;max-height:300px;aspect-ratio:1/1;flex:none}}
.{u} svg{{width:100%;height:100%;overflow:visible}}
.{u} .seg{{cursor:pointer;transition:stroke-width .15s,opacity .15s}}
.{u}.hot .seg:not(.hot){{opacity:.3}} .{u} .seg.hot{{stroke-width:{sw+10}}}
.{u} .cv{{fill:var(--inkc);font:800 46px var(--font-display,sans-serif)}}
.{u} .cl{{fill:var(--faintc);font:13px var(--font-mono,monospace);letter-spacing:.18em;text-transform:uppercase}}
.{u} .legend{{display:flex;flex-direction:column;gap:14px;min-width:200px}}
.{u} .lg{{display:flex;align-items:center;gap:12px;font:15px var(--font-body,sans-serif);color:var(--mutedc);cursor:pointer}}
.{u} .lg i{{width:14px;height:14px;border-radius:4px;flex:none}} .{u} .lg b{{margin-left:auto;color:var(--inkc);font-family:var(--font-mono,monospace)}}
.{u} .lg.hot{{color:var(--inkc)}}
@media (prefers-reduced-motion: no-preference){{
  .{u} .seg{{stroke-dasharray:0 {C:.2f}}} 
}}
"""
    head=(f'<div class="sg-chart-head"><div class="sg-chart-title">{title}</div></div>' if title else "")
    svg=(f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">'
         + "".join(parts) + center + '</svg>')
    seglens=json.dumps([ (s["value"]/total if total else 0) for s in segs ])
    labels=json.dumps([s["label"] for s in segs]); vlist=json.dumps([s["value"] for s in segs])
    js=f"""
{RUNTIME.strip()}
(function(){{
  var root=document.currentScript.closest('.{u}');
  var C={C:.4f}, fr={seglens}, labels={labels}, vals={vlist}, unit={json.dumps(unit)};
  var cv=root.querySelector('.cv'), cl=root.querySelector('.cl');
  var segEls=[].slice.call(root.querySelectorAll('.seg'));
  var legEls=[].slice.call(root.querySelectorAll('.lg'));
  function hot(i){{root.classList.add('hot');segEls[i].classList.add('hot');if(legEls[i])legEls[i].classList.add('hot');
    cv.textContent=Math.round(vals[i])+unit; cl.textContent=labels[i];}}
  function cool(){{root.classList.remove('hot');segEls.forEach(function(s){{s.classList.remove('hot');}});
    legEls.forEach(function(l){{l.classList.remove('hot');}}); cv.textContent='100'+unit; cl.textContent='total';}}
  segEls.forEach(function(s,i){{s.addEventListener('mouseenter',function(){{hot(i);}});s.addEventListener('mouseleave',cool);}});
  legEls.forEach(function(l,i){{l.addEventListener('mouseenter',function(){{hot(i);}});l.addEventListener('mouseleave',cool);}});
  window.__sgWhenActive(root,function(){{
    if(window.__sgReduce){{segEls.forEach(function(s,i){{s.style.strokeDasharray=(fr[i]*C)+' '+(C-fr[i]*C);}});return;}}
    var t0=null;(function step(ts){{if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/1100),e=1-Math.pow(1-p,3);
      segEls.forEach(function(s,i){{s.style.strokeDasharray=(fr[i]*C*e)+' '+(C-fr[i]*C*e);}});
      if(p<1)requestAnimationFrame(step);}})(performance.now());
  }});
}})();
"""
    body=f'<div class="sg-donut-body"><div class="donut-wrap">{svg}</div><div class="legend">{leg}</div></div>'
    return css, f'<div class="{u} sg-chart">{head}{body}<script>{js}</script></div>'

# ---- geometry helpers for circular charts ----
def _pt(cx,cy,r,deg):
    a=math.radians(deg); return (cx+r*math.cos(a), cy+r*math.sin(a))
def _wedge(cx,cy,r,start,end,inner=0):
    x0,y0=_pt(cx,cy,r,start); x1,y1=_pt(cx,cy,r,end)
    large=1 if (end-start)%360>180 else 0
    if inner<=0:
        return f"M{cx:.2f} {cy:.2f} L{x0:.2f} {y0:.2f} A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f} Z"
    ix0,iy0=_pt(cx,cy,inner,start); ix1,iy1=_pt(cx,cy,inner,end)
    return (f"M{x0:.2f} {y0:.2f} A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f} "
            f"L{ix1:.2f} {iy1:.2f} A{inner} {inner} 0 {large} 0 {ix0:.2f} {iy0:.2f} Z")
def _arc(cx,cy,r,start,end):
    x0,y0=_pt(cx,cy,r,start); x1,y1=_pt(cx,cy,r,end)
    large=1 if (end-start)%360>180 else 0
    return f"M{x0:.2f} {y0:.2f} A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}"

# ---- PIE (wedge fills; explode + dim on hover; fan-in entrance) ----
def build_pie(spec, u):
    W=H=460; cx=cy=230; r=190; inner=spec.get("inner",0)
    segs=spec["segments"]; total=sum(s["value"] for s in segs) or 1; unit=spec.get("unit","")
    parts=[]; ang=-90.0; mids=[]
    for i,s in enumerate(segs):
        frac=s["value"]/total; sweep=frac*360; end=ang+sweep; mid=ang+sweep/2
        col=PALETTE[i%len(PALETTE)]
        dx,dy=_pt(0,0,16,mid)  # explode vector along bisector
        mids.append((dx,dy))
        parts.append(f'<path class="wedge" data-i="{i}" data-label="{_esc(s["label"])}" data-v="{s["value"]}" '
                     f'style="--dx:{dx:.1f}px;--dy:{dy:.1f}px" d="{_wedge(cx,cy,r,ang,end,inner)}" fill="{col}"/>')
        ang=end
    title=spec.get("title","")
    leg="".join(f'<div class="lg" data-i="{i}"><i style="background:{PALETTE[i%len(PALETTE)]}"></i>'
                f'<span>{_esc(s["label"])}</span><b>{int(round(s["value"]/total*100))}{unit or "%"}</b></div>'
                for i,s in enumerate(segs))
    css=f"""
{_scope_vars(u)}
.{u}{{display:flex;flex-direction:column;gap:18px;height:100%}}
.{u} .pie-body{{display:flex;align-items:center;justify-content:center;gap:48px;flex:1;min-height:0}}
.{u} .pie-wrap{{width:auto;height:100%;max-height:300px;aspect-ratio:1/1;flex:none}}
.{u} svg{{width:100%;height:100%;overflow:visible}}
.{u} .pie-grp{{transform-origin:{cx}px {cy}px}}
.{u} .wedge{{cursor:pointer;transition:transform .18s,opacity .15s;transform-origin:{cx}px {cy}px}}
.{u}.hot .wedge:not(.hot){{opacity:.35}}
.{u} .wedge.hot{{transform:translate(var(--dx),var(--dy))}}
.{u} .legend{{display:flex;flex-direction:column;gap:14px;min-width:190px}}
.{u} .lg{{display:flex;align-items:center;gap:12px;font:15px var(--font-body,sans-serif);color:var(--mutedc);cursor:pointer}}
.{u} .lg i{{width:14px;height:14px;border-radius:4px;flex:none}} .{u} .lg b{{margin-left:auto;color:var(--inkc);font-family:var(--font-mono,monospace)}}
.{u} .lg.hot{{color:var(--inkc)}}
@media (prefers-reduced-motion: no-preference){{
  @keyframes pie_{u}{{from{{transform:rotate(-14deg) scale(.86);opacity:0}}to{{transform:none;opacity:1}}}}
  .{u} .pie-grp{{opacity:0}} .{u}.run .pie-grp{{animation:pie_{u} .9s cubic-bezier(.2,.7,.2,1) forwards}}
}}
"""
    head=(f'<div class="sg-chart-head"><div class="sg-chart-title">{title}</div></div>' if title else "")
    svg=(f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg"><g class="pie-grp">'
         + "".join(parts) + '</g></svg>')
    js=f"""
{RUNTIME.strip()}
(function(){{
  var root=document.currentScript.closest('.{u}');
  var wedges=[].slice.call(root.querySelectorAll('.wedge'));
  var legEls=[].slice.call(root.querySelectorAll('.lg'));
  function hot(i){{root.classList.add('hot');wedges[i].classList.add('hot');if(legEls[i])legEls[i].classList.add('hot');}}
  function cool(){{root.classList.remove('hot');wedges.forEach(function(w){{w.classList.remove('hot');}});
    legEls.forEach(function(l){{l.classList.remove('hot');}});}}
  wedges.forEach(function(w,i){{w.addEventListener('mouseenter',function(){{hot(i);}});w.addEventListener('mouseleave',cool);}});
  legEls.forEach(function(l,i){{l.addEventListener('mouseenter',function(){{hot(i);}});l.addEventListener('mouseleave',cool);}});
  window.__sgWhenActive(root,function(){{root.classList.add('run');}});
}})();
"""
    body=f'<div class="pie-body"><div class="pie-wrap">{svg}</div><div class="legend">{leg}</div></div>'
    return css, f'<div class="{u} sg-chart">{head}{body}<script>{js}</script></div>'

# ---- RADIAL bar (concentric value rings; sweep-in; highlight ring + center readout) ----
def build_radial(spec, u):
    W=H=460; cx=cy=230; segs=spec["segments"]; mx=spec.get("max",100); unit=spec.get("unit","%")
    n=len(segs); r_out=196; ring_gap=8; sw=20
    rings=[]; fracs=[]
    for i,s in enumerate(segs):
        r=r_out-i*(sw+ring_gap); frac=min(1.0,(s["value"]/mx) if mx else 0); fracs.append(frac)
        C=2*math.pi*r; col=PALETTE[i%len(PALETTE)]
        rings.append((i,s,r,C,col))
    track="".join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="rgba(124,140,255,.12)" stroke-width="{sw}"/>'
                  for (_,_,r,_,_) in rings)
    val="".join(f'<circle class="ring" data-i="{i}" data-label="{_esc(s["label"])}" data-v="{s["value"]}" '
                f'cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round" '
                f'stroke-dasharray="0 {C:.2f}" transform="rotate(-90 {cx} {cy})"/>'
                for (i,s,r,C,col) in rings)
    center=(f'<text class="cv" x="{cx}" y="{cy-2}" text-anchor="middle">{int(round(segs[0]["value"]))}{unit}</text>'
            f'<text class="cl" x="{cx}" y="{cy+24}" text-anchor="middle">{_esc(segs[0]["label"])}</text>')
    leg="".join(f'<div class="lg" data-i="{i}"><i style="background:{PALETTE[i%len(PALETTE)]}"></i>'
                f'<span>{_esc(s["label"])}</span><b>{int(round(s["value"]))}{unit}</b></div>'
                for i,s in enumerate(segs))
    title=spec.get("title","")
    css=f"""
{_scope_vars(u)}
.{u}{{display:flex;flex-direction:column;gap:18px;height:100%}}
.{u} .radial-body{{display:flex;align-items:center;justify-content:center;gap:48px;flex:1;min-height:0}}
.{u} .radial-wrap{{width:auto;height:100%;max-height:300px;aspect-ratio:1/1;flex:none}}
.{u} svg{{width:100%;height:100%;overflow:visible}}
.{u} .ring{{cursor:pointer;transition:opacity .15s,stroke-width .15s}}
.{u}.hot .ring:not(.hot){{opacity:.3}} .{u} .ring.hot{{stroke-width:{sw+6}}}
.{u} .cv{{fill:var(--inkc);font:800 44px var(--font-display,sans-serif)}}
.{u} .cl{{fill:var(--faintc);font:13px var(--font-mono,monospace);letter-spacing:.16em;text-transform:uppercase}}
.{u} .legend{{display:flex;flex-direction:column;gap:14px;min-width:190px}}
.{u} .lg{{display:flex;align-items:center;gap:12px;font:15px var(--font-body,sans-serif);color:var(--mutedc);cursor:pointer}}
.{u} .lg i{{width:14px;height:14px;border-radius:4px;flex:none}} .{u} .lg b{{margin-left:auto;color:var(--inkc);font-family:var(--font-mono,monospace)}}
.{u} .lg.hot{{color:var(--inkc)}}
"""
    head=(f'<div class="sg-chart-head"><div class="sg-chart-title">{title}</div></div>' if title else "")
    svg=(f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">'
         + track + val + center + '</svg>')
    Cs=json.dumps([C for (_,_,_,C,_) in rings]); fracsj=json.dumps(fracs)
    labels=json.dumps([s["label"] for s in segs]); vlist=json.dumps([s["value"] for s in segs])
    js=f"""
{RUNTIME.strip()}
(function(){{
  var root=document.currentScript.closest('.{u}');
  var Cs={Cs}, fr={fracsj}, labels={labels}, vals={vlist}, unit={json.dumps(unit)};
  var rings=[].slice.call(root.querySelectorAll('.ring'));
  var legEls=[].slice.call(root.querySelectorAll('.lg'));
  var cv=root.querySelector('.cv'), cl=root.querySelector('.cl');
  function hot(i){{root.classList.add('hot');rings[i].classList.add('hot');if(legEls[i])legEls[i].classList.add('hot');
    cv.textContent=Math.round(vals[i])+unit; cl.textContent=labels[i];}}
  function cool(){{root.classList.remove('hot');rings.forEach(function(s){{s.classList.remove('hot');}});
    legEls.forEach(function(l){{l.classList.remove('hot');}}); cv.textContent=Math.round(vals[0])+unit; cl.textContent=labels[0];}}
  rings.forEach(function(s,i){{s.addEventListener('mouseenter',function(){{hot(i);}});s.addEventListener('mouseleave',cool);}});
  legEls.forEach(function(l,i){{l.addEventListener('mouseenter',function(){{hot(i);}});l.addEventListener('mouseleave',cool);}});
  window.__sgWhenActive(root,function(){{
    if(window.__sgReduce){{rings.forEach(function(s,i){{s.style.strokeDasharray=(fr[i]*Cs[i])+' '+((1-fr[i])*Cs[i]);}});return;}}
    var t0=null;(function step(ts){{if(!t0)t0=ts;var p=Math.min(1,(ts-t0)/1200),e=1-Math.pow(1-p,3);
      rings.forEach(function(s,i){{s.style.strokeDasharray=(fr[i]*Cs[i]*e)+' '+(Cs[i]-fr[i]*Cs[i]*e);}});
      if(p<1)requestAnimationFrame(step);}})(performance.now());
  }});
}})();
"""
    body=f'<div class="radial-body"><div class="radial-wrap">{svg}</div><div class="legend">{leg}</div></div>'
    return css, f'<div class="{u} sg-chart">{head}{body}<script>{js}</script></div>'

# ---- GAUGE (semicircular single-metric; arc sweep + count-up) ----
def build_gauge(spec, u):
    W=460; H=300; cx=230; cy=250; r=180; sw=30
    val=spec.get("value",0); mx=spec.get("max",100); unit=spec.get("unit","%")
    frac=min(1.0,(val/mx) if mx else 0)
    arclen=math.pi*r  # 180deg
    track=_arc(cx,cy,r,180,360)
    title=spec.get("title","")
    css=f"""
{_scope_vars(u)}
.{u}{{display:flex;flex-direction:column;gap:8px;height:100%}}
.{u} .gauge-wrap{{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}}
.{u} svg{{width:100%;height:100%;max-height:320px;overflow:visible}}
.{u} .g-track{{fill:none;stroke:rgba(124,140,255,.14);stroke-width:{sw};stroke-linecap:round}}
.{u} .g-val{{fill:none;stroke:url(#{u}grad);stroke-width:{sw};stroke-linecap:round;
  stroke-dasharray:{arclen:.2f};stroke-dashoffset:{arclen:.2f}}}
.{u} .g-num{{fill:var(--inkc);font:800 64px var(--font-display,sans-serif)}}
.{u} .g-cap{{fill:var(--faintc);font:13px var(--font-mono,monospace);letter-spacing:.18em;text-transform:uppercase}}
.{u} .g-end{{fill:var(--faintc);font:13px var(--font-mono,monospace)}}
@media (prefers-reduced-motion: no-preference){{
  .{u}.run .g-val{{transition:stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)}}
}}
"""
    head=(f'<div class="sg-chart-head"><div class="sg-chart-title">{title}</div></div>' if title else "")
    svg=(f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">'
         f'<defs><linearGradient id="{u}grad" x1="0" y1="0" x2="1" y2="0">'
         f'<stop offset="0%" stop-color="var(--c2)"/><stop offset="100%" stop-color="var(--c1)"/></linearGradient></defs>'
         f'<path class="g-track" d="{track}"/>'
         f'<path class="g-val" d="{track}"/>'
         f'<text class="g-num" x="{cx}" y="{cy-18}" text-anchor="middle">0{unit}</text>'
         f'<text class="g-cap" x="{cx}" y="{cy+14}" text-anchor="middle">{_esc(spec.get("caption","").upper())}</text>'
         f'<text class="g-end" x="{cx-r}" y="{cy+24}" text-anchor="middle">0</text>'
         f'<text class="g-end" x="{cx+r}" y="{cy+24}" text-anchor="middle">{int(mx)}</text>'
         f'</svg>')
    js=f"""
{RUNTIME.strip()}
(function(){{
  var root=document.currentScript.closest('.{u}');
  var arclen={arclen:.2f}, frac={frac:.4f}, val={val}, unit={json.dumps(unit)};
  var vEl=root.querySelector('.g-val'), num=root.querySelector('.g-num');
  window.__sgWhenActive(root,function(){{
    root.classList.add('run');
    requestAnimationFrame(function(){{ vEl.style.strokeDashoffset=(arclen*(1-frac)); }});
    window.__sgCount(num, val, window.__sgReduce?0:1200, 'plain', unit);
  }});
}})();
"""
    return css, f'<div class="{u} sg-chart">{head}<div class="gauge-wrap">{svg}</div><script>{js}</script></div>'

CHART_BUILDERS={"line":build_line,"bar":build_bar,"donut":build_donut,
                "pie":build_pie,"radial":build_radial,"gauge":build_gauge}
DEMO_DATA={
 "line":{"title":"Model size over time","y_log":True,
   "x":["2012","2014","2017","2018","2019","2020","2022","2023"],
   "series":[{"name":"Parameters","values":[6e7,1.4e8,2e8,3.4e8,1.5e9,1.75e11,5e11,1.2e12]}],
   "annotations":[{"i":5,"text":"175B"}]},
 "bar":{"title":"Top-1 accuracy by model","unit":"%","value_labels":True,
   "x":["2012","2015","2018","2021","2024"],
   "series":[{"name":"acc","values":[63,78,85,90,94]}]},
 "donut":{"title":"Where training time goes","unit":"%",
   "segments":[{"label":"Data prep","value":35},{"label":"Training","value":45},
               {"label":"Evaluation","value":12},{"label":"Tuning","value":8}]},
 "pie":{"title":"Compute budget by stage","unit":"%",
   "segments":[{"label":"Pretraining","value":58},{"label":"Fine-tuning","value":22},
               {"label":"Evaluation","value":12},{"label":"Serving","value":8}]},
 "radial":{"title":"Benchmark scores","unit":"%","max":100,
   "segments":[{"label":"Reasoning","value":88},{"label":"Coding","value":74},
               {"label":"Math","value":63},{"label":"Vision","value":52}]},
 "gauge":{"title":"Model utilization","value":72,"max":100,"unit":"%","caption":"GPU load"},
}

# =============================================================================== GALLERY
def _bake_demo_highlight(ct, frag, u):
    """For the static gallery only: pre-apply the hover-highlight state into the
    markup so the screenshot shows the interactive look without relying on JS."""
    if ct=="bar":
        frag=frag.replace(f'class="{u} sg-chart"',f'class="{u} sg-chart hot"',1)
        frag=frag.replace('<g class="bar" data-i="3"','<g class="bar hot" data-i="3"',1)
    elif ct=="donut":
        frag=frag.replace(f'class="{u} sg-chart"',f'class="{u} sg-chart hot"',1)
        frag=frag.replace('<circle class="seg" data-i="1"','<circle class="seg hot" data-i="1"',1)
        # update center label to the highlighted segment (Training / 45%)
        frag=frag.replace('>100%<','>45%<',1).replace('>total<','>Training<',1)
    elif ct=="pie":
        frag=frag.replace(f'class="{u} sg-chart"',f'class="{u} sg-chart hot"',1)
        frag=frag.replace('<path class="wedge" data-i="0"','<path class="wedge hot" data-i="0"',1)
    elif ct=="radial":
        frag=frag.replace(f'class="{u} sg-chart"',f'class="{u} sg-chart hot"',1)
        frag=frag.replace('<circle class="ring" data-i="0"','<circle class="ring hot" data-i="0"',1)
    return frag

def gallery_html():
    blocks=[]; styles=[ANIM_CSS]
    DEMO_SEL={"line":'.pt[data-i="5"]',"bar":'.bar[data-i="3"]',"donut":'.seg[data-i="1"]',
              "pie":'.wedge[data-i="0"]',"radial":'.ring[data-i="0"]',"gauge":'.g-val'}
    # charts (a representative element is hover-highlighted so the interactive state shows in a static capture)
    for ct,dh in (("line","5"),("bar","3"),("donut","1"),("pie","0"),("radial","0"),("gauge","0")):
        u=uid(); css,frag=CHART_BUILDERS[ct](DEMO_DATA[ct],u)
        styles.append(css)
        frag=_bake_demo_highlight(ct,frag,u)
        blocks.append(("Chart · "+ct, frag, DEMO_SEL[ct]))
    anim_tiles="".join(
        f'<div class="tile"><div class="tlabel">{name}</div><div class="tbody">{ANIM_DEMOS[name]}</div></div>'
        for name in ANIM_NAMES)
    # word-spin needs its own scoped CSS (keyframe depends on word count)
    ws_css, ws_html = build_word_spin(["build","design","ship","scale"])
    styles.append(ws_css)
    anim_tiles += (f'<div class="tile"><div class="tlabel">word-spin</div>'
                   f'<div class="tbody" style="font-size:24px">We <span style="color:var(--cyan)">{ws_html}</span></div></div>')
    head_css="\n".join(styles)
    chart_sections="".join(
        f'<section class="csec"><h2>{t}</h2><div class="cbox" data-demo-sel=\'{sel}\'>{f}</div></section>'
        for t,f,sel in blocks)
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1280">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{{--bg:#05080f;--bg-2:#0a1122;--ink:#eaf1fb;--muted:#93a2bd;--faint:#5a6a86;
--cyan:#3ce8ff;--indigo:#7c8cff;--mint:#44f3c4;--panel:rgba(255,255,255,.04);
--brd:rgba(255,255,255,.10);--brd-2:rgba(124,140,255,.28);--grid:rgba(124,140,255,.10);
--font-display:'Sora','DejaVu Sans',sans-serif;--font-body:'IBM Plex Sans','DejaVu Sans',sans-serif;
--font-mono:'JetBrains Mono','DejaVu Sans Mono',monospace;}}
*{{box-sizing:border-box}} body{{margin:0;width:1280px;background:linear-gradient(160deg,#05080f,#0a1122);
color:var(--ink);font-family:var(--font-body);padding:46px 64px}}
h1{{font-family:var(--font-display);font-size:40px;margin:0 0 6px}} .sub{{color:var(--muted);margin:0 0 36px}}
h2{{font-family:var(--font-display);font-size:18px;color:var(--cyan);letter-spacing:.04em;margin:34px 0 16px;
text-transform:uppercase;font-size:13px;font-family:var(--font-mono);letter-spacing:.22em}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}}
.tile{{background:var(--panel);border:1px solid var(--brd);border-radius:14px;padding:22px;min-height:150px;
display:flex;flex-direction:column;gap:14px;overflow:hidden}}
.tlabel{{font-family:var(--font-mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}}
.tbody{{flex:1;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);
font-weight:700;font-size:26px;text-align:center}}
.tbody h1{{font-size:30px}}
.csec{{margin-top:10px}} .cbox{{background:var(--panel);border:1px solid var(--brd);border-radius:16px;
padding:26px 30px;height:380px}} .cbox .sg-chart{{height:100%;display:flex;flex-direction:column}}
.sg-chart-title{{font-family:var(--font-display);font-weight:700;font-size:22px;margin-bottom:10px}}
.sg-chart svg{{flex:1;min-height:0}}
{head_css}
</style></head><body>
<h1>slidegen — animation &amp; chart gallery</h1>
<p class="sub">Generated by <code>slidegen.py</code>. Charts are interactive (hover the points / bars / segments). One element per chart is auto-highlighted here so the hover state is visible in a static capture.</p>
<h2>Animations</h2>
<div class="grid">{anim_tiles}</div>
{chart_sections}
<script>{ANIM_RUNTIME.strip()}</script>
<script>
/* showcase: trigger the hover-highlight on one element per chart so the
   interactive state is visible in a static screenshot. Uses real pointer
   events — the same path a user's cursor takes. */
(function(){{
  function fire(){{
    document.querySelectorAll('.cbox[data-demo-sel]').forEach(function(box){{
      var el=box.querySelector(box.getAttribute('data-demo-sel'));
      if(el){{['mouseover','mouseenter'].forEach(function(t){{
        el.dispatchEvent(new MouseEvent(t,{{bubbles:t==='mouseover'}}));}});}}
    }});
  }}
  setTimeout(fire,300);
}})();
</script>
</body></html>"""

# =================================================================================== CLI
def main():
    ap=argparse.ArgumentParser(add_help=False)
    ap.add_argument("cmd", nargs="?", default="help")
    ap.add_argument("name", nargs="?")
    ap.add_argument("--data"); ap.add_argument("--id"); ap.add_argument("--title")
    ap.add_argument("--text"); ap.add_argument("--demo", action="store_true"); ap.add_argument("-o","--out")
    a=ap.parse_args()

    if a.cmd in ("help","-h","--help"):
        print(__doc__); return
    if a.cmd=="list":
        print("animations:", ", ".join(ANIM_NAMES + ["word-spin"]))
        print("charts:    ", ", ".join(CHART_BUILDERS)); return
    if a.cmd=="anims":
        print("<style>"+ANIM_CSS+"</style>\n<script>"+ANIM_RUNTIME+"</script>"); return
    if a.cmd=="anim":
        if a.name=="word-spin":
            words=[w.strip() for w in (a.text or "build,design,ship").split(",") if w.strip()]
            css,html=build_word_spin(words, a.id)
            print("<style>"+css+"</style>\n"+html); return
        if a.name not in ANIM_DEMOS: sys.exit(f"unknown animation '{a.name}'. try: {', '.join(ANIM_NAMES+['word-spin'])}")
        print("<!-- include the `anims` block once in <head>; then use this markup: -->")
        if a.name=="kinetic" and a.text:
            print(kinetic_spans(a.text)); return
        print(ANIM_DEMOS[a.name]); return
    if a.cmd=="chart":
        if a.name not in CHART_BUILDERS: sys.exit(f"unknown chart '{a.name}'. try: {', '.join(CHART_BUILDERS)}")
        if a.data:
            spec=json.load(sys.stdin) if a.data=="-" else json.load(open(a.data))
        else:
            spec=dict(DEMO_DATA[a.name])
        if a.title: spec["title"]=a.title
        u=a.id or uid()
        css,frag=CHART_BUILDERS[a.name](spec,u)
        print("<style>"+css+"</style>\n"+frag); return
    if a.cmd=="gallery":
        html=gallery_html(); out=a.out or "gallery.html"
        open(out,"w").write(html); print("wrote",out); return
    sys.exit("unknown command. run: python3 slidegen.py help")

if __name__=="__main__":
    try:
        main()
    except BrokenPipeError:
        # output was piped to a command that closed early (e.g. head); exit quietly
        try: sys.stdout.close()
        except Exception: pass
