// Curated imaging notes. Matched by structure name (first match wins), then by tissue class.
// These are general educational summaries of standard practice, not clinical guidance.
// measures: what can be measured with ultrasound; physiology: the variables those measurements inform.

const E = (match, o) => ({match, ...o});

export const KNOWLEDGE = [
  E(/cavity of left ventricle|wall of ventricle|papillary muscle of left ventricle/, {
    title: 'Left ventricle',
    how: 'Echocardiography with a low-frequency phased array. The beam must pass between the ribs and avoid the lungs, which cover most of the heart.',
    windows: ['Parasternal (left 3rd–4th intercostal space)', 'Apical (at the apex beat)', 'Subcostal (through the liver)'],
    measures: ['Chamber dimensions and volumes', 'Ejection fraction', 'Wall thickness and motion', 'Strain (speckle tracking)', 'Mitral inflow Doppler (E/A, E/e′)'],
    physiology: ['Stroke volume and cardiac output', 'Systolic and diastolic function', 'Filling pressure (estimated)'],
  }),
  E(/cavity of right ventricle|cavity of right atrium|wall of right atrium|of right ventricle$/, {
    title: 'Right heart',
    how: 'Phased-array echo; the right ventricle sits directly behind the sternum, so apical and subcostal views are used.',
    windows: ['Apical four-chamber', 'Subcostal', 'Parasternal short axis'],
    measures: ['RV size and TAPSE', 'Tricuspid regurgitation velocity', 'Right atrial size'],
    physiology: ['Pulmonary artery pressure (estimated)', 'Right ventricular function'],
  }),
  E(/atrium/, {
    title: 'Atrium', how: 'Seen in apical and parasternal echo views; the left atrium lies posteriorly, just in front of the oesophagus (transoesophageal echo images it best).',
    windows: ['Apical four-chamber', 'Parasternal long axis'], measures: ['Atrial volume', 'Pulmonary vein Doppler'], physiology: ['Chronic filling pressure', 'Atrial fibrillation substrate'],
  }),
  E(/mitral|tricuspid|aortic valve|pulmonary valve|cusp of|leaflet of/, {
    title: 'Heart valve', how: 'Thin leaflets are strong specular reflectors; best seen when the beam is perpendicular to them. Doppler is aligned with flow through the valve.',
    windows: ['Parasternal long and short axis', 'Apical views (for Doppler alignment)'],
    measures: ['Leaflet morphology', 'Peak and mean pressure gradients (Doppler)', 'Valve area', 'Regurgitant jets (colour Doppler)'],
    physiology: ['Valve stenosis and regurgitation severity'],
  }),
  E(/aorta/, {
    title: 'Aorta', how: 'Abdominal aorta: curvilinear probe in the midline, often hampered by bowel gas (firm, graded pressure helps). Thoracic aorta: parasternal and suprasternal windows.',
    windows: ['Epigastric/midline abdominal', 'Suprasternal notch (arch)', 'Parasternal (aortic root)'],
    measures: ['Diameter (aneurysm screening)', 'Flow velocity', 'Wall motion / distensibility'], physiology: ['Aneurysm risk', 'Arterial stiffness', 'Pulse wave velocity (with two sites)'],
  }),
  E(/inferior vena cava/, {
    title: 'Inferior vena cava', how: 'Subcostal long-axis view through the liver as an acoustic window; diameter changes with breathing.',
    windows: ['Subcostal (through the liver)', 'Right lateral (transhepatic)'],
    measures: ['Diameter', 'Respiratory collapsibility index', 'Hepatic vein Doppler'], physiology: ['Right atrial pressure (estimated)', 'Volume status / fluid responsiveness (with caveats)'],
  }),
  E(/common carotid|internal carotid|external carotid/, {
    title: 'Carotid artery', how: 'Superficial vessel imaged with a high-frequency linear probe beside the trachea. Doppler needs a beam-to-flow angle ≤ 60°, achieved by steering or heel-toe angling.',
    windows: ['Anterolateral neck, longitudinal and transverse'],
    measures: ['Intima–media thickness', 'Plaque', 'Peak systolic and end-diastolic velocity', 'Diameter change over the cardiac cycle'],
    physiology: ['Stenosis grade', 'Arterial stiffness', 'Cerebral blood supply', 'Corrected flow time (fluid status, research)'],
  }),
  E(/jugular vein/, {
    title: 'Internal jugular vein', how: 'Lateral to the carotid, compressible and variable in size; a linear probe with light pressure.',
    windows: ['Anterolateral neck'], measures: ['Cross-sectional area and its change with breathing or Valsalva', 'Compressibility'], physiology: ['Central venous pressure (semi-quantitative)', 'Guidance for line placement'],
  }),
  E(/femoral (artery|vein)|popliteal|iliac/, {
    title: 'Lower-limb vessel', how: 'Linear probe in the groin and thigh; deeper segments in larger patients may need a curvilinear probe.',
    windows: ['Inguinal (common femoral)', 'Medial thigh', 'Popliteal fossa'],
    measures: ['Compression (deep vein thrombosis)', 'Doppler waveform and peak velocity', 'Diameter'], physiology: ['Venous thrombosis', 'Peripheral arterial disease', 'Limb perfusion'],
  }),
  E(/brachial artery|radial artery|ulnar artery/, {
    title: 'Upper-limb artery', how: 'Very superficial; high-frequency linear probe. The brachial artery is the standard site for flow-mediated dilation.',
    windows: ['Antecubital fossa / medial arm', 'Wrist'],
    measures: ['Diameter and flow-mediated dilation', 'Doppler velocity', 'Wall thickness'], physiology: ['Endothelial function', 'Arterial stiffness', 'Peripheral perfusion'],
  }),
  E(/middle cerebral|anterior cerebral|posterior cerebral|basilar|vertebral artery/, {
    title: 'Intracranial artery', how: 'Transcranial Doppler at about 2 MHz through the thin temporal squama. In roughly one person in ten the window is too thick for a usable signal.',
    windows: ['Temporal window (above the zygomatic arch)', 'Transorbital', 'Suboccipital (foramen magnum)'],
    measures: ['Mean flow velocity', 'Pulsatility index', 'Microembolic signals'], physiology: ['Vasospasm', 'Cerebral autoregulation', 'Intracranial pressure (indirect)'],
  }),
  E(/hepatovenous segment|liver/, {
    title: 'Liver', how: 'Curvilinear probe below the right costal margin or between the lower right ribs. The liver is itself an excellent acoustic window to deeper structures.',
    windows: ['Right subcostal', 'Right intercostal (8th–10th spaces)', 'Epigastric (left lobe)'],
    measures: ['Size and echotexture', 'Focal lesions', 'Shear-wave elastography (stiffness)', 'Attenuation imaging / controlled attenuation (fat)', 'Portal and hepatic vein Doppler'],
    physiology: ['Liver fat (steatosis)', 'Fibrosis stage', 'Portal hypertension'],
  }),
  E(/gallbladder/, {
    title: 'Gallbladder', how: 'Fluid-filled, so anechoic with strong posterior enhancement; stones cast sharp shadows. Imaged best fasting.',
    windows: ['Right subcostal', 'Right intercostal'], measures: ['Wall thickness', 'Stones and sludge', 'Ejection fraction after a fatty meal'], physiology: ['Cholecystitis', 'Biliary function'],
  }),
  E(/hepatic duct|bile|biliary|cystic duct/, {
    title: 'Bile duct', how: 'Normally a few millimetres wide; the common duct is seen anterior to the portal vein. Small size makes resolution the limit.',
    windows: ['Right subcostal, oblique'], measures: ['Duct diameter (dilatation)'], physiology: ['Biliary obstruction'],
  }),
  E(/pancrea/, {
    title: 'Pancreas', how: 'Lies behind the stomach and transverse colon, so bowel gas often hides it; drinking water to fill the stomach can create a window.',
    windows: ['Epigastric transverse', 'Through the left lobe of the liver'], measures: ['Size and echotexture', 'Duct diameter', 'Masses and collections'], physiology: ['Pancreatitis', 'Ductal obstruction'],
  }),
  E(/spleen/, {
    title: 'Spleen', how: 'High under the left ribs and posterior; imaged through the lower left intercostal spaces, with the lung base sometimes in the way.',
    windows: ['Left intercostal (posterior axillary line)'], measures: ['Length and volume', 'Stiffness (elastography)'], physiology: ['Splenomegaly', 'Portal hypertension'],
  }),
  E(/kidney/, {
    title: 'Kidney', how: 'Retroperitoneal; the right kidney is imaged through the liver, the left through the spleen or from the back. Ribs and bowel gas limit some angles.',
    windows: ['Right flank via the liver', 'Left flank via the spleen', 'Posterior (prone)'],
    measures: ['Length and cortical thickness', 'Hydronephrosis', 'Resistive index (Doppler)', 'Cortical perfusion (contrast)'],
    physiology: ['Obstruction', 'Chronic kidney disease (size, echogenicity)', 'Intrarenal vascular resistance'],
  }),
  E(/urinary bladder/, {
    title: 'Urinary bladder', how: 'When full, urine is a near-perfect acoustic window into the pelvis (prostate, seminal vesicles; uterus and ovaries in women). An empty bladder collapses and the window disappears.',
    windows: ['Suprapubic, transverse and sagittal'], measures: ['Volume (pre- and post-void)', 'Wall thickness', 'Ureteric jets (colour Doppler)'], physiology: ['Urinary retention', 'Outflow obstruction', 'Hydration (indirect)'],
  }),
  E(/prostate|seminal vesicle/, {
    title: 'Prostate', how: 'Transabdominal through a full bladder, or transrectal at high frequency for detail.',
    windows: ['Suprapubic through a full bladder', 'Transrectal'], measures: ['Volume', 'Focal lesions'], physiology: ['Benign enlargement', 'PSA density (with volume)'],
  }),
  E(/testis|epididymis/, {
    title: 'Testis', how: 'Superficial, high-frequency linear probe with colour Doppler.', windows: ['Scrotal'], measures: ['Volume', 'Echotexture', 'Blood flow'], physiology: ['Torsion', 'Varicocele', 'Masses'],
  }),
  E(/thyroid gland/, {
    title: 'Thyroid gland', how: 'Superficial, high-frequency linear probe across the lower neck. (The gland shown here is schematic: BodyParts3D has no thyroid mesh.)',
    windows: ['Anterior neck, transverse and longitudinal'], measures: ['Lobe volumes', 'Nodule size and features', 'Vascularity (Doppler)'], physiology: ['Goitre', 'Nodule risk stratification', 'Thyroiditis'],
  }),
  E(/lung/, {
    title: 'Lung', how: 'Aerated lung reflects almost all sound at the pleura, so the lung itself is not imaged. Lung ultrasound reads the pleural line and artefacts: sliding, A-lines (normal air) and B-lines (fluid in the interstitium).',
    windows: ['Anterior, lateral and posterior intercostal zones'],
    measures: ['Pleural sliding', 'B-line count', 'Pleural effusion volume', 'Consolidation'], physiology: ['Extravascular lung water', 'Pneumothorax', 'Pneumonia'],
  }),
  E(/trachea|bronch/, {
    title: 'Airway', how: 'Air in the lumen reflects the beam: only the anterior wall and cartilage rings are seen, with reverberation behind.',
    windows: ['Anterior neck (trachea)'], measures: ['Tracheal position and diameter', 'Endotracheal tube placement'], physiology: ['Airway assessment'],
  }),
  E(/diaphragm/, {
    title: 'Diaphragm', how: 'Seen as a bright curved line over the liver or spleen; its thickening and movement are measured in M-mode.',
    windows: ['Right and left subcostal', 'Lower intercostal (zone of apposition)'], measures: ['Excursion', 'Thickening fraction'], physiology: ['Diaphragm weakness', 'Weaning from ventilation'],
  }),
  E(/stomach/, {
    title: 'Stomach', how: 'Variable gas and food content; the antrum is the most reliably imaged part, in the epigastrium.',
    windows: ['Epigastric, sagittal'], measures: ['Antral cross-sectional area', 'Wall thickness'], physiology: ['Gastric volume (aspiration risk)', 'Gastric emptying'],
  }),
  E(/^(ascending colon|transverse colon|descending colon|rectum|appendix|duodenum|ileocecal junction)$|part of (ileum|jejunum)$/, {
    title: 'Bowel', how: 'Gas in the lumen scatters and reflects sound unpredictably. Graded compression with a linear probe pushes gas aside for the appendix and bowel wall.',
    windows: ['Graded compression over the region of interest'], measures: ['Wall thickness', 'Peristalsis', 'Appendix diameter', 'Free fluid'], physiology: ['Inflammation', 'Obstruction'],
  }),
  E(/calcaneal tendon/, {
    title: 'Achilles tendon', how: 'High-frequency linear probe on the back of the ankle. The fibrillar pattern is bright only when the beam is perpendicular to the fibres (anisotropy).',
    windows: ['Posterior ankle, longitudinal and transverse'], measures: ['Thickness and cross-sectional area', 'Tears', 'Neovascularisation (Doppler)', 'Stiffness (elastography)'], physiology: ['Tendinopathy', 'Tendon loading'],
  }),
  E(/tendon|ligament|retinaculum/, {
    title: 'Tendon / ligament', how: 'Superficial structures imaged with a high-frequency linear probe; keep the beam perpendicular to the fibres to avoid anisotropy artefact.',
    windows: ['Directly over the structure'], measures: ['Thickness', 'Integrity and tears', 'Dynamic gliding'], physiology: ['Injury and healing'],
  }),
  E(/rectus femoris|vastus|quadriceps/, {
    title: 'Quadriceps', how: 'Linear probe on the anterior thigh with minimal pressure; the femur gives a bright line and shadow beneath.',
    windows: ['Anterior thigh, transverse'], measures: ['Muscle thickness and cross-sectional area', 'Echo intensity', 'Pennation angle'], physiology: ['Muscle mass (sarcopenia, ICU wasting)', 'Muscle quality / fat infiltration'],
  }),
  E(/brain|white matter|cerebell|gyrus|occipital lobe|thalamus|pons|midbrain|medulla oblongata|(third|fourth|lateral) ventricle$|hippocampus|putamen|caudate nucleus|insula/, {
    title: 'Brain', how: 'The adult skull blocks conventional imaging; only Doppler through thin bone windows (and imaging through the open fontanelle in infants) is routine.',
    windows: ['Temporal bone window (Doppler)', 'Fontanelle (infants)'], measures: ['Midline shift (limited)', 'Ventricle size (infants)'], physiology: ['Cerebral blood flow (via arteries)'],
  }),
  E(/optic nerve/, {
    title: 'Optic nerve', how: 'Through the closed eyelid with a linear probe and reduced power; the nerve sheath is measured 3 mm behind the globe.',
    windows: ['Transorbital (closed eyelid)'], measures: ['Optic nerve sheath diameter'], physiology: ['Raised intracranial pressure (screening)'],
  }),
  E(/vitreous|lens|retina|sclera|cornea|anterior chamber/, {
    title: 'Eye', how: 'Fluid-filled globe gives an excellent window; high-frequency linear probe through the closed eyelid, at reduced (ophthalmic) output.',
    windows: ['Transorbital (closed eyelid)'], measures: ['Axial length', 'Retinal detachment', 'Vitreous haemorrhage'], physiology: ['Ocular pathology'],
  }),
  E(/\b(rib|sternum|manubrium|clavicle|vertebra|scapula|bone|femur|tibia|fibula|humerus|radius|ulna|sacrum|patella|calcaneus|talus|mandible|maxilla|atlas|axis)\b/, {
    title: 'Bone', how: 'Bone surfaces reflect strongly and appear as a bright line with a shadow beneath. Only the surface is imaged.',
    windows: ['Directly over the bone'], measures: ['Cortical contour (fractures)', 'Rib fractures', 'Guidance for nerve blocks and joint injections'], physiology: ['Fracture healing (callus)'],
  }),
];

