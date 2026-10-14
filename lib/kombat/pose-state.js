// lib/kombat/pose-state.js
//
// The shared state -> pose resolver for both Kombat engines, and the
// executable form of Merlin's DOWNED-STATE LAW (2026-10-14): "They
// shouldn't be on their backs like that unless they've been downed."
//
// LAW: the returned pose is 'ko' (the on-the-back downed pose) IF AND
// ONLY IF the fighter is actually downed — state 'ko', or dead in a
// brawl. Round start, intro, idle, hit-react, dizzy, victory: never
// 'ko'. Both engines resolve poses through here, and both pose
// appliers (procedural rig.js poseRig, GLB pose-driver.js) are total
// functions that rewrite from bind every call, so a downed pose
// cannot leak across a round reset even if a stale state slipped
// through.
//
// @param s { state, alive, grounded, blockHeld, actionable }
//   state: engine fighter state ('idle'|'walk'|'attack'|'block'|
//     'hit'|'dash'|'special'|'ko'|'win'|'dizzy'|...)
//   alive: brawl passes f.alive; duel passes state !== 'ko'
//   grounded: brawl airborne fighters read as 'walk' (the leap pose)
//   blockHeld/actionable: duel block display rule from Step 5
export function resolvePose(s) {
  if (!s) return 'idle';
  if (s.alive === false || s.state === 'ko') return 'ko';
  if (s.grounded === false) return 'walk';
  switch (s.state) {
    case 'attack': return s.attackKind === 'kick' ? 'kick' : 'punch';
    case 'punch': return 'punch';
    case 'kick': return 'kick';
    case 'special': return 'special';
    case 'block': return 'block';
    case 'hit':
    case 'dizzy': return 'hit';
    case 'dash':
    case 'walk': return 'walk';
    case 'win': return 'win';
    default:
      // idle (and intro): a held block still reads as a guard
      return s.blockHeld && s.actionable ? 'block' : 'idle';
  }
}

/** True iff a pose is the downed pose. */
export function isDownedPose(pose) {
  return pose === 'ko';
}
