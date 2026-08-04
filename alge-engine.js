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
const catLabel = APP.catLabel || (k => k);
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
/* NOTE: window.__3D is set at the BOTTOM of this module, not here. Setting it
   early meant any throw during the rest of init left both engines dead — the
   2D loop had stood down and this one never reached frame(). Until the flag
   flips, the 2D canvas keeps painting on top and nothing is lost. */
const oldCanvas = document.getElementById('c');
renderer.domElement.id = 'c3d';
/* the 2D canvas carried the app's only screen-reader description and keyboard
   hints — hiding it removed them for every WebGL visitor. Carry them over. */
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label',
  document.getElementById('c')?.getAttribute('aria-label') ||
  'A globe of live conversations. Use the arrow keys to spin it, plus and minus to zoom.');
renderer.domElement.tabIndex = 0;
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

      /* Their weather is ONE body of cloud you are inside of, not four blobs
         you can count. Bigger radii so the banks overlap into a single
         atmosphere, and half the drift speed — nothing on that page is in a
         hurry, and that unhurriedness is most of why it reads as expensive. */
      vec3 mist = vec3(0.0);
      mist += vec3(0.729, 0.800, 0.855) * bank(p, vec2(0.18 + sin(t * 0.011) * 0.09,
                                                       0.28 + cos(t * 0.008) * 0.05), 0.68, asp) * 0.082;
      mist += vec3(0.729, 0.800, 0.855) * bank(p, vec2(0.74 + sin(t * 0.015 + 2.1) * 0.12,
                                                       0.76 + sin(t * 0.010 + 0.7) * 0.07), 0.74, asp) * 0.070;
      mist += vec3(0.863, 0.910, 0.949) * bank(p, vec2(0.92 + sin(t * 0.009 + 1.3) * 0.07,
                                                       0.22 + cos(t * 0.013) * 0.06), 0.58, asp) * 0.058;
      mist += vec3(0.863, 0.910, 0.949) * bank(p, vec2(0.46 + sin(t * 0.006 + 4.2) * 0.11,
                                                       0.58 + cos(t * 0.011 + 1.1) * 0.06), 0.62, asp) * 0.052;

      /* Two octaves, but the base one much larger: fog should have weather in
         it — slow masses that move — before it has grain. */
      float fogN = vnoise(p * asp * 1.7 + vec2(t * 0.010, -t * 0.006)) * 0.70;
      if (uQuality > 0.5)
        fogN += vnoise(p * asp * 6.0 - vec2(t * 0.008, t * 0.005)) * 0.30;
      else fogN *= 1.30;                       // keep the fog's weight without the octave
      col += mist * (0.62 + 0.76 * fogN);

      /* The grid was the least mont-fort thing here. Their hero has none at
         all — it is weather and a mountain and nothing else; the blueprint
         belongs to sections further down their page. A regular technical
         lattice across the whole frame is what made this read as a dashboard
         instead of air, so it survives only as a suggestion at the far
         corners: a quarter of its old weight, and held out past the middle
         two-thirds of the screen, which is now clean atmosphere. */
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
      float ring = smoothstep(0.46, 0.92, length((uv - 0.5) * asp));
      col += vec3(0.28, 0.36, 0.44) * grid      * 0.013 * ring;
      col += vec3(0.42, 0.58, 0.72) * crossMark * 0.022 * ring;
      col += vec3(0.30, 0.60, 0.85) * dots * lit * 0.045 * ring;
      }

      /* Deeper falloff: on their page the frame does not end, it dissolves. */
      float v = smoothstep(1.35, 0.22, length((uv - 0.5) * asp) * 1.30);
      col *= mix(0.34, 1.0, v);

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

/* ── real sky: where the sun and moon actually are, right now ───────────────
   The sun used to be a fixed art direction — a pleasing angle, chosen once.
   It is a place instead now. The subsolar point is computed from UTC, so if
   it is morning in Mandi then Mandi is in morning light, and the terminator
   crossing the globe is the real one. Nothing to configure and nothing to
   animate: the clock does it.

   These live in the globe's own rotating frame, not the world's, because a
   drag here means "walk around the Earth", not "spin the Earth under a fixed
   lamp". Keeping sun, moon and geography in one frame is what stops India
   drifting into night because someone turned the view. */
const SUN = new THREE.Vector3(-0.85, 0.30, 0.42).normalize();   // world-space, refreshed every frame
const sunLocal = new THREE.Vector3(), moonLocal = new THREE.Vector3();
let moonPhase = 0.5, skyStampedAt = -1e9;

function subsolarPoint(dt) {
  const yStart = Date.UTC(dt.getUTCFullYear(), 0, 0);
  const doy = (Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) - yStart) / 86400000;
  // axial tilt gives the season; the equation of time is small but it is the
  // difference between "about right" and actually right, and it costs nothing
  const decl = -23.44 * Math.cos((2 * Math.PI / 365.24) * (doy + 10));
  const B = (2 * Math.PI / 364) * (doy - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // minutes
  const utcH = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
  return { lat: decl, lon: -15 * (utcH - 12 + eot / 60) };
}

/* Low-precision lunar theory — a few degrees out, which no eye will catch at
   this size, and it means tonight's crescent leans the way the real one does. */
