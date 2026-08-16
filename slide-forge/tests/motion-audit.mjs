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

// ---------- slice 3: schema v4, migration, "off" resolves everything ----------
// jsdom never matches `@media (prefers-reduced-motion: no-preference)` (its
// matchMedia mock returns false and its CSS engine agrees — confirmed while
// building this), so it can only prove the parts of defect 1's fix that
// AREN'T behind that query: [data-motion="off"]'s resolved state (a plain
// attribute selector) and the migration/schema-version data layer. The
// actual "ambient:none no longer strands content under real no-preference"
// regression was verified in a real browser instead — see 00-status.md.
{
  ok(SG.SCHEMA_VERSION===4, 'SCHEMA_VERSION is 4');
}
{
  // a pre-v4 doc with ambient:"none" (slide-level) picks up motion:"off"
  const legacy1={meta:{schemaVersion:3}, slides:[
    {layout:'stat-grid', ambient:'none', content:{title:'T',stats:[{value:'1',label:'a'}]}} ]};
  const migrated1=SG.migrate(JSON.parse(JSON.stringify(legacy1)));
  ok(migrated1.slides[0].motion==='off', 'v3->v4 migration: slide ambient:"none" also sets motion:"off"');
  ok(migrated1.slides[0].ambient==='none', 'migration preserves the ambient key itself (background stays off too)');
  ok(migrated1.meta.schemaVersion===4, 'migration stamps schemaVersion 4');

  // ...and for defaults.ambient:"none"
  const legacy2={meta:{schemaVersion:3}, defaults:{ambient:'none'}, slides:[
    {layout:'stat-grid', content:{title:'T',stats:[{value:'1',label:'a'}]}} ]};
  const migrated2=SG.migrate(JSON.parse(JSON.stringify(legacy2)));
  ok(migrated2.defaults.motion==='off', 'v3->v4 migration: defaults.ambient:"none" also sets defaults.motion:"off"');

  // a deck that never had ambient:"none" is untouched by the migration
  const legacy3={meta:{schemaVersion:3}, slides:[
    {layout:'stat-grid', content:{title:'T',stats:[{value:'1',label:'a'}]}} ]};
  const migrated3=SG.migrate(JSON.parse(JSON.stringify(legacy3)));
  ok(migrated3.slides[0].motion===undefined, 'migration leaves motion untouched when ambient was never "none"');

  // already-v4 decks are left alone (migration only runs once, for v<4)
  const already={meta:{schemaVersion:4}, slides:[
    {layout:'stat-grid', ambient:'none', content:{title:'T',stats:[{value:'1',label:'a'}]}} ]};
  const notRemigrated=SG.migrate(JSON.parse(JSON.stringify(already)));
  ok(notRemigrated.slides[0].motion===undefined,
    'a v4 doc with ambient:"none" is NOT auto-given motion:"off" — that pairing is now a deliberate choice, not an implied one');
}
{
  // motion:"off" — defect 1, inverted: every roled element resolves to
  // visible with zero animation, not stranded at its hidden base.
  const offDeck={meta:{title:'off',schemaVersion:4}, slides:[
    {layout:'stat-grid', motion:'off', content:{title:'T',stats:[
      {value:'1',label:'a'},{value:'2',label:'b'},{value:'3',label:'c'}]}} ]};
  const dom6=boot(NEW,offDeck); await new Promise(r=>setTimeout(r,400));
  const w6=dom6.window, d6=w6.document;
  const sec6=d6.querySelector('#deck .slide');
  ok(sec6.getAttribute('data-motion')==='off', 'motion:"off" stamped on the section');
  const title6=sec6.querySelector('h1.title');
  const items6=[].slice.call(sec6.querySelectorAll('[data-arr="stats"]>*'));
  const all6=[title6].concat(items6);
  ok(all6.every(function(el){ return w6.getComputedStyle(el).opacity==='1'; }),
    'motion:"off": every entrance element resolves to opacity 1 (nothing stranded)');
  ok(all6.every(function(el){ return w6.getComputedStyle(el).animationName==='none'; }),
    'motion:"off": zero animations, on any element the role system would otherwise touch');
}
{
  // the narrowed ambient selector no longer reaches [data-decor] with the
  // universal `*` — verify structurally: build with ambient:"none" (no
  // motion override) and confirm decor elements are individually targeted
  // (data-decor present) while an ordinary content element is not, which is
  // what makes ".amb, [data-decor]" the correct narrow instead of "*".
  const ambDeck={meta:{title:'amb',schemaVersion:4}, slides:[
    {layout:'agenda', ambient:'none', content:{title:'T',items:[{title:'i0'},{title:'i1'}]}} ]};
  const dom7=boot(NEW,ambDeck); await new Promise(r=>setTimeout(r,400));
  const d7=dom7.window.document;
  const sec7=d7.querySelector('#deck .slide');
  ok(sec7.getAttribute('data-ambient')==='none', 'ambient:"none" still stamps data-ambient (background layer opts out)');
  ok(sec7.getAttribute('data-motion')!=='off', 'ambient:"none" alone (schemaVersion 4, no migration) does NOT imply motion:"off" — orthogonal by design');
  const rail=sec7.querySelector('.rail');
  ok(!!rail && rail.hasAttribute('data-decor'), 'the decorative rail carries data-decor, the narrowed selector\'s actual target');
}

