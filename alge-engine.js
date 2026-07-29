/* ═══════════════════════════════════════════════════════════════════════════
   alge-engine — the WebGL globe (three.js + UnrealBloom).
   The classic 2D-canvas engine in index.html is the automatic fallback: this
   module sets window.__3D only after a renderer actually exists, and the old
   draw loop stands down on that flag. Data, sheets, posting, moderation — all
   stay in the classic script; this file only OWNS THE PICTURE and the touch.
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const APP = window.APP;
if (!APP) throw new Error('bridge missing');
const S = APP.S, CATS = APP.CATS, IS_DEMO = APP.IS_DEMO;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The entry gate (index.html) owns the first screen: one real question and
   three choices. While it is up the picture stays quiet — no floating labels,
   no spotlight card — so nothing competes with that question. */
const isGated = () => document.body.classList.contains('gated');

/* ── renderer: if this fails, the 2D engine simply keeps running ── */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  /* Pixel ratio is the single biggest lever on this scene, and it was pinned at
     2 — on a retina display that is four times the fragments of 1x, every one
     of them running the backdrop, the Earth shader and a bloom pass. 1.5 costs
     about 44% less than 2 and the difference is genuinely hard to see on a
     globe made of soft light; it drops again to 1.15 when frames are still
     being missed. This is why it felt heavy on a machine that should fly. */
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
} catch (_) { throw new Error('no webgl — 2D fallback stays live'); }
window.__3D = true;
const oldCanvas = document.getElementById('c');
oldCanvas.style.display = 'none';
renderer.domElement.id = 'c3d';
renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;cursor:grab;touch-action:none;display:block;';
document.body.insertBefore(renderer.domElement, oldCanvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x232e38);   // also the fallback if the backdrop fails
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);

/* ── mont-fort air ────────────────────────────────────────────────────────
   The 2D engine drifted two soft mist banks behind the globe and the picture
   never stood still. The WebGL port dropped that and left a flat fill, which
   is what made the background read as dead. This is that air, rebuilt as one
   fullscreen pass: four huge soft banks on long sine paths with different
   periods, so the loop is never visible.

   Drawn as a clip-space quad (position.xy passed straight through, z at the
   far plane) rather than a skydome — it cannot be escaped by zoom or clipped
   by the far plane, and costs one untextured fullscreen fill.

   The vignette is the Apple-hero half of the brief: darken the surround so
   the eye lands on one focal object instead of wandering the frame.

   uMotion is 0 under prefers-reduced-motion — the air holds still. */
const backdropMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: {
    uRes:    { value: new THREE.Vector2(innerWidth, innerHeight) },
    uTime:   { value: 0 },
    uPar:    { value: new THREE.Vector2(0, 0) },
    uMotion: { value: REDUCED ? 0 : 1 },
    uQuality:{ value: 1 },     // dropped to 0 automatically when frames are missed
  },
  vertexShader: `
    void main(){ gl_Position = vec4(position.xy, 1.0, 1.0); }
  `,
  fragmentShader: `
    precision mediump float;
    uniform vec2 uRes; uniform float uTime; uniform vec2 uPar; uniform float uMotion;
    uniform float uQuality;

    float bank(vec2 p, vec2 c, float r, vec2 asp){
      return smoothstep(r, 0.0, distance(p * asp, c * asp));
    }

    /* value noise — stands in for mont-fort's tiling noise texture, which they
       sample twice at different scales to give the fog its texture */
    float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 q){
      vec2 i = floor(q), f = fract(q);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i),               hash(i + vec2(1.,0.)), f.x),
                 mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
    }

    void main(){
      vec2 uv  = gl_FragCoord.xy / uRes;
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 p   = uv + uPar;                 // parallax: the air trails the drag
      float t  = uTime * uMotion;

      // deep slate floor lifting to the brand blue toward the top of frame
      vec3 col = mix(vec3(0.047, 0.064, 0.082),
                     vec3(0.137, 0.180, 0.220),
                     smoothstep(0.0, 1.0, uv.y * 0.85 + 0.15));

      vec3 mist = vec3(0.0);
      mist += vec3(0.729, 0.800, 0.855) * bank(p, vec2(0.20 + sin(t * 0.023) * 0.10,
                                                       0.30 + cos(t * 0.017) * 0.05), 0.42, asp) * 0.085;
      mist += vec3(0.729, 0.800, 0.855) * bank(p, vec2(0.70 + sin(t * 0.031 + 2.1) * 0.14,
                                                       0.75 + sin(t * 0.021 + 0.7) * 0.07), 0.46, asp) * 0.070;
      mist += vec3(0.863, 0.910, 0.949) * bank(p, vec2(0.90 + sin(t * 0.019 + 1.3) * 0.08,
                                                       0.20 + cos(t * 0.027) * 0.06), 0.34, asp) * 0.055;
      mist += vec3(0.863, 0.910, 0.949) * bank(p, vec2(0.50 + sin(t * 0.013 + 4.2) * 0.12,
                                                       0.55 + cos(t * 0.023 + 1.1) * 0.06), 0.38, asp) * 0.050;

      /* the banks alone are smooth blobs; two octaves of drifting noise give
         them internal texture — this is the half of mont-fort's fog we lacked */
      float fogN = vnoise(p * asp * 3.0 + vec2(t * 0.020, -t * 0.012)) * 0.65;
      if (uQuality > 0.5)
        fogN += vnoise(p * asp * 7.0 - vec2(t * 0.014, t * 0.009)) * 0.35;
      else fogN *= 1.35;                       // keep the fog's weight without the octave
      col += mist * (0.70 + 0.60 * fogN);

      /* mont-fort blueprint grid: derivative-AA lines, brighter crosses at the
         intersections, dots lit by a slow drifting noise pool. Held far from
         the centre — the globe sits on air, not graph paper. */
      if (uQuality > 0.5) {
      vec2 gUv = p * asp * 16.0;
      vec2 gridUV = 1.0 - abs(fract(gUv) * 2.0 - 1.0);
      vec2 deriv = fwidth(gUv);
      vec2 aa = deriv * 1.5;
      vec2 drawW = clamp(vec2(0.03), deriv, vec2(0.5));
      vec2 g2 = smoothstep(drawW + aa, drawW - aa, gridUV) * clamp(vec2(0.03) / drawW, 0.0, 1.0);
      float grid = max(g2.x, g2.y);
      vec2 crossW = clamp(vec2(0.14), deriv, vec2(0.5));
      vec2 inter = smoothstep(crossW + aa, crossW - aa, gridUV);
      float crossMark = inter.x * inter.y;
      float dots = smoothstep(0.30, 0.10, length(gridUV));
      float lit  = smoothstep(0.62, 0.95, vnoise(gUv * 0.14 + vec2(t * 0.030, -t * 0.018)));
      float ring = smoothstep(0.16, 0.55, length((uv - 0.5) * asp));
      col += vec3(0.28, 0.36, 0.44) * grid      * 0.045 * ring;
      col += vec3(0.42, 0.58, 0.72) * crossMark * 0.075 * ring;
      col += vec3(0.30, 0.60, 0.85) * dots * lit * 0.16 * ring;
      }

      float v = smoothstep(1.25, 0.30, length((uv - 0.5) * asp) * 1.30);
      col *= mix(0.52, 1.0, v);

      /* mont-fort ships dithering:!0 on every material for the same reason:
         8-bit output posterises these long dark gradients without it */
      col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
backdrop.frustumCulled = false;
backdrop.renderOrder = -1;
scene.add(backdrop);

/* rig: pitch ⟶ yaw ⟶ (earth + nodes). Drag = yaw/pitch, exactly the old feel. */
const pitchG = new THREE.Group(), yawG = new THREE.Group();
pitchG.add(yawG); scene.add(pitchG);

/* equirect standard mapping — matches three.js SphereGeometry UVs */
const ll2v = (lat, lon) => {
  const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
};
const HOME_LL = [31.78, 76.99];                       // IIT Mandi
const homeDir = ll2v(...HOME_LL);
const faceAngles = d => ({ yaw: Math.atan2(-d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) });

/* ── the Earth: day + night-lights + ocean specular in one shader ── */
const TEXBASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r134/examples/textures/planets/';
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
/* Anisotropy was never set, and that — not the pixel count — is most of why the
   surface turned to mush when you dived in. Without it the GPU samples an
   obliquely-viewed texture along a square footprint and blurs everything at a
   grazing angle, which is exactly the angle you look at a globe from once you
   are close to it. Free: no extra bytes, just correct sampling. */
const MAXANISO = renderer.capabilities.getMaxAnisotropy();
const tex = n => {
  const t = loader.load(TEXBASE + n);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXANISO;
  return t;
};
const dayMap = tex('earth_atmos_2048.jpg');
const nightMap = tex('earth_lights_2048.png');
const specMap = loader.load(TEXBASE + 'earth_specular_2048.jpg');

const SUN = new THREE.Vector3(-0.85, 0.30, 0.42).normalize();   // terminator crosses the visible disc — day left, city lights right
const earthMat = new THREE.ShaderMaterial({
  uniforms: {
    dayMap: { value: dayMap }, nightMap: { value: nightMap }, specMap: { value: specMap },
    sunDir: { value: SUN },
  },
  vertexShader: `
    varying vec3 vN; varying vec2 vUv; varying vec3 vW;
    void main(){
      vN = normalize(mat3(modelMatrix) * normal);
      vUv = uv;
      vW = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader: `
    uniform sampler2D dayMap, nightMap, specMap; uniform vec3 sunDir;
    varying vec3 vN; varying vec2 vUv; varying vec3 vW;
    void main(){
      vec3 N = normalize(vN);
      float ndl = dot(N, sunDir);
      vec3 day = texture2D(dayMap, vUv).rgb;
      // mont-fort grade: desaturated slate, blue lift — the brand look
      float gr = dot(day, vec3(0.3, 0.59, 0.11));
      day = gr * 0.28 + day * 0.52 + vec3(0.012, 0.03, 0.075);
      day *= 0.28 + 0.92 * max(ndl, 0.0);
      // night side: real city lights, warmed
      vec3 night = texture2D(nightMap, vUv).rgb;
      night = night * vec3(1.25, 1.02, 0.72) * 1.7;
      float k = smoothstep(-0.12, 0.28, ndl);
      vec3 col = mix(night, day, k);
      // terminator: a narrow warm band where day meets night
      float term = smoothstep(0.10, 0.0, abs(ndl)) * 0.05;
      col += vec3(0.9, 0.45, 0.2) * term;
      // ocean specular from the sun
      vec3 V = normalize(cameraPosition - vW);
      vec3 R = reflect(-sunDir, N);
      float spec = pow(max(dot(R, V), 0.0), 48.0) * texture2D(specMap, vUv).r;
      col += vec3(0.75, 0.87, 1.0) * spec * 0.85 * k;
      // inner atmosphere rim
      float fres = pow(1.0 - max(dot(V, N), 0.0), 3.4);
      col += vec3(0.30, 0.52, 0.85) * fres * (0.22 + 0.3 * k);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
/* Sharper Earth, without paying for it on first paint. The 2K map above is what
   you see immediately; this pulls the 4K one (713KB, same equirectangular
   projection, same source) in the background and swaps it in when it lands.
   Four times the pixels — roughly 20km per pixel down to 10km.

   Honest limit: this makes the planet crisp, it does not make it a map. Street
   detail would need real tile servers, and it would be pointless here anyway —
   every location is deliberately rounded to ~0.1° (~11km) before it is stored,
   so the data itself does not know an address. Sharper is reachable; "exact
   address" is not, and should not be.

   Skipped entirely when the device asks for reduced data. */
const saveData = navigator.connection && navigator.connection.saveData;
if (!saveData) {
  loader.load(TEXBASE + 'earth_atmos_4096.jpg', t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = MAXANISO;
    const old = earthMat.uniforms.dayMap.value;
    earthMat.uniforms.dayMap.value = t;
    if (old && old !== t) old.dispose();
  }, undefined, () => {/* 2K stays; the globe never depended on this */});
}

const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), earthMat);
yawG.add(earth);

/* outer atmosphere shell — fresnel, back-side, additive: feeds the bloom */
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(1.06, 64, 64),
  new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN } },
    vertexShader: `
      varying vec3 vN; varying vec3 vW;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vW = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float f = 1.0 - abs(dot(V, normalize(vN)));
        float rim = pow(f, 5.0) * (1.0 - smoothstep(0.86, 1.0, f));   // no hard outer ring
        float lit = 0.5 + 0.5 * max(dot(normalize(vN), sunDir), 0.0);
        gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * lit, rim * 0.6);
      }`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
scene.add(atmo);

/* ── stars: two depth bands, parallax against the drag ── */
function starField(n, size, spread) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(spread + Math.random() * 18);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xdfeaf4, size, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
}
const starsFar = starField(900, 0.055, 34), starsNear = starField(220, 0.1, 22);
scene.add(starsFar, starsNear);

/* ── node sprites: white core + category glow, additive → real bloom ── */
function nodeTexture([r, g, b]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  let gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
  gr.addColorStop(0.3, `rgba(${r},${g},${b},0.28)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  // White core = the conversation itself; coloured ring = which corner of life
  // it belongs to. The core used to be big enough that additive blending plus
  // bloom fused a cluster into one white blob, taking the colour — the only
  // thing telling two neighbours apart — with it. Smaller core, heavier ring:
  // the category survives being stacked.
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(64, 64, 7, 0, 7); c.fill();
  c.lineWidth = 8; c.strokeStyle = `rgb(${r},${g},${b})`;
  c.beginPath(); c.arc(64, 64, 16, 0, 7); c.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const MATS = {};
