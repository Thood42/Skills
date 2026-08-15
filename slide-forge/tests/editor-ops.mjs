import { boot, RICH_DECK } from './harness.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
const NEW=fs.readFileSync(fileURLToPath(new URL('../editor-template.html',import.meta.url)),'utf8');
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

// =====================================================================
// MEDIA PLAN (2026-07-31) — asset registry v2, links, embeds.
// Reuses the RICH_DECK boot above (SG/F/w/d still in scope). Raster image
// import (F.assets.importFile) needs canvas+Image decoding jsdom doesn't
// provide without extra deps, so it's intentionally NOT exercised here —
// it was verified end-to-end in a real browser instead (see the media plan
// implementation commits). Everything below is pure data-layer logic.
// =====================================================================

// ---------- registry v2 shape normalization ----------
SG.assets.images={
  legacy:'data:image/png;base64,AAA',
  embedded:{store:'embedded',src:'data:image/png;base64,BBB',w:10,h:20,bytes:5,type:'image/png',alt:'e'},
  linked:{store:'linked',path:'assets/images/x.png',w:1,h:2,bytes:3,type:'image/png',alt:''},
};
SG.assets.svg={diagramA:'<svg><rect/></svg>'};
ok(SG.imageMeta('legacy').src==='data:image/png;base64,AAA','legacy plain-string shape normalizes');
ok(SG.imageMeta('embedded').src==='data:image/png;base64,BBB'&&SG.imageMeta('embedded').store==='embedded','embedded object shape normalizes');
ok(SG.imageMeta('linked').src==='assets/images/x.png'&&SG.imageMeta('linked').store==='linked','linked object shape normalizes to its path');
ok(SG.imageMeta('nope')===null,'missing asset -> null, not a throw');
ok(SG.svgMarkup('diagramA')==='<svg><rect/></svg>','svg bucket read back verbatim');

// ---------- F.assets.refs() finds every reference shape ----------
SG.data.slides.push(
  {layout:'image',content:{title:'I',image:'embedded'}},
  {layout:'diagram',content:{svg:'diagramA'}},
  {layout:'divider',content:{title:'D'},freeObjects:[
    {id:'m1',type:'image',asset:'linked',x:0,y:0},
    {id:'m2',type:'svg',asset:'diagramA',x:0,y:0},
    {id:'m3',type:'embed',url:'https://example.com/',x:0,y:0}]});
SG.render(d.getElementById('deck'),SG.data);
const refs=F.assets.refs();
ok(refs.images.embedded&&refs.images.linked,'refs() finds layout content image + free-object asset (image)');
ok(refs.svg.diagramA,'refs() finds diagram layout svg + free-object asset (svg)');
ok(!refs.images.legacy,'refs() does not false-positive on an asset nothing points to');

// ---------- GC drops unreferenced, keeps referenced ----------
const dropped=F.assets.gc();
ok(!SG.assets.images.legacy,'gc dropped the unreferenced legacy asset');
ok(SG.assets.images.embedded&&SG.assets.images.linked,'gc kept both referenced images');
ok(SG.assets.svg.diagramA,'gc kept the referenced diagram');
ok(dropped.indexOf('image:legacy')>=0,'gc reports what it dropped');

// ---------- rename remaps every reference ----------
const newName=F.assets.rename('embedded','hero-shot');
ok(newName==='hero-shot'&&!!SG.assets.images['hero-shot']&&!SG.assets.images.embedded,'rename moves the registry entry');
ok(SG.data.slides.some(s=>s.content&&s.content.image==='hero-shot'),'rename remapped the image layout content field');

// ---------- SVG sanitizer strips scripts/handlers, namespaces IDs ----------
const dirty='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
  +'<rect id="a" fill="url(#g)"/><script>alert(1)</script>'
  +'<circle onclick="alert(2)" r="1"/><defs><linearGradient id="g"/></defs></svg>';
