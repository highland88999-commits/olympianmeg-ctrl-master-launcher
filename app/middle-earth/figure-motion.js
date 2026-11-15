// app/middle-earth/figure-motion.js — PURE procedural motion math for
// Middle-earth figures. No DOM, no three.js: safe to import in node
// for headless testing and in the page/zone render loops.
//
// WHY THIS EXISTS (round 2, 2026-10-25): neither the heroes nor the
// orcs are rigged. The heroes are staged UNRIGGED GLB models (the
// wizard's staff is baked into his model), and the orcs are procedural
// brutes built from boxes (their rigged GLB twins have not landed).
// There is no skeleton to pose — so all motion is whole-figure or
// pivot-group math, computed here and applied by the render loops.
// Nothing here changes damage, speed, health, spawn rules, or hunt
// behaviour: it only moves what the player sees.

/** Rest angle of an orc arm pivot (radians, x-axis) — the old static lean. */
export const ORC_ARM_REST = -0.35;
/** Orc attack wind-up length, seconds — the warning before a hit lands. */
export const ORC_WINDUP_S = 0.35;

/**
 * Orc limb angles for one frame. All angles are pivot rotations about
 * the x-axis (positive = swings forward).
 *   moveSpeed: metres/second the orc is actually travelling (0 = standing)
 *   phase: walk-cycle phase in radians, advanced by the caller with speed
 *   windupP: 0..1 attack wind-up progress (0 = not winding up)
 *   swingP: 0..1 strike sweep envelope (0 = not swinging; 1 = mid-sweep)
 *   idleT: seconds, for the standing micro-sway
 * Returns { legL, legR, armBlade, armFree } — armBlade is the crude-blade
 * arm (the figure's side -1, where the blade mesh lives).
 */
export function orcLimbAngles({ moveSpeed = 0, phase = 0, windupP = 0, swingP = 0, idleT = 0 } = {}) {
  const moving = moveSpeed > 0.05;
  const amp = moving ? Math.min(0.55, 0.15 + moveSpeed * 0.1) : 0;
  const s = Math.sin(phase);
  let legL = s * amp;
  let legR = -s * amp;
  let armBlade = ORC_ARM_REST - s * amp * 0.6;
  let armFree = ORC_ARM_REST + s * amp * 0.6;
  if (!moving) {
    // Standing: a faint sway so the brute never reads as a statue.
    const sway = Math.sin(idleT * 1.3) * 0.05;
    armBlade = ORC_ARM_REST + sway;
    armFree = ORC_ARM_REST - sway;
    legL = 0;
    legR = 0;
  }
  if (windupP > 0) {
    // Wind-up: the blade arm rises back over the shoulder so the hit
    // can be SEEN coming; the legs plant.
    const w = Math.min(1, Math.max(0, windupP));
    armBlade = ORC_ARM_REST - w * 1.75;
    armFree = ORC_ARM_REST + w * 0.3;
    legL = 0;
    legR = 0;
  }
  if (swingP > 0) {
    // Sweep: the blade arm drives forward past rest, then settles.
    const p = Math.min(1, Math.max(0, swingP));
    armBlade = ORC_ARM_REST + p * 1.1;
  }
  return { legL, legR, armBlade, armFree };
}

/**
 * Hero whole-figure motion for one frame. The hero is an unrigged GLB
 * — one fused mesh, no skeleton, no separable legs (verified
 * 2026-11-15: every hero GLB is a single meshopt-compressed mesh,
 * 1 node, 0 skins, 0 animations; the bottom height bands show two
 * separated leg clusters with a clear gap at the centreline, but
 * they are fused into that one mesh and cannot be pivoted at the
 * hip). So the walk is a STEP RHYTHM on the whole body, not a leg
 * swing: a two-bob-per-cycle bounce, a lateral weight shift onto
 * the planted foot, a roll and a pelvis/shoulder counter-twist in
 * counter-phase, and a small forward surge per step. Applied ON TOP
 * of the figure's own breathing (buildFigure.update owns position.y
 * and rotation.y absolutely, so the caller adds bobY/twistY after
 * calling update; swayX/stepZ/leanX/rollZ are set before it —
 * update touches neither position.x/z nor rotation.x/z).
 *   speed: metres/second the hero is actually travelling
 *   phase: walk-cycle phase in radians, advanced by the caller with
 *     heroPhaseRate(speed) — one phase cycle (2π) is TWO steps
 *   swingP: 0..1 strike envelope (0 = not striking; 1 = mid-strike)
 *   kind: 'melee' | 'ranged' — a blade/staff-blow twists through, a
 *     staff blast/blast raises back before the shot leaves
 * Returns { bobY, leanX, twistY, rollZ, swayX, stepZ } — bobY/twistY
 * added after update(), the rest set before it. Standing still
 * returns all zeros: no swing, no sway, no bob.
 */
