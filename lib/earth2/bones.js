// lib/earth2/bones.js
// Bone-role resolver for the Earth 2 foundry rigs (Merlin, 2026-10-22).
//
// The Tripo Studio rigs arrive in TWO naming dialects, measured off
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
//
// Pure and name-based: feed it the joint names exactly as loaded and
// it hands back roles in those same names. Anything it cannot find
// comes back null / [] — the driver treats a missing role as "that
// motion does not happen for this animal", never as an error.

export function normalizeJointName(name) {
  // Raw glTF names carry the 'tripo::' prefix; three's GLTFLoader
  // runs node names through PropertyBinding.sanitizeNodeName, which
  // strips ':' — so the same joint arrives as 'tripoSpine_0' at
  // runtime. Strip the brand prefix either way ('tripo::Spine_0',
  // 'tripoSpine_0' and 'Spine_0' are the same bone to us).
  return String(name || '').replace(/\s/g, '_').replace(/^tripo:{0,2}/i, '');
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
