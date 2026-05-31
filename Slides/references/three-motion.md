# 3D (Three.js) & choreographed motion (GSAP)

## Three.js — real 3D, lazy-loaded per slide

Three.js is heavy and ships as an **ES module** (post-r150 dropped the UMD global), so don't
put it in a `<script>` tag — load it on demand, only on the slide that needs it, via
`SG.loadLib('three')` (which `import()`s `lib/three/three.module.min.js`).

Declare it so the bundler stages it: `<meta name="deck-libs" content="three">`.

Reproducibility for 3D rests on two things: **render exactly one frame at a fixed camera under
`SG.static`** (no spin during capture), and **seed any placement** with `SG.rng`.

```html
<section class="slide" data-i="5">
  <div class="eyebrow-row"><span class="kicker">Geometry</span></div>
  <h2 class="title">The model in space</h2>
  <div id="scene5" style="flex:1; min-height:0; margin-top:18px"></div>
  <div class="pager">05 / 12</div>
  <div class="progress" style="width:41.6%"></div>
</section>

<script>
(function(){
  var host = document.getElementById('scene5'); if(!host) return;
  function start(){
    if(host.__done) return; host.__done = true;
    var p = SG.loadLib('three').then(function(THREE){
      var css=getComputedStyle(document.documentElement);
      var W=host.clientWidth||960, H=host.clientHeight||520;
      var sc=new THREE.Scene();
      var cam=new THREE.PerspectiveCamera(45, W/H, .1, 100); cam.position.set(2.4,1.6,2.8); cam.lookAt(0,0,0);
      var rnd=new THREE.WebGLRenderer({antialias:true, alpha:true}); rnd.setSize(W,H); rnd.setPixelRatio(1);
      host.appendChild(rnd.domElement);
      var mat=new THREE.MeshStandardMaterial({ color:new THREE.Color(css.getPropertyValue('--cyan').trim()),
        metalness:.3, roughness:.35 });
      var mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(1,0), mat); sc.add(mesh);
      sc.add(new THREE.AmbientLight(0xffffff,.6));
      var key=new THREE.DirectionalLight(new THREE.Color(css.getPropertyValue('--indigo').trim()),1.1);
      key.position.set(3,4,2); sc.add(key);
      if(window.SG && SG.static){ rnd.render(sc,cam); }          // ONE fixed frame for capture
      else { (function loop(t){ mesh.rotation.y=t/2200; mesh.rotation.x=t/4000;
        rnd.render(sc,cam); requestAnimationFrame(loop); })(0); }
      return true;
    });
    if(window.SG) SG.ready(p);   // renderer waits for the scene before screenshot
  }
  var s=document.querySelector('[data-i="5"]');
  if(s.classList.contains('active')) start();
  new MutationObserver(function(){ if(s.classList.contains('active')) start(); })
    .observe(s,{attributes:true,attributeFilter:['class']});
})();
</script>
```

Gotchas:
- **`setPixelRatio(1)`** for capture so the PNG is deterministic across machines (don't use
  `window.devicePixelRatio`).
- The host div must have a real size — `flex:1; min-height:0` inside the slide.
- A `single`-mode bundle keeps Three.js as a sibling `lib/three/…` file (ES modules can't be
  inlined); ship the `.html` with that folder. `stage`/`folder` modes already do.
- For random scatter/particles use `SG.rng()` so every render matches.

## GSAP — choreographed timelines

Use GSAP only when motion spans several elements with precise sequencing/easing that CSS
keyframes make unwieldy. For a single element's ambient loop, stay with CSS (see the template).

Setup: `<meta name="deck-libs" content="gsap">` + `<script src="lib/gsap/gsap.min.js"></script>`

The rule: build the timeline, then **if `SG.static`, jump it to the end** so capture shows the
finished composition rather than a mid-tween frame.

```js
var tl = gsap.timeline({ paused:true });
tl.from('.stat', { y:24, opacity:0, stagger:.12, duration:.5, ease:'power2.out' })
  .from('.hero-num', { scale:.8, opacity:0, duration:.5 }, '-=.2');
if(window.SG && SG.static) tl.progress(1);   // finished state for the render
else tl.play();
```

Give every animated element a sensible **resting style in CSS** too, so reduced-motion users
(and the frozen capture) see a complete layout even before/without the tween — same principle
as the bespoke animations' base states.
