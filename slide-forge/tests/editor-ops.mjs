import { boot, RICH_DECK } from './harness.mjs';
import fs from 'fs';
const NEW=fs.readFileSync(new URL('../editor-template.html',import.meta.url).pathname,'utf8');
let pass=0, fail=0;
function ok(cond,msg){ if(cond){pass++;} else {fail++; console.log('FAIL:',msg);} }

// ---------- boot with rich deck ----------
const dom=boot(NEW,RICH_DECK); await new Promise(r=>setTimeout(r,500));
const w=dom.window, d=w.document, SG=w.SG, F=w.Forge;
const secs=()=>d.querySelectorAll('#deck .slide');
ok(secs().length===26,'26 slides rendered');

// ---------- authored keys present ----------
ok(!!secs()[1].querySelector('[data-el="items.1"]'),'agenda item key items.1');
ok(!!secs()[1].querySelector('[data-bind="items.1.title"]'),'agenda bind items.1.title');
ok(secs()[1].querySelector('.agenda-grid').getAttribute('data-arr')==='items','agenda data-arr');
ok(!!secs()[5].querySelector('[data-el="nodes.2"]'),'pipeline node key survives connectors');
// raw slide gets positional keys
ok(!!secs()[25].querySelector('[data-el="b0"]'),'raw slide positional b0');

// ---------- item ops remap overrides ----------
w.location.hash='#3'; // stat-grid (slide idx 2)
SG.data.slides[2].overrides={'stats.1':{x:11,y:22},'stats.2.label':{color:'#ff0000'}};
SG.render(d.getElementById('deck'),SG.data);
const statSec=()=>secs()[2];
F.removeItem(2,statSec().querySelector('[data-el="stats.0"]'));
ok(SG.data.slides[2].content.stats.length===2,'stat item removed');
ok(!!SG.data.slides[2].overrides['stats.0']&&SG.data.slides[2].overrides['stats.0'].x===11,'override stats.1 remapped to stats.0');
ok(!!SG.data.slides[2].overrides['stats.1.label'],'deep override remapped stats.2.label -> stats.1.label');
F.undoOp();
ok(SG.data.slides[2].content.stats.length===3,'undo restores item');
ok(!!SG.data.slides[2].overrides['stats.1'],'undo restores override keys');

// duplicate copies overrides
F.dupItem(2,statSec().querySelector('[data-el="stats.1"]'));
ok(SG.data.slides[2].content.stats.length===4,'dup adds item');
ok(SG.data.slides[2].overrides['stats.2']&&SG.data.slides[2].overrides['stats.2'].x===11,'dup copied override to new slot');
ok(SG.data.slides[2].overrides['stats.3.label'],'later override shifted +1 (stats.2.label -> stats.3.label)');
F.undoOp();

// ---------- GC drops orphans ----------
SG.data.slides[2].overrides['stats.99']={x:5};
F.do('noop',()=>{});
ok(!SG.data.slides[2].overrides||!SG.data.slides[2].overrides['stats.99'],'GC dropped orphan override');
ok(SG.data.slides[2].overrides&&SG.data.slides[2].overrides['stats.1'],'GC kept live override');

// ---------- bind write-back (endEdit path, simulated via setPath) ----------
SG.setPath(SG.data.slides[1].content,'items.1.title','Edited');
SG.renderSlide(d.getElementById('deck'),1);
ok(secs()[1].querySelector('[data-bind="items.1.title"]').textContent==='Edited','setPath + renderSlide updates leaf');

// ---------- targeted re-render leaves other sections untouched ----------
const ref0=secs()[0], ref5=secs()[5];
SG.renderSlide(d.getElementById('deck'),1);
ok(secs()[0]===ref0&&secs()[5]===ref5,'renderSlide(1) does not rebuild other sections');
ok(secs().length===26,'slide count stable after targeted render');

// ---------- w/h override applies ----------
SG.data.slides[1].overrides={'items.0':{w:300}};
SG.renderSlide(d.getElementById('deck'),1);
ok(secs()[1].querySelector('[data-el="items.0"]').style.width==='300px','w override -> width style');

// ---------- undo coalescing ----------
const depth=F.undo.length;
F.pushUndoCoalesced('t1'); F.pushUndoCoalesced('t1'); F.pushUndoCoalesced('t1');
ok(F.undo.length===depth+1,'coalesced pushes = 1 snapshot');
F.pushUndoCoalesced('t2');
ok(F.undo.length===depth+2,'different tag pushes new snapshot');

// ---------- legacy v2 migration ----------
const legacy=JSON.parse(JSON.stringify(RICH_DECK));
legacy.meta={title:'Legacy'};   // no schemaVersion => v1/v2 path
legacy.slides[1].overrides={'b3.0':{x:42,rot:-2},'b1':{color:'#123456'},'b9.9':{x:1}}; // agenda: b0 rail, b1 kicker row, b2 title, b3 grid; b3.0 first item
const dom2=boot(NEW,legacy); await new Promise(r=>setTimeout(r,500));
const w2=dom2.window, S2=w2.SG;
const ov2=S2.data.slides[1].overrides;
ok(S2.data.meta.schemaVersion===3,'schema stamped v3');
ok(ov2&&ov2['items.0']&&ov2['items.0'].x===42,'legacy b3.0 -> items.0');
ok(ov2&&ov2['kicker']&&ov2['kicker'].color==='#123456','legacy b1 -> kicker');
ok(!ov2['b9.9'],'unmappable legacy key dropped');
ok(!Object.keys(ov2).some(k=>/^b\d/.test(k)),'no b-keys remain');
// migrated override actually applied to DOM
ok(dom2.window.document.querySelectorAll('#deck .slide')[1].querySelector('[data-el="items.0"]').style.transform.includes('42px'),'migrated override applied');

// ---------- deck JSON round-trip stays valid ----------
const rt=JSON.parse(JSON.stringify(SG.data));
ok(rt.slides.length===26&&rt.meta.schemaVersion===3,'data round-trips');

console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