function moonEcliptic(dt) {
  const d = (dt.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const rad = Math.PI / 180;
  const L = (218.316 + 13.176396 * d) * rad;      // mean longitude
  const M = (134.963 + 13.064993 * d) * rad;      // mean anomaly
  const F = (93.272 + 13.229350 * d) * rad;       // argument of latitude
  return { lon: L + 6.289 * rad * Math.sin(M), lat: 5.128 * rad * Math.sin(F) };
}
function sunEclipticLon(dt) {
  const d = (dt.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const rad = Math.PI / 180;
  const g = (357.529 + 0.98560028 * d) * rad;
  return (280.459 + 0.98564736 * d) * rad + 1.915 * rad * Math.sin(g);
}

function refreshSky(force) {
  const now = Date.now();
  if (!force && now - skyStampedAt < 60000) return;   // the sky moves 0.25° a minute
  skyStampedAt = now;
  const dt = new Date(now);

  const ss = subsolarPoint(dt);
  sunLocal.copy(ll2v(ss.lat, ss.lon));

  /* The moon is placed by its elongation from the sun — the angle that
     actually decides which sliver is lit — swung about the pole so it rides
     roughly where the ecliptic runs rather than sitting in an arbitrary spot. */
  const me = moonEcliptic(dt), sl = sunEclipticLon(dt);
  let elong = me.lon - sl;
  elong = Math.atan2(Math.sin(elong), Math.cos(elong));          // wrap to ±π
  moonPhase = (1 - Math.cos(elong)) / 2;                         // 0 new, 1 full
  const axis = new THREE.Vector3(0, 1, 0);
  moonLocal.copy(sunLocal).applyAxisAngle(axis, elong)
           .applyAxisAngle(new THREE.Vector3(1, 0, 0), me.lat * 0.6).normalize();
}
refreshSky(true);
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
/* Safari gets the sharper Earth again. It was held back for one deploy while the
   black square was still unexplained; Ron confirmed it is gone with the dispose
   removed, so the dispose was the whole cause and the browser was never at
   fault. Every engine gets 4K. */
const saveData = navigator.connection && navigator.connection.saveData;
if (!saveData) {
  loader.load(TEXBASE + 'earth_atmos_4096.jpg', t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = MAXANISO;
    earthMat.uniforms.dayMap.value = t;
    // The old texture is deliberately NOT disposed. Disposing it the instant the
    // uniform is reassigned frees a GPU texture that the driver may still have
    // bound for a frame already in flight, and what you get back is a hard black
    // patch on the sphere — a screen-centred square with clean edges, sitting on
    // the Earth while everything around it renders correctly. It is one 2K
    // texture; leaking it costs a few MB and costs nobody a broken planet.
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

/* ── the two bodies ─────────────────────────────────────────────────────────
   Children of yawG so they hold station over the geography they belong to.
   Far out and depth-free: they are sky, and nothing in the scene should ever
   be found in front of them. */
function discTexture(paint) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  paint(cv.getContext('2d'));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const sunTex = discTexture(c => {
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.00, 'rgba(255,252,242,1)');
  g.addColorStop(0.16, 'rgba(255,246,214,0.96)');
  g.addColorStop(0.30, 'rgba(255,214,140,0.34)');
  g.addColorStop(0.60, 'rgba(255,186,110,0.09)');
  g.addColorStop(1.00, 'rgba(255,170,90,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
});
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: sunTex, transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
sunSprite.scale.setScalar(1.05); sunSprite.renderOrder = -0.5;
yawG.add(sunSprite);

/* The moon is redrawn when its phase moves — a terminator swept across a lit
   disc, so a crescent is a crescent and not a dimmed circle. */
let moonDrawnAt = -1;
const moonCanvas = document.createElement('canvas'); moonCanvas.width = moonCanvas.height = 256;
const moonTex = new THREE.CanvasTexture(moonCanvas); moonTex.colorSpace = THREE.SRGBColorSpace;
function paintMoon(phase) {
  const c = moonCanvas.getContext('2d');
  c.clearRect(0, 0, 256, 256);
  const R = 88, cx = 128, cy = 128;
  const halo = c.createRadialGradient(cx, cy, R * 0.8, cx, cy, 128);
  halo.addColorStop(0, 'rgba(214,226,240,0.20)'); halo.addColorStop(1, 'rgba(214,226,240,0)');
  c.fillStyle = halo; c.fillRect(0, 0, 256, 256);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip();
  c.fillStyle = 'rgba(150,166,186,0.16)'; c.fillRect(0, 0, 256, 256);   // earthshine
  // lit half, then the terminator ellipse carves the phase out of it
  c.fillStyle = '#EEF3FA';
  c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2); c.fill();
  const k = (phase - 0.5) * 2;                       // -1 waning … +1 waxing
  c.globalCompositeOperation = k < 0 ? 'destination-out' : 'source-over';
  c.fillStyle = k < 0 ? '#000' : '#EEF3FA';
  c.beginPath(); c.ellipse(cx, cy, R * Math.abs(k), R, 0, 0, 7); c.fill();
  c.globalCompositeOperation = 'source-over';
  c.restore();
  moonTex.needsUpdate = true;
}
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: moonTex, transparent: true, depthTest: false, depthWrite: false,
}));
moonSprite.scale.setScalar(0.52); moonSprite.renderOrder = -0.5;
yawG.add(moonSprite);

/* 26 put them permanently outside a 42° frustum: at 90° round the sky a body
   sits ~82° off-axis no matter how far you pull back, so they could never be
   seen. Brought in to 5.2, they stay off-frame at reading distance and swing
   into view as the camera retreats — which is the whole point of pulling back. */
const SKY_R = 5.2;
function placeSky() {
  refreshSky(false);
  sunSprite.position.copy(sunLocal).multiplyScalar(SKY_R);
  moonSprite.position.copy(moonLocal).multiplyScalar(SKY_R * 0.8);
  if (Math.abs(moonPhase - moonDrawnAt) > 0.01) { paintMoon(moonPhase); moonDrawnAt = moonPhase; }
  // the shader wants the sun in world space; the globe's rig supplies the rest
  SUN.copy(sunLocal).applyQuaternion(yawG.quaternion).applyQuaternion(pitchG.quaternion).normalize();
}
placeSky();

