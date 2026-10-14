// lib/kombat/pose-driver.js
//
// STEP 6 — the code pose driver. The Tripo GLBs ship with ZERO
// animation clips, so every fighter is posed in code from its bridge
// movement profile (lib/kombat/loadouts.js movementStyle prose +
// motionClass). One semantic bone map serves all 30 humanoid rigs
// (identical 41-joint Tripo rigs); the 5 creature rigs are
// heterogeneous, so each gets a per-creature chain table written
// against the SANITIZED bone names three.js exposes at load
// (`tripo::Tail_0` in the file arrives as `tripoTail_0`). Rigless
// fighters (Slimer — a 0-joint GLB) are driven at the mesh level:
// float, bob, squash.
//
// Every pose is a TOTAL function: apply() first rewrites every driven
// bone from its captured bind transform, then adds the pose. A pose
// can therefore never leak into the next state — in particular the
// downed (ko) pose exists only while the pose IS 'ko' (Merlin's
// downed-state law, 2026-10-14), and the knockdown fall itself is a
// wrapper rotation the driver eases in/out, never a bone pose.
//
// FLOOR LAW: apply() returns { lift, fall } for the wrapper. lift is
// always >= 0, and while falling, lift is raised analytically from
// the model's bind bbox so the fallen body RESTS ON the floor plane
// instead of clipping through it. Combined with the engines' shared
// ground clamp (lib/kombat/floor.js), no part of a driven fighter
// goes below y=0.
//
// This module imports nothing and touches no DOM: bones are any
// objects with { rotation: {x,y,z}, position: {x,y,z} }, so the whole
// driver is headless-testable with fake bones.

/** Mirror of three.js PropertyBinding.sanitizeNodeName for the names
 *  Tripo emits: whitespace -> '_', then reserved chars stripped. */
export function sanitizeBoneName(name) {
  return String(name).replace(/\s/g, '_').replace(/[^\w-]/g, '');
}

// ---------------------------------------------------------------------
// Humanoid semantic bone map (roles -> sanitized bone names). All 30
// hosted humanoids share this exact joint list (measured from the
// GLBs, Step 6). Axis conventions measured the same way (Euler path,
// the same one this driver writes):
//   thigh.rotation.x +  swings the leg FORWARD (+X, the facing axis)
//   calf.rotation.x  -  bends the knee (shin sweeps back)
//   upperArm.rotation.z: L + raises, R - raises (mirrored T-pose)
//   upperArm.rotation.x + swings the arm forward (punch direction)
//   foreArm.rotation.x + flexes the elbow forward
//   spine.rotation.z +  folds the torso forward/down (hunch)
//   neck.rotation.x  -  nods the head forward
// ---------------------------------------------------------------------
export const HUMANOID_BONE_MAP = {
  pelvis: 'Pelvis',
  waist: 'Waist',
  spine: 'Spine01',
  chest: 'Spine02',
  neck: 'NeckTwist01',
  head: 'Head',
  clavL: 'L_Clavicle',
  upperArmL: 'L_Upperarm',
  foreArmL: 'L_Forearm',
  handL: 'L_Hand',
  clavR: 'R_Clavicle',
  upperArmR: 'R_Upperarm',
  foreArmR: 'R_Forearm',
  handR: 'R_Hand',
  thighL: 'L_Thigh',
  calfL: 'L_Calf',
  footL: 'L_Foot',
  thighR: 'R_Thigh',
  calfR: 'R_Calf',
  footR: 'R_Foot',
};

/** Roles the driver needs for the full pose set. */
export const HUMANOID_REQUIRED_ROLES = Object.keys(HUMANOID_BONE_MAP);

