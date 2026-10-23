// lib/earth2/bones.js
// Bone-role resolver for the Earth 2 foundry rigs (Merlin, 2026-10-22).
//
// The Tripo Studio rigs arrive in THREE naming dialects, measured off
// the real files:
//   · humanoid retarget — 'BoneRoot', 'Pelvis', 'L_Thigh', 'L_Calf',
//     'Spine01', 'NeckTwist01', 'Head', 'FacialBone', finger chains…
//     (13 of the 17 creatures). These rigs carry NO tail bones — the
//     tail is skinned to the pelvis — so tail resolves empty and the
//     life driver simply skips tail sway for them.
//   · Tripo-native — 'tripo::Root', 'tripo::Spine_0…', 'tripo::Head_0…',
//     'tripo::Tail_0…', 'tripo::0_Left_Limb_0…' (limb group 0 hangs
//     toward the head end = the FRONT pair; group 1 = the hind pair),
//     plus unnamed 'bone_N' extras (frills, horns) that carry no role.
//     (triceratops, brachiosaurus, ankylosaurus, iguanodon)
//   · Mixamo — 'mixamorig:Hips', 'mixamorig:LeftUpLeg',
//     'mixamorig:Spine1', 'mixamorig:LeftForeArm'… (Dracula, the one
//     true humanoid of the Transylvania cast).
//
// Two Transylvania rigs are Tripo-native in name but carry their
// anatomy in UNNAMED bone_N chains; those get dedicated measured
// resolvers below (resolveMosquitoRig, resolveBatWings) built from
// the skin-weight geometry of the real files, not from guesses.
// The round-3 flyers split the same way — the humanoid template's
// arm chains skin the wings (as on the Pteranodon), while the
// Tripo-native flyers carry theirs in unnamed fans that only the
// measured table in resolveFlyerWings knows.
//
// Pure and name-based: feed it the joint names exactly as loaded and
// it hands back roles in those same names. Anything it cannot find
// comes back null / [] — the driver treats a missing role as "that
// motion does not happen for this animal", never as an error.

export function normalizeJointName(name) {
  // Raw glTF names carry the brand prefixes; three's GLTFLoader
  // runs node names through PropertyBinding.sanitizeNodeName, which
  // strips ':' — so the same joint arrives as 'tripoSpine_0' or
  // 'mixamorigHips' at runtime. Strip brand + colons either way
  // ('tripo::Spine_0', 'tripoSpine_0' and 'Spine_0' are the same
  // bone to us; so are 'mixamorig:Hips' and 'Hips').
  return String(name || '')
    .replace(/\s/g, '_')
    .replace(/^tripo:{0,2}/i, '')
    .replace(/^mixamorig:?/i, '')
    .replace(/:/g, '');
}

const chainOf = (byNorm, base) => {
  const out = [];
  for (const [norm, orig] of byNorm) {
    const m = norm.match(new RegExp(`^${base}_(\\d+)$`));
    if (m) out.push({ idx: Number(m[1]), orig });
  }
  return out.sort((a, b) => a.idx - b.idx).map((e) => e.orig);
};