for (const k in CATS) MATS[k] = new THREE.SpriteMaterial({
  map: nodeTexture(CATS[k].col), transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

const ORBIT = 1.16, BOB = 0.011;   // float height + bob amplitude — 'conversations float on a shell above the surface'
let clusterSpread = 0;             // how far a co-located cluster has opened, by zoom
let qualityHold = 0;               // frames to wait before changing quality again
const nodeGroup = new THREE.Group(); yawG.add(nodeGroup);
let tetherLine = null, surfDots = null;
function rebuildTethers() {
  if (tetherLine) { yawG.remove(tetherLine); tetherLine.geometry.dispose(); tetherLine.material.dispose(); }
  if (surfDots) { yawG.remove(surfDots); surfDots.geometry.dispose(); surfDots.material.dispose(); }
  const list = [...sprites.values()];
  if (!list.length) return;
  const lp = new Float32Array(list.length * 6), sp2 = new Float32Array(list.length * 3);
  list.forEach((sp, i) => {
    const d = sp.userData.dir;
    lp.set([d.x * 1.002, d.y * 1.002, d.z * 1.002, sp.position.x, sp.position.y, sp.position.z], i * 6);
    sp2.set([d.x * 1.003, d.y * 1.003, d.z * 1.003], i * 3);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage));
  tetherLine = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false,
  }));
  yawG.add(tetherLine);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp2, 3));
  surfDots = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.014, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  yawG.add(surfDots);
}
const sprites = new Map();                       // node → sprite
const hash = x => { x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
let nid = 0;
function spriteFor(n) {
  // the dot must point at the question's REAL place: use its lat/lon directly.
  // (the classic anchor blends in a category offset — that is a clustering trick
  //  for the 2D physics, not a location, and it put dots off their cities.)
  const q = !IS_DEMO && S.q.get(n.id);
  let d;
  if (q && q.lat != null && q.lon != null) d = ll2v(q.lat, q.lon);
  else if (!IS_DEMO) {
    // No location given. Parking these on home was fine when every user was
    // from that one campus; it stopped being fine the moment questions arrived
    // from Kolkata. They still need to exist somewhere on a globe, so they sit
    // high above home on a wide, obviously-not-a-place scatter, and the caption
    // now reads "location not shared" rather than naming a town for them.
    // The real fix is confirming the place at post time — the globe should not
    // be guessing on someone's behalf at all.
    d = homeDir.clone();
    const u = Math.abs(d.y) < 0.94 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const a1 = new THREE.Vector3().crossVectors(d, u).normalize();
    const a2 = new THREE.Vector3().crossVectors(d, a1).normalize();
    const k = nid * 2.399963;                       // golden-angle, so they never stack
    d.addScaledVector(a1, Math.cos(k) * 0.055).addScaledVector(a2, Math.sin(k) * 0.055);
  }
  // Five of twelve conversations have no location — someone declined the prompt.
  // They used to fall through to the classic anchor, which is a CATEGORY
  // clustering position, not a place: questions asked in Mandi were drawn over
  // Africa and the Pacific while the panel underneath read "IIT Mandi", because
  // fmtLoc() already reports home when lat/lon are null. Now the dot agrees with
  // the words. The demo path keeps the lattice — it has no real places to honour.
  else d = n.anchor
    ? new THREE.Vector3(n.anchor.x, -n.anchor.y, -n.anchor.z)
    : new THREE.Vector3(n.dx, -n.dy, -n.dz);
  d.normalize();
  // Co-located posts (a whole cohort shares one rounded lat/lon) fan out so each
  // stays tappable. This used to spread ±0.035 rad — about 400km — so questions
  // asked at IIT Mandi were drawn over Afghanistan and China while the panel
  // still said "from IIT Mandi". The dot was lying about the place.
  // 0.009 keeps them separable at the zoom where you'd tap one, and is close to
  // the ~11km the location is deliberately rounded to anyway. The feed, not the
  // spread, is what makes every conversation reachable.
  const i = nid++;
  const up = Math.abs(d.y) < 0.94 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(d, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
  const jx = (hash(i * 3 + 1) - 0.5), jy = (hash(i * 3 + 2) - 0.5);
  d.addScaledVector(t1, jx * 0.009).addScaledVector(t2, jy * 0.009).normalize();
  // own material clone per sprite — 21 live nodes, and it buys per-node dimming
  const sp = new THREE.Sprite(MATS[CATS[n.cat] ? n.cat : 'random'].clone());
  sp.position.copy(d).multiplyScalar(ORBIT);
  sp.userData.node = n; sp.userData.dir = d; sp.userData.ph = hash(i * 7 + 5) * Math.PI * 2;
  // kept so the cluster can OPEN as you dive into it — see spreadFor() in the
  // frame loop. Honest and tight from orbit, separable once you are close.
  sp.userData.t1 = t1; sp.userData.t2 = t2; sp.userData.jx = jx; sp.userData.jy = jy;
  sp.userData.born = performance.now();
  nodeGroup.add(sp); sprites.set(n, sp);
  return sp;
}
function nodeScale(n) {
  const nr = IS_DEMO ? (n.nr || 0) : (S.replies.get(n.id) || []).length;
  return 0.082 + Math.min(Math.sqrt(nr) * 0.028, 0.08);
}

/* massive demo (?n= thousands): one Points cloud instead of sprites */
let massive = null;
function buildMassive() {
  const n = S.arr.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  S.arr.forEach((p, i) => {
    const d = new THREE.Vector3(p.dx ?? p.anchor.x, -(p.dy ?? p.anchor.y), -(p.dz ?? p.anchor.z)).normalize();
    pos.set([d.x * ORBIT, d.y * ORBIT, d.z * ORBIT], i * 3);
    const [r, g, b] = p.col; col.set([r / 255, g / 255, b / 255], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  massive = new THREE.Points(g, new THREE.PointsMaterial({
    size: 0.014, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  yawG.add(massive);
}
const MASSIVE = IS_DEMO && S.arr.length > 600 || IS_DEMO && (new URLSearchParams(location.search).get('n') | 0) > 600;

/* home + YOU markers */
function markerSprite(colCss, ring) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = colCss; c.beginPath(); c.arc(32, 32, ring ? 9 : 7, 0, 7); c.fill();
  if (ring) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 16, 0, 7); c.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.setScalar(0.045);
  return sp;
}
const homeMark = markerSprite('#E60000', false);
homeMark.position.copy(homeDir).multiplyScalar(1.005);
yawG.add(homeMark);

/* ── arcs: threads of light between conversations in the same topic ── */
const ARCS = []; let arcNextAt = 0;
function spawnArc(now) {
  const pool = [...sprites.values()];
  if (pool.length < 2) return;
  const a = pool[(Math.random() * pool.length) | 0];
  const peers = pool.filter(s => s !== a && s.userData.node.cat === a.userData.node.cat);
  const b = peers.length ? peers[(Math.random() * peers.length) | 0] : pool[(Math.random() * pool.length) | 0];
  if (a === b) return;
  const N = 48, pts = new Float32Array((N + 1) * 3);
  const va = a.position.clone().normalize(), vb = b.position.clone().normalize();
  const q = new THREE.Quaternion(), tmp = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    q.setFromUnitVectors(va, vb); const qq = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), q, t);
    tmp.copy(va).applyQuaternion(qq).multiplyScalar(ORBIT * (1 + 0.09 * Math.sin(Math.PI * t)));
    pts.set([tmp.x, tmp.y, tmp.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const [r, gg, bb] = a.userData.node.col;
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({
    color: new THREE.Color(r / 255, gg / 255, bb / 255), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  line.geometry.setDrawRange(0, 0);
  yawG.add(line);
  ARCS.push({ line, t0: now, dur: 2600 + Math.random() * 1200, N });
}
function stepArcs(now) {
  if (now > arcNextAt && ARCS.length < 4 && !MASSIVE) { spawnArc(now); arcNextAt = now + 2800 + Math.random() * 2600; }
  for (let i = ARCS.length - 1; i >= 0; i--) {
    const a = ARCS[i], k = (now - a.t0) / a.dur;
    if (k < 1) a.line.geometry.setDrawRange(0, Math.floor((1 - Math.pow(1 - k, 3)) * a.N) + 1);
    else {
      a.line.material.opacity = 0.55 * Math.max(0, 1 - (k - 1) * 2.2);
      if (a.line.material.opacity <= 0) { yawG.remove(a.line); a.line.geometry.dispose(); a.line.material.dispose(); ARCS.splice(i, 1); }
    }
  }
}

/* ── composer: the bloom IS the new era ── */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.55, 0.78);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── camera + control state (same feel constants as the 2D engine) ── */
const home = faceAngles(homeDir);
let yaw = home.yaw - 2.2, pitch = 0.35, vyaw = 0, vpitch = 0;
let zoomT = 1, zoom = REDUCED ? 1 : 0.55;
let dragging = false, lx = 0, ly = 0, lastInteract = 0, flyTo = null;
const ptrs = new Map(); let pinchD0 = 0, pinchZ0 = 1, pinching = false;
/* ── aspect-aware fit: the globe must FIT the frame on any screen ──
   A fixed camera distance framed desktop only — on a portrait phone the
   horizontal field is far narrower than the vertical one, so the globe
   overflowed the width. Fit against the SMALLER half-angle instead: the
   shell (1.16) plus glow margin always lands inside both dimensions. */
const FIT_R = 1.32;
function baseDist() {
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  return FIT_R / Math.sin(Math.min(vHalf, hHalf));
}
const distFor = z => THREE.MathUtils.clamp(baseDist() / Math.pow(z, 0.85), 1.45, baseDist() * 1.2);
/* portrait: the FAB + chips live at the bottom, so the globe rides a little
   high; wide screens keep it centered */
const lookY = () => camera.aspect < 0.8 ? -0.16 : 0;

const intro = { active: !REDUCED, t0: 0, dur: 5200 };
if (REDUCED) { yaw = home.yaw; pitch = home.pitch; }

const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    const a = [...ptrs.values()];
    pinchD0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); pinchZ0 = zoomT; pinching = true; dragging = false;
  } else { dragging = true; lx = e.clientX; ly = e.clientY; flyTo = null; }
  lastInteract = performance.now();
  if (intro.active) finishIntro();
  if (window.dismissHint) window.dismissHint();
  try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
});
cvs.addEventListener('pointerup', e => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinching = false;
  if (!dragging) return; dragging = false;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  if (Math.abs(dx) + Math.abs(dy) < 6 && hover) window.openQ(hover.userData.node.id);
});
cvs.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinching = false; dragging = false; });
cvs.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching && ptrs.size >= 2) {
    const a = [...ptrs.values()];
    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    if (pinchD0 > 0) zoomT = THREE.MathUtils.clamp(pinchZ0 * d / pinchD0, 0.5, 7);
    lastInteract = performance.now(); hover = null; return;
  }
  if (dragging) {
    const dx = e.clientX - lx, dy = e.clientY - ly;
    yaw += dx * 0.006; pitch = THREE.MathUtils.clamp(pitch + dy * 0.006, -1.3, 1.3);
    vyaw = dx * 0.0006; vpitch = dy * 0.0006; lx = e.clientX; ly = e.clientY;
    lastInteract = performance.now();
  }
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
cvs.addEventListener('pointerleave', () => { hover = null; });
cvs.addEventListener('wheel', e => {
  e.preventDefault(); lastInteract = performance.now();
  zoomT = THREE.MathUtils.clamp(zoomT * Math.exp(-e.deltaY * 0.0016), 0.5, 7);
  if (intro.active) finishIntro();
}, { passive: false });
const zin = document.getElementById('zin'), zout = document.getElementById('zout');
if (zin) zin.onclick = () => { zoomT = Math.min(7, zoomT * 1.45); lastInteract = performance.now(); };
if (zout) zout.onclick = () => { zoomT = Math.max(0.5, zoomT / 1.45); lastInteract = performance.now(); };
addEventListener('keydown', e => {
  if (document.querySelector('.sheet.open')) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const st = 0.07;
  if (e.key === 'ArrowLeft') yaw -= st; else if (e.key === 'ArrowRight') yaw += st;
  else if (e.key === 'ArrowUp') pitch = Math.max(-1.3, pitch - st);
  else if (e.key === 'ArrowDown') pitch = Math.min(1.3, pitch + st);
  else if (e.key === '+' || e.key === '=') zoomT = Math.min(7, zoomT * 1.2);
  else if (e.key === '-' || e.key === '_') zoomT = Math.max(0.5, zoomT / 1.2);
  else return;
  lastInteract = performance.now();
  if (intro.active) finishIntro();
});