const san=F.assets.sanitizeSVG(dirty,'t1');
ok(!/script/i.test(san.markup),'sanitizer strips <script>');
ok(!/onclick/i.test(san.markup),'sanitizer strips onclick=');
ok(/id="sf-t1-a"/.test(san.markup)&&/url\(#sf-t1-g\)/.test(san.markup),'sanitizer namespaces ids and rewrites url(#...) refs');
ok(san.w===10&&san.h===10,'sanitizer reads viewBox dims when width/height are absent');

// ---------- link + embed URL allow-lists ----------
ok(F.sanitizeHref('https://example.com').ok,'https href accepted');
ok(F.sanitizeHref('#3').ok,'#N href accepted');
ok(F.sanitizeHref('mailto:a@b.com').ok,'mailto href accepted');
ok(!F.sanitizeHref('javascript:alert(1)').ok,'javascript: href rejected');
ok(!F.sanitizeHref('data:text/html,x').ok,'data: href rejected');
ok(SG.embedUrlOk('https://example.com/'),'https embed url accepted');
ok(SG.embedUrlOk('http://example.com/'),'http embed url accepted');
ok(!SG.embedUrlOk('javascript:alert(1)'),'javascript: embed url rejected');
ok(!SG.embedUrlOk('mailto:a@b.com'),'mailto: embed url rejected (meaningless as an iframe src)');

// ---------- new layouts render with authored identity + unavailable fallback ----------
const gsec=[...secs()].find(s=>s.className.includes('lyt-image'));
ok(!!gsec&&!!gsec.querySelector('[data-el="image"] img'),'image layout renders a real <img> (not CSS background)');
const dsec=[...secs()].find(s=>s.className.includes('lyt-diagram'));
ok(!!dsec&&dsec.querySelector('.diagram-stage svg'),'diagram layout inlines the sanitized svg');
SG.data.slides.push({layout:'image',content:{title:'Missing',image:'does-not-exist'}});
SG.render(d.getElementById('deck'),SG.data);
const missSec=[...secs()].filter(s=>s.className.includes('lyt-image')).pop();
ok(!!missSec.querySelector('.sf-unavail'),'missing image asset falls back to the unavailable card at render time');

// ---------- embed free object: shield + poster present, url allow-list enforced at mount ----------
const embedNode=d.querySelector('[data-free="m3"]');
ok(!!embedNode.querySelector('.sf-embed-shield'),'embed free object mounts a shield');
ok(!!embedNode.querySelector('.sf-embed-poster'),'embed free object mounts an always-present poster card');
ok(!!embedNode.querySelector('iframe'),'embed free object mounts an iframe for an http(s) url');
const badId=F.addEmbed('javascript:alert(1)');
ok(badId===null,'F.addEmbed rejects a non-http(s) url outright');

// =====================================================================
// V4 EDITOR UX OVERHAUL — items panel, breadcrumb, contextual inspector,
// hide override, manage-items modal, zoom/focus, insert gallery.
// jsdom has no layout engine, so anything needing real measurement (focus
// centring, gallery preview scaling, drag deltas at zoom) is verified in a
// real browser instead — see references/editor.md, "v4".
// =====================================================================
w.document.body.classList.add('forge-edit');
w.location.hash='#3';                                   // stat-grid, slide idx 2
SG.data.slides[2]={layout:'stat-grid',content:{kicker:'Perf',title:'By the numbers',
  stats:[{count:94,unit:'%',label:'Accuracy'},{count:3.2,unit:'ms',label:'Latency'},{count:12,unit:'x',label:'Throughput'}]}};
SG.render(d.getElementById('deck'),SG.data);
const sSec=()=>d.querySelectorAll('#deck .slide')[2];

// ---------- items panel: what earns a row, and what it is called ----------
const rows=F.itemRows(sSec());
const keys=rows.map(r=>r.key);
ok(keys.join(',')==='kicker,title,stats,stats.0,stats.1,stats.2','items panel lists blocks, the list and its items — not the leaves inside an item');
ok(rows.find(r=>r.key==='stats.1').depth===1,'array items are indented one level');
ok(!keys.includes('kicker.text'),'a container and its single bound leaf collapse to one row');
F.buildInspect();
const names=[...d.querySelectorAll('#forge-inspbody .forge-item-nm')].map(n=>n.textContent);
ok(names[2]==='Stat cards','array container reads as plain language, not "stats"');
ok(names[4]==='Stat 2 — 3.2ms','item row names itself from CONTENT (not the mid-count-up DOM text)');
const subs=[...d.querySelectorAll('#forge-inspbody .forge-item-sub')].map(n=>n.textContent);
ok(subs[2]==='3 items'&&subs[4]==='Latency','container shows a count, item shows its descriptive field');
ok(!names.some(n=>/^[a-z]+\.\d/.test(n)),'no dotted key ever appears as a row label');

// ---------- eye toggle -> overrides[key].hide, undoably ----------
F.toggleHide(2,'stats.0',false);
ok(SG.data.slides[2].overrides['stats.0'].hide===1,'eye writes overrides[key].hide');
ok(sSec().querySelector('[data-el="stats.0"]').style.opacity==='0.12','hidden element is ghosted while editing (still findable)');
w.document.body.classList.remove('forge-edit');
SG.render(d.getElementById('deck'),SG.data);
ok(sSec().querySelector('[data-el="stats.0"]').style.display==='none','hidden element is really gone when not editing');
w.document.body.classList.add('forge-edit');
SG.render(d.getElementById('deck'),SG.data);
F.toggleHide(2,'stats.0',false);
ok(!SG.data.slides[2].overrides||!SG.data.slides[2].overrides['stats.0'],'un-hiding removes the now-empty override');

// ---------- breadcrumb path ----------
const lblNode=sSec().querySelector('[data-el="stats.1.label"]');
F.clearSel();
lblNode.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,altKey:true}));
d.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));
ok(F.sel&&F.sel.key==='stats.1.label','alt-click selects the deepest keyed element');
const crumbs=F.crumbPath(F.sel).map(c=>c.label);
ok(crumbs.join(' > ')==='Slide > Stat cards > Stat 2 > Label','breadcrumb walks the key path in plain language');
ok(F.crumbPath(F.sel)[0].key===null,'the "Slide" crumb clears the selection');