// ---------------------------------------------------------------------
// Creature chain tables. Chains run proximal -> distal. Each semantic
// motion names the local Euler axis + sign measured on the real GLB
// (Step 6 measurement pass). Sides are CHARACTER sides (facing +X,
// character-left = -Z); Tripo's L/R labels are unreliable on creature
// rigs, so membership was settled by joint world positions.
//   swing: gait/strike swing of the chain root
//   knee:  bend applied to distal segments during the lift phase
//   raise: arm lift away from the body (arms only)
//   pitch: spine/head fold (bite, hunch)
//   sway:  lateral tail motion (tails only)
// Missing chains are simply not driven (Fang raptor has no tail
// chain — its tail is unrigged flesh that follows the body).
// ---------------------------------------------------------------------
export const CREATURE_TABLES = {
  'q011-xenomorph': {
    fall: 'back',
    spine: { bones: ['tripoSpine_0'], pitch: { axis: 'z', sign: 1 }, sway: { axis: 'x', sign: 1 } },
    head: { bones: ['tripoHead_0', 'tripoHead_1'], pitch: { axis: 'x', sign: 1 } },
    armL: { bones: ['tripo1_Left_Limb_2', 'tripo1_Left_Limb_3', 'tripo1_Left_Limb_4', 'tripo1_Left_Limb_5'], swing: { axis: 'x', sign: -1 }, raise: { axis: 'z', sign: -1 } },
    armR: { bones: ['bone_10', 'bone_11', 'bone_12', 'bone_13'], swing: { axis: 'z', sign: -1 }, raise: { axis: 'x', sign: -1 } },
    armR2: { bones: ['tripo0_Right_Limb_0', 'tripo0_Right_Limb_1', 'tripo0_Right_Limb_2'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: 1 } },
    legL: { bones: ['tripo1_Right_Limb_0', 'tripo1_Right_Limb_1', 'tripo1_Right_Limb_2', 'tripo1_Right_Limb_3'], swing: { axis: 'x', sign: 1 }, knee: { axis: 'x', sign: -1 } },
    legR: { bones: ['tripo0_Left_Limb_0', 'tripo0_Left_Limb_1'], swing: { axis: 'x', sign: 1 }, knee: { axis: 'x', sign: -1 } },
    tail: { bones: ['bone_1', 'tripoTail_0'], sway: { axis: 'y', sign: 1 }, lift: { axis: 'x', sign: 1 } },
  },
  'q021-t-rex': {
    fall: 'side',
    spine: { bones: ['tripoSpine_0', 'tripoSpine_1', 'tripoSpine_2'], pitch: { axis: 'z', sign: 1 }, sway: { axis: 'x', sign: 1 } },
    head: { bones: ['tripoHead_0', 'tripoHead_1', 'tripoHead_2', 'tripoHead_3'], pitch: { axis: 'x', sign: 1 } },
    armL: { bones: ['bone_8', 'tripo0_Left_Limb_0', 'tripo0_Left_Limb_1'], swing: { axis: 'x', sign: -1 }, raise: { axis: 'z', sign: -1 } },
    armR: { bones: ['tripo1_Right_Limb_0', 'tripo1_Right_Limb_1', 'tripo1_Right_Limb_2'], swing: { axis: 'x', sign: -1 }, raise: { axis: 'z', sign: -1 } },
    legL: { bones: ['tripo1_Left_Limb_0', 'tripo1_Left_Limb_1', 'tripo1_Left_Limb_2', 'tripo1_Left_Limb_3', 'tripo1_Left_Limb_4'], swing: { axis: 'x', sign: -1 }, knee: { axis: 'x', sign: 1 } },
    legR: { bones: ['bone_19', 'bone_20', 'bone_21', 'bone_22', 'bone_36', 'bone_37', 'bone_38', 'bone_39', 'bone_40', 'bone_41', 'bone_42'], swing: { axis: 'x', sign: -1 }, knee: { axis: 'x', sign: 1 } },
    tail: { bones: ['tripoTail_0', 'tripoTail_1', 'bone_28', 'bone_29'], sway: { axis: 'y', sign: 1 }, lift: { axis: 'x', sign: 1 } },
  },
  'q022-swift-raptor': {
    fall: 'side',
    spine: { bones: ['tripoSpine_0', 'tripoSpine_1'], pitch: { axis: 'x', sign: -1 }, sway: { axis: 'z', sign: 1 } },
    head: { bones: ['tripoHead_0', 'tripoHead_1', 'bone_3', 'bone_4'], pitch: { axis: 'x', sign: 1 } },
    armL: { bones: ['tripo0_Left_Limb_0', 'tripo0_Left_Limb_1', 'tripo0_Left_Limb_2'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: -1 } },
    armR: { bones: ['bone_10', 'bone_11', 'bone_12'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: 1 } },
    legL: { bones: ['tripo0_Right_Limb_0', 'tripo0_Right_Limb_1', 'tripo0_Right_Limb_2', 'tripo0_Right_Limb_3', 'tripo0_Right_Limb_4'], swing: { axis: 'x', sign: 1 }, knee: { axis: 'x', sign: -1 } },
    legR: { bones: ['tripo1_Right_Limb_0', 'tripo1_Right_Limb_1', 'tripo1_Right_Limb_2', 'tripo1_Right_Limb_3'], swing: { axis: 'x', sign: 1 }, knee: { axis: 'x', sign: -1 } },
    tail: { bones: ['tripoTail_0', 'tripoTail_1', 'tripoTail_2'], sway: { axis: 'y', sign: 1 }, lift: { axis: 'z', sign: 1 } },
  },
  'q023-claw-raptor': {
    fall: 'side',
    spine: { bones: ['tripoSpine_0', 'tripoSpine_1'], pitch: { axis: 'x', sign: 1 }, sway: { axis: 'z', sign: 1 } },
    head: { bones: ['tripoHead_0', 'tripoHead_1', 'tripoHead_2', 'tripoHead_3'], pitch: { axis: 'x', sign: 1 } },
    armL: { bones: ['tripo0_Left_Limb_0', 'tripo0_Left_Limb_1'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: -1 } },
    armR: { bones: ['tripo0_Right_Limb_0', 'tripo0_Right_Limb_1'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: 1 } },
    legL: { bones: ['tripo1_Left_Limb_0', 'tripo1_Left_Limb_1', 'tripo1_Left_Limb_2', 'tripo1_Left_Limb_3', 'tripo1_Left_Limb_4'], swing: { axis: 'x', sign: -1 }, knee: { axis: 'x', sign: 1 } },
    legR: { bones: ['tripo1_Right_Limb_0', 'tripo1_Right_Limb_1', 'tripo1_Right_Limb_2', 'tripo1_Right_Limb_3', 'tripo1_Right_Limb_4'], swing: { axis: 'x', sign: -1 }, knee: { axis: 'x', sign: 1 } },
    tail: { bones: ['bone_18', 'bone_19', 'tripoTail_0', 'tripoTail_1'], sway: { axis: 'y', sign: 1 }, lift: { axis: 'x', sign: 1 } },
  },
  'q024-fang-raptor': {
    fall: 'side',
    spine: { bones: ['tripoSpine_0'], pitch: { axis: 'x', sign: 1 }, sway: { axis: 'z', sign: 1 } },
    head: { bones: ['tripoHead_0', 'tripoHead_1', 'tripoHead_2', 'tripoHead_3'], pitch: { axis: 'x', sign: 1 } },
    armL: { bones: ['tripo0_Left_Limb_0', 'tripo0_Left_Limb_1', 'tripo0_Left_Limb_2'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: -1 } },
    armR: { bones: ['tripoTail_0', 'tripoTail_1', 'tripoTail_2'], swing: { axis: 'x', sign: 1 }, raise: { axis: 'z', sign: 1 } },
    legL: { bones: ['tripo1_Left_Limb_0', 'tripo1_Left_Limb_1', 'tripo1_Left_Limb_2', 'tripo1_Left_Limb_3', 'tripo1_Left_Limb_4'], swing: { axis: 'x', sign: -1 }, knee: { axis: 'x', sign: 1 } },
    legR: { bones: ['tripo0_Right_Limb_0', 'tripo0_Right_Limb_1', 'tripo0_Right_Limb_2', 'tripo0_Right_Limb_3'], swing: { axis: 'x', sign: -1 }, knee: { axis: 'x', sign: 1 } },
    tail: null,
  },
};

