// The Gate 1 success metric for the v3.6 motion overhaul (see
// docs/plans/slide-forge-motion/01-product.md "Success metric" and
// 03-program-design.md "Test plan"): inconsistentElements 31 -> 0.
// Slice 1 proved the tracer (list stagger only). Slice 2 adds the full role
// vocabulary (FIELD_ROLE/CLASS_ROLE), the deck->slide cascade, and the
// inconsistentElements metric itself, computed the same way the product doc
// defines it: silent titles + silent list containers, both now 0.
// What this file does NOT check (by design, not oversight): actual computed
// animation/CSS values. jsdom's media-query and CSSOM support is too limited
// to trust for that — see 00-status.md's slice progress notes for what was
// instead verified in a real browser (chrome never animates, the stagger cap
// compresses correctly at density, calm/standard/expressive read the right
// numbers, ambient:"none" no longer strands content). This file asserts the
// DATA layer: role assignment, precedence, the cascade, idempotency.
// Slice 3+ extend this file with the defect-1 regression and reveal styles.
import { boot, RICH_DECK } from './harness.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
const NEW=fs.readFileSync(fileURLToPath(new URL('../editor-template.html',import.meta.url)),'utf8');
let pass=0, fail=0;
function ok(cond,msg){ if(cond){pass++;} else {fail++; console.log('FAIL:',msg);} }

const dom=boot(NEW,RICH_DECK); await new Promise(r=>setTimeout(r,500));
const w=dom.window, d=w.document, SG=w.SG;
const secs=()=>d.querySelectorAll('#deck .slide');

// ---------- the 6 layouts that had ZERO entrance motion before v3.6 ----------
// (RICH_DECK indices: 2 stat-grid, 3 timeline, 4 comparison, 5 pipeline,
//  19 before-after; media-split isn't in RICH_DECK's 26 but is covered below
//  via a standalone deck, same as the other five for symmetry)
const NEVER_ANIMATED = [
  {i:2,  layout:'stat-grid',   list:'[data-arr="stats"]'},
  {i:3,  layout:'timeline',    list:'[data-arr="items"]'},
  {i:4,  layout:'comparison',  list:'[data-arr="left.items"]'},
  {i:5,  layout:'pipeline',    list:'[data-arr="nodes"]'},
  {i:19, layout:'before-after',list:'[data-arr="before.items"]'},
];
// only slide 0 starts .active in a fresh boot; force each candidate active via
// the hash so wire()'s MutationObserver flips .mrun for a real assertion
// (hashchange is async in jsdom, hence the awaited tick per candidate)
for(const t of NEVER_ANIMATED){
  w.location.hash='#'+(t.i+1);
  await new Promise(r=>setTimeout(r,30));
  const sec=secs()[t.i], list=sec.querySelector(t.list);
  ok(!!list, t.layout+' list container '+t.list+' found');
  ok(list.getAttribute('data-role')==='list', t.layout+' list container carries role="list"');
  ok(sec.classList.contains('mrun'), t.layout+' section gains .mrun when activated');
  const kids=[].slice.call(list.children);
  ok(kids.length>0, t.layout+' list has children to stagger');
  const idx=kids.map(function(k){ return k.style.getPropertyValue('--i'); });
  ok(idx.every(function(v){ return v!==''; }), t.layout+' every child got --i');
}

// media-split's bullets list, via a standalone deck (not in RICH_DECK)
{
  const msDeck={meta:{title:'ms'},slides:[{layout:'media-split',
    content:{title:'T',items:['a','b','c'],image:''}}]};
  const dom2=boot(NEW,msDeck); await new Promise(r=>setTimeout(r,400));
  const d2=dom2.window.document, sec=d2.querySelector('#deck .slide');
  const list=sec.querySelector('[data-arr="items"]');
  ok(!!list && list.getAttribute('data-role')==='list', 'media-split bullets list carries role="list"');
  ok(sec.classList.contains('mrun'), 'media-split section (slide 0, active by default) gains .mrun');
}

