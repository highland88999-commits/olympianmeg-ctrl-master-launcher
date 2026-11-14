// lib/luge/finish-guard.js
// One finish, one recording.
//
// The 3D race loop (app/luge/page.tsx, LugeTrack useFrame) calls onFinish
// EVERY frame once progress passes the line — and handleFinish awaits
// network round-trips before the scene unmounts, so a single finish used
// to record dozens of times. Seen live Nov 13, 2026: one of Merlin's
// course-8 finishes wrote ~50 near-identical rows to luge_leaderboard
// (times stepping ~17 ms — one per frame) and filled the whole top-10
// board with copies of a single run.
//
// The guard is claimed synchronously at the top of handleFinish and
// re-armed when a race starts, so exactly one invocation per run records
// anything — solo or PvP. Pure, no I/O, headless-testable.

export function createFinishGuard() {
  let recorded = false;
  return {
    // True exactly once per arming: the first finish claims the recording.
    // Every later frame's call in the same run gets false and returns.
    claim() {
      if (recorded) return false;
      recorded = true;
      return true;
    },
    // Re-arm for the next run (called when a race starts).
    reset() {
      recorded = false;
    },
  };
}
