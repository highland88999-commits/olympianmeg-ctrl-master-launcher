// lib/hawkins/rig.js
// HAWKINS — skeleton resolution + procedural pose drivers for the
// Tripo character GLBs (Merlin, 2026-10-22).
//
// The five in-hand characters carry MIXAMO-dialect rigs (Tripo's
// Humanoid+Mixamo spec) — measured off the real files: 65 joints named
// 'mixamorig:Hips', 'mixamorig:LeftUpLeg', … with full finger chains,
// NO jaw bone and NO facial bones of any kind. three's GLTFLoader runs
// node names through PropertyBinding.sanitizeNodeName, which strips
// ':' — so the same joint arrives as 'mixamorigHips' at runtime. The
// resolver accepts both forms.
//
// The GLBs ship ZERO baked animation clips (animations: [] in every
// file), so all motion is code: a pose driver writes joint rotations
// each frame from (t, mode, phase) — pure sin/cos gait math, fully
// deterministic, zero random calls anywhere in this file. Rotations are
// composed on top of each bone's bind rotation, captured when the
// driver is built.
//
// AXIS CONVENTIONS (centralised in SIGNS below, one-line fixes if the
// on-device look disagrees — same standing caveat as the Earth 2 Bay):
// models face +Z; limb bones point DOWN their chain (child at -Y), so
// a forward swing is a NEGATIVE rotation.x; spine/head bones point UP
// (+Y), so a forward lean is a POSITIVE rotation.x; side arm raise is
// rotation.z, mirrored by side.
//
// EXPRESSIONS — the honest limit: these rigs have no jaw and no facial
// bones, and the meshes are single solids with no blendshapes. There
// is nothing to drive a face with, so this module does not fake one.
// What the skeleton DOES support is in the personalities: posture,
// gait, head movement, and finger curl (the rigs carry full finger
// chains — Vecna's long fingers and the Demogorgon's claws included).

export function normalizeHawkinsJointName(name) {
  return String(name || '')
    .replace(/\s/g, '_')
    .replace(/^mixamorig:{0,1}/i, '');
}

// Resolve the roles of a Mixamo-dialect joint list. Input: raw names
// as loaded (either 'mixamorig:Hips' or 'mixamorigHips' form).
// Anything unfound comes back null / [] and is listed in `missing` —
// a missing role means "that motion does not happen", never an error.
export function resolveHawkinsJoints(jointNames) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const byNorm = new Map(); // normalized -> original (first wins)
  for (const n of names) {
    const k = normalizeHawkinsJointName(n);
    if (!byNorm.has(k)) byNorm.set(k, n);
  }
  const get = (norm) => byNorm.get(norm) || null;
  const missing = [];
  const need = (label, v) => { if (!v) missing.push(label); return v; };

  const arm = (side) => {
    const hand = get(`${side}Hand`);
    const fingers = [];
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      for (let i = 1; i <= 4; i++) {
        const j = get(`${side}Hand${f}${i}`);
        if (j) fingers.push(j);
      }
    }
    return {
      shoulder: get(`${side}Shoulder`),
      arm: need(`${side.toLowerCase()}Arm`, get(`${side}Arm`)),
      foreArm: get(`${side}ForeArm`),
      hand,
      fingers,
    };
  };
  const leg = (side) => ({
    upLeg: need(`${side.toLowerCase()}UpLeg`, get(`${side}UpLeg`)),
    leg: get(`${side}Leg`),
    foot: get(`${side}Foot`),
    toe: get(`${side}ToeBase`),
  });

  const jaw = names.find((n) => /jaw/i.test(normalizeHawkinsJointName(n))) || null;
  const resolved = {
    dialect: byNorm.has('Hips') && byNorm.has('LeftUpLeg') ? 'mixamo' : 'unknown',
    hips: need('hips', get('Hips')),
    spine: ['Spine', 'Spine1', 'Spine2'].map(get).filter(Boolean),
    neck: get('Neck'),
    head: need('head', get('Head')),
    headTop: get('HeadTop_End'),
    jaw, // null on every in-hand rig — measured, not assumed
    arms: { left: arm('Left'), right: arm('Right') },
    legs: { left: leg('Left'), right: leg('Right') },
    missing,
  };
  if (!resolved.spine.length) missing.push('spine');
  if (!resolved.neck) missing.push('neck');
  return resolved;
}