export function resolveBones(jointNames) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const byNorm = new Map(); // normalized -> original (first wins)
  for (const n of names) {
    const k = normalizeJointName(n);
    if (!byNorm.has(k)) byNorm.set(k, n);
  }
  const get = (norm) => byNorm.get(norm) || null;
  const jawName =
    names.find((n) => /jaw/i.test(normalizeJointName(n))) || null;

  const isTripo = [...byNorm.keys()].some(
    (k) => /^(Spine|Head|Tail)_\d+$/.test(k) || /^\d+_(Left|Right)_Limb_\d+$/.test(k)
  );

  const roles = {
    dialect: 'unknown',
    root: null,
    pelvis: null,
    spine: [],
    neck: [],
    head: null,
    jaw: jawName,
    tail: [],
    legs: [],
    wings: [],
  };

  if (isTripo) {
    roles.dialect = 'tripo';
    roles.root = get('Root');
    roles.spine = chainOf(byNorm, 'Spine');
    roles.pelvis = roles.spine[0] || roles.root;
    const headChain = chainOf(byNorm, 'Head');
    roles.head = headChain.length ? headChain[headChain.length - 1] : null;
    roles.neck = headChain.slice(0, -1);
    roles.tail = chainOf(byNorm, 'Tail');
    // Limb groups: /^(\d+)_(Left|Right)_Limb_(\d+)$/ — group 0 is the
    // front pair (it hangs off the head end of the spine), group 1
    // the hind pair. thigh = _0, calf = _1, foot = _2 (toes ignored).
    const groups = new Map(); // `${g}|${side}` -> [{idx, orig}]
    for (const [norm, orig] of byNorm) {
      const m = norm.match(/^(\d+)_(Left|Right)_Limb_(\d+)$/);
      if (!m) continue;
      const key = `${m[1]}|${m[2]}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ idx: Number(m[3]), orig });
    }
    const groupIdxs = [...new Set([...groups.keys()].map((k) => Number(k.split('|')[0])))].sort(
      (a, b) => a - b
    );
    const pairOf = (g) => (g === groupIdxs[0] ? 'front' : 'hind');
    for (const g of groupIdxs) {
      for (const side of ['Left', 'Right']) {
        const chain = (groups.get(`${g}|${side}`) || []).sort((a, b) => a.idx - b.idx);
        if (!chain.length) continue;
        const at = (i) => (chain[i] ? chain[i].orig : chain[chain.length - 1].orig);
        roles.legs.push({
          side: side.toLowerCase(),
          pair: pairOf(g),
          thigh: at(0),
          calf: chain[1] ? chain[1].orig : null,
          foot: chain[2] ? chain[2].orig : null,
        });
      }
    }
    return roles;
  }

  const isMixamo = byNorm.has('Hips')
    && (byNorm.has('LeftUpLeg') || byNorm.has('RightUpLeg') || byNorm.has('LeftArm'));
  if (isMixamo) {
    roles.dialect = 'mixamo';
    roles.root = get('Hips');
    roles.pelvis = get('Hips');
    roles.spine = ['Spine', 'Spine1', 'Spine2'].map(get).filter(Boolean);
    roles.neck = ['Neck', 'Neck1'].map(get).filter(Boolean);
    roles.head = get('Head');
    roles.tail = [];
    for (const sideName of ['Left', 'Right']) {
      const side = sideName.toLowerCase();
      const upLeg = get(`${sideName}UpLeg`);
      if (upLeg) {
        roles.legs.push({
          side,
          pair: 'hind',
          thigh: upLeg,
          calf: get(`${sideName}Leg`),
          foot: get(`${sideName}Foot`),
        });
      }
      const arm = get(`${sideName}Arm`);
      if (arm) {
        const chain = [arm, get(`${sideName}ForeArm`), get(`${sideName}Hand`)].filter(Boolean);
        roles.legs.push({
          side,
          pair: 'front',
          thigh: arm,
          calf: get(`${sideName}ForeArm`),
          foot: get(`${sideName}Hand`),
        });
        roles.wings.push({ side, chain });
      }
    }
    return roles;
  }

  const isHumanoid = [...byNorm.keys()].some((k) =>
    /(_Thigh|_Upperarm|Spine01|Pelvis|BoneRoot)/.test(k)
  );
  if (isHumanoid) {
    roles.dialect = 'humanoid';
    roles.root = get('BoneRoot') || get('Hip') || get('Pelvis');
    roles.pelvis = get('Pelvis') || get('Hip');
    roles.spine = ['Waist', 'Spine01', 'Spine02'].map(get).filter(Boolean);
    roles.neck = [...byNorm.keys()]
      .filter((k) => /^Neck/.test(k))
      .sort()
      .map((k) => byNorm.get(k));
    roles.head = get('Head');
    roles.tail = [...byNorm.keys()]
      .filter((k) => /tail/i.test(k))
      .sort()
      .map((k) => byNorm.get(k));
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'left' : 'right';
      const thigh = get(`${s}_Thigh`);
      if (thigh) {
        roles.legs.push({
          side,
          pair: 'hind',
          thigh,
          calf: get(`${s}_Calf`),
          foot: get(`${s}_Foot`),
        });
      }
      const upper = get(`${s}_Upperarm`);
      if (upper) {
        const chain = [upper, get(`${s}_Forearm`), get(`${s}_Hand`)].filter(Boolean);
        roles.legs.push({
          side,
          pair: 'front',
          thigh: upper,
          calf: get(`${s}_Forearm`),
          foot: get(`${s}_Hand`),
        });
        roles.wings.push({ side, chain });
      }
    }
    return roles;
  }

  return roles;
}

// ── The swim resolver ────────────────────────────────────────
// The sea cast (round 2) swims on its axial chain: head → spine →
// tail, undulated laterally, with the side branches paddling.
// Two shapes arrive:
//   · humanoid retarget (mosasaurus, kronosaurus, elasmosaurus,
//     ichthyosaurus — the full 78-joint template): the axial
//     chain is pelvis → waist → spine → neck → head (these rigs
//     skin the tail to the pelvis, so the pelvis end does the
//     sweeping), the arm chains are the FRONT flippers and the
//     thigh chains the HIND flippers. Names alone suffice.
//   · Tripo-native spines (plesiosaurus 29j, liopleurodon 23j,
//     tylosaurus 14j, megalodon 14j): the anatomy lives in the
//     joint TREE — measured off the real files (skin centroids,
//     2026-10-22): the head chain and the tail chain hang off a
//     shared root, and every flipper is a side branch of that
//     axis (the plesiosaur's front flippers are even NAMED
//     Spine_3/Spine_4 — names lie, trees don't). So this path
//     takes (jointNames, parents) — parents[i] is the parent
//     joint's name, or anything outside the joint set for a root
//     joint — and walks: axial = head → … → lowest common
//     ancestor → … → tail; every other branch off the axis with
//     a chain of 2+ is a flipper (front/mid/hind by where it
//     attaches along the axis); the rest are extras, driven as
//     gentle follow-through. Axial order is HEAD → TAIL in both
//     dialects, so the wave math in the Bay is shared.
export function resolveSwimRig(jointNames, parents) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const par = Array.isArray(parents) ? parents : [];
  const empty = { dialect: 'unknown', head: null, axial: [], flippers: [], extras: [] };
  if (!names.length) return empty;

  const roles = resolveBones(names);
  if (roles.dialect === 'humanoid') {
    const axial = [
      roles.head,
      ...roles.neck.slice().reverse(),
      ...roles.spine.slice().reverse(),
      roles.pelvis,
    ].filter(Boolean);
    const flippers = [
      ...roles.wings.map((w) => ({ pair: 'front', side: w.side, chain: w.chain.slice() })),
      ...roles.legs
        .filter((l) => l.pair === 'hind')
        .map((l) => ({ pair: 'hind', side: l.side, chain: [l.thigh, l.calf, l.foot].filter(Boolean) })),
    ].filter((f) => f.chain.length);
    return { dialect: 'humanoid', head: roles.head, axial, flippers, extras: [] };
  }

  // Tree path — resolve parent links through the same
  // normalization the name resolver uses (a parent spelled
  // 'tripo::Root' and a joint spelled 'tripoRoot' are one bone).
  const byNorm = new Map();
  for (const n of names) {
    const k = normalizeJointName(n);
    if (!byNorm.has(k)) byNorm.set(k, n);
  }
  const parentOf = new Map(); // original -> original | null
  names.forEach((n, i) => {
    const pk = par[i] != null ? normalizeJointName(par[i]) : null;
    parentOf.set(n, pk && byNorm.has(pk) && byNorm.get(pk) !== n ? byNorm.get(pk) : null);
  });
  const childrenOf = new Map(names.map((n) => [n, []]));
  for (const n of names) {
    const p = parentOf.get(n);
    if (p && childrenOf.has(p)) childrenOf.get(p).push(n);
  }
  const pathUp = (j) => {
    const out = [];
    let cur = j;
    while (cur && !out.includes(cur)) { out.push(cur); cur = parentOf.get(cur); }
    return out;
  };
  const longestDown = (start, banned) => {
    // Longest downward path from `start` (inclusive), never
    // stepping into `banned`; ties keep the first child in
    // joint-list order, so the result is deterministic.
    let best = [start];
    for (const theChild of (childrenOf.get(start) || [])) {
      if (banned && banned.has(theChild)) continue;
      const sub = longestDown(theChild, banned);
      if (sub.length + 1 > best.length) best = [start, ...sub];
    }
    return best;
  };

  const chainOfNorm = (base) => {
    const out = [];
    for (const [norm, orig] of byNorm) {
      const m = norm.match(new RegExp(`^${base}_(\\d+)$`));
      if (m) out.push({ idx: Number(m[1]), orig });
    }
    return out.sort((a, b) => a.idx - b.idx).map((e) => e.orig);
  };
  const headChain = chainOfNorm('Head');
  const tailChain = chainOfNorm('Tail');
  const head = headChain.length ? headChain[headChain.length - 1] : null;
  const tail = tailChain.length ? tailChain[tailChain.length - 1] : null;

  let axial = [];
  if (head && tail) {
    const upHead = pathUp(head);
    const upTail = pathUp(tail);
    const tailSet = new Set(upTail);
    const lca = upHead.find((j) => tailSet.has(j)) || null;
    if (lca) {
      axial = [
        ...upHead.slice(0, upHead.indexOf(lca) + 1),
        ...upTail.slice(0, upTail.indexOf(lca)).reverse(),
      ];
    }
  }
  if (!axial.length) {
    // No readable head/tail pair: the longest root-to-leaf path
    // is the body axis of every spine rig these exporters make.
    const roots = names.filter((n) => parentOf.get(n) === null);
    let best = [];
    for (const r of roots) {
      const p = longestDown(r, null);
      if (p.length > best.length) best = p;
    }
    axial = best;
  }
  if (!axial.length) return { ...empty, dialect: roles.dialect };

  const axialSet = new Set(axial);
  const covered = new Set(axial);
  const flippers = [];
  const extras = [];
  const sideOf = (chain) => {
    const joined = chain.join(' ');
    if (/Left/.test(joined)) return 'left';
    if (/Right/.test(joined)) return 'right';
    return flippers.length % 2 === 0 ? 'left' : 'right';
  };
  // Branches off the axis, in axial order: a chain of 2+ paddles;
  // a lone bone just sways with the extras.
  axial.forEach((joint, ai) => {
    for (const child of childrenOf.get(joint) || []) {
      if (axialSet.has(child) || covered.has(child)) continue;
      const chain = longestDown(child, axialSet);
      chain.forEach((c) => covered.add(c));
      if (chain.length >= 2) {
        const f = axial.length > 1 ? ai / (axial.length - 1) : 0;
        flippers.push({
          pair: f <= 0.4 ? 'front' : f >= 0.6 ? 'hind' : 'mid',
          side: sideOf(chain),
          chain,
        });
      } else {
        extras.push(chain);
      }
    }
  });
  // Anything still uncovered (a sub-branch off a flipper chain —
  // the plesiosaur's second left-blade bone, say) sways as an
  // extra on its own longest line.
  for (const n of names) {
    if (covered.has(n)) continue;
    const chain = longestDown(n, covered);
    chain.forEach((c) => covered.add(c));
    if (chain.length) extras.push(chain);
  }

  return { dialect: 'tripo', head: head || axial[0], axial, flippers, extras };
}

// ── Measured resolvers for the unnamed Transylvania rigs ──────
// The giant mosquito and the vampire bat arrived as Tripo-native
// rigs whose anatomy lives in unnamed bone_N chains. The names
// below were MEASURED off the real files (2026-10-22) by skin
// weight: per-joint vertex mass, centroids and the joint tree.
// They are facts about these two files, in the same spirit as the
// dialect tables above — a re-export with different bone_N names
// would resolve empty here and the Bay would skip those motions,
// never error.

// The mosquito's abdomen is the bone chain running BACKWARD from
// the thorax (tripo::Spine_0): bone_4 is the thorax junction, then
// bone_5 (the great mass of the abdomen) → bone_6 → bone_7 →
// bone_8 toward the tip, with the two dangling hind-leg chains
// hanging off bone_7/bone_8. The swelling set is bone_5..bone_8.
// There is NO bone NAMED for the abdomen, and the model is a
// single skinned mesh — so the feeding tell drives these bones'
// scale (a true local swell) plus a subtle whole-body redden on
// the mosquito's own material instance.
// The wings are the two chains that RISE from the thorax junction
// in a V (bone_26… on one side, bone_32… on the other); the six
// forward chains off the root are the legs, the two short ones
// the antennae — all accounted for, none of them driven.
// Wing flap signs are mirrored about the local X axis; bone-local
// axis conventions are assumed, as with every rig here — the
// on-device look is the verdict.
const MOSQUITO_ABDOMEN = ['bone_5', 'bone_6', 'bone_7', 'bone_8'];
const MOSQUITO_WING_ROOTS = [
  { name: 'bone_26', sign: 1 },
  { name: 'bone_32', sign: -1 },
];

export function resolveMosquitoRig(jointNames) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const present = new Map(); // normalized -> original
  for (const n of names) {
    const k = normalizeJointName(n);
    if (!present.has(k)) present.set(k, n);
  }
  const get = (norm) => present.get(norm) || null;
  return {
    abdomen: MOSQUITO_ABDOMEN.map(get).filter(Boolean),
    wingRoots: MOSQUITO_WING_ROOTS
      .map((w) => ({ name: get(w.name), sign: w.sign }))
      .filter((w) => w.name),
  };
}

// The bat's wings are the two unnamed chains rooted at
// tripo::Spine_1: bone_6… sweeps to one side (−z in bind pose),
// bone_15… mirrors it (+z). The named 0_Left/Right_Limb chains
// point DOWN — they are the bat's little legs, not wings, and
// the generic Tripo branch above reads them as legs. Flap bends
// root + mid of each wing chain about the local X axis with
// mirrored signs (the same rotation lifts one wing and drops
// the other, so the signs must oppose).
const BAT_WING_CHAINS = [
  { chain: ['bone_6', 'bone_7', 'bone_8', 'bone_9'], sign: 1 },
  { chain: ['bone_15', 'bone_16', 'bone_17', 'bone_18'], sign: -1 },
];

export function resolveBatWings(jointNames) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const present = new Map();
  for (const n of names) {
    const k = normalizeJointName(n);
    if (!present.has(k)) present.set(k, n);
  }
  const get = (norm) => present.get(norm) || null;
  return BAT_WING_CHAINS
    .map((w) => ({ chain: w.chain.map(get).filter(Boolean), sign: w.sign }))
    .filter((w) => w.chain.length);
}

// ── The flyer wing resolver (round 3 — the aerial wing) ──────
// Flight needs WINGS: the two chains a flyer actually flaps, as
// [{ side, chain }] — the same shape resolveBones returns in its
// wings role, so the Bay drives every dialect identically.
//   · Humanoid retarget (the 78-joint template — five of the new
//     pterosaurs plus the Archaeopteryx, like the Pteranodon and
//     the T. rex before them): the arm chains skin the wings,
//     and resolveBones already hands them back — this resolver
//     simply passes them through.
//   · Tripo-native (quetzalcoatlus 12j, tapejara 42j,
//     pterodactylus 38j): the wings are UNNAMED bone_N chains no
//     name pattern can read. The tables below were MEASURED off
//     the real files (2026-10-22) by skin-weight centroid:
//       quetzalcoatlus — the body runs along Z, head at −Z. The
//         only two side chains off the bone_1 junction are the
//         wings, folded upward in bind pose: bone_5→bone_6 runs
//         out to +X, bone_7→bone_8 mirrors it to −X. The lone
//         named limb chain sits at the rear — legs, never wings.
//       tapejara — the body runs along X, head at +X. Two
//         mirror fans leave Spine_2 and spread along Z: the
//         bone_7 spar line runs to −Z, the bone_15 line to +Z.
//         A third fan off Spine_1 (bone_23…) sweeps back along
//         the −Z wing's trailing edge — deliberately NOT in the
//         table, so the membrane hinges on its spar in flight
//         instead of being torn between two drivers.
//       pterodactylus — body along X, head at +X. Both wings
//         fork off bone_8 just behind the head: the bone_12 line
//         runs to −Z, the bone_18 line to +Z. bone_17 and
//         bone_23 are lone claw fingers off the same fork.
//     Sides are the ANIMAL's own left/right (head end and up
//     define them; the named Left limbs confirm −Z is left on
//     both X-bodied rigs), so the Bay's mirrored flap signs work
//     unchanged across dialects. Signatures are joint sets no
//     other measured rig satisfies (the plesiosaur's flippers
//     are NAMED Spine_3/Spine_4, so the tapejara table also
//     requires its bone_16 + bone_23 fan bones; the quetzal-
//     coatlus table requires the full sparse 12-joint count and
//     the absence of bone_9, which the mosquito has). A rig
//     matching nothing resolves empty — that flyer cruises
//     stiff-winged rather than erroring.
const FLYER_WING_TABLES = [
  {
    // quetzalcoatlus — the sparse 12-joint Tripo rig
    count: 12,
    signature: ['bone_5', 'bone_6', 'bone_7', 'bone_8'],
    absent: ['bone_9'],
    wings: [
      { side: 'left', chain: ['bone_7', 'bone_8'] },
      { side: 'right', chain: ['bone_5', 'bone_6'] },
    ],
  },
  {
    // tapejara — the only rig here with a Spine_4 + the rear fan
    signature: ['tripo::Spine_4', 'bone_7', 'bone_15', 'bone_16', 'bone_23'],
    wings: [
      { side: 'left', chain: ['bone_7', 'bone_8', 'bone_9', 'bone_10', 'bone_11', 'bone_12'] },
      { side: 'right', chain: ['bone_15', 'bone_16', 'bone_17', 'bone_18', 'bone_19', 'bone_20'] },
    ],
  },
  {
    // pterodactylus — the only rig here with a Head_1 + bone_29
    signature: ['tripo::Head_1', 'bone_12', 'bone_18', 'bone_29'],
    wings: [
      { side: 'left', chain: ['bone_12', 'bone_13', 'bone_14', 'bone_15', 'bone_16'] },
      { side: 'right', chain: ['bone_18', 'bone_19', 'bone_20', 'bone_21', 'bone_22'] },
    ],
  },
];

export function resolveFlyerWings(jointNames) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  if (!names.length) return [];
  const roles = resolveBones(names);
  if (roles.wings && roles.wings.length) {
    return roles.wings.map((w) => ({ side: w.side, chain: w.chain.slice() }));
  }
  const present = new Map(); // normalized -> original
  for (const n of names) {
    const k = normalizeJointName(n);
    if (!present.has(k)) present.set(k, n);
  }
  const get = (norm) => present.get(norm) || null;
  for (const table of FLYER_WING_TABLES) {
    if (table.count && names.length !== table.count) continue;
    const sigOk = table.signature.every((s) => get(normalizeJointName(s)));
    const absOk = (table.absent || []).every((s) => !get(normalizeJointName(s)));
    if (!sigOk || !absOk) continue;
    const wings = table.wings
      .map((w) => ({
        side: w.side,
        chain: w.chain.map((c) => get(normalizeJointName(c))).filter(Boolean),
      }))
      .filter((w) => w.chain.length);
    if (wings.length) return wings;
  }
  return [];
}

// ── Vehicle rigs (Vehicles Phase 1, 2026-10-23) ─────────────────
// The fleet's Studio rigs were read joint by joint before a
// single bone was trusted (the measurements live in the phase's
// test file). The honest summary:
//   - rover (26j): a quadruped-template Tripo rig whose limb
//     chains are scattered suspension/body bones — no wheel-hub
//     bones exist, and no chain descends to a hub. NOTHING usable:
//     the rover articulates whole-body (terrain pitch/roll) and
//     no bone is ever bent — warping a hero mesh on a guess is
//     how models get ruined.
//   - speed-bike (78j): the full humanoid retarget template
//     skinned along the frame (head at the fairing, feet at the
//     tail) — a rider-shaped skin, not a machine's rig. No wheel
//     bones. Whole-body only (lean, pitch, idle tremble).
//   - scarab (38j): a Tripo-native creature rig — Spine_0/Spine_1
//     and Head_0/Head_1 up the body's +X axis, and every other
//     chain a LEG: descending outboard chains rooted on the body
//     core (the root joint or its first body child), measured
//     reaching the ground at the shell's sides. Those chains are
//     what this resolver hands back, by TREE STRUCTURE alone —
//     the resolveSwimRig discipline: names lie, trees don't.
//   - vtol / airport: unrigged single meshes. Whole-craft only.
//
// resolveScarabLegs(jointNames, parents) -> [{ chain: [names] }]
// Each chain runs root-first (the body end) to tip (the foot).
// The body axis chain — the one containing the spine/head names —
// is excluded, as is every chain hanging off it; what remains is
// the legs. Chains come back in joint-list order, deterministic.
export function resolveScarabLegs(jointNames, parents) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const par = Array.isArray(parents) ? parents : [];
  if (!names.length) return [];

  const byNorm = new Map();
  for (const n of names) {
    const k = normalizeJointName(n);
    if (!byNorm.has(k)) byNorm.set(k, n);
  }
  const parentOf = new Map();
  names.forEach((n, i) => {
    const pk = par[i] != null ? normalizeJointName(par[i]) : null;
    parentOf.set(n, pk && byNorm.has(pk) && byNorm.get(pk) !== n ? byNorm.get(pk) : null);
  });
  const childrenOf = new Map(names.map((n) => [n, []]));
  for (const n of names) {
    const p = parentOf.get(n);
    if (p && childrenOf.has(p)) childrenOf.get(p).push(n);
  }
  const isRoot = (n) => !parentOf.get(n);
  // The body core: just the root joints. Legs hang either
  // directly off a root or off the axis's hub ancestors (the
  // rig's first body child carries the front pair) — both count
  // as hanging off the body (see the root test below).
  const core = new Set(names.filter(isRoot));
  // The body axis: a spine/head-named joint and everything
  // descending from it is the shell's own spine, never a leg.
  // Its ANCESTORS are not banned — the hub legitimately carries
  // legs — but an ancestor of the axis can never be a leg root.
  const axisLike = (n) => /spine|head|neck/i.test(normalizeJointName(n));
  const banned = new Set();
  const axisAncestors = new Set();
  for (const n of names) {
    if (!axisLike(n)) continue;
    banned.add(n);
    const stack = [...(childrenOf.get(n) || [])];
    while (stack.length) {
      const c = stack.pop();
      if (banned.has(c)) continue;
      banned.add(c);
      stack.push(...(childrenOf.get(c) || []));
    }
    let p = parentOf.get(n);
    while (p && !axisAncestors.has(p)) { axisAncestors.add(p); p = parentOf.get(p); }
  }
  // A leg root hangs directly off the body — a root joint or
  // one of the axis's hub ancestors — and is not itself body:
  // not core, not axis, not an axis ancestor. Its chain is the
  // longest downward path that never steps into the axis.
  const legs = [];
  for (const n of names) {
    const p = parentOf.get(n);
    if (!p || !(core.has(p) || axisAncestors.has(p))) continue;
    if (core.has(n) || banned.has(n) || axisAncestors.has(n) || axisLike(n)) continue;
    const chain = [n];
    let cur = n;
    for (;;) {
      const kids = (childrenOf.get(cur) || []).filter((c) => !banned.has(c));
      if (!kids.length) break;
      cur = kids[0];
      chain.push(cur);
    }
    legs.push({ chain });
  }
  return legs;
}