/* GL points with no map draw as SQUARES — on camera phones and at close zoom
   the ground markers and stars read as little boxes. One shared soft round
   texture fixes every Points material in the scene. */
const roundDot = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  const gr = c.createRadialGradient(16, 16, 0, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.65, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(16, 16, 15, 0, 7); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

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
    color: 0xdfeaf4, size, sizeAttenuation: true, map: roundDot, alphaTest: 0.05,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
}
const starsFar = starField(900, 0.055, 34), starsNear = starField(220, 0.1, 22);
scene.add(starsFar, starsNear);

/* Each category gets its own SHAPE, not just its own colour. Six coloured dots
   at the same size are six identical round blobs once bloom has had its way with
   them — and colour alone is the classic accessibility failure anyway, useless
   to anyone colour-blind and useless to everyone at small sizes. Form survives
   both. The white core stays circular throughout: that is the conversation
   itself, constant, and the ring around it is what kind of conversation it is. */
const SHAPE = {
  'ai & future':     'hex',
  'build & startup': 'square',
  'study & gyaan':   'triangle',
  'life':            'circle',
  'meet people':     'diamond',
  'random':          'ring',
};
function strokeShape(c, kind, cx, cy, rad) {
  c.beginPath();
  if (kind === 'circle' || kind === 'ring') { c.arc(cx, cy, rad, 0, 7); c.closePath(); c.stroke(); return; }
  const sides = kind === 'triangle' ? 3 : kind === 'square' ? 4 : kind === 'diamond' ? 4 : 6;
  const turn  = kind === 'diamond' ? 0 : kind === 'square' ? Math.PI / 4 : -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = turn + i * (Math.PI * 2 / sides);
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath(); c.stroke();
}