// Generic resolution for the creature rigs (Demobats, Mind Flayer,
// Mind Flayer Hybrid — measured off the real files, 2026-10-22). The
// three arrivals speak TWO dialects, and neither names a "wing":
//   - demobats is the 78-joint HUMANOID-RETARGET template (BoneRoot /
//     Pelvis / L_Upperarm …): on a flyer the ARM chains skin the
//     wings — the same rule the Earth 2 Bay flies its pterosaurs by —
//     so the wing roots are the two Upperarm bones, and the sway
//     chain is the axial spine (Waist / Spine01 / Spine02 / neck
//     twists) breathing under the flap.
//   - the Flayers are TRIPO-NATIVE ('tripo::…_Limb_…' chains off a
//     Root, plus unnamed bone_N fillers): eight 4–6-segment limb
//     chains ARE the sway (legs/tentacles), joined by the Spine
//     chain; the unnamed bone_N chains carry no readable role and
//     stay at bind pose. A Flayer has no wings — it hovers — so its
//     wings list is honestly empty and the flap driver no-ops.
// Base pass for unknown rigs: anything that reads as a sway chain
// (legs / tentacles / tail / limbs / spine) and anything that reads
// as a wing. Everything optional — the drivers below no-op on empty
// input, and unknown rigs resolve empty rather than throwing.
export function resolveCreatureJoints(jointNames) {
  const names = Array.isArray(jointNames) ? jointNames.filter(Boolean) : [];
  const swaySet = new Set(names.filter((n) => /leg|tentacle|tail|limb|appendage|spine/i.test(n)));
  let wings = names.filter((n) => /wing/i.test(n) && !/(_\d|tip|end)/i.test(n));
  let dialect = 'generic';
  const set = new Set(names);
  if (set.has('Pelvis') && set.has('L_Upperarm') && set.has('R_Upperarm')) {
    // Humanoid-retarget dialect (the demobats): arm chains = wings.
    dialect = 'humanoid';
    if (!wings.length) wings = ['L_Upperarm', 'R_Upperarm'];
    for (const n of ['Waist', 'Spine01', 'Spine02', 'NeckTwist01', 'NeckTwist02']) {
      if (set.has(n)) swaySet.add(n);
    }
  } else if (names.some((n) => /^tripo::/i.test(n) || /_Limb_\d/.test(n))) {
    dialect = 'tripo';
  }
  // Sway stays in joint-list order — the driver phases by position.
  const sway = names.filter((n) => swaySet.has(n));
  return { dialect, sway, wings, all: names };
}

// Lookup key for matching a resolved joint name to a loaded Bone:
// three sanitizes ':' out of node names on load ('mixamorig:Hips'
// arrives as 'mixamorigHips'), so both sides are reduced to bare
// alphanumerics with the brand prefix removed before comparing.
export function boneLookupKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^mixamorig/, '')
    .replace(/^tripo/, '');
}

// Index a list of Bone objects by lookup key (first wins).
export function indexBones(bones) {
  const byKey = new Map();
  for (const b of bones || []) {
    if (!b || !b.name) continue;
    const k = boneLookupKey(b.name);
    if (!byKey.has(k)) byKey.set(k, b);
  }
  return byKey;
}

// Pick the Bone objects for a list of joint names, in order.
export function pickBones(bones, names) {
  const byKey = indexBones(bones);
  return (names || []).map((n) => byKey.get(boneLookupKey(n)) || null).filter(Boolean);
}

// Index a loaded model's bones by resolved role. `bones` are the
// skeleton's Bone objects (they carry the loaded names). Returns a
// plain map the pose driver consumes; unfound roles are absent.
export function buildJointObjects(bones, resolved) {
  const byKey = indexBones(bones);
  const pick = (name) => (name ? byKey.get(boneLookupKey(name)) || null : null);
  const pickChain = (chain) => (chain || []).map(pick).filter(Boolean);
  const armObjs = (a) => ({
    shoulder: pick(a.shoulder), arm: pick(a.arm), foreArm: pick(a.foreArm),
    hand: pick(a.hand), fingers: pickChain(a.fingers),
  });
  const legObjs = (l) => ({
    upLeg: pick(l.upLeg), leg: pick(l.leg), foot: pick(l.foot), toe: pick(l.toe),
  });
  return {
    hips: pick(resolved.hips),
    spine: pickChain(resolved.spine),
    neck: pick(resolved.neck),
    head: pick(resolved.head),
    jaw: pick(resolved.jaw),
    arms: { left: armObjs(resolved.arms.left), right: armObjs(resolved.arms.right) },
    legs: { left: legObjs(resolved.legs.left), right: legObjs(resolved.legs.right) },
  };
}

