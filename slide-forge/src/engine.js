/* =====================================================================
   DECK ENGINE — data-driven rendering.
   A deck is a JSON document (the deck-data JSON block) rendered through a
   registry of layout templates. The renderer derives numbering/progress, so
   adding or reordering slides never means hand-editing pagers. Per-slide
   "theme" patches override the global :root as scoped CSS variables. Assets
   (icons/images/styles) are resolved from an inlined registry. The live deck
   also exports/imports its JSON and prints to PDF.
   ===================================================================== */
(function(){
  var W = window, D = document, SG = W.SG = W.SG || {};

  /* ---------- schema migration (additive; v1 decks are valid v2 decks) ----------
     meta.schemaVersion stamps the deck; migrate() upgrades older decks in place.
     v2 adds OPTIONAL keys only: overrides[key].z, slides[i].notes, top-level
     `brand` and `masters` — so migrating a v1 deck is just stamping the version. */
  SG.SCHEMA_VERSION = 2;
  SG.migrate = function(data){ if(!data||typeof data!=='object') return data;
    var m = data.meta = data.meta || {};
    var v = parseInt(m.schemaVersion,10) || 1;
    if(v < 2){ /* v1 -> v2: purely additive, nothing to rewrite */ }
    m.schemaVersion = SG.SCHEMA_VERSION;
    return data; };

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
  SG.esc=esc; SG.rich=rich;   /* exposed so the Forge editor can escape/format text too */
  function kicker(t){ return t?'<div class="eyebrow-row"><span class="kicker">'+rich(t)+'</span></div>':''; }
  function title(t){ return t?'<h1 class="title">'+rich(t)+'</h1>':''; }
  /* split a string into per-letter kinetic spans (divider headline entrance) */
  function kinetic(s){ var o='',a=String(s).split(''); for(var i=0;i<a.length;i++){
    var ch=a[i]===' '?'&nbsp;':esc(a[i]); o+='<span style="--i:'+i+'">'+ch+'</span>'; } return o; }

  /* ---------- asset registry (icons inline+themeable, images base64) ---------- */
  SG.assets = SG.assets || {icons:{},images:{},styles:''};
  function loadAssets(){
    var el=D.getElementById('deck-assets'); if(!el) return;
    try{ var a=JSON.parse(el.textContent||'{}');
      SG.assets={icons:a.icons||{},images:a.images||{},styles:a.styles||''};
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
  function imageURL(name){ return (SG.assets.images||{})[name]||''; }

  /* =====================================================================
     LAYOUT REGISTRY  —  name -> function(content) -> innerHTML.
     Pager + progress are appended by the renderer, never here.
     ===================================================================== */
  var L = SG.layouts = {};

  L.cover=function(c){
    var meta=arr(c.meta).map(function(m){ var t=typeof m==='string'?m:m.text;
      return (typeof m==='object'&&m.strong)?'<span><b>'+esc(t)+'</b></span>':'<span>'+esc(t)+'</span>'; }).join('');
    return '<div class="orb a"></div><div class="orb b"></div><div class="orb c"></div>'
      + kicker(c.kicker)
      + '<h1 class="title sg-fade-rise sg-onenter">'+rich(c.title||'')
        + (c.accent?'<span class="glow sg-glow-pulse">'+esc(c.accent)+'</span>':'')+'</h1>'
      + (c.subtitle?'<p class="subtitle">'+rich(c.subtitle)+'</p>':'')
      + (meta?'<div class="meta">'+meta+'</div>':''); };

  L.agenda=function(c){
    var items=arr(c.items).map(function(it,i){
      return '<div class="ag-item"><div class="ag-num">'+pad(i+1)+'</div><div class="ag-body">'
        +'<h3>'+rich(it.title)+'</h3>'+(it.desc?'<p>'+rich(it.desc)+'</p>':'')+'</div></div>'; }).join('');
    return '<div class="rail"></div>'+kicker(c.kicker)+title(c.title)
      +'<div class="agenda-grid sg-stagger sg-onenter">'+items+'</div>'; };

  L.divider=function(c){
    return '<div class="big-index">'+esc(c.index||'')+'</div>'
      +'<h1 class="title"><span class="sg-kinetic sg-onenter">'+kinetic(c.title||'')+'</span></h1>'
      +(c.subtitle?'<p class="subtitle">'+rich(c.subtitle)+'</p>':''); };

  L['stat-grid']=function(c){
    var stats=arr(c.stats).map(function(s){
      var num = s.count!=null
        ? '<span class="sg-count" data-to="'+esc(s.count)+'" data-dur="1300"'
            +(s.fmt?' data-fmt="'+esc(s.fmt)+'"':'')+'>0</span>'
        : esc(s.value);
      var unit=s.unit?'<small>'+esc(s.unit)+'</small>':'';
      return '<div class="stat"><div class="num">'+num+unit+'</div><div class="lbl">'+rich(s.label)+'</div></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="stat-grid">'+stats+'</div>'; };

  L.bignum=function(c){
    var hero = c.count!=null
      ? '<span class="sg-count" data-to="'+esc(c.count)+'" data-dur="1800"'+(c.fmt?' data-fmt="'+esc(c.fmt)+'"':'')+'>0</span>'
      : esc(c.value);
    return kicker(c.kicker)+'<div class="hero-num">'+hero+'</div>'
      +(c.subtitle?'<p class="subtitle">'+rich(c.subtitle)+'</p>':''); };

  L.chart=function(c){
    var note=c.note?'<p style="font-family:var(--font-mono);font-size:13px;color:var(--faint)">'+esc(c.note)+'</p>':'';
    /* v2: author charts as data (type + data.labels/series); SG.charts renders
       theme-token SVG. content.svg / content.body stays the bespoke escape hatch. */
    var body=c.data?(SG.charts?SG.charts.render(c):''):(c.svg||c.body||'');
    return '<div class="chart-head"><div>'+kicker(c.kicker)+title(c.title)+'</div>'+note+'</div>'
      +'<div class="chart-wrap">'+body+'</div>'; };

  L.table=function(c){
    var o=c.options||{}, cols=arr(c.columns), hi=o.highlightCol!=null?+o.highlightCol:-1;
    var head='<tr>'+cols.map(function(h,j){ return '<th'+(j===hi?' class="hi"':'')+'>'+rich(h)+'</th>'; }).join('')+'</tr>';
    var body=arr(c.rows).map(function(r,i){ return '<tr>'+arr(r).map(function(cell,j){
      return '<td'+(j===hi?' class="hi"':'')+'>'+rich(String(cell==null?'':cell))+'</td>'; }).join('')+'</tr>'; }).join('');
    var note=c.note?'<p class="tbl-note">'+esc(c.note)+'</p>':'';
    return kicker(c.kicker)+title(c.title)
      +'<div class="tbl-wrap sg-fade-rise sg-onenter"><table class="tbl'+(o.compact?' compact':'')+'"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>'+note+'</div>'; };

  L.comparison=function(c){
    function col(side,cls){ if(!side) return '';
      var items=arr(side.items).map(function(x){return '<li>'+rich(x)+'</li>';}).join('');
      return '<div class="cmp-col '+cls+'">'+(side.tag?'<div class="tag">'+rich(side.tag)+'</div>':'')
        +'<h3>'+rich(side.title)+'</h3><ul>'+items+'</ul></div>'; }
    return kicker(c.kicker)+title(c.title)+'<div class="cmp">'
      +col(c.left,'sup')+'<div class="vs-rail"><div class="vs-badge">'+esc(c.badge||'VS')+'</div></div>'
      +col(c.right,'uns')+'</div>'; };

  L.quote=function(c){
    return '<div class="quote-mark">&ldquo;</div>'
      +'<blockquote class="sg-reveal-wipe sg-onenter">'+rich(c.quote)+'</blockquote>'
      +(c.by?'<div class="by"><div class="line"></div><span>'+rich(c.by)+'</span></div>':'')
      +(c.subtitle?'<p class="subtitle" style="margin-top:26px">'+rich(c.subtitle)+'</p>':''); };

  L.code=function(c){
    return kicker(c.kicker)+title(c.title)+'<div class="code-stage"><div class="code-panel">'
      +'<div class="code-bar"><span class="dotrow"><i></i><i></i><i></i></span>'+esc(c.filename||'')+'</div>'
      +'<div class="code-sweep"></div><pre>'+(c.code||'')+'<span class="caret"></span></pre></div>'
      +(c.caption?'<p class="code-cap">'+rich(c.caption)+'</p>':'')+'</div>'; };

  L.timeline=function(c){
    var items=arr(c.items).map(function(it){
      return '<div class="tl-item"><div class="yr">'+esc(it.year)+'</div>'
        +'<div class="tl-dot'+(it.now?' now':'')+'"></div>'
        +'<div class="ev"><b>'+rich(it.title)+'</b>'+rich(it.desc||'')+'</div></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)
      +'<div class="timeline"><div class="tl-track"></div><div class="tl-spark"></div>'
      +'<div class="tl-items">'+items+'</div></div>'; };

  L.pipeline=function(c){
    var nodes=arr(c.nodes), out='';
    nodes.forEach(function(n,i){
      var ico = n.iconAsset?icon(n.iconAsset):'<div class="ico">'+esc(n.icon||'')+'</div>';
      if(n.iconAsset) ico='<div class="ico">'+ico+'</div>';
      out+='<div class="pipe-node">'+ico+'<h3>'+rich(n.title)+'</h3>'+(n.desc?'<p>'+rich(n.desc)+'</p>':'')+'</div>';
      if(i<nodes.length-1) out+='<div class="pipe-conn"><div class="pipe-packet" style="animation-delay:'+(i*0.6)+'s"></div></div>'; });
    return kicker(c.kicker)+title(c.title)+'<div class="pipe">'+out
      +(c.loop?'<div class="pipe-loop">'+esc(c.loop)+'</div>':'')+'</div>'; };

  L.closing=function(c){
    var takes=arr(c.takeaways).map(function(t,i){
      return '<div><div class="n">'+pad(i+1)+'</div><h3>'+rich(t.title)+'</h3><p>'+rich(t.desc)+'</p></div>'; }).join('');
    var check='<svg class="sg-check sg-onenter" viewBox="0 0 52 52" width="30" height="30" fill="none" stroke="var(--mint)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="26" r="24"></circle><path class="tick" d="M16 27 L23 34 L37 18"></path></svg>';
    return '<div class="orb b" style="opacity:.30"></div><div class="orb c"></div>'
      +kicker(c.kicker)
      +'<h1 class="title">'+rich(c.title||'')+(c.accent?' <span class="glow">'+esc(c.accent)+'</span>':'')+'</h1>'
      +'<div class="take sg-stagger sg-onenter">'+takes+'</div>'
      +(c.note?'<div class="meta">'+check+'<span>'+rich(c.note)+'</span></div>':''); };

  L.raw=function(c){ return c.html||''; };  /* escape hatch: literal HTML, still numbered+themed */

  /* ---------- new canvas-derived layouts ---------- */
  L.manifesto=function(c){
    var st=esc(c.statement||'').replace(/\[\[(.+?)\]\]/g,'<em>$1</em>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>');
    return '<div class="mark"></div><div class="statement sg-glow-pulse-box">'+st+'</div>'
      +(c.lead?'<p class="lead">'+rich(c.lead)+'</p>':''); };

  L.editorial=function(c){
    var cols=arr(c.columns).map(function(col){
      return '<div class="ed-col"><h3>'+rich(col.head)+'</h3><p>'+rich(col.body)+'</p></div>'; }).join('');
    return kicker(c.kicker)+'<div class="editorial">'
      +'<div class="ed-lead sg-reveal-wipe sg-onenter">'+rich(c.lead)+'</div>'
      +'<div class="ed-cols sg-stagger sg-onenter">'+cols+'</div></div>'; };

  L['hero-asym']=function(c){
    var rows=arr(c.rows).map(function(r){
      return '<div class="row"><div class="k">'+esc(r.k)+'</div><div class="v">'+esc(r.v)
        +(r.unit?'<small> '+esc(r.unit)+'</small>':'')+'</div></div>'; }).join('');
    var t=esc(c.title||'').replace(/\[\[(.+?)\]\]/g,'<em>$1</em>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>');
    return '<div class="hero-asym"><div><div class="htitle">'+t+'</div>'
      +(c.sub?'<p class="hsub">'+rich(c.sub)+'</p>':'')+'</div>'
      +'<div class="hero-rail sg-stagger sg-onenter">'+rows+'</div></div>'; };

  L.figure=function(c){
    var url=imageURL(c.image);
    var bg=url?'background-image:url('+JSON.stringify(url)+')':'background:linear-gradient(135deg,var(--bg-2),var(--bg))';
    return '<div class="fig-img" style="'+bg+'"></div><div class="fig-shade"></div>'
      +'<div class="fig-body">'+kicker(c.kicker)
      +'<div class="fig-title sg-reveal-wipe sg-onenter">'+rich(c.title)+'</div>'
      +(c.caption?'<p class="fig-cap">'+rich(c.caption)+'</p>':'')+'</div>'; };

  L['metric-dash']=function(c){
    var r=c.ring||{};
    var ring='<div class="dash-ring"><div class="sg-ring" data-p="'+esc(r.value||0)+'" data-suffix="'+esc(r.suffix||'%')+'">'
      +'<span class="sg-ring-v">0</span></div><div class="cap">'+rich(r.label||'')+'</div></div>';
    var tiles=arr(c.tiles).map(function(t){
      return '<div class="dash-tile"><div class="v">'+esc(t.value)+(t.unit?'<small>'+esc(t.unit)+'</small>':'')+'</div>'
        +'<div class="l">'+rich(t.label)+'</div></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="dash">'+ring+'<div class="dash-tiles sg-stagger sg-onenter">'+tiles+'</div></div>'; };

  L.leaderboard=function(c){
    var rows=arr(c.rows), max=0; rows.forEach(function(r){ var v=parseFloat(r.pct!=null?r.pct:r.value)||0; if(v>max)max=v; });
    var body=rows.map(function(r,i){ var v=parseFloat(r.pct!=null?r.pct:r.value)||0; var w=max?Math.round(v/max*100):0;
      return '<div class="board-row"><div class="rk">'+pad(i+1)+'</div>'
        +'<div class="board-bar"><div class="fill" style="width:'+w+'%"></div><div class="nm">'+rich(r.name)+'</div></div>'
        +'<div class="val">'+esc(r.value)+'</div></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="board sg-stagger sg-onenter">'+body+'</div>'; };

  L.diptych=function(c){
    function panel(side,cls){ side=side||{};
      return '<div class="dip-panel '+cls+'">'+(cls==='left'?'<div class="divline"></div>':'')
        +(side.tag?'<div class="tag">'+esc(side.tag)+'</div>':'')
        +'<div class="big">'+rich(side.title)+'</div>'+(side.body?'<p>'+rich(side.body)+'</p>':'')+'</div>'; }
    return panel(c.left,'left')+panel(c.right,'right'); };

  L.matrix=function(c){
    var cells=arr(c.cells).map(function(q){
      return '<div class="mx-cell'+(q.hot?' hot':'')+'"><h3>'+rich(q.title)+'</h3><p>'+rich(q.desc)+'</p></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="matrix sg-stagger sg-onenter">'+cells
      +(c.xlabel?'<div class="mx-axis-x">'+esc(c.xlabel)+'</div>':'')
      +(c.ylabel?'<div class="mx-axis-y">'+esc(c.ylabel)+'</div>':'')+'</div>'; };

  L.stack=function(c){
    var bands=arr(c.bands).map(function(b){
      var ic=b.iconAsset?icon(b.iconAsset):'<span class="si">'+esc(b.icon||'')+'</span>';
      if(b.iconAsset) ic='<span class="si">'+ic+'</span>';
      return '<div class="stack-band">'+ic+'<div class="st"><h3>'+rich(b.title)+'</h3>'+(b.desc?'<p>'+rich(b.desc)+'</p>':'')+'</div></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="stack sg-stagger sg-onenter">'+bands+'</div>'; };

  L['quote-mosaic']=function(c){
    var qs=arr(c.quotes).map(function(q){
      return '<div class="mq"><blockquote>'+rich(q.quote)+'</blockquote><div class="by">'+rich(q.by)+'</div></div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="mosaic sg-stagger sg-onenter">'+qs+'</div>'; };

  L['index-mosaic']=function(c){
    var items=arr(c.items).map(function(it,i){
      return '<div class="ix"><div class="ixn">'+pad(i+1)+'</div><h3>'+rich(it.title)+'</h3>'
        +(it.desc?'<p>'+rich(it.desc)+'</p>':'')+'</div>'; }).join('');
    return kicker(c.kicker)+title(c.title)+'<div class="indexm sg-stagger sg-onenter">'+items+'</div>'; };

  L['before-after']=function(c){
    function col(s,cls){ s=s||{}; var items=arr(s.items).map(function(x){return '<li>'+rich(x)+'</li>';}).join('');
      return '<div class="bna-col '+cls+'"><div class="tag">'+rich(s.tag||(cls==='after'?'After':'Before'))+'</div>'
        +'<h3>'+rich(s.title)+'</h3><ul>'+items+'</ul></div>'; }
    return kicker(c.kicker)+title(c.title)+'<div class="bna">'+col(c.before,'before')
      +'<div class="bna-arrow">&rarr;</div>'+col(c.after,'after')+'</div>'; };

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
  function brandMark(brand,lay){ if(!brand||!brand.logo) return '';
    if(lay!=='cover'&&lay!=='closing') return '';
    var url=imageURL(brand.logo); if(!url) return '';
    return '<img class="brand-mark" src="'+esc(url)+'" alt="'+esc(brand.name||'logo')+'">'; }

  /* Layouts whose CSS targets the <section> itself. Every other layout styles
     INNER containers only, so putting the layout name on the section would let an
     inner class (e.g. .matrix, .timeline, .stat-grid) restyle the slide and break
     .slide{position:absolute;inset:0}. We add a harmless lyt-<name> hook instead. */
  var SECTION_LAYOUTS={cover:1,divider:1,bignum:1,quote:1,closing:1,manifesto:1,figure:1,diptych:1};

  SG.render=function(deck,data){
    data=data||SG.data; SG.data=data;
    var slides=arr(data.slides), total=slides.length;
    var defAmb=(data.defaults&&data.defaults.ambient)||'auto';
    applyGlobalTheme(data.theme);
    applyBrand(data.brand);
    if(data.meta){ if(data.meta.title) D.title=data.meta.title;
      if(data.meta.seed!=null){ D.documentElement.setAttribute('data-seed',data.meta.seed);
        SG.rng=SG.makeRng(parseInt(data.meta.seed,10)||1); } }
    var html='';
    slides.forEach(function(s,i){
      var fn=L[s.layout]||L.raw;
      var inner; try{ inner=fn(s.content||{},{index:i,total:total}); }
      catch(e){ inner='<div class="title" style="color:var(--cyan)">⚠ layout "'+esc(s.layout)+'" failed</div>'
        +'<p class="subtitle">'+esc(e.message)+'</p>'; }
      var lay=s.layout||'raw';
      var cls='slide'+(SECTION_LAYOUTS[lay]?(' '+lay):'')+' lyt-'+lay+(s.class?(' '+s.class):'');
      var sty=themeStyle(s.theme);
      /* resolve the ambient: a named one injects a universal background layer;
         "none" silences motion; "auto"/absent keeps the layout's built-in ambient. */
      var amb=(s.ambient!=null)?s.ambient:defAmb, ambLayer='', ambAttr='';
      if(amb==='none'){ ambAttr=' data-ambient="none"'; }
      else if(amb&&amb!=='auto'){ ambLayer='<div class="amb amb-'+esc(amb)+'" aria-hidden="true"></div>'; }
      html+='<section class="'+cls+'" data-i="'+(i+1)+'" role="group" aria-roledescription="slide" aria-label="Slide '+(i+1)+' of '+total+'"'
        +(sty?' style="'+sty+'"':'')+ambAttr+'>'
        +ambLayer+inner+brandMark(data.brand,lay)
        +(s.doc?'<div class="doc-panel"><div class="doc-h">JSON · layout "'+esc(s.layout)+'"</div><pre>'+esc(s.doc)+'</pre></div>':'')
        +'<div class="pager">'+pad(i+1)+' / '+pad(total)+'</div>'
        +'<div class="progress" style="width:'+pctw(i+1,total)+'%"></div>'
        +'</section>';
    });
    deck.innerHTML=html;
    /* re-attach entrance-animation observers to the fresh slide nodes; without
       this the first shown slide keeps .sg-onenter elements at their hidden base */
    if(SG.wireAnims) SG.wireAnims(deck);
  };

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
    catch(e){ deck.innerHTML='<section class="slide active"><div class="title">⚠ deck-data is not valid JSON</div><p class="subtitle">'+esc(e.message)+'</p></section>'; return; }
    SG.render(deck,SG.data);
    mountNav(deck);
    var inp=D.getElementById('deck-import');
    if(inp) inp.addEventListener('change',function(){ if(inp.files&&inp.files[0]) onImportFile(inp.files[0]); inp.value=''; });
  };
})();
