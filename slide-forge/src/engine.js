/* =====================================================================
   DECK ENGINE v3 — data-driven rendering with a node-tree layout registry.
   A deck is a JSON document (the deck-data JSON block) rendered through a
   registry of layout templates. v3: layouts return DOM node trees built with
   N(), and author three identity attributes directly:
     data-el   (attrs.key)  — stable authored identity key ("title","stats.2")
     data-bind (attrs.bind) — the content path a text leaf renders; on-canvas
                              edits write back to this path deterministically
     data-arr  (attrs.arr)  — the content path of the array a container renders
   The renderer derives numbering/progress, so adding or reordering slides
   never means hand-editing pagers. Per-slide "theme" patches override the
   global :root as scoped CSS variables. Assets (icons/images/styles) are
   resolved from an inlined registry. The live deck also exports/imports its
   JSON and prints to PDF. SG.renderSlide(deck,i) rebuilds a single section
   (targeted re-render for live editing).
   ===================================================================== */
(function(){
  var W = window, D = document, SG = W.SG = W.SG || {};

  /* ---------- schema migration ----------
     v2 added optional keys only (overrides[key].z, notes, brand, masters).
     v3 changes override IDENTITY: keys are authored content paths instead of
     positional b0/b0.1 tags. Old positional keys are remapped lazily at first
     decorate (the editor replays the old block walk against the fresh DOM) —
     flagged here via SG._legacyKeys. raw slides keep positional keys. */
  SG.SCHEMA_VERSION = 3;
  SG.migrate = function(data){ if(!data||typeof data!=='object') return data;
    var m = data.meta = data.meta || {};
    var v = parseInt(m.schemaVersion,10) || 1;
    if(v < 3){
      SG._legacyKeys = (data.slides||[]).some(function(s){
        return s.overrides && s.layout!=='raw' &&
          Object.keys(s.overrides).some(function(k){ return /^b\d/.test(k); }); });
    }
    m.schemaVersion = SG.SCHEMA_VERSION;
    return data; };

  /* ---------- content-path helpers (shared with the editor) ---------- */
  SG.getPath=function(o,p){ var seg=String(p).split('.');
    for(var i=0;i<seg.length;i++){ if(o==null) return undefined; o=o[seg[i]]; } return o; };
  SG.setPath=function(o,p,v){ var seg=String(p).split('.');
    for(var i=0;i<seg.length-1;i++){ var k=seg[i];
      if(o[k]==null||typeof o[k]!=='object') o[k]=/^\d+$/.test(seg[i+1])?[]:{};
      o=o[k]; }
    o[seg[seg.length-1]]=v; };

  /* ---------- small helpers ---------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function pad(n){ n=String(n); return n.length<2?'0'+n:n; }
  function pctw(i,t){ return (100*i/Math.max(1,t)).toFixed(2); }
  function arr(x){ return Array.isArray(x)?x:(x==null?[]:[x]); }
  /* rich(): escape, then allow a little safe inline emphasis authors can type
     in plain JSON strings — [[x]] glows in the accent color, **x** is bold,
     `x` is monospace. Keeps content readable without raw HTML. */
  function rich(s){ return esc(s)
      .replace(/\[\[(.+?)\]\]/g,'<span class="glow">$1</span>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`(.+?)`/g,'<code>$1</code>'); }
  /* emRich(): the display-type variant some layouts use — [[x]] italicizes */
  function emRich(s){ return esc(s)
      .replace(/\[\[(.+?)\]\]/g,'<em>$1</em>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`(.+?)`/g,'<code>$1</code>'); }
  SG.esc=esc; SG.rich=rich;   /* exposed so the Forge editor can escape/format text too */
  /* split a string into per-letter kinetic spans (divider headline entrance) */
  function kinetic(s){ var o='',a=String(s).split(''); for(var i=0;i<a.length;i++){
    var ch=a[i]===' '?'&nbsp;':esc(a[i]); o+='<span style="--i:'+i+'">'+ch+'</span>'; } return o; }

  /* =====================================================================
     N — the node builder. N('div.stat-grid', {key,bind,arr,html,style,…}, kids)
     - sel: tag + classes ('h3', 'div.cmp-col.sup')
     - attrs.key  -> data-el     attrs.bind -> data-bind (+ data-el if no key)
     - attrs.arr  -> data-arr    attrs.html -> innerHTML   attrs.text -> textContent
       anything else -> setAttribute
     - kids: string | Node | array (nested, null/false skipped)
     H(str) parses an HTML string into a fragment (for trusted fragments like
     chart SVG or the closing checkmark). Both are exposed on SG for the editor.
     ===================================================================== */
  function N(sel,attrs,kids){
    if(attrs!=null&&(typeof attrs!=='object'||Array.isArray(attrs)||attrs.nodeType)){ kids=attrs; attrs=null; }
    var p=String(sel).split('.'), n=D.createElement(p[0]||'div');
    if(p.length>1) n.className=p.slice(1).join(' ');
    if(attrs){ if(attrs.bind&&!attrs.key) n.setAttribute('data-el',attrs.bind);
      Object.keys(attrs).forEach(function(k){ var v=attrs[k]; if(v==null||v===false) return;
        if(k==='key') n.setAttribute('data-el',v);
        else if(k==='bind') n.setAttribute('data-bind',v);
        else if(k==='arr') n.setAttribute('data-arr',v);
        else if(k==='html') n.innerHTML=v;
        else if(k==='text') n.textContent=v;
        else if(k==='style') n.setAttribute('style',v);
        else n.setAttribute(k,v); }); }
    (function add(x){ if(x==null||x===false) return;
      if(Array.isArray(x)){ x.forEach(add); return; }
      if(x.nodeType){ n.appendChild(x); return; }
      n.appendChild(D.createTextNode(String(x))); })(kids);
    return n; }
  function H(s){ var t=D.createElement('template'); t.innerHTML=s==null?'':String(s); return t.content; }
  SG.N=N; SG.H=H;

  function kickerN(t){ return t?N('div.eyebrow-row',{key:'kicker'},
    N('span.kicker',{key:'kicker.text',bind:'kicker',html:rich(t)})):null; }
  function titleN(t){ return t?N('h1.title',{bind:'title',html:rich(t)}):null; }

  /* ---------- asset registry (icons inline+themeable, images base64/linked, svg diagrams) ----------
     v2 registry shape (media plan §2.1): images[name] is EITHER a legacy plain string (a src/data
     URI, still accepted forever) OR an object:
       {store:"embedded", src, w,h, bytes, type, alt}   — inlined, travels with the file
       {store:"linked",   path, w,h, bytes, type, alt}  — resolved relative to the deck; falls back
                                                            to SG.unavailable() if the file is missing
     svg{} is a sibling map of sanitized inline SVG diagram markup (kept apart from icons: icons are
     small/monochrome/currentColor, diagrams are large and may carry their own palette). */
  SG.assets = SG.assets || {icons:{},images:{},svg:{},styles:''};
  function loadAssets(){
    var el=D.getElementById('deck-assets'); if(!el) return;
    try{ var a=JSON.parse(el.textContent||'{}');
      SG.assets={icons:a.icons||{},images:a.images||{},svg:a.svg||{},styles:a.styles||''};
    }catch(e){}
    if(SG.assets.styles){ var st=D.createElement('style'); st.id='deck-custom-style';
      st.textContent=SG.assets.styles; D.head.appendChild(st); }
  }
  /* icon(spec): spec is a name, or {name,color,solid}. SVG inherits theme color
     via currentColor unless an explicit color (token like "--mint" or a literal)
     is given. Unknown names render nothing rather than breaking the slide. */
  function icon(spec){ if(!spec) return '';
    var name=typeof spec==='string'?spec:spec.name;
    var svg=(SG.assets.icons||{})[name]; if(!svg) return '';
    var color=(typeof spec==='object'&&spec.color)||'';
    var cls='ico-wrap'+(typeof spec==='object'&&spec.solid?' solid':'');
    var sty=color?(' style="color:'+(color.indexOf('--')===0?'var('+color+')':color)+'"'):'';
    return '<span class="'+cls+'"'+sty+'>'+svg+'</span>'; }
  /* imageMeta(name): normalizes all three registry shapes to {src,w,h,alt,store}.
     "linked" entries resolve relative to the deck's own location (works from file:// and http://). */
  function imageMeta(name){ var e=(SG.assets.images||{})[name]; if(!e) return null;
    if(typeof e==='string') return {src:e,w:0,h:0,alt:'',store:'embedded'};
    if(e.store==='linked') return {src:e.path,w:e.w||0,h:e.h||0,alt:e.alt||'',store:'linked'};
    return {src:e.src||'',w:e.w||0,h:e.h||0,alt:e.alt||'',store:'embedded'}; }
  function imageURL(name){ var m=imageMeta(name); return m?m.src:''; }
  function svgMarkup(name){ return (SG.assets.svg||{})[name]||''; }
  SG.imageMeta=imageMeta; SG.imageURL=imageURL; SG.svgMarkup=svgMarkup;

  /* =====================================================================
     UNAVAILABLE — one shared "this needs the network" component (media plan
     §5.1/§7.1). Used identically for: unreachable/blocked embeds, missing
     `linked` images, and (as an inline marker) unreachable links. Offline
     status, embed load-timeout, and missing-file are all DETECTABLE and use
     this; a specific external link being dead while online is not detectable
     (opaque cross-origin response) and is NOT claimed here — online link
     clicks simply go to the browser, which shows its own error.
     Deck authors can override the wording via meta.strings.unavailable.
     ===================================================================== */
  function unavailMsg(){ var m=SG.data&&SG.data.meta&&SG.data.meta.strings;
    return (m&&m.unavailable)||'Content unavailable'; }
  var UNAVAIL_REASON={
    offline:'This element needs a network connection.',
    timeout:'This page could not be loaded — it may not allow being embedded.',
    blocked:'This page refused to be embedded.',
    missing:'This file is missing. It was linked, not saved inside the deck.'};
  /* SG.unavailable({url,reason,mode}) -> Node. mode:"block" (default; embeds,
     missing images) or "inline" (small marker appended after linked text). */
  SG.unavailable=function(spec){ spec=spec||{}; var url=spec.url||'', reason=spec.reason||'offline';
    var detail=UNAVAIL_REASON[reason]||UNAVAIL_REASON.offline;
    if(spec.mode==='inline'){
      return N('span.sf-unavail-inline',{title:detail+(url?' ('+url+')':'')},
        [N('span.sf-unavail-ico',{'aria-hidden':'true'},'⚠'), ' unavailable']); }
    var kids=[ N('div.sf-unavail-ico','⚠'),
      N('div.sf-unavail-body',[ N('div.sf-unavail-h',esc(unavailMsg())), N('p',detail),
        url?N('div.sf-unavail-url',esc(url)):null ]) ];
    if(url) kids.push(N('a.sf-unavail-open',{href:url,target:'_blank',rel:'noopener noreferrer'},'Open in browser ↗'));
    return N('div.sf-unavail',{'data-reason':reason},kids); };

  /* =====================================================================
     LAYOUT REGISTRY  —  name -> function(content) -> node array.
     Pager + progress are appended by the renderer, never here.
     Keys are authored: named blocks ("title","rail"), array items by content
     path ("stats.2"), leaves bound to the field they render ("stats.2.label").
     ===================================================================== */
  var L = SG.layouts = {};

  L.cover=function(c){
    return [
      N('div.orb.a',{key:'orb0'}), N('div.orb.b',{key:'orb1'}), N('div.orb.c',{key:'orb2'}),
      kickerN(c.kicker),
      N('h1.title.sg-fade-rise.sg-onenter',{key:'title'},[
        H(rich(c.title||'')),
        c.accent?N('span.glow.sg-glow-pulse',{key:'accent',bind:'accent',text:c.accent}):null ]),
      c.subtitle?N('p.subtitle',{bind:'subtitle',html:rich(c.subtitle)}):null,
      arr(c.meta).length?N('div.meta',{key:'meta',arr:'meta'},arr(c.meta).map(function(m,i){
        var t=typeof m==='string'?m:m.text;
        return (typeof m==='object'&&m.strong)
          ? N('span',{key:'meta.'+i},N('b',null,t))
          : N('span',{bind:'meta.'+i,text:t}); })):null ]; };

  L.agenda=function(c){
    return [ N('div.rail',{key:'rail'}), kickerN(c.kicker), titleN(c.title),
      N('div.agenda-grid.sg-stagger.sg-onenter',{key:'items',arr:'items'},
        arr(c.items).map(function(it,i){ var P='items.'+i;
          return N('div.ag-item',{key:P},[
            N('div.ag-num',{key:P+'.num'},pad(i+1)),
            N('div.ag-body',{key:P+'.body'},[
              N('h3',{bind:P+'.title',html:rich(it.title)}),
              it.desc?N('p',{bind:P+'.desc',html:rich(it.desc)}):null ]) ]); })) ]; };

  L.divider=function(c){
    return [ N('div.big-index',{key:'index',bind:'index',text:c.index||''}),
      N('h1.title',{key:'title',bind:'title'},
        N('span.sg-kinetic.sg-onenter',{html:kinetic(c.title||'')})),
      c.subtitle?N('p.subtitle',{bind:'subtitle',html:rich(c.subtitle)}):null ]; };

  L['stat-grid']=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.stat-grid',{key:'stats',arr:'stats'},arr(c.stats).map(function(s,i){ var P='stats.'+i;
        var num = s.count!=null
          ? '<span class="sg-count" data-to="'+esc(s.count)+'" data-dur="1300"'
              +(s.fmt?' data-fmt="'+esc(s.fmt)+'"':'')+'>0</span>'
          : esc(s.value);
        return N('div.stat',{key:P},[
          N('div.num',{key:P+'.num',html:num+(s.unit?'<small>'+esc(s.unit)+'</small>':'')}),
          N('div.lbl',{bind:P+'.label',html:rich(s.label)}) ]); })) ]; };

  L.bignum=function(c){
    var hero = c.count!=null
      ? '<span class="sg-count" data-to="'+esc(c.count)+'" data-dur="1800"'+(c.fmt?' data-fmt="'+esc(c.fmt)+'"':'')+'>0</span>'
      : esc(c.value);
    return [ kickerN(c.kicker), N('div.hero-num',{key:'num',html:hero}),
      c.subtitle?N('p.subtitle',{bind:'subtitle',html:rich(c.subtitle)}):null ]; };

  L.chart=function(c){
    /* v2+: author charts as data (type + data.labels/series); SG.charts renders
       theme-token SVG. content.svg / content.body stays the bespoke escape hatch. */
    var body=c.data?(SG.charts?SG.charts.render(c):''):(c.svg||c.body||'');
    return [ N('div.chart-head',{key:'head'},[
        N('div',null,[kickerN(c.kicker),titleN(c.title)]),
        c.note?N('p',{key:'note',bind:'note',text:c.note,
          style:'font-family:var(--font-mono);font-size:13px;color:var(--faint)'}):null ]),
      N('div.chart-wrap',{key:'chart',html:body}) ]; };

  L.table=function(c){
    var o=c.options||{}, cols=arr(c.columns), hi=o.highlightCol!=null?+o.highlightCol:-1;
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.tbl-wrap.sg-fade-rise.sg-onenter',{key:'table'},[
        N('table.tbl'+(o.compact?'.compact':''),null,[
          N('thead',null,N('tr',null,cols.map(function(h,j){
            return N('th'+(j===hi?'.hi':''),{bind:'columns.'+j,html:rich(h)}); }))),
          N('tbody',null,arr(c.rows).map(function(r,i){
            return N('tr',null,arr(r).map(function(cell,j){
              return N('td'+(j===hi?'.hi':''),{bind:'rows.'+i+'.'+j,html:rich(String(cell==null?'':cell))}); })); })) ]),
        c.note?N('p.tbl-note',{key:'tnote',bind:'note',text:c.note}):null ]) ]; };

  L.comparison=function(c){
    function col(side,cls,base){ if(!side) return null;
      return N('div.cmp-col.'+cls,{key:base},[
        side.tag?N('div.tag',{bind:base+'.tag',html:rich(side.tag)}):null,
        N('h3',{bind:base+'.title',html:rich(side.title)}),
        N('ul',{key:base+'.items',arr:base+'.items'},arr(side.items).map(function(x,i){
          return N('li',{bind:base+'.items.'+i,html:rich(x)}); })) ]); }
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.cmp',{key:'cmp'},[ col(c.left,'sup','left'),
        N('div.vs-rail',{key:'vs'},N('div.vs-badge',{key:'badge',bind:'badge',text:c.badge||'VS'})),
        col(c.right,'uns','right') ]) ]; };

  L.quote=function(c){
    return [ N('div.quote-mark',{key:'mark',html:'&ldquo;'}),
      N('blockquote.sg-reveal-wipe.sg-onenter',{bind:'quote',html:rich(c.quote)}),
      c.by?N('div.by',{key:'by'},[N('div.line'),
        N('span',{key:'by.text',bind:'by',html:rich(c.by)})]):null,
      c.subtitle?N('p.subtitle',{bind:'subtitle',style:'margin-top:26px',html:rich(c.subtitle)}):null ]; };

  L.code=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.code-stage',{key:'stage'},[
        N('div.code-panel',{key:'panel'},[
          N('div.code-bar',{key:'bar'},[N('span.dotrow',{html:'<i></i><i></i><i></i>'}),c.filename||'']),
          N('div.code-sweep'),
          N('pre',{key:'code',html:(c.code||'')+'<span class="caret"></span>'}) ]),
        c.caption?N('p.code-cap',{bind:'caption',html:rich(c.caption)}):null ]) ]; };

  L.timeline=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.timeline',{key:'timeline'},[
        N('div.tl-track'), N('div.tl-spark'),
        N('div.tl-items',{key:'items',arr:'items'},arr(c.items).map(function(it,i){ var P='items.'+i;
          return N('div.tl-item',{key:P},[
            N('div.yr',{bind:P+'.year',text:it.year==null?'':it.year}),
            N('div.tl-dot'+(it.now?'.now':''),{key:P+'.dot'}),
            N('div.ev',{key:P+'.ev'},[
              N('b',{bind:P+'.title',html:rich(it.title)}),
              it.desc?N('span',{bind:P+'.desc',html:rich(it.desc)}):null ]) ]); })) ]) ]; };

  L.pipeline=function(c){
    var nodes=arr(c.nodes), kids=[];
    nodes.forEach(function(n,i){ var P='nodes.'+i;
      kids.push(N('div.pipe-node',{key:P},[
        N('div.ico',{key:P+'.icon',html:n.iconAsset?icon(n.iconAsset):esc(n.icon||'')}),
        N('h3',{bind:P+'.title',html:rich(n.title)}),
        n.desc?N('p',{bind:P+'.desc',html:rich(n.desc)}):null ]));
      if(i<nodes.length-1) kids.push(N('div.pipe-conn',{key:'conn.'+i},
        N('div.pipe-packet',{style:'animation-delay:'+(i*0.6)+'s'}))); });
    if(c.loop) kids.push(N('div.pipe-loop',{key:'loop',bind:'loop',text:c.loop}));
    return [ kickerN(c.kicker), titleN(c.title), N('div.pipe',{key:'pipe',arr:'nodes'},kids) ]; };

  L.closing=function(c){
    var check='<svg class="sg-check sg-onenter" viewBox="0 0 52 52" width="30" height="30" fill="none" stroke="var(--mint)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="26" r="24"></circle><path class="tick" d="M16 27 L23 34 L37 18"></path></svg>';
    return [ N('div.orb.b',{key:'orb0',style:'opacity:.30'}), N('div.orb.c',{key:'orb1'}),
      kickerN(c.kicker),
      N('h1.title',{key:'title'},[ H(rich(c.title||'')),
        c.accent?' ':null,
        c.accent?N('span.glow',{key:'accent',bind:'accent',text:c.accent}):null ]),
      N('div.take.sg-stagger.sg-onenter',{key:'takeaways',arr:'takeaways'},
        arr(c.takeaways).map(function(t,i){ var P='takeaways.'+i;
          return N('div',{key:P},[
            N('div.n',{key:P+'.n'},pad(i+1)),
            N('h3',{bind:P+'.title',html:rich(t.title)}),
            N('p',{bind:P+'.desc',html:rich(t.desc)}) ]); })),
      c.note?N('div.meta',{key:'note'},[H(check),
        N('span',{key:'note.text',bind:'note',html:rich(c.note)})]):null ]; };

  /* escape hatch: literal HTML, still numbered+themed. Children get positional
     b0/b0.1 keys from the editor's decorate pass (there is no schema to bind). */
  L.raw=function(c){ return {raw:c.html||''}; };

  /* ---------- canvas-derived layouts ---------- */
  L.manifesto=function(c){
    return [ N('div.mark',{key:'mark'}),
      N('div.statement.sg-glow-pulse-box',{bind:'statement',html:emRich(c.statement||'')}),
      c.lead?N('p.lead',{bind:'lead',html:rich(c.lead)}):null ]; };

  L.editorial=function(c){
    return [ kickerN(c.kicker),
      N('div.editorial',{key:'editorial'},[
        N('div.ed-lead.sg-reveal-wipe.sg-onenter',{bind:'lead',html:rich(c.lead)}),
        N('div.ed-cols.sg-stagger.sg-onenter',{key:'columns',arr:'columns'},
          arr(c.columns).map(function(col,i){ var P='columns.'+i;
            return N('div.ed-col',{key:P},[
              N('h3',{bind:P+'.head',html:rich(col.head)}),
              N('p',{bind:P+'.body',html:rich(col.body)}) ]); })) ]) ]; };

  L['hero-asym']=function(c){
    return [ N('div.hero-asym',{key:'hero'},[
      N('div',{key:'main'},[
        N('div.htitle',{key:'title',bind:'title',html:emRich(c.title||'')}),
        c.sub?N('p.hsub',{bind:'sub',html:rich(c.sub)}):null ]),
      N('div.hero-rail.sg-stagger.sg-onenter',{key:'rows',arr:'rows'},
        arr(c.rows).map(function(r,i){ var P='rows.'+i;
          return N('div.row',{key:P},[
            N('div.k',{bind:P+'.k',text:r.k==null?'':r.k}),
            N('div.v',{key:P+'.val'},[
              N('span',{key:P+'.v',bind:P+'.v',text:r.v==null?'':r.v}),
              r.unit?N('small',{key:P+'.unit'},' '+r.unit):null ]) ]); })) ]) ]; };

  L.figure=function(c){
    var url=imageURL(c.image);
    var bg=url?('background-image:url("'+url.replace(/"/g,'%22')+'")')
              :'background:linear-gradient(135deg,var(--bg-2),var(--bg))';
    return [ N('div.fig-img',{key:'image',style:bg}), N('div.fig-shade',{key:'shade'}),
      N('div.fig-body',{key:'body'},[ kickerN(c.kicker),
        N('div.fig-title.sg-reveal-wipe.sg-onenter',{bind:'title',html:rich(c.title)}),
        c.caption?N('p.fig-cap',{bind:'caption',html:rich(c.caption)}):null ]) ]; };

  L['metric-dash']=function(c){
    var r=c.ring||{};
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.dash',{key:'dash'},[
        N('div.dash-ring',{key:'ring'},[
          N('div.sg-ring',{'data-p':String(r.value||0),'data-suffix':r.suffix||'%'},
            N('span.sg-ring-v','0')),
          N('div.cap',{key:'ring.label',bind:'ring.label',html:rich(r.label||'')}) ]),
        N('div.dash-tiles.sg-stagger.sg-onenter',{key:'tiles',arr:'tiles'},
          arr(c.tiles).map(function(t,i){ var P='tiles.'+i;
            return N('div.dash-tile',{key:P},[
              N('div.v',{key:P+'.val',html:esc(t.value)+(t.unit?'<small>'+esc(t.unit)+'</small>':'')}),
              N('div.l',{bind:P+'.label',html:rich(t.label)}) ]); })) ]) ]; };

  L.leaderboard=function(c){
    var rows=arr(c.rows), max=0; rows.forEach(function(r){ var v=parseFloat(r.pct!=null?r.pct:r.value)||0; if(v>max)max=v; });
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.board.sg-stagger.sg-onenter',{key:'rows',arr:'rows'},rows.map(function(r,i){
        var P='rows.'+i, v=parseFloat(r.pct!=null?r.pct:r.value)||0, w=max?Math.round(v/max*100):0;
        return N('div.board-row',{key:P},[
          N('div.rk',{key:P+'.rk'},pad(i+1)),
          N('div.board-bar',{key:P+'.bar'},[
            N('div.fill',{style:'width:'+w+'%'}),
            N('div.nm',{bind:P+'.name',html:rich(r.name)}) ]),
          N('div.val',{key:P+'.value',bind:P+'.value',text:r.value==null?'':r.value}) ]); })) ]; };

  L.diptych=function(c){
    function panel(side,cls,base){ side=side||{};
      return N('div.dip-panel.'+cls,{key:base},[
        cls==='left'?N('div.divline'):null,
        side.tag?N('div.tag',{bind:base+'.tag',text:side.tag}):null,
        N('div.big',{bind:base+'.title',html:rich(side.title)}),
        side.body?N('p',{bind:base+'.body',html:rich(side.body)}):null ]); }
    return [ panel(c.left,'left','left'), panel(c.right,'right','right') ]; };

  L.matrix=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.matrix.sg-stagger.sg-onenter',{key:'cells',arr:'cells'},
        arr(c.cells).map(function(q,i){ var P='cells.'+i;
          return N('div.mx-cell'+(q.hot?'.hot':''),{key:P},[
            N('h3',{bind:P+'.title',html:rich(q.title)}),
            N('p',{bind:P+'.desc',html:rich(q.desc)}) ]); })
        .concat([ c.xlabel?N('div.mx-axis-x',{key:'xlabel',bind:'xlabel',text:c.xlabel}):null,
                  c.ylabel?N('div.mx-axis-y',{key:'ylabel',bind:'ylabel',text:c.ylabel}):null ])) ]; };

  L.stack=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.stack.sg-stagger.sg-onenter',{key:'bands',arr:'bands'},
        arr(c.bands).map(function(b,i){ var P='bands.'+i;
          return N('div.stack-band',{key:P},[
            N('span.si',{key:P+'.icon',html:b.iconAsset?icon(b.iconAsset):esc(b.icon||'')}),
            N('div.st',{key:P+'.st'},[
              N('h3',{bind:P+'.title',html:rich(b.title)}),
              b.desc?N('p',{bind:P+'.desc',html:rich(b.desc)}):null ]) ]); })) ]; };

  L['quote-mosaic']=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.mosaic.sg-stagger.sg-onenter',{key:'quotes',arr:'quotes'},
        arr(c.quotes).map(function(q,i){ var P='quotes.'+i;
          return N('div.mq',{key:P},[
            N('blockquote',{bind:P+'.quote',html:rich(q.quote)}),
            N('div.by',{bind:P+'.by',html:rich(q.by)}) ]); })) ]; };

  L['index-mosaic']=function(c){
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.indexm.sg-stagger.sg-onenter',{key:'items',arr:'items'},
        arr(c.items).map(function(it,i){ var P='items.'+i;
          return N('div.ix',{key:P},[
            N('div.ixn',{key:P+'.n'},pad(i+1)),
            N('h3',{bind:P+'.title',html:rich(it.title)}),
            it.desc?N('p',{bind:P+'.desc',html:rich(it.desc)}):null ]); })) ]; };

  L['before-after']=function(c){
    function col(s,cls,base){ s=s||{};
      return N('div.bna-col.'+cls,{key:base},[
        N('div.tag',{bind:base+'.tag',html:rich(s.tag||(cls==='after'?'After':'Before'))}),
        N('h3',{bind:base+'.title',html:rich(s.title)}),
        N('ul',{key:base+'.items',arr:base+'.items'},arr(s.items).map(function(x,i){
          return N('li',{bind:base+'.items.'+i,html:rich(x)}); })) ]); }
    return [ kickerN(c.kicker), titleN(c.title),
      N('div.bna',{key:'bna'},[ col(c.before,'before','before'),
        N('div.bna-arrow',{html:'&rarr;'}), col(c.after,'after','after') ]) ]; };

  /* =====================================================================
     RENDER  —  build slides from data, derive numbering, apply per-slide theme
     ===================================================================== */
  function themeStyle(theme){ if(!theme||typeof theme!=='object') return '';
    return Object.keys(theme).map(function(k){ return esc(k)+':'+esc(theme[k]); }).join(';'); }

  function applyGlobalTheme(theme){ if(theme&&typeof theme==='object'){
    var root=D.documentElement; Object.keys(theme).forEach(function(k){ root.style.setProperty(k,theme[k]); }); } }

  /* ---------- brand kit (v2 phase 4): overlays the active theme ----------
     brand.colors map onto the accent slots, brand.fonts swap the font vars,
     brand.logo (an inlined image asset) is auto-placed on cover + closing.
     Brand x theme compose: any theme can wear the brand's colors. */
  var BRAND_SLOTS={accent1:'--cyan',accent2:'--indigo',accent3:'--mint'};
  function applyBrand(brand){ var root=D.documentElement;
    Object.keys(BRAND_SLOTS).forEach(function(k){ root.style.removeProperty('_brand_'+k); });
    if(!brand) return;
    if(brand.colors) Object.keys(BRAND_SLOTS).forEach(function(k){
      if(brand.colors[k]) root.style.setProperty(BRAND_SLOTS[k],brand.colors[k]); });
    if(brand.fonts){
      if(brand.fonts.display) root.style.setProperty('--font-display',"'"+brand.fonts.display+"','DejaVu Sans',system-ui,sans-serif");
      if(brand.fonts.body) root.style.setProperty('--font-body',"'"+brand.fonts.body+"','DejaVu Sans',system-ui,sans-serif"); } }
  function brandMark(brand,lay){ if(!brand||!brand.logo) return null;
    if(lay!=='cover'&&lay!=='closing') return null;
    var url=imageURL(brand.logo); if(!url) return null;
    return N('img.brand-mark',{src:url,alt:brand.name||'logo'}); }

  /* Layouts whose CSS targets the <section> itself. Every other layout styles
     INNER containers only, so putting the layout name on the section would let an
     inner class (e.g. .matrix, .timeline, .stat-grid) restyle the slide and break
     .slide{position:absolute;inset:0}. We add a harmless lyt-<name> hook instead. */
  var SECTION_LAYOUTS={cover:1,divider:1,bignum:1,quote:1,closing:1,manifesto:1,figure:1,diptych:1};

  /* build ONE <section> — shared by full render and targeted re-render */
  function buildSection(s,i,total,defAmb,brand){
    var lay=s.layout||'raw';
    var sec=D.createElement('section');
    sec.className='slide'+(SECTION_LAYOUTS[lay]?(' '+lay):'')+' lyt-'+lay+(s.class?(' '+s.class):'');
    sec.setAttribute('data-i',String(i+1)); sec.setAttribute('role','group');
    sec.setAttribute('aria-roledescription','slide');
    sec.setAttribute('aria-label','Slide '+(i+1)+' of '+total);
    var sty=themeStyle(s.theme); if(sty) sec.setAttribute('style',sty);
    /* resolve the ambient: a named one injects a universal background layer;
       "none" silences motion; "auto"/absent keeps the layout's built-in ambient. */
    var amb=(s.ambient!=null)?s.ambient:defAmb;
    if(amb==='none'){ sec.setAttribute('data-ambient','none'); }
    else if(amb&&amb!=='auto'){ sec.appendChild(N('div.amb.amb-'+amb,{'aria-hidden':'true'})); }
    var fn=L[lay]||L.raw, out;
    try{ out=fn(s.content||{},{index:i,total:total}); }
    catch(e){ out=[ N('div.title',{style:'color:var(--cyan)',html:'&#9888; layout "'+esc(s.layout)+'" failed'}),
                    N('p.subtitle',{text:e.message}) ]; }
    if(out&&!Array.isArray(out)&&out.raw!=null) sec.insertAdjacentHTML('beforeend',out.raw);
    else (function add(x){ if(x==null||x===false) return;
      if(Array.isArray(x)){ x.forEach(add); return; }
      sec.appendChild(x.nodeType?x:D.createTextNode(String(x))); })(out);
    var bm=brandMark(brand,lay); if(bm) sec.appendChild(bm);
    if(s.doc) sec.appendChild(N('div.doc-panel',null,[
      N('div.doc-h',null,'JSON · layout "'+(s.layout||'')+'"'), N('pre',{text:s.doc}) ]));
    sec.appendChild(N('div.pager',null,pad(i+1)+' / '+pad(total)));
    sec.appendChild(N('div.progress',{style:'width:'+pctw(i+1,total)+'%'}));
    return sec; }

  SG.render=function(deck,data){
    data=data||SG.data; SG.data=data;
    var slides=arr(data.slides), total=slides.length;
    var defAmb=(data.defaults&&data.defaults.ambient)||'auto';
    applyGlobalTheme(data.theme);
    applyBrand(data.brand);
    if(data.meta){ if(data.meta.title) D.title=data.meta.title;
      if(data.meta.seed!=null){ D.documentElement.setAttribute('data-seed',data.meta.seed);
        SG.rng=SG.makeRng(parseInt(data.meta.seed,10)||1); } }
    deck.innerHTML='';
    slides.forEach(function(s,i){ deck.appendChild(buildSection(s,i,total,defAmb,data.brand)); });
    /* re-attach entrance-animation observers to the fresh slide nodes; without
       this the first shown slide keeps .sg-onenter elements at their hidden base */
    if(SG.wireAnims) SG.wireAnims(deck);
  };

  /* targeted re-render: rebuild ONE section in place (content-only edits).
     Structural changes (slide count, theme, brand) still need SG.render. */
  SG.renderSlide=function(deck,i){
    var data=SG.data, slides=arr(data.slides);
    var secs=deck.querySelectorAll('.slide'), old=secs[i];
    if(!old||secs.length!==slides.length){ SG.render(deck,data); return null; }
    var defAmb=(data.defaults&&data.defaults.ambient)||'auto';
    var sec=buildSection(slides[i],i,slides.length,defAmb,data.brand);
    if(old.classList.contains('active')) sec.classList.add('active');
    old.parentNode.replaceChild(sec,old);
    if(SG.wireAnims) SG.wireAnims(sec);
    return sec; };

  /* =====================================================================
     NAVIGATION + responsive fit + per-slide deep links (re-entrant: rebuilt
     on import). Global listeners bind once; refresh() re-reads the slides.
     ===================================================================== */
  function mountNav(deck){
    var slides=[], n=0, cur=0;
    function refresh(){ slides=[].slice.call(deck.querySelectorAll('.slide')); n=slides.length; fromHash(); }
    function clamp(i){ return Math.max(0,Math.min(n-1,i)); }
    function show(i){ cur=clamp(i);
      slides.forEach(function(s,k){ s.classList.toggle('active',k===cur); });
      if(location.hash!=='#'+(cur+1)) history.replaceState(null,'','#'+(cur+1)); }
    function fromHash(){ var h=parseInt((location.hash||'').slice(1),10); show(isNaN(h)?0:h-1); }
    function fit(){ var s=Math.min(W.innerWidth/1280,W.innerHeight/720); deck.style.transform='scale('+s+')'; }
    SG.show=show; SG.refresh=function(){ refresh(); fit(); };
    if(!SG._bound){ SG._bound=true;
      W.addEventListener('keydown',function(e){
        if(/^(input|textarea|select)$/i.test((e.target.tagName||''))) return;
        if(e.target.isContentEditable) return;                       /* WYSIWYG edit in progress */
        if(D.body.classList.contains('forge-edit')) return;          /* editor owns keys in edit mode */
        if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '||e.key==='PageDown'){ if(SG.stepNext()){ e.preventDefault(); return; } show(cur+1); e.preventDefault(); }
        else if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp'){ show(cur-1); e.preventDefault(); }
        else if(e.key==='Home'){ show(0); } else if(e.key==='End'){ show(n-1); }
        else if(e.key==='e'||e.key==='E'){ SG.exportJSON(); }
        else if(e.key==='i'||e.key==='I'){ SG.importJSON(); }
        else if(e.key==='p'||e.key==='P'){ W.print(); }
        else if(e.key==='d'||e.key==='D'){ SG.toggleDocs(); }
        else if(e.key==='f'||e.key==='F'){ SG.present(); }
        else if(e.key==='s'||e.key==='S'){ SG.speaker(); } });
      D.addEventListener('fullscreenchange',function(){
        if(!(D.fullscreenElement||D.webkitFullscreenElement)) D.body.classList.remove('presenting'); });
      deck.addEventListener('click',function(e){ if(e.target.closest('a,button,input')) return; if(SG.stepNext()) return; show(cur+1); });
      W.addEventListener('resize',fit);
      W.addEventListener('hashchange',fromHash);
    }
    refresh(); fit();
  }

  /* ---------- click-triggered animation steps (build steps) ----------
     Elements whose animation trigger is "click" carry data-anim-trigger/step.
     Forward navigation plays the next pending step (lowest step number first,
     ties together) before leaving the slide. Going back just navigates. */
  SG.stepNext=function(){
    if(!(SG.data&&SG.data.defaults&&SG.data.defaults.buildSteps)) return false;  /* toggle: off by default */
    var sec=D.querySelector('.slide.active'); if(!sec) return false;
    var pend=[].slice.call(sec.querySelectorAll('[data-anim-trigger="click"]'))
      .filter(function(n){ return !n.classList.contains('run'); });
    if(!pend.length) return false;
    var next=Math.min.apply(0,pend.map(function(n){ return +n.getAttribute('data-anim-step')||0; }));
    pend.filter(function(n){ return (+n.getAttribute('data-anim-step')||0)===next; })
      .forEach(function(n){ n.classList.remove('run'); void n.offsetWidth; n.classList.add('run'); });
    return true; };

  /* ---------- export / import / pdf ---------- */
  SG.exportJSON=function(){
    var blob=new Blob([JSON.stringify(SG.data,null,2)],{type:'application/json'});
    var a=D.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=((SG.data.meta&&SG.data.meta.title)||'deck').replace(/[^\w.-]+/g,'-').toLowerCase()+'.json';
    D.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000); };
  SG.importJSON=function(){ var inp=D.getElementById('deck-import'); if(inp) inp.click(); };
  SG.toggleDocs=function(){ D.body.classList.toggle('hide-docs'); };
  SG.present=function(){
    var el=D.documentElement, fs=D.fullscreenElement||D.webkitFullscreenElement;
    if(!fs){ var req=el.requestFullscreen||el.webkitRequestFullscreen; if(req) req.call(el);
      D.body.classList.add('presenting'); }
    else { var ex=D.exitFullscreen||D.webkitExitFullscreen; if(ex) ex.call(D);
      D.body.classList.remove('presenting'); } };
  function onImportFile(file){ var fr=new FileReader();
    fr.onload=function(){ try{ var data=SG.migrate(JSON.parse(fr.result));
      SG.render(D.getElementById('deck'),data); SG.refresh();
    }catch(err){ alert('Could not import JSON: '+err.message); } };
    fr.readAsText(file); }

  /* ---- resolve animated content to its FINAL state for printing/PDF ----
     window.print() (the P key / Save PDF button) does NOT force reduced motion, so on
     every non-active slide the entrance animations are still in their hidden initial
     state when the browser captures the PDF. beforeprint fills the JS-driven ones
     (count-ups, KPI rings) and flags entrance elements; print CSS resolves the CSS-only
     ones. (render.sh --pdf already forces reduced motion, so this is belt-and-suspenders.) */
  function fmtCompact(n){ var a=Math.abs(n),T=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
    for(var i=0;i<T.length;i++){ if(a>=T[i][0]) return (n/T[i][0]).toFixed(1).replace(/\.0$/,'')+T[i][1]; }
    return String(Math.round(n)); }
  SG.finalizeAnimations=function(scope){ scope=scope||D;
    scope.querySelectorAll('.sg-count').forEach(function(n){
      var to=parseFloat(n.dataset.to)||0, suf=n.dataset.suffix||'';
      n.textContent=(n.dataset.fmt==='compact'?fmtCompact(to):Math.round(to).toLocaleString())+suf; });
    scope.querySelectorAll('.sg-ring').forEach(function(n){
      var p=+n.dataset.p||0, v=n.querySelector('.sg-ring-v');
      n.style.setProperty('--p',p); if(v) v.textContent=p+(n.dataset.suffix||'%'); });
    scope.querySelectorAll('.sg-onenter,.sg-draw').forEach(function(n){ n.classList.add('run'); }); };
  W.addEventListener('beforeprint', function(){ SG.finalizeAnimations(); });

  /* =====================================================================
     SPEAKER VIEW (press S) — popup with the current slide, next-up, presenter
     notes (slides[i].notes) and a timer. The popup carries a copy of the deck
     styles and is driven entirely from this window (no scripts inside it), so
     it works from file:// with zero extra machinery.
     ===================================================================== */
  SG._spk=null;
  SG.speaker=function(){
    if(SG._spk && !SG._spk.closed){ SG._spk.focus(); return; }
    var w=W.open('','forge-speaker','width=1020,height=660');
    if(!w){ alert('Popup blocked - allow popups for this file to use the speaker view.'); return; }
    SG._spk=w;
    var css=''; [].slice.call(D.querySelectorAll('style')).forEach(function(s){ css+=s.textContent+'\n'; });
    var doc=w.document;
    doc.write('<!doctype html><html><head><title>Speaker view</title><style>'+css+'</style><style>'
      +'html,body{margin:0;height:100%;overflow:hidden;background:#0b0e14 !important;color:#dbe3ef;display:block !important;place-items:initial !important;font-family:system-ui,sans-serif}'
      +'.spk-wrap{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;height:100%;padding:16px;box-sizing:border-box}'
      +'.spk-stage{position:relative;overflow:hidden;border-radius:10px;background:#000}'
      +'.spk-stage .deck{position:absolute;left:0;top:0;width:1280px;height:720px;transform-origin:top left;border-radius:0;box-shadow:none}'
      +'.spk-side{display:flex;flex-direction:column;gap:12px;min-width:0}'
      +'.spk-meta{display:flex;gap:18px;align-items:baseline;font-variant-numeric:tabular-nums}'
      +'#spk-timer{font-size:34px;font-weight:700;color:#2ee6a6}#spk-clock{font-size:16px;color:#7e8aa0}#spk-pg{font-size:16px;color:#7e8aa0;margin-left:auto}'
      +'.spk-notes{flex:1;background:#12161f;border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:14px 16px;'
      +'font-size:17px;line-height:1.6;white-space:pre-wrap;overflow:auto;color:#e8eefb}'
      +'.spk-next{background:#12161f;border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:10px 14px;font-size:13px;color:#9aa6ba}'
      +'.spk-next b{display:block;color:#dbe3ef;font-size:15px;margin-top:2px}'
      +'.spk-h{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7e8aa0;margin:0 0 6px}'
      +'.deck-ui,.forge-chrome{display:none !important}'
      +'</style></head><body>'
      +'<div class="spk-wrap"><div class="spk-stage"><div class="deck" id="spk-cur"></div></div>'
      +'<div class="spk-side"><div class="spk-meta"><span id="spk-timer">0:00</span><span id="spk-clock"></span><span id="spk-pg"></span></div>'
      +'<div><p class="spk-h">Notes</p></div><div class="spk-notes" id="spk-notes"></div>'
      +'<div class="spk-next"><span>Next up</span><b id="spk-next"></b></div></div></div>'
      +'</body></html>');
    doc.close();
    var t0=Date.now(), lastI=-1;
    function fmt(ms){ var s=Math.floor(ms/1000); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
    function titleOf(sl){ return (sl.content&&(sl.content.title||sl.content.statement||sl.content.quote))||sl.layout; }
    function update(){
      if(w.closed){ clearInterval(iv); SG._spk=null; return; }
      var slides=(SG.data&&SG.data.slides)||[]; if(!slides.length) return;
      var i=(parseInt((location.hash||'').slice(1),10)||1)-1; i=Math.max(0,Math.min(slides.length-1,i));
      var wd=w.document;
      if(i!==lastI){ lastI=i;
        var secs=D.querySelectorAll('#deck .slide'), cur=wd.getElementById('spk-cur');
        if(cur&&secs[i]){ cur.innerHTML='';
          var cl=secs[i].cloneNode(true); cl.classList.add('active');
          [].slice.call(cl.querySelectorAll('.forge-handles,.forge-guides,.forge-marquee,.doc-panel')).forEach(function(n){ n.remove(); });
          cur.appendChild(cl); if(SG.finalizeAnimations) SG.finalizeAnimations(cur); }
        wd.getElementById('spk-notes').textContent=slides[i].notes||'(no notes for this slide)';
        var nx=slides[i+1];
        wd.getElementById('spk-next').textContent=nx?((i+2)+' \u00b7 '+titleOf(nx)):'\u2014 end of deck \u2014';
        wd.getElementById('spk-pg').textContent=(i+1)+' / '+slides.length;
        var st=wd.getElementById('spk-cur').parentNode.getBoundingClientRect();
        var sc=Math.min(st.width/1280, st.height/720);
        wd.getElementById('spk-cur').style.transform='scale('+sc+')'; }
      wd.getElementById('spk-clock').textContent=new Date().toLocaleTimeString();
      wd.getElementById('spk-timer').textContent=fmt(Date.now()-t0); }
    var iv=setInterval(update,300); update();
    /* arrows in the popup drive the main deck */
    w.document.addEventListener('keydown',function(e){
      var i=(parseInt((location.hash||'').slice(1),10)||1)-1;
      if(e.key==='ArrowRight'||e.key===' '||e.key==='ArrowDown'){ SG.show(i+1); e.preventDefault(); }
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ SG.show(i-1); e.preventDefault(); } });
    w.addEventListener('resize',function(){ lastI=-1; });
  };

  /* ---------- boot ---------- */
  SG.boot=function(){
    loadAssets();
    var deck=D.getElementById('deck');
    var dataEl=D.getElementById('deck-data');
    try{ SG.data=SG.migrate(JSON.parse(dataEl.textContent)); }
    catch(e){ deck.innerHTML='<section class="slide active"><div class="title">⚠ deck-data is not valid JSON</div><p class="subtitle">'+esc(e.message)+'</p></section>'; SG.data=null; return; }
    SG.render(deck,SG.data);
    mountNav(deck);
    var inp=D.getElementById('deck-import');
    if(inp) inp.addEventListener('change',function(){ if(inp.files&&inp.files[0]) onImportFile(inp.files[0]); inp.value=''; });
  };
})();
