// lib/earth2/models.js
// EARTH 2 — Dinosaur Bay manifest (Merlin, 2026-10-22).
//
// Every creature, plant and landform the Tripo3D foundry produced for
// Earth 2, as data. The files themselves are the game-weight outputs
// of the optimization pass (public/models/earth2/<slug>.glb — textures
// capped at 1024px WebP, meshopt geometry; skins, joint names and
// node structure preserved from the Studio rigs).
//
// scaleM is the real-world size the Bay scales each model to:
//   basis 'length'   — nose-to-tail length (dinosaurs) or wingspan
//                      (the flyer); the scene matches the model's
//                      longest horizontal bind-pose extent to it.
//   basis 'height'   — plants and upstanding landforms.
//   basis 'diameter' — ground features (crater, tar pit).
// Landform sizes are scenic values (a real stratovolcano is measured
// in kilometres; the Bay is a diorama valley), chosen so the set
// reads at natural relative scale beside the animals.
//
// diet/social are the Foundry catalog assignments (herd / solo /
// pack / flock). posture is the BIND-POSE truth measured off the
// rigs (front-limb ends on the ground = quadruped stance), which is
// what the in-engine life driver walks on — Pachycephalosaurus is
// listed from the catalog; its model had not been uploaded when this
// manifest was written, so its file is null and the Bay shows an
// honest "still in the Studio" slot for it. When the real GLB lands
// it only needs optimizing to the same path and file: filled in —
// everything downstream is data-driven.