// ---------- contextual inspector ----------
F.buildInspect();
const ins=d.getElementById('forge-inspbody');
ok(ins.querySelector('.forge-ident-nm').textContent==='Label','inspector identifies the selection by name');
ok(ins.querySelector('.forge-ident-key').textContent==='stats.1.label','the dotted key is kept, demoted to a chip');
ok(ins.querySelectorAll('.forge-swatch').length===5,'five theme-token swatches');
ins.querySelectorAll('.forge-swatch')[1].click();
ok(SG.data.slides[2].overrides['stats.1.label'].color==='var(--cyan)','swatches write a TOKEN reference, never a hex literal');
F.buildInspect();
d.getElementById('forge-inspbody').querySelectorAll('.forge-fmtchip')[0].click();
ok(SG.data.slides[2].content.stats[1].label==='**Latency**','whole-element bold wraps the bound content field in markers');
F.buildInspect();
d.getElementById('forge-inspbody').querySelectorAll('.forge-fmtchip')[0].click();
ok(SG.data.slides[2].content.stats[1].label==='Latency','the same chip unwraps it again');
F.buildInspect();
d.getElementById('forge-inspbody').querySelectorAll('.forge-step .forge-chip')[1].click();
ok(SG.data.slides[2].overrides['stats.1.label'].fs>0,'text-size stepper writes overrides.fs in px');
SG.renderSlide(d.getElementById('deck'),2);
ok(/px$/.test(sSec().querySelector('[data-el="stats.1.label"]').style.fontSize),'fs override reaches the element as font-size');

// ---------- item verbs: selection follows the item, styling follows it too ----------
SG.data.slides[2].overrides={'stats.2':{color:'var(--mint)'}};
SG.render(d.getElementById('deck'),SG.data);
F.clearSel();
sSec().querySelector('[data-el="stats.2"]').dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,altKey:true}));
d.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));
F.buildInspect();
d.getElementById('forge-inspbody').querySelectorAll('.forge-verbs button')[0].click();   // move earlier
ok(SG.data.slides[2].content.stats.map(s=>s.count).join(',')==='94,12,3.2','↑ reorders the content array');
ok(SG.data.slides[2].overrides['stats.1'].color==='var(--mint)','styling follows the moved item');
ok(F.sel&&F.sel.key==='stats.1','selection follows the moved item');

