// Loads the Human Atlas packaging of BodyParts3D 4.0 (identifiers unchanged; meshes simplified
// with a 0.2% relative error bound and normals quantised by that packaging),
// assigns tissue classes, builds render batches and per-structure ray-tracing indices,
// and adds the derived structures BodyParts3D does not model (lung parenchyma, thyroid).
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MarchingCubes} from 'three/addons/objects/MarchingCubes.js';
import {MeshBVH} from 'three-mesh-bvh';
import {classify, displaySystem, TISSUES} from './tissues.js';

export const SYSTEMS = [
  {id: 'integumentary', name: 'Skin surface', color: '#c8a68c', opacity: 0.1, fresnel: true, order: 9},
  {id: 'muscular', name: 'Muscles', color: '#b0625a', opacity: 0.09, fresnel: true, order: 8},
  {id: 'skeletal', name: 'Skeleton', color: '#e9dfc4', opacity: 0.85, order: 2},
  {id: 'connective', name: 'Tendons & ligaments', color: '#cfd8cf', opacity: 0.6, order: 3},
  {id: 'cardiac', name: 'Heart', color: '#cf6a62', opacity: 0.85, order: 1},
  {id: 'arterial', name: 'Arteries', color: '#d8574a', opacity: 0.9, order: 1},
  {id: 'venous', name: 'Veins', color: '#5f8fbf', opacity: 0.9, order: 1},
  {id: 'respiratory', name: 'Airways', color: '#c9a2aa', opacity: 0.7, order: 4},
  {id: 'digestive', name: 'Digestive organs', color: '#c49a6c', opacity: 0.85, order: 1},
  {id: 'urinary', name: 'Urinary', color: '#c98a6d', opacity: 0.9, order: 1},
  {id: 'reproductive', name: 'Reproductive', color: '#c7a39a', opacity: 0.9, order: 1},
  {id: 'lymphatic', name: 'Spleen & thymus', color: '#9a6aa0', opacity: 0.9, order: 1},
  {id: 'endocrine', name: 'Endocrine', color: '#d7a5a0', opacity: 0.9, order: 1},
  {id: 'nervous', name: 'Nervous system', color: '#e2c27a', opacity: 0.75, order: 2},
  {id: 'sensory', name: 'Sensory organs', color: '#a9cbd2', opacity: 0.8, order: 2},
  {id: 'derived', name: 'Derived (lungs, thyroid)', color: '#e3a6b4', opacity: 0.22, fresnel: true, order: 7},
];
export const systemById = Object.fromEntries(SYSTEMS.map((s) => [s.id, s]));

