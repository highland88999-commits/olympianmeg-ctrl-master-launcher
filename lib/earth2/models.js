// lib/earth2/models.js
// EARTH 2 — Dinosaur Bay manifest (Merlin, 2026-10-22).
//
// Every creature, plant and landform the Tripo3D foundry produced for
// Earth 2, as data. The files themselves are the game-weight outputs
// of the optimization pass (<slug>.glb — textures capped at 1024px
// WebP, meshopt geometry; skins, joint names and node structure
// preserved from the Studio rigs). Delivery is LOCKED: see "Locked
// delivery" at the bottom of this file — the models live in the
// private earth2-models bucket behind owner-signed URLs, and each
// entry's `file` is only the pre-migration public fallback path.
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
  { slug: 'spinosaurus', name: 'Spinosaurus', kind: 'dinosaur', file: '/models/earth2/spinosaurus.glb', status: 'placed', scaleM: 14, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped', guardian: true },
  { slug: 'allosaurus', name: 'Allosaurus', kind: 'dinosaur', file: '/models/earth2/allosaurus.glb', status: 'placed', scaleM: 10.5, scaleBasis: 'length', diet: 'carnivore', social: 'pack', posture: 'biped' },
  { slug: 'parasaurolophus', name: 'Parasaurolophus', kind: 'dinosaur', file: '/models/earth2/parasaurolophus.glb', status: 'placed', scaleM: 10, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'dilophosaurus', name: 'Dilophosaurus', kind: 'dinosaur', file: '/models/earth2/dilophosaurus.glb', status: 'placed', scaleM: 6, scaleBasis: 'length', diet: 'carnivore', social: 'pack', posture: 'biped' },
  { slug: 'pachycephalosaurus', name: 'Pachycephalosaurus', kind: 'dinosaur', file: null, status: 'awaiting-upload', scaleM: 4.5, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'carnotaurus', name: 'Carnotaurus', kind: 'dinosaur', file: '/models/earth2/carnotaurus.glb', status: 'placed', scaleM: 8, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'iguanodon', name: 'Iguanodon', kind: 'dinosaur', file: '/models/earth2/iguanodon.glb', status: 'placed', scaleM: 10, scaleBasis: 'length', diet: 'herbivore', social: 'herd', posture: 'biped' },
  { slug: 'gallimimus', name: 'Gallimimus', kind: 'dinosaur', file: '/models/earth2/gallimimus.glb', status: 'placed', scaleM: 6, scaleBasis: 'length', diet: 'omnivore', social: 'flock', posture: 'biped' },
  { slug: 'compsognathus', name: 'Compsognathus', kind: 'dinosaur', file: '/models/earth2/compsognathus.glb', status: 'placed', scaleM: 1, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  // The apex hybrids (Merlin, 2026-10-22). The Spinosaurus Rex
  // landed the same day and stalks the tar pit's edge, scaled
  // noticeably past its round-1 cousin (16.5 m against the
  // spinosaurus's 14). The Indominus landed with the aquatic
  // round — rigged in the Studio (78 joints, humanoid-retarget
  // dialect), weight-passed to the path below, and placed on
  // the west rim opposite the tar pit: the Bay's second apex,
  // at a natural 16 m.
  { slug: 'indominus-rex', name: 'Indominus Rex', kind: 'dinosaur', file: '/models/earth2/indominus-rex.glb', status: 'placed', scaleM: 16, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'spinosaurus-rex', name: 'Spinosaurus Rex', kind: 'dinosaur', file: '/models/earth2/spinosaurus-rex.glb', status: 'placed', scaleM: 16.5, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },

  // ── The compy swarm ────────────────────────────────────────────
  // "Copies" (Merlin, 2026-10-22): a swarm of tiny Compsognathus
  // clones — no file of its own; it rides the compsognathus model
  // (sourceSlug) at swarm scale. Config: lib/earth2/creatures.js.
  { slug: 'compy-swarm', name: 'Compy Swarm', kind: 'swarm', file: null, sourceSlug: 'compsognathus', status: 'placed', scaleM: 0.4, scaleBasis: 'length', diet: 'carnivore', social: 'pack', posture: 'biped' },

  // ── The blood-sac loop (Merlin, 2026-10-22) ────────────────────
  // Giant mosquitos feed on the dinosaurs; shoot a full one for a
  // blood sac; Dracula at Castle Transylvania trades sacs for gifts.
  // The whole Transylvania cast landed the day it was ordered —
  // the real rigged Studio models, optimized to the paths below
  // (the castle took the landform treatment: generate-only in the
  // Studio at ~2M triangles, simplified to game weight here).
  { slug: 'giant-mosquito', name: 'Giant Mosquito', kind: 'insect', file: '/models/earth2/giant-mosquito.glb', status: 'placed', scaleM: 1.2, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'castle-transylvania', name: 'Castle Transylvania', kind: 'landform', file: '/models/earth2/castle-transylvania.glb', status: 'placed', scaleM: 40, scaleBasis: 'height' },
  { slug: 'dracula', name: 'Dracula', kind: 'character', file: '/models/earth2/dracula.glb', status: 'placed', scaleM: 1.9, scaleBasis: 'height' },
  { slug: 'vampire-bat', name: 'Vampire Bat', kind: 'flyer', file: '/models/earth2/vampire-bat.glb', status: 'placed', scaleM: 0.9, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'quadruped' },

  // ── The Royal Tyrrell Museum & John Hammond (Phase 2 mount, ───
  // 2026-10-23) ──────────────────────────────────────────────────
  // The fossil economy's counter (lib/earth2/museum.js): the
  // museum building on its site parcel E2-0510 and the founder at
  // his stand point, mounted in the WALKABLE WORLD only. Both are
  // worldOnly: the Dinosaur Bay diorama never places them (its
  // generic set-piece loops must not pick them up), and they
  // stream by proximity at the site like every other world unit
  // (lib/earth2/streaming.js, the 'museum' unit). Delivery is the
  // same sealed door as the whole cast — bucket keys museum.glb /
  // hammond.glb behind owner-signed URLs, never a public path.
  // Scales: the museum GLB is a unit-normalized diorama (museum +
  // parking lot); basis 'length' matches its widest horizontal
  // extent (the frontage) to 25 m, so it sits convincingly on its
  // 28 m parcel with its apron toward Hammond. Hammond rides the
  // 65-joint Mixamo template at a natural 1.8 m.
  { slug: 'museum', name: 'Royal Tyrrell Museum', kind: 'structure', file: '/models/earth2/museum.glb', status: 'placed', scaleM: 25, scaleBasis: 'length', worldOnly: true },
  { slug: 'hammond', name: 'John Hammond', kind: 'character', file: '/models/earth2/hammond.glb', status: 'placed', scaleM: 1.8, scaleBasis: 'height', worldOnly: true },

  // ── Tyrrell Field & the fleet (Vehicles Phase 1, 2026-10-23) ──
  // Earth 2's first airport and its four machines, mounted in the
  // WALKABLE WORLD only (all worldOnly, like the museum pair —
  // the Bay diorama never places them). The field stands on its
  // designated Free Commons grounds (lib/earth2/airport.js); the
  // fleet sleeps on its apron and drives/flies under the pure
  // step logic in lib/earth2/vehicles.js. Delivery is the same
  // sealed door as the whole cast — bucket keys rover.glb /
  // speed-bike.glb / scarab.glb / vtol.glb / airport.glb behind
  // owner-signed URLs, never a public path. Scales: the rover,
  // bike and scarab ride their Studio rigs (26 / 78 / 38 joints);
  // the VTOL and the terminal are unrigged single meshes, the
  // terminal a unit-normalized diorama whose wide axis (basis
  // 'length') reads 60 m across its grounds.
  { slug: 'airport', name: 'Tyrrell Field', kind: 'structure', file: '/models/earth2/airport.glb', status: 'placed', scaleM: 60, scaleBasis: 'length', worldOnly: true },
  { slug: 'rover', name: 'Expedition Rover', kind: 'vehicle', file: '/models/earth2/rover.glb', status: 'placed', scaleM: 4.6, scaleBasis: 'length', worldOnly: true },
  { slug: 'speed-bike', name: 'Speed Bike', kind: 'vehicle', file: '/models/earth2/speed-bike.glb', status: 'placed', scaleM: 2.6, scaleBasis: 'length', worldOnly: true },
  { slug: 'scarab', name: 'Scarab Cruiser', kind: 'vehicle', file: '/models/earth2/scarab.glb', status: 'placed', scaleM: 5, scaleBasis: 'length', worldOnly: true },
  { slug: 'vtol', name: 'VTOL Scout', kind: 'vehicle', file: '/models/earth2/vtol.glb', status: 'placed', scaleM: 11, scaleBasis: 'length', worldOnly: true },
  // Terrain Wave B (2026-10-23): the River Runner — Merlin
  // commissioned the hull in Tripo ("a boat for speed travel
  // down the rivers"), generated + retopologized, NOT rigged
  // (a hull articulates in-engine, like the structures). Its
  // water law lives in lib/earth2/vehicles.js (BOAT_SPEC /
  // stepBoat); its moorings in lib/earth2/fleet.js. The local
  // file under public/ is a convenience copy for the dev tree
  // ONLY — the sealed copy lives in the private earth2-models
  // bucket as boat.glb and the world loads it through the signed
  // door like every Earth 2 model; the public path is never in
  // a push list.
  { slug: 'boat', name: 'River Runner', kind: 'vehicle', file: '/models/earth2/boat.glb', status: 'placed', scaleM: 7.7, scaleBasis: 'length', worldOnly: true },

  // ── Flyers ───────────────────────────────────────────────────────
  // The Pteranodon was round 1's lone flyer; round 3 (the aerial
  // wing) fills the sky with eight more, all rigged in the Studio
  // and weight-passed to the paths below. Six ride the 78-joint
  // humanoid-retarget template — arm chains skin the wings,
  // exactly as on the Pteranodon — and three are Tripo-native
  // (quetzalcoatlus 12j, tapejara 42j, pterodactylus 38j) whose
  // wings are unnamed bone_N fans, resolved from measurements in
  // bones.js resolveFlyerWings. Per-species circuits live in
  // creatures.js FLYERS. scaleM is the WINGSPAN (basis 'length',
  // the flyer convention in the header: the scene matches the
  // longest horizontal bind-pose extent — for a spread-wing bind
  // that IS the span; the Quetzalcoatlus binds with its wings
  // folded up, so its span reads through the body extent and the
  // model flies a touch proud, which its 46 m circuit absorbs).
  { slug: 'pteranodon', name: 'Pteranodon', kind: 'flyer', file: '/models/earth2/pteranodon.glb', status: 'placed', scaleM: 6, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'biped' },
  { slug: 'quetzalcoatlus', name: 'Quetzalcoatlus', kind: 'flyer', file: '/models/earth2/quetzalcoatlus.glb', status: 'placed', scaleM: 10.5, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'hatzegopteryx', name: 'Hatzegopteryx', kind: 'flyer', file: '/models/earth2/hatzegopteryx.glb', status: 'placed', scaleM: 10, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'biped' },
  { slug: 'tapejara', name: 'Tapejara', kind: 'flyer', file: '/models/earth2/tapejara.glb', status: 'placed', scaleM: 5, scaleBasis: 'length', diet: 'omnivore', social: 'flock', posture: 'biped' },
  { slug: 'nyctosaurus', name: 'Nyctosaurus', kind: 'flyer', file: '/models/earth2/nyctosaurus.glb', status: 'placed', scaleM: 2.8, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'biped' },
  { slug: 'pterodactylus', name: 'Pterodactylus', kind: 'flyer', file: '/models/earth2/pterodactylus.glb', status: 'placed', scaleM: 1.5, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'biped' },
  { slug: 'dimorphodon', name: 'Dimorphodon', kind: 'flyer', file: '/models/earth2/dimorphodon.glb', status: 'placed', scaleM: 1.5, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'biped' },
  { slug: 'rhamphorhynchus', name: 'Rhamphorhynchus', kind: 'flyer', file: '/models/earth2/rhamphorhynchus.glb', status: 'placed', scaleM: 1.8, scaleBasis: 'length', diet: 'carnivore', social: 'flock', posture: 'biped' },
  { slug: 'archaeopteryx', name: 'Archaeopteryx', kind: 'flyer', file: '/models/earth2/archaeopteryx.glb', status: 'placed', scaleM: 0.6, scaleBasis: 'length', diet: 'omnivore', social: 'flock', posture: 'biped' },

  // ── Marine (round 2 — the aquatic wing) ──────────────────────────
  // The lake's cast, all eight rigged in the Studio and weight-
  // passed to the paths below. Four ride the 78-joint humanoid-
  // retarget template (mosasaurus, kronosaurus, elasmosaurus,
  // ichthyosaurus — arm chains skin the front flippers, thigh
  // chains the hind, and the tail is skinned to the pelvis, so
  // the swim wave sweeps the pelvis end). Four are Tripo-native
  // spine chains — plesiosaurus 29, liopleurodon 23, tylosaurus
  // 14, megalodon 14 — whose swim rig is resolved from the joint
  // TREE (bones.js resolveSwimRig, measured off the real files).
  // habitat 'water' is their placement data: they live in the
  // lake (creatures.js LAKE + SWIMMERS), never on land.
  { slug: 'mosasaurus', name: 'Mosasaurus', kind: 'marine', file: '/models/earth2/mosasaurus.glb', status: 'placed', scaleM: 15, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'kronosaurus', name: 'Kronosaurus', kind: 'marine', file: '/models/earth2/kronosaurus.glb', status: 'placed', scaleM: 10, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'elasmosaurus', name: 'Elasmosaurus', kind: 'marine', file: '/models/earth2/elasmosaurus.glb', status: 'placed', scaleM: 14, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'ichthyosaurus', name: 'Ichthyosaurus', kind: 'marine', file: '/models/earth2/ichthyosaurus.glb', status: 'placed', scaleM: 5, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'plesiosaurus', name: 'Plesiosaurus', kind: 'marine', file: '/models/earth2/plesiosaurus.glb', status: 'placed', scaleM: 7, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'liopleurodon', name: 'Liopleurodon', kind: 'marine', file: '/models/earth2/liopleurodon.glb', status: 'placed', scaleM: 6.5, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'tylosaurus', name: 'Tylosaurus', kind: 'marine', file: '/models/earth2/tylosaurus.glb', status: 'placed', scaleM: 14, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },
  { slug: 'megalodon', name: 'Megalodon', kind: 'marine', file: '/models/earth2/megalodon.glb', status: 'placed', scaleM: 15, scaleBasis: 'length', diet: 'carnivore', social: 'solo', posture: 'swimmer', habitat: 'water' },

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
// Pending = still in the Studio (awaiting-upload). Presence entries
// like the compy swarm are 'placed' with no file of their own —
// they ride a source model's file and are never pending.
export const earth2PendingModels = () => EARTH2_MODELS.filter((m) => m.status === 'awaiting-upload');

// ── Locked delivery (Merlin's isolation rule, 2026-10-22) ────────
// "No characters for earth 2 should appear anywhere in the multiverse
// except in earth 2 file which is behind lock and key to my account
// until oblivion day." So the models move OUT of the public web root
// into a PRIVATE Supabase Storage bucket (earth2-models), where each
// model is addressed by a RELATIVE key — its plain filename, e.g.
// 'tyrannosaurus-rex.glb'. The only door is the owner-gated route
// app/api/earth2/model-urls: it verifies the owner's session
// server-side and mints short-lived (1h) signed URLs for manifest
// keys only. The Bay resolves every load through earth2ModelUrl()
// below; scene code never hard-codes a model path.
//
// EARTH2_PUBLIC_FALLBACK is the migration bridge. While true, when
// signed delivery is unavailable (bucket not created yet, route
// answering setupRequired) the Bay falls back to the public path in
// each entry's `file`, so the chamber keeps working until the bucket
// migration is verified. The migration step flips this to false and
// deletes the public files; from then on the models exist only
// behind the owner's signed URLs.

export const EARTH2_MODEL_BUCKET = 'earth2-models';
export const EARTH2_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
export const EARTH2_PUBLIC_FALLBACK = false;

// The bucket object key for an entry: the relative filename of its
// model ('tyrannosaurus-rex.glb'). Entries without a file (still in
// the Studio) have no key yet.
export function earth2ModelKey(entry) {
  if (!entry || !entry.file) return null;
  const base = String(entry.file).split('/').pop();
  return base || null;
}

// Every key the model-urls route may ever sign — derived from this
// manifest, never from the request alone.
export function earth2ModelKeys() {
  return earth2PlacedModels().map(earth2ModelKey).filter(Boolean);
}

export function isEarth2ModelKey(key) {
  return typeof key === 'string' && earth2ModelKeys().includes(key);
}

// The URL the Bay loads an entry from: the signed URL when the
// chamber fetched one for its key; otherwise the public fallback
// (only while EARTH2_PUBLIC_FALLBACK holds); otherwise null — the
// model simply does not load.
export function earth2ModelUrl(entry, signedUrls) {
  const key = earth2ModelKey(entry);
  if (key && signedUrls && typeof signedUrls[key] === 'string' && signedUrls[key]) {
    return signedUrls[key];
  }
  if (EARTH2_PUBLIC_FALLBACK && entry && entry.file) return entry.file;
  return null;
}

// Fetch the signed-URL map from the owner-gated route, once. Returns
// an object { key: signedUrl }, or null when delivery is unavailable
// (signed out, not the owner, vault not set up yet) — callers fall
// back per earth2ModelUrl().
export async function fetchEarth2ModelUrls({ token, keys, fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch || !token) return null;
  try {
    const res = await doFetch('/api/earth2/model-urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        keys: Array.isArray(keys) && keys.length ? keys : earth2ModelKeys(),
      }),
    });
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !data.ok || !data.urls || typeof data.urls !== 'object') return null;
    return data.urls;
  } catch {
    return null;
  }
}