// ---------- add / manage-items modal ----------
ok(F.addItemPath(2,'stats')===true,'addItemPath appends using the list shape');
ok(SG.data.slides[2].content.stats.length===4,'the item landed in content');
F.structModal(2);
const modal=d.getElementById('forge-struct');
ok(!!modal,'manage-items modal opens');
ok(/^Manage items/.test(modal.querySelector('h3').textContent),'modal is titled for humans, not "structure"');
ok([...modal.querySelectorAll('.forge-tabs button')].map(b=>b.textContent).join('|')==='Items|Advanced (JSON)','the JSON editor is demoted to a tab, not removed');
ok(modal.querySelectorAll('.forge-arr-cards .forge-card').length===4,'one card per item');
ok(/Stat cards · 4/.test(modal.querySelector('.forge-arr-h').textContent),'array header counts its items');
const numInput=modal.querySelector('.forge-arr-cards .forge-card input');
numInput.dispatchEvent(new w.Event('focus')); numInput.value='555'; numInput.dispatchEvent(new w.Event('input',{bubbles:true}));
ok(SG.data.slides[2].content.stats[0].count===555,'modal edits land in content immediately');
modal.querySelectorAll('.forge-tabs button')[1].click();
ok(JSON.parse(modal.querySelector('.forge-struct-json').value).layout==='stat-grid','Advanced tab still round-trips slide JSON');
modal.remove();

// ---------- insert gallery: CONTENT-BACKED objects (v5) ----------
const insId=F.insertElement('stat-grid','stats.0',null,'Stat card');
const fo=(SG.data.slides[2].freeObjects||[]).filter(f=>f.id===insId)[0];
ok(!!fo&&fo.type==='node','gallery insert lands as a content-backed freeObject {type:"node"}');
ok(fo.layout==='stat-grid'&&fo.pick==='stats.0','the object records the layout + branch it re-renders');
ok(!!fo.content&&Array.isArray(fo.content.stats),'it carries the layout content it was built from');
ok(fo.html===undefined,'no frozen markup is stored — it re-renders from data');
ok(fo.name==='Stat card','the inserted object carries its catalog name');
ok(fo.w>=80&&fo.w<=900&&fo.h===undefined,'width is seeded and clamped; height stays automatic so text reflows');
ok(!d.querySelector('.forge-ghost'),'the off-screen scratch section is always removed');
ok(d.querySelectorAll('#deck .slide').length===SG.data.slides.length,'scratch sections never leak into the slide list');
ok(F.insertElement('no-such-layout','x')===null,'a missing layout/key inserts nothing rather than throwing');

// the mounted subtree keeps its authored identity, namespaced by the object id
const insWrap=()=>statSec().querySelector('[data-free="'+insId+'"]');
ok(!!insWrap(),'the inserted object is mounted on the slide');
ok(!!insWrap().querySelector('[data-el="'+insId+'/stats.0"]'),'the mounted subtree keeps its authored data-el, namespaced');
ok(!!insWrap().querySelector('[data-bind="'+insId+'/stats.0.label"]'),'…and its data-bind, so text edits have somewhere to land');
ok(statSec().querySelector('[data-el="stats.0"]')!==insWrap().querySelector('[data-el="'+insId+'/stats.0"]'),
   'namespacing keeps the copy from colliding with the slide’s own key');
ok(!!insWrap().querySelector('.forge-part-shell'),'a boxless shell carries the source layout classes for descendant selectors');

// its content drives its render, and never touches the slide's own content
const slideLabel0=SG.data.slides[2].content.stats[0].label;
SG.setPath(fo.content,'stats.0.label','Copy only');
F.commit();
ok(insWrap().querySelector('[data-bind="'+insId+'/stats.0.label"]').textContent==='Copy only','the copy re-renders from its OWN content');
ok(SG.data.slides[2].content.stats[0].label===slideLabel0,'editing the copy leaves the original untouched');