// ---------- slice 4: slide-level reveal (appear/wipe/spotlight) ----------
{
  const stepDeck={meta:{title:'steps',schemaVersion:4}, slides:[
    {layout:'agenda', reveal:{style:'appear'}, content:{title:'T',
      items:[{title:'a'},{title:'b'},{title:'c'}]}} ]};
  const dom8=boot(NEW,stepDeck); await new Promise(r=>setTimeout(r,400));
  const w8=dom8.window, d8=w8.document, S8=w8.SG;
  const sec8=d8.querySelector('#deck .slide');
  ok(sec8.getAttribute('data-reveal')==='appear', 'reveal.style stamped on the section');
  const items8=[].slice.call(sec8.querySelectorAll('[data-arr="items"]>*'));
  ok(items8.every(function(u,i){ return u.getAttribute('data-step')===String(i); }),
    'SG.motion.tag marks list children data-step in order');
  ok(items8.every(function(u){ return !u.classList.contains('shown'); }),
    'nothing is shown before the first step');

  // SG.stepNext() reveals one unit per call, in order, then falls through
  ok(S8.stepNext()===true, 'stepNext() reveals the first point');
  ok(items8[0].classList.contains('shown') && items8[0].classList.contains('live'), 'point 0 is shown + live');
  ok(!items8[1].classList.contains('shown'), 'point 1 still hidden');
  ok(S8.stepNext()===true, 'stepNext() reveals the second point');
  ok(items8[1].classList.contains('shown') && items8[1].classList.contains('live'), 'point 1 is shown + live');
  ok(!items8[0].classList.contains('live'), 'live moves off point 0 once point 1 is current');
  ok(items8[0].classList.contains('shown'), 'point 0 stays shown (withholding never re-hides)');
  ok(S8.stepNext()===true, 'stepNext() reveals the third (last) point');
  ok(S8.stepNext()===false, 'stepNext() returns false once exhausted, so navigation can proceed');
}
{
  // spotlight is focusing: nothing is ever hidden, only .live moves
  ok(SG.motion.isFocusing('spotlight')===true, 'isFocusing("spotlight") is true');
  ok(SG.motion.isFocusing('appear')===false && SG.motion.isFocusing('wipe')===false,
    'appear/wipe are withholding, not focusing');
  const spotDeck={meta:{title:'spot',schemaVersion:4}, slides:[
    {layout:'agenda', reveal:{style:'spotlight'}, content:{title:'T',
      items:[{title:'a'},{title:'b'}]}} ]};
  const dom9=boot(NEW,spotDeck); await new Promise(r=>setTimeout(r,400));
  const w9=dom9.window, d9=w9.document, S9=w9.SG;
  const sec9=d9.querySelector('#deck .slide');
  ok(sec9.getAttribute('data-reveal')==='spotlight', 'spotlight stamped on the section');
  S9.stepNext();
  const items9=[].slice.call(sec9.querySelectorAll('[data-arr="items"]>*'));
  ok(items9[1].getAttribute('data-step')!=null, 'point 1 still carries data-step under spotlight — CSS (not JS) is what makes it visible, opacity:.3 not display:none');
}
{
  // motion:"off" cascades to reveal too — resolve() computes both from the
  // same slide/defaults, so a slide can't end up "off" but still stepping
  // through hidden content.
  const offStepDeck={meta:{title:'offstep',schemaVersion:4}, slides:[
    {layout:'agenda', motion:'off', reveal:{style:'appear'}, content:{title:'T',
      items:[{title:'a'},{title:'b'}]}} ]};
  const dom10=boot(NEW,offStepDeck); await new Promise(r=>setTimeout(r,400));
  const w10=dom10.window, d10=w10.document;
  const sec10=d10.querySelector('#deck .slide');
  const items10=[].slice.call(sec10.querySelectorAll('[data-arr="items"]>*'));
  ok(items10.every(function(u){ return w10.getComputedStyle(u).opacity==='1'; }),
    'motion:"off" + reveal: every point resolves visible from the start (not stepped-and-hidden)');
}
{
  // un-stepping a slide (no reveal) leaves no stale data-step behind
  const noStepDeck={meta:{title:'nostep',schemaVersion:4}, slides:[
    {layout:'agenda', content:{title:'T', items:[{title:'a'},{title:'b'}]}} ]};
  const dom11=boot(NEW,noStepDeck); await new Promise(r=>setTimeout(r,400));
  const d11=dom11.window.document;
  const sec11=d11.querySelector('#deck .slide');
  ok(!sec11.hasAttribute('data-reveal'), 'no reveal configured -> no data-reveal stamped');
  ok(sec11.querySelectorAll('[data-step]').length===0, 'no reveal configured -> no data-step markers at all');
}

