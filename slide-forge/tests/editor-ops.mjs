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
ok(S2.data.meta.schemaVersion===4,'schema stamped v4');
ok(ov2&&ov2['items.0']&&ov2['items.0'].x===42,'legacy b3.0 -> items.0');
ok(ov2&&ov2['kicker']&&ov2['kicker'].color==='#123456','legacy b1 -> kicker');
ok(!ov2['b9.9'],'unmappable legacy key dropped');
ok(!Object.keys(ov2).some(k=>/^b\d/.test(k)),'no b-keys remain');
// migrated override actually applied to DOM
ok(dom2.window.document.querySelectorAll('#deck .slide')[1].querySelector('[data-el="items.0"]').style.transform.includes('42px'),'migrated override applied');

// ---------- deck JSON round-trip stays valid ----------
const rt=JSON.parse(JSON.stringify(SG.data));
ok(rt.slides.length===26&&rt.meta.schemaVersion===4,'data round-trips');

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

// =====================================================================
// PROMOTION (composer plan §D) — classic slide -> composed, on user action.
// The user's styling has to survive the key rewrite, and ONE undo has to put
// the classic slide back exactly as it was.
// =====================================================================
{
  const PD={meta:{title:'Promote',seed:7},slides:[
    {layout:'stat-grid',content:{kicker:'K',title:'T',stats:[{value:'1',label:'a'},{value:'2',label:'b'},{value:'3',label:'c'}]},
     overrides:{'title':{color:'var(--mint)'},'stats.2':{w:250},'stats.2.label':{fs:22}}},
    {layout:'media-split',content:{title:'MS',side:'right',body:'b',items:['i0'],image:''}},
    {layout:'agenda',content:{title:'A',items:[{title:'one'}]},overrides:{'rail':{color:'#f00'}}},
    {layout:'cover',content:{title:'C'}} ]};
  const dP=boot(NEW,PD); await new Promise(r=>setTimeout(r,400));
  const wP=dP.window, dd=wP.document, SGP=wP.SG, FP=wP.Forge;
  const sl=n=>SGP.data.slides[n], sec=n=>dd.querySelectorAll('#deck .slide')[n];
  const before=JSON.stringify(sl(0));

  ok(FP.canPromote(0)&&FP.canPromote(1)&&FP.canPromote(2),'decomposable classics offer promotion');
  ok(!FP.canPromote(3),'a bespoke layout (cover) does not');

  ok(FP.promoteSlide(0),'promoteSlide reports success');
  ok(sl(0).layout==='composed','slide became composed');
  ok(sl(0).content.sections.length===2&&sl(0).content.sections[0].type==='titleband'
     &&sl(0).content.sections[1].type==='stats','stat-grid decomposed into titleband + stats');
  ok(SGP.getPath(sl(0).content,'sections.1.content.stats').length===3,'content carried over intact');
  const ov=sl(0).overrides||{};
  ok(!!ov['sections.0.content.title']&&ov['sections.0.content.title'].color==='var(--mint)','title override remapped');
  ok(!!ov['sections.1.content.stats.2']&&ov['sections.1.content.stats.2'].w===250,'item override remapped');
  ok(!!ov['sections.1.content.stats.2.label'],'DEEP item override remapped via the same prefix');
  ok(!Object.keys(ov).some(k=>!/^sections\./.test(k)),'no classic-shaped override key survives');
  // the styles are not just stored under new keys — they actually land on nodes
  ok(sec(0).querySelector('[data-el="sections.1.content.stats.2"]').style.width==='250px',
     'the remapped override styles the right node after promotion');
  // one undo, exactly
  FP.undoOp();
  ok(JSON.stringify(sl(0))===before,'ONE undo restores the classic slide byte-identically');

  // media-split promotes to a row, and side:right flips which item is which
  FP.promoteSlide(1);
  const r=sl(1).content.sections[0];
  ok(r.type==='row'&&r.items.length===2,'media-split promotes to a row of two sections');
  ok(r.items[0].type==='bullets'&&r.items[1].type==='media','side:"right" puts the text first');
  ok(r.items[1].content.image===''&&r.items[0].content.items[0]==='i0','both halves keep their own fields');

  // agenda's rail has no home in the composed slide; GC drops it (documented)
  FP.promoteSlide(2);
  ok(!(sl(2).overrides||{})['rail'],'agenda rail override is GCed, not silently re-keyed');
  ok(sl(2).content.sections[1].content.items.length===1,'agenda items still carried over');

  // promoting an already-composed slide must not wrap it in itself
  const depth=FP.undo.length, snap=JSON.stringify(sl(2));
  FP.promoteSlide(2);
  ok(JSON.stringify(sl(2))===snap&&FP.undo.length===depth,
     'promoting a composed slide is a no-op — no re-nesting, no undo entry');

  // promotion NEVER fires on load
  const fresh=boot(NEW,JSON.parse(JSON.stringify(PD)));
  await new Promise(r=>setTimeout(r,300));
  ok(fresh.window.SG.data.slides[0].layout==='stat-grid','loading a deck never promotes anything');

  // ---------- bind write-back at row depth (plan test 7) ----------
  // A leaf inside a row item must write to sections.N.items.M.content.… —
  // the deepest path the model produces, and the one most likely to be
  // mis-routed by a scopeOf/partOf shortcut.
  dd.body.classList.add('forge-edit');
  const leaf=sec(1).querySelector('[data-bind="sections.0.items.0.content.items.0"]');
  ok(!!leaf,'a bullets leaf inside a row item is bound to its full path');
  if(leaf){
    leaf.dispatchEvent(new wP.MouseEvent('dblclick',{bubbles:true}));
    ok(FP.editing===leaf,'double-click starts an edit at row depth');
    leaf.textContent='rewritten'; FP.endEdit();
    ok(SGP.getPath(sl(1).content,'sections.0.items.0.content.items.0')==='rewritten',
       'endEdit writes through to the row item’s own content');
    ok(!((sl(1).overrides||{})['sections.0.items.0.content.items.0']||{}).html,
       '…and leaves no html shadow override behind'); }
  dd.body.classList.remove('forge-edit');
}

