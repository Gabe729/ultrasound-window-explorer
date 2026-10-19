// Standard acoustic windows. Each preset names target structures, the direction from the
// target towards the skin where the probe sits, the orientation-marker direction, and probe
// settings. Placement is computed from the anatomy, then refined by searching nearby skin
// points for the position that sees the target best (e.g. the nearest intercostal gap).
// World axes: +x = patient's left, +y = superior, +z = anterior.
import * as THREE from 'three';
import {clamp} from './physics.js';

const HEART = [/^cavity of left ventricle$/, /^cavity of right ventricle$/, /^cavity of left atrium$/, /^cavity of right atrium$/];

export const PRESETS = [
  {group: 'Cardiac', id: 'plax', label: 'Parasternal long axis', targets: [/^cavity of left ventricle$/, /leaflet of mitral/, /cusp of aortic valve/],
    approach: [0.05, 0.25, 1], marker: [-1, 0.75, 0], probe: {type: 'phased', f: 2.5, depth: 16, angle: 90},
    note: 'Left sternal edge, 3rd–4th intercostal space, marker towards the right shoulder. Lung and ribs leave only a small window.'},
  {group: 'Cardiac', id: 'a4c', label: 'Apical four-chamber', targets: HEART,
    approach: [0.55, -0.45, 0.7], marker: [1, 0, 0], probe: {type: 'phased', f: 2.5, depth: 18, angle: 90},
    note: 'At the apex beat, aiming towards the right shoulder; all four chambers in one plane.'},
  {group: 'Cardiac', id: 'subcostal', label: 'Subcostal four-chamber', targets: HEART,
    approach: [-0.05, -1, 0.55], marker: [1, 0, 0], probe: {type: 'phased', f: 2.5, depth: 20, angle: 90},
    note: 'Below the xiphoid, looking up through the liver; useful when lung hides the chest windows.'},
  {group: 'Abdominal', id: 'ruq', label: 'Liver and gallbladder', targets: [/^gallbladder$/],
    approach: [-0.25, -0.35, 1], marker: [-0.3, 1, 0], probe: {type: 'curvilinear', f: 3.5, depth: 16, angle: 60},
    note: 'Right subcostal oblique; the liver is the window to the gallbladder.'},
  {group: 'Abdominal', id: 'liver-ic', label: 'Liver, intercostal', targets: [/hepatovenous segment (vi|vii)$/],
    approach: [-1, 0, 0.3], marker: [0, 1, 0], probe: {type: 'curvilinear', f: 3.5, depth: 18, angle: 60},
    note: 'Right lateral, between the lower ribs. Rotate the plane along the rib space to remove rib shadows.'},
  {group: 'Abdominal', id: 'aorta', label: 'Abdominal aorta (transverse)', targets: [/^abdominal aorta$/, /^inferior vena cava$/],
    approach: [0, -0.1, 1], marker: [-1, 0, 0], probe: {type: 'curvilinear', f: 3.5, depth: 16, angle: 60},
    note: 'Midline epigastrium, marker to the patient\'s right. Bowel gas is the usual obstacle; firm pressure helps.'},
  {group: 'Renal', id: 'kidney-r', label: 'Right kidney', targets: [/^right kidney$/],
    approach: [-1, 0, 0.15], marker: [0, 1, 0], probe: {type: 'curvilinear', f: 3.5, depth: 15, angle: 60},
    note: 'Right flank, coronal plane, through the liver.'},
  {group: 'Renal', id: 'kidney-l', label: 'Left kidney', targets: [/^left kidney$/],
    approach: [1, 0.1, -0.45], marker: [0, 1, 0], probe: {type: 'curvilinear', f: 3.5, depth: 15, angle: 60},
    note: 'Left posterior axillary line, through the spleen; the left kidney sits higher and more posterior.'},
  {group: 'Pelvic', id: 'bladder-sag', label: 'Bladder and prostate (sagittal)', targets: [/^urinary bladder$/, /^prostate$/],
    approach: [0, 0.12, 1], marker: [0, 1, 0], probe: {type: 'curvilinear', f: 3.5, depth: 14, angle: 60}, physics: {bladderFull: true},
    note: 'Suprapubic, angled down behind the pubic bone. A full bladder is the window; try emptying it. The BodyParts3D bladder is small and low (nearly empty); a truly full bladder would rise above the pubis and push bowel aside, which the fixed geometry cannot show.'},
  {group: 'Pelvic', id: 'bladder-tr', label: 'Bladder (transverse)', targets: [/^urinary bladder$/],
    approach: [0, 0.05, 1], marker: [-1, 0, 0], probe: {type: 'curvilinear', f: 3.5, depth: 14, angle: 60}, physics: {bladderFull: true},
    note: 'Transverse suprapubic view for bladder volume (width × depth × length).'},
  {group: 'Vascular', id: 'carotid', label: 'Carotid artery (long axis)', targets: [/^right common carotid artery$/],
    approach: [-0.7, 0, 0.7], marker: [0, 1, 0], probe: {type: 'linear', f: 9, depth: 4, angle: 0},
    note: 'Anterolateral neck. Steer or heel-toe to bring the Doppler angle below 60°.'},
  {group: 'Vascular', id: 'femoral', label: 'Common femoral vessels', targets: [/^left femoral artery$/, /^left femoral vein$/], select: {mode: 'top', frac: 0.3},
    approach: [0.1, 0, 1], marker: [-1, 0, 0], probe: {type: 'linear', f: 7.5, depth: 5, angle: 0},
    note: 'Groin, just below the inguinal ligament, transverse: artery lateral, vein medial. Compress to test for clot.'},
  {group: 'Vascular', id: 'tcd', label: 'Transcranial (temporal window)', targets: [/right middle cerebral artery/],
    approach: [-1, 0.05, 0.1], marker: [0, 0, 1], probe: {type: 'phased', f: 2, depth: 15, angle: 90},
    note: 'Above the zygomatic arch. Low frequency is needed to cross the temporal bone.'},
  {group: 'Musculoskeletal', id: 'achilles', label: 'Achilles tendon', targets: [/^right calcaneal tendon$/], select: {mode: 'bottom', frac: 0.35},
    approach: [0, 0, -1], marker: [0, 1, 0], probe: {type: 'linear', f: 12, depth: 3, angle: 0},
    note: 'Posterior ankle, long axis. Tilt the probe a few degrees to see anisotropy.'},
  {group: 'Musculoskeletal', id: 'quads', label: 'Quadriceps (transverse)', targets: [/^right rectus femoris$/],
    approach: [0, 0, 1], marker: [1, 0, 0], probe: {type: 'linear', f: 10, depth: 6, angle: 0},
    note: 'Anterior mid-thigh; muscle thickness and cross-sectional area.'},
  {group: 'Other', id: 'thyroid', label: 'Thyroid (transverse)', targets: [/^thyroid gland/],
    approach: [0, 0, 1], marker: [-1, 0, 0], probe: {type: 'linear', f: 12, depth: 4, angle: 0},
    note: 'Lower anterior neck. The thyroid here is schematic (not in BodyParts3D).'},
  {group: 'Other', id: 'lung', label: 'Lung (anterior intercostal)', targets: [/^right lung/], select: {mode: 'top', frac: 0.5},
    approach: [0, 0, 1], marker: [0, 1, 0], probe: {type: 'curvilinear', f: 4, depth: 12, angle: 60},
    note: 'Across two ribs ("bat sign"): rib shadows, the pleural line, and A-line reverberations.'},
  {group: 'Other', id: 'eye', label: 'Eye and optic nerve', targets: [/^right vitreous body$/, /^right optic nerve$/],
    approach: [0, 0.1, 1], marker: [0, 1, 0], probe: {type: 'linear', f: 10, depth: 6, angle: 0},
    note: 'Through the closed eyelid; optic nerve sheath diameter. The BodyParts3D skin has an open eyelid gap, so rays through it lose contact here.'},
];