const SIGNS = {
  legSwing: -1,   // thigh rotation.x — negative swings the leg forward (+Z facing)
  knee: 1,        // calf rotation.x — positive folds the shin backward
  armSwing: -1,   // upper-arm rotation.x — negative swings the arm forward
  armRaise: { left: 1, right: -1 }, // rotation.z lifting the arm away from the body
  spineLean: 1,   // spine rotation.x — positive leans the trunk forward
  headNod: 1,     // head rotation.x — positive nods forward
  fingerCurl: 1,  // finger rotation.x — positive curls the digit closed
};

// Per-character movement personalities (Merlin's Oct 17 spec, realised
// as gait/posture parameters — the skeleton is the same for all five;
// the PERSON is in these numbers):
//   eleven     — small and quick: fast light stride, upright, alert head
//   eddie      — lanky and loose: big swing, slouch, rolling shoulders
//   hopper     — heavy and broad: slow stride, low arm swing, big breath
//   vecna      — deliberate and ominous: no stride at all (he hovers),
//                raised arms, curled fingers, a slow tilted head
//   demogorgon — the scary beast: deep prowl crouch, long reaching
//                arms, constant head scanning; faster and lower when
//                it chases, all flare when it attacks
export const HAWKINS_PERSONALITIES = {
  eleven: {
    strideHzWalk: 1.6, strideHzRun: 2.4, strideAmp: 0.5, kneeAmp: 0.7,
    armSwing: 0.45, armRaiseBase: 0.04, crouch: 0.03, slouch: 0.02,
    breathHz: 0.3, breathAmp: 0.03, headSway: 0.28, headNodAmp: 0.05,
    bobAmp: 0.35, rollAmp: 0.02, fingerCurl: 0.12,
  },
  eddie: {
    strideHzWalk: 1.45, strideHzRun: 2.15, strideAmp: 0.66, kneeAmp: 0.8,
    armSwing: 0.8, armRaiseBase: 0.1, crouch: 0.05, slouch: 0.09,
    breathHz: 0.26, breathAmp: 0.04, headSway: 0.2, headNodAmp: 0.09,
    bobAmp: 0.5, rollAmp: 0.05, fingerCurl: 0.3,
  },
  hopper: {
    strideHzWalk: 1.25, strideHzRun: 1.9, strideAmp: 0.52, kneeAmp: 0.6,
    armSwing: 0.32, armRaiseBase: 0.14, crouch: 0.02, slouch: 0.04,
    breathHz: 0.2, breathAmp: 0.06, headSway: 0.14, headNodAmp: 0.04,
    bobAmp: 0.55, rollAmp: 0.035, fingerCurl: 0.18,
  },
  vecna: {
    strideHzWalk: 0, strideHzRun: 0, strideAmp: 0, kneeAmp: 0,
    armSwing: 0.05, armRaiseBase: 0.5, crouch: 0, slouch: -0.04,
    breathHz: 0.11, breathAmp: 0.05, headSway: 0.1, headNodAmp: 0.03,
    bobAmp: 0.15, rollAmp: 0.015, fingerCurl: 0.55, headTilt: 0.09,
  },
  demogorgon: {
    strideHzWalk: 1.05, strideHzRun: 2.5, strideAmp: 0.72, kneeAmp: 0.9,
    armSwing: 0.55, armRaiseBase: 0.22, crouch: 0.34, slouch: 0.16,
    breathHz: 0.22, breathAmp: 0.05, headSway: 0.7, headNodAmp: 0.3,
    bobAmp: 0.7, rollAmp: 0.06, fingerCurl: 0.45,
  },
  generic: {
    strideHzWalk: 1.4, strideHzRun: 2.1, strideAmp: 0.55, kneeAmp: 0.7,
    armSwing: 0.5, armRaiseBase: 0.06, crouch: 0.04, slouch: 0.03,
    breathHz: 0.25, breathAmp: 0.04, headSway: 0.2, headNodAmp: 0.05,
    bobAmp: 0.4, rollAmp: 0.03, fingerCurl: 0.2,
  },
};