function finishIntro() {
  if (!intro.active) return;
  intro.active = false;
  yaw = home.yaw; pitch = home.pitch; zoom = 1; zoomT = 1;
  if (window.endIntro) window.endIntro();
}

/* fly the camera to face a node (also fires on ?q= deep links via the poll) */
function flyToNode(id) {
  const sp = [...sprites.values()].find(s => s.userData.node.id === id);
  if (!sp) return;
  const ang = faceAngles(sp.position.clone().normalize());
  flyTo = { yaw: ang.yaw, pitch: ang.pitch, t0: performance.now(), dur: 900 };
  if (zoomT < 1.5) zoomT = 1.5;
}

/* ── hover + tip + spotlight — same DOM elements the 2D engine used ── */
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2(9, 9);
let hover = null, spot = null, spotNextAt = 4000; const spotRecent = [];
const tip = document.getElementById('tip'),
  tipCat = tip.querySelector('.tc'), tipQ = tip.querySelector('.tq'), tipM = tip.querySelector('.tm'),
  lHalo = document.getElementById('leaderHalo'), lPath = document.getElementById('leaderPath'),
  lDot = document.getElementById('leaderDot');
let _tipStamp = null, _callOn = false;
const proj = new THREE.Vector3();
function screenPos(sp) {
  proj.setFromMatrixPosition(sp.matrixWorld).project(camera);
  return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, front: proj.z < 1 && frontDot(sp) > 0.12 };
}
const _wv = new THREE.Vector3(), _cv = new THREE.Vector3();
function frontDot(sp) {
  sp.getWorldPosition(_wv); _cv.copy(camera.position).sub(_wv).normalize();
  return _wv.clone().normalize().dot(_cv);
}
function hideCallout() {
  if (!_callOn) return; _callOn = false;
  tip.style.opacity = '0'; lHalo.style.opacity = '0'; lPath.style.opacity = '0'; lDot.style.opacity = '0';
}
function updateCallout() {
  if (intro.active) { hideCallout(); return; }
  const focus = hover || spot;
  if (!focus) { hideCallout(); return; }
  tip.classList.toggle('missed', !hover && !!spot);
  const p = screenPos(focus);
  if (!p.front) { hideCallout(); return; }
  _callOn = true;
  const n = focus.userData.node, [r, g, b] = n.col;
  const flip = p.x > innerWidth * 0.6;
  const midx = p.x + (flip ? -14 : 14), midy = p.y - 28;
  const endx = p.x + (flip ? -36 : 36), endy = p.y - 40;
  lHalo.setAttribute('d', `M ${p.x} ${p.y} L ${midx} ${midy} L ${endx} ${endy}`); lHalo.style.opacity = '1';
  lPath.setAttribute('d', `M ${p.x} ${p.y} L ${midx} ${midy} L ${endx} ${endy}`); lPath.style.opacity = '1';
  lDot.setAttribute('cx', p.x); lDot.setAttribute('cy', p.y);
  lDot.setAttribute('fill', `rgb(${r},${g},${b})`); lDot.style.opacity = '1';
  tip.style.left = endx + 'px'; tip.style.top = endy + 'px';
  tip.style.transform = flip ? 'translate(-100%,-100%)' : 'translate(0,-100%)';
  const rs = window.repliesOf(n.id), stamp = n.id + ':' + rs.length;
  if (_tipStamp !== stamp) {
    _tipStamp = stamp;
    const q = APP.qOf(n.id);
    tipCat.style.color = `rgb(${r},${g},${b})`; tipCat.textContent = n.cat;
    tipQ.textContent = n.text.slice(0, 120);
    tipM.textContent = (q ? q.name + ' · ' : '') + APP.ago(n.createdAt || n.ts) + ' · ' +
      (rs.length ? rs.length + (rs.length > 1 ? ' voices' : ' voice') : 'still unfinished') +
      (IS_DEMO ? '' : ' · ' + window.fmtLoc(q && q.lat, q && q.lon));
  }
  tip.style.opacity = '1';
}
function updateSpot(now) {
  if (hover || dragging) { if (hover) spot = null; return; }
  if (spot && now > spot.userData._until) spot = null;
  if (!spot && now > spotNextAt) {
    const pool = [...sprites.values()].filter(s =>
      frontDot(s) > 0.3 && !spotRecent.includes(s.userData.node.id) &&
      (!S.filter || S.filter === s.userData.node.cat));
    if (pool.length) {
      let best = null, bs = -1;
      for (const s of pool) {
        const nr = window.repliesOf(s.userData.node.id).length;
        const age = (Date.now() - s.userData.node.ts) / 86400000;
        const sc = (nr === 0 ? 1.6 : 0) + Math.min(age / 45, 1) + Math.random() * 0.4;
        if (sc > bs) { bs = sc; best = s; }
      }
      spot = best; spot.userData._until = now + 5200;
      spotRecent.push(spot.userData.node.id); if (spotRecent.length > 8) spotRecent.shift();
    }
    spotNextAt = now + 9000;
  }
}