export function targetParts(atlas, preset) {
  return atlas.parts.filter((p) => preset.targets.some((re) => re.test(p.name.toLowerCase())));
}

export function targetPoint(parts, select) {
  const pts = [];
  for (const p of parts) {
    const a = p.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) pts.push(a[i], a[i + 1], a[i + 2]);
  }
  let idx = [...Array(pts.length / 3).keys()];
  if (select && select.mode !== 'center') {
    const ax = select.axis ?? 1; // 0 = x, 1 = y (superior), 2 = z (anterior)
    idx.sort((i, j) => pts[i * 3 + ax] - pts[j * 3 + ax]);
    const k = Math.max(1, Math.floor(idx.length * select.frac));
    idx = select.mode === 'top' ? idx.slice(-k) : idx.slice(0, k);
  }
  const c = new THREE.Vector3();
  for (const i of idx) c.add(new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]));
  return c.divideScalar(idx.length);
}

// Skin point reached by walking out from the target along `dir`: the first surface crossed,
// so a limb lying outside the torso (the arm beside the flank) is never chosen.
export function skinFrom(atlas, target, dir) {
  const d = dir.clone().normalize();
  const hit = outwardHit(atlas, target, d);
  if (hit) return hit;
  // Target outside a closed surface (e.g. behind an open eyelid gap): come in from outside.
  return atlas.surfaceHit(new THREE.Ray(target.clone().addScaledVector(d, 0.6), d.clone().negate()));
}

