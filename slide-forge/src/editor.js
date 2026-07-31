/* =====================================================================
   SLIDE-FORGE EDITOR v3  —  in-deck hybrid editor.
   Additive layer over the data-driven engine. Two kinds of edit:
     • CONTENT — the slide's `content` data is edited directly in the sidebar
       (fields + nested array items, add/remove). The deck re-renders from data,
       so edits never go stale and survive layout switches.
     • OBJECT  — geometry (x/y/w/h/scale/rotate/z) + style (color/accent/font/
       surface) overrides layered on a template element or a free object.
   v3 identity is AUTHORED by the engine's layouts (see plan §10):
     data-el   — stable content-path key ("title", "stats.2") for selection +
                 overrides. No positional tagging (except `raw` slides).
     data-bind — the content path a text leaf renders; on-canvas edits write
                 back to that path deterministically.
     data-arr  — the content array a container renders; item add/duplicate/
                 remove parse the item index from the element key and REMAP
                 sibling override keys, so styling survives list edits. A GC
                 pass in commit drops overrides whose element no longer exists.
   Everything selectable shares one Element model and the same verbs — move,
   resize (corner drag = width/reflow, Alt = scale), rotate, style, animate,
   copy, duplicate, delete, reorder(z) — plus double-click text editing, smart
   guides + snapping, multi-select, align/distribute, groups.
   Source of truth = SG.data. Edits route through Forge.do()/pushUndo so undo/
   redo and autosave are free; continuous inputs coalesce to one snapshot per
   gesture. Content typing re-renders only the current slide (SG.renderSlide).
   "Save" = download a fresh self-contained .html.
   ===================================================================== */
