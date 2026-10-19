// Tissue classes and approximate acoustic properties.
//
// BodyParts3D meshes are anatomical geometry only: they carry no acoustic information.
// Every structure is assigned one of the classes below by name and system rules
// (classify()). The class supplies the acoustic properties used by the physics model.
//
// Units: c in m/s, rho in kg/m^3, alpha in dB/cm at 1 MHz, with alpha(f) = alpha * f^n.
// echo: relative backscatter (dB) used only for the pseudo B-mode display and the
// "how bright does it look" hint; it is an educational choice, not a measured value.
// conf: 'lit' = literature value (see SOURCES), 'approx' = literature range collapsed to
// one number or a proxy tissue used, 'assumed' = no good source; chosen for intuition.

export const SOURCES = {
  mast: 'Mast TD (2000) Empirical relationships between acoustic parameters in human soft tissues. ARLO 1:37–42, Table 1 (compiles ICRU Report 61, Goss and Duck).',
  icru: 'ICRU Report 61 (1998) Tissue substitutes, phantoms and computational modelling in medical ultrasound (values as tabulated by Mast 2000).',
  culjat: 'Culjat MO et al. (2010) A review of tissue substitutes for ultrasound imaging. Ultrasound Med Biol 36:861–873, Table 1.',
  kyriakou: 'Kyriakou A et al. (2015) Full-wave acoustic and thermal modeling of transcranial ultrasound propagation. J Ther Ultrasound 3:11, Table 3 (PMC4521448).',
  aubry: 'Aubry JF et al. (2022) Benchmark problems for transcranial ultrasound simulation. JASA 152:1003, Table I (representative skull values).',
  szabo: 'Szabo TL, Diagnostic Ultrasound Imaging: Inside Out; and Duck FA (1990) Physical Properties of Tissue; as reproduced in Stanford RAD225 lecture slides (Class 3).',
  doppler: 'Radiopaedia, insonation angle ≤ 60° (citing Uppal & Mogra 2010, Australas J Ultrasound Med 13:32–34).',
  model: 'Educational choice for this explorer; no source.',
};