// ---------- unbounded stagger: the old CSS nth-child ceiling was 6 ----------
{
  const items=[]; for(let n=0;n<9;n++) items.push({title:'i'+n,desc:'d'+n});
  const nineDeck={meta:{title:'nine'},slides:[{layout:'agenda',content:{title:'Nine',items}}]};
  const dom3=boot(NEW,nineDeck); await new Promise(r=>setTimeout(r,400));
  const d3=dom3.window.document, sec=d3.querySelector('#deck .slide');
  const list=sec.querySelector('[data-arr="items"]');
  const kids=[].slice.call(list.children);
  ok(kids.length===9, '9-item agenda renders 9 items');
  const idx=kids.map(function(k){ return +k.style.getPropertyValue('--i'); });
  const uniq=new Set(idx);
  ok(uniq.size===9, '9 distinct --i values (old bug: 1,7,8,9 collided at 0)');
  let monotonic=true; for(let k=1;k<idx.length;k++) if(!(idx[k]>idx[k-1])) monotonic=false;
  ok(monotonic, '--i is strictly increasing in document order');
  // the counter is section-wide (title/kicker consume a slot too, by design —
  // "list children continue the parent's sequence"), so --m-span only needs
  // to be at least the item count, not exactly 9.
  ok(+sec.style.getPropertyValue('--m-span')>=9, '--m-span covers at least the 9 items');
}

// ---------- idempotent: re-tagging the same section doesn't double up ----------
{
  const sec=secs()[2]; // stat-grid, still in the first dom
  const before=sec.querySelector('[data-arr="stats"]').children[0].style.getPropertyValue('--i');
  SG.motion.tag(sec, SG.motion.resolve());
  const after=sec.querySelector('[data-arr="stats"]').children[0].style.getPropertyValue('--i');
  ok(before===after, 'SG.motion.tag is idempotent (re-run keeps the same --i)');
}

// ---------- every title carries role="title" (23 of 23 across all 31
// generation-time layouts per the product doc; RICH_DECK's 26 cover 19 of
// them — the rest are image/gallery/diagram/media-split/composed, not in
// this fixture — but the guarantee must hold for every one found here,
// including the two (cover, closing) whose title mixes bound and unbound
// content and so has no data-bind for FIELD_ROLE to key off) ----------
{
  const titles=[].slice.call(d.querySelectorAll('#deck .slide h1.title'));
  ok(titles.length===19, 'RICH_DECK renders the expected 19 h1.title elements ('+titles.length+')');
  ok(titles.every(function(t){ return t.getAttribute('data-role')==='title'; }),
    'every h1.title carries role="title", regardless of layout');
}

// ---------- chrome is never a stagger participant ----------
{
  const CHROME_SEL='.rail,.quote-mark,.pager,.progress,.divline,.vs-rail,.tl-track,.tl-spark,.dotrow,.code-sweep';
  const chromeEls=[].slice.call(d.querySelectorAll('#deck .slide '+CHROME_SEL));
  ok(chromeEls.length>0, 'the demo deck contains chrome elements to check');
  ok(chromeEls.every(function(el){ return el.getAttribute('data-role')==='chrome'; }),
    'every matched chrome element carries role="chrome"');
  ok(chromeEls.every(function(el){ return !(el.getAttribute('style')||'').includes('--i'); }),
    'chrome elements never receive --i (they never animate, so it would be dead weight)');
}

// ---------- group role: comparison's .cmp and before-after's .bna wrap two
// panels, not a list — authored role:'group' at build time — while their
// INNER <ul> lists still stagger normally (nesting works) ----------
{
  const cmp=secs()[4].querySelector('.cmp'); // RICH_DECK[4] = comparison
  ok(!!cmp && cmp.getAttribute('data-role')==='group', '.cmp carries authored role="group"');
  const cmpList=cmp.querySelector('[data-arr="left.items"]');
  ok(!!cmpList && cmpList.getAttribute('data-role')==='list', 'a list nested inside a group still becomes role="list"');
  const bna=secs()[19].querySelector('.bna'); // RICH_DECK[19] = before-after
  ok(!!bna && bna.getAttribute('data-role')==='group', '.bna carries authored role="group"');
}

