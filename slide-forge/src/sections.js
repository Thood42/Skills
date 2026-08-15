/* =====================================================================
   SECTION REGISTRY  —  the composition vocabulary (composer plan §A–§C).

   A slide used to be exactly one of 29 fixed layouts. A SECTION is the piece
   a layout is made of — a title band, a stat row, a quote — extracted from
   the layout's own body and parameterized by ONE thing: a key prefix.

     S[type].build(content, base) -> Node[]

   `base` is '' for a classic caller, so `L['stat-grid']` is now literally
   `S.titleband.build(c,'').concat(S.stats.build(c,''))` and renders
   byte-identically to v3 (tests/parity.mjs is the guard). The `composed`
   layout calls the SAME builders with base='sections.N.content.', so every
   authored data-el/data-bind/data-arr key stays a literal content path and
   the entire v3 identity machinery (overrides, bind write-back, hide/fs,
   item verbs, GC) works at section depth with no new machinery.

   Composed slide content:
     content.sections = [ Section | Row ]
     Section = {type:<name in S>, size?:<flex weight>, content:{…}}
     Row     = {type:'row', size?:<flex weight>, items:[Section]}
   Rows are the only nesting — rows cannot contain rows. That ceiling is
   deliberate: it keeps the editor's mental model and the validator sane.

   The v1 vocabulary is 12 types, each lifted from the layout named in
   parentheses, and each keeping that layout's field names verbatim:

     titleband (every headed layout)  stats (stat-grid)   bignum (bignum)
     chart (chart)     table (table)      comparison (comparison)
     quote (quote)     agenda (agenda)    timeline (timeline)
     prose (editorial) media (media-split picture side)
     bullets (media-split text side)

   Ten classic layouts are now compositions of these; the rest stay monolithic
   because they are genuinely bespoke (cover, divider, closing, figure, image,
   diptych, hero-asym, manifesto, embed, raw) or are simply deferred to a later
   wave (pipeline, code, metric-dash, leaderboard, matrix, stack, the mosaics,
   before-after). A non-decomposable layout is not broken — it just can't have
   a section inserted into its flow, and the editor falls back to a floating
   object there.

   Loads AFTER engine.js (consumes SG.N / SG.h / SG.layouts) and BEFORE
   editor.js.
   ===================================================================== */
