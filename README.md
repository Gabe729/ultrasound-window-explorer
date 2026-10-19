# Ultrasound Window Explorer

An interactive 3D anatomy explorer in the browser that shows which internal structures diagnostic ultrasound can reach from any point on the skin, and why others stay hidden behind bone, gas or depth. You place a virtual probe on a reference adult body, aim it, and the app traces the beam through the anatomy with a simple acoustic model: it lists every structure crossed, scores how well each is likely to be imaged, explains the main obstacle, and draws a pseudo B-mode cross-section of the imaging plane. It is an educational accessibility explorer, not a clinical simulator.

**Live demo:** https://gabe729.github.io/ultrasound-window-explorer/

> Screenshot: *add `docs/screenshot.png` and reference it here.*

**Not a diagnostic tool.** Nothing in this app is medical advice or suitable for clinical decisions, training sign-off or device design. The acoustic numbers are educational approximations.

## Run it locally

Needs Python 3 and a current browser with WebGL 2 (Chrome, Edge, Firefox or Safari). No build step, no Node and no internet connection.

```bash
python3 serve.py 8000
```

Run this from the repository root, then open http://localhost:8000. The first load decompresses about 33 MB of anatomy and indexes it for ray tracing (roughly 10–20 s on a laptop); after that each probe update takes about 30–100 ms.

The page must be served over HTTP: opening `index.html` directly from disk will not work, because browsers block module and data loading from `file://`. Any static server works (`python3 -m http.server` too); `serve.py` only adds no-cache headers so edits show up on reload.

### GitHub Pages

The app is fully static and uses relative paths only, so it runs from a repository sub-path. Enable Pages for the default branch, root folder. The `.nojekyll` file stops Jekyll processing. GitHub Pages serves the `.gz` geometry as `application/gzip` without decoding it; the app detects the gzip signature and decompresses in the browser (`DecompressionStream`), and also accepts hosts that decode the files transparently.

## Features

- A translucent, rotatable adult male body (BodyParts3D 4.0: muscles, bones, organs, vessels, nerves) with per-system visibility and opacity.
- A virtual probe you place anywhere on the skin (Shift-drag, drag the probe itself, or the **Move probe** button) and orient: rotate the imaging plane, tilt (fan) and rock (heel–toe). Keys Q/E, W/S, A/D; Shift for 1° steps.
- Linear, curvilinear and phased-array probes, with frequency, imaging depth and steering/field/sector angle.
- The beam drawn in 3D: imaging plane, slice-thickness envelope, an optional 3D volume sweep, depth ticks and the points where rays lose signal.
- Every structure the beam crosses, listed with depth, a qualitative accessibility score and the main limitation (bone shadow, gas, attenuation, resolution, angle of incidence, lost skin contact). Structures are coloured by expected accessibility in 3D.
- A cross-section of the imaging plane as a pseudo B-mode image or a tissue map, also mapped onto the plane in 3D. The orientation-marker side is shown on the left of the image. The anatomy can be cut along the plane or reduced to a ±12 mm slab.
- Physiological state: bowel gas fraction and bladder full/empty.
- Click any structure for its acoustic class and properties (with sources and confidence), its status in the current beam (depth, signal margin, coverage, resolution, Doppler angle for vessels), how ultrasound images it in practice, useful windows, and what could be measured.
- 18 presets across cardiac, abdominal, renal, pelvic, vascular, musculoskeletal and other windows. Each places the probe from the anatomy and then searches nearby skin for the best view of the target. **Find best window** does the same for any selected structure.

## The physics model and its limits

Three layers are kept separate, and the interface labels each one.

**Geometry (BodyParts3D).** The 2,234 BodyParts3D meshes, as packaged by Human Atlas. Straight rays are cast from the probe face through every mesh using per-structure bounding-volume hierarchies; paired entry and exit hits give the interval each structure occupies along a ray. Where meshes overlap, the structure with the smaller enclosed volume wins (a vessel inside an organ, a cavity inside a wall).

**Acoustics (computed from an approximate tissue table).** Each structure is assigned one of about 30 tissue classes by rules on its name and anatomical system (`src/tissues.js`). Along each ray the model accumulates the one-way loss:

- attenuation of α·fⁿ dB per centimetre in each tissue crossed (α in dB/cm at 1 MHz, f in MHz);
- −10·log₁₀(1 − R) at each interface, where R = ((Z₂ − Z₁)/(Z₂ + Z₁))² is the normal-incidence intensity reflection coefficient and Z = ρc;
- near-total reflection at gas.

The margin left after the round trip is M = 70 dB − 2L. Bone shadows, gas blocking, enhancement behind fluid and the depth limit all follow from this calculation. Axial, lateral and elevational resolution come from simple formulas in the wavelength, aperture and elevation focus.

**Educational approximations.** These are choices made for intuition, not measured values:

- the 70 dB dynamic-range budget, which gives a soft-tissue penetration of about 58/f cm;
- the scoring thresholds, the accessibility score and the specular-angle penalty;
- the echogenicity values and the speckle texture in the pseudo B-mode;
- the noise field that places bowel gas pockets;
- the 8 mm skin-contact tolerance.

**Tissue values.** Each class records its sources, the range across sources and a confidence level (literature / approximate / assumed). Sources include Mast (2000, compiling ICRU Report 61), Culjat et al. (2010), Kyriakou et al. (2015), Aubry et al. (2022), Szabo and Duck (1990). The **Model & assumptions** dialog in the app shows the full table. Known gaps: no good published values were found for **pancreas** (average soft tissue used), **cartilage** (speed approximate, attenuation assumed), **thyroid** and **prostate** (generic gland values), intervertebral disc, heart valves, nerve and erectile tissue; these are marked "assumed". Aerated lung is represented by an effective impedance rather than a measured speed of sound.

**Known limitations.**

- Rays are straight: no refraction, diffraction, multiple scattering, phase aberration, speckle physics or harmonic imaging.
- One isotropic value per tissue class. Real tissue varies with fibre direction, age, fat content, hydration and disease.
- BodyParts3D has no subcutaneous fat layer, so the space between the skin and the first mesh is "unassigned soft tissue".
- Vessels are solid tubes treated as blood-filled. Bones are solid (cortex and marrow together) with one effective attenuation.
- The bladder mesh is small and sits low (nearly empty). A full bladder that rises above the pubis and displaces bowel cannot be shown with fixed geometry; the "bladder full" switch changes only the content of the existing mesh.
- One adult male reference body. Body habitus, breathing phase, posture, probe pressure and pathology are not modelled.

### Structures BodyParts3D does not have

BodyParts3D 4.0 has **no lung parenchyma** and **no thyroid gland**. The explorer adds two approximate stand-ins, labelled "derived" or "schematic" wherever they appear:

- **Lungs (derived):** reconstructed for each side from the BodyParts3D bronchial and pulmonary-vessel trees listed under "right lung" and "left lung" in the BodyParts3D PART-OF table. The trees are dilated by about 14 mm, smoothed, and surfaced with marching cubes. The pleural surface is approximate (likely within 1–2 cm).
- **Thyroid (schematic):** two lobes and an isthmus of typical adult size, placed beside the trachea just below the cricoid cartilage.

Human Atlas files the liver as eight "Hepatovenous segment" meshes under veins; the explorer treats them as liver parenchyma and shows them with the digestive organs.

## Files

| Path | Holds |
| --- | --- |
| `index.html`, `styles.css` | Page and layout |
| `src/atlas.js` | Loading the anatomy chunks, render batches, per-structure ray indices, derived lungs and thyroid |
| `src/tissues.js` | Tissue classes, acoustic properties, sources, classification rules, accessibility categories |
| `src/physics.js` | Ray tracing, acoustic walk, per-structure aggregation and scoring |
| `src/probe.js` | Probe types, pose on the skin, beam ray generation, resolution formulas |
| `src/image2d.js` | Pseudo B-mode / tissue-map cross-section |
| `src/beam.js` | 3D probe model, scan plane, slice envelope, depth ticks |
| `src/presets.js` | Acoustic-window presets and the best-window search |
| `src/knowledge.js` | Curated notes on how each structure is imaged and what can be measured |
| `src/main.js` | Scene, interaction, panels |
| `models/` | Packaged geometry (`atlas.json`, `body-*.bin.gz`), `us-meta.json`, BodyParts3D attribution |
| `tools/build_metadata.py` | Rebuilds `models/us-meta.json` from `tools/partof_element_parts.txt` (BodyParts3D PART-OF table) |
| `vendor/` | three.js r160 and addons, three-mesh-bvh, with licence texts |
| `serve.py` | Local static server with caching disabled |

In the browser console, `window.__us` exposes the atlas, model, probe and latest result for scripted checks.

## Credits and licences

The code in this repository is released under the [MIT licence](LICENSE).

- Anatomy: **BodyParts3D 4.0**, © The Database Center for Life Science (DBCLS), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Mitsuhashi et al. 2009, doi:10.1093/nar/gkn613). The geometry is modified (simplified, re-packaged, plus derived lung and thyroid stand-ins).
- Mesh packaging and identifiers: **[Human Atlas](https://github.com/ashemag/human-atlas)** (MIT).
- Rendering: **three.js** (MIT) and **three-mesh-bvh** (MIT).

Full attributions, the list of modifications and licence texts are in [`NOTICE.md`](NOTICE.md), [`models/ATTRIBUTION-BodyParts3D.md`](models/ATTRIBUTION-BodyParts3D.md) and [`vendor/LICENSES.md`](vendor/LICENSES.md).

## Support

Provided as is, without support or warranty. Issues and pull requests are welcome but may not be answered.