// ---------- no layout is silent (raw excepted, by name) ----------
{
  let silent=[];
  RICH_DECK.slides.forEach(function(s,i){
    if(s.layout==='raw') return;
    if(!secs()[i].querySelector('[data-role]')) silent.push(s.layout);
  });
  ok(silent.length===0, 'no non-raw layout is silent (found: '+silent.join(',')+')');
}

// ---------- the inconsistentElements metric itself: silent titles + silent
// list containers, exactly how 01-product.md defines it. Both terms are
// structurally guaranteed 0 by roleOf()'s unconditional data-arr/FIELD_ROLE
// checks, but this asserts the OUTCOME, not the mechanism. ----------
{
  const allTitles=[].slice.call(d.querySelectorAll('#deck .slide h1.title'));
  const silentTitles=allTitles.filter(function(t){ return t.getAttribute('data-role')!=='title'; }).length;
  const allLists=[].slice.call(d.querySelectorAll('#deck .slide [data-arr]'));
  const silentLists=allLists.filter(function(l){ return l.getAttribute('data-role')!=='list'; }).length;
  ok(silentTitles+silentLists===0, 'inconsistentElements === 0 (silent titles '+silentTitles+' + silent lists '+silentLists+')');
}

// ---------- the layouts RICH_DECK doesn't cover: image, gallery, diagram,
// media-split (already checked above), embed. Confirms the metric holds
// across the full generation-time menu, not just RICH_DECK's 26. ----------
{
  const extraDeck={meta:{title:'extra'}, slides:[
    {layout:'image',   content:{title:'Img',caption:'c',image:''}},
    {layout:'gallery',  content:{title:'Gal',items:[{caption:'a'},{caption:'b'},{caption:'c'}]}},
    {layout:'diagram',  content:{title:'Dia',svg:'missing',caption:'c'}},
    {layout:'embed',    content:{title:'Emb',url:'https://example.invalid/'}},
  ]};
  const dom5=boot(NEW,extraDeck); await new Promise(r=>setTimeout(r,400));
  const d5=dom5.window.document, s5=d5.querySelectorAll('#deck .slide');
  ['image','gallery','diagram','embed'].forEach(function(layout,i){
    const t=s5[i].querySelector('h1.title');
    ok(!!t && t.getAttribute('data-role')==='title', layout+' title carries role="title"');
  });
  const galList=s5[1].querySelector('[data-arr="items"]');
  ok(!!galList && galList.getAttribute('data-role')==='list', 'gallery tiles container carries role="list"');
  const imgEl=s5[0].querySelector('img');
  ok(!!imgEl && imgEl.getAttribute('data-role')==='figure', 'image layout\'s <img> carries role="figure"');
}

// ---------- the deck -> slide cascade ----------
{
  ok(SG.motion.resolve({}, {}).motion==='standard', 'no defaults, no slide override -> standard');
  ok(SG.motion.resolve({}, {defaults:{motion:'calm'}}).motion==='calm', 'defaults.motion cascades to the slide');
  ok(SG.motion.resolve({motion:'expressive'}, {defaults:{motion:'calm'}}).motion==='expressive',
    'slide.motion overrides defaults.motion');
}

// ---------- resolve() actually drives rendering: data-motion on <section> ----------
{
  const calmDeck={meta:{title:'calm'}, defaults:{motion:'calm'}, slides:[
    {layout:'cover',content:{title:'A'}},
    {layout:'cover',content:{title:'B'},motion:'expressive'} ]};
  const dom4=boot(NEW,calmDeck); await new Promise(r=>setTimeout(r,400));
  const d4=dom4.window.document, s4=d4.querySelectorAll('#deck .slide');
  ok(s4[0].getAttribute('data-motion')==='calm', 'deck default motion stamped on the section');
  ok(s4[1].getAttribute('data-motion')==='expressive', 'per-slide motion override stamped on the section');
}

console.log(pass+' passed, '+fail+' failed');
if(fail) process.exitCode=1;