/* ── ambient labels: DOM pills, crisper than any canvas text ── */
/* ── cluster badges ────────────────────────────────────────────────────────
   Seven conversations share one campus, so from any normal distance they are a
   single smear of light and none of them can be picked out — colour and spread
   both lose to additive blending at that scale.

   So a place with more than one conversation stops pretending to be several
   dots and becomes one marker carrying a count. Tapping it opens that place's
   stack, where every conversation is listed and reachable. Once you dive in far
   enough for the cluster to genuinely separate, the badge stands down and the
   individual dots take over — the same threshold the fan-out uses, so the two
   behaviours hand off to each other instead of fighting.

   Badges live in the DOM rather than the scene: they must stay legible at any
   zoom, and text in WebGL at this size is a fight for no benefit. */
const badgeBox = document.createElement('div');
badgeBox.id = 'badges';
badgeBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9;';
document.body.appendChild(badgeBox);
const badgeEls = [];
function placeKey(n) {
  const q = S.q.get(n.id);
  if (!q || q.lat == null || q.lon == null) return 'unplaced';
  return q.lat.toFixed(1) + ',' + q.lon.toFixed(1);
}
function stepBadges() {
  const expanded = clusterSpread > 0.006;          // dots have separated; stand down
  if (MASSIVE || isGated() || document.body.classList.contains('sheeting') ||
      document.body.classList.contains('feeding') || expanded) {
    badgeEls.forEach(b => b.style.opacity = '0');
    return;
  }
  const groups = new Map();
  for (const [n, sp] of sprites) {
    if (S.filter && S.filter !== n.cat) continue;
    const k = placeKey(n);
    let g = groups.get(k);
    if (!g) { g = { n: 0, x: 0, y: 0, front: false, first: n }; groups.set(k, g); }
    const p = screenPos(sp);
    g.n++; g.x += p.x; g.y += p.y; g.front = g.front || p.front;
  }
  const multi = [...groups.values()].filter(g => g.n > 1 && g.front)
    .sort((a, b) => b.n - a.n).slice(0, 6);
  while (badgeEls.length < multi.length) {
    const el = document.createElement('button');
    el.className = 'cbadge';
    el.style.pointerEvents = 'auto';
    badgeBox.appendChild(el); badgeEls.push(el);
  }
  badgeEls.forEach((el, i) => {
    const g = multi[i];
    if (!g) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return; }
    el.textContent = String(g.n);
    el.setAttribute('aria-label', g.n + ' conversations here — open them');
    el.style.transform = `translate(${g.x / g.n}px,${g.y / g.n}px) translate(-50%,-50%)`;
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    el.onclick = () => { if (window.openQ) window.openQ(g.first.id); };
  });
}