export const CLASS_NOTES = {
  muscle: {how: 'Muscle is moderately echogenic with a striated (pennate) pattern; high-frequency linear probes show it well.', measures: ['Thickness and cross-sectional area', 'Echo intensity', 'Contraction (dynamic imaging)'], physiology: ['Muscle mass and quality']},
  blood: {how: 'Vessel lumen is anechoic; walls and flow are seen with B-mode and Doppler. Doppler velocity needs a beam-to-vessel angle ≤ 60°.', measures: ['Diameter', 'Doppler velocity waveform', 'Compressibility (veins)'], physiology: ['Flow and perfusion', 'Thrombosis']},
  nerve: {how: 'Peripheral nerves show a fascicular "honeycomb" pattern; best with high-frequency linear probes.', measures: ['Cross-sectional area', 'Guidance for nerve blocks'], physiology: ['Entrapment neuropathy']},
  gland: {how: 'Soft-tissue organ imaged in B-mode with Doppler for vascularity.', measures: ['Size', 'Focal lesions', 'Vascularity'], physiology: []},
  bowel: {how: 'Variable gas content makes bowel imaging unpredictable.', measures: ['Wall thickness', 'Peristalsis'], physiology: []},
  csf: {how: 'Fluid inside the skull; not reachable in adults except through bone windows.', measures: [], physiology: []},
  cartilage: {how: 'Hyaline cartilage is hypoechoic and transmits sound; costal cartilage can be a window (until it calcifies).', measures: ['Cartilage thickness (joints)'], physiology: ['Osteoarthritis']},
};

export function knowledgeFor(part) {
  const n = part.name.toLowerCase();
  const k = KNOWLEDGE.find((e) => e.match.test(n));
  if (k) return k;
  const c = CLASS_NOTES[part.tissue];
  return c ? {title: null, windows: [], ...c} : null;
}