// =====================================================================
// INTEGRATED INSERT + SECTION VERBS (composer plan capability 2).
// The founding complaint: a component added to a slide floats on top instead
// of joining it. These assert the joining, and that a section's styling
// travels with the section through every reorder.
// =====================================================================
{
  const ID={meta:{title:'Insert',seed:7},slides:[
    {layout:'composed',content:{sections:[
      {type:'titleband',content:{title:'T'}},
      {type:'quote',content:{quote:'Q'}} ]},
     overrides:{'sections.1.content.quote':{color:'#abc'}}},
    {layout:'stat-grid',content:{title:'S',stats:[{value:'1',label:'a'}]}},
    {layout:'cover',content:{title:'C'}},
    {layout:'divider',content:{title:'D'}} ]};
  const dI=boot(NEW,ID); await new Promise(r=>setTimeout(r,400));
  const wI=dI.window, di=wI.document, SGI=wI.SG, FI=wI.Forge;
  const sl=n=>SGI.data.slides[n], sec=n=>di.querySelectorAll('#deck .slide')[n];
  di.body.classList.add('forge-edit');

  // --- insert into a composed slide: it joins the flow ---
  ok(FI.insertIntoFlow(0,'stats'),'insertIntoFlow succeeds on a composed slide');
  ok(sl(0).content.sections.length===3&&sl(0).content.sections[2].type==='stats','section appended to the flow');
  ok(sl(0).content.sections[2].content.stats.length>0,'the new section arrives with real placeholder content');
  ok(!!sec(0).querySelector('[data-el="sections.2"] .stat-grid'),'…and renders inside the slide, not as a free object');
  ok(!(sl(0).freeObjects||[]).length,'nothing was added as a floating object');

  // inserting BEFORE an existing section shifts that section's overrides with it
  ok(FI.insertIntoFlow(0,'titleband',null,0),'insert at an explicit index');
  ok(sl(0).content.sections[0].type==='titleband'&&sl(0).content.sections.length===4,'spliced at 0');
  ok(!!(sl(0).overrides||{})['sections.2.content.quote'],'the quote override shifted 1 -> 2 with its section');
  ok(sec(0).querySelector('[data-el="sections.2.content.quote"]').style.color==='rgb(170, 187, 204)',
     '…and still paints the right node');

  // --- insert into a decomposable classic: promotes first, in ONE undo step ---
  const depth=FI.undo.length;
  ok(FI.insertIntoFlow(1,'quote'),'insertIntoFlow succeeds on a decomposable classic');
  ok(sl(1).layout==='composed','the slide was promoted');
  ok(sl(1).content.sections.some(s=>s.type==='quote'),'…and the new section is in it');
  ok(FI.undo.length===depth+1,'promote + insert is ONE undo step');
  FI.undoOp();
  ok(sl(1).layout==='stat-grid','…which one undo fully reverses');

  // --- a bespoke layout declines; the caller falls back to floating ---
  ok(FI.insertIntoFlow(2,'stats')===false,'a cover slide declines a section');
  ok(FI.insertIntoFlow(3,'stats')===false,'a divider slide declines a section');
  ok(FI.insertIntoFlow(0,'nope')===false,'an unknown section type is refused');
  ok(!FI.canPromote(2)&&!FI.canPromote(3),'…and neither offers promotion, so the fallback is honest');

  // --- move / remove / resize, with overrides following ---
  const before=sl(0).content.sections.map(s=>s.type);
  ok(FI.moveSection(0,2,0),'moveSection reports success');
  const after=sl(0).content.sections.map(s=>s.type);
  ok(after[0]===before[2]&&after[1]===before[0]&&after[2]===before[1],'the section actually moved');
  ok(!!(sl(0).overrides||{})['sections.0.content.quote'],'the moved section took its override with it (2 -> 0)');
  ok(sec(0).querySelector('[data-el="sections.0.content.quote"]').style.color==='rgb(170, 187, 204)',
     '…and the style still lands after the move');
  FI.undoOp();
  ok(sl(0).content.sections.map(s=>s.type).join()===before.join()&&!!(sl(0).overrides||{})['sections.2.content.quote'],
     'undo restores both the order and the keys');

  ok(FI.moveSection(0,0,-5)===false,'a no-op move is refused rather than silently reshuffling');
  ok(FI.moveSection(1,0,1)===false,'section verbs decline on a non-composed slide');

  const n0=sl(0).content.sections.length;
  ok(FI.removeSection(0,2),'removeSection reports success');
  ok(sl(0).content.sections.length===n0-1,'the section is gone');
  ok(!(sl(0).overrides||{})['sections.2.content.quote'],'its overrides went with it');
  FI.undoOp();
  ok(sl(0).content.sections.length===n0&&!!(sl(0).overrides||{})['sections.2.content.quote'],'undo restores both');

  ok(FI.resizeSection(0,1,3),'resizeSection reports success');
  ok(sl(0).content.sections[1].size===3,'size stored as a weight');
  ok(sec(0).querySelector('[data-el="sections.1"]').style.flexGrow==='3','…and reaches the DOM as flex-grow');
  FI.resizeSection(0,1,0);
  ok(!('size' in sl(0).content.sections[1]),'0 clears the weight rather than storing 0');

  // --- naming: sections read as what they are, not as "Section 3" ---
  const rows=FI.itemRows(sec(0)).filter(r=>/^sections\.\d+$/.test(r.key));
  ok(rows.length===sl(0).content.sections.length,'every section gets an Items-panel row');
  ok(rows.some(r=>r.node.classList.contains('sec-quote')),'…including the quote section');
  di.body.classList.remove('forge-edit');
}

