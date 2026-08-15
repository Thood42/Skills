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

   Loads AFTER engine.js (consumes SG.N / SG.h / SG.layouts) and BEFORE
   editor.js.
   ===================================================================== */
(function(){
  var W=window, SG=W.SG=W.SG||{}, N=SG.N, L=SG.layouts, h=SG.h||{};
  var rich=h.rich, esc=h.esc, arr=h.arr, kickerN=h.kickerN, titleN=h.titleN;

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

  /* =====================================================================
     CLASSIC LAYOUTS, RE-EXPRESSED
     One implementation, two callers. Byte-identical at base='' — that is
     what tests/parity.mjs checks against the frozen v2 build.
     ===================================================================== */
  L['stat-grid'] = function(c){ return S.titleband.build(c,'').concat(S.stats.build(c,'')); };
  L.quote       = function(c){ return S.quote.build(c,''); };

  /* =====================================================================
     THE `composed` LAYOUT
     Renders content.sections as flex children of the .slide column. A row is
     a horizontal band of weighted sections. `size` is a flex weight; absent
     means "take your natural height" (flex:0 1 auto, the CSS default).
     ===================================================================== */
  function sizeStyle(sz){ return (sz==null||sz==='')?null:('flex:'+(+sz||0)); }

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
})();
