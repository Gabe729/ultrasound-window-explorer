// 3D probe model, scan plane, slice envelope and depth ticks.
import * as THREE from 'three';
import {PROBES} from './probe.js';

const CYAN = new THREE.Color('#5ee7ff');

export class BeamView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.probeGroup = new THREE.Group();
    scene.add(this.probeGroup);
    this.texture = null;
    this.fan = null;
    this.extras = new THREE.Group();
    this.group.add(this.extras);
    this.spriteCache = new Map();
    this.probeType = null;
  }

  buildProbe(type) {
    this.probeGroup.clear();
    const t = PROBES[type];
    const [w, h, len] = t.body;
    const shell = new THREE.MeshStandardMaterial({color: '#2b3340', roughness: 0.35, metalness: 0.4});
    const accent = new THREE.MeshStandardMaterial({color: '#11161d', roughness: 0.6});
    const face = new THREE.MeshStandardMaterial({color: '#cfd8e3', roughness: 0.3, emissive: '#2a5560', emissiveIntensity: 0.6});
    const head = new THREE.Mesh(new THREE.BoxGeometry(w, h, len * 0.35), shell);
    head.position.z = -len * 0.175 - 0.003;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, h) * 0.42, Math.min(w, h) * 0.38, len * 0.5, 24), accent);
    neck.rotation.x = Math.PI / 2;
    neck.position.z = -len * 0.6;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 12), accent);
    cable.rotation.x = Math.PI / 2;
    cable.position.z = -len * 0.85 - 0.04;
    let lens;
    if (type === 'curvilinear') {
      lens = new THREE.Mesh(arcFace(t.radius, w, h * 0.9), face);
    } else {
      lens = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.9, 0.003), face);
      lens.position.z = -0.0015;
    }
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 16, 12), new THREE.MeshBasicMaterial({color: CYAN}));
    marker.position.set(w / 2 + 0.002, 0, -len * 0.1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(w, h) * 0.75, 0.0009, 8, 64), new THREE.MeshBasicMaterial({color: CYAN, transparent: true, opacity: 0.5}));
    ring.scale.set(1, h / w + 0.4, 1);
    this.probeGroup.add(head, neck, cable, lens, marker, ring);
    this.probeGroup.traverse((o) => { o.userData.isProbe = true; o.renderOrder = 20; });
    this.probeType = type;
  }

  updateProbe(probe) {
    if (this.probeType !== probe.type) this.buildProbe(probe.type);
    const {l, e, a} = probe.axes();
    const m = new THREE.Matrix4().makeBasis(l, e, a);
    this.probeGroup.quaternion.setFromRotationMatrix(m);
    this.probeGroup.position.copy(probe.point);
  }

  // Rebuild the fan geometry from the traced in-plane rays.
  updateFan(result, probe, canvas, settings) {
    const rays = result.plane;
    const N = rays.length, M = 64;
    const D = probe.depth;
    if (!this.fan || this.fan.userData.N !== N) {
      if (this.fan) { this.group.remove(this.fan); this.fan.geometry.dispose(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * M * 3), 3));
      const uv = new Float32Array(N * M * 2);
      for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) { uv[(i * M + k) * 2] = i / (N - 1); uv[(i * M + k) * 2 + 1] = 1 - k / (M - 1); }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const idx = [];
      for (let i = 0; i < N - 1; i++) for (let k = 0; k < M - 1; k++) {
        const a = i * M + k, b = (i + 1) * M + k;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      g.setIndex(idx);
      this.texture?.dispose();
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      // Drawn as an overlay (no depth test) so the plane stays visible inside opaque organs.
      const mat = new THREE.MeshBasicMaterial({map: this.texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false});
      this.fan = new THREE.Mesh(g, mat);
      this.fan.renderOrder = 30;
      this.fan.frustumCulled = false;
      this.fan.userData.N = N;
      this.group.add(this.fan);
    }
    const pos = this.fan.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const r = rays[i];
      for (let k = 0; k < M; k++) {
        const z = (k / (M - 1)) * D;
        const o = (i * M + k) * 3;
        pos[o] = r.o.x + r.d.x * z; pos[o + 1] = r.o.y + r.d.y * z; pos[o + 2] = r.o.z + r.d.z * z;
      }
    }
    this.fan.geometry.attributes.position.needsUpdate = true;
    this.fan.geometry.computeBoundingSphere();
    this.texture.needsUpdate = true;
    this.fan.material.blending = THREE.NormalBlending;
    this.fan.material.opacity = settings.planeMode === 'anatomy' ? 0.85 : 0.93;
    this.fan.material.needsUpdate = true;
    this.fan.visible = settings.showPlane;
    this.updateExtras(result, probe, settings);
  }

  updateExtras(result, probe, settings) {
    this.extras.clear();
    const rays = result.plane;
    const D = probe.depth;
    const N = rays.length;
    const line = (pts, color, opacity) => {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineBasicMaterial({color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false});
      const l = new THREE.Line(g, m);
      l.renderOrder = 31; l.frustumCulled = false;
      this.extras.add(l);
      return l;
    };
    const at = (r, z) => r.o.clone().addScaledVector(r.d, z);
    // Fan outline.
    const outline = [at(rays[0], 0), at(rays[0], D)];
    for (let i = 0; i < N; i += 4) outline.push(at(rays[i], D));
    outline.push(at(rays[N - 1], D), at(rays[N - 1], 0));
    for (let i = N - 1; i >= 0; i -= 4) outline.push(at(rays[i], 0));
    outline.push(at(rays[0], 0));
    line(outline, CYAN, 0.9);
    // Depth ticks every centimetre on both edges, longer every 5 cm, with labels.
    const {e} = result.frame;
    const ticks = [];
    for (let cm = 1; cm <= Math.floor(D * 100 + 1e-6); cm++) {
      const z = cm / 100, big = cm % 5 === 0 || D <= 0.06;
      for (const r of [rays[0], rays[N - 1]]) {
        const p = at(r, z);
        const side = r === rays[0] ? -1 : 1;
        const lat = r.d.clone().cross(e).normalize().multiplyScalar(side * (big ? 0.008 : 0.004));
        const sgn = lat.dot(at(rays[N - 1], z).sub(at(rays[0], z))) > 0 ? -1 : 1;
        ticks.push(p, p.clone().addScaledVector(lat, sgn));
        if (big && r === rays[N - 1]) {
          const s = this.label(`${cm} cm`);
          s.position.copy(p.clone().addScaledVector(lat, sgn * 2.6));
          this.extras.add(s);
        }
      }
    }
    if (ticks.length) {
      const g = new THREE.BufferGeometry().setFromPoints(ticks);
      const seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color: CYAN, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, toneMapped: false}));
      seg.renderOrder = 31; seg.frustumCulled = false;
      this.extras.add(seg);
    }
    // Where each ray stops carrying signal: faint red ticks.
    if (settings.showStops) {
      const stops = [];
      for (const r of rays) if (r.contact && r.deadAt !== undefined && r.deadAt < D && r.deadReason !== 'air') stops.push(at(r, r.deadAt));
      if (stops.length) {
        const g = new THREE.BufferGeometry().setFromPoints(stops);
        const pts = new THREE.Points(g, new THREE.PointsMaterial({color: '#ff6b6b', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false}));
        pts.renderOrder = 32; pts.frustumCulled = false;
        this.extras.add(pts);
      }
    }
    // Slice thickness envelope (elevational focus) and volume sweep.
    if (result.slice.length && settings.showSlice) {
      for (const s of [-1, 1]) {
        const rs = result.slice.filter((r, k) => (k % 2 === 0 ? -1 : 1) === s);
        const pts = [];
        rs.forEach((r) => pts.push(at(r, 0), at(r, D)));
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const idx = [];
        for (let i = 0; i < rs.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
        g.setIndex(idx);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: CYAN, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending}));
        m.renderOrder = 29; m.frustumCulled = false;
        this.extras.add(m);
      }
    }
    if (result.volume.length) {
      const byPsi = new Map();
      for (const r of result.volume) { if (!byPsi.has(r.psi)) byPsi.set(r.psi, []); byPsi.get(r.psi).push(r); }
      for (const rs of byPsi.values()) {
        const pts = [at(rs[0], 0), at(rs[0], D)];
        rs.forEach((r) => pts.push(at(r, D)));
        pts.push(at(rs[rs.length - 1], 0));
        line(pts, CYAN, 0.55);
      }
    }
    this.extras.visible = settings.showPlane;
  }

  label(text) {
    if (!this.spriteCache.has(text)) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 40;
      const g = c.getContext('2d');
      g.font = '600 24px Inter, system-ui, sans-serif';
      g.fillStyle = '#9ff1ff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 64, 20);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.spriteCache.set(text, t);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: this.spriteCache.get(text), depthTest: false, transparent: true, sizeAttenuation: false}));
    s.scale.set(0.045, 0.014, 1);
    s.renderOrder = 40;
    return s;
  }
}

// Convex face of a curvilinear probe: an arc in the X-Z plane bulging towards +Z.
function arcFace(R, w, h) {
  const half = Math.asin(w / 2 / R);
  const segs = 32;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const phi = -half + (2 * half * i) / segs;
    const x = R * Math.sin(phi), z = R * Math.cos(phi) - R;
    pos.push(x, -h / 2, z, x, h / 2, z);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