// Checked against the sources above on 19/10/2026 (desk check of published tables).
// Where sources disagree, the range is given in `range` and one value is used.
export const TISSUES = {
  soft:      {label: 'Soft tissue (unassigned)', c: 1540, rho: 1043, alpha: 0.6, src: ['mast', 'szabo'], range: 'average soft tissue 0.5–0.54 dB/cm/MHz; raised slightly for fat/fascia mix', n: 1.0, echo: -4, kind: 'soft', color: '#8a7466', conf: 'assumed',
              note: 'Space inside the skin not covered by any BodyParts3D mesh (subcutaneous fat, fascia, connective tissue). Modelled as a fat/soft-tissue mix.'},
  skin:      {label: 'Skin', c: 1615, rho: 1090, alpha: 1.0, n: 1.0, src: ['icru', 'kyriakou'], range: 'α 0.35 (ICRU) to 1.71 (Kyriakou) dB/cm: sources differ 5×', echo: 2, kind: 'soft', color: '#c9a58a', conf: 'approx'},
  fat:       {label: 'Fat', c: 1478, rho: 950, alpha: 0.48, src: ['mast', 'icru', 'kyriakou'], range: 'c 1430–1478 m/s; α 0.29–0.61 dB/cm', n: 1.0, echo: -8, kind: 'soft', color: '#c9b37a', conf: 'lit'},
  muscle:    {label: 'Skeletal muscle', c: 1547, rho: 1050, alpha: 1.09, src: ['mast', 'icru', 'kyriakou'], range: 'c 1547–1581 m/s; α 0.74–1.09 dB/cm', n: 1.0, echo: -5, kind: 'soft', color: '#a4554b', conf: 'lit',
              note: 'Attenuation and brightness depend on fibre direction (anisotropy); one isotropic value is used.'},
  tendon:    {label: 'Tendon / ligament', c: 1670, rho: 1100, alpha: 4.7, src: ['culjat', 'kyriakou'], range: 'α 3.7–4.7 dB/cm; ligament not confirmed (connective tissue 1.57 dB/cm in Mast)', n: 1.0, echo: 6, kind: 'soft', specular: true, color: '#d9d2bf', conf: 'lit',
              note: 'Strongly anisotropic: bright only when the beam is near perpendicular to the fibres.'},
  fascia:    {label: 'Fascia / fibrous sheet', c: 1613, rho: 1120, alpha: 1.57, n: 1.0, echo: 3, kind: 'soft', color: '#cbd5c8', conf: 'lit', src: ['mast'],
              note: 'Mast 2000 "connective tissue" values, used for sheets and membranes (linea alba, interosseous membranes, raphes, retinacula, fascia lata).'},
  cartilage: {label: 'Cartilage', c: 1630, rho: 1100, alpha: 3.0, n: 1.0, echo: -14, kind: 'soft', color: '#9fc3c0', conf: 'assumed', src: ['model'], range: 'speed ~1630 m/s (articular, unconfirmed); no attenuation source found',
              note: 'Hyaline and costal cartilage transmit sound reasonably well; costal cartilage calcifies with age, which is not modelled.'},
  disc:      {label: 'Intervertebral disc', c: 1600, rho: 1100, alpha: 2.0, src: ['model'], n: 1.0, echo: -6, kind: 'soft', color: '#9fb9c3', conf: 'assumed'},
  bone:      {label: 'Bone', c: 3476, rho: 1975, alpha: 10.0, src: ['culjat', 'szabo', 'kyriakou', 'aubry'], range: 'cortical c 3183–3476 m/s, Z 5.7–7.8 MRayl, α 6.9–14.2 dB/cm; trabecular α ~10', n: 1.0, echo: 18, kind: 'bone', specular: true, color: '#e6dcc0', conf: 'approx',
              note: 'Meshes are solid bones (cortex and marrow together). One effective attenuation is used for the whole bone; the true value varies widely with porosity and frequency.'},
  tooth:     {label: 'Tooth', c: 4500, rho: 2500, alpha: 80, src: ['culjat'], range: 'dentin 3800 m/s, 80 dB/cm; enamel 5700 m/s, 120 dB/cm', n: 1.0, echo: 20, kind: 'bone', specular: true, color: '#f2efe4', conf: 'approx'},
  blood:     {label: 'Blood (vessel lumen)', c: 1584, rho: 1060, alpha: 0.18, n: 1.2, src: ['icru', 'kyriakou', 'szabo'], range: 'α 0.14–0.20 dB/cm', echo: -32, kind: 'fluid', color: '#b8443b', conf: 'lit',
              note: 'BodyParts3D vessels are solid tubes; they are treated as blood-filled lumen with an implicit wall.'},
  myocardium:{label: 'Myocardium', c: 1576, rho: 1060, alpha: 0.52, src: ['icru', 'culjat'], n: 1.0, echo: -6, kind: 'soft', color: '#b5534d', conf: 'lit'},
  valve:     {label: 'Heart valve', c: 1600, rho: 1100, alpha: 2.0, src: ['model'], n: 1.0, echo: 4, kind: 'soft', color: '#e0b9a5', conf: 'assumed'},
  liver:     {label: 'Liver', c: 1595, rho: 1060, alpha: 0.5, n: 1.2, src: ['icru', 'szabo'], range: 'c 1578–1595 m/s; α 0.45–0.50 dB/cm; n ≈ 1.2 read from a figure', echo: 0, kind: 'soft', color: '#8c4a3a', conf: 'lit'},
  kidney:    {label: 'Kidney', c: 1560, rho: 1050, alpha: 1.0, n: 1.0, echo: -3, kind: 'soft', color: '#9c5a48', conf: 'lit', src: ['icru', 'szabo'], },
  spleen:    {label: 'Spleen', c: 1567, rho: 1054, alpha: 0.4, n: 1.3, echo: 0, kind: 'soft', color: '#7d4157', conf: 'lit', src: ['mast'], },
  pancreas:  {label: 'Pancreas', c: 1561, rho: 1043, alpha: 0.54, n: 1.0, echo: 2, kind: 'soft', color: '#c99a6a', conf: 'assumed', src: ['mast'], range: 'no pancreas value found; average soft tissue used', },
  gland:     {label: 'Gland / parenchyma', c: 1560, rho: 1050, alpha: 0.7, src: ['model'], range: 'thyroid in vivo 1.3–1.7 dB/cm/MHz (unconfirmed); testis 1595 m/s, 0.17 dB/cm (Mast); prostate not found', n: 1.0, echo: 0, kind: 'soft', color: '#c08f86', conf: 'assumed',
              note: 'Generic soft-tissue values used for glands without a good acoustic source (adrenal, salivary, thymus, prostate, testis, thyroid).'},
  brain:     {label: 'Brain', c: 1560, rho: 1040, alpha: 0.6, src: ['icru', 'kyriakou'], range: 'α 0.6–0.75 dB/cm', n: 1.0, echo: -6, kind: 'soft', color: '#d8b9a6', conf: 'lit'},
  nerve:     {label: 'Nerve', c: 1570, rho: 1050, alpha: 1.0, src: ['model'], n: 1.0, echo: -2, kind: 'soft', color: '#d8b565', conf: 'assumed',
              note: 'Peripheral nerves show a fascicular "honeycomb" pattern; generic soft-tissue values are used.'},
  csf:       {label: 'Cerebrospinal fluid', c: 1515, rho: 1007, alpha: 0.01, src: ['szabo'], range: 'not confirmed; water used as proxy (0.0022 dB/cm at 1 MHz, n = 2)', n: 2.0, echo: -40, kind: 'fluid', color: '#5b8fb0', conf: 'approx'},
  urine:     {label: 'Urine (bladder content)', c: 1540, rho: 1010, alpha: 0.01, src: ['szabo'], range: 'not confirmed; water used as proxy', n: 2.0, echo: -40, kind: 'fluid', color: '#c9b347', conf: 'approx',
              note: 'Water-like fluid; low attenuation produces posterior acoustic enhancement.'},
  bile:      {label: 'Bile', c: 1540, rho: 1010, alpha: 0.01, src: ['szabo'], range: 'not confirmed; water used as proxy', n: 2.0, echo: -40, kind: 'fluid', color: '#6f9a3a', conf: 'approx'},
  vitreous:  {label: 'Vitreous / aqueous humour', c: 1530, rho: 1010, alpha: 0.1, n: 1.5, echo: -40, kind: 'fluid', color: '#7fa7b8', conf: 'lit', src: ['icru', 'kyriakou'], range: 'α 0.1–0.43 dB/cm', },
  lens:      {label: 'Eye lens', c: 1645, rho: 1070, alpha: 0.8, n: 1.0, echo: -20, kind: 'soft', color: '#b9d3d9', conf: 'lit', src: ['icru', 'kyriakou'], },
  bowel:     {label: 'Hollow viscus (variable gas)', c: 1540, rho: 1030, alpha: 0.8, src: ['model'], n: 1.0, echo: -2, kind: 'variableGas', color: '#b8916b', conf: 'assumed',
              note: 'Stomach and bowel contain an unpredictable mix of fluid, food and gas. Gas pockets are placed by a noise field controlled by the "bowel gas" slider.'},
  airway:    {label: 'Airway (air-filled)', c: 343, rho: 1.2, alpha: 1.6, n: 2.0, src: ['culjat', 'szabo'], range: 'tissue–air intensity reflection ≈ 99.9%', echo: 25, kind: 'gas', color: '#9fb6c9', conf: 'lit',
              note: 'Trachea and bronchi contain air: the near wall is seen, everything behind is replaced by reverberation.'},
  lung:      {label: 'Aerated lung', c: 450, rho: 400, alpha: 40, src: ['szabo'], range: 'Z ≈ 0.18 MRayl (Radiopaedia); α ~40 dB/cm read off a figure; c and ρ chosen to match Z', n: 1.0, echo: 25, kind: 'gas', color: '#c79aa3', conf: 'approx',
              note: 'Aerated lung is a foam of air and tissue. Conventional imaging stops at the pleural line; only artefacts (A-lines, B-lines) and pleural sliding are seen.'},
  erectile:  {label: 'Erectile tissue', c: 1560, rho: 1050, alpha: 0.6, src: ['model'], n: 1.0, echo: -10, kind: 'soft', color: '#b07070', conf: 'assumed'},
  none:      {label: 'Not acoustically modelled', c: 1540, rho: 1045, alpha: 0, src: [], n: 1, echo: -60, kind: 'ignore', color: '#555555', conf: 'assumed'},
};

