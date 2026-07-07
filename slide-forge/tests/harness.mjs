import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';

export function boot(html, deckJSON){
  if(deckJSON){ // swap the deck-data block
    html=html.replace(/<script type="application\/json" id="deck-data">[\s\S]*?<\/script>/,
      '<script type="application/json" id="deck-data">\n'+JSON.stringify(deckJSON)+'\n</script>');
  }
  const vc=new VirtualConsole();
  vc.on('jsdomError',e=>console.error('JSDOM-ERR:',e.message,(e.detail&&e.detail.stack||'').split('\n')[0]||''));
  vc.on('error',(...a)=>console.error('PAGE-ERR:',...a));
  const dom=new JSDOM(html,{url:'http://localhost/deck.html',runScripts:'dangerously',
    pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      w.matchMedia=w.matchMedia||(q=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
      w.HTMLElement.prototype.scrollIntoView=function(){};
    }});
  return dom;
}
export const RICH_DECK={
  meta:{title:'Test deck',seed:7},
  slides:[
    {layout:'cover',content:{kicker:'K',title:'Hello',accent:'World',subtitle:'Sub',meta:['one',{text:'two',strong:true}]}},
    {layout:'agenda',content:{kicker:'K',title:'Agenda',items:[{title:'A',desc:'da'},{title:'B',desc:'db'},{title:'C'}]}},
    {layout:'stat-grid',content:{title:'Stats',stats:[{count:10,unit:'%',label:'L0'},{value:'x',label:'L1'},{count:5,label:'L2'}]}},
    {layout:'timeline',content:{title:'TL',items:[{year:'2020',title:'t0',desc:'d0'},{year:'2021',title:'t1',now:true}]}},
    {layout:'comparison',content:{title:'Cmp',left:{tag:'L',title:'Lt',items:['l1','l2']},right:{title:'Rt',items:['r1']},badge:'VS'}},
    {layout:'pipeline',content:{title:'P',nodes:[{title:'n0',desc:'d0'},{title:'n1'},{title:'n2'}],loop:'looped'}},
    {layout:'divider',content:{index:'02',title:'Sect',subtitle:'s'}},
    {layout:'quote',content:{quote:'Qq',by:'By'}},
    {layout:'table',content:{title:'T',columns:['','A','B'],rows:[['r0','1','2'],['r1','3','4']],options:{highlightCol:2},note:'n'}},
    {layout:'chart',content:{title:'C',type:'bar',data:{labels:['a','b'],series:[{name:'s1',values:[1,2]}]},options:{}}},
    {layout:'leaderboard',content:{title:'LB',rows:[{name:'x',value:'9'},{name:'y',value:'4'}]}},
    {layout:'matrix',content:{title:'M',cells:[{title:'c0',desc:'d'},{title:'c1',desc:'d',hot:true}],xlabel:'X',ylabel:'Y'}},
    {layout:'metric-dash',content:{title:'MD',ring:{value:70,suffix:'%',label:'r'},tiles:[{value:'1',unit:'u',label:'t0'},{value:'2',label:'t1'}]}},
    {layout:'stack',content:{title:'S',bands:[{icon:'⚙',title:'b0',desc:'d'},{title:'b1'}]}},
    {layout:'editorial',content:{kicker:'k',lead:'Lead',columns:[{head:'h0',body:'b0'},{head:'h1',body:'b1'}]}},
    {layout:'hero-asym',content:{title:'HA',sub:'s',rows:[{k:'k0',v:'v0',unit:'u'},{k:'k1',v:'v1'}]}},
    {layout:'diptych',content:{left:{tag:'lt',title:'LT',body:'lb'},right:{title:'RT'}}},
    {layout:'quote-mosaic',content:{title:'QM',quotes:[{quote:'q0',by:'b0'},{quote:'q1',by:'b1'}]}},
    {layout:'index-mosaic',content:{title:'IM',items:[{title:'i0',desc:'d'},{title:'i1'}]}},
    {layout:'before-after',content:{title:'BA',before:{title:'B',items:['b1']},after:{title:'A',items:['a1','a2']}}},
    {layout:'manifesto',content:{statement:'We [[believe]] **bold**',lead:'lead'}},
    {layout:'bignum',content:{count:42,subtitle:'answers'}},
    {layout:'figure',content:{title:'F',caption:'cap',image:''}},
    {layout:'code',content:{title:'Code',filename:'f.js',code:'let x=1;',caption:'c'}},
    {layout:'closing',content:{title:'Bye',accent:'now',takeaways:[{title:'t0',desc:'d0'}],note:'note'}},
    {layout:'raw',content:{html:'<h1 class="title">Raw</h1><p class="subtitle">r</p>'}}
  ]};