/* ── node sprites: white core + category glow, additive → real bloom ── */
function nodeTexture([r, g, b], kind) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  /* soft halo, not a searchlight — the glow used to fill the whole 128px tile
     and stacked clusters fused into one blob of light */
  let gr = c.createRadialGradient(64, 64, 0, 64, 64, 44);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
  gr.addColorStop(0.45, `rgba(${r},${g},${b},0.12)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  // White core = the conversation itself; coloured ring = which corner of life
  // it belongs to. The core used to be big enough that additive blending plus
  // bloom fused a cluster into one white blob, taking the colour — the only
  // thing telling two neighbours apart — with it. Smaller core, heavier ring:
  // the category survives being stacked.
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(64, 64, 6, 0, 7); c.fill();
  c.lineWidth = 9; c.strokeStyle = `rgb(${r},${g},${b})`;
  c.lineJoin = 'round';
  strokeShape(c, kind || 'circle', 64, 64, 20);
  // 'random' is the only one that reads as a plain dot, so it gets a second
  // outline to stay distinguishable from 'life' rather than being its twin
  if (kind === 'ring') { c.lineWidth = 3; c.beginPath(); c.arc(64, 64, 27, 0, 7); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const MATS = {};
/* Normal blending, not additive: additive is WHY a dense cluster became one
   white glare — every overlap summed toward the searchlight. Normal keeps
   each silhouette and its colour intact when stacked; bloom still lifts the
   bright cores. Category identity survives density now. */
for (const k in CATS) MATS[k] = new THREE.SpriteMaterial({
  map: nodeTexture(CATS[k].col, SHAPE[k]), transparent: true,
  depthWrite: false,
});

const ORBIT = 1.16, BOB = 0.011;   // float height + bob amplitude — 'conversations float on a shell above the surface'
const FREE_R = 1.44;               // the satellite shell — location-free conversations orbit here
const _orb = new THREE.Vector3();
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
    if (sp.userData.free) return;   // satellites are not anchored to any ground — zeros hide inside the Earth
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
    color: 0xffffff, size: 0.014, map: roundDot, alphaTest: 0.05,
    transparent: true, opacity: 0.8, depthWrite: false,
  }));
  yawG.add(surfDots);
}
const sprites = new Map();                       // node → sprite
const clusterN = new Map();                      // co-location bucket → arrivals so far
const hash = x => { x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
let nid = 0;
function spriteFor(n) {
  // the dot must point at the question's REAL place: use its lat/lon directly.
  // (the classic anchor blends in a category offset — that is a clustering trick
  //  for the 2D physics, not a location, and it put dots off their cities.)
  const q = !IS_DEMO && S.q.get(n.id);
  let d, free = null;
  if (q && q.lat != null && q.lon != null) d = ll2v(q.lat, q.lon);
  else if (!IS_DEMO) {
    /* No place — ON PURPOSE. These are the universal conversations: instead of
       squatting over one campus they orbit the world like satellites, slowly,
       each on its own tilted ring. They belong to everyone, and the motion
       says so before any caption does. */
    const axis = new THREE.Vector3(Math.sin(hash(nid * 5 + 3) * 1.2 - 0.6), 1,
                                   Math.sin(hash(nid * 5 + 9) * 1.2 - 0.6)).normalize();
    const ref = Math.abs(axis.y) < 0.94 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
    free = { e1, e2, ph: hash(nid * 5 + 4) * Math.PI * 2, sp: 0.7 + hash(nid * 5 + 7) * 0.6 };
    d = e1.clone().multiplyScalar(Math.cos(free.ph)).addScaledVector(e2, Math.sin(free.ph));
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
  /* Random jitter made a saturated place read as a splat — the same cohort's
     questions landed wherever the hash fell, overlapping in pairs while empty
     gaps sat next to them. Now co-located posts take a golden-angle rosette:
     first arrival on the true spot, the k-th at sqrt(k) radius, evenly wound.
     Same footprint, but the cluster opens into a sunflower instead of noise —
     and the layout is deterministic, so it survives reloads unchanged. */
  const key = Math.round(d.x * 150) + ',' + Math.round(d.y * 150) + ',' + Math.round(d.z * 150);
  const k = clusterN.get(key) || 0; clusterN.set(key, k + 1);
  const ang = k * 2.39996323, rr = k ? 0.17 * Math.sqrt(k) : 0;
  const jx = Math.cos(ang) * rr, jy = Math.sin(ang) * rr;
  d.addScaledVector(t1, jx * 0.009).addScaledVector(t2, jy * 0.009).normalize();
  // own material clone per sprite — 21 live nodes, and it buys per-node dimming
  const sp = new THREE.Sprite(MATS[CATS[n.cat] ? n.cat : 'random'].clone());
  sp.position.copy(d).multiplyScalar(free ? FREE_R : ORBIT);
  sp.userData.node = n; sp.userData.dir = d; sp.userData.ph = hash(i * 7 + 5) * Math.PI * 2;
  sp.userData.free = free; sp.userData.ck = k;
  // kept so the cluster can OPEN as you dive into it — see spreadFor() in the
  // frame loop. Honest and tight from orbit, separable once you are close.
  sp.userData.t1 = t1; sp.userData.t2 = t2; sp.userData.jx = jx; sp.userData.jy = jy;
  sp.userData.born = performance.now();
  // a genuinely new conversation (own post or live from someone else) makes
  // an entrance; everything loaded from history simply exists
  if (!IS_DEMO && n.incoming && performance.now() - n.born < 4000 && !REDUCED)
    sp.userData.arrive = { t0: performance.now(), dur: 1600 };
  nodeGroup.add(sp); sprites.set(n, sp);
  return sp;
}
function nodeScale(n) {
  const nr = IS_DEMO ? (n.nr || 0)
    : S.replies.has(n.id) ? S.replies.get(n.id).length : ((S.rcount && S.rcount.get(n.id)) || 0);
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
    map: roundDot, alphaTest: 0.05,
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

/* ── arcs: a person who is in both conversations ─────────────────────────────
   These used to pick a random node and a random node in the same topic. They
   were beautiful and they meant nothing — a thread of light asserting a
   relationship that did not exist, on a globe whose whole claim is that the
   dots are real. Now an arc is drawn only where the data has one: the
   conversation_links view pairs conversations that share a named person.

   If nobody has yet spoken in two places, nothing is drawn. An empty sky is
   the honest picture of a space where no threads have formed. */
const ARCS = []; let arcNextAt = 0, arcCursor = 0;
function spawnArc(now) {
  const links = (window.APP && window.APP.S && window.APP.S.links) || [];
  if (!links.length) return 'no links';
  const byId = new Map();
  for (const s of sprites.values()) byId.set(s.userData.node.id, s);
  if (!byId.size) return 'no sprites';
  /* walk the links in order rather than sampling: every real connection gets
     its turn, instead of the same lucky pair reappearing all evening */
  let a = null, b = null;
  for (let i = 0; i < links.length; i++) {
    const l = links[(arcCursor + i) % links.length];
    const sa = byId.get(l.a), sb = byId.get(l.b);
    if (sa && sb && sa !== sb) { a = sa; b = sb; arcCursor = (arcCursor + i + 1) % links.length; break; }
  }
  if (!a || !b) return 'no linked pair on screen';
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
/* Calmer than it was (0.38/0.55/0.78): bloom had become the subject. Higher
   threshold means only genuinely bright cores glow; the conversation, not the
   lighting, is the hero. */
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.4, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── camera + control state (same feel constants as the 2D engine) ── */
const home = faceAngles(homeDir);
let yaw = home.yaw - 2.2, pitch = 0.35, vyaw = 0, vpitch = 0;
let zoomT = 1, zoom = REDUCED ? 1 : 0.55;
let dragging = false, tapOk = false, lx = 0, ly = 0, lastInteract = 0, flyTo = null;
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
/* The far clamp was 1.2× the fitting distance — the Earth always filled the
   frame, so there was never any sky to put anything in. 4.6× lets you retreat
   until the planet is a marble and the sun and moon are simply there. */
const distFor = z => THREE.MathUtils.clamp(baseDist() / Math.pow(z, 0.85), 1.45, baseDist() * 4.6);
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
  } else { dragging = true; tapOk = ptrs.size === 1; lx = e.clientX; ly = e.clientY; flyTo = null; }
  lastInteract = performance.now();
  if (intro.active) finishIntro();
  if (window.dismissHint) window.dismissHint();
  try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
});
cvs.addEventListener('pointerup', e => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinching = false;
  if (ptrs.size === 1) {
    // pinch ended but a finger is still down: hand it the drag. Without this
    // the remaining finger was dead until lifted. It cannot tap, though — it
    // was part of a pinch, not a press.
    const rest = [...ptrs.values()][0];
    dragging = true; tapOk = false; lx = rest.x; ly = rest.y;
    return;
  }
  if (!dragging) return; dragging = false;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  if (!tapOk || Math.abs(dx) + Math.abs(dy) >= 6) return;
  if (isGated() || document.querySelector('.sheet.open')) return;
  // A tap opens what is under the finger NOW. The old code trusted `hover`,
  // which only pointermove refreshes — on touch that meant the first tap did
  // nothing and every later tap opened the PREVIOUS dot.
  const hit = pickAt(e.clientX, e.clientY);
  if (hit) window.openQ(hit.userData.node.id);
});
cvs.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinching = false; dragging = false; });
cvs.addEventListener('lostpointercapture', e => {
  // alt-tab, system gestures, context menus can eat the pointer without a
  // pointerup — without this the globe kept following a released mouse forever
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinching = false;
  if (!ptrs.size) dragging = false;
});
addEventListener('blur', () => { ptrs.clear(); pinching = false; dragging = false; });
cvs.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching && ptrs.size >= 2) {
    const a = [...ptrs.values()];
    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    if (pinchD0 > 0) zoomT = THREE.MathUtils.clamp(pinchZ0 * d / pinchD0, 0.18, 7);
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
  // end the intro BEFORE applying the zoom — finishIntro resets zoomT to 1,
  // so the old order silently ate the user's first scroll
  if (intro.active) finishIntro();
  zoomT = THREE.MathUtils.clamp(zoomT * Math.exp(-e.deltaY * 0.0016), 0.18, 7);
}, { passive: false });
/* the classic script's window-level pinch handler routes here while __3D is up */
window.__ZOOM3D = f => {
  if (intro.active) finishIntro();   // resets zoomT — must run before, not after
  zoomT = THREE.MathUtils.clamp(zoomT * f, 0.18, 7);
  lastInteract = performance.now();
};
const zin = document.getElementById('zin'), zout = document.getElementById('zout');
if (zin) zin.onclick = () => { zoomT = Math.min(7, zoomT * 1.45); lastInteract = performance.now(); };
if (zout) zout.onclick = () => { zoomT = Math.max(0.18, zoomT / 1.45); lastInteract = performance.now(); };
addEventListener('keydown', e => {
  if (document.querySelector('.sheet.open')) return;
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
  const st = 0.07;
  if (e.key === 'ArrowLeft') yaw -= st; else if (e.key === 'ArrowRight') yaw += st;
  else if (e.key === 'ArrowUp') pitch = Math.max(-1.3, pitch - st);
  else if (e.key === 'ArrowDown') pitch = Math.min(1.3, pitch + st);
  else if (e.key === '+' || e.key === '=') zoomT = Math.min(7, zoomT * 1.2);
  else if (e.key === '-' || e.key === '_') zoomT = Math.max(0.18, zoomT / 1.2);
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
const _pickNDC = new THREE.Vector2();
/* one picking path for taps and mouse hover — fresh matrices, same filter */
function pickAt(cx, cy) {
  if (MASSIVE) return null;
  _pickNDC.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(_pickNDC, camera);
  const hits = raycaster.intersectObjects([...sprites.values()], false)
    .filter(h => frontDot(h.object) > 0.12 && (!S.filter || S.filter === h.object.userData.node.cat));
  return hits.length ? hits[0].object : null;
}
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
    tipCat.style.color = `rgb(${r},${g},${b})`; tipCat.textContent = catLabel(n.cat);
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
  // stand down only once the rosette has genuinely opened — with the wider
  // spread curve, 0.006 meant the badge vanished while the dots still overlapped
  const expanded = clusterSpread > 0.1;
  if (MASSIVE || isGated() || document.body.classList.contains('sheeting') ||
      document.body.classList.contains('feeding') || expanded) {
    // fully retire them: an invisible button was still swallowing taps and
    // still sitting in the Tab order
    badgeEls.forEach(b => { b.style.opacity = '0'; b.style.pointerEvents = 'none'; b.style.visibility = 'hidden'; });
    return;
  }
  const groups = new Map();
  for (const [n, sp] of sprites) {
    if (S.filter && S.filter !== n.cat) continue;
    const k = placeKey(n);
    // the unplaced scatter is not a place — a centroid badge over it would
    // point at nowhere and open an arbitrary question
    if (k === 'unplaced') continue;
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
    if (!g) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; el.style.visibility = 'hidden'; return; }
    el.style.visibility = 'visible';
    // No number. A digit on a globe reads as a map pin — the wrong object for a
    // living world, and two of them collided the moment two places sat close
    // together. Size carries the same information without a label: a heavier
    // place is simply a bigger, brighter halo. The count still exists for screen
    // readers, where a number is genuinely the clearest thing to say.
    const size = Math.min(26 + g.n * 5, 62);
    el.style.width = el.style.height = size + 'px';
    el.setAttribute('aria-label', g.n + ' conversations here — open them');
    el.style.transform = `translate(${g.x / g.n}px,${g.y / g.n}px) translate(-50%,-50%)`;
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    el.onclick = () => { if (window.openQ) window.openQ(g.first.id); };
  });
}

/* ── place names: what marks the regions ───────────────────────────────────
   The globe is one photograph, ~1px per 10km, so diving in can only ever make
   it softer — no amount of tuning fixes that, and it is why the surface reads
   as "faded" up close. Type does not blur. As the camera comes down, the
   places nearest the middle of the view name themselves, so you always know
   what you are looking at, and a place holding conversations says how many.

   Deliberately not political borders: this is an Indian product and drawing
   contested lines would take a position the app has no business taking.
   Places are places. */
const CITY_LABELS = [];
const cityBox = document.createElement('div');
cityBox.id = 'places';
cityBox.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:8;';
document.body.appendChild(cityBox);
/* Fourteen was a wall of text — Ron's "over filled". A screen this size can
   carry a handful of names before they stop being orientation and start being
   noise, and a phone fewer still. */
const CITY_SLOTS = innerWidth < 640 ? 4 : innerWidth < 1100 ? 6 : 8;
for (let i = 0; i < CITY_SLOTS; i++) {
  const el = document.createElement('div'); el.className = 'plbl';
  cityBox.appendChild(el); CITY_LABELS.push(el);
}
const _cityDirs = [];      // built once from the same list the picker uses
function buildCityDirs() {
  const list = (window.APP && window.APP.CITIES) || [];
  if (_cityDirs.length || !list.length) return;
  for (const [name, la, lo] of list) _cityDirs.push({ name, v: ll2v(la, lo), la, lo });
}
const _cv2 = new THREE.Vector3();
let cityFrame = 0, cityPick = [];
function stepCityLabels() {
  if (MASSIVE) return;
  buildCityDirs();
  // far out, names would be a wall of text over an ocean — they belong to the dive
  const want = zoom > 2.2 && !isGated() && _cityDirs.length;
  if (!want) { CITY_LABELS.forEach(el => el.style.opacity = '0'); return; }
  if (++cityFrame % 12 === 1) {
    /* how much of the planet is on screen shrinks as you close in, so the
       number of names that can fit does too — pick by how central they are */
    const counts = new Map();
    if (window.APP && window.APP.S) {
      for (const [, q] of window.APP.S.q) {
        if (q.lat == null || q.lon == null) continue;
        const k = q.lat.toFixed(1) + ',' + q.lon.toFixed(1);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const cam = camera.position.clone().normalize();
    const near = [];
    for (const c of _cityDirs) {
      _cv2.copy(c.v).applyQuaternion(yawG.quaternion).applyQuaternion(pitchG.quaternion);
      const facing = _cv2.clone().normalize().dot(cam);
      // 0.55 reached almost to the horizon; names out there are decoration, and
      // with 3,000 towns loaded that is thousands of candidates fighting for slots
      if (facing < 0.86) continue;
      const n = counts.get(c.la.toFixed(1) + ',' + c.lo.toFixed(1)) || 0;
      near.push({ c, facing, n });
    }
    // conversations first, then whatever is most squarely in front of you.
    // Keep more candidates than there are slots so the collision pass below
    // has something to fall back to when a dense region eats the good spots.
    near.sort((a, b) => (b.n - a.n) || (b.facing - a.facing));
    cityPick = near.slice(0, 60);
  }
  /* Himachal alone put eight towns inside a thumbnail and printed them on top
     of one another. Names are only worth having if they can be read, so this
     is a greedy placement: best candidate first, and anything whose box would
     touch one already standing is simply not drawn. */
  const taken = [];
  const fade = Math.min(1, (zoom - 2.2) / 0.8);
  let slot = 0;
  for (const p of cityPick) {
    if (slot >= CITY_LABELS.length) break;
    _cv2.copy(p.c.v).multiplyScalar(1.002)
        .applyQuaternion(yawG.quaternion).applyQuaternion(pitchG.quaternion).project(camera);
    if (_cv2.z >= 1) continue;
    const x = (_cv2.x * 0.5 + 0.5) * innerWidth, y = (-_cv2.y * 0.5 + 0.5) * innerHeight;
    if (x < 8 || x > innerWidth - 8 || y < 8 || y > innerHeight - 8) continue;
    const w = p.c.name.length * 7.4 + 10, h = p.n ? 26 : 14;
    let hits = false;
    for (const t of taken) {
      if (Math.abs(x - t.x) < (w + t.w) / 2 && Math.abs(y - t.y) < (h + t.h) / 2 + 3) { hits = true; break; }
    }
    if (hits) continue;
    taken.push({ x, y, w, h });
    const el = CITY_LABELS[slot++];
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (el._nm !== p.c.name || el._n !== p.n) {
      el._nm = p.c.name; el._n = p.n;
      el.textContent = p.c.name;
      if (p.n) { const b = document.createElement('b');
        b.textContent = p.n + (p.n === 1 ? ' conversation' : ' conversations'); el.appendChild(b); }
    }
    el.classList.toggle('has', p.n > 0);
    el.style.opacity = String(fade * (p.n ? 0.95 : 0.6));
  }
  for (let i = slot; i < CITY_LABELS.length; i++) CITY_LABELS[i].style.opacity = '0';
}

const labelBox = document.getElementById('labels');
const labelEls = [];
for (let i = 0; i < 4; i++) {
  const el = document.createElement('div'); el.className = 'albl';
  labelBox.appendChild(el); labelEls.push(el);
}
let labelFrame = 0, labelPick = [], lastLabelId = null;
function stepLabels() {
  if (MASSIVE) return;
  // While the entry gate is up the only thing on screen is one real person's
  // question. Floating labels underneath it turned that into three competing
  // texts stacked on the same pixels.
  if (isGated()) { labelEls.forEach(el => el.style.opacity = '0'); return; }
  if (++labelFrame % 150 === 1) {
    /* ONE label, and it has to earn it: the most-answered conversation facing
       the camera. Everything else stays quiet until hovered or opened — the
       globe was starting to read as a page of captions, and a label you have
       to reach for is worth more than three you have to ignore. */
    const nr = s => { const id = s.userData.node.id;
      return IS_DEMO ? (s.userData.node.nr || 0)
        : S.replies.has(id) ? S.replies.get(id).length : ((S.rcount && S.rcount.get(id)) || 0); };
    /* This used to be sort-by-replies and take the first, which is not a
       choice at all — the single most-answered conversation on the globe won
       every draw, forever. Ron watched the same question hang over the planet
       all day. Being well-answered should improve the odds, not settle them:
       pick randomly among the ones facing you, weighted toward replies, and
       never repeat the one just shown. */
    const cand = [...sprites.values()]
      .filter(s => frontDot(s) > 0.35 && (!S.filter || S.filter === s.userData.node.cat))
      .filter(s => s.userData.node.id !== lastLabelId);
    let pick = null;
    if (cand.length) {
      const w = cand.map(s => 1 + Math.sqrt(nr(s)) * 1.4);
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      pick = cand[cand.length - 1];
      for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) { pick = cand[i]; break; } }
      lastLabelId = pick.userData.node.id;
    }
    labelPick = pick ? [{ s: pick, p: screenPos(pick) }] : [];
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
  tier: () => tier, setTier: n => setTier(n),   // so a session can be inspected honestly
  arcs: () => ARCS.length, spawnArc: () => spawnArc(performance.now()),
  bg: () => ({ inScene: scene.children.includes(backdrop), visible: backdrop.visible,
               order: backdrop.renderOrder, culled: backdrop.frustumCulled,
               prog: !!backdropMat.program, t: backdropMat.uniforms.uTime.value,
               res: backdropMat.uniforms.uRes.value.toArray() }) };
let _lastT = 0;
// returning to the tab restarts timing cleanly instead of measuring the gap
document.addEventListener('visibilitychange', () => { if (!document.hidden) _lastT = 0; });
let vsyncEst = 0, frameN = 0;   // best sustained fps seen — the display's real ceiling
let probeAt = 0, probeBackoff = 20000;   // when to next try climbing back up
/* one knob for quality: shader detail + render resolution together.
   EffectComposer caches its own pixel ratio — renderer.setPixelRatio alone
   changed NOTHING about the render targets, so the old "shed pixels" step
   saved zero GPU work. composer.setPixelRatio is the half that counts. */
const _dbs = new THREE.Vector2();
function syncRes() {
  renderer.getDrawingBufferSize(_dbs);
  backdropMat.uniforms.uRes.value.copy(_dbs);
}
/* Three tiers, and the Earth's sharpness is no longer hostage to the effects
   budget. Bloom is a BLUR — rendering it at a fraction of the screen is
   invisible and is the single largest saving available on a phone GPU, so it
   is small at every tier rather than something we trade away. What the tiers
   actually give up, in order: the backdrop's second noise octave and grid,
   then render scale. The planet is the last thing to soften, not the first. */
const TIERS = [
  { pr: 1.00, bloom: 0.35, backdrop: 0 },
  { pr: 1.25, bloom: 0.45, backdrop: 0 },
  { pr: 1.50, bloom: 0.50, backdrop: 1 },
];
let tier = 2;
function applyTier() {
  const t = TIERS[tier];
  backdropMat.uniforms.uQuality.value = t.backdrop;
  const pr = Math.min(devicePixelRatio || 1, t.pr);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  // composer.setSize just reset every pass to full size — put bloom back down
  bloom.setSize(Math.max(64, Math.round(innerWidth * t.bloom)),
                Math.max(64, Math.round(innerHeight * t.bloom)));
  syncRes();
}
function setTier(n) {
  n = Math.max(0, Math.min(TIERS.length - 1, n));
  if (n === tier) return;
  tier = n; applyTier();
}
/* A phone should not have to fail its way down from the desktop tier. The
   first seconds are when someone decides whether this is worth their time,
   and what thrashing the render targets looks like is a stutter. */
const COARSE = matchMedia('(pointer:coarse)').matches;
const MODEST = (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
               (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
tier = (COARSE || MODEST) ? 1 : 2;
/* ── context loss: the GPU can take the context away (sleep/wake, driver
   reset, backgrounding). preventDefault says "I want it back"; if it does not
   come back within 4s, hand the picture back to the 2D engine instead of
   rendering black forever. ── */
let contextLost = false, lostAt = 0, engineDead = false;
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault(); contextLost = true; lostAt = performance.now();
});
renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; });
function bailTo2D() {
  engineDead = true;
  try { renderer.dispose(); } catch (_) {}
  try { renderer.domElement.remove(); } catch (_) {}
  oldCanvas.style.display = 'block';
  window.__3D = false;
  if (window.__restart2D) window.__restart2D();
}

function frame() {
  if (engineDead) return;
  requestAnimationFrame(frame);
  if (contextLost) {
    if (performance.now() - lostAt > 4000) bailTo2D();
    return;
  }
  const now = performance.now(), dt = Math.min(clock.getDelta(), 0.05);
  // clamp the sample: one backgrounded minute used to inject 60000ms into the
  // EMA and trigger a bogus quality drop on the first frame back
  if (_lastT) window.__ENGINE.ema = window.__ENGINE.ema * 0.9 + Math.min(now - _lastT, 100) * 0.1;
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
  // the rig just moved, so the world-space sun has to be recomputed from it
  pitchG.updateMatrixWorld(); placeSky();
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
      // the float: each conversation bobs gently on its shell — and the
      // location-free ones ORBIT it, slow satellites that belong to everyone
      const F = sp.userData.free;
      let dirNow = sp.userData.dir, rBase = ORBIT;
      if (F) {
        const a = F.ph + (REDUCED ? 0 : now * 0.000018 * F.sp);
        _orb.copy(F.e1).multiplyScalar(Math.cos(a)).addScaledVector(F.e2, Math.sin(a));
        dirNow = _orb; rBase = FREE_R;
      }
      let r = rBase + (REDUCED || F ? 0 : BOB * Math.sin(now * 0.0009 + sp.userData.ph * 6) * grow);
      let extra = 1;
      /* ── arrival: a new conversation travels in from above, lands with a
         ripple, and its topic neighbours notice. Category stands in for the
         semantic graph for now — the user experience won't change when true
         similarity replaces it. Reduced-motion arrives in place. ── */
      const A = sp.userData.arrive;
      if (A) {
        const k = Math.min(1, (now - A.t0) / A.dur);
        const e = 1 - Math.pow(1 - k, 3);
        r = rBase * (2.4 - 1.4 * e);
        extra = 1 + (1 - e) * 1.4;                 // brighter while travelling
        if (k >= 1) {
          sp.userData.arrive = null;
          sp.userData.ripple = { t0: now };
          for (const [n2, sp2] of sprites)
            if (sp2 !== sp && n2.cat === n.cat && !sp2.userData.arrive)
              sp2.userData.react = { t0: now };
        }
      }
      const RIP = sp.userData.ripple;
      if (RIP) { const k = (now - RIP.t0) / 900;
        if (k >= 1) sp.userData.ripple = null; else extra *= 1 + 0.5 * Math.sin(Math.PI * k); }
      const RE = sp.userData.react;
      if (RE) { const k = (now - RE.t0) / 1100;
        if (k >= 1) sp.userData.react = null; else extra *= 1 + 0.16 * Math.sin(Math.PI * k); }
      // diving in used to blow every sprite up with the camera — a saturated
      // place became a wall of overlapping glows. Close up, the dots yield
      // some of that growth back so the opened rosette has air between rings.
      const zshrink = Math.max(0.5, Math.min(1, 1 / Math.sqrt(Math.max(zoom, 1))));
      sp.scale.setScalar(base * grow * pulse * breathe * extra * zshrink * (hover === sp ? 1.35 : 1) * (dim ? 0.55 : 1));
      // While a co-located stack is closed, everyone behind the first arrival
      // steps back: from orbit a saturated place is ONE clean dot plus the
      // count badge, not a pile of rings. They return as the rosette opens.
      const packed = sp.userData.ck ? Math.max(0, 1 - clusterSpread / 0.06) : 0;
      sp.material.opacity += ((dim ? 0.12 : 1) * (1 - 0.75 * packed) - sp.material.opacity) * 0.15;
      sp.position.copy(dirNow).multiplyScalar(r);
      // Every question here comes from one campus, so from orbit they are one
      // dot and nothing can be picked out. As you dive in, the cluster opens:
      // the extra separation only exists at the zoom where you are trying to
      // tell them apart, so the dots stay honest about place when you are far.
      if (clusterSpread > 0 && !F) {
        sp.position.addScaledVector(sp.userData.t1, sp.userData.jx * clusterSpread)
                   .addScaledVector(sp.userData.t2, sp.userData.jy * clusterSpread);
      }
      if (tpos) {
        if (!F) {          // satellites have no ground point — their tether stays degenerate at the core
          tpos.array[ti * 6 + 3] = sp.position.x;
          tpos.array[ti * 6 + 4] = sp.position.y;
          tpos.array[ti * 6 + 5] = sp.position.z;
        }
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
  }
  cvs.style.cursor = dragging ? 'grabbing' : (hover ? 'pointer' : 'grab');

  stepArcs(now);
  // The intro finishes on its own after ~5s, but the gate can still be up —
  // that is how the "you might have missed" card ended up sitting across the
  // hook question. Hold it off, and keep pushing the timer so it does not fire
  // the instant someone chooses.
  if (isGated()) { spot = null; spotNextAt = now + 4000; }
  else if (!intro.active) updateSpot(now);
  updateCallout();
  stepLabels();
  stepCityLabels();
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
  frameN++;
  if (fps > vsyncEst) vsyncEst = Math.min(fps, 165);
  /* thresholds are relative to the display's own ceiling — an absolute
     "restore above 57" latched quality at 0 forever on every 50Hz panel and
     every low-power 30fps cap. Warmup skips the noisy first seconds. */
  /* Never retune mid-gesture. Changing tier reallocates every render target,
     and doing that while a finger is still on the glass IS the stutter people
     reported "while zooming" — the zoom was not slow, it was being interrupted. */
  const calm = now - lastInteract > 400;
  if (qualityHold > 0) qualityHold--;
  else if (frameN > 120 && calm) {
    const floor = Math.min(45, vsyncEst * 0.72);
    if (fps < floor && tier > 0) {
      setTier(tier - 1); qualityHold = 180;
      probeAt = now + probeBackoff;
      probeBackoff = Math.min(probeBackoff * 2, 180000);
    } else if (tier < TIERS.length - 1 && now > probeAt && fps > floor * 1.25) {
      /* The old rule needed 57fps to climb back from a floor it hit at 43, so
         any phone that settled in between — most of them — was stuck degraded
         for the rest of the session. That is the "faded map" people reported.

         Climbing on a timer alone would only trade it for a stutter every few
         minutes on a phone that genuinely cannot hold the higher tier, so the
         attempt also needs real headroom at the CURRENT tier. A device sitting
         at 50fps stays where it belongs; one that has found room to breathe —
         a closed sheet, fewer dots on screen — goes back up and stays up. */
      setTier(tier + 1); qualityHold = 180;
      probeAt = now + probeBackoff;
    } else if (tier === TIERS.length - 1 && fps > floor * 1.25) {
      probeBackoff = 20000;            // comfortable at the top: forget the history
    }
  }

  // how far the cluster is allowed to open, by how close the camera is
  /* 0.055 was smaller than one sprite (~0.09 world units) — the cluster
     "opened" into the same fused blob. The spread has to clear several sprite
     widths before the rosette can actually read as a rosette. */
  clusterSpread = zoom <= 1.5 ? 0 : Math.min((zoom - 1.5) * 0.09, 0.32);

  composer.render(dt);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  // re-applies the current quality tier AND re-reads devicePixelRatio — a
  // window dragged between a retina and a 1x display keeps a correct buffer
  applyTier();
});
applyTier();
/* init survived end to end — only NOW does the 2D engine stand down */
window.__3D = true;
oldCanvas.style.display = 'none';
frame();