const labelBox = document.getElementById('labels');
const labelEls = [];
for (let i = 0; i < 4; i++) {
  const el = document.createElement('div'); el.className = 'albl';
  labelBox.appendChild(el); labelEls.push(el);
}
let labelFrame = 0, labelPick = [];
function stepLabels() {
  if (MASSIVE) return;
  // While the entry gate is up the only thing on screen is one real person's
  // question. Floating labels underneath it turned that into three competing
  // texts stacked on the same pixels.
  if (isGated()) { labelEls.forEach(el => el.style.opacity = '0'); return; }
  if (++labelFrame % 150 === 1) {
    const cand = [...sprites.values()]
      .filter(s => frontDot(s) > 0.35 && (!S.filter || S.filter === s.userData.node.cat))
      .sort((a, b) => frontDot(b) - frontDot(a));
    labelPick = [];
    // 3, not 4, and spaced further apart — nodes bunch over one city, so the
    // old 230×54 box still let labels land almost on top of each other.
    for (const s of cand) {
      if (labelPick.length >= 3) break;
      const p = screenPos(s);
      if (labelPick.some(o => Math.abs(o.p.x - p.x) < 300 && Math.abs(o.p.y - p.y) < 92)) continue;
      labelPick.push({ s, p });
    }
  }
  labelEls.forEach((el, i) => {
    const pick = labelPick[i];
    if (!pick || !sprites.has(pick.s.userData.node)) { el.style.opacity = '0'; return; }
    // the callout and the hover tooltip already name this one — a floating label
    // for the same node printed the same sentence twice on screen
    if (pick.s === spot || pick.s === hover) { el.style.opacity = '0'; return; }
    const p = screenPos(pick.s);
    if (!p.front) { el.style.opacity = '0'; return; }
    const t = pick.s.userData.node.text;
    el.textContent = t.length > 44 ? t.slice(0, 43) + '…' : t;
    const right = p.x > innerWidth - 260;
    el.style.left = ''; el.style.right = '';
    if (right) { el.style.right = (innerWidth - p.x + 18) + 'px'; }
    else el.style.left = (p.x + 18) + 'px';
    el.style.top = p.y + 'px';
    el.style.opacity = '0.92';
  });
}

