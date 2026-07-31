/* =====================================================================
   MEDIA — asset store v2: browser-side import, SVG sanitizer, dedupe,
   reference-scan GC, size accounting. (media plan §2). Additive: a deck
   with no imported assets behaves exactly as before — SG.imageMeta/
   imageURL (engine.js) already fall back to the legacy plain-string shape.

   Registry lives in SG.assets, NOT SG.data (media plan §2.3): imports are
   append-mostly and deliberately OUTSIDE undo/autosave snapshotting (undo
   stringifies the whole deck per gesture — doing that with megabytes of
   base64 would make every keystroke O(deck size)). Only asset DELETION goes
   through a small side undo stack (F.assets._trash). Orphaned entries cost
   nothing until Save, when gc() removes them — logged, never silent.

   Storage rule (media plan §7.3): generation-time assets (assets.py) are
   ALWAYS store:"embedded", no size ceiling. Editor imports embed by default,
   downscaled; the library panel (editor.js) offers "link instead of embed"
   for a relative-path alternative when a deck+folder pair is preferred over
   one large file.
   ===================================================================== */
(function(){
  var W=window, D=document, SG=W.SG=W.SG||{};
  var F=W.Forge=W.Forge||{};
  F.assets=F.assets||{};

  var MAX_EDGE=1920, WEBP_Q=0.86;

  function uid(){ return 'a'+Math.random().toString(36).slice(2,9); }
  function extOf(name){ var m=/\.([a-z0-9]+)$/i.exec(name||''); return m?m[1].toLowerCase():''; }
  function baseName(name){ return String(name||'asset').replace(/\.[^.]+$/,'')
    .replace(/[^\w-]+/g,'-').toLowerCase().slice(0,40)||'asset'; }
  function uniqueName(base){ var reg=SG.assets.images||{}, svgReg=SG.assets.svg||{}, n=base, i=1;
    while(reg[n]||svgReg[n]){ n=base+'-'+(++i); } return n; }

  /* cheap content hash (FNV-1a over the base64 payload) for dedupe — not
     cryptographic, just enough to catch "the user dropped the same file twice" */
  function fnv1a(s){ var h=0x811c9dc5;
    for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); }
    return (h>>>0).toString(36); }
  F.assets._hashes=F.assets._hashes||{};              /* hash -> registry name */

  F.assets.dedupe=function(dataURI){
    var h=fnv1a(dataURI), existing=F.assets._hashes[h];
    return (existing && (SG.assets.images||{})[existing]) ? existing : null; };
  function registerHash(dataURI,name){ F.assets._hashes[fnv1a(dataURI)]=name; }

  /* ---------- raster import: decode -> optionally downscale -> re-encode ---------- */
  function readAsDataURL(file){ return new Promise(function(res,rej){
    var fr=new FileReader(); fr.onload=function(){ res(fr.result); }; fr.onerror=function(){ rej(fr.error); };
    fr.readAsDataURL(file); }); }
  function loadImageEl(src){ return new Promise(function(res,rej){
    var img=new Image(); img.onload=function(){ res(img); }; img.onerror=function(){ rej(new Error('could not decode image')); };
    img.src=src; }); }
  function downscale(img,maxEdge){
    var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    var s=Math.min(1,maxEdge/Math.max(w,h));
    var tw=Math.max(1,Math.round(w*s)), th=Math.max(1,Math.round(h*s));
    var cv=D.createElement('canvas'); cv.width=tw; cv.height=th;
    cv.getContext('2d').drawImage(img,0,0,tw,th);
    return {canvas:cv,w:tw,h:th}; }

  /* Import a raster/SVG File into the registry.
     opts.keepOriginal — skip downscale/re-encode (editor-import knob; NOT
       used by generation-time assets, which never downscale in the first
       place — see scripts/assets.py).
     opts.name — force the registry key (used by replaceFile). */
  F.assets.importFile=function(file,opts){
    opts=opts||{};
    var ext=extOf(file.name), isSVG=(ext==='svg'||file.type==='image/svg+xml');
    var name=opts.name||uniqueName(baseName(file.name)||uid());
    if(isSVG){
      return file.text().then(function(text){
        var san=F.assets.sanitizeSVG(text,name);
        SG.assets.svg=SG.assets.svg||{}; SG.assets.svg[name]=san.markup;
        F.assets.saveDebounced&&F.assets.saveDebounced();
        return {name:name,kind:'svg',w:san.w,h:san.h}; });
    }
    return readAsDataURL(file).then(function(rawURI){
      var dup=!opts.keepOriginal && F.assets.dedupe(rawURI);
      if(dup) return {name:dup,kind:'image',reused:true};
      return loadImageEl(rawURI).then(function(img){
        var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height,
            src=rawURI, type=file.type||'image/png', bytes=file.size,
            animated=(ext==='gif');                    /* never re-encode: would drop animation */
        if(!opts.keepOriginal && !animated && Math.max(w,h)>MAX_EDGE){
          var ds=downscale(img,MAX_EDGE);
          try{ src=ds.canvas.toDataURL('image/webp',WEBP_Q); type='image/webp'; }
          catch(e){ src=ds.canvas.toDataURL(type); }
          w=ds.w; h=ds.h; bytes=Math.round(src.length*0.75);
        }
        registerHash(src,name);
        SG.assets.images=SG.assets.images||{};
        SG.assets.images[name]={store:'embedded',src:src,w:w,h:h,bytes:bytes,type:type,alt:'',origin:'import'};
        F.assets.saveDebounced&&F.assets.saveDebounced();
        return {name:name,kind:'image'}; });
    }); };

  /* ---------- SVG sanitizer (DOMParser allow-list; mirrors scripts/assets.py's
     regex sanitizer, but structural since a live DOM is available here) ---------- */
  F.assets.sanitizeSVG=function(text,ns){
    var w=0,h=0;
    try{
      var doc=new DOMParser().parseFromString(text,'image/svg+xml');
      if(doc.querySelector('parsererror')) throw new Error('invalid SVG');
      var svg=doc.documentElement;
      if(!svg||svg.nodeName.toLowerCase()!=='svg') throw new Error('not an <svg> root');
      var vb=svg.getAttribute('viewBox');
      w=parseFloat(svg.getAttribute('width'))||0; h=parseFloat(svg.getAttribute('height'))||0;
      if((!w||!h)&&vb){ var p=vb.split(/[\s,]+/); w=w||parseFloat(p[2])||0; h=h||parseFloat(p[3])||0; }
      ['script','foreignObject'].forEach(function(tag){
        [].slice.call(svg.getElementsByTagName(tag)).forEach(function(n){ n.parentNode&&n.parentNode.removeChild(n); }); });
      var all=[svg].concat([].slice.call(svg.getElementsByTagName('*')));
      all.forEach(function(n){
        [].slice.call(n.attributes||[]).forEach(function(a){
          var an=a.name.toLowerCase();
          if(/^on/.test(an)){ n.removeAttribute(a.name); return; }
          if((an==='href'||an==='xlink:href')&&a.value&&a.value.charAt(0)!=='#'&&!/^data:image\//i.test(a.value)){
            n.removeAttribute(a.name); } }); });
      /* namespace fragment IDs so two imported diagrams never collide */
      var pre='sf-'+(ns||uid())+'-', idMap={};
      all.forEach(function(n){ var id=n.getAttribute('id'); if(id){ idMap[id]=pre+id; n.setAttribute('id',pre+id); } });
      if(Object.keys(idMap).length){ all.forEach(function(n){
        [].slice.call(n.attributes||[]).forEach(function(a){
          var v=a.value, changed=false;
          Object.keys(idMap).forEach(function(old){
            var re=new RegExp('url\\(#'+old+'\\)','g');
            if(re.test(v)){ v=v.replace(re,'url(#'+idMap[old]+')'); changed=true; }
            if(v==='#'+old){ v='#'+idMap[old]; changed=true; } });
          if(changed) n.setAttribute(a.name,v); }); }); }
      return {markup:new XMLSerializer().serializeToString(svg),w:w,h:h};
    }catch(e){
      return {markup:'<svg viewBox="0 0 100 100"><text x="8" y="55" font-size="9">invalid SVG</text></svg>',w:100,h:100};
    } };

  /* ---------- reference scan: every place an asset NAME can appear ----------
     layout content: {image:"name"}, {poster:"name"}, {svg:"name"} (diagram
     layout), brand.logo. Free objects: {type:"image"|"svg", asset:"name"}.
     Kept in one place so gc() and the library panel agree on what "used"
     means, and so scripts/assets.py's Python walker (extended in Phase C)
     stays in lockstep by convention (same key names, same rules). */
  F.assets.refs=function(){
    var used={images:{},svg:{}};
    function noteImage(v){ if(typeof v==='string'&&v) used.images[v]=1; }
    function noteSvg(v){ if(typeof v==='string'&&v) used.svg[v]=1; }
    (function walk(o){
      if(o==null||typeof o!=='object') return;
      if(Array.isArray(o)){ o.forEach(walk); return; }
      Object.keys(o).forEach(function(k){
        var v=o[k];
        if(k==='image'||k==='poster'||k==='logo') noteImage(v);
        else if(k==='svg'&&typeof v==='string') noteSvg(v);          /* diagram layout content */
        else if(k==='asset'){ if(o.type==='svg') noteSvg(v); else noteImage(v); }
        else walk(v); }); })(SG.data);
    return used; };

  /* ---------- GC (runs on Save; never silent mid-session) ---------- */
  F.assets.gc=function(opts){ opts=opts||{};
    var used=F.assets.refs(), dropped=[];
    var imgs=SG.assets.images||{}, svgs=SG.assets.svg||{};
    Object.keys(imgs).forEach(function(n){ if(!used.images[n]){ if(!opts.dryRun) delete imgs[n]; dropped.push('image:'+n); } });
    Object.keys(svgs).forEach(function(n){ if(!used.svg[n]){ if(!opts.dryRun) delete svgs[n]; dropped.push('svg:'+n); } });
    if(dropped.length&&!opts.dryRun) try{ console.info('slide-forge: gc removed unreferenced asset(s) — '+dropped.join(', ')); }catch(e){}
    return dropped; };

  /* ---------- accounting (informational meter, never a gate — media plan §7.3) ---------- */
  F.assets.bytes=function(){ var t=0;
    var imgs=SG.assets.images||{}; Object.keys(imgs).forEach(function(n){ var e=imgs[n]; if(e&&typeof e==='object') t+=e.bytes||0; });
    var svgs=SG.assets.svg||{}; Object.keys(svgs).forEach(function(n){ t+=(svgs[n]||'').length; });
    return t; };
  F.assets.count=function(){ return Object.keys(SG.assets.images||{}).length + Object.keys(SG.assets.svg||{}).length; };

  /* ---------- library ops: rename / replace / remove(+undo) / link<->embed ---------- */
  F.assets._trash=[];
  F.assets.rename=function(oldName,newName){
    newName=uniqueName(baseName(newName));
    var imgs=SG.assets.images||{}, svgs=SG.assets.svg||{};
    if(imgs[oldName]){ imgs[newName]=imgs[oldName]; delete imgs[oldName]; F.assets._remapRefs(oldName,newName,'image'); }
    else if(svgs[oldName]){ svgs[newName]=svgs[oldName]; delete svgs[oldName]; F.assets._remapRefs(oldName,newName,'svg'); }
    F.assets.saveDebounced&&F.assets.saveDebounced();
    return newName; };
  /* rewrite every reference to a renamed asset so a rename never orphans the
     objects that used it */
  F.assets._remapRefs=function(oldName,newName,kind){
    (function walk(o){ if(o==null||typeof o!=='object') return;
      if(Array.isArray(o)){ o.forEach(walk); return; }
      Object.keys(o).forEach(function(k){
        var v=o[k];
        if((k==='image'||k==='poster'||k==='logo')&&v===oldName&&kind==='image') o[k]=newName;
        else if(k==='svg'&&typeof v==='string'&&v===oldName&&kind==='svg') o[k]=newName;
        else if(k==='asset'&&v===oldName&&((kind==='svg')===(o.type==='svg'))) o[k]=newName;
        else walk(v); }); })(SG.data); };
  F.assets.replaceFile=function(name,file){
    var tmp='__tmp_'+uid();
    return F.assets.importFile(file,{name:tmp,keepOriginal:true}).then(function(res){
      var imgs=SG.assets.images||{}, svgs=SG.assets.svg||{};
      if(res.kind==='image'){ imgs[name]=imgs[tmp]; delete imgs[tmp]; if(svgs[name]) delete svgs[name]; }
      else { svgs[name]=svgs[tmp]; delete svgs[tmp]; if(imgs[name]) delete imgs[name]; }
      F.assets.saveDebounced&&F.assets.saveDebounced();
      return name; }); };
  F.assets.remove=function(name){
    var imgs=SG.assets.images||{}, svgs=SG.assets.svg||{};
    if(imgs[name]){ F.assets._trash.push({name:name,kind:'image',entry:imgs[name]}); delete imgs[name]; }
    else if(svgs[name]){ F.assets._trash.push({name:name,kind:'svg',entry:svgs[name]}); delete svgs[name]; }
    F.assets.saveDebounced&&F.assets.saveDebounced(); };
  F.assets.undoRemove=function(){ var t=F.assets._trash.pop(); if(!t) return null;
    if(t.kind==='image'){ SG.assets.images=SG.assets.images||{}; SG.assets.images[t.name]=t.entry; }
    else { SG.assets.svg=SG.assets.svg||{}; SG.assets.svg[t.name]=t.entry; }
    F.assets.saveDebounced&&F.assets.saveDebounced();
    return t.name; };
  /* "Link instead of embed" (media plan §7.3): converts an embedded image to
     store:"linked" at a relative path and hands back the original bytes so
     the caller can offer them as a download — the browser can't write into
     an arbitrary folder on its own, so placing the file next to the deck is
     the one manual step in an otherwise all-in-editor workflow. */
  F.assets.linkAsset=function(name,relPath){
    var imgs=SG.assets.images||{}, e=imgs[name]; if(!e||typeof e!=='object'||e.store==='linked') return null;
    var blobSrc=e.src;
    imgs[name]={store:'linked',path:relPath,w:e.w,h:e.h,bytes:e.bytes,type:e.type,alt:e.alt||''};
    F.assets.saveDebounced&&F.assets.saveDebounced();
    return blobSrc; };
  F.assets.embedAsset=function(name,dataURI,meta){
    var imgs=SG.assets.images||{}, e=imgs[name]; if(!e) return;
    imgs[name]={store:'embedded',src:dataURI,w:(meta&&meta.w)||e.w,h:(meta&&meta.h)||e.h,
      bytes:(meta&&meta.bytes)||e.bytes,type:(meta&&meta.type)||e.type,alt:e.alt||''};
    F.assets.saveDebounced&&F.assets.saveDebounced(); };
  F.assets.downloadAsset=function(name){
    var e=(SG.assets.images||{})[name]; if(!e||typeof e!=='object'||!e.src) return;
    var ext=(e.type||'').split('/')[1]||'png';
    var a=D.createElement('a'); a.href=e.src; a.download=name+'.'+ext;
    D.body.appendChild(a); a.click(); a.remove(); };

  /* ---------- persistence: assets get their OWN localStorage key, written on
     a longer debounce than deck JSON, so an oversized registry can never cost
     the user their text edits (F.save() for deck JSON always runs first —
     media plan §2.3). QuotaExceededError is caught and surfaced, never
     swallowed: F.assets._unsaved flags it for the chrome layer to show. ---------- */
  F.assets.storageKey=function(){ return F.key()+':assets'; };
  F.assets._unsaved=false;
  F.assets.save=function(){
    try{ localStorage.setItem(F.assets.storageKey(), JSON.stringify({images:SG.assets.images||{},svg:SG.assets.svg||{}}));
      if(F.assets._unsaved){ F.assets._unsaved=false; F.assets._onSaveState&&F.assets._onSaveState(false); }
    }catch(e){ if(!F.assets._unsaved){ F.assets._unsaved=true; F.assets._onSaveState&&F.assets._onSaveState(true); } } };
  F.assets.saveDebounced=function(){ clearTimeout(F.assets._saveT); F.assets._saveT=setTimeout(F.assets.save,900); };
  F.assets.restore=function(){
    try{ var raw=localStorage.getItem(F.assets.storageKey()); if(!raw) return false;
      var parsed=JSON.parse(raw);
      SG.assets.images=Object.assign({},parsed.images||{},SG.assets.images||{});
      SG.assets.svg=Object.assign({},parsed.svg||{},SG.assets.svg||{});
      return true;
    }catch(e){ return false; } };
})();