/** Rig kind dispatch: creature table wins, then rigless, else humanoid. */
export function rigKindFor(loadout, jointCount) {
  if (!loadout) return 'humanoid';
  if (CREATURE_TABLES[loadout.characterId]) return 'creature';
  if (loadout.rigClass === 'none' || loadout.motionClass === 'floater' || jointCount === 0) return 'rigless';
  return 'humanoid';
}

// ---------------------------------------------------------------------
// Movement profiles: HOW a fighter moves, derived from the bridge
// movementStyle prose. Jason's slow relentless stalk must not read
// like Freddy's theatrical prowl or Bugs' elastic bounce (Merlin's
// acceptance: "moves like them"). Keyword rules over the prose, with
// hand-tuned overrides for the signature cases.
// ---------------------------------------------------------------------
const PROFILE_BASE = {
  bobAmp: 0.016, bobHz: 2.0, gaitHz: 3.1, gaitAmp: 0.52, sway: 0.03,
  lean: 0.08, crouch: 0.05, armSwing: 0.3, weaponRaise: 0.45,
  asym: 0, squash: 0, hover: 0, still: 0,
};

const PROFILE_RULES = [
  [/relentless|inevitable|implacable/i, { bobHz: 1.0, gaitHz: 1.6, gaitAmp: 0.4, bobAmp: 0.01, sway: 0.012, lean: 0.1, armSwing: 0.1, weaponRaise: 0.55 }],
  [/metronom|glide|glides|gliding|smooth,? measured/i, { bobAmp: 0.005, bobHz: 1.1, gaitHz: 1.9, gaitAmp: 0.44, sway: 0.008, lean: 0.05 }],
  [/prowl|hunch/i, { lean: 0.17, crouch: 0.09, sway: 0.055, bobHz: 1.7, gaitHz: 2.6, gaitAmp: 0.5, weaponRaise: 0.8 }],
  [/theatrical|taunt|showman|vaudevill/i, { sway: 0.06, bobAmp: 0.024, weaponRaise: 0.75 }],
  [/lumber|stomp|hulking|heavy,? ground|ponderous/i, { gaitHz: 1.7, gaitAmp: 0.46, bobAmp: 0.026, bobHz: 1.3, sway: 0.045, crouch: 0.04 }],
  [/shamble|lurch|drag(s|ging)? (his|her|its|the)? ?(feet|foot|leg)|undead/i, { asym: 0.4, lean: 0.13, gaitHz: 2.0, gaitAmp: 0.42, sway: 0.05, bobHz: 1.4 }],
  [/military|precision|measured strides|economical/i, { sway: 0.008, lean: 0.03, gaitAmp: 0.5, gaitHz: 3.0, armSwing: 0.22, crouch: 0.03 }],
  [/martial|wushu|kung fu|acrobatic|whirling|ricochet/i, { gaitHz: 3.7, gaitAmp: 0.6, crouch: 0.1, bobHz: 2.6, armSwing: 0.4 }],
  [/bounce|elastic|cartoon|spring/i, { bobAmp: 0.045, bobHz: 3.1, gaitHz: 3.9, gaitAmp: 0.58, squash: 0.06, sway: 0.05 }],
  [/skitter|explodes into motion|freeze/i, { still: 0.55, gaitHz: 4.6, gaitAmp: 0.62, crouch: 0.12, lean: 0.15, bobHz: 2.8 }],
  [/saunter|casual|leans casually/i, { sway: 0.07, bobHz: 1.6, gaitHz: 2.4, lean: 0.04, armSwing: 0.42 }],
  [/stalk/i, { lean: 0.12, gaitHz: 2.2, crouch: 0.08 }],
  [/float|hover|drift|levitat/i, { hover: 0.14, bobAmp: 0.05, bobHz: 1.2, gaitAmp: 0.08, armSwing: 0.15, sway: 0.04 }],
  [/spin|whirlwind/i, { gaitHz: 3.9, bobHz: 3.0, sway: 0.06 }],
  [/shuffle/i, { gaitHz: 1.8, gaitAmp: 0.3, bobHz: 1.2 }],
];