export class Atlas {
  constructor(scene, onProgress) {
    this.scene = scene;
    this.onProgress = onProgress;
    this.parts = [];
    this.meshes = [];
    this.materials = new Map();
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  async load(base = 'models/') {
    const [atlas, meta] = await Promise.all([
      fetch(base + 'atlas.json').then((r) => r.json()),
      fetch(base + 'us-meta.json').then((r) => r.json()),
    ]);
    this.meta = meta;
    this.source = atlas;
    const extra = 3; // derived structures appended after the BodyParts3D parts
    this.stateWidth = THREE.MathUtils.ceilPowerOfTwo(atlas.parts.length + extra);
    this.stateData = new Float32Array(this.stateWidth * 4);
    this.colorData = new Uint8Array(this.stateWidth * 4);
    this.stateTex = new THREE.DataTexture(this.stateData, this.stateWidth, 1, THREE.RGBAFormat, THREE.FloatType);
    this.colorTex = new THREE.DataTexture(this.colorData, this.stateWidth, 1, THREE.RGBAFormat);
    for (const s of SYSTEMS) this.materials.set(s.id, this.makeMaterial(s));

    atlas.parts.forEach((p, i) => {
      const part = {
        index: i, id: p.id, name: p.name, conceptId: p.conceptId, sourceSystem: p.system,
        system: displaySystem(p), chunk: p.chunk, raw: p, derived: false,
        box: new THREE.Box3(new THREE.Vector3(...p.bounds[0]), new THREE.Vector3(...p.bounds[1])),
      };
      part.tissue = classify(part);
      part.center = part.box.getCenter(new THREE.Vector3());
      this.parts.push(part);
    });
    for (let i = 0; i < this.stateWidth; i++) this.setState(i, {visible: 1, mix: 0, alpha: 1});

    let loaded = 0;
    const queue = atlas.chunks.map((c, i) => i);
    const worker = async () => {
      while (queue.length) {
        const ci = queue.shift();
        await this.loadChunk(atlas, ci, base);
        loaded++;
        this.onProgress?.(loaded / atlas.chunks.length, `Loading anatomy ${loaded}/${atlas.chunks.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    this.skin = this.parts.find((p) => p.name === 'Skin');
    this.buildDerived();
    this.packBoxes();
    this.stateTex.needsUpdate = this.colorTex.needsUpdate = true;
  }

  async loadChunk(atlas, ci, base) {
    const chunk = atlas.chunks[ci];
    const file = (chunk.gzip ?? chunk.url).split('/').pop();
    let res = await fetch(base + file);
    let buf;
    if (res.ok) {
      buf = await res.arrayBuffer();
    } else {
      // Hosts that serve only text types can provide base64 text copies (<file>.b64.txt).
      res = await fetch(base + file + '.b64.txt');
      if (!res.ok) throw new Error(`Could not load ${file}`);
      const bin = atob((await res.text()).trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      buf = bytes.buffer;
    }
    const sig = new Uint8Array(buf, 0, 2);
    // Static servers may or may not decode .gz; inspect the payload as Human Atlas does.
    if (sig[0] === 0x1f && sig[1] === 0x8b) {
      buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    if (buf.byteLength !== chunk.bytes) throw new Error(`Incomplete anatomy file ${file}`);
    const groups = new Map();
    for (const part of this.parts) {
      if (part.chunk !== ci) continue;
      const p = part.raw;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(buf, p.positions, p.vertexCount * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(buf, p.normals, p.vertexCount * 3), 3, true));
      // Copy the index: MeshBVH reorders indices in place and the render batch keeps its own copy.
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(new Uint32Array(buf, p.indices, p.indexCount)), 1));
      g.boundingBox = part.box.clone();
      part.geometry = g;
      part.volume = meshVolume(pos, g.index.array);
      if (part.tissue === 'none') continue;
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', g.attributes.position);
      rg.setAttribute('normal', g.attributes.normal);
      rg.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, p.indices, p.indexCount), 1));
      rg.setAttribute('partIndex', new THREE.BufferAttribute(new Float32Array(p.vertexCount).fill(part.index), 1));
      const list = groups.get(part.system) ?? [];
      list.push(rg);
      groups.set(part.system, list);
    }
    for (const [system, list] of groups) this.addBatch(system, mergeGeometries(list, false));
  }

  addBatch(system, geometry) {
    const mesh = new THREE.Mesh(geometry, this.materials.get(system));
    mesh.frustumCulled = false;
    mesh.renderOrder = systemById[system].order;
    mesh.userData.system = system;
    this.root.add(mesh);
    this.meshes.push(mesh);
  }

  makeMaterial(sys) {
    const m = new THREE.MeshStandardMaterial({
      color: sys.color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
      transparent: true, opacity: sys.opacity, depthWrite: sys.opacity > 0.5,
    });
    m.userData.baseOpacity = sys.opacity;
    m.userData.fresnel = !!sys.fresnel;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.partState = {value: this.stateTex};
      shader.uniforms.partColor = {value: this.colorTex};
      shader.uniforms.stateWidth = {value: this.stateWidth};
      shader.vertexShader = 'attribute float partIndex;\nuniform sampler2D partState;\nuniform sampler2D partColor;\nuniform float stateWidth;\nvarying vec4 vState;\nvarying vec3 vHl;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 suv = vec2((partIndex + 0.5) / stateWidth, 0.5);
          vState = texture2D(partState, suv); vHl = texture2D(partColor, suv).rgb;`);
      shader.fragmentShader = 'varying vec4 vState;\nvarying vec3 vHl;\n' + shader.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vState.x < 0.5) discard;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vHl, vState.y * 0.85);
          diffuseColor.a = mix(diffuseColor.a * vState.z, max(diffuseColor.a, 0.62), vState.y);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vHl * vState.y * 0.45;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          ${sys.fresnel ? `float fr = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
          gl_FragColor.a = mix(gl_FragColor.a * mix(0.25, 1.6, pow(fr, 1.6)), gl_FragColor.a, vState.y);` : ''}`);
    };
    m.customProgramCacheKey = () => 'us-' + sys.id;
    return m;
  }

  setState(i, {visible, mix, alpha, color}) {
    const o = i * 4;
    if (visible !== undefined) this.stateData[o] = visible;
    if (mix !== undefined) this.stateData[o + 1] = mix;
    if (alpha !== undefined) this.stateData[o + 2] = alpha;
    if (color) {
      this.colorData[o] = color.r * 255; this.colorData[o + 1] = color.g * 255; this.colorData[o + 2] = color.b * 255;
    }
  }
  commitState() { this.stateTex.needsUpdate = this.colorTex.needsUpdate = true; }

  // ---------- derived structures ----------

  buildDerived() {
    const byId = new Map(this.parts.map((p) => [p.id, p]));
    const lungMat = this.materials.get('derived');
    const lungSpec = [
      ['DERIVED-LUNG-R', 'Right lung (derived)', this.meta.lungRight],
      ['DERIVED-LUNG-L', 'Left lung (derived)', this.meta.lungLeft],
    ];
    for (const [id, name, members] of lungSpec) {
      const pts = [];
      for (const fj of members) {
        const p = byId.get(fj);
        const a = p.geometry.attributes.position.array;
        for (let k = 0; k < a.length; k += 6) pts.push(a[k], a[k + 1], a[k + 2]);
      }
      const geometry = implicitSurface(pts, 0.014, lungMat);
      this.addDerived({id, name, tissue: 'lung', geometry, members,
        note: 'Not a BodyParts3D mesh. BodyParts3D 4.0 has no lung parenchyma; this volume is reconstructed from the BodyParts3D bronchial and pulmonary-vessel trees of this lung, dilated by about 14 mm and smoothed. The pleural surface is approximate (likely ±1–2 cm).'});
    }
    // Thyroid: schematic lobes placed on the trachea just below the cricoid cartilage.
    const cricoid = this.parts.find((p) => p.name === 'Cricoid cartilage');
    const trachea = this.parts.find((p) => p.name === 'Trachea');
    const yTop = cricoid.box.min.y;
    const ta = trachea.geometry.attributes.position.array;
    let zFront = -Infinity, xMin = Infinity, xMax = -Infinity;
    for (let k = 0; k < ta.length; k += 3) {
      if (Math.abs(ta[k + 1] - (yTop - 0.022)) < 0.006) {
        zFront = Math.max(zFront, ta[k + 2]); xMin = Math.min(xMin, ta[k]); xMax = Math.max(xMax, ta[k]);
      }
    }
    const xc = (xMin + xMax) / 2, half = (xMax - xMin) / 2;
    const pieces = [];
    for (const s of [-1, 1]) pieces.push(ellipsoid([xc + s * (half + 0.004), yTop - 0.022, zFront - 0.008], [0.0085, 0.022, 0.0095]));
    pieces.push(ellipsoid([xc, yTop - 0.027, zFront + 0.0035], [half + 0.002, 0.006, 0.0028]));
    this.addDerived({id: 'DERIVED-THYROID', name: 'Thyroid gland (schematic)', tissue: 'gland', geometry: mergeGeometries(pieces, false),
      note: 'Not a BodyParts3D mesh. BodyParts3D 4.0 has no thyroid gland; two lobes and an isthmus of typical adult size are placed beside the trachea just below the cricoid cartilage. Position and size are schematic.'});
  }

  addDerived({id, name, tissue, geometry, note, members}) {
    const index = this.parts.length;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone();
    const part = {index, id, name, conceptId: '', sourceSystem: 'derived', system: 'derived', derived: true, note, members,
      tissue, box, center: box.getCenter(new THREE.Vector3()), geometry,
      volume: meshVolume(geometry.attributes.position.array, geometry.index?.array)};
    this.parts.push(part);
    const rg = geometry.clone();
    rg.setAttribute('partIndex', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(index), 1));
    this.addBatch('derived', rg);
  }

  // ---------- ray tracing support ----------

  packBoxes() {
    const n = this.parts.length;
    this.boxes = new Float32Array(n * 6);
    this.parts.forEach((p, i) => {
      this.boxes.set([p.box.min.x, p.box.min.y, p.box.min.z, p.box.max.x, p.box.max.y, p.box.max.z], i * 6);
      // Tissue precedence where meshes overlap: the smaller enclosed volume wins
      // (vessels inside organs, cavities inside walls). Derived lungs always yield.
      p.priority = p.derived && p.tissue === 'lung' ? 1e9 : Math.max(p.volume, 1e-9);
    });
  }

  bvh(part) {
    if (!part.bvhTree) part.bvhTree = new MeshBVH(part.geometry, {maxLeafTris: 8});
    return part.bvhTree;
  }

  // Build every index in idle slices so the first probe update is not slow.
  async warmIndices(onProgress) {
    const todo = this.parts.filter((p) => p.tissue !== 'none');
    for (let i = 0; i < todo.length; i++) {
      this.bvh(todo[i]);
      if (i % 60 === 0) {
        onProgress?.(i / todo.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress?.(1);
  }

  // Nearest visible structure under a ray (for clicking).
  pick(ray, isVisible) {
    let best = null;
    const tmp = new THREE.Vector3();
    for (const p of this.parts) {
      if (p.tissue === 'none' || !isVisible(p)) continue;
      if (!ray.intersectBox(p.box, tmp)) continue;
      const hit = this.bvh(p).raycastFirst(ray, THREE.DoubleSide);
      if (hit && (!best || hit.distance < best.distance)) best = {part: p, distance: hit.distance, point: hit.point};
    }
    return best;
  }

  surfaceHit(ray) {
    const hits = this.bvh(this.skin).raycast(ray, THREE.DoubleSide);
    if (!hits.length) return null;
    hits.sort((a, b) => a.distance - b.distance);
    const h = hits[0];
    const n = h.face.normal.clone();
    if (n.dot(ray.direction) > 0) n.negate();
    return {point: h.point.clone(), normal: n};
  }
}

function meshVolume(pos, idx) {
  let v = 0;
  const n = idx ? idx.length : pos.length / 3;
  for (let i = 0; i < n; i += 3) {
    const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, c = (idx ? idx[i + 2] : i + 2) * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
       - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
       + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return Math.abs(v / 6);
}

function ellipsoid(center, radii) {
  const g = new THREE.SphereGeometry(1, 28, 20);
  g.scale(...radii);
  g.translate(...center);
  return g;
}

// Smooth closed surface around a point cloud: splat a distance kernel on a grid,
// blur, then extract an isosurface with marching cubes.
function implicitSurface(pts, radius, material) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pts[i + k]); max[k] = Math.max(max[k], pts[i + k]);
  }
  const pad = radius * 2.5;
  const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const half = Math.max(...[0, 1, 2].map((k) => max[k] - min[k])) / 2 + pad;
  const res = 64;
  const mc = new MarchingCubes(res, material, false, false, 120000);
  mc.isolation = 0.5;
  const field = new Float32Array(res ** 3);
  const cell = (2 * half) / res;
  const toGrid = (v, k) => ((v - center[k]) / half) * (res / 2) + res / 2;
  const reach = Math.ceil(radius / cell) + 1;
  for (let i = 0; i < pts.length; i += 3) {
    const gx = toGrid(pts[i], 0), gy = toGrid(pts[i + 1], 1), gz = toGrid(pts[i + 2], 2);
    for (let z = Math.max(1, Math.floor(gz - reach)); z <= Math.min(res - 2, Math.ceil(gz + reach)); z++)
      for (let y = Math.max(1, Math.floor(gy - reach)); y <= Math.min(res - 2, Math.ceil(gy + reach)); y++)
        for (let x = Math.max(1, Math.floor(gx - reach)); x <= Math.min(res - 2, Math.ceil(gx + reach)); x++) {
          const d = Math.hypot(x - gx, y - gy, z - gz) * cell;
          if (d < radius) { const q = x + res * y + res * res * z; field[q] = Math.max(field[q], 1 - (d / radius) ** 2); }
        }
  }
  // Two box-blur passes close the gaps between branches.
  let a = field, b = new Float32Array(field.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 1; z < res - 1; z++) for (let y = 1; y < res - 1; y++) for (let x = 1; x < res - 1; x++) {
      let s = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        s += a[(x + dx) + res * (y + dy) + res * res * (z + dz)];
      b[x + res * y + res * res * z] = s / 27;
    }
    [a, b] = [b, a];
  }
  // Rescale so the isolation level sits near the kernel radius after blurring.
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1, a[i] * 2.2);
  mc.field.set(a);
  mc.update();
  const n = mc.count;
  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    // MarchingCubes local coordinates run -1..1 on (x, y, z) grid axes.
    positions[i] = center[0] + mc.positionArray[i] * half;
    positions[i + 1] = center[1] + mc.positionArray[i + 1] * half;
    positions[i + 2] = center[2] + mc.positionArray[i + 2] * half;
    normals.set([mc.normalArray[i], mc.normalArray[i + 1], mc.normalArray[i + 2]], i);
  }
  mc.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex([...Array(n).keys()]);
  return g;
}

export {TISSUES};