export const AIR = {c: 343, rho: 1.2};
export const impedance = (t) => (t.c * t.rho) / 1e6; // MRayl

// Rules are tried in order: first matching pattern wins, then the system default.
const NAME_RULES = [
  [/hair|eyebrow/, 'none'],
  [/^skin$/, 'skin'],
  [/hepatovenous segment|lobe of liver$/, 'liver'],
  [/tooth/, 'tooth'],
  [/gingiva|^lip$/, 'soft'],
  [/intervertebral dis[ck]/, 'disc'],
  [/cartilage|epiglottis|meniscus/, 'cartilage'],
  [/cavity of (left|right) (ventricle|atrium)/, 'blood'],
  [/(third|fourth|lateral) ventricle$|interventricular foramen|cerebral aqueduct|central canal/, 'csf'],
  [/cusp of|leaflet of/, 'valve'],
  [/wall of (left |right )?(ventricle|atrium)|papillary muscle|trabecula/, 'myocardium'],
  [/linea alba|raphe|interosseous membrane|retinaculum|iliotibial tract|aponeurosis|tentorium|membrane$|conus elasticus/, 'fascia'],
  [/tendon|ligament|tendinous|trochlea of/, 'tendon'],
  [/tensor fasciae latae|fibularis|tibialis|subscapularis|levator scapulae|constrictor|palatopharyngeus|salpingopharyngeus|stylopharyngeus|tongue|taenia/, 'muscle'],
  [/bronch|trachea/, 'airway'],
  [/nasal concha|nasal bone|lacrimal bone/, 'bone'],
  [/gallbladder/, 'bile'],
  [/hepatic duct|cystic duct|bile|biliary|pancreatic duct/, 'bile'],
  [/pancreas/, 'pancreas'],
  [/mesentery|mesocolon|mesoappendix/, 'fat'],
  [/^(stomach|ascending colon|transverse colon|descending colon|sigmoid colon|rectum|appendix|duodenum|ileocecal junction|cecum)$|part of (ileum|jejunum)$/, 'bowel'],
  [/esophagus/, 'muscle'],
  [/kidney/, 'kidney'],
  [/urinary bladder/, 'urine'],
  [/ureter|urethra/, 'muscle'],
  [/spleen/, 'spleen'],
  [/thymus|adrenal|submandibular|sublingual|lacrimal gland|prostate|seminal vesicle|testis|epididymis|thyroid gland/, 'gland'],
  [/pituitary|pineal/, 'brain'],
  [/corpus cavernosum|corpus spongiosum|glans/, 'erectile'],
  [/vitreous|anterior chamber|lacrimal lake/, 'vitreous'],
  [/lens$/, 'lens'],
  [/cornea|sclera|choroid|iris|retina|corona ciliaris|tarsal plate|external ear|lacrimal (sac|canaliculus)|nasolacrimal|deferent duct/, 'soft'],
  [/nerve|ganglion|optic chiasm|optic tract/, 'nerve'],
];