const PROFILE_OVERRIDES = {
  // Jason: the slowest thing in the game. No bounce, no hurry.
  'q002-jason-voorhees': { bobHz: 0.8, bobAmp: 0.008, gaitHz: 1.35, gaitAmp: 0.42, sway: 0.01, lean: 0.11, armSwing: 0.08, weaponRaise: 0.6, crouch: 0.03 },
  // Michael: metronomic glide — almost no vertical life at all.
  'q003-michael-myers': { bobAmp: 0.003, bobHz: 0.9, gaitHz: 1.7, gaitAmp: 0.46, sway: 0.005, lean: 0.05, armSwing: 0.1, weaponRaise: 0.5, crouch: 0.02 },
  // Freddy: hunched prowl, claw up, constant theatrical sway.
  'q001-freddy-krueger': { lean: 0.19, crouch: 0.1, sway: 0.065, bobHz: 1.8, bobAmp: 0.02, gaitHz: 2.7, gaitAmp: 0.52, weaponRaise: 0.9, armSwing: 0.34 },
  // Palpatine barely walks — he glides just above the ground.
  'q016-emperor-palpatine': { hover: 0.1, bobAmp: 0.012, bobHz: 0.9, gaitHz: 1.6, gaitAmp: 0.14, lean: 0.14, crouch: 0.1, sway: 0.02, weaponRaise: 0.3 },
};

export function movementProfile(loadout) {
  const p = { ...PROFILE_BASE };
  const style = (loadout && loadout.movementStyle) || '';
  for (const [re, patch] of PROFILE_RULES) {
    if (re.test(style)) Object.assign(p, patch);
  }
  if (loadout && loadout.motionClass === 'floater') {
    Object.assign(p, { hover: 0.16, bobAmp: 0.055, bobHz: 1.4, gaitAmp: 0.05 });
  }
  if (loadout && PROFILE_OVERRIDES[loadout.characterId]) {
    Object.assign(p, PROFILE_OVERRIDES[loadout.characterId]);
  }
  return p;
}

// ---------------------------------------------------------------------
// Floor math. The knockdown fall rotates the wrapper; the lift that
// keeps the fallen body resting ON the plane comes from the bind
// bbox: falling backward (around the model's Z axis, humanoid-style)
// lays the body's X extent vertical; falling sideways (around the
// facing X axis, creature-style) lays the Z extent vertical. Either
// way the lowest point after a fall of angle a is -(extent/2)*sin(a)
// from a centered origin, so lift = (extent/2)*sin(a).
// ---------------------------------------------------------------------
export const FALL_ANGLE = Math.PI / 2 - 0.14;

export function koLiftFor(size, fall) {
  if (!size) return 0.3;
  const extent = fall === 'side' ? size.z : size.x;
  return Math.max(0.05, (extent / 2) * Math.sin(FALL_ANGLE));
}

// ---------------------------------------------------------------------
// Pose math helpers. Envelopes: attack poses are driven by actionT
// (seconds into the action) when the engine supplies it, else by the
// driver's own pose-local clock against nominal durations.
// ---------------------------------------------------------------------
const NOMINAL_ACTION_SECONDS = { punch: 0.34, kick: 0.46, special: 1.06, hit: 0.3 };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
// Strike envelope: windup (0..0.3) -> strike (0.3..0.55) -> recover.
function strikeEnv(p) {
  if (p < 0.3) return -0.45 * (p / 0.3); // windup pulls back (negative)
  if (p < 0.55) return lerp(-0.45, 1, (p - 0.3) / 0.25);
  return lerp(1, 0, (p - 0.55) / 0.45);
}
function decayEnv(p) { return Math.sin(Math.PI * clamp01(p)); }

/**
 * Create a pose driver.
 * @param opts.kind      'humanoid' | 'creature' | 'rigless'
 * @param opts.bones     Map<string, bone> of EVERY bone by sanitized
 *                       name (humanoid/creature kinds)
 * @param opts.table     creature table (creature kind)
 * @param opts.profile   movementProfile() output
 * @param opts.weaponSide 'L' | 'R' — the loadout weapon hand
 * @param opts.dualWield boolean
 * @param opts.size      bind bbox size {x,y,z} in WRAPPER units
 *                       (after normalization scale), for ko lift
 * @param opts.meshGroup rigless kind: the object to bob/squash
 */
