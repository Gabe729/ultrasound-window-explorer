// Probe types, probe pose on the skin, and beam ray generation.
// Probe frame: +Z = beam axis (into the body), +X = lateral (the orientation-marker side),
// +Y = elevation (slice thickness direction).
import * as THREE from 'three';

export const PROBES = {
  linear: {
    label: 'Linear', long: 'Linear array', fRange: [4, 18], f0: 10, depth0: 4, width: 0.038,
    latAperture: 0.02, elevAperture: 0.005, elevFocus: 0.02,
    angle: {label: 'Steering angle', min: -20, max: 20, value: 0, unit: '°'},
    body: [0.052, 0.014, 0.095], use: 'Superficial structures: vessels, nerves, tendons, muscle, thyroid, pleura.',
  },
  curvilinear: {
    label: 'Curvilinear', long: 'Curvilinear (convex) array', fRange: [1.5, 7], f0: 3.5, depth0: 16, radius: 0.05,
    latAperture: 0.035, elevAperture: 0.012, elevFocus: 0.07,
    angle: {label: 'Field of view', min: 40, max: 80, value: 60, unit: '°'},
    body: [0.06, 0.02, 0.11], use: 'Deep abdominal and pelvic organs; wide field from a moderate footprint.',
  },
  phased: {
    label: 'Phased', long: 'Phased array (sector)', fRange: [1, 5], f0: 2.5, depth0: 16, width: 0.02,
    latAperture: 0.019, elevAperture: 0.013, elevFocus: 0.08,
    angle: {label: 'Sector angle', min: 30, max: 90, value: 90, unit: '°'},
    body: [0.026, 0.02, 0.1], use: 'Small footprint fits between ribs: cardiac and transcranial imaging.',
  },
};

export const C0 = 1540; // m/s, the speed scanners assume

export function resolution(probe, depthM) {
  const t = PROBES[probe.type];
  const lambda = C0 / (probe.f * 1e6); // m
  const axial = 1.25 * lambda; // ~2.5-cycle pulse, half the spatial pulse length
  const fnum = Math.max(1.5, depthM / t.latAperture);
  const lateral = 1.2 * lambda * fnum;
  const E = t.elevAperture, F = t.elevFocus;
  const slice = Math.hypot(E * (1 - depthM / F), (1.2 * lambda * depthM) / E);
  return {lambda, axial, lateral, slice};
}

export class Probe {
  constructor() {
    this.type = 'curvilinear';
    this.f = PROBES.curvilinear.f0;
    this.depth = PROBES.curvilinear.depth0 / 100;
    this.angle = PROBES.curvilinear.angle.value;
    this.point = new THREE.Vector3(0, 1.15, 0.12);
    this.normal = new THREE.Vector3(0, 0, 1);
    this.rot = 0; this.tilt = 0; this.rock = 0; // degrees
    this.volume = false; this.sweep = 30;
  }

  setType(type) {
    const t = PROBES[type];
    this.type = type;
    this.f = t.f0;
    this.depth = t.depth0 / 100;
    this.angle = t.angle.value;
  }

