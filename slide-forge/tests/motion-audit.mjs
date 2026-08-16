// The Gate 1 success metric for the v3.6 motion overhaul (see
// docs/plans/slide-forge-motion/01-product.md "Success metric" and
// 03-program-design.md "Test plan"): inconsistentElements 31 -> 0.
// This slice (1) only proves the tracer: SG.motion.tag() gives every
// [data-arr] container role="list" and stamps its children with a single,
// unbounded, monotonic --i — the fix for the 6 layouts that never had
// entrance motion at all, and for the old nth-child(6) stagger ceiling.
// Later slices extend this file with the full role vocabulary, the
// inconsistentElements count itself, the defect-1 regression, and the
// reveal-style assertions.
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
  ok(sec.style.getPropertyValue('--m-span')==='9', '--m-span reflects the running total (9)');
}

// ---------- idempotent: re-tagging the same section doesn't double up ----------
{
  const sec=secs()[2]; // stat-grid, still in the first dom
  const before=sec.querySelector('[data-arr="stats"]').children[0].style.getPropertyValue('--i');
  SG.motion.tag(sec, SG.motion.resolve());
  const after=sec.querySelector('[data-arr="stats"]').children[0].style.getPropertyValue('--i');
  ok(before===after, 'SG.motion.tag is idempotent (re-run keeps the same --i)');
}

// ---------- per-element override still wins (no double animation) is a
// slice-2 concern (data-anim gating is already wired in the CSS; the JS
// side of "resolve reads overrides" lands with the cascade) ----------

console.log(pass+' passed, '+fail+' failed');
if(fail) process.exitCode=1;