export function heroMotionPose({ speed = 0, phase = 0, swingP = 0, kind = 'melee' } = {}) {
  const a = gaitAmp(speed);
  const s = Math.sin(phase); // once per step: weight shift, roll, twist
  const s2 = Math.sin(phase * 2); // twice per cycle: bob + surge, one per footfall
  let bobY = s2 * 0.085 * a;
  let leanX = -0.08 * a + s2 * 0.03 * a; // forward lean, dipping with each step
  let twistY = s * 0.16 * a; // pelvis/shoulders counter-rotate per step
  let rollZ = s * 0.11 * a; // lean over the planted foot
  let swayX = s * 0.055 * a; // weight shifts side to side, one per step
  let stepZ = s2 * 0.03 * a; // small forward surge per footfall
  if (swingP > 0) {
    const p = Math.min(1, Math.max(0, swingP));
    if (kind === 'ranged') {
      // Staff/blast raise: lean back as the shot leaves the tip.
      leanX += 0.2 * p;
      twistY += 0.15 * p;
      bobY += 0.03 * p;
    } else {
      // Melee swing: twist through the blow, lean into it.
      twistY += 0.55 * p;
      leanX += -0.35 * p;
    }
  }
  return { bobY, leanX, twistY, rollZ, swayX, stepZ };
}

/** Metres of travel per step at a full stride (hero walk). */
export const HERO_STEP_STRIDE_M = 2.2;
/** Fastest readable step rate — faster than this blurs on the phone. */
export const HERO_MAX_STEPS_PER_S = 5;

/**
 * Walk-cycle phase advance, radians per second, for a hero travelling
 * at `speed` m/s. One phase cycle (2π) is two steps, so the rate is
 * π × steps-per-second. At the realm's 10 m/s walk that is ~4.5
 * steps/s (14.3 rad/s); the old flat `speed × 4.4` ran 44 rad/s at
 * the same speed — 7 sway cycles a second, too fast for the eye to
 * resolve, which is part of why the walk read as a glide. Standing
 * still advances nothing.
 */
export function heroPhaseRate(speed = 0) {
  if (speed <= 0.5) return 0;
  return Math.PI * Math.min(HERO_MAX_STEPS_PER_S, speed / HERO_STEP_STRIDE_M);
}

/**
 * Step-envelope amplitude, 0..~1.35, as a function of travel speed.
 * Fades in from standing (no snap at the first step), reaches full
 * walk at ~6.5 m/s, and grows a further 35% into the sprint
 * (~18 m/s) so a sprint swings harder and faster than a walk.
 * Shared by the hero walk, the seat pose, and the horse gallop so
 * the rider and the horse exaggerate together.
 */
function gaitAmp(speed) {
  if (speed <= 0.5) return 0;
  const walk = Math.min(1, (speed - 0.5) / 6);
  const sprint = 1 + 0.35 * Math.min(1, Math.max(0, (speed - 10) / 8));
  return walk * sprint;
}

/** Metres of travel per gallop stride (horse). */
export const HORSE_STRIDE_M = 3.5;
/** Fastest readable gallop — faster than this the rock blurs. */
export const HORSE_MAX_STRIDES_PER_S = 4.5;

/**
 * Gallop phase advance, radians per second, for a horse travelling
 * at `speed` m/s. One phase cycle (2π) is one stride, so the rate
 * is 2π × strides-per-second. Standing still advances nothing.
 */
export function gallopPhaseRate(speed = 0) {
  if (speed <= 0.5) return 0;
  return 2 * Math.PI * Math.min(HORSE_MAX_STRIDES_PER_S, speed / HORSE_STRIDE_M);
}

