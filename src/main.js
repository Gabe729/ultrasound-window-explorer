import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Atlas, SYSTEMS, systemById} from './atlas.js';
import {Probe, PROBES, resolution} from './probe.js';
import {AcousticModel, BUDGET, CONTACT_GAP, localAxis, clamp} from './physics.js';
import {BeamView} from './beam.js';
import {ImageView, shortName} from './image2d.js';
import {PRESETS, applyPreset, searchWindow, skinFrom, targetPoint} from './presets.js';
import {TISSUES, SOURCES, CATEGORIES, impedance} from './tissues.js';
import {knowledgeFor} from './knowledge.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const cm = (m) => (m * 100).toFixed(1);

const state = {
  colorMode: 'access', imageMode: 'bmode', clip: 'off', focus: true, inBeamOnly: false, labels: true,
  showPlane: true, showSlice: true, showStops: true, showImage: true, isolate: false, placing: false,
  selected: null, preset: null,
  systems: Object.fromEntries(SYSTEMS.map((s) => [s.id, true])),
};

// ---------- scene ----------
const viewport = $('#viewport');
const canvas = $('#three');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
camera.position.set(0.9, 1.35, 1.9);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = 0.08;
controls.maxDistance = 6;
scene.add(new THREE.HemisphereLight(0xdbe9ff, 0x1a2230, 1.3));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-1.5, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x7fd8ff, 1.4); rim.position.set(2, 1.5, -2.5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.425, 128), new THREE.MeshBasicMaterial({color: 0x5ee7ff, transparent: true, opacity: 0.25}));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.PolarGridHelper(0.6, 12, 6, 96, 0x1b3444, 0x12222e); scene.add(grid);

const atlas = new Atlas(scene, (f, msg) => progress(f * 0.8, msg));
const model = new AcousticModel(atlas);
const probe = new Probe();
const beam = new BeamView(scene);
const image = new ImageView();
let result = null;

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  $('#leaders').setAttribute('viewBox', `0 0 ${w} ${h}`);
}
new ResizeObserver(resize).observe(viewport);
new ResizeObserver(() => result && drawImage()).observe($('#imagepanel'));

function progress(f, msg) {
  $('#ld-fill').style.width = `${Math.round(f * 100)}%`;
  if (msg) $('#ld-msg').textContent = msg;
}

// ---------- update scheduling ----------
let need = null; // 'draft' | 'full'
let fullTimer = 0;
function schedule(q = 'full') {
  if (!atlas.boxes) return;
  if (q === 'draft') {
    need = 'draft';
    clearTimeout(fullTimer);
    fullTimer = setTimeout(() => schedule('full'), 220);
  } else need = 'full';
}

function compute(q) {
  result = model.run(probe, q);
  beam.updateProbe(probe);
  const rc = image.computeRaySpace(result, probe, state.imageMode, atlas);
  beam.updateFan(result, probe, rc, {...state, planeMode: state.imageMode});
  applyHighlights();
  updateClip();
  drawImage();
  updateReadout();
  if (q === 'full') renderPanels();
}

// ---------- highlighting ----------
const selColor = new THREE.Color('#7ff3ff');
const beyondColor = new THREE.Color('#6b7a90');
function applyHighlights() {
  const stats = result?.stats;
  const catColors = Object.fromEntries(CATEGORIES.map((c) => [c.id, new THREE.Color(c.color)]));
  for (const p of atlas.parts) {
    let visible = state.systems[p.system] ? 1 : 0;
    const s = stats?.byPart.get(p.index);
    const inBeam = s && s.category.id !== 'beyond';
    if (state.isolate && state.selected !== null) visible = p.index === state.selected || p === atlas.skin ? 1 : 0;
    if (state.inBeamOnly && !inBeam && p !== atlas.skin && p.index !== state.selected) visible = 0;
    let mix = 0, alpha = 1, color = null;
    if (state.colorMode === 'access' && s) {
      color = inBeam ? catColors[s.category.id] : beyondColor;
      mix = inBeam ? 0.75 : 0.35;
    }
    if (state.focus && !inBeam && p !== atlas.skin && p.index !== state.selected) alpha = 0.14;
    if (p.index === state.selected) { color = selColor; mix = 1; }
    atlas.setState(p.index, {visible, mix, alpha, color: color ?? undefined});
  }
  atlas.commitState();
}

// ---------- clipping along the imaging plane ----------
const clipPlanes = [new THREE.Plane(), new THREE.Plane()];
let clipCount = -1;
function updateClip() {
  const n = state.clip === 'off' ? 0 : state.clip === 'half' ? 1 : 2;
  const {e} = probe.axes();
  const p = probe.point;
  if (state.clip === 'half') {
    const side = e.dot(camera.position.clone().sub(p)) > 0 ? -1 : 1;
    clipPlanes[0].setFromNormalAndCoplanarPoint(e.clone().multiplyScalar(side), p);
  } else if (state.clip === 'slab') {
    clipPlanes[0].setFromNormalAndCoplanarPoint(e, p.clone().addScaledVector(e, -0.012));
    clipPlanes[1].setFromNormalAndCoplanarPoint(e.clone().negate(), p.clone().addScaledVector(e, 0.012));
  }
  if (n !== clipCount) {
    for (const m of atlas.materials.values()) { m.clippingPlanes = clipPlanes.slice(0, n); m.needsUpdate = true; }
    clipCount = n;
  }
}