// createPoseDriver(jointObjects, personality)
// jointObjects: the buildJointObjects() map (bones are anything with
// a three-style .rotation Euler — the driver only calls rotation.set).
// update(t, state) writes bone rotations for absolute time t and
// returns root offsets { bobY, rollZ } for the caller to apply to the
// model holder. state: { mode, phase, flare }
//   modes: idle | walk | run | ride | stalk | chase | attack |
//          weakened | hover
export function createPoseDriver(joints, personality) {
  const P = { ...HAWKINS_PERSONALITIES.generic, ...(personality || {}) };
  const bind = new Map(); // bone -> {x,y,z} bind euler
  const reg = (b) => {
    if (b && !bind.has(b)) bind.set(b, { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z });
    return b;
  };
  reg(joints.hips); reg(joints.neck); reg(joints.head); reg(joints.jaw);
  for (const b of joints.spine || []) reg(b);
  for (const side of ['left', 'right']) {
    const a = joints.arms[side]; reg(a.shoulder); reg(a.arm); reg(a.foreArm); reg(a.hand);
    for (const f of a.fingers) reg(f);
    const l = joints.legs[side]; reg(l.upLeg); reg(l.leg); reg(l.foot); reg(l.toe);
  }
  const set = (b, dx, dy, dz) => {
    if (!b) return;
    const o = bind.get(b);
    b.rotation.set(o.x + dx, o.y + dy, o.z + dz);
  };

  function update(t, state) {
    const mode = (state && state.mode) || 'idle';
    const phase = (state && state.phase) || 0;
    const flare = Math.max(0, Math.min(1, (state && state.flare) || 0));
    const moving = mode === 'walk' || mode === 'run' || mode === 'stalk' ||
      mode === 'chase' || mode === 'ride';
    const hz = mode === 'run' || mode === 'chase' ? P.strideHzRun
      : mode === 'ride' ? P.strideHzWalk * 0.8 : P.strideHzWalk;
    const strideAmp = moving ? P.strideAmp * (mode === 'stalk' ? 0.7 : 1) : 0;
    const ph = t * hz * Math.PI * 2 + phase;
    const breath = Math.sin(t * P.breathHz * Math.PI * 2 + phase);
    const crouch = mode === 'stalk' || mode === 'chase' ? P.crouch
      : mode === 'attack' ? P.crouch * 0.7 : P.crouch * 0.35;
    const weakened = mode === 'weakened';

    // legs — antiphase stride; knees fold on the swing-through
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1;
      const l = joints.legs[side];
      if (mode === 'ride') {
        // seated on the bike: thighs up, shins down, a soft pedal cycle
        set(l.upLeg, SIGNS.legSwing * (0.95 + Math.sin(ph) * s * 0.18), 0, 0);
        set(l.leg, SIGNS.knee * (0.95 + Math.cos(ph) * s * 0.18), 0, 0);
        set(l.foot, -0.15, 0, 0);
        continue;
      }
      const swing = Math.sin(ph) * s;
      const lift = Math.max(0, Math.sin(ph + (side === 'left' ? 0.5 : -0.5) * Math.PI)) ;
      set(l.upLeg, SIGNS.legSwing * swing * strideAmp + (weakened ? 0.06 : 0), 0, 0);
      set(l.leg, SIGNS.knee * (moving ? lift * P.kneeAmp : 0.03), 0, 0);
      set(l.foot, SIGNS.legSwing * swing * strideAmp * -0.35, 0, 0);
    }

    // trunk — breath always; crouch/slouch by posture and mode
    const lean = (P.slouch + crouch) * SIGNS.spineLean + breath * P.breathAmp * 0.4;
    (joints.spine || []).forEach((b, i) => {
      const share = (i + 1) / Math.max(1, joints.spine.length);
      set(b, lean * share + (weakened ? 0.3 * share : 0), 0, Math.sin(t * 0.5 + phase) * P.rollAmp * share);
    });
    set(joints.hips, weakened ? 0.18 : crouch * 0.3, 0, 0);

    // head — scanning sway (the Demogorgon's is huge), breath nod
    const scan = Math.sin(t * 0.9 + phase) * P.headSway * (mode === 'stalk' || mode === 'idle' ? 1 : 0.35);
    set(joints.head,
      SIGNS.headNod * (Math.sin(t * 1.7 + phase) * P.headNodAmp + (weakened ? 0.42 : crouch * 0.5)),
      scan,
      (P.headTilt || 0) + Math.sin(t * 0.6 + phase) * 0.03);
    set(joints.neck, SIGNS.headNod * crouch * 0.25, scan * 0.4, 0);

    // arms — counter-swing when moving; raised + curled by flare
    // (Vecna casting, Demogorgon lunging); drooped when weakened
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? 1 : -1;
      const a = joints.arms[side];
      // counter-swing: the arm opposes the same-side leg (-swing)
      let swingX = moving ? SIGNS.armSwing * (-Math.sin(ph) * s) * P.armSwing * strideAmp * 2 : breath * 0.03;
      let raiseZ = SIGNS.armRaise[side] * P.armRaiseBase;
      if (mode === 'attack' || flare > 0.25) {
        const slash = Math.max(0, Math.sin(t * 7 + phase));
        swingX = SIGNS.armSwing * (0.7 + slash * 0.5 * flare);
        raiseZ = SIGNS.armRaise[side] * (P.armRaiseBase + flare * 0.35);
      } else if (mode === 'hover' || mode === 'idle') {
        raiseZ = SIGNS.armRaise[side] * (P.armRaiseBase + flare * 0.3 + breath * 0.02);
      }
      if (weakened) { swingX = 0.25; raiseZ = SIGNS.armRaise[side] * 0.05; }
      set(a.arm, swingX, 0, raiseZ);
      set(a.shoulder, swingX * 0.3, 0, raiseZ * 0.4);
      set(a.foreArm, SIGNS.armSwing * (0.18 + flare * 0.3 + (weakened ? 0.3 : 0)), 0, 0);
      set(a.hand, 0, 0, Math.sin(t * 1.3 + phase + s) * 0.05);
      const curl = SIGNS.fingerCurl * (P.fingerCurl + flare * 0.35);
      for (const f of a.fingers) set(f, curl, 0, 0);
    }

    // jaw — driven only on rigs that actually have one (none in hand)
    if (joints.jaw) set(joints.jaw, flare * 0.4 + Math.max(0, breath) * 0.03, 0, 0);

    const bobY = moving ? Math.abs(Math.sin(ph)) * P.bobAmp : (breath + 1) * P.breathAmp * 0.3;
    const rollZ = moving ? Math.sin(ph) * P.rollAmp : Math.sin(t * 0.5 + phase) * P.rollAmp * 0.5;
    return { bobY, rollZ };
  }

  return { update, personality: P };
}

