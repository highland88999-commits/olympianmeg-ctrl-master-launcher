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