// an item op only applies when the LIST is mounted. This copy picked ONE stat
// card, so its content still carries the whole stats[] while rendering a single
// item — growing it there would add an item nothing draws.
const fo2=()=>(SG.data.slides[2].freeObjects||[]).filter(f=>f.id===insId)[0];
const slideStats0=SG.data.slides[2].content.stats.length;
const copyStats0=fo2().content.stats.length;
ok(!insWrap().querySelector('[data-arr]'),'a single-item copy mounts no list container');
ok(F.dupItem(2,insWrap().querySelector('[data-el="'+insId+'/stats.0"]'))===false,'item duplicate declines when the list is not mounted');
ok(F.addItemPath(2,insId+'/stats')===false,'＋ Add declines for an unmounted list');
ok(fo2().content.stats.length===copyStats0,'…and the copy’s array is left alone');
// Ctrl+D on that card copies the whole OBJECT instead — what the user means
F.clearSel();
insWrap().dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
F.dupSel();
const cardCopy=(SG.data.slides[2].freeObjects||[]).slice(-1)[0];
ok(cardCopy.id!==insId&&cardCopy.type==='node'&&cardCopy.pick==='stats.0','duplicating a single-item copy yields another object, not a hidden array entry');
F.undoOp();

// ---------- duplicate: composites go content-backed, leaves stay free text ----------
F.clearSel();
const statsC=statSec().querySelector('[data-el="stats"]');
statsC.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
F.dupSel();
const dupId=(SG.data.slides[2].freeObjects||[]).slice(-1)[0].id;
const dupd=()=>(SG.data.slides[2].freeObjects||[]).filter(f=>f.id===dupId)[0];
ok(dupd().type==='node'&&dupd().layout==='stat-grid'&&dupd().pick==='stats','Ctrl+D on a composite yields a content-backed copy');
ok(!!dupd().content&&dupd().content.stats.length===slideStats0,'…carrying the content it re-renders from');
ok(dupd().html===undefined,'…with no frozen markup');

// ---------- list verbs inside a copy whose list IS mounted ----------
const dupWrap=()=>statSec().querySelector('[data-free="'+dupId+'"]');
ok(dupWrap().querySelector('[data-arr]').getAttribute('data-arr')===dupId+'/stats','the copy mounts its list container, namespaced');
dupd().overrides={'stats.0':{color:'var(--cyan)'}};
F.dupItem(2,dupWrap().querySelector('[data-el="'+dupId+'/stats.0"]'));
ok(dupd().content.stats.length===slideStats0+1,'duplicating an item inside a copy grows the COPY’s list');
ok(SG.data.slides[2].content.stats.length===slideStats0,'…and not the slide’s');
ok(dupd().overrides['stats.1']&&dupd().overrides['stats.1'].color==='var(--cyan)','item styling follows the duplicate, in the object’s own override bag');
F.addItemPath(2,dupId+'/stats');
ok(dupd().content.stats.length===slideStats0+2,'＋ Add routes to the copy’s array via its namespaced path');
F.removeItem(2,dupWrap().querySelector('[data-el="'+dupId+'/stats.0"]'));
ok(dupd().content.stats.length===slideStats0+1&&!!dupd().overrides['stats.0'],'removal remaps the copy’s override keys down');

// GC sweeps the object's own bag, not just the slide's
dupd().overrides['stats.99']={x:5};
dupd().overrides['stats.0.label']={};
F.do('noop',()=>{});
ok(!dupd().overrides['stats.99'],'GC drops an orphaned part override');
ok(!dupd().overrides['stats.0.label'],'GC drops an empty part-override stub');
ok(!!dupd().overrides['stats.0'],'GC keeps a live part override');

// text write-back inside a copy lands on the copy's content, via data-bind
const leaf=dupWrap().querySelector('[data-bind="'+dupId+'/stats.0.label"]');
const slideLabelBefore=SG.data.slides[2].content.stats[0].label;
leaf.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));
ok(F.editing===leaf,'double-click starts an edit on a part of a copy');
leaf.textContent='Edited in copy'; F.endEdit();
ok(dupd().content.stats[0].label==='Edited in copy','the edit writes to the copy’s own content path');
ok(SG.data.slides[2].content.stats[0].label===slideLabelBefore,'…and never to the slide’s');
ok(!(dupd().overrides['stats.0.label']||{}).html,'a bound leaf writes content, not an html shadow override');

