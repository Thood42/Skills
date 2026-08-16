import { boot, RICH_DECK } from './harness.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';
const NEW=fs.readFileSync(fileURLToPath(new URL('../editor-template.html',import.meta.url)),'utf8');
const OLD=fs.readFileSync(fileURLToPath(new URL('./fixtures/v2-template.html',import.meta.url)),'utf8'); // v2 build saved earlier

function snap(dom){
  const d=dom.window.document;
  return [...d.querySelectorAll('#deck .slide')].map(sec=>norm(sec,dom.window));
}
// normalized structural tree: tag, sorted classes (minus editor classes), attrs (minus identity), text
function norm(n,w){
  if(n.nodeType===3) return n.textContent;
  if(n.nodeType!==1) return null;
  /* the Docs (D) panel postdates the frozen v2 fixture below — it's deck
     chrome (JSON docs toggle), not layout-specific content, so it's out of
     scope for this test's actual question (did the v3 rewrite keep every
     LAYOUT's rendering faithful to v2?). Without this, its presence in NEW
     only shifts every slide's later children (pager, progress, …) by one
     index and cascades into a wall of spurious diffs unrelated to layouts. */
  if(n.classList.contains('doc-panel')) return null;
  /* 'mrun' is the v3.6 motion run-flag (see the style/attrs comment below) */
  const cls=[...n.classList].filter(c=>!/^forge-/.test(c)&&c!=='mrun').sort();
  const attrs={};
  /* v3.6 motion pass: data-role/data-motion/data-reveal/data-decor are new
     structural attributes the v2 fixture never had, and --i/--m-span are new
     custom properties riding the (otherwise real) style attribute — none of
     it is a rendering-fidelity question, so it's out of scope for this test's
     actual question (did the v3 rewrite keep every LAYOUT faithful to v2?).
     tests/motion-audit.mjs asserts exactly what this stops seeing. */
  for(const a of n.attributes){
    if(/^(data-el|data-bind|data-arr|class|data-role|data-decor|data-motion|data-reveal)$/.test(a.name)) continue;
    let v=a.value;
    if(a.name==='style') v=v.replace(/--i:[^;]*;?/g,'').replace(/--m-span:[^;]*;?/g,'').trim();
    attrs[a.name]=v;
  }
  const kids=[...n.childNodes].map(c=>norm(c,w)).filter(x=>x!==null&&x!=='');
  return {t:n.tagName,c:cls,a:attrs,k:kids};
}
function diff(a,b,path,out){
  if(typeof a==='string'||typeof b==='string'){ if(a!==b) out.push(path+' text: '+JSON.stringify(a)+' vs '+JSON.stringify(b)); return; }
  if(!a||!b){ out.push(path+' missing: '+(a?'new-only':'old-only')+' '+JSON.stringify((a||b)&&(a||b).t)); return; }
  if(a.t!==b.t) out.push(path+' tag '+a.t+' vs '+b.t);
  if(a.c.join()!==b.c.join()) out.push(path+' class ['+a.c+'] vs ['+b.c+']');
  const keys=new Set([...Object.keys(a.a),...Object.keys(b.a)]);
  for(const k of keys) if((a.a[k]||'')!==(b.a[k]||'')) out.push(path+' @'+k+' '+JSON.stringify(a.a[k])+' vs '+JSON.stringify(b.a[k]));
  const n=Math.max(a.k.length,b.k.length);
  for(let i=0;i<n;i++) diff(a.k[i],b.k[i],path+'/'+(a.k[i]&&a.k[i].t||i),out);
}
const domOld=boot(OLD,RICH_DECK), domNew=boot(NEW,RICH_DECK);
await new Promise(r=>setTimeout(r,600));
const so=snap(domOld), sn=snap(domNew);
console.log('slides old/new:',so.length,sn.length);
let total=0;
sn.forEach((s,i)=>{ const out=[]; diff(so[i],s,'slide'+i,out);
  if(out.length){ total+=out.length; console.log('--- slide',i,RICH_DECK.slides[i].layout); out.slice(0,8).forEach(l=>console.log('  ',l)); }});
console.log(total===0?'PARITY: byte-structural match':'PARITY: '+total+' diffs (review above)');
