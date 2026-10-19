// Educational acoustic model along straight rays.
//
// Geometry (computed exactly from the meshes): which structures each ray passes through,
// in what order, at what depth and at what angle of incidence.
// Acoustics (computed from the approximate tissue table): one-way loss
//   L(z) = sum of alpha_i * f^n_i * path_i  +  sum of -10 log10(1 - R) at each interface,
//   R = ((Z2 - Z1) / (Z2 + Z1))^2,
// and the remaining margin M(z) = BUDGET - 2 L(z) for a round trip.
// Educational approximations (not physics): the fixed BUDGET, the scoring thresholds,
// the gas-pocket noise field in bowel, the specular angle penalty, straight rays
// (no refraction, no multiple scattering, no beam diffraction beyond the resolution formulas).
import * as THREE from 'three';
import {TISSUES, AIR, impedance, categoryFor} from './tissues.js';
import {PROBES, resolution} from './probe.js';

export const BUDGET = 70; // dB of round-trip loss a typical scanner can tolerate before echoes sink into noise
export const CONTACT_GAP = 0.008; // m; gel and tissue compression assumed to couple gaps up to this size
export const COMPRESS = 0.02; // m; air gaps this short near the face are taken as tissue the probe presses flat
const BACK = 0.04; // m; rays start this far behind the face so the skin entry is always found
const DEAD = -25; // dB margin below which a ray is treated as carrying no usable signal

export const TISSUE_KEYS = Object.keys(TISSUES);
const KEY_INDEX = Object.fromEntries(TISSUE_KEYS.map((k, i) => [k, i]));
export const OUTSIDE = 254, GAS_CODE = 253;

const rad2deg = THREE.MathUtils.radToDeg;

export class AcousticModel {
  constructor(atlas) {
    this.atlas = atlas;
    this.settings = {gas: 0.35, bladderFull: true};
    this.ray = new THREE.Ray();
  }

  alphaAt(t, f) { return t.alpha * Math.pow(f, t.n); } // dB/cm

  // Effective tissue of a segment after the physiological state switches.
  effectiveTissue(key, worldPoint) {
    if (key === 'urine' && !this.settings.bladderFull) return 'muscle';
    if (key === 'bowel') {
      // Stretch the noise so its distribution is roughly uniform: the slider then ~ gas fraction.
      const v = 0.5 + (valueNoise(worldPoint.x * 38, worldPoint.y * 38, worldPoint.z * 38) - 0.5) * 1.67;
      return v < this.settings.gas ? 'bowelGas' : 'bowel';
    }
    return key;
  }

  tissueProps(key) {
    if (key === 'bowelGas') return {...TISSUES.airway, label: 'Bowel gas', kind: 'gas'};
    return TISSUES[key];
  }

