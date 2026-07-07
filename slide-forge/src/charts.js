/* =====================================================================
   SG.charts — data-driven chart renderer (v2, phase 3).
   Dependency-free, emits theme-token SVG: every fill/stroke is a CSS
   variable (--chart-1..6, --ink, --faint, --brd), so retheming and brand
   kits recolor every chart with zero re-rendering.

   Input = the `chart` layout's content:
     { type: "bar"|"bar-h"|"stacked"|"line"|"area"|"pie"|"donut"|"scatter",
       data: { labels:[...], series:[ {name, values:[...]} ] },
       options: { unit, showValues, yMax, legend } }

   Enter animation uses the existing slidegen machinery: the wrapper carries
   .sg-onenter (+ .sg-draw for line/area), so bars grow and lines draw when
   the slide becomes active, and print/static capture resolves to the final
   frame via SG.finalizeAnimations / the print stylesheet.
   ===================================================================== */
(function(){
  var W=window, SG=W.SG=W.SG||{};
  var C=SG.charts={};
  var VW=1000, VH=540;                       /* viewBox */
  var PAD={l:64,r:24,t:18,b:44};

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function col(i){ return 'var(--chart-'+((i%6)+1)+')'; }
  function fmt(n,unit){ var a=Math.abs(n),T=[[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']],s=String(Math.round(n*100)/100);
    for(var i=0;i<T.length;i++){ if(a>=T[i][0]){ s=(n/T[i][0]).toFixed(1).replace(/\.0$/,'')+T[i][1]; break; } }
    return s+(unit||''); }
  /* nice axis ceiling: 1/2/2.5/5 × 10^k */
  function niceMax(v){ if(v<=0) return 1; var p=Math.pow(10,Math.floor(Math.log10(v)));
    var m=v/p; var n=m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10; return n*p; }
  function seriesOf(c){ var d=c.data||{}; return (d.series||[]).map(function(s){
    return { name:s.name||'', values:(s.values||[]).map(function(v){ return +v||0; }) }; }); }
  function labelsOf(c){ return ((c.data||{}).labels||[]).map(String); }

  function text(x,y,s,cls,anchor,size,fill){
    return '<text x="'+x+'" y="'+y+'" text-anchor="'+(anchor||'middle')+'" font-family="var(--font-mono)"'
      +' font-size="'+(size||15)+'" fill="'+(fill||'var(--faint)')+'"'+(cls?' class="'+cls+'"':'')+'>'+esc(s)+'</text>'; }

  function legend(series){ if(series.length<2) return '';
    var out='', x=PAD.l, y=6;
    series.forEach(function(s,i){
      out+='<g transform="translate('+x+','+y+')"><rect width="14" height="14" rx="3" fill="'+col(i)+'"></rect>'
        +text(20,12,s.name,null,'start',14,'var(--muted)')+'</g>';
      x+=30+String(s.name).length*8.6; });
    return out; }

  /* horizontal gridlines + y tick labels; returns {g, y(v)} */
  function yAxis(max,unit,x0,x1,y0,y1){
    var g='', ticks=4;
    for(var i=0;i<=ticks;i++){ var v=max*i/ticks, y=y1-(y1-y0)*i/ticks;
      g+='<line x1="'+x0+'" y1="'+y+'" x2="'+x1+'" y2="'+y+'" stroke="var(--brd)" stroke-width="1"'+(i===0?'':' stroke-dasharray="4 5"')+'></line>';
      g+=text(x0-10,y+5,fmt(v,unit),null,'end',13); }
    return {g:g, y:function(v){ return y1-(v/max)*(y1-y0); }}; }

  function xLabels(labels,xc,y){
    var g=''; var step=Math.max(1,Math.ceil(labels.length/12));
    labels.forEach(function(l,i){ if(i%step) return; g+=text(xc(i),y,l,null,'middle',14,'var(--muted)'); });
    return g; }

  function valueLabel(x,y,v,unit){ return text(x,y,fmt(v,unit),'cval','middle',14,'var(--ink)'); }

  /* ---------------- bar (grouped, vertical) ---------------- */
  C.bar=function(c){ var labels=labelsOf(c), series=seriesOf(c), o=c.options||{};
    var max=niceMax(o.yMax||Math.max.apply(0,[1].concat(series.map(function(s){ return Math.max.apply(0,[0].concat(s.values)); }))));
    var x0=PAD.l, x1=VW-PAD.r, y0=PAD.t+18, y1=VH-PAD.b;
    var ax=yAxis(max,o.unit,x0,x1,y0,y1), g=ax.g, n=labels.length||1, k=series.length||1;
    var slot=(x1-x0)/n, gap=Math.min(18,slot*.16), bw=Math.max(4,(slot-gap*2)/k);
    labels.forEach(function(l,i){ series.forEach(function(s,j){
      var v=s.values[i]||0, h=(v/max)*(y1-y0), x=x0+i*slot+gap+j*bw, y=y1-h;
      g+='<rect class="cbar" x="'+x+'" y="'+y+'" width="'+Math.max(1,bw-3)+'" height="'+h+'" rx="5" fill="'+col(j)+'" style="animation-delay:'+(i*.05+j*.02)+'s"></rect>';
      if(o.showValues&&k<3) g+='<g class="cfade" style="animation-delay:'+(0.5+i*.05)+'s">'+valueLabel(x+(bw-3)/2,y-8,v,o.unit)+'</g>'; }); });
    g+=xLabels(labels,function(i){ return x0+i*slot+slot/2; },y1+28);
    return {g:g+legend(series), cls:'sg-onenter'}; };

  /* ---------------- bar-h (horizontal) ---------------- */
  C['bar-h']=function(c){ var labels=labelsOf(c), series=seriesOf(c), o=c.options||{};
    var max=niceMax(o.yMax||Math.max.apply(0,[1].concat(series.map(function(s){ return Math.max.apply(0,[0].concat(s.values)); }))));
    var lw=Math.min(230,Math.max.apply(0,labels.map(function(l){ return l.length; }))*9+20);
    var x0=PAD.l+lw-44, x1=VW-PAD.r-30, y0=PAD.t+18, y1=VH-PAD.b+18;
    var g='', n=labels.length||1, k=series.length||1;
    var slot=(y1-y0)/n, gap=Math.min(14,slot*.16), bh=Math.max(4,(slot-gap*2)/k);
    for(var t=0;t<=4;t++){ var vx=x0+(x1-x0)*t/4;
      g+='<line x1="'+vx+'" y1="'+y0+'" x2="'+vx+'" y2="'+y1+'" stroke="var(--brd)" stroke-width="1"'+(t===0?'':' stroke-dasharray="4 5"')+'></line>';
      g+=text(vx,y1+24,fmt(max*t/4,o.unit),null,'middle',13); }
    labels.forEach(function(l,i){ g+=text(x0-12,y0+i*slot+slot/2+5,l,null,'end',15,'var(--muted)');
      series.forEach(function(s,j){ var v=s.values[i]||0, w=(v/max)*(x1-x0), y=y0+i*slot+gap+j*bh;
        g+='<rect class="cbarh" x="'+x0+'" y="'+y+'" width="'+w+'" height="'+Math.max(1,bh-3)+'" rx="5" fill="'+col(j)+'" style="animation-delay:'+(i*.06)+'s"></rect>';
        if(o.showValues&&k<3) g+='<g class="cfade" style="animation-delay:'+(0.5+i*.06)+'s">'+text(x0+w+10,y+bh/2+3,fmt(v,o.unit),'cval','start',14,'var(--ink)')+'</g>'; }); });
    return {g:g+legend(series), cls:'sg-onenter'}; };

  /* ---------------- stacked (vertical) ---------------- */
  C.stacked=function(c){ var labels=labelsOf(c), series=seriesOf(c), o=c.options||{};
    var sums=labels.map(function(_,i){ return series.reduce(function(t,s){ return t+(s.values[i]||0); },0); });
    var max=niceMax(o.yMax||Math.max.apply(0,[1].concat(sums)));
    var x0=PAD.l, x1=VW-PAD.r, y0=PAD.t+18, y1=VH-PAD.b;
    var ax=yAxis(max,o.unit,x0,x1,y0,y1), g=ax.g, n=labels.length||1;
    var slot=(x1-x0)/n, bw=Math.min(84,slot*.55);
    labels.forEach(function(l,i){ var acc=0, x=x0+i*slot+(slot-bw)/2;
      series.forEach(function(s,j){ var v=s.values[i]||0, h=(v/max)*(y1-y0), y=y1-acc-h; acc+=h;
        g+='<rect class="cbar" x="'+x+'" y="'+y+'" width="'+bw+'" height="'+Math.max(0,h-2)+'" rx="4" fill="'+col(j)+'" style="animation-delay:'+(i*.05+j*.06)+'s"></rect>'; });
      if(o.showValues) g+='<g class="cfade" style="animation-delay:'+(0.6+i*.05)+'s">'+valueLabel(x+bw/2,y1-acc-8,sums[i],o.unit)+'</g>'; });
    g+=xLabels(labels,function(i){ return x0+i*slot+slot/2; },y1+28);
    return {g:g+legend(series), cls:'sg-onenter'}; };

  /* ---------------- line / area ---------------- */
  function lineish(c,fill){ var labels=labelsOf(c), series=seriesOf(c), o=c.options||{};
    var max=niceMax(o.yMax||Math.max.apply(0,[1].concat(series.map(function(s){ return Math.max.apply(0,[0].concat(s.values)); }))));
    var x0=PAD.l, x1=VW-PAD.r-10, y0=PAD.t+18, y1=VH-PAD.b;
    var ax=yAxis(max,o.unit,x0,x1,y0,y1), g=ax.g, n=Math.max(2,labels.length);
    function X(i){ return x0+(x1-x0)*i/(n-1); }
    series.forEach(function(s,j){ var pts=s.values.map(function(v,i){ return X(i)+','+ax.y(v); });
      if(fill){ var area='M'+X(0)+','+y1+' L'+pts.join(' L')+' L'+X(s.values.length-1)+','+y1+' Z';
        g+='<path class="cfade" d="'+area+'" fill="'+col(j)+'" opacity="0.16" style="animation-delay:.3s"></path>'; }
      g+='<path class="cline" d="M'+pts.join(' L')+'" fill="none" stroke="'+col(j)+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>';
      s.values.forEach(function(v,i){
        g+='<circle class="cfade" cx="'+X(i)+'" cy="'+ax.y(v)+'" r="5.5" fill="var(--bg-2)" stroke="'+col(j)+'" stroke-width="3" style="animation-delay:'+(0.9+i*.04)+'s"></circle>';
        if(o.showValues&&series.length<2) g+='<g class="cfade" style="animation-delay:'+(1+i*.04)+'s">'+valueLabel(X(i),ax.y(v)-14,v,o.unit)+'</g>'; }); });
    g+=xLabels(labels,X,y1+28);
    return {g:g+legend(series), cls:'sg-onenter sg-draw'}; }
  C.line=function(c){ return lineish(c,false); };
  C.area=function(c){ return lineish(c,true); };

  /* ---------------- pie / donut ---------------- */
  function pieish(c,inner){ var labels=labelsOf(c), s=seriesOf(c)[0]||{values:[]}, o=c.options||{};
    var vals=labels.map(function(_,i){ return s.values[i]||0; });
    var total=vals.reduce(function(t,v){ return t+v; },0)||1;
    var cx=VW*0.38, cy=VH/2, R=Math.min(VH/2-30,215), r=inner?R*0.62:0;
    var g='', a0=-Math.PI/2;
    function pt(a,rad){ return (cx+Math.cos(a)*rad).toFixed(1)+','+(cy+Math.sin(a)*rad).toFixed(1); }
    vals.forEach(function(v,i){ var frac=v/total, a1=a0+frac*2*Math.PI, big=frac>0.5?1:0;
      if(frac<=0){ a0=a1; return; }
      var d='M'+pt(a0,R)+' A'+R+','+R+' 0 '+big+' 1 '+pt(a1,R)
        +(r?' L'+pt(a1,r)+' A'+r+','+r+' 0 '+big+' 0 '+pt(a0,r)+' Z':' L'+cx+','+cy+' Z');
      g+='<path class="cfade" d="'+d+'" fill="'+col(i)+'" stroke="var(--bg-2)" stroke-width="3" style="animation-delay:'+(i*.09)+'s"></path>';
      a0=a1; });
    /* side legend with values */
    var ly=cy-labels.length*17+4;
    labels.forEach(function(l,i){ var y=ly+i*34;
      g+='<g class="cfade" style="animation-delay:'+(0.3+i*.06)+'s">'
        +'<rect x="'+(VW*0.66)+'" y="'+(y-13)+'" width="15" height="15" rx="4" fill="'+col(i)+'"></rect>'
        +text(VW*0.66+24,y,l+'  ·  '+fmt(vals[i],o.unit)+(o.showValues?' ('+Math.round(vals[i]/total*100)+'%)':''),null,'start',15,'var(--muted)')+'</g>'; });
    if(inner) g+=text(cx,cy+8,fmt(total,o.unit),'cval','middle',30,'var(--ink)');
    return {g:g, cls:'sg-onenter'}; }
  C.pie=function(c){ return pieish(c,false); };
  C.donut=function(c){ return pieish(c,true); };

  /* ---------------- scatter (values plotted at label positions) ---------------- */
  C.scatter=function(c){ var labels=labelsOf(c), series=seriesOf(c), o=c.options||{};
    var max=niceMax(o.yMax||Math.max.apply(0,[1].concat(series.map(function(s){ return Math.max.apply(0,[0].concat(s.values)); }))));
    var x0=PAD.l, x1=VW-PAD.r-10, y0=PAD.t+18, y1=VH-PAD.b;
    var ax=yAxis(max,o.unit,x0,x1,y0,y1), g=ax.g, n=Math.max(2,labels.length);
    function X(i){ return x0+(x1-x0)*i/(n-1); }
    series.forEach(function(s,j){ s.values.forEach(function(v,i){
      g+='<circle class="cpop" cx="'+X(i)+'" cy="'+ax.y(v)+'" r="9" fill="'+col(j)+'" opacity="0.85" style="animation-delay:'+(i*.05+j*.1)+'s"></circle>'; }); });
    g+=xLabels(labels,X,y1+28);
    return {g:g+legend(series), cls:'sg-onenter'}; };

  /* ---------------- entry point ---------------- */
  C.render=function(content){ content=content||{};
    var type=content.type||'bar', fn=C[type];
    if(!fn||!content.data) return '<div class="chart-err">chart: unknown type "'+esc(type)+'" or missing data</div>';
    var labels=labelsOf(content), bad=seriesOf(content).some(function(s){ return s.values.length!==labels.length; });
    if(bad) return '<div class="chart-err">chart: every series needs exactly '+labels.length+' values (one per label)</div>';
    var out=fn(content);
    return '<div class="chart-anim '+out.cls+'"><svg class="chart-svg" viewBox="0 0 '+VW+' '+VH+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+esc(content.title||type+' chart')+'">'+out.g+'</svg></div>'; };
})();