// =====================================================================
// PERSONALITY (composer plan §E) — the type/space/shape/motif axis.
// The contract worth guarding: a deck WITHOUT one must carry no attribute at
// all, so the default rendering can't drift; and the attribute must survive a
// full re-render, since that is what a saved deck reopens through.
// =====================================================================
{
  const PL={meta:{title:'Personality',seed:7},slides:[
    {layout:'cover',content:{title:'C'}},{layout:'quote',content:{quote:'Q'}},
    {layout:'stat-grid',content:{title:'S',stats:[{value:'1',label:'a'}]}},
    {layout:'divider',content:{title:'D'}} ]};
  const dL=boot(NEW,PL); await new Promise(r=>setTimeout(r,400));
  const wL=dL.window, dl=wL.document, SGL=wL.SG, FL=wL.Forge;
  const root=()=>dl.documentElement;

  ok(!('personality' in SGL.data),'a deck without a personality has no such key');
  ok(!root().hasAttribute('data-personality'),'…and no attribute — the default path is untouched');

  ok(FL.setPersonality('blueprint'),'setPersonality accepts a known name');
  ok(SGL.data.personality==='blueprint','…and stores it on the deck');
  ok(root().getAttribute('data-personality')==='blueprint','…and reaches the root attribute');
  SGL.render(dl.getElementById('deck'),SGL.data);
  ok(root().getAttribute('data-personality')==='blueprint','the attribute survives a full re-render (the boot path)');

  ok(FL.setPersonality('editorial')&&root().getAttribute('data-personality')==='editorial','switching swaps the attribute');
  ok(FL.setPersonality('nope')===false&&root().getAttribute('data-personality')==='editorial',
     'an unknown personality is refused, leaving the current one alone');

  FL.setPersonality('');
  ok(!('personality' in SGL.data),'clearing removes the key rather than storing ""');
  ok(!root().hasAttribute('data-personality'),'…and removes the attribute');
  FL.undoOp();
  ok(SGL.data.personality==='editorial'&&root().getAttribute('data-personality')==='editorial','undo restores both');

  // personality is deck-level, never per-slide, and never touches slide content
  const snap=JSON.stringify(SGL.data.slides);
  FL.setPersonality('blueprint');
  ok(JSON.stringify(SGL.data.slides)===snap,'switching personality does not touch a single slide');
  ok(FL.personalities.length>=3&&FL.personalities.some(p=>p[1]==='editorial')&&FL.personalities.some(p=>p[1]==='blueprint'),
     'the picker offers the default plus both v1 personalities');
}