export const EARTH2_MODELS = [
  // ── Dinosaurs ────────────────────────────────────────────────────
  { slug: 'tyrannosaurus-rex', name: 'Tyrannosaurus rex', kind: 'dinosaur', file: '/models/earth2/tyrannosaurus-rex.glb', status: 'placed', scaleM: 12.3, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'triceratops', name: 'Triceratops', kind: 'dinosaur', file: '/models/earth2/triceratops.glb', status: 'placed', scaleM: 8.5, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'quadruped' },
  { slug: 'brachiosaurus', name: 'Brachiosaurus', kind: 'dinosaur', file: '/models/earth2/brachiosaurus.glb', status: 'placed', scaleM: 22, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'quadruped' },
  { slug: 'diplodocus', name: 'Diplodocus', kind: 'dinosaur', file: '/models/earth2/diplodocus.glb', status: 'placed', scaleM: 24, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'stegosaurus', name: 'Stegosaurus', kind: 'dinosaur', file: '/models/earth2/stegosaurus.glb', status: 'placed', scaleM: 9, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'quadruped' },
  { slug: 'ankylosaurus', name: 'Ankylosaurus', kind: 'dinosaur', file: '/models/earth2/ankylosaurus.glb', status: 'placed', scaleM: 8, scaleBasis: 'length', diet: 'herbivore', social: 'solo', posture: 'quadruped' },
  { slug: 'velociraptor', name: 'Velociraptor', kind: 'dinosaur', file: '/models/earth2/velociraptor.glb', status: 'placed', scaleM: 2, scaleBasis: 'length', diet: 'carnivore', social: 'pack', posture: 'biped' },
  { slug: 'spinosaurus', name: 'Spinosaurus', kind: 'dinosaur', file: '/models/earth2/spinosaurus.glb', status: 'placed', scaleM: 14, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'allosaurus', name: 'Allosaurus', kind: 'dinosaur', file: '/models/earth2/allosaurus.glb', status: 'placed', scaleM: 10.5, scaleBasis: 'length', diet: 'carnivore', social: 'pack', posture: 'biped' },
  { slug: 'parasaurolophus', name: 'Parasaurolophus', kind: 'dinosaur', file: '/models/earth2/parasaurolophus.glb', status: 'placed', scaleM: 10, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'dilophosaurus', name: 'Dilophosaurus', kind: 'dinosaur', file: '/models/earth2/dilophosaurus.glb', status: 'placed', scaleM: 6, scaleBasis: 'length', diet: 'carnivore', social: 'pack', posture: 'biped' },
  { slug: 'pachycephalosaurus', name: 'Pachycephalosaurus', kind: 'dinosaur', file: null, status: 'awaiting-upload', scaleM: 4.5, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'carnotaurus', name: 'Carnotaurus', kind: 'dinosaur', file: '/models/earth2/carnotaurus.glb', status: 'placed', scaleM: 8, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'iguanodon', name: 'Iguanodon', kind: 'dinosaur', file: '/models/earth2/iguanodon.glb', status: 'placed', scaleM: 10, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'gallimimus', name: 'Gallimimus', kind: 'dinosaur', file: '/models/earth2/gallimimus.glb', status: 'placed', scaleM: 6, scaleBasis: 'length', diet: 'omnivore', social: 'flock', posture: 'biped' },
  { slug: 'compsognathus', name: 'Compsognathus', kind: 'dinosaur', file: '/models/earth2/compsognathus.glb', status: 'placed', scaleM: 1, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },

  // ── Flyer ────────────────────────────────────────────────────────
  { slug: 'pteranodon', name: 'Pteranodon', kind: 'flyer', file: '/models/earth2/pteranodon.glb', status: 'placed', scaleM: 6, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'biped' },

  // ── Plants ───────────────────────────────────────────────────────
  { slug: 'tree-fern', name: 'Tree Fern', kind: 'plant', file: '/models/earth2/tree-fern.glb', status: 'placed', scaleM: 8, scaleBasis: 'height' },
  { slug: 'cycad-palm', name: 'Cycad Palm', kind: 'plant', file: '/models/earth2/cycad-palm.glb', status: 'placed', scaleM: 3, scaleBasis: 'height' },
  { slug: 'ginkgo-tree', name: 'Ginkgo Tree', kind: 'plant', file: '/models/earth2/ginkgo-tree.glb', status: 'placed', scaleM: 18, scaleBasis: 'height' },
  { slug: 'giant-conifer', name: 'Giant Conifer', kind: 'plant', file: '/models/earth2/giant-conifer.glb', status: 'placed', scaleM: 28, scaleBasis: 'height' },
  { slug: 'horsetail-reeds', name: 'Horsetail Reeds', kind: 'plant', file: '/models/earth2/horsetail-reeds.glb', status: 'placed', scaleM: 2, scaleBasis: 'height' },
  { slug: 'magnolia', name: 'Magnolia Tree', kind: 'plant', file: '/models/earth2/magnolia.glb', status: 'placed', scaleM: 10, scaleBasis: 'height' },
  { slug: 'bennettitales', name: 'Bennettitales', kind: 'plant', file: '/models/earth2/bennettitales.glb', status: 'placed', scaleM: 3, scaleBasis: 'height' },
  { slug: 'fern-ground-cover', name: 'Fern Ground Cover', kind: 'plant', file: '/models/earth2/fern-ground-cover.glb', status: 'placed', scaleM: 0.6, scaleBasis: 'height' },
  { slug: 'club-moss', name: 'Club Moss Cluster', kind: 'plant', file: '/models/earth2/club-moss.glb', status: 'placed', scaleM: 0.5, scaleBasis: 'height' },
  { slug: 'araucaria', name: 'Araucaria Tree', kind: 'plant', file: '/models/earth2/araucaria.glb', status: 'placed', scaleM: 25, scaleBasis: 'height' },

  // ── Landforms ────────────────────────────────────────────────────
  { slug: 'active-volcano', name: 'Active Volcano', kind: 'landform', file: '/models/earth2/active-volcano.glb', status: 'placed', scaleM: 55, scaleBasis: 'height' },
  { slug: 'dormant-volcano', name: 'Dormant Volcano', kind: 'landform', file: '/models/earth2/dormant-volcano.glb', status: 'placed', scaleM: 48, scaleBasis: 'height' },
  { slug: 'mountain-range', name: 'Mountain Range', kind: 'landform', file: '/models/earth2/mountain-range.glb', status: 'placed', scaleM: 65, scaleBasis: 'height' },
  { slug: 'cliff-face', name: 'Cliff Face', kind: 'landform', file: '/models/earth2/cliff-face.glb', status: 'placed', scaleM: 32, scaleBasis: 'height' },
  { slug: 'rocky-outcrop', name: 'Rocky Outcrop', kind: 'landform', file: '/models/earth2/rocky-outcrop.glb', status: 'placed', scaleM: 10, scaleBasis: 'height' },
  { slug: 'giant-boulder', name: 'Giant Boulder', kind: 'landform', file: '/models/earth2/giant-boulder.glb', status: 'placed', scaleM: 6, scaleBasis: 'height' },
  { slug: 'meteor-crater', name: 'Meteor Crater', kind: 'landform', file: '/models/earth2/meteor-crater.glb', status: 'placed', scaleM: 55, scaleBasis: 'diameter' },
  { slug: 'tar-pit', name: 'Tar Pit', kind: 'landform', file: '/models/earth2/tar-pit.glb', status: 'placed', scaleM: 16, scaleBasis: 'diameter' },
];

export const EARTH2_MODEL_BY_SLUG = new Map(EARTH2_MODELS.map((m) => [m.slug, m]));

export const earth2PlacedModels = () => EARTH2_MODELS.filter((m) => m.status === 'placed' && m.file);
export const earth2PendingModels = () => EARTH2_MODELS.filter((m) => m.status !== 'placed' || !m.file);
