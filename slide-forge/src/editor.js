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
   v5 adds CONTENT-BACKED free objects (type:'node'): a copied or inserted
   element carries the layout + content it was made from and RE-RENDERS from
   data, so it keeps the fields, list verbs and text binding of the original
   instead of freezing into markup. Its inner keys are namespaced by the
   object id ("f7x2k/ring.label") — see partOf()/scopeOf() below, which route
   every content + override read to the object that owns it.
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

  var LAYOUTS=["cover","agenda","divider","stat-grid","bignum","chart","table","comparison","quote","code","timeline","pipeline","closing","manifesto","editorial","hero-asym","figure","image","media-split","gallery","diagram","embed","metric-dash","leaderboard","diptych","matrix","stack","quote-mosaic","index-mosaic","before-after","raw"];
  var ASSET_FIELDS={image:'image',svg:'svg',poster:'image'};    /* content field name -> asset kind, for the picker widget */
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
    image:{kicker:"",title:"",caption:"",image:"",fit:"cover",focal:[0.5,0.5],frame:"none"},
    "media-split":{kicker:"",title:"Title",body:"Body copy.",items:[],image:"",side:"left",fit:"cover",focal:[0.5,0.5]},
    gallery:{kicker:"",title:"Gallery",items:[{image:"",caption:""}]},
    diagram:{kicker:"",title:"Diagram",svg:"",caption:""},
    embed:{kicker:"",title:"",url:"",mode:"click",poster:"",note:""},
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

  /* ---- free-object PART KEYS (v5) ---------------------------------------
     A content-backed free object (type:'node') mounts a real layout subtree,
     authored keys and all. Those keys are namespaced with the object's id and
     a "/" — a character no content path can contain — for two reasons:
       1. they can never collide with the slide's own authored keys, so
          sec.querySelector('[data-el="ring"]') still means the SLIDE's ring;
       2. one parse tells any accessor which content root and which override
          bag the key addresses (scopeOf), so item ops, text write-back,
          overrides and GC all route themselves with no extra plumbing.
     Everything that keys off data-el keeps working unchanged; only the
     storage accessors branch. */
  var PARTSEP='/';
  function partOf(key){ var k=String(key==null?'':key), i=k.indexOf(PARTSEP);
    return i<0?null:{id:k.slice(0,i),inner:k.slice(i+1)}; }
  function partKey(id,inner){ return id+PARTSEP+inner; }
  /* a key with its namespace removed — for anything user-facing (labels,
     breadcrumbs, the identity chip), which should never show the id */
  function deNs(key){ var p=partOf(key); return p?p.inner:key; }
  /* The object a key's content + overrides live on: a node free object's own
     {content, overrides}, or the slide's. `key` comes back stripped of its
     namespace, ready to use against host.content / host.overrides.
     null = a part key whose object is gone (stale selection mid-render). */
  function scopeOf(slideIdx,key,data){ var s=((data||SG.data).slides||[])[slideIdx]; if(!s) return null;
    var p=partOf(key); if(!p) return {host:s,key:key,free:null};
    var fo=(s.freeObjects||[]).filter(function(f){ return f.id===p.id; })[0];
    return fo?{host:fo,key:p.inner,free:fo}:null; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function curSlide(){ var i=(parseInt((location.hash||'').slice(1),10)||1)-1; return clamp(i,0,(SG.data.slides||[]).length-1); }
  function pretty(k){ var m={k:"Key",v:"Value",desc:"Description",by:"Source",sub:"Subtitle",xlabel:"X label",ylabel:"Y label",fmt:"Format"};
    return m[k]||String(k).replace(/([A-Z])/g,' $1').replace(/[-_]/g,' ').replace(/^./,function(c){return c.toUpperCase();}); }
  /* ---- plain-language vocabulary (v4) ------------------------------------
     Non-programmers never see a dotted key as a primary label. Three small
     maps turn a content path into words: the field name, the name of one item
     in an array, and the name of the array as a whole. Anything not listed
     falls back to pretty()/a naive singular, so new layouts still read fine. */
  var FIELD_LABEL={kicker:"Kicker",title:"Title",subtitle:"Subtitle",accent:"Accent word",statement:"Statement",
    lead:"Lead paragraph",quote:"Quote",by:"Attribution",code:"Code",filename:"Filename",caption:"Caption",
    note:"Note",index:"Section number",badge:"Badge",num:"Big number",count:"Number",unit:"Unit",label:"Label",
    body:"Body copy",head:"Heading",name:"Name",value:"Value",year:"Year",tag:"Tag",image:"Image",svg:"Diagram",
    url:"Link",poster:"Poster image",left:"Left side",right:"Right side",before:"Before side",after:"After side",
    ring:"Metric ring",mark:"Quote mark",rail:"Rail",text:"Text",desc:"Description"};
  var ITEM_LABEL={stats:"Stat",items:"Item",nodes:"Step",takeaways:"Takeaway",columns:"Column",rows:"Row",
    cells:"Cell",bands:"Band",quotes:"Quote",tiles:"Tile",meta:"Detail",series:"Series"};
  var ARRAY_LABEL={stats:"Stat cards",items:"Items",nodes:"Pipeline steps",takeaways:"Takeaways",
    columns:"Columns",rows:"Rows",cells:"Cells",bands:"Bands",quotes:"Quotes",tiles:"Tiles",meta:"Details"};
  function singular(k){ return ITEM_LABEL[k]||pretty(String(k).replace(/ies$/,'y').replace(/s$/,'')); }
  function arrayName(path){ var last=String(path).split('.').pop(); return ARRAY_LABEL[last]||pretty(last); }
  function fieldName(k){ return FIELD_LABEL[k]||pretty(k); }
  function excerpt(node,n){ var t=(node&&node.textContent||'').trim().replace(/\s+/g,' ');
    return t.length>(n||40)?t.slice(0,(n||40)-1)+'…':t; }
  /* strip rich()'s bold/glow/mono markers ( **x**, [[x]], `x` ) down to plain
     text — for labels that show raw content OUTSIDE the deck's rendered CSS
     (slide-list rows, the manage-items modal title), where the markers would
     otherwise leak as literal asterisks/brackets/backticks instead of being
     rendered */
  function plainText(s){ return String(s==null?'':s)
      .replace(/\[\[(.+?)\]\]/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1').replace(/`(.+?)`/g,'$1'); }
  /* {icon,name} for any keyed element — the one place a key becomes English */
  function elName(node,key){
    if(node&&node.hasAttribute&&node.hasAttribute('data-free')){
      if(node.getAttribute('data-name')) return {icon:'★',name:node.getAttribute('data-name')};
      var t=node.classList.contains('box')?'Box':node.classList.contains('html')?'Copied group'
        :node.classList.contains('node')?'Copied element'
        :node.classList.contains('image')?'Image':node.classList.contains('svg')?'Diagram'
        :node.classList.contains('embed')?'Embed':'Text';
      return {icon:'★',name:t}; }
    var seg=String(deNs(key)||'').split('.'), last=seg[seg.length-1];
    if(/^\d+$/.test(last)) return {icon:'№',name:singular(seg[seg.length-2])+' '+(+last+1)};
    if(node&&node.getAttribute&&node.getAttribute('data-arr'))
      return {icon:'▦',name:arrayName(deNs(node.getAttribute('data-arr')))};
    var bare=deNs(key);
    var icon=bare==='kicker'||bare==='kicker.text'?'K':(bare==='title'||/\.title$/.test(bare))?'T'
      :(node&&node.hasAttribute&&node.hasAttribute('data-bind'))?'T':'◻';
    return {icon:icon,name:fieldName(last)}; }
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
     longer exists after a structural content edit, PLUS overrides that are
     just an empty {} stub (ovFor() below creates one on mere selection, for
     the read side of its get-or-create contract — if nothing ever wrote a
     field into it, it's dead weight). Safe here specifically because commit
     always rebuilds the inspector right after (see F.commit), so no open
     panel is left holding a mutate-in-place reference to a key we just
     deleted. Undoable (snapshot is taken before the mutation) and logged,
     never silent. */
  function gcOverrides(deck){ var dropped=[];
    var secs=deck.querySelectorAll('.slide');
    /* one host at a time: the slide itself, then each content-backed free
       object (whose part keys live in its OWN bag, under its namespace) */
    function sweep(host,sec,label,ns){ if(!host.overrides) return;
      Object.keys(host.overrides).forEach(function(k){
        var n=sec.querySelector('[data-el="'+(ns?partKey(ns,k):k)+'"]');
        if(!n||!Object.keys(host.overrides[k]||{}).length){ delete host.overrides[k]; dropped.push(label+k); } });
      if(!Object.keys(host.overrides).length) delete host.overrides; }
    (SG.data.slides||[]).forEach(function(s,i){ var sec=secs[i]; if(!sec) return;
      if(s.layout!=='raw') sweep(s,sec,(i+1)+':',null);
      (s.freeObjects||[]).forEach(function(fo){
        if(fo.type==='node') sweep(fo,sec,(i+1)+':'+fo.id+PARTSEP,fo.id); }); });
    if(dropped.length) try{ console.info('slide-forge: removed '+dropped.length+' orphaned/empty override(s) — '+dropped.join(', ')); }catch(e){} }

  function decorateSection(sec,slide){
    if(!slide) return;
    if(slide.layout==='raw') rawBlocks(sec).forEach(function(b,bi){ rawKeyEl(b,'b'+bi,0); });
    blocks(sec).forEach(function(b){ b.classList.add('forge-block'); });
    var ov=slide.overrides||{};
    Object.keys(ov).forEach(function(k){
      var n=sec.querySelector('[data-el="'+k+'"]'); if(n) applyOverride(n,ov[k]); });
    (slide.freeObjects||[]).forEach(function(fo){
      var n=el('div','forge-block forge-free '+(fo.type||'txt')); n.setAttribute('data-free',fo.id);
      if(fo.name) n.setAttribute('data-name',fo.name);
      if(fo.type==='html') n.innerHTML=fo.html||'';
      else if(fo.type==='node') mountNodeFree(n,fo);
      else if(fo.type==='image') mountImageFree(n,fo);
      else if(fo.type==='svg') mountSvgFree(n,fo);
      else if(fo.type==='embed') SG.mountEmbed&&SG.mountEmbed(n,fo);
      else if(fo.type!=='box') n.textContent=fo.text||'Text';
      sec.appendChild(n); applyFree(n,fo);
      /* a node object's parts carry their own overrides, in its own bag */
      if(fo.type==='node'&&fo.overrides) Object.keys(fo.overrides).forEach(function(k){
        var pn=n.querySelector('[data-el="'+partKey(fo.id,k)+'"]');
        if(pn) applyOverride(pn,fo.overrides[k]); }); }); }

  /* CONTENT-BACKED free object (v5). Render the SOURCE LAYOUT against this
     object's own content, lift out the subtree it was made from, and mount it
     with its authored data-el/data-bind/data-arr intact — namespaced by the
     object id. That is the whole point: the copy keeps the fields, list verbs
     and text binding of the element it came from, instead of freezing into an
     HTML string (the old type:'html', still rendered above for existing decks
     and for anything with no layout to re-render).
     The object keeps the layout's WHOLE content, not just the picked branch:
     layouts routinely read sibling fields, so pruning would change what the
     element renders. Only the picked subtree is mounted. */
  function mountNodeFree(n,fo){
    function fail(msg){ n.appendChild(el('div','forge-part-gone',msg)); }
    var fn=SG.layouts&&SG.layouts[fo.layout];
    if(!fn) return fail('Layout "'+(fo.layout||'?')+'" is not in this deck.');
    var host=el('div'), out;
    try{ out=fn(clone(fo.content||{}),{index:0,total:1}); }catch(e){ out=null; }
    if(!out||out.raw!=null) return fail('This element can no longer be rendered.');
    (function add(x){ if(x==null||x===false) return;
      if(Array.isArray(x)){ x.forEach(add); return; }
      host.appendChild(x.nodeType?x:D.createTextNode(String(x))); })(out);
    var pick=fo.pick?host.querySelector('[data-el="'+fo.pick+'"]'):host.firstElementChild;
    if(!pick) return fail('"'+(fo.pick||'?')+'" is no longer part of the '+fo.layout+' layout.');
    namespaceKeys(pick,fo.id);
    /* Some layouts' CSS is written against the bare layout name ON THE SECTION
       (".quote blockquote"). A boxless shell carrying those classes keeps the
       lifted subtree matching them — display:contents means it participates in
       selector matching and inheritance but adds no layout of its own, so it
       can't drag the section's own box model onto a free object. */
    var shell=el('div','forge-part-shell'
      +((SG.SECTION_LAYOUTS&&SG.SECTION_LAYOUTS[fo.layout])?' '+fo.layout:'')+' lyt-'+fo.layout);
    shell.appendChild(pick); n.appendChild(shell); }
  /* rewrite a lifted subtree's authored keys into the object's namespace */
  function namespaceKeys(root,id){
    [root].concat([].slice.call(root.querySelectorAll('[data-el],[data-bind],[data-arr]')))
      .forEach(function(n){ ['data-el','data-bind','data-arr'].forEach(function(a){
        var v=n.getAttribute(a); if(v!=null) n.setAttribute(a,partKey(id,v)); }); }); }

  /* image/svg free objects (media plan §3): content is mounted ONCE here;
     geometry/fit/frame styling is re-applied on every drag frame by
     applyFree, never remounted, so dragging an image never re-decodes it. */
  function mountImageFree(n,fo){
    var img=el('img'); img.alt=fo.alt||''; img.draggable=false; img.loading='eager';
    var m=SG.imageMeta&&SG.imageMeta(fo.asset);
    if(m&&m.src) img.src=m.src;
    img.addEventListener('error',function(){
      img.style.display='none';
      if(!n.querySelector('.sf-unavail')) n.appendChild(SG.unavailable({url:(m&&m.src)||fo.asset,reason:'missing'})); });
    n.appendChild(img); }
  function mountSvgFree(n,fo){
    var markup=SG.svgMarkup&&SG.svgMarkup(fo.asset);
    if(markup) n.innerHTML=markup;
    else n.appendChild(SG.unavailable({url:fo.asset,reason:'missing'})); }

  /* posterize(root): strip every live iframe+shield under root, forcing its
     poster card visible instead (media plan §6.2 problem 4). Used wherever a
     slide gets CLONED for a separate display — sorter thumbnails, speaker
     view, deep-copy — so those never spawn extra live loads of the same URL.
     (Print/SG.static handle the ACTIVE deck via CSS alone — see engine.css —
     because that path must never mutate the live, still-interactive DOM.) */
  F.posterize=function(root){ if(!root) return;
    [].slice.call(root.querySelectorAll('.sf-embed-iframe-wrap,.sf-embed-shield')).forEach(function(n){ n.remove(); });
    [].slice.call(root.querySelectorAll('.sf-embed-poster')).forEach(function(n){ n.style.display='flex'; }); };

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
  /* href allow-list (media plan §5): only what the deck engine actually
     follows (SG.followLink) — rejects javascript:/data:/vbscript: etc. so a
     forwarded deck can never carry a stored script-executing link. */
  function sanitizeHref(v){ v=String(v==null?'':v).trim();
    if(!v) return {ok:true,value:''};
    if(/^#\d+$/.test(v)) return {ok:true,value:v};
    if(/^(https?:|mailto:)/i.test(v)) return {ok:true,value:v};
    return {ok:false,value:v}; }
  F.sanitizeHref=sanitizeHref;
  function applyHref(node,o){ var href=o&&o.href;
    if(href){ node.setAttribute('data-href',href); node.setAttribute('role','link'); node.setAttribute('tabindex','0');
      node.classList.add('sf-linked'); }
    else { node.removeAttribute('data-href'); node.removeAttribute('role'); node.removeAttribute('tabindex');
      node.classList.remove('sf-linked'); } }
  function applyStyle(node,o){ if(!o){ applyHref(node,o); return; }
    if(o.color) node.style.color=o.color; if(o.font) node.style.fontFamily=o.font;
    if(o.fs) node.style.fontSize=o.fs+'px';                 /* v4: direct text size, in px */
    if(o.z!=null) node.style.zIndex=o.z;
    if(o.theme) Object.keys(o.theme).forEach(function(k){ node.style.setProperty(k,o.theme[k]); }); applyHref(node,o); }
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
  /* HIDDEN (v4 eye toggle): a hidden element stays visible-but-ghosted WHILE
     EDITING so it can be found and un-hidden again; it is really gone when
     presenting, printing and in a downloaded copy (which boots without
     .forge-edit). Used by the items panel and by detach-to-freeform. */
  function applyHidden(n,hide){
    if(hide&&editing()){ n.style.display=''; n.style.opacity='.12'; n.classList.add('forge-hidden'); }
    else if(hide){ n.style.display='none'; n.classList.remove('forge-hidden'); }
    else { n.style.display=''; n.style.opacity=''; n.classList.remove('forge-hidden'); } }
  function applyOverride(b,o){ b.style.transform=o?transformStr(o):''; applyAnim(b,o); if(!o) return; b.style.transformOrigin='center center'; applyStyle(b,o);
    if(o.w!=null&&o.w>0){ b.style.width=o.w+'px'; b.style.boxSizing='border-box'; }
    if(o.h!=null&&o.h>0) b.style.height=o.h+'px';
    applyHidden(b,o.hide);
    if(o.html!=null && !b.querySelector('[data-el]')) b.innerHTML=SG.rich(o.html); }
  var MEDIA_FREE={image:1,svg:1};
  var SIZED_FREE={box:1,image:1,svg:1,embed:1};
  /* free-object types whose corner drag resizes BOTH axes independently (vs.
     text, where a corner drag only changes width and the text reflows).
     image/svg additionally default to aspect-locked (see MEDIA_FREE + the
     Shift-frees-it logic in startDrag) — embed/box/html resize freely. */
  var TWO_AXIS_FREE={box:1,html:1,image:1,svg:1,embed:1};
  function applyFree(n,fo){ n.style.left='0px'; n.style.top='0px';
    n.style.transform='translate('+(fo.x||0)+'px,'+(fo.y||0)+'px)'+(fo.rot?' rotate('+fo.rot+'deg)':'')+(fo.scale&&fo.scale!==1?' scale('+fo.scale+')':'');
    applyStyle(n,fo); applyAnim(n,fo); if(fo.size) n.style.fontSize=fo.size+'px';
    if(SIZED_FREE[fo.type]){ n.style.width=(fo.w||(fo.type==='box'?300:fo.type==='embed'?480:360))+'px';
      n.style.height=(fo.h||(fo.type==='box'?160:fo.type==='embed'?270:240))+'px'; }
    else { if(fo.w) n.style.width=fo.w+'px'; if(fo.h&&fo.type==='html') n.style.height=fo.h+'px'; }
    if(MEDIA_FREE[fo.type]){
      n.style.overflow='hidden'; n.style.borderRadius=(fo.radius||0)+'px'; n.style.opacity=fo.opacity!=null?fo.opacity:1;
      n.classList.remove('frame-panel','frame-glow','frame-shadow');
      if(fo.frame&&fo.frame!=='none') n.classList.add('frame-'+fo.frame);
      var fit=fo.fit||'cover', fx=(fo.focal&&fo.focal[0]!=null)?fo.focal[0]:0.5, fy=(fo.focal&&fo.focal[1]!=null)?fo.focal[1]:0.5;
      var img=n.querySelector(':scope > img');
      if(img){ img.style.width='100%'; img.style.height='100%'; img.style.objectFit=fit;
        img.style.objectPosition=(fx*100)+'% '+(fy*100)+'%'; img.alt=fo.alt||''; }
      var svgEl=n.querySelector(':scope > svg');
      if(svgEl){ svgEl.style.width='100%'; svgEl.style.height='100%'; svgEl.style.display='block';
        svgEl.setAttribute('preserveAspectRatio', fit==='contain'?'xMidYMid meet':'xMidYMid slice'); }
    }
    if(fo.hide) applyHidden(n,1); }

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
  /* the inspector reads this for EVERY selection (just to populate the panel),
     but only some selections ever get an actual edit — eagerly storing {} here
     used to leave a permanent empty overrides[key] stub behind for every
     element a user so much as clicked on. Return a proxy over a detached
     object instead; it attaches itself to the slide on its first real write,
     so selecting-without-editing never touches SG.data at all. */
  function ovFor(i,key){ var sc=scopeOf(i,key); if(!sc) return {};
    var h=sc.host, k=sc.key;
    if(h.overrides&&h.overrides[k]) return h.overrides[k];
    var obj={};
    return new Proxy(obj,{ set:function(t,p,v){ t[p]=v; h.overrides=h.overrides||{}; h.overrides[k]=t; return true; } }); }
  function freeFor(i,id){ var s=SG.data.slides[i]; return (s.freeObjects||[]).filter(function(f){return f.id===id;})[0]; }
  function elData(sel){ if(!sel) return null; return sel.kind==='free'?freeFor(sel.slideIdx,sel.id):ovFor(sel.slideIdx,sel.key); }
  /* non-creating accessor (elData creates an empty override on read) */
  function peekData(x){ var s=SG.data.slides[x.slideIdx]; if(!s) return null;
    if(x.kind==='free') return freeFor(x.slideIdx,x.id);
    var sc=scopeOf(x.slideIdx,x.key);
    return sc&&sc.host.overrides?sc.host.overrides[sc.key]:null; }
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
          var isMedia=p.sel.kind==='free'&&MEDIA_FREE[p.d.type];
          var newW=Math.max(40,Math.round(p.box0.w+(cL?-dx:dx)));
          /* image/svg corner-drag keeps the intrinsic aspect ratio by default;
             Shift frees it (mirrors the text case, where reflow is the point) */
          if(isMedia&&!ev.shiftKey){
            var ratio=(p.box0.h||1)/(p.box0.w||1);
            var newH=Math.max(30,Math.round(newW*ratio));
            p.d.w=newW; p.d.h=newH;
            if(cL) p.d.x=Math.round((p.d0.x||0)+dx);
            if(cT) p.d.y=Math.round((p.d0.y||0)+(p.box0.h-newH));
          } else {
            p.d.w=newW;
            if(cL) p.d.x=Math.round((p.d0.x||0)+dx);
            if(p.sel.kind==='free'&&TWO_AXIS_FREE[p.d.type]){
              p.d.h=Math.max(30,Math.round(p.box0.h+(cT?-dy:dy)));
              if(cT) p.d.y=Math.round((p.d0.y||0)+dy); }
          }
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
    var i=slideIdxOf(node), key=node.getAttribute('data-el'), bind=deNs(node.getAttribute('data-bind'));
    if(i<0||!key) return;
    F.do('edit text',function(data){ var sc=scopeOf(i,key,data); if(!sc) return;
      /* the host is the slide, or — for a part of a content-backed free
         object — that object, so a copy's text edits stay inside the copy */
      var h=sc.host, k=sc.key;
      /* data-bind names the exact content field this leaf renders — write back
         deterministically. Unbound leaves (raw slides, derived text like item
         numbers) store an html override instead (reversible via Reset). */
      if(bind){ SG.setPath(h.content=h.content||{},bind,markers);
        if(h.overrides&&h.overrides[k]&&h.overrides[k].html!=null){   /* clear stale shadow */
          delete h.overrides[k].html;
          if(!Object.keys(h.overrides[k]).length) delete h.overrides[k]; } }
      else { h.overrides=h.overrides||{}; (h.overrides[k]=h.overrides[k]||{}).html=markers; } }); }
  F.endEdit=endEdit;

  /* =====================================================================
     CLIPBOARD — copy/paste/duplicate. Free objects copy losslessly; a keyed
     COMPOSITE copies as a content-backed object (type:'node') that re-renders
     from data and stays as editable as the original; a lone text leaf copies
     as free text; only markup with no layout behind it freezes into html.
     ===================================================================== */
  F.clipboard=null;
  /* the layout + content a keyed element re-renders from — the basis for a
     content-backed copy. null when there is nothing to re-render FROM: a raw
     slide's positional markup, a layout this deck no longer carries, or a
     part whose owning object has gone away. */
  function nodeSourceFor(x){ if(!x||x.kind==='free'||!x.key) return null;
    var s=(SG.data.slides||[])[x.slideIdx]; if(!s) return null;
    var p=partOf(x.key);
    if(p){ var src=freeFor(x.slideIdx,p.id);
      return (src&&src.type==='node')?{layout:src.layout,pick:p.inner,content:clone(src.content||{})}:null; }
    if(s.layout==='raw'||!SG.layouts||!SG.layouts[s.layout]) return null;
    return {layout:s.layout,pick:x.key,content:clone(s.content||{})}; }
  function specFromSel(x){ var d=elData(x)||{}, box=boxOf(x.node);
    if(x.kind==='free'){ var c=clone(d); delete c.id; return c; }
    var cs=W.getComputedStyle(x.node);
    if(isLeafText(x.node))
      return {type:'txt', text:serializeMarks(x.node.innerHTML), x:Math.round(box.x), y:Math.round(box.y),
        size:Math.round(parseFloat(cs.fontSize)||34), color:d.color||cs.color, font:d.font||cs.fontFamily,
        rot:d.rot||0, anim:d.anim||'', animDelay:d.animDelay||0};
    /* CONTENT-BACKED copy (v5): carry the layout + content instead of the
       pixels, so the copy keeps its fields, list verbs and text binding.
       Composites only — a lone leaf lifted out of its parent would lose any
       styling written as a descendant selector, and the `txt` copy above is
       already fully editable. No height: width reflows, height follows. */
    var src=x.node.querySelector('[data-el]')?nodeSourceFor(x):null;
    if(src){ var spec={type:'node',layout:src.layout,pick:src.pick,content:src.content,
        x:Math.round(box.x), y:Math.round(box.y), w:Math.round(box.w), rot:d.rot||0};
      ['color','font','fs','anim','animDelay','animTrigger','animStep','z','href'].forEach(function(k){ if(d[k]!=null) spec[k]=d[k]; });
      if(d.theme) spec.theme=clone(d.theme);
      return spec; }
    /* last resort: no layout to re-render from — carry the raw markup */
    var cl=x.node.cloneNode(true);
    [].slice.call(cl.querySelectorAll('.forge-handles,.forge-guides,.forge-marquee,.forge-free,.sf-embed-iframe-wrap,.sf-embed-shield')).forEach(function(n){ n.remove(); });
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
  /* Duplicate prefers FIDELITY *and* editability: a nested layout item clones
     its content entry in place (identical element, identical behavior);
     anything else goes through the clipboard, which now yields a
     content-backed copy for composites (see specFromSel). */
  F.dupSel=function(){ if(!F.sels.length) return;
    if(F.sels.length===1){ var x=F.sel, it=x.kind!=='free'?itemOf(x.key):null;
      if(it&&x.key===it.path+'.'+it.idx&&F.dupItem(x.slideIdx,x.node)) return; }
    F.copySel(); F._pasteN=0; F.paste(); };

  /* detach a template text element to a free object at the same position/size/
     style; the original is hidden via overrides[key].hide (reset to restore). */
  F.detachSel=function(){ var x=F.sel; if(!x||x.kind==='free'||!isLeafText(x.node)) return;
    var spec=specFromSel(x), i=x.slideIdx, key=x.key, id=uid(); spec.id=id; clearSel();
    F.do('detach',function(data){ var s=data.slides[i]; s.freeObjects=s.freeObjects||[]; s.freeObjects.push(spec);
      var sc=scopeOf(i,key,data); if(!sc) return;
      sc.host.overrides=sc.host.overrides||{}; (sc.host.overrides[sc.key]=sc.host.overrides[sc.key]||{}).hide=1; });
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
  function contentArr(slideIdx,path){ if(!path) return null;
    var sc=scopeOf(slideIdx,path); if(!sc||!sc.key) return null;
    var a=SG.getPath(sc.host.content||{},sc.key); return Array.isArray(a)?a:null; }
  /* the three remap helpers below take a HOST — a slide, or a content-backed
     free object — since either can own a content array and an override bag.
     They only ever touch host.overrides, so the same code serves both. */
  /* shift override keys under `path` after an item insert (+1 at idx) or
     removal (-1 at idx: the removed item's overrides go with it) */
  function remapItemOverrides(s,path,idx,delta){ if(!s||!s.overrides) return;
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
  function copyItemOverrides(s,path,from,to){ if(!s||!s.overrides) return;
    var a=path+'.'+from, out={};
    Object.keys(s.overrides).forEach(function(k){
      if(k===a||k.indexOf(a+'.')===0) out[path+'.'+to+k.slice(a.length)]=clone(s.overrides[k]); });
    Object.keys(out).forEach(function(k){ s.overrides[k]=out[k]; }); }
  function swapItemOverrides(s,path,a,b){ if(!s||!s.overrides) return;
    var pa=path+'.'+a, pb=path+'.'+b, out={};
    Object.keys(s.overrides).forEach(function(k){
      if(k===pa||k.indexOf(pa+'.')===0) out[pb+k.slice(pa.length)]=s.overrides[k];
      else if(k===pb||k.indexOf(pb+'.')===0) out[pa+k.slice(pb.length)]=s.overrides[k];
      else out[k]=s.overrides[k]; });
    s.overrides=out; }
  F.addItem=function(slideIdx,containerNode){
    var path=containerNode.getAttribute&&containerNode.getAttribute('data-arr');
    if(!contentArr(slideIdx,path)) return false;
    return F.addItemPath(slideIdx,path); };
  F.dupItem=function(slideIdx,node){
    var it=itemOf(node.getAttribute('data-el')); if(!it) return false;
    if(!contentArr(slideIdx,it.path)) return false;
    F.do('duplicate item',function(data){ var sc=scopeOf(slideIdx,it.path,data); if(!sc) return;
      var arr2=SG.getPath(sc.host.content,sc.key); arr2.splice(it.idx+1,0,clone(arr2[it.idx]));
      remapItemOverrides(sc.host,sc.key,it.idx+1,+1);
      copyItemOverrides(sc.host,sc.key,it.idx,it.idx+1); }); return true; };
  F.removeItem=function(slideIdx,node){
    var it=itemOf(node.getAttribute('data-el')); if(!it) return false;
    if(!contentArr(slideIdx,it.path)) return false;
    clearSel();
    F.do('remove item',function(data){ var sc=scopeOf(slideIdx,it.path,data); if(!sc) return;
      SG.getPath(sc.host.content,sc.key).splice(it.idx,1);
      remapItemOverrides(sc.host,sc.key,it.idx,-1); }); return true; };

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
      /* group item removals per host+array, delete high->low with remap */
      acts.filter(function(a){ return a.t==='item'; })
        .sort(function(a,b){ return b.idx-a.idx; })
        .forEach(function(a){ var sc=scopeOf(a.i,a.path,data); if(!sc) return;
          SG.getPath(sc.host.content,sc.key).splice(a.idx,1);
          remapItemOverrides(sc.host,sc.key,a.idx,-1); });
      acts.forEach(function(a){ var s=data.slides[a.i];
        if(a.t==='free'&&s) s.freeObjects=(s.freeObjects||[]).filter(function(f){ return f.id!==a.id; });
        else if(a.t==='reset'){ var sc=scopeOf(a.i,a.key,data);
          if(sc&&sc.host.overrides) delete sc.host.overrides[sc.key]; } }); }); };

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
    ctxMenu.appendChild(ctxItem(isFree?'⧉ Duplicate':'⧉ Duplicate as a free copy',null,function(){ F.dupSel(); }));
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
  /* CLICK AGAIN TO GO DEEPER (v4): the first click on a group selects the
     group (so dragging still moves the whole thing); clicking inside the
     current selection steps down ONE level of the key hierarchy — grid ->
     stat card -> its label. Alt-click still jumps straight to the deepest
     element, and the breadcrumb walks back up. */
  function drillTarget(blk,hit){
    if(!hit||hit===blk||!F.sel||F.sels.length!==1) return blk;
    var cur=F.sel.node;
    if(cur===hit||!cur.contains(hit)) return blk;
    var n=hit, parent;
    /* [data-free] terminates the chain too, so clicking again inside a
       content-backed free object drills into its parts (the object itself is
       the top of that hierarchy, and carries no data-el of its own) */
    while(n){ parent=n.parentNode&&n.parentNode.closest('[data-el],[data-free]');
      if(parent===cur) return n; if(!parent) break; n=parent; }
    return blk; }
  function wireDeck(){ var deck=deckEl();
    deck.addEventListener('pointerdown',function(e){ if(!editing()) return;
      if(e.button!==0) return;
      if(F.editing){ if(F.editing.contains(e.target)) return; endEdit(); return; }
      var hnd=e.target.closest('.forge-h'); if(hnd){
        startDrag(e, hnd.dataset.h==='rot'?'rot':(e.altKey?'scale':'size'), hnd.dataset.h); return; }
      if(e.altKey){ var deep=e.target.closest('[data-el]'); if(deep){ e.preventDefault(); selectNode(deep,e.shiftKey); return; } }
      var blk=e.target.closest('.forge-block');
      if(blk){ if(e.shiftKey){ selectNode(blk,true); return; }
        var want=drillTarget(blk,e.target.closest('[data-el]'));
        if(want!==blk&&want!==(F.sel&&F.sel.node)){ selectNode(want,false); startDrag(e,'move'); return; }
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
    W.addEventListener('resize',function(){ if(editing()) F.applyView(); refreshHandles(); positionFloat(); });
    /* Ctrl/Cmd + wheel zooms the stage (the browser's own page zoom would
       fight the fitted transform), plain wheel is left alone. */
    deck.addEventListener('wheel',function(e){ if(!editing()||!(e.ctrlKey||e.metaKey)) return;
      e.preventDefault(); F.setZoom(F.zoom*(e.deltaY<0?1.12:1/1.12)); },{passive:false});
    /* drop-on-canvas image/svg import (media plan §3.3): converts the drop
       point to deck-local px through the same scale() the drag code uses,
       lands each dropped file centred there with a small cascade offset for
       multi-file drops. No clipboard paste in v1 — see media plan §7.2. */
    if(F.assets){
      deck.addEventListener('dragover',function(e){ if(!editing()) return;
        if(e.dataTransfer&&[].slice.call(e.dataTransfer.types||[]).indexOf('Files')>=0){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; } });
      deck.addEventListener('drop',function(e){ if(!editing()) return;
        var files=[].slice.call((e.dataTransfer&&e.dataTransfer.files)||[]).filter(function(f){
          return /^image\//.test(f.type)||/\.svg$/i.test(f.name||''); });
        if(!files.length) return; e.preventDefault();
        var s=scale(), db=deck.getBoundingClientRect();
        var x0=(e.clientX-db.left)/s, y0=(e.clientY-db.top)/s;
        files.forEach(function(f,i){
          F.assets.importFile(f).then(function(res){
            F.addImage(res.name,res.kind,{x:x0+i*24,y:y0+i*24}); F.save(); })
          .catch(function(err){ try{ console.warn('slide-forge: drop-import failed for '+f.name,err); }catch(e2){} }); }); });
    }
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
    if(mod&&(e.key==='0')){ e.preventDefault(); e.stopPropagation(); F.zoomFit(); return; }
    if(mod&&(e.key==='='||e.key==='+')){ e.preventDefault(); e.stopPropagation(); F.setZoom(F.zoom*1.25); return; }
    if(mod&&e.key==='-'){ e.preventDefault(); e.stopPropagation(); F.setZoom(F.zoom/1.25); return; }
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
     STAGE VIEWPORT — zoom + ⌖ Focus (v4).
     In present mode the engine scales the deck to the window. While EDITING
     the deck is instead fitted to the stage BETWEEN the panels (so nothing
     hides under them), times a zoom factor, optionally panned to centre the
     selection ("Focus"). One combined translate()+scale() on #deck, which is
     also what scale() reads back — so every drag/resize/marquee/guide
     calculation divides by the *combined* scale automatically and gestures
     stay 1:1 with the pointer at any zoom.
     ===================================================================== */
  F.zoom=1; F.focus=false;
  var ZMIN=0.25, ZMAX=3;
  function stageRect(){
    var bar=D.getElementById('forge-bar');
    var top=(bar&&editing())?bar.getBoundingClientRect().height:0;
    var l=editing()?248:0, r=editing()?280:0;
    return {l:l,t:top,r:W.innerWidth-r,b:W.innerHeight}; }
  function baseScale(){ var s=stageRect();
    if(!editing()) return Math.min(W.innerWidth/1280,W.innerHeight/720);
    return Math.max(0.05,Math.min((s.r-s.l-56)/1280,(s.b-s.t-56)/720)); }
  /* the point (slide-space) the stage should centre on */
  function focusPoint(){
    if(!F.focus||!F.sels.length) return null;
    var b=boxOf(F.sels[0].node); if(!b) return null;
    return {x:b.x+b.w/2, y:b.y+b.h/2, w:b.w, h:b.h}; }
  SG.viewTransform=function(){
    if(!editing()) return null;                       /* present mode: engine default */
    var st=stageRect(), b=baseScale(), fp=focusPoint(), z=F.zoom, s;
    if(fp){ /* ~1.7x, but never so far in that the element stops fitting */
      var fit=Math.min((st.r-st.l-120)/(fp.w*b), (st.b-st.t-120)/(fp.h*b));
      z=F.zoom*Math.max(1,Math.min(1.7,fit)); }
    s=clamp(b*z,b*ZMIN,b*ZMAX*2);
    var cx=(st.l+st.r)/2, cy=(st.t+st.b)/2;
    var px=fp?fp.x:640, py=fp?fp.y:360;
    var tx=cx-W.innerWidth/2-s*(px-640), ty=cy-W.innerHeight/2-s*(py-360);
    F._viewScale=s;
    return 'translate('+tx.toFixed(1)+'px,'+ty.toFixed(1)+'px) scale('+s.toFixed(4)+')'; };
  F.applyView=function(){ if(SG.fit) SG.fit(); refreshHandles(); positionFloat(); syncZoomBar(); };
  F.setZoom=function(z){ F.zoom=clamp(z,ZMIN,ZMAX); F.applyView(); };
  F.zoomFit=function(){ F.zoom=1; F.focus=false; F.applyView(); };
  F.toggleFocus=function(){ F.focus=!F.focus; F.applyView(); };
  var zoomBar=null, zoomPct=null, focusBtn=null;
  function syncZoomBar(){ if(!zoomPct) return;
    zoomPct.textContent=Math.round((F._viewScale||baseScale())/baseScale()*100)+'%';
    if(focusBtn) focusBtn.classList.toggle('on',F.focus); }
  function buildZoomBar(){
    zoomBar=el('div','forge-chrome'); zoomBar.id='forge-zoom';
    focusBtn=el('button','forge-btn','⌖ Focus');
    focusBtn.title='Zoom to the selected element and follow the selection while on';
    focusBtn.onclick=function(){ F.toggleFocus(); };
    zoomBar.appendChild(focusBtn);
    var pill=el('div','forge-zoom-pill');
    function zb(lab,title,fn,cls){ var b=el('button',cls||null,lab); b.title=title; b.onclick=fn; pill.appendChild(b); return b; }
    zb('−','Zoom out',function(){ F.setZoom(F.zoom/1.25); });
    zoomPct=el('span','forge-zoom-pct','100%'); pill.appendChild(zoomPct);
    zb('＋','Zoom in',function(){ F.setZoom(F.zoom*1.25); });
    zb('Fit','Fit the slide and turn Focus off',function(){ F.zoomFit(); },'wide');
    zoomBar.appendChild(pill); D.body.appendChild(zoomBar); syncZoomBar(); }

  /* =====================================================================
     UI SCAFFOLDING — launcher, toolbar, panels, restore bar.
     ===================================================================== */
  F.buildChrome=function(){
    var launch=el('button','forge-chrome','✎ Edit'); launch.id='forge-launch'; launch.onclick=F.toggle; D.body.appendChild(launch);
    F._launch=launch;
    var bar=el('div','forge-chrome'); bar.id='forge-bar'; bar.innerHTML='<span class="forge-title"></span>';
    function btn(label,fn,cls,title){ var b=el('button','forge-btn '+(cls||''),label); b.onclick=fn;
      if(title){ b.title=title; b.setAttribute('aria-label',title); } bar.appendChild(b); return b; }
    /* v4 order: add things -> view things -> undo -> help/present/save.
       Every button carries a title so the glyphs are never a guessing game. */
    F._addBtn=btn('＋ Slide',function(e){ F.insertMenu(F._addBtn); },'','Add a slide (pick a layout)');
    btn('⧉ Duplicate',function(){ F.dupSlide(); },'','Duplicate this slide');
    btn('T Text',function(){ F.addFree('txt'); },'','Add a free text object');
    btn('▭ Box',function(){ F.addFree('box'); },'','Add a box');
    btn('▣ Image',function(){ F.imagePrompt(); },'','Insert an image or SVG diagram');
    btn('⊞ Insert',function(){ F.insertGallery(); },'','Insert any element from any layout');
    btn('🖼 Assets',function(){ F.assetsPanel(); },'','Asset library (import, rename, link)');
    btn('◲ Embed',function(){ F.embedPrompt(); },'','Embed a live web page (sandboxed)');
    bar.appendChild(el('span','forge-sep'));
    F._sorterBtn=btn('▦ Sorter',function(){ F.toggleSorter(); },'','Slide sorter (drag-to-reorder thumbnails)');
    btn('◐ Theme',function(){ F.deckModal('theme'); },'','Deck theme, tokens & brand kit');
    btn('⚙ Deck',function(){ F.deckModal('deck'); },'','Deck settings (title, build steps)');
    bar.appendChild(el('span','forge-sep'));
    F._undoBtn=btn('⟲',F.undoOp,'','Undo (Ctrl+Z)'); F._redoBtn=btn('⟳',F.redoOp,'','Redo (Ctrl+Shift+Z)');
    bar.appendChild(el('span','forge-sep'));
    btn('？',function(){ F.showKeys(); },'','Keyboard shortcuts (?)');
    btn('{ } JSON',function(){ SG.exportJSON&&SG.exportJSON(); },'','Export the deck JSON');
    btn('▶ Present',function(){ F.toggle(); SG.present&&SG.present(); },'','Present (F for fullscreen)');
    F._saveBtn=btn('Save .html',function(){ F.download(); },'primary','Save your copy (Ctrl+S)');
    D.body.appendChild(bar);
    buildZoomBar();
    var nav=el('div','forge-chrome forge-panel'); nav.id='forge-nav'; nav.setAttribute('role','region'); nav.setAttribute('aria-label','Slides'); nav.innerHTML='<h4>Slides <button id="forge-sorter-toggle" class="forge-chip" title="Toggle sorter (thumbnails)">\u25a6</button></h4><div id="forge-navlist"></div>'; D.body.appendChild(nav);
    nav.querySelector('#forge-sorter-toggle').onclick=function(){ F.toggleSorter(); };
    var insp=el('div','forge-chrome forge-panel'); insp.id='forge-inspect'; insp.setAttribute('role','region'); insp.setAttribute('aria-label','Inspector'); insp.innerHTML='<h4>Inspector</h4><div id="forge-inspbody"></div>'; D.body.appendChild(insp);
    var rb=el('div','forge-chrome'); rb.id='forge-restore'; D.body.appendChild(rb);
    /* quota warning (media plan section 2.3): shown/hidden by F.assets._onSaveState
       whenever the asset-registry localStorage write throws -- never silent */
    var aw=el('div','forge-chrome'); aw.id='forge-assets-warn'; aw.style.display='none';
    aw.appendChild(el('span',null,'Images are too large to autosave — use ⤓ Save .html so you don’t lose them.'));
    var awClose=el('button','forge-btn','Dismiss'); awClose.onclick=function(){ aw.style.display='none'; }; aw.appendChild(awClose);
    D.body.appendChild(aw);
    if(F.assets) F.assets._onSaveState=function(unsaved){ aw.style.display=unsaved?'flex':'none'; };
    F.syncToolbar();
  };

  F.buildNav=function(){ var list=D.getElementById('forge-navlist'); if(!list) return; var cur=curSlide(); list.innerHTML='';
    if(F._sorter){ buildSorter(list,cur); return; }
    list.className='';
    (SG.data.slides||[]).forEach(function(s,i){ var t=(s.content&&(s.content.title||s.content.statement||s.content.quote))||s.layout;
      var row=el('div','forge-srow'+(i===cur?' cur':''));
      row.innerHTML='<span class="si">'+(i+1)+'</span><span class="sl">'+plainText(t).replace(/[<>&]/g,'').slice(0,22)+'</span><span class="st">'+s.layout+'</span>';
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
        F.posterize(frame);
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
  /* asset-picker widget (media plan §4): a thumbnail + <select> of every
     registry asset of the right kind, plus an inline "Import…" option that
     imports a new file straight from the content form. Used for any content
     field named image/svg/poster (ASSET_FIELDS). */
  function assetPickerField(obj,key,kind){
    var wrap=el('div','forge-assetpick');
    var thumb=el('div','forge-assetpick-thumb');
    function paintThumb(){ thumb.innerHTML=''; var v=obj[key]; if(!v) return;
      if(kind==='svg'){ thumb.innerHTML=(SG.svgMarkup&&SG.svgMarkup(v))||''; }
      else { var m=SG.imageMeta&&SG.imageMeta(v); if(m&&m.src){ var img=el('img'); img.src=m.src; img.alt=''; thumb.appendChild(img); } } }
    var sel=el('select');
    function paintOptions(){ sel.innerHTML='';
      var none=el('option','','— none —'); none.value=''; sel.appendChild(none);
      var names=Object.keys((kind==='svg'?SG.assets.svg:SG.assets.images)||{}).sort();
      names.forEach(function(n){ var o=el('option','',n); o.value=n; if(n===obj[key]) o.selected=true; sel.appendChild(o); });
      var imp=el('option','','＋ Import…'); imp.value='__import__'; sel.appendChild(imp); }
    sel.onchange=function(){
      if(sel.value==='__import__'){
        var inp=el('input'); inp.type='file'; inp.accept=kind==='svg'?'.svg':'image/*'; inp.hidden=true;
        inp.onchange=function(){ var f=inp.files&&inp.files[0]; inp.value=''; if(!f||!F.assets){ paintOptions(); return; }
          F.pushUndo();
          F.assets.importFile(f).then(function(res){ obj[key]=res.name; F.save(); paintOptions(); paintThumb(); F.renderLiveSlide(); })
            .catch(function(){ F.undo.pop(); F.syncToolbar(); paintOptions(); }); };
        D.body.appendChild(inp); inp.click(); setTimeout(function(){ inp.remove(); },4000);
        paintOptions(); return; }
      F.pushUndo(); obj[key]=sel.value; paintThumb(); F.renderLiveSlide(); F.save(); };
    paintOptions(); paintThumb();
    wrap.appendChild(thumb); wrap.appendChild(sel);
    return wrap; }

  /* generic content form: reflects slides[i].content — plain fields, nested
     objects, and arrays as reorderable cards with add/duplicate/remove. ONE
     renderer, used by the sidebar Content panel, the contextual inspector's
     Content section, and the Manage-items modal (v4), so those can never
     drift apart. */
  /* `own` (optional) is the object whose overrides follow these items around —
     the slide by default, or a content-backed free object when the form is
     editing that object's own content. Threaded through so array reorder /
     duplicate / remove remap the RIGHT override bag. */
  function fieldFor(host,obj,k,slideIdx,path,own){ var v=obj[k];
    if(Array.isArray(v)){ arrayEditor(host,obj,k,slideIdx,(path||'')+k,own); return; }
    if(v!==null&&typeof v==='object'){ var grp=el('div','forge-card');
      grp.appendChild(el('div','forge-card-h','<span>'+fieldName(k)+'</span>'));
      contentForm(grp,v,slideIdx,(path||'')+k+'.',own); host.appendChild(grp); return; }
    if(typeof v==='boolean'){ host.appendChild(fieldRow(fieldName(k),boundCheck(obj,k))); return; }
    if(typeof v==='number'){ host.appendChild(field(fieldName(k),boundNum(obj,k))); return; }
    if(ASSET_FIELDS[k]&&F.assets){ host.appendChild(field(fieldName(k),assetPickerField(obj,k,ASSET_FIELDS[k]))); return; }
    host.appendChild(field(fieldName(k),boundText(obj,k, k==='code'||k==='html'||k==='body'&&String(v).length>80||String(v).length>70||/\n/.test(String(v)) ))); }
  function contentForm(host,obj,slideIdx,path,own){
    Object.keys(obj).forEach(function(k){ fieldFor(host,obj,k,slideIdx,path,own); }); }
  function newItemLike(item){ if(typeof item==='string') return '';
    if(typeof item==='number') return 0;
    if(item&&typeof item==='object'){ var o={}; Object.keys(item).forEach(function(k){
      var v=item[k]; o[k]=typeof v==='number'?0:typeof v==='boolean'?false:Array.isArray(v)?[]:(v&&typeof v==='object')?newItemLike(v):''; }); return o; }
    return ''; }
  function arrayEditor(host,obj,k,slideIdx,apath,own){ var wrap=el('div','forge-arr');
    function slideOf(data){ return own||data.slides[slideIdx]; }
    var one=singular(k);
    var head=el('div','forge-arr-h','<span>'+arrayName(k)+' · '+obj[k].length+'</span>');
    var addB=el('button','forge-chip add','＋ Add '+one.toLowerCase());
    addB.title='Add one more '+one.toLowerCase()+' (matches this list’s shape)';
    addB.onclick=function(){ F.do('add item',function(){ var arr=obj[k];
      arr.push(arr.length?newItemLike(arr[arr.length-1]):{title:''}); }); };
    head.appendChild(addB); wrap.appendChild(head);
    var cards=el('div','forge-arr-cards');
    obj[k].forEach(function(item,i){ var card=el('div','forge-card');
      var h=el('div','forge-card-h','<span>'+one+' '+(i+1)+'</span>');
      var tools=el('span','forge-card-tools');
      function chip(lab,title,fn,cls,dis){ var b=el('button','forge-chip '+(cls||''),lab); b.title=title; if(dis)b.disabled=true;
        b.onclick=fn; tools.appendChild(b); }
      /* reorder/duplicate/remove keep sibling override keys attached to their items */
      chip('↑','Move earlier',function(){ F.do('reorder',function(data){ var a=obj[k]; var t=a[i-1]; a[i-1]=a[i]; a[i]=t;
        if(apath) swapItemOverrides(slideOf(data),apath,i-1,i); }); },null,i===0);
      chip('↓','Move later',function(){ F.do('reorder',function(data){ var a=obj[k]; var t=a[i+1]; a[i+1]=a[i]; a[i]=t;
        if(apath) swapItemOverrides(slideOf(data),apath,i,i+1); }); },null,i===obj[k].length-1);
      chip('⧉','Duplicate',function(){ F.do('duplicate item',function(data){ obj[k].splice(i+1,0,clone(obj[k][i]));
        if(apath){ var s=slideOf(data); remapItemOverrides(s,apath,i+1,+1); copyItemOverrides(s,apath,i,i+1); } }); });
      chip('✕','Remove',function(){ F.do('remove item',function(data){ obj[k].splice(i,1);
        if(apath) remapItemOverrides(slideOf(data),apath,i,-1); }); },'warn');
      h.appendChild(tools); card.appendChild(h);
      if(item!==null&&typeof item==='object') contentForm(card,item,slideIdx,apath+'.'+i+'.',own);
      else { var t=el('textarea'); t.rows=2; t.value=item==null?'':item;
        t.onfocus=function(){ F.pushUndo(); }; t.oninput=function(){ obj[k][i]=t.value; F.renderLiveSlide(); };
        var f=el('div','forge-field'); f.appendChild(t); card.appendChild(f); }
      cards.appendChild(card); });
    wrap.appendChild(cards); host.appendChild(wrap); }

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
     "ON THIS SLIDE" ITEMS PANEL (v4) — the sidebar's home view. One row per
     authored element, named in plain language ("Stat 3"), indented by key
     depth, with a show/hide eye. Hovering a row outlines the element on the
     canvas and vice-versa; clicking selects. Replaces the v2.1 Elements tree:
     same walk over authored data-el keys, but no dotted keys as labels and no
     disclosure arrows to get lost in.
     ===================================================================== */
  function treeChip(host,lab,title,fn,warn){ var b=el('button','forge-chip'+(warn?' warn':''),lab);
    b.title=title; b.setAttribute('aria-label',title); b.onclick=function(e){ e.stopPropagation(); fn(); }; host.appendChild(b); return b; }
  /* build the hierarchy from the authored keys themselves ("stats.2" is a
     child of "stats"), so the list matches the CONTENT structure even when the
     DOM interleaves (pipeline connectors) or nests differently. */
  function keyedTree(scope,inFree){ var map={}, roots=[];
    [].slice.call(scope.querySelectorAll('[data-el]')).forEach(function(n){
      /* a content-backed free object's parts are listed UNDER the object, not
         as extra top-level rows — so the slide walk skips them */
      if(!inFree&&n.closest('.forge-free')) return;
      map[n.getAttribute('data-el')]={node:n,kids:[]}; });
    Object.keys(map).forEach(function(k){ var p=k.lastIndexOf('.');
      var par=p>0?map[k.slice(0,p)]:null;
      if(par) par.kids.push(map[k]); else roots.push(map[k]); });
    return roots; }
  /* purely decorative keyed nodes (cover orbs, rails, timeline dots) carry no
     text, no binding and no children — they would be noise in a list meant for
     people who don't read markup. They stay selectable on the canvas. */
  function decorative(node){ return !node.hasAttribute('data-bind') && !node.getAttribute('data-arr')
    && !node.querySelector('[data-el]') && !(node.textContent||'').trim(); }
  /* Which nodes earn a row: the slide's top-level blocks, every list
     container, and every item in one. NOT the leaves inside an item — the
     Selected panel already shows those as labelled inputs, and listing them
     turns a 4-stat slide into 20 rows of "Number / Label / Description". */
  function listed(n,key){
    if(decorative(n)) return false;
    if(key.indexOf('.')<0) return true;                    /* top-level block */
    if(n.getAttribute('data-arr')) return true;            /* a list */
    return /(^|\.)\d+$/.test(key); }                       /* an item in a list */
  /* flat, depth-annotated row list: containers first, then their items */
  function itemRows(sec){ var out=[];
    function walk(entry){ var n=entry.node, key=n.getAttribute('data-el');
      if(listed(n,key)) out.push({node:n,key:key,depth:Math.min(2,key.split('.').length-1)});
      entry.kids.sort(function(a,b){ return a.node.getAttribute('data-el')
        .localeCompare(b.node.getAttribute('data-el'),undefined,{numeric:true}); });
      entry.kids.forEach(walk); }
    keyedTree(sec).forEach(walk);
    [].slice.call(sec.querySelectorAll('.forge-free')).forEach(function(n){
      out.push({node:n,key:n.getAttribute('data-free'),free:true,depth:0});
      partRows(n,out); });
    return out; }
  /* rows for the editable parts inside a content-backed free object, indented
     under it. Same rule as the slide's own elements — lists and list items
     earn a row, the leaves inside them are fields in the Selected panel — and
     the picked root IS the object, so it never gets a second row. */
  function partRows(wrap,out){
    function walk(entry,depth){ var n=entry.node, key=n.getAttribute('data-el');
      if(depth>0&&!decorative(n)&&(n.getAttribute('data-arr')||/(^|\.)\d+$/.test(key)))
        out.push({node:n,key:key,depth:Math.min(2,depth),part:true});
      entry.kids.sort(function(a,b){ return a.node.getAttribute('data-el')
        .localeCompare(b.node.getAttribute('data-el'),undefined,{numeric:true}); });
      entry.kids.forEach(function(k){ walk(k,depth+1); }); }
    keyedTree(wrap,true).forEach(function(e){ walk(e,0); }); }
  F.itemRows=itemRows;
  /* the array a slide's "＋ Add …" button appends to: the one the selection
     sits in, else the first array the layout renders. */
  function primaryArray(sec,slideIdx){
    var sel=F.sel&&F.sel.slideIdx===slideIdx?F.sel.key:null;
    if(sel){ var it=itemOf(sel); if(it&&contentArr(slideIdx,it.path)) return it.path;
      var n=sec.querySelector('[data-el="'+sel+'"]');
      if(n&&n.getAttribute('data-arr')) return n.getAttribute('data-arr'); }
    /* fallback: the slide's OWN first list, never one inside a free object */
    var c=[].slice.call(sec.querySelectorAll('[data-arr]')).filter(function(n){ return !n.closest('.forge-free'); })[0];
    return c?c.getAttribute('data-arr'):null; }
  F.addItemPath=function(slideIdx,path){ if(!contentArr(slideIdx,path)) return false;
    F.do('add item',function(data){ var sc=scopeOf(slideIdx,path,data); if(!sc) return;
      var a=SG.getPath(sc.host.content,sc.key);
      a.push(a.length?newItemLike(a[a.length-1]):{title:''}); }); return true; };
  /* eye toggle -> overrides[key].hide (or freeObject.hide) */
  F.toggleHide=function(slideIdx,key,isFree){
    F.do('show/hide',function(data){ var s=data.slides[slideIdx];
      if(isFree){ var fo=(s.freeObjects||[]).filter(function(f){ return f.id===key; })[0];
        if(fo){ if(fo.hide) delete fo.hide; else fo.hide=1; } return; }
      var sc=scopeOf(slideIdx,key,data); if(!sc) return; var h=sc.host;
      h.overrides=h.overrides||{}; var o=h.overrides[sc.key]=h.overrides[sc.key]||{};
      if(o.hide){ delete o.hide; if(!Object.keys(o).length) delete h.overrides[sc.key]; } else o.hide=1; }); };
  /* An item's row reads from CONTENT, not the DOM: the DOM text of a stat is
     mid-count-up ("0", "3" for 3.2) and runs its fields together. Headline
     goes after the item number ("Stat 3 — 12×"), the descriptive field below. */
  var HEAD_FIELDS=['count','value','title','name','head','quote','year','k','tag','label'];
  var SUB_FIELDS=['label','desc','body','by','sub','v','caption','name','title'];
  function itemSummary(slideIdx,key){
    var sc=scopeOf(slideIdx,key); if(!sc) return null;
    var v=SG.getPath(sc.host.content||{},sc.key);
    if(typeof v==='string'||typeof v==='number') return {head:'',sub:String(v)};
    if(!v||typeof v!=='object') return null;
    var head='',subv='',i;
    for(i=0;i<HEAD_FIELDS.length&&!head;i++) if(v[HEAD_FIELDS[i]]!=null&&v[HEAD_FIELDS[i]]!=='') head=String(v[HEAD_FIELDS[i]]);
    if(head&&v.unit) head+=String(v.unit);
    for(i=0;i<SUB_FIELDS.length&&!subv;i++){ var f=SUB_FIELDS[i];
      if(String(v[f]||'')!==''&&String(v[f])!==head) subv=String(v[f]); }
    return {head:head.slice(0,18),sub:subv}; }
  function isHidden(slideIdx,key,isFree){ var s=SG.data.slides[slideIdx]; if(!s) return false;
    if(isFree){ var fo=(s.freeObjects||[]).filter(function(f){ return f.id===key; })[0]; return !!(fo&&fo.hide); }
    var sc=scopeOf(slideIdx,key); if(!sc) return false;
    return !!((sc.host.overrides||{})[sc.key]||{}).hide; }
  function itemsPanel(host,slideIdx){
    var sec0=deckEl().querySelectorAll('.slide')[slideIdx]; if(!sec0) return;
    var s=el('div','forge-sec forge-items'); s.appendChild(el('div','forge-subh','On this slide'));
    var selKey=(F.sel&&F.sel.slideIdx===slideIdx)?(F.sel.key||F.sel.id):null;
    itemRows(sec0).forEach(function(r){
      var nm=elName(r.node,r.key), hidden=isHidden(slideIdx,r.key,r.free);
      var arrPath=r.node.getAttribute&&r.node.getAttribute('data-arr');
      var row=el('div','forge-item'+(selKey===r.key?' cur':'')+(hidden?' off':''));
      row.style.paddingLeft=(8+r.depth*18)+'px';
      row.appendChild(el('span','forge-item-ico',nm.icon));
      var txt=el('span','forge-item-txt'), name=nm.name, sub;
      if(arrPath) sub=(contentArr(slideIdx,arrPath)||[]).length+' items';
      else { var sm=(!r.free&&/(^|\.)\d+$/.test(r.key))?itemSummary(slideIdx,r.key):null;
        if(sm){ if(sm.head) name+=' — '+sm.head; sub=sm.sub||excerpt(r.node,40); }
        else sub=excerpt(r.node,40); }
      var nmEl=el('span','forge-item-nm'); nmEl.textContent=name;
      var subEl=el('span','forge-item-sub'); subEl.textContent=sub;
      txt.appendChild(nmEl); txt.appendChild(subEl); row.appendChild(txt);
      var eye=el('button','forge-item-eye',hidden?'◌':'👁');
      eye.title=hidden?'Show this element':'Hide this element';
      eye.setAttribute('aria-label',eye.title);
      eye.onclick=function(e){ e.stopPropagation(); F.toggleHide(slideIdx,r.key,r.free); };
      row.appendChild(eye);
      /* two-way hover sync with the canvas */
      row.onmouseenter=function(){ r.node.classList.add('forge-hi'); };
      row.onmouseleave=function(){ r.node.classList.remove('forge-hi'); };
      row.onclick=function(){ selectNode(r.node,false); };
      s.appendChild(row); });
    var btns=el('div','forge-item-btns');
    var path=primaryArray(sec0,slideIdx);
    if(path){ var last=String(path).split('.').pop();
      var add=el('button','forge-btn add','＋ Add '+singular(last).toLowerCase());
      add.title='Append an item to "'+arrayName(path)+'"';
      add.onclick=function(){ F.addItemPath(slideIdx,path); }; btns.appendChild(add); }
    var mg=el('button','forge-btn','⤢ Manage items…');
    mg.title='Edit every field on this slide side by side (and the raw JSON)';
    mg.onclick=function(){ F.structModal(slideIdx); }; btns.appendChild(mg);
    s.appendChild(btns); host.appendChild(s); }

  /* ---- selection breadcrumb: Slide ▸ Stat cards ▸ Stat 3 ----------------
     Floats top-center over the stage. Each chip selects that key prefix, so
     walking UP the hierarchy is discoverable (it used to need Alt-click). */
  var crumbBar=null;
  /* pure path derivation, exported so it can be asserted without a viewport */
  F.crumbPath=function(x){ var parts=[{label:'Slide',key:null}];
    if(!x||!x.section) return parts;
    var sec=x.section;
    if(x.kind==='free'){ parts.push({label:elName(x.node,x.id).name,key:x.id,free:true}); return parts; }
    var seg=String(x.key).split('.'), start=1;
    /* a part of a content-backed free object hangs off that OBJECT, so the
       walk starts there — and skips seg[0], which is the object's own root */
    var p=partOf(x.key);
    if(p){ var fn=sec.querySelector('[data-free="'+p.id+'"]');
      if(fn){ parts.push({label:elName(fn,p.id).name,key:p.id,free:true}); start=2; } }
    for(var i=start;i<=seg.length;i++){ var k=seg.slice(0,i).join('.');
      var n=sec.querySelector('[data-el="'+k+'"]'); if(!n) continue;
      parts.push({label:elName(n,k).name,key:k}); }
    return parts; };
  function buildCrumbs(){
    if(!crumbBar){ crumbBar=el('div','forge-chrome'); crumbBar.id='forge-crumbs'; D.body.appendChild(crumbBar); }
    crumbBar.innerHTML='';
    var x=F.sel;
    if(!x||F.sels.length>1||!editing()||!x.section){ crumbBar.classList.remove('on'); return; }
    var sec=x.section, parts=F.crumbPath(x);
    parts.forEach(function(p,i){
      var b=el('button',i===parts.length-1?'cur':null); b.textContent=p.label;
      b.onclick=function(){ if(!p.key){ clearSel(); F.buildInspect(); return; }
        var n=p.free?sec.querySelector('[data-free="'+p.key+'"]'):sec.querySelector('[data-el="'+p.key+'"]');
        if(n) selectNode(n,false); };
      crumbBar.appendChild(b);
      if(i<parts.length-1) crumbBar.appendChild(el('span','forge-crumb-sep','▸')); });
    crumbBar.classList.add('on'); }

  /* =====================================================================
     ASSET LIBRARY (media plan §2.5) — grid of every imported image/svg
     diagram: import, insert into the current slide, rename (remaps every
     reference), replace file, delete (undoable), and "link instead of
     embed" (media plan §7.3). The size meter is informational only — it
     never blocks an import.
     ===================================================================== */
  function fmtBytes(n){ if(!n) return '0 KB'; if(n>=1024*1024) return (n/1024/1024).toFixed(1)+' MB'; return Math.max(1,Math.round(n/1024))+' KB'; }
  F.assetsPanel=function(){
    var old=D.getElementById('forge-assets'); if(old){ old.remove(); return; }
    if(!F.assets){ return; }                              /* media.js not loaded */
    var o=el('div','forge-chrome'); o.id='forge-assets';
    var card=el('div','forge-assets-card');
    var head=el('div','forge-assets-head'); head.appendChild(el('h3',null,'Assets'));
    var fileInp=el('input'); fileInp.type='file'; fileInp.accept='image/*,.svg'; fileInp.multiple=true; fileInp.hidden=true;
    var imp=el('button','forge-btn primary','＋ Import'); imp.onclick=function(){ fileInp.click(); };
    fileInp.onchange=function(){ var files=[].slice.call(fileInp.files||[]); fileInp.value=''; if(!files.length) return;
      Promise.all(files.map(function(f){ return F.assets.importFile(f).catch(function(err){
        try{ console.warn('slide-forge: import failed for '+f.name,err); }catch(e){} return null; }); }))
        .then(function(){ renderGrid(); F.save(); }); };
    head.appendChild(imp); head.appendChild(fileInp);
    var closeBtn=el('button','forge-btn','Close'); closeBtn.onclick=function(){ o.remove(); }; head.appendChild(closeBtn);
    card.appendChild(head);
    var undoBar=el('div','forge-assets-undo'); undoBar.style.display='none'; card.appendChild(undoBar);
    var grid=el('div','forge-assets-grid'); card.appendChild(grid);
    var meter=el('div','forge-assets-meter'); card.appendChild(meter);
    var dz=el('div','forge-assets-dropzone','Drop images or .svg diagrams here');
    card.appendChild(dz);
    ['dragenter','dragover'].forEach(function(ev){ dz.addEventListener(ev,function(e){ e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave','drop'].forEach(function(ev){ dz.addEventListener(ev,function(e){ e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop',function(e){ var files=[].slice.call((e.dataTransfer&&e.dataTransfer.files)||[]); if(!files.length) return;
      Promise.all(files.map(function(f){ return F.assets.importFile(f).catch(function(){ return null; }); }))
        .then(function(){ renderGrid(); F.save(); }); });

    function showUndoBar(name){ undoBar.innerHTML=''; undoBar.style.display='flex';
      undoBar.appendChild(el('span',null,'Deleted "'+name+'".'));
      var u=el('button','forge-chip','Undo'); u.onclick=function(){ F.assets.undoRemove(); F.save(); renderGrid(); };
      undoBar.appendChild(u);
      clearTimeout(F._assetsUndoT); F._assetsUndoT=setTimeout(function(){ undoBar.style.display='none'; },6000); }

    function toggleLinkForm(cardEl,name){
      var existing=cardEl.querySelector('.forge-asset-linkform'); if(existing){ existing.remove(); return; }
      var entry=(SG.assets.images||{})[name]; var ext=((entry&&entry.type)||'image/png').split('/')[1]||'png';
      var form=el('div','forge-asset-linkform');
      form.appendChild(el('div','forge-hint','Converts this asset to a relative-path reference instead of embedding it. The browser will download the original file — save it at this path next to the deck.'));
      var inp=el('input'); inp.type='text'; inp.value='assets/images/'+name+'.'+ext; form.appendChild(inp);
      var row=el('div','forge-asset-linkform-btns');
      var ok=el('button','forge-btn primary','Convert + download'); var cancel=el('button','forge-btn','Cancel');
      cancel.onclick=function(){ form.remove(); };
      ok.onclick=function(){ var blobSrc=F.assets.linkAsset(name,inp.value);
        if(blobSrc){ var a=el('a'); a.href=blobSrc; a.download=name+'.'+ext; D.body.appendChild(a); a.click(); a.remove(); }
        F.save(); renderGrid(); };
      row.appendChild(ok); row.appendChild(cancel); form.appendChild(row); cardEl.appendChild(form); }

    function assetCard(name,kind){
      var entry=kind==='image'?(SG.assets.images||{})[name]:null;
      var isLinked=entry&&typeof entry==='object'&&entry.store==='linked';
      var c=el('div','forge-asset-card');
      var thumb=el('div','forge-asset-thumb');
      if(kind==='svg'){ thumb.innerHTML=SG.svgMarkup(name)||''; }
      else { var m=SG.imageMeta(name); var img=el('img'); img.alt=m.alt||name; img.loading='lazy'; if(m.src) img.src=m.src; thumb.appendChild(img); }
      c.appendChild(thumb);
      var meta=el('div','forge-asset-meta');
      var nameRow=el('div','forge-asset-name');
      var nameInp=el('input'); nameInp.type='text'; nameInp.value=name; nameInp.className='forge-asset-rename';
      nameInp.onchange=function(){ if(nameInp.value&&nameInp.value!==name){ F.assets.rename(name,nameInp.value); F.save(); renderGrid(); } };
      nameRow.appendChild(nameInp);
      nameRow.appendChild(el('span','forge-asset-badge'+(isLinked?' linked':''),kind==='svg'?'diagram':(isLinked?'linked':'embedded')));
      meta.appendChild(nameRow);
      if(kind==='image'&&entry&&typeof entry==='object'){
        var dims=entry.w&&entry.h?(entry.w+'×'+entry.h):'', weight=entry.bytes?fmtBytes(entry.bytes):'';
        meta.appendChild(el('div','forge-asset-sub',[dims,weight].filter(Boolean).join(' · ')));
        var altInp=el('input'); altInp.type='text'; altInp.placeholder='Alt text'; altInp.value=entry.alt||'';
        altInp.onchange=function(){ entry.alt=altInp.value; F.assets.saveDebounced(); };
        meta.appendChild(altInp);
      }
      c.appendChild(meta);
      var actions=el('div','forge-asset-actions');
      function abtn(lab,fn,cls){ var b=el('button','forge-chip'+(cls?' '+cls:''),lab); b.onclick=fn; actions.appendChild(b); return b; }
      abtn('＋ Insert',function(){ F.addImage(name,kind); o.remove(); });
      if(kind==='image'){
        var repl=el('input'); repl.type='file'; repl.accept='image/*'; repl.hidden=true;
        repl.onchange=function(){ var f=repl.files&&repl.files[0]; repl.value=''; if(!f) return;
          F.assets.replaceFile(name,f).then(function(){ F.save(); renderGrid(); }); };
        abtn('⭯ Replace',function(){ repl.click(); }); actions.appendChild(repl);
        if(!isLinked) abtn('🔗 Link',function(){ toggleLinkForm(c,name); });
      }
      abtn('🗑 Delete',function(){ F.assets.remove(name); F.save(); renderGrid(); showUndoBar(name); },'warn');
      c.appendChild(actions);
      return c; }

    function renderMeter(){ var count=F.assets.count(), bytes=F.assets.bytes();
      meter.className='forge-assets-meter'+(bytes>20*1024*1024?' hot':bytes>8*1024*1024?' warm':'');
      meter.textContent=count+' asset'+(count===1?'':'s')+' · '+fmtBytes(bytes);
      if(bytes>8*1024*1024) meter.appendChild(el('span',null,' — large decks can exceed email attachment limits; consider "Link instead of embed".')); }

    function renderGrid(){ grid.innerHTML='';
      var names=Object.keys(SG.assets.images||{}).sort(), svgNames=Object.keys(SG.assets.svg||{}).sort();
      if(!names.length&&!svgNames.length) grid.appendChild(el('div','forge-hint','No assets yet — Import an image or SVG diagram, or drop files below.'));
      names.forEach(function(n){ grid.appendChild(assetCard(n,'image')); });
      svgNames.forEach(function(n){ grid.appendChild(assetCard(n,'svg')); });
      renderMeter(); }
    renderGrid();
    o.appendChild(card);
    D.body.appendChild(o);
    o.addEventListener('pointerdown',function(e){ if(e.target===o) o.remove(); }); };

  /* ---- embed insert (media plan §6): a small URL prompt, not a full modal ---- */
  F.embedPrompt=function(){
    var old=D.getElementById('forge-embed-prompt'); if(old){ old.remove(); return; }
    var o=el('div','forge-chrome'); o.id='forge-embed-prompt';
    var card=el('div','forge-assets-card'); card.style.width='min(460px,94vw)';
    card.appendChild(el('h3',null,'Embed a link'));
    card.appendChild(el('div','forge-hint','Only http(s) URLs are accepted. The deck will need a network connection to show this live — unreachable/blocked pages fall back to a poster card automatically (including always in print).'));
    var inp=el('input'); inp.type='text'; inp.placeholder='https://…'; inp.style.width='100%'; inp.style.boxSizing='border-box'; inp.style.marginTop='10px';
    var err=el('div','forge-field-error'); err.style.display='none';
    card.appendChild(inp); card.appendChild(err);
    var btns=el('div','forge-struct-btns'); btns.style.marginTop='12px';
    var ins=el('button','forge-btn primary','＋ Insert'); var cancel=el('button','forge-btn','Cancel');
    cancel.onclick=function(){ o.remove(); };
    ins.onclick=function(){ var id=F.addEmbed(inp.value);
      if(!id){ err.textContent='Enter a valid http:// or https:// URL.'; err.style.display='block'; return; }
      o.remove(); };
    inp.onkeydown=function(e){ if(e.key==='Enter'){ e.preventDefault(); ins.click(); } };
    btns.appendChild(ins); btns.appendChild(cancel); card.appendChild(btns);
    o.appendChild(card); D.body.appendChild(o);
    o.addEventListener('pointerdown',function(e){ if(e.target===o) o.remove(); });
    inp.focus(); };

  /* =====================================================================
     MANAGE ITEMS (v4) — the "⤢" popout from the items panel. Two tabs:
       Items    — every field on the slide, side by side, in plain language:
                  the SAME widgets the sidebar content panel builds (one
                  shared renderer), just laid out wide. All edits route
                  through F.do()/renderLiveSlide exactly as in the sidebar.
       Advanced — the v2.2 direct JSON editor, unchanged (copy out / paste
                  back / Apply). Demoted to a tab, never removed: it is the
                  power-user escape hatch and the only way to re-shape a
                  slide wholesale.
     ===================================================================== */
  F.structModal=function(slideIdx){ var old=D.getElementById('forge-struct'); if(old) old.remove();
    var slide=SG.data.slides[slideIdx]; if(!slide) return;
    var o=el('div','forge-chrome'); o.id='forge-struct';
    var card=el('div','forge-struct-card');
    var head=el('div','forge-struct-head');
    var title=(slide.content&&(slide.content.title||slide.content.statement||slide.content.quote))||slide.layout;
    head.appendChild(el('h3',null,'Manage items — “'+SG.esc(plainText(title).slice(0,44))+'”'));
    var tabs=el('div','forge-tabs');
    var tItems=el('button','cur','Items'), tJson=el('button',null,'Advanced (JSON)');
    tabs.appendChild(tItems); tabs.appendChild(tJson); head.appendChild(tabs);
    card.appendChild(head);

    var itemsPane=el('div','forge-struct-pane forge-manage');
    var jsonPane=el('div','forge-struct-pane forge-struct-src'); jsonPane.style.display='none';
    function paintItems(){ itemsPane.innerHTML='';
      var s=SG.data.slides[slideIdx]; s.content=s.content||{};
      if(s.layout==='chart'&&s.content.data) chartPanel(itemsPane,s.content,slideIdx);
      else if(s.layout==='table') tablePanel(itemsPane,s.content,slideIdx);
      else contentForm(itemsPane,s.content,slideIdx);
      itemsPane.appendChild(el('div','forge-hint','Changes apply to the slide instantly. Reordering here reorders the elements on the slide — any styling you gave one follows it automatically.')); }
    paintItems();
    /* structural edits (add/remove/reorder item) re-run buildInspect; keep the
       open modal in step with the data instead of leaving it stale */
    var _bi=F.buildInspect;
    function rewrap(){ F.buildInspect=function(){ _bi.apply(F,arguments);
      if(D.getElementById('forge-struct')===o && jsonPane.style.display==='none') paintItems(); }; }
    rewrap();
    function unwrap(){ F.buildInspect=_bi; }

    jsonPane.appendChild(el('div','forge-subh','Slide JSON (edit or paste, then Apply)'));
    var ta=el('textarea','forge-struct-json'); ta.spellcheck=false;
    ta.value=JSON.stringify(slide,null,2);
    jsonPane.appendChild(ta);
    var msg=el('div','forge-hint'); msg.id='forge-struct-msg'; jsonPane.appendChild(msg);
    card.appendChild(itemsPane); card.appendChild(jsonPane);

    var btns=el('div','forge-struct-btns');
    function sbtn(lab,fn,cls){ var b=el('button','forge-btn '+(cls||''),lab); b.onclick=fn; btns.appendChild(b); return b; }
    var cp=sbtn('⿻ Copy JSON',function(){
      var done=function(){ cp.textContent='✓ Copied'; setTimeout(function(){ cp.textContent='⿻ Copy JSON'; },1200); };
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done,function(){ ta.select(); try{ D.execCommand('copy'); }catch(e){} done(); });
      else { ta.select(); try{ D.execCommand('copy'); }catch(e){} done(); } });
    var ap=sbtn('✓ Apply',function(){ var parsed;
      try{ parsed=JSON.parse(ta.value); }
      catch(e){ msg.textContent='✗ Not valid JSON: '+e.message; msg.style.color='#f0a0a0'; return; }
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||typeof parsed.layout!=='string'){
        msg.textContent='✗ Expected a slide object with a "layout" string.'; msg.style.color='#f0a0a0'; return; }
      if(!SG.layouts[parsed.layout]){ msg.textContent='✗ Unknown layout "'+parsed.layout+'"'; msg.style.color='#f0a0a0'; return; }
      F.do('edit structure',function(data){ data.slides[slideIdx]=parsed; });
      msg.textContent='✓ Applied.'; msg.style.color='#9af0c4';
      ta.value=JSON.stringify(SG.data.slides[slideIdx],null,2); paintItems(); },'primary');
    function close(){ unwrap(); o.remove(); }
    var done=el('button','forge-btn primary','Done'); done.onclick=close;
    done.style.marginLeft='auto'; btns.appendChild(done);
    function tab(json){ jsonPane.style.display=json?'flex':'none'; itemsPane.style.display=json?'none':'block';
      tItems.className=json?'':'cur'; tJson.className=json?'cur':'';
      cp.style.display=ap.style.display=json?'':'none';
      if(json) ta.value=JSON.stringify(SG.data.slides[slideIdx],null,2); else paintItems(); }
    tItems.onclick=function(){ tab(false); }; tJson.onclick=function(){ tab(true); };
    tab(false);
    card.appendChild(btns); o.appendChild(card); D.body.appendChild(o);
    o.addEventListener('pointerdown',function(e){ if(e.target===o) close(); }); };

  /* geometry inputs kept in sync during drags */
  var geomInputs=null;
  function syncGeomFields(){ if(!geomInputs||!F.sel) return; var d=selData()||{};
    if(geomInputs.x) geomInputs.x.value=d.x||0; if(geomInputs.y) geomInputs.y.value=d.y||0;
    if(geomInputs.scale) geomInputs.scale.value=d.scale||1; if(geomInputs.rot) geomInputs.rot.value=d.rot||0; }

  /* ---- the Inspector ---- */
  var _inspSlide=-1;
  F.buildInspect=function(){ var body=D.getElementById('forge-inspbody'); if(!body) return; body.innerHTML=''; geomInputs=null;
    var i=curSlide(), slide=(SG.data.slides||[])[i]; if(!slide) return;
    /* the scrollable element is the ANCESTOR panel (#forge-inspect), not this
       body div, so replacing body's content alone leaves old scroll in place —
       reset it back to "On this slide" only when the slide actually changed,
       not on every edit-triggered rebuild (that would fight in-place tweaking) */
    if(i!==_inspSlide){ _inspSlide=i; var panel=body.parentNode; if(panel) panel.scrollTop=0; }
    /* v4: the items panel is the sidebar's home view and stays put while
       something is selected — the "Selected" panel appears BELOW it, so the
       list you picked from never disappears under you. */
    itemsPanel(body,i);
    if(F.sels.length>1){ objectPanelMulti(body); return; }
    if(F.sel){ objectPanel(body,F.sel); return; }
    contentPanel(body,slide,i);
    slidePanel(body,slide,i); deckPanel(body); };

  function sec(body,title){ var s=el('div','forge-sec'); s.appendChild(el('div','forge-subh',title)); body.appendChild(s); return s; }
  /* collapsible sub-section: the contextual inspector shows a lot, so the
     advanced groups fold away. Open/closed is remembered per title. */
  F._open={'Style & formatting':true};
  function fold(host,title,defOpen){
    var open=F._open[title]!=null?F._open[title]:!!defOpen;
    var h=el('div','forge-fold-h'+(open?' on':''));
    h.appendChild(el('span','forge-fold-tg',open?'▾':'▸'));
    h.appendChild(el('span','forge-fold-lb',title));
    var b=el('div','forge-fold-b'); b.style.display=open?'block':'none';
    h.onclick=function(){ F._open[title]=!open; b.style.display=open?'none':'block';
      h.classList.toggle('on',!open); h.querySelector('.forge-fold-tg').textContent=open?'▸':'▾'; open=!open; };
    host.appendChild(h); host.appendChild(b); return b; }

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
    (slide.freeObjects||[]).forEach(function(fo){ if(fo.anim) anims.push({key:fo.id,d:fo,free:true});
      /* a content-backed copy's parts can be animated too — their overrides
         live in the object's own bag, under its namespace */
      Object.keys(fo.overrides||{}).forEach(function(k){
        if(fo.overrides[k]&&fo.overrides[k].anim) anims.push({key:partKey(fo.id,k),d:fo.overrides[k],free:false}); }); });
    if(anims.length){ s.appendChild(el('div','forge-subh','Animations on this slide'));
      var sec0=deckEl().querySelectorAll('.slide')[i];
      anims.sort(function(a,b){ return (a.d.animStep||0)-(b.d.animStep||0); });
      anims.forEach(function(a){ var row=el('div','forge-anim-row');
        var lb=el('span','lb'); lb.textContent=(a.free?'★ ':partOf(a.key)?'★ ':'')+deNs(a.key)+' · '+a.d.anim
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

  function deckPanel(body){ deckSettings(body); themeSection(body); brandPanel(body); }
  /* deck-wide settings — rendered into the sidebar AND into the ⚙ Deck modal */
  function deckSettings(body){ var s=sec(body,'Deck');
    var meta=SG.data.meta=SG.data.meta||{};
    s.appendChild(field('Title',boundText(meta,'title')));
    /* build steps: click-to-reveal is opt-in so browsing/editing always shows everything */
    var bs=el('input'); bs.type='checkbox'; bs.checked=!!(SG.data.defaults&&SG.data.defaults.buildSteps);
    bs.onchange=function(){ F.do('build steps',function(data){ data.defaults=data.defaults||{};
      if(bs.checked) data.defaults.buildSteps=true; else delete data.defaults.buildSteps; }); };
    s.appendChild(fieldRow('Build steps (click-to-reveal)',bs));
    s.appendChild(el('div','forge-hint','Off (default): everything is visible everywhere. On: while presenting, elements with an On-click trigger wait for → / Space / click.')); }
  /* theme picker + token grid — sidebar AND the ◐ Theme modal */
  function themeSection(body){ var s=sec(body,'Theme');
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
    s.appendChild(el('div','forge-hint','Theme tokens recolor everything — layouts, charts, ambients — because nothing hard-codes color.')); }

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

  /* =====================================================================
     CONTEXTUAL INSPECTOR (v4) — "SELECTED". Shows only what applies to the
     current selection kind (text leaf / list container / list item / free
     object): a friendly identity card, that element's own content fields,
     a text-size stepper, theme-token colors + whole-element formatting, and
     the list verbs for an item. Geometry, link and animation fold away.
     ===================================================================== */
  /* which content this selection edits: one bound field, or a whole item /
     object's fields. Containers and unbound composites return null. */
  function contentTargetOf(sel){
    var c, key, own=null;
    if(sel.kind==='free'){
      /* a content-backed free object resolves to the content it re-renders
         from, at the branch it was copied from — so selecting an inserted
         metric ring shows Value / Suffix / Label straight away, with no
         drill-down. Every other free type has no content model. */
      var fo=freeFor(sel.slideIdx,sel.id);
      if(!fo||fo.type!=='node'||!fo.pick) return null;
      c=fo.content||{}; key=fo.pick; own=fo;
      /* the object's root may itself be a bound leaf or a list container */
      var rn=sel.node.querySelector('[data-el="'+partKey(fo.id,fo.pick)+'"]');
      if(rn&&rn.getAttribute('data-arr')) return null; }
    else { var sc=scopeOf(sel.slideIdx,sel.key); if(!sc) return null;
      c=sc.host.content||{}; key=sc.key; own=sc.free;
      var bind=deNs(sel.node.getAttribute&&sel.node.getAttribute('data-bind'));
      if(bind) return single(bind);
      if(sel.node.getAttribute&&sel.node.getAttribute('data-arr')) return null; }  /* container: count + Add instead */
    function single(path){ var p=path.lastIndexOf('.');
      var parent=p>0?SG.getPath(c,path.slice(0,p)):c, k=p>0?path.slice(p+1):path;
      return (parent&&typeof parent==='object')
        ?{single:true,obj:parent,key:k,path:p>0?path.slice(0,p)+'.':'',own:own}:null; }
    if(!key) return null;
    var val=SG.getPath(c,key);
    if(Array.isArray(val)) return null;
    if(val&&typeof val==='object') return {obj:val,path:key+'.',own:own};
    if(typeof val==='string'||typeof val==='number') return single(key);
    return null; }
  /* whole-element formatting: wrap/unwrap the bound content value in the
     same markers rich() renders (**bold**, [[glow]], `mono`). Range-level
     formatting stays on the canvas toolbar — see the hint copy. */
  var MARKS={b:['**','**'],g:['[[',']]'],m:['`','`']};
  function hasMark(v,k){ var m=MARKS[k]; v=String(v==null?'':v).trim();
    return v.length>m[0].length+m[1].length&&v.slice(0,m[0].length)===m[0]&&v.slice(-m[1].length)===m[1]; }
  function toggleMark(v,k){ var m=MARKS[k], t=String(v==null?'':v).trim();
    return hasMark(t,k)?t.slice(m[0].length,t.length-m[1].length):m[0]+t+m[1]; }

  /* reorder one list item and KEEP IT SELECTED (design decision: the
     selection follows the item, so repeated ↑ presses walk it up a list). */
  function moveItem(sel,dir){ var it=itemOf(sel.key); if(!it) return;
    var a=contentArr(sel.slideIdx,it.path); if(!a) return;
    var j=it.idx+dir; if(j<0||j>=a.length) return;
    F.do('reorder',function(data){ var sc=scopeOf(sel.slideIdx,it.path,data); if(!sc) return;
      var arr2=SG.getPath(sc.host.content,sc.key), t=arr2[j]; arr2[j]=arr2[it.idx]; arr2[it.idx]=t;
      swapItemOverrides(sc.host,sc.key,it.idx,j); });
    reselectKey(sel.slideIdx,it.path+'.'+j); }
  function reselectKey(slideIdx,key){ var sc=deckEl().querySelectorAll('.slide')[slideIdx];
    var n=sc&&sc.querySelector('[data-el="'+key+'"]'); if(n) selectNode(n,false); }
  function dupItemSel(sel){ var it=itemOf(sel.key); if(!it) return;
    if(F.dupItem(sel.slideIdx,sel.node)) reselectKey(sel.slideIdx,it.path+'.'+(it.idx+1)); }
  function secPlain(body){ var s=el('div','forge-sec'); body.appendChild(s); return s; }

  function objectPanel(body,sel){ var d=selData()||{}; var isFree=sel.kind==='free'; var isMedia=isFree&&MEDIA_FREE[d.type];
    var isEmbed=isFree&&d.type==='embed';
    var isNode=isFree&&d.type==='node';
    /* only these free types actually RENDER fo.text (see decorateSection) —
       showing a Text box for the others gave html/node objects a field that
       looked editable, changed nothing, and persisted a dead key */
    var hasFreeText=isFree&&!/^(html|node|image|svg|embed|box)$/.test(d.type||'txt');
    var isText=!isFree&&isLeafText(sel.node);
    var arrPath=!isFree&&sel.node.getAttribute?sel.node.getAttribute('data-arr'):null;
    var it=!isFree?itemOf(sel.key):null;
    var isItem=!!(it&&sel.key===it.path+'.'+it.idx&&contentArr(sel.slideIdx,it.path));
    var nm=elName(sel.node,isFree?sel.id:sel.key);
    var s=sec(body,'Selected');

    /* identity: plain name up front, dotted key demoted to a debug chip */
    var id=el('div','forge-ident');
    id.appendChild(el('span','forge-ident-ico',nm.icon));
    var idn=el('span','forge-ident-nm'); idn.textContent=nm.name; id.appendChild(idn);
    var idk=el('span','forge-ident-key');
    idk.textContent=isNode?('copy · '+(d.pick||d.layout)):isFree?'free object':deNs(sel.key);
    idk.title='The key this element’s styling is stored under'; id.appendChild(idk);
    s.appendChild(id);

    /* ---- content of the selection itself ---- */
    if(hasFreeText){ var t=el('textarea'); t.rows=2; t.value=d.text||'';
      t.onfocus=function(){ F.pushUndo(); }; t.oninput=function(){ d.text=t.value; F.renderLiveSlide(); };
      var f=el('div','forge-field'); f.appendChild(el('label',null,'Text')); f.appendChild(t); s.appendChild(f); }
    var tgt=contentTargetOf(sel);
    if(tgt){ if(tgt.single) fieldFor(s,tgt.obj,tgt.key,sel.slideIdx,tgt.path,tgt.own);
      else contentForm(s,tgt.obj,sel.slideIdx,tgt.path,tgt.own); }
    if(isFree&&d.type==='html')
      s.appendChild(el('div','forge-hint','This is a <b>static copy</b> — it keeps the look of what it was copied from, but not its editable fields. Newer copies (⧉ Duplicate, ⊞ Insert) re-render from data and stay editable.'));
    if(isNode)
      s.appendChild(el('div','forge-hint','A copy of the <b>'+(d.pick||'')+'</b> element from the <b>'+d.layout+'</b> layout. It re-renders from its own data, so edits here never touch the original.'));
    /* a node object whose root is a list: same "pick one inside" treatment */
    if(isNode&&!tgt){ var rootArr=sel.node.querySelector('[data-el="'+partKey(sel.id,d.pick)+'"]');
      arrPath=rootArr&&rootArr.getAttribute('data-arr'); }
    if(arrPath){ var n=(contentArr(sel.slideIdx,arrPath)||[]).length;
      var one=singular(String(deNs(arrPath)).split('.').pop());
      s.appendChild(el('div','forge-hint','This is the whole list ('+n+' '+(n===1?one.toLowerCase():one.toLowerCase()+'s')+'). Pick one inside it — on the slide or in the list above — to edit it.'));
      var ab=el('button','forge-btn add','＋ Add '+one.toLowerCase());
      ab.onclick=function(){ F.addItemPath(sel.slideIdx,arrPath); }; s.appendChild(ab); }

    /* ---- text size: a direct px stepper, not an abstract scale ---- */
    if(isText||(isFree&&d.type==='txt')){
      var prop=isFree?'size':'fs';
      var cur=d[prop]||Math.round(parseFloat(W.getComputedStyle(sel.node).fontSize)||34);
      var row=el('div','forge-field row'); row.appendChild(el('label',null,'Text size'));
      var step=el('div','forge-step');
      var dn=el('button','forge-chip','−'), val=el('span','forge-step-v',cur+''), up=el('button','forge-chip','＋');
      function bump(delta){ F.pushUndoCoalesced('obj-fs'); cur=clamp(cur+delta,10,200); d[prop]=cur; val.textContent=cur+'';
        isFree?applyFree(sel.node,d):applyOverride(sel.node,d); refreshHandles(); positionFloat(); F.saveDebounced(); }
      dn.title='Smaller'; up.title='Bigger';
      dn.onclick=function(){ bump(-2); }; up.onclick=function(){ bump(2); };
      step.appendChild(dn); step.appendChild(val); step.appendChild(up);
      row.appendChild(step); s.appendChild(row); }

    /* ---- style & formatting (theme tokens, never hex) ---- */
    var fmtTxt=hasFreeText;                    /* format the object's own text */
    var canFmt=!!(tgt&&tgt.single&&typeof tgt.obj[tgt.key]==='string')||fmtTxt;
    if(!isMedia&&!isEmbed){
      var sf=fold(s,'Style & formatting',true);
      sf.appendChild(el('label',null,'Text color'));
      var sw=el('div','forge-swatches');
      ['--ink','--cyan','--indigo','--mint','--muted'].forEach(function(tk){
        var ref='var('+tk+')';
        var b=el('button','forge-swatch'+(d.color===ref?' on':''));
        b.style.background=W.getComputedStyle(D.documentElement).getPropertyValue(tk).trim()||'#888';
        b.title=tk+' (follows the theme)';
        b.onclick=function(){ F.pushUndo(); d.color=ref;
          isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.save(); F.buildInspect(); };
        sw.appendChild(b); });
      var rst=el('button','forge-chip','Reset');
      rst.onclick=function(){ F.pushUndo(); delete d.color; sel.node.style.color='';
        isFree?applyFree(sel.node,d):applyOverride(sel.node,d); F.save(); F.buildInspect(); };
      sw.appendChild(rst); sf.appendChild(sw);
      if(canFmt){
        sf.appendChild(el('label',null,'Formatting'));
        var chips=el('div','forge-fmtchips');
        [['B','b'],['✦','g'],['<>','m']].forEach(function(p){
          var read=function(){ return fmtTxt?d.text:tgt.obj[tgt.key]; };
          var b=el('button','forge-fmtchip'+(hasMark(read(),p[1])?' on':''),p[0]);
          b.title=({b:'Bold',g:'Glow (accent color)',m:'Monospace'})[p[1]]+' the whole element';
          b.onclick=function(){ F.do('format',function(data){
            if(fmtTxt){ var fo=freeFor(sel.slideIdx,sel.id); fo.text=toggleMark(fo.text,p[1]); return; }
            /* tgt.own = the content-backed free object that owns this field,
               when the selection is inside a copy rather than on the slide */
            var c=(tgt.own||data.slides[sel.slideIdx]).content, path=tgt.path+tgt.key;
            SG.setPath(c,path,toggleMark(SG.getPath(c,path),p[1])); }); };
          chips.appendChild(b); });
        sf.appendChild(chips);
        sf.appendChild(el('div','forge-hint','These apply to the <b>whole element</b>. To format <b>part of the text</b>, double-click it on the slide and highlight a range — a floating B / ✦ / <code>&lt;&gt;</code> toolbar appears over the selection.')); }
      sf.appendChild(field('Font',selectInput(F.fontChoices,d.font||'',function(v){ F.pushUndo(); d.font=v;
        isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.save(); })));
      sf.appendChild(fieldRow('Exact color',colorInput(d.color,function(v){ F.pushUndoCoalesced('obj-color'); d.color=v;
        isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.saveDebounced(); })));
      sf.appendChild(fieldRow('Accent',colorInput((d.theme&&d.theme['--cyan'])||'',function(v){ F.pushUndoCoalesced('obj-accent');
        d.theme=d.theme||{}; d.theme['--cyan']=v; isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.saveDebounced(); })));
      sf.appendChild(fieldRow('Surface',colorInput((d.theme&&d.theme['--panel'])||'',function(v){ F.pushUndoCoalesced('obj-surface');
        d.theme=d.theme||{}; d.theme['--panel']=v; isFree?applyFree(sel.node,d):applyOverride(sel.node,d); pulse(sel.node); F.saveDebounced(); })));
      sf.appendChild(el('div','forge-hint','Swatches write theme tokens (var(--cyan)), so re-theming and brand kits keep working. "Exact color" pins one literal color.')); }

    /* ---- list verbs for an item ---- */
    if(isItem){ var verbs=el('div','forge-verbs');
      function verb(lab,title,fn,cls){ var b=el('button','forge-chip '+(cls||''),lab); b.title=title;
        b.onclick=fn; verbs.appendChild(b); }
      verb('↑','Move earlier',function(){ moveItem(sel,-1); });
      verb('↓','Move later',function(){ moveItem(sel,1); });
      verb('⧉ Duplicate','Duplicate this item',function(){ dupItemSel(sel); });
      verb('✕ Remove','Remove this item',function(){ F.removeItem(sel.slideIdx,sel.node); },'warn');
      s.appendChild(verbs);
      s.appendChild(el('div','forge-hint','Drag the item on the slide to move it; the corner handle resizes it and the text rewraps.')); }

    /* ---- geometry ---- */
    var sg=fold(secPlain(body),'Position & size',false);
    geomInputs={};
    function num(label,key,step){ var n=el('input'); n.type='number'; if(step)n.step=step; n.value=d[key]||(key==='scale'?1:0);
      n.onfocus=function(){ F.pushUndo(); };
      n.oninput=function(){ var v=parseFloat(n.value);
        if((key==='w'||key==='h')&&(isNaN(v)||v<=0)) delete d[key];   /* 0/blank = back to natural size */
        else d[key]=isNaN(v)?0:v;
        isFree?applyFree(sel.node,d):applyOverride(sel.node,d); refreshHandles(); positionFloat(); pulse(sel.node); F.saveDebounced(); };
      geomInputs[key]=n; sg.appendChild(fieldRow(label,n)); }
    num('X','x'); num('Y','y'); num('Scale','scale','0.05'); num('Rotate','rot');
    num('Width','w');                                       /* width reflows text (0 = natural) */
    if(isFree&&(d.type==='box'||d.type==='html'||isMedia||isEmbed)) num('Height','h');
    if(isEmbed){
      var se=sec(body,'Embed');
      function reapplyEmbed(){ var n=sel.node; var host=n; /* remount: URL/mode/sandbox changes need a fresh iframe */
        [].slice.call(n.querySelectorAll('.sf-embed-iframe-wrap,.sf-embed-shield,.sf-embed-poster,.sf-unavail')).forEach(function(x){ x.remove(); });
        n.classList.remove('sf-embed'); if(SG.mountEmbed) SG.mountEmbed(host,d); applyFree(n,d); }
      /* Fill-slide toggle: quick full-bleed sizing (0,0,1280,720), remembers
         the prior geometry so a second click restores it. Ordinary corner
         drag / the Width & Height fields keep working normally afterward in
         either state — this is a starting point, not a locked mode. */
      var fillBtn=el('button','forge-btn',d.fillPrev?'⛶ Restore previous size':'⛶ Fill slide');
      fillBtn.style.marginBottom='8px';
      fillBtn.onclick=function(){ F.pushUndo();
        if(d.fillPrev){ var p=d.fillPrev; d.x=p.x; d.y=p.y; d.w=p.w; d.h=p.h; delete d.fillPrev; }
        else { d.fillPrev={x:d.x||0,y:d.y||0,w:d.w||480,h:d.h||270}; d.x=0; d.y=0; d.w=1280; d.h=720; }
        applyFree(sel.node,d); refreshHandles(); positionFloat(); syncGeomFields(); F.save(); F.buildInspect(); };
      se.appendChild(fillBtn);
      var urlInp=el('input'); urlInp.type='text'; urlInp.placeholder='https://…'; urlInp.value=d.url||'';
      var urlErr=el('div','forge-field-error'); urlErr.style.display='none';
      urlInp.onfocus=function(){ F.pushUndo(); };
      urlInp.onchange=function(){ var v=urlInp.value.trim();
        if(v&&!(SG.embedUrlOk&&SG.embedUrlOk(v))){ urlErr.textContent='Only http:// or https:// URLs are allowed.'; urlErr.style.display='block'; return; }
        urlErr.style.display='none'; d.url=v; reapplyEmbed(); F.save(); };
      se.appendChild(field('URL',urlInp)); se.appendChild(urlErr);
      se.appendChild(field('Mode',selectInput([['Click to interact','click'],['Always live','live'],['Poster only (never loads)','poster']],
        d.mode||'click',function(v){ F.pushUndo(); d.mode=v; reapplyEmbed(); F.save(); })));
      se.appendChild(field('Poster',assetPickerField(d,'poster','image')));
      var titleInp=el('input'); titleInp.type='text'; titleInp.value=d.title||'';
      titleInp.onfocus=function(){ F.pushUndo(); }; titleInp.onchange=function(){ d.title=titleInp.value; reapplyEmbed(); F.save(); };
      se.appendChild(field('Title (accessibility + poster caption)',titleInp));
      d.sandbox=d.sandbox||{};
      var so=el('input'); so.type='checkbox'; so.checked=!!d.sandbox.sameOrigin;
      so.onchange=function(){ F.pushUndo(); d.sandbox.sameOrigin=so.checked; reapplyEmbed(); F.save(); };
      se.appendChild(fieldRow('Trust this site (cookies/storage)',so));
      se.appendChild(el('div','forge-hint','Only enable "Trust" for sites you control — combined with scripts it lets the page reach outside its sandbox if it shares your deck’s origin.'));
    }
    if(isMedia){
      var sm=sec(body,d.type==='svg'?'Diagram':'Image');
      var altInp=el('input'); altInp.type='text'; altInp.value=d.alt||'';
      altInp.onfocus=function(){ F.pushUndo(); };
      altInp.oninput=function(){ d.alt=altInp.value; F.saveDebounced(); };
      sm.appendChild(field('Alt text',altInp));
      if(d.type==='image'){
        sm.appendChild(field('Fit',selectInput([['Cover (crop)','cover'],['Contain (letterbox)','contain'],['Fill (stretch)','fill']],
          d.fit||'cover',function(v){ F.pushUndo(); d.fit=v; applyFree(sel.node,d); pulse(sel.node); F.save(); })));
        var fx=el('input'); fx.type='range'; fx.min='0'; fx.max='1'; fx.step='0.01'; fx.value=(d.focal&&d.focal[0]!=null)?d.focal[0]:0.5;
        var fy=el('input'); fy.type='range'; fy.min='0'; fy.max='1'; fy.step='0.01'; fy.value=(d.focal&&d.focal[1]!=null)?d.focal[1]:0.5;
        function setFocal(){ d.focal=[parseFloat(fx.value),parseFloat(fy.value)]; applyFree(sel.node,d); F.saveDebounced(); }
        fx.onfocus=fy.onfocus=function(){ F.pushUndoCoalesced('obj-focal'); }; fx.oninput=fy.oninput=setFocal;
        sm.appendChild(fieldRow('Focal X',fx)); sm.appendChild(fieldRow('Focal Y',fy));
      }
      var rad=el('input'); rad.type='number'; rad.min='0'; rad.value=d.radius||0;
      rad.onfocus=function(){ F.pushUndo(); }; rad.oninput=function(){ d.radius=parseFloat(rad.value)||0; applyFree(sel.node,d); F.saveDebounced(); };
      sm.appendChild(fieldRow('Corner radius',rad));
      var op=el('input'); op.type='range'; op.min='0'; op.max='1'; op.step='0.05'; op.value=d.opacity!=null?d.opacity:1;
      op.onfocus=function(){ F.pushUndo(); }; op.oninput=function(){ d.opacity=parseFloat(op.value); applyFree(sel.node,d); F.saveDebounced(); };
      sm.appendChild(fieldRow('Opacity',op));
      sm.appendChild(field('Frame',selectInput([['None','none'],['Panel','panel'],['Glow','glow'],['Shadow','shadow']],
        d.frame||'none',function(v){ F.pushUndo(); d.frame=v; applyFree(sel.node,d); pulse(sel.node); F.save(); })));
    }
    var adv=secPlain(body);
    var s6=fold(adv,'Link',false);
    var hrefInp=el('input'); hrefInp.type='text'; hrefInp.placeholder='https://… · mailto:… · #3'; hrefInp.value=d.href||'';
    var hrefErr=el('div','forge-field-error'); hrefErr.style.display='none';
    hrefInp.onfocus=function(){ F.pushUndo(); };
    hrefInp.onchange=function(){ var r=F.sanitizeHref(hrefInp.value);
      if(!r.ok){ hrefErr.textContent='Only https://, mailto:, or #<slide number> links are allowed.'; hrefErr.style.display='block'; return; }
      hrefErr.style.display='none';
      if(r.value) d.href=r.value; else delete d.href;
      isFree?applyFree(sel.node,d):applyOverride(sel.node,d); F.save(); };
    s6.appendChild(field('URL',hrefInp)); s6.appendChild(hrefErr);
    s6.appendChild(el('div','forge-hint','Jump to a slide with #3, or link out with a full https:// URL. Shows a small ↗ badge here in the editor only.'));
    var s3=fold(adv,'Animation',!!d.anim);
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
  /* insert an image/svg free object referencing an asset already in the
     registry, sized from its intrinsic aspect ratio (media plan §3). Shared
     by the asset library panel's "Insert" and canvas drop-import. */
  F.addImage=function(assetName,kind,atXY){ var i=curSlide(); var id=uid();
    var isSvg=kind==='svg';
    var meta=!isSvg&&SG.imageMeta?SG.imageMeta(assetName):null;
    var w=360,h=240;
    if(meta&&meta.w&&meta.h){ var s=Math.min(1,640/Math.max(meta.w,meta.h)); w=Math.max(60,Math.round(meta.w*s)); h=Math.max(40,Math.round(meta.h*s)); }
    var x=atXY?Math.round(atXY.x-w/2):Math.round(640-w/2), y=atXY?Math.round(atXY.y-h/2):Math.round(360-h/2);
    F.do('add '+(isSvg?'diagram':'image'),function(data){ var sl=data.slides[i]; sl.freeObjects=sl.freeObjects||[];
      sl.freeObjects.push({id:id,type:isSvg?'svg':'image',asset:assetName,x:x,y:y,w:w,h:h,rot:0,
        fit:'cover',focal:[0.5,0.5],radius:0,opacity:1,frame:'none',alt:(meta&&meta.alt)||''}); });
    var sec=deckEl().querySelectorAll('.slide')[i]; var n=sec&&sec.querySelector('[data-free="'+id+'"]'); if(n) selectNode(n,false);
    return id; };
  /* insert a sandboxed embed object (media plan §6). Rejects anything not
     http(s) up front — same allow-list SG.mountEmbed enforces at render. */
  F.addEmbed=function(url){ url=(url||'').trim(); if(!SG.embedUrlOk||!SG.embedUrlOk(url)) return null;
    var i=curSlide(); var id=uid(), w=480, h=270;
    F.do('add embed',function(data){ var sl=data.slides[i]; sl.freeObjects=sl.freeObjects||[];
      sl.freeObjects.push({id:id,type:'embed',url:url,x:Math.round(640-w/2),y:Math.round(360-h/2),w:w,h:h,rot:0,
        mode:'click',sandbox:{scripts:true,popups:true,forms:false,sameOrigin:false},title:''}); });
    var sec=deckEl().querySelectorAll('.slide')[i]; var n=sec&&sec.querySelector('[data-free="'+id+'"]'); if(n) selectNode(n,false);
    return id; };

  /* =====================================================================
     TOP-BAR VERBS (v4) — sorter toggle, image import, theme/deck modals and
     the ⊞ Insert element gallery. Everything here is a thin shell over verbs
     that already exist (F.addImage, deckPanel, freeObjects), surfaced where
     someone who has never opened the sidebar will find them.
     ===================================================================== */
  F.toggleSorter=function(){ F._sorter=!F._sorter;
    var chip=D.getElementById('forge-sorter-toggle'); if(chip) chip.classList.toggle('add',F._sorter);
    if(F._sorterBtn) F._sorterBtn.classList.toggle('primary',F._sorter);
    F.buildNav(); };
  /* ▣ Image: pick a file, import it into the registry, drop it on the slide.
     Same path as drag-and-drop onto the canvas — just discoverable. */
  F.imagePrompt=function(){ if(!F.assets){ F.assetsPanel(); return; }
    var inp=el('input'); inp.type='file'; inp.accept='image/*,.svg'; inp.multiple=true; inp.hidden=true;
    inp.onchange=function(){ var files=[].slice.call(inp.files||[]); inp.value=''; if(!files.length) return;
      files.reduce(function(chain,f,i){ return chain.then(function(){
        return F.assets.importFile(f).then(function(res){ F.addImage(res.name,res.kind,{x:640+i*24,y:360+i*24}); F.save(); })
          .catch(function(err){ try{ console.warn('slide-forge: import failed for '+f.name,err); }catch(e){} }); }); },Promise.resolve()); };
    D.body.appendChild(inp); inp.click(); setTimeout(function(){ inp.remove(); },4000); };
  /* ◐ Theme / ⚙ Deck: the deck-wide sections, in a modal, so they are not
     buried behind "deselect everything first". Same renderers as the sidebar. */
  F.deckModal=function(which){ var old=D.getElementById('forge-deckmodal'); if(old) old.remove();
    var o=el('div','forge-chrome'); o.id='forge-deckmodal';
    var card=el('div','forge-struct-card'); card.style.width='min(560px,94vw)';
    var head=el('div','forge-struct-head');
    head.appendChild(el('h3',null,which==='theme'?'Theme & brand':'Deck settings'));
    card.appendChild(head);
    var pane=el('div','forge-struct-pane');
    function paint(){ pane.innerHTML='';
      if(which==='theme'){ themeSection(pane); brandPanel(pane); } else deckSettings(pane); }
    paint();
    card.appendChild(pane);
    /* a theme-preset change (or any other data edit) runs F.commit -> F.buildInspect;
       repaint this pane in step so it never shows stale tokens/brand state (was a
       one-time snapshot before — matches the struct-modal rewrap pattern above) */
    var _bi=F.buildInspect;
    function rewrap(){ F.buildInspect=function(){ _bi.apply(F,arguments);
      if(D.getElementById('forge-deckmodal')===o) paint(); }; }
    rewrap();
    function close(){ F.buildInspect=_bi; o.remove(); }
    var btns=el('div','forge-struct-btns');
    var done=el('button','forge-btn primary','Done'); done.style.marginLeft='auto';
    done.onclick=close; btns.appendChild(done);
    card.appendChild(btns); o.appendChild(card); D.body.appendChild(o);
    o.addEventListener('pointerdown',function(e){ if(e.target===o) close(); }); };

  /* ---- ⊞ Insert an element ---------------------------------------------
     One catalog entry per insertable element type across the layouts. The
     CONTENT comes from the DEFAULTS map (so an entry can never drift from
     what a fresh slide of that layout contains) and the preview is a live,
     scaled miniature of the real element — not a hand-drawn shape. Insert
     lands it as a themed, CONTENT-BACKED free object ({type:'node'}) — the
     same path Ctrl+D uses — centred on the current slide and selected. It
     carries the layout + content it was built from, so it keeps its fields
     and list verbs instead of freezing into markup.
     Entries whose key is missing (a layout changed) are skipped silently. */
  var GALLERY=[
    ['Stat card','stat-grid','stats.0'], ['Agenda item','agenda','items.0'],
    ['Timeline event','timeline','items.0'], ['Pipeline step','pipeline','nodes.0'],
    ['Quote','quote','quote'], ['Big number','bignum','num'],
    ['Comparison column','comparison','left'], ['Metric ring','metric-dash','ring'],
    ['Metric tile','metric-dash','tiles.0'], ['Leaderboard row','leaderboard','rows.0'],
    ['Matrix cell','matrix','cells.0'], ['Stack band','stack','bands.0'],
    ['Takeaway card','closing','takeaways.0'], ['Code block','code','panel'],
    ['Editorial column','editorial','columns.0'], ['Index card','index-mosaic','items.0'],
    ['Quote card','quote-mosaic','quotes.0'], ['Hero row','hero-asym','rows.0'],
    ['Section number','divider','index'], ['Statement','manifesto','statement'],
    ['Kicker','stat-grid','kicker',{kicker:'Section label'}], ['Title','stat-grid','title']
  ];
  /* render one layout's DEFAULTS into a detached, styled section and hand back
     the element carrying `key`. The section is attached to the deck (hidden)
     so the deck's CSS cascade applies and the node has real measured size. */
  function galleryNode(layout,key,extra){
    var fn=SG.layouts[layout]; if(!fn) return null;
    /* mirror buildSection's classList exactly: some layouts' CSS targets the
       bare layout name ON THE SECTION (quote, bignum, …) — without it here,
       e.g. the quote layout's blockquote loses its font-size/quote-mark rules
       and measures at default paragraph height, so the inserted copy lands
       squashed at the h-clamp floor below */
    var secCls=(SG.SECTION_LAYOUTS&&SG.SECTION_LAYOUTS[layout])?(' '+layout):'';
    var host=el('section','slide active'+secCls+' lyt-'+layout+' forge-ghost');
    var c=clone(DEFAULTS[layout]||{});
    if(extra) Object.keys(extra).forEach(function(k){ c[k]=extra[k]; });   /* fill fields DEFAULTS leaves blank */
    var out; try{ out=fn(c,{index:0,total:1}); }catch(e){ return null; }
    if(!out||out.raw!=null) return null;
    (function add(x){ if(x==null||x===false) return;
      if(Array.isArray(x)){ x.forEach(add); return; }
      host.appendChild(x.nodeType?x:D.createTextNode(String(x))); })(out);
    deckEl().appendChild(host);
    var node=host.querySelector('[data-el="'+key+'"]');
    return node?{host:host,node:node}:(host.remove(),null); }
  function cleanCopy(node){ var cl=node.cloneNode(true);
    [].slice.call(cl.querySelectorAll('.forge-handles,.forge-guides,.forge-free,.sf-embed-iframe-wrap,.sf-embed-shield')).forEach(function(n){ n.remove(); });
    [].slice.call(cl.querySelectorAll('[data-el]')).forEach(function(n){
      n.removeAttribute('data-el'); n.removeAttribute('data-bind'); n.removeAttribute('data-arr');
      n.classList.remove('forge-block','forge-sel','forge-sel-multi'); });
    cl.removeAttribute('data-el'); cl.removeAttribute('data-bind'); cl.removeAttribute('data-arr');
    cl.classList.remove('forge-block','forge-sel','forge-sel-multi');
    cl.style.transform=''; cl.style.zIndex=''; return cl; }
  F.insertElement=function(layout,key,extra,name){ var g=galleryNode(layout,key,extra); if(!g) return null;
    /* a grid cell measures as tall as the grid stretched it; land the copy at a
       sane starting width instead — height follows its content, and the width
       is freely resizable afterwards (text reflows, as everywhere else) */
    var w=clamp(Math.round(g.node.offsetWidth||360),80,900);
    var h=clamp(Math.round(g.node.offsetHeight||120),50,360);   /* for centring only */
    g.host.remove();
    /* the object keeps the layout's whole DEFAULTS content, exactly as the
       ghost above rendered it — layouts read sibling fields, so pruning to
       the picked branch would change what it draws */
    var c=clone(DEFAULTS[layout]||{});
    if(extra) Object.keys(extra).forEach(function(k){ c[k]=extra[k]; });
    var i=curSlide(), id=uid();
    F.do('insert element',function(data){ var s=data.slides[i]; s.freeObjects=s.freeObjects||[];
      s.freeObjects.push({id:id,type:'node',layout:layout,pick:key,content:c,name:name||'',
        x:Math.round(640-w/2),y:Math.round(360-h/2),w:w,rot:0}); });
    var sc=deckEl().querySelectorAll('.slide')[i], n=sc&&sc.querySelector('[data-free="'+id+'"]');
    if(n) selectNode(n,false);
    return id; };
  F.insertGallery=function(){ var old=D.getElementById('forge-gallery'); if(old){ old.remove(); return; }
    var o=el('div','forge-chrome'); o.id='forge-gallery';
    var card=el('div','forge-struct-card'); card.style.width='min(680px,94vw)';
    var head=el('div','forge-struct-head');
    head.appendChild(el('h3',null,'Insert an element'));
    var q=el('input'); q.type='text'; q.className='forge-gal-search';
    q.placeholder='Search elements… (e.g. quote, timeline, stat)';
    head.appendChild(q); card.appendChild(head);
    var grid=el('div','forge-gal-grid'); card.appendChild(grid);
    var made=[];
    GALLERY.forEach(function(g){ var got=galleryNode(g[1],g[2],g[3]); if(!got) return;
      var c=el('div','forge-gal-card'); c.dataset.q=(g[0]+' '+g[1]).toLowerCase();
      var prev=el('div','forge-gal-prev');
      var inner=el('div','forge-gal-inner'); inner.appendChild(cleanCopy(got.node));
      prev.appendChild(inner); c.appendChild(prev);
      var nm=el('div','forge-gal-nm'); nm.textContent=g[0]; c.appendChild(nm);
      var fr=el('div','forge-gal-from'); fr.textContent='from '+g[1]; c.appendChild(fr);
      c.onclick=function(){ o.remove(); F.insertElement(g[1],g[2],g[3],g[0]); };
      grid.appendChild(c);
      made.push({node:got.node,host:got.host,inner:inner,prev:prev}); });
    card.appendChild(el('div','forge-hint','Any element from any layout can be dropped onto this slide. It arrives themed and keeps its own fields — drag, resize, restyle, edit its text or add items to it exactly as if it had come with the layout.'));
    var btns=el('div','forge-struct-btns');
    var close=el('button','forge-btn','Close'); close.style.marginLeft='auto';
    close.onclick=function(){ o.remove(); }; btns.appendChild(close);
    card.appendChild(btns); o.appendChild(card); D.body.appendChild(o);
    /* scale each miniature to its card AFTER layout, then drop the ghosts */
    made.forEach(function(m){
      var w=m.node.offsetWidth||360, h=m.node.offsetHeight||120;
      var pw=m.prev.clientWidth||130, ph=m.prev.clientHeight||58;
      var s=Math.min(pw/Math.max(w,1),ph/Math.max(h,1),1);
      m.inner.style.width=w+'px'; m.inner.style.height=h+'px';
      m.inner.style.transform='translate(-50%,-50%) scale('+s.toFixed(3)+')';
      m.host.remove(); });
    q.oninput=function(){ var v=q.value.trim().toLowerCase();
      [].slice.call(grid.children).forEach(function(c){
        c.style.display=(!v||c.dataset.q.indexOf(v)>=0)?'':'none'; }); };
    o.addEventListener('pointerdown',function(e){ if(e.target===o) o.remove(); });
    q.focus(); };

  /* =====================================================================
     SAVE — download a fresh self-contained .html with edits baked in.
     ===================================================================== */
  function currentHTML(){ if(F.editing) endEdit();
    var root=D.documentElement.cloneNode(true);
    /* strip editor state: chrome nodes, selection, deck DOM (re-rendered on boot) */
    [].slice.call(root.querySelectorAll('.forge-chrome,#forge-fmt,#forge-ctx,#forge-float,.forge-guides,.forge-marquee')).forEach(function(n){ n.remove(); });
    var body=root.querySelector('body'); if(body) body.classList.remove('forge-edit','presenting','hide-docs');
    var deck=root.querySelector('#deck'); if(deck){ deck.innerHTML=''; deck.removeAttribute('style'); }
    if(F.assets) F.assets.gc();                 /* drop unreferenced assets before shipping the file (media plan §2.3) */
    var dataEl=root.querySelector('#deck-data'); if(dataEl) dataEl.textContent='\n'+JSON.stringify(SG.data,null,2)+'\n';
    var asEl=root.querySelector('#deck-assets'); if(asEl) asEl.textContent='\n'+JSON.stringify(SG.assets||{icons:{},images:{},svg:{},styles:''})+'\n';
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
    var rows=[['Click / click again','Select a group / step inside it'],
      ['Drag / Alt','Move with snap guides / snap off'],
      ['Drag corner / Alt+corner','Resize width \u2014 text reflows / scale'],['Double-click','Edit text in place'],
      ['Shift-click / marquee','Multi-select'],['Ctrl+C · V · D','Copy / paste / duplicate (deep)'],
      ['Ctrl+G / Ctrl+Shift+G','Group / ungroup'],['Arrows / Shift+arrows','Nudge 1px / 10px'],
      ['Delete','Delete / reset selection'],['Ctrl+Z / Ctrl+Shift+Z','Undo / redo'],
      ['Ctrl+S','Save (in place on Chrome/Edge)'],['Esc','Clear selection / close'],
      ['Ctrl + / Ctrl -','Zoom the stage in / out'],['Ctrl+0','Fit the slide (and Focus off)'],
      ['Ctrl+scroll','Zoom the stage'],
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
        +'<li><b>Double-click</b> text to rewrite it in place — click a group, then <b>click again</b> to step inside it</li>'
        +'<li>The <b>On this slide</b> list names every element in plain English — hover to find it, click to select, the eye to hide it</li>'
        +'<li><b>⌖ Focus</b> (bottom-right) zooms to whatever is selected and follows it; <b>Fit</b> returns</li>'
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
    buildCrumbs();
    if(on){ SG.render(deckEl(),SG.data); SG.refresh&&SG.refresh(); F.buildNav(); F.buildInspect(); F.showHints(); F.applyView(); }
    else { F.zoom=1; F.focus=false; SG.render(deckEl(),SG.data); SG.refresh&&SG.refresh();
      if(floatBar) floatBar.classList.remove('on'); }
  };

  function boot(){ SG.boot();
    if(!SG.data) return;                     /* engine showed the JSON-error slide */
    /* merge back any autosaved assets BEFORE the deck-JSON restore prompt, so
       a restored deck that references an imported image finds it (media plan
       §2.3) — additive only, never overwrites what the saved .html shipped with */
    if(F.assets) F.assets.restore();
    F.buildChrome(); wireDeck(); wireKeys();
    F.buildNav(); F.buildInspect(); checkRestore();
    /* ?edit query auto-opens edit mode (CLAUDE.md-documented dev/verification shortcut) */
    if(/(^|[?&])edit(=|&|$)/.test(location.search)) F.toggle();
    W.addEventListener('hashchange',function(){ clearSel(); F.buildNav(); F.buildInspect(); });
  }
  if(document.readyState!=='loading') boot();
  else document.addEventListener('DOMContentLoaded',boot);

  /* observe selection changes to keep the floating toolbar, the breadcrumb
     and (while ⌖ Focus is on) the stage viewport in sync */
  var _paint=paintSel; paintSel=function(){ _paint(); buildFloat(); buildCrumbs();
    if(F.focus&&editing()) F.applyView(); };
  /* re-wrap: selectNode/selectNodes/clearSel captured paintSel by reference at
     definition time inside this closure, so re-binding the name above is enough. */
})();