(function(){
  var W=window, SG=W.SG=W.SG||{}, N=SG.N, L=SG.layouts, h=SG.h||{};
  var rich=h.rich, esc=h.esc, arr=h.arr, pad=h.pad, kickerN=h.kickerN, titleN=h.titleN;
  var mediaImgWrap=h.mediaImgWrap, fitStyle=h.fitStyle;

  var S = SG.S = {};

  /* ---------- titleband — the kicker + title every headed layout opens with ---------- */
  S.titleband = {
    label:'Title band',
    fields:['kicker','title'],
    defaults:{kicker:'Kicker', title:'Section title'},
    build:function(c,b){ b=b||'';
      return [ kickerN(c.kicker,b), titleN(c.title,b) ]; }
  };

  /* ---------- stats — the stat-grid card row ---------- */
  S.stats = {
    label:'Stat row',
    fields:['stats'],
    defaults:{stats:[{value:'42',unit:'%',label:'What it measures'},
                     {value:'3x',label:'What it measures'}]},
    build:function(c,b){ b=b||'';
      return [ N('div.stat-grid',{key:b+'stats',arr:b+'stats'},arr(c.stats).map(function(s,i){ var P=b+'stats.'+i;
        var num = s.count!=null
          ? '<span class="sg-count" data-to="'+esc(s.count)+'" data-dur="1300"'
              +(s.fmt?' data-fmt="'+esc(s.fmt)+'"':'')+'>0</span>'
          : esc(s.value);
        return N('div.stat',{key:P},[
          N('div.num',{key:P+'.num',html:num+(s.unit?'<small>'+esc(s.unit)+'</small>':'')}),
          N('div.lbl',{bind:P+'.label',html:rich(s.label)}) ]); })) ]; }
  };

  /* ---------- quote — a SECTION_LAYOUTS refugee: its CSS targets the <section>
       itself, so deck.css dual-scopes those rules `.quote, .sec-quote` ---------- */
  S.quote = {
    label:'Quote',
    fields:['quote','by','subtitle'],
    defaults:{quote:'A line worth putting on a slide.', by:'Attribution'},
    build:function(c,b){ b=b||'';
      return [ N('div.quote-mark',{key:b+'mark',html:'&ldquo;'}),
        N('blockquote.sg-reveal-wipe.sg-onenter',{bind:b+'quote',html:rich(c.quote)}),
        c.by?N('div.by',{key:b+'by'},[N('div.line'),
          N('span',{key:b+'by.text',bind:b+'by',html:rich(c.by)})]):null,
        c.subtitle?N('p.subtitle',{bind:b+'subtitle',style:'margin-top:26px',html:rich(c.subtitle)}):null ]; }
  };

  /* ---------- bignum — one enormous number. A SECTION_LAYOUTS refugee
       (`.bignum` centres the whole <section>), dual-scoped `.bignum, .sec-bignum`.
       The kicker stays OUT so a bignum section can sit under a titleband without
       two kickers; the classic layout adds its own. ---------- */
  S.bignum = {
    label:'Big number',
    fields:['value','count','unit','fmt','subtitle'],
    defaults:{value:'42', subtitle:'What the number means'},
    build:function(c,b){ b=b||'';
      var hero = c.count!=null
        ? '<span class="sg-count" data-to="'+esc(c.count)+'" data-dur="1800"'+(c.fmt?' data-fmt="'+esc(c.fmt)+'"':'')+'>0</span>'
        : esc(c.value);
      return [ N('div.hero-num',{key:b+'num',html:hero}),
        c.subtitle?N('p.subtitle',{bind:b+'subtitle',html:rich(c.subtitle)}):null ]; }
  };

  /* ---------- chart — carries its own head (the note sits on the title's
       baseline), so it does NOT want a titleband above it ---------- */
  S.chart = {
    label:'Chart',
    fields:['kicker','title','note','type','data'],
    defaults:{title:'Chart title', type:'bar',
              data:{labels:['A','B','C'], series:[{name:'Series', values:[3,5,4]}]}},
    build:function(c,b){ b=b||'';
      /* v2+: author charts as data (type + data.labels/series); SG.charts renders
         theme-token SVG. content.svg / content.body stays the bespoke escape hatch. */
      var body=c.data?(SG.charts?SG.charts.render(c):''):(c.svg||c.body||'');
      return [ N('div.chart-head',{key:b+'head'},[
          N('div',null,[kickerN(c.kicker,b),titleN(c.title,b)]),
          c.note?N('p',{key:b+'note',bind:b+'note',text:c.note,
            style:'font-family:var(--font-mono);font-size:13px;color:var(--faint)'}):null ]),
        N('div.chart-wrap',{key:b+'chart',html:body}) ]; }
  };

  S.table = {
    label:'Table',
    fields:['columns','rows','options','note'],
    defaults:{columns:['','A','B'], rows:[['Row 1','–','–'],['Row 2','–','–']]},
    build:function(c,b){ b=b||'';
      var o=c.options||{}, cols=arr(c.columns), hi=o.highlightCol!=null?+o.highlightCol:-1;
      return [ N('div.tbl-wrap.sg-fade-rise.sg-onenter',{key:b+'table'},[
        N('table.tbl'+(o.compact?'.compact':''),null,[
          N('thead',null,N('tr',null,cols.map(function(hd,j){
            return N('th'+(j===hi?'.hi':''),{bind:b+'columns.'+j,html:rich(hd)}); }))),
          N('tbody',null,arr(c.rows).map(function(r,i){
            return N('tr',null,arr(r).map(function(cell,j){
              return N('td'+(j===hi?'.hi':''),{bind:b+'rows.'+i+'.'+j,html:rich(String(cell==null?'':cell))}); })); })) ]),
        c.note?N('p.tbl-note',{key:b+'tnote',bind:b+'note',text:c.note}):null ]) ]; }
  };

  S.comparison = {
    label:'Comparison',
    fields:['left','right','badge'],
    defaults:{left:{tag:'Option A',title:'This way',items:['Point one','Point two']},
              right:{tag:'Option B',title:'That way',items:['Point one','Point two']},
              badge:'VS'},
    build:function(c,b){ b=b||'';
      function col(side,cls,base){ if(!side) return null;
        return N('div.cmp-col.'+cls,{key:b+base},[
          side.tag?N('div.tag',{bind:b+base+'.tag',html:rich(side.tag)}):null,
          N('h3',{bind:b+base+'.title',html:rich(side.title)}),
          N('ul',{key:b+base+'.items',arr:b+base+'.items'},arr(side.items).map(function(x,i){
            return N('li',{bind:b+base+'.items.'+i,html:rich(x)}); })) ]); }
      return [ N('div.cmp',{key:b+'cmp'},[ col(c.left,'sup','left'),
        N('div.vs-rail',{key:b+'vs'},N('div.vs-badge',{key:b+'badge',bind:b+'badge',text:c.badge||'VS'})),
        col(c.right,'uns','right') ]) ]; }
  };

  S.agenda = {
    label:'Numbered agenda',
    fields:['items'],
    defaults:{items:[{title:'First thing',desc:'One line about it'},
                     {title:'Second thing',desc:'One line about it'}]},
    build:function(c,b){ b=b||'';
      return [ N('div.agenda-grid.sg-stagger.sg-onenter',{key:b+'items',arr:b+'items'},
        arr(c.items).map(function(it,i){ var P=b+'items.'+i;
          return N('div.ag-item',{key:P},[
            N('div.ag-num',{key:P+'.num'},pad(i+1)),
            N('div.ag-body',{key:P+'.body'},[
              N('h3',{bind:P+'.title',html:rich(it.title)}),
              it.desc?N('p',{bind:P+'.desc',html:rich(it.desc)}):null ]) ]); })) ]; }
  };

  S.timeline = {
    label:'Timeline',
    fields:['items'],
    defaults:{items:[{year:'2024',title:'Then'},{year:'2026',title:'Now',now:true}]},
    build:function(c,b){ b=b||'';
      return [ N('div.timeline',{key:b+'timeline'},[
        N('div.tl-track'), N('div.tl-spark'),
        N('div.tl-items',{key:b+'items',arr:b+'items'},arr(c.items).map(function(it,i){ var P=b+'items.'+i;
          return N('div.tl-item',{key:P},[
            N('div.yr',{bind:P+'.year',text:it.year==null?'':it.year}),
            N('div.tl-dot'+(it.now?'.now':''),{key:P+'.dot'}),
            N('div.ev',{key:P+'.ev'},[
              N('b',{bind:P+'.title',html:rich(it.title)}),
              it.desc?N('span',{bind:P+'.desc',html:rich(it.desc)}):null ]) ]); })) ]) ]; }
  };

  /* ---------- prose — the editorial lead + rule-lined columns ---------- */
  S.prose = {
    label:'Prose columns',
    fields:['lead','columns'],
    defaults:{lead:'The one sentence this section is about.',
              columns:[{head:'First',body:'A short paragraph.'},
                       {head:'Second',body:'A short paragraph.'}]},
    build:function(c,b){ b=b||'';
      /* An EMPTY columns array used to still emit the .ed-cols grid, which
         carries a 30px top margin and a rule line — 30-odd pixels of nothing,
         enough to push a section past the bottom of a full slide. Caught by the
         rack test on a prose section used for a lead with no columns. */
      var cols=arr(c.columns);
      return [ N('div.editorial',{key:b+'editorial'},[
        N('div.ed-lead.sg-reveal-wipe.sg-onenter',{bind:b+'lead',html:rich(c.lead)}),
        cols.length?N('div.ed-cols.sg-stagger.sg-onenter',{key:b+'columns',arr:b+'columns'},
          cols.map(function(col,i){ var P=b+'columns.'+i;
            return N('div.ed-col',{key:P},[
              N('h3',{bind:P+'.head',html:rich(col.head)}),
              N('p',{bind:P+'.body',html:rich(col.body)}) ]); })):null ]) ]; }
  };

  /* ---------- media + bullets — the two halves of media-split, now separable.
       Both are CSS refugees: their rules are scoped `.media-split .ms-media` /
       `.media-split .ms-text`, so deck/engine.css dual-scopes them on
       `.sec-media` / `.sec-bullets` too. ---------- */
  S.media = {
    label:'Image',
    fields:['image','focal','fit'],
    defaults:{image:''},
    build:function(c,b){ b=b||'';
      var img=mediaImgWrap(c.image,{key:b+'image'},fitStyle(c));
      img.classList.add('ms-media');
      return [img]; }
  };

  S.bullets = {
    label:'Bullets',
    fields:['kicker','title','body','items'],
    defaults:{title:'What matters here', items:['First point','Second point','Third point']},
    build:function(c,b){ b=b||'';
      return [ N('div.ms-text',{key:b+'text'},[ kickerN(c.kicker,b), titleN(c.title,b),
        c.body?N('p.ms-body',{bind:b+'body',html:rich(c.body)}):null,
        arr(c.items).length?N('ul.ms-items',{key:b+'items',arr:b+'items'},arr(c.items).map(function(x,i){
          return N('li',{bind:b+'items.'+i,html:rich(x)}); })):null ]) ]; }
  };

  /* =====================================================================
     CLASSIC LAYOUTS, RE-EXPRESSED
     One implementation, two callers. Byte-identical at base='' — that is
     what tests/parity.mjs checks against the frozen v2 build.
     ===================================================================== */
  L['stat-grid']  = function(c){ return S.titleband.build(c,'').concat(S.stats.build(c,'')); };
  L.quote         = function(c){ return S.quote.build(c,''); };
  L.chart         = function(c){ return S.chart.build(c,''); };
  L.table         = function(c){ return S.titleband.build(c,'').concat(S.table.build(c,'')); };
  L.comparison    = function(c){ return S.titleband.build(c,'').concat(S.comparison.build(c,'')); };
  L.timeline      = function(c){ return S.titleband.build(c,'').concat(S.timeline.build(c,'')); };
  /* bignum + editorial open with a kicker but never a title, so they take
     kickerN directly rather than a titleband that would render a stray <h1>
     the moment someone typed a `title` into their content. */
  L.bignum        = function(c){ return [kickerN(c.kicker,'')].concat(S.bignum.build(c,'')); };
  L.editorial     = function(c){ return [kickerN(c.kicker,'')].concat(S.prose.build(c,'')); };
  /* the rail is slide chrome (absolutely positioned against the section), not
     part of the agenda section */
  L.agenda        = function(c){ return [N('div.rail',{key:'rail'})]
                                   .concat(S.titleband.build(c,''), S.agenda.build(c,'')); };
  /* media-split is the one classic that is ALREADY two sections — it just wraps
     them in a grid that decides which side the picture takes */
  L['media-split']= function(c){
    var side=c.side==='right'?'right':'left';
    var img=S.media.build(c,'')[0], text=S.bullets.build(c,'')[0];
    return [ N('div.media-split.side-'+side,{key:'split'}, side==='left'?[img,text]:[text,img]) ]; };

  /* =====================================================================
     THE `composed` LAYOUT
     Renders content.sections as flex children of the .slide column. A row is
     a horizontal band of weighted sections. `size` is a flex weight; absent
     means "take your natural height" (flex:0 1 auto, the CSS default).
     ===================================================================== */
  /* `size` writes flex-GROW only, never the shorthand. The flex-BASIS is the
     stylesheet's job, and it differs by axis: a row's children get basis 0 so
     the weights are literal width proportions, while a column's children keep
     basis auto so a weight distributes the LEFTOVER height and can never force
     a section shorter than its own content. Writing `flex:N` here would set
     basis 0 in both, which silently pushed content off the bottom of the slide
     whenever a weighted column section's content was taller than its share. */
  function sizeStyle(sz){ return (sz==null||sz==='')?null:('flex-grow:'+(+sz||0)); }

  function sectionNode(entry,key){
    if(!entry||typeof entry!=='object') return null;
    var def=S[entry.type];
    if(!def) return N('div.sec.sec-unknown',{key:key},
      N('p.subtitle',{text:'Unknown section type "'+String(entry.type||'')+'"'}));
    return N('div.sec.sec-'+entry.type,{key:key,style:sizeStyle(entry.size)},
      def.build(entry.content||{}, key+'.content.'));
  }
  SG.sectionNode=sectionNode;   /* exposed for the editor's insert/preview paths */

  L.composed = function(c){
    return arr(c.sections).map(function(entry,i){
      var key='sections.'+i;
      if(entry&&entry.type==='row')
        return N('div.sec-row',{key:key,style:sizeStyle(entry.size)},
          arr(entry.items).map(function(it,j){ return sectionNode(it,key+'.items.'+j); }));
      return sectionNode(entry,key); });
  };

  /* the vocabulary as data — the editor's gallery and the Python validator
     both need the list, and it should have exactly one source */
  SG.SECTION_TYPES = Object.keys(S);

  /* =====================================================================
     PROMOTION  —  classic slide -> composed slide, on explicit user action.

     TO_SECTIONS[layout](content) -> {sections, keymap}

     `sections` is the same decomposition the layout function itself uses, so
     a promoted slide renders identically to the classic it came from.

     `keymap` maps the layout's TOP-LEVEL authored keys to where they end up.
     The editor applies it longest-prefix-first, which is all that is needed:
     every section builder prefixes EVERY key it authors, so an override on
     `stats.2.label` follows `stats` -> `sections.1.content.stats` and lands on
     `sections.1.content.stats.2.label` with no per-key enumeration. Structural
     keys (`cmp`, `timeline`, `split`) are listed alongside content ones because
     a user can perfectly well have styled a container.

     Keys that map NOWHERE are left alone and the existing orphan-override GC
     drops them on the next commit. That happens on purpose in exactly one
     place: agenda's `rail` is slide chrome, not part of the agenda section, so
     converting an agenda slide loses a styled rail. One undo brings it back.

     Promotion NEVER happens on load — only when the user asks for it — so an
     untouched deck stays byte-identical forever.
     ===================================================================== */
  var TO_SECTIONS = SG.TO_SECTIONS = {};
  function band(c){ return {type:'titleband',content:{kicker:c.kicker,title:c.title}}; }
  var BAND_KEYS={kicker:'sections.0.content.kicker', title:'sections.0.content.title'};
  /* a headed layout: titleband at 0, the body at 1. `keys` are the body's own
     top-level authored keys. */
  function headed(type, keys, pick){
    return function(c){
      var km={}; Object.keys(BAND_KEYS).forEach(function(k){ km[k]=BAND_KEYS[k]; });
      keys.forEach(function(k){ km[k]='sections.1.content.'+k; });
      return {sections:[band(c),{type:type,size:1,content:pick(c)}], keymap:km}; }; }

  TO_SECTIONS['stat-grid'] = headed('stats', ['stats'],
    function(c){ return {stats:c.stats}; });
  TO_SECTIONS.table = headed('table', ['table','tnote','columns','rows','options','note'],
    function(c){ return {columns:c.columns,rows:c.rows,options:c.options,note:c.note}; });
  TO_SECTIONS.comparison = headed('comparison', ['cmp','vs','badge','left','right'],
    function(c){ return {left:c.left,right:c.right,badge:c.badge}; });
  TO_SECTIONS.timeline = headed('timeline', ['timeline','items'],
    function(c){ return {items:c.items}; });
  TO_SECTIONS.agenda = headed('agenda', ['items'],
    function(c){ return {items:c.items}; });
  /* bignum + editorial open with a kicker and no title, so their titleband
     carries only the kicker — but the mapping is the same shape */
  TO_SECTIONS.bignum = headed('bignum', ['num','subtitle','value','count','fmt'],
    function(c){ return {value:c.value,count:c.count,fmt:c.fmt,subtitle:c.subtitle}; });
  TO_SECTIONS.editorial = headed('prose', ['editorial','lead','columns'],
    function(c){ return {lead:c.lead,columns:c.columns}; });

  /* chart carries its own head, so it is ONE section and every key just gains
     the prefix — the simplest possible map */
  function whole(type, keys, pick){
    return function(c){
      var km={}; keys.forEach(function(k){ km[k]='sections.0.content.'+k; });
      return {sections:[{type:type,size:1,content:pick(c)}], keymap:km}; }; }
  TO_SECTIONS.chart = whole('chart', ['head','note','chart','kicker','title','type','data','options','svg','body'],
    function(c){ return {kicker:c.kicker,title:c.title,note:c.note,type:c.type,data:c.data,
                         options:c.options,svg:c.svg,body:c.body}; });
  TO_SECTIONS.quote = whole('quote', ['mark','quote','by','subtitle'],
    function(c){ return {quote:c.quote,by:c.by,subtitle:c.subtitle}; });

  /* media-split promotes to a ROW, which is the arrangement it already draws.
     `split` (the grid wrapper) has no counterpart and is dropped. */
  TO_SECTIONS['media-split'] = function(c){
    var right = c.side==='right';
    var media = {type:'media',size:1,content:{image:c.image,fit:c.fit,focal:c.focal}};
    var text  = {type:'bullets',size:1,content:{kicker:c.kicker,title:c.title,body:c.body,items:c.items}};
    var mi = right?1:0, ti = right?0:1;
    var km={};
    ['image','fit','focal'].forEach(function(k){ km[k]='sections.0.items.'+mi+'.content.'+k; });
    ['text','kicker','title','body','items'].forEach(function(k){ km[k]='sections.0.items.'+ti+'.content.'+k; });
    return {sections:[{type:'row',size:1,items:right?[text,media]:[media,text]}], keymap:km}; };

  /* "can this slide be converted?" — the editor asks before offering the verb */
  SG.canPromote = function(layout){ return !!TO_SECTIONS[layout]; };
})();