// ---------- 2D image ----------
function drawImage() {
  if (!result || !state.showImage) return;
  image.draw($('#image2d'), result, probe, result.stats, atlas, {labels: state.labels});
  $('#ip-meta').textContent = `${PROBES[probe.type].label} · ${probe.f.toFixed(1)} MHz · ${cm(probe.depth)} cm`;
}

$('#image2d').addEventListener('mousemove', (ev) => {
  const rect = ev.target.getBoundingClientRect();
  const s = image.sampleAt(probe, ev.clientX - rect.left, ev.clientY - rect.top);
  if (!s) { $('#ip-hover').textContent = 'Hover the image to read tissue, depth and signal margin.'; return; }
  const part = s.part >= 0 ? atlas.parts[s.part] : null;
  const name = part ? part.name : s.cls === 253 ? 'Gas (beam blocked)' : s.cls === 254 ? 'Outside the body' : 'Soft tissue (no mesh)';
  const tissue = part ? TISSUES[part.tissue].label : '';
  const m = s.margin > -90 ? `${s.margin.toFixed(0)} dB margin` : 'no signal';
  $('#ip-hover').innerHTML = `<b>${esc(name)}</b> · ${esc(tissue)} · ${cm(s.depth)} cm · <span style="color:${s.margin > 0 ? 'var(--good)' : 'var(--bad)'}">${m}</span>`;
});
$('#image2d').addEventListener('click', (ev) => {
  const rect = ev.target.getBoundingClientRect();
  const s = image.sampleAt(probe, ev.clientX - rect.left, ev.clientY - rect.top);
  if (s && s.part >= 0) select(s.part);
});

// ---------- 3D labels with leader lines ----------
const labelBox = $('#labels3d'), leaders = $('#leaders');
function updateLabels() {
  labelBox.innerHTML = '';
  leaders.innerHTML = '';
  if (!result || !state.labels) return;
  const W = viewport.clientWidth, H = viewport.clientHeight;
  const chosen = result.stats.list.filter((s) => s.category.id !== 'beyond' && s.nPlane > 0 && s.anchor).slice(0, 8);
  const sel = state.selected !== null && result.stats.byPart.get(state.selected);
  if (sel && sel.anchor && !chosen.includes(sel)) chosen.push(sel);
  const pts = [];
  for (const s of chosen) {
    const v = s.anchor.clone().project(camera);
    if (v.z > 1) continue;
    pts.push({s, x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H});
  }
  if (!pts.length) return;
  // Labels go to the left of the anatomy when the image inset occupies the lower right.
  const pv = probe.point.clone().project(camera);
  const side = state.showImage ? -1 : (pv.x * 0.5 + 0.5) * W < W / 2 ? -1 : 1;
  const xCol = Math.max(...pts.map((p) => p.x)) * (side > 0 ? 1 : 0) + Math.min(...pts.map((p) => p.x)) * (side < 0 ? 1 : 0) + side * 46;
  pts.sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const p of pts) { p.ly = Math.max(p.y, last + 21); last = p.ly; }
  for (const p of pts) {
    const div = document.createElement('div');
    div.className = 'lbl3';
    div.innerHTML = `<i style="background:${p.s.category.color}"></i>${esc(shortName(p.s.part.name))}<small>${cm(p.s.z0)} cm</small>`;
    div.onclick = () => select(p.s.part.index);
    labelBox.appendChild(div);
    const w = div.offsetWidth;
    const lx = side > 0 ? Math.min(xCol, W - w - 8) : Math.max(xCol - w, 8);
    div.style.left = `${lx}px`;
    div.style.top = `${p.ly}px`;
    const ax = side > 0 ? lx : lx + w;
    leaders.insertAdjacentHTML('beforeend', `<path d="M${p.x},${p.y} L${ax - side * 10},${p.ly} L${ax},${p.ly}" stroke="${p.s.category.color}" stroke-opacity=".75" fill="none" stroke-width="1"/><circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${p.s.category.color}"/>`);
  }
}

