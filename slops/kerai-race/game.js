// Kerai Coin Rush — ride every road of Kerai village (Samastipur, Bihar) collecting coins against the clock.
// World data: Google satellite + road map captured and traced offline (roads, building footprints, trees, places).
(function () {
'use strict';
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));


// ---------- World constants ----------
const WD = window.KERAI_WORLD;
const KX = WD.KX, KY = WD.KY;                      // metres per ground-image pixel (x, z)
const WW = WD.W * KX, WH = WD.H * KY;              // world size in metres
const LNG0 = 85.85249725219809, LAT0 = 25.764496721748174;
const toW = (mx, mz) => new THREE.Vector3(mx - WW / 2, 0, mz - WH / 2);          // data metres (from top-left) -> world
const llToW = (lat, lng) => toW((lng - LNG0) * 191302 * KX, (LAT0 - lat) * 212473 * KY);
const CELL = 5;

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const damp = (dt, rate) => 1 - Math.exp(-dt * rate);   // frame-rate independent smoothing factor
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };


// ---------- Renderer / scene ----------
THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.id = 'gl'; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6dde0, 80, 380);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 900);
// fill whatever screen or window we're in, and keep up when it changes (resize, rotate, full screen, zoom)
function fitScreen() {
  const w = Math.max(1, document.documentElement.clientWidth || innerWidth), h = Math.max(1, Math.round(window.visualViewport && window.visualViewport.scale === 1 ? window.visualViewport.height : innerHeight));
  document.documentElement.style.setProperty('--view-h', h + 'px');
  renderer.setPixelRatio(Math.min(devicePixelRatio, w * h > 1.6e6 ? 1 : 1.25));   // a Retina laptop would otherwise render 4× the pixels
  renderer.setSize(w, h); camera.aspect = w / h;
  let pov = false; try { pov = povMode; } catch (e) {}
  camera.fov = (pov ? 74 : 60) + (w / h < 1 ? 15 : 0);          // portrait phones: see a bit more of the road
  camera.updateProjectionMatrix();
}
addEventListener('resize', fitScreen); addEventListener('orientationchange', () => setTimeout(fitScreen, 200));
if (window.visualViewport) visualViewport.addEventListener('resize', fitScreen);
new ResizeObserver(fitScreen).observe(document.documentElement);
// hazy north-Indian sky, also used as the reflection map for standing water
const skyTex = (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#6f9fcf'); gr.addColorStop(0.38, '#a9c6de'); gr.addColorStop(0.5, '#dfe4e2'); gr.addColorStop(0.53, '#9a9a86'); gr.addColorStop(1, '#5a5444');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${rand(0.05, 0.18)})`; g.beginPath(); g.ellipse(rand(0, 1024), rand(60, 220), rand(40, 160), rand(8, 26), 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding; return t;
})();
scene.background = skyTex;
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromEquirectangular(skyTex).texture;
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x6b6150, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.6); sun.position.set(-120, 200, 80); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 50, far: 420 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
// shadow catcher over the photo ground (the photo itself is unlit)
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.ShadowMaterial({ opacity: 0.38 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.position.y = 0.06; shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);

// ---------- Materials & primitive helpers ----------
const matCache = {};
function M(color, rough = 0.85, metal = 0) {
  const k = color + rough + metal;
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
}
function TM(tex, rough = 0.9, color = '#ffffff') {
  const k = tex.uuid + color + rough;
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ map: tex, roughness: rough, color }));
}
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
function box(w, h, d, mat, x = 0, y = 0, z = 0) { return mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'string' ? M(mat) : mat, x, y, z); }
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) { return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof mat === 'string' ? M(mat) : mat, x, y, z); }
function sph(r, mat, x = 0, y = 0, z = 0) { return mesh(new THREE.SphereGeometry(r, 16, 12), typeof mat === 'string' ? M(mat) : mat, x, y, z); }
function caps(r, len, mat, x = 0, y = 0, z = 0) { return mesh(new THREE.CapsuleGeometry(r, len, 4, 10), typeof mat === 'string' ? M(mat) : mat, x, y, z); }
function lathe(profile, mat, y = 0, sz = 1, seg = 24) {
  if (profile[0][1] > profile[profile.length - 1][1]) profile = profile.slice().reverse();   // keep normals facing outward
  const m = mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), seg), mat, 0, y, 0);
  m.scale.z = sz; return m;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function speckle(g, w, h, n, cols, size) { for (let k = 0; k < n; k++) { g.fillStyle = pick(cols); g.fillRect(Math.random() * w, Math.random() * h, size * Math.random() + 1, size * Math.random() + 1); } }
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
function blob(w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.userData.blob = true; return m;
}
const FONT = '"Kohinoor Devanagari", "Devanagari Sangam MN", -apple-system, sans-serif';
function textSprite(text, opts = {}) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  const fs = opts.size || 48; g.font = `bold ${fs}px ${FONT}`;
  const lines = text.split('\n'); const w = Math.max(...lines.map(l => g.measureText(l).width)) + 40;
  c.width = w; c.height = lines.length * fs * 1.3 + 30;
  g.font = `bold ${fs}px ${FONT}`;
  g.fillStyle = opts.bg || 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, c.width, c.height);
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 8; g.strokeRect(4, 4, c.width - 8, c.height - 8); }
  g.fillStyle = opts.color || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, k) => g.fillText(l, c.width / 2, 15 + fs * 0.65 + k * fs * 1.3));
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }));
  const sc = opts.scale || 1; sp.scale.set(c.width / 100 * sc, c.height / 100 * sc, 1);
  return sp;
}

// ---------- Fabric & face textures (styled after the user's reference photos) ----------
const texCache = {};
function fabric(kind, base, accent = '#d4a017') {
  const key = kind + base + accent; if (texCache[key]) return texCache[key];
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (kind === 'check') {                                // gamchha / lungi plaid
      for (let k = 0; k < 256; k += 32) {
        g.fillStyle = accent; g.globalAlpha = 0.55; g.fillRect(k, 0, 10, h); g.fillRect(0, k, w, 10);
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.35; g.fillRect(k + 16, 0, 3, h); g.fillRect(0, k + 16, w, 3);
      }
      g.globalAlpha = 1;
    } else if (kind === 'print' || kind === 'border') {   // printed saree with bandhani dots and motifs
      g.globalAlpha = 0.9;
      for (let y = 8; y < h; y += 22) for (let x = (y / 22 % 2) * 11 + 6; x < w; x += 22) {
        g.fillStyle = accent; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.fill();
      }
      for (let k = 0; k < 14; k++) { g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; const x = rand(0, w), y = rand(0, h); g.beginPath(); g.ellipse(x, y, 9, 5, rand(0, 3), 0, 7); g.stroke(); }
      if (kind === 'border') {                              // zari border at the hem
        g.fillStyle = '#c9a227'; g.fillRect(0, h - 46, w, 30);
        g.fillStyle = 'rgba(120,70,0,0.6)'; for (let x = 0; x < w; x += 12) g.fillRect(x, h - 40, 6, 18);
        g.fillStyle = accent; g.fillRect(0, h - 16, w, 16);
      }
      g.globalAlpha = 1;
    } else if (kind === 'knit') {                          // ribbed police jumper
      for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 0, 2, h); }
    }
    speckle(g, w, h, 1800, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)'], 2);     // weave grain
    g.fillStyle = 'rgba(0,0,0,0.06)'; for (let x = 0; x < w; x += 18) g.fillRect(x + rand(-3, 3), 0, 4, h); // folds
  }, true);
  return (texCache[key] = t);
}
function faceTex(o) {
  const key = JSON.stringify(o); if (texCache[key]) return texCache[key];
  // equirectangular face map for a SphereGeometry: the face (+z) sits at u = 0.25
  const t = canvasTex(256, 128, (g) => {
    g.fillStyle = o.skin; g.fillRect(0, 0, 256, 128);
    const cx = 64;
    const sh = g.createRadialGradient(cx, 64, 10, cx, 64, 70); sh.addColorStop(0, 'rgba(255,220,190,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = sh; g.fillRect(0, 0, 256, 128);
    const grey = o.hair && o.hair !== '#151210';
    g.fillStyle = o.hair || '#151210'; g.fillRect(0, 0, 256, o.female ? 30 : 27);                      // hairline
    if (o.sindoor) { g.fillStyle = '#c0141c'; g.fillRect(cx - 1.5, 18, 3, 16); }
    for (const sx of [-1, 1]) {
      const ex = cx + sx * 13;
      g.fillStyle = grey ? '#8a8a8a' : '#1d1612'; g.fillRect(ex - 7, 47 - (o.female ? 1 : 0), 14, 2.6);   // eyebrow
      g.fillStyle = '#efe7da'; g.beginPath(); g.ellipse(ex, 56, 6, 3.2, 0, 0, 7); g.fill();               // eye white
      g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(ex, 56, 2.8, 0, 7); g.fill();                          // iris
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ex - 6.5, 52.3, 13, 1.4);                              // upper lid
      if (o.old) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(ex - 6, 61); g.lineTo(ex + 6, 61); g.stroke(); }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(cx - 2, 58, 3, 12);                                        // nose shadow
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(cx - 4, 71, 2, 1.2, 0, 0, 7); g.ellipse(cx + 4, 71, 2, 1.2, 0, 0, 7); g.fill();
    g.fillStyle = o.female ? '#8c3a3a' : '#5e3427'; g.beginPath(); g.ellipse(cx, 80, 8.5, 2.6, 0, 0, 7); g.fill();  // lips
    if (o.mustache) { g.fillStyle = grey ? '#9a9a96' : '#16110d'; g.beginPath(); g.ellipse(cx, 76, 11, 2.8, 0, 0, 7); g.fill(); }
    if (o.stubble) { for (let k = 0; k < 380; k++) { const a = rand(-1, 1), y = rand(74, 104); g.fillStyle = o.stubble; g.fillRect(cx + a * (24 - (y - 74) * 0.3), y, 1.4, 1.4); } }
    if (o.bindi) { g.fillStyle = '#9e0b1a'; g.beginPath(); g.arc(cx, 44, 2.6, 0, 7); g.fill(); }
    if (o.nosering) { g.strokeStyle = '#e0c060'; g.lineWidth = 1; g.beginPath(); g.arc(cx + 5, 72, 2, 0, 7); g.stroke(); }
  });
  return (texCache[key] = t);
}

// ---------- People (procedural, proportioned, with a walking skeleton) ----------
const SKIN = ['#8a5a3b', '#7a4b2e', '#9b6a48', '#6e4128', '#a87652', '#835235'];
const SAREE = [['#b0122b', '#e8c04a'], ['#0f8a4a', '#d81b60'], ['#d81b60', '#f6c343'], ['#e65100', '#2e7d32'], ['#6a1b9a', '#f6c343'], ['#00897b', '#ff80ab'], ['#1565c0', '#ffd54f'], ['#f9a825', '#c62828'], ['#ad1457', '#81d4fa']];
const PERSON_TYPES = [
  { t: 'schoolboy', w: 2, speed: 1.4, label: 'school kid' },
  { t: 'schoolgirl', w: 2, speed: 1.3, label: 'school girl' },
  { t: 'kid', w: 2, speed: 2.4, label: 'kid' },
  { t: 'woman', w: 4, speed: 1.0, label: 'woman' },
  { t: 'mother', w: 2, speed: 0.9, label: 'mother with infant' },
  { t: 'oldman', w: 2, speed: 0.55, label: 'elderly man' },
  { t: 'oldwoman', w: 2, speed: 0.5, label: 'elderly woman' },
  { t: 'farmer', w: 2, speed: 1.1, label: 'farmer' },
  { t: 'man', w: 3, speed: 1.2, label: 'man' },
];
function pickPersonType(nearSchool) {
  const list = PERSON_TYPES.map(p => ({ ...p, w: p.w * (nearSchool && p.t.startsWith('school') ? 3 : 1) }));
  let r = Math.random() * list.reduce((a, p) => a + p.w, 0);
  for (const p of list) { if ((r -= p.w) < 0) return p; }
  return list[0];
}
function makePersonProc(type, opt = {}) {
  const female = ['woman', 'mother', 'oldwoman', 'schoolgirl'].includes(type);
  const kid = ['schoolboy', 'schoolgirl', 'kid'].includes(type);
  const old = type === 'oldman' || type === 'oldwoman';
  const skin = opt.skin || pick(SKIN), skinM = M(skin, 0.62);
  const H = kid ? rand(1.05, 1.3) : female ? rand(1.5, 1.6) : rand(1.62, 1.74);
  const root = new THREE.Group(); const fig = new THREE.Group(); fig.scale.setScalar(H / 1.68); root.add(fig);
  const pelvis = new THREE.Group(); pelvis.position.y = 0.93; fig.add(pelvis);
  const spine = new THREE.Group(); pelvis.add(spine);
  const sar = pick(SAREE);
  let shirt = '#ffffff', shirtTex = null, pants = '#2b2b2b', lowerDress = null;
  const hairCol = old ? '#b9b6b0' : '#151210';
  if (type === 'police') { shirt = '#6f6a2e'; shirtTex = fabric('knit', '#5b5a2a'); pants = '#c8b48a'; }
  else if (type === 'man') { shirt = pick(['#efe3c4', '#f5f0e6', '#d9c7a1', '#cfd8dc']); pants = pick(['#e9e9e2', '#d7d2c4', '#3d3d3d']); }
  else if (type === 'oldman') { shirt = '#f4f2ec'; pants = '#f4f2ec'; lowerDress = 'dhoti'; }
  else if (type === 'farmer') { shirt = '#ece9e2'; lowerDress = 'lungi'; }
  else if (type === 'schoolboy') { shirt = '#f2f2f2'; pants = '#22305e'; }
  else if (type === 'schoolgirl') { shirt = '#f2f2f2'; pants = skin; lowerDress = 'skirt'; }
  else if (type === 'kid') { shirt = pick(['#e53935', '#43a047', '#fbc02d', '#1e88e5', '#fb8c00', '#8e24aa']); pants = pick(['#5d4037', '#37474f', '#1b5e20']); }
  else if (female) { lowerDress = 'saree'; shirt = old ? '#e9e4d8' : pick(['#4a148c', '#7f0000', '#004d40', '#e65100', '#3e2723', '#0d47a1']); }
  const sareeBase = old ? pick(['#f1eee6', '#e8e2d0', '#efe6c8']) : sar[0], sareeAcc = old ? '#9c8f6a' : sar[1];
  const upperM = shirtTex ? TM(shirtTex, 0.95) : M(shirt, 0.9);
  // torso (lathe profile = chest / waist / shoulder silhouette)
  const torsoProfile = female
    ? [[0.001, 0], [0.135, 0], [0.13, 0.12], [0.125, 0.22], [0.15, 0.33], [0.155, 0.4], [0.16, 0.45], [0.12, 0.5], [0.05, 0.52]]
    : [[0.001, 0], [0.145, 0], [0.15, 0.1], [0.15, 0.22], [0.165, 0.35], [0.185, 0.44], [0.17, 0.48], [0.11, 0.52], [0.05, 0.54]];
  const torso = lathe(torsoProfile, upperM, 0, 0.62); spine.add(torso);
  if (type === 'man' || type === 'oldman') spine.add(lathe([[0.001, -0.42], [0.2, -0.42], [0.18, -0.2], [0.155, 0], [0.15, 0.12], [0.001, 0.12]], upperM, 0, 0.66)); // kurta to the knee
  if (type === 'police') {
    spine.add(lathe([[0.001, 0.0], [0.155, 0.0], [0.157, 0.06], [0.001, 0.06]], M('#e6dcc0', 0.7), -0.02, 0.66));  // white canvas belt
    spine.add(box(0.06, 0.035, 0.01, M('#c9b26b', 0.4, 0.6), 0, 0.01, 0.105));                                    // buckle
  }
  // neck + head
  spine.add(cyl(0.045, 0.05, 0.1, skinM, 0, 0.56, 0));
  const head = new THREE.Group(); head.position.set(0, 0.69, 0.01); spine.add(head);
  const face = faceTex({ skin, female, old, hair: hairCol, mustache: !female && !kid, stubble: type === 'oldman' ? '#c9c6c0' : (type === 'farmer' ? 'rgba(20,15,10,0.6)' : null), bindi: female && !kid, sindoor: female && !kid && Math.random() < 0.7, nosering: female && !kid && Math.random() < 0.5 });
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 20), new THREE.MeshStandardMaterial({ map: face, roughness: 0.6 }));
  hm.scale.set(0.9, 1.14, 0.98); head.add(hm);
  head.add(sph(0.022, skinM, -0.09, 0.0, 0), sph(0.022, skinM, 0.09, 0.0, 0));                 // ears
  head.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), skinM, 0, -0.01, 0.095));                   // nose
  const hairM = M(hairCol, 0.75);
  const cap = mesh(new THREE.SphereGeometry(0.104, 24, 12, 0, Math.PI * 2, 0, Math.PI * (female ? 0.48 : 0.42)), hairM, 0, 0.012, -0.006); cap.scale.set(0.93, 1.15, 1.03); head.add(cap);
  if (female && !old && type !== 'schoolgirl') head.add(sph(0.05, hairM, 0, -0.03, -0.11));     // bun
  if (type === 'schoolgirl') { for (const sx of [-1, 1]) { head.add(caps(0.02, 0.22, hairM, sx * 0.07, -0.16, -0.06)); head.add(sph(0.022, M('#d32f2f'), sx * 0.07, -0.29, -0.06)); } }
  if (type === 'oldman') {                                                                       // white pagdi
    const tmat = M('#f7f5ef', 0.95);
    for (let k = 0; k < 4; k++) { const tr = mesh(new THREE.TorusGeometry(0.098 - k * 0.012, 0.03, 8, 20), tmat, 0, 0.06 + k * 0.03, -0.005); tr.rotation.x = Math.PI / 2 + 0.12; tr.scale.set(1, 1.08, 1); head.add(tr); }
    head.add(sph(0.075, tmat, 0, 0.14, -0.01));
  }
  if (type === 'police') { const b = mesh(new THREE.SphereGeometry(0.115, 20, 10), M('#1f3d26', 0.9)); b.scale.set(1.05, 0.38, 1.08); b.position.set(0.02, 0.085, 0); b.rotation.z = -0.18; head.add(b); }
  if (type === 'farmer') { const tmat = TM(fabric('check', '#c62828', '#f48fb1'), 0.95); for (let k = 0; k < 2; k++) { const tr = mesh(new THREE.TorusGeometry(0.095, 0.028, 8, 20), tmat, 0, 0.07 + k * 0.03, 0); tr.rotation.x = Math.PI / 2; head.add(tr); } }
  // arms (shoulder -> elbow -> hand)
  const arms = [], fore = [];
  const sleeveLong = type === 'police' || type === 'man' || type === 'oldman' || old;
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * (female ? 0.17 : 0.2), 0.47, 0); spine.add(sh);
    sh.add(caps(0.042, 0.22, sleeveLong || !female ? upperM : M(shirt, 0.9), 0, -0.14, 0));
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    el.add(caps(0.034, 0.2, sleeveLong ? upperM : skinM, 0, -0.12, 0));
    el.add(mesh(new THREE.SphereGeometry(0.038, 10, 8), skinM, 0, -0.26, 0.005));
    sh.rotation.z = sx * 0.07; arms.push(sh); fore.push(el);
  }
  // legs (hip -> knee -> foot)
  const thighs = [], knees = [];
  const legM = lowerDress === 'saree' || lowerDress === 'skirt' ? skinM : M(pants, 0.9);
  for (const sx of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(sx * 0.085, 0, 0); pelvis.add(hp);
    hp.add(caps(0.062, 0.32, legM, 0, -0.22, 0));
    const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
    kn.add(caps(0.048, 0.32, lowerDress === 'dhoti' || lowerDress === 'lungi' || lowerDress === 'skirt' ? skinM : legM, 0, -0.21, 0));
    kn.add(box(0.08, 0.05, 0.22, M(type === 'police' || type === 'schoolboy' ? '#111111' : pick(['#3e2723', '#5d4037', '#1b1b1b']), 0.5), 0, -0.44, 0.05)); // shoe / chappal
    thighs.push(hp); knees.push(kn);
  }
  pelvis.add(lathe([[0.001, -0.1], [0.15, -0.1], [0.155, 0.02], [0.001, 0.02]], legM, 0, 0.7));          // hips
  let skirt = null;
  if (lowerDress === 'saree') {
    skirt = lathe([[0.001, 0.06], [0.15, 0.06], [0.17, -0.2], [0.21, -0.55], [0.25, -0.88], [0.001, -0.88]], TM(fabric('border', sareeBase, sareeAcc), 0.9), 0, 0.85, 32);
    pelvis.add(skirt);
    const pal = TM(fabric('print', sareeBase, sareeAcc), 0.9);                                                 // pallu across the chest
    const p1 = box(0.17, 0.62, 0.012, pal, 0.0, 0.26, 0.1); p1.rotation.z = 0.62; spine.add(p1);
    const p2 = box(0.2, 0.75, 0.012, pal, -0.08, 0.12, -0.105); p2.rotation.z = -0.15; spine.add(p2);
    // ghunghat: the pallu covers the head, open at the face
    const hoodMat = new THREE.MeshStandardMaterial({ map: fabric('print', sareeBase, sareeAcc), side: THREE.DoubleSide, roughness: 0.9 });
    const hood = mesh(new THREE.SphereGeometry(0.128, 24, 14, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.62), hoodMat);
    hood.scale.set(0.95, 1.12, 1.04); hood.position.set(0, 0.69, 0.0); spine.add(hood);
    const drape = mesh(new THREE.CylinderGeometry(0.135, 0.2, 0.22, 20, 1, true, 0.95, Math.PI * 2 - 1.9), hoodMat);   // open at the front (+z)
    drape.position.set(0, 0.55, -0.01); spine.add(drape);
  } else if (lowerDress === 'dhoti') {
    skirt = lathe([[0.001, 0.04], [0.16, 0.04], [0.19, -0.3], [0.17, -0.62], [0.001, -0.62]], TM(fabric('plain', '#f6f4ee'), 0.95), 0, 0.85, 24); pelvis.add(skirt);
  } else if (lowerDress === 'lungi') {
    skirt = lathe([[0.001, 0.04], [0.16, 0.04], [0.18, -0.4], [0.18, -0.82], [0.001, -0.82]], TM(fabric('check', pick(['#1a5c8a', '#0b6b5a', '#4a2a7a']), '#ffffff'), 0.95), 0, 0.85, 24); pelvis.add(skirt);
  } else if (lowerDress === 'skirt') {
    skirt = lathe([[0.001, 0.04], [0.15, 0.04], [0.2, -0.38], [0.001, -0.38]], M('#22305e', 0.9), 0, 0.8, 24); pelvis.add(skirt);
  }
  // accessories
  if (type === 'man' || (type === 'oldman' && Math.random() < 0.6)) {                                       // checked gamchha over the shoulders
    const gm = TM(fabric('check', '#d6334e', '#ff9db0'), 0.95);
    const nk = mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), gm, 0, 0.5, 0.0); nk.rotation.x = Math.PI / 2 + 0.25; nk.scale.set(1, 0.75, 1); spine.add(nk);
    spine.add(box(0.09, 0.5, 0.015, gm, -0.08, 0.25, 0.1), box(0.09, 0.5, 0.015, gm, 0.08, 0.25, 0.1));
  }
  if (type === 'farmer') { const sp = cyl(0.016, 0.016, 1.3, M('#7b5a36'), 0.24, 0.5, 0.05, 6); sp.rotation.x = 1.1; spine.add(sp); spine.add(box(0.2, 0.14, 0.02, M('#8d8d8d', 0.4, 0.7), 0.24, 0.98, 0.58)); }
  if (type === 'schoolboy' || type === 'schoolgirl') spine.add(box(0.26, 0.32, 0.12, M(pick(['#c62828', '#1565c0', '#5d4037', '#6a1b9a'])), 0, 0.28, -0.16));
  if (type === 'oldman' || type === 'oldwoman' || type === 'police') {                                     // lathi / walking stick
    const held = cyl(0.014, 0.014, type === 'police' ? 1.45 : 1.15, M(type === 'police' ? '#1f3f8f' : '#6b4a2b', 0.6), 0, -0.24, 0.04, 6);
    fore[1].add(held);
  }
  if (type === 'woman' && Math.random() < 0.45) {                                                            // brass pot on the head
    const pot = new THREE.Group(); pot.position.set(0, 0.86, 0); spine.add(pot);
    pot.add(lathe([[0.001, 0], [0.08, 0.01], [0.13, 0.09], [0.11, 0.17], [0.05, 0.2], [0.055, 0.25], [0.001, 0.25]], M('#c9a227', 0.3, 0.9), 0, 1, 20));
    arms[1].rotation.z = 2.75; opt.armUp = true;
  }
  if (type === 'mother') {                                                                                   // infant held in the arms
    const baby = new THREE.Group(); baby.position.set(0, 0.24, 0.14); spine.add(baby);
    const wrap = caps(0.07, 0.2, TM(fabric('print', pick(['#fff59d', '#f8bbd0', '#b3e5fc']), '#ffffff')), 0, 0, 0); wrap.rotation.z = Math.PI / 2; baby.add(wrap);
    const bh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), new THREE.MeshStandardMaterial({ map: faceTex({ skin, female: false, hair: '#151210' }), roughness: 0.6 }));
    bh.position.set(0.15, 0.03, 0.01); bh.rotation.y = -0.9; baby.add(bh);
    arms[0].rotation.x = -0.9; fore[0].rotation.x = -0.9; arms[1].rotation.x = -0.9; fore[1].rotation.x = -0.9; opt.armsHold = true;
  }
  if (old) spine.rotation.x = 0.28;
  root.add(blob(0.9, 0.9));
  const P = { group: root, fig, pelvis, spine, torso, head, arms, fore, thighs, knees, skirt, opt, baseY: 0.93 };
  if (opt.sit) sitPose(P);
  return P;
}
function sitPose(P) {
  P.thighs.forEach(t => (t.rotation.x = -1.45)); P.knees.forEach(k => (k.rotation.x = 1.55));
  P.arms.forEach(a => (a.rotation.x = -1.05)); P.fore.forEach(f => (f.rotation.x = -0.45));
  P.spine.rotation.x = 0.3; if (P.skirt) P.skirt.rotation.x = -0.6;
  P.group.children.forEach(c => { if (c.userData.blob) c.visible = false; });
}
function walkPose(P, phase, moving, hurry = 1) {
  const a = moving ? Math.min(0.6, 0.42 * hurry) : 0, s = Math.sin(phase);
  P.thighs[0].rotation.x = -s * a; P.thighs[1].rotation.x = s * a;
  P.knees[0].rotation.x = moving ? Math.max(0, Math.sin(phase - 1.3)) * a * 1.7 : 0;
  P.knees[1].rotation.x = moving ? Math.max(0, Math.sin(phase + Math.PI - 1.3)) * a * 1.7 : 0;
  if (!P.opt.armsHold) {
    if (!P.opt.armUp) { P.arms[1].rotation.x = -s * a * 0.8; P.fore[1].rotation.x = -0.2 - Math.max(0, -s) * a * 0.5; }
    P.arms[0].rotation.x = s * a * 0.8; P.fore[0].rotation.x = -0.2 - Math.max(0, s) * a * 0.5;
  }
  P.pelvis.position.y = P.baseY + (moving ? Math.abs(Math.cos(phase)) * 0.025 : 0);
  if (P.skirt) P.skirt.rotation.z = moving ? s * 0.04 : 0;
}


// ---------- Realistic people: Microsoft Rocketbox avatars (MIT licence) with motion-captured animation ----------
// Skin re-toned to Indian complexions, the constable's jumper re-coloured olive; sarees, ghunghat, gamchha, beret,
// lathi, school bags, brass pots and infants are added on top and follow the skeleton.
const RB = { ok: false, tpl: {}, clips: {}, imgs: {}, tex: {} };
const RB_TYPES = {
  police: ['Male_Adult_14'], man: ['Male_Adult_02', 'Male_Adult_04', 'Male_Adult_02'], oldman: ['Male_Adult_15'], farmer: ['Gardener_Male_01'],
  woman: ['Female_Adult_11'], mother: ['Female_Adult_11'], oldwoman: ['Female_Adult_06'],
  schoolboy: ['Male_Child_01', 'Male_Child_02'], schoolgirl: ['Female_Child_02', 'Female_Child_01'], kid: ['Male_Child_02', 'Male_Child_01', 'Female_Child_02'],
};
function rbBuf(k) {
  const gz = !window.KERAI_PEOPLE[k] && window.KERAI_PEOPLE[k + '.gz'];          // the celebration clips are stored gzipped
  const b = atob((gz || window.KERAI_PEOPLE[k]).split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
  return gz ? fflate.gunzipSync(a).buffer : a.buffer;
}
function rbTex(k, srgb) {
  const key = k + srgb; if (RB.tex[key]) return RB.tex[key]; if (!RB.imgs[k]) return null;
  const t = new THREE.Texture(RB.imgs[k]); t.needsUpdate = true; t.encoding = srgb ? THREE.sRGBEncoding : THREE.LinearEncoding; t.anisotropy = 4;
  return (RB.tex[key] = t);
}
async function loadPeople() {
  const P = window.KERAI_PEOPLE; if (!P || !window.KERAI_NATIVE_PEOPLE) return;
  await Promise.all(Object.keys(P).filter(k => !k.endsWith('.fbx')).map(k => new Promise(res => { const i = new Image(); i.onload = res; i.onerror = res; i.src = P[k]; RB.imgs[k] = i; })));
  const L = new THREE.ObjectLoader();
  const warn = console.warn; console.warn = () => {};            // the FBX files reference .tga paths we replace below
  try {
    const names = [...new Set(Object.values(RB_TYPES).flat())];
    for (const n of names) {
      const json = window.KERAI_NATIVE_PEOPLE.models[n];
      const o = L.parse(json);
      o.traverse(m => { const t = json.originalTransforms[m.uuid]; m.position.fromArray(t[0]); m.quaternion.fromArray(t[1]); m.scale.fromArray(t[2]); m.updateMatrix(); });
      o.children.filter(c => c.isLight).forEach(c => o.remove(c));   // FBX files carry their own ambient light
      o.traverse(m => {
        if (!m.isMesh) return;
        m.frustumCulled = false;
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map(x => {
          const [pre, part] = x.name.split('_');
          if (part === 'opacity') return new THREE.MeshStandardMaterial({ map: rbTex(pre + '_opacity_color.png', true), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
          return new THREE.MeshStandardMaterial({ map: rbTex(`${pre}_${part}_color.jpg`, true), normalMap: rbTex(`${pre}_${part}_normal.jpg`, false), roughness: 0.78 });
        });
        m.material = mats.length === 1 ? mats[0] : mats;
      });
      o.updateMatrixWorld(true);
      let headY = 160; o.traverse(b => { if (b.name === 'Bip01_Head') headY = b.getWorldPosition(new THREE.Vector3()).y; });
      let prefix = 'Bip01'; o.traverse(b => { if (/^Bip0\d_Pelvis$/.test(b.name)) prefix = b.name.slice(0, 5); });
      if (prefix !== 'Bip01') o.traverse(b => { if (b.name === prefix + '_Head') headY = b.getWorldPosition(new THREE.Vector3()).y; });
      RB.tpl[n] = { obj: o, height: headY / 100 + 0.12, prefix, body: measureBody(o, prefix) };
    }
    const clip = (file, name) => {
      const a = THREE.AnimationClip.parse(window.KERAI_NATIVE_PEOPLE.clips[file]);
      const pos = a.tracks.find(t => t.name === 'Bip01.position'); let speed = 0;
      if (pos) {
        const v = pos.values, n = v.length; speed = Math.hypot(v[n - 3] - v[0], v[n - 1] - v[2]) / 100 / a.duration;
        for (let i = 0; i < n; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }             // walk on the spot; the game moves the person
      }
      a.tracks = a.tracks.filter(t => t.name.startsWith('Bip01') && !t.name.endsWith('.scale'));
      a.name = name; RB.clips[name] = { clip: a, speed: speed || 1 };
    };
    clip('m_walk_neutral_01', 'm_walk'); clip('m_walk_slow_01', 'm_slow'); clip('f_walk_neutral_01', 'f_walk'); clip('f_walk_slow_01', 'f_slow');
    clip('m_run_neutral', 'run'); try { clip('m_dancing_neutral', 'm_dance'); clip('f_dancing_neutral', 'f_dance'); clip('m_cheer_01', 'm_cheer'); clip('f_claphands_01', 'f_clap'); } catch (e) { console.warn('celebration clips', e); } clip('m_idle_neutral_01', 'm_idle'); clip('f_idle_neutral_01', 'f_idle'); clip('m_sit_chair_idle_neutral_01', 'sit');
    RB.ok = true;
  } catch (e) { console.error('Rocketbox load failed', e); }
  console.warn = warn;
}
// Saree upper body built on the measured torso: a wrap from the waist to under the bust, and the pallu —
// a curved band from the right hip across the chest, over the left shoulder and down the back.
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
// Lower saree: starts from the measured hip section and falls to the ankles with pleats gathered at the front.
function sareeSkirt(B, k, sar) {
  const hips = B.slices.filter(s => s.y > B.pelvis.y - 0.14 && s.y < B.pelvis.y + 0.06);
  const rx = Math.max(...hips.map(s => s.rx)) + 0.02, zf = Math.max(...hips.map(s => s.zf)) + 0.02, zb = Math.min(...hips.map(s => s.zb)) - 0.02, cz = (zf + zb) / 2;
  const yTop = B.pelvis.y + 0.08, yBot = 0.03, cols = 64, rows = 28, pos = [], uv = [], idx = [];
  const waist = B.slices.reduce((a, s) => (Math.abs(s.y - yTop) < Math.abs(a.y - yTop) ? s : a));
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = lerp(yTop, yBot, v);
    const tuck = Math.max(0, 1 - (yTop - y) / 0.16);                  // top 16 cm hugs the waist, then falls from the hips
    const flare = 0.006 + 0.1 * v * v - tuck * 0.03;
    for (let i = 0; i <= cols; i++) {
      const th = i / cols * Math.PI * 2, front = Math.max(0, Math.cos(th));
      const pleat = v * (0.012 + 0.02 * front ** 3) * Math.sin(th * 18);                // vertical pleats, deepest at the front
      const r = 1 + pleat / 0.2;
      const wrx = lerp(rx, waist.rx + 0.015, tuck), wzf = lerp(zf, waist.zf + 0.015, tuck), wzb = lerp(zb, waist.zb - 0.015, tuck), wcz = (wzf + wzb) / 2;
      const x = Math.sin(th) * (wrx + flare) * r, z = wcz + Math.cos(th) * ((Math.cos(th) >= 0 ? wzf - wcz : wcz - wzb) + flare) * r;
      pos.push(x * k, (y - B.pelvis.y) * k, (z - B.pelvis.z) * k); uv.push(i / cols * 3, 1 - v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: fabric('border', sar[0], sar[1]), side: THREE.DoubleSide, roughness: 0.9 }));
}
function sareeUpper(B, k, sar) {
  const S = B.slices, c = B.chest, grp = new THREE.Group();
  const sl = (y) => {                                   // interpolated torso section at height y (template metres)
    if (y <= S[0].y) return S[0]; if (y >= S[S.length - 1].y) return S[S.length - 1];
    for (let i = 1; i < S.length; i++) if (S[i].y >= y) { const a = S[i - 1], b = S[i], t = (y - a.y) / (b.y - a.y); return { y, rx: lerp(a.rx, b.rx, t), zf: lerp(a.zf, b.zf, t), zb: lerp(a.zb, b.zb, t) }; }
  };
  const surf = (th, y, off) => {                        // point on the body shell; th = 0 front, +pi/2 her left (+x)
    const s = sl(y), front = Math.cos(th) >= 0, cz = (s.zf + s.zb) / 2, rz = (front ? s.zf - cz : cz - s.zb);
    return new THREE.Vector3(Math.sin(th) * (s.rx + off), y, cz + Math.cos(th) * (rz + off)).sub(c).multiplyScalar(k);
  };
  const mat = new THREE.MeshStandardMaterial({ map: fabric('print', sar[0], sar[1]), side: THREE.DoubleSide, roughness: 0.9 });
  const build = (cols, rows, f) => {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const p = f(i / cols, j / rows); pos.push(p.x, p.y, p.z); uv.push(i / cols * 3, j / rows * 2); }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  const y0 = B.pelvis.y + 0.04, y1 = B.chest.y + 0.02;
  grp.add(build(40, 8, (u, v) => surf(u * Math.PI * 2, lerp(y0, y1, v), 0.012)));        // wrap around the waist and midriff
  // pallu path in (angle, height) around the body
  const yS = B.neck.y - 0.02;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.75, y0 + 0.02, 0), new THREE.Vector3(-0.2, y0 + 0.14, 0), new THREE.Vector3(0.45, B.chest.y + 0.06, 0),
    new THREE.Vector3(1.0, yS, 0), new THREE.Vector3(1.6, yS + 0.015, 0), new THREE.Vector3(2.35, yS - 0.12, 0), new THREE.Vector3(2.75, y0 - 0.02, 0)]);
  const W = 0.13;                                        // half-width of the pallu (template metres)
  grp.add(build(6, 48, (u, v) => {
    const p = path.getPoint(v), t = path.getTangent(v), s = sl(p.y), r = (s.rx + (s.zf - s.zb) / 2) / 2;
    const n = new THREE.Vector2(-t.y, t.x * r).normalize();  // across the band, in (arc length, height) space
    const w = (u - 0.5) * 2 * W;
    const over = Math.max(0, 1 - Math.abs(p.x - 1.3) / 0.45);  // lift over the top of the shoulder
    return surf(p.x + n.x * w / r, Math.min(p.y + n.y * w, yS + 0.04), 0.022 + over * 0.03);
  }));
  return grp;
}
// Gamchha draped around the neck and hanging down both sides of the chest, shaped on the measured torso
function gamchha(B, k) {
  const S = B.slices, c = B.chest;
  const front = (y) => { let best = S[0]; for (const sl of S) if (Math.abs(sl.y - y) < Math.abs(best.y - y)) best = sl; return best; };
  const mat = new THREE.MeshStandardMaterial({ map: fabric('check', '#d6334e', '#ff9db0'), side: THREE.DoubleSide, roughness: 0.95 });
  const g = new THREE.Group(), yN = B.neck.y - 0.01, yB = B.chest.y - 0.2;
  for (const sx of [-1, 1]) {
    const pos = [], uv = [], idx = [], rows = 14;
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      // from behind the neck, over the shoulder, then straight down the chest
      const y = t < 0.3 ? lerp(yN + 0.03, yN - 0.02, t / 0.3) : lerp(yN - 0.02, yB, (t - 0.3) / 0.7);
      const sl = front(y), ang = t < 0.3 ? lerp(Math.PI * 0.62, Math.PI * 0.2, t / 0.3) : lerp(Math.PI * 0.2, 0.17, Math.min(1, (t - 0.3) / 0.25));
      for (const e of [-1, 1]) {
        const a = ang + e * 0.26, rz = Math.cos(a) >= 0 ? sl.zf : -sl.zb;
        const x = sx * Math.sin(a) * (sl.rx * 0.82 + 0.02), z = (sl.zf + sl.zb) / 2 + Math.cos(a) * (Math.abs(rz - (sl.zf + sl.zb) / 2) + 0.022);
        pos.push(x - 0, (y - c.y), z - c.z); uv.push((e + 1) / 2, t * 3);
      }
      if (j) { const a = (j - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.map(v => v * k), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  }
  return g;
}
// Measure a model in its bind pose (metres, template scale): head top, eye line and torso slices
// {y, cx, cz, rx, zf, zb} so garments can be shaped around the actual body.
function measureBody(o, X) {
  o.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3();
  o.traverse(m => {
    if (!m.isSkinnedMesh) return;                         // one mesh holds body, head and hair materials
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).multiplyScalar(0.01); pts.push(v.x, v.y, v.z); }
  });
  const bw = n => { let b = null; o.traverse(x => { if (!b && x.name === X + n) b = x; }); return b ? b.getWorldPosition(new THREE.Vector3()).multiplyScalar(0.01) : null; };
  const head = bw('_Head'), pelvis = bw('_Pelvis'), neck = bw('_Neck') || head, chest = bw('_Spine2');
  let top = 0; for (let i = 1; i < pts.length; i += 3) if (Math.abs(pts[i - 1]) < 0.15) top = Math.max(top, pts[i]);
  const slices = [];
  for (let y = pelvis.y - 0.12; y <= neck.y + 0.02; y += 0.03) {
    const xs = [], zs = [];
    for (let i = 0; i < pts.length; i += 3) if (Math.abs(pts[i + 1] - y) < 0.018 && Math.abs(pts[i]) < 0.21) { xs.push(Math.abs(pts[i])); zs.push(pts[i + 2]); }
    if (xs.length < 8) continue;
    xs.sort((a, b) => a - b); zs.sort((a, b) => a - b);
    const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))];
    slices.push({ y, rx: q(xs, 0.97), zf: q(zs, 0.98), zb: q(zs, 0.02) });
  }
  return { top, head, pelvis, neck, chest, slices };
}
function rbClip(name, prefix) {          // children's rigs are named Bip02_*, adults Bip01_*
  const key = name + prefix; if (RB.clips[key]) return RB.clips[key].clip;
  const c = RB.clips[name].clip.clone(); c.tracks.forEach(t => { t.name = t.name.replace(/^Bip01/, prefix); });
  RB.clips[key] = { clip: c, speed: RB.clips[name].speed }; return c;
}
function findBone(o, n) { let x = null; o.traverse(b => { if (!x && b.name === n) x = b; }); return x; }
function makePerson(type, opt = {}) {
  if (!RB.ok || !RB_TYPES[type]) return makePersonProc(type, opt);
  const name = pick(RB_TYPES[type]), tpl = RB.tpl[name], female = name.startsWith('Female'), child = name.includes('Child');
  const old = type === 'oldman' || type === 'oldwoman';
  const target = child ? tpl.height * rand(0.92, 1.06) : female ? rand(1.5, 1.6) : rand(1.62, 1.74);
  const root = new THREE.Group(), fig = new THREE.Group(); root.add(fig);
  const body = THREE.SkeletonUtils.clone(tpl.obj); body.scale.setScalar(0.01 * target / tpl.height); fig.add(body);
  body.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const mixer = new THREE.AnimationMixer(body);
  const walkName = type === 'kid' ? 'run' : (female ? (old ? 'f_slow' : 'f_walk') : (old ? 'm_slow' : 'm_walk'));
  const X = tpl.prefix;
  const walk = mixer.clipAction(rbClip(walkName, X)), idle = mixer.clipAction(rbClip(female ? 'f_idle' : 'm_idle', X));
  const bones = { pelvis: findBone(body, X + '_Pelvis'), head: findBone(body, X + '_Head'), chest: findBone(body, X + '_Spine2'), rhand: findBone(body, X + '_R_Hand'), lua: findBone(body, X + '_L_UpperArm'), rua: findBone(body, X + '_R_UpperArm'), lfa: findBone(body, X + '_L_Forearm'), rfa: findBone(body, X + '_R_Forearm'), lhand: findBone(body, X + '_L_Hand'), rfing: findBone(body, X + '_R_Finger2') || findBone(body, X + '_R_Finger1') };
  const rFingers = []; body.traverse(b => { if (b.name.startsWith(X + '_R_Finger')) rFingers.push(b); });
  const k = 0.01 * target / tpl.height * 100, M_ = tpl.body;      // metres per template-metre
  const headTopOff = (M_.top - M_.head.y) * k;                     // head bone -> crown
  const P = { group: root, fig, body, mixer, walk, idle, walkSpeed: RB.clips[walkName].speed * target / 1.75, bones, att: [], rb: true, opt, moving: null,
    arms: [bones.lua || new THREE.Object3D(), bones.rua || new THREE.Object3D()] };
  body.updateMatrixWorld(true);
  const follow = (obj, bone, off, upright = false) => {
    fig.add(obj);
    const rel = bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(fig.getWorldQuaternion(new THREE.Quaternion()));
    P.att.push({ obj, bone, off, upright, rel });
  };
  // garments & props, styled after the user's reference photos
  if ((type === 'woman' || type === 'mother') && !child) {
    const sar = pick(SAREE), pr = TM(fabric('print', sar[0], sar[1]), 0.9);
    const hipY = 0.93 * target / 1.68;
    const skirt = sareeSkirt(M_, k, sar);
    follow(skirt, bones.pelvis, new THREE.Vector3(0, 0, 0), true); P.skirt = skirt;
    // her hair stays under the ghunghat
    body.traverse(m => { if (m.isMesh && Array.isArray(m.material)) m.material = m.material.map(x => (x.alphaTest ? HIDDEN : x)); });
    P.shortSteps = ['Thigh', 'Calf'].flatMap(b => ['_L_', '_R_'].map(sd => findBone(body, X + sd + b))).filter(Boolean).map(b => ({ b, q: b.quaternion.clone() }));
    const upper = sareeUpper(M_, k, sar);
    follow(upper, bones.chest, new THREE.Vector3(0, 0, 0));
    const hoodMat = new THREE.MeshStandardMaterial({ map: fabric('print', sar[0], sar[1]), side: THREE.DoubleSide, roughness: 0.9 });
    const hood = new THREE.Group();
    const h1 = mesh(new THREE.SphereGeometry(0.14, 24, 14, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 0, Math.PI * 0.6), hoodMat); h1.scale.set(1.0, 1.15, 1.12); hood.add(h1);
    const h2 = mesh(new THREE.CylinderGeometry(0.15, 0.26, 0.34, 24, 4, true, 1.0, Math.PI * 2 - 2.0), hoodMat, 0, -0.2, -0.02); hood.add(h2);
    follow(hood, bones.head, new THREE.Vector3(0, headTopOff - 0.115, -0.012));
    if (type === 'woman' && Math.random() < 0.4) { const pot = lathe([[0.001, 0], [0.08, 0.01], [0.13, 0.09], [0.11, 0.17], [0.05, 0.2], [0.055, 0.25], [0.001, 0.25]], M('#c9a227', 0.3, 0.9), 0, 1, 20); follow(pot, bones.head, new THREE.Vector3(0, headTopOff + 0.01, 0), true); P.pose = 'pot'; }
    if (type === 'mother') {
      const baby = new THREE.Group();
      const bw = caps(0.075, 0.22, TM(fabric('print', pick(['#fff59d', '#f8bbd0', '#b3e5fc']), '#ffffff')), 0, 0, 0); bw.rotation.z = Math.PI / 2; baby.add(bw);
      baby.add(mesh(new THREE.SphereGeometry(0.065, 20, 14), new THREE.MeshStandardMaterial({ map: faceTex({ skin: '#8a5a3b', hair: '#151210' }), roughness: 0.6 }), 0.17, 0.03, 0.02));
      follow(baby, bones.chest, new THREE.Vector3(0.0, -0.2, 0.2), true); P.pose = 'cradle';
    }
  }
  if (type === 'man' && name !== 'Male_Adult_04' && Math.random() < 0.7) follow(gamchha(M_, k), bones.chest, new THREE.Vector3(0, 0, 0));   // checked gamchha draped over the shoulders
  if (type === 'farmer') {
    const tm = TM(fabric('check', '#c62828', '#f48fb1'), 0.95), g = new THREE.Group();
    const dome = lathe([[0.001, -0.02], [0.118, -0.02], [0.122, 0.03], [0.112, 0.08], [0.08, 0.115], [0.001, 0.13]], tm, 0, 1.08, 24); g.add(dome);
    for (let k = 0; k < 3; k++) { const tr = mesh(new THREE.TorusGeometry(0.112 - k * 0.012, 0.024, 8, 24), tm, 0, -0.005 + k * 0.032, 0); tr.rotation.x = Math.PI / 2 + 0.08 * (k - 1); tr.scale.set(1, 1.08, 1); g.add(tr); }
    follow(g, bones.head, new THREE.Vector3(0, headTopOff - 0.075, -0.012));
  }
  if (type === 'police') {
    const b = mesh(new THREE.SphereGeometry(0.125, 20, 10), M('#1f3d26', 0.9)); b.scale.set(1.05, 0.36, 1.1); b.rotation.z = -0.2;
    follow(b, bones.head, new THREE.Vector3(0.01, headTopOff - 0.035, -0.008));
    if (!opt.sit) P.stick = { mesh: cyl(0.017, 0.017, 1, M('#1f3f8f', 0.5)), above: 0.28 };
  }
  if (type === 'oldman' && !opt.sit) P.stick = { mesh: cyl(0.016, 0.014, 1, M('#6b4a2b', 0.7)), above: 0.06 };
  if (type === 'schoolboy' || type === 'schoolgirl') follow(box(0.26, 0.32, 0.12, M(pick(['#c62828', '#1565c0', '#5d4037', '#6a1b9a']))), bones.chest, new THREE.Vector3(0, -0.06, -0.16));
  if (opt.sit) {
    mixer.clipAction(rbClip('sit', X)).play(); mixer.update(0.5); body.updateMatrixWorld(true);
    const pw = bones.pelvis.getWorldPosition(new THREE.Vector3()), rw = root.getWorldPosition(new THREE.Vector3());
    fig.position.set(-(pw.x - rw.x), 0.98 - (pw.y - rw.y), -(pw.z - rw.z));
    P.sitting = true;
  } else { idle.play(); P.moving = false; }
  if (P.stick) { fig.add(P.stick.mesh); P.rFingers = rFingers; P.pose = P.pose || 'stick'; }
  root.add(blob(0.9, 0.9));
  // compatibility with the vehicle builders
  P.head = new THREE.Group(); follow(P.head, bones.head, new THREE.Vector3(0, 0, 0));
  P.torso = null; P.headTopOff = headTopOff;
  updateAttachments(P);
  return P;
}
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _fq = new THREE.Quaternion(), _o = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion();
// rotate `bone` so the segment bone->child points along `dir` (given in the figure's frame)
function aimBone(P, bone, child, dir) {
  if (!bone || !child) return;
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize();
  P.fig.getWorldQuaternion(_qp); _d.copy(dir).normalize().applyQuaternion(_qp);
  _qa.setFromUnitVectors(_b, _d);
  bone.getWorldQuaternion(_qb); bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qa.multiply(_qb)));
  bone.updateMatrixWorld(true);
}
const _curl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.15);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function poseArms(P) {
  const B = P.bones; P.fig.updateMatrixWorld(true);
  if (P.pose === 'cradle') {             // both arms bent in front of the chest, infant lying across the forearms
    aimBone(P, B.lua, B.lfa, V(0.12, -0.8, 0.4)); aimBone(P, B.lfa, B.lhand, V(-0.85, 0.15, 0.45));
    aimBone(P, B.rua, B.rfa, V(-0.12, -0.8, 0.4)); aimBone(P, B.rfa, B.rhand, V(0.85, 0.1, 0.4));
  } else if (P.pose === 'pot') {         // right hand up, steadying the pot on the head
    aimBone(P, B.rua, B.rfa, V(-0.35, 0.85, 0.05)); aimBone(P, B.rfa, B.rhand, V(0.55, 0.8, 0.0));
  } else if (P.pose === 'stick' && P.stick) {
    for (const f of P.rFingers) f.quaternion.multiply(_curl);        // close the hand around the stick
    P.fig.updateMatrixWorld(true);
    const palm = B.rhand.getWorldPosition(new THREE.Vector3());
    if (B.rfing) palm.lerp(B.rfing.getWorldPosition(_a), 0.45);
    P.fig.worldToLocal(palm);
    const foot = V(palm.x * 0.8, 0, palm.z + 0.12);                  // planted on the ground just ahead of the hand
    const axis = _d.copy(palm).sub(foot); const len = axis.length() + P.stick.above; axis.normalize();
    const m = P.stick.mesh; m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), axis);
    m.position.copy(foot).addScaledVector(axis, len / 2);
  }
}
function updateAttachments(P) {
  P.fig.updateMatrixWorld(true); P.fig.getWorldQuaternion(_fq).invert();
  for (const a of P.att) {
    a.bone.getWorldPosition(_v); P.fig.worldToLocal(_v);
    if (a.upright) { a.obj.position.copy(_v).add(a.off); continue; }
    a.bone.getWorldQuaternion(_q).multiply(a.rel).premultiply(_fq);       // bone rotation expressed in the figure's frame
    a.obj.quaternion.copy(_q); a.obj.position.copy(_v).add(_o.copy(a.off).applyQuaternion(_q));
  }
}
function animatePerson(P, dt, moving, speed, hurry = 1, near = true) {
  if (!P.rb) { walkPose(P, P.phase, moving, hurry); return; }
  if (P.moving !== moving) {
    if (moving) { P.walk.reset().setEffectiveWeight(1).fadeIn(0.25).play(); P.idle.fadeOut(0.25); }
    else { P.idle.reset().setEffectiveWeight(1).fadeIn(0.3).play(); P.walk.fadeOut(0.3); }
    P.moving = moving;
  }
  P.walk.timeScale = clamp(speed * hurry / P.walkSpeed, 0.4, 2.2);
  if (!near) return;
  P.mixer.update(dt);
  if (P.shortSteps) for (const s of P.shortSteps) s.b.quaternion.slerp(s.q, 0.6);
  if (P.pose) poseArms(P);
  updateAttachments(P);
}

// ---------- Vehicles & animals ----------
function makeWheel(r, hubW = 0.09) {
  const g = new THREE.Group();
  const tire = mesh(new THREE.TorusGeometry(r - 0.045, 0.05, 10, 28), M('#151515', 0.8)); tire.rotation.y = Math.PI / 2; g.add(tire);
  const rim = mesh(new THREE.TorusGeometry(r - 0.09, 0.012, 6, 28), M('#c0c4c8', 0.25, 0.9)); rim.rotation.y = Math.PI / 2; g.add(rim);
  const hub = cyl(0.04, 0.04, hubW, M('#9ea3a8', 0.3, 0.8)); hub.rotation.z = Math.PI / 2; g.add(hub);
  for (let k = 0; k < 6; k++) { const sp = box(0.012, (r - 0.09) * 2, 0.012, M('#b7bcc0', 0.3, 0.8)); sp.rotation.x = k * Math.PI / 6; g.add(sp); }
  return g;
}
const RAKE = 0.42, WHEELBASE = 1.32;
function makeBike(color, riderType, opt = {}) {
  const g = new THREE.Group(); const b = new THREE.Group(); g.add(b);
  const paint = M(color, 0.35, 0.3), dark = M('#222222', 0.6), chrome = M('#d5d8dc', 0.2, 0.95), rubber = M('#151515', 0.85);
  const rw = makeWheel(0.33); rw.position.set(0, 0.33, -0.64); b.add(rw);
  // steering head: the fork, front wheel, handlebar and headlight turn about the raked steering axis
  const head = new THREE.Group(); head.position.set(0, 0.98, 0.5); head.rotation.x = -RAKE; b.add(head);
  const steer = new THREE.Group(); head.add(steer);
  const hub = new THREE.Vector3(0, 0.33 - 0.98, 0.68 - 0.5).applyAxisAngle(new THREE.Vector3(1, 0, 0), RAKE);   // front hub in the steering frame
  const fw = makeWheel(0.33); fw.position.copy(hub); steer.add(fw);
  for (const sx of [-0.075, 0.075]) { const f = cyl(0.02, 0.022, -hub.y + 0.05, chrome, sx, hub.y / 2 + 0.03, hub.z / 2); f.rotation.x = Math.atan2(hub.z, -hub.y) * -1; steer.add(f); }
  steer.add(box(0.13, 0.03, 0.44, paint, 0, hub.y + 0.36, hub.z));                         // front mudguard
  { const bar = cyl(0.013, 0.013, 0.7, chrome, 0, 0.1, -0.02); bar.rotation.z = Math.PI / 2; steer.add(bar); }   // handlebar
  const grips = [];
  for (const sx of [-1, 1]) { const gr = cyl(0.02, 0.02, 0.12, rubber, sx * 0.33, 0.1, -0.02); gr.rotation.z = Math.PI / 2; steer.add(gr); const gp = new THREE.Object3D(); gp.position.set(sx * 0.31, 0.11, -0.02); steer.add(gp); grips.push(gp);
    const mir = cyl(0.006, 0.006, 0.22, chrome, sx * 0.24, 0.2, -0.02); mir.rotation.z = -sx * 0.4; steer.add(mir); steer.add(mesh(new THREE.CircleGeometry(0.045, 14), chrome, sx * 0.29, 0.31, -0.02)); }
  const hl = cyl(0.08, 0.075, 0.1, chrome, 0, -0.05, 0.16); hl.rotation.x = Math.PI / 2; steer.add(hl);
  steer.add(mesh(new THREE.CircleGeometry(0.068, 18), new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#fff2c0', emissiveIntensity: 0.5 }), 0, -0.05, 0.212));
  steer.add(box(0.16, 0.08, 0.06, dark, 0, 0.06, 0.06));                                   // speedometer pod
  // frame & body
  const tank = mesh(new THREE.SphereGeometry(0.17, 24, 16), paint, 0, 0.86, 0.22); tank.scale.set(0.85, 0.62, 1.35); b.add(tank);
  b.add(box(0.21, 0.09, 0.56, dark, 0, 0.85, -0.25));                                       // seat
  b.add(box(0.22, 0.2, 0.3, paint, 0, 0.66, -0.18));                                       // side panel
  b.add(box(0.22, 0.24, 0.3, M('#3a3d40', 0.5, 0.5), 0, 0.42, 0.12));                     // engine
  for (let k = 0; k < 5; k++) b.add(box(0.27, 0.01, 0.22, M('#6b6f73', 0.4, 0.6), 0, 0.48 + k * 0.03, 0.12)); // cooling fins
  const ex = cyl(0.035, 0.04, 0.75, chrome, 0.15, 0.36, -0.25); ex.rotation.x = Math.PI / 2 - 0.08; b.add(ex);       // silencer
  const dt_ = cyl(0.03, 0.03, 0.62, M('#2a2a2a', 0.5), 0, 0.72, 0.3); dt_.rotation.x = 0.95; b.add(dt_);               // down tube
  b.add(box(0.05, 0.05, 0.75, dark, 0.1, 0.36, -0.3), box(0.05, 0.05, 0.75, dark, -0.1, 0.36, -0.3));                  // swing arm
  for (const sx of [-0.11, 0.11]) { const sh = cyl(0.022, 0.022, 0.42, chrome, sx, 0.58, -0.5); sh.rotation.x = 0.35; b.add(sh); }  // rear shocks
  b.add(box(0.14, 0.03, 0.45, paint, 0, 0.7, -0.66));                                                                  // rear mudguard
  b.add(box(0.16, 0.08, 0.02, M('#f2f2f2', 0.4), 0, 0.62, -0.88), box(0.1, 0.05, 0.03, M('#c62828', 0.3), 0, 0.72, -0.86)); // plate, tail light
  b.add(box(0.06, 0.02, 0.18, M('#444444', 0.5), 0.2, 0.3, 0.05), box(0.06, 0.02, 0.18, M('#444444', 0.5), -0.2, 0.3, 0.05)); // footpegs
  const rider = makePerson(riderType || 'man', { sit: true, skin: opt.skin });
  rider.group.position.set(0, -0.12, -0.2); rider.fig.scale.setScalar(1); b.add(rider.group);
  if (opt.shirt && rider.torso) rider.torso.material = M(opt.shirt, 0.9);
  const hy = rider.rb ? rider.headTopOff - 0.1 : 0.03;
  if (opt.helmet && rider.rb) rider.body.traverse(m => { if (m.isMesh && Array.isArray(m.material)) m.material = m.material.map(x => (x.alphaTest ? HIDDEN : x)); });
  if (opt.helmet) { const hm = mesh(new THREE.SphereGeometry(0.135, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M(opt.helmet, 0.3, 0.2), 0, hy, -0.01); hm.scale.set(0.95, 1.1, 1.08); rider.head.add(hm); rider.head.add(box(0.2, 0.06, 0.02, M('#222222', 0.1, 0.3), 0, hy - 0.03, 0.12)); updateAttachments(rider); }
  g.add(blob(1.0, 2.1));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  if (rider.rb && rider.bones.chest) {                                                   // lean forward over the tank like a real rider
    g.updateMatrixWorld(true);
    const sp1 = findBone(rider.body, rider.bones.chest.name.replace('Spine2', 'Spine'));
    for (const [bn, ang] of [[sp1, 0.22], [rider.bones.chest, 0.12]]) {
      if (!bn) continue;
      _qa.setFromAxisAngle(_ax.set(1, 0, 0).transformDirection(b.matrixWorld), ang);
      bn.getWorldQuaternion(_qb); bn.parent.getWorldQuaternion(_qp).invert();
      bn.quaternion.copy(_qp.multiply(_qa.multiply(_qb))); bn.updateMatrixWorld(true);
    }
    updateAttachments(rider);
  }
  const bk = { group: g, lean: b, rider, steer, grips, armL: rider.arms[0], armR: rider.arms[1], fw, rw, delta: 0, leanA: 0 };
  holdBars(bk);
  return bk;
}
// rider's hands follow the handlebar grips (two-bone arm IK)
const _s = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _pole = new THREE.Vector3(), _ax = new THREE.Vector3();
function aimWorld(bone, child, dirW) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize();
  _qa.setFromUnitVectors(_b, dirW.clone().normalize());
  bone.getWorldQuaternion(_qb); bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qa.multiply(_qb))); bone.updateMatrixWorld(true);
}
function holdBars(bk) {
  const R = bk.rider; if (!R.rb || !R.bones.lua) return;
  bk.group.updateMatrixWorld(true);
  const sides = [[R.bones.lua, R.bones.lfa, R.bones.lhand, bk.grips[1], 1], [R.bones.rua, R.bones.rfa, R.bones.rhand, bk.grips[0], -1]];
  for (const [ua, fa, hd, grip, sx] of sides) {
    if (!ua || !fa || !hd) continue;
    if (!ua.userData.len) { ua.userData.len = ua.getWorldPosition(_a).distanceTo(fa.getWorldPosition(_b)); fa.userData.len = fa.getWorldPosition(_a).distanceTo(hd.getWorldPosition(_b)); }
    const a = ua.userData.len, c = fa.userData.len;
    ua.getWorldPosition(_s); grip.getWorldPosition(_t);
    const d = Math.min(_s.distanceTo(_t), a + c - 0.005), dir = _t.clone().sub(_s).normalize();
    const along = (a * a - c * c + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - along * along));
    _pole.set(sx * 0.5, -1, -0.2).transformDirection(bk.lean.matrixWorld);               // elbows bend down and out
    _pole.addScaledVector(dir, -_pole.dot(dir)).normalize();
    _e.copy(_s).addScaledVector(dir, along).addScaledVector(_pole, h);
    aimWorld(ua, fa, _e.clone().sub(_s)); fa.getWorldPosition(_e); aimWorld(fa, hd, _t.clone().sub(_e));
  }
}
// visual steering: fork angle, lean into the turn, wheels spinning
function animateBike(bk, v, yawRate, dt, delta) {
  const d = delta !== undefined ? delta : Math.atan(yawRate * WHEELBASE / Math.max(Math.abs(v), 1.5));
  bk.delta += (clamp(d, -0.6, 0.6) - bk.delta) * damp(dt, 10);
  bk.steer.rotation.y = bk.delta + (bk.bend || 0);
  const leanT = clamp(Math.atan(v * yawRate / 9.81), -0.75, 0.75);                          // physically correct lean for the turn
  bk.leanA += (leanT - bk.leanA) * damp(dt, 5);
  bk.lean.rotation.z = -bk.leanA;
  bk.fw.rotation.x += v * dt / 0.33; bk.rw.rotation.x += v * dt / 0.33;
  holdBars(bk);
}
function makeTractor() {
  const g = new THREE.Group(); const p = M(pick(['#c62828', '#1565c0']), 0.45, 0.2);
  g.add(box(0.85, 0.7, 1.5, p, 0, 1.05, 1.05));
  g.add(box(0.95, 0.12, 0.3, M('#dddddd', 0.3, 0.6), 0, 1.0, 1.82));                              // grille
  g.add(box(1.2, 0.5, 0.9, p, 0, 1.0, -0.05));
  const rw1 = makeWheel(0.75, 0.4), rw2 = makeWheel(0.75, 0.4); rw1.position.set(-0.85, 0.75, -0.1); rw2.position.set(0.85, 0.75, -0.1); rw1.scale.x = rw2.scale.x = 3; g.add(rw1, rw2);
  const fw1 = makeWheel(0.42), fw2 = makeWheel(0.42); fw1.position.set(-0.55, 0.42, 1.45); fw2.position.set(0.55, 0.42, 1.45); fw1.scale.x = fw2.scale.x = 2; g.add(fw1, fw2);
  g.add(cyl(0.04, 0.04, 0.8, M('#333333', 0.4, 0.6), 0.3, 1.75, 1.3));
  const d = makePerson('farmer', { sit: true }); d.group.position.set(0, 0.55, -0.15); g.add(d.group);
  const tw1 = makeWheel(0.48), tw2 = makeWheel(0.48); tw1.position.set(-1.0, 0.48, -2.3); tw2.position.set(1.0, 0.48, -2.3);
  g.add(box(1.9, 0.6, 2.6, M('#5d7a3a', 0.8), 0, 1.0, -2.3), tw1, tw2);
  const load = mesh(new THREE.SphereGeometry(1, 16, 10), M('#cdb26a', 1), 0, 1.45, -2.3); load.scale.set(1.0, 0.55, 1.35); g.add(load);
  g.add(blob(2.6, 6));
  return { group: g, L: 6.0, W: 2.0, speed: 5, label: 'tractor', heat: 6 };
}
function makeAuto() {
  const g = new THREE.Group();
  g.add(box(1.3, 0.65, 2.3, M('#2e7d32', 0.45, 0.2), 0, 0.62, -0.1));
  const roof = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.9, 20, 1, false, 0, Math.PI), M('#f4d03f', 0.5), 0, 1.25, -0.2); roof.rotation.x = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.set(0.95, 1, 0.5); g.add(roof);
  g.add(box(1.25, 0.6, 0.04, new THREE.MeshStandardMaterial({ color: '#9fb7c9', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.5 }), 0, 1.2, 0.72));
  const w1 = makeWheel(0.24), w2 = makeWheel(0.24), w3 = makeWheel(0.24); w1.position.set(0, 0.24, 1.0); w2.position.set(-0.62, 0.24, -0.85); w3.position.set(0.62, 0.24, -0.85); g.add(w1, w2, w3);
  const d = makePerson('man', { sit: true }); d.group.position.set(0, 0.0, 0.35); d.fig.scale.setScalar(0.95); g.add(d.group);
  g.add(blob(1.8, 3));
  return { group: g, L: 2.6, W: 1.4, speed: 8, label: 'auto', heat: 6 };
}
function makeZebu(col, s = 1) {
  const g = new THREE.Group(); const m = M(col, 0.9);
  const body = caps(0.3 * s, 0.75 * s, m, 0, 1.0 * s, 0); body.rotation.x = Math.PI / 2; g.add(body);
  g.add(sph(0.2 * s, m, 0, 1.3 * s, 0.38 * s));                                                        // hump
  const neck = caps(0.13 * s, 0.25 * s, m, 0, 1.15 * s, 0.62 * s); neck.rotation.x = 1.0; g.add(neck);
  const hd = caps(0.11 * s, 0.22 * s, m, 0, 1.12 * s, 0.82 * s); hd.rotation.x = 1.9; g.add(hd);
  g.add(box(0.36 * s, 0.25 * s, 0.05 * s, m, 0, 0.75 * s, 0.4 * s));                                    // dewlap
  for (const sx of [-1, 1]) { const h = cyl(0.012 * s, 0.025 * s, 0.2 * s, M('#3e2723'), sx * 0.08 * s, 1.32 * s, 0.82 * s, 6); h.rotation.z = -sx * 0.6; g.add(h); }
  for (const lx of [-0.15, 0.15]) for (const lz of [-0.42, 0.42]) g.add(caps(0.05 * s, 0.6 * s, m, lx * s, 0.38 * s, lz * s));
  const tail = cyl(0.015 * s, 0.015 * s, 0.6 * s, m, 0, 0.8 * s, -0.7 * s, 5); tail.rotation.x = 0.2; g.add(tail);
  return g;
}
function makeCart() {
  const g = new THREE.Group();
  const o1 = makeZebu('#ece6da'); o1.position.set(-0.45, 0, 2.3); const o2 = makeZebu('#e6dccb'); o2.position.set(0.45, 0, 2.3); g.add(o1, o2);
  g.add(box(1.5, 0.12, 2.4, M('#7b5a3a'), 0, 1.05, -0.6), box(0.08, 0.08, 2.2, M('#6d4c41'), 0, 1.0, 1.1));
  const w1 = makeWheel(0.65), w2 = makeWheel(0.65); w1.position.set(-0.85, 0.65, -0.6); w2.position.set(0.85, 0.65, -0.6); g.add(w1, w2);
  const load = mesh(new THREE.SphereGeometry(1, 14, 10), M('#c8a24a', 1), 0, 1.5, -0.7); load.scale.set(0.75, 0.45, 1.05); g.add(load);
  const d = makePerson('farmer', { sit: true }); d.group.position.set(0, 0.35, 0.55); g.add(d.group);
  g.add(blob(2.2, 5.5));
  return { group: g, L: 5.5, W: 1.8, speed: 1.4, label: 'bullock cart', heat: 8 };
}
function makeCyclist() {
  const g = new THREE.Group();
  const w1 = makeWheel(0.34), w2 = makeWheel(0.34); w1.position.set(0, 0.34, 0.55); w2.position.set(0, 0.34, -0.55); g.add(w1, w2);
  const fr = M('#1b1b1b', 0.4, 0.5); g.add(box(0.03, 0.03, 0.9, fr, 0, 0.7, 0));
  const t2 = box(0.03, 0.6, 0.03, fr, 0, 0.55, -0.2); t2.rotation.x = 0.3; g.add(t2);
  const p = makePerson(pick(['man', 'schoolboy', 'farmer']), { sit: true }); p.group.position.set(0, 0.05, -0.25); g.add(p.group);
  g.add(blob(0.8, 1.8));
  return { group: g, L: 1.8, W: 0.7, speed: 4, label: 'cyclist', heat: 15, person: p };
}
function makeCow(kind) {
  const goat = kind === 'goat';
  const g = goat ? makeZebu(pick(['#262626', '#5d4037', '#efebe9']), 0.48) : makeZebu(pick(['#f2efe8', '#e8dfcf', '#9a7b5e', '#4e3b2e']));
  g.add(blob(goat ? 0.6 : 1.2, goat ? 1 : 2.2));
  return { group: g, L: goat ? 1.0 : 2.1, W: goat ? 0.4 : 0.8, speed: goat ? 0.5 : 0.3, label: goat ? 'goat' : 'cow', heat: goat ? 6 : 12, animal: true };
}
function makeJeep() {
  // Bihar Police SUV with two constables (uniform styled after the reference photo)
  const g = new THREE.Group();
  const white = M('#f1f3f4', 0.35, 0.3), glass = new THREE.MeshStandardMaterial({ color: '#203040', roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55 });
  g.add(box(1.8, 0.8, 4.0, white, 0, 0.85, 0), box(1.72, 0.7, 2.4, white, 0, 1.58, -0.45));
  g.add(box(1.74, 0.5, 2.3, glass, 0, 1.6, -0.45), box(1.6, 0.5, 0.05, glass, 0, 1.58, 0.77));
  const side = canvasTex(512, 64, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 512, 64); c.fillStyle = '#0d47a1'; c.fillRect(0, 0, 512, 14); c.fillStyle = '#c62828'; c.fillRect(0, 14, 512, 6); c.fillStyle = '#0d47a1'; c.font = `bold 34px ${FONT}`; c.textAlign = 'center'; c.fillText('BIHAR POLICE  बिहार पुलिस', 256, 52); });
  for (const sx of [-0.905, 0.905]) { const pl = mesh(new THREE.PlaneGeometry(3.8, 0.48), new THREE.MeshStandardMaterial({ map: side, roughness: 0.4 }), sx, 0.9, 0); pl.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(pl); }
  g.add(box(1.85, 0.25, 0.15, M('#2b2b2b', 0.6), 0, 0.55, 2.02));
  const red = box(0.6, 0.15, 0.28, M('#ff1744'), -0.35, 2.0, -0.2), blue = box(0.6, 0.15, 0.28, M('#2979ff'), 0.35, 2.0, -0.2); g.add(red, blue);
  for (const x of [-0.85, 0.85]) for (const z of [-1.3, 1.3]) { const w = makeWheel(0.4, 0.25); w.position.set(x, 0.4, z); w.scale.x = 2; g.add(w); }
  for (const sx of [-0.4, 0.4]) { const c = makePerson('police', { sit: true }); c.group.position.set(sx, 0.35, 0.1); g.add(c.group); }
  g.add(blob(2.4, 4.6));
  return { group: g, red, blue };
}

// ---------- Procedural surface textures ----------
const concreteTex = canvasTex(512, 1024, (g, w, h) => {
  // 5.2 m wide PCC village road, 10 m per tile, panel joints every ~3.3 m
  g.fillStyle = '#8f8b82'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 16000, ['rgba(90,88,84,0.25)', 'rgba(220,218,210,0.35)', 'rgba(140,135,125,0.3)', 'rgba(60,58,55,0.18)'], 2.5);
  for (let k = 0; k < 18; k++) { const x = rand(0, w), y = rand(0, h), gr = g.createRadialGradient(x, y, 2, x, y, rand(40, 130)); gr.addColorStop(0, `rgba(70,65,55,${rand(0.05, 0.16)})`); gr.addColorStop(1, 'rgba(70,65,55,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  g.fillStyle = 'rgba(55,50,45,0.16)'; for (const x of [150, 175, 335, 360]) for (let y = 0; y < h; y += 3) g.fillRect(x + Math.sin(y * 0.01) * 5, y, 18, 3);  // tyre wear
  g.strokeStyle = 'rgba(40,38,35,0.75)'; g.lineWidth = 3;
  for (const y of [0, 341, 682]) { g.beginPath(); g.moveTo(0, y + 1); g.lineTo(w, y + 1); g.stroke(); }                                 // expansion joints
  g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();                                                    // centre joint
  g.strokeStyle = 'rgba(45,42,38,0.55)'; g.lineWidth = 1.3;
  for (let k = 0; k < 10; k++) { let x = rand(20, w - 20), y = rand(0, h); g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += rand(-18, 18); y += rand(-22, 22); g.lineTo(x, y); } g.stroke(); }  // cracks
  for (const x0 of [0, w - 22]) { g.fillStyle = 'rgba(120,100,70,0.55)'; for (let y = 0; y < h; y += 6) g.fillRect(x0 + rand(0, 10), y, rand(8, 22), 6); } // broken dusty edges
}, true);
const shoulderTex = canvasTex(256, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(150,128,96,0)'); gr.addColorStop(0.15, 'rgba(150,128,96,0.95)'); gr.addColorStop(0.85, 'rgba(146,124,92,0.95)'); gr.addColorStop(1, 'rgba(150,128,96,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 4000, ['rgba(90,70,45,0.35)', 'rgba(220,205,175,0.35)', 'rgba(60,80,40,0.25)'], 3);
}, true);
const grainTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 7000, ['#d8d8d8', '#e6e6e6', '#c8c8c8', '#f2f2f2', '#bdbdbd'], 3);
}, true);
grainTex.encoding = THREE.LinearEncoding;
const rippleTex = (() => {               // normal map for wind ripples on standing water
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const d = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const nx = Math.sin(x / 128 * Math.PI * 6 + Math.sin(y / 20)) * 0.5, ny = Math.cos(y / 128 * Math.PI * 8 + Math.sin(x / 15)) * 0.5, o = (y * 128 + x) * 4;
    d.data[o] = 128 + nx * 60; d.data[o + 1] = 128 + ny * 60; d.data[o + 2] = 255; d.data[o + 3] = 255;
  }
  g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();

// facade textures: exposed brick, painted plaster, bare cement — 5 m wide × 3 m per storey
function facadeTex(kind, storeys, shop) {
  // 5 m wide × 3 m per storey, 512 px wide: weathered plaster / exposed brick, framed grilled windows, steel or wooden doors
  const W = 512, SH = 300, PAR = 36;
  return canvasTex(W, SH * storeys + PAR, (g, w, h) => {
    const bricks = (x0, y0, x1, y1, a = 1) => {
      g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
      g.fillStyle = `rgba(122,116,104,${a})`; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let y = y0, r = 0; y < y1; y += 12, r++) for (let x = x0 - (r % 2) * 17; x < x1; x += 34) {
        const t = rand(-22, 16); g.fillStyle = `rgba(${152 + t},${72 + t * 0.6},${50 + t * 0.4},${a})`; g.fillRect(x + 1.5, y + 1.5, 31, 9);
        if (Math.random() < 0.15) { g.fillStyle = `rgba(40,25,15,${0.25 * a})`; g.fillRect(x + 1.5, y + 7, 31, 3); }
      }
      g.restore();
    };
    if (kind === 'brick') bricks(0, 0, w, h);
    else {
      g.fillStyle = kind === 'cement' ? '#a8a49a' : '#efeae0'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 30; k++) { const x = rand(0, w), y = rand(0, h), r = rand(20, 90), gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, `rgba(${rand(70, 120)},${rand(70, 110)},${rand(50, 80)},${rand(0.05, 0.14)})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      speckle(g, w, h, 6000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.1)', 'rgba(110,90,60,0.08)'], 2.5);
      for (let k = 0; k < 3; k++) { const x = rand(0, w - 80), y = rand(h * 0.4, h - 60), pw = rand(40, 110), ph = rand(25, 60); bricks(x, y, x + pw, y + ph); g.strokeStyle = 'rgba(80,70,60,0.5)'; g.lineWidth = 2; g.strokeRect(x, y, pw, ph); }   // fallen plaster
    }
    // rain streaks and algae below the parapet and window shades
    for (let k = 0; k < 14; k++) { const x = rand(0, w), gr = g.createLinearGradient(0, 0, 0, rand(h * 0.3, h)); gr.addColorStop(0, 'rgba(40,45,35,0.32)'); gr.addColorStop(1, 'rgba(40,45,35,0)'); g.fillStyle = gr; g.fillRect(x, PAR, rand(3, 18), h); }
    const splash = g.createLinearGradient(0, h - 70, 0, h); splash.addColorStop(0, 'rgba(80,62,40,0)'); splash.addColorStop(1, 'rgba(80,62,40,0.55)'); g.fillStyle = splash; g.fillRect(0, h - 70, w, 70);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, PAR - 6, w, 6);                                                     // parapet coping shadow
    const paintCol = pick(['#2e6b4f', '#1f4f7a', '#2b2b2b', '#6b2f2f', '#3c6e8f']);
    const win = (x, y, ww, wh) => {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 10, y - 18, ww + 20, 10);                                         // chhajja (sunshade)
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x - 10, y - 8, ww + 20, 8);
      g.fillStyle = '#d8d2c4'; g.fillRect(x - 6, y - 6, ww + 12, wh + 12);                                              // frame
      g.fillStyle = '#20262a'; g.fillRect(x, y, ww, wh);
      const sh = g.createLinearGradient(x, y, x + ww, y + wh); sh.addColorStop(0, 'rgba(170,200,215,0.35)'); sh.addColorStop(1, 'rgba(60,80,90,0.1)'); g.fillStyle = sh; g.fillRect(x + 3, y + 3, ww / 2 - 4, wh - 6);
      g.fillStyle = paintCol; g.fillRect(x + ww / 2 - 2, y, 4, wh);                                                     // shutter split
      g.strokeStyle = paintCol; g.lineWidth = 4; for (let b = x + 9; b < x + ww; b += 13) { g.beginPath(); g.moveTo(b, y); g.lineTo(b, y + wh); g.stroke(); }   // grill
      g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + wh / 2); g.lineTo(x + ww, y + wh / 2); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 6, y + wh + 6, ww + 12, 4);                                       // sill shadow
    };
    for (let s = 0; s < storeys; s++) {
      const y0 = h - (s + 1) * SH;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, y0 + 2, w, 9);                                                     // slab band
      if (s === 0 && shop) {                                                                                             // rolling shutter
        g.fillStyle = '#2a2f33'; g.fillRect(48, y0 + 92, 416, 208);
        for (let y = y0 + 96; y < y0 + 300; y += 7) { const l = 120 + rand(-10, 10); g.fillStyle = `rgb(${l},${l + 4},${l + 8})`; g.fillRect(52, y, 408, 5); }
        for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(120,70,30,${rand(0.1, 0.3)})`; g.fillRect(rand(52, 420), y0 + rand(150, 280), rand(20, 60), rand(4, 30)); }   // rust
        g.fillStyle = pick(['#c62828', '#1565c0', '#2e7d32', '#ef6c00']); g.fillRect(48, y0 + 40, 416, 44);              // shop board
        g.fillStyle = '#fff'; g.font = `bold 26px ${FONT}`; g.textAlign = 'center'; g.fillText(pick(['किराना स्टोर', 'मोबाइल रिचार्ज', 'जनरल स्टोर', 'मेडिकल हॉल', 'हार्डवेयर', 'चाय-नाश्ता']), 256, y0 + 72);
        continue;
      }
      if (s === 0) {
        const doorC = pick(['#5b3b22', '#3e4a52', '#6d2b2b', '#2f4f3f', '#7a7f85']);
        g.fillStyle = '#cfc8b8'; g.fillRect(196, y0 + 108, 120, 192);                                                    // door frame
        g.fillStyle = doorC; g.fillRect(204, y0 + 116, 104, 184);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(255, y0 + 116, 2, 184);
        for (const yy of [140, 200, 260]) { g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(212, y0 + yy - 20, 36, 44); g.strokeRect(264, y0 + yy - 20, 36, 44); }
        g.fillStyle = '#c9a227'; g.fillRect(244, y0 + 205, 6, 14);                                                       // latch
        g.fillStyle = '#9e9e9e'; g.fillRect(340, y0 + 120, 34, 46); g.fillStyle = '#263238'; g.fillRect(345, y0 + 126, 24, 14);   // electricity meter
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(190, y0 + 294, 132, 6);                                             // step
        win(52, y0 + 120, 104, 100); win(388, y0 + 120, 104, 100);
      } else { win(52, y0 + 110, 104, 104); win(204, y0 + 110, 104, 104); win(388, y0 + 110, 104, 104); }
    }
    g.strokeStyle = 'rgba(20,20,20,0.75)'; g.lineWidth = 2;                                                              // service wire along the wall
    g.beginPath(); g.moveTo(0, PAR + 30); g.quadraticCurveTo(w * 0.5, PAR + 52, w, PAR + 34); g.stroke();
    g.beginPath(); g.moveTo(357, PAR + 44); g.lineTo(357, h - SH + 120); g.stroke();
  });
}



// ---------- Road network (traced from Google's road map) ----------
const NODES = WD.graph.nodes.map(p => toW(p[0], p[1]));
const ADJ = NODES.map(() => []);
const EDGES = WD.graph.edges.map((e, id) => {
  const raw = e.p.map(p => toW(p[0], p[1]));
  const cum = [0]; for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]));
  const L = Math.max(1, cum[cum.length - 1]), n = Math.max(2, Math.ceil(L) + 1);
  const P = [];
  for (let k = 0, j = 0; k < n; k++) {
    const s = Math.min(L, k * L / (n - 1));
    while (j < raw.length - 2 && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    P.push(raw[j].clone().lerp(raw[j + 1], clamp(t, 0, 1)));
  }
  const T = P.map((p, i) => { const a = P[Math.max(0, i - 3)], b = P[Math.min(n - 1, i + 3)]; return V3(b.x - a.x, 0, b.z - a.z).normalize(); });
  const Nn = T.map(t => V3(t.z, 0, -t.x));               // left-hand normal
  const main = e.main !== undefined ? e.main : e.w >= 10.5;                                // the district roads; everything else is a concrete village road
  const half = main ? 3.6 : clamp(e.w * 0.37, 1.8, 2.9);
  const ed = { id, a: e.a, b: e.b, P, T, N: Nn, L, step: L / (n - 1), main, half };
  ADJ[e.a].push(ed); if (e.b !== e.a) ADJ[e.b].push(ed);
  return ed;
});
function edgeIdx(ed, s) { return clamp(s / ed.step, 0, ed.P.length - 1); }
function edgeAt(ed, s, lat, out) {
  const f = edgeIdx(ed, s), i0 = Math.floor(f), i1 = Math.min(ed.P.length - 1, i0 + 1), t = f - i0;
  const a = ed.P[i0], b = ed.P[i1], na = ed.N[i0], nb = ed.N[i1];
  return (out || new THREE.Vector3()).set(lerp(a.x, b.x, t) + lerp(na.x, nb.x, t) * lat, 0, lerp(a.z, b.z, t) + lerp(na.z, nb.z, t) * lat);
}
function edgeYaw(ed, s, dir) { const i = Math.round(edgeIdx(ed, s)), t = ed.T[i]; return Math.atan2(t.x * dir, t.z * dir); }
// village boundary
const BOUND = WD.bound.map(p => toW(p[0], p[1]));
function inVillage(x, z) {
  let c = false;
  for (let i = 0, j = BOUND.length - 1; i < BOUND.length; j = i++) {
    const a = BOUND[i], b = BOUND[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}

// ---------- Spatial grids: nearest road (2 m) and solids (1 m) ----------
window.__proofPhase?.('road-grid-start');
const RG = 2, RW_ = Math.ceil(WW / RG), RH_ = Math.ceil(WH / RG);
const gridCells = RW_ * RH_;
if (window.KERAI_ROADS.byteLength !== gridCells * 5) throw new Error('Invalid road grid');
const roadEdge = new Int16Array(window.KERAI_ROADS, 0, gridCells);
const roadS = new Uint16Array(window.KERAI_ROADS, gridCells * 2, gridCells);
const roadD = new Uint8Array(window.KERAI_ROADS, gridCells * 4, gridCells);
window.__proofPhase?.('road-grid-end');
// nearest road info at a world point: {ed, s, lat, d}
function roadNear(x, z) {
  const cx = Math.floor((x + WW / 2) / RG), cz = Math.floor((z + WH / 2) / RG);
  if (cx < 0 || cz < 0 || cx >= RW_ || cz >= RH_) return null;
  const c = cz * RW_ + cx, id = roadEdge[c]; if (id < 0) return null;
  const ed = EDGES[id]; let s = roadS[c], best = 1e9;
  for (let k = -3; k <= 3; k++) { const ss = clamp(s + k, 0, ed.L), p = edgeAt(ed, ss, 0, _rn); const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; s = ss; } }
  const i = Math.round(edgeIdx(ed, s)), p = ed.P[i], n = ed.N[i];
  return { ed, s, lat: (x - p.x) * n.x + (z - p.z) * n.z, d: Math.sqrt(best) };
}
const _rn = new THREE.Vector3();
const SG = 1, SW_ = Math.ceil(WW / SG), SH_ = Math.ceil(WH / SG);
const solid = new Uint8Array(SW_ * SH_);                  // 1 = building wall, 2 = tree trunk
function cellAt(x, z) {
  const cx = Math.floor((x + WW / 2) / SG), cz = Math.floor((z + WH / 2) / SG);
  if (cx < 0 || cz < 0 || cx >= SW_ || cz >= SH_) return 0;
  return solid[cz * SW_ + cx];
}

// ---------- Ground: satellite tiles + close-up earth detail ----------
const earthTex = canvasTex(512, 512, (c, w, h) => {
  c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
  speckle(c, w, h, 22000, ['#707070', '#8c8c8c', '#7a7a7a', '#959595', '#666666'], 2.2);
  for (let k = 0; k < 260; k++) { c.fillStyle = `rgb(${rand(95, 150) | 0},${rand(95, 150) | 0},${rand(95, 150) | 0})`; c.beginPath(); c.ellipse(rand(0, w), rand(0, h), rand(1.5, 5), rand(1, 3.5), rand(0, 3), 0, 7); c.fill(); }
  for (let k = 0; k < 420; k++) { const x = rand(0, w), y = rand(0, h); c.strokeStyle = `rgba(${rand(60, 110) | 0},${rand(110, 160) | 0},${rand(40, 80) | 0},0.55)`; c.lineWidth = 1; for (let b = 0; b < 5; b++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-5, 5), y - rand(4, 10)); c.stroke(); } }
  for (let k = 0; k < 30; k++) { const x = rand(0, w), y = rand(0, h), r = rand(20, 70), gr = c.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(60,60,60,0.25)'); gr.addColorStop(1, 'rgba(60,60,60,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
}, true);
earthTex.encoding = THREE.LinearEncoding;
function groundMat(tex, rep) {
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.detail = { value: earthTex }; sh.uniforms.detailRep = { value: rep };
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D detail; uniform vec2 detailRep;')
      .replace('#include <map_fragment>', `
        vec4 sat = texture2D( map, vUv );
        float lum = dot(sat.rgb, vec3(0.299, 0.587, 0.114));
        vec3 satc = mix(vec3(lum), sat.rgb, 1.35);                                   // undo the haze in the satellite photo
        vec3 lifted = mix(satc, vec3(lum) * vec3(1.05, 1.0, 0.82) * 1.5, smoothstep(0.3, 0.07, lum) * 0.4);
        float d = texture2D(detail, vUv * detailRep).r / 0.5;
        float d2 = texture2D(detail, vUv * detailRep * 0.23 + 0.37).r / 0.5;
        diffuseColor.rgb *= lifted * mix(1.0, d * 0.6 + d2 * 0.4, 0.8);`);
  };
  return m;
}
const HD_TEX = {};
const hdSiteAt = (mx, mz) => (WD.hd || []).find(P => mx >= P.own[0] && mx <= P.own[2] && mz >= P.own[1] && mz <= P.own[3]);
function buildGround(imgs) {
  const tw = 1600 * KX, th = 1720 * KY;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
    const tex = new THREE.Texture(imgs[`g${r}${c}`]); tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const g = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), groundMat(tex, new THREE.Vector2(tw / 3.2, th / 3.2)));
    g.rotation.x = -Math.PI / 2; const p = toW((c + 0.5) * tw, (r + 0.5) * th); g.position.set(p.x, 0, p.z); scene.add(g);
  }
  // Kerai's three main places — Pul Chowk, Healthy Aqua, Kushwaha (Majkothi) Chowk — in sharper (z19) imagery, feathered into the map
  const feather = canvasTex(256, 256, (c, w, h) => { const gx = c.createLinearGradient(0, 0, w, 0); for (const [t, a] of [[0, 0], [0.06, 1], [0.94, 1], [1, 0]]) gx.addColorStop(t, `rgba(255,255,255,${a})`); c.fillStyle = gx; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-in'; const gy = c.createLinearGradient(0, 0, 0, h); for (const [t, a] of [[0, 0], [0.08, 1], [0.92, 1], [1, 0]]) gy.addColorStop(t, `rgba(255,255,255,${a})`); c.fillStyle = gy; c.fillRect(0, 0, w, h); });
  for (const P of (WD.hd || [])) {
    const img = imgs[P.tile]; if (!img) continue;
    const tex = new THREE.Texture(img); tex.needsUpdate = true; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); HD_TEX[P.name] = { tex, P };
    const w = P.x1 - P.x0, h = P.z1 - P.z0, mat = groundMat(tex, new THREE.Vector2(w / 3.2, h / 3.2));
    mat.alphaMap = feather; mat.transparent = true; mat.depthWrite = false; mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -2;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); g.rotation.x = -Math.PI / 2; const c = toW((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2); g.position.set(c.x, 0.006, c.z); g.renderOrder = -1; scene.add(g);
  }
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: 0x334a2c, toneMapped: false }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; scene.add(outer);
}

// ---------- Road surfaces ----------
const asphaltTex = canvasTex(512, 1024, (g, w, h) => {
  g.fillStyle = '#4a4a48'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 26000, ['rgba(30,30,30,0.5)', 'rgba(120,118,112,0.45)', 'rgba(80,78,74,0.5)', 'rgba(150,148,140,0.3)'], 2);
  for (let k = 0; k < 14; k++) { const x = rand(0, w), y = rand(0, h), r = rand(40, 140), gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, `rgba(20,20,18,${rand(0.08, 0.2)})`); gr.addColorStop(1, 'rgba(20,20,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(30,28,25,${rand(0.3, 0.6)})`; g.beginPath(); g.ellipse(rand(60, w - 60), rand(0, h), rand(10, 40), rand(8, 30), rand(0, 3), 0, 7); g.fill(); }   // potholes / patches
  g.fillStyle = 'rgba(235,235,225,0.85)'; g.fillRect(14, 0, 9, h); g.fillRect(w - 23, 0, 9, h);               // edge lines
  for (let y = 0; y < h; y += 256) { g.fillStyle = 'rgba(230,230,220,0.7)'; g.fillRect(w / 2 - 4, y, 8, 120); } // centre dashes
  for (const x0 of [0, w - 12]) { g.fillStyle = 'rgba(140,115,80,0.6)'; for (let y = 0; y < h; y += 6) g.fillRect(x0 + rand(0, 6), y, rand(4, 12), 6); }
}, true);
function buildRoads() {
  const groups = { conc: { pos: [], uv: [], idx: [] }, asph: { pos: [], uv: [], idx: [] }, shoulder: { pos: [], uv: [], idx: [] } };
  const ribbon = (G, ed, half, y, vScale) => {
    const base = G.pos.length / 3;
    for (let k = 0; k < ed.P.length; k++) {
      const p = ed.P[k], n = ed.N[k];
      G.pos.push(p.x + n.x * half, y, p.z + n.z * half, p.x - n.x * half, y, p.z - n.z * half);
      G.uv.push(0, k * ed.step / vScale, 1, k * ed.step / vScale);
      if (k) { const a = base + (k - 1) * 2; G.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };
  for (const ed of EDGES) {
    ribbon(groups.shoulder, ed, ed.half + 0.9, 0.016, 6);
    ribbon(ed.main ? groups.asph : groups.conc, ed, ed.half, ed.main ? 0.03 : 0.026, 10);
  }
  // junction pads so the ribbons join cleanly
  const pads = [];
  NODES.forEach((p, i) => { const eds = ADJ[i]; if (eds.length < 2) return; const r = Math.max(...eds.map(e => e.half)) + 0.25; const g = new THREE.CircleGeometry(r, 20); const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * r / 2.6, uv.getY(k) * r / 5); g.rotateX(-Math.PI / 2); g.translate(p.x, eds.some(e => e.main) ? 0.031 : 0.029, p.z); g.userData.main = eds.some(e => e.main); pads.push(g); });
  const mk = (G) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2)); g.setIndex(G.idx); g.computeVertexNormals(); return g; };
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  add(mk(groups.shoulder), new THREE.MeshStandardMaterial({ map: shoulderTex, transparent: true, depthWrite: false, roughness: 1 }));
  add(mk(groups.conc), new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95, color: '#c9c6bf' }));
  add(mk(groups.asph), new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9 }));
  const padsC = pads.filter(g => !g.userData.main), padsA = pads.filter(g => g.userData.main);
  if (padsC.length) add(mergeGeos(padsC), new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95, color: '#c9c6bf' }));
  if (padsA.length) add(mergeGeos(padsA), new THREE.MeshStandardMaterial({ color: '#4a4a48', roughness: 0.9 }));
}
function mergeGeos(geos) {
  const keys = Object.keys(geos[0].attributes), out = {}; keys.forEach(k => out[k] = []);
  for (let g of geos) { g = g.index ? g.toNonIndexed() : g; keys.forEach(k => out[k].push(...g.attributes[k].array)); }
  const m = new THREE.BufferGeometry(); keys.forEach(k => m.setAttribute(k, new THREE.Float32BufferAttribute(out[k], geos[0].attributes[k].itemSize))); return m;
}

// ---------- Standing water at bends ----------
const puddles = [];
let waterMat = null;
function blobShape(rx, rz, seed) {
  const sh = new THREE.Shape();
  for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2, r = 1 + 0.22 * Math.sin(a * 3 + seed) + 0.12 * Math.sin(a * 5 + seed * 2); const x = Math.cos(a) * rx * r, y = Math.sin(a) * rz * r; k ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  return new THREE.ShapeGeometry(sh, 2);
}
function addWater() {
  waterMat = new THREE.MeshStandardMaterial({ color: '#2e2a20', roughness: 0.02, metalness: 0.6, envMap, envMapIntensity: 1.6, normalMap: rippleTex, normalScale: new THREE.Vector2(0.12, 0.12), transparent: true, opacity: 0.94 });
  const wetMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
  for (const ed of EDGES) {
    if (ed.main || ed.L < 30) continue;
    for (let i = 12; i < ed.P.length - 12; i += 6) {
      const a = ed.T[i - 10], b = ed.T[i + 10], turn = Math.acos(clamp(a.x * b.x + a.z * b.z, -1, 1));
      const p = ed.P[i]; if (!(turn > 0.5 || hash2(ed.id, i) < 0.012) || !inVillage(p.x, p.z) || puddles.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 60)) continue;
      const lat = rand(-0.6, 0.6) * ed.half, n = ed.N[i], cx = p.x + n.x * lat, cz = p.z + n.z * lat;
      const rx = rand(1.3, 2.3), rz = rand(1.1, 2.0), rot = Math.atan2(ed.T[i].x, ed.T[i].z), seed = rand(0, 9);
      const wet = mesh(blobShape(rx * 1.35, rz * 1.35, seed), wetMat, cx, 0.036, cz); wet.rotation.x = -Math.PI / 2; wet.rotation.z = rot; scene.add(wet);
      const w = mesh(blobShape(rx, rz, seed), waterMat, cx, 0.045, cz); w.rotation.x = -Math.PI / 2; w.rotation.z = rot; scene.add(w);
      puddles.push({ x: cx, z: cz, rx, rz, rot }); i += 30;
    }
  }
}

// ---------- Buildings from Google's footprints ----------
const BLD = [];
function instUV(mat, per) {             // texture repeats with the instance's real size instead of stretching
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        ${per === 'roof' ? 'vUv *= vec2(isc.x, isc.z) / 4.0;' : 'float wide = abs(normal.x) > 0.5 ? isc.z : isc.x; vUv.x *= max(1.0, floor(wide / 4.5 + 0.5));'}
      #endif`);
  };
  return mat;
}
const roofTex = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#b5b0a5'; c.fillRect(0, 0, w, h);
  speckle(c, w, h, 5000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.08)', 'rgba(90,80,60,0.1)'], 3);
  for (let k = 0; k < 8; k++) { const x = rand(0, w), y = rand(0, h), r = rand(20, 60), gr = c.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(50,55,40,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }
  c.strokeStyle = 'rgba(60,55,45,0.35)'; c.lineWidth = 1; for (let k = 0; k < 6; k++) { let x = rand(0, w), y = rand(0, h); c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 6; s++) { x += rand(-15, 15); y += rand(-15, 15); c.lineTo(x, y); } c.stroke(); }
}, true);
function buildBuildings() {
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = V3(0, 1, 0), col = new THREE.Color();
  const PAINT = ['#f4efe6', '#f3e5ab', '#ffd7c8', '#d7ecf7', '#ffffff', '#e8f0d8', '#ffe8c4', '#f5d5e0', '#efe9da'];
  let trimmed = 0, dropped = 0;
  WD.blds.forEach(([mx, mz, hu0, hv0, ang, rr, rg, rb, rst, rtin], i) => {
    // keep every house off the road: trim the side that overlaps the carriageway (+ a 0.6 m verge), drop it if mostly on the road
    let c = toW(mx, mz), hu = hu0, hv = hv0;
    const ux = Math.sin(ang), uz = Math.cos(ang);            // local a-axis (length hu); b-axis = (uz, -ux) (length hv)
    const onRoad = (x, z) => { const q = roadNear(x, z); return q && q.d < q.ed.half + 0.6; };
    for (let it = 0; it < 14; it++) {
      let push = [0, 0, 0, 0], hits = 0, tot = 0;           // overlaps on the +a, -a, +b, -b halves
      for (let a = -1; a <= 1.001; a += 0.25) for (let b = -1; b <= 1.001; b += 0.25) {
        const x = c.x + a * hu * ux + b * hv * uz, z = c.z + a * hu * uz - b * hv * ux; tot++;
        if (onRoad(x, z)) { hits++; if (Math.abs(a) >= Math.abs(b)) push[a > 0 ? 0 : 1]++; else push[b > 0 ? 2 : 3]++; }
      }
      if (!hits) break;
      if (hits / tot > 0.45 || hu < 1.5 || hv < 1.5) { hu = 0; break; }
      const k = push.indexOf(Math.max(...push)), step = 0.5;
      if (k < 2) { hu -= step / 2; const sgn = k === 0 ? -1 : 1; c = V3(c.x + sgn * ux * step / 2, 0, c.z + sgn * uz * step / 2); }
      else { hv -= step / 2; const sgn = k === 2 ? -1 : 1; c = V3(c.x + sgn * uz * step / 2, 0, c.z - sgn * ux * step / 2); }
      if (it === 13) hu = 0;
    }
    if (hu === 0) { dropped++; return; }
    if (hu < hu0 || hv < hv0) trimmed++;
    const area = 4 * hu * hv, r = hash2(i, 7), rn = roadNear(c.x, c.z);
    const real = rst !== undefined, site = real ? hdSiteAt(mx, mz) : null;
    const st = real ? rst : area < 24 ? 1 : r < 0.06 ? 3 : r < 0.32 ? 2 : 1;
    const kr = hash2(i, 13);
    const kind = real ? (rtin ? 'tin' : kr < 0.45 ? 'brick' : kr < 0.7 ? 'cement' : 'paint') : (area < 30 && kr < 0.6) || (st === 1 && kr < 0.25) ? 'tin' : kr < 0.5 ? 'brick' : kr < 0.68 ? 'cement' : 'paint';
    const front = rn && rn.d < Math.max(hu, hv) + 6;
    const b = { x: c.x, z: c.z, hu, hv, ang, st, kind, site: site && site.name, roof: real ? [rr / 255, rg / 255, rb / 255] : null, ht: kind === 'tin' ? 2.5 : st * 3.0 + 0.15, shop: front && kind !== 'tin' && st <= 2 && hash2(i, 3) < 0.4 && area > 30, i };
    BLD.push(b);
    // rasterise into the solid grid
    const R = Math.hypot(hu, hv) + 1;
    for (let z = Math.floor(c.z - R); z <= c.z + R; z++) for (let x = Math.floor(c.x - R); x <= c.x + R; x++) {
      const dx = x + 0.5 - c.x, dz = z + 0.5 - c.z, a = dx * ux + dz * uz, bb = dx * uz - dz * ux;
      if (Math.abs(a) < hu - 0.2 && Math.abs(bb) < hv - 0.2) { const X = Math.floor((x + WW / 2) / SG), Z = Math.floor((z + WH / 2) / SG); if (X >= 0 && Z >= 0 && X < SW_ && Z < SH_) solid[Z * SW_ + X] = 1; }
    }
  });
  console.log('houses kept off roads: trimmed', trimmed, 'dropped', dropped);
  const groups = {};
  for (const b of BLD) { const key = (b.kind === 'tin' ? 'brick' : b.kind) + (b.kind === 'tin' ? 1 : b.st) + (b.shop ? 's' : ''); (groups[key] = groups[key] || []).push(b); }
  const hGeo = new THREE.BoxGeometry(1, 1, 1); hGeo.translate(0, 0.5, 0);
  const roofM = instUV(new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 }), 'roof');
  const flat = [], tins = [], tanks = [], rebars = [], stairs = [], photoRoofs = {};
  Object.values(groups).forEach(list => {
    const b0 = list[0], ft = facadeTex(b0.kind === 'tin' ? 'brick' : b0.kind, b0.kind === 'tin' ? 1 : b0.st, b0.shop); ft.wrapS = THREE.RepeatWrapping;
    const side = instUV(new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 }), 'side');
    const im = new THREE.InstancedMesh(hGeo, [side, side, roofM, roofM, side, side], list.length);
    list.forEach((b, n) => {
      q4.setFromAxisAngle(up, b.ang); m4.compose(p3.set(b.x, 0, b.z), q4, s3.set(2 * b.hv, b.ht, 2 * b.hu)); im.setMatrixAt(n, m4);
      if (b.kind === 'paint') col.set(PAINT[(hash2(b.i, 5) * PAINT.length) | 0]); else col.setRGB(1, 1, 1).multiplyScalar(0.88 + hash2(b.i, 9) * 0.14);
      im.setColorAt(n, col); b.col = col.clone();
      if (b.kind === 'tin') { tins.push(b); return; }
      flat.push(b); if (b.site) (photoRoofs[b.site] = photoRoofs[b.site] || []).push(b);
      const loc = (lx, lz) => V3(b.x + lx * Math.cos(b.ang) + lz * Math.sin(b.ang), b.ht, b.z - lx * Math.sin(b.ang) + lz * Math.cos(b.ang));
      if (hash2(b.i, 21) < 0.32) tanks.push(loc((hash2(b.i, 2) - 0.5) * b.hv, (hash2(b.i, 4) - 0.5) * b.hu));
      if (b.st >= 2 && hash2(b.i, 23) < 0.15) stairs.push([loc(b.hv * 0.4, -b.hu * 0.4), b.ang]);
      if (hash2(b.i, 25) < 0.4) for (const sx of [-1, 1]) for (const sz of [-1, 1]) rebars.push(loc(sx * (b.hv - 0.25), sz * (b.hu - 0.25)));
    });
    im.castShadow = im.receiveShadow = true; chunkSplit(im);
  });
  // parapet walls: four thin walls per flat roof
  const plasterTex = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); speckle(c, w, h, 900, ['rgba(0,0,0,0.07)', 'rgba(90,80,60,0.08)'], 3); c.fillStyle = 'rgba(40,35,30,0.25)'; c.fillRect(0, h - 6, w, 6); }, true);
  const par = new THREE.InstancedMesh(hGeo, new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.95 }), Math.max(1, flat.length * 4));
  let n = 0;
  for (const b of flat) {
    const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
    for (const [lx, lz, w, d] of [[0, b.hu - 0.06, 2 * b.hv, 0.12], [0, -b.hu + 0.06, 2 * b.hv, 0.12], [b.hv - 0.06, 0, 0.12, 2 * b.hu], [-b.hv + 0.06, 0, 0.12, 2 * b.hu]]) {
      q4.setFromAxisAngle(up, b.ang); m4.compose(p3.set(b.x + lx * ca + lz * sa, b.ht, b.z - lx * sa + lz * ca), q4, s3.set(w, 0.85, d)); par.setMatrixAt(n, m4);
      par.setColorAt(n, b.kind === 'brick' ? col.set('#c9b8a8') : b.col); n++;
    }
  }
  par.count = n; par.castShadow = true; chunkSplit(par);
  // sloping tin roofs
  const tinTex = canvasTex(256, 256, (c, w, h) => {
    for (let x = 0; x < w; x += 8) { const gr = c.createLinearGradient(x, 0, x + 8, 0); gr.addColorStop(0, '#8d8a84'); gr.addColorStop(0.5, '#c4c1ba'); gr.addColorStop(1, '#7c7973'); c.fillStyle = gr; c.fillRect(x, 0, 8, h); }
    for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(${130 + rand(0, 60)},${60 + rand(0, 30)},20,${rand(0.15, 0.45)})`; c.beginPath(); c.ellipse(rand(0, w), rand(0, h), rand(10, 50), rand(5, 25), 0, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 64) c.fillRect(0, y, w, 2);
  }, true);
  const gable = (() => {
    const hw = 0.5, P = [[-hw, 0, -hw], [hw, 0, -hw], [hw, 1, 0], [-hw, 0, -hw], [hw, 1, 0], [-hw, 1, 0], [-hw, 0, hw], [-hw, 1, 0], [hw, 1, 0], [-hw, 0, hw], [hw, 1, 0], [hw, 0, hw], [-hw, 0, -hw], [-hw, 1, 0], [-hw, 0, hw], [hw, 0, -hw], [hw, 0, hw], [hw, 1, 0]];
    const U = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1], [0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0], [0, 0], [0.5, 1], [1, 0], [0, 0], [1, 0], [0.5, 1]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U.flat().map(v => v * 2), 2)); g.computeVertexNormals(); return g;
  })();
  const roofs = new THREE.InstancedMesh(gable, new THREE.MeshStandardMaterial({ map: tinTex, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }), Math.max(1, tins.length));
  tins.forEach((b, k) => { q4.setFromAxisAngle(up, b.ang + (b.hv > b.hu ? Math.PI / 2 : 0)); const L = Math.max(b.hu, b.hv), S = Math.min(b.hu, b.hv);
    m4.compose(p3.set(b.x, b.ht, b.z), q4, s3.set(2 * L + 0.4, 0.75, 2 * S + 0.5)); roofs.setMatrixAt(k, m4); if (b.roof) col.setRGB(...b.roof).multiplyScalar(1.6); else col.setHSL(0.08, 0.15 + hash2(b.i, 1) * 0.2, 0.55 + hash2(b.i, 2) * 0.25); roofs.setColorAt(k, col); });
  // flat roofs in the three main places carry the real satellite photo of that roof
  for (const [name, list] of Object.entries(photoRoofs)) {
    const H = HD_TEX[name]; if (!H) continue;
    const a0 = toW(H.P.x0, H.P.z0), a1 = toW(H.P.x1, H.P.z1);
    const mat = new THREE.MeshStandardMaterial({ map: H.tex, roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hdBox = { value: new THREE.Vector4(a0.x, a0.z, a1.x, a1.z) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vW; uniform vec4 hdBox;').replace('#include <map_fragment>', `
        vec2 uvW = vec2((vW.x - hdBox.x) / (hdBox.z - hdBox.x), 1.0 - (vW.y - hdBox.y) / (hdBox.w - hdBox.y));
        vec4 rc = texture2D(map, uvW); float l = dot(rc.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb *= mix(vec3(l), rc.rgb, 1.25) * 1.45;`);
    };
    const pGeo = new THREE.PlaneGeometry(1, 1); pGeo.rotateX(-Math.PI / 2);
    const pm = new THREE.InstancedMesh(pGeo, mat, list.length);
    list.forEach((b, k) => { q4.setFromAxisAngle(up, b.ang); m4.compose(p3.set(b.x, b.ht + 0.015, b.z), q4, s3.set(2 * b.hv - 0.1, 1, 2 * b.hu - 0.1)); pm.setMatrixAt(k, m4); });
    pm.receiveShadow = true; chunkSplit(pm);
  }
  roofs.count = tins.length; roofs.castShadow = true; chunkSplit(roofs);
  const tGeo = new THREE.CylinderGeometry(0.55, 0.6, 1.1, 14); tGeo.translate(0, 0.55, 0);
  const tm = new THREE.InstancedMesh(tGeo, M('#1b1b1b', 0.5), Math.max(1, tanks.length));
  tanks.forEach((p, k) => { m4.makeTranslation(p.x, p.y, p.z); tm.setMatrixAt(k, m4); }); tm.count = tanks.length; tm.castShadow = true; chunkSplit(tm);
  const rodGeo = mergeGeos([[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]].map(([x, z]) => { const g = new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5); g.translate(x, 0.55, z); return g; }));
  const rods = new THREE.InstancedMesh(rodGeo, M('#5a3a24', 0.7, 0.4), Math.max(1, rebars.length));
  rebars.forEach((p, k) => { m4.compose(p, q4.identity(), s3.set(1, 0.8 + hash2(p.x, p.z) * 0.6, 1)); rods.setMatrixAt(k, m4); }); rods.count = rebars.length; chunkSplit(rods);
  const sGeo = new THREE.BoxGeometry(2.2, 2.4, 2.4); sGeo.translate(0, 1.2, 0);
  const sm = new THREE.InstancedMesh(sGeo, M('#d6d0c4', 0.95), Math.max(1, stairs.length));
  stairs.forEach(([p, a], k) => { q4.setFromAxisAngle(up, a); m4.compose(p, q4, s3.set(1, 1, 1)); sm.setMatrixAt(k, m4); }); sm.count = stairs.length; sm.castShadow = true; chunkSplit(sm);
}
function heightAt(x, z) {
  let h = 0;
  for (const b of BLD) { if (Math.abs(b.x - x) > 12 || Math.abs(b.z - z) > 12) continue; if (Math.hypot(b.x - x, b.z - z) < Math.max(b.hu, b.hv) + 2) h = Math.max(h, b.ht + 0.9); }
  return h;
}

// ---------- Trees: mango / neem / toddy palm, in 160 m chunks shown only near the player ----------
const CHUNK = 160, chunks = [];
function buildTrees() {
  const T = WD.trees, list = [], TR = WD.treesR || [];
  for (let i = 0; i < TR.length; i += 3) {                 // trees traced from the z19 imagery, with their real crown size
    const p = toW(TR[i], TR[i + 1]); if (cellAt(p.x, p.z) === 1) continue;
    const rn = roadNear(p.x, p.z); if (rn && rn.d < rn.ed.half + 0.8) continue;
    list.push({ x: p.x, z: p.z, k: 100000 + i / 3, palm: false, cr: clamp(TR[i + 2] * 0.95, 1.7, 6.5) });
    const X = Math.floor((p.x + WW / 2) / SG), Z = Math.floor((p.z + WH / 2) / SG); if (X >= 0 && Z >= 0 && X < SW_ && Z < SH_ && !solid[Z * SW_ + X]) solid[Z * SW_ + X] = 2;
  }
  for (let i = 0; i < T.length; i += 2) {
    const p = toW(T[i], T[i + 1]);
    if (cellAt(p.x, p.z) === 1) continue;
    const rn = roadNear(p.x, p.z); if (rn && rn.d < rn.ed.half + 1.2) continue;
    list.push({ x: p.x, z: p.z, k: i / 2, palm: hash2(i, 31) < 0.14 });
    const X = Math.floor((p.x + WW / 2) / SG), Z = Math.floor((p.z + WH / 2) / SG); if (X >= 0 && Z >= 0 && X < SW_ && Z < SH_ && !solid[Z * SW_ + X]) solid[Z * SW_ + X] = 2;
  }
  const barkTex = canvasTex(128, 256, (c, w, h) => { c.fillStyle = '#4a3b2e'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 120; k++) { c.strokeStyle = `rgba(${rand(15, 40)},${rand(10, 30)},${rand(5, 20)},${rand(0.3, 0.7)})`; c.lineWidth = rand(1, 4); const x = rand(0, w); c.beginPath(); c.moveTo(x, 0); for (let y = 0; y < h; y += 16) c.lineTo(x + rand(-4, 4), y); c.stroke(); }
    speckle(c, w, h, 900, ['rgba(120,110,90,0.25)', 'rgba(0,0,0,0.25)'], 3); }, true);
  const trunkGeo = mergeGeos([
    (() => { const g = new THREE.CylinderGeometry(0.17, 0.32, 1, 9); g.translate(0, 0.5, 0); return g; })(),
    ...[0, 2.1, 4.2].map(a => { const g = new THREE.CylinderGeometry(0.06, 0.13, 0.55, 6); g.translate(0, 0.27, 0); g.rotateZ(0.75); g.rotateY(a); g.translate(0, 0.78, 0); return g; })]);
  const leafAtlas = canvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let k = 0; k < 70; k++) {
      const x = rand(30, w - 30), y = rand(30, h - 30), ang = rand(0, Math.PI * 2), L = rand(30, 52), W = L * rand(0.22, 0.3);
      c.save(); c.translate(x, y); c.rotate(ang);
      const gr = c.createLinearGradient(0, -W, 0, W); const hue = rand(85, 115), lig = rand(18, 34);
      gr.addColorStop(0, `hsl(${hue},${rand(35, 55)}%,${lig + 8}%)`); gr.addColorStop(1, `hsl(${hue},${rand(35, 55)}%,${lig - 6}%)`);
      c.fillStyle = gr; c.beginPath(); c.moveTo(-L / 2, 0); c.quadraticCurveTo(0, -W, L / 2, 0); c.quadraticCurveTo(0, W, -L / 2, 0); c.fill();
      c.strokeStyle = 'rgba(200,220,150,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-L / 2, 0); c.lineTo(L / 2, 0); c.stroke(); c.restore();
    }
  });
  const crownGeo = (() => {
    const cards = [];
    for (let k = 0; k < 110; k++) {
      const lobe = k % 3, lc = [[0, 0.15, 0], [0.55, -0.1, 0.3], [-0.45, -0.05, -0.4]][lobe];
      const d = V3(rand(-1, 1), rand(-0.7, 0.8), rand(-1, 1)); if (d.length() > 1) d.normalize();
      const c = d.clone().multiplyScalar(0.85).add(V3(...lc));
      const g = new THREE.PlaneGeometry(rand(0.8, 1.25), rand(0.8, 1.25));
      g.lookAt(d.clone().add(V3(rand(-0.6, 0.6), rand(-0.3, 0.6), rand(-0.6, 0.6)))); g.translate(c.x, c.y, c.z);
      const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, c.x, c.y + 0.3, c.z);
      cards.push(g);
    }
    const m = mergeGeos(cards); const nn = m.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < nn.count; i++) { v.fromBufferAttribute(nn, i).normalize(); nn.setXYZ(i, v.x, v.y, v.z); }
    return m;
  })();
  const palmTrunkTex = canvasTex(64, 256, (c, w, h) => { c.fillStyle = '#6b5a48'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 10) { c.fillStyle = 'rgba(30,20,10,0.45)'; c.fillRect(0, y, w, 3); } }, true);
  palmTrunkTex.repeat.set(1, 6);
  const ptGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 8); ptGeo.translate(0, 0.5, 0);
  const frond = (a) => { const g = new THREE.PlaneGeometry(0.55, 3.2, 1, 6); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y0 = p.getY(i) + 1.6, t = y0 / 3.2; p.setXYZ(i, p.getX(i) * (1 - t * 0.7), -1.4 * t * t, y0 * 0.95); }
    g.rotateY(a); g.computeVertexNormals(); return g; };
  const frondTex = canvasTex(64, 256, (c, w, h) => { c.clearRect(0, 0, w, h); for (let y = 0; y < h; y += 5) { c.strokeStyle = `hsl(${rand(85, 110)},45%,${rand(18, 32)}%)`; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, y); c.lineTo(rand(0, 6), y + 14); c.moveTo(w / 2, y); c.lineTo(w - rand(0, 6), y + 14); c.stroke(); } c.fillStyle = '#3d4a22'; c.fillRect(w / 2 - 2, 0, 4, h); });
  const palmCrown = mergeGeos(Array.from({ length: 13 }, (_, i) => frond(i / 13 * Math.PI * 2 + (i % 2) * 0.2)));
  const mats = {
    trunk: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 }),
    crown: new THREE.MeshStandardMaterial({ map: leafAtlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    ptrunk: new THREE.MeshStandardMaterial({ map: palmTrunkTex, roughness: 0.95 }),
    pcrown: new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }),
  };
  const byChunk = {};
  for (const t of list) { const key = Math.floor((t.x + WW / 2) / CHUNK) + ',' + Math.floor((t.z + WH / 2) / CHUNK); (byChunk[key] = byChunk[key] || []).push(t); }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = V3(0, 1, 0), col = new THREE.Color();
  for (const [key, ts] of Object.entries(byChunk)) {
    const g = new THREE.Group(); const [cx, cz] = key.split(',').map(Number);
    g.userData.c = V3((cx + 0.5) * CHUNK - WW / 2, 0, (cz + 0.5) * CHUNK - WH / 2);
    const broad = ts.filter(t => !t.palm), palms = ts.filter(t => t.palm);
    if (broad.length) {
      const tr = new THREE.InstancedMesh(trunkGeo, mats.trunk, broad.length), cr = new THREE.InstancedMesh(crownGeo, mats.crown, broad.length);
      broad.forEach((t, n) => {
        const r = t.cr || 1.9 + hash2(t.k, 2) * 1.6, h = t.cr ? 2.4 + r * 0.95 + hash2(t.k, 1) * 1.5 : 3.2 + hash2(t.k, 1) * 3.2; q4.setFromAxisAngle(up, hash2(t.k, 3) * 6);
        m4.compose(p3.set(t.x, 0, t.z), q4, s3.set(1 + r * 0.1, h, 1 + r * 0.1)); tr.setMatrixAt(n, m4);
        m4.compose(p3.set(t.x, h + r * 0.55, t.z), q4, s3.set(r, r * 0.82, r)); cr.setMatrixAt(n, m4);
        col.setHSL(0.24 + hash2(t.k, 4) * 0.05, 0.25 + hash2(t.k, 5) * 0.15, 0.62 + hash2(t.k, 6) * 0.25); cr.setColorAt(n, col);
      });
      tr.castShadow = cr.castShadow = true; tr.frustumCulled = cr.frustumCulled = false; g.add(tr, cr);
    }
    if (palms.length) {
      const pt = new THREE.InstancedMesh(ptGeo, mats.ptrunk, palms.length), pc = new THREE.InstancedMesh(palmCrown, mats.pcrown, palms.length);
      palms.forEach((t, n) => {
        const h = 8 + hash2(t.k, 7) * 5; q4.setFromAxisAngle(V3(hash2(t.k, 8) - 0.5, 0, hash2(t.k, 9) - 0.5).normalize(), 0.05 + hash2(t.k, 10) * 0.06);
        m4.compose(p3.set(t.x, 0, t.z), q4, s3.set(1, h, 1)); pt.setMatrixAt(n, m4);
        const top = V3(0, h, 0).applyQuaternion(q4); q4.setFromAxisAngle(up, hash2(t.k, 11) * 6); m4.compose(p3.set(t.x + top.x, h, t.z + top.z), q4, s3.set(1, 1, 1)); pc.setMatrixAt(n, m4);
      });
      pt.castShadow = pc.castShadow = true; pt.frustumCulled = pc.frustumCulled = false; g.add(pt, pc);
    }
    g.visible = false; scene.add(g); chunks.push(g);
  }
  return list.length;
}
// Everything static is split into map chunks: only chunks near the camera are drawn, and only those
// within ~100 m cast shadows (the shadow pass used to draw the whole village every frame).
const CHUNKED = [];
function chunkSplit(im, size = 140) {
  const n = im.count, m4 = new THREE.Matrix4(), col = new THREE.Color(), buckets = {};
  for (let i = 0; i < n; i++) { im.getMatrixAt(i, m4); const k = Math.floor((m4.elements[12] + WW / 2) / size) + ',' + Math.floor((m4.elements[14] + WH / 2) / size); (buckets[k] = buckets[k] || []).push(i); }
  for (const [k, idx] of Object.entries(buckets)) {
    const cm = new THREE.InstancedMesh(im.geometry, im.material, idx.length);
    idx.forEach((i, j) => { im.getMatrixAt(i, m4); cm.setMatrixAt(j, m4); if (im.instanceColor) { im.getColorAt(i, col); cm.setColorAt(j, col); } });
    const [cx, cz] = k.split(',').map(Number);
    cm.userData.c = V3((cx + 0.5) * size - WW / 2, 0, (cz + 0.5) * size - WH / 2); cm.userData.cast = im.castShadow;
    cm.receiveShadow = im.receiveShadow; cm.castShadow = false; cm.frustumCulled = false; cm.visible = false;
    scene.add(cm); CHUNKED.push(cm);
  }
}
const VIEW_R = 360, SHADOW_R = 100;
function updateChunks() {
  const cx = camera.position.x, cz = camera.position.z;
  for (const g of chunks) {
    const dx = Math.abs(g.userData.c.x - cx), dz = Math.abs(g.userData.c.z - cz);
    g.visible = dx < VIEW_R && dz < VIEW_R;
    const cast = dx < SHADOW_R && dz < SHADOW_R; for (const m of g.children) m.castShadow = cast;
  }
  for (const m of CHUNKED) {
    const dx = Math.abs(m.userData.c.x - cx), dz = Math.abs(m.userData.c.z - cz);
    m.visible = dx < VIEW_R && dz < VIEW_R; m.castShadow = m.userData.cast && dx < SHADOW_R && dz < SHADOW_R;
  }
}

// ---------- Street furniture: electric poles & wires, hand pumps, haystacks ----------
const obstacles = [], obsGrid = {};
function addObstacle(x, z, r, label) { const o = { x, z, r, label }; obstacles.push(o); const k = Math.floor(x / 20) + ',' + Math.floor(z / 20); (obsGrid[k] = obsGrid[k] || []).push(o); }
function obstaclesNear(x, z) { const out = []; const cx = Math.floor(x / 20), cz = Math.floor(z / 20); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = obsGrid[(cx + a) + ',' + (cz + b)]; if (l) out.push(...l); } return out; }
function buildStreetLife() {
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3(), up = V3(0, 1, 0);
  const poleGeo = mergeGeos([
    (() => { const g = new THREE.BoxGeometry(0.18, 8.2, 0.14); g.translate(0, 4.1, 0); return g; })(),
    (() => { const g = new THREE.BoxGeometry(1.4, 0.08, 0.08); g.translate(0, 7.6, 0); return g; })(),
    ...[-0.6, 0, 0.6].map(x => { const g = new THREE.CylinderGeometry(0.035, 0.045, 0.12, 8); g.translate(x, 7.7, 0); return g; })].map(g => { g.deleteAttribute('uv'); return g; }));
  const poles = [], wires = [];
  for (const ed of EDGES) {
    if (ed.L < 40) continue;
    let prev = null;
    for (let s = 8; s < ed.L - 4; s += 34) {
      const lat = ed.half + 1.0, p = edgeAt(ed, s, lat);
      if (cellAt(p.x, p.z) || !inVillage(p.x, p.z) && !ed.main) { prev = null; continue; }
      const yaw = edgeYaw(ed, s, 1); poles.push([p, yaw]); addObstacle(p.x, p.z, 0.35, 'बिजली का खंभा! Hit a pole!');
      const tops = [-0.6, 0, 0.6].map(x => V3(p.x + Math.cos(yaw) * x, 7.78, p.z - Math.sin(yaw) * x));
      if (prev) for (let k = 0; k < 3; k++) wires.push([prev[k], tops[k]]);
      prev = tops;
    }
  }
  const pm = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#9b9890', roughness: 0.9 }), Math.max(1, poles.length));
  poles.forEach(([p, yaw], k) => { q4.setFromAxisAngle(up, yaw); m4.compose(p, q4, s3); pm.setMatrixAt(k, m4); });
  pm.count = poles.length; pm.castShadow = true; chunkSplit(pm);
  const wp = [];
  for (const [a, b] of wires) { const m = a.clone().lerp(b, 0.5); m.y -= 0.9; const c = new THREE.QuadraticBezierCurve3(a, m, b).getPoints(10); for (let i = 1; i < c.length; i++) wp.push(c[i - 1].x, c[i - 1].y, c[i - 1].z, c[i].x, c[i].y, c[i].z); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#141414' })); wl.frustumCulled = false; scene.add(wl);
  // hand pumps and haystacks beside village lanes
  const pumpGeo = mergeGeos([
    (() => { const g = new THREE.BoxGeometry(1.4, 0.12, 1.4); g.translate(0, 0.06, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.06, 0.08, 0.95, 10); g.translate(0, 0.6, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10); g.translate(0, 1.1, 0); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8); g.rotateX(Math.PI / 2); g.translate(0, 0.95, 0.16); return g; })(),
    (() => { const g = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6); g.rotateX(1.25); g.translate(0, 1.33, -0.3); return g; })()].map(g => { g.deleteAttribute('uv'); return g; }));
  const straw = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#b89a52'; c.fillRect(0, 0, w, h); for (let k = 0; k < 900; k++) { c.strokeStyle = `rgba(${rand(150, 220) | 0},${rand(120, 180) | 0},${rand(50, 90) | 0},0.7)`; c.lineWidth = 1; const x = rand(0, w), y = rand(0, h); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-4, 4), y + rand(6, 14)); c.stroke(); } }, true);
  const hayGeo = new THREE.LatheGeometry([[0.001, 0], [1.3, 0], [1.4, 0.8], [1.15, 1.8], [0.55, 2.6], [0.1, 3.0], [0.001, 3.05]].map(p => new THREE.Vector2(p[0], p[1])), 16);
  const pumps = [], hays = [];
  for (const ed of EDGES) {
    if (ed.main) continue;
    for (let s = 20; s < ed.L - 10; s += 90) {
      const sd = hash2(ed.id, s) < 0.5 ? 1 : -1;
      if (hash2(ed.id * 3, s) < 0.35) { const p = edgeAt(ed, s, sd * (ed.half + 1.6)); if (!cellAt(p.x, p.z) && inVillage(p.x, p.z)) { pumps.push([p, edgeYaw(ed, s, 1)]); addObstacle(p.x, p.z, 0.6, 'चापाकल से टक्कर! Hit a hand pump!'); } }
      else if (hash2(ed.id * 7, s) < 0.3) { const p = edgeAt(ed, s, sd * (ed.half + rand(5, 8))); if (!cellAt(p.x, p.z) && cellAt(p.x + 2, p.z) !== 1) { hays.push(p); addObstacle(p.x, p.z, 1.4, 'पुआल से टक्कर! Hit a haystack!'); } }
    }
  }
  const pmm = new THREE.InstancedMesh(pumpGeo, M('#2e5d3a', 0.45, 0.5), Math.max(1, pumps.length));
  pumps.forEach(([p, yaw], k) => { q4.setFromAxisAngle(up, yaw); m4.compose(p, q4, s3); pmm.setMatrixAt(k, m4); }); pmm.count = pumps.length; pmm.castShadow = true; chunkSplit(pmm);
  const hm = new THREE.InstancedMesh(hayGeo, new THREE.MeshStandardMaterial({ map: straw, roughness: 1 }), Math.max(1, hays.length));
  hays.forEach((p, k) => { q4.setFromAxisAngle(up, hash2(p.x, p.z) * 6); m4.compose(p, q4, s3.set(1, 0.85 + hash2(p.z, p.x) * 0.3, 1)); hm.setMatrixAt(k, m4); s3.set(1, 1, 1); }); hm.count = hays.length; hm.castShadow = true; chunkSplit(hm);
  return { poles: poles.length, pumps: pumps.length, hays: hays.length };
}


// ---------- Destinations, road names, route distances ----------
const PLACES = [
  ['केराई पुल चौक', 'Kerai Pul Chowk', 25.7520679, 85.8785414],
  ['कुशवाहा चौक', 'Kushwaha Chowk', 25.743978, 85.8707516],
  ['केराई सरपट्टी', 'Kerai Sarpatti', 25.7522508, 85.8639766],
  ['मांझी चौक, लोहागीर', 'Manjhi Chowk, Lohagir', 25.7559406, 85.856129],
  ['राजकीय मध्य विद्यालय', 'Rajkiye Middle School', 25.7416, 85.8678807],
  ['हेल्दी एक्वा', 'Healthy Aqua', 25.7406236, 85.8748225],
  ['शाहपुर पतोही', 'Shahpur Patohi', 25.7320, 85.8566],
  ['चैता लीलजी', 'Chaita Liljee', 25.7564926, 85.8834632],
  ['रुपौली खुर्द', 'Rupauli Khurd', 25.7442, 85.8815],
  ['माँ भगवती मंदिर', 'Maa Bhagwati Mandir', 25.7472625, 85.8599844],
  ['महिसारी', 'Mahisari', 25.7512, 85.8555],
  ['दुर्गा मंदिर', 'Durga Mandir', 25.7521125, 85.8702031],
  ['चैता बस्तरी', 'Chaita Bastari', 25.7637738, 85.8699249],
];
function snapToRoad(p, maxD = 60) {
  for (let r = 0; r <= maxD; r += 3) for (let a = 0; a < 6.28; a += r ? 3 / r : 7) { const rn = roadNear(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); if (rn && rn.d < 4) return rn; }
  return null;
}
// Dijkstra over junctions from a point on a road; returns distance (m) to every node
function distFrom(ed, s) {
  const D = new Float64Array(NODES.length).fill(Infinity), done = new Uint8Array(NODES.length);
  D[ed.a] = Math.min(D[ed.a], s); D[ed.b] = Math.min(D[ed.b], ed.L - s);
  for (;;) {
    let u = -1, best = Infinity; for (let i = 0; i < D.length; i++) if (!done[i] && D[i] < best) { best = D[i]; u = i; }
    if (u < 0) break; done[u] = 1;
    for (const e of ADJ[u]) { const v = e.a === u ? e.b : e.a; if (D[u] + e.L < D[v]) D[v] = D[u] + e.L; }
  }
  return D;
}
const DEST = [], MINOR = [];
function setupPlaces() {
  for (const [hi, en, la, ln] of PLACES) {
    const rn = snapToRoad(llToW(la, ln)); if (!rn) continue;
    DEST.push({ hi, en, ed: rn.ed, s: rn.s, D: distFrom(rn.ed, rn.s) });
  }
  // every named place in the village is a minor destination, so each branch of a junction can be named
  for (const [name, mx, mz, cat] of WD.pois) {
    const p = toW(mx, mz); if (!inVillage(p.x, p.z)) continue;
    const rn = roadNear(p.x, p.z); if (!rn || rn.d > 40 || DEST.some(d => d.en === name)) continue;
    MINOR.push({ hi: name, en: { shop: 'दुकान · shop', temple: 'मंदिर · temple', school: 'विद्यालय · school', medical: 'दवा · medical', home: 'निवास · home', chowk: 'चौक · chowk' }[cat] || '', ed: rn.ed, s: rn.s, D: distFrom(rn.ed, rn.s), minor: true });
  }
  // road names: the district roads by where they run; village lanes by their nearest landmark
  const mainSeen = new Set();
  const nearPOI = (p) => { let best = null, bd = 1e9; for (const [name, mx, mz] of WD.pois) { const q = toW(mx, mz), d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = name; } } return bd < 120 ? best : null; };
  const kush = llToW(25.743978, 85.8707516), pul = llToW(25.7520679, 85.8785414);
  for (const ed of EDGES) {
    const mid = ed.P[Math.floor(ed.P.length / 2)];
    if (ed.main) {
      const latDeg = LAT0 - (mid.z + WH / 2) / KY / 212473;
      const nearKP = ed.P.some(p => Math.hypot(p.x - kush.x, p.z - kush.z) < 1200 && Math.hypot(p.x - pul.x, p.z - pul.z) < 2500);
      ed.name = latDeg < 25.7345 && !nearKP ? 'शाहपुर पतोही – चकहबीब रोड · Shahpur Patohi – Chakhabib Road' : 'दलसिंहसराय – अंगारघाट रोड · Dalsinghsarai – Angarghat Road';
    } else { const n = nearPOI(mid); ed.name = n ? `गली · ${n} के पास` : 'केराई की गली · Kerai village lane'; }
  }
}
function distTo(dest, ed, s, dir) {           // road distance from a rider on ed at s heading dir
  if (dest.ed === ed && (dest.s - s) * dir >= 0) return Math.abs(dest.s - s);
  return dir > 0 ? ed.L - s + dest.D[ed.b] : s + dest.D[ed.a];
}

// ---------- Milestones (white stones with an orange cap, like PMGSY village-road stones) ----------
function buildMilestones() {
  const faces = [];
  for (const ed of EDGES) {
    if (ed.L < 120) continue;
    for (let s = 60; s < ed.L - 30; s += 220) {
      const mid = edgeAt(ed, s, 0); if (!inVillage(mid.x, mid.z)) continue;
      for (const dir of [1, -1]) {
        let best = null;
        for (const d of DEST) { const dd = distTo(d, ed, s, dir); if (dd > 90 && (!best || dd < best.dd)) best = { d, dd }; }
        if (best) faces.push({ ed, s, dir, best });
      }
    }
  }
  const PER = 16, FW = 256, FH = 320, atlases = [];
  for (let a = 0; a * PER < faces.length; a++) {
    const c = document.createElement('canvas'); c.width = FW * 4; c.height = FH * 4; const g = c.getContext('2d');
    faces.slice(a * PER, a * PER + PER).forEach((f, k) => {
      const x = (k % 4) * FW, y = Math.floor(k / 4) * FH;
      g.fillStyle = '#f4f2ea'; g.fillRect(x, y, FW, FH);
      g.fillStyle = '#e8711c'; g.beginPath(); g.moveTo(x, y + 110); g.lineTo(x, y + 60); g.quadraticCurveTo(x + FW / 2, y - 20, x + FW, y + 60); g.lineTo(x + FW, y + 110); g.fill();
      g.fillStyle = '#1b1b1b'; g.textAlign = 'center';
      const fit = (t, size, yy, wt = 'bold') => { let s = size; do { g.font = `${wt} ${s}px ${FONT}`; s -= 2; } while (g.measureText(t).width > FW - 24 && s > 14); g.fillText(t, x + FW / 2, yy); };
      g.fillStyle = '#fff'; fit(f.best.d.hi, 34, y + 92);
      g.fillStyle = '#1b1b1b'; fit(f.best.d.en, 26, y + 160, '600');
      const dd = f.best.dd; fit(dd >= 1000 ? (dd / 1000).toFixed(1) + ' km' : Math.round(dd / 10) * 10 + ' m', 52, y + 240);
      speckle(g, 0, 0, 0, [], 1);
      g.fillStyle = 'rgba(0,0,0,0.06)'; for (let k2 = 0; k2 < 300; k2++) g.fillRect(x + Math.random() * FW, y + Math.random() * FH, 2, 2);
      f.atlas = a; f.u0 = (k % 4) / 4; f.v0 = 1 - (Math.floor(k / 4) + 1) / 4;
    });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    atlases.push(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  }
  const stoneGeo = new THREE.BoxGeometry(0.2, 0.95, 0.62); stoneGeo.translate(0, 0.475, 0);       // thin along the road, faces the traffic
  const capGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.2, 20); capGeo.rotateZ(Math.PI / 2); capGeo.translate(0, 0.95, 0);
  const stoneM = M('#efede5', 0.9), capM = M('#e8711c', 0.8);
  const byStone = {};
  for (const f of faces) { const k = f.ed.id + ':' + f.s; (byStone[k] = byStone[k] || []).push(f); }
  for (const list of Object.values(byStone)) {
    const f0 = list[0], ed = f0.ed, side = ed.half + 0.8;
    const p = edgeAt(ed, f0.s, side), yaw = edgeYaw(ed, f0.s, 1);
    const g = new THREE.Group(); g.position.copy(p); g.rotation.y = yaw + Math.PI / 2;     // faces along the road both ways
    g.add(new THREE.Mesh(stoneGeo, stoneM), new THREE.Mesh(capGeo, capM));
    for (const f of list) {
      const pg = new THREE.PlaneGeometry(0.6, 0.75), uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, f.u0 + uv.getX(i) * 0.25, f.v0 + uv.getY(i) * 0.25);
      const pm = new THREE.Mesh(pg, atlases[f.atlas]); pm.position.set(0, 0.57, 0);
      // the face readable by a rider travelling in f.dir looks back along -dir
      pm.rotation.y = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2; pm.position.x = f.dir > 0 ? 0.105 : -0.105;
      g.add(pm);
    }
    scene.add(g); addObstacle(p.x, p.z, 0.4, 'मील के पत्थर से टक्कर! Hit a milestone!');
  }
  return faces.length;
}

// ---------- Roadside junction signs; route arrows guide the rider without a floating screen copy ----------
const jBoard = { group: null, node: -1, tex: null, canvas: null, t: 0 };
function makeJunctionBoard() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 520;
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.15 });
  const board = mesh(new THREE.PlaneGeometry(4.6, 2.34), bm, 0, 3.3, 0.03);
  const back = mesh(new THREE.PlaneGeometry(4.6, 2.34), M('#5b6066', 0.6, 0.5), 0, 3.3, -0.01); back.rotation.y = Math.PI;
  g.add(board, back, cyl(0.07, 0.07, 4.5, M('#8a8f94', 0.4, 0.7), -2.0, 2.25, -0.04), cyl(0.07, 0.07, 4.5, M('#8a8f94', 0.4, 0.7), 2.0, 2.25, -0.04));
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.visible = false; g.userData.jb = true; scene.add(g);
  Object.assign(jBoard, { group: g, tex, canvas: c });
}
// does leaving `node` along edge `o` lead only into a dead end (no loop back, no way off the map)?
const nearMapEdge = p => p.x < -WW / 2 + 30 || p.x > WW / 2 - 290 || p.z < -WH / 2 + 30 || p.z > WH / 2 - 250;
const deadCache = new Map();
function deadBranch(node, o) {
  const key = node + ':' + o.id; if (deadCache.has(key)) return deadCache.get(key);
  const far = o.a === node ? o.b : o.a, seen = new Set([far]), st = [far]; let res = true;
  while (st.length && res) {
    const u = st.pop();
    if (ADJ[u].length === 1 && nearMapEdge(NODES[u])) { res = false; break; }
    for (const e of ADJ[u]) { const v = e.a === u ? e.b : e.a;
      if (v === node) { if (e !== o) { res = false; break; } continue; }
      if (!seen.has(v)) { seen.add(v); st.push(v); } }
    if (seen.size > 400) res = false;
  }
  deadCache.set(key, res ? seen : false); return res ? seen : false;
}
const DEAD = { hi: 'बंद गली', en: 'Dead end · no through road' };
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function updateJunctionBoard(dt) {
  if (!jBoard.group) makeJunctionBoard();
  jBoard.t -= dt; if (jBoard.t > 0) return; jBoard.t = 0.25;
  const hide = () => { if ((jBoard.linger -= 0.25) > 0) return; jBoard.group.visible = jBoard.shown = false; };
  const rn = player.rn; if (!rn || rn.d > rn.ed.half + 3) { hide(); return; }
  const ed = rn.ed, dir = Math.cos(edgeYaw(ed, rn.s, 1) - player.h) > 0 ? 1 : -1;
  const node = dir > 0 ? ed.b : ed.a, dn = dir > 0 ? ed.L - rn.s : rn.s;
  const outs = ADJ[node].filter(e => e !== ed);
  if (dn > 120 || outs.length < 2) { hide(); return; }   // only real junctions get a board; it stays up through the turn and a moment after
  jBoard.linger = 1.75;
  if (jBoard.node === node + ':' + ed.id && jBoard.shown) return;
  jBoard.node = node + ':' + ed.id;
  // for each way out of the junction: the closest destination whose best route leaves that way
  const inYaw = edgeYaw(ed, dir > 0 ? ed.L : 0, dir);
  const rows = outs.map(o => {
    const fromA = o.a === node, oyaw = edgeYaw(o, fromA ? Math.min(6, o.L) : Math.max(0, o.L - 6), fromA ? 1 : -1);
    const turn = angDiff(oyaw, inYaw), idx = ((Math.round(-turn / (Math.PI / 4)) % 8) + 8) % 8;
    return { o, fromA, arrow: ARROWS[idx], turn, dests: [], dead: deadBranch(node, o) };
  });
  const allDest = target && target.dest ? [target.dest, ...DEST] : DEST;
  for (const d of allDest) {
    let best = null;
    for (const r of rows) {
      const far = r.fromA ? r.o.b : r.o.a;
      const dd = d.ed === r.o ? (r.fromA ? d.s : r.o.L - d.s) : r.o.L + d.D[far];
      if (!best || dd < best.dd) best = { r, dd };
    }
    const viaHere = distTo(d, ed, rn.s, dir) - dn;
    if (best && best.dd < 9000 && best.dd > 25 && Math.abs(best.dd - viaHere) < 1) best.r.dests.push({ d, dd: best.dd, mission: d === (target && target.dest), major: DEST.includes(d) });
  }
  // name a branch after the nearest place whose shortest way really is down that branch (never the same place on two arrows)
  const viaRow = (r, d) => { const far = r.fromA ? r.o.b : r.o.a; return d.ed === r.o ? (r.fromA ? d.s : r.o.L - d.s) : r.o.L + d.D[far]; };
  const usedNames = new Set(rows.flatMap(r => r.dests.map(x => x.d)));
  for (const r of rows) if (!r.dests.length) {
    let best = null;
    for (const d of MINOR) {
      if (usedNames.has(d)) continue;
      if (r.dead && d.ed !== r.o && !(r.dead.has(d.ed.a) && r.dead.has(d.ed.b))) continue;
      const dd = viaRow(r, d); if (dd <= 25 || dd >= 1500 || (best && dd >= best.dd)) continue;
      if (rows.some(q => q !== r && viaRow(q, d) < dd - 1)) continue;      // another arrow gets there quicker
      best = { d, dd };
    }
    if (best) usedNames.add(best.d);
    if (best) r.dests.push({ ...best, mission: false });
    else if (r.dead) r.dests.push({ d: DEAD, dd: r.o.L, mission: false });
  }
  rows.forEach(r => r.dests.sort((a, b) => (b.mission - a.mission) || (!!b.major - !!a.major) || a.dd - b.dd));
  const shown = rows.filter(r => r.dests.length).sort((a, b) => b.turn - a.turn).slice(0, 4);   // left to right
  if (!shown.length) { jBoard.group.visible = jBoard.shown = false; return; }
  const g = jBoard.canvas.getContext('2d'), W = 1024, H = 520;
  g.fillStyle = '#0b6e3c'; g.fillRect(0, 0, W, H); g.strokeStyle = '#fff'; g.lineWidth = 12; g.strokeRect(14, 14, W - 28, H - 28);
  const rowH = (H - 60) / shown.length;
  const km = dd => dd >= 1000 ? (dd / 1000).toFixed(1) + ' km' : Math.round(dd / 10) * 10 + ' m';
  shown.forEach((r, i) => {
    const y0 = 30 + i * rowH, top = r.dests[0], list = r.dests.slice(0, 3);
    if (top.mission) { g.fillStyle = '#ffd54f'; g.fillRect(30, y0 + 4, W - 60, rowH - 8); }
    else if (r.dead) { g.fillStyle = '#7a1d1d'; g.fillRect(30, y0 + 4, W - 60, rowH - 8); }
    if (i) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(40, y0, W - 80, 3); }
    g.fillStyle = top.mission ? '#1b1b1b' : '#ffffff'; g.textBaseline = 'middle';
    g.font = `bold ${Math.min(110, rowH * 0.8)}px sans-serif`; g.textAlign = 'center'; g.fillText(r.arrow, 100, y0 + rowH / 2);
    const lh = (rowH - 10) / list.length;
    list.forEach((it, k) => {
      const y = y0 + 5 + lh * (k + 0.5), big = k === 0, fs0 = Math.min(big ? 46 : 34, lh * (big ? 0.62 : 0.56));
      const name = (it.mission ? '🎯 ' : '') + it.d.hi + (it.d.en && it.d.en !== it.d.hi && it.d !== DEAD ? ' · ' + it.d.en : '') + (r.dead && it.d !== DEAD ? ' ⛔' : '');
      let fs = fs0; g.textAlign = 'left'; do { g.font = `${big ? 'bold' : '600'} ${fs}px ${FONT}`; fs -= 2; } while (g.measureText(name).width > 640 && fs > 16);
      g.fillStyle = it.mission ? '#1b1b1b' : big ? '#ffffff' : 'rgba(255,255,255,0.85)'; g.fillText(name, 175, y);
      g.textAlign = 'right'; g.font = `bold ${Math.min(big ? 44 : 32, lh * 0.55)}px ${FONT}`; g.fillText(km(it.dd), W - 46, y);
    });
  });
  jBoard.tex.needsUpdate = true;
  // stand on the left verge, 12 m before the junction, facing the rider
  // never on a carriageway: try the left verge, then the right, then further back; otherwise leave the road clear
  const onRoad = (q) => { const r = roadNear(q.x, q.z); return r && r.d < r.ed.half + 0.8; };
  let spot = null;
  for (const back of [12, 22, 32]) for (const side of [1, -1]) {
    if (spot || back > ed.L - 2) continue;
    const sb = dir > 0 ? ed.L - back : back, yaw = edgeYaw(ed, sb, dir), p = edgeAt(ed, sb, dir * side * (ed.half + 3.25));   // the 4.6 m board stands wholly beyond the road edge
    const ox = Math.cos(yaw) * 2.3, oz = -Math.sin(yaw) * 2.3;                 // the board's two ends
    if (!onRoad(p) && !onRoad({ x: p.x + ox, z: p.z + oz }) && !onRoad({ x: p.x - ox, z: p.z - oz }) && !cellAt(p.x, p.z)) spot = { p, yaw };
  }
  if (spot) { jBoard.group.position.copy(spot.p); jBoard.group.rotation.y = spot.yaw + Math.PI; }
  jBoard.group.visible = !!spot;
  jBoard.shown = true;
}

// ---------- Start: where the Dalsinghsarai – Angarghat road enters Kerai, by the Shahpur Patohi road ----------
function findStartEdge() {
  const ref = llToW(25.7335, 85.8625); let best = null;
  for (const ed of EDGES) {
    if (!ed.main) continue;
    for (let i = 1; i < ed.P.length; i++) {
      const a = inVillage(ed.P[i - 1].x, ed.P[i - 1].z), b = inVillage(ed.P[i].x, ed.P[i].z);
      if (a === b) continue;
      const d = ed.P[i].distanceTo(ref);
      if (!best || d < best.d) best = { d, ed, i, dir: b ? 1 : -1 };
    }
  }
  if (!best) return null;
  const s = clamp(best.i * best.ed.step + best.dir * 12, 2, best.ed.L - 2);
  return { ed: best.ed, s, dir: best.dir };
}

// ---------- Edge of the mapped area: a barricade and sign where a road leaves the map ----------
function buildMapEdges() {
  let n = 0, n2 = 0; const endBoards = [];
  const signTex = canvasTex(1024, 384, (c) => {
    c.fillStyle = '#b71c1c'; c.fillRect(0, 0, 1024, 384); c.strokeStyle = '#fff'; c.lineWidth = 14; c.strokeRect(12, 12, 1000, 360);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold 92px ${FONT}`; c.fillText('⛔ नक्शे का अंत', 512, 150);
    c.font = `bold 64px ${FONT}`; c.fillText('End of the Kerai map · वापस मुड़ें', 512, 260); c.font = `48px ${FONT}`; c.fillText('Turn back', 512, 330);
  });
  const stripe = canvasTex(256, 32, (c) => { for (let x = 0; x < 256; x += 32) { c.fillStyle = (x / 32) % 2 ? '#ffffff' : '#d32f2f'; c.fillRect(x, 0, 32, 32); } }, true);
  NODES.forEach((p, i) => {
    if (ADJ[i].length !== 1) return;
    const nearEdge = p.x < -WW / 2 + 30 || p.x > WW / 2 - 290 || p.z < -WH / 2 + 30 || p.z > WH / 2 - 250;
    if (!nearEdge) { if (ADJ[i][0].L > 25) endBoards.push(i); return; }
    const ed = ADJ[i][0], atA = ed.a === i, s = clamp(atA ? 8 : ed.L - 8, 0, ed.L), dirOut = atA ? -1 : 1;
    const c = edgeAt(ed, s, 0), yaw = edgeYaw(ed, s, dirOut), g = new THREE.Group(); g.position.copy(c); g.rotation.y = yaw;
    const w = ed.half * 2 + 2;
    const bar = box(w, 0.18, 0.12, new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 }), 0, 1.0, 0); bar.material.map.repeat.set(w / 2, 1); g.add(bar);
    for (const x of [-w / 2, w / 2]) g.add(cyl(0.08, 0.1, 1.2, M('#eeeeee', 0.5), x, 0.6, 0));
    const sg = mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, side: THREE.DoubleSide }), 0, 2.3, 0.05); sg.rotation.y = Math.PI; g.add(sg);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
    for (let k = -w / 2; k <= w / 2; k += 1) { const q = edgeAt(ed, s, k); addObstacle(q.x, q.z, 0.6, 'नक्शे का अंत! End of the map — turn back'); }
    n++;
  });
  // a real village dead end: yellow/black chevron board "road ends here", so it reads as the end of the lane, not a glitch
  const endTex = canvasTex(512, 256, (c) => {
    c.fillStyle = '#ffd600'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#111';
    for (let x = -256; x < 512; x += 64) { c.beginPath(); c.moveTo(x, 256); c.lineTo(x + 32, 256); c.lineTo(x + 160, 128); c.lineTo(x + 128, 128); c.fill(); }
    c.fillStyle = '#ffd600'; c.fillRect(20, 20, 472, 108); c.fillStyle = '#111'; c.textAlign = 'center';
    c.font = `bold 58px ${FONT}`; c.fillText('रास्ता समाप्त', 256, 76); c.font = `bold 30px ${FONT}`; c.fillText('Road ends here', 256, 116);
  });
  const endMat = new THREE.MeshStandardMaterial({ map: endTex, roughness: 0.6, side: THREE.DoubleSide }), postMat = M('#555555', 0.6);
  for (const i of endBoards) {
    const ed = ADJ[i][0], atA = ed.a === i, s = clamp(atA ? 2 : ed.L - 2, 0, ed.L), dirOut = atA ? -1 : 1;
    const g = new THREE.Group(); g.position.copy(edgeAt(ed, s, 0)); g.rotation.y = edgeYaw(ed, s, dirOut);
    const sg = mesh(new THREE.PlaneGeometry(2.6, 1.3), endMat, 0, 1.75, 0); sg.rotation.y = Math.PI; g.add(sg);
    for (const x of [-1.15, 1.15]) g.add(cyl(0.05, 0.05, 1.2, postMat, x, 0.6, 0.02));
    g.userData = { c: g.position, cast: false }; CHUNKED.push(g); scene.add(g); n2++;
  }
  console.log('map-edge barricades', n, 'dead-end boards', n2);
  return n;
}

// ---------- Always-on directions: which way at the next junction for each of Kerai's main places ----------
let dirT = 0;
const TURN_TXT = { '↑': 'सीधे', '↗': 'दाएँ', '→': 'दाएँ', '↘': 'दाएँ', '↓': 'पीछे', '↙': 'बाएँ', '←': 'बाएँ', '↖': 'बाएँ' };
function updateDirections(dt) {
  if ((dirT -= dt) > 0) return; dirT = 0.4;
  const el = $('dirs'); if (!el) return;
  const rn = player.rn; if (!rn) { el.style.display = 'none'; return; }
  const ed = rn.ed, dir = Math.cos(edgeYaw(ed, rn.s, 1) - player.h) > 0 ? 1 : -1, node = dir > 0 ? ed.b : ed.a, dn = dir > 0 ? ed.L - rn.s : rn.s;
  const inYaw = edgeYaw(ed, dir > 0 ? ed.L : 0, dir), outs = ADJ[node].filter(e => e !== ed);
  const list = (target && target.dest && !DEST.includes(target.dest) ? [target.dest, ...DEST] : DEST).map(d => {
    const ahead = distTo(d, ed, rn.s, dir), behind = distTo(d, ed, rn.s, -dir);
    let arrow = '↑', how;
    if (behind + 40 < ahead) { arrow = '↓'; how = 'पीछे मुड़ें · turn back'; }
    else if (d.ed === ed && (d.s - rn.s) * dir >= 0) { how = 'इसी सड़क पर · on this road'; }
    else if (outs.length >= 2) {
      let best = null; for (const o of outs) { const fromA = o.a === node, far = fromA ? o.b : o.a, dd = d.ed === o ? (fromA ? d.s : o.L - d.s) : o.L + d.D[far]; if (!best || dd < best.dd) best = { o, fromA, dd }; }
      const oyaw = edgeYaw(best.o, best.fromA ? Math.min(6, best.o.L) : Math.max(0, best.o.L - 6), best.fromA ? 1 : -1), turn = angDiff(oyaw, inYaw);
      arrow = ARROWS[((Math.round(-turn / (Math.PI / 4)) % 8) + 8) % 8];
      how = (arrow === '↑' ? 'सीधे · straight' : turn > 0 ? 'बाएँ · left' : 'दाएँ · right') + (dn < 15 ? ' · अभी now' : ` ${dn < 1000 ? Math.round(dn / 10) * 10 + ' m' : (dn / 1000).toFixed(1) + ' km'} आगे`);
    } else how = 'सड़क पर चलते रहें · keep going';
    return { d, dd: Math.min(ahead, behind), arrow, how, mission: target && d === target.dest };
  }).filter(x => x.dd > 30).sort((a, b) => (b.mission - a.mission) || a.dd - b.dd).slice(0, 5);
  el.innerHTML = '<div class="dh">दिशा · Directions</div>' + list.map(x => `<div class="dr${x.mission ? ' dm' : ''}"><span class="da">${x.arrow}</span><span class="dn">${x.d.hi}<small>${x.how}</small></span><span class="dd">${x.dd >= 1000 ? (x.dd / 1000).toFixed(1) + ' km' : Math.round(x.dd / 10) * 10 + ' m'}</span></div>`).join('');
  el.style.display = 'block';
}

// ---------- Splash particles ----------
const SPL = 400; const splGeo = new THREE.BufferGeometry(); const splPos = new Float32Array(SPL * 3).fill(-10); const splVel = new Float32Array(SPL * 3); const splLife = new Float32Array(SPL);
splGeo.setAttribute('position', new THREE.BufferAttribute(splPos, 3));
const splash = new THREE.Points(splGeo, new THREE.PointsMaterial({ color: '#c9c3b0', size: 0.09, transparent: true, opacity: 0.8 })); splash.frustumCulled = false; scene.add(splash);
let splNext = 0;
function emitSplash(x, z, v, n = 14) {
  for (let k = 0; k < n; k++) {
    const i = splNext = (splNext + 1) % SPL;
    splPos[i * 3] = x + rand(-0.3, 0.3); splPos[i * 3 + 1] = 0.1; splPos[i * 3 + 2] = z + rand(-0.3, 0.3);
    splVel[i * 3] = rand(-1.5, 1.5); splVel[i * 3 + 1] = rand(1.5, 3.5) * Math.min(1.5, v / 10); splVel[i * 3 + 2] = rand(-1.5, 1.5); splLife[i] = rand(0.4, 0.9);
  }
}
function updateSplash(dt) {
  for (let i = 0; i < SPL; i++) {
    if (splLife[i] <= 0) { splPos[i * 3 + 1] = -10; continue; }
    splLife[i] -= dt; splVel[i * 3 + 1] -= 9.8 * dt;
    for (let a = 0; a < 3; a++) splPos[i * 3 + a] += splVel[i * 3 + a] * dt;
    if (splPos[i * 3 + 1] < 0.05) splLife[i] = 0;
  }
  splGeo.attributes.position.needsUpdate = true;
}
function inPuddle(x, z) {
  for (const p of puddles) {
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if ((lx / p.rx) ** 2 + (lz / p.rz) ** 2 < 1) return true;
  }
  return false;
}

// ---------- Audio (synthesised, no files) ----------
let AC = null, eng = null, sirenOsc = null, sirenGain = null;
function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const o = AC.createOscillator(); o.type = 'sawtooth';
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
  const gn = AC.createGain(); gn.gain.value = 0.05; o.connect(f).connect(gn).connect(AC.destination); o.start();
  eng = { o, gn };
  sirenOsc = AC.createOscillator(); sirenOsc.type = 'sine'; sirenGain = AC.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain).connect(AC.destination); sirenOsc.start();
}
function beep(freqs, dur, type = 'square', vol = 0.08) {
  if (!AC) return;
  for (const fr of freqs) {
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = fr;
    g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  }
}
function noise(dur, vol = 0.3) {
  if (!AC) return;
  const b = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = AC.createBufferSource(), g = AC.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(AC.destination); s.start();
}



// ---------- Place labels ----------
const POI_STYLE = { shop: ['#1a73e8', '🛒'], temple: ['#e8710a', '🛕'], school: ['#8d6e63', '🎓'], medical: ['#d93025', '✚'], home: ['#5f6368', '🏠'], chowk: ['#7b1fa2', '◎'], other: ['#188038', '📍'] };
const poiLabels = [];
function poiSprite(name, cat) {
  const [color, icon] = POI_STYLE[cat] || POI_STYLE.other;
  const c = document.createElement('canvas'); const g = c.getContext('2d'); const fs = 50;
  g.font = `700 ${fs}px ${FONT}`; const tw = g.measureText(name).width;
  c.width = Math.ceil(tw + 150); c.height = 150;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
  g.fillStyle = 'rgba(255,255,255,0.96)'; rr(6, 8, c.width - 12, 80, 40); g.fill(); g.shadowColor = 'transparent';
  g.fillStyle = color; g.beginPath(); g.arc(48, 48, 34, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(c.width / 2 - 16, 86); g.lineTo(c.width / 2 + 16, 86); g.lineTo(c.width / 2, 146); g.closePath(); g.fill();
  g.font = `34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(icon, 48, 50);
  g.font = `700 ${fs}px ${FONT}`; g.textAlign = 'left'; g.fillStyle = '#1b1b1b'; g.fillText(name, 96, 50);
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, sizeAttenuation: false }));
  sp.center.set(0.5, 0.02); sp.renderOrder = 10; const H = 0.05; sp.scale.set(H * c.width / c.height, H, 1);
  return sp;
}
function addLabels() {
  for (const [name, mx, mz, cat] of WD.pois) {
    const p = toW(mx, mz), sp = poiSprite(name, cat);
    sp.position.set(p.x, heightAt(p.x, p.z) + 2.2, p.z); sp.visible = false; scene.add(sp);
    poiLabels.push({ sp, name, cat, p });
  }
}
let labelsOn = true;
const _cf = new THREE.Vector3();
function updateLabels() {
  camera.getWorldDirection(_cf);
  const cand = [];
  for (const L of poiLabels) {
    L.sp.visible = false; if (!labelsOn) continue;
    const dx = L.p.x - camera.position.x, dz = L.p.z - camera.position.z, d = Math.hypot(dx, dz);
    if (d < 170 && (dx * _cf.x + dz * _cf.z) > 4) cand.push([d, L]);
  }
  cand.sort((a, b) => a[0] - b[0]).slice(0, 7).forEach(([d, L]) => { L.sp.visible = true; L.sp.material.opacity = d > 130 ? (170 - d) / 40 : 1; });
}

// ---------- Coins (spinning gold ₹ coins along every road of the village) ----------
const coinXZ = [], coinGrid = {}, CG = 16;
let coinMesh, coinAlive, coinsTotal = 0, coinsGot = 0, coinTimeU = { value: 0 };
const coinFace = canvasTex(128, 128, (c, w, h) => {
  const gr = c.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, 64); gr.addColorStop(0, '#ffe680'); gr.addColorStop(0.75, '#f2b705'); gr.addColorStop(1, '#a87400');
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#8a5d00'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h / 2, 52, 0, 7); c.stroke();
  c.fillStyle = '#8a5d00'; c.font = `bold 72px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('₹', w / 2, h / 2 + 4);
});
function spinMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = coinTimeU;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
        #else
          float ph = 0.0;
        #endif
        float sa = sin(uTime * 3.2 + ph), ca = cos(uTime * 3.2 + ph);
        vec3 objectNormal = vec3(normal.x * ca + normal.z * sa, normal.y, -normal.x * sa + normal.z * ca);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x * ca + position.z * sa, position.y + sin(uTime * 2.0 + ph) * 0.08, -position.x * sa + position.z * ca);');
  };
  return mat;
}
function buildCoins() {
  for (const ed of EDGES) {
    for (let s = 12; s < ed.L - 8; s += 34) {
      const mid = edgeAt(ed, s, 0); if (!inVillage(mid.x, mid.z)) continue;
      const pat = hash2(ed.id, s), lane = (Math.floor(hash2(s, ed.id) * 3) - 1) * ed.half * 0.5;
      for (let k = 0; k < 6; k++) {
        const ss = s + k * 2.3; if (ss > ed.L - 3) break;
        const lat = pat < 0.3 ? Math.sin(k * 0.9 + pat * 9) * ed.half * 0.55 : lane;
        const p = edgeAt(ed, ss, lat); if (cellAt(p.x, p.z)) continue;
        const idx = coinXZ.length / 2; coinXZ.push(p.x, p.z);
        const key = Math.floor(p.x / CG) + ',' + Math.floor(p.z / CG); (coinGrid[key] = coinGrid[key] || []).push(idx);
      }
    }
  }
  coinsTotal = coinXZ.length / 2; coinAlive = new Uint8Array(coinsTotal).fill(1);
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 28); g.rotateX(Math.PI / 2);
  const mat = spinMaterial(new THREE.MeshStandardMaterial({ map: coinFace, color: '#ffffff', metalness: 0.8, roughness: 0.28, envMap, envMapIntensity: 1.2, emissive: '#6a4700', emissiveIntensity: 0.55 }));
  coinMesh = new THREE.InstancedMesh(g, mat, coinsTotal);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < coinsTotal; i++) { m4.makeTranslation(coinXZ[i * 2], 1.0, coinXZ[i * 2 + 1]); coinMesh.setMatrixAt(i, m4); }
  coinMesh.frustumCulled = false; scene.add(coinMesh);
}
function resetCoins() {
  const m4 = new THREE.Matrix4(); coinAlive.fill(1); coinsGot = 0;
  for (let i = 0; i < coinsTotal; i++) { m4.makeTranslation(coinXZ[i * 2], 1.0, coinXZ[i * 2 + 1]); coinMesh.setMatrixAt(i, m4); }
  coinMesh.instanceMatrix.needsUpdate = true;
}
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
function collectCoins() {
  if (player.y > 2.2) return;
  const cx = Math.floor(player.pos.x / CG), cz = Math.floor(player.pos.z / CG); let got = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const l = coinGrid[(cx + a) + ',' + (cz + b)]; if (!l) continue;
    for (const i of l) if (coinAlive[i] && (coinXZ[i * 2] - player.pos.x) ** 2 + (coinXZ[i * 2 + 1] - player.pos.z) ** 2 < 1.6 * 1.6) {
      coinAlive[i] = 0; coinMesh.setMatrixAt(i, _zero); got++; sparkle(coinXZ[i * 2], 1.0, coinXZ[i * 2 + 1], '#ffd54f');
    }
  }
  if (got) {
    coinMesh.instanceMatrix.needsUpdate = true; coinsGot += got; score += got;
    streakT = 1.2; streak += got; beep([1320 + Math.min(streak, 12) * 40, 1980], 0.12, 'triangle', 0.05);
    bump('coins');
  }
}

// ---------- Stopwatches (+time) and landmark missions ----------
const clocks = [];
function buildClocks() {
  const body = new THREE.Group();
  const face = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill(); c.strokeStyle = '#0d47a1'; c.lineWidth = 10; c.stroke(); c.fillStyle = '#0d47a1'; c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+15', 64, 66); });
  let acc = 0;
  for (const ed of EDGES) {
    for (let s = 20; s < ed.L - 10; s += 10) {
      acc += 10; if (acc < 380) continue;
      const p = edgeAt(ed, s, 0); if (!inVillage(p.x, p.z) || cellAt(p.x, p.z)) continue;
      acc = 0;
      const g = new THREE.Group(); g.position.set(p.x, 1.3, p.z);
      const disk = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 32), [M('#1565c0', 0.3, 0.5), new THREE.MeshStandardMaterial({ map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.35 }), new THREE.MeshStandardMaterial({ map: face, emissive: '#ffffff', emissiveMap: face, emissiveIntensity: 0.35 })]);
      disk.rotation.x = Math.PI / 2; g.add(disk, cyl(0.08, 0.08, 0.2, M('#1565c0', 0.3, 0.5), 0, 0.65, 0));
      const halo = mesh(new THREE.RingGeometry(0.7, 0.85, 32), new THREE.MeshBasicMaterial({ color: '#64b5f6', transparent: true, opacity: 0.55, side: THREE.DoubleSide })); g.add(halo);
      scene.add(g); clocks.push({ g, x: p.x, z: p.z, alive: true });
    }
  }
}
function updateClocks(dt) {
  for (const c of clocks) {
    if (!c.alive) continue;
    c.g.rotation.y += dt * 2; c.g.position.y = 1.3 + Math.sin(raceT * 2.5 + c.x) * 0.12;
    if ((c.x - player.pos.x) ** 2 + (c.z - player.pos.z) ** 2 < 2.2 * 2.2 && player.y < 2.5) {
      c.alive = false; c.g.visible = false; timeLeft += 15; say('+15 सेकंड! +15 s', 1.2, '#90caf9'); beep([880, 1175, 1568], 0.25, 'sine', 0.06); bump('time');
      sparkle(c.x, 1.3, c.z, '#64b5f6', 30);
    }
  }
}
let target = null, beacon = null, missions = 0;
function makeBeacon() {
  const g = new THREE.Group();
  const beam = mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd54f', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 30; g.add(beam);
  const tok = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.16, 40), spinMaterial(new THREE.MeshStandardMaterial({ map: coinFace, metalness: 0.85, roughness: 0.25, envMap, emissive: '#7a5200', emissiveIntensity: 0.7 })));
  tok.geometry.rotateX(Math.PI / 2); tok.position.y = 2.2; g.add(tok);
  const ring = mesh(new THREE.RingGeometry(3.2, 3.8, 48), new THREE.MeshBasicMaterial({ color: '#ffca28', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  scene.add(g); return g;
}
function nextTarget() {
  const cands = poiLabels.filter(L => inVillage(L.p.x, L.p.z) && (!target || L !== target.L)).map(L => {
    const rn = roadNear(L.p.x, L.p.z); if (!rn || rn.d > 45) return null;
    const at = edgeAt(rn.ed, rn.s, 0); const d = at.distanceTo(player.pos);
    return d > 150 ? { L, at, d } : null;
  }).filter(Boolean);
  const nearBand = cands.filter(c => c.d < 750);
  const pickT = nearBand.length ? pick(nearBand) : cands.sort((a, b) => a.d - b.d)[0] || null;
  if (!pickT) { target = null; if (beacon) beacon.visible = false; return; }
  const rn2 = roadNear(pickT.at.x, pickT.at.z); pickT.dest = { hi: pickT.L.name, en: 'Mission · मिशन', ed: rn2.ed, s: rn2.s, D: distFrom(rn2.ed, rn2.s) }; jBoard.node = -1;
  target = pickT; if (!beacon) beacon = makeBeacon(); beacon.visible = true; beacon.position.copy(pickT.at);
  say(`🎯 अगला: ${pickT.L.name}`, 2.2, '#ffe082');
}
function updateTarget(dt) {
  if (!target) return;
  beacon.children[2].scale.setScalar(1 + Math.sin(raceT * 4) * 0.08);
  if (target.at.distanceTo(player.pos) < 4.5 && player.y < 3) {
    missions++; score += 25; coinsGot += 0; timeLeft += 20;
    say(`मिशन पूरा! ${target.L.name}  +25 ★  +20 s`, 2.4, '#ffd54f'); beep([660, 880, 1320, 1760], 0.35, 'triangle', 0.07); bump('coins'); bump('time');
    sparkle(target.at.x, 2.2, target.at.z, '#ffca28', 60);
    nextTarget();
  }
}

// ---------- Sparkles ----------
const SPK = 600, spkGeo = new THREE.BufferGeometry(), spkPos = new Float32Array(SPK * 3).fill(-50), spkVel = new Float32Array(SPK * 3), spkLife = new Float32Array(SPK), spkCol = new Float32Array(SPK * 3);
spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3)); spkGeo.setAttribute('color', new THREE.BufferAttribute(spkCol, 3));
const spk = new THREE.Points(spkGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); spk.frustumCulled = false; scene.add(spk);
let spkN = 0; const _sc = new THREE.Color();
function sparkle(x, y, z, color, n = 12) {
  _sc.set(color);
  for (let k = 0; k < n; k++) { const i = spkN = (spkN + 1) % SPK; spkPos.set([x, y, z], i * 3); spkVel.set([rand(-2, 2), rand(1, 4), rand(-2, 2)], i * 3); spkLife[i] = rand(0.4, 0.8); spkCol.set([_sc.r, _sc.g, _sc.b], i * 3); }
}
function updateSparkles(dt) {
  for (let i = 0; i < SPK; i++) { if (spkLife[i] <= 0) { spkPos[i * 3 + 1] = -50; continue; } spkLife[i] -= dt; spkVel[i * 3 + 1] -= 6 * dt; for (let a = 0; a < 3; a++) spkPos[i * 3 + a] += spkVel[i * 3 + a] * dt; }
  spkGeo.attributes.position.needsUpdate = true;
}

// ---------- Cows & goats: tied up in front of a few houses, never wandering on the road ----------
const ANIMAL_SPOTS = [], animalsLive = [];
function setupAnimals() {
  const cand = [];
  for (const ed of EDGES) {
    for (let s = 6; s < ed.L - 6; s += 7) for (const side of [-1, 1]) {
      const off = ed.half + rand(1.9, 2.8), p = edgeAt(ed, s, side * off);
      if (!inVillage(p.x, p.z) || cellAt(p.x, p.z)) continue;
      const rn = roadNear(p.x, p.z); if (!rn || rn.d < rn.ed.half + 1.5) continue;           // clear of every carriageway
      if (obstaclesNear(p.x, p.z).some(o => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 2)) continue;
      let house = false; for (let k = 3; k <= 9 && !house; k += 1.5) { const q = edgeAt(ed, s, side * (off + k)); if (cellAt(q.x, q.z) === 1) house = true; }
      if (house) cand.push({ x: p.x, z: p.z, ry: edgeYaw(ed, s, 1) + (Math.random() < 0.5 ? 0 : Math.PI), nx: ed.N[Math.round(edgeIdx(ed, s))].x * side, nz: ed.N[Math.round(edgeIdx(ed, s))].z * side });
    }
  }
  cand.sort(() => Math.random() - 0.5);
  const grid = {};
  for (const c of cand) {                                                       // only a few houses keep animals
    const k = Math.floor(c.x / 55) + ',' + Math.floor(c.z / 55); if (grid[k]) continue;
    if (Math.random() > 0.55) continue;
    grid[k] = 1; c.kind = Math.random() < 0.6 ? 'cow' : 'goat'; c.n = c.kind === 'goat' && Math.random() < 0.45 ? 2 : 1; c.trough = c.kind === 'cow' && Math.random() < 0.7;
    ANIMAL_SPOTS.push(c);
  }
  return ANIMAL_SPOTS.length;
}
const ropeMat = new THREE.LineBasicMaterial({ color: '#8d6e45' });
function spawnAnimalsAt(sp) {
  sp.live = [];
  const peg = cyl(0.03, 0.04, 0.45, M('#5d4037', 0.9), 0, 0.22, 0); peg.position.set(sp.x + sp.nx * 0.9, 0.22, sp.z + sp.nz * 0.9); scene.add(peg);
  const extra = [peg];
  if (sp.trough) {                                                              // cement nad (feeding trough) in front of the cow
    const tr = new THREE.Group(); tr.add(box(1.3, 0.38, 0.55, M('#9e9a92', 0.9), 0, 0.19, 0), box(1.15, 0.05, 0.4, M('#6b5a3a', 1), 0, 0.37, 0));
    tr.position.set(sp.x + Math.sin(sp.ry) * 1.6, 0, sp.z + Math.cos(sp.ry) * 1.6); tr.rotation.y = sp.ry + Math.PI / 2; scene.add(tr); extra.push(tr);
  }
  for (let i = 0; i < sp.n; i++) {
    const o = makeCow(sp.kind), a = { ...o, sp, hx: sp.x + i * 0.9 * Math.cos(sp.ry), hz: sp.z - i * 0.9 * Math.sin(sp.ry), yaw: sp.ry + rand(-0.4, 0.4), ph: rand(0, 6), hurtT: 0, vel: V3(0, 0, 0), spin: 0, y: 0, roll: 0, fleeT: 0 };
    a.x = a.hx; a.z = a.hz; a.group.position.set(a.x, 0, a.z); a.group.rotation.y = a.yaw;
    const rg = new THREE.BufferGeometry().setFromPoints([peg.position.clone().setY(0.4), V3(a.x, 0.9, a.z)]); a.rope = new THREE.Line(rg, ropeMat); scene.add(a.rope);
    scene.add(a.group); sp.live.push(a); animalsLive.push(a);
  }
  sp.extra = extra;
}
function despawnAnimalsAt(sp) {
  for (const a of sp.live) { scene.remove(a.group); scene.remove(a.rope); animalsLive.splice(animalsLive.indexOf(a), 1); }
  for (const e of sp.extra) scene.remove(e);
  sp.live = null; sp.extra = null;
}
function scareTied(px, pz, r) {
  for (const a of animalsLive) { const d = Math.hypot(a.x - px, a.z - pz); if (d < r && a.hurtT <= 0) { a.fleeT = 1.2; a.fleeYaw = Math.atan2(a.x - px, a.z - pz); } }
}
function hurtGoat(a) {
  const fx = Math.sin(player.h), fz = Math.cos(player.h), v = Math.abs(player.v);
  a.hurtT = 4.5; a.vel.set(fx * v * 0.45 + rand(-1, 1), 2.2 + v * 0.12, fz * v * 0.45 + rand(-1, 1)); a.spin = rand(6, 11) * (Math.random() < 0.5 ? -1 : 1);
  bleat(); emitSplash(a.x, a.z, 8, 10);
  player.v *= 0.72; player.wobT = 0.7; crashFx.shake = Math.max(crashFx.shake, 0.3);
  heat = Math.min(100, heat + 10); streak = 0;
  say('बकरी को चोट लगी! You hurt a goat!', 2, '#ffab91');
}
function updateAnimals(dt) {
  const px = player.pos.x, pz = player.pos.z;
  for (const sp of ANIMAL_SPOTS) {
    const d = Math.abs(sp.x - px) + Math.abs(sp.z - pz);
    if (!sp.live && d < 170) spawnAnimalsAt(sp); else if (sp.live && d > 230) despawnAnimalsAt(sp);
  }
  const t = performance.now() / 1000;
  for (const a of animalsLive) {
    if (a.hurtT > 0) {                                                          // knocked over: flies, tumbles, lies there, then limps back
      a.hurtT -= dt;
      if (a.y > 0 || a.vel.y > 0) { a.vel.y -= 9.8 * dt; a.x += a.vel.x * dt; a.z += a.vel.z * dt; a.y = Math.max(0, a.y + a.vel.y * dt); a.roll += a.spin * dt; if (a.y === 0) { a.vel.set(0, 0, 0); a.spin = 0; emitSplash(a.x, a.z, 5, 8); } }
      else a.roll = lerp(a.roll, Math.sign(a.roll || 1) * Math.PI / 2, 0.15);   // lying on its side
      if (a.hurtT < 1.2) a.roll = lerp(a.roll, 0, 0.12);
    } else {
      a.roll = lerp(a.roll, 0, 0.2);
      // back to its peg: a slow limp, then graze about the tether
      const hx = a.hx + Math.sin(t * 0.13 + a.ph) * 0.35, hz = a.hz + Math.cos(t * 0.11 + a.ph) * 0.35;
      let tx = hx, tz = hz;
      if (a.fleeT > 0) { a.fleeT -= dt; tx = a.hx + Math.sin(a.fleeYaw) * 1.1; tz = a.hz + Math.cos(a.fleeYaw) * 1.1; }
      const dx = tx - a.x, dz = tz - a.z, dd = Math.hypot(dx, dz), sp = a.fleeT > 0 ? 2.2 : 0.5;
      if (dd > 0.05) { const st = Math.min(dd, sp * dt); a.x += dx / dd * st; a.z += dz / dd * st; }
      const wantYaw = a.fleeT > 0 ? a.fleeYaw : dd > 0.3 ? Math.atan2(dx, dz) : a.sp.ry + Math.sin(t * 0.3 + a.ph) * 0.35;
      a.yaw += angDiff(wantYaw, a.yaw) * damp(dt, a.fleeT > 0 ? 8 : 1.2);
    }
    a.group.position.set(a.x, a.y, a.z); a.group.rotation.set(0, a.yaw, 0); a.group.rotateZ(a.roll);
    if (a.rope) { const p = a.rope.geometry.attributes.position; p.setXYZ(1, a.x, a.y + (a.label === 'goat' ? 0.45 : 0.9), a.z); p.needsUpdate = true; }
    // the rider meets the animal
    if (state !== 'play' || player.crashT > 0 || a.hurtT > 0 || player.y > 0.6) continue;
    const ddx = px - a.x, ddz = pz - a.z, ca = Math.cos(a.yaw), sa = Math.sin(a.yaw);
    const lz = ddx * sa + ddz * ca, lx = ddx * ca - ddz * sa;
    if (Math.abs(lz) < a.L / 2 + 0.5 && Math.abs(lx) < a.W / 2 + 0.35) {
      if (a.label === 'goat') { if (Math.abs(player.v) > 2.5) hurtGoat(a); else { player.v *= 0.5; a.fleeT = 1; a.fleeYaw = Math.atan2(-ddx, -ddz); } }
      else if (Math.abs(player.v) > 4) { crashPlayer('गाय से टक्कर! Hit a cow!', 12); a.fleeT = 1.5; a.fleeYaw = Math.atan2(-ddx, -ddz); moo(); }
      else { player.v = 0; player.pos.x += ddx * 0.08; player.pos.z += ddz * 0.08; }
    }
  }
}
function bleat() { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), l = AC.createOscillator(), lg = AC.createGain(); o.type = 'sawtooth'; o.frequency.value = 560; l.frequency.value = 22; lg.gain.value = 40; l.connect(lg).connect(o.frequency); const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2; g.gain.setValueAtTime(0.0001, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.25, AC.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.7); o.frequency.exponentialRampToValueAtTime(430, AC.currentTime + 0.7); o.connect(f).connect(g).connect(AC.destination); o.start(); l.start(); o.stop(AC.currentTime + 0.75); l.stop(AC.currentTime + 0.75); }
function moo() { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(150, AC.currentTime); o.frequency.linearRampToValueAtTime(120, AC.currentTime + 1); f.type = 'lowpass'; f.frequency.value = 600; g.gain.setValueAtTime(0.0001, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.3, AC.currentTime + 0.15); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 1.1); o.connect(f).connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + 1.15); }

// ---------- Crashes that feel like crashes ----------
const crashFx = { on: false, shake: 0, slowT: 0, pivot: null, rv: V3(0, 0, 0), rspin: V3(0, 0, 0), bv: V3(0, 0, 0), bspin: 0, landed: false, saved: null, lie: null, scrapeT: 0 };
// sparks off the metal scraping the road
const CSPK = 300, cspkGeo = new THREE.BufferGeometry(), cspkPos = new Float32Array(CSPK * 3).fill(-10), cspkVel = new Float32Array(CSPK * 3), cspkLife = new Float32Array(CSPK);
cspkGeo.setAttribute('position', new THREE.BufferAttribute(cspkPos, 3));
const sparksPts = new THREE.Points(cspkGeo, new THREE.PointsMaterial({ color: '#ffcf6b', size: 0.07, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sparksPts.frustumCulled = false; scene.add(sparksPts);
let cspkNext = 0;
function emitSparks(x, z, vx, vz, n) {
  for (let k = 0; k < n; k++) {
    const i = cspkNext = (cspkNext + 1) % CSPK;
    cspkPos[i * 3] = x + rand(-0.2, 0.2); cspkPos[i * 3 + 1] = 0.08; cspkPos[i * 3 + 2] = z + rand(-0.2, 0.2);
    cspkVel[i * 3] = vx * rand(0.3, 0.9) + rand(-2, 2); cspkVel[i * 3 + 1] = rand(0.5, 2.5); cspkVel[i * 3 + 2] = vz * rand(0.3, 0.9) + rand(-2, 2); cspkLife[i] = rand(0.15, 0.45);
  }
}
function updateSparks(dt) {
  for (let i = 0; i < CSPK; i++) {
    if (cspkLife[i] <= 0) { cspkPos[i * 3 + 1] = -10; continue; }
    cspkLife[i] -= dt; cspkVel[i * 3 + 1] -= 9.8 * dt;
    for (let a = 0; a < 3; a++) cspkPos[i * 3 + a] += cspkVel[i * 3 + a] * dt;
    if (cspkPos[i * 3 + 1] < 0.02) { cspkPos[i * 3 + 1] = 0.02; cspkVel[i * 3 + 1] *= -0.3; }
  }
  cspkGeo.attributes.position.needsUpdate = true;
}
function noiseHit(dur, vol, ftype, freq, q = 1, delay = 0) {
  if (!AC) return;
  const b = AC.createBuffer(1, Math.ceil(AC.sampleRate * dur), AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = ftype; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  s.buffer = b; s.connect(f).connect(g).connect(AC.destination); s.start(AC.currentTime + delay);
}
function crashSound(v) {
  if (!AC) return;
  const k = Math.min(1, 0.35 + v / 18);
  const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(110, AC.currentTime); o.frequency.exponentialRampToValueAtTime(32, AC.currentTime + 0.35);   // body thump
  g.gain.setValueAtTime(0.9 * k, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.4); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.42);
  noiseHit(0.28, 0.9 * k, 'bandpass', 1600, 0.8);                       // metal crunch
  noiseHit(0.12, 0.6 * k, 'highpass', 5000, 0.7, 0.03);                 // plastic & glass
  if (v > 7) noiseHit(Math.min(1.6, v / 10), 0.35 * k, 'bandpass', 3200, 1.5, 0.15);   // scrape along the road
  for (let i = 0; i < 4; i++) setTimeout(() => beep([rand(2800, 5200)], 0.08, 'triangle', 0.025), 60 + i * rand(40, 90));   // bits landing
}
function startCrash(v) {
  v = Math.min(v, 24);                                                          // a 200 km/h spill shouldn't fling you out of the village
  const m = player.model, fx = Math.sin(player.h), fz = Math.cos(player.h);
  // the rider leaves the bike, pivoting about his hips
  const pv = new THREE.Group(); m.lean.updateMatrixWorld(true); m.lean.localToWorld(pv.position.set(0, 0.8, -0.2)); pv.rotation.y = player.h; scene.add(pv); pv.updateMatrixWorld(true);
  const R = m.rider.group; crashFx.saved = { p: R.position.clone(), q: R.quaternion.clone() }; pv.attach(R);
  crashFx.pivot = pv; crashFx.landed = false;
  const k = Math.min(1, v / 18);
  crashFx.rv.set(fx * v * 0.5 + rand(-0.8, 0.8), 1.6 + v * 0.17, fz * v * 0.5 + rand(-0.8, 0.8));
  crashFx.rspin.set(rand(5, 9) * (0.3 + k), rand(-2, 2) * k, rand(-3, 3) * k);
  crashFx.bv.set(fx * v * 0.55, 0, fz * v * 0.55); crashFx.bspin = rand(-2.5, 2.5) * k;
  crashFx.lie = rand(0, 1) < 0.5 ? 1 : -1;
  crashFx.on = true; crashFx.shake = 0.45 + 0.75 * k; crashFx.slowT = v > 7 ? 0.5 : 0; crashFx.scrapeT = 0;
  const fl = $('flash'); if (fl) { fl.style.transition = 'none'; fl.style.opacity = String(0.35 + 0.45 * k); requestAnimationFrame(() => { fl.style.transition = 'opacity .9s ease-out'; fl.style.opacity = '0'; }); }
  emitSparks(player.pos.x, player.pos.z, crashFx.bv.x, crashFx.bv.z, Math.round(20 + 40 * k)); emitSplash(player.pos.x, player.pos.z, 10, 18);
  crashSound(v);
}
function updateCrash(dt) {
  const m = player.model, pv = crashFx.pivot; if (!crashFx.on || !pv) return;
  // the bike slides on its side, spinning, throwing sparks, until friction stops it
  const bs = Math.hypot(crashFx.bv.x, crashFx.bv.z);
  const nx = player.pos.x + crashFx.bv.x * dt, nz = player.pos.z + crashFx.bv.z * dt;
  if (cellAt(nx, nz)) crashFx.bv.set(0, 0, 0); else { player.pos.x = nx; player.pos.z = nz; }
  crashFx.bv.multiplyScalar(Math.exp(-1.6 * dt)); player.h += crashFx.bspin * dt; crashFx.bspin *= Math.exp(-1.5 * dt);
  m.lean.rotation.z = lerp(m.lean.rotation.z, (crashFx.lie > 0 ? 1 : -1) * Math.PI / 2.15, 1 - Math.exp(-14 * dt));
  if (bs > 2.5) { crashFx.scrapeT -= dt; if (crashFx.scrapeT <= 0) { crashFx.scrapeT = 0.03; emitSparks(player.pos.x, player.pos.z, crashFx.bv.x, crashFx.bv.z, 3); } }
  // the rider flies, tumbles, bounces and slides
  const rv = crashFx.rv;
  rv.y -= 9.8 * dt;
  let px = pv.position.x + rv.x * dt, pz = pv.position.z + rv.z * dt;
  if (cellAt(px, pz)) { rv.x *= -0.25; rv.z *= -0.25; px = pv.position.x; pz = pv.position.z; crashFx.shake = Math.max(crashFx.shake, 0.4); noiseHit(0.15, 0.5, 'lowpass', 400); }
  pv.position.x = px; pv.position.z = pz; pv.position.y += rv.y * dt;
  if (pv.position.y < 0.22) {
    pv.position.y = 0.22;
    if (rv.y < -1.6) {                                                            // bounce
      rv.y *= -0.32; rv.x *= 0.6; rv.z *= 0.6; crashFx.rspin.multiplyScalar(0.55);
      emitSplash(pv.position.x, pv.position.z, 8, 12); crashFx.shake = Math.max(crashFx.shake, 0.3); noiseHit(0.14, 0.45, 'lowpass', 300);
    } else { rv.y = 0; crashFx.landed = true; rv.x *= Math.exp(-5 * dt); rv.z *= Math.exp(-5 * dt); }
  }
  if (!crashFx.landed) { pv.rotation.x += crashFx.rspin.x * dt; pv.rotation.y += crashFx.rspin.y * dt; pv.rotation.z += crashFx.rspin.z * dt; }
  else {                                                                          // come to rest lying on the road
    const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pv.rotation.y, crashFx.lie * Math.PI / 2, 'YXZ'));
    pv.quaternion.slerp(tq, 1 - Math.exp(-6 * dt));
  }
}
function endCrash() {
  const m = player.model, pv = crashFx.pivot; crashFx.on = false; if (!pv) return;
  const R = m.rider.group; m.lean.add(R); R.position.copy(crashFx.saved.p); R.quaternion.copy(crashFx.saved.q); R.scale.set(1, 1, 1);
  scene.remove(pv); crashFx.pivot = null; holdBars(m);
}
// screen shake and a look at the tumbling rider, applied after the chase camera
const _ccw = V3(0, 0, 0);
function crashCamera(dt) {
  if (crashFx.on && crashFx.pivot) {
    // follow the rider as he's thrown: swing round to keep him and the sliding bike in view
    const p = crashFx.pivot.position, dx = p.x - player.pos.x, dz = p.z - player.pos.z, dl = Math.hypot(dx, dz);
    const ux = dl > 1 ? dx / dl : Math.sin(player.h), uz = dl > 1 ? dz / dl : Math.cos(player.h);
    let back = 5 + dl * 0.2;
    for (let d = 1; d <= back; d += 0.5) if (cellAt(p.x - ux * d + uz * 2.2 * d / back, p.z - uz * d - ux * 2.2 * d / back) === 1) { back = Math.max(2.5, d - 0.8); break; }   // stay out of the houses
    const want = _ccw.set(p.x - ux * back + uz * 2.2 * Math.min(1, back / 5), 2.4 + dl * 0.06, p.z - uz * back - ux * 2.2 * Math.min(1, back / 5));
    if (!crashFx.cam) crashFx.cam = camera.position.clone();
    crashFx.cam.lerp(want, 1 - Math.exp(-4 * dt));
    if (cellAt(crashFx.cam.x, crashFx.cam.z) === 1) crashFx.cam.y = Math.max(crashFx.cam.y, 6.5);
    camera.position.copy(crashFx.cam);
    camera.lookAt(lerp(player.pos.x, p.x, 0.65), 0.6, lerp(player.pos.z, p.z, 0.65));
  } else crashFx.cam = null;
  if (crashFx.shake > 0.002) {
    const s = crashFx.shake * crashFx.shake;
    camera.position.x += rand(-1, 1) * s * 0.35; camera.position.y += rand(-1, 1) * s * 0.25; camera.position.z += rand(-1, 1) * s * 0.35;
    camera.rotateZ(rand(-1, 1) * s * 0.06);
    crashFx.shake *= Math.exp(-3.2 * dt);
  }
}

// ---------- Vehicles of Kerai, modelled to real dimensions — and they dent, crack and break when hit ----------
// Axes: +z forward, +y up, origin on the ground under the vehicle. All sizes in metres.

// rounded box with real subdivisions, so panels can be dented later
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, dent = true) {
  const sg = s => Math.max(1, Math.min(14, Math.ceil(s / 0.09)));
  const g = new THREE.BoxGeometry(w, h, d, sg(w), sg(h), sg(d));
  r = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  if (r > 0.004) {
    const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
      v.sub(c); if (v.lengthSq() > 1e-10) v.setLength(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
  }
  const m = mesh(g, typeof mat === 'string' ? M(mat) : mat, x, y, z); m.userData.dent = dent; return m;
}
// a body panel drawn as a side silhouette (z,y) and extruded across the width; ['q', cz, cy, z, y] = curve
function sideShape(pts, width, mat, bevel = 0.03, x = 0) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => { if (p[0] === 'q') s.quadraticCurveTo(p[1], p[2], p[3], p[4]); else if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); });
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 4 });
  g.rotateY(-Math.PI / 2); g.translate(depth / 2 + x, 0, 0); g.computeVertexNormals();
  const m = new THREE.Mesh(g, typeof mat === 'string' ? M(mat) : mat); m.userData.dent = true; return m;
}
// a smooth body shell lofted through rounded-rectangle cross-sections, back to front, nose capped
// stations: [z, width, yBottom, yTop, cornerRadius]
function loft(st, mat, n = 6) {
  const pos = [], idx = [], rings = [];
  for (const [z, w, yb, yt, rr] of st) {
    const hw = w / 2, r = Math.min(rr, hw - 0.001, (yt - yb) / 2 - 0.001), ring = [];
    const cs = [[hw - r, yt - r, 0], [-(hw - r), yt - r, 1], [-(hw - r), yb + r, 2], [hw - r, yb + r, 3]];
    for (const [cx, cy, q] of cs) for (let k = 0; k <= n; k++) { const a = (q + k / n) * Math.PI / 2; ring.push(pos.length / 3); pos.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z); }
    rings.push(ring);
  }
  const N = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < N; k++) { const a = rings[i][k], b = rings[i][(k + 1) % N], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % N]; idx.push(a, b, c, b, d, c); }
  const last = rings[rings.length - 1], [lz, , lb, lt] = st[st.length - 1], ci = pos.length / 3; pos.push(0, (lb + lt) / 2, lz + 0.012);
  for (let k = 0; k < N; k++) idx.push(ci, last[k], last[(k + 1) % N]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.userData.dent = true; return m;
}
const bodyMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.3, side: THREE.DoubleSide });
// a tube between two points
function tube(a, b, r, mat, seg = 8) {
  const A = V3(...a), B = V3(...b), d = B.clone().sub(A), m = cyl(r, r, d.length(), mat, 0, 0, 0, seg);
  m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return m;
}
// a real tyre: lathe-turned cross-section, rim, hub and nuts; optional tractor lugs. Spins about x.
function tyre(r, w, opt = {}) {
  const g = new THREE.Group(), ri = opt.ri || r * 0.58, sh = w * 0.32, prof = [[ri, -w * 0.46]];
  for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; prof.push([r - sh + Math.cos(a) * sh, Math.sin(a) * w / 2]); }
  prof.push([ri, w * 0.46]);
  const tg = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), opt.seg || 30); tg.rotateZ(Math.PI / 2);
  const rubber = M('#171717', 0.92); g.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: '#181818', roughness: 0.92, side: THREE.DoubleSide })));
  const rimM = M(opt.rim || '#b9bdc1', 0.35, 0.7);
  const rim = cyl(ri, ri, w * 0.78, rimM, 0, 0, 0, 24); rim.rotation.z = Math.PI / 2; g.add(rim);
  const dish = cyl(ri * 0.75, ri * 0.75, w * 0.86, M(opt.dish || opt.rim || '#9ea3a8', 0.4, 0.6), 0, 0, 0, 20); dish.rotation.z = Math.PI / 2; g.add(dish);
  const hub = cyl(ri * 0.28, ri * 0.32, w * 0.95, M('#6f7378', 0.4, 0.7), 0, 0, 0, 12); hub.rotation.z = Math.PI / 2; g.add(hub);
  const nuts = opt.nuts || 5;
  for (const sx of [-1, 1]) for (let k = 0; k < nuts; k++) { const a = k / nuts * Math.PI * 2, nr = 0.012 * (r > 0.5 ? 2 : 1), nut = cyl(nr, nr, 0.02, M('#d0d3d6', 0.3, 0.9), sx * w * 0.48, Math.sin(a) * ri * 0.45, Math.cos(a) * ri * 0.45, 6); nut.rotation.z = Math.PI / 2; g.add(nut); }
  if (opt.lugs) {                                                          // tractor chevron lugs
    const n = opt.lugs, lg = new THREE.BoxGeometry(w * 0.48, 0.045, 0.07), im = new THREE.InstancedMesh(lg, rubber, n * 2), o = new THREE.Object3D();
    for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
      const a = (k + (sx > 0 ? 0.5 : 0)) / n * Math.PI * 2;
      o.position.set(sx * w * 0.24, Math.sin(a) * (r - 0.01), Math.cos(a) * (r - 0.01)); o.rotation.set(-a, sx * 0.55, 0); o.updateMatrix(); im.setMatrixAt(k * 2 + (sx > 0 ? 1 : 0), o.matrix);
    }
    im.castShadow = true; g.add(im);
  }
  g.userData.r = r; return g;
}
function plateTex(text, bg = '#ffd600', fg = '#111') { return canvasTex(256, 64, c => { c.fillStyle = bg; c.fillRect(0, 0, 256, 64); c.strokeStyle = fg; c.lineWidth = 4; c.strokeRect(3, 3, 250, 58); c.fillStyle = fg; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 34); }); }
const brPlate = () => `BR 33${pick(['P', 'R', 'PA', 'G'])} ${Math.floor(rand(1000, 9999))}`;   // Samastipur RTO
function plate(text, w, h, x, y, z, ry = 0, bg) { const p = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: plateTex(text, bg), roughness: 0.5 }), x, y, z); p.rotation.y = ry; return p; }
function decal(text, w, h, col, bg, x, y, z, ry, font = 54) {
  const t = canvasTex(512, 128, c => { if (bg) { c.fillStyle = bg; c.fillRect(0, 0, 512, 128); } c.fillStyle = col; c.font = `bold ${font}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 66); });
  const p = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: !bg, roughness: 0.6 }), x, y, z); p.rotation.y = ry; return p;
}
const lampMat = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e || c, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2 });
function lamp(r, col, x, y, z, ry = 0, emis) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  const bez = cyl(r * 1.18, r * 1.25, 0.06, M('#d9dde1', 0.2, 0.95)); bez.rotation.x = Math.PI / 2; g.add(bez);
  const lens = mesh(new THREE.CircleGeometry(r, 20), lampMat(col, emis), 0, 0, 0.032); lens.userData.lamp = true; g.add(lens); return g; }
const glassMat = () => new THREE.MeshStandardMaterial({ color: '#a9c4d6', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.38, side: THREE.DoubleSide });
function seated(type, seatTop, x, z, ry = 0, sc = 0.95) { const p = makePerson(type, { sit: true }); p.group.scale.setScalar(sc); p.group.position.set(x, seatTop + 0.07 - 0.98 * sc, z); p.group.rotation.y = ry; p.group.children.forEach(c => { if (c.userData.blob) c.visible = false; }); return p; }
const castAll = g => g.traverse(o => { if (o.isMesh) o.castShadow = true; });

// ---------- Bajaj RE-style auto-rickshaw: 2.64 × 1.30 × 1.71 m, wheelbase 2.0 m, 4.00-8 tyres ----------
const AUTO_LIVERY = [{ b: '#1d8a3a', r: '#f3c614', t: '#f3c614' }, { b: '#141414', r: '#f3c614', t: '#f3c614' }, { b: '#1f5fae', r: '#151515', t: '#e9e9e9' }, { b: '#f3c614', r: '#1d8a3a', t: '#1d8a3a' }];
function vAuto() {
  const L = pick(AUTO_LIVERY), g = new THREE.Group();
  const paint = M(L.b, 0.32, 0.3), trim = M(L.t, 0.4, 0.2), canvasM = new THREE.MeshStandardMaterial({ color: L.r, roughness: 0.9, side: THREE.DoubleSide }), black = M('#1b1b1b', 0.6), chrome = M('#dfe3e6', 0.15, 0.95), rex = M('#3a2620', 0.5);
  // floor pan & chassis
  g.add(rbox(1.2, 0.06, 2.2, 0.02, black, 0, 0.36, -0.06, false));
  // front cowl: the curved nose that carries the headlight, around the single front wheel
  // front cowl: tapers from the full cab width at the driver's knees to the narrow face that carries the headlight
  const cowl = loft([[0.55, 1.26, 0.38, 1.02, 0.07], [0.78, 1.22, 0.4, 1.1, 0.09], [0.98, 1.08, 0.55, 1.13, 0.13], [1.15, 0.92, 0.58, 1.1, 0.16], [1.26, 0.8, 0.6, 1.04, 0.15], [1.315, 0.68, 0.63, 0.98, 0.12], [1.335, 0.54, 0.67, 0.93, 0.08]], bodyMat(L.b));
  g.add(cowl);
  const stripe = loft([[1.1, 0.97, 0.9, 0.95, 0.02], [1.2, 0.87, 0.9, 0.95, 0.02], [1.29, 0.76, 0.9, 0.95, 0.02], [1.33, 0.64, 0.9, 0.95, 0.02]], bodyMat(L.t)); stripe.scale.set(1.012, 1, 1.004); g.add(stripe);
  // front wheel, fork, mudguard
  const fw = tyre(0.23, 0.11, { rim: '#c9cdd0', ri: 0.105, nuts: 4 }); fw.position.set(0, 0.23, 1.02); g.add(fw);
  for (const sx of [-0.07, 0.07]) g.add(tube([sx, 0.23, 1.02], [sx, 0.62, 0.92], 0.022, chrome));
  { const mg = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.16, 18, 1, true, 0.25, 2.3), paint); mg.geometry.rotateZ(Math.PI / 2); mg.position.set(0, 0.23, 1.02); mg.material = new THREE.MeshStandardMaterial({ color: L.b, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }); mg.userData.dent = true; g.add(mg); }
  // rear body: quarter panels over the rear wheels, engine cover, bumper
  for (const sx of [-1, 1]) g.add(rbox(0.09, 0.44, 0.86, 0.035, paint, sx * 0.615, 0.70, -0.86));
  g.add(rbox(1.3, 0.56, 0.42, 0.07, paint, 0, 0.72, -1.1));
  g.add(rbox(1.16, 0.34, 0.6, 0.03, black, 0, 0.52, -0.58, false));
  for (const sx of [-1, 1]) g.add(rbox(0.05, 0.3, 0.55, 0.02, paint, sx * 0.615, 0.53, -0.18));     // low side skirts below the entry
  g.add(tube([-0.62, 0.42, -1.33], [0.62, 0.42, -1.33], 0.025, chrome));
  for (const sx of [-1, 1]) g.add(tube([sx * 0.62, 0.42, -1.33], [sx * 0.62, 0.42, -1.2], 0.02, chrome));
  const rw = []; for (const sx of [-1, 1]) { const w = tyre(0.23, 0.11, { rim: '#c9cdd0', ri: 0.105, nuts: 4 }); w.position.set(sx * 0.575, 0.23, -0.98); g.add(w); rw.push(w); }
  // seats
  g.add(rbox(0.56, 0.1, 0.36, 0.04, rex, 0, 0.79, 0.4, false), rbox(0.5, 0.26, 0.07, 0.03, rex, 0, 0.98, 0.2, false), rbox(0.4, 0.36, 0.3, 0.02, black, 0, 0.57, 0.42, false));
  g.add(rbox(1.14, 0.12, 0.5, 0.05, rex, 0, 0.78, -0.6, false));
  { const br = rbox(1.14, 0.5, 0.1, 0.05, rex, 0, 1.06, -0.9, false); br.rotation.x = -0.12; g.add(br); }
  // handlebar & dash
  g.add(tube([0, 0.95, 0.86], [0, 1.08, 0.74], 0.022, black), tube([-0.32, 1.1, 0.72], [0.32, 1.1, 0.72], 0.014, chrome));
  for (const sx of [-1, 1]) g.add(tube([sx * 0.27, 1.1, 0.72], [sx * 0.36, 1.1, 0.72], 0.022, black));
  g.add(rbox(0.9, 0.12, 0.22, 0.04, black, 0, 1.08, 0.98, false));
  // windscreen with chrome frame and wiper
  const ws = rbox(1.06, 0.64, 0.012, 0.004, glassMat(), 0, 1.45, 0.89, false); ws.rotation.x = -0.12; ws.userData.glass = true; g.add(ws);
  for (const sx of [-1, 1]) g.add(tube([sx * 0.54, 1.12, 0.93], [sx * 0.54, 1.82, 0.84], 0.016, chrome));
  { const wp = tube([0.05, 1.15, 0.925], [0.38, 1.36, 0.9], 0.006, black); wp.userData.breakable = true; g.add(wp); }
  // canvas hood on chrome stays, side curtains rolled up, rear canvas with the classic slogan
  const roof = rbox(1.31, 0.06, 2.02, 0.03, canvasM, 0, 1.84, -0.16, false);
  { const p = roof.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.035 * (1 - (p.getX(i) / 0.66) ** 2)); roof.geometry.computeVertexNormals(); } g.add(roof);
  for (const sx of [-1, 1]) { const cu = cyl(0.045, 0.045, 1.75, M('#202020', 0.9)); cu.rotation.x = Math.PI / 2; cu.position.set(sx * 0.64, 1.77, -0.2); g.add(cu); }
  g.add(rbox(1.28, 0.86, 0.025, 0.01, canvasM, 0, 1.4, -1.16, false));
  { const rwin = mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshStandardMaterial({ color: '#2a3238', roughness: 0.1, transparent: true, opacity: 0.7 }), 0, 1.5, -1.178); rwin.rotation.y = Math.PI; g.add(rwin); }
  g.add(decal(pick(['बुरी नज़र वाले तेरा मुँह काला', 'जय माता दी', 'माँ का आशीर्वाद', 'हॉर्न प्लीज़']), 1.1, 0.24, '#ffffff', null, 0, 1.18, -1.18, Math.PI, 46));
  for (const [sx, z] of [[-1, 0.15], [1, 0.15], [-1, -1.12], [1, -1.12]]) g.add(tube([sx * 0.6, 0.62, z], [sx * 0.6, 1.82, z], 0.016, chrome));
  for (const sx of [-1, 1]) g.add(tube([sx * 0.6, 1.25, 0.15], [sx * 0.6, 1.25, -0.4], 0.013, chrome));   // grab rails
  // lights, mirrors, plates
  g.add(lamp(0.075, '#fff6d8', 0, 0.8, 1.335, 0, '#fff2c0'));
  for (const sx of [-1, 1]) { const ind = rbox(0.06, 0.04, 0.03, 0.01, lampMat('#ff9800'), sx * 0.36, 0.92, 1.27, false); ind.userData.lamp = true; g.add(ind); }
  for (const sx of [-1, 1]) { const tl = rbox(0.1, 0.08, 0.03, 0.01, lampMat('#d50000'), sx * 0.5, 0.9, -1.32, false); tl.userData.lamp = true; g.add(tl); }
  for (const sx of [-1, 1]) { const mg = new THREE.Group(); mg.add(tube([0, 0, 0], [sx * 0.12, 0.2, 0.02], 0.007, chrome)); const mr = mesh(new THREE.CircleGeometry(0.055, 14), chrome, sx * 0.13, 0.24, 0.03); mr.scale.x = 1.4; mg.add(mr); mg.position.set(sx * 0.46, 1.12, 0.97); mg.userData.breakable = true; g.add(mg); }
  const num = brPlate(); g.add(plate(num, 0.3, 0.075, 0, 0.66, 1.343), plate(num, 0.34, 0.085, 0, 0.6, -1.335, Math.PI));
  // driver & passengers
  g.add(seated(pick(['man', 'man', 'farmer']), 0.84, 0, 0.42).group);
  const np = Math.floor(rand(0, 3));
  for (let k = 0; k < np; k++) g.add(seated(pick(['woman', 'man', 'schoolboy', 'schoolgirl', 'oldman']), 0.84, (k - (np - 1) / 2) * 0.42, -0.6).group);
  g.add(blob(1.7, 3.0)); castAll(g);
  return { group: g, L: 2.64, W: 1.3, speed: 9, label: 'auto', hi: 'ऑटो', heat: 6, wheels: [fw, ...rw], kind: 'auto', smokeAt: V3(0.3, 0.55, -1.32), roll: 0.03 };
}

// ---------- E-rickshaw (toto): 2.75 × 1.0 × 1.85 m, wheelbase 1.9 m, 3.75-12 tyres ----------
function vERick() {
  const col = pick(['#1565c0', '#2e7d32', '#6d6f73', '#00838f', '#c62828']), g = new THREE.Group();
  const paint = M(col, 0.3, 0.25), black = M('#1d1d1d', 0.6), steel = M('#c5c9cd', 0.25, 0.85), rex = M(pick(['#7b1f2a', '#1b5e20', '#3e2723', '#0d47a1']), 0.45), roofM = M(pick(['#eeeeee', col, '#1a1a1a']), 0.5, 0.1);
  g.add(rbox(0.98, 0.05, 1.95, 0.02, black, 0, 0.44, -0.28, false));
  const fair = loft([[0.6, 0.94, 0.47, 1.3, 0.06], [0.82, 0.9, 0.6, 1.37, 0.1], [1.0, 0.76, 0.7, 1.33, 0.15], [1.12, 0.6, 0.79, 1.22, 0.15], [1.19, 0.46, 0.86, 1.12, 0.1], [1.215, 0.34, 0.9, 1.06, 0.06]], bodyMat(col)); g.add(fair);
  const fw = tyre(0.28, 0.095, { ri: 0.15, rim: '#bfc3c7' }); fw.position.set(0, 0.28, 1.05); g.add(fw);
  for (const sx of [-0.06, 0.06]) g.add(tube([sx, 0.28, 1.05], [sx, 0.85, 0.86], 0.02, steel));
  { const mg = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.13, 18, 1, true, 0.2, 2.2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, side: THREE.DoubleSide })); mg.geometry.rotateZ(Math.PI / 2); mg.position.set(0, 0.28, 1.05); mg.userData.dent = true; g.add(mg); }
  g.add(lamp(0.065, '#fff6d8', 0, 0.98, 1.225, 0, '#fff2c0'));
  for (const sx of [-1, 1]) { const ind = rbox(0.05, 0.04, 0.03, 0.01, lampMat('#ff9800'), sx * 0.27, 1.16, 1.1, false); ind.userData.lamp = true; g.add(ind); }
  g.add(tube([0, 1.15, 0.82], [0, 1.3, 0.7], 0.02, black), tube([-0.3, 1.32, 0.7], [0.3, 1.32, 0.7], 0.013, steel));
  const ws = rbox(0.86, 0.5, 0.01, 0.004, glassMat(), 0, 1.6, 0.8, false); ws.rotation.x = -0.1; ws.userData.glass = true; g.add(ws);
  // seats: driver; then two benches back to back (one faces forward, one faces the road behind)
  g.add(rbox(0.5, 0.09, 0.32, 0.04, rex, 0, 0.88, 0.38, false), rbox(0.3, 0.38, 0.28, 0.02, black, 0, 0.66, 0.38, false));
  g.add(rbox(0.94, 0.1, 0.4, 0.04, rex, 0, 0.88, -0.25, false), rbox(0.94, 0.42, 0.08, 0.04, rex, 0, 1.14, -0.5, false), rbox(0.94, 0.1, 0.36, 0.04, rex, 0, 0.88, -0.78, false));
  g.add(rbox(0.9, 0.38, 0.9, 0.02, M('#2b2b2b', 0.7), 0, 0.65, -0.5, false));                    // battery box
  for (const sx of [-1, 1]) g.add(rbox(0.035, 0.36, 1.3, 0.012, paint, sx * 0.49, 0.64, -0.45));
  for (const sx of [-1, 1]) g.add(decal('ई-रिक्शा', 0.9, 0.2, '#ffffff', null, sx * 0.51, 0.66, -0.4, sx * Math.PI / 2, 60));
  // roof on four posts, grab rails, rear footboard
  const roof = rbox(1.08, 0.05, 2.3, 0.02, roofM, 0, 1.97, -0.2, false); { const p = roof.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.03 * (1 - (p.getX(i) / 0.54) ** 2)); roof.geometry.computeVertexNormals(); } g.add(roof);
  for (const sx of [-1, 1]) for (const z of [0.7, -1.1]) g.add(tube([sx * 0.47, 0.46, z], [sx * 0.47, 1.96, z], 0.016, steel));
  for (const sx of [-1, 1]) g.add(tube([sx * 0.47, 1.2, 0.7], [sx * 0.47, 1.2, -1.1], 0.012, steel));
  g.add(rbox(0.95, 0.03, 0.25, 0.01, steel, 0, 0.5, -1.2, false));
  const rw = []; for (const sx of [-1, 1]) { const w = tyre(0.28, 0.095, { ri: 0.15 }); w.position.set(sx * 0.45, 0.28, -0.85); g.add(w); rw.push(w);
    const mg = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.13, 16, 1, true, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: '#1d1d1d', roughness: 0.6, side: THREE.DoubleSide })); mg.geometry.rotateZ(Math.PI / 2); mg.position.copy(w.position); mg.userData.dent = true; g.add(mg); }
  for (const sx of [-1, 1]) { const tl = rbox(0.07, 0.06, 0.03, 0.01, lampMat('#d50000'), sx * 0.4, 0.6, -1.33, false); tl.userData.lamp = true; g.add(tl); }
  for (const sx of [-1, 1]) { const mg = new THREE.Group(); mg.add(tube([0, 0, 0], [sx * 0.1, 0.18, 0], 0.006, steel)); mg.add(mesh(new THREE.CircleGeometry(0.05, 12), steel, sx * 0.11, 0.22, 0.01)); mg.position.set(sx * 0.3, 1.32, 0.7); mg.userData.breakable = true; g.add(mg); }
  g.add(plate(brPlate(), 0.28, 0.07, 0, 0.75, -1.33, Math.PI));
  g.add(seated(pick(['man', 'man', 'schoolboy']), 0.95, 0, 0.38).group);
  const np = Math.floor(rand(0, 4));
  for (let k = 0; k < np; k++) { const back = k >= 2; g.add(seated(pick(['woman', 'man', 'schoolgirl', 'oldwoman', 'mother']), 0.93, (k % 2 ? 0.22 : -0.22), back ? -0.8 : -0.22, back ? Math.PI : 0).group); }
  g.add(blob(1.3, 3.0)); castAll(g);
  return { group: g, L: 2.75, W: 1.0, speed: 6.5, label: 'e-rickshaw', hi: 'ई-रिक्शा', heat: 6, wheels: [fw, ...rw], kind: 'erick', smokeAt: V3(0, 0.7, -0.5), roll: 0.04 };
}

// ---------- Tractor (575 DI class): 3.5 × 1.72 × 2.15 m, wheelbase 1.95 m, 14.9-28 rear / 6.00-16 front, often with a loaded trolley ----------
function vTractor(trolley = Math.random() < 0.65) {
  const red = pick(['#c8102e', '#c8102e', '#1e4fa3', '#e8e8e8']), g = new THREE.Group();
  const paint = M(red, 0.38, 0.25), grey = M('#5b6064', 0.55, 0.5), dark = M('#2c2f33', 0.6, 0.4), chrome = M('#d9dde1', 0.2, 0.95), black = M('#151515', 0.7);
  const RZ = -0.78, FZ = 1.17;
  const rw = [], fwl = [];
  for (const sx of [-1, 1]) { const w = tyre(0.69, 0.38, { ri: 0.36, rim: '#e5e5e5', dish: '#cfcfcf', lugs: 22, nuts: 8, seg: 36 }); w.position.set(sx * 0.71, 0.69, RZ); g.add(w); rw.push(w); }
  const steerL = [];
  for (const sx of [-1, 1]) { const st = new THREE.Group(); st.position.set(sx * 0.66, 0.39, FZ); const w = tyre(0.39, 0.16, { ri: 0.2, rim: '#e5e5e5', nuts: 6 }); st.add(w); g.add(st); fwl.push(w); steerL.push(st);
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.012, 0.16), black, 24), o = new THREE.Object3D();
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; o.position.set(0, Math.sin(a) * 0.385, Math.cos(a) * 0.385); o.rotation.set(-a, 0, Math.PI / 2); o.updateMatrix(); ribs.setMatrixAt(k, o.matrix); } w.add(ribs); }
  // chassis: transmission & rear axle trumpets, engine block, front axle
  g.add(rbox(0.56, 0.46, 1.25, 0.08, grey, 0, 0.78, -0.35, false));
  g.add(tube([-0.56, 0.69, RZ], [0.56, 0.69, RZ], 0.13, grey, 14));
  g.add(rbox(0.5, 0.48, 1.05, 0.06, grey, 0, 0.78, 0.9, false));
  g.add(rbox(1.36, 0.1, 0.12, 0.02, dark, 0, 0.39, FZ, false));
  g.add(tube([0, 0.45, FZ], [0, 0.68, FZ - 0.1], 0.06, dark));
  // bonnet, grille, headlamps, front weight frame
  const bon = rbox(0.68, 0.4, 1.45, 0.11, paint, 0, 1.2, 1.08); { const p = bon.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + 0.04 * (1 - (p.getX(i) / 0.34) ** 2)); bon.geometry.computeVertexNormals(); } g.add(bon);
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) g.add(rbox(0.01, 0.025, 0.42, 0.005, dark, sx * 0.343, 1.1 + k * 0.04, 1.35, false));   // side louvres
  g.add(rbox(0.68, 0.64, 0.07, 0.04, dark, 0, 1.0, 1.83));
  for (let k = 0; k < 7; k++) g.add(rbox(0.5, 0.018, 0.02, 0.006, chrome, 0, 0.78 + k * 0.06, 1.87, false));
  for (const sx of [-1, 1]) g.add(lamp(0.085, '#fff6d8', sx * 0.235, 1.18, 1.86, 0, '#fff2c0'));
  g.add(rbox(0.12, 0.12, 0.02, 0.02, M('#b71c1c', 0.3, 0.4), 0, 1.36, 1.87, false));
  g.add(rbox(0.92, 0.2, 0.22, 0.03, dark, 0, 0.62, 1.98));
  for (let k = 0; k < 4; k++) g.add(rbox(0.2, 0.18, 0.06, 0.02, M('#3b3f44', 0.6, 0.4), -0.33 + k * 0.22, 0.62, 2.1, false));      // front weights
  // exhaust stack with heat guard, air pre-cleaner
  const ex = new THREE.Group(); ex.add(tube([0, 0, 0], [0, 0.95, 0], 0.035, black), cyl(0.065, 0.065, 0.42, black, 0, 0.45, 0), cyl(0.072, 0.072, 0.36, M('#bfc3c7', 0.4, 0.8), 0, 0.45, 0, 14));
  const cap = cyl(0.045, 0.045, 0.01, black, 0, 0.97, 0.02); cap.rotation.x = 0.5; ex.add(cap); ex.position.set(0.2, 1.32, 1.45); ex.userData.breakable = true; g.add(ex);
  g.add(cyl(0.06, 0.05, 0.22, M('#9e9e9e', 0.3, 0.2), -0.2, 1.5, 1.4), cyl(0.07, 0.07, 0.04, black, -0.2, 1.62, 1.4));
  // dashboard, steering, seat, platform, fenders with lamps
  { const d = rbox(0.56, 0.46, 0.14, 0.05, dark, 0, 1.3, 0.27); d.rotation.x = -0.25; g.add(d); }
  g.add(tube([0, 1.32, 0.2], [0, 1.66, 0.0], 0.025, black));
  { const sw = new THREE.Group(); sw.add(mesh(new THREE.TorusGeometry(0.21, 0.017, 8, 28), black)); for (let k = 0; k < 3; k++) { const s = box(0.02, 0.2, 0.012, black, 0, 0, 0); s.rotation.z = k * 2.09; s.position.set(Math.sin(k * 2.09) * 0.1, -Math.cos(k * 2.09) * 0.1, 0); sw.add(s); } sw.position.set(0, 1.68, -0.01); sw.rotation.x = -1.05; g.add(sw); }
  g.add(rbox(1.0, 0.04, 0.75, 0.01, M('#3d4145', 0.7, 0.4), 0, 0.98, -0.2, false));
  g.add(tube([0, 0.98, -0.75], [0, 1.28, -0.8], 0.04, dark), rbox(0.46, 0.1, 0.4, 0.05, M('#1a1a1a', 0.5), 0, 1.36, -0.8, false), rbox(0.42, 0.2, 0.06, 0.03, M('#1a1a1a', 0.5), 0, 1.5, -1.0, false));
  for (const sx of [-1, 1]) {
    const fm = new THREE.MeshStandardMaterial({ color: red, roughness: 0.38, metalness: 0.25, side: THREE.DoubleSide });
    const f = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.46, 26, 4, true, 0.15, 2.75), fm); f.geometry.rotateZ(Math.PI / 2); f.position.set(sx * 0.71, 0.69, RZ); f.userData.dent = true; g.add(f);
    const side = mesh(new THREE.CircleGeometry(0.8, 26, 0.15, 2.75), fm); side.geometry.rotateY(-Math.PI / 2); side.position.set(sx * 0.48, 0.69, RZ); g.add(side);
    g.add(lamp(0.05, '#fff6d8', sx * 0.71, 1.52, RZ + 0.35, 0, '#fff2c0'));
    const tl = rbox(0.08, 0.06, 0.03, 0.01, lampMat('#d50000'), sx * 0.71, 1.25, RZ - 0.72, false); tl.userData.lamp = true; g.add(tl);
  }
  g.add(rbox(0.3, 0.2, 0.3, 0.02, dark, -0.45, 1.05, -0.2, false));                          // battery / tool box
  g.add(rbox(0.22, 0.12, 0.3, 0.02, dark, 0, 0.55, -1.32, false));                           // hitch
  g.add(seated('farmer', 1.42, 0, -0.8).group);
  g.add(blob(2.0, 3.8)); castAll(g);
  const t = { group: g, L: 3.5, W: 1.75, speed: 6.5, label: 'tractor', hi: 'ट्रैक्टर', heat: 10, wheels: [...rw, ...fwl], kind: 'tractor', steer: steerL, smokeAt: V3(0.2, 2.3, 1.45), cz: 0.35, roll: 0.015 };
  if (trolley) t.trailer = vTrolley();
  return t;
}
// two-wheel farm trolley, hitched 1.4 m behind the tractor's drawbar
function vTrolley() {
  const col = pick(['#1e4fa3', '#c8102e', '#2e7d32', '#e0a100']), g = new THREE.Group();
  const paint = M(col, 0.45, 0.3), dark = M('#2c2f33', 0.6, 0.4);
  g.add(rbox(1.9, 0.08, 3.4, 0.02, dark, 0, 0.98, 0, false));
  for (const sx of [-1, 1]) g.add(rbox(0.05, 0.6, 3.4, 0.02, paint, sx * 0.94, 1.3, 0));
  g.add(rbox(1.9, 0.6, 0.05, 0.02, paint, 0, 1.3, 1.69), rbox(1.9, 0.6, 0.05, 0.02, paint, 0, 1.3, -1.69));
  for (const sx of [-1, 1]) for (const z of [-1.1, 0, 1.1]) g.add(rbox(0.07, 0.62, 0.06, 0.01, dark, sx * 0.97, 1.3, z, false));
  for (const sx of [-1, 1]) g.add(rbox(0.06, 0.04, 3.4, 0.01, M('#ffffff', 0.5), sx * 0.97, 1.5, 0, false));
  g.add(decal(pick(['जय बजरंगबली', 'राम ट्रेडर्स', 'माँ दुर्गा ईंट भट्ठा', 'केराई']), 1.5, 0.3, '#ffffff', null, 0, 1.32, -1.72, Math.PI, 56));
  g.add(tube([-0.6, 0.9, 1.7], [0, 0.6, 3.05], 0.05, dark), tube([0.6, 0.9, 1.7], [0, 0.6, 3.05], 0.05, dark), tube([0, 0.6, 3.05], [0, 0.6, 3.2], 0.04, dark));
  const ws = []; for (const sx of [-1, 1]) { const w = tyre(0.46, 0.2, { ri: 0.24, rim: '#cfcfcf', nuts: 6 }); w.position.set(sx * 0.82, 0.46, 0); g.add(w); ws.push(w);
    const mg = mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.26, 16, 1, true, 0.6, 1.9), new THREE.MeshStandardMaterial({ color: '#2c2f33', roughness: 0.6, side: THREE.DoubleSide })); mg.geometry.rotateZ(Math.PI / 2); mg.position.copy(w.position); mg.userData.dent = true; g.add(mg); }
  g.add(tube([-0.82, 0.46, 0], [0.82, 0.46, 0], 0.05, dark));
  for (const sx of [-1, 1]) { const tl = rbox(0.08, 0.06, 0.03, 0.01, lampMat('#d50000'), sx * 0.8, 1.05, -1.72, false); tl.userData.lamp = true; g.add(tl); }
  // the load: bricks from the kiln, river sand, or a netted heap of bhusa (chaff)
  const load = pick(['bricks', 'bricks', 'sand', 'bhusa', 'empty']);
  if (load === 'bricks') {
    const bt = canvasTex(256, 256, c => { c.fillStyle = '#d8d0c4'; c.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) { c.fillStyle = pick(['#a6452c', '#b5512f', '#9a3e27', '#c0603a']); c.fillRect(x + 2, y + 2, 60, 28); } }, true);
    bt.repeat.set(3, 2); g.add(rbox(1.8, 0.75, 3.25, 0.02, TM(bt, 0.95), 0, 1.38, 0, false));
  } else if (load === 'sand') {
    const s = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#cbb994', 1), 0, 1.0, 0); s.scale.set(0.9, 0.85, 1.65); g.add(s);
  } else if (load === 'bhusa') {
    const s = mesh(new THREE.SphereGeometry(1, 24, 14), M('#e3d29a', 1), 0, 1.65, 0); s.scale.set(1.25, 0.95, 2.1); g.add(s);
    const net = mesh(new THREE.SphereGeometry(1.01, 16, 10), new THREE.MeshBasicMaterial({ color: '#3e5f3a', wireframe: true }), 0, 1.65, 0); net.scale.copy(s.scale); g.add(net);
  }
  g.add(blob(2.2, 3.8)); castAll(g);
  return { group: g, L: 3.45, W: 1.95, tow: 3.2, wheels: ws, axle: null };
}

// ---------- Roadster bicycle (28" × 1½ wheels, wheelbase 1.13 m) — milkmen, farmers, school kids ----------
function bikeWheel(r) {
  const g = new THREE.Group();
  const t = mesh(new THREE.TorusGeometry(r - 0.02, 0.019, 8, 36), M('#151515', 0.85)); t.rotation.y = Math.PI / 2; g.add(t);
  const rim = mesh(new THREE.TorusGeometry(r - 0.045, 0.008, 6, 36), M('#c8ccd0', 0.25, 0.9)); rim.rotation.y = Math.PI / 2; g.add(rim);
  const pts = []; for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2, s = k % 2 ? 1 : -1; pts.push(V3(s * 0.03, 0, 0), V3(0, Math.sin(a) * (r - 0.05), Math.cos(a) * (r - 0.05))); }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#9aa0a6' })));
  const hub = cyl(0.025, 0.025, 0.08, M('#bfc3c7', 0.3, 0.9)); hub.rotation.z = Math.PI / 2; g.add(hub);
  g.userData.r = r; return g;
}
function vCycle() {
  const g = new THREE.Group(), lean = new THREE.Group(); g.add(lean);
  const fr = M(pick(['#141414', '#141414', '#0d3b66', '#5a1a1a']), 0.35, 0.5), chrome = M('#cfd3d7', 0.2, 0.95), black = M('#151515', 0.6);
  const R = 0.355, BB = [0, 0.29, 0], RA = [0, R, -0.6], FA = [0, R, 0.53], ST = [0, 0.86, -0.17], HT = [0, 0.83, 0.37], HB = [0, 0.63, 0.43];
  const rwh = bikeWheel(R); rwh.position.set(...RA); const fwh = bikeWheel(R); const fork = new THREE.Group(); fork.position.set(...HT); lean.add(rwh, fork);
  fwh.position.set(0, R - HT[1], FA[2] - HT[2]); fork.add(fwh);
  lean.add(tube(BB, ST, 0.016, fr), tube(ST, HT, 0.016, fr), tube(BB, HB, 0.018, fr), tube(HT, HB, 0.02, fr));
  for (const sx of [-0.045, 0.045]) { lean.add(tube([sx, BB[1], BB[2]], [sx, RA[1], RA[2]], 0.009, fr), tube([sx, ST[1] - 0.02, ST[2]], [sx, RA[1], RA[2]], 0.009, fr)); fork.add(tube([sx, -0.2, 0.06], [sx, R - HT[1], FA[2] - HT[2]], 0.011, fr)); }
  fork.add(tube([0, 0, 0], [0, 0.22, -0.03], 0.012, chrome), tube([-0.28, 0.22, -0.12], [0.28, 0.22, -0.12], 0.011, chrome), tube([0, 0.22, -0.03], [0, 0.22, -0.12], 0.011, chrome));
  for (const sx of [-1, 1]) fork.add(tube([sx * 0.25, 0.22, -0.12], [sx * 0.29, 0.22, -0.2], 0.016, black));
  { const bell = cyl(0.025, 0.03, 0.02, chrome, 0.15, 0.24, -0.12); bell.userData.breakable = true; fork.add(bell); }
  const crank = new THREE.Group(); crank.position.set(...BB); { const ring = mesh(new THREE.TorusGeometry(0.09, 0.008, 6, 24), chrome); ring.rotation.y = Math.PI / 2; crank.add(ring); }
  for (const sx of [-1, 1]) { const arm = box(0.012, 0.17, 0.02, chrome, sx * 0.07, sx * 0.085, 0); crank.add(arm); crank.add(box(0.1, 0.02, 0.06, black, sx * 0.12, sx * 0.17, 0)); }
  lean.add(crank);
  lean.add(rbox(0.008, 0.12, 0.62, 0.004, black, 0.05, 0.31, -0.3, true));                         // chain guard
  lean.add(rbox(0.16, 0.05, 0.25, 0.02, M('#2a1a12', 0.5), 0, ST[1] + 0.05, ST[2] - 0.03, false));   // saddle
  for (const sx of [-1, 1]) lean.add(tube([sx * 0.05, ST[1] + 0.02, ST[2] - 0.12], [sx * 0.05, ST[1] - 0.04, ST[2] - 0.12], 0.008, chrome));
  { const mg = mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.05, 18, 1, true, 0.5, 2.5), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide })); mg.geometry.rotateZ(Math.PI / 2); mg.position.set(...RA); mg.userData.dent = true; lean.add(mg); }
  lean.add(rbox(0.16, 0.012, 0.36, 0.004, chrome, 0, R + 0.06, -0.62, false));                    // carrier
  const rider = seated(pick(['man', 'farmer', 'schoolboy', 'schoolgirl', 'man']), ST[1] + 0.07, 0, ST[2] + 0.02); lean.add(rider.group);
  const grips = [-1, 1].map(sx => { const o = new THREE.Object3D(); o.position.set(sx * 0.27, 0.22, -0.16); fork.add(o); return o; });
  const ik = { group: g, lean, rider, grips }; holdBars(ik);
  const load = Math.random();
  if (load < 0.3) for (const sx of [-1, 1]) lean.add(cyl(0.12, 0.13, 0.38, M('#c9ced2', 0.25, 0.85), sx * 0.2, R + 0.05, -0.62, 16));   // milk cans
  else if (load < 0.45) { const gb = mesh(new THREE.SphereGeometry(0.3, 12, 8), M('#5e7d32', 1), 0, R + 0.25, -0.65); gb.scale.set(1.4, 0.6, 0.9); lean.add(gb); } // grass bundle
  g.add(blob(0.6, 1.9)); castAll(g);
  return { group: g, L: 1.85, W: 0.6, speed: 4.2, label: 'cyclist', hi: 'साइकिल', heat: 15, wheels: [rwh, fwh], crank, lean, rider, ik, fork, two: true, kind: 'cycle' };
}
// ---------- Motorbike traffic: commuter 100–125 cc bikes, some with a pillion ----------
function vBiker() {
  const bk = makeBike(pick(['#141414', '#b71c1c', '#1a237e', '#4a4a4a', '#0d47a1']), pick(['man', 'man', 'farmer', 'schoolboy']), Math.random() < 0.4 ? { helmet: pick(['#222222', '#f5f5f5', '#c62828']) } : {});
  if (Math.random() < 0.35) { const pl = seated(pick(['woman', 'man', 'schoolgirl']), 0.93, 0, -0.5); bk.lean.add(pl.group); }
  flagBike(bk);
  return { group: bk.group, L: 2.0, W: 0.75, speed: 11, label: 'motorbike', hi: 'मोटरसाइकिल', heat: 10, bike: bk, lean: bk.lean, rider: bk.rider, two: true, kind: 'biker', smokeAt: V3(0.15, 0.4, -0.5) };
}
// mark which parts of a motorbike dent, crack or fly off
function flagBike(bk) {
  const people = new Set(); bk.group.traverse(o => { if (o.isMesh && o !== bk.group) { let q = o; while (q && q !== bk.group) { if (q.userData && q.userData.person) { people.add(o); break; } q = q.parent; } } });
  bk.rider.group.traverse(o => people.add(o)); if (bk.rider.head) bk.rider.head.traverse(o => people.add(o));
  bk.group.traverse(o => {
    if (!o.isMesh || people.has(o)) return;
    const gt = o.geometry.type;
    if (o.material && o.material.emissive && o.material.emissive.getHex() !== 0) o.userData.lamp = true;
    else if (gt === 'SphereGeometry' || gt === 'BoxGeometry') { if (!o.parent || !o.parent.isBone) o.userData.dent = true; }
    else if (gt === 'CircleGeometry') o.userData.breakable = true;              // mirrors
  });
}

// ---------- Damage: dents, cracked glass, broken lamps, parts flying off, smoke ----------
const crackedTex = canvasTex(256, 256, c => {
  c.clearRect(0, 0, 256, 256); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.4;
  const cx = rand(90, 160), cy = rand(90, 160);
  for (let k = 0; k < 16; k++) { let x = cx, y = cy, a = k / 16 * Math.PI * 2 + rand(-0.2, 0.2); c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 7; s++) { x += Math.cos(a) * rand(12, 26); y += Math.sin(a) * rand(12, 26); a += rand(-0.4, 0.4); c.lineTo(x, y); } c.stroke(); }
  for (let r = 18; r < 110; r += rand(14, 26)) { c.beginPath(); for (let a = 0; a < 6.4; a += 0.4) c.lineTo(cx + Math.cos(a) * r * rand(0.85, 1.15), cy + Math.sin(a) * r * rand(0.85, 1.15)); c.stroke(); }
});
const CRACKED = new THREE.MeshStandardMaterial({ color: '#c9d6de', map: crackedTex, roughness: 0.3, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
const BROKEN_LAMP = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.9 });
// split long triangles so a panel has enough vertices to crumple
function tessellate(geo, maxE) {
  const src = (geo.index ? geo.toNonIndexed() : geo).attributes.position.array, out = [], st = [];
  for (let i = 0; i < src.length; i += 9) st.push(Array.from(src.slice(i, i + 9)));
  const d2 = (t, i, j) => (t[i] - t[j]) ** 2 + (t[i + 1] - t[j + 1]) ** 2 + (t[i + 2] - t[j + 2]) ** 2, m2 = maxE * maxE;
  while (st.length && out.length < 9 * 24000) {
    const t = st.pop(), e = [d2(t, 0, 3), d2(t, 3, 6), d2(t, 6, 0)], mx = Math.max(...e);
    if (mx <= m2) { out.push(...t); continue; }
    const k = e.indexOf(mx), a = k * 3, b = ((k + 1) % 3) * 3, c = ((k + 2) % 3) * 3, mid = [(t[a] + t[b]) / 2, (t[a + 1] + t[b + 1]) / 2, (t[a + 2] + t[b + 2]) / 2];
    st.push([...t.slice(a, a + 3), ...mid, ...t.slice(c, c + 3)], [...mid, ...t.slice(b, b + 3), ...t.slice(c, c + 3)]);
  }
  for (const t of st) out.push(...t);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.computeVertexNormals(); return g;
}
const _inv = new THREE.Matrix4(), _cl = V3(0, 0, 0), _dl = V3(0, 0, 0), _wv = V3(0, 0, 0), _ws = V3(0, 0, 0), _sph = new THREE.Sphere();
function dentMesh(m, cW, dirW, R, depth) {
  if (!m.userData.tess) { m.geometry = tessellate(m.geometry, 0.05); m.userData.tess = true; if (m.isInstancedMesh) return; }
  m.updateMatrixWorld(true); _inv.copy(m.matrixWorld).invert(); m.getWorldScale(_ws);
  const sc = (_ws.x + _ws.y + _ws.z) / 3 || 1;
  _cl.copy(cW).applyMatrix4(_inv); _dl.copy(dirW).transformDirection(_inv);
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  const p = m.geometry.attributes.position, RL = R / sc, D = Math.min(depth / sc, m.geometry.boundingSphere.radius * 0.28);   // small parts bend, they don't vanish
  for (let i = 0; i < p.count; i++) {
    _wv.fromBufferAttribute(p, i); const d = _wv.distanceTo(_cl); if (d >= RL) continue;
    const f = (1 - d / RL) ** 2 * D * (0.65 + 0.7 * hash2(_wv.x * 37 + _wv.z * 11, _wv.y * 53));
    p.setXYZ(i, _wv.x + _dl.x * f, _wv.y + _dl.y * f, _wv.z + _dl.z * f);
  }
  p.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
}
const debris = [];
function damageObject(root, cW, dirW, s) {
  root.updateMatrixWorld(true);
  const R = 0.3 + s * 0.035, depth = Math.min(0.2, 0.02 + s * 0.011), hits = [];
  root.traverse(o => {
    if (!o.isMesh && !o.userData.breakable) return;
    if (o.isMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); _sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); }
    else { o.getWorldPosition(_sph.center); _sph.radius = 0.15; }
    const d = _sph.center.distanceTo(cW) - _sph.radius;
    if (d < R + 0.5) hits.push([o, d]);
  });
  for (const [o, d] of hits) {
    if (o.userData.breakable && d < R + 0.35 && s > 4 && Math.random() < 0.85) { breakOff(o, dirW, s); continue; }
    if (!o.isMesh) continue;
    if (o.userData.glass && d < R + 0.4 && s > 3) { if (o.material !== CRACKED) { o.material = CRACKED; glassBurst(cW, dirW, 14); } continue; }
    if (o.userData.lamp && d < R + 0.2 && s > 3) { if (o.material !== BROKEN_LAMP) { o.material = BROKEN_LAMP; glassBurst(cW, dirW, 8); } continue; }
    if (o.userData.dent && d < R) dentMesh(o, cW, dirW, R, depth);
  }
}
function breakOff(o, dirW, s) {
  if (!o.parent) return; scene.attach(o); o.userData.breakable = false;
  debris.push({ o, v: V3(dirW.x * s * 0.25 + rand(-1.5, 1.5), rand(1.5, 3.5), dirW.z * s * 0.25 + rand(-1.5, 1.5)), w: V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), t: 40, rest: false });
}
function updateDebris(dt) {
  for (let k = debris.length - 1; k >= 0; k--) {
    const d = debris[k]; d.t -= dt;
    if (d.t <= 0 || d.o.position.distanceToSquared(player.pos) > 300 * 300) { scene.remove(d.o); debris.splice(k, 1); continue; }
    if (d.rest) continue;
    d.v.y -= 9.8 * dt; d.o.position.addScaledVector(d.v, dt); d.o.rotation.x += d.w.x * dt; d.o.rotation.y += d.w.y * dt; d.o.rotation.z += d.w.z * dt;
    if (d.o.position.y < 0.04) { d.o.position.y = 0.04; d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; d.w.multiplyScalar(0.5); if (Math.abs(d.v.y) < 0.4) { d.rest = true; d.o.rotation.x = Math.round(d.o.rotation.x / (Math.PI / 2)) * Math.PI / 2; } }
  }
}
// particle systems: glass shards and engine smoke
function particles(n, color, size, opacity, blending, tex) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3).fill(-50), vel = new Float32Array(n * 3), life = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: tex || null, transparent: true, opacity, depthWrite: false, blending: blending || THREE.NormalBlending })); pts.frustumCulled = false; scene.add(pts);
  let nx = 0;
  return {
    points: pts,
    emit(x, y, z, vx, vy, vz, spread, lf, cnt) { for (let k = 0; k < cnt; k++) { const i = nx = (nx + 1) % n; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx + rand(-spread, spread); vel[i * 3 + 1] = vy + rand(-spread, spread) * 0.5; vel[i * 3 + 2] = vz + rand(-spread, spread); life[i] = lf * rand(0.7, 1.2); } },
    update(dt, grav, drag) {
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue; }
        life[i] -= dt; vel[i * 3 + 1] += grav * dt; const f = Math.exp(-drag * dt); vel[i * 3] *= f; vel[i * 3 + 2] *= f;
        for (let a = 0; a < 3; a++) pos[i * 3 + a] += vel[i * 3 + a] * dt;
        if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] = 0; vel[i * 3] *= 0.3; vel[i * 3 + 2] *= 0.3; }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
const smokeTex = canvasTex(64, 64, c => { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
const SHARDS = particles(400, '#e3f2fd', 0.05, 0.9, THREE.AdditiveBlending), SMOKE = particles(500, '#6b6b6b', 1.1, 0.32, THREE.NormalBlending, smokeTex);
function glassBurst(c, d, n) { SHARDS.emit(c.x, c.y + 0.1, c.z, d.x * -1.5, 2, d.z * -1.5, 1.6, 1.2, n); }
const smokers = new Set();
function updateDamageFx(dt) {
  updateDebris(dt); SHARDS.update(dt, -9.8, 0.5); SMOKE.update(dt, 0.6, 1.2);
  for (const s of smokers) {
    if (!s.group.parent) { smokers.delete(s); continue; }
    s.smokeT = (s.smokeT || 0) - dt; if (s.smokeT > 0) continue;
    const bad = 1 - Math.max(0, s.hp) / 45; s.smokeT = 0.16 - 0.1 * bad;
    s.group.updateMatrixWorld(); const p = (s.smokeAt || V3(0, 0.8, 0)).clone(); (s.lean || s.group).localToWorld(p);
    SMOKE.emit(p.x, p.y, p.z, rand(-0.2, 0.2), 0.8 + bad, rand(-0.2, 0.2), 0.25, 2.2 + bad * 1.5, 1);
  }
}
// ---------- Collisions with traffic ----------
const _imp = V3(0, 0, 0), _dir = V3(0, 0, 0);
function hitVehicle(t, root, s, label) {
  _dir.set(t.group.position.x - player.pos.x, 0, t.group.position.z - player.pos.z).normalize();
  if (root !== t.group) _dir.set(root.position.x - player.pos.x, 0, root.position.z - player.pos.z).normalize();
  _imp.set(player.pos.x + Math.sin(player.h) * 0.9, 0.75, player.pos.z + Math.cos(player.h) * 0.9);
  damageObject(root, _imp, _dir, s);
  t.hp = (t.hp ?? 100) - s * 4.5; t.hitT = Math.max(t.hitT || 0, 3);
  if (t.hp < 45) { t.smokeAt = t.smokeAt || V3(0, 0.8, 0); smokers.add(t); }
  if (t.hp <= 0 && !t.wrecked) { t.wrecked = true; t.hitT = 1e9; say(`${t.hi || t.label} बर्बाद! The ${t.label} is wrecked`, 2.2, '#ffab91'); }
  if (t.two && !t.down) knockRider(t, s);
  t.jolt = 0.4; t.joltDir = _dir.clone().multiplyScalar(Math.min(0.6, s * 0.04));
  noiseHit(0.2, 0.6, 'bandpass', t.two ? 2200 : 900, 1);
}
// riders of bicycles and motorbikes fall: thrown off, bike on its side, then they pick it up and carry on
function knockRider(t, s, dx, dz) {
  if (dx === undefined) { dx = Math.sin(player.h); dz = Math.cos(player.h); }
  t.down = true; t.downT = 9; t.fallSide = Math.random() < 0.5 ? 1 : -1; t.fall = 0;
  const R = t.rider.group; t.riderSave = { p: R.position.clone(), q: R.quaternion.clone(), parent: R.parent };
  const pv = new THREE.Group(); R.getWorldPosition(pv.position); pv.position.y += 0.9; scene.add(pv); pv.attach(R); t.pivot = pv;
  t.rv = V3(dx * s * 0.35 + rand(-1, 1), 2 + s * 0.12, dz * s * 0.35 + rand(-1, 1)); t.rspin = rand(4, 8);
  t.bv = V3(dx * s * 0.22, 0, dz * s * 0.22);                                  // the bike skids away on its side
  if (t.bike) t.bike.rider = t.rider;   // keep IK reference
}
function updateFallen(t, dt) {
  const pv = t.pivot;
  t.fall = Math.min(1, t.fall + dt * 3); t.group.rotation.z = t.fallSide * 1.45 * t.fall;   // bike lies on its side
  if (t.bv) { const nx = t.group.position.x + t.bv.x * dt, nz = t.group.position.z + t.bv.z * dt; if (cellAt(nx, nz)) t.bv.set(0, 0, 0); else { t.group.position.x = nx; t.group.position.z = nz; } t.bv.multiplyScalar(Math.exp(-2.2 * dt)); }
  if (pv && cellAt(pv.position.x, pv.position.z) === 1) { t.rv.x *= -0.3; t.rv.z *= -0.3; }
  if (pv) {
    t.rv.y -= 9.8 * dt; pv.position.addScaledVector(t.rv, dt);
    if (pv.position.y < 0.22) { pv.position.y = 0.22; if (t.rv.y < -1.5) { t.rv.y *= -0.3; t.rv.x *= 0.5; t.rv.z *= 0.5; } else { t.rv.set(t.rv.x * 0.9, 0, t.rv.z * 0.9); t.rspin *= 0.9; } }
    if (pv.position.y > 0.23) pv.rotation.x += t.rspin * dt; else pv.rotation.x = lerp(pv.rotation.x, -Math.PI / 2, 0.1);
  }
  t.downT -= dt;
  if (t.downT <= 0 && !t.wrecked) {                                              // back on the saddle
    const R = t.rider.group; t.riderSave.parent.add(R); R.position.copy(t.riderSave.p); R.quaternion.copy(t.riderSave.q);
    scene.remove(pv); t.pivot = null; t.down = false; t.group.rotation.z = 0; t.hitT = 0;
    const rn = roadNear(t.group.position.x, t.group.position.z);                 // pick the bike up where it lies and rejoin the road there
    if (rn && rn.d < 12) { t.ed = rn.ed; t.s = rn.s; t.lat = clamp(rn.lat, -rn.ed.half, rn.ed.half); }
  }
}
// your own bike: dents, broken lamp, mirrors gone, bent handlebar, smoke, and it rides worse
const bikeDmg = { hp: 100 };
function damagePlayerBike(s, side) {
  s = Math.min(s, 22);
  const m = player.model; m.group.updateMatrixWorld(true);
  const front = m.lean.localToWorld(V3(rand(-0.1, 0.1), 0.75, 0.75)), back = V3(-Math.sin(player.h), 0, -Math.cos(player.h));
  damageObject(m.group, front, back, s);
  const sd = side || (Math.random() < 0.5 ? 1 : -1), sp = m.lean.localToWorld(V3(sd * 0.18, 0.7, 0.1)), sdir = V3(-Math.cos(player.h) * sd, 0, Math.sin(player.h) * sd);
  damageObject(m.group, sp, sdir, s * 0.6);
  bikeDmg.hp = Math.max(0, bikeDmg.hp - s * 3);
  if (s > 6) m.bend = clamp((m.bend || 0) + rand(-0.05, 0.05) * s / 8, -0.18, 0.18);
  if (bikeDmg.hp < 40) { player.smokeAt = V3(0, 0.45, 0.1); player.group = m.group; player.lean = m.lean; player.hp = bikeDmg.hp; smokers.add(player); }
}

// ---------- Second-order collisions: whatever is thrown, sliding or lying on the road keeps colliding ----------
// A body is { pos: Vector3, vel: Vector3, r, m (kg), kind: 'rider'|'bike'|'goat', who: 'player'|traffic|animal, kicked() }
const VEH_H = { auto: 1.85, erick: 1.97, tractor: 2.2, biker: 1.4, cycle: 1.4 };
const _n = V3(0, 0, 0), _vv = V3(0, 0, 0), _cp = V3(0, 0, 0);
let chainMsgT = 0;
function chainSay(txt) { if (chainMsgT <= 0) { say(txt, 1.8, '#ffab40'); chainMsgT = 1.6; } }
function thud(s, who) { noiseHit(0.14, Math.min(0.7, 0.2 + s * 0.04), 'lowpass', 350); if (who === 'player') crashFx.shake = Math.max(crashFx.shake, Math.min(0.5, s * 0.05)); }

// the bodies in play this frame
function activeBodies() {
  const B = [];
  if (crashFx.on && crashFx.pivot) {
    B.push({ pos: crashFx.pivot.position, vel: crashFx.rv, r: 0.35, m: 70, kind: 'rider', who: 'player', kicked() { crashFx.landed = false; } });
    B.push({ pos: player.pos, vel: crashFx.bv, r: 0.8, m: 130, kind: 'bike', who: 'player', flat: true });
  }
  for (const t of traffic) if (t.down) {
    if (t.pivot) B.push({ pos: t.pivot.position, vel: t.rv, r: 0.35, m: 65, kind: 'rider', who: t, kicked() { t.rspin = rand(4, 8); } });
    B.push({ pos: t.group.position, vel: t.bv || (t.bv = V3(0, 0, 0)), r: t.kind === 'cycle' ? 0.7 : 0.8, m: t.kind === 'cycle' ? 18 : 120, kind: 'bike', who: t, flat: true });
  }
  for (const a of animalsLive) if (a.hurtT > 0) {
    if (!a.body) { a.posV = V3(a.x, a.y, a.z); a.body = { pos: a.posV, vel: a.vel, r: a.label === 'goat' ? 0.35 : 0.8, m: a.label === 'goat' ? 30 : 300, kind: 'goat', who: a }; }
    a.posV.set(a.x, a.y, a.z); B.push(a.body);
  }
  return B;
}
// knock a goat or cow with a thrown body (no blame on the rider beyond the police heat)
function knockAnimal(a, vx, vz, s) {
  if (a.label !== 'goat' || a.hurtT > 0) return false;
  a.hurtT = 4.5; a.vel.set(vx * 0.6 + rand(-0.5, 0.5), 1.5 + s * 0.1, vz * 0.6 + rand(-0.5, 0.5)); a.spin = rand(6, 11) * (Math.random() < 0.5 ? -1 : 1);
  bleat(); emitSplash(a.x, a.z, 6, 8); return true;
}
// one body against the world
function collideBody(b, dt) {
  const sp = Math.hypot(b.vel.x, b.vel.z);
  // walls, tree trunks
  const c = cellAt(b.pos.x, b.pos.z);
  if (c && !b.flat && b.pos.y < 2.5) { b.vel.x *= -0.3; b.vel.z *= -0.3; b.pos.x += b.vel.x * dt * 2; b.pos.z += b.vel.z * dt * 2; if (sp > 3) thud(sp, b.who); }
  // poles, hand pumps, haystacks
  for (const o of obstaclesNear(b.pos.x, b.pos.z)) {
    const dx = b.pos.x - o.x, dz = b.pos.z - o.z, d = Math.hypot(dx, dz) || 0.01, R = o.r + b.r;
    if (d < R && b.pos.y < 2) {
      _n.set(dx / d, 0, dz / d); b.pos.x = o.x + _n.x * R; b.pos.z = o.z + _n.z * R;
      const vn = b.vel.x * _n.x + b.vel.z * _n.z; if (vn < 0) { b.vel.x -= 1.4 * vn * _n.x; b.vel.z -= 1.4 * vn * _n.z; b.vel.multiplyScalar(0.55); if (-vn > 2.5) { thud(-vn, b.who); emitSplash(b.pos.x, b.pos.z, 6, 8); } }
    }
  }
  // vehicles (and trolleys): the body bounces off and dents them, or a moving vehicle runs into what is lying on the road
  for (const t of traffic) {
    if (t === b.who) continue;
    const boxes = [[t.group, t.L, t.W, t.cz || 0, VEH_H[t.kind] || 1.8]]; if (t.trailer) boxes.push([t.trailer.group, t.trailer.L + 1.4, t.trailer.W, 0.7, 1.7]);
    for (const [g, L, W, cz, H] of boxes) {
      if (t.down && g === t.group) continue;                       // fallen two-wheelers are bodies themselves
      if (b.pos.y > H) continue;
      const a = g.rotation.y, sa = Math.sin(a), ca = Math.cos(a), dx = b.pos.x - g.position.x, dz = b.pos.z - g.position.z;
      const lz = dx * sa + dz * ca - cz, lx = dx * ca - dz * sa, px = W / 2 + b.r - Math.abs(lx), pz = L / 2 + b.r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      // contact normal: the face with the least penetration, in world space
      if (px < pz) _n.set(Math.sign(lx) * ca, 0, -Math.sign(lx) * sa); else _n.set(Math.sign(lz) * sa, 0, Math.sign(lz) * ca);
      const tv = t.down || t.hitT ? 0 : (t.v || 0); _vv.set(Math.sin(a) * tv, 0, Math.cos(a) * tv);
      const rvn = (b.vel.x - _vv.x) * _n.x + (b.vel.z - _vv.z) * _n.z;   // < 0: closing
      b.pos.addScaledVector(_n, Math.min(px, pz) + 0.02);
      if (rvn >= -0.3) continue;
      const s = -rvn, mr = Math.min(1, 150 / b.m);
      b.vel.x -= 1.35 * rvn * _n.x; b.vel.z -= 1.35 * rvn * _n.z;                        // bounce (35% restitution)
      if (tv > 1) { b.vel.x += _vv.x * 0.6 * mr; b.vel.z += _vv.z * 0.6 * mr; if (!b.flat) b.vel.y = Math.max(b.vel.y, Math.min(5, 1 + tv * 0.3)); b.kicked && b.kicked(); }
      if (s > 2) {
        _cp.copy(b.pos).addScaledVector(_n, -b.r); _cp.y = clamp(b.pos.y, 0.4, H - 0.2);
        damageObject(g, _cp, _n.clone().negate(), s * Math.min(1.4, b.m / 90));
        t.hp = (t.hp ?? 100) - s * b.m / 60; t.hitT = Math.max(t.hitT || 0, 2.5);
        if (t.hp < 45) smokers.add(t); if (t.hp <= 0 && !t.wrecked) { t.wrecked = true; t.hitT = 1e9; }
        if (t.two && !t.down && s > 3) knockRider(t, s * 0.8, -_n.x, -_n.z);
        thud(s, b.who); emitSplash(b.pos.x, b.pos.z, 6, 10);
        if (b.who === 'player' || (b.who && b.who.two)) { heat = Math.min(100, heat + 4); chainSay(`💥 ${t.hi || t.label} से फिर टक्कर! Chain crash into ${/^[aeiou]/.test(t.label) ? 'an' : 'a'} ${t.label}!`); }
      }
    }
  }
  // people on foot
  for (const p of peds) {
    if (p.fallenT > 0 || b.pos.y > 1.7) continue;
    const dx = b.pos.x - p.group.position.x, dz = b.pos.z - p.group.position.z, d = Math.hypot(dx, dz);
    if (d < 0.35 + b.r && sp > 2) {
      p.fallenT = 5; b.vel.multiplyScalar(0.6); thud(sp, b.who);
      heat = Math.min(100, heat + 15); chainSay(`अरे! ${p.label} भी गिरा! It knocked down a ${p.label}!`); beep([600, 500], 0.35, 'triangle', 0.05);
    }
  }
  // animals tied by the houses
  for (const a of animalsLive) {
    if (a === b.who || b.pos.y > 1.5) continue;
    const dx = b.pos.x - a.x, dz = b.pos.z - a.z, d = Math.hypot(dx, dz), R = (a.label === 'goat' ? 0.4 : 0.9) + b.r;
    if (d < R) {
      if (sp > 2 && knockAnimal(a, b.vel.x, b.vel.z, sp)) { b.vel.multiplyScalar(0.7); heat = Math.min(100, heat + 5); chainSay('बकरी भी लपेटे में! The goat got hit too!'); }
      else { _n.set(dx / (d || 1), 0, dz / (d || 1)); b.pos.x = a.x + _n.x * R; b.pos.z = a.z + _n.z * R; const vn = b.vel.x * _n.x + b.vel.z * _n.z; if (vn < 0) { b.vel.x -= 1.3 * vn * _n.x; b.vel.z -= 1.3 * vn * _n.z; if (-vn > 2) { thud(-vn, b.who); if (a.label === 'cow') { a.fleeT = 1.5; a.fleeYaw = Math.atan2(-dx, -dz); moo(); } } } }
    }
  }
  // you, riding along, meet something lying or flying across the road
  if (b.who !== 'player' && player.crashT <= 0 && state === 'play' && player.y < 0.8 && b.pos.y < 1.2) {
    const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < b.r + 0.45) {
      const vx = Math.sin(player.h) * player.v - b.vel.x, vz = Math.cos(player.h) * player.v - b.vel.z, s = Math.hypot(vx, vz);
      if (s > 4) {
        b.vel.x += Math.sin(player.h) * player.v * 0.5; b.vel.z += Math.cos(player.h) * player.v * 0.5; if (!b.flat) b.vel.y = Math.max(b.vel.y, 2 + s * 0.08); b.kicked && b.kicked();
        crashPlayer(b.kind === 'rider' ? 'गिरे हुए आदमी से टक्कर! You ran into a fallen rider!' : b.kind === 'goat' ? 'बकरी से टक्कर! You hit a goat!' : 'गिरी बाइक से टक्कर! You hit a fallen bike!', b.kind === 'rider' ? 30 : 8);
      } else { player.v *= 0.5; b.pos.x += dx / (d || 1) * 0.3; b.pos.z += dz / (d || 1) * 0.3; }
    }
  }
}
// bodies against each other: a sliding bike sweeps a lying rider along, two thrown riders knock together
function collideBodies(B) {
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j]; if (a.who === b.who && a.who === 'player') continue;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = (b.flat ? 0.3 : b.pos.y) - (a.flat ? 0.3 : a.pos.y), d = Math.hypot(dx, dz, dy), R = a.r + b.r;
    if (d >= R || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, vn = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
    const ma = a.m, mb = b.m, push = (R - d) / 2;
    a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
    if (vn < 0) {
      const j2 = -(1.3) * vn / (1 / ma + 1 / mb);
      a.vel.x -= j2 / ma * nx; a.vel.z -= j2 / ma * nz; b.vel.x += j2 / mb * nx; b.vel.z += j2 / mb * nz;
      if (-vn > 2) { thud(-vn, a.who === 'player' || b.who === 'player' ? 'player' : null); if (!a.flat) { a.vel.y = Math.max(a.vel.y, 1); a.kicked && a.kicked(); } if (!b.flat) { b.vel.y = Math.max(b.vel.y, 1); b.kicked && b.kicked(); }
        if (b.kind === 'goat' && b.who.hurtT <= 0) knockAnimal(b.who, a.vel.x, a.vel.z, -vn); }
    }
  }
}
function updateSecondOrder(dt) {
  chainMsgT -= dt;
  const B = activeBodies(); if (!B.length) return;
  for (const b of B) {
    collideBody(b, dt);
    if (b.kind === 'goat') { const a = b.who; a.x = b.pos.x; a.z = b.pos.z; a.y = Math.max(0, b.pos.y); }
  }
  collideBodies(B);
  for (const b of B) if (b.kind === 'goat') { const a = b.who; a.x = b.pos.x; a.z = b.pos.z; }
}
// drivers react to something lying in the road ahead — but only after a human reaction time
function bodyAhead(t, dt) {
  const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), look = 6 + (t.v || 0) * 1.2;
  let seen = false;
  const check = (x, z) => { const dx = x - t.group.position.x, dz = z - t.group.position.z, ah = dx * fx + dz * fz, sd = Math.abs(dx * fz - dz * fx); if (ah > 0 && ah < look && sd < t.W / 2 + 0.8) seen = true; };
  if (crashFx.on && crashFx.pivot) { check(crashFx.pivot.position.x, crashFx.pivot.position.z); check(player.pos.x, player.pos.z); }
  for (const o of traffic) if (o !== t && o.down) { check(o.group.position.x, o.group.position.z); if (o.pivot) check(o.pivot.position.x, o.pivot.position.z); }
  // a moment to notice (it builds up and fades slowly, not on/off), then the driver keeps braking while anything is still in the way
  t.seeT = seen ? (t.seeT || 0) + dt : Math.max(0, (t.seeT || 0) - dt * 0.3);
  if (t.seeT > 0.55) t.brakeT = 1.5; else if (!seen) t.brakeT = Math.max(0, (t.brakeT || 0) - dt);
  return (t.brakeT || 0) > 0;
}

// ================= Kerai Race: three tracks between Kerai's main places, computer riders, finish-line celebration =================
const RACE_PLACES = {
  gate: { hi: 'केराई गेट · दलसिंहसराय–अंगारघाट रोड', en: 'Kerai Gate (Dalsinghsarai–Angarghat Rd)', short: 'Kerai Gate' },
  aqua: { hi: 'हेल्दी एक्वा आरओ प्लांट', en: 'Healthy Aqua RO Plant', short: 'Healthy Aqua', ll: [25.7406236, 85.8748225] },
  pul: { hi: 'केराई पुल चौक', en: 'Kerai Pul Chowk', short: 'Pul Chowk', ll: [25.7520679, 85.8785414] },
};
const RACE_TRACKS = [
  { id: 1, a: 'gate', b: 'pul', name: 'Track 1 · केराई गेट ⇄ पुल चौक' },
  { id: 2, a: 'aqua', b: 'pul', name: 'Track 2 · हेल्दी एक्वा ⇄ पुल चौक' },
  { id: 3, a: 'gate', b: 'aqua', name: 'Track 3 · केराई गेट ⇄ हेल्दी एक्वा' },
];
const BOT_NAMES = ['राजू Raju', 'पप्पू Pappu', 'सोनू Sonu', 'बबलू Bablu', 'मुन्ना Munna', 'गुड्डू Guddu', 'टिंकू Tinku'];
const RACER_COLORS = ['#b71c1c', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00', '#00838f', '#37474f', '#ad1457'];

// ---------- route: shortest sensible road path between two places (main roads preferred) ----------
function placePoint(key) {
  if (key === 'gate') { const s = findStartEdge(); return { ed: s.ed, s: s.s }; }
  const rn = snapToRoad(llToW(...RACE_PLACES[key].ll), 80); return { ed: rn.ed, s: rn.s };
}
function roadPath(A, B) {
  const n = NODES.length, D = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pe = new Array(n), done = new Uint8Array(n);
  const w = e => e.L * (e.main ? 1 : 1.3);
  D[A.ed.a] = A.s; pe[A.ed.a] = 'startA'; D[A.ed.b] = Math.min(D[A.ed.b], A.ed.L - A.s); if (D[A.ed.b] === A.ed.L - A.s) pe[A.ed.b] = 'startB';
  for (;;) {
    let u = -1, best = Infinity; for (let i = 0; i < n; i++) if (!done[i] && D[i] < best) { best = D[i]; u = i; }
    if (u < 0) break; done[u] = 1;
    for (const e of ADJ[u]) { const v = e.a === u ? e.b : e.a; if (D[u] + w(e) < D[v]) { D[v] = D[u] + w(e); prev[v] = u; pe[v] = e; } }
  }
  const viaA = D[B.ed.a] + B.s, viaB = D[B.ed.b] + B.ed.L - B.s;
  // a path of [edge, from s, to s] legs
  let legs = [];
  if (A.ed === B.ed) legs = [[A.ed, A.s, B.s]];
  else {
    let node = viaA <= viaB ? B.ed.a : B.ed.b; const last = [B.ed, node === B.ed.a ? 0 : B.ed.L, B.s];
    while (pe[node] && typeof pe[node] !== 'string') { const e = pe[node], p = prev[node]; legs.unshift([e, e.a === p ? 0 : e.L, e.a === p ? e.L : 0]); node = p; }
    legs.unshift([A.ed, A.s, pe[node] === 'startA' ? 0 : A.ed.L]); legs.push(last);
  }
  const P = [], half = [];
  for (const [ed, s0, s1] of legs) {
    const n2 = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 2));
    for (let k = P.length ? 1 : 0; k <= n2; k++) { const s = s0 + (s1 - s0) * k / n2; P.push(edgeAt(ed, s, 0)); half.push(ed.half); }
  }
  // tidy: drop duplicate points, smooth the corners a little
  const Q = [P[0]], H = [half[0]];
  for (let i = 1; i < P.length; i++) if (P[i].distanceTo(Q[Q.length - 1]) > 0.8) { Q.push(P[i]); H.push(half[i]); }
  for (let it = 0; it < 2; it++) for (let i = 1; i < Q.length - 1; i++) Q[i] = Q[i].clone().lerp(Q[i - 1].clone().add(Q[i + 1]).multiplyScalar(0.5), 0.35);
  const S = [0]; for (let i = 1; i < Q.length; i++) S.push(S[i - 1] + Q[i].distanceTo(Q[i - 1]));
  const T = Q.map((p, i) => { const a = Q[Math.max(0, i - 2)], b = Q[Math.min(Q.length - 1, i + 2)]; return V3(b.x - a.x, 0, b.z - a.z).normalize(); });
  return { P: Q, S, T, H, L: S[S.length - 1] };
}
// position along the route: nearest point in a search window around the hint
function routeProject(R, p, hint = 0, back = 25, fwd = 90) {
  let bi = hint, bd = Infinity;
  for (let i = Math.max(0, hint - back); i < Math.min(R.P.length, hint + fwd); i++) { const d = (R.P[i].x - p.x) ** 2 + (R.P[i].z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return { i: bi, s: R.S[bi], d: Math.sqrt(bd) };
}
function routeAt(R, s, lat = 0, out) {
  s = clamp(s, 0, R.L); let lo = 0, hi = R.S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.S[m] <= s) lo = m; else hi = m; }
  const t = (s - R.S[lo]) / Math.max(1e-6, R.S[hi] - R.S[lo]), a = R.P[lo], b = R.P[hi], T = R.T[lo];
  return (out || V3(0, 0, 0)).set(lerp(a.x, b.x, t) + T.z * lat, 0, lerp(a.z, b.z, t) - T.x * lat);
}
const routeIdx = (R, s) => { let lo = 0, hi = R.S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.S[m] <= s) lo = m; else hi = m; } return lo; };

// ---------- race state ----------
const race = { R: null, track: null, from: null, to: null, racers: [], finished: [], startT: 0, t: 0, celebT: -1, winner: null, objs: [], crowd: [], net: null, mode: 'solo', myId: 'me' };
function racerOf(id) { return race.racers.find(r => r.id === id); }

// ---------- course dressing: painted arrows, start gantry with lights, finish arch, checkered lines, bunting, crowd ----------
const chevTex = canvasTex(64, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(255,214,0,0.9)'; c.beginPath(); c.moveTo(8, 100); c.lineTo(32, 40); c.lineTo(56, 100); c.lineTo(46, 100); c.lineTo(32, 66); c.lineTo(18, 100); c.closePath(); c.fill(); }, true);
const checkTex = canvasTex(128, 32, (c, w, h) => { for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { c.fillStyle = ((x + y) / 16) % 2 ? '#111' : '#fff'; c.fillRect(x, y, 16, 16); } }, true);
function bannerTex(top, sub, bg) {
  return canvasTex(1024, 256, c => { c.fillStyle = bg; c.fillRect(0, 0, 1024, 256); c.fillStyle = '#ffd54f'; c.fillRect(0, 0, 1024, 14); c.fillRect(0, 242, 1024, 14);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold 92px ${FONT}`; c.fillText(top, 512, 105); c.font = `bold 48px ${FONT}`; c.fillText(sub, 512, 196); });
}
function addArch(s, top, sub, bg, lights) {
  const R = race.R, i = routeIdx(R, s), p = routeAt(R, s), T = R.T[i], half = R.H[i] + 1.4, yaw = Math.atan2(T.x, T.z);
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = yaw;
  const pole = M('#eceff1', 0.4, 0.6);
  for (const sx of [-half, half]) { g.add(cyl(0.18, 0.22, 6.2, pole, sx, 3.1, 0)); g.add(box(0.7, 0.3, 0.7, M('#455a64', 0.7), sx, 0.15, 0)); }
  const ban = mesh(new THREE.BoxGeometry(2 * half + 0.6, 1.5, 0.25), [M('#b71c1c'), M('#b71c1c'), M('#b71c1c'), M('#b71c1c'), new THREE.MeshStandardMaterial({ map: bannerTex(top, sub, bg), roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: bannerTex(top, sub, bg), roughness: 0.6 })], 0, 5.6, 0);
  g.add(ban);
  // marigold garlands hanging from the arch
  for (let k = 0; k < 2; k++) { const pts = []; for (let t = 0; t <= 1.0001; t += 0.05) pts.push(V3(-half + 2 * half * t, 4.75 - Math.sin(t * Math.PI) * 0.6 - k * 0.15, k ? -0.15 : 0.15));
    const curve = new THREE.CatmullRomCurve3(pts); const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), M(k ? '#ff9800' : '#ffc107', 0.9), 80); const o = new THREE.Object3D();
    for (let j = 0; j < 80; j++) { o.position.copy(curve.getPoint(j / 79)); o.updateMatrix(); m.setMatrixAt(j, o.matrix); } g.add(m); }
  const line = mesh(new THREE.PlaneGeometry(2 * R.H[i], 1.2), new THREE.MeshStandardMaterial({ map: checkTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.035, 0);
  line.rotation.x = -Math.PI / 2; line.material.map.repeat.set(R.H[i], 1); g.add(line);
  if (lights) {                                                         // start lights: five pairs, red then green
    race.lights = [];
    for (let k = 0; k < 5; k++) { const L = mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#000000' }), -1.6 + k * 0.8, 6.65, 0.2); g.add(L); race.lights.push(L); }
    g.add(box(4.4, 0.6, 0.3, M('#212121', 0.6), 0, 6.65, 0.05));
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g); race.objs.push(g);
  // keep the arch poles out of the way of riders
  for (const sx of [-half, half]) { const q = routeAt(R, s, sx); addObstacle(q.x, q.z, 0.35, 'मेहराब से टक्कर! Hit the arch!'); race.obsAdded = (race.obsAdded || 0) + 1; }
  return g;
}
function buildCourse() {
  const R = race.R;
  // painted chevrons down the middle of the course
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < R.P.length; i++) { const p = R.P[i], T = R.T[i]; const nx = T.z, nz = -T.x, w = 0.45; pos.push(p.x + nx * w, 0.03, p.z + nz * w, p.x - nx * w, 0.03, p.z - nz * w); uv.push(0, R.S[i] / 2.2, 1, R.S[i] / 2.2); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const ch = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false })); ch.renderOrder = 1; scene.add(ch); race.objs.push(ch);
  race.startS = 14; race.finishS = R.L - 2;
  addArch(race.startS + 3, 'शुरुआत · START', RACE_PLACES[race.from].hi, '#1b5e20', true);
  race.finishArch = addArch(race.finishS, '🏁 फिनिश · FINISH', RACE_PLACES[race.to].hi, '#b71c1c', false);
  // bunting along the last 60 m
  for (const sd of [-1, 1]) {
    const pts = []; for (let s = race.finishS - 60; s <= race.finishS; s += 3) { const i = routeIdx(R, s); const p = routeAt(R, s, sd * (R.H[i] + 1.3)); p.y = 2.6 + Math.sin(s * 0.9) * 0.15; pts.push(p); }
    const flags = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.36, 3), new THREE.MeshStandardMaterial({ roughness: 0.8 }), pts.length * 4), o = new THREE.Object3D(), col = new THREE.Color();
    let n = 0; for (let k = 0; k < pts.length - 1; k++) for (let j = 0; j < 4; j++) { o.position.copy(pts[k]).lerp(pts[k + 1], (j + 0.5) / 4); o.position.y -= 0.22 + Math.sin(((j + 0.5) / 4) * Math.PI) * 0.12; o.rotation.set(Math.PI, 0, 0); o.updateMatrix(); flags.setMatrixAt(n, o.matrix); flags.setColorAt(n, col.set(['#ff9800', '#ffffff', '#43a047', '#e53935', '#1e88e5'][n % 5])); n++; }
    flags.count = n; scene.add(flags); race.objs.push(flags);
    const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#5d4037' })); scene.add(rope); race.objs.push(rope);
  }
  buildCrowd();
}
// spectators at the finish: they clap while waiting, then dance and spray champagne for the winner
const bottleGeo = (() => { const g = new THREE.CylinderGeometry(0.035, 0.045, 0.26, 10); g.translate(0, 0.13, 0); return g; })();
function buildCrowd() {
  const R = race.R; race.crowd = [];
  const types = ['man', 'woman', 'man', 'kid', 'woman', 'man', 'oldman', 'schoolboy', 'schoolgirl', 'woman', 'man', 'farmer', 'man', 'woman', 'kid', 'man', 'woman', 'man'];
  types.forEach((t, k) => {
    const P = makePerson(t); const side = k % 2 ? 1 : -1, s = race.finishS + 4 + (k >> 1) * 1.6 + rand(-0.4, 0.4), i = routeIdx(R, Math.min(R.L, s));
    const p = routeAt(R, Math.min(R.L, s), side * (R.H[i] + rand(1.2, 3.2))); if (cellAt(p.x, p.z) === 1) return;
    P.group.position.copy(p); P.group.rotation.y = Math.atan2(R.T[i].x, R.T[i].z) - side * Math.PI / 2 + rand(-0.4, 0.4); scene.add(P.group); race.objs.push(P.group);
    const X = P.bones.pelvis ? P.bones.pelvis.name.slice(0, 5) : 'Bip01', fem = ['woman', 'oldwoman', 'schoolgirl', 'mother'].includes(t);
    const acts = {}; try { acts.clap = P.mixer.clipAction(rbClip(fem ? 'f_clap' : 'f_clap', X)); acts.dance = P.mixer.clipAction(rbClip(fem ? 'f_dance' : 'm_dance', X)); acts.cheer = P.mixer.clipAction(rbClip('m_cheer', X)); } catch (e) {}
    P.idle.play(); P.moving = false;
    const c = { P, acts, mode: 'idle', champ: k < 6 && !['kid', 'schoolboy', 'schoolgirl'].includes(t) };
    if (c.champ && P.bones.rhand) { const b = mesh(bottleGeo, new THREE.MeshStandardMaterial({ color: '#1b5e20', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 })); const foil = cyl(0.02, 0.036, 0.08, M('#ffd54f', 0.3, 0.9), 0, 0.27, 0); b.add(foil); b.visible = false; P.bones.rhand.add(b); b.scale.setScalar(100 * 0.95); b.rotation.z = Math.PI; c.bottle = b; }
    if (acts.clap && Math.random() < 0.5) { c.mode = 'clap'; acts.clap.play(); acts.clap.time = rand(0, 2); P.idle.stop(); }
    race.crowd.push(c);
  });
}
function crowdTo(mode) {
  for (const c of race.crowd) {
    const want = mode === 'party' ? (c.champ ? 'cheer' : Math.random() < 0.65 ? 'dance' : Math.random() < 0.5 ? 'cheer' : 'clap') : mode;
    const a = c.acts[want] || c.P.idle; const cur = c.acts[c.mode] || c.P.idle; if (a === cur) continue;
    a.reset().setEffectiveWeight(1).fadeIn(0.4).play(); a.time = rand(0, 1.5); cur.fadeOut(0.4); c.mode = want;
    if (c.bottle) c.bottle.visible = mode === 'party';
  }
}
function updateCrowd(dt) {
  for (const c of race.crowd) {
    if (c.P.group.position.distanceToSquared(camera.position) > 160 * 160) continue;
    c.P.mixer.update(dt); updateAttachments(c.P);
    if (c.bottle && c.bottle.visible && race.celebT >= 0 && Math.random() < 0.9) {     // champagne spray from the bottle neck
      const tip = c.bottle.localToWorld(V3(0, 0.3, 0)), w = race.winnerPos || tip;
      const dx = w.x - tip.x, dz = w.z - tip.z, d = Math.hypot(dx, dz) || 1;
      FOAM.emit(tip.x, tip.y + 0.05, tip.z, dx / d * 3.2, 4.2, dz / d * 3.2, 0.7, 1.1, 3);
    }
  }
}

// ---------- celebration effects: confetti, fireworks, foam ----------
const FOAM = particles(1200, '#fff8e1', 0.07, 0.95, THREE.NormalBlending);
const FIRE = particles(1500, '#ffffff', 0.22, 1, THREE.AdditiveBlending);
const confGeo = new THREE.PlaneGeometry(0.06, 0.09), CONF_N = 900;
const confetti = new THREE.InstancedMesh(confGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF_N); confetti.frustumCulled = false; confetti.count = 0; scene.add(confetti);
const confP = new Float32Array(CONF_N * 3), confV = new Float32Array(CONF_N * 3), confR = new Float32Array(CONF_N * 3);
let confN = 0;
function confettiBurst(x, y, z, n, up = 7) {
  const col = new THREE.Color();
  for (let k = 0; k < n; k++) { const i = confN++ % CONF_N; confP.set([x, y, z], i * 3); confV.set([rand(-3.5, 3.5), rand(up * 0.6, up), rand(-3.5, 3.5)], i * 3); confR.set([rand(0, 6), rand(0, 6), rand(0, 6)], i * 3);
    confetti.setColorAt(i, col.set(['#ff1744', '#ffd600', '#00e676', '#2979ff', '#ff9100', '#e040fb', '#ffffff'][k % 7])); }
  confetti.count = Math.min(CONF_N, confN); confetti.instanceColor.needsUpdate = true;
}
const _co = new THREE.Object3D();
function updateCelebration(dt) {
  FOAM.update(dt, -6, 0.6); FIRE.update(dt, -3, 1.4);
  for (let i = 0; i < confetti.count; i++) {
    const k = i * 3; confV[k + 1] -= 3.2 * dt; confV[k] *= Math.exp(-1.6 * dt); confV[k + 2] *= Math.exp(-1.6 * dt); if (confV[k + 1] < -1.4) confV[k + 1] = -1.4;
    confP[k] += (confV[k] + Math.sin(race.t * 2 + i) * 0.6) * dt; confP[k + 1] = Math.max(0.03, confP[k + 1] + confV[k + 1] * dt); confP[k + 2] += confV[k + 2] * dt;
    if (confP[k + 1] > 0.04) { confR[k] += dt * 4; confR[k + 1] += dt * 3; }
    _co.position.set(confP[k], confP[k + 1], confP[k + 2]); _co.rotation.set(confR[k], confR[k + 1], confR[k + 2]); _co.updateMatrix(); confetti.setMatrixAt(i, _co.matrix);
  }
  confetti.instanceMatrix.needsUpdate = true;
  if (race.celebT < 0) return;
  race.celebT += dt;
  const c = race.finishArch.position;
  if (race.celebT < 14) {
    if (Math.random() < dt * 1.6) { const fx = c.x + rand(-25, 25), fz = c.z + rand(-25, 25), fy = rand(22, 34), colr = pick(['#ff1744', '#ffd600', '#00e676', '#40c4ff', '#e040fb', '#ff9100']);
      FIRE.points.material.color.set(colr); FIRE.emit(fx, fy, fz, 0, 0, 0, 9, 1.6, 140); firePop(); }
    if (Math.random() < dt * 2.2) for (const sx of [-1, 1]) { const q = race.finishArch.localToWorld(V3(sx * 5, 6.2, 0)); confettiBurst(q.x, q.y, q.z, 40, 6); }
  }
}

// ---------- sound: dhol rhythm, crowd roar, fanfare, fireworks ----------
let dholT = 0, dholStep = 0;
function dhol(dt) {
  if (!AC || race.celebT < 0 || race.celebT > 16) return;
  dholT -= dt; if (dholT > 0) return; dholT = 0.16;
  const pat = [1, 0, 2, 1, 0, 2, 1, 2]; const h = pat[dholStep++ % pat.length]; if (!h) return;
  const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(h === 1 ? 95 : 190, AC.currentTime); o.frequency.exponentialRampToValueAtTime(h === 1 ? 45 : 120, AC.currentTime + 0.18);
  g.gain.setValueAtTime(h === 1 ? 0.5 : 0.28, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.22); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.25);
  if (h === 2) noiseHit(0.05, 0.12, 'highpass', 3000, 0.8);
}
function crowdRoar(sec = 6, vol = 0.35) {
  if (!AC) return;
  const n = Math.ceil(AC.sampleRate * sec), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) { const t = i / AC.sampleRate; d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(t * 7 + Math.sin(t * 1.3) * 3)) * Math.min(1, t * 3) * Math.min(1, (sec - t) * 0.8); }
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(AC.destination); s.start();
  for (let k = 0; k < 10; k++) setTimeout(() => { const o = AC.createOscillator(), gg = AC.createGain(); o.type = 'triangle'; const f0 = rand(900, 1500); o.frequency.setValueAtTime(f0, AC.currentTime); o.frequency.linearRampToValueAtTime(f0 * 1.3, AC.currentTime + 0.25); gg.gain.setValueAtTime(0.04, AC.currentTime); gg.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.4); o.connect(gg).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.42); }, rand(0, sec * 800));   // whistles
}
function fanfare() { if (!AC) return; [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.5], [784, 0.75], [1047, 0.9]].forEach(([f, t]) => setTimeout(() => { for (const m of [1, 1.5]) beep([f * m], 0.35, 'sawtooth', 0.035); }, t * 1000)); }
function firePop() { if (!AC) return; setTimeout(() => noiseHit(0.5, 0.35, 'lowpass', 900, 0.7), rand(80, 300)); }

// ---------- racers ----------
function makeRacer(id, name, color, kind) {
  const bk = makeBike(color, 'man', { helmet: kind === 'me' ? '#f5f5f5' : pick(['#212121', '#ffffff', '#c62828', '#1565c0', '#ffd600']), shirt: color });
  flagBike(bk);
  const tag = textSprite(name, { size: 40, bg: kind === 'me' ? 'rgba(183,28,28,0.75)' : 'rgba(0,0,0,0.6)', scale: 0.2 }); tag.position.set(0, 2.15, 0); tag.renderOrder = 5; tag.material.depthTest = false;
  if (kind !== 'me') { bk.group.add(tag); scene.add(bk.group); }
  return { id, name, color, kind, bk, tag, s: 0, i: 0, v: 0, lat: 0, latPref: 0, h: 0, yawRate: 0, finished: false, time: 0, place: 0, crashT: 0, vmax: 0, accel: 0, wob: rand(0, 6), net: [] };
}
function gridSlot(k) { const row = k >> 1, col = k % 2 ? 1 : -1; return { s: race.startS - 1.5 - row * 4.5, lat: col * 1.4 }; }
function setupRace(trackFrom, trackTo, entrants) {
  clearRace();
  race.from = trackFrom; race.to = trackTo;
  race.R = roadPath(placePoint(trackFrom), placePoint(trackTo));
  buildCourse();
  race.racers = entrants.map((e, k) => {
    const r = e.id === race.myId ? Object.assign(makeRacer(e.id, e.name, e.color, 'me'), { bk: player.model }) : makeRacer(e.id, e.name, e.color, e.bot ? 'bot' : 'net');
    const g = gridSlot(k), i = routeIdx(race.R, g.s); r.s = g.s; r.lat = r.latPref = clamp(g.lat, -race.R.H[i] + 0.7, race.R.H[i] - 0.7); r.i = i;
    if (e.bot) { r.vmax = rand(36, 47); r.accel = rand(2.4, 3.3); r.aLat = rand(5.5, 7); r.latPref = rand(-0.4, 0.4) * race.R.H[i]; r.mist = rand(0, 1); }
    const p = routeAt(race.R, r.s, r.lat); r.h = Math.atan2(race.R.T[i].x, race.R.T[i].z);
    if (r.kind === 'me') { player.pos.copy(p); player.h = r.h; } else { r.bk.group.position.copy(p); r.bk.group.rotation.y = r.h; }
    return r;
  });
  race.finished = []; race.t = 0; race.celebT = -1; race.winner = null; race.winnerPos = null; race.resultsShown = false;
}
function clearRace() {
  for (const o of race.objs) scene.remove(o); race.objs.length = 0; race.crowd = [];
  for (const r of race.racers) if (r.kind !== 'me') scene.remove(r.bk.group);
  race.racers = []; confetti.count = 0; confN = 0;
  if (race.obsAdded) { obstacles.splice(obstacles.length - race.obsAdded, race.obsAdded); for (const k in obsGrid) obsGrid[k] = obsGrid[k].filter(o => obstacles.includes(o)); race.obsAdded = 0; }
}
// computer riders: follow the course, brake for bends, overtake slower things, now and then make a mistake
function updateBot(r, dt) {
  const R = race.R;
  if (r.crashT > 0) { r.crashT -= dt; r.v = Math.max(0, r.v - 25 * dt); r.bk.lean.rotation.z = lerp(r.bk.lean.rotation.z, 1.35, 0.15); if (r.crashT <= 0) r.bk.lean.rotation.z = 0; }
  else if (r.finished) r.v = Math.max(0, r.v - 9 * dt);
  else {
    // speed the bend ahead allows
    let vCap = r.vmax; const i0 = routeIdx(R, r.s);
    for (let d = 6; d < 26 + r.v * 2.2; d += 6) { const j = routeIdx(R, r.s + d), k = routeIdx(R, r.s + d + 8); const da = Math.abs(angDiff(Math.atan2(R.T[k].x, R.T[k].z), Math.atan2(R.T[j].x, R.T[j].z))); const kap = da / 8;
      if (kap > 1e-3) { const vb = Math.sqrt(r.aLat / kap); const vAllowed = Math.sqrt(vb * vb + 2 * 7.5 * d); vCap = Math.min(vCap, vAllowed); } }
    // anything in the way?
    let blockV = Infinity, blockLat = null;
    const here = routeAt(R, r.s, r.lat), fx = R.T[i0].x, fz = R.T[i0].z;
    const check = (x, z, v) => { const dx = x - here.x, dz = z - here.z, ah = dx * fx + dz * fz, sd = dx * fz - dz * fx; if (ah > 0 && ah < 10 + r.v * 0.9 && Math.abs(sd + 0) < 1.3) { blockV = Math.min(blockV, v); blockLat = -sd; } };
    for (const t of traffic) check(t.group.position.x, t.group.position.z, t.v || 0);
    for (const o of race.racers) if (o !== r) { const p = o.kind === 'me' ? player.pos : o.bk.group.position; check(p.x, p.z, o.kind === 'me' ? player.v : o.v); }
    for (const p of peds) if (Math.abs(p.lat) < p.ed.half) check(p.group.position.x, p.group.position.z, 0);
    const half = R.H[i0] - 0.6;
    if (blockV < Infinity) { const side = r.lat - (blockLat != null ? 0 : 0) > 0 ? 1 : -1; r.latPref = clamp(r.lat + side * 2.2, -half, half); if (Math.abs(r.latPref - r.lat) < 0.5) vCap = Math.min(vCap, blockV + 1); }
    else if (Math.random() < dt * 0.15) r.latPref = rand(-0.45, 0.45) * half;
    const want = Math.min(vCap, r.vmax * (r.mist > 0.92 && Math.sin(race.t * 0.3 + r.wob) > 0.8 ? 0.8 : 1));
    r.v += (r.v < want ? r.accel * (1 - r.v / (r.vmax + 6)) + 0.7 : -Math.min(11, (r.v - want) * 2.5 + 2)) * dt;
    r.v = Math.max(0, r.v);
  }
  const half = R.H[routeIdx(R, r.s)] - 0.55;
  r.lat += clamp(r.latPref - r.lat, -2.2 * dt, 2.2 * dt); r.lat = clamp(r.lat, -half, half);
  const prevH = r.h; r.s = Math.min(R.L + 30, r.s + r.v * dt);
  const p = routeAt(R, Math.min(R.L, r.s), r.lat), q = routeAt(R, Math.min(R.L, r.s + 2), r.lat);
  r.h = Math.atan2(q.x - p.x, q.z - p.z); r.yawRate = angDiff(r.h, prevH) / Math.max(dt, 1e-3);
  r.bk.group.position.copy(p); r.bk.group.rotation.y = r.h;
  if (r.crashT <= 0) animateBike(r.bk, r.v, r.yawRate, dt);
  if (r.wobT > 0) { r.wobT -= dt; r.bk.lean.rotation.z += Math.sin(r.wobT * 30) * 0.15 * r.wobT; }
  updateKick(r.bk, dt); botMaybeKick(r, dt);
  // bump with you
  const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz);
  if (d < 1.15 && state === 'play' && player.crashT <= 0 && r.crashT <= 0) {
    const rel = Math.abs(player.v - r.v);
    if (rel > 7) { crashPlayer(`${r.name} से टक्कर! Clashed with ${r.name.split(' ').pop()}!`, 0); r.crashT = 2.2; noiseHit(0.25, 0.5, 'bandpass', 1500, 1); }
    else { player.pos.x += dx / (d || 1) * 0.25; player.pos.z += dz / (d || 1) * 0.25; r.lat -= Math.sign(dx * R.T[routeIdx(R, r.s)].z - dz * R.T[routeIdx(R, r.s)].x) * 0.2; const avg = (player.v + r.v) / 2; player.v = lerp(player.v, avg, 0.3); r.v = lerp(r.v, avg, 0.3); }
  }
}
// riders on other computers: smooth between their last two updates
function updateNetRacer(r, now) {
  const b = r.net; if (!b.length) return;
  const t = now - 120; while (b.length > 2 && b[1].t <= t) b.shift();
  const a = b[0], c = b[1] || b[0], k = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1.2) : 1;
  const x = lerp(a.x, c.x, k), z = lerp(a.z, c.z, k), h = a.h + angDiff(c.h, a.h) * k;
  const prevH = r.h; r.h = h; r.v = lerp(a.v, c.v, k); r.s = lerp(a.s, c.s, k);
  r.bk.group.position.set(x, c.y || 0, z); r.bk.group.rotation.y = h;
  if (c.crash) r.bk.lean.rotation.z = lerp(r.bk.lean.rotation.z, 1.35, 0.2); else animateBike(r.bk, r.v, angDiff(h, prevH) * 60, 1 / 60);
  updateKick(r.bk, 1 / 60);
}
function racerFinish(r, time) {
  if (r.finished) return;
  r.finished = true; r.time = time; race.finished.push(r); r.place = race.finished.length;
  if (r.place === 1) startCelebration(r);
  if (r.kind === 'me') {
    state = 'finished'; race.myFinishT = race.t;
    say(r.place === 1 ? '🏆 आप जीत गए! YOU WIN!' : `🏁 ${ordinal(r.place)} स्थान · ${ordinal(r.place)} place!`, 4, r.place === 1 ? '#ffd54f' : '#fff');
  } else if (r.place === 1) say(`🏆 ${r.name} जीत गया! ${r.name.split(' ').pop()} wins!`, 3, '#ffd54f');
}
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1 && n % 10) || 0] || 'th');
function startCelebration(r) {
  race.winner = r; race.celebT = 0; race.winnerPos = (r.kind === 'me' ? player.pos : r.bk.group.position).clone(); race.winnerPos.y = 1.2;
  crowdTo('party'); crowdRoar(7, 0.4); fanfare();
  const c = race.finishArch.position; confettiBurst(c.x, 6, c.z, 260, 9);
  const win = r.kind === 'me' || state === 'finished';
  const el = $('winner'); if (el) { el.innerHTML = `<div class="wt">🏆 विजेता · WINNER</div><div class="wn">${escapeHTML(r.name)}</div><div class="ws">${RACE_PLACES[race.from].short} → ${RACE_PLACES[race.to].short} · ${fmtTime(race.t)}</div>`; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 6500); }
  // marigold garland on the winner
  const bk = r.kind === 'me' ? player.model : r.bk, chest = bk.rider.bones && bk.rider.bones.chest;
  if (chest && !bk.garland) { const g = new THREE.Group(); const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 5), M('#ff9800', 0.9), 40), o = new THREE.Object3D();
    for (let j = 0; j < 40; j++) { const a = j / 40 * Math.PI * 2; o.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.22 - 0.1, 0.12 + Math.sin(a) * 0.02); o.updateMatrix(); m.setMatrixAt(j, o.matrix); }
    g.add(m); g.scale.setScalar(100); chest.add(g); bk.garland = g; }
}
const fmtTime = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
// live standings: finished riders by time, then everyone else by distance covered
function standings() {
  return race.racers.slice().sort((a, b) => (b.finished - a.finished) || (a.finished ? a.time - b.time : b.s - a.s));
}
function updateRace(dt) {
  if (!race.R) return;
  const R = race.R, now = performance.now();
  if (state === 'play' || state === 'finished') race.t += dt;
  // you
  const me = racerOf(race.myId);
  if (me) {
    const pr = routeProject(R, player.pos, me.i || 0); me.i = pr.i; me.s = pr.s; me.v = player.v; me.off = pr.d;
    if (!me.finished && state === 'play' && pr.s >= race.finishS && pr.d < R.H[pr.i] + 6) { racerFinish(me, race.t); if (race.net) race.net.send({ t: 'fin', time: race.t }); }
    if (state === 'finished') player.v = Math.max(0, player.v - 8 * dt);
  }
  for (const r of race.racers) {
    if (r.kind === 'bot' && (state === 'play' || state === 'finished' || state === 'over')) {
      if (race.mode === 'solo' || race.isHost) { updateBot(r, dt); if (!r.finished && r.s >= race.finishS) { racerFinish(r, race.t); if (race.net) race.net.send({ t: 'fin', id: r.id, time: race.t }); } }
      else updateNetRacer(r, now);
    } else if (r.kind === 'net') updateNetRacer(r, now);
    if (r.kind !== 'me') r.tag.visible = r.bk.group.position.distanceToSquared(camera.position) < 140 * 140;
  }
  updateCrowd(dt); updateCelebration(dt); dhol(dt);
  // results once everyone is in (or 30 s after you finish)
  if (state === 'finished' && !race.resultsShown && (race.finished.length === race.racers.length || race.t - race.myFinishT > 30)) { race.resultsShown = true; setTimeout(showResults, 2500); }
  if (race.net && (state === 'play' || state === 'finished') && now - (race.lastSend || 0) > 66) { race.lastSend = now; race.net.sendState(); }
}
function showResults() {
  state = 'over'; if (eng) eng.gn.gain.value = 0.015;
  const rows = standings().map((r, k) => `<tr class="${r.kind === 'me' ? 'me' : ''}"><td>${k === 0 ? '🥇' : k === 1 ? '🥈' : k === 2 ? '🥉' : k + 1}</td><td>${escapeHTML(r.name)}</td><td>${r.finished ? fmtTime(r.time) : 'DNF · ' + Math.round(race.R.L - r.s) + ' m to go'}</td></tr>`).join('');
  const w = race.finished[0];
  $('results').innerHTML = `<h1>${w && w.kind === 'me' ? '🏆 आप जीत गए! YOU WON!' : w ? '🏆 ' + escapeHTML(w.name) + ' जीता!' : 'Race over'}</h1>
    <p>${RACE_PLACES[race.from].hi} → ${RACE_PLACES[race.to].hi} · ${(race.R.L / 1000).toFixed(2)} km</p>
    <table class="podium">${rows}</table><p class="k">Press <b>Enter</b> for the lobby</p><button type="button" class="lobby-button" data-lobby>Back to lobby</button>`;
  $('results').style.display = 'flex';
}
// course guidance in the HUD: the next turn on the course and the distance to the finish
function nextTurn(me) {
  const R = race.R; let acc = 0, s0 = me.s;
  for (let d = 10; d < 260; d += 5) { const a = routeIdx(R, s0 + d - 5), b = routeIdx(R, s0 + d); const da = angDiff(Math.atan2(R.T[b].x, R.T[b].z), Math.atan2(R.T[a].x, R.T[a].z)); acc += da;
    if (Math.abs(acc) > 0.9) return { d, dir: acc > 0 ? 'left' : 'right' }; if (Math.abs(da) < 0.02) acc *= 0.85; }
  return null;
}
// reset to the course (R key) — back onto the racing line where you left it
function resetToCourse() {
  const me = racerOf(race.myId); if (!me || !race.R) return;
  const p = routeAt(race.R, Math.max(race.startS, me.s - 5), 0), i = routeIdx(race.R, me.s); player.pos.copy(p); player.h = Math.atan2(race.R.T[i].x, race.R.T[i].z); player.v = 0;
  if (player.crashT > 0) { player.crashT = 0; endCrash(); player.model.lean.rotation.z = 0; }
  say('↩ रास्ते पर वापस · Back on course', 1.2);
}

// ================= Kicking, Road Rash style: J = left foot, K = right foot =================
const _kq = new THREE.Quaternion(), _kp = new THREE.Quaternion(), _kb = new THREE.Quaternion(), _kax = new THREE.Vector3();
function kickBones(bk) {
  if (bk.kb !== undefined) return bk.kb;
  const R = bk.rider; if (!R.rb || !R.bones.pelvis) return (bk.kb = null);
  const X = R.bones.pelvis.name.slice(0, 5), f = n => findBone(R.body, X + n);
  const kb = { L: [f('_L_Thigh'), f('_L_Calf')], R: [f('_R_Thigh'), f('_R_Calf')] };
  for (const s of ['L', 'R']) kb[s].base = kb[s].map(b => b && b.quaternion.clone());
  return (bk.kb = kb);
}
function startKick(bk, side) { if (bk.kick && bk.kick.t < 0.45) return false; bk.kick = { side, t: 0, hit: false }; return true; }
// swing the leg out sideways (about the bike's forward axis) and straighten the knee, then bring it back
function updateKick(bk, dt) {
  const k = bk.kick; if (!k) return; const kb = kickBones(bk); k.t += dt;
  const side = k.side === 'left' ? 'L' : 'R', legs = kb && kb[side];
  const amt = k.t < 0.42 ? Math.sin(Math.min(1, k.t / 0.42) * Math.PI) : 0;
  if (legs && legs[0]) {
    legs.forEach((b, j) => b && b.quaternion.copy(legs.base[j]));
    bk.group.updateMatrixWorld(true);
    const sgn = k.side === 'left' ? 1 : -1;
    _kax.set(0, 0, 1).transformDirection(bk.lean.matrixWorld); _kq.setFromAxisAngle(_kax, sgn * 1.25 * amt);
    for (const [b, extra] of [[legs[0], 1], [legs[1], 0]]) { if (!b) continue;
      if (extra) { b.getWorldQuaternion(_kb); b.parent.getWorldQuaternion(_kp).invert(); b.quaternion.copy(_kp.multiply(_kq.clone().multiply(_kb))); b.updateMatrixWorld(true); }
      else { _kax.set(1, 0, 0).transformDirection(bk.lean.matrixWorld); const q2 = new THREE.Quaternion().setFromAxisAngle(_kax, -0.9 * amt); b.getWorldQuaternion(_kb); b.parent.getWorldQuaternion(_kp).invert(); b.quaternion.copy(_kp.multiply(q2.multiply(_kb))); }
    }
    updateAttachments(bk.rider);
  }
  bk.lean.rotation.z += (k.side === 'left' ? -1 : 1) * 0.12 * amt;            // the rider leans away to put weight into it
  if (k.t > 0.5) { if (legs) legs.forEach((b, j) => b && b.quaternion.copy(legs.base[j])); bk.kick = null; }
}
// who is beside you on that side?
function kickTargets(pos, h, side) {
  const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h), sg = side === 'left' ? 1 : -1, out = [];
  const test = (x, z) => { const dx = x - pos.x, dz = z - pos.z, al = dx * fx + dz * fz, sd = (dx * lx + dz * lz) * sg; return sd > 0.35 && sd < 2.0 && Math.abs(al) < 1.5; };
  for (const r of race.racers) { const p = r.kind === 'me' ? player.pos : r.bk.group.position; if (p !== pos && test(p.x, p.z)) out.push({ r }); }
  for (const t of traffic) if (t.two && !t.down && test(t.group.position.x, t.group.position.z)) out.push({ t });
  for (const p of peds) if (p.fallenT <= 0 && test(p.group.position.x, p.group.position.z)) out.push({ p });
  return out;
}
function playerKick(side) {
  if (state !== 'play' || player.crashT > 0) return;
  if (!startKick(player.model, side)) return;
  noiseHit(0.08, 0.15, 'highpass', 1800, 0.7);
  if (race.net) race.net.send({ t: 'kick', side });
  setTimeout(() => {                                                       // contact at full stretch
    if (state !== 'play' || player.crashT > 0) return;
    for (const tg of kickTargets(player.pos, player.h, side)) {
      kickThud();
      if (tg.r) {
        const r = tg.r, nm = r.name.split(' ').pop();
        if (r.kind === 'bot' && (race.mode === 'solo' || race.isHost)) kickBot(r, side, nm);
        else if (r.kind === 'bot' && race.net) race.net.send({ t: 'kickhit', to: r.id, side });
        else if (r.kind === 'net' && race.net) { race.net.send({ t: 'kickhit', to: r.id, side }); say(`👢 ${nm} को लात मारी! Kicked ${nm}!`, 1.4, '#ffcc80'); }
      } else if (tg.t) { knockRider(tg.t, 8, Math.cos(player.h) * (side === 'left' ? 1 : -1), -Math.sin(player.h) * (side === 'left' ? 1 : -1)); heat = Math.min(100, heat + 10); say(`👢 ${tg.t.hi || tg.t.label} गिरा! Kicked a ${tg.t.label} off!`, 1.4, '#ffcc80'); }
      else if (tg.p) { tg.p.fallenT = 5; say('अरे! आदमी को लात? Kicked a pedestrian!', 1.4, '#ff8a80'); }
      // pushing someone pushes you back a little too
      const sg = side === 'left' ? -1 : 1; player.pos.x += Math.cos(player.h) * sg * 0.25; player.pos.z += -Math.sin(player.h) * sg * 0.25; player.wobT = Math.max(player.wobT || 0, 0.25);
      break;
    }
  }, 160);
}
function kickThud() { noiseHit(0.12, 0.6, 'lowpass', 500, 0.8); beep([140], 0.08, 'sine', 0.1); }
// a kicked rider wobbles and loses speed — or goes down
function kickBot(r, side, nm) {
  const sg = side === 'left' ? 1 : -1;
  if (r.crashT > 0 || r.finished) return;
  r.latPref = r.lat = r.lat + sg * 0.9 * (Math.cos(0) || 1);
  if (Math.random() < 0.35 + Math.min(0.3, Math.abs(player.v - r.v) * 0.02)) { r.crashT = 2.6; r.v *= 0.4; say(`👢 ${nm} गिर गया! Kicked ${nm} off the bike!`, 1.6, '#ffd54f'); noiseHit(0.25, 0.5, 'bandpass', 1500, 1); }
  else { r.v *= 0.8; r.wobT = 0.9; say(`👢 ${nm} को लात! Kicked ${nm}!`, 1.2, '#ffcc80'); }
}
// you got kicked (by a computer rider, or by a friend over the network)
function kickedBy(name, side) {
  if (player.crashT > 0 || state !== 'play') return;
  kickThud(); crashFx.shake = Math.max(crashFx.shake, 0.3);
  const sg = side === 'left' ? 1 : -1;     // their left foot pushes you to their left
  if (Math.random() < 0.3) crashPlayer(`${name} ने लात मारी! ${name} kicked you off!`, 0);
  else { player.v *= 0.85; player.wobT = 0.9; player.h += sg * 0.06; say(`👢 ${name} ने लात मारी! Kicked by ${name}!`, 1.2, '#ff8a80'); }
}
// computer riders kick back when they're alongside you
function botMaybeKick(r, dt) {
  if (r.crashT > 0 || r.finished || state !== 'play' || player.crashT > 0) return;
  r.kickCD = (r.kickCD || rand(1, 3)) - dt; if (r.kickCD > 0) return;
  const p = r.bk.group.position, fx = Math.sin(r.h), fz = Math.cos(r.h), dx = player.pos.x - p.x, dz = player.pos.z - p.z, al = dx * fx + dz * fz, sd = dx * Math.cos(r.h) - dz * Math.sin(r.h);
  if (Math.abs(al) < 1.3 && Math.abs(sd) > 0.4 && Math.abs(sd) < 1.9 && Math.random() < dt * 1.5) {
    const side = sd > 0 ? 'left' : 'right'; startKick(r.bk, side); r.kickCD = rand(2.5, 5);
    setTimeout(() => { const s2 = (player.pos.x - p.x) * Math.cos(r.h) - (player.pos.z - p.z) * Math.sin(r.h); if (Math.abs(s2) < 2.1 && Math.sign(s2) === Math.sign(sd)) kickedBy(r.name.split(' ').pop(), side); }, 160);
  }
}

// ================= Lobby & multiplayer (WebSocket to server/server.js on the host laptop) =================
const lobby = { name: '', from: 'gate', to: 'pul', bots: 3, players: [], hostId: null, online: false };
try { lobby.name = localStorage.getItem('keraiRaceName') || ''; } catch (e) {}
// The published game runs entirely in the browser.
function connectNet() { return null; }
// ---------- lobby screen ----------
function renderLobby() {
  const el = $('title'); if (!el || state !== 'title') return;
  const online = lobby.online, isHost = !online || lobby.hostId === (race.net && race.net.id), opts = k => Object.entries(RACE_PLACES).map(([key, p]) => `<option value="${key}" ${key === k ? 'selected' : ''}>${p.short} · ${p.hi.split(' · ')[0]}</option>`).join('');
  const others = lobby.players.filter(p => !race.net || p.id !== race.net.id);
  // the lobby redraws whenever anyone joins or changes something — keep your typing cursor where it was
  const ae = document.activeElement, keep = ae && ae.id === 'lname' ? { s: ae.selectionStart, e: ae.selectionEnd } : null;
  el.innerHTML = `<h1>केराई रेस · KERAI RACE</h1>
    <p>Race from one of Kerai's three main places to another. First to the finish arch wins.</p>
    <div class="lob">
      <label>आपका नाम · Your name <input id="lname" maxlength="16" value="${lobby.name.replace(/"/g, '')}" placeholder="e.g. Vivek"></label>
      <div class="row"><label>शुरुआत · Start <select id="lfrom" ${isHost ? '' : 'disabled'}>${opts(lobby.from)}</select></label>
        <button id="lswap" ${isHost ? '' : 'disabled'} title="Swap">⇄</button>
        <label>फिनिश · Finish <select id="lto" ${isHost ? '' : 'disabled'}>${opts(lobby.to)}</select></label></div>
      <div class="tracks">${RACE_TRACKS.map(t => `<span class="${(t.a === lobby.from && t.b === lobby.to) || (t.b === lobby.from && t.a === lobby.to) ? 'on' : ''}">${t.name}</span>`).join('')}</div>
      <label>कंप्यूटर राइडर · Computer riders <select id="lbots" ${isHost ? '' : 'disabled'}>${[0, 1, 2, 3, 4, 5].map(n => `<option ${n === lobby.bots ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${online ? `<div class="plist"><b>${lobby.players.length} in the room</b>${lobby.players.map(p => `<span>${p.id === lobby.hostId ? '👑 ' : '🏍 '}${escapeHTML(p.name || '…')}</span>`).join('')}</div>
        <p class="small">Friends can join at <b>${location.origin}${location.pathname}</b></p>` : `<p class="small">Race against the computer. No account needed.</p>`}
      ${isHost ? `<button id="lgo" class="go">🏁 ${online && others.length ? 'Start the race for everyone' : 'Start race'}</button>` : `<p class="wait">Waiting for 👑 ${escapeHTML((lobby.players.find(p => p.id === lobby.hostId) || {}).name || 'host')} to start…</p>`}
    </div>
    <table class="keys"><tr><td class="k"><b>W</b>/<b>↑</b> Throttle</td><td class="k"><b>S</b>/<b>↓</b> Brake</td><td class="k"><b>A D</b>/<b>← →</b> Steer</td><td class="k"><b>H</b> Horn</td><td class="k"><b>J</b> Kick left</td></tr>
      <tr><td class="k"><b>R</b> Back on course</td><td class="k"><b>V</b> Rider's view</td><td class="k"><b>F</b> Full screen</td><td class="k"><b>Space</b> Jump</td><td class="k"><b>K</b> Kick right</td></tr></table><p class="touch-help">Hold GAS to accelerate. Steer with your left thumb, brake with your right. Landscape gives you more room.</p><p><a href="/slops/" style="color:#ffe082">← Slops</a></p>`;
  const q = id => document.getElementById(id);
  if (keep) { const i = q('lname'); i.focus(); i.setSelectionRange(keep.s, keep.e); }
  q('lname').oninput = e => { lobby.name = e.target.value.replace(/^\s+/, ''); try { localStorage.setItem('keraiRaceName', lobby.name); } catch (er) {} clearTimeout(lobby.nameT); lobby.nameT = setTimeout(() => { if (race.net) race.net.send({ t: 'join', name: lobby.name.trim() }); }, 400); };
  q('lname').onkeydown = e => e.stopPropagation();
  const sync = () => { if (lobby.from === lobby.to) lobby.to = Object.keys(RACE_PLACES).find(k => k !== lobby.from); if (race.net && isHost) race.net.send({ t: 'cfg', from: lobby.from, to: lobby.to, bots: lobby.bots }); renderLobby(); };
  if (isHost) {
    q('lfrom').onchange = e => { lobby.from = e.target.value; sync(); };
    q('lto').onchange = e => { lobby.to = e.target.value; if (lobby.to === lobby.from) lobby.from = Object.keys(RACE_PLACES).find(k => k !== lobby.to); sync(); };
    q('lswap').onclick = () => { [lobby.from, lobby.to] = [lobby.to, lobby.from]; sync(); };
    q('lbots').onchange = e => { lobby.bots = +e.target.value; sync(); };
    q('lgo').onclick = () => lobbyGo();
  }
  for (const s of el.querySelectorAll('select,button,input')) s.addEventListener('pointerdown', e => e.stopPropagation());
}
function lobbyGo() {
  if (!lobby.name) { lobby.name = 'You'; }
  initAudio();
  const online = lobby.online && race.net && lobby.hostId === race.net.id;
  const humans = online ? lobby.players.map(p => ({ id: p.id, name: p.name || 'Rider' })) : [{ id: race.myId, name: lobby.name || 'You' }];
  const bots = BOT_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, lobby.bots).map((n, k) => ({ id: 'bot' + k, name: n, bot: true }));
  const entrants = [...humans, ...bots].sort(() => Math.random() - 0.5).map((e, k) => ({ ...e, color: RACER_COLORS[k % RACER_COLORS.length] }));
  if (online) race.net.send({ t: 'go', entrants, from: lobby.from, to: lobby.to });
  else startRace(entrants, lobby.from, lobby.to, false, true);
}


// ---------- Game state ----------
const START_TIME = 180;
let state = 'loading', raceT = 0, countdown = 0, msgT = 0, heat = 0, splashMsgT = 0, timeLeft = START_TIME, score = 0, streak = 0, streakT = 0, distance = 0;
const player = { pos: new THREE.Vector3(), h: 0, v: 0, y: 0, vy: 0, yawRate: 0, delta: 0, crashT: 0, model: null, rn: null, landT: 0 };
const traffic = [], peds = [];
let police = null; const trail = [];
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function say(text, t = 2.2, color = '#fff') { const m = $('msg'); m.textContent = text; m.style.color = color; m.style.opacity = 1; msgT = t; }
function bump(id) { const e = $(id); if (!e) return; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
let START = null;
function findStart() {
  const st = findStartEdge(); if (st) return st;
  const p = llToW(25.7406236, 85.8748225);             // fallback: Healthy Aqua Water Plant
  for (let r = 0; r < 60; r += 2) for (let a = 0; a < 6.3; a += 0.5) { const rn = roadNear(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r); if (rn && rn.d < 3) return { ed: rn.ed, s: rn.s }; }
  return { ed: EDGES[0], s: 5 };
}

// ---------- Traffic on the road graph ----------
const TRAFFIC_MAX = 14, PED_MAX = 14;
function nextEdge(node, from) {
  const opts = ADJ[node].filter(e => e !== from);
  return opts.length ? pick(opts) : from;
}
function advanceOnGraph(a, ds) {           // moves an actor {ed, s, dir} along roads, turning at junctions
  a.s += a.dir * ds;
  let guard = 0;
  while ((a.s < 0 || a.s > a.ed.L) && guard++ < 4) {
    const node = a.s < 0 ? a.ed.a : a.ed.b, over = a.s < 0 ? -a.s : a.s - a.ed.L;
    const ne = nextEdge(node, a.ed);
    if (ne.a === node) { a.dir = 1; a.s = over; } else { a.dir = -1; a.s = ne.L - over; }
    a.ed = ne;
  }
}
function spawnSpot(minD, maxD) {
  for (let t = 0; t < 30; t++) {
    const ang = rand(0, Math.PI * 2), r = rand(minD, maxD), x = player.pos.x + Math.cos(ang) * r, z = player.pos.z + Math.sin(ang) * r;
    const rn = roadNear(x, z); if (rn && rn.d < 4) return rn;
  }
  return null;
}
function spawnTraffic() {
  const rn = spawnSpot(70, 230); if (!rn) return;
  // no bullock carts in Kerai; cows and goats stay tied up by the houses (crash.js), not on the road
  const kinds = rn.ed.main ? [vTractor, vTractor, vAuto, vAuto, vAuto, vERick, vBiker, vBiker, vCycle] : [vCycle, vCycle, vBiker, vBiker, vERick, vAuto, () => vTractor(Math.random() < 0.4)];
  const o = pick(kinds)(); scene.add(o.group);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const lat = dir * clamp(rn.ed.half - o.W / 2 - 0.35, 0.25, rn.ed.half * 0.62);              // keep left, by the vehicle's own width
  const t = { ...o, ed: rn.ed, s: rn.s, dir, lat, laneLat: lat / rn.ed.half, wander: rand(0, 6), speed: o.speed * rand(0.85, 1.15) * (rn.ed.main ? 1.25 : 0.9), hp: 100 };
  edgeAt(t.ed, t.s, t.lat, t.group.position); t.yaw = edgeYaw(t.ed, t.s, t.dir); t.group.rotation.y = t.yaw; traffic.push(t);
  if (t.trailer) { scene.add(t.trailer.group); t.group.updateMatrixWorld(true); const h = t.group.localToWorld(V3(0, 0, -1.32)); t.trailer.axle = h.clone().add(V3(-Math.sin(t.yaw) * t.trailer.tow, 0, -Math.cos(t.yaw) * t.trailer.tow)); }
}
function removeTraffic(t) {
  scene.remove(t.group); if (t.trailer) scene.remove(t.trailer.group); if (t.pivot) scene.remove(t.pivot); smokers.delete(t);
}
// wheels turn, two-wheelers lean, three-wheelers roll a little, tractors steer, the trolley follows its hitch
function animateVehicle(t, yawRate, dt) {
  const v = t.v || 0;
  if (t.wheels) for (const w of t.wheels) w.rotation.x += v * dt / (w.userData.r || 0.3);
  if (t.trailer) for (const w of t.trailer.wheels) w.rotation.x += v * dt / w.userData.r;
  if (t.kind === 'biker') animateBike(t.bike, v, yawRate, dt);
  else if (t.kind === 'cycle') { t.lean.rotation.z = -clamp(Math.atan(v * yawRate / 9.81), -0.5, 0.5); t.crank.rotation.x += v * dt * 0.9; t.fork.rotation.y = clamp(yawRate * 0.5, -0.4, 0.4); if (t.group.position.distanceToSquared(player.pos) < 60 * 60) holdBars(t.ik); }
  else if (t.roll) t.group.rotation.z = clamp(yawRate * v * t.roll, -0.08, 0.08);
  if (t.steer) for (const s of t.steer) s.rotation.y = clamp(yawRate * 0.9, -0.5, 0.5);
  if (t.jolt > 0) { t.jolt -= dt; const k = Math.sin(t.jolt * 30) * t.jolt; t.group.position.x += t.joltDir.x * k; t.group.position.z += t.joltDir.z * k; }
  if (t.trailer) {                                                        // towed-trailer kinematics: the axle is dragged towards the hitch
    const T = t.trailer; t.group.updateMatrixWorld(true); const h = t.group.localToWorld(V3(0, 0, -1.32));
    const dx = h.x - T.axle.x, dz = h.z - T.axle.z, d = Math.hypot(dx, dz) || 1;
    T.axle.set(h.x - dx / d * T.tow, 0, h.z - dz / d * T.tow); T.group.position.copy(T.axle); T.group.rotation.y = Math.atan2(dx, dz);
  }
}
// you against a vehicle (and its trolley): both get damaged
function vehicleHits(t) {
  if (player.crashT > 0 || state !== 'play' || player.y > 0.6) return;
  const boxes = [[t.group, t.L, t.W, t.cz || 0]]; if (t.trailer) boxes.push([t.trailer.group, t.trailer.L + 1.4, t.trailer.W, 0.7]);
  for (const [g, L, W, cz] of boxes) {
    const dx = player.pos.x - g.position.x, dz = player.pos.z - g.position.z, a = g.rotation.y;
    const lz = dx * Math.sin(a) + dz * Math.cos(a) - cz, lx = dx * Math.cos(a) - dz * Math.sin(a);
    if (Math.abs(lz) < L / 2 + 0.6 && Math.abs(lx) < W / 2 + 0.35) {
      // closing speed: your velocity minus the vehicle's
      const tv = t.down ? 0 : (t.v || 0), vx = Math.sin(player.h) * player.v - Math.sin(t.yaw) * t.dir * 0 - Math.sin(g.rotation.y) * tv, vz = Math.cos(player.h) * player.v - Math.cos(g.rotation.y) * tv;
      const s = Math.hypot(vx, vz);
      if (Math.abs(player.v) > 4 || s > 6) { hitVehicle(t, g, Math.min(s, 30), t.label); crashPlayer(`${t.hi || t.label} से टक्कर! Hit ${/^[aeiou]/.test(t.label) ? 'an' : 'a'} ${t.label}!`, t.heat); }
      else { player.v = 0; player.pos.x += dx * 0.1; player.pos.z += dz * 0.1; if (s > 2) damageObject(g, V3(player.pos.x, 0.7, player.pos.z), V3(-dx, 0, -dz).normalize(), s * 0.5); }
      return;
    }
  }
}
function scareAnimal(t) {
  t.scared = 3.5; t.moving = true; t.wander = 4;
  t.tLat = (Math.sign(t.lat) || (Math.random() < 0.5 ? -1 : 1)) * (t.ed.half + rand(1.2, 2.2));
  const fwd = edgeYaw(t.ed, t.s, 1); t.dir = Math.cos(fwd - player.h) > 0 ? 1 : -1;
}
function updateTraffic(dt) {
  for (let k = traffic.length - 1; k >= 0; k--) {
    const t = traffic[k];
    if (t.group.position.distanceToSquared(player.pos) > 270 * 270) { removeTraffic(t); traffic.splice(k, 1); continue; }
    if (t.down) { updateFallen(t, dt); if (t.down) { vehicleHits(t); continue; } }
    if (t.animal) {
      t.wander -= dt; t.scared = Math.max(0, (t.scared || 0) - dt);
      if (t.wander < 0 && !t.scared) { t.wander = rand(3, 9); t.tLat = rand(-1, 1) * t.ed.half; t.dir = Math.random() < 0.5 ? 1 : -1; t.moving = Math.random() < 0.6; }
      const pd = t.group.position.distanceTo(player.pos);
      if (!t.scared && pd < 14 && Math.abs(player.v) > 6 && Math.random() < dt * 2) scareAnimal(t);
      if (t.moving) advanceOnGraph(t, t.speed * (t.scared ? 5 : 1) * dt);
      t.lat += ((t.tLat ?? t.lat) - t.lat) * damp(dt, t.scared ? 1.6 : 0.2);
    } else {
      t.yieldT = Math.max(0, (t.yieldT || 0) - dt);
      const ahead = player.pos.distanceTo(t.group.position) < 9 && Math.cos(edgeYaw(t.ed, t.s, t.dir) - Math.atan2(player.pos.x - t.group.position.x, player.pos.z - t.group.position.z)) > 0.7;
      t.hitT = Math.max(0, (t.hitT || 0) - dt);
      const tv = t.hitT ? 0 : t.speed * (ahead ? 0.15 : bodyAhead(t, dt) ? 0.04 : t.yieldT ? 0.6 : 1); t.v = tv;
      if (tv) advanceOnGraph(t, tv * dt);
      t.lat += (t.dir * clamp(t.ed.half - t.W / 2 - (t.yieldT ? 0.1 : 0.35), 0.25, t.ed.half * (t.yieldT ? 0.85 : 0.62)) - t.lat) * damp(dt, 1.5);
    }
    edgeAt(t.ed, t.s, t.lat, t.group.position);
    const wantYaw = edgeYaw(t.ed, t.s, t.dir) + (t.animal ? Math.sin(t.wander) * 0.4 : 0);
    const prevYaw = t.yaw ?? wantYaw;
    t.yaw = t.yaw === undefined ? wantYaw : t.yaw + angDiff(wantYaw, t.yaw) * damp(dt, 6);
    t.group.rotation.y = t.yaw;
    if (!t.animal) { animateVehicle(t, angDiff(t.yaw, prevYaw) / Math.max(dt, 1e-3), dt); vehicleHits(t); continue; }
    if (player.crashT <= 0 && state === 'play' && player.y < 0.6) {
      const dx = player.pos.x - t.group.position.x, dz = player.pos.z - t.group.position.z, a = t.group.rotation.y;
      const lz = dx * Math.sin(a) + dz * Math.cos(a), lx = dx * Math.cos(a) - dz * Math.sin(a);
      if (Math.abs(lz) < t.L / 2 + 0.6 && Math.abs(lx) < t.W / 2 + 0.35) {
        if (Math.abs(player.v) > 4) { t.hitT = 2.5; crashPlayer(t.animal ? `${t.label === 'cow' ? 'गाय' : 'बकरी'} से टक्कर! Hit a ${t.label}!` : `${t.label} से टक्कर! Hit a ${t.label}!`, t.heat); if (t.animal) beep([180, 140], 0.6, 'sawtooth', 0.05); }
        else { player.v = 0; player.pos.x += dx * 0.1; player.pos.z += dz * 0.1; }
      }
    }
  }
  if (traffic.length < TRAFFIC_MAX && Math.random() < dt * 3) spawnTraffic();
}

// ---------- People on the roads ----------
function spawnPed() {
  const rn = spawnSpot(30, 150); if (!rn) return;
  const type = pickPersonType(false);
  const p = makePerson(type.t); scene.add(p.group);
  const side = Math.random() < 0.5 ? 1 : -1, along = Math.random() < 0.35;
  peds.push({ ...p, type: type.t, label: type.label, speed: type.speed * rand(0.85, 1.15), ed: rn.ed, s: rn.s, dir: Math.random() < 0.5 ? 1 : -1,
    side, lat: side * (rn.ed.half + rand(0.8, 2.0)), mode: along ? 'along' : 'wait', waitT: rand(3, 14), phase: rand(0, 6), hurry: 1, fallenT: 0 });
  const q = peds[peds.length - 1]; edgeAt(q.ed, q.s, q.lat, q.group.position);
}
function startle(p, hurry, honked) {
  if (p.fallenT > 0) return;
  p.lookT = 0.5;
  const onRoad = Math.abs(p.lat) < p.ed.half + 0.4;
  if (p.mode === 'cross' && !onRoad) { p.mode = 'wait'; p.waitT = rand(4, 8); return; }
  if (onRoad || p.mode === 'cross') {
    const i = Math.round(edgeIdx(p.ed, p.s)), P = p.ed.P[i], n = p.ed.N[i], fl = (player.pos.x - P.x) * n.x + (player.pos.z - P.z) * n.z;
    p.side = Math.abs(p.lat - fl) < 0.4 ? (Math.sign(p.lat) || (Math.random() < 0.5 ? -1 : 1)) : Math.sign(p.lat - fl);
    p.mode = 'leave'; p.hurry = hurry; p.pauseT = honked ? 0.25 : 0;
  } else if (p.mode === 'wait') p.waitT += 3;
  else if (p.mode === 'along' && Math.abs(p.lat) < p.ed.half + 1.2) { p.mode = 'leave'; p.side = Math.sign(p.lat) || 1; p.hurry = hurry; }
}
function honk() {
  beep([415, 523], 0.35, 'square', 0.06);
  for (const p of peds) { const d = p.group.position.distanceTo(player.pos); if (d < 45) startle(p, d < 20 ? 2.1 : 1.6, true); }
  scareTied(player.pos.x, player.pos.z, 30);
  for (const t of traffic) { const d = t.group.position.distanceTo(player.pos); if (d > 40) continue; if (t.animal) scareAnimal(t); else t.yieldT = 3; }
}
function updatePeds(dt) {
  for (let k = peds.length - 1; k >= 0; k--) {
    const p = peds[k];
    const d2 = p.group.position.distanceToSquared(player.pos);
    if (d2 > 190 * 190 && p.fallenT <= 0) { scene.remove(p.group); peds.splice(k, 1); continue; }
    const edgeOut = p.ed.half + 2.2;
    if (p.fallenT > 0) {
      p.fallenT -= dt; p.fig.rotation.x = lerp(p.fig.rotation.x, -1.35, 0.15); p.fig.position.y = lerp(p.fig.position.y, 0.2, 0.15);
      if (p.fallenT <= 0) { p.fig.rotation.x = 0; p.fig.position.y = 0; p.mode = 'leave'; p.side = Math.sign(p.lat) || 1; p.hurry = 1.3; }
    } else if (Math.abs(p.lat) < p.ed.half + 0.3 && p.mode !== 'leave' && player.v > 5 && Math.random() < dt * 3) {
      const ahead = (p.group.position.x - player.pos.x) * Math.sin(player.h) + (p.group.position.z - player.pos.z) * Math.cos(player.h);
      if (d2 < (16 + player.v * 0.9) ** 2 && ahead > 0 && !(p.type === 'kid' && Math.random() < 0.3)) startle(p, 1.7, false);
    }
    if (p.fallenT > 0) { /* lying down */ } else if (p.mode === 'wait') {
      p.waitT -= dt;
      const close = d2 < 20 * 20 && player.v > 10;
      if (p.waitT <= 0 && !(close && Math.random() < 0.85)) { p.mode = 'cross'; p.lat0 = p.lat; p.side = -Math.sign(p.lat); }
      else if (p.waitT <= 0) p.waitT = rand(0.8, 2.5);
    } else if (p.mode === 'cross' || p.mode === 'leave') {
      const target = p.mode === 'leave' ? p.side * edgeOut : p.side * Math.abs(p.lat0);
      if (p.hurry < 1.5 && Math.random() < dt * (p.type.startsWith('old') ? 0.25 : 0.08) && Math.abs(p.lat) < p.ed.half) p.pauseT = rand(0.4, 1.5);
      if (p.pauseT > 0) p.pauseT -= dt; else p.lat += Math.sign(target - p.lat) * Math.min(p.speed * p.hurry * dt, Math.abs(target - p.lat));
      if (Math.abs(target - p.lat) < 0.05) { p.mode = 'wait'; p.waitT = rand(12, 30); p.hurry = 1; p.lat0 = p.lat; }
    } else if (p.mode === 'along') {
      p.s = clamp(p.s + p.dir * p.speed * 0.8 * dt, 0, p.ed.L); if (p.s <= 0 || p.s >= p.ed.L) p.dir *= -1;
    }
    edgeAt(p.ed, p.s, p.lat, p.group.position);
    const i = Math.round(edgeIdx(p.ed, p.s)), T = p.ed.T[i], Nn = p.ed.N[i];
    const moving = p.fallenT <= 0 && (p.mode === 'cross' || p.mode === 'leave' || p.mode === 'along') && !(p.pauseT > 0);
    if (p.lookT > 0) { p.lookT -= dt; p.group.rotation.y += angDiff(Math.atan2(player.pos.x - p.group.position.x, player.pos.z - p.group.position.z), p.group.rotation.y) * damp(dt, 10); }
    else if (p.mode === 'along') p.group.rotation.y += angDiff(Math.atan2(T.x * p.dir, T.z * p.dir), p.group.rotation.y) * damp(dt, 8);
    else if (moving) { const sg = Math.sign((p.mode === 'leave' ? p.side * edgeOut : p.side * Math.abs(p.lat0)) - p.lat) || 1; p.group.rotation.y += angDiff(Math.atan2(Nn.x * sg, Nn.z * sg), p.group.rotation.y) * damp(dt, 8); }
    if (p.fallenT <= 0) animatePerson(p, dt, moving, p.mode === 'along' ? p.speed * 0.8 : p.speed, p.hurry, d2 < 90 * 90);
    p.group.visible = d2 < 140 * 140;
    if (p.fallenT <= 0 && player.crashT <= 0 && state === 'play' && player.y < 0.9) {
      const d = Math.hypot(player.pos.x - p.group.position.x, player.pos.z - p.group.position.z);
      if (d < 0.95 && Math.abs(player.v) > 2.5) { p.fallenT = 5; crashPlayer(`अरे! ध्यान से! You hit a ${p.label}!`, 45); beep([600, 500], 0.4, 'triangle', 0.06); }
      else if (d < 0.95) player.v = 0;
    }
  }
  if (peds.length < PED_MAX && Math.random() < dt * 3) spawnPed();
}

// ---------- Player ----------
const keys = {};
window.KERAI_UI.bindInput(keys, onKey, () => state);
$('fsbtn').addEventListener('click', e => { e.stopPropagation(); toggleFullscreen(); });
document.addEventListener('fullscreenchange', () => { $('fsbtn').textContent = document.fullscreenElement ? '🗗' : '⛶'; setTimeout(fitScreen, 100); });
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  const entering = !d.fullscreenElement && !d.webkitFullscreenElement;
  const action = entering ? (el.requestFullscreen || el.webkitRequestFullscreen) : (d.exitFullscreen || d.webkitExitFullscreen);
  if (typeof action !== 'function') { say('Rotate your phone for a wider view', 2); return; }
  try { const result = action.call(entering ? el : d); if (result && result.catch) result.catch(() => {}); } catch (e) {}
}
function onKey(code) {
  if (code === 'KeyF') toggleFullscreen();
  if (code === 'Enter' && state === 'title' && (!lobby.online || lobby.hostId === (race.net && race.net.id))) lobbyGo();
  else if (code === 'Enter' && state === 'over') backToLobby();
  if (code === 'KeyR' && state === 'play') resetToCourse();
  if (code === 'KeyH' && state === 'play') honk();
  if (code === 'KeyJ') playerKick('left');
  if (code === 'KeyK') playerKick('right');
  if (code === 'Space' && state === 'play') jump();
  if (code === 'KeyV') { setPov(!povMode); say(povMode ? 'POV · राइडर की नज़र' : 'Chase camera', 0.9); }
  if (code === 'KeyL') { labelsOn = !labelsOn; say(labelsOn ? 'Labels on' : 'Labels off', 0.8); }
  if (code === 'KeyP' && !race.net && (state === 'play' || state === 'paused')) { state = state === 'play' ? 'paused' : 'play'; say(state === 'paused' ? 'PAUSED' : '', 1); }
}
function jump() { if (player.crashT > 0 || player.y > 0.02) return; player.vy = 4.6; player.y = 0.01; beep([220, 330], 0.15, 'triangle', 0.04); }
function crashPlayer(reason, heatAdd = 0) {
  if (player.crashT > 0) return;
  const v = Math.abs(player.v);
  player.crashT = 2.2 + Math.min(1.3, v / 14); heat = Math.min(100, heat + heatAdd); timeLeft = Math.max(0, timeLeft - 3); streak = 0;
  startCrash(v); damagePlayerBike(v); player.v = 0;
  say('💥 ' + reason + '  −3 s', 2.6, '#ff5252'); bump('time');
}
const _aim = new THREE.Vector3();
function updatePlayer(dt) {
  const m = player.model;
  if (player.crashT > 0) {
    player.crashT -= dt; updateCrash(dt);
    if (player.crashT <= 0) {
      endCrash(); m.lean.rotation.z = 0; m.leanA = 0;
      if (cellAt(player.pos.x, player.pos.z)) { const rn = player.rn; if (rn) { edgeAt(rn.ed, rn.s, 0, player.pos); player.h = edgeYaw(rn.ed, rn.s, Math.cos(edgeYaw(rn.ed, rn.s, 1) - player.h) > 0 ? 1 : -1); } }
    }
    return;
  }
  if (player.wobT > 0) { player.wobT -= dt; player.h += Math.sin(player.wobT * 28) * 0.9 * player.wobT * dt; }   // wobble after bumping a goat
  const up = (keys.ArrowUp || keys.KeyW) && !(keys.ArrowDown || keys.KeyS), dn = keys.ArrowDown || keys.KeyS, lf = keys.ArrowLeft || keys.KeyA, rt = keys.ArrowRight || keys.KeyD;
  const rn = roadNear(player.pos.x, player.pos.z); if (rn) player.rn = rn;
  const onRoad = rn && rn.d < rn.ed.half + 0.9;
  const wet = inPuddle(player.pos.x, player.pos.z);
  const vmax = (onRoad ? (wet ? 20 : 55.6) : 14) * (0.8 + 0.2 * bikeDmg.hp / 100);   // up to 200 km/h on any road — your call; 50 off-road, 72 through standing water
  if (m.bend) player.h += m.bend * 0.02 * Math.min(Math.abs(player.v), 15) * dt;                   // bent forks pull the bike          // 70 km/h on the main road, 58 in lanes
  if (up) player.v += (player.v < vmax ? 3.6 * (1 - player.v / (vmax + 6)) + 0.7 : -6) * dt;   // gradual build: 0–100 in ~8 s, 150 in ~14 s, 200 in ~24 s
  else if (dn) player.v -= (player.v > 0 ? (wet ? 6 : 11 + player.v * 0.06) : 2.5) * dt;
  else {                                                                   // throttle off: the bike rolls on and slows gently — air drag, a little engine braking, tyre roll
    const a = Math.abs(player.v), coast = 0.3 + 0.00035 * a * a + 0.012 * a + (onRoad ? 0 : 1.2);
    player.v -= Math.sign(player.v) * Math.min(a, coast * dt);
  }
  if (player.v > vmax) player.v -= Math.min(wet ? 10 : 7, 1.5 + (player.v - vmax) * 0.18) * dt;   // ease down to the limit, never a sudden brake
  if (wet && Math.abs(player.v) > 4) {
    emitSplash(player.pos.x, player.pos.z, player.v, 6);
    if (splashMsgT <= 0) { say('छपाक! Water on the road!', 0.9, '#b3e5fc'); noise(0.35, 0.25); splashMsgT = 3; }
    player.h += Math.sin(raceT * 13) * 0.25 * dt;
  }
  splashMsgT -= dt;
  player.v = clamp(player.v, -3, 57);
  // bicycle model: the handlebar turns the front wheel and the bike follows it; grip limits the turn, not the throttle
  const steerIn = (lf ? 1 : 0) - (rt ? 1 : 0), sp = Math.abs(player.v);
  const wMax = Math.min(2.0, 13 / Math.max(sp, 1));
  let dWant = steerIn * Math.atan(wMax * WHEELBASE / Math.max(sp, 1.5));
  if (!steerIn && sp > 2 && onRoad) {
    // hands off: the bike follows the road smoothly — it aims at a point further down the road (further the faster you go),
    // keeping the lane position you chose, so it never weaves or over-corrects
    const yf = edgeYaw(rn.ed, rn.s, 1), dir = Math.cos(yf - player.h) > 0 ? 1 : -1, Ld = Math.max(6, sp * 0.9);
    const keepLat = clamp(rn.lat, -rn.ed.half + 0.4, rn.ed.half - 0.4), tgt = edgeAt(rn.ed, clamp(rn.s + dir * Ld, 0, rn.ed.L), keepLat, _aim);
    const dd = Math.hypot(tgt.x - player.pos.x, tgt.z - player.pos.z);
    if (dd > 2) {
      const alpha = angDiff(Math.atan2(tgt.x - player.pos.x, tgt.z - player.pos.z), player.h);
      if (Math.abs(alpha) < 0.6) { const yawWant = clamp(2 * sp * Math.sin(alpha) / dd, -wMax, wMax); dWant = Math.atan(yawWant * WHEELBASE / Math.max(sp, 1.5)); }
    }
  }
  player.delta += (dWant - player.delta) * damp(dt, steerIn ? 7 : 8);
  if (steerIn && sp > 14) player.v -= Math.sign(player.v) * (sp - 14) * 0.12 * dt;   // a little scrub when leaning hard
  player.yawRate = player.v * Math.tan(player.delta) / WHEELBASE;
  player.h += player.yawRate * dt * (player.y > 0.05 ? 0.3 : 1);
  const fx = Math.sin(player.h), fz = Math.cos(player.h);
  const nx = player.pos.x + fx * player.v * dt, nz = player.pos.z + fz * player.v * dt;
  const ct = cellAt(nx, nz);
  if (ct === 1 || (ct === 2 && player.y < 0.5)) {
    const ax = cellAt(nx, player.pos.z) !== 1, az = cellAt(player.pos.x, nz) !== 1, headOn = !(ax || az);
    if (Math.abs(player.v) > 9 && (headOn || ct === 2)) crashPlayer(ct === 1 ? 'दीवार से टक्कर! Hit a wall!' : 'पेड़ से टक्कर! Hit a tree!');
    else if (ct === 2) player.v *= 0.5;
    else { if (ax) player.pos.x = nx; else if (az) player.pos.z = nz; player.v *= headOn ? 0 : 0.92; }
  } else { distance += Math.hypot(nx - player.pos.x, nz - player.pos.z); player.pos.x = clamp(nx, -WW / 2 + 5, WW / 2 - 5); player.pos.z = clamp(nz, -WH / 2 + 5, WH / 2 - 5); }
  for (const o of obstaclesNear(player.pos.x, player.pos.z)) {
    const dx = player.pos.x - o.x, dz = player.pos.z - o.z, d = Math.hypot(dx, dz);
    if (d < o.r + 0.35 && player.y < 0.8) { if (Math.abs(player.v) > 7) { crashPlayer(o.label); break; } player.pos.x = o.x + dx / d * (o.r + 0.36); player.pos.z = o.z + dz / d * (o.r + 0.36); player.v *= 0.6; }
  }
  if (player.y > 0 || player.vy > 0) { player.vy -= 13 * dt; player.y += player.vy * dt; if (player.y <= 0) { player.y = 0; if (player.vy < -3) { noise(0.12, 0.25); player.landT = 0.25; } player.vy = 0; } }
  player.landT = Math.max(0, player.landT - dt);
  m.lean.position.y = (onRoad ? 0 : Math.abs(Math.sin(raceT * 23)) * 0.05 * Math.min(1, sp / 6)) - player.landT * 0.25;
  m.lean.rotation.x = player.y > 0 ? -Math.min(0.35, player.vy * 0.06) : 0;
  animateBike(m, player.v, player.yawRate, dt, player.delta); updateKick(m, dt);
  if (eng) { const gears = [0, 6, 13, 22, 33, 45, 60], g = Math.max(1, gears.findIndex(x => sp < x)), lo = gears[g - 1], hi = gears[g], rev = (sp - lo) / (hi - lo);
    eng.o.frequency.value = 60 + rev * 150 + g * 12 + (up ? 12 : 0); eng.gn.gain.value = 0.035 + Math.min(0.06, sp * 0.0012); }
  // breadcrumb trail for the police to follow
  const last = trail[trail.length - 1]; if (!last || last.distanceTo(player.pos) > 1.5) { trail.push(player.pos.clone()); if (trail.length > 3000) trail.shift(); if (police) police.k = Math.max(0, police.k - (trail.length >= 3000 ? 1 : 0)); }
}

// ---------- Police: follow the bike's own path ----------
function updatePolice(dt) {
  heat = Math.max(0, heat - dt * (police ? 1.2 : 2.5));
  if (!police && heat >= 55 && state === 'play' && trail.length > 40) {
    const o = makeJeep(); scene.add(o.group);
    police = { ...o, k: Math.max(0, trail.length - 45), f: 0, v: 12 };
    say('🚨 पुलिस आ गई! POLICE! भागो!', 2.5, '#82b1ff');
  }
  if (!police) { if (sirenGain) sirenGain.gain.value = 0; return; }
  const gap = trail.length - 1 - police.k;
  police.v = lerp(police.v, gap > 3 ? clamp(Math.abs(player.v) + 3.5, 10, 21) : 0, dt);
  police.f += police.v * dt / 1.5;
  while (police.f >= 1 && police.k < trail.length - 2) { police.f -= 1; police.k++; }
  const a = trail[police.k], b = trail[Math.min(trail.length - 1, police.k + 1)];
  police.group.position.copy(a).lerp(b, Math.min(1, police.f));
  const yaw = Math.atan2(b.x - a.x, b.z - a.z); police.yaw = police.yaw === undefined ? yaw : police.yaw + angDiff(yaw, police.yaw) * damp(dt, 6); police.group.rotation.y = police.yaw;
  const on = Math.floor(raceT * 6) % 2 === 0; police.red.material = M(on ? '#ff1744' : '#4a0010'); police.blue.material = M(on ? '#0a1f4a' : '#2979ff');
  const d = police.group.position.distanceTo(player.pos);
  if (sirenOsc) { sirenOsc.frequency.value = 650 + Math.sin(raceT * 5) * 200; sirenGain.gain.value = clamp(0.06 - d * 0.0006, 0, 0.05); }
  if (d < 4.5 && (Math.abs(player.v) < 6 || player.crashT > 0)) { gameOver('🚔 BUSTED! पकड़े गए!', 'The police caught you.'); return; }
  if (gap > 120 || heat <= 0) { scene.remove(police.group); police = null; heat = Math.min(heat, 20); say('पुलिस पीछे छूट गई! Lost the police!', 2, '#b9f6ca'); }
}

// ---------- Round flow: lobby -> countdown -> race -> finish & celebration -> results ----------
function startRace(entrants, from, to, online, isHost) {
  for (const t of traffic) removeTraffic(t); for (const a of peds) scene.remove(a.group); traffic.length = peds.length = 0;
  race.mode = online ? 'net' : 'solo'; race.isHost = isHost; if (!online) race.myId = 'me';
  const meE = entrants.find(e => e.id === race.myId) || entrants[0];
  if (crashFx.on) endCrash(); crashFx.shake = 0; crashFx.slowT = 0;
  scene.remove(player.model.group); player.model = makeBike(meE.color, 'man', { shirt: meE.color, helmet: '#f5f5f5' }); flagBike(player.model); scene.add(player.model.group); setPov(povMode);
  Object.assign(player, { v: 0, y: 0, vy: 0, yawRate: 0, delta: 0, crashT: 0, landT: 0, wobT: 0 });
  bikeDmg.hp = 100; smokers.clear(); for (const d of debris) scene.remove(d.o); debris.length = 0;
  setupRace(from, to, entrants);
  for (let k = 0; k < 8; k++) spawnTraffic(); for (let k = 0; k < 8; k++) spawnPed();
  for (let k = traffic.length - 1; k >= 0; k--) if (routeProject(race.R, traffic[k].group.position, 0, 0, 40).d < 12) { removeTraffic(traffic[k]); traffic.splice(k, 1); }   // keep the grid clear
  heat = 0; raceT = 0; distance = 0;
  $('title').style.display = 'none'; $('results').style.display = 'none';
  state = 'countdown'; window.KERAI_UI.syncState(state); countdown = 4.99; race.lightN = -1; updateCamera(0, true);
  say(`${RACE_PLACES[from].short} → ${RACE_PLACES[to].short} · ${(race.R.L / 1000).toFixed(2)} km`, 2.5, '#ffd54f');
}
function backToLobby() {
  state = 'title'; $('results').style.display = 'none'; $('title').style.display = 'flex';
  if (race.net) race.net.send({ t: 'lobbyback' }); renderLobby();
}
// ---------- Camera, HUD, minimap ----------
let camYaw = 0, camBack = 5.6, camDist = 5.6, povMode = false;
const _hp = new THREE.Vector3(), _tg = new THREE.Vector3(), _lq = new THREE.Quaternion();
function setPov(on) {
  povMode = on;
  const b = player.model && player.model.rider && player.model.rider.body; if (b) b.visible = !on;   // in POV you are the rider
  if (player.model) player.model.rider.head.traverse(o => { if (o.isMesh) o.visible = !on; });
  camera.near = on ? 0.05 : 0.1; fitScreen();
}
function updateCamera(dt, snap) {
  if (povMode && player.model && player.crashT <= 0) {
    // rider's eyes: rides with the bike, leans into turns, looks over the handlebar
    const L = player.model.lean; L.updateMatrixWorld(true);
    L.localToWorld(_hp.set(0, 1.5, -0.12)); L.localToWorld(_tg.set(0, 1.18, 9));
    // the head stays nearer level than the bike: roll the view by a third of the lean
    camera.position.copy(_hp); camera.up.set(0, 1, 0).applyAxisAngle(_tg.clone().sub(_hp).setY(0).normalize(), -(player.model.leanA || 0) * 0.33);
    camera.lookAt(_tg); camera.up.set(0, 1, 0); camYaw = player.h; camDist = camBack;
    const sx = Math.round(player.pos.x / 4) * 4, sz = Math.round(player.pos.z / 4) * 4;
    sun.position.set(sx - 120, 200, sz + 80); sun.target.position.set(sx, 0, sz); sun.target.updateMatrixWorld(); shadowCatcher.position.set(sx, 0.06, sz);
    return;
  }
  if (snap) camYaw = player.h; else camYaw += angDiff(player.h, camYaw) * damp(dt, 14);   // stays right behind the bike
  camBack += (5.6 + Math.min(2.6, Math.abs(player.v) / 16) - camBack) * damp(dt, 3);
  if (!povMode) { const want = (innerWidth / innerHeight < 1 ? 75 : 60) + Math.min(16, Math.max(0, Math.abs(player.v) - 15) * 0.4); if (Math.abs(camera.fov - want) > 0.05) { camera.fov += (want - camera.fov) * damp(dt, 3); camera.updateProjectionMatrix(); } }
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  // keep the camera out of the houses: pull in to the first wall behind the bike
  let free = camBack;
  for (let d = 0.8; d <= camBack; d += 0.25) if (cellAt(player.pos.x - fx * d, player.pos.z - fz * d) === 1) { free = Math.max(1.6, d - 0.6); break; }
  camDist = snap ? free : camDist + (free - camDist) * damp(dt, free < camDist ? 25 : 3);
  const lift = (camBack - camDist) * 0.35;
  camera.position.set(player.pos.x - fx * camDist, 2.6 + lift + player.y * 0.5, player.pos.z - fz * camDist);
  camera.lookAt(player.pos.x + fx * 8, 1.2 + player.y * 0.3, player.pos.z + fz * 8);
  const sx = Math.round(player.pos.x / 4) * 4, sz = Math.round(player.pos.z / 4) * 4;
  sun.position.set(sx - 120, 200, sz + 80); sun.target.position.set(sx, 0, sz); sun.target.updateMatrixWorld(); shadowCatcher.position.set(sx, 0.06, sz);
}
let mini, miniCtx, miniImg; const MINI_M = 1.7;   // metres per minimap pixel
function setupMinimap(img) { mini = $('mini'); mini.width = mini.height = 240; miniCtx = mini.getContext('2d'); miniImg = img; }
function drawMinimap() {
  const g = miniCtx, S = 240, sc = 1600 / WW;            // mini image px per metre
  const px = (player.pos.x + WW / 2) * sc, pz = (player.pos.z + WH / 2) * sc, half = S / 2 * MINI_M * sc;
  g.fillStyle = '#26381f'; g.fillRect(0, 0, S, S);
  g.drawImage(miniImg, px - half, pz - half, half * 2, half * 2, 0, 0, S, S);
  const toM = (x, z) => [S / 2 + (x - player.pos.x) / MINI_M, S / 2 + (z - player.pos.z) / MINI_M];
  // roads
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath();
  for (const ed of EDGES) { const a = ed.P[0], b = ed.P[ed.P.length - 1]; if (Math.min(Math.abs(a.x - player.pos.x), Math.abs(b.x - player.pos.x)) > 600 && Math.abs((a.x + b.x) / 2 - player.pos.x) > 600) continue;
    for (let i = 0; i < ed.P.length; i += 4) { const [x, y] = toM(ed.P[i].x, ed.P[i].z); i ? g.lineTo(x, y) : g.moveTo(x, y); } const [x, y] = toM(b.x, b.z); g.lineTo(x, y); }
  g.stroke();
  // the course, the finish and the other riders
  if (race.R) {
    const R = race.R; g.strokeStyle = 'rgba(255,214,0,0.95)'; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i < R.P.length; i += 3) { const [x, y] = toM(R.P[i].x, R.P[i].z); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    let [fx, fy] = toM(R.P[R.P.length - 1].x, R.P[R.P.length - 1].z); const inside = fx > 10 && fy > 10 && fx < S - 10 && fy < S - 10;
    if (!inside) { const a = Math.atan2(fy - S / 2, fx - S / 2); fx = S / 2 + Math.cos(a) * (S / 2 - 12); fy = S / 2 + Math.sin(a) * (S / 2 - 12); }
    g.font = '18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🏁', fx, fy);
    for (const r of race.racers) { if (r.kind === 'me') continue; const p = r.bk.group.position, [x, y] = toM(p.x, p.z); if (x < 0 || y < 0 || x > S || y > S) continue; g.fillStyle = r.color; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.stroke(); }
  }
  g.save(); g.translate(S / 2, S / 2); g.rotate(-player.h + Math.PI);
  g.fillStyle = '#ff1744'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function drawHUD() {
  const me = race.R && racerOf(race.myId);
  $('speed').textContent = Math.round(Math.abs(player.v) * 3.6);
  window.KERAI_UI.update(player.v * 3.6, state, keys, performance.now(), povMode, player.crashT > 0);
  if (player.rn) $('road').textContent = '📍 ' + player.rn.ed.name;
  { const bh = $('bikehp'); if (bh) { bh.style.width = bikeDmg.hp + '%'; bh.style.background = bikeDmg.hp > 60 ? '#66bb6a' : bikeDmg.hp > 30 ? '#ffa726' : '#ef5350'; } }
  if (!me) { $('tl').style.display = $('tc').style.display = $('mission').style.display = $('dirs').style.display = 'none'; drawMinimap(); return; }
  const st = standings(), pos = st.indexOf(me) + 1;
  $('tl').style.display = $('tc').style.display = 'block';
  $('coins').textContent = `${pos}/${st.length}`; $('coinsub').textContent = me.finished ? `Finished ${ordinal(me.place)}` : `${ordinal(pos)} position · स्थान`;
  $('time').textContent = fmtTime(race.t);
  // the finish and the next turn
  const left = Math.max(0, race.finishS - me.s), nt = me.finished ? null : nextTurn(me);
  $('mission').style.display = 'flex'; $('mname').textContent = `🏁 ${RACE_PLACES[race.to].hi}`;
  $('mdist').textContent = (left > 1000 ? (left / 1000).toFixed(2) + ' km' : Math.round(left) + ' m') + ' to finish' + (nt ? ` · ${nt.dir === 'left' ? '⬅ left' : 'right ➡'} in ${Math.round(nt.d / 5) * 5} m` : '');
  const i = Math.min(race.R.P.length - 1, me.i + 12), tp = race.R.P[i], ang = Math.atan2(tp.x - player.pos.x, tp.z - player.pos.z) - camYaw;
  $('arrow').style.transform = `rotate(${-ang}rad)`;
  const wrong = state === 'play' && Math.cos(player.h - Math.atan2(race.R.T[me.i].x, race.R.T[me.i].z)) < -0.3 && Math.abs(player.v) > 3;
  const off = state === 'play' && me.off > race.R.H[me.i] + 12;
  $('mission').classList.toggle('warn', wrong || off); if (wrong) $('mname').textContent = '⛔ उल्टी दिशा! WRONG WAY'; else if (off) $('mname').textContent = '↩ रास्ते से बाहर — press R';
  // standings
  const lead = st[0];
  $('dirs').style.display = 'block';
  $('dirs').innerHTML = '<div class="dh">स्थिति · Standings</div>' + st.map((r, k) => {
    const gap = r.finished ? fmtTime(r.time) : k === 0 ? 'leader' : '+' + Math.round((lead.finished ? race.finishS : lead.s) - r.s) + ' m';
    return `<div class="dr${r === me ? ' dm' : ''}"><span class="da">${k + 1}</span><span class="dn" style="border-left:4px solid ${r.color};padding-left:6px">${escapeHTML(r.name)}${r.kind === 'bot' ? ' <small>🤖</small>' : ''}</span><span class="dd">${r.finished ? '🏁 ' : ''}${gap}</span></div>`;
  }).join('');
  drawMinimap();
}

// ---------- Main loop ----------
let last = performance.now();
const PROF = {}; const prof = (k, f) => { const t = performance.now(); f(); PROF[k] = (PROF[k] || 0) * 0.9 + (performance.now() - t) * 0.1; };
const _jbc = new THREE.Vector3();
// keep the laptop cool: at most 60 fps while riding, ~8 fps on menus/pause, nothing at all when the tab is hidden
let nextFrameAt = 0;
function frame(now) {
  const idle = state === 'title' || state === 'over' || state === 'paused' || state === 'loading';
  if (document.hidden || now < nextFrameAt) { requestAnimationFrame(frame); return; }
  nextFrameAt = Math.max(nextFrameAt + (idle ? 125 : 1000 / 60), now - 8);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (crashFx.slowT > 0) { crashFx.slowT -= dt; dt *= 0.3; }               // a moment of slow motion as you go down
  coinTimeU.value = now / 1000;
  if (state === 'countdown') {
    const prev = Math.ceil(countdown); countdown -= dt; const c = Math.ceil(countdown);
    if (c !== prev) {
      if (c > 0 && c <= 4) { say(c === 4 ? 'तैयार… Ready…' : String(c), 0.9, '#ffeb3b'); beep([440], 0.2); if (race.lights && c <= 3) race.lights.slice(0, 2 * (4 - c) - 1 + (c === 1 ? 2 : 1)).forEach(L => { L.material.color.set('#ff1744'); L.material.emissive.set('#ff1744'); }); }
      else if (c <= 0) { say('🏁 GO! चलो!', 1.4, '#69f0ae'); beep([880], 0.5); if (race.lights) race.lights.forEach(L => { L.material.color.set('#00e676'); L.material.emissive.set('#00e676'); }); state = 'play'; }
    }
    prof('traffic', () => updateTraffic(dt)); prof('peds', () => updatePeds(dt)); prof('race', () => updateRace(dt));
  } else if (state === 'play') {
    raceT += dt;
    prof('player', () => { const n = Math.max(1, Math.min(6, Math.ceil(Math.abs(player.v) * dt / 0.5))); for (let i = 0; i < n; i++) updatePlayer(dt / n); }); prof('traffic', () => updateTraffic(dt)); prof('animals', () => updateAnimals(dt)); prof('second', () => updateSecondOrder(dt)); prof('peds', () => updatePeds(dt)); prof('jboard', () => updateJunctionBoard(dt)); prof('race', () => updateRace(dt));
  } else if (state === 'finished') {
    prof('player', () => updatePlayer(dt)); updateTraffic(dt); updateAnimals(dt); updateSecondOrder(dt); updatePeds(dt); prof('race', () => updateRace(dt));
  } else if (state === 'over' || state === 'title') { updateTraffic(dt); updateAnimals(dt); updateSecondOrder(dt); updateRace(dt); }
  prof('fx', () => { updateSplash(dt); updateSparkles(dt); updateSparks(dt); updateDamageFx(dt); });
  rippleTex.offset.x += dt * 0.03; rippleTex.offset.y += dt * 0.02;
  if (beacon) beacon.rotation.y += dt;
  if (player.model) {
    player.model.group.position.copy(player.pos); player.model.group.position.y = player.y; player.model.group.rotation.y = player.h;
    if (!window.__camHold) {
      if (player.crashT > 0 && povMode) player.model.rider.body.visible = true; else if (povMode) player.model.rider.body.visible = false;
      if ((state === 'finished' || state === 'over') && race.R) {                  // victory lap of the camera around the winner and the cheering crowd
        const c = race.winnerPos && race.winner && race.winner.kind !== 'me' && race.winner.finished ? race.winner.bk.group.position : player.pos;
        race.orbit = (race.orbit || player.h + Math.PI) + dt * 0.35; const r = 7.5 + Math.sin(race.orbit * 0.7) * 1.5;
        camera.position.set(c.x + Math.sin(race.orbit) * r, 2.6 + Math.sin(race.orbit * 0.5) * 0.8, c.z + Math.cos(race.orbit) * r); camera.lookAt(c.x, 1.3, c.z);
        if (player.model.rider.body) player.model.rider.body.visible = true;
      } else { race.orbit = 0; updateCamera(dt, false); }
      crashCamera(dt);
    }
    if (jBoard.group && jBoard.group.visible) {                                 // never let the camera pass through the signboard
      const l = jBoard.group.worldToLocal(_jbc.copy(camera.position));
      if (Math.abs(l.x) < 4.2 && Math.abs(l.z) < 6) jBoard.group.visible = false;
    }
    prof('chunks', updateChunks); prof('labels', updateLabels); if (state !== 'loading') prof('hud', drawHUD);
  }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
  prof('render', () => renderer.render(scene, camera));
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
(async () => {
  const status = (t) => { $('loading').querySelector('p').textContent = t; return new Promise(r => setTimeout(r, 30)); };
  await status('Loading the satellite map of Kerai…');
  const imgs = {}; await Promise.all(Object.keys(window.KERAI_TILES).map(k => new Promise(res => { const i = new Image(); i.onload = res; i.onerror = res; i.src = window.KERAI_TILES[k]; imgs[k] = i; })));
  await status('Loading the people of Kerai…'); window.__proofPhase?.('people-start'); await loadPeople(); window.KERAI_NATIVE_PEOPLE = null; window.__proofPhase?.('people-end'); window.__proofCheckpoint?.('people');
  await status('Laying the roads…'); buildGround(imgs); buildRoads(); addWater();
  await status('Building 4,000 houses…'); buildBuildings();
  await status('Planting trees…'); const nt = buildTrees();
  await status('Putting up poles and hand pumps…'); const sl = buildStreetLife(); sl.animals = setupAnimals();
  await status('Measuring the roads for milestones…'); setupPlaces(); sl.milestones = buildMilestones(); sl.mapEdges = buildMapEdges();
  await status('Setting up the race…'); addLabels();
  setupMinimap(imgs.mini);
  START = findStart();
  player.model = makeBike('#b71c1c', 'man', { shirt: '#263238', helmet: '#f5f5f5' }); flagBike(player.model); scene.add(player.model.group); setPov(false);
  edgeAt(START.ed, START.s, (START.dir || 1) * START.ed.half * 0.45, player.pos); player.h = edgeYaw(START.ed, START.s, START.dir || 1); updateCamera(0, true);
  console.log('Kerai world', { roads: EDGES.length, km: (EDGES.reduce((a, e) => a + e.L, 0) / 1000).toFixed(1), houses: BLD.length, trees: nt, coins: coinsTotal, clocks: clocks.length, places: poiLabels.length, ...sl });

  state = 'title'; $('loading').style.display = 'none'; $('title').style.display = 'flex';
  race.net = connectNet(); renderLobby();
  window.__kerai = { PROF, renderer, cellAt, inVillage, camera, NODES, ADJ, spawnTraffic, spawnPed, state: () => state, player, peds, traffic, scene, camera, makePerson, animatePerson, EDGES, roadNear, edgeAt, edgeYaw, coins: () => [coinsGot, coinsTotal, score], time: () => timeLeft, addTime: s => { timeLeft += s; }, obstacles, animalsLive, ANIMAL_SPOTS, crashFx, crashPlayer, bikeDmg, damagePlayerBike, hitVehicle, knockRider, vAuto, vERick, vTractor, vCycle, vBiker, debris, race, startRace, lobbyGo, lobby, routeProject, target: () => target,
    tp: (x, z, h) => { player.pos.set(x, 0, z); if (h !== undefined) player.h = h; updateCamera(0, true); } };
})();
requestAnimationFrame(frame);
})();