// Gentle whole-chain sway for the generic creature rigs (Mind Flayer
// legs/tentacles, the bat's spine under its flap): every resolved
// sway bone gets a slow sin offset around its bind pose, phased by
// chain position.
export function createSwayDriver(boneObjs, opts = {}) {
  const amp = opts.amp !== undefined ? opts.amp : 0.07;
  const hz = opts.hz !== undefined ? opts.hz : 0.45;
  const bind = new Map();
  const bones = (boneObjs || []).filter(Boolean);
  for (const b of bones) bind.set(b, { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z });
  return {
    update(t) {
      bones.forEach((b, i) => {
        const o = bind.get(b);
        const p = t * hz * Math.PI * 2 + i * 0.7;
        b.rotation.set(o.x + Math.sin(p) * amp * 0.6, o.y + Math.sin(p * 0.8) * amp, o.z);
      });
    },
  };
}

// Wing flap for a generic winged rig (the Demo-bats' arm-chain
// wings): rotates each wing chain's root bone. If a rig yields no
// wing bones this returns null and the engine keeps flapping the
// whole mesh, exactly as the procedural bat does.
export function createFlapDriver(wingBoneObjs, opts = {}) {
  const wings = (wingBoneObjs || []).filter(Boolean);
  if (!wings.length) return null;
  const hz = opts.hz !== undefined ? opts.hz : 9;
  const amp = opts.amp !== undefined ? opts.amp : 0.7;
  const bind = new Map();
  for (const b of wings) bind.set(b, { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z });
  return {
    update(t, phase = 0) {
      wings.forEach((b, i) => {
        const o = bind.get(b);
        const f = Math.sin(t * hz * Math.PI * 2 + phase) * amp;
        b.rotation.set(o.x, o.y, o.z + (i % 2 === 0 ? f : -f));
      });
    },
  };
}
