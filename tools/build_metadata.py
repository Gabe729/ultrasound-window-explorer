"""Build models/us-meta.json: the BodyParts3D element lists the explorer uses to derive
structures that BodyParts3D 4.0 does not model as meshes (lung parenchyma).

Usage: python3 tools/build_metadata.py
Inputs: models/atlas.json (from Human Atlas) and tools/partof_element_parts.txt
(BodyParts3D 4.0 PART-OF element table, https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).
"""
import collections
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
atlas = json.loads((root / "models/atlas.json").read_text())
present = {p["id"] for p in atlas["parts"]}

elements = collections.defaultdict(list)
for line in (root / "tools/partof_element_parts.txt").read_text().splitlines()[1:]:
    concept, name, element = line.split("\t")
    elements[name].append(element)


def members(name):
    ids = sorted(set(elements[name]))
    missing = [i for i in ids if i not in present]
    assert not missing, (name, missing)
    return ids


meta = {
    "source": "BodyParts3D 4.0 PART-OF element table (partof_element_parts.txt)",
    "lungRight": members("right lung"),
    "lungLeft": members("left lung"),
}
(root / "models/us-meta.json").write_text(json.dumps(meta, indent=1))
print({k: len(v) for k, v in meta.items() if isinstance(v, list)})