// =====================================================================
// SLIDE PRESETS (composer plan §F) — whole slide designs in the ⊞ gallery.
// The two things that can actually go wrong: a preset getting mutated by the
// slide inserted from it, and a `.forge-ghost` thumbnail surviving into #deck
// (which shifts every .slide index and breaks navigation — the known pitfall).
// =====================================================================
{
  const PS={meta:{title:'Presets',seed:7},slides:[
    {layout:'cover',content:{title:'C'}},{layout:'quote',content:{quote:'Q'}},
    {layout:'stat-grid',content:{title:'S',stats:[{value:'1',label:'a'}]}},
    {layout:'divider',content:{title:'D'}} ]};
  const dS=boot(NEW,PS); await new Promise(r=>setTimeout(r,400));
  const wS=dS.window, ds=dS.window.document, SGS=wS.SG, FS=wS.Forge;
  ds.body.classList.add('forge-edit');
  const slides=()=>SGS.data.slides;
  const ghosts=()=>ds.getElementById('deck').querySelectorAll('.forge-ghost').length;

  ok(Array.isArray(FS.presets)&&FS.presets.length>=8,'the built-in preset list is exposed and populated');
  ok(FS.presets.every(p=>p.name&&p.desc&&p.slide&&p.slide.layout),'every preset has a name, a description and a slide');
  ok(FS.presets.filter(p=>p.slide.layout==='composed').length>=6,
     'most presets are composed — the classics are already one click away elsewhere');
  // every preset must be a slide the validator would accept, i.e. it renders
  const bad=FS.presets.filter(p=>{ try{ return !SGS.layouts[p.slide.layout]; }catch(e){ return true; } });
  ok(bad.length===0,'every preset names a real layout ('+bad.map(p=>p.name)+')');

  const n0=slides().length, cur=0;
  wS.location.hash='#1';
  ok(FS.insertPreset(FS.presets[0]),'insertPreset reports success');
  ok(slides().length===n0+1,'a slide was added');
  ok(slides()[1].layout===FS.presets[0].slide.layout,'…right after the current one');
  // deep clone: editing the inserted slide must not reach back into the preset
  const presetJSON=JSON.stringify(FS.presets[0].slide);
  SGS.setPath(slides()[1].content,'sections.0.content.title','MUTATED');
  ok(JSON.stringify(FS.presets[0].slide)===presetJSON,'mutating the inserted slide never touches the preset');
  FS.undoOp();

  // masters round-trip, now that a master may hold a composed slide
  SGS.data.slides[1]={layout:'composed',content:{sections:[
    {type:'titleband',content:{title:'Mine'}},{type:'stats',content:{stats:[{value:'9',label:'x'}]}} ]},
    overrides:{'sections.1.content.stats.0':{w:200}}};
  SGS.render(ds.getElementById('deck'),SGS.data);
  wS.location.hash='#2';
  FS.saveMaster('My composed');
  ok(!!(SGS.data.masters||{})['My composed'],'a composed slide saves as a master');
  ok(SGS.data.masters['My composed'].base==='composed','…recording composed as its base layout');
  const before2=slides().length;
  FS.addSlide(null,'My composed');
  ok(slides().length===before2+1,'the master inserts as a new slide');
  const made=slides()[2];
  ok(made.layout==='composed'&&made.content.sections.length===2,'…and round-trips its sections');
  ok(!!(made.overrides||{})['sections.1.content.stats.0'],'…and its section-depth overrides');

  // the ghost pitfall: opening and closing the gallery must leave #deck clean
  const nSlides=ds.getElementById('deck').querySelectorAll('.slide').length;
  ok(ghosts()===0,'no ghosts before opening the gallery');
  FS.insertGallery();
  const gal=ds.getElementById('forge-gallery');
  ok(!!gal,'the gallery opened');
  const tabs=[...gal.querySelectorAll('.forge-gal-tab')].map(b=>b.textContent);
  ok(tabs.join('|')==='Elements|Slides|From this deck','three tabs, in order');
  [...gal.querySelectorAll('.forge-gal-tab')].forEach(b=>b.click());   // build every pane
  gal.remove();
  await new Promise(r=>setTimeout(r,50));
  ok(ghosts()===0,'closing the gallery leaves NO .forge-ghost inside #deck');
  ok(ds.getElementById('deck').querySelectorAll('.slide').length===nSlides,
     '…so the .slide indices are unchanged (the known ghost pitfall)');
  ds.body.classList.remove('forge-edit');
}

