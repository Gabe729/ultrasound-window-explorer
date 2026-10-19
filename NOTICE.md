# Notices and credits

The Ultrasound Window Explorer's own code is released under the MIT licence (see [`LICENSE`](LICENSE)). It bundles the following third-party data and code, each under its own licence.

## Anatomy: BodyParts3D 4.0 (CC BY 4.0)

BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

- Licence page: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Publication: Mitsuhashi N et al. (2009) BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Research* 37:D782–D785. https://doi.org/10.1093/nar/gkn613

**Modifications.** The geometry has been changed from the original BodyParts3D release:

1. *By the Human Atlas packaging* (files `models/atlas.json`, `models/body-*.bin.gz`): coordinates converted from millimetres/Z-up to metres/Y-up and translated; each mesh simplified with meshoptimizer within a 0.2% relative error bound; normals quantised to signed 16-bit; meshes packed into gzip-compressed binary chunks; display-system groupings and colours added. All 2,234 source meshes are represented and their BodyParts3D/FMA identifiers are kept. Details: [`models/ATTRIBUTION-BodyParts3D.md`](models/ATTRIBUTION-BodyParts3D.md).
2. *By this explorer, at run time*: BodyParts3D 4.0 contains no lung parenchyma and no thyroid gland, so approximate stand-ins are generated in the browser. The lungs are derived from the BodyParts3D bronchial and pulmonary-vessel meshes of each lung (dilated by about 14 mm, smoothed, and surfaced with marching cubes); the thyroid is a schematic set of ellipsoids placed beside the BodyParts3D trachea. Some structures are also reassigned between display groups (for example the liver's "hepatovenous segment" meshes are shown as liver). These stand-ins are labelled "derived" or "schematic" in the interface and are not BodyParts3D data.
3. `tools/partof_element_parts.txt` is the BodyParts3D 4.0 PART-OF element table from the same archive, used unchanged by `tools/build_metadata.py` to produce `models/us-meta.json`.

## Mesh packaging and identifiers: Human Atlas (MIT)

[Human Atlas](https://github.com/ashemag/human-atlas), © 2026 ashemag, MIT licence. The packaged BodyParts3D chunks, manifest and identifiers in `models/` come from this project. Licence text: [`vendor/HUMAN-ATLAS-LICENSE`](vendor/HUMAN-ATLAS-LICENSE).

## three.js (MIT)

[three.js](https://github.com/mrdoob/three.js) r160 and the addons in `vendor/addons/`, © 2010–2023 three.js authors, MIT licence. Licence text: [`vendor/THREE-LICENSE`](vendor/THREE-LICENSE).

## three-mesh-bvh (MIT)

[three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) 0.7.6, © 2018 Garrett Johnson, MIT licence. Licence text: [`vendor/THREE-MESH-BVH-LICENSE`](vendor/THREE-MESH-BVH-LICENSE).

## Acoustic property sources

Tissue property values in `src/tissues.js` are taken or approximated from published tables (Mast 2000; ICRU Report 61; Culjat et al. 2010; Kyriakou et al. 2015; Aubry et al. 2022; Szabo; Duck 1990). Full citations are in `src/tissues.js` and in the app's **Model & assumptions** dialog. Numbers are facts drawn from these works; no text or figures are reproduced.