(function(){
  var W=window, D=document, SG=W.SG=W.SG||{};
  var F=W.Forge=W.Forge||{};                  /* ||= so load order vs. media.js never matters */

  /* ---------- embedded themes (named global palettes) ---------- */
  F.themes={
    "Midnight Neon":{vars:{"--bg":"#05080f","--bg-2":"#0a1122","--ink":"#eaf1fb","--muted":"#93a2bd","--faint":"#5a6a86","--cyan":"#3ce8ff","--indigo":"#7c8cff","--mint":"#44f3c4","--stage":"#02040a","--dot":"rgba(124,140,255,.10)","--font-display":"'Sora','DejaVu Sans',system-ui,sans-serif","--font-body":"'IBM Plex Sans','DejaVu Sans',system-ui,sans-serif","--font-mono":"'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Solar Flare":{vars:{"--bg":"#140b05","--bg-2":"#1d1006","--ink":"#fff3e6","--muted":"#d6b59a","--faint":"#8a6f5a","--cyan":"#ffb020","--indigo":"#ff6a3d","--mint":"#ffd166","--stage":"#0b0603","--dot":"rgba(255,150,80,.10)","--font-display":"'Unbounded','DejaVu Sans',system-ui,sans-serif","--font-body":"'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif","--font-mono":"'Space Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Evergreen":{vars:{"--bg":"#04110d","--bg-2":"#07191a","--ink":"#e8f6ee","--muted":"#97b6a8","--faint":"#5d7a6e","--cyan":"#3ddc97","--indigo":"#1fb6a6","--mint":"#b6e84a","--stage":"#02100b","--dot":"rgba(60,200,150,.10)","--font-display":"'Fraunces','Georgia','DejaVu Serif',serif","--font-body":"'Spectral','Georgia','DejaVu Serif',serif","--font-mono":"'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Monolith":{vars:{"--bg":"#0c0d10","--bg-2":"#15171c","--ink":"#f2f4f8","--muted":"#9aa0ac","--faint":"#5e6470","--cyan":"#5b8cff","--indigo":"#c8cdd8","--mint":"#9aa3b2","--stage":"#060708","--dot":"rgba(255,255,255,.06)","--font-display":"'Archivo','DejaVu Sans',system-ui,sans-serif","--font-body":"'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif","--font-mono":"'Space Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Royal Velvet":{vars:{"--bg":"#0e0718","--bg-2":"#160a26","--ink":"#f3ecff","--muted":"#b6a6cf","--faint":"#7c6b9a","--cyan":"#b98cff","--indigo":"#8a5cff","--mint":"#ffcf6b","--stage":"#07030f","--dot":"rgba(160,120,255,.10)","--font-display":"'Playfair Display','Georgia','DejaVu Serif',serif","--font-body":"'Lora','Georgia','DejaVu Serif',serif","--font-mono":"'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Coral Sunset":{vars:{"--bg":"#160a10","--bg-2":"#21101a","--ink":"#ffeef2","--muted":"#d6a9b8","--faint":"#93697a","--cyan":"#ff6f91","--indigo":"#ff9671","--mint":"#ffc75f","--stage":"#0b0408","--dot":"rgba(255,140,160,.10)","--font-display":"'Syne','DejaVu Sans',system-ui,sans-serif","--font-body":"'Manrope','DejaVu Sans',system-ui,sans-serif","--font-mono":"'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Deep Ocean":{vars:{"--bg":"#021018","--bg-2":"#04212e","--ink":"#e6f6ff","--muted":"#93b8c9","--faint":"#587886","--cyan":"#38d6ff","--indigo":"#3b82f6","--mint":"#2ee6c6","--stage":"#01080f","--dot":"rgba(56,180,220,.10)","--font-display":"'Epilogue','DejaVu Sans',system-ui,sans-serif","--font-body":"'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif","--font-mono":"'Fira Code','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Editorial Paper":{vars:{"--bg":"#f6f1e7","--bg-2":"#efe7d6","--ink":"#1c1a17","--muted":"#4f4a42","--faint":"#8a8377","--cyan":"#c0392b","--indigo":"#1c1a17","--mint":"#b8860b","--stage":"#e9e1d2","--dot":"rgba(20,18,15,.10)","--font-display":"'Newsreader','Georgia','DejaVu Serif',serif","--font-body":"'Source Serif 4','Georgia','DejaVu Serif',serif","--font-mono":"'IBM Plex Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Arctic":{vars:{"--bg":"#ffffff","--bg-2":"#eef4fb","--ink":"#0d1b2a","--muted":"#43566b","--faint":"#8496a8","--cyan":"#0091d5","--indigo":"#3a5bd9","--mint":"#16b8a6","--stage":"#e4edf6","--dot":"rgba(13,27,42,.07)","--font-display":"'Bricolage Grotesque','DejaVu Sans',system-ui,sans-serif","--font-body":"'Manrope','DejaVu Sans',system-ui,sans-serif","--font-mono":"'Space Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Sandstone":{vars:{"--bg":"#f4ece0","--bg-2":"#ece0cf","--ink":"#2a2118","--muted":"#5b4f40","--faint":"#91836f","--cyan":"#c1632d","--indigo":"#7a7a2e","--mint":"#b8902f","--stage":"#e6d8c4","--dot":"rgba(42,33,24,.09)","--font-display":"'Fraunces','Georgia','DejaVu Serif',serif","--font-body":"'Hanken Grotesk','DejaVu Sans',system-ui,sans-serif","--font-mono":"'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace"}},
    "Ember Red":{vars:{"--bg":"#0d0404","--bg-2":"#1a0707","--ink":"#fff0ee","--muted":"#c49090","--faint":"#7a5050","--cyan":"#ff2d2d","--indigo":"#ff6d00","--mint":"#ffb300","--stage":"#080202","--dot":"rgba(255,60,40,.10)","--font-display":"'Exo 2','DejaVu Sans',system-ui,sans-serif","--font-body":"'IBM Plex Sans','DejaVu Sans',system-ui,sans-serif","--font-mono":"'JetBrains Mono','DejaVu Sans Mono',ui-monospace,monospace"}}
  };
  /* font-family choices offered per-object (label -> CSS family) */
  F.fontChoices=[["Theme display","var(--font-display)"],["Theme body","var(--font-body)"],["Theme mono","var(--font-mono)"],
    ["Sora","'Sora',sans-serif"],["Unbounded","'Unbounded',sans-serif"],["Exo 2","'Exo 2',sans-serif"],["Archivo","'Archivo',sans-serif"],
    ["Syne","'Syne',sans-serif"],["Epilogue","'Epilogue',sans-serif"],["Bricolage Grotesque","'Bricolage Grotesque',sans-serif"],
    ["Fraunces","'Fraunces',serif"],["Playfair Display","'Playfair Display',serif"],["Newsreader","'Newsreader',serif"]];

  var LAYOUTS=["cover","agenda","divider","stat-grid","bignum","chart","table","comparison","quote","code","timeline","pipeline","closing","manifesto","editorial","hero-asym","figure","metric-dash","leaderboard","diptych","matrix","stack","quote-mosaic","index-mosaic","before-after","raw"];
  var CHART_TYPES=["bar","bar-h","stacked","line","area","pie","donut","scatter"];
  var TOKENS=["--bg","--bg-2","--ink","--muted","--cyan","--indigo","--mint"];
  var AMBIENTS=["auto","none","orbs","aurora","grid","rays","grain","contours","scan","waves","glow","constellation"];
  F.animChoices=[["— none —",""],
    ["Fade rise","fade-rise"],["Reveal wipe","reveal-wipe"],["Typewriter","typewriter"],["Kinetic letters","kinetic"],
    ["Stagger children","stagger"],
    ["Glow pulse","glow-pulse"],["Shimmer","shimmer"],["Gradient text","gradient-text"],["Neon flicker","neon-flicker"],["Float","float"]];
  var ANIM_ENTRANCE={"fade-rise":1,"reveal-wipe":1,"typewriter":1,"kinetic":1,"stagger":1};

  /* minimal default content per layout — used when switching layouts so a slide
     is never left empty (and shared fields like title carry over). */
  var DEFAULTS={
    cover:{kicker:"",title:"Title",accent:"",subtitle:"Subtitle"},
    agenda:{kicker:"",title:"Agenda",items:[{title:"Item one",desc:""},{title:"Item two",desc:""}]},
    divider:{index:"01",title:"Section",subtitle:""},
    "stat-grid":{kicker:"",title:"By the numbers",stats:[{count:0,unit:"%",label:"Label"}]},
    bignum:{kicker:"",count:0,subtitle:"Context"},
    chart:{kicker:"",title:"Chart",type:"bar",data:{labels:["A","B","C"],series:[{name:"Series 1",values:[3,5,4]}]},options:{unit:"",showValues:true},note:""},
    table:{kicker:"",title:"Table",columns:["","Col A","Col B"],rows:[["Row 1","",""],["Row 2","",""]],options:{}},
    comparison:{kicker:"",title:"Compare",left:{tag:"",title:"Option A",items:["point one"]},right:{tag:"",title:"Option B",items:["point one"]},badge:"VS"},
    quote:{quote:"A short, memorable quote.",by:"Source"},
    code:{kicker:"",title:"Code",filename:"file.js",code:"// your code here",caption:""},
    timeline:{kicker:"",title:"Timeline",items:[{year:"2024",title:"Event",desc:""}]},
    pipeline:{kicker:"",title:"Pipeline",nodes:[{title:"Step",desc:""}]},
    closing:{kicker:"",title:"Thank you",accent:"",takeaways:[{title:"Takeaway",desc:""}],note:""},
    manifesto:{statement:"Our [[statement]] goes here.",lead:""},
    editorial:{kicker:"",lead:"Lead paragraph.",columns:[{head:"Heading",body:"Body text."}]},
    "hero-asym":{title:"Title",sub:"",rows:[{k:"Key",v:"Value",unit:""}]},
    figure:{kicker:"",title:"Title",caption:"",image:""},
    "metric-dash":{kicker:"",title:"Metrics",ring:{value:50,suffix:"%",label:"Label"},tiles:[{value:"0",unit:"",label:"Tile"}]},
    leaderboard:{kicker:"",title:"Leaderboard",rows:[{name:"Name",value:"0"}]},
    diptych:{left:{tag:"",title:"Left",body:""},right:{tag:"",title:"Right",body:""}},
    matrix:{kicker:"",title:"Matrix",cells:[{title:"Cell",desc:""}],xlabel:"",ylabel:""},
    stack:{kicker:"",title:"Stack",bands:[{title:"Layer",desc:""}]},
    "quote-mosaic":{kicker:"",title:"Voices",quotes:[{quote:"Quote",by:"By"}]},
    "index-mosaic":{kicker:"",title:"Index",items:[{title:"Item",desc:""}]},
    "before-after":{kicker:"",title:"Before / After",before:{tag:"Before",title:"",items:["point"]},after:{tag:"After",title:"",items:["point"]}},
    raw:{html:"<h1 class='title'>Raw slide</h1>"}
  };

  /* ---------- small helpers ---------- */
  function el(tag,cls,html){ var n=D.createElement(tag); if(cls)n.className=cls; if(html!=null)n.innerHTML=html; return n; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function curSlide(){ var i=(parseInt((location.hash||'').slice(1),10)||1)-1; return clamp(i,0,(SG.data.slides||[]).length-1); }
  function pretty(k){ var m={k:"Key",v:"Value",desc:"Description",by:"Source",sub:"Subtitle",xlabel:"X label",ylabel:"Y label",fmt:"Format"};
    return m[k]||String(k).replace(/([A-Z])/g,' $1').replace(/[-_]/g,' ').replace(/^./,function(c){return c.toUpperCase();}); }
  function deckEl(){ return D.getElementById('deck'); }
  function editing(){ return D.body.classList.contains('forge-edit'); }
  function uid(){ return 'f'+Math.random().toString(36).slice(2,9); }
  function pulse(node){ if(!node) return; node.classList.remove('forge-live'); void node.offsetWidth; node.classList.add('forge-live'); }

  /* =====================================================================
     COMMAND LAYER  —  snapshot-based undo/redo + autosave.
     ===================================================================== */
  F.undo=[]; F.redo=[];
  F.pushUndo=function(){ F._coTag=null;
    F.undo.push(JSON.stringify(SG.data)); if(F.undo.length>80) F.undo.shift(); F.redo.length=0; F.syncToolbar(); };
  /* one snapshot per continuous GESTURE (color-picker drag, arrow-nudge run):
     same tag within 900ms coalesces instead of flooding the undo stack. */
  F.pushUndoCoalesced=function(tag){ var now=Date.now();
    if(F._coTag===tag && now-(F._coAt||0)<900){ F._coAt=now; return; }
    F.pushUndo(); F._coTag=tag; F._coAt=now; };
  F.do=function(label,mutate){ F.pushUndo(); mutate(SG.data); F.commit(); };
  /* full re-render + rebuild panels (structural changes) */
  F.commit=function(){ SG.render(deckEl(),SG.data); gcOverrides(deckEl()); SG.refresh&&SG.refresh(); reselect(); F.save(); F.buildNav(); F.syncToolbar(); F.buildInspect(); positionFloat(); };
  /* light FULL re-render that preserves sidebar focus (global settings: theme,
     brand — anything that isn't scoped to one slide) */
  F.renderLive=function(){ SG.render(deckEl(),SG.data); SG.refresh&&SG.refresh(); reselect(); F.saveDebounced(); };
  /* targeted live re-render: rebuild only the CURRENT slide's section while
     typing in the sidebar. Falls back to a full render on structure drift. */
  F.renderLiveSlide=function(){ SG.renderSlide(deckEl(),curSlide());
    SG.refresh&&SG.refresh(); reselect(); F.saveDebounced(); };
  F.undoOp=function(){ if(!F.undo.length) return; F.redo.push(JSON.stringify(SG.data)); SG.data=JSON.parse(F.undo.pop()); clearSel(); F.commit(); };
  F.redoOp=function(){ if(!F.redo.length) return; F.undo.push(JSON.stringify(SG.data)); SG.data=JSON.parse(F.redo.pop()); clearSel(); F.commit(); };
  F.syncToolbar=function(){ if(F._undoBtn) F._undoBtn.disabled=!F.undo.length; if(F._redoBtn) F._redoBtn.disabled=!F.redo.length; };

  F.key=function(){ var m=SG.data.meta||{}; if(!m.id){ m.id='forge-'+Math.random().toString(36).slice(2,9); SG.data.meta=m; } return 'forge:'+m.id; };
  F.save=function(){ try{ localStorage.setItem(F.key(), JSON.stringify(SG.data)); }catch(e){} };
  F.saveDebounced=function(){ clearTimeout(F._saveT); F._saveT=setTimeout(F.save,150); };

  /* =====================================================================
     DECORATE  —  after every render: apply geometry/style overrides to the
     engine's authored data-el keys, mount free objects, and (raw slides only)
     fall back to positional b0/b0.1 tagging. With no edits present, output is
     unchanged. Also: one-time legacy-key migration + orphan-override GC.
     ===================================================================== */
  var CHROME=/^(amb|pager|progress|doc-panel|forge-)/;
  var INLINE_SKIP=/^(STRONG|EM|CODE|B|I)$/;
  /* top-level selectable blocks: the engine keys every meaningful child */
  function blocks(section){ return [].slice.call(section.children).filter(function(ch){
    return ch.nodeType===1 && ch.hasAttribute('data-el') && !ch.classList.contains('forge-free'); }); }
  /* ---- v2 positional walk — kept ONLY for raw slides + legacy migration ---- */
  function rawBlocks(section){ return [].slice.call(section.children).filter(function(ch){
    var c=(typeof ch.className==='string'?ch.className:'').split(' ')[0]||'';
    return ch.nodeType===1 && !CHROME.test(c) && !ch.classList.contains('forge-free'); }); }
  function keyableChildren(node){ return [].slice.call(node.children).filter(function(ch){
    if(ch.nodeType!==1) return false;
    var c=(typeof ch.className==='string'?ch.className:'').split(' ')[0]||'';
    if(CHROME.test(c)) return false; if(ch.classList.contains('forge-free')||ch.classList.contains('forge-handles')) return false;
    if(INLINE_SKIP.test(ch.tagName)||ch.classList.contains('glow')) return false;
    return (ch.textContent||'').trim().length>0; }); }
  function rawKeyEl(node,key,depth){ node.setAttribute('data-el',key); if(depth===0) node.classList.add('forge-block');
    if(depth<2) keyableChildren(node).forEach(function(ch,ci){ rawKeyEl(ch,key+'.'+ci,depth+1); }); }

  /* ---- one-time v2→v3 migration: remap positional b-keys to authored keys.
     Replays the old block walk against the freshly rendered (keyed) DOM; a
     legacy key maps to whatever authored key that element now carries.
     Unmappable keys are dropped with a console note. raw slides keep b-keys. */
  function migrateLegacy(deck,data){
    var secs=deck.querySelectorAll('.slide');
    (data.slides||[]).forEach(function(s,i){
      if(!s.overrides||s.layout==='raw') return;
      var keys=Object.keys(s.overrides);
      if(!keys.some(function(k){ return /^b\d/.test(k); })) return;
      var sec=secs[i]; if(!sec) return;
      var top=rawBlocks(sec), out={}, drop=[];
      keys.forEach(function(k){
        if(!/^b\d/.test(k)){ out[k]=s.overrides[k]; return; }
        var seg=k.split('.'), node=top[parseInt(seg[0].slice(1),10)];
        for(var d=1; node&&d<seg.length; d++) node=keyableChildren(node)[parseInt(seg[d],10)];
        var nk=node&&node.getAttribute('data-el');
        if(nk&&!out[nk]) out[nk]=s.overrides[k]; else drop.push(k); });
      s.overrides=out;
      if(drop.length) try{ console.info('slide-forge: migrated slide '+(i+1)+' overrides to v3 keys; dropped unmappable: '+drop.join(', ')); }catch(e){} });
    SG._legacyKeys=false; if(F.save) F.save(); }

  /* ---- orphan-override GC (runs in commit): drop overrides whose element no
     longer exists after a structural content edit. Undoable (snapshot is taken
     before the mutation) and logged, never silent. */
  function gcOverrides(deck){ var dropped=[];
    var secs=deck.querySelectorAll('.slide');
    (SG.data.slides||[]).forEach(function(s,i){
      if(!s.overrides||s.layout==='raw') return; var sec=secs[i]; if(!sec) return;
      Object.keys(s.overrides).forEach(function(k){
        if(!sec.querySelector('[data-el="'+k+'"]')){ delete s.overrides[k]; dropped.push((i+1)+':'+k); } });
      if(!Object.keys(s.overrides).length) delete s.overrides; });
    if(dropped.length) try{ console.info('slide-forge: removed '+dropped.length+' orphaned override(s) — '+dropped.join(', ')); }catch(e){} }

  function decorateSection(sec,slide){
    if(!slide) return;
    if(slide.layout==='raw') rawBlocks(sec).forEach(function(b,bi){ rawKeyEl(b,'b'+bi,0); });
    blocks(sec).forEach(function(b){ b.classList.add('forge-block'); });
    var ov=slide.overrides||{};
    Object.keys(ov).forEach(function(k){
      var n=sec.querySelector('[data-el="'+k+'"]'); if(n) applyOverride(n,ov[k]); });
    (slide.freeObjects||[]).forEach(function(fo){
      var n=el('div','forge-block forge-free '+(fo.type||'txt')); n.setAttribute('data-free',fo.id);
      if(fo.type==='html') n.innerHTML=fo.html||'';
      else if(fo.type!=='box') n.textContent=fo.text||'Text';
      sec.appendChild(n); applyFree(n,fo); }); }

  F.decorate=function(deck,data){ data=data||SG.data; var slides=data.slides||[];
    if(SG._legacyKeys) migrateLegacy(deck,data);
    [].slice.call(deck.querySelectorAll('.slide')).forEach(function(sec,i){
      decorateSection(sec,slides[i]); });
    /* while editing, resolve every animation to its finished state: no hidden
       .sg-onenter elements, no entrance replay on each live re-render */
    if(editing()&&SG.finalizeAnimations) SG.finalizeAnimations(deck); };
  function transformStr(o){ o=o||{}; var t='';
    if(o.x||o.y) t+='translate('+(o.x||0)+'px,'+(o.y||0)+'px) '; if(o.rot) t+='rotate('+o.rot+'deg) ';
    if(o.scale&&o.scale!==1) t+='scale('+o.scale+') '; return t.trim(); }
  function applyStyle(node,o){ if(!o) return;
    if(o.color) node.style.color=o.color; if(o.font) node.style.fontFamily=o.font;
    if(o.z!=null) node.style.zIndex=o.z;
    if(o.theme) Object.keys(o.theme).forEach(function(k){ node.style.setProperty(k,o.theme[k]); }); }
  function ensureKineticSpans(node){ if(node.querySelector('span[style*="--i"]')||node.children.length) return;
    var txt=node.textContent, o=''; for(var i=0;i<txt.length;i++){ var ch=txt[i]===' '?'&nbsp;':SG.esc(txt[i]); o+='<span style="--i:'+i+'">'+ch+'</span>'; }
    node.innerHTML=o; }
  function applyAnim(node,o){ var want=(o&&o.anim)||'', prev=node.getAttribute('data-anim')||'';
    if(prev&&prev!==want){ node.classList.remove('sg-'+prev); node.classList.remove('sg-onenter'); }
    node.removeAttribute('data-anim-trigger'); node.removeAttribute('data-anim-step');
    if(!want){ if(prev) node.removeAttribute('data-anim'); node.style.animationDelay=''; return; }
    node.setAttribute('data-anim',want); node.classList.add('sg-'+want);
    if(ANIM_ENTRANCE[want]){ node.classList.add('sg-onenter');
      if(o.animTrigger==='click'){ node.setAttribute('data-anim-trigger','click');
        node.setAttribute('data-anim-step',o.animStep!=null?o.animStep:0); }
      if(editing()) node.classList.add('run'); }
    if(want==='kinetic') ensureKineticSpans(node);
    node.style.animationDelay=(o.animDelay?o.animDelay+'s':''); }
  function replayAnim(node){ if(!node) return; node.classList.remove('run'); void node.offsetWidth; node.classList.add('run'); }
  function applyOverride(b,o){ b.style.transform=o?transformStr(o):''; applyAnim(b,o); if(!o) return; b.style.transformOrigin='center center'; applyStyle(b,o);
    if(o.w!=null&&o.w>0){ b.style.width=o.w+'px'; b.style.boxSizing='border-box'; }
    if(o.h!=null&&o.h>0) b.style.height=o.h+'px';
    if(o.hide) b.style.display='none';
    if(o.html!=null && !b.querySelector('[data-el]')) b.innerHTML=SG.rich(o.html); }
  function applyFree(n,fo){ n.style.left='0px'; n.style.top='0px';
    n.style.transform='translate('+(fo.x||0)+'px,'+(fo.y||0)+'px)'+(fo.rot?' rotate('+fo.rot+'deg)':'')+(fo.scale&&fo.scale!==1?' scale('+fo.scale+')':'');
    applyStyle(n,fo); applyAnim(n,fo); if(fo.size) n.style.fontSize=fo.size+'px';
    if(fo.type==='box'){ n.style.width=(fo.w||220)+'px'; n.style.height=(fo.h||120)+'px'; }
    else { if(fo.w) n.style.width=fo.w+'px'; if(fo.h&&fo.type==='html') n.style.height=fo.h+'px'; } }

  var _render=SG.render; SG.render=function(deck,data){ _render(deck,data); F.decorate(deck,data); };
  var _renderSlide=SG.renderSlide; SG.renderSlide=function(deck,i){
    var sec=_renderSlide(deck,i);
    if(sec){ decorateSection(sec,(SG.data.slides||[])[i]);
      if(editing()&&SG.finalizeAnimations) SG.finalizeAnimations(sec); }
    /* sec===null means the engine fell back to a full render (already decorated) */
    return sec; };

  /* =====================================================================
     UNIFIED ELEMENT MODEL + SELECTION (multi-select capable)
     Every selectable thing — template block (b0), nested dotted key (b6.0.1),
     free object — becomes an Element record with the same verbs.
     ===================================================================== */
  F.sels=[];                                  /* array of element records */
  Object.defineProperty(F,'sel',{get:function(){ return F.sels[0]||null; }});
  function scale(){ var d=deckEl().getBoundingClientRect(); return d.width/1280||1; }
  function ovFor(i,key){ var s=SG.data.slides[i]; s.overrides=s.overrides||{}; s.overrides[key]=s.overrides[key]||{}; return s.overrides[key]; }
  function freeFor(i,id){ var s=SG.data.slides[i]; return (s.freeObjects||[]).filter(function(f){return f.id===id;})[0]; }
  function elData(sel){ if(!sel) return null; return sel.kind==='free'?freeFor(sel.slideIdx,sel.id):ovFor(sel.slideIdx,sel.key); }
  /* non-creating accessor (elData creates an empty override on read) */
  function peekData(x){ var s=SG.data.slides[x.slideIdx]; if(!s) return null;
    return x.kind==='free'?freeFor(x.slideIdx,x.id):(s.overrides?s.overrides[x.key]:null); }
  /* selecting any member of a group selects the whole group */
  function expandGroups(recs){ if(!recs.length) return recs;
    var gids={}, any=false;
    recs.forEach(function(x){ var d=peekData(x); if(d&&d.group){ gids[d.group]=1; any=true; } });
    if(!any) return recs;
    var have={}; recs.forEach(function(x){ have[x.kind+':'+(x.key||x.id)]=1; });
    var out=recs.slice(), secs=[];
    recs.forEach(function(x){ if(secs.indexOf(x.section)<0) secs.push(x.section); });
    secs.forEach(function(sec){ [].slice.call(sec.querySelectorAll('[data-el],[data-free]')).forEach(function(n){
      var r=elRecord(n), d=peekData(r); if(!d||!d.group||!gids[d.group]) return;
      var k=r.kind+':'+(r.key||r.id); if(have[k]) return; have[k]=1; out.push(r); }); });
    return out; }
  F.groupSel=function(){ if(F.sels.length<2) return; var gid=uid(); F.pushUndo();
    F.sels.forEach(function(x){ elData(x).group=gid; }); F.save(); paintSel(); };
  F.ungroupSel=function(){ if(!F.sels.length) return; F.pushUndo();
    F.sels.forEach(function(x){ var d=peekData(x); if(d&&d.group) delete d.group; }); F.save(); paintSel(); };
  function selData(){ return elData(F.sel); }
  function elRecord(node){ var sec=node.closest('.slide');
    var idx=[].slice.call(deckEl().querySelectorAll('.slide')).indexOf(sec);
    return {section:sec,node:node,slideIdx:idx,kind:node.hasAttribute('data-free')?'free':'block',
      key:node.getAttribute('data-el'),id:node.getAttribute('data-free')}; }
  function boxOf(node){ var sec=node.closest('.slide'); if(!sec) return null;
    var nb=node.getBoundingClientRect(), sb=sec.getBoundingClientRect(), s=scale();
    return {x:(nb.left-sb.left)/s, y:(nb.top-sb.top)/s, w:nb.width/s, h:nb.height/s}; }
  function isSelected(node){ return F.sels.some(function(x){ return x.node===node; }); }

  function paintSel(){ deckEl().querySelectorAll('.forge-sel,.forge-sel-multi').forEach(function(n){ n.classList.remove('forge-sel','forge-sel-multi'); });
    var h=deckEl().querySelector('.forge-handles'); if(h) h.remove();
    if(F.sels.length===1){ F.sels[0].node.classList.add('forge-sel'); mountHandles(F.sels[0].node); }
    else F.sels.forEach(function(x){ x.node.classList.add('forge-sel-multi'); });
    positionFloat(); }
  function selectNode(node,additive){
    if(additive){ var i=F.sels.map(function(x){return x.node;}).indexOf(node);
      if(i>=0) F.sels.splice(i,1); else F.sels.push(elRecord(node)); }
    else F.sels=[elRecord(node)];
    F.sels=expandGroups(F.sels);
    paintSel(); F.buildInspect(); }
  function selectNodes(nodes,additive){ var recs=nodes.map(elRecord);
    F.sels=additive?F.sels.concat(recs.filter(function(r){ return !isSelected(r.node); })):recs;
    F.sels=expandGroups(F.sels);
    paintSel(); F.buildInspect(); }
  function clearSel(){ F.sels=[]; paintSel(); }
  F.clearSel=function(){ clearSel(); F.buildInspect(); };
  function reselect(){ if(!F.sels.length) return;
    var secs=deckEl().querySelectorAll('.slide'), out=[];
    F.sels.forEach(function(x){ var sec=secs[x.slideIdx]; if(!sec) return;
      var node=x.kind==='free'?sec.querySelector('[data-free="'+x.id+'"]'):sec.querySelector('[data-el="'+x.key+'"]');
      if(node){ x.node=node; x.section=sec; out.push(x); } });
    F.sels=out; paintSel(); }

  function mountHandles(node){ var sec=node.closest('.slide'); var old=deckEl().querySelector('.forge-handles'); if(old) old.remove();
    var h=el('div','forge-handles forge-chrome'); ['tl','tr','bl','br','rot'].forEach(function(p){ var k=el('div','forge-h '+p); k.dataset.h=p; h.appendChild(k); });
    var nb=node.getBoundingClientRect(), sb=sec.getBoundingClientRect(), s=scale();
    h.style.position='absolute'; h.style.left=((nb.left-sb.left)/s)+'px'; h.style.top=((nb.top-sb.top)/s)+'px';
    h.style.width=(nb.width/s)+'px'; h.style.height=(nb.height/s)+'px'; sec.appendChild(h); }
  function refreshHandles(){ if(F.sels.length===1) mountHandles(F.sels[0].node); }

  /* =====================================================================
     SMART GUIDES + SNAPPING — while dragging: snap to slide center/edges/
     margins and to siblings' edges/centers; 8px grid as fallback; Alt disables.
     All math in slide-space (1280×720, pre-transform).
     ===================================================================== */
  var SNAP=6, GRIDSNAP=8, PADX=88, PADY=70;
  function guideLayer(sec){ var g=sec.querySelector('.forge-guides');
    if(!g){ g=el('div','forge-guides forge-chrome'); sec.appendChild(g); } return g; }
  function clearGuides(){ deckEl().querySelectorAll('.forge-guides').forEach(function(g){ g.remove(); }); }
  function snapCandidates(sec){
    var vs=[0,PADX,640,1280-PADX,1280], hs=[0,PADY,360,720-PADY,720];
    var selNodes=F.sels.map(function(x){return x.node;});
    blocks(sec).concat([].slice.call(sec.querySelectorAll('.forge-free'))).forEach(function(b){
      if(selNodes.indexOf(b)>=0||b.classList.contains('forge-handles')) return;
      var bx=boxOf(b); if(!bx) return;
      vs.push(bx.x, bx.x+bx.w/2, bx.x+bx.w); hs.push(bx.y, bx.y+bx.h/2, bx.y+bx.h); });
    return {v:vs,h:hs}; }
  /* given the prospective box, return {dx,dy,gv,gh}: snap adjustment + guide lines */
  function snapBox(box,cand,noSnap){
    var out={dx:0,dy:0,gv:null,gh:null}; if(noSnap) return out;
    var bestV=null,bestH=null;
    [box.x,box.x+box.w/2,box.x+box.w].forEach(function(e){ cand.v.forEach(function(c){
      var d=c-e; if(Math.abs(d)<=SNAP && (bestV===null||Math.abs(d)<Math.abs(bestV.d))) bestV={d:d,c:c}; }); });
    [box.y,box.y+box.h/2,box.y+box.h].forEach(function(e){ cand.h.forEach(function(c){
      var d=c-e; if(Math.abs(d)<=SNAP && (bestH===null||Math.abs(d)<Math.abs(bestH.d))) bestH={d:d,c:c}; }); });
    if(bestV){ out.dx=bestV.d; out.gv=bestV.c; } else { var gx=Math.round(box.x/GRIDSNAP)*GRIDSNAP; out.dx=gx-box.x; }
    if(bestH){ out.dy=bestH.d; out.gh=bestH.c; } else { var gy=Math.round(box.y/GRIDSNAP)*GRIDSNAP; out.dy=gy-box.y; }
    return out; }
  function drawGuides(sec,gv,gh){ var g=guideLayer(sec); g.innerHTML='';
    if(gv!=null){ var v=el('div','forge-gl v'); v.style.left=gv+'px'; g.appendChild(v); }
    if(gh!=null){ var h=el('div','forge-gl h'); h.style.top=gh+'px'; g.appendChild(h); } }

  /* =====================================================================
     DRAG — move (with snap, multi), resize (corner = width/height with text
     REFLOW; Alt+corner = proportional scale, the v2 behavior), rotate.
     Template blocks resize width only (height stays auto so text rewraps);
     free boxes / copied groups resize both axes.
     ===================================================================== */
  function startDrag(e,mode,corner){ if(!F.sels.length) return; e.preventDefault(); e.stopPropagation();
    var s=scale(), prim=F.sels[0];
    var parts=F.sels.map(function(x){ var d=elData(x); return {sel:x,d:d,d0:clone(d),box0:boxOf(x.node)}; });
    F.pushUndo();
    var nb=prim.node.getBoundingClientRect(); var cx=nb.left+nb.width/2, cy=nb.top+nb.height/2;
    var sx=e.clientX, sy=e.clientY, sec=prim.section, cand=mode==='move'?snapCandidates(sec):null, moved=false;
    var cL=/l/.test(corner||''), cT=/t/.test(corner||'');
    function move(ev){ var dx=(ev.clientX-sx)/s, dy=(ev.clientY-sy)/s; moved=true;
      if(mode==='move'){
        var p0=parts[0], pb={x:p0.box0.x+dx,y:p0.box0.y+dy,w:p0.box0.w,h:p0.box0.h};
        var sn=snapBox(pb,cand,ev.altKey); dx+=sn.dx; dy+=sn.dy; drawGuides(sec,sn.gv,sn.gh);
        parts.forEach(function(p){ p.d.x=Math.round((p.d0.x||0)+dx); p.d.y=Math.round((p.d0.y||0)+dy);
          p.sel.kind==='free'?applyFree(p.sel.node,p.d):applyOverride(p.sel.node,p.d); });
      } else if(mode==='rot'){ var r=Math.round(Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI+90);
        if(!ev.altKey){ var snapR=Math.round(r/15)*15; if(Math.abs(snapR-r)<=4) r=snapR; }
        parts.forEach(function(p){ p.d.rot=r; p.sel.kind==='free'?applyFree(p.sel.node,p.d):applyOverride(p.sel.node,p.d); });
      } else if(mode==='size'){
        parts.forEach(function(p){
          p.d.w=Math.max(40,Math.round(p.box0.w+(cL?-dx:dx)));
          if(cL) p.d.x=Math.round((p.d0.x||0)+dx);
          if(p.sel.kind==='free'&&(p.d.type==='box'||p.d.type==='html')){
            p.d.h=Math.max(30,Math.round(p.box0.h+(cT?-dy:dy)));
            if(cT) p.d.y=Math.round((p.d0.y||0)+dy); }
          p.sel.kind==='free'?applyFree(p.sel.node,p.d):applyOverride(p.sel.node,p.d); });
      } else { var d0=Math.hypot(sx-cx,sy-cy)||1, d1=Math.hypot(ev.clientX-cx,ev.clientY-cy);
        parts.forEach(function(p){ p.d.scale=clamp((p.d0.scale||1)*(d1/d0),0.2,6);
          p.sel.kind==='free'?applyFree(p.sel.node,p.d):applyOverride(p.sel.node,p.d); }); }
      refreshHandles(); syncGeomFields(); positionFloat(); }
    function up(){ D.removeEventListener('pointermove',move); D.removeEventListener('pointerup',up);
      clearGuides(); if(!moved){ F.undo.pop(); F.syncToolbar(); } F.save(); }
    D.addEventListener('pointermove',move); D.addEventListener('pointerup',up); }

  /* =====================================================================
     MARQUEE — drag on empty canvas to select intersecting elements.
     ===================================================================== */
  function startMarquee(e,sec){ var s=scale(), sb=sec.getBoundingClientRect();
    var x0=(e.clientX-sb.left)/s, y0=(e.clientY-sb.top)/s, rect=null, additive=e.shiftKey;
    function move(ev){ var x1=(ev.clientX-sb.left)/s, y1=(ev.clientY-sb.top)/s;
      if(!rect){ if(Math.hypot(x1-x0,y1-y0)<5) return;
        rect=el('div','forge-marquee forge-chrome'); sec.appendChild(rect); }
      var x=Math.min(x0,x1), y=Math.min(y0,y1), w=Math.abs(x1-x0), h=Math.abs(y1-y0);
      rect.style.left=x+'px'; rect.style.top=y+'px'; rect.style.width=w+'px'; rect.style.height=h+'px';
      rect._r={x:x,y:y,w:w,h:h}; }
    function up(ev){ D.removeEventListener('pointermove',move); D.removeEventListener('pointerup',up);
      if(!rect){ if(!additive){ clearSel(); F.buildInspect(); } return; }
      var r=rect._r; rect.remove(); if(!r) return;
      var hits=blocks(sec).concat([].slice.call(sec.querySelectorAll('.forge-free'))).filter(function(b){
        if(b.classList.contains('forge-handles')) return false;
        var bx=boxOf(b); return bx && bx.x<r.x+r.w && bx.x+bx.w>r.x && bx.y<r.y+r.h && bx.y+bx.h>r.y; });
      if(hits.length) selectNodes(hits,additive); else if(!additive){ clearSel(); F.buildInspect(); } }
    D.addEventListener('pointermove',move); D.addEventListener('pointerup',up); }

  /* =====================================================================
     ON-CANVAS WYSIWYG TEXT EDITING — double-click (or right-click → Edit text)
     a leaf text element to edit in place; floating B/✦/<> toolbar formats the
     selection. Serialized back to markers, stored as the element's `html` override.
     ===================================================================== */
  F.editing=null; var fmtBar=null, fmtChips=[];
  function slideIdxOf(node){ var sec=node.closest('.slide'); return [].slice.call(deckEl().querySelectorAll('.slide')).indexOf(sec); }
  function serializeMarks(html){ var tmp=el('div'); tmp.innerHTML=html;
    function walk(n){ var out=''; [].slice.call(n.childNodes).forEach(function(c){
      if(c.nodeType===3){ out+=c.nodeValue; return; } if(c.nodeType!==1) return;
      var tag=c.tagName, inner=walk(c);
      if(tag==='STRONG'||tag==='B') out+='**'+inner+'**';
      else if(tag==='CODE') out+='`'+inner+'`';
      else if(tag==='EM'||(tag==='SPAN'&&c.classList.contains('glow'))) out+='[['+inner+']]';
      else if(tag==='BR') out+='\n'; else out+=inner; }); return out; }
    return walk(tmp).replace(/ /g,' '); }
  function fmtSel(tag,cls){ return cls?tag+'.'+cls:tag; }
  function curFmt(sela){ var s=W.getSelection(); if(!s||!s.rangeCount||!F.editing) return false;
    var a=s.getRangeAt(0).commonAncestorContainer; a=a.nodeType===1?a:a.parentNode;
    var m=a.closest&&a.closest(sela); return !!(m&&F.editing.contains(m)); }
  function applyFmt(tag,cls){ var node=F.editing; if(!node) return; var s=W.getSelection(); if(!s||!s.rangeCount) return;
    var range=s.getRangeAt(0); if(range.collapsed||!node.contains(range.commonAncestorContainer)) return;
    var host=range.commonAncestorContainer; host=host.nodeType===1?host:host.parentNode;
    var existing=host.closest?host.closest(fmtSel(tag,cls)):null;
    if(existing&&node.contains(existing)){ var p=existing.parentNode;
      while(existing.firstChild) p.insertBefore(existing.firstChild,existing); p.removeChild(existing); p.normalize(); }
    else { var w=D.createElement(tag); if(cls) w.className=cls;
      try{ w.appendChild(range.extractContents()); range.insertNode(w);
        s.removeAllRanges(); var r2=D.createRange(); r2.selectNodeContents(w); s.addRange(r2); }catch(e){} } }
  function buildFmtBar(){ fmtBar=el('div','forge-chrome'); fmtBar.id='forge-fmt';
    [['B','strong',''],['✦','span','glow'],['<>','code','']].forEach(function(b){
      var x=el('button'); x.textContent=b[0]; x.title='Toggle '+(b[2]||b[1]);
      x.onmousedown=function(e){ e.preventDefault(); applyFmt(b[1],b[2]); positionFmtBar(); };
      fmtChips.push([x,fmtSel(b[1],b[2])]); fmtBar.appendChild(x); }); D.body.appendChild(fmtBar); }
  function positionFmtBar(){ if(!fmtBar) return; var s=W.getSelection();
    if(!s||!s.rangeCount){ fmtBar.classList.remove('on'); return; }
    var range=s.getRangeAt(0); if(range.collapsed){ fmtBar.classList.remove('on'); return; }
    var r=range.getBoundingClientRect(); fmtBar.classList.add('on');
    var bw=fmtBar.offsetWidth||104, bh=fmtBar.offsetHeight||34;
    var left=Math.min(Math.max(8,r.left+r.width/2-bw/2), W.innerWidth-bw-8), top=r.top-bh-8; if(top<8) top=r.bottom+8;
    fmtBar.style.left=left+'px'; fmtBar.style.top=top+'px';
    fmtChips.forEach(function(c){ c[0].classList.toggle('on',curFmt(c[1])); }); }
  function onEditSel(){ positionFmtBar(); }
  function onEditKey(e){ if(e.key==='Escape'){ e.preventDefault(); cancelEdit(); } else if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); endEdit(); } }
  /* editable leaf: anything data-bound (deterministic write-back), or a keyed
     element with no keyed descendants (raw/derived text -> html override). */
  function isLeafText(node){ if(!node||node.hasAttribute('data-free')) return false;
    if(node.hasAttribute('data-bind')) return true;
    return node.hasAttribute('data-el') && !node.querySelector('[data-el]')
      && (node.textContent||'').trim().length>0; }
  function startEdit(node){ if(F.editing===node) return; if(F.editing) endEdit();
    clearSel(); F.buildInspect(); F.editing=node; F._editOrig=node.innerHTML;
    node.setAttribute('contenteditable','true'); node.focus();
    if(!fmtBar) buildFmtBar();
    node.addEventListener('keyup',onEditSel); node.addEventListener('mouseup',onEditSel); node.addEventListener('keydown',onEditKey);
    node.addEventListener('blur',endEdit,{once:true}); setTimeout(positionFmtBar,0); }
  function teardownEdit(node){ F.editing=null;
    node.removeEventListener('keyup',onEditSel); node.removeEventListener('mouseup',onEditSel); node.removeEventListener('keydown',onEditKey);
    node.removeEventListener('blur',endEdit);
    node.removeAttribute('contenteditable'); if(fmtBar) fmtBar.classList.remove('on'); }
  function cancelEdit(){ var node=F.editing; if(!node) return; teardownEdit(node); node.innerHTML=F._editOrig; }
  function endEdit(){ var node=F.editing; if(!node) return; teardownEdit(node);
    if(node.innerHTML===F._editOrig) return;                       /* no change: no-op */
    var markers=serializeMarks(node.innerHTML);
    var i=slideIdxOf(node), key=node.getAttribute('data-el'), bind=node.getAttribute('data-bind');
    if(i<0||!key) return;
    F.do('edit text',function(data){ var s=data.slides[i];
      /* data-bind names the exact content field this leaf renders — write back
         deterministically. Unbound leaves (raw slides, derived text like item
         numbers) store an html override instead (reversible via Reset). */
      if(bind){ SG.setPath(s.content=s.content||{},bind,markers);
        if(s.overrides&&s.overrides[key]&&s.overrides[key].html!=null){   /* clear stale shadow */
          delete s.overrides[key].html;
          if(!Object.keys(s.overrides[key]).length) delete s.overrides[key]; } }
      else { s.overrides=s.overrides||{}; (s.overrides[key]=s.overrides[key]||{}).html=markers; } }); }
  F.endEdit=endEdit;

  /* =====================================================================
     CLIPBOARD — copy/paste/duplicate. Free objects copy losslessly; template
     elements land as free objects carrying their text + computed style.
     ===================================================================== */
  F.clipboard=null;
  function specFromSel(x){ var d=elData(x)||{}, box=boxOf(x.node);
    if(x.kind==='free'){ var c=clone(d); delete c.id; return c; }
    var cs=W.getComputedStyle(x.node);
    if(isLeafText(x.node))
      return {type:'txt', text:serializeMarks(x.node.innerHTML), x:Math.round(box.x), y:Math.round(box.y),
        size:Math.round(parseFloat(cs.fontSize)||34), color:d.color||cs.color, font:d.font||cs.fontFamily,
        rot:d.rot||0, anim:d.anim||'', animDelay:d.animDelay||0};
    /* deep copy: carry the container's full markup (nested items included) */
    var cl=x.node.cloneNode(true);
    [].slice.call(cl.querySelectorAll('.forge-handles,.forge-guides,.forge-marquee,.forge-free')).forEach(function(n){ n.remove(); });
    [].slice.call(cl.querySelectorAll('[data-el]')).forEach(function(n){
      n.removeAttribute('data-el'); n.removeAttribute('data-bind'); n.removeAttribute('data-arr');
      n.classList.remove('forge-block','forge-sel','forge-sel-multi'); });
    cl.removeAttribute('data-el'); cl.removeAttribute('data-bind'); cl.removeAttribute('data-arr'); cl.removeAttribute('data-free');
    cl.classList.remove('forge-block','forge-sel','forge-sel-multi','forge-free');
    cl.style.transform=''; cl.style.zIndex='';
    var spec={type:'html', html:cl.outerHTML, x:Math.round(box.x), y:Math.round(box.y),
      w:Math.round(box.w), h:Math.round(box.h), rot:d.rot||0};
    ['color','font','anim','animDelay','animTrigger','animStep','z'].forEach(function(k){ if(d[k]!=null) spec[k]=d[k]; });
    if(d.theme) spec.theme=clone(d.theme);
    return spec; }
  F.copySel=function(){ if(!F.sels.length) return; F.clipboard=F.sels.map(specFromSel); };
  F.paste=function(){ if(!F.clipboard||!F.clipboard.length) return; var i=curSlide();
    F._pasteN=(F._pasteN||0)+1; var off=16*F._pasteN, specs=clone(F.clipboard), ids=[];
    F.do('paste',function(data){ var s=data.slides[i]; s.freeObjects=s.freeObjects||[];
      specs.forEach(function(sp){ sp.id=uid(); sp.x=(sp.x||0)+off; sp.y=(sp.y||0)+off; ids.push(sp.id); s.freeObjects.push(sp); }); });
    var sec=deckEl().querySelectorAll('.slide')[i], nodes=[];
    ids.forEach(function(id){ var n=sec&&sec.querySelector('[data-free="'+id+'"]'); if(n) nodes.push(n); });
    if(nodes.length) selectNodes(nodes,false); };
  /* Duplicate prefers FIDELITY: a nested layout item clones its content entry
     in place (identical element, identical behavior); anything else becomes a
     free copy that carries the full markup + style properties. */
  F.dupSel=function(){ if(!F.sels.length) return;
    if(F.sels.length===1){ var x=F.sel, it=x.kind!=='free'?itemOf(x.key):null;
      if(it&&x.key===it.path+'.'+it.idx&&F.dupItem(x.slideIdx,x.node)) return; }
    F.copySel(); F._pasteN=0; F.paste(); };

  /* detach a template text element to a free object at the same position/size/
     style; the original is hidden via overrides[key].hide (reset to restore). */
  F.detachSel=function(){ var x=F.sel; if(!x||x.kind==='free'||!isLeafText(x.node)) return;
    var spec=specFromSel(x), i=x.slideIdx, key=x.key, id=uid(); spec.id=id; clearSel();
    F.do('detach',function(data){ var s=data.slides[i]; s.freeObjects=s.freeObjects||[]; s.freeObjects.push(spec);
      s.overrides=s.overrides||{}; (s.overrides[key]=s.overrides[key]||{}).hide=1; });
    var sec=deckEl().querySelectorAll('.slide')[i], n=sec&&sec.querySelector('[data-free="'+id+'"]');
    if(n) selectNode(n,false); };

  /* =====================================================================
     CONTAINER <-> CONTENT-ARRAY MAPPING (v3) — containers carry data-arr (the
     content path of the array they render) and items carry index-bearing keys
     ("stats.2", "left.items.0"), so item ops are exact: no length-matching
     inference, and interleaved DOM (pipeline connectors) can't defeat them.
     Item ops REMAP sibling override keys so styling follows the list edit.
     ===================================================================== */
  /* deepest {path,idx} an element key encodes: 'left.items.2.title' ->
     {path:'left.items', idx:2}; keys with no numeric segment -> null */
  function itemOf(key){ var seg=String(key||'').split('.');
    for(var e=seg.length;e>0;e--){ if(/^\d+$/.test(seg[e-1]))
      return {path:seg.slice(0,e-1).join('.'),idx:+seg[e-1]}; }
    return null; }
  function contentArr(slideIdx,path){ var s=SG.data.slides[slideIdx]; if(!s||!path) return null;
    var a=SG.getPath(s.content||{},path); return Array.isArray(a)?a:null; }
  /* shift override keys under `path` after an item insert (+1 at idx) or
     removal (-1 at idx: the removed item's overrides go with it) */
  function remapItemOverrides(s,path,idx,delta){ if(!s.overrides) return;
    var pre=path+'.', out={};
    Object.keys(s.overrides).forEach(function(k){
      if(k.indexOf(pre)!==0){ out[k]=s.overrides[k]; return; }
      var seg=k.slice(pre.length).split('.'), n=parseInt(seg[0],10);
      if(isNaN(n)){ out[k]=s.overrides[k]; return; }
      if(delta<0){ if(n===idx) return; if(n>idx) seg[0]=String(n-1); }
      else if(n>=idx) seg[0]=String(n+1);
      out[pre+seg.join('.')]=s.overrides[k]; });
    s.overrides=out; }
  /* copy one item's overrides to another index (duplicate keeps its styling) */
  function copyItemOverrides(s,path,from,to){ if(!s.overrides) return;
    var a=path+'.'+from, out={};
    Object.keys(s.overrides).forEach(function(k){
      if(k===a||k.indexOf(a+'.')===0) out[path+'.'+to+k.slice(a.length)]=clone(s.overrides[k]); });
    Object.keys(out).forEach(function(k){ s.overrides[k]=out[k]; }); }
  function swapItemOverrides(s,path,a,b){ if(!s.overrides) return;
    var pa=path+'.'+a, pb=path+'.'+b, out={};
    Object.keys(s.overrides).forEach(function(k){
      if(k===pa||k.indexOf(pa+'.')===0) out[pb+k.slice(pa.length)]=s.overrides[k];
      else if(k===pb||k.indexOf(pb+'.')===0) out[pa+k.slice(pb.length)]=s.overrides[k];
      else out[k]=s.overrides[k]; });
    s.overrides=out; }
  F.addItem=function(slideIdx,containerNode){
    var path=containerNode.getAttribute&&containerNode.getAttribute('data-arr');
    var a=contentArr(slideIdx,path); if(!a) return false;
    F.do('add item',function(data){ var arr2=SG.getPath(data.slides[slideIdx].content,path);
      arr2.push(arr2.length?newItemLike(arr2[arr2.length-1]):{title:''}); }); return true; };
  F.dupItem=function(slideIdx,node){
    var it=itemOf(node.getAttribute('data-el')); if(!it) return false;
    if(!contentArr(slideIdx,it.path)) return false;
    F.do('duplicate item',function(data){ var s=data.slides[slideIdx];
      var arr2=SG.getPath(s.content,it.path); arr2.splice(it.idx+1,0,clone(arr2[it.idx]));
      remapItemOverrides(s,it.path,it.idx+1,+1);
      copyItemOverrides(s,it.path,it.idx,it.idx+1); }); return true; };
  F.removeItem=function(slideIdx,node){
    var it=itemOf(node.getAttribute('data-el')); if(!it) return false;
    if(!contentArr(slideIdx,it.path)) return false;
    clearSel();
    F.do('remove item',function(data){ var s=data.slides[slideIdx];
      SG.getPath(s.content,it.path).splice(it.idx,1);
      remapItemOverrides(s,it.path,it.idx,-1); }); return true; };

  /* =====================================================================
     ALIGN & DISTRIBUTE — multi-select verbs, slide-space math.
     ===================================================================== */
  function shiftSel(x,dx,dy){ var d=elData(x); d.x=Math.round((d.x||0)+dx); d.y=Math.round((d.y||0)+dy);
    x.kind==='free'?applyFree(x.node,d):applyOverride(x.node,d); }
  F.align=function(how){ if(F.sels.length<2) return; F.pushUndo();
    var boxes=F.sels.map(function(x){ return {sel:x,b:boxOf(x.node)}; });
    var minX=Math.min.apply(0,boxes.map(function(p){return p.b.x;})), maxX=Math.max.apply(0,boxes.map(function(p){return p.b.x+p.b.w;}));
    var minY=Math.min.apply(0,boxes.map(function(p){return p.b.y;})), maxY=Math.max.apply(0,boxes.map(function(p){return p.b.y+p.b.h;}));
    boxes.forEach(function(p){ var b=p.b, dx=0, dy=0;
      if(how==='left') dx=minX-b.x; else if(how==='right') dx=maxX-(b.x+b.w);
      else if(how==='hcenter') dx=(minX+maxX)/2-(b.x+b.w/2);
      else if(how==='top') dy=minY-b.y; else if(how==='bottom') dy=maxY-(b.y+b.h);
      else if(how==='vcenter') dy=(minY+maxY)/2-(b.y+b.h/2);
      shiftSel(p.sel,dx,dy); });
    refreshHandles(); positionFloat(); F.save(); };
  F.distribute=function(axis){ if(F.sels.length<3) return; F.pushUndo();
    var boxes=F.sels.map(function(x){ return {sel:x,b:boxOf(x.node)}; });
    var horiz=axis==='h';
    boxes.sort(function(a,b){ return horiz?(a.b.x-b.b.x):(a.b.y-b.b.y); });
    var first=boxes[0], last=boxes[boxes.length-1];
    var span=horiz?((last.b.x+last.b.w)-first.b.x):((last.b.y+last.b.h)-first.b.y);
    var total=boxes.reduce(function(t,p){ return t+(horiz?p.b.w:p.b.h); },0);
    var gap=(span-total)/(boxes.length-1), pos=horiz?first.b.x:first.b.y;
    boxes.forEach(function(p){ var cur=horiz?p.b.x:p.b.y, d=pos-cur;
      shiftSel(p.sel, horiz?d:0, horiz?0:d); pos+=(horiz?p.b.w:p.b.h)+gap; });
    refreshHandles(); positionFloat(); F.save(); };
  F.zNudge=function(dir){ if(!F.sels.length) return; F.pushUndo();
    F.sels.forEach(function(x){ var d=elData(x); d.z=(d.z||(x.kind==='free'?3:2))+dir;
      x.kind==='free'?applyFree(x.node,d):applyOverride(x.node,d); }); F.save(); };
  F.deleteSel=function(){ if(!F.sels.length) return; var sels=F.sels.slice();
    /* plan first, then mutate in one undo step. An element whose key encodes an
       item slot ("stats.2") deletes that ITEM; other blocks reset overrides. */
    var acts=sels.map(function(x){
      if(x.kind==='free') return {t:'free',i:x.slideIdx,id:x.id};
      var it=x.slideIdx!=null?itemOf(x.key):null;
      if(it&&x.key!==null&&/^\S+$/.test(x.key)&&contentArr(x.slideIdx,it.path)
        &&x.key===it.path+'.'+it.idx)                      /* the item itself, not a leaf inside it */
        return {t:'item',i:x.slideIdx,path:it.path,idx:it.idx};
      return {t:'reset',i:x.slideIdx,key:x.key}; });
    clearSel();
    F.do('delete',function(data){
      /* group item removals per slide+array, delete high->low with remap */
      acts.filter(function(a){ return a.t==='item'; })
        .sort(function(a,b){ return b.idx-a.idx; })
        .forEach(function(a){ var s=data.slides[a.i];
          SG.getPath(s.content,a.path).splice(a.idx,1);
          remapItemOverrides(s,a.path,a.idx,-1); });
      acts.forEach(function(a){ var s=data.slides[a.i];
        if(a.t==='free'&&s) s.freeObjects=(s.freeObjects||[]).filter(function(f){ return f.id!==a.id; });
        else if(a.t==='reset'&&s&&s.overrides) delete s.overrides[a.key]; }); }); };

  /* =====================================================================
     FLOATING CONTEXTUAL TOOLBAR — appears over the selection.
     Single: color, font, replay, z-order, duplicate, delete/reset.
     Multi: align/distribute + duplicate/delete.
     ===================================================================== */
  var floatBar=null;
  function fbtn(label,title,fn,cls){ var b=el('button',cls||null,label); b.title=title; b.setAttribute('aria-label',title);
    b.onmousedown=function(e){ e.preventDefault(); e.stopPropagation(); }; b.onclick=function(e){ e.stopPropagation(); fn(); }; return b; }
  function buildFloat(){ if(!floatBar){ floatBar=el('div','forge-chrome'); floatBar.id='forge-float'; D.body.appendChild(floatBar); }
    floatBar.innerHTML=''; if(!F.sels.length||F.editing){ floatBar.classList.remove('on'); return; }
    var multi=F.sels.length>1, prim=F.sels[0];
    if(multi){
      floatBar.appendChild(fbtn('⇤','Align left',function(){ F.align('left'); }));
      floatBar.appendChild(fbtn('⇹','Align horizontal centers',function(){ F.align('hcenter'); }));
      floatBar.appendChild(fbtn('⇥','Align right',function(){ F.align('right'); }));
      floatBar.appendChild(fbtn('⤒','Align top',function(){ F.align('top'); }));
      floatBar.appendChild(fbtn('⇳','Align vertical centers',function(){ F.align('vcenter'); }));
      floatBar.appendChild(fbtn('⤓','Align bottom',function(){ F.align('bottom'); }));
      if(F.sels.length>2){ floatBar.appendChild(el('span','forge-fsep'));
        floatBar.appendChild(fbtn('↔','Distribute horizontally',function(){ F.distribute('h'); }));
        floatBar.appendChild(fbtn('↕','Distribute vertically',function(){ F.distribute('v'); })); }
      floatBar.appendChild(el('span','forge-fsep'));
      var grouped=F.sels.every(function(x){ var d=peekData(x); return d&&d.group; });
      floatBar.appendChild(fbtn(grouped?'⛓‍✂':'⛓',grouped?'Ungroup (Ctrl+Shift+G)':'Group (Ctrl+G)',function(){ grouped?F.ungroupSel():F.groupSel(); buildFloat(); }));
      floatBar.appendChild(el('span','forge-fsep'));
    } else {
      var d=elData(prim)||{};
      var col=el('input'); col.type='color'; col.title='Text color';
      col.value=/^#/.test(d.color||'')?String(d.color).slice(0,7):'#ffffff';
      col.oninput=function(){ F.pushUndoCoalesced('float-color'); var dd=elData(prim); dd.color=col.value;
        prim.kind==='free'?applyFree(prim.node,dd):applyOverride(prim.node,dd); pulse(prim.node); F.saveDebounced(); };
      col.onmousedown=function(e){ e.stopPropagation(); };
      floatBar.appendChild(col);
      if(isLeafText(prim.node)) floatBar.appendChild(fbtn('✎','Edit text (double-click)',function(){ startEdit(prim.node); buildFloat(); }));
      if(d.anim&&ANIM_ENTRANCE[d.anim]) floatBar.appendChild(fbtn('▶','Replay animation',function(){ replayAnim(prim.node); }));
      floatBar.appendChild(el('span','forge-fsep'));
    }
    floatBar.appendChild(fbtn('▲','Bring forward',function(){ F.zNudge(1); }));
    floatBar.appendChild(fbtn('▼','Send back',function(){ F.zNudge(-1); }));
    floatBar.appendChild(el('span','forge-fsep'));
    floatBar.appendChild(fbtn('⧉','Duplicate (Ctrl+D)',function(){ F.dupSel(); }));
    floatBar.appendChild(fbtn('✕',F.sels.some(function(x){return x.kind==='free';})?'Delete':'Reset element',function(){ F.deleteSel(); },'warn'));
    floatBar.classList.add('on'); positionFloat(); }
  function positionFloat(){ if(!floatBar||!floatBar.classList.contains('on')) return;
    if(!F.sels.length){ floatBar.classList.remove('on'); return; }
    var l=1e9,t=1e9,r=-1e9;
    F.sels.forEach(function(x){ var b=x.node.getBoundingClientRect(); l=Math.min(l,b.left); t=Math.min(t,b.top); r=Math.max(r,b.right); });
    var bw=floatBar.offsetWidth||200, bh=floatBar.offsetHeight||36;
    var left=clamp((l+r)/2-bw/2, 8, W.innerWidth-bw-8), top=t-bh-10; if(top<44) top=t+10;
    floatBar.style.left=left+'px'; floatBar.style.top=top+'px'; }

  /* =====================================================================
     RIGHT-CLICK CONTEXT MENU
     ===================================================================== */
  var ctxMenu=null;
  function buildCtxMenu(){ ctxMenu=el('div','forge-chrome'); ctxMenu.id='forge-ctx'; D.body.appendChild(ctxMenu); }
  function hideCtxMenu(){ if(ctxMenu) ctxMenu.classList.remove('on'); }
  F.hideCtxMenu=hideCtxMenu;
  function ctxItem(label,cls,fn){ var b=el('button',cls||null,label); b.onclick=function(){ hideCtxMenu(); fn(); }; return b; }
  function showCtxMenu(x,y,node){ if(!ctxMenu) buildCtxMenu(); ctxMenu.innerHTML='';
    var isFree=node.hasAttribute('data-free');
    if(!isSelected(node)) selectNode(node,false);
    if(isLeafText(node)) ctxMenu.appendChild(ctxItem('✎ Edit text',null,function(){ startEdit(node); }));
    if(!isFree){ var si=slideIdxOf(node), it=itemOf(node.getAttribute('data-el'));
      if(it&&contentArr(si,it.path)){
        ctxMenu.appendChild(ctxItem('⧉ Duplicate item (in layout)',null,function(){ F.dupItem(si,node); }));
        ctxMenu.appendChild(ctxItem('✕ Remove item','warn',function(){ F.removeItem(si,node); })); }
      if(node.getAttribute('data-arr'))
        ctxMenu.appendChild(ctxItem('＋ Add item',null,function(){ F.addItem(si,node); })); }
    if(!isFree&&isLeafText(node)) ctxMenu.appendChild(ctxItem('⇱ Detach to free text',null,function(){ F.detachSel(); }));
    ctxMenu.appendChild(ctxItem(isFree?'⧉ Duplicate':'⧉ Duplicate as free copy (deep)',null,function(){ F.dupSel(); }));
    ctxMenu.appendChild(ctxItem('⿻ Copy',null,function(){ F.copySel(); }));
    if(F.clipboard) ctxMenu.appendChild(ctxItem('⿹ Paste',null,function(){ F._pasteN=0; F.paste(); }));
    ctxMenu.appendChild(el('div','forge-ctx-sep'));
    ctxMenu.appendChild(ctxItem('▲ Bring forward',null,function(){ F.zNudge(1); }));
    ctxMenu.appendChild(ctxItem('▼ Send back',null,function(){ F.zNudge(-1); }));
    ctxMenu.appendChild(el('div','forge-ctx-sep'));
    ctxMenu.appendChild(ctxItem(isFree?'🗑 Delete object':'↺ Reset element','warn',function(){ F.deleteSel(); }));
    ctxMenu.classList.add('on');
    var mw=ctxMenu.offsetWidth||156, mh=ctxMenu.offsetHeight||100;
    ctxMenu.style.left=Math.min(x, W.innerWidth-mw-8)+'px';
    ctxMenu.style.top=Math.min(y, W.innerHeight-mh-8)+'px'; }

  /* =====================================================================
     CANVAS WIRING
     ===================================================================== */
  function wireDeck(){ var deck=deckEl();
    deck.addEventListener('pointerdown',function(e){ if(!editing()) return;
      if(e.button!==0) return;
      if(F.editing){ if(F.editing.contains(e.target)) return; endEdit(); return; }
      var hnd=e.target.closest('.forge-h'); if(hnd){
        startDrag(e, hnd.dataset.h==='rot'?'rot':(e.altKey?'scale':'size'), hnd.dataset.h); return; }
      if(e.altKey){ var deep=e.target.closest('[data-el]'); if(deep){ e.preventDefault(); selectNode(deep,e.shiftKey); return; } }
      var blk=e.target.closest('.forge-block');
      if(blk){ if(e.shiftKey){ selectNode(blk,true); return; }
        if(!isSelected(blk)) selectNode(blk,false); startDrag(e,'move'); return; }
      var sec=e.target.closest('.slide'); if(sec){ startMarquee(e,sec); return; }
      clearSel(); F.buildInspect(); },true);
    /* double-click a leaf text element → edit in place (primary path) */
    deck.addEventListener('dblclick',function(e){ if(!editing()||F.editing) return;
      var node=e.target.closest('[data-el]');           /* deepest keyed ancestor of the hit */
      if(node&&isLeafText(node)){ e.preventDefault(); startEdit(node); } },true);
    deck.addEventListener('contextmenu',function(e){ if(!editing()) return;
      if(F.editing && F.editing.contains(e.target)) return;
      var node=e.target.closest('[data-el],[data-free]'); if(!node) return;
      e.preventDefault(); if(F.editing) endEdit();
      showCtxMenu(e.clientX, e.clientY, node); },true);
    deck.addEventListener('click',function(e){ if(editing()){ e.stopImmediatePropagation(); e.stopPropagation(); } },true);
    D.addEventListener('pointerdown',function(e){ if(ctxMenu && ctxMenu.classList.contains('on') && !ctxMenu.contains(e.target)) hideCtxMenu(); },true);
    W.addEventListener('scroll',function(){ hideCtxMenu(); if(F.editing) positionFmtBar(); positionFloat(); },true);
    W.addEventListener('resize',function(){ refreshHandles(); positionFloat(); });
  }

  /* =====================================================================
     KEYBOARD — capture-phase so edit-mode keys never reach deck navigation.
     ===================================================================== */
  function wireKeys(){ W.addEventListener('keydown',function(e){
    if(!editing()) return;
    if(F.editing) return;                                   /* contenteditable handles its own keys */
    var tag=(e.target.tagName||'').toLowerCase();
    var inField=/^(input|textarea|select)$/.test(tag);
    var mod=e.metaKey||e.ctrlKey;
    if(mod&&(e.key==='z'||e.key==='Z')){ if(inField) return; e.preventDefault(); e.stopPropagation(); e.shiftKey?F.redoOp():F.undoOp(); return; }
    if(mod&&(e.key==='y'||e.key==='Y')){ if(inField) return; e.preventDefault(); e.stopPropagation(); F.redoOp(); return; }
    if(mod&&(e.key==='s'||e.key==='S')){ e.preventDefault(); e.stopPropagation(); F.download(); return; }
    if(inField) return;
    if(mod&&(e.key==='c'||e.key==='C')){ if(F.sels.length){ e.preventDefault(); e.stopPropagation(); F.copySel(); F._pasteN=0; } return; }
    if(mod&&(e.key==='v'||e.key==='V')){ if(F.clipboard){ e.preventDefault(); e.stopPropagation(); F.paste(); } return; }
    if(mod&&(e.key==='d'||e.key==='D')){ if(F.sels.length){ e.preventDefault(); e.stopPropagation(); F.dupSel(); } return; }
    if(mod&&(e.key==='g'||e.key==='G')){ e.preventDefault(); e.stopPropagation(); e.shiftKey?F.ungroupSel():F.groupSel(); return; }
    if(e.key==='?'){ e.preventDefault(); e.stopPropagation(); F.showKeys(); return; }
    if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); hideCtxMenu(); clearSel(); F.buildInspect(); return; }
    if((e.key==='Delete'||e.key==='Backspace')&&F.sels.length){ e.preventDefault(); e.stopPropagation(); F.deleteSel(); return; }
    if(/^Arrow/.test(e.key)){ e.preventDefault(); e.stopPropagation();
      if(F.sels.length){                                   /* nudge selection (Shift = 10px) */
        var step=e.shiftKey?10:1, dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0, dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
        F.pushUndoCoalesced('nudge');
        F.sels.forEach(function(x){ shiftSel(x,dx,dy); }); refreshHandles(); syncGeomFields(); positionFloat(); F.saveDebounced();
      } else {                                             /* no selection: navigate slides */
        var dir=(e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1;
        SG.show&&SG.show(curSlide()+dir); F.buildNav(); F.buildInspect(); }
      return; }
  },true); }

  /* =====================================================================
     UI SCAFFOLDING — launcher, toolbar, panels, restore bar.
     ===================================================================== */
  F.buildChrome=function(){
    var launch=el('button','forge-chrome','✎ Edit'); launch.id='forge-launch'; launch.onclick=F.toggle; D.body.appendChild(launch);
    F._launch=launch;
    var bar=el('div','forge-chrome'); bar.id='forge-bar'; bar.innerHTML='<span class="forge-title"></span>';
    function btn(label,fn,cls){ var b=el('button','forge-btn '+(cls||''),label); b.onclick=fn; bar.appendChild(b); return b; }
    F._undoBtn=btn('↶ Undo',F.undoOp); F._redoBtn=btn('↷ Redo',F.redoOp); bar.appendChild(el('span','forge-sep'));
    F._addBtn=btn('＋ Slide',function(e){ F.insertMenu(F._addBtn); }); btn('⧉ Duplicate',function(){ F.dupSlide(); });
    btn('＋ Text',function(){ F.addFree('txt'); }); btn('＋ Box',function(){ F.addFree('box'); }); bar.appendChild(el('span','forge-sep'));
    btn('▷ Present',function(){ F.toggle(); SG.present&&SG.present(); });
    F._saveBtn=btn('⤓ Save .html',function(){ F.download(); },'primary'); btn('{ } JSON',function(){ SG.exportJSON&&SG.exportJSON(); });
    D.body.appendChild(bar);
    var nav=el('div','forge-chrome forge-panel'); nav.id='forge-nav'; nav.setAttribute('role','region'); nav.setAttribute('aria-label','Slides'); nav.innerHTML='<h4>Slides <button id="forge-sorter-toggle" class="forge-chip" title="Toggle sorter (thumbnails)">\u25a6</button></h4><div id="forge-navlist"></div>'; D.body.appendChild(nav);
    nav.querySelector('#forge-sorter-toggle').onclick=function(){ F._sorter=!F._sorter; this.classList.toggle('add',F._sorter); F.buildNav(); };
    var insp=el('div','forge-chrome forge-panel'); insp.id='forge-inspect'; insp.setAttribute('role','region'); insp.setAttribute('aria-label','Inspector'); insp.innerHTML='<h4>Inspector</h4><div id="forge-inspbody"></div>'; D.body.appendChild(insp);
    var rb=el('div','forge-chrome'); rb.id='forge-restore'; D.body.appendChild(rb);
    F.syncToolbar();
  };

  F.buildNav=function(){ var list=D.getElementById('forge-navlist'); if(!list) return; var cur=curSlide(); list.innerHTML='';
    if(F._sorter){ buildSorter(list,cur); return; }
    list.className='';
    (SG.data.slides||[]).forEach(function(s,i){ var t=(s.content&&(s.content.title||s.content.statement||s.content.quote))||s.layout;
      var row=el('div','forge-srow'+(i===cur?' cur':''));
      row.innerHTML='<span class="si">'+(i+1)+'</span><span class="sl">'+String(t).replace(/[<>&]/g,'').slice(0,22)+'</span><span class="st">'+s.layout+'</span>';
      row.appendChild(rowTools(i));
      row.onclick=function(){ location.hash='#'+(i+1); clearSel(); F.buildNav(); F.buildInspect(); }; list.appendChild(row); }); };
  function rowTools(i){ var tools=el('span','tools');
    function tbtn(lab,title,fn){ var b=el('button',null,lab); b.title=title; b.setAttribute('aria-label',title);
      b.onclick=function(e){ e.stopPropagation(); fn(); }; tools.appendChild(b); }
    tbtn('\u2191','Move up',function(){ F.moveSlide(i,-1); });
    tbtn('\u2193','Move down',function(){ F.moveSlide(i,1); });
    tbtn('\u29c9','Duplicate',function(){ F.dupSlide(i); });
    tbtn('\u2715','Delete',function(){ F.delSlide(i); });
    return tools; }
  /* SORTER — live-rendered thumbnails, drag to reorder */
  function buildSorter(list,cur){ list.className='forge-thumbgrid';
    var secs=deckEl().querySelectorAll('.slide');
    (SG.data.slides||[]).forEach(function(s,i){
      var th=el('div','forge-thumb'+(i===cur?' cur':'')); th.draggable=true; th.dataset.i=i;
      var frame=el('div','forge-thumb-frame');
      if(secs[i]){ var cl=secs[i].cloneNode(true); cl.classList.add('active');
        [].slice.call(cl.querySelectorAll('.forge-handles,.forge-guides,.forge-marquee,.doc-panel')).forEach(function(n){ n.remove(); });
        cl.removeAttribute('data-i'); frame.appendChild(cl);
        if(SG.finalizeAnimations) SG.finalizeAnimations(frame); }
      th.appendChild(frame);
      var cap=el('div','forge-thumb-cap','<span>'+(i+1)+' \u00b7 '+s.layout+'</span>');
      cap.appendChild(rowTools(i)); th.appendChild(cap);
      th.onclick=function(){ location.hash='#'+(i+1); clearSel(); F.buildNav(); F.buildInspect(); };
      th.ondragstart=function(e){ e.dataTransfer.setData('text/plain',String(i)); e.dataTransfer.effectAllowed='move'; th.classList.add('dragging'); };
      th.ondragend=function(){ th.classList.remove('dragging'); [].slice.call(list.querySelectorAll('.forge-thumb.over')).forEach(function(n){ n.classList.remove('over'); }); };
      th.ondragover=function(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; th.classList.add('over'); };
      th.ondragleave=function(){ th.classList.remove('over'); };
      th.ondrop=function(e){ e.preventDefault(); th.classList.remove('over');
        var from=parseInt(e.dataTransfer.getData('text/plain'),10), to=i;
        if(isNaN(from)||from===to) return; F.moveSlideTo(from,to); };
      list.appendChild(th); }); }
  F.moveSlideTo=function(from,to){
    F.do('reorder slides',function(data){ var s=data.slides.splice(from,1)[0]; data.slides.splice(to,0,s); });
    location.hash='#'+(to+1); F.buildNav(); F.buildInspect(); };

  /* ---- field widgets ---- */
  function field(label,inputEl){ var f=el('div','forge-field'); f.appendChild(el('label',null,label)); f.appendChild(inputEl); return f; }
  function fieldRow(label,inputEl){ var f=field(label,inputEl); f.className='forge-field row'; return f; }
  function colorInput(val,on){ var n=el('input'); n.type='color'; n.value=/^#/.test(val||'')?String(val).slice(0,7):'#888888'; n.oninput=function(){ on(n.value); }; return n; }
  function selectInput(opts,val,on){ var s=el('select'); opts.forEach(function(o){ var v=Array.isArray(o)?o[1]:o, lab=Array.isArray(o)?o[0]:o; var op=el('option',null,lab); op.value=v; if(v===val)op.selected=true; s.appendChild(op); }); s.onchange=function(){ on(s.value); }; return s; }
  function boundText(obj,key,multiline){ var n=el(multiline?'textarea':'input'); if(!multiline) n.type='text';
    n.className='wide'; n.value=obj[key]==null?'':obj[key]; if(multiline) n.rows=Math.min(8,Math.max(2,String(obj[key]||'').split('\n').length));
    n.onfocus=function(){ F.pushUndo(); }; n.oninput=function(){ obj[key]=n.value; F.renderLiveSlide(); }; return n; }
  function boundNum(obj,key){ var n=el('input'); n.type='number'; n.value=obj[key]==null?'':obj[key];
    n.onfocus=function(){ F.pushUndo(); }; n.oninput=function(){ var v=parseFloat(n.value); obj[key]=isNaN(v)?0:v; F.renderLiveSlide(); }; return n; }
  function boundCheck(obj,key){ var n=el('input'); n.type='checkbox'; n.checked=!!obj[key];
    n.onchange=function(){ F.pushUndo(); obj[key]=n.checked; F.renderLiveSlide(); }; return n; }

  /* generic content form: reflects slides[i].content — plain fields, nested
     objects, and arrays as reorderable cards with add/remove. */
  function contentForm(host,obj,slideIdx,path){
    Object.keys(obj).forEach(function(k){ var v=obj[k];
      if(Array.isArray(v)) arrayEditor(host,obj,k,slideIdx,(path||'')+k);
      else if(v!==null&&typeof v==='object'){ var grp=el('div','forge-card');
        grp.appendChild(el('div','forge-card-h','<span>'+pretty(k)+'</span>'));
        contentForm(grp,v,slideIdx,(path||'')+k+'.'); host.appendChild(grp); }
      else if(typeof v==='boolean') host.appendChild(fieldRow(pretty(k),boundCheck(obj,k)));
      else if(typeof v==='number') host.appendChild(field(pretty(k),boundNum(obj,k)));
      else host.appendChild(field(pretty(k),boundText(obj,k, k==='code'||k==='html'||k==='body'&&String(v).length>80||String(v).length>70||/\n/.test(String(v)) )));
    }); }
  function newItemLike(item){ if(typeof item==='string') return '';
    if(typeof item==='number') return 0;
    if(item&&typeof item==='object'){ var o={}; Object.keys(item).forEach(function(k){
      var v=item[k]; o[k]=typeof v==='number'?0:typeof v==='boolean'?false:Array.isArray(v)?[]:(v&&typeof v==='object')?newItemLike(v):''; }); return o; }
    return ''; }
  function arrayEditor(host,obj,k,slideIdx,apath){ var wrap=el('div','forge-arr');
    function slideOf(data){ return data.slides[slideIdx]; }
    var head=el('div','forge-arr-h','<span>'+pretty(k)+'</span>'); var addB=el('button','forge-chip add','＋');
    addB.title='Add item'; addB.onclick=function(){ F.do('add item',function(){ var arr=obj[k];
      arr.push(arr.length?newItemLike(arr[arr.length-1]):{title:''}); }); };
    head.appendChild(addB); wrap.appendChild(head);
    obj[k].forEach(function(item,i){ var card=el('div','forge-card');
      var h=el('div','forge-card-h','<span>'+pretty(k).replace(/s$/,'')+' '+(i+1)+'</span>');
      var tools=el('span','forge-card-tools');
      function chip(lab,title,fn,cls,dis){ var b=el('button','forge-chip '+(cls||''),lab); b.title=title; if(dis)b.disabled=true;
        b.onclick=fn; tools.appendChild(b); }
      /* reorder/remove keep sibling override keys attached to their items */
      chip('↑','Move up',function(){ F.do('reorder',function(data){ var a=obj[k]; var t=a[i-1]; a[i-1]=a[i]; a[i]=t;
        if(apath) swapItemOverrides(slideOf(data),apath,i-1,i); }); },null,i===0);
      chip('↓','Move down',function(){ F.do('reorder',function(data){ var a=obj[k]; var t=a[i+1]; a[i+1]=a[i]; a[i]=t;
        if(apath) swapItemOverrides(slideOf(data),apath,i,i+1); }); },null,i===obj[k].length-1);
      chip('✕','Remove',function(){ F.do('remove item',function(data){ obj[k].splice(i,1);
        if(apath) remapItemOverrides(slideOf(data),apath,i,-1); }); },'warn');
      h.appendChild(tools); card.appendChild(h);
      if(item!==null&&typeof item==='object') contentForm(card,item,slideIdx,apath+'.'+i+'.');
      else { var t=el('textarea'); t.rows=2; t.value=item==null?'':item;
        t.onfocus=function(){ F.pushUndo(); }; t.oninput=function(){ obj[k][i]=t.value; F.renderLiveSlide(); };
        var f=el('div','forge-field'); f.appendChild(t); card.appendChild(f); }
      wrap.appendChild(card); });
    host.appendChild(wrap); }

  /* =====================================================================
     CHART & TABLE DATA GRIDS (v2 phase 3) — a mini spreadsheet in the
     sidebar: labels x series with add/remove, live preview on every keystroke.
     ===================================================================== */
  function gridNum(get,set){ var n=el('input'); n.type='number'; n.className='forge-cell'; n.value=get();
    n.onfocus=function(){ F.pushUndo(); }; n.oninput=function(){ var v=parseFloat(n.value); set(isNaN(v)?0:v); F.renderLiveSlide(); }; return n; }
  function gridTxt(get,set){ var n=el('input'); n.type='text'; n.className='forge-cell'; n.value=get();
    n.onfocus=function(){ F.pushUndo(); }; n.oninput=function(){ set(n.value); F.renderLiveSlide(); }; return n; }
  function chartPanel(host,c,slideIdx){
    c.data=c.data||{labels:[],series:[]}; c.options=c.options||{};
    ['title','kicker','note'].forEach(function(k){ if(c[k]!=null) host.appendChild(field(pretty(k),boundText(c,k))); });
    host.appendChild(field('Type',selectInput(CHART_TYPES,c.type||'bar',function(v){ F.do('chart type',function(){ c.type=v; }); })));
    var o=c.options;
    host.appendChild(fieldRow('Unit suffix',gridTxt(function(){ return o.unit||''; },function(v){ o.unit=v; })));
    var sv=el('input'); sv.type='checkbox'; sv.checked=!!o.showValues;
    sv.onchange=function(){ F.pushUndo(); o.showValues=sv.checked; F.renderLiveSlide(); };
    host.appendChild(fieldRow('Show values',sv));
    /* the grid */
    var wrap=el('div','forge-grid'); var d=c.data;
    var head=el('div','forge-grid-row head');
    head.appendChild(el('span','forge-grid-corner','Label'));
    d.series.forEach(function(s,j){ var cellw=el('span','forge-grid-h');
      cellw.appendChild(gridTxt(function(){ return s.name||''; },function(v){ s.name=v; }));
      var x=el('button','forge-chip warn','\u2715'); x.title='Remove series';
      x.onclick=function(){ F.do('remove series',function(){ d.series.splice(j,1); }); };
      cellw.appendChild(x); head.appendChild(cellw); });
    var addS=el('button','forge-chip add','\uff0b'); addS.title='Add series';
    addS.onclick=function(){ F.do('add series',function(){
      d.series.push({name:'Series '+(d.series.length+1),values:d.labels.map(function(){ return 0; })}); }); };
    head.appendChild(addS); wrap.appendChild(head);
    d.labels.forEach(function(l,i){ var row=el('div','forge-grid-row');
      var lc=el('span','forge-grid-l');
      lc.appendChild(gridTxt(function(){ return d.labels[i]; },function(v){ d.labels[i]=v; }));
      row.appendChild(lc);
      d.series.forEach(function(s){ row.appendChild(gridNum(
        function(){ return s.values[i]!=null?s.values[i]:0; },
        function(v){ s.values[i]=v; })); });
      var x=el('button','forge-chip warn','\u2715'); x.title='Remove row';
      x.onclick=function(){ F.do('remove row',function(){ d.labels.splice(i,1);
        d.series.forEach(function(s){ s.values.splice(i,1); }); }); };
      row.appendChild(x); wrap.appendChild(row); });
    var addR=el('button','forge-chip add','\uff0b row'); addR.style.marginTop='6px';
    addR.onclick=function(){ F.do('add row',function(){ d.labels.push('Label');
      d.series.forEach(function(s){ s.values.push(0); }); }); };
    host.appendChild(wrap); host.appendChild(addR);
    host.appendChild(el('div','forge-hint','Charts recolor with the theme and brand automatically \u2014 series use --chart-1\u20266.')); }
  function tablePanel(host,c,slideIdx){
    c.columns=c.columns||['','A','B']; c.rows=c.rows||[]; c.options=c.options||{};
    function slideOf(data){ return data.slides[slideIdx]; }
    ['title','kicker','note'].forEach(function(k){ if(c[k]!=null) host.appendChild(field(pretty(k),boundText(c,k))); });
    var wrap=el('div','forge-grid');
    var head=el('div','forge-grid-row head');
    c.columns.forEach(function(_,j){ var cellw=el('span','forge-grid-h');
      cellw.appendChild(gridTxt(function(){ return c.columns[j]; },function(v){ c.columns[j]=v; }));
      var x=el('button','forge-chip warn','\u2715'); x.title='Remove column';
      x.onclick=function(){ F.do('remove column',function(data){ c.columns.splice(j,1);
        c.rows.forEach(function(r){ r.splice(j,1); });
        var s=slideOf(data); remapItemOverrides(s,'columns',j,-1);
        c.rows.forEach(function(_,ri){ remapItemOverrides(s,'rows.'+ri,j,-1); }); }); };
      cellw.appendChild(x); head.appendChild(cellw); });
    var addC=el('button','forge-chip add','\uff0b'); addC.title='Add column';
    addC.onclick=function(){ F.do('add column',function(){ c.columns.push('');
      c.rows.forEach(function(r){ r.push(''); }); }); };
    head.appendChild(addC); wrap.appendChild(head);
    c.rows.forEach(function(r,i){ var row=el('div','forge-grid-row');
      c.columns.forEach(function(_,j){ row.appendChild(gridTxt(
        function(){ return r[j]!=null?r[j]:''; },function(v){ r[j]=v; })); });
      var x=el('button','forge-chip warn','\u2715'); x.title='Remove row';
      x.onclick=function(){ F.do('remove row',function(data){ c.rows.splice(i,1);
        remapItemOverrides(slideOf(data),'rows',i,-1); }); };
      row.appendChild(x); wrap.appendChild(row); });
    var addR=el('button','forge-chip add','\uff0b row'); addR.style.marginTop='6px';
    addR.onclick=function(){ F.do('add row',function(){ c.rows.push(c.columns.map(function(){ return ''; })); }); };
    host.appendChild(wrap); host.appendChild(addR);
    var hc=el('input'); hc.type='number'; hc.value=c.options.highlightCol!=null?c.options.highlightCol:'';
    hc.placeholder='none'; hc.onfocus=function(){ F.pushUndo(); };
    hc.oninput=function(){ var v=parseInt(hc.value,10); if(isNaN(v)) delete c.options.highlightCol; else c.options.highlightCol=v; F.renderLiveSlide(); };
    host.appendChild(fieldRow('Highlight column #',hc)); }

  /* =====================================================================
     ELEMENTS TREE — hierarchical view of the slide's elements (template
     blocks, nested items, free objects). Click selects; disclosure arrows
     collapse; hover tools add/duplicate/remove layout items in place.
     ===================================================================== */
  F._treeOpen={};
  function treeChip(host,lab,title,fn,warn){ var b=el('button','forge-chip'+(warn?' warn':''),lab);
    b.title=title; b.setAttribute('aria-label',title); b.onclick=function(e){ e.stopPropagation(); fn(); }; host.appendChild(b); return b; }
  function treeLabel(node){
    if(node.hasAttribute('data-free')){ var fo=node.classList.contains('box')?'Box':node.classList.contains('html')?'Copied group':'Text';
      return '★ '+fo+(node.textContent?' · '+node.textContent.trim().slice(0,20):''); }
    var c=(typeof node.className==='string'?node.className:'').split(' ')[0];
    var name=c&&!/^sg-/.test(c)?c.replace(/-/g,' '):node.tagName.toLowerCase();
    var txt=(node.textContent||'').trim().replace(/\s+/g,' ').slice(0,26);
    return name+(txt?' · '+txt:''); }
  /* build the hierarchy from the authored keys themselves ("stats.2" is a
     child of "stats"), so the tree matches the CONTENT structure even when the
     DOM interleaves (pipeline connectors) or nests differently. */
  function keyedTree(sec){ var map={}, roots=[];
    [].slice.call(sec.querySelectorAll('[data-el]')).forEach(function(n){
      map[n.getAttribute('data-el')]={node:n,kids:[]}; });
    Object.keys(map).forEach(function(k){ var p=k.lastIndexOf('.');
      var par=p>0?map[k.slice(0,p)]:null;
      if(par) par.kids.push(map[k]); else roots.push(map[k]); });
    return roots; }
  function elementsTree(host,slideIdx){
    var sec0=deckEl().querySelectorAll('.slide')[slideIdx]; if(!sec0) return;
    var wrap=el('div','forge-tree');
    var selKey=(F.sel&&F.sel.slideIdx===slideIdx)?(F.sel.key||F.sel.id):null;
    function row(entry,depth){
      var node=entry.node, kids=entry.kids;
      var key=node.getAttribute('data-el')||node.getAttribute('data-free');
      var openKey=slideIdx+':'+key, isOpen=F._treeOpen[openKey]!==false;
      var r=el('div','forge-tree-row'+(selKey===key?' cur':''));
      r.style.paddingLeft=(6+depth*14)+'px';
      var tg=el('span','forge-tree-tg',kids.length?(isOpen?'▾':'▸'):'·');
      if(kids.length) tg.onclick=function(e){ e.stopPropagation(); F._treeOpen[openKey]=!isOpen; F.buildInspect(); };
      r.appendChild(tg);
      var lb=el('span','forge-tree-lb'); lb.textContent=treeLabel(node); r.appendChild(lb);
      var tools=el('span','tools');
      if(!node.hasAttribute('data-free')){
        if(node.getAttribute('data-arr'))
          treeChip(tools,'＋','Add item (matches this list\u2019s shape)',function(){ F.addItem(slideIdx,node); });
        var it=itemOf(key);
        if(it&&key===it.path+'.'+it.idx&&contentArr(slideIdx,it.path)){
          treeChip(tools,'⧉','Duplicate item',function(){ F.dupItem(slideIdx,node); });
          treeChip(tools,'✕','Remove item',function(){ F.removeItem(slideIdx,node); },true); } }
      else treeChip(tools,'✕','Delete object',function(){ selectNode(node,false); F.deleteSel(); },true);
      r.appendChild(tools);
      r.onclick=function(){ selectNode(node,false); };
      wrap.appendChild(r);
      if(isOpen) kids.forEach(function(ch){ row(ch,depth+1); }); }
    keyedTree(sec0).forEach(function(entry){ row(entry,0); });
    [].slice.call(sec0.querySelectorAll('.forge-free')).forEach(function(fn){ row({node:fn,kids:[]},0); });
    host.appendChild(wrap); }

  /* =====================================================================
     STRUCTURE EDITOR (expand from the Elements panel) — big modal with the
     elements tree beside a DIRECT JSON editor for the slide. Copy the
     structure out, edit or paste JSON back in, Apply re-renders from data.
     ===================================================================== */
  F.structModal=function(slideIdx){ var old=D.getElementById('forge-struct'); if(old) old.remove();
    var o=el('div','forge-chrome'); o.id='forge-struct';
    var card=el('div','forge-struct-card');
    card.appendChild(el('h3',null,'Slide '+(slideIdx+1)+' — structure'));
    var grid=el('div','forge-struct-grid');
    var left=el('div','forge-struct-tree'); left.appendChild(el('div','forge-subh','Elements'));
    elementsTree(left,slideIdx); grid.appendChild(left);
    var right=el('div','forge-struct-src'); right.appendChild(el('div','forge-subh','Slide JSON (edit or paste, then Apply)'));
    var ta=el('textarea','forge-struct-json'); ta.spellcheck=false;
    ta.value=JSON.stringify(SG.data.slides[slideIdx],null,2);
    right.appendChild(ta); grid.appendChild(right); card.appendChild(grid);
    var msg=el('div','forge-hint'); msg.id='forge-struct-msg';
    var btns=el('div','forge-struct-btns');
    function sbtn(lab,fn,cls){ var b=el('button','forge-btn '+(cls||''),lab); b.onclick=fn; btns.appendChild(b); return b; }
    var cp=sbtn('⿻ Copy JSON',function(){
      var done=function(){ cp.textContent='✓ Copied'; setTimeout(function(){ cp.textContent='⿻ Copy JSON'; },1200); };
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done,function(){ ta.select(); try{ D.execCommand('copy'); }catch(e){} done(); });
      else { ta.select(); try{ D.execCommand('copy'); }catch(e){} done(); } });
    sbtn('✓ Apply',function(){ var parsed;
      try{ parsed=JSON.parse(ta.value); }
      catch(e){ msg.textContent='✗ Not valid JSON: '+e.message; msg.style.color='#f0a0a0'; return; }
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||typeof parsed.layout!=='string'){
        msg.textContent='✗ Expected a slide object with a "layout" string.'; msg.style.color='#f0a0a0'; return; }
      if(!SG.layouts[parsed.layout]){ msg.textContent='✗ Unknown layout "'+parsed.layout+'"'; msg.style.color='#f0a0a0'; return; }
      F.do('edit structure',function(data){ data.slides[slideIdx]=parsed; });
      msg.textContent='✓ Applied.'; msg.style.color='#9af0c4';
      ta.value=JSON.stringify(SG.data.slides[slideIdx],null,2);
      var lt=o.querySelector('.forge-struct-tree'); lt.innerHTML='';
      lt.appendChild(el('div','forge-subh','Elements')); elementsTree(lt,slideIdx); },'primary');
    sbtn('Close',function(){ o.remove(); });
    card.appendChild(msg); card.appendChild(btns); o.appendChild(card); D.body.appendChild(o);
    o.addEventListener('pointerdown',function(e){ if(e.target===o) o.remove(); }); };

  /* geometry inputs kept in sync during drags */
  var geomInputs=null;
  function syncGeomFields(){ if(!geomInputs||!F.sel) return; var d=selData()||{};
    if(geomInputs.x) geomInputs.x.value=d.x||0; if(geomInputs.y) geomInputs.y.value=d.y||0;
    if(geomInputs.scale) geomInputs.scale.value=d.scale||1; if(geomInputs.rot) geomInputs.rot.value=d.rot||0; }

  /* ---- the Inspector ---- */
  F.buildInspect=function(){ var body=D.getElementById('forge-inspbody'); if(!body) return; body.innerHTML=''; geomInputs=null;
    var i=curSlide(), slide=(SG.data.slides||[])[i]; if(!slide) return;
    if(F.sels.length>1){ objectPanelMulti(body); return; }
    if(F.sel){ objectPanel(body,F.sel); return; }
    contentPanel(body,slide,i);
    var et=sec(body,'Elements'); addExpandChip(et,i); elementsTree(et,i);
    slidePanel(body,slide,i); deckPanel(body); };

  function sec(body,title){ var s=el('div','forge-sec'); s.appendChild(el('div','forge-subh',title)); body.appendChild(s); return s; }
  function addExpandChip(s,slideIdx){ var h=s.querySelector('.forge-subh'); if(!h) return;
    var b=el('button','forge-chip','⤢'); b.title='Expand: structure editor (tree + JSON, copy out / paste back)';
    b.setAttribute('aria-label',b.title); b.style.marginLeft='auto';
    b.onclick=function(){ F.structModal(slideIdx); }; h.appendChild(b); }

  function contentPanel(body,slide,i){ var s=sec(body,'Content — '+slide.layout);
    slide.content=slide.content||{};
    if(slide.layout==='chart'&&slide.content.data){ chartPanel(s,slide.content,i); }
    else if(slide.layout==='table'){ tablePanel(s,slide.content,i); }
    else contentForm(s,slide.content,i);
    s.appendChild(el('div','forge-hint','Tip: double-click text on the slide to edit it in place. **bold**, [[glow]], `mono` render as formatting.')); }

  function slidePanel(body,slide,i){ var s=sec(body,'Slide');
    s.appendChild(field('Layout',selectInput(LAYOUTS,slide.layout,function(v){
      F.do('switch layout',function(data){ var sl=data.slides[i]; var keep=sl.content||{};
        var next=clone(DEFAULTS[v]||{}); Object.keys(next).forEach(function(k){ if(keep[k]!=null&&typeof keep[k]===typeof next[k]) next[k]=keep[k]; });
        sl.layout=v; sl.content=next; }); })));
    s.appendChild(field('Ambient',selectInput(AMBIENTS,slide.ambient||'auto',function(v){
      F.do('ambient',function(data){ if(v==='auto') delete data.slides[i].ambient; else data.slides[i].ambient=v; }); })));
    var nt=el('textarea'); nt.rows=3; nt.value=slide.notes||'';
    nt.onfocus=function(){ F.pushUndo(); };
    nt.oninput=function(){ SG.data.slides[i].notes=nt.value; F.saveDebounced(); };
    var nf=el('div','forge-field'); nf.appendChild(el('label',null,'Presenter notes')); nf.appendChild(nt); s.appendChild(nf);
    s.appendChild(el('div','forge-hint','Press S while presenting to open the speaker view (notes + timer + next slide).'));
    /* animations overview: every animated element on this slide, in one place */
    var anims=[]; var ovv=slide.overrides||{};
    Object.keys(ovv).forEach(function(k){ if(ovv[k]&&ovv[k].anim) anims.push({key:k,d:ovv[k],free:false}); });
    (slide.freeObjects||[]).forEach(function(fo){ if(fo.anim) anims.push({key:fo.id,d:fo,free:true}); });
    if(anims.length){ s.appendChild(el('div','forge-subh','Animations on this slide'));
      var sec0=deckEl().querySelectorAll('.slide')[i];
      anims.sort(function(a,b){ return (a.d.animStep||0)-(b.d.animStep||0); });
      anims.forEach(function(a){ var row=el('div','forge-anim-row');
        var lb=el('span','lb'); lb.textContent=(a.free?'★ ':'')+a.key+' · '+a.d.anim
          +(a.d.animTrigger==='click'?(' · click #'+(a.d.animStep||0)):(ANIM_ENTRANCE[a.d.anim]?' · enter':' · loop'))
          +(a.d.animDelay?(' · '+a.d.animDelay+'s'):'');
        row.appendChild(lb);
        var tools=el('span','tools');
        function node(){ return a.free?sec0.querySelector('[data-free="'+a.key+'"]'):sec0.querySelector('[data-el="'+a.key+'"]'); }
        treeChip(tools,'☐','Select element',function(){ var n=node(); if(n) selectNode(n,false); });
        if(ANIM_ENTRANCE[a.d.anim]) treeChip(tools,'▶','Replay',function(){ var n=node(); if(n) replayAnim(n); });
        treeChip(tools,'✕','Clear animation',function(){ F.do('clear anim',function(){
          delete a.d.anim; delete a.d.animTrigger; delete a.d.animStep; delete a.d.animDelay; }); },true);
        row.appendChild(tools); s.appendChild(row); });
      var pa=el('button','forge-btn','▶ Play all'); pa.style.marginTop='4px';
      pa.onclick=function(){ if(sec0) sec0.querySelectorAll('.sg-onenter').forEach(function(n){ replayAnim(n); }); };
      s.appendChild(pa); }
    var hasOv=slide.overrides&&Object.keys(slide.overrides).length;
    if(hasOv){ var rb=el('button','forge-btn warn','↺ Reset all element overrides');
      rb.onclick=function(){ F.do('reset overrides',function(data){ delete data.slides[i].overrides; }); };
      s.appendChild(rb); }
    /* masters: store this hand-tuned slide as a reusable layout (insert menu lists it) */
    var sv=el('button','forge-btn','★ Save as layout'); sv.style.marginTop='8px';
    sv.onclick=function(){ var name=prompt('Name this layout'); if(!name) return;
      F.do('save master',function(data){ data.masters=data.masters||{};
        data.masters[name]={base:slide.layout,content:clone(slide.content||{}),
          ambient:slide.ambient,theme:clone(slide.theme||null)||undefined,
          overrides:clone(slide.overrides||null)||undefined,
          freeObjects:clone(slide.freeObjects||null)||undefined};
        Object.keys(data.masters[name]).forEach(function(k){ if(data.masters[name][k]==null) delete data.masters[name][k]; }); }); };
    s.appendChild(sv); }

  function deckPanel(body){ var s=sec(body,'Deck');
    var meta=SG.data.meta=SG.data.meta||{};
    s.appendChild(field('Title',boundText(meta,'title')));
    var names=Object.keys(F.themes);
    var curName=typeof SG.data.theme==='string'?SG.data.theme:'';
    s.appendChild(field('Theme',selectInput(['— pick —'].concat(names),curName,function(v){
      if(!F.themes[v]) return;
      F.do('theme',function(data){ data.theme=clone(F.themes[v].vars); data.meta.themeName=v; }); })));
    /* token grid bound to data.theme (converted to an object if needed) */
    var themeObj=SG.data.theme;
    if(typeof themeObj!=='object'||!themeObj){ themeObj=null; }
    var grid=el('div','forge-tokens');
    TOKENS.forEach(function(tk){
      var lab=el('label','forge-token'); var cur=(themeObj&&themeObj[tk])||getComputedStyle(D.documentElement).getPropertyValue(tk).trim();
      lab.appendChild(colorInput(cur,function(v){ F.pushUndoCoalesced('theme:'+tk);
        if(typeof SG.data.theme!=='object'||!SG.data.theme){ SG.data.theme={}; }
        SG.data.theme[tk]=v; F.renderLive(); }));
      lab.appendChild(el('span',null,tk)); grid.appendChild(lab); });
    s.appendChild(grid);
    s.appendChild(el('div','forge-hint','Theme tokens recolor everything — layouts, charts, ambients — because nothing hard-codes color.'));
    /* build steps: click-to-reveal is opt-in so browsing/editing always shows everything */
    var bs=el('input'); bs.type='checkbox'; bs.checked=!!(SG.data.defaults&&SG.data.defaults.buildSteps);
    bs.onchange=function(){ F.do('build steps',function(data){ data.defaults=data.defaults||{};
      if(bs.checked) data.defaults.buildSteps=true; else delete data.defaults.buildSteps; }); };
    s.appendChild(fieldRow('Build steps (click-to-reveal)',bs));
    s.appendChild(el('div','forge-hint','Off (default): everything is visible everywhere. On: while presenting, elements with an On-click trigger wait for → / Space / click.'));
    brandPanel(body); }

  /* ---- Brand kit (v2 phase 4): colors -> accent slots, fonts, inlined logo ---- */
  var BRAND_FONTS=['','Sora','Unbounded','Exo 2','Archivo','Syne','Epilogue','Bricolage Grotesque',
    'Fraunces','Playfair Display','Newsreader','Manrope','Hanken Grotesk','IBM Plex Sans','Lora','Spectral','Source Serif 4'];
  function brandPanel(body){ var s=sec(body,'Brand kit');
    var b=SG.data.brand;
    if(!b){ var mk=el('button','forge-btn','＋ Add a brand kit');
      mk.onclick=function(){ F.do('add brand',function(data){ data.brand={name:'',colors:{},fonts:{}}; }); };
      s.appendChild(mk);
      s.appendChild(el('div','forge-hint','A brand overlays its colors on the theme\u2019s accent slots and swaps the fonts \u2014 any theme can wear your brand.'));
      return; }
    b.colors=b.colors||{}; b.fonts=b.fonts||{};
    s.appendChild(field('Brand name',boundText(b,'name')));
    [['accent1','Accent 1 (primary)'],['accent2','Accent 2'],['accent3','Accent 3']].forEach(function(p){
      s.appendChild(fieldRow(p[1],colorInput(b.colors[p[0]]||'',function(v){ F.pushUndoCoalesced('brand:'+p[0]); b.colors[p[0]]=v; F.renderLive(); }))); });
    s.appendChild(field('Display font',selectInput(BRAND_FONTS,b.fonts.display||'',function(v){
      F.pushUndo(); if(v) b.fonts.display=v; else delete b.fonts.display; F.renderLive(); })));
    s.appendChild(field('Body font',selectInput(BRAND_FONTS,b.fonts.body||'',function(v){
      F.pushUndo(); if(v) b.fonts.body=v; else delete b.fonts.body; F.renderLive(); })));
    /* logo upload -> inlined into deck-assets, auto-placed on cover + closing */
    var up=el('input'); up.type='file'; up.accept='image/*';
    up.onchange=function(){ var f=up.files&&up.files[0]; if(!f) return;
      var fr=new FileReader(); fr.onload=function(){
        F.do('brand logo',function(data){ SG.assets.images=SG.assets.images||{};
          SG.assets.images['brand-logo']=fr.result; data.brand.logo='brand-logo'; }); };
      fr.readAsDataURL(f); };
    var lf=el('div','forge-field'); lf.appendChild(el('label',null,'Logo (auto-placed on cover + closing)'));
    lf.appendChild(up); s.appendChild(lf);
    if(b.logo){ var rm=el('button','forge-chip warn','Remove logo');
      rm.onclick=function(){ F.do('remove logo',function(data){ delete data.brand.logo;
        if(SG.assets.images) delete SG.assets.images['brand-logo']; }); }; s.appendChild(rm); }
    var del=el('button','forge-btn warn','✕ Remove brand kit'); del.style.marginTop='8px';
    del.onclick=function(){ F.do('remove brand',function(data){ delete data.brand;
      if(SG.assets.images) delete SG.assets.images['brand-logo'];
      /* clear the inline accent/font vars the brand set */
      ['--cyan','--indigo','--mint','--font-display','--font-body'].forEach(function(k){
        D.documentElement.style.removeProperty(k); }); }); };
    s.appendChild(del); }

  function objectPanelMulti(body){ var s=sec(body,String(F.sels.length)+' elements selected');
    s.appendChild(el('div','forge-hint','Drag to move all. Use the floating toolbar to align & distribute, or:'));
    var row1=el('div','forge-card-tools');
    [['⇤','left'],['⇹','hcenter'],['⇥','right'],['⤒','top'],['⇳','vcenter'],['⤓','bottom']].forEach(function(a){
      var b=el('button','forge-chip',a[0]); b.title='Align '+a[1]; b.onclick=function(){ F.align(a[1]); }; row1.appendChild(b); });
    s.appendChild(row1);
    if(F.sels.length>2){ var row2=el('div','forge-card-tools');
      [['↔','h'],['↕','v']].forEach(function(a){ var b=el('button','forge-chip',a[0]); b.title='Distribute'; b.onclick=function(){ F.distribute(a[1]); }; row2.appendChild(b); });
      s.appendChild(row2); }
    var db=el('button','forge-btn warn','✕ Delete / reset all'); db.onclick=F.deleteSel; s.appendChild(db); }

  function objectPanel(body,sel){ var d=selData()||{}; var isFree=sel.kind==='free';
    var s=sec(body,(isFree?('Free '+((d.type==='box')?'box':'text')):('Element '+sel.key)));
    if(isFree&&d.type!=='box'){ var t=el('textarea'); t.rows=2; t.value=d.text||'';
      t.onfocus=function(){ F.pushUndo(); }; t.oninput=function(){ d.text=t.value; F.renderLiveSlide(); };
      var f=el('div','forge-field'); f.appendChild(el('label',null,'Text')); f.appendChild(t); s.appendChild(f); }
    geomInputs={};
    function num(label,key,step){ var n=el('input'); n.type='number'; if(step)n.step=step; n.value=d[key]||(key==='scale'?1:0);
      n.onfocus=function(){ F.pushUndo(); };
      n.oninput=function(){ var v=parseFloat(n.value);
        if((key==='w'||key==='h')&&(isNaN(v)||v<=0)) delete d[key];   /* 0/blank = back to natural size */
        else d[key]=isNaN(v)?0:v;
        isFree?applyFree(sel.node,d):applyOverride(sel.node,d); refreshHandles(); positionFloat(); pulse(sel.node); F.saveDebounced(); };
      geomInputs[key]=n; s.appendChild(fieldRow(label,n)); }
    num('X','x'); num('Y','y'); num('Scale','scale','0.05'); num('Rotate','rot');
    num('Width','w');                                       /* width reflows text (0 = natural) */
    if(isFree&&(d.type==='box'||d.type==='html')) num('Height','h');
    if(isFree&&d.type!=='box') num('Font size','size');
    var s2=sec(body,'Style');
    s2.appendChild(fieldRow('Text color',colorInput(d.color,function(v){ F.pushUndoCoalesced('obj-color'); d.color=v;
      isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.saveDebounced(); })));
    s2.appendChild(field('Font',selectInput(F.fontChoices,d.font||'',function(v){ F.pushUndo(); d.font=v;
      isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.save(); })));
    s2.appendChild(fieldRow('Accent',colorInput((d.theme&&d.theme['--cyan'])||'',function(v){ F.pushUndoCoalesced('obj-accent');
      d.theme=d.theme||{}; d.theme['--cyan']=v; isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.saveDebounced(); })));
    s2.appendChild(fieldRow('Surface',colorInput((d.theme&&d.theme['--panel'])||'',function(v){ F.pushUndoCoalesced('obj-surface');
      d.theme=d.theme||{}; d.theme['--panel']=v; isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.saveDebounced(); })));
    var s3=sec(body,'Animation');
    function reapply(){ isFree?applyFree(sel.node,d):applyOverride(sel.node,d); }
    s3.appendChild(field('Effect',selectInput(F.animChoices,d.anim||'',function(v){ F.pushUndo(); d.anim=v;
      if(!v){ delete d.animTrigger; delete d.animStep; }
      reapply(); replayAnim(sel.node); F.save(); F.buildInspect(); })));
    if(d.anim){
      if(ANIM_ENTRANCE[d.anim]){
        s3.appendChild(field('Trigger',selectInput([['On slide enter',''],['On click (build step)','click']],
          d.animTrigger||'',function(v){ F.pushUndo();
            if(v){ d.animTrigger=v;
              SG.data.defaults=SG.data.defaults||{}; SG.data.defaults.buildSteps=true; }  /* opting in implies enabling */
            else { delete d.animTrigger; delete d.animStep; }
            reapply(); F.save(); F.buildInspect(); })));
        if(d.animTrigger==='click'){ var st=el('input'); st.type='number'; st.min='0'; st.value=d.animStep||0;
          st.onfocus=function(){ F.pushUndo(); };
          st.oninput=function(){ var v=parseInt(st.value,10); d.animStep=isNaN(v)?0:v; reapply(); F.saveDebounced(); };
          s3.appendChild(fieldRow('Step order',st));
          s3.appendChild(el('div','forge-hint','While presenting, → / Space / click plays pending steps in order before advancing. Same number = together.')); } }
      var dl=el('input'); dl.type='number'; dl.step='0.1'; dl.value=d.animDelay||0;
      dl.onfocus=function(){ F.pushUndo(); }; dl.oninput=function(){ var v=parseFloat(dl.value); d.animDelay=isNaN(v)?0:v;
        reapply(); F.saveDebounced(); };
      s3.appendChild(fieldRow('Delay (s)',dl));
      if(ANIM_ENTRANCE[d.anim]){ var rp=el('button','forge-btn','▶ Replay'); rp.onclick=function(){ replayAnim(sel.node); }; s3.appendChild(rp); } }
    /* hierarchical elements tree (selection highlighted, item tools inline) */
    var s4=sec(body,'Elements'); addExpandChip(s4,sel.slideIdx); elementsTree(s4,sel.slideIdx);
    var s5=sec(body,'');
    var back=el('button','forge-btn','← Slide content'); back.onclick=function(){ clearSel(); F.buildInspect(); }; s5.appendChild(back);
    var del=el('button','forge-btn warn',isFree?'🗑 Delete object':'↺ Reset element'); del.style.marginLeft='6px';
    del.onclick=F.deleteSel; s5.appendChild(del); }

  /* =====================================================================
     SLIDE OPERATIONS + FREE OBJECTS
     ===================================================================== */
  F.addSlide=function(layout,master){ var i=curSlide();
    F.do('add slide',function(data){ var sl;
      if(master){ var m=(data.masters||{})[master]||{}; sl=clone(m); sl.layout=m.base||'divider'; delete sl.base;
        (sl.freeObjects||[]).forEach(function(fo){ fo.id=uid(); }); sl.content=sl.content||{}; }
      else { var lay=layout||'divider'; sl={layout:lay,content:clone(DEFAULTS[lay]||{})}; }
      data.slides.splice(i+1,0,sl); });
    location.hash='#'+(i+2); F.buildNav(); F.buildInspect(); };
  /* insert menu: every built-in layout + the deck's saved masters */
  F.insertMenu=function(anchor){ var m=D.getElementById('forge-ins');
    if(m){ m.remove(); return; }
    m=el('div','forge-chrome'); m.id='forge-ins';
    m.appendChild(el('div','forge-subh','Layouts'));
    var grid=el('div','forge-ins-grid');
    LAYOUTS.forEach(function(l){ var b=el('button','forge-chip',l);
      b.onclick=function(){ m.remove(); F.addSlide(l); }; grid.appendChild(b); });
    m.appendChild(grid);
    var masters=SG.data.masters||{};
    if(Object.keys(masters).length){ m.appendChild(el('div','forge-subh','My layouts'));
      var g2=el('div','forge-ins-grid');
      Object.keys(masters).forEach(function(name){ var b=el('button','forge-chip add','★ '+name);
        b.onclick=function(){ m.remove(); F.addSlide(null,name); }; g2.appendChild(b); });
      m.appendChild(g2); }
    D.body.appendChild(m);
    var r=anchor.getBoundingClientRect();
    m.style.left=Math.min(r.left, W.innerWidth-m.offsetWidth-10)+'px'; m.style.top=(r.bottom+6)+'px';
    setTimeout(function(){ D.addEventListener('pointerdown',function h(e){
      if(!m.contains(e.target)){ m.remove(); D.removeEventListener('pointerdown',h,true); } },true); },0); };
  F.dupSlide=function(at){ var i=at!=null?at:curSlide();
    F.do('duplicate slide',function(data){ data.slides.splice(i+1,0,clone(data.slides[i])); });
    location.hash='#'+(i+2); F.buildNav(); F.buildInspect(); };
  F.delSlide=function(at){ var i=at!=null?at:curSlide(); if((SG.data.slides||[]).length<2) return;
    F.do('delete slide',function(data){ data.slides.splice(i,1); });
    location.hash='#'+Math.max(1,i); F.buildNav(); F.buildInspect(); };
  F.moveSlide=function(i,dir){ var j=i+dir; if(j<0||j>=(SG.data.slides||[]).length) return;
    F.do('move slide',function(data){ var t=data.slides[j]; data.slides[j]=data.slides[i]; data.slides[i]=t; });
    location.hash='#'+(j+1); F.buildNav(); F.buildInspect(); };
  F.addFree=function(type){ var i=curSlide(); var id=uid();
    F.do('add '+type,function(data){ var s=data.slides[i]; s.freeObjects=s.freeObjects||[];
      s.freeObjects.push(type==='box'?{id:id,type:'box',x:490,y:280,w:300,h:160}:{id:id,type:'txt',x:520,y:330,text:'New text',size:34}); });
    var sec=deckEl().querySelectorAll('.slide')[i]; var n=sec&&sec.querySelector('[data-free="'+id+'"]'); if(n) selectNode(n,false); };

  /* =====================================================================
     SAVE — download a fresh self-contained .html with edits baked in.
     ===================================================================== */
  function currentHTML(){ if(F.editing) endEdit();
    var root=D.documentElement.cloneNode(true);
    /* strip editor state: chrome nodes, selection, deck DOM (re-rendered on boot) */
    [].slice.call(root.querySelectorAll('.forge-chrome,#forge-fmt,#forge-ctx,#forge-float,.forge-guides,.forge-marquee')).forEach(function(n){ n.remove(); });
    var body=root.querySelector('body'); if(body) body.classList.remove('forge-edit','presenting','hide-docs');
    var deck=root.querySelector('#deck'); if(deck){ deck.innerHTML=''; deck.removeAttribute('style'); }
    var dataEl=root.querySelector('#deck-data'); if(dataEl) dataEl.textContent='\n'+JSON.stringify(SG.data,null,2)+'\n';
    var asEl=root.querySelector('#deck-assets'); if(asEl) asEl.textContent='\n'+JSON.stringify(SG.assets||{icons:{},images:{},styles:''})+'\n';
    var t=root.querySelector('title'); if(t&&SG.data.meta&&SG.data.meta.title) t.textContent=SG.data.meta.title;
    return '<!doctype html>\n'+root.outerHTML; }
  function deckFilename(){ return ((SG.data.meta&&SG.data.meta.title)||'deck').replace(/[^\w.-]+/g,'-').toLowerCase()+'.html'; }
  F.downloadBlob=function(html){ var blob=new Blob([html],{type:'text/html'});
    var a=D.createElement('a'); a.href=URL.createObjectURL(blob); a.download=deckFilename();
    D.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); },1000); };
  function savedFlash(msg){ var b=F._saveBtn; if(!b) return; var t0=b.textContent;
    b.textContent=msg||'\u2713 Saved'; b.disabled=true;
    setTimeout(function(){ b.textContent=t0; b.disabled=false; },1400); }
  /* Save: writes IN PLACE via the File System Access API where available
     (Chrome/Edge; first save picks the file, later saves are silent), else
     falls back to downloading a fresh copy. */
  F._fileHandle=null;
  F.download=function(){ var html=currentHTML();
    if(W.showSaveFilePicker){
      var p=F._fileHandle?Promise.resolve(F._fileHandle)
        :W.showSaveFilePicker({suggestedName:deckFilename(),types:[{description:'HTML deck',accept:{'text/html':['.html']}}]})
          .then(function(h){ F._fileHandle=h; return h; });
      p.then(function(h){ return h.createWritable(); })
       .then(function(ws){ return ws.write(html).then(function(){ return ws.close(); }); })
       .then(function(){ savedFlash(); })
       .catch(function(err){ if(err&&err.name==='AbortError') return; F.downloadBlob(html); });
    } else F.downloadBlob(html); };

  /* =====================================================================
     RESTORE BAR — offer to restore newer autosaved edits from localStorage.
     ===================================================================== */
  function checkRestore(){ var saved=null;
    try{ saved=localStorage.getItem(F.key()); }catch(e){}
    if(!saved||saved===JSON.stringify(SG.data)) return;
    var rb=D.getElementById('forge-restore'); if(!rb) return;
    rb.innerHTML='<span>Unsaved edits from a previous session found.</span>';
    var yes=el('button','forge-btn primary','Restore'), no=el('button','forge-btn','Discard');
    yes.onclick=function(){ try{ SG.data=SG.migrate(JSON.parse(saved)); }catch(e){}
      SG.render(deckEl(),SG.data); SG.refresh&&SG.refresh(); F.buildNav(); F.buildInspect(); rb.style.display='none'; };
    no.onclick=function(){ try{ localStorage.removeItem(F.key()); }catch(e){} rb.style.display='none'; };
    rb.appendChild(yes); rb.appendChild(no); rb.style.display='flex'; }

  /* =====================================================================
     TOGGLE + BOOT
     ===================================================================== */
  F.showKeys=function(){ var o=D.getElementById('forge-keys');
    if(o){ o.style.display=o.style.display==='none'?'flex':'none'; return; }
    o=el('div','forge-chrome'); o.id='forge-keys';
    var rows=[['Drag / Alt','Move with snap guides / snap off'],
      ['Drag corner / Alt+corner','Resize width \u2014 text reflows / scale'],['Double-click','Edit text in place'],
      ['Shift-click / marquee','Multi-select'],['Ctrl+C · V · D','Copy / paste / duplicate (deep)'],
      ['Ctrl+G / Ctrl+Shift+G','Group / ungroup'],['Arrows / Shift+arrows','Nudge 1px / 10px'],
      ['Delete','Delete / reset selection'],['Ctrl+Z / Ctrl+Shift+Z','Undo / redo'],
      ['Ctrl+S','Save (in place on Chrome/Edge)'],['Esc','Clear selection / close'],
      ['— presenting —',''],['\u2192 / Space / click','Next build step, then next slide'],
      ['F / S / P','Fullscreen / speaker view / PDF'],['?','This overlay']];
    var body='<div class="forge-hints-card"><h3>Keyboard shortcuts</h3><table class="forge-keys-tbl">';
    rows.forEach(function(r){ body+='<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>'; });
    body+='</table><button class="forge-btn primary" id="forge-keys-ok">Close</button></div>';
    o.innerHTML=body; D.body.appendChild(o);
    o.querySelector('#forge-keys-ok').onclick=function(){ o.style.display='none'; };
    o.style.display='flex'; };
  F.showHints=function(force){
    try{ if(!force&&localStorage.getItem('forge:hints-seen')) return; }catch(e){}
    var o=D.getElementById('forge-hints');
    if(!o){ o=el('div','forge-chrome'); o.id='forge-hints';
      o.innerHTML='<div class="forge-hints-card"><h3>Editing basics</h3><ul>'
        +'<li><b>Drag</b> any element \u2014 pink guides snap it to centers and edges (hold <b>Alt</b> for free placement)</li>'
        +'<li><b>Double-click</b> text to rewrite it in place</li>'
        +'<li><b>Shift-click</b> or drag a box to select several \u2014 align from the floating toolbar, <b>Ctrl+G</b> groups them</li>'
        +'<li>The <b>right panel</b> edits text and structure; the <b>left panel</b> reorders slides (\u25a6 = sorter view)</li>'
        +'<li><b>Ctrl+S</b> saves your copy \u00b7 add notes per slide and press <b>S</b> while presenting for the speaker view</li>'
        +'</ul><button class="forge-btn primary" id="forge-hints-ok">Got it</button></div>';
      D.body.appendChild(o);
      o.querySelector('#forge-hints-ok').onclick=function(){ o.style.display='none';
        try{ localStorage.setItem('forge:hints-seen','1'); }catch(e){} }; }
    o.style.display='flex'; };
  F.toggle=function(){ var on=D.body.classList.toggle('forge-edit');
    if(F._launch) F._launch.textContent=on?'\u2713 Done':'\u270e Edit';
    if(F.editing) endEdit(); clearSel(); hideCtxMenu();
    if(on){ SG.render(deckEl(),SG.data); SG.refresh&&SG.refresh(); F.buildNav(); F.buildInspect(); F.showHints(); }
    else { SG.render(deckEl(),SG.data); SG.refresh&&SG.refresh(); if(floatBar) floatBar.classList.remove('on'); }
  };

  function boot(){ SG.boot();
    if(!SG.data) return;                     /* engine showed the JSON-error slide */
    F.buildChrome(); wireDeck(); wireKeys();
    F.buildNav(); F.buildInspect(); checkRestore();
    W.addEventListener('hashchange',function(){ clearSel(); F.buildNav(); F.buildInspect(); });
  }
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded',boot);

  /* observe selection changes to keep the floating toolbar in sync */
  var _paint=paintSel; paintSel=function(){ _paint(); buildFloat(); };
  /* re-wrap: selectNode/selectNodes/clearSel captured paintSel by reference at
     definition time inside this closure, so re-binding the name above is enough. */
})();