// ---------- pointer interaction ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let drag = null, down = null;
function rayFrom(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}
function moveProbeTo(ev) {
  const hit = atlas.surfaceHit(rayFrom(ev).clone());
  if (!hit) return false;
  probe.point.copy(hit.point);
  probe.normal.copy(hit.normal);
  beam.updateProbe(probe);
  return true;
}
canvas.addEventListener('pointerdown', (ev) => {
  if (!atlas.boxes || ev.button !== 0) return;
  down = {x: ev.clientX, y: ev.clientY, t: performance.now()};
  rayFrom(ev);
  const hitsProbe = raycaster.intersectObject(beam.probeGroup, true).length > 0;
  if (state.placing || ev.shiftKey || hitsProbe) {
    if (moveProbeTo(ev) || hitsProbe) {
      drag = true;
      controls.enabled = false;
      canvas.setPointerCapture(ev.pointerId);
      clearPreset();
      schedule('draft');
    }
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (drag && moveProbeTo(ev)) schedule('draft');
});
canvas.addEventListener('pointerup', (ev) => {
  if (drag) {
    drag = null;
    controls.enabled = true;
    schedule('full');
    return;
  }
  if (!down) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
  if (moved < 5 && performance.now() - down.t < 500) {
    const ray = rayFrom(ev).clone();
    const hit = atlas.pick(ray, (p) => p !== atlas.skin && state.systems[p.system] && atlas.stateData[p.index * 4] > 0.5 && atlas.stateData[p.index * 4 + 2] > 0.5);
    if (hit) select(hit.part.index);
  }
  down = null;
});

window.addEventListener('keydown', (ev) => {
  if (ev.target.matches('input, textarea, select') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key.toLowerCase();
  const step = ev.shiftKey ? 1 : 5;
  const map = {q: ['rot', -step], e: ['rot', step], w: ['tilt', -step], s: ['tilt', step], a: ['rock', -step], d: ['rock', step]};
  if (map[k]) { probe[map[k][0]] += map[k][1]; syncControls(); clearPreset(); schedule('draft'); }
});

// ---------- selection ----------
function select(i) {
  state.selected = i;
  showTab('structure');
  renderStructure();
  renderList();
  applyHighlights();
}

// ---------- controls ----------
function buildControls() {
  // Presets.
  const groups = new Map();
  for (const p of PRESETS) { if (!groups.has(p.group)) groups.set(p.group, []); groups.get(p.group).push(p); }
  $('#presets').innerHTML = [...groups].map(([g, ps]) => `<div class="pgroup"><div class="pg-title">${g}</div><div class="pg-btns">${
    ps.map((p) => `<button data-preset="${p.id}" title="${esc(p.note)}">${esc(p.label)}</button>`).join('')}</div></div>`).join('');
  $$('[data-preset]').forEach((b) => b.onclick = () => runPreset(b.dataset.preset));
  // Probe type.
  $('#probe-type').innerHTML = Object.entries(PROBES).map(([k, t]) => `<button data-v="${k}">${t.label}</button>`).join('');
  $$('#probe-type button').forEach((b) => b.onclick = () => { probe.setType(b.dataset.v); clearPreset(); syncControls(); schedule(); });
  const bind = (id, fn, fmt) => {
    const el = $('#' + id);
    el.oninput = () => { fn(+el.value); $(`#${id}-out`).textContent = fmt(+el.value); clearPreset(); schedule('draft'); };
  };
  bind('f', (v) => probe.f = v, (v) => `${v.toFixed(1)} MHz`);
  bind('depth', (v) => probe.depth = v / 100, (v) => `${v.toFixed(1)} cm`);
  bind('angle', (v) => probe.angle = v, (v) => `${v}°`);
  bind('rot', (v) => probe.rot = v, (v) => `${v}°`);
  bind('tilt', (v) => probe.tilt = v, (v) => `${v}°`);
  bind('rock', (v) => probe.rock = v, (v) => `${v}°`);
  bind('sweep', (v) => probe.sweep = v, (v) => `${v}°`);
  $('#gas').oninput = () => { model.settings.gas = +$('#gas').value / 100; $('#gas-out').textContent = `${$('#gas').value}%`; schedule('draft'); };
  $('#bladder').onchange = () => { model.settings.bladderFull = $('#bladder').checked; schedule(); };
  $('#volume').onchange = () => { probe.volume = $('#volume').checked; $('#sweep-row').style.display = probe.volume ? '' : 'none'; schedule(); };
  $('#btn-place').onclick = () => { state.placing = !state.placing; $('#btn-place').classList.toggle('on', state.placing); };
  $('#btn-perp').onclick = () => { probe.tilt = probe.rock = 0; syncControls(); schedule(); };
  $('#btn-best').onclick = bestWindow;
  const seg = (id, key, after) => {
    $$(`#${id} button`).forEach((b) => b.onclick = () => { state[key] = b.dataset.v; syncSegs(); after?.(); });
  };
  seg('color-mode', 'colorMode', applyHighlights);
  seg('image-mode', 'imageMode', () => schedule());
  seg('clip-mode', 'clip', updateClip);
  const chk = (id, key, after) => { $('#' + id).onchange = () => { state[key] = $('#' + id).checked; after?.(); }; };
  chk('focus', 'focus', applyHighlights);
  chk('inbeam', 'inBeamOnly', applyHighlights);
  chk('labels', 'labels', drawImage);
  chk('showplane', 'showPlane', () => schedule());
  chk('showslice', 'showSlice', () => schedule());
  chk('showstops', 'showStops', () => schedule());
  chk('showimage', 'showImage', () => { $('#imagepanel').classList.toggle('hidden', !state.showImage); drawImage(); });
  // Systems.
  $('#systems').innerHTML = SYSTEMS.map((s) => `<label class="sysrow"><input type="checkbox" data-sys="${s.id}" checked><span class="sw" style="background:${s.color}"></span><span>${s.name}</span><input type="range" min="0" max="100" value="${Math.round(s.opacity * 100)}" data-op="${s.id}" title="Opacity"></label>`).join('');
  $$('[data-sys]').forEach((c) => c.onchange = () => { state.systems[c.dataset.sys] = c.checked; applyHighlights(); });
  $$('[data-op]').forEach((r) => r.oninput = () => {
    const m = atlas.materials.get(r.dataset.op);
    m.opacity = +r.value / 100; m.depthWrite = m.opacity > 0.5; m.needsUpdate = true;
  });
  const setSystems = (ids) => { for (const s of SYSTEMS) state.systems[s.id] = ids === null || ids.includes(s.id); $$('[data-sys]').forEach((c) => c.checked = state.systems[c.dataset.sys]); applyHighlights(); };
  $('#sys-all').onclick = () => setSystems(null);
  $('#sys-organs').onclick = () => setSystems(['integumentary', 'cardiac', 'arterial', 'venous', 'digestive', 'urinary', 'reproductive', 'lymphatic', 'endocrine', 'derived', 'respiratory']);
  $('#sys-bones').onclick = () => setSystems(['integumentary', 'skeletal', 'connective', 'derived']);
  // Tabs and dialogs.
  $$('.tabs button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
  $('#btn-model').onclick = () => { $('#model-body').innerHTML = modelHtml(); $('#dlg-model').showModal(); };
  $('#btn-help').onclick = () => { $('#help-body').innerHTML = helpHtml(); $('#dlg-help').showModal(); };
  // Legend.
  $('#legend').innerHTML = '<div class="lg-title">Expected accessibility</div>' +
    CATEGORIES.map((c) => `<div><i style="background:${c.color}"></i>${c.label}</div>`).join('') +
    '<div><i style="background:#6b7a90"></i>Deeper than imaging depth</div><div><i style="background:#7ff3ff"></i>Selected</div>';
  syncSegs();
}

function syncSegs() {
  for (const [id, key] of [['color-mode', 'colorMode'], ['image-mode', 'imageMode'], ['clip-mode', 'clip']]) {
    $$(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === state[key]));
  }
}

function syncControls() {
  const t = PROBES[probe.type];
  $$('#probe-type button').forEach((b) => b.classList.toggle('on', b.dataset.v === probe.type));
  $('#probe-use').textContent = t.use;
  const set = (id, min, max, v, txt) => { const el = $('#' + id); if (min !== null) { el.min = min; el.max = max; } el.value = v; $(`#${id}-out`).textContent = txt; };
  set('f', t.fRange[0], t.fRange[1], probe.f, `${probe.f.toFixed(1)} MHz`);
  set('depth', null, null, probe.depth * 100, `${cm(probe.depth)} cm`);
  $('#angle-label').textContent = t.angle.label;
  set('angle', t.angle.min, t.angle.max, probe.angle, `${Math.round(probe.angle)}°`);
  const wrap = (a) => ((a + 540) % 360) - 180;
  probe.rot = wrap(probe.rot);
  set('rot', null, null, Math.round(probe.rot), `${Math.round(probe.rot)}°`);
  set('tilt', null, null, Math.round(probe.tilt), `${Math.round(probe.tilt)}°`);
  set('rock', null, null, Math.round(probe.rock), `${Math.round(probe.rock)}°`);
  set('sweep', null, null, probe.sweep, `${probe.sweep}°`);
  $('#gas').value = Math.round(model.settings.gas * 100); $('#gas-out').textContent = `${$('#gas').value}%`;
  $('#bladder').checked = model.settings.bladderFull;
  $('#volume').checked = probe.volume;
  $('#sweep-row').style.display = probe.volume ? '' : 'none';
}

function updateReadout() {
  const r = resolution(probe, probe.depth / 2);
  const pen = BUDGET / (2 * 0.6 * probe.f); // cm in average soft tissue
  const lost = result.stats.field.contactLost;
  $('#probe-readout').innerHTML = `
    <span>Wavelength</span><b>${(r.lambda * 1e3).toFixed(2)} mm</b>
    <span>Axial resolution</span><b>${(r.axial * 1e3).toFixed(2)} mm</b>
    <span>Lateral at ${cm(probe.depth / 2)} cm</span><b>${(r.lateral * 1e3).toFixed(1)} mm</b>
    <span>Slice thickness there</span><b>${(r.slice * 1e3).toFixed(1)} mm</b>
    <span>Penetration (soft tissue)</span><b>≈ ${pen.toFixed(0)} cm</b>
    <span>Beam vs skin normal</span><b>${probe.skinAngle().toFixed(0)}°</b>
    <span>Skin contact</span><b style="color:${lost > 0.2 ? 'var(--bad)' : lost > 0 ? 'var(--fair)' : 'var(--good)'}">${lost > 0 ? `${Math.round((1 - lost) * 100)}% of face` : 'full'}</b>
    <span class="tag">Resolution from λ, aperture and focus (approximate formulas). Penetration = ${BUDGET} dB ÷ (2 × 0.6 dB/cm/MHz × f).</span>`;
}

function clearPreset() {
  state.preset = null;
  $$('[data-preset]').forEach((b) => b.classList.remove('active'));
}

function runPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  const r = applyPreset(model, probe, p);
  if (!r.ok) { alert(r.message); return; }
  state.preset = id;
  $$('[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === id));
  syncControls();
  compute('full');
  if (r.targets.length) select(r.targets[0].index);
  showTab('beam');
  frameProbe();
}

function bestWindow() {
  if (state.selected === null) { alert('Select a structure first (click it in the 3D view or the list).'); return; }
  const part = atlas.parts[state.selected];
  const target = targetPoint([part]);
  const dir = probe.point.clone().sub(target);
  if (dir.length() > 0.35) dir.copy(target.clone().sub(new THREE.Vector3(0, target.y, 0)));
  const start = skinFrom(atlas, target, dir);
  if (!start) return;
  const {l} = probe.axes();
  searchWindow(model, probe, [part], target, l, start, 0.03, 4);
  clearPreset();
  syncControls();
  compute('full');
}

// Look at the imaging plane face-on, from the side of the body the probe is on.
function frameProbe() {
  const {e, a} = probe.axes();
  const t = probe.point.clone().addScaledVector(a, probe.depth * 0.45);
  const out = probe.point.clone().sub(new THREE.Vector3(0, probe.point.y, 0)).setY(0);
  const side = e.dot(out) >= 0 ? 1 : -1;
  const dir = e.clone().multiplyScalar(side).addScaledVector(probe.normal, 0.45).add(new THREE.Vector3(0, 0.12, 0)).normalize();
  const dist = 0.25 + probe.depth * 2.6;
  animateCamera(t, t.clone().addScaledVector(dir, dist));
}

let camAnim = null;
function animateCamera(target, position) {
  camAnim = {t0: performance.now(), fromT: controls.target.clone(), fromP: camera.position.clone(), target, position};
}

// ---------- panels ----------
function showTab(t) {
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('#tab-beam').classList.toggle('hidden', t !== 'beam');
  $('#tab-structure').classList.toggle('hidden', t !== 'structure');
}

function renderPanels() {
  renderSummary();
  renderList();
  if (state.selected !== null) renderStructure();
}

function renderSummary() {
  const {list, field} = result.stats;
  const inBeam = list.filter((s) => s.category.id !== 'beyond');
  const good = inBeam.filter((s) => s.category.id === 'good' || s.category.id === 'fair');
  const blocked = inBeam.filter((s) => s.category.id === 'blocked' || s.category.id === 'poor');
  const beyond = list.filter((s) => s.category.id === 'beyond').sort((a, b) => a.z0 - b.z0);
  const pName = (i) => (i >= 0 ? esc(atlas.parts[i].name) : '');
  const stopText = field.stops.slice(0, 3).map((s) => {
    const pct = Math.round(s.frac * 100);
    if (s.reason === 'gas') return `<li><b>Gas</b>${s.part >= 0 ? ` in ${pName(s.part)}` : ''} stops ${pct}% of the field at ~${cm(s.z)} cm.</li>`;
    if (s.reason === 'bone') return `<li><b>Bone shadow</b>${s.part >= 0 ? ` from ${pName(s.part)}` : ''} across ${pct}% of the field from ~${cm(s.z)} cm.</li>`;
    if (s.reason === 'depth') return `<li><b>Attenuation</b> exhausts the signal in ${pct}% of the field by ~${cm(s.z)} cm at ${probe.f.toFixed(1)} MHz.</li>`;
    return '';
  }).join('');
  const contact = field.contactLost > 0 ? `<li><b>No skin contact</b> for ${Math.round(field.contactLost * 100)}% of the probe face (gap over ${CONTACT_GAP * 1000} mm): rotate or use a smaller footprint.</li>` : '';
  $('#summary').innerHTML = `
    <h3>What the probe sees <span class="chip computed">computed</span></h3>
    <p><span class="sees">Imageable:</span> ${good.length ? good.slice(0, 7).map((s) => esc(shortName(s.part.name))).join(', ') : '<span class="muted">nothing well imageable in this plane</span>'}${good.length > 7 ? ` and ${good.length - 7} more` : ''}.</p>
    ${stopText || contact ? `<p class="obscured">What blocks the view:</p><ul>${contact}${stopText}</ul>` : '<p class="muted">No bone, gas or contact problems in the central plane.</p>'}
    ${blocked.length ? `<p class="muted">In the beam but hard to see: ${blocked.slice(0, 5).map((s) => `${esc(shortName(s.part.name))}${s.why[0] ? ` <span class="faint">(${esc(s.why[0].replace(/\.$/, '').toLowerCase())})</span>` : ''}`).join('; ')}.</p>` : ''}
    ${beyond.length ? `<p class="muted">Increase depth to ${cm(Math.min(0.3, beyond[0].z0 + 0.01))} cm to reach ${beyond.slice(0, 3).map((s) => esc(shortName(s.part.name))).join(', ')}.</p>` : ''}
    <p class="src">${result.plane.length} image rays + ${result.slice.length + result.volume.length} slice/volume rays · ${result.ms.toFixed(0)} ms</p>`;
  // Measurable variables from the structures that are imageable.
  const meas = new Map(), phys = new Map();
  for (const s of good.slice(0, 8)) {
    const k = knowledgeFor(s.part);
    if (!k) continue;
    for (const m of k.measures ?? []) if (!meas.has(m)) meas.set(m, s.part.name);
    for (const m of k.physiology ?? []) if (!phys.has(m)) phys.set(m, s.part.name);
  }
  $('#measurable').innerHTML = `<h3>What could be measured here <span class="chip approx">general knowledge</span></h3>
    ${phys.size ? `<div class="muted" style="font-size:11px">Physiological variables</div><div class="pills">${[...phys].slice(0, 12).map(([m, p]) => `<span class="pill" title="via ${esc(p)}">${esc(m)}</span>`).join('')}</div>` : ''}
    ${meas.size ? `<div class="muted" style="font-size:11px;margin-top:8px">Ultrasound measurements</div><div class="pills">${[...meas].slice(0, 14).map(([m, p]) => `<span class="pill m" title="${esc(p)}">${esc(m)}</span>`).join('')}</div>` : ''}
    ${!phys.size && !meas.size ? '<p class="muted">No well-imaged structure with curated notes in this plane.</p>' : ''}`;
}

function renderList() {
  if (!result) return;
  const {list} = result.stats;
  const groups = [...CATEGORIES, {id: 'beyond', label: 'Deeper than the imaging depth', color: '#6b7a90'}];
  let html = '';
  for (const g of groups) {
    const items = list.filter((s) => s.category.id === g.id).sort((a, b) => g.id === 'beyond' ? a.z0 - b.z0 : b.score - a.score);
    if (!items.length) continue;
    html += `<div class="group-title"><i style="background:${g.color}"></i>${g.label} · ${items.length}</div>`;
    for (const s of items.slice(0, g.id === 'beyond' ? 12 : 60)) {
      const depth = g.id === 'beyond' ? `${cm(s.z0)} cm` : `${cm(s.z0)}–${cm(s.z1)} cm`;
      html += `<div class="item${s.part.index === state.selected ? ' sel' : ''}" data-i="${s.part.index}">
        <span class="nm">${esc(s.part.name)}${s.part.derived ? '<span class="tagd">derived</span>' : ''}</span><span class="dp">${depth}</span>
        ${g.id !== 'beyond' ? `<span class="bar"><b style="width:${Math.max(3, s.score * 100)}%;background:${g.color}"></b></span>` : ''}
        ${s.why?.[0] ? `<span class="why">${esc(s.why[0])}</span>` : s.surfaceOnly ? `<span class="why">Surface only: ${TISSUES[s.part.tissue].kind === 'gas' ? 'gas reflects almost everything' : 'bone reflects and absorbs'}.</span>` : ''}
      </div>`;
    }
  }
  $('#list').innerHTML = `<div class="card"><h3>Structures crossed by the beam <span class="chip computed">computed</span></h3>
    <p class="muted" style="font-size:11.5px">Geometry decides what the beam crosses; the acoustic model decides what is likely imageable. Scores are qualitative.</p>${html || '<p class="muted">The beam does not enter the body.</p>'}</div>`;
  $$('#list .item').forEach((el) => el.onclick = () => select(+el.dataset.i));
}

function renderStructure() {
  const p = atlas.parts[state.selected];
  if (!p) return;
  const t = TISSUES[p.tissue];
  const s = result?.stats.byPart.get(p.index);
  const k = knowledgeFor(p);
  const sys = systemById[p.system];
  let beamHtml = '<p class="muted">Not crossed by the current beam. Try a preset or <b>Find best window</b>.</p>';
  if (s && s.category.id === 'beyond') beamHtml = `<p>In line with the beam but starts at ${cm(s.z0)} cm, deeper than the imaging depth (${cm(probe.depth)} cm).</p>`;
  else if (s) {
    let doppler = '';
    if (p.tissue === 'blood' && s.anchor) {
      const axis = localAxis(p, s.anchor);
      if (axis) {
        const dir = s.anchor.clone().sub(probe.point).normalize();
        const ang = THREE.MathUtils.radToDeg(Math.acos(Math.abs(axis.dot(dir))));
        doppler = `<span>Doppler angle (beam to vessel)</span><span style="color:${ang <= 60 ? 'var(--good)' : 'var(--bad)'}">${ang.toFixed(0)}° ${ang <= 60 ? '· velocity OK' : '· > 60°, unreliable'}</span>`;
      }
    }
    beamHtml = `
      <p><span style="color:${s.category.color};font-weight:600">${s.category.label}</span> <span class="muted">· score ${s.score.toFixed(2)}</span> <span class="chip approx">qualitative</span></p>
      <div class="kv">
        <span>Depth from probe face</span><span>${cm(s.z0)}–${cm(s.z1)} cm</span>
        <span>Signal margin at entry (75th pct)</span><span>${s.m75 > -90 ? s.m75.toFixed(0) + ' dB' : 'none'}</span>
        <span>Rays reaching it with signal</span><span>${Math.round(s.cov * 100)}% of ${s.total}</span>
        <span>Angle of incidence (mean)</span><span>${s.theta.toFixed(0)}°</span>
        <span>Lateral / axial resolution there</span><span>${(s.res.lateral * 1e3).toFixed(1)} / ${(s.res.axial * 1e3).toFixed(2)} mm</span>
        <span>Size in the plane (approx.)</span><span>${(s.size * 1e3).toFixed(0)} mm</span>
        ${doppler}
      </div>
      ${s.why.length ? `<ul>${s.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
  }
  const srcList = (t.src ?? []).map((k) => `<div class="src">• ${esc(SOURCES[k])}</div>`).join('');
  $('#structure').innerHTML = `
    <h2>${esc(p.name)}</h2>
    <div class="pills" style="margin-bottom:6px">
      ${p.derived ? '<span class="chip derived">Derived approximation</span>' : `<span class="chip geo">BodyParts3D ${esc(p.id)}${p.conceptId ? ' · ' + esc(p.conceptId) : ''}</span>`}
      <span class="chip neutral">${esc(sys?.name ?? p.system)}</span>
    </div>
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
    <div class="btnrow">
      <button id="s-best">Find best window</button>
      <button id="s-iso" class="${state.isolate ? 'toggle on' : 'toggle'}">${state.isolate ? 'Show all' : 'Isolate'}</button>
      <button id="s-frame">Zoom to</button>
    </div>
    <h3 style="margin-top:14px">In the current beam <span class="chip computed">computed</span></h3>
    ${beamHtml}
    <h3 style="margin-top:14px">Acoustic class <span class="chip ${t.conf === 'lit' ? 'computed' : 'approx'}">${t.conf === 'lit' ? 'literature value' : t.conf === 'approx' ? 'approximate' : 'assumed'}</span></h3>
    <p><b>${esc(t.label)}</b> <span class="muted">(assigned from the structure's name and system)</span></p>
    <div class="kv">
      <span>Speed of sound</span><span>${t.c} m/s</span>
      <span>Density</span><span>${t.rho} kg/m³</span>
      <span>Impedance</span><span>${impedance(t).toFixed(2)} MRayl</span>
      <span>Attenuation</span><span>${t.alpha} dB/cm/MHz${t.n !== 1 ? `^${t.n}` : ''}</span>
      <span>At ${probe.f.toFixed(1)} MHz</span><span>${(t.alpha * Math.pow(probe.f, t.n)).toFixed(2)} dB/cm</span>
    </div>
    ${t.range ? `<p class="muted" style="font-size:11.5px">Range in sources: ${esc(t.range)}</p>` : ''}
    ${t.note ? `<p class="muted" style="font-size:11.5px">${esc(t.note)}</p>` : ''}
    ${srcList}
    ${k ? `<h3 style="margin-top:14px">Imaging it with ultrasound <span class="chip approx">general knowledge</span></h3>
      ${k.title ? `<p><b>${esc(k.title)}</b></p>` : ''}
      <p>${esc(k.how)}</p>
      ${k.windows?.length ? `<div class="muted" style="font-size:11px">Useful acoustic windows</div><ul>${k.windows.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${k.measures?.length ? `<div class="muted" style="font-size:11px">Possible measurements</div><div class="pills">${k.measures.map((m) => `<span class="pill m">${esc(m)}</span>`).join('')}</div>` : ''}
      ${k.physiology?.length ? `<div class="muted" style="font-size:11px;margin-top:6px">Physiological variables</div><div class="pills">${k.physiology.map((m) => `<span class="pill">${esc(m)}</span>`).join('')}</div>` : ''}` : ''}`;
  $('#s-best').onclick = bestWindow;
  $('#s-iso').onclick = () => { state.isolate = !state.isolate; applyHighlights(); renderStructure(); };
  $('#s-frame').onclick = () => {
    const c = p.box.getCenter(new THREE.Vector3());
    const r = Math.max(0.08, p.box.getSize(new THREE.Vector3()).length() * 1.4);
    const dir = camera.position.clone().sub(controls.target).normalize();
    animateCamera(c, c.clone().addScaledVector(dir, r * 2));
  };
}

function modelHtml() {
  const rows = Object.entries(TISSUES).filter(([k]) => k !== 'none').map(([k, t]) => `<tr><td>${esc(t.label)}</td><td class="n">${t.c}</td><td class="n">${t.rho}</td><td class="n">${impedance(t).toFixed(2)}</td><td class="n">${t.alpha}</td><td class="n">${t.n}</td>
    <td class="conf-${t.conf}">${t.conf === 'lit' ? 'literature' : t.conf}</td><td>${esc(t.range ?? '')} <span class="faint">${(t.src ?? []).join(', ')}</span></td></tr>`).join('');
  const derived = atlas.parts.filter((p) => p.derived).map((p) => `<li><b>${esc(p.name)}</b>: ${esc(p.note)}</li>`).join('');
  return `<h2>Model and assumptions</h2>
  <p>This is an <b>anatomical ultrasound accessibility explorer</b>, not a clinical simulator or diagnostic tool. It keeps three things separate:</p>
  <ul>
    <li><span class="chip geo">Geometry</span> Anatomy is BodyParts3D 4.0 (adult male reference, 2,234 meshes), as packaged by Human Atlas: identifiers unchanged, meshes simplified within a 0.2% relative error bound. Which structures a ray crosses, at what depth and angle, is computed exactly from these meshes. The meshes carry no acoustic information.</li>
    <li><span class="chip computed">Computed</span> Each ray accumulates one-way loss: attenuation α·f<sup>n</sup>·path in every tissue it crosses, plus −10·log₁₀(1−R) at every interface, with R = ((Z₂−Z₁)/(Z₂+Z₁))². The margin left after a round trip is M = ${BUDGET} dB − 2L. Bone shadows, gas blocking, fluid enhancement and depth limits all follow from this.</li>
    <li><span class="chip approx">Educational approximation</span> The ${BUDGET} dB budget, the 0–30 dB scale for "imageable", the accessibility score, the specular-angle penalty, echogenicity values in the pseudo B-mode, the bowel-gas noise field and the ${CONTACT_GAP * 1000} mm contact tolerance are choices made for intuition. The budget gives a soft-tissue penetration of about ${BUDGET}/(1.2·f) cm, inside the published range of 30/f to 77/f cm.</li>
  </ul>
  <h3>What the model leaves out</h3>
  <ul>
    <li>Rays are straight: no refraction, diffraction, multiple scattering, speed-of-sound aberration or harmonic imaging.</li>
    <li>One isotropic value per tissue class; real tissues vary with direction (muscle, tendon), age, hydration, fat and disease.</li>
    <li>No subcutaneous fat layer exists in BodyParts3D: the space between skin and the first mesh is "unassigned soft tissue".</li>
    <li>Vessels are solid tubes treated as blood-filled; walls are implicit. Bone meshes are solid (cortex and marrow together).</li>
    <li>Where meshes overlap, the structure with the smaller enclosed volume is taken to occupy the space (vessels inside organs, cavities inside walls). Derived lungs always yield.</li>
    <li>Skin contact: the probe face couples if the skin is within ${CONTACT_GAP * 1000} mm along each ray (gel and tissue compression); the body does not deform.</li>
    <li>One body: an adult male reference. Body habitus, breathing phase, posture and pathology are not modelled.</li>
  </ul>
  <h3>Structures not in BodyParts3D</h3>
  <ul>${derived}</ul>
  <h3>Tissue classes</h3>
  <table><thead><tr><th>Class</th><th>c m/s</th><th>ρ kg/m³</th><th>Z MRayl</th><th>α dB/cm/MHz</th><th>n</th><th>Confidence</th><th>Range in sources / notes</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="muted">Every structure is assigned a class by rules on its name and system; check the Structure tab to see the class of any structure.</p>
  <h3>Sources</h3>
  <ul>${Object.entries(SOURCES).map(([k, v]) => `<li><b>${k}</b>: ${esc(v)}</li>`).join('')}</ul>
  <h3>Attribution</h3>
  <p>Anatomy: BodyParts3D, © The Database Center for Life Science, licensed under CC BY 4.0 (Mitsuhashi et al. 2009, doi:10.1093/nar/gkn613). Browser packaging and identifiers from Human Atlas by ashemag (MIT). Rendering: three.js (MIT) and three-mesh-bvh (MIT).</p>`;
}

function helpHtml() {
  return `<h2>How to use</h2>
  <ul>
    <li><b>Pick a preset</b> on the left: the probe is placed on the skin over the target and nudged to the best nearby window.</li>
    <li><b>Move the probe</b>: hold <b>Shift</b> and drag on the skin, drag the probe itself, or toggle <b>Move probe</b>.</li>
    <li><b>Orient it</b>: Rotate turns the imaging plane, Tilt fans it, Rock tilts the beam within the plane (keys Q/E, W/S, A/D; Shift for 1° steps).</li>
    <li><b>Change the probe</b>: type, frequency, depth and field angle. Higher frequency resolves more but penetrates less.</li>
    <li><b>Read the result</b>: structures are coloured by expected accessibility; the right panel explains what is seen, what blocks the view, and what could be measured. The inset shows the imaging plane as a pseudo B-mode image or a tissue map.</li>
    <li><b>Click any structure</b> to see its acoustic class, its status in the beam (depth, margin, Doppler angle for vessels) and how it is imaged in practice. <b>Find best window</b> searches nearby skin for a better view of it.</li>
    <li><b>Cut at plane</b> slices the anatomy along the imaging plane; <b>Slab</b> keeps only ±12 mm around it.</li>
    <li>Try: the Lung preset (rib shadows and A-lines), Bladder with the bladder emptied, Abdominal aorta with more bowel gas, Transcranial at 5 MHz, Achilles with tilt.</li>
  </ul>`;
}

// ---------- loop ----------
function animate() {
  requestAnimationFrame(animate);
  if (camAnim) {
    const k = Math.min(1, (performance.now() - camAnim.t0) / 900);
    const e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(camAnim.fromT, camAnim.target, e);
    camera.position.lerpVectors(camAnim.fromP, camAnim.position, e);
    if (k >= 1) camAnim = null;
  }
  controls.update();
  if (need) { const q = need; need = null; compute(q); }
  if (state.clip === 'half') updateClip();
  renderer.render(scene, camera);
  updateLabels();
}

async function start() {
  buildControls();
  resize();
  animate();
  try {
    await atlas.load('models/');
    progress(0.8, 'Indexing geometry for ray tracing');
    await atlas.warmIndices((f) => progress(0.8 + f * 0.2, 'Indexing geometry for ray tracing'));
    $('#loading').classList.add('done');
    runPreset('ruq');
  } catch (err) {
    console.error(err);
    $('#ld-msg').textContent = `Could not load: ${err.message}. Serve this folder over HTTP (see README).`;
  }
}
start();
window.__us = {atlas, model, probe, state, get result() { return result; }, runPreset, select};