  // Trace one ray. geomDepth >= depth: geometry is followed further so that structures just
  // beyond the current imaging depth can be reported as such.
  trace(r, {f, depth, geomDepth, samples}) {
    const atlas = this.atlas;
    const parts = atlas.parts, boxes = atlas.boxes;
    const O = r.o.clone().addScaledVector(r.d, -BACK);
    const ray = this.ray.set(O, r.d);
    const far = BACK + geomDepth;
    const inv = [1 / r.d.x, 1 / r.d.y, 1 / r.d.z];
    const o = [O.x, O.y, O.z];
    const hitsByPart = new Map();
    let skinHits = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.tissue === 'none') continue;
      let t0 = 0, t1 = far;
      const b = i * 6;
      let miss = false;
      for (let k = 0; k < 3; k++) {
        let ta = (boxes[b + k] - o[k]) * inv[k], tb = (boxes[b + 3 + k] - o[k]) * inv[k];
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { miss = true; break; }
      }
      if (miss) continue;
      if (p === atlas.skin) {
        // All crossings to beyond the far side of the body, for the inside/outside count below.
        skinHits = atlas.bvh(p).raycast(ray, THREE.DoubleSide, 0, 3).sort((x, y) => x.distance - y.distance);
        continue;
      }
      // If the ray starts inside this structure's box it may start inside the structure:
      // count all crossings to decide (odd = inside), then add a virtual entry at the start.
      const startsInBox = o[0] >= boxes[b] && o[0] <= boxes[b + 3] && o[1] >= boxes[b + 1] && o[1] <= boxes[b + 4] && o[2] >= boxes[b + 2] && o[2] <= boxes[b + 5];
      let hits = atlas.bvh(p).raycast(ray, THREE.DoubleSide, 0, startsInBox ? 3 : far);
      if (!hits.length) continue;
      hits.sort((a, c) => a.distance - c.distance);
      if (startsInBox) {
        const inside = hits.length % 2 === 1;
        hits = hits.filter((h) => h.distance <= far);
        if (inside) hits.unshift({distance: 0, face: {normal: null}});
      }
      if (!hits.length) continue;
      hitsByPart.set(i, hits);
    }
    const res = {o: r.o, d: r.d, u: r.u, samples, dz: depth / samples, depth, contact: true, entries: [], echoes: [], segs: []};
    res.margin = new Float32Array(samples).fill(-99);
    res.cls = new Uint8Array(samples).fill(OUTSIDE);
    res.part = new Int16Array(samples).fill(-1);
    // The BodyParts3D skin is a thin solid shell (outer and inner surface ~2 mm apart), so its
    // crossings come in pairs, one pair per pass through the body wall. An odd number of passes
    // from the ray start to infinity means the start lies inside the body.
    const layers = [];
    for (let k = 0; k < skinHits.length; k += 2) layers.push({a: skinHits[k], b: skinHits[k + 1] ?? skinHits[k]});
    let inside = layers.length % 2 === 1;
    const body = [];
    let open = inside ? {a: {distance: 0, face: {normal: null}}} : null;
    for (const L of layers) {
      if (!open) open = {a: L.a};
      else { open.b = L.b; body.push(open); open = null; }
    }
    if (open) { open.b = null; body.push(open); }
    // Short air gaps next to the face are tissue the probe would press flat.
    for (let k = 0; k + 1 < body.length; k++) {
      const gapStart = body[k].b?.distance ?? Infinity;
      if (gapStart < BACK + 0.03 && body[k + 1].a.distance - gapStart < COMPRESS) { body[k].b = body[k + 1].b; body.splice(k + 1, 1); k--; }
    }
    const seg0 = body.find((iv) => (iv.b?.distance ?? Infinity) > BACK + 0.001);
    if (!seg0) { res.contact = false; res.deadAt = 0; res.deadReason = 'contact'; return res; }
    const entryT = seg0.a.distance;
    const exit = seg0.b;
    const exitT = exit ? exit.distance : far;
    const zEntry = entryT - BACK;
    res.zEntry = zEntry;
    if (zEntry > CONTACT_GAP) { res.contact = false; res.deadAt = 0; res.deadReason = 'contact'; return res; }

    // Paired enter/exit hits give the intervals each structure occupies along the ray.
    const intervals = [];
    for (const [i, hits] of hitsByPart) {
      hits.sort((a, b) => a.distance - b.distance);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        const a = Math.max(hits[k].distance, entryT), bb = Math.min(hits[k + 1].distance, exitT);
        if (bb - a < 1e-5) continue;
        intervals.push({a, b: bb, part: i, prio: parts[i].priority, nIn: hits[k].face.normal, nOut: hits[k + 1].face.normal});
      }
    }
    const bounds = new Map([[entryT, seg0.a.face.normal], [exitT, exit?.face.normal ?? null]]);
    for (const iv of intervals) { bounds.set(iv.a, iv.nIn); bounds.set(iv.b, iv.nOut); }
    const cuts = [...bounds.keys()].sort((a, b) => a - b);
    const segs = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k], b = cuts[k + 1];
      if (b - a < 1e-6 || a < entryT - 1e-9 || b > exitT + 1e-9) continue;
      const mid = (a + b) / 2;
      let win = null;
      for (const iv of intervals) if (iv.a <= mid && iv.b >= mid && (!win || iv.prio < win.prio)) win = iv;
      const part = win ? win.part : -1;
      const last = segs[segs.length - 1];
      if (last && last.part === part) { last.z1 = b - BACK; continue; }
      segs.push({z0: a - BACK, z1: b - BACK, part, n: bounds.get(a)});
    }
    // A thin skin layer under the entry point when nothing else occupies it.
    if (segs.length && segs[0].part === -1) {
      const s = segs[0], zs = Math.min(s.z1, s.z0 + 0.0015);
      segs[0] = {...s, z0: zs};
      segs.unshift({z0: s.z0, z1: zs, part: atlas.skin.index, n: s.n});
    }

    // Acoustic walk.
    let L = 0, Lbone = 0, Lgas = 0, Latt = 0;
    let Zprev = 1.5; // coupling gel ~ water
    let worst = {part: -1, dB: 0};
    const firstSeen = new Set();
    let dead = false;
    const tmp = new THREE.Vector3();
    const zOut = exitT - BACK;
    let prevKey = 'soft';
    for (const s of segs) {
      const key0 = s.part >= 0 ? parts[s.part].tissue : 'soft';
      tmp.copy(r.o).addScaledVector(r.d, s.z0);
      const key = this.effectiveTissue(key0, tmp);
      const t = this.tissueProps(key);
      s.key = key;
      if (s.z1 <= 0) continue; // behind the probe face (the ray may start inside the body)
      const gas = t.kind === 'gas';
      const Z2 = gas ? impedance(AIR) : impedance(t);
      let R = ((Z2 - Zprev) / (Z2 + Zprev)) ** 2;
      const n = s.n;
      const theta = n ? Math.acos(Math.min(1, Math.abs(n.x * r.d.x + n.y * r.d.y + n.z * r.d.z))) : 0;
      const marginIn = BUDGET - 2 * L;
      if (s.part >= 0 && !firstSeen.has(s.part)) {
        firstSeen.add(s.part);
        const mid = r.o.clone().addScaledVector(r.d, (s.z0 + s.z1) / 2);
        res.entries.push({part: s.part, z0: s.z0, z1: s.z1, margin: dead ? -99 : marginIn, theta, key,
          Lbone, Lgas, Latt, Lif: L - Lbone - Lgas - Latt, blocker: worst.part, dead, deadReason: res.deadReason, deadPart: res.deadPart, mid});
      } else if (s.part >= 0) {
        const e = res.entries.find((x) => x.part === s.part);
        e.z1 = s.z1;
      }
      if (s.z0 >= 0 && s.z0 <= depth && R > 1e-4) {
        const specular = t.specular || gas || this.tissueProps(prevKey).specular;
        const angleLoss = specular ? Math.min(30, 10 * (rad2deg(theta) / 12) ** 2) : Math.min(8, 2 * (rad2deg(theta) / 30) ** 2);
        res.echoes.push({z: s.z0, dB: 10 * Math.log10(R) - angleLoss, margin: marginIn, gas, bone: t.kind === 'bone'});
      }
      const ifLoss = gas ? 30 : -10 * Math.log10(Math.max(1e-6, 1 - R));
      L += ifLoss;
      if (gas) Lgas += ifLoss; else if (t.kind === 'bone' || this.tissueProps(prevKey).kind === 'bone') Lbone += ifLoss;
      if (ifLoss > worst.dB) worst = {part: s.part, dB: ifLoss};
      // Attenuation through the segment, sampled onto the depth grid.
      const a = this.alphaAt(t, f) * 100; // dB per metre
      const zA = Math.max(0, s.z0), zB = Math.min(depth, s.z1);
      for (let j = Math.max(0, Math.ceil(zA / res.dz)); j < samples && j * res.dz < zB; j++) {
        const z = j * res.dz;
        res.margin[j] = dead ? -99 : BUDGET - 2 * (L + a * (z - Math.max(s.z0, 0)));
        res.cls[j] = gas ? GAS_CODE : KEY_INDEX[key] ?? KEY_INDEX[key0] ?? 0;
        res.part[j] = s.part;
      }
      const segLoss = a * (s.z1 - Math.max(s.z0, 0));
      if (s.z1 > 0) {
        L += Math.max(0, segLoss);
        if (gas) Lgas += segLoss; else if (t.kind === 'bone') Lbone += segLoss; else Latt += segLoss;
        if (segLoss > worst.dB && (t.kind === 'bone' || gas)) worst = {part: s.part, dB: segLoss};
      }
      if (!dead && (gas || BUDGET - 2 * L < DEAD)) {
        dead = true;
        res.deadAt = gas ? s.z0 : s.z1;
        res.deadReason = gas ? 'gas' : Lbone > 0.35 * L ? 'bone' : 'depth';
        res.deadPart = gas ? s.part : Lbone > 0.35 * L ? worst.part : -1;
        res.gasZ = gas ? s.z0 : undefined;
      }
      Zprev = Z2;
      prevKey = key;
      if (s.z0 > geomDepth) break;
    }
    for (let j = 0; j < samples; j++) if (j * res.dz > zOut) { res.cls[j] = OUTSIDE; res.part[j] = -1; res.margin[j] = -99; }
    if (zOut < depth && !dead) { res.deadAt = zOut; res.deadReason = 'air'; }
    res.segs = segs;
    return res;
  }

  // Run the whole beam. quality: 'draft' while dragging, 'full' otherwise.
  run(probe, quality = 'full') {
    const draft = quality === 'draft';
    const nPlane = draft ? 48 : 128;
    const samples = draft ? 140 : 260;
    const opts = {f: probe.f, depth: probe.depth, geomDepth: Math.min(0.32, probe.depth + 0.08), samples};
    const t0 = performance.now();
    const frame = probe.axes();
    const plane = probe.planeRays(nPlane, frame).map((r) => Object.assign(this.trace(r, opts), {x0: r.x0, phi: r.phi}));
    const lite = {...opts, samples: 8};
    const slice = draft ? [] : probe.sliceRays(32, frame).map((r) => this.trace(r, lite));
    let volume = [];
    if (probe.volume && !draft) {
      for (const fr of probe.sweepFrames(7)) {
        if (Math.abs(fr.psi) < 1e-6) continue;
        volume = volume.concat(probe.planeRays(28, fr).map((r) => Object.assign(this.trace(r, lite), {psi: fr.psi})));
      }
    }
    const stats = this.aggregate(probe, plane, slice, volume);
    return {plane, slice, volume, stats, probe: snapshot(probe), ms: performance.now() - t0, draft, frame};
  }

  aggregate(probe, plane, slice, volume) {
    const parts = this.atlas.parts;
    const map = new Map();
    const get = (i) => {
      if (!map.has(i)) map.set(i, {part: parts[i], nPlane: 0, nSlice: 0, nVol: 0, z0: Infinity, z1: -Infinity, margins: [],
        visible: 0, total: 0, reasons: new Map(), thetas: [], thick: [], uMin: 1, uMax: 0, anchor: null, anchorScore: -Infinity, beyondOnly: true});
      return map.get(i);
    };
    const add = (ray, kind) => {
      for (const e of ray.entries) {
        if (e.part === this.atlas.skin.index) continue;
        const s = get(e.part);
        const inDepth = e.z0 <= probe.depth;
        if (!inDepth) continue;
        s.beyondOnly = false;
        if (kind === 'plane') { s.nPlane++; s.uMin = Math.min(s.uMin, ray.u); s.uMax = Math.max(s.uMax, ray.u); }
        else if (kind === 'slice') s.nSlice++; else s.nVol++;
        s.z0 = Math.min(s.z0, Math.max(0, e.z0)); s.z1 = Math.max(s.z1, Math.min(probe.depth, e.z1));
        s.total++;
        s.margins.push(e.margin);
        s.thetas.push(e.theta);
        s.thick.push(Math.min(e.z1, probe.depth) - Math.max(0, e.z0));
        if (e.margin > 0) s.visible++;
        else {
          let why = 'depth', who = -1;
          if (e.dead) { why = e.deadReason; who = e.deadPart ?? -1; }
          else if (e.Lgas > 10) { why = 'gas'; who = e.blocker; }
          else if (e.Lbone > 0.35 * (e.Lbone + e.Lgas + e.Latt + e.Lif)) { why = 'bone'; who = e.blocker; }
          const k = why + ':' + who;
          s.reasons.set(k, (s.reasons.get(k) ?? 0) + 1);
        }
        const centrality = kind === 'plane' ? -Math.abs(ray.u - 0.5) : -1;
        if (centrality + e.margin * 1e-3 > s.anchorScore) { s.anchorScore = centrality + e.margin * 1e-3; s.anchor = e.mid; }
      }
      // Structures only beyond the current depth.
      for (const e of ray.entries) {
        if (e.z0 > probe.depth && e.part !== this.atlas.skin.index) {
          const s = get(e.part);
          if (s.beyondOnly) { s.z0 = Math.min(s.z0, e.z0); s.anchor = s.anchor ?? e.mid; }
        }
      }
    };
    plane.forEach((r) => add(r, 'plane'));
    slice.forEach((r) => add(r, 'slice'));
    volume.forEach((r) => add(r, 'vol'));

    const out = [];
    for (const s of map.values()) {
      if (s.beyondOnly) { s.category = {id: 'beyond', label: 'Deeper than the imaging depth', color: '#6b7a90'}; s.score = 0; out.push(s); continue; }
      this.score(probe, s, plane.length);
      out.push(s);
    }
    out.sort((a, b) => (b.score - a.score) || (a.z0 - b.z0));
    // Field-level summary: what stops each image ray.
    const stops = new Map();
    let contactLost = 0;
    for (const r of plane) {
      if (!r.contact) { contactLost++; continue; }
      if (r.deadAt !== undefined && r.deadAt < probe.depth && r.deadReason !== 'air') {
        const k = r.deadReason + ':' + (r.deadPart ?? -1);
        const v = stops.get(k) ?? {reason: r.deadReason, part: r.deadPart ?? -1, rays: 0, zSum: 0};
        v.rays++; v.zSum += r.deadAt; stops.set(k, v);
      }
    }
    const field = {contactLost: contactLost / plane.length,
      stops: [...stops.values()].map((v) => ({...v, frac: v.rays / plane.length, z: v.zSum / v.rays})).sort((a, b) => b.rays - a.rays)};
    return {list: out, byPart: new Map(out.map((s) => [s.part.index, s])), field};
  }

  score(probe, s, nPlane) {
    const t = TISSUES[s.part.tissue] ?? TISSUES.soft;
    const ms = [...s.margins].sort((a, b) => a - b);
    const m75 = ms[Math.floor(0.75 * (ms.length - 1))];
    const sig = clamp(m75 / 30, 0, 1);
    const res = resolution(probe, Math.max(0.005, s.z0));
    const P = PROBES[probe.type];
    const zMid = (s.z0 + s.z1) / 2;
    const fieldW = probe.type === 'linear' ? P.width : (probe.type === 'curvilinear' ? P.radius + zMid : zMid) * THREE.MathUtils.degToRad(probe.angle);
    const lateral = s.nPlane > 0 ? ((s.uMax - s.uMin) + 1 / nPlane) * fieldW : res.slice;
    const thick = s.thick.reduce((a, b) => a + b, 0) / s.thick.length;
    const size = Math.min(lateral, thick);
    // Resolvable if it spans a few resolution cells both along the beam (axial) and across it (lateral).
    const resF = clamp((Math.min(thick / res.axial, lateral / res.lateral) - 1) / 2, 0, 1);
    const cov = s.visible / s.total;
    const theta = rad2deg(s.thetas.reduce((a, b) => a + b, 0) / s.thetas.length);
    const angleF = t.specular && t.kind !== 'bone' ? clamp(1 - (theta - 8) / 30, 0.3, 1) : 1;
    let score = sig * (0.35 + 0.65 * resF) * (0.4 + 0.6 * cov) * angleF;
    if (s.nPlane === 0) score *= 0.75; // only in the slice thickness or volume sweep
    s.sig = sig; s.resF = resF; s.cov = cov; s.theta = theta; s.m75 = m75; s.size = size; s.res = res;
    s.surfaceOnly = t.kind === 'gas' || t.kind === 'bone';
    if (t.kind === 'gas') score = Math.min(score, 0.45);
    s.score = score;
    s.category = categoryFor(score);
    // Main limitation in words.
    const top = [...s.reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    s.why = [];
    if (top && cov < 0.75) {
      const [why, who] = top[0].split(':');
      const name = who >= 0 ? this.atlas.parts[+who].name : '';
      s.why.push(reasonText(why, name, probe));
    }
    if (resF < 0.4 && sig > 0.2) s.why.push('Small relative to the beam width at this depth (resolution limit).');
    if (angleF < 0.7) s.why.push(`Beam meets this specular structure ~${theta.toFixed(0)}° from perpendicular, so little echo returns (anisotropy).`);
    if (s.nPlane === 0) s.why.push(s.nSlice ? 'Only inside the slice thickness, not the central imaging plane (partial-volume).' : 'Only in the swept volume, not the current plane.');
  }
}