/**
 * Horse gallop pose for one frame. The horse GLB is likewise one
 * fused unrigged mesh (1 node, 0 skins, 0 animations; four
 * separated legs at the bottom bands, fused into the mesh), so the
 * gallop is whole-body: one big suspension bob per stride, a pitch
 * rock lagging the rise by 0.6 rad (nose up in suspension, nose
 * down on landing), and a faint roll. legFront/legRear/maneSway are
 * PHASE READOUTS only — there is no pivot to apply them to on the
 * fused mesh; they exist so a future procedural leg/mane piece, or
 * Worker A's mount code, can move in time with the stride.
 *   speed: metres/second the horse is actually travelling
 *   phase: gallop-cycle phase in radians, advanced by the caller
 *     with gallopPhaseRate(speed) — one phase cycle is one stride
 * Returns { bobY, pitchX, rollZ, legFront, legRear, maneSway }.
 * Standing mounted returns all zeros — the horse stands, breathing
 * only (buildFigure idle owns that).
 */
export function horseGallopPose({ speed = 0, phase = 0 } = {}) {
  const a = gaitAmp(speed);
  if (a === 0) return { bobY: 0, pitchX: 0, rollZ: 0, legFront: 0, legRear: 0, maneSway: 0 };
  const s = Math.sin(phase);
  return {
    bobY: s * 0.12 * a,
    pitchX: Math.sin(phase + 0.6) * 0.10 * a,
    rollZ: s * 0.03 * a,
    legFront: s * 0.5 * a,
    legRear: Math.sin(phase + Math.PI) * 0.5 * a,
    maneSway: Math.sin(phase + 1.2) * 0.15 * a,
  };
}

/**
 * Seated rider pose for one frame — the hero ON the horse. Same six
 * fields as heroMotionPose so the two blend cleanly. The rider
 * rides the saddle: bobY follows the horse's own bob (pass
 * horseGallopPose's bobY in as horseBobY so rider and horse never
 * detach), with only a small extra bounce of their own; the lean
 * is a seated forward rock with the stride, the twist/roll small.
 * Standing mounted keeps the seated lean (-0.12) with no bounce.
 *   speed / phase: as heroMotionPose (the horse's travel + stride)
 *   horseBobY: the ridden horse's horseGallopPose().bobY this frame
 */
export function heroSeatPose({ speed = 0, phase = 0, horseBobY = 0 } = {}) {
  const a = gaitAmp(speed);
  const s = Math.sin(phase);
  return {
    bobY: horseBobY + Math.sin(phase * 2) * 0.02 * a,
    leanX: -0.12 - s * 0.04 * a,
    twistY: s * 0.05 * a,
    rollZ: s * 0.04 * a,
    swayX: 0,
    stepZ: 0,
  };
}

/** Mount/dismount blend length, seconds — the pose must not snap. */
export const MOUNT_BLEND_S = 0.35;

/**
 * Blend two poses field by field (walk pose ↔ seat pose, either
 * direction) with a smoothstep ease, so a mount/dismount never
 * snaps: at t=0 the result is exactly `a`, at t=1 exactly `b`,
 * and in between it eases (smoothstep, so the ends move slowest).
 * Both poses carry the same six fields; any extra numeric field
 * present on either side blends the same way.
 */
export function blendPoses(a, b, t) {
  // Exact ends: t=0 is a and t=1 is b, bit for bit — no float dust
  // on the pose the loop is already holding.
  if (t <= 0) return { ...(a || {}) };
  if (t >= 1) return { ...(b || {}) };
  const k = t * t * (3 - 2 * t); // smoothstep: ends move slowest
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    const av = a ? a[key] : undefined;
    const bv = b ? b[key] : undefined;
    out[key] = (typeof av === 'number' && typeof bv === 'number')
      ? av + (bv - av) * k
      : (bv !== undefined ? bv : av);
  }
  return out;
}

/** Mission card law: full card on entry, then it tucks to one line. */
export const MISSION_TUCK_AFTER_S = 6;
/** After the player re-opens the tucked card, it re-tucks this long after. */
export const MISSION_RETUCK_AFTER_S = 8;

/**
 * Should the mission card be tucked right now? Pure function of the
 * mission clock (the one clock proven to advance in real play):
 *   elapsed: mission seconds on the HUD clock
 *   expandedAt: mission seconds when the player last tapped the tucked
 *     chip open, or -MISSION_RETUCK_AFTER_S when never expanded
 * The card tucks once the clock passes the tuck time, and stays open
 * for the re-tuck window after a manual expand.
 */
export function shouldTuckMissionCard(elapsed, expandedAt) {
  const exp = expandedAt == null ? -MISSION_RETUCK_AFTER_S : expandedAt;
  return elapsed >= MISSION_TUCK_AFTER_S && elapsed >= exp + MISSION_RETUCK_AFTER_S;
}