// =====================================================================
// MOTION + REVEAL (v3.6) — the deck -> slide cascade, mirroring how
// personality already works: slideIdx omitted sets data.defaults.*,
// slideIdx given overrides one slide, empty string clears back to inherit.
// =====================================================================
{
  const ML={meta:{title:'Motion',seed:7},slides:[
    {layout:'cover',content:{title:'C'}},
    {layout:'stat-grid',content:{title:'S',stats:[{value:'1',label:'a'}]}} ]};
  const dM=boot(NEW,ML); await new Promise(r=>setTimeout(r,400));
  const wM=dM.window, dm=wM.document, SGM=wM.SG, FM=wM.Forge;
  const secM=()=>dm.querySelectorAll('#deck .slide');

  ok(!(SGM.data.defaults&&SGM.data.defaults.motion),'a fresh deck has no defaults.motion');
  ok(secM()[0].getAttribute('data-motion')==='standard','…so it resolves to the built-in standard');

  ok(FM.setMotion('calm'),'setMotion accepts a known preset with no slideIdx (deck default)');
  ok(SGM.data.defaults.motion==='calm','…and stores it on data.defaults');
  ok(secM()[0].getAttribute('data-motion')==='calm'&&secM()[1].getAttribute('data-motion')==='calm',
    '…and both sections resolve to it — a deck default reaches every slide');

  ok(FM.setMotion('expressive',1),'setMotion accepts a slideIdx for a per-slide override');
  ok(SGM.data.slides[1].motion==='expressive','…and stores it on that slide only');
  ok(secM()[0].getAttribute('data-motion')==='calm'&&secM()[1].getAttribute('data-motion')==='expressive',
    'slide 0 stays on the deck default; slide 1 resolves its own override');

  ok(FM.setMotion('nope')===false,'an unknown preset is refused');
  ok(SGM.data.defaults.motion==='calm','…leaving the deck default unchanged');

  FM.setMotion('',1);
  ok(!('motion' in SGM.data.slides[1]),'clearing a slide override removes the key rather than storing ""');
  ok(secM()[1].getAttribute('data-motion')==='calm','…and it falls back to the deck default again');
  FM.undoOp();
  ok(SGM.data.slides[1].motion==='expressive','undo restores the per-slide override');

  // reveal follows the identical shape
  ok(!(SGM.data.defaults&&SGM.data.defaults.reveal),'no reveal configured by default');
  ok(FM.setReveal('spotlight'),'setReveal accepts a known style with no slideIdx');
  ok(SGM.data.defaults.reveal.style==='spotlight','…stored as {style} on data.defaults');
  ok(secM()[0].getAttribute('data-reveal')==='spotlight','…and reaches the section attribute');

  ok(FM.setReveal('typewriter',1),'setReveal accepts a per-slide override');
  ok(SGM.data.slides[1].reveal.style==='typewriter','…stored on that slide only');
  ok(secM()[1].getAttribute('data-reveal')==='typewriter'&&secM()[0].getAttribute('data-reveal')==='spotlight',
    'each slide resolves its own reveal independently');

  FM.setReveal('',1);
  ok(!('reveal' in SGM.data.slides[1]),'clearing removes the key');
  ok(secM()[1].getAttribute('data-reveal')==='spotlight','…falls back to the deck default');

  // one F.do() per call, matching F.setPersonality's contract
  const depthBefore=FM.undo.length;
  FM.setMotion('off');
  ok(FM.undo.length===depthBefore+1,'F.setMotion pushes exactly one undo snapshot');

  // a downloaded .html carries the settings with no editor chrome: the
  // resolved data-motion/data-reveal attributes are plain content, not
  // gated behind .forge-edit or any forge- prefixed class
  ok(!secM()[0].className.split(' ').some(c=>/^forge-/.test(c)),'the resolved section carries no forge- chrome classes');

  // round-trips through save/reload (export -> fresh boot from that JSON).
  // State at this point: defaults.motion='off' (just set), defaults.reveal
  // ={style:'spotlight'}; slide 1 still carries its own motion:'expressive'
  // (restored by the undo above) but its reveal override was cleared, so it
  // should resolve motion from ITS OWN override and reveal from the deck.
  const exported=JSON.parse(JSON.stringify(SGM.data));
  const dM2=boot(NEW,exported); await new Promise(r=>setTimeout(r,400));
  const secM2=dM2.window.document.querySelectorAll('#deck .slide');
  ok(secM2[0].getAttribute('data-motion')==='off'&&secM2[0].getAttribute('data-reveal')==='spotlight',
    'save/reload preserves the deck defaults (motion off, reveal spotlight) on a slide with no override');
  ok(secM2[1].getAttribute('data-motion')==='expressive'&&secM2[1].getAttribute('data-reveal')==='spotlight',
    'save/reload preserves slide 1\'s own motion override AND its fallback to the deck reveal default');
}