export function createPoseDriver(opts) {
  const kind = opts.kind || 'humanoid';
  const profile = opts.profile || { ...PROFILE_BASE };
  const bones = opts.bones || new Map();
  const table = opts.table || null;
  const weaponSide = opts.weaponSide === 'L' ? 'L' : 'R';
  const dualWield = !!opts.dualWield;
  const fall = kind === 'creature' ? (table && table.fall) || 'side' : 'back';
  const koLift = koLiftFor(opts.size, fall);
  // Per-pose extra lift measured through this driver on the real
  // meshes (the Step 6 floor sweep, baked into rig-manifest.js):
  // covers the small per-model residuals (props, splayed limbs,
  // gait toe swing) the analytic stance/fall math cannot see.
  // The floor law is absolute, so the lift carries the worst case.
  const floorMargins = opts.floorMargins || null;

  // Capture bind transforms for every bone we may drive.
  const driven = new Map(); // bone -> {rx,ry,rz, px,py,pz}
  function capture(bone) {
    if (!bone || driven.has(bone)) return;
    driven.set(bone, {
      rx: bone.rotation.x, ry: bone.rotation.y, rz: bone.rotation.z,
      px: bone.position.x, py: bone.position.y, pz: bone.position.z,
    });
  }
  if (kind === 'humanoid') {
    for (const name of Object.values(HUMANOID_BONE_MAP)) capture(bones.get(name));
  } else if (kind === 'creature' && table) {
    for (const chain of Object.values(table)) {
      if (chain && chain.bones) for (const n of chain.bones) capture(bones.get(n));
    }
  }
  const meshBind = opts.meshGroup
    ? { y: opts.meshGroup.position.y, sx: opts.meshGroup.scale.x, sy: opts.meshGroup.scale.y, sz: opts.meshGroup.scale.z }
    : null;

  function resetAll() {
    for (const [bone, b] of driven) {
      bone.rotation.x = b.rx; bone.rotation.y = b.ry; bone.rotation.z = b.rz;
      bone.position.x = b.px; bone.position.y = b.py; bone.position.z = b.pz;
    }
  }
  function add(bone, axis, v) { if (bone && v) bone.rotation[axis] += v; }

  let poseNow = 'idle';
  let poseT = 0;      // seconds in current pose
  let stridePhase = 0;
  let fallCur = 0;    // eased fall amount 0..1
  let liftCur = 0;

  // ---------------- humanoid pose body ----------------
  function humanoid(pose, t, dt, ctx) {
    const B = (role) => bones.get(HUMANOID_BONE_MAP[role]);
    const P = profile;
    const wSide = weaponSide;
    const oSide = wSide === 'R' ? 'L' : 'R';
    const wUp = B('upperArm' + wSide), wFo = B('foreArm' + wSide), wCl = B('clav' + wSide);
    const oUp = B('upperArm' + oSide), oFo = B('foreArm' + oSide);
    const raiseSignW = wSide === 'R' ? -1 : 1; // rotation.z that raises the weapon arm
    const raiseSignO = oSide === 'R' ? -1 : 1;
    let lift = P.hover; // hover profiles never touch the ground
    let crouchDip = 0;

    // --- stance layer (shared by idle/walk/block/hit) ---
    const breath = Math.sin(t * P.bobHz * Math.PI * 2) * P.bobAmp;
    const swayZ = Math.sin(t * P.bobHz * Math.PI) * P.sway;
    add(B('spine'), 'z', P.lean * 0.55 + breath * 0.6);
    add(B('chest'), 'z', P.lean * 0.45);
    add(B('waist'), 'z', P.lean * 0.3);
    add(B('neck'), 'x', -P.lean * 0.5);
    add(B('head'), 'z', swayZ * 0.5);
    add(B('spine'), 'x', swayZ * 0.35);
    // stance legs: slight crouch, feet planted (thigh forward, shin back)
    add(B('thighL'), 'x', P.crouch * 0.5);
    add(B('thighR'), 'x', P.crouch * 0.5);
    add(B('calfL'), 'x', -P.crouch * 0.85);
    add(B('calfR'), 'x', -P.crouch * 0.85);
    crouchDip = P.crouch * 0.35;
    // guard arms: weapon arm carried at profile height, off arm mid-guard
    add(wUp, 'z', raiseSignW * (0.25 + P.weaponRaise * 0.75));
    add(wUp, 'x', 0.18 + P.weaponRaise * 0.22);
    add(wFo, 'x', 0.55 + P.weaponRaise * 0.35);
    add(oUp, 'z', raiseSignO * 0.38);
    add(oUp, 'x', 0.3);
    add(oFo, 'x', 0.85);
    if (dualWield) {
      add(oUp, 'z', raiseSignO * (0.25 + P.weaponRaise * 0.75));
      add(oFo, 'x', 0.55 + P.weaponRaise * 0.35);
    }

    if (pose === 'walk') {
      const dir = ctx.moveDir || 1;
      stridePhase += dt * P.gaitHz * Math.PI * (dir >= 0 ? 1 : -1);
      const s = Math.sin(stridePhase), c = Math.cos(stridePhase);
      const asymL = 1 + P.asym * Math.max(0, s);
      const asymR = 1 + P.asym * Math.max(0, -s);
      add(B('thighL'), 'x', s * P.gaitAmp * asymL);
      add(B('thighR'), 'x', -s * P.gaitAmp * asymR);
      add(B('calfL'), 'x', -Math.max(0, -c) * P.gaitAmp * 0.95 - P.crouch * 0.4);
      add(B('calfR'), 'x', -Math.max(0, c) * P.gaitAmp * 0.95 - P.crouch * 0.4);
      add(B('footL'), 'x', Math.max(0, -c) * 0.3);
      add(B('footR'), 'x', Math.max(0, c) * 0.3);
      // arms counter-swing; the weapon arm keeps its carry
      add(oUp, 'x', s * P.armSwing);
      add(wUp, 'x', -s * P.armSwing * 0.45);
      add(B('spine'), 'z', P.lean * 0.35 * dir + 0.03);
      add(B('head'), 'x', -swayZ * 0.4);
      lift += Math.abs(Math.sin(stridePhase)) * P.bobAmp * 2.2;
      if (P.squash) lift += Math.sin(stridePhase * 2) * P.squash * 0.12;
    } else if (pose === 'punch' || pose === 'kick' || pose === 'special') {
      const dur = NOMINAL_ACTION_SECONDS[pose] || 0.4;
      const p = ctx.actionT != null ? clamp01(ctx.actionT / (ctx.actionDur || dur)) : clamp01(poseT / dur);
      const e = strikeEnv(p);
      const kindOf = pose === 'special' ? (ctx.specKind || 'strike') : pose;
      if (kindOf === 'kick') {
        const legUp = B('thigh' + oSide), legCalf = B('calf' + oSide);
        add(legUp, 'x', Math.max(0, e) * 1.3 - Math.min(0, e) * 0.2);
        add(legCalf, 'x', -Math.max(0, e) * 0.12 + Math.min(0, e) * 0.3);
        add(B('spine'), 'z', -Math.max(0, e) * 0.16);
        add(wUp, 'x', -Math.max(0, e) * 0.5);
        add(oUp, 'x', -Math.max(0, e) * 0.5);
        lift += Math.max(0, e) * 0.02;
      } else if (kindOf === 'ward' || kindOf === 'heal' || kindOf === 'buff') {
        const d = decayEnv(p);
        if (kindOf === 'buff') {
          add(wUp, 'z', raiseSignW * d * 1.5);
          add(oUp, 'z', raiseSignO * d * 1.5);
          add(wFo, 'x', d * 1.2); add(oFo, 'x', d * 1.2);
          add(B('chest'), 'z', -d * 0.1);
        } else if (kindOf === 'heal') {
          add(wUp, 'z', raiseSignW * d * 0.5); add(oUp, 'z', raiseSignO * d * 0.5);
          add(wFo, 'x', d * 0.5); add(oFo, 'x', d * 0.5);
          add(B('head'), 'x', d * 0.22);
          lift += d * 0.015;
        } else { // ward: arms cross high, crouch behind them
          add(wUp, 'x', d * 0.75); add(oUp, 'x', d * 0.75);
          add(wFo, 'x', d * 1.25); add(oFo, 'x', d * 1.25);
          add(wUp, 'z', raiseSignW * d * 0.35); add(oUp, 'z', raiseSignO * d * -0.35);
          crouchDip += d * 0.1;
          add(B('head'), 'x', -d * 0.1);
        }
      } else if (kindOf === 'movement') {
        const d = decayEnv(p);
        add(B('spine'), 'z', d * 0.3);
        add(B('chest'), 'z', d * 0.18);
        add(wUp, 'x', -d * 0.7); add(oUp, 'x', -d * 0.7);
        add(B('thighL'), 'x', d * 0.4); add(B('thighR'), 'x', -d * 0.25);
        lift += d * 0.03;
      } else if (kindOf === 'projectile' || kindOf === 'debuff') {
        // both arms thrust toward the opponent, lean in
        add(wUp, 'x', Math.max(0, e) * 1.05 - Math.min(0, e) * 0.25);
        add(oUp, 'x', Math.max(0, e) * 1.05 - Math.min(0, e) * 0.25);
        add(wFo, 'x', Math.max(0, e) * 0.1);
        add(oFo, 'x', Math.max(0, e) * 0.1);
        add(B('spine'), 'z', Math.max(0, e) * 0.18);
      } else if (kindOf === 'grab') {
        add(wUp, 'x', Math.max(0, e) * 1.0 - Math.min(0, e) * 0.2);
        add(oUp, 'x', Math.max(0, e) * 1.0 - Math.min(0, e) * 0.2);
        add(wFo, 'x', Math.max(0, e) * 0.25); add(oFo, 'x', Math.max(0, e) * 0.25);
        add(B('spine'), 'z', Math.max(0, e) * 0.22);
        lift += Math.max(0, e) * 0.015;
      } else { // punch / strike special: the weapon arm strikes
        add(wUp, 'x', Math.max(0, e) * 1.2 - Math.min(0, e) * 0.35);
        add(wUp, 'z', raiseSignW * (Math.min(0, e) * -0.5));
        add(wFo, 'x', -Math.max(0, e) * 0.42 + 0.2);
        add(wCl, 'x', Math.max(0, e) * 0.25);
        add(B('spine'), 'z', Math.max(0, e) * 0.14);
        add(B('spine'), 'x', Math.max(0, e) * 0.22 * (wSide === 'R' ? 1 : -1));
        add(oUp, 'x', Math.max(0, e) * 0.3);
        if (dualWield) {
          add(oUp, 'x', Math.max(0, e) * 0.9 - Math.min(0, e) * 0.3);
          add(oFo, 'x', -Math.max(0, e) * 0.4 + 0.2);
        }
      }
    } else if (pose === 'block') {
      add(wUp, 'x', 0.62); add(oUp, 'x', 0.62);
      add(wFo, 'x', 1.3); add(oFo, 'x', 1.3);
      add(wUp, 'z', raiseSignW * 0.22); add(oUp, 'z', raiseSignO * -0.22);
      crouchDip += 0.06;
      add(B('head'), 'x', -0.08);
    } else if (pose === 'hit') {
      const p = clamp01(poseT / (NOMINAL_ACTION_SECONDS.hit));
      const e = Math.sin(Math.PI * Math.min(1, p * 1.15)) * (1 - p * 0.35);
      add(B('spine'), 'z', -e * 0.3);
      add(B('chest'), 'z', -e * 0.2);
      add(B('neck'), 'x', e * 0.3);
      add(wUp, 'z', raiseSignW * e * 0.5);
      add(oUp, 'z', raiseSignO * e * 0.5);
      crouchDip += e * 0.03;
    } else if (pose === 'win') {
      const b = Math.abs(Math.sin(t * 3.2)) * 0.05;
      add(wUp, 'z', raiseSignW * 1.65);
      add(wFo, 'x', 0.25);
      add(oUp, 'z', raiseSignO * (dualWield ? 1.65 : 0.85));
      add(oFo, 'x', dualWield ? 0.25 : 0.9);
      add(B('spine'), 'z', -0.14);
      add(B('neck'), 'x', 0.14);
      lift += b + P.hover;
    } else if (pose === 'ko') {
      // Bones go slack/splayed; the FALL itself is the wrapper's.
      add(wUp, 'z', raiseSignW * 1.25); add(oUp, 'z', raiseSignO * 1.25);
      add(wFo, 'x', 0.3); add(oFo, 'x', 0.3);
      add(B('thighL'), 'x', 0.16); add(B('thighR'), 'x', -0.1);
      add(B('calfL'), 'x', -0.22); add(B('calfR'), 'x', -0.08);
      add(B('head'), 'x', 0.25);
    }
    // idle breath on the arms
    if (pose === 'idle') {
      add(wUp, 'x', breath * 0.35);
      add(oUp, 'x', -breath * 0.3);
      lift += Math.max(0, breath) * 0.6 + P.hover;
    }
    return { lift: Math.max(0, lift - crouchDip), crouchDip };
  }

  // ---------------- creature pose body ----------------
  function chainAdd(chain, axisKey, v, falloff) {
    if (!chain || !chain.bones || !v) return;
    const cfg = chain[axisKey];
    if (!cfg) return;
    chain.bones.forEach((name, i) => {
      const bone = bones.get(name);
      if (bone) bone.rotation[cfg.axis] += cfg.sign * v * Math.pow(falloff || 0.72, i);
    });
  }
  function creature(pose, t, dt, ctx) {
    const P = profile;
    let lift = P.hover;
    let crouchDip = 0;
    const breath = Math.sin(t * P.bobHz * Math.PI * 2) * P.bobAmp;
    // stance layer
    chainAdd(table.spine, 'pitch', P.lean * 0.7 + breath * 0.5, 0.8);
    chainAdd(table.head, 'pitch', -P.lean * 0.35 + breath * 0.3, 0.8);
    chainAdd(table.tail, 'sway', Math.sin(t * 0.9) * 0.22, 0.85);
    chainAdd(table.armL, 'raise', 0.12, 0.8);
    chainAdd(table.armR, 'raise', 0.12, 0.8);
    crouchDip = P.crouch * 0.3;

    if (pose === 'walk') {
      const dir = ctx.moveDir || 1;
      stridePhase += dt * P.gaitHz * Math.PI * (dir >= 0 ? 1 : -1);
      const s = Math.sin(stridePhase), c = Math.cos(stridePhase);
      chainAdd(table.legL, 'swing', s * P.gaitAmp, 0.55);
      chainAdd(table.legR, 'swing', -s * P.gaitAmp, 0.55);
      chainAdd(table.legL, 'knee', Math.max(0, -c) * P.gaitAmp * 0.8, 0.7);
      chainAdd(table.legR, 'knee', Math.max(0, c) * P.gaitAmp * 0.8, 0.7);
      chainAdd(table.armL, 'swing', -s * P.armSwing * 0.7, 0.8);
      chainAdd(table.armR, 'swing', s * P.armSwing * 0.7, 0.8);
      chainAdd(table.tail, 'sway', -s * 0.3, 0.85);
      chainAdd(table.spine, 'pitch', 0.04 * dir, 0.8);
      lift += Math.abs(Math.sin(stridePhase)) * P.bobAmp * 2.0;
    } else if (pose === 'punch' || pose === 'kick' || pose === 'special') {
      const dur = NOMINAL_ACTION_SECONDS[pose] || 0.4;
      const p = ctx.actionT != null ? clamp01(ctx.actionT / (ctx.actionDur || dur)) : clamp01(poseT / dur);
      const e = strikeEnv(p);
      const kindOf = pose === 'special' ? (ctx.specKind || 'strike') : pose;
      if (kindOf === 'kick') {
        chainAdd(table.legR, 'swing', Math.max(0, e) * 1.15, 0.6);
        chainAdd(table.tail, 'lift', Math.max(0, e) * 0.5, 0.85);
        chainAdd(table.spine, 'pitch', -Math.max(0, e) * 0.12, 0.8);
      } else if (kindOf === 'ward' || kindOf === 'heal' || kindOf === 'buff') {
        const d = decayEnv(p);
        chainAdd(table.head, 'pitch', kindOf === 'heal' ? d * 0.3 : -d * 0.22, 0.85);
        chainAdd(table.armL, 'swing', d * 0.5, 0.8);
        chainAdd(table.armR, 'swing', d * 0.5, 0.8);
        if (kindOf !== 'heal') crouchDip += d * 0.05;
      } else if (kindOf === 'movement') {
        const d = decayEnv(p);
        chainAdd(table.spine, 'pitch', d * 0.3, 0.8);
        chainAdd(table.legL, 'swing', d * 0.5, 0.6);
        chainAdd(table.legR, 'swing', -d * 0.3, 0.6);
        lift += d * 0.03;
      } else {
        // strike / projectile / grab / debuff: bite + slash
        chainAdd(table.head, 'pitch', Math.max(0, e) * 0.55 - Math.min(0, e) * 0.2, 0.8);
        chainAdd(table.spine, 'pitch', Math.max(0, e) * 0.22, 0.8);
        const arm = weaponSide === 'R' ? table.armR : table.armL;
        chainAdd(arm, 'swing', Math.max(0, e) * 0.85 - Math.min(0, e) * 0.3, 0.8);
        chainAdd(arm, 'raise', Math.max(0, e) * 0.4, 0.8);
        if (table.armR2) chainAdd(table.armR2, 'swing', Math.max(0, e) * 0.6, 0.8);
        chainAdd(table.tail, 'lift', Math.max(0, e) * 0.35, 0.85);
      }
    } else if (pose === 'block') {
      chainAdd(table.head, 'pitch', -0.3, 0.85);
      chainAdd(table.armL, 'swing', 0.55, 0.8);
      chainAdd(table.armR, 'swing', 0.55, 0.8);
      crouchDip += 0.05;
    } else if (pose === 'hit') {
      const p = clamp01(poseT / NOMINAL_ACTION_SECONDS.hit);
      const e = Math.sin(Math.PI * Math.min(1, p * 1.15)) * (1 - p * 0.35);
      chainAdd(table.head, 'pitch', -e * 0.4, 0.85);
      chainAdd(table.spine, 'sway', e * 0.25, 0.8);
      chainAdd(table.tail, 'lift', -e * 0.3, 0.85);
    } else if (pose === 'win') {
      chainAdd(table.head, 'pitch', -0.35, 0.85);
      chainAdd(table.tail, 'lift', 0.15, 0.85);
      chainAdd(table.armL, 'raise', 0.5, 0.8);
      chainAdd(table.armR, 'raise', 0.5, 0.8);
      lift += Math.abs(Math.sin(t * 3.0)) * 0.04;
    } else if (pose === 'ko') {
      chainAdd(table.head, 'pitch', 0.3, 0.85);
      chainAdd(table.legL, 'swing', 0.2, 0.6);
      chainAdd(table.legR, 'swing', -0.14, 0.6);
      chainAdd(table.tail, 'lift', -0.15, 0.85);
    }
    return { lift: Math.max(0, lift - crouchDip), crouchDip };
  }

  // ---------------- rigless pose body ----------------
  function rigless(pose, t, dt, ctx) {
    const g = opts.meshGroup;
    const P = profile;
    let lift = 0.13 + Math.sin(t * P.bobHz * Math.PI * 2) * 0.045; // hover
    let sy = 1, sxz = 1, tiltZ = Math.sin(t * 1.7) * 0.05, tiltX = 0;
    if (pose === 'walk') {
      lift += Math.abs(Math.sin(t * P.gaitHz * Math.PI)) * 0.05;
      tiltZ += Math.sin(t * P.gaitHz * Math.PI) * 0.1;
      tiltX = (ctx.moveDir || 1) * 0.1;
    } else if (pose === 'punch' || pose === 'kick' || pose === 'special') {
      const dur = NOMINAL_ACTION_SECONDS[pose] || 0.4;
      const p = ctx.actionT != null ? clamp01(ctx.actionT / (ctx.actionDur || dur)) : clamp01(poseT / dur);
      const e = strikeEnv(p);
      tiltX = Math.max(0, e) * 0.22;
      sxz = 1 + Math.max(0, e) * 0.1;
      sy = 1 - Math.max(0, e) * 0.08;
      lift += Math.max(0, e) * 0.04;
    } else if (pose === 'block') {
      sy = 0.82; sxz = 1.12; lift = 0.08;
    } else if (pose === 'hit') {
      const p = clamp01(poseT / NOMINAL_ACTION_SECONDS.hit);
      const e = Math.sin(Math.PI * Math.min(1, p * 1.15));
      tiltZ += e * 0.3; lift += e * 0.03;
    } else if (pose === 'win') {
      lift = 0.2 + Math.abs(Math.sin(t * 3.4)) * 0.08;
      tiltZ = Math.sin(t * 3.4) * 0.14;
    } else if (pose === 'ko') {
      lift = 0; sy = 0.55; sxz = 1.25; tiltZ = 0.1;
    }
    if (g && meshBind) {
      // The wrapper (liftGroup) owns the lift — the mesh itself only
      // squashes/tilts. position.y scales WITH sy: the loader put
      // the bind bottom exactly meshBind.y below the origin, so
      // scaling y by sy keeps the bottom pinned to the wrapper's
      // floor line in every pose (a ko splat lands ON the plane,
      // never through it, never hovering).
      g.position.y = meshBind.y * sy;
      g.scale.x = meshBind.sx * sxz;
      g.scale.y = meshBind.sy * sy;
      g.scale.z = meshBind.sz * sxz;
      g.rotation.z = tiltZ;
      g.rotation.x = tiltX;
    }
    return { lift, crouchDip: 0 };
  }

  return {
    kind,
    fallKind: fall,
    koLift,
    profile,
    drivenCount: driven.size,
    /**
     * Apply a pose. Total: every driven bone is rewritten from bind
     * first, so poses never leak across states.
     * @returns {{ lift: number, fall: number }} wrapper instructions:
     *   lift >= 0 always; fall is 0..1 (eased), 1 only for 'ko'.
     */
    apply(pose, dt, now, ctx) {
      const t = now || 0;
      const step = Math.max(0, Math.min(0.1, dt || 0));
      if (pose !== poseNow) { poseNow = pose; poseT = 0; } else { poseT += step; }
      const c = ctx || {};
      resetAll();
      let out;
      if (kind === 'rigless') out = rigless(pose, t, step, c);
      else if (kind === 'creature' && table) out = creature(pose, t, step, c);
      else out = humanoid(pose, t, step, c);
      // Fall easing: in over ~0.4s, back out over ~0.35s (get-up).
      // Rigless fighters never wrapper-fall — they squash in place.
      const target = pose === 'ko' ? 1 : 0;
      const rate = target > fallCur ? step / 0.4 : step / 0.35;
      fallCur += Math.max(-rate, Math.min(rate, target - fallCur));
      fallCur = clamp01(fallCur);
      let lift = Math.max(0, out.lift || 0);
      if (fallCur > 0 && kind !== 'rigless') {
        // The falling body's lowest corner follows sin(angle), not
        // the linear fall progress — lift on the same curve or the
        // body dips through the plane mid-fall (measured: -0.13).
        const curve = Math.sin(fallCur * FALL_ANGLE) / Math.sin(FALL_ANGLE);
        lift = Math.max(lift, koLift * curve);
      }
      if (floorMargins && floorMargins[pose]) lift += floorMargins[pose];
      // smooth lift a touch so stance changes never pop
      liftCur += (lift - liftCur) * Math.min(1, step * 18 + 0.001);
      if (Math.abs(lift - liftCur) < 0.0005) liftCur = lift;
      return { lift: Math.max(0, liftCur), fall: kind === 'rigless' ? 0 : fallCur };
    },
  };
}