F.clearSel();
while(SG.data.slides[2].freeObjects&&SG.data.slides[2].freeObjects.length) F.undoOp();
F.clearSel();
const titleEl=statSec().querySelector('[data-bind="title"]');
titleEl.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
F.dupSel();
const dupT=(SG.data.slides[2].freeObjects||[]).slice(-1)[0];
ok(dupT.type==='txt','a lone text leaf still copies as free text (it would lose descendant styling as a node)');
F.undoOp();

// ---------- a raw slide has no layout to re-render from: html fallback ----------
F.clearSel();
const rawBlk=secs()[25].querySelector('[data-el="b0"]');
if(rawBlk&&rawBlk.querySelector('[data-el]')){
  rawBlk.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
  F.dupSel();
  const dupR=(SG.data.slides[25].freeObjects||[]).slice(-1)[0];
  ok(dupR.type==='html','a raw slide’s markup still freezes into an html copy');
  F.undoOp(); }

// ---------- viewport hook stays inert outside edit mode ----------
ok(typeof SG.viewTransform==='function','the editor installs the viewport hook');
w.document.body.classList.remove('forge-edit');
ok(SG.viewTransform()===null,'present mode keeps the engine default fit (hook returns null)');
w.document.body.classList.add('forge-edit');
ok(typeof SG.viewTransform()==='string','edit mode returns a combined translate+scale');
F.setZoom(99); ok(F.zoom===3,'zoom clamps at 3x');
F.setZoom(0.01); ok(F.zoom===0.25,'zoom clamps at 0.25x');
F.zoomFit(); ok(F.zoom===1&&F.focus===false,'Fit resets zoom and turns Focus off');

// =====================================================================
// COMPOSED SLIDES (composer plan §C) — sections render with authored keys
// that are literal content paths, so the whole v3 identity layer applies at
// section depth with no new machinery.
// =====================================================================
const COMPOSED={meta:{title:'Composed',seed:7},slides:[
  {layout:'composed',content:{sections:[
    {type:'titleband',content:{kicker:'K',title:'Composed'}},
    {type:'row',items:[
      {type:'stats',size:2,content:{stats:[{value:'42',unit:'%',label:'L0'},{count:9,label:'L1'}]}},
      {type:'quote',content:{quote:'Qq',by:'By'}} ]} ]}},
  {layout:'stat-grid',content:{title:'Classic',stats:[{value:'1',label:'a'}]}} ]};
const domC=boot(NEW,COMPOSED); await new Promise(r=>setTimeout(r,400));
const wC=domC.window, dC=wC.document, SGC=wC.SG;
const cs=()=>dC.querySelectorAll('#deck .slide')[0];
ok(!!wC.SG.S&&!!wC.SG.S.titleband&&!!wC.SG.layouts.composed,'section registry + composed layout are exposed');
ok(cs().classList.contains('lyt-composed'),'composed slide gets its lyt- hook');
ok(cs().children.length>=2&&cs().querySelector('.sec-titleband')&&cs().querySelector('.sec-row'),'sections and the row mount as flex children');
// keys are content paths, one prefix deeper per nesting level
ok(!!cs().querySelector('[data-el="sections.0"]'),'section key sections.0');
ok(!!cs().querySelector('[data-bind="sections.0.content.title"]'),'title bind is a literal content path');
ok(!!cs().querySelector('[data-el="sections.1.items.0"]'),'row item key sections.1.items.0');
ok(!!cs().querySelector('[data-el="sections.1.items.0.content.stats.1"]'),'array item key at row depth');
ok(cs().querySelector('[data-arr="sections.1.items.0.content.stats"]')!==null,'data-arr survives the prefix');
// every bound leaf resolves through the same getPath the editor writes back with
const binds=[...cs().querySelectorAll('[data-bind]')].map(n=>n.getAttribute('data-bind'));
ok(binds.length>0&&binds.every(b=>SGC.getPath(SGC.data.slides[0].content,b)!==undefined),
   'every data-bind on a composed slide resolves via SG.getPath');
// overrides key off those same paths
SGC.data.slides[0].overrides={'sections.1.items.0.content.stats.0':{w:220}};
SGC.renderSlide(dC.getElementById('deck'),0);
ok(cs().querySelector('[data-el="sections.1.items.0.content.stats.0"]').style.width==='220px',
   'an override keyed at section depth styles the right node');