// ---------- post-ship regression: overrides[key].anim="kinetic" on a
// composite element (2026-08-16) ----------
// Found via user report: a metric-dash tile ("tiles.1") given a kinetic
// override rendered with no per-letter animation and, in the reporter's
// words, the block "went missing". Root cause: ensureKineticSpans() (editor.js)
// bails out for any node with real element children (it would destroy their
// structure by replacing innerHTML) — a metric-dash tile is a card with a
// value div + a label div, not a text leaf, so nothing ever gets wrapped.
// applyAnim() used to tag the element data-anim="kinetic"/.sg-onenter
// regardless, which ALSO excludes it from the deck's own default entrance
// (.mrun's :not([data-anim]) guard) — leaving a composite element with
// neither its own animation nor the deck's default one. Fixed: applyAnim now
// checks ensureKineticSpans()'s return value and falls back to no override
// (the element keeps the deck's ordinary entrance) when the target can't
// actually take kinetic markup. The correct target for "kinetic letters" is
// a text-leaf field (e.g. "tiles.1.label"), which still works exactly as
// before.
{
  const dashDeck={meta:{title:'kinetic-regress',schemaVersion:4}, slides:[
    {layout:'metric-dash', content:{title:'T', ring:{value:1,label:'r',suffix:''},
      tiles:[{value:'a',unit:'',label:'Alpha'},{value:'b',unit:'',label:'Beta'}]}} ]};
  const domK=boot(NEW,dashDeck); await new Promise(r=>setTimeout(r,400));
  const wK=domK.window, dK=wK.document, SGK=wK.SG;
  // SG.render REPLACES the .slide section on every call — re-query fresh
  // each time rather than reusing a node reference across renders.
  const secK=()=>dK.querySelector('#deck .slide');

  // kinetic on the whole tile (composite: value div + label div) — falls back
  SGK.data.slides[0].overrides={'tiles.0':{anim:'kinetic'}};
  SGK.render(dK.getElementById('deck'),SGK.data);
  const tile0=secK().querySelector('[data-el="tiles.0"]');
  ok(!tile0.hasAttribute('data-anim'), 'kinetic on a composite element (tile with real children) is not applied — falls back instead of tagging an inert override');
  ok(!tile0.classList.contains('sg-onenter'), 'the composite element keeps NO .sg-onenter from the failed kinetic attempt, so it is still eligible for the deck\'s own default entrance');

  // kinetic on the tile's label — a genuine text leaf — still works
  SGK.data.slides[0].overrides={'tiles.0.label':{anim:'kinetic'}};
  SGK.render(dK.getElementById('deck'),SGK.data);
  const label0=secK().querySelector('[data-el="tiles.0.label"]');
  ok(label0.getAttribute('data-anim')==='kinetic', 'kinetic on a text-leaf field is applied normally');
  ok(label0.querySelectorAll('span[style*="--i"]').length===5, 'the leaf\'s letters ("Alpha") are wrapped into per-letter spans');
}

// ---------- a generated deck still carries no editor state ----------
const clean=JSON.parse(JSON.stringify(RICH_DECK));
const dom3=boot(NEW,clean); await new Promise(r=>setTimeout(r,400));
ok(!dom3.window.SG.data.slides.some(s=>s.overrides||s.freeObjects),'a generated deck carries no overrides/freeObjects until the user edits');

console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