  baseFrame() {
    const Z = this.normal.clone().negate();
    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(ref.dot(Z)) > 0.9) ref = new THREE.Vector3(0, 0, 1);
    const X = ref.sub(Z.clone().multiplyScalar(ref.dot(Z))).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  }

  // World rotation of the probe frame.
  matrix() {
    const local = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(this.tilt), THREE.MathUtils.degToRad(this.rock), THREE.MathUtils.degToRad(this.rot), 'ZXY'));
    return this.baseFrame().multiply(local);
  }

  axes() {
    const m = this.matrix();
    const l = new THREE.Vector3(), e = new THREE.Vector3(), a = new THREE.Vector3();
    m.extractBasis(l, e, a);
    return {l, e, a};
  }

  // Set the pose from a desired beam axis and lateral direction; solve the slider angles.
  aim(axis, lateral) {
    const a = axis.clone().normalize();
    const l = lateral.clone().sub(a.clone().multiplyScalar(lateral.dot(a))).normalize();
    const e = new THREE.Vector3().crossVectors(a, l);
    const want = new THREE.Matrix4().makeBasis(l, e, a);
    const local = this.baseFrame().transpose().multiply(want);
    const eu = new THREE.Euler().setFromRotationMatrix(local, 'ZXY');
    this.tilt = THREE.MathUtils.radToDeg(eu.x);
    this.rock = THREE.MathUtils.radToDeg(eu.y);
    this.rot = THREE.MathUtils.radToDeg(eu.z);
  }

  // Angle between the beam axis and the skin normal (0 = perpendicular to the skin).
  skinAngle() {
    return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, -this.axes().a.dot(this.normal))));
  }

  // In-plane rays. u in [0,1] across the field. Returns origin on the transducer face,
  // direction, and the in-plane coordinates used to draw the 2D image.
  planeRays(n, frame = this.axes()) {
    const {l, a} = frame;
    const t = PROBES[this.type];
    const rays = [];
    const rad = THREE.MathUtils.degToRad;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      let o, d, x0 = 0, phi = 0;
      if (this.type === 'linear') {
        x0 = (u - 0.5) * t.width;
        phi = rad(this.angle);
        o = this.point.clone().addScaledVector(l, x0);
      } else if (this.type === 'curvilinear') {
        phi = (u - 0.5) * rad(this.angle);
        const c = this.point.clone().addScaledVector(a, -t.radius);
        o = c.addScaledVector(a.clone().multiplyScalar(Math.cos(phi)).addScaledVector(l, Math.sin(phi)), t.radius);
      } else {
        phi = (u - 0.5) * rad(this.angle);
        o = this.point.clone();
      }
      d = a.clone().multiplyScalar(Math.cos(phi)).addScaledVector(l, Math.sin(phi));
      rays.push({o, d, u, x0, phi});
    }
    return rays;
  }

  // Rays at the two elevational edges of the slice, converging on the elevation focus.
  sliceRays(n, frame = this.axes()) {
    const t = PROBES[this.type];
    const out = [];
    for (const r of this.planeRays(n, frame)) {
      const focus = r.o.clone().addScaledVector(r.d, t.elevFocus);
      for (const s of [-1, 1]) {
        const o = r.o.clone().addScaledVector(frame.e, (s * t.elevAperture) / 2);
        out.push({o, d: focus.sub(o).normalize(), u: r.u, elev: s});
        focus.copy(r.o).addScaledVector(r.d, t.elevFocus);
      }
    }
    return out;
  }

  // A fan of planes swept in elevation about the face (3D volume mode).
  sweepFrames(count) {
    const base = this.axes();
    const frames = [];
    for (let k = 0; k < count; k++) {
      const psi = THREE.MathUtils.degToRad((k / (count - 1) - 0.5) * this.sweep);
      const q = new THREE.Quaternion().setFromAxisAngle(base.l, psi);
      frames.push({l: base.l.clone(), e: base.e.clone().applyQuaternion(q), a: base.a.clone().applyQuaternion(q), psi});
    }
    return frames;
  }

  // Map an in-plane point (x lateral, z depth from the face centre, metres) to (u, depth along ray).
  planeToRay(x, z) {
    const t = PROBES[this.type];
    const rad = THREE.MathUtils.degToRad;
    if (this.type === 'linear') {
      const s = rad(this.angle);
      const depth = z / Math.cos(s);
      return {u: (x - z * Math.tan(s)) / t.width + 0.5, depth};
    }
    const R = this.type === 'curvilinear' ? t.radius : 0;
    const r = Math.hypot(x, z + R), phi = Math.atan2(x, z + R);
    return {u: phi / rad(this.angle) + 0.5, depth: r - R};
  }

  // In-plane extent for drawing: lateral half-width at the deepest point.
  planeExtent() {
    const t = PROBES[this.type];
    const rad = THREE.MathUtils.degToRad;
    const D = this.depth;
    if (this.type === 'linear') {
      const s = rad(this.angle);
      const xs = [-t.width / 2, t.width / 2, -t.width / 2 + D * Math.sin(s), t.width / 2 + D * Math.sin(s)];
      return {xMin: Math.min(...xs), xMax: Math.max(...xs), zMax: D * Math.cos(s)};
    }
    const R = this.type === 'curvilinear' ? t.radius : 0;
    const h = rad(this.angle) / 2;
    const w = (R + D) * Math.sin(h);
    return {xMin: -w, xMax: w, zMax: D};
  }
}