// size -> flex weight; absent size leaves the CSS default alone
ok(cs().querySelector('[data-el="sections.1.items.0"]').style.flexGrow==='2','size becomes a flex weight');
ok(!cs().querySelector('[data-el="sections.0"]').getAttribute('style'),'a section with no size carries no inline style');
// an unknown type degrades to a visible placeholder rather than a blank slide
SGC.data.slides[0].content.sections.push({type:'nope',content:{}});
SGC.renderSlide(dC.getElementById('deck'),0);
ok(!!cs().querySelector('.sec-unknown'),'an unknown section type renders a placeholder, not an exception');
// the classic caller is untouched (base='' — parity.mjs is the real guard)
ok(!!dC.querySelectorAll('#deck .slide')[1].querySelector('[data-el="stats.0"]'),
   'the same builder at base="" still authors flat classic keys');

// ---------- the full v1 vocabulary ----------
// Every type builds, mounts under its own .sec-<type> wrapper, and prefixes
// EVERY key it authors — a builder that forgets `base` on one leaf would leak a
// flat key that collides across sections, so this walks all of them.
const V1=['titleband','stats','bignum','chart','table','comparison','quote',
          'bullets','media','agenda','timeline','prose'];
ok(V1.every(t=>wC.SG.S[t]&&typeof wC.SG.S[t].build==='function'),'all 12 v1 section types are registered');
ok(V1.every(t=>wC.SG.SECTION_TYPES.indexOf(t)>=0)&&wC.SG.SECTION_TYPES.length===V1.length,
   'SG.SECTION_TYPES is exactly the v1 vocabulary (the editor + validator read it)');
{
  const secs=V1.map(t=>({type:t,content:JSON.parse(JSON.stringify(wC.SG.S[t].defaults||{}))}));
  SGC.data.slides[0]={layout:'composed',content:{sections:secs}};
  SGC.render(dC.getElementById('deck'),SGC.data);
  const bad=V1.filter(t=>!cs().querySelector('.sec-'+t));
  ok(bad.length===0,'every section type mounts its own wrapper (missing: '+bad+')');
  const flat=[...cs().querySelectorAll('[data-el],[data-bind],[data-arr]')]
    .flatMap(n=>['data-el','data-bind','data-arr'].map(a=>n.getAttribute(a)).filter(Boolean))
    .filter(k=>!/^sections\./.test(k));
  ok(flat.length===0,'no section leaks an unprefixed key (leaked: '+flat.slice(0,4)+')');
  ok(V1.every(t=>typeof wC.SG.S[t].label==='string'&&wC.SG.S[t].label),'every type carries a human label');
  // each type's own defaults must satisfy its own required fields — that is what
  // an editor insert will drop onto a slide, so a broken default ships broken
  const empty=V1.filter(t=>{const w=cs().querySelector('.sec-'+t);return w&&!w.textContent.trim()&&!w.querySelector('img,svg,.media-img');});
  ok(empty.length===0,'every type renders something from its own defaults (empty: '+empty+')');
}
// ---------- media/bullets keep media-split's output ----------
{
  SGC.data.slides[1]={layout:'media-split',content:{title:'MS',body:'b',items:['i0'],image:''}};
  SGC.render(dC.getElementById('deck'),SGC.data);
  const ms=dC.querySelectorAll('#deck .slide')[1];
  ok(!!ms.querySelector('.media-split.side-left .ms-media')&&!!ms.querySelector('.media-split .ms-text'),
     'media-split still wraps the media + bullets sections in its grid');
  ok(!!ms.querySelector('[data-el="image"]')&&!!ms.querySelector('[data-bind="items.0"]'),
     'media-split keys stay flat at base=""');
}

// ---------- a generated deck still carries no editor state ----------
const clean=JSON.parse(JSON.stringify(RICH_DECK));
const dom3=boot(NEW,clean); await new Promise(r=>setTimeout(r,400));
ok(!dom3.window.SG.data.slides.some(s=>s.overrides||s.freeObjects),'a generated deck carries no overrides/freeObjects until the user edits');

console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
