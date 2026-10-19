// Cross-section of the imaging plane, drawn from the traced rays.
// "Pseudo B-mode": brightness = tissue echogenicity (educational) minus the computed
// round-trip loss, with time-gain compensation that assumes 0.6 dB/cm/MHz everywhere.
// So shadows behind bone, enhancement behind fluid, reverberation behind gas and the
// fade-out at depth all come from the computed losses; speckle texture is cosmetic.
import * as THREE from 'three';
import {TISSUES} from './tissues.js';
import {TISSUE_KEYS, OUTSIDE, GAS_CODE, BUDGET, valueNoise} from './physics.js';
import {PROBES, resolution} from './probe.js';
import {systemById} from './atlas.js';

const TGC_ALPHA = 0.6; // dB/cm/MHz assumed by the display gain

export class ImageView {
  constructor() {
    this.rayCanvas = document.createElement('canvas');
    this.rayCanvas.width = 128; this.rayCanvas.height = 260;
  }

  // Ray-space image: columns = rays, rows = depth samples. Used for the 3D plane texture
  // and as the lookup table for the sector display.
  computeRaySpace(result, probe, mode, atlas) {
    const rays = result.plane;
    const N = rays.length, S = rays[0].samples;
    const rgba = new Uint8ClampedArray(N * S * 4);
    const base = new Float32Array(N * S); // B-mode brightness before speckle
    const f = probe.f;
    const res = resolution(probe, probe.depth / 2);
    const latCells = Math.max(1, (res.lateral / fieldWidth(probe)) * N);
    const axCells = Math.max(0.6, res.axial / rays[0].dz);
    const keyColors = TISSUE_KEYS.map((k) => new THREE.Color(TISSUES[k].color));
    const gasColor = new THREE.Color('#d9e7ef');
    for (let i = 0; i < N; i++) {
      const r = rays[i];
      const echoes = r.echoes;
      let gasZ = r.gasZ;
      for (let j = 0; j < S; j++) {
        const z = j * r.dz, o = (j * N + i) * 4;
        const c = r.cls[j];
        if (!r.contact || c === OUTSIDE) { rgba[o + 3] = 255; continue; }
        const m = r.margin[j];
        const tgc = 2 * TGC_ALPHA * f * z * 100;
        if (mode === 'anatomy') {
          const pi = r.part[j];
          let col = c === GAS_CODE ? gasColor : keyColors[c];
          if (pi >= 0 && atlas.parts[pi].system && c !== GAS_CODE) col = new THREE.Color(systemById[atlas.parts[pi].system]?.color ?? '#888').lerp(keyColors[c], 0.45);
          const visible = m > -5 && c !== GAS_CODE;
          const k = visible ? 1 : ((i + j) % 6 < 2 ? 0.45 : 0.22);
          rgba[o] = col.r * 255 * k; rgba[o + 1] = col.g * 255 * k; rgba[o + 2] = col.b * 255 * k; rgba[o + 3] = 255;
          continue;
        }
        let b;
        if (c === GAS_CODE || (gasZ !== undefined && z > gasZ)) {
          // Reverberation below a gas surface: A-lines at multiples of the gas depth.
          const zg = Math.max(0.004, gasZ ?? z);
          const n = z / zg;
          const near = Math.abs(n - Math.round(n)) * zg;
          const line = Math.round(n) >= 2 && near < 0.0012 ? 0.55 * Math.exp(-0.45 * (Math.round(n) - 1)) : 0;
          b = 0.04 + line;
        } else {
          const echo = TISSUES[TISSUE_KEYS[c]].echo;
          const shown = echo - (BUDGET - m) + tgc;
          b = m + echo > -12 ? clamp01((shown + 30) / 58) : 0.02;
        }
        base[j * N + i] = b;
      }
      // Specular interface echoes (pleura, bone surfaces, organ capsules).
      for (const e of echoes) {
        const j = Math.round(e.z / r.dz);
        if (j < 0 || j >= S) continue;
        const shown = e.dB + 30 - (BUDGET - e.margin) + 2 * TGC_ALPHA * f * e.z * 100;
        if (e.margin + e.dB + 40 < 0) continue;
        const v = clamp01((shown + 40) / 45);
        for (let dj = 0; dj < (e.gas || e.bone ? 2 : 1) && j + dj < S; dj++) {
          const q = (j + dj) * N + i;
          if (mode === 'anatomy') for (let k = 0; k < 3; k++) rgba[q * 4 + k] = Math.max(rgba[q * 4 + k], 230 * v);
          else base[q] = Math.max(base[q], v * 1.1);
        }
      }
    }
    if (mode !== 'anatomy') for (let q = 0; q < N * S; q++) {
      const v = 255 * clamp01(base[q] * speckle((q % N) / latCells, Math.floor(q / N) / axCells));
      rgba[q * 4] = rgba[q * 4 + 1] = rgba[q * 4 + 2] = v; rgba[q * 4 + 3] = 255;
    }
    this.raySpace = {rgba, base, N, S, rays, mode};
    const cv = this.rayCanvas;
    if (cv.width !== N || cv.height !== S) { cv.width = N; cv.height = S; }
    const g = cv.getContext('2d');
    const img = new ImageData(rgba.slice(), N, S);
    // Tint for the 3D plane in B-mode.
    if (mode !== 'anatomy') for (let p = 0; p < img.data.length; p += 4) {
      const v = img.data[p];
      img.data[p] = v * 0.62; img.data[p + 1] = v * 0.95; img.data[p + 2] = Math.min(255, v * 1.05 + 10);
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // Sector display in true geometry.
  draw(canvas, result, probe, stats, atlas, opts) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    // Round so fractional pixel ratios (1.25, 1.5) still give an integer row stride below.
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const IW = canvas.width, IH = canvas.height;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
    const {rgba, N, S, rays} = this.raySpace;
    const ext = probe.planeExtent();
    const zTop = probe.type === 'curvilinear' ? -PROBES.curvilinear.radius * (1 - Math.cos(probe.angle * Math.PI / 360)) : 0;
    const padL = 34, padR = 14, padT = 18, padB = 10;
    const scale = Math.min((W - padL - padR) / (ext.xMax - ext.xMin), (H - padT - padB) / (ext.zMax - zTop));
    // Screen x runs opposite to the probe's lateral +X axis, so the orientation-marker side
    // (+X) appears on the left of the image, as on most scanners.
    const cx = padL + (W - padL - padR) / 2 + ((ext.xMin + ext.xMax) / 2) * scale;
    const cy = padT - zTop * scale;
    this.map = {scale, cx, cy};
    const img = g.createImageData(IW, IH);
    const D = probe.depth, dz = rays[0].dz;
    const bmode = this.raySpace.mode !== 'anatomy';
    const base = this.raySpace.base;
    const data = img.data;
    for (let y = 0; y < IH; y++) {
      const pz = ((y / dpr) - cy) / scale;
      // Speckle grain follows the resolution cell at this depth (cosmetic texture).
      const rc = resolution(probe, Math.max(0.002, pz));
      const latMM = Math.max(0.15, rc.lateral * 1000), axMM = Math.max(0.12, rc.axial * 1000 * 1.6);
      for (let x = 0; x < IW; x++) {
        const o = (y * IW + x) * 4;
        data[o] = 5; data[o + 1] = 8; data[o + 2] = 12; data[o + 3] = 255;
        const px = (cx - x / dpr) / scale;
        const {u, depth} = probe.planeToRay(px, pz);
        if (u < 0 || u > 1 || depth < 0 || depth > D) continue;
        const fi = u * (N - 1), fj = Math.min(S - 1.001, depth / dz);
        if (bmode) {
          const i0 = Math.floor(fi), i1 = Math.min(N - 1, i0 + 1), wi = fi - i0;
          const j0 = Math.floor(fj), j1 = Math.min(S - 1, j0 + 1), wj = fj - j0;
          const b = (base[j0 * N + i0] * (1 - wi) + base[j0 * N + i1] * wi) * (1 - wj) + (base[j1 * N + i0] * (1 - wi) + base[j1 * N + i1] * wi) * wj;
          const v = 255 * clamp01(b * speckle(px * 1000 / latMM, pz * 1000 / axMM) + 0.025 * valueNoise(px * 3000, pz * 3000, 9));
          data[o] = v * 0.97; data[o + 1] = v; data[o + 2] = Math.min(255, v * 1.02 + 2);
        } else {
          const s = (Math.floor(fj) * N + Math.round(fi)) * 4;
          data[o] = rgba[s]; data[o + 1] = rgba[s + 1]; data[o + 2] = rgba[s + 2];
        }
      }
    }
    g.putImageData(img, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Depth scale.
    g.strokeStyle = 'rgba(94,231,255,0.55)'; g.fillStyle = 'rgba(159,241,255,0.85)';
    g.font = '10px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    const step = D > 0.12 ? 2 : 1;
    for (let cm = 0; cm <= D * 100 + 1e-6; cm++) {
      const y = cy + (cm / 100) * scale;
      const big = cm % (step * (D > 0.12 ? 2.5 : 5)) === 0 || cm % 5 === 0;
      g.beginPath(); g.moveTo(padL - 4, y); g.lineTo(padL - (big ? 12 : 8), y); g.stroke();
      if (cm % step === 0 && (cm % 5 === 0 || D <= 0.12)) g.fillText(`${cm}`, padL - 14, y);
    }
    g.textAlign = 'left';
    g.fillText('cm', 4, padT - 9);
    // Orientation marker: lateral +X (marker side) on the left of the image.
    g.fillStyle = '#5ee7ff';
    g.beginPath(); g.arc(cx - ext.xMax * scale - 2, padT - 8, 3.5, 0, Math.PI * 2); g.fill();
    // Labels for the most accessible structures.
    if (opts.labels && stats) {
      const placed = [];
      for (const s of stats.list.slice(0, 40)) {
        if (s.category.id === 'beyond' || s.nPlane === 0) continue;
        const c = centroidInPlane(this.raySpace, s.part.index, probe);
        if (!c) continue;
        const X = cx - c.x * scale, Y = cy + c.z * scale;
        if (placed.some((p) => Math.abs(p.Y - Y) < 13 && Math.abs(p.X - X) < 110)) continue;
        placed.push({X, Y});
        g.fillStyle = s.category.color;
        g.beginPath(); g.arc(X, Y, 2.5, 0, Math.PI * 2); g.fill();
        g.font = '600 10.5px Inter, system-ui, sans-serif';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.75)';
        const name = shortName(s.part.name);
        g.strokeText(name, X + 6, Y); g.fillStyle = '#f2f6fa'; g.fillText(name, X + 6, Y);
        if (placed.length >= 9) break;
      }
    }
  }

  // Inverse lookup for hovering on the sector display.
  sampleAt(probe, x, y) {
    if (!this.map || !this.raySpace) return null;
    const {scale, cx, cy} = this.map;
    const px = (cx - x) / scale, pz = (y - cy) / scale;
    const {u, depth} = probe.planeToRay(px, pz);
    if (u < 0 || u > 1 || depth < 0 || depth > probe.depth) return null;
    const {N, rays} = this.raySpace;
    const i = Math.round(u * (N - 1)), r = rays[i];
    const j = Math.min(r.samples - 1, Math.floor(depth / r.dz));
    return {ray: r, depth, part: r.part[j], cls: r.cls[j], margin: r.margin[j]};
  }
}

function fieldWidth(probe) {
  const t = PROBES[probe.type];
  const zMid = probe.depth / 2;
  if (probe.type === 'linear') return t.width;
  return (probe.type === 'curvilinear' ? t.radius + zMid : zMid) * THREE.MathUtils.degToRad(probe.angle);
}

function centroidInPlane(rs, partIndex, probe) {
  let sx = 0, sz = 0, n = 0;
  const {N, rays} = rs;
  for (let i = 0; i < N; i += 2) {
    const r = rays[i];
    for (let j = 0; j < r.samples; j += 2) {
      if (r.part[j] !== partIndex) continue;
      const p = rayPlanePoint(probe, r, j * r.dz);
      sx += p.x; sz += p.z; n++;
    }
  }
  return n ? {x: sx / n, z: sz / n} : null;
}

export function rayPlanePoint(probe, r, depth) {
  const t = PROBES[probe.type];
  if (probe.type === 'linear') return {x: r.x0 + depth * Math.sin(r.phi), z: depth * Math.cos(r.phi)};
  const R = probe.type === 'curvilinear' ? t.radius : 0;
  return {x: (R + depth) * Math.sin(r.phi), z: (R + depth) * Math.cos(r.phi) - R};
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
function speckle(x, y) {
  // Rayleigh-like multiplicative texture from two octaves of value noise.
  const v = 0.6 * valueNoise(x, y, 1) + 0.4 * valueNoise(x * 2.1 + 17, y * 2.3, 2);
  return 0.45 + 1.15 * v * v;
}
export function shortName(n) {
  return n.replace(/^(Left|Right) /, (m) => m[0] + '. ').replace(/ \((derived|schematic)\)/, '*');
}