const SYSTEM_DEFAULT = {
  skeletal: 'bone', muscular: 'muscle', cardiac: 'myocardium', arterial: 'blood', venous: 'blood',
  nervous: 'brain', respiratory: 'airway', digestive: 'soft', urinary: 'soft', reproductive: 'gland',
  lymphatic: 'gland', endocrine: 'gland', integumentary: 'skin', connective: 'tendon', sensory: 'soft',
};

export function classify(part) {
  if (part.tissue) return part.tissue;
  const n = part.name.toLowerCase();
  // Vessel names mention the organs they supply ("artery of colon", "central artery of retina").
  if (part.system === 'arterial' || part.system === 'venous') return /hepatovenous segment/.test(n) ? 'liver' : 'blood';
  for (const [re, cls] of NAME_RULES) if (re.test(n)) return cls;
  return SYSTEM_DEFAULT[part.system] ?? 'soft';
}

// Structures that BodyParts3D files under one system but which belong to another for display.
export function displaySystem(part) {
  const n = part.name.toLowerCase();
  if (/hepatovenous segment/.test(n)) return 'digestive';
  if (/(third|fourth|lateral) ventricle$|interventricular foramen/.test(n)) return 'nervous';
  return part.system;
}

// Accessibility categories (qualitative).
export const CATEGORIES = [
  {id: 'good', label: 'Well imageable', color: '#3ddc97', min: 0.6},
  {id: 'fair', label: 'Partly imageable', color: '#f2c94c', min: 0.3},
  {id: 'poor', label: 'Barely imageable', color: '#f2994a', min: 0.08},
  {id: 'blocked', label: 'In beam but not imageable', color: '#eb5757', min: -Infinity},
];
export const categoryFor = (score) => CATEGORIES.find((c) => score >= c.min);