export function reasonText(why, name, probe) {
  switch (why) {
    case 'gas': return `Gas blocks the beam${name ? ` (${name})` : ''}.`;
    case 'bone': return `Acoustic shadow from bone${name ? ` (${name})` : ''}.`;
    case 'depth': return `Too much attenuation at ${probe.f.toFixed(1)} MHz for this depth.`;
    case 'contact': return 'Probe face not in contact with the skin here.';
    case 'air': return 'Beam leaves the body.';
    default: return why;
  }
}

function snapshot(p) {
  return {type: p.type, f: p.f, depth: p.depth, angle: p.angle, point: p.point.clone(), normal: p.normal.clone(), rot: p.rot, tilt: p.tilt, rock: p.rock};
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Smooth 3D value noise in [0,1]; deterministic, used only to place bowel gas pockets.
function hash(x, y, z) {
  // Math.imul keeps the products in 32-bit integer range (plain * loses low bits above 2^53).
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let acc = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    acc += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return acc;
}

// Principal direction of a structure near a point (vessel axis for Doppler angle).
export function localAxis(part, point, radius = 0.015) {
  const a = part.geometry.attributes.position.array;
  const pts = [];
  for (let i = 0; i < a.length; i += 3) {
    const dx = a[i] - point.x, dy = a[i + 1] - point.y, dz = a[i + 2] - point.z;
    if (dx * dx + dy * dy + dz * dz < radius * radius) pts.push([a[i], a[i + 1], a[i + 2]]);
  }
  if (pts.length < 12) return null;
  const m = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) m[k] += p[k] / pts.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - m[i]) * (p[j] - m[j]);
  let v = [1, 0.3, 0.2];
  for (let it = 0; it < 40; it++) {
    const w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
    const n = Math.hypot(...w) || 1;
    v = w.map((x) => x / n);
  }
  return new THREE.Vector3(...v);
}