/* ── frame loop ── */
const nqEl = document.getElementById('nq');
let known = 0, lastOpen = null, shown = -1;
const clock = new THREE.Clock();
window.__ENGINE = { ema: 16.7, fps: () => +(1000 / window.__ENGINE.ema).toFixed(1),
  bg: () => ({ inScene: scene.children.includes(backdrop), visible: backdrop.visible,
               order: backdrop.renderOrder, culled: backdrop.frustumCulled,
               prog: !!backdropMat.program, t: backdropMat.uniforms.uTime.value,
               res: backdropMat.uniforms.uRes.value.toArray() }) };
let _lastT = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), dt = Math.min(clock.getDelta(), 0.05);
  if (_lastT) window.__ENGINE.ema = window.__ENGINE.ema * 0.9 + (now - _lastT) * 0.1;
  _lastT = now;

  // adopt new nodes from the data layer (posts, realtime, initial load)
  if (!MASSIVE && S.arr.length !== known) {
    for (let i = known; i < S.arr.length; i++) spriteFor(S.arr[i]);
    known = S.arr.length;
    rebuildTethers();
  } else if (MASSIVE && !massive && S.arr.length) { buildMassive(); known = S.arr.length; }
  if (shown !== S.arr.length) { shown = S.arr.length; nqEl.textContent = shown.toLocaleString('en-US'); }

  // deep links / sheet opens fly the camera
  if (S.openId !== lastOpen) { lastOpen = S.openId; if (lastOpen != null) flyToNode(lastOpen); }

  if (intro.active) {
    if (!intro.t0) intro.t0 = now + 250;
    const k = Math.min(1, Math.max(0, (now - intro.t0) / intro.dur));
    const e = 1 - Math.pow(1 - k, 3);
    yaw = home.yaw - 2.2 * (1 - e);
    pitch = 0.35 + (home.pitch - 0.35) * e;
    zoom = 0.55 + 0.45 * e;
    if (k >= 1) finishIntro();
  } else if (!dragging) {
    vyaw *= 0.94; vpitch *= 0.94; yaw += vyaw; pitch = THREE.MathUtils.clamp(pitch + vpitch, -1.3, 1.3);
    if (flyTo) {
      yaw += Math.atan2(Math.sin(flyTo.yaw - yaw), Math.cos(flyTo.yaw - yaw)) * 0.09;
      pitch += (flyTo.pitch - pitch) * 0.09;
      if (now - flyTo.t0 > flyTo.dur) flyTo = null;
    } else if (IS_DEMO) yaw += 0.0012;
    else if (now - lastInteract > 6000 && !REDUCED) yaw += 0.00035;   // idle drift
  }
  if (!intro.active) zoom += (zoomT - zoom) * 0.12;

  pitchG.rotation.x = pitch; yawG.rotation.y = yaw;
  atmo.rotation.copy(pitchG.rotation);                     // rim stays camera-true
  camera.position.set(0, 0, distFor(zoom));
  camera.lookAt(0, lookY(), 0);

  // stars parallax: trail the drag at different depths
  starsFar.rotation.y = yaw * 0.06; starsFar.rotation.x = pitch * 0.06;
  starsNear.rotation.y = yaw * 0.11; starsNear.rotation.x = pitch * 0.11;

  // node life: gentle float + grow-in + reply-size + filter dim + spot pulse
  if (!MASSIVE) {
    let ti = 0;
    const tpos = tetherLine && tetherLine.geometry.attributes.position;
    for (const [n, sp] of sprites) {
      const base = nodeScale(n);
      const grow = Math.min(1, (now - sp.userData.born) / 650);
      const dim = S.filter && S.filter !== n.cat;
      // Perpetual idle motion — breathing, bobbing, the spot throb — is the whole
      // reason this reads as alive, and the exact thing a vestibular disorder can't
      // tolerate. Under prefers-reduced-motion the nodes hold still at their true
      // size and position; grow-in, hover, dim and filtering all still respond.
      const pulse = (spot === sp && !REDUCED) ? 1 + 0.22 * Math.sin(now * 0.004) : 1;
      const breathe = REDUCED ? 1 : 1 + 0.05 * Math.sin(now * 0.0012 + sp.userData.ph);
      sp.scale.setScalar(base * grow * pulse * breathe * (hover === sp ? 1.35 : 1) * (dim ? 0.55 : 1));
      sp.material.opacity += ((dim ? 0.12 : 1) - sp.material.opacity) * 0.15;
      // the float: each conversation bobs gently on its shell
      const r = ORBIT + (REDUCED ? 0 : BOB * Math.sin(now * 0.0009 + sp.userData.ph * 6) * grow);
      sp.position.copy(sp.userData.dir).multiplyScalar(r);
      // Every question here comes from one campus, so from orbit they are one
      // dot and nothing can be picked out. As you dive in, the cluster opens:
      // the extra separation only exists at the zoom where you are trying to
      // tell them apart, so the dots stay honest about place when you are far.
      if (clusterSpread > 0) {
        sp.position.addScaledVector(sp.userData.t1, sp.userData.jx * clusterSpread)
                   .addScaledVector(sp.userData.t2, sp.userData.jy * clusterSpread);
      }
      if (tpos) {
        tpos.array[ti * 6 + 3] = sp.position.x;
        tpos.array[ti * 6 + 4] = sp.position.y;
        tpos.array[ti * 6 + 5] = sp.position.z;
        ti++;
      }
    }
    if (tpos) tpos.needsUpdate = true;
  }

  // hover raycast (skip while dragging / massive)
  if (!dragging && !pinching && !MASSIVE && !intro.active) {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([...sprites.values()], false)
      .filter(h => frontDot(h.object) > 0.12 && (!S.filter || S.filter === h.object.userData.node.cat));
    hover = hits.length ? hits[0].object : null;
    cvs.style.cursor = hover ? 'pointer' : (dragging ? 'grabbing' : 'grab');
  }

  stepArcs(now);
  // The intro finishes on its own after ~5s, but the gate can still be up —
  // that is how the "you might have missed" card ended up sitting across the
  // hook question. Hold it off, and keep pushing the timer so it does not fire
  // the instant someone chooses.
  if (isGated()) { spot = null; spotNextAt = now + 4000; }
  else if (!intro.active) updateSpot(now);
  updateCallout();
  stepLabels();
  stepBadges();

  // the air: seconds for the sine paths, plus a light parallax off the drag
  backdropMat.uniforms.uTime.value = now * 0.001;
  backdropMat.uniforms.uPar.value.set(yaw * 0.014, pitch * 0.014);

  /* Adaptive quality. The backdrop runs noise and a derivative-AA grid over
     every pixel of a retina fullscreen quad, every frame — beautiful, and the
     first thing to cost frames on an integrated GPU or a phone. Rather than
     pick between "pretty" and "smooth" for everyone, measure and decide per
     device: drop the grid and the second noise octave when frames are being
     missed, restore them once there is headroom. Hysteresis so it cannot
     oscillate. */
  const fps = 1000 / window.__ENGINE.ema;
  if (qualityHold > 0) qualityHold--;
  else if (backdropMat.uniforms.uQuality.value > 0.5 && fps < 45) {
    backdropMat.uniforms.uQuality.value = 0; qualityHold = 240;
    // shed pixels too — cheaper than any shader change, and reversible
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.15));
    composer.setSize(innerWidth, innerHeight);
  } else if (backdropMat.uniforms.uQuality.value < 0.5 && fps > 57) {
    backdropMat.uniforms.uQuality.value = 1; qualityHold = 240;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    composer.setSize(innerWidth, innerHeight);
  }

  // how far the cluster is allowed to open, by how close the camera is
  clusterSpread = zoom <= 1.5 ? 0 : Math.min((zoom - 1.5) * 0.016, 0.055);

  composer.render(dt);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  backdropMat.uniforms.uRes.value.set(innerWidth, innerHeight);
});
renderer.setSize(innerWidth, innerHeight);
composer.setSize(innerWidth, innerHeight);
frame();