// ---------- slice 5: typewriter + word-by-word (SG.motion.split) ----------
{
  const twDeck={meta:{title:'tw',schemaVersion:4}, slides:[
    {layout:'agenda', reveal:{style:'typewriter'}, content:{title:'T',
      items:[{title:'Hi there'},{title:'Second'}]}} ]};
  const dom12=boot(NEW,twDeck); await new Promise(r=>setTimeout(r,400));
  const w12=dom12.window, d12=w12.document;
  const sec12=d12.querySelector('#deck .slide');
  const item0=sec12.querySelector('[data-arr="items"]>*');
  ok(item0.getAttribute('data-split')==='typewriter', 'activation splits typewriter step units (data-split stamped)');
  const chars=[].slice.call(item0.querySelectorAll('.ch'));
  ok(chars.length>0, 'typewriter split produced .ch character spans');
  // the unit is the WHOLE agenda item — split() walks every text node inside
  // it, so the padded index ("01") text ahead of the title is part of the
  // sequence too, in document order: "01" then "Hi there".
  ok(chars.map(function(c){return c.textContent;}).join('')==='01Hi there',
    'character spans reconstruct every text node in the unit, in document order, spaces included');
  const idx=chars.map(function(c){return +c.style.getPropertyValue('--i');});
  ok(idx.every(function(v,i){return v===i;}), 'character --i is 0..N-1, sequential across the whole unit');
  const words=[].slice.call(item0.querySelectorAll('.wd'));
  ok(words.length===3, 'word spans exist too ("01", "Hi", "there") — both span kinds are built regardless of style, so switching styles needs no re-split');

  // idempotent: re-splitting an already-split unit doesn't mangle it
  w12.SG.motion.split(item0, 'typewriter');
  const chars2=[].slice.call(item0.querySelectorAll('.ch'));
  ok(chars2.map(function(c){return c.textContent;}).join('')==='01Hi there',
    'calling split() again on an already-split unit is a no-op (data-split guard) — text stays intact');

  // never persisted: SG.data has no idea any of this happened
  ok(JSON.stringify(w12.SG.data.slides[0].content).indexOf('class="ch"')===-1 &&
     JSON.stringify(w12.SG.data.slides[0].content).indexOf('"Hi there"')!==-1,
    'the split lives only in the live DOM — SG.data still holds the plain original string');

  // a fresh render starts clean (proves "rebuilt from content each render, never persisted")
  const dom13=boot(NEW,twDeck); await new Promise(r=>setTimeout(r,400));
  const item0b=dom13.window.document.querySelector('#deck .slide [data-arr="items"]>*');
  ok(item0b.querySelectorAll('.ch').length===chars.length,
    'a completely fresh boot from the same JSON re-splits identically (deterministic, data-driven)');
}
{
  // words style: same span markup, different CSS target (.wd, not .ch)
  const wordsDeck={meta:{title:'words',schemaVersion:4}, slides:[
    {layout:'agenda', reveal:{style:'words'}, content:{title:'T',
      items:[{title:'One two three'}]}} ]};
  const dom14=boot(NEW,wordsDeck); await new Promise(r=>setTimeout(r,400));
  const item=dom14.window.document.querySelector('#deck .slide [data-arr="items"]>*');
  ok(item.getAttribute('data-split')==='words', 'activation splits word-by-word step units');
  const words=[].slice.call(item.querySelectorAll('.wd'));
  // the unit includes the item's own padded index ("01") ahead of the title
  ok(words.length===4, '4 word spans: "01" (the item index) + "One two three"');
  ok(words.map(function(w){return w.textContent;}).join(' ')==='01 One two three',
    'word spans reconstruct every text node in the unit, in document order');
}
{
  // present-mode-only guard: split() refuses while the editor is active.
  // Slide 0 auto-activates on boot (splitting it before this test can
  // intercept), so this uses slide 1's still-unactivated, never-split unit.
  const twDeck2={meta:{title:'tw2',schemaVersion:4}, slides:[
    {layout:'cover', content:{title:'cover'}},
    {layout:'agenda', reveal:{style:'typewriter'}, content:{title:'T', items:[{title:'x'}]}} ]};
  const dom15=boot(NEW,twDeck2); await new Promise(r=>setTimeout(r,400));
  const w15=dom15.window, d15=w15.document, S15=w15.SG;
  const item=[].slice.call(d15.querySelectorAll('#deck .slide'))[1].querySelector('[data-arr="items"]>*');
  ok(!item.hasAttribute('data-split'), 'slide 1 never activated, so its unit was never split yet (sanity check)');
  d15.body.classList.add('forge-edit');
  S15.motion.split(item, 'typewriter');
  ok(item.querySelectorAll('.ch').length===0, 'split() is a no-op while .forge-edit is on document.body');
  ok(!item.hasAttribute('data-split'), 'no data-split stamped either — refused, not silently skipped mid-way');
  d15.body.classList.remove('forge-edit');
  S15.motion.split(item, 'typewriter');
  ok(item.querySelectorAll('.ch').length>0, 'split() works normally again once .forge-edit is removed');
}
{
  // split() ignores styles that don't need it
  const appearDeck={meta:{title:'noop',schemaVersion:4}, slides:[
    {layout:'agenda', reveal:{style:'appear'}, content:{title:'T', items:[{title:'x'}]}} ]};
  const dom16=boot(NEW,appearDeck); await new Promise(r=>setTimeout(r,400));
  const item=dom16.window.document.querySelector('#deck .slide [data-arr="items"]>*');
  ok(!item.hasAttribute('data-split'), 'appear/wipe/spotlight never call split() — no .ch/.wd markup for styles that don\'t need it');
}

console.log(pass+' passed, '+fail+' failed');
if(fail) process.exitCode=1;