function outwardHit(atlas, from, d, maxDist = 0.4) {
  const hits = atlas.bvh(atlas.skin).raycast(new THREE.Ray(from.clone(), d), THREE.DoubleSide, 0, maxDist);
  if (!hits.length) return null;
  hits.sort((a, b) => a.distance - b.distance);
  const n = hits[0].face.normal.clone();
  if (n.dot(d) < 0) n.negate();
  return {point: hits[0].point.clone(), normal: n};
}

// Score how well a pose sees the targets (fast, few rays).
function poseScore(model, probe, targetSet) {
  const rays = probe.planeRays(17);
  const opts = {f: probe.f, depth: probe.depth, geomDepth: probe.depth, samples: 4};
  let s = 0;
  for (const r of rays) {
    const res = model.trace(r, opts);
    let best = 0;
    for (const e of res.entries) if (targetSet.has(e.part) && e.z0 < probe.depth) best = Math.max(best, clamp(e.margin / 30, 0, 1));
    s += best;
  }
  return s / rays.length;
}

// Search skin points within `radius` of `start` for the best view of the target.
export function searchWindow(model, probe, targets, target, marker, start, radius = 0.018, steps = 3) {
  const atlas = model.atlas;
  const set = new Set(targets.map((p) => p.index));
  const n0 = start.normal;
  const t1 = new THREE.Vector3().crossVectors(n0, Math.abs(n0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n0, t1);
  let best = null;
  for (let i = -steps; i <= steps; i++) for (let j = -steps; j <= steps; j++) {
    const off = t1.clone().multiplyScalar((i / steps) * radius).addScaledVector(t2, (j / steps) * radius);
    const from = start.point.clone().add(off).addScaledVector(n0, -0.03);
    const hit = outwardHit(atlas, from, n0, 0.08);
    // Reject hits that jump to another body surface (an arm beside the flank, the far side of a gap).
    if (!hit || hit.point.distanceTo(start.point) > radius * 1.8 + 0.005) continue;
    probe.point.copy(hit.point); probe.normal.copy(hit.normal);
    probe.aim(target.clone().sub(hit.point), marker);
    const s = poseScore(model, probe, set) - 0.15 * (off.length() / radius);
    if (!best || s > best.s) best = {s, point: hit.point.clone(), normal: hit.normal.clone()};
  }
  if (best) {
    probe.point.copy(best.point); probe.normal.copy(best.normal);
    probe.aim(target.clone().sub(best.point), marker);
  }
  return best;
}

export function applyPreset(model, probe, preset) {
  const atlas = model.atlas;
  const targets = targetParts(atlas, preset);
  if (!targets.length) return {ok: false, message: `No structures match preset ${preset.label}`};
  const target = targetPoint(targets, preset.select);
  const approach = new THREE.Vector3(...preset.approach).normalize();
  const start = skinFrom(atlas, target, approach);
  if (!start) return {ok: false, message: 'Could not find the skin surface for this preset.'};
  probe.type = preset.probe.type;
  probe.f = preset.probe.f;
  probe.depth = preset.probe.depth / 100;
  probe.angle = preset.probe.angle;
  if (preset.physics) Object.assign(model.settings, preset.physics);
  const marker = new THREE.Vector3(...preset.marker);
  const best = searchWindow(model, probe, targets, target, marker, start);
  return {ok: true, targets, target, score: best?.s};
}
