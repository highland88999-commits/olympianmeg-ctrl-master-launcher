// lib/sports/hockey.js — Ice hockey, NHL fundamentals (Merlin, 2026-10-31; NHL rules pass 2026-11-01).
//
// 4v4 (3 skaters + goalie). NHL rules: blue-line offside with delayed
// offside / tag-up (83.3), icing (81), 2:00 minors (26a) with delayed
// penalties (32), shorthanded goals ending minors (26c), checking from
// behind = automatic minor / misconduct when severe (43), interference
// (56), crease enforcement (69), faceoff locations per infraction (76.2),
// breakaway from-behind fouls = penalty shot (24), shootout shooter
// rotation (84.4). Declared format choices (not violations): 2x3:00
// periods, 2:00 OT 3v3 sudden death, 3-round shootout.
// Pure logic, node-tested.

export const RINK_W = 30;
export const RINK_L = 60;
export const GOAL_W = 4;
export const BLUE_LINE_Z = 10; // blue lines at z = ±10
export const GOAL_LINE_Z = 26; // nets 4m off the end boards
export const CREASE_R = 1.8;
export const PERIOD_SECONDS = 180;
export const PENALTY_SECONDS = 120; // NHL 26(a): minor = 2:00
export const MISCONDUCT_SECONDS = 600; // NHL 26: misconduct = 10:00
export const OT_SECONDS = 120;

export const SHOT_TYPES = {
  wrist: { power: 24, spread: 0.10, windup: 0 },
  slap: { power: 34, spread: 0.28, windup: 0.6 },
  backhand: { power: 20, spread: 0.16, windup: 0 },
};

// Shot timing windows (seconds of SHOOT hold), Merlin 2026-11-02:
//   tap < 0.30        → wrist shot (quick release, accurate)
//   0.30 – 0.60       → backhand (half-second hold)
//   > 0.60            → slap shot, power scales 26 → 38 over 0.6s → 1.2s hold
export const SHOT_TIMING = { wristMax: 0.30, backhandMax: 0.60, slapFull: 1.20 };
export const SLAP_MIN_POWER = 26;
export const SLAP_MAX_POWER = 38;

/** Slap-shot power for a given hold duration (seconds). */
export function slapPower(holdSeconds) {
  const t = Math.max(0, Math.min(1, (holdSeconds - SHOT_TIMING.backhandMax) / (SHOT_TIMING.slapFull - SHOT_TIMING.backhandMax)));
  return SLAP_MIN_POWER + t * (SLAP_MAX_POWER - SLAP_MIN_POWER);
}

export function createHockey(playerName = 'You') {
  const mkSkaters = (team, isBlue) => {
    const base = isBlue ? 1 : -1;
    return [
      { id: `${team}-c`, name: team === 'blue' ? 'AI Center' : 'AI Opponent', team, isHuman: false, role: 'C', x: 0, z: base * 8, vx: 0, vz: 0, penalty: 0, penaltyType: null },
      { id: `${team}-w1`, name: team === 'blue' ? 'AI Winger' : 'AI Opponent', team, isHuman: false, role: 'W', x: -7, z: base * 12, vx: 0, vz: 0, penalty: 0, penaltyType: null },
      { id: `${team}-w2`, name: team === 'blue' ? 'AI Winger' : 'AI Opponent', team, isHuman: false, role: 'W', x: 7, z: base * 12, vx: 0, vz: 0, penalty: 0, penaltyType: null },
    ];
  };
  return {
    status: 'faceoff',
    period: 1, // 1, 2, then 'ot', then 'shootout'
    clock: PERIOD_SECONDS,
    score: { blue: 0, red: 0 },
    puck: { x: 0, z: 0, vx: 0, vz: 0, holder: null, keepAwayFrom: null, keepAwayT: 0 },
    players: [
      { id: 'you', name: playerName, team: 'blue', isHuman: true, role: 'C', x: 0, z: 8, vx: 0, vz: 0, penalty: 0, penaltyType: null },
      ...mkSkaters('blue', true).slice(1),
      ...mkSkaters('red', false),
      { id: 'blue-g', name: 'AI Goalie', team: 'blue', isHuman: false, role: 'G', x: 0, z: GOAL_LINE_Z - 0.6, vx: 0, vz: 0, penalty: 0, penaltyType: null },
      { id: 'red-g', name: 'AI Goalie', team: 'red', isHuman: false, role: 'G', x: 0, z: -GOAL_LINE_Z + 0.6, vx: 0, vz: 0, penalty: 0, penaltyType: null },
    ],
    shootout: { round: 0, blueMade: 0, redMade: 0, turn: 'blue', attempts: [], shotBy: [], phase: 'setup' },
    delayedPenalty: null, // { playerId, team, reason, type } — NHL 32: whistle when the offending team touches the puck
    delayedOffside: null, // { team, zone, offenders } — NHL 83.3: play on until an offender plays the puck or everyone tags up
    icing: null, // { team } — shot from behind center, crossed the far goal line, awaiting first touch (NHL 81)
    lastShot: null, // { team, z } — origin of the last shot, for icing + zone-entry offside
    penaltyShot: null, // { shooterId, team, foulZ, phase } — NHL 24
    faceoffSide: 1, // alternates which end-zone dot (±8) hosts the draw
    nextFaceoffZ: 0, // dot for the upcoming faceoff, set per infraction (NHL 76.2)
    events: [],
    winner: null,
  };
}

export function activeSkaters(state, team) {
  return state.players.filter((p) => p.team === team && p.role !== 'G' && p.penalty <= 0);
}

function zoneOf(z) {
  return z > BLUE_LINE_Z ? 'blue-end' : z < -BLUE_LINE_Z ? 'red-end' : 'neutral';
}

/** True if (x,z) is inside the goal crease of the defending team (NHL 69). */
function inCrease(x, z, defendingTeam) {
  const gz = defendingTeam === 'blue' ? GOAL_LINE_Z : -GOAL_LINE_Z;
  const towardCenter = defendingTeam === 'blue' ? z < gz : z > gz;
  return towardCenter && Math.hypot(x, z - gz) < CREASE_R;
}

function attackingSkaterInCrease(state, attacking, defending) {
  return state.players.some(
    (p) => p.team === attacking && p.role !== 'G' && p.penalty <= 0 &&
      state.puck.holder !== p.id && inCrease(p.x, p.z, defending)
  );
}

/** Queue a faceoff at the given dot (NHL 76.2 locations are chosen by the caller). */
export function setFaceoff(state, dotZ = 0) {
  state.nextFaceoffZ = dotZ;
  state.delayedOffside = null;
  state.icing = null;
  state.lastShot = null;
  state.status = 'faceoff';
}

/**
 * Whistle + faceoff. A stoppage during a delayed penalty means the penalty
 * is assessed (NHL 32) — the ensuing draw goes to the penalized team's zone.
 */
function whistle(state, dotZ = 0) {
  const dp = state.delayedPenalty;
  state.delayedPenalty = null;
  if (dp) applyPenalty(state, dp.playerId, dp.reason, dp.type);
  else setFaceoff(state, dotZ);
}

export function faceoff(state, dotZ = 0) {
  const z = dotZ || 0;
  const side = z === 0 ? 0 : (state.faceoffSide = -(state.faceoffSide || 1));
  const dotX = z === 0 ? 0 : 8 * side;
  state.puck.x = dotX; state.puck.z = z;
  state.puck.vx = 0; state.puck.vz = 0;
  state.puck.holder = null;
  state.puck.keepAwayFrom = null;
  state.puck.keepAwayT = 0;
  state.icing = null;
  state.lastShot = null;
  state.delayedOffside = null;
  for (const p of state.players) {
    if (p.penalty > 0) continue; // penalized stay in the box
    const base = p.team === 'blue' ? 1 : -1;
    if (p.role === 'G') { p.x = 0; p.z = base * (GOAL_LINE_Z - 0.6); }
    else if (p.role === 'C') { p.x = dotX + (p.isHuman ? 0 : (p.team === 'blue' ? 1.5 : -1.5)); p.z = z + base * 1.5; }
    else { p.x = dotX + (p.id.endsWith('w1') ? -7 : 7); p.z = z + base * 6; }
    // OT: 3v3 — already 3 skaters, fine
    p.vx = 0; p.vz = 0;
  }
  // In OT the extra skater sits (we only have 3 anyway)
  state.status = 'play';
}

function scoreGoal(state, team, isPenaltyShot = false) {
  const other = team === 'blue' ? 'red' : 'blue';
  if (!isPenaltyShot && activeSkaters(state, other).length < activeSkaters(state, team).length) {
    // NHL 26(c): a shorthanded goal ends the minor (coincidental minors don't terminate)
    let victim = null;
    for (const p of state.players) {
      if (p.team !== other || p.penalty <= 0) continue;
      if ((p.penaltyType || 'minor') !== 'minor') continue;
      if (!victim || p.penalty < victim.penalty) victim = p;
    }
    if (victim) {
      victim.penalty = 0;
      victim.penaltyType = null;
      state.events.push({ type: 'penaltyEnded', playerId: victim.id, team: other, reason: 'shorthanded-goal' });
    }
  }
  state.score[team] += 1;
  state.events.push({ type: 'goal', team, score: { ...state.score } });
  // Delayed penalty vs the goal (NHL 15.1): non-offending team scores → minor wiped;
  // offending team scores → the penalty is still assessed.
  const dp = state.delayedPenalty;
  state.delayedPenalty = null;
  state.delayedOffside = null;
  state.icing = null;
  state.lastShot = null;
  if (dp) {
    if (dp.team !== team) {
      state.events.push({ type: 'penaltyWiped', team: dp.team, reason: dp.reason });
    } else {
      applyPenalty(state, dp.playerId, dp.reason, dp.type);
      return;
    }
  }
  if (state.period === 'ot') {
    // Sudden death — game over
    state.status = 'done';
    state.winner = team;
    state.events.push({ type: 'win', winner: team });
  } else {
    setFaceoff(state, 0);
  }
}

/**
 * Offside, NHL 83: judged at the instant the puck crosses the blue line into
 * an end zone. If the team that propelled it in already has skaters over the
 * line ahead of the puck (other than the carrier), that's offside — but the
 * whistle is delayed (83.3), see resolveDelayedOffside.
 */
function checkZoneEntryOffside(state, prevZ) {
  const prevZone = zoneOf(prevZ);
  const zone = zoneOf(state.puck.z);
  if (prevZone === zone || (zone !== 'red-end' && zone !== 'blue-end')) return null;
  const attacking = zone === 'red-end' ? 'blue' : 'red';
  const holder = state.puck.holder ? state.players.find((p) => p.id === state.puck.holder) : null;
  const propelling = holder ? holder.team : (state.lastShot ? state.lastShot.team : null);
  if (propelling !== attacking) return null; // defending team put it there — no offside
  const lineZ = zone === 'red-end' ? -BLUE_LINE_Z : BLUE_LINE_Z;
  const offenders = [];
  for (const p of state.players) {
    if (p.team !== attacking || p.role === 'G' || p.penalty > 0) continue;
    if (state.puck.holder === p.id) continue; // the carrier is never offside
    const overLine = zone === 'red-end' ? p.z < lineZ : p.z > lineZ;
    if (overLine) offenders.push(p.id);
  }
  return offenders.length ? { team: attacking, offenders } : null;
}

function offsideOffenders(state, team) {
  const zone = team === 'blue' ? 'red-end' : 'blue-end';
  if (zoneOf(state.puck.z) !== zone) return [];
  const lineZ = team === 'blue' ? -BLUE_LINE_Z : BLUE_LINE_Z;
  const out = [];
  for (const p of state.players) {
    if (p.team !== team || p.role === 'G' || p.penalty > 0) continue;
    if (state.puck.holder === p.id) continue;
    const overLine = team === 'blue' ? p.z < lineZ : p.z > lineZ;
    if (overLine) out.push(p.id);
  }
  return out;
}

/** Delayed offside resolution (NHL 83.3): whistle only if an offender plays the puck. */
function resolveDelayedOffside(state) {
  const d = state.delayedOffside;
  if (!d) return;
  if (state.puck.holder && d.offenders.includes(state.puck.holder)) {
    state.events.push({ type: 'offside', team: d.team, delayed: true });
    // NHL 76.2: offside → nearest neutral-zone dot
    whistle(state, d.team === 'blue' ? -BLUE_LINE_Z : BLUE_LINE_Z);
    return;
  }
  // Tag-up complete, or the puck left the zone → play on
  if (offsideOffenders(state, d.team).length === 0 || zoneOf(state.puck.z) !== d.zone) {
    state.delayedOffside = null;
  }
}

/**
 * Assess a foul. Immediate whistle only if the offending team has possession;
 * otherwise the penalty is delayed (NHL 32) until they touch the puck.
 */
function assessPenalty(state, playerId, reason, type = 'minor') {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.role === 'G') return;
  const holder = state.puck.holder ? state.players.find((x) => x.id === state.puck.holder) : null;
  if (holder && holder.team === p.team) {
    applyPenalty(state, playerId, reason, type);
    return;
  }
  const seconds = type === 'misconduct' ? MISCONDUCT_SECONDS : PENALTY_SECONDS;
  const cur = state.delayedPenalty && state.delayedPenalty.playerId === playerId
    ? (state.delayedPenalty.type === 'misconduct' ? MISCONDUCT_SECONDS : PENALTY_SECONDS)
    : 0;
  if (seconds >= cur) {
    state.delayedPenalty = { playerId, team: p.team, reason, type };
    state.events.push({ type: 'delayedPenalty', playerId, team: p.team, reason });
  }
}

function applyPenalty(state, playerId, reason, type = 'minor') {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.role === 'G') return;
  const seconds = type === 'misconduct' ? MISCONDUCT_SECONDS : PENALTY_SECONDS;
  if (p.penalty < seconds) {
    p.penalty = seconds;
    p.penaltyType = type;
  }
  if (state.puck.holder === playerId) state.puck.holder = null;
  state.events.push({ type: 'penalty', playerId, team: p.team, reason, seconds, penaltyType: type });
  // NHL 76.2: faceoff in the penalized team's defending zone
  setFaceoff(state, p.team === 'blue' ? 14 : -14);
  state.delayedPenalty = null;
}

/** Breakaway: puck carrier past center with no defender between him and the net. */
function isBreakaway(state, skater) {
  const goalZ = skater.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;
  if (skater.team === 'blue' ? skater.z > 2 : skater.z < -2) return false;
  for (const d of state.players) {
    if (d.team === skater.team || d.role === 'G' || d.penalty > 0) continue;
    if (skater.team === 'blue') {
      if (d.z < skater.z && d.z > goalZ) return false;
    } else if (d.z > skater.z && d.z < goalZ) {
      return false;
    }
  }
  return true;
}

/** NHL 24: a from-behind foul on a breakaway is a penalty shot, not a minor. */
function awardPenaltyShot(state, shooter) {
  state.penaltyShot = { shooterId: shooter.id, team: shooter.team, foulZ: shooter.z, phase: 'setup' };
  state.delayedPenalty = null;
  state.delayedOffside = null;
  state.icing = null;
  state.lastShot = null;
  state.events.push({ type: 'penaltyShot', team: shooter.team, shooter: shooter.id });
  state.status = 'penaltyshot';
}

export function stepHockey(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status === 'shootout') {
    stepShootout(state, dt, human, rng);
    return;
  }
  if (state.status === 'penaltyshot') {
    stepPenaltyShot(state, dt, human, rng);
    return;
  }
  if (state.status !== 'play') return;

  // Clock + penalties tick
  state.clock -= dt;
  for (const p of state.players) {
    if (p.penalty > 0) p.penalty = Math.max(0, p.penalty - dt);
  }
  if (state.clock <= 0) {
    if (state.period === 1) {
      state.period = 2; state.clock = PERIOD_SECONDS;
      state.events.push({ type: 'period', period: 2 });
      whistle(state, 0);
    } else if (state.period === 2) {
      if (state.score.blue !== state.score.red) {
        state.status = 'done';
        state.winner = state.score.blue > state.score.red ? 'blue' : 'red';
        state.events.push({ type: 'win', winner: state.winner });
      } else {
        state.period = 'ot'; state.clock = OT_SECONDS;
        state.events.push({ type: 'period', period: 'ot' });
        whistle(state, 0);
      }
    } else if (state.period === 'ot') {
      // Still tied → shootout
      state.period = 'shootout';
      state.status = 'shootout';
      state.shootout = { round: 0, blueMade: 0, redMade: 0, turn: 'blue', attempts: [], shotBy: [], phase: 'setup' };
      state.events.push({ type: 'shootout' });
    }
    return;
  }

  const puck = state.puck;
  const prevPuckZ = puck.z;
  const prevHolder = puck.holder;
  const you = state.players.find((p) => p.isHuman);

  // ---- Human ----
  if (you && human && you.penalty <= 0) {
    const speed = 12;
    const oldX = you.x;
    const oldZ = you.z;
    let humanChecked = false; // one check per step — no double jeopardy
    you.vx = human.mx * speed;
    you.vz = human.mz * speed;
    you.x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, you.x + you.vx * dt));
    you.z = Math.max(-RINK_L / 2 + 1, Math.min(RINK_L / 2 - 1, you.z + you.vz * dt));
    // NHL 69: no voluntary entry into the attacking crease (the puck carrier
    // may skate it in; anyone may enter once the puck is already there)
    const carrying = puck.holder === you.id;
    if (!carrying && inCrease(you.x, you.z, 'red') && !inCrease(oldX, oldZ, 'red') && !inCrease(puck.x, puck.z, 'red')) {
      you.x = oldX;
      you.z = oldZ;
    }

    if (!puck.holder && canPickup(state, you) && Math.hypot(puck.x - you.x, puck.z - you.z) < 1.5) {
      puck.holder = you.id;
    }
    // Steal: skate into the carrier
    if (puck.holder && puck.holder !== you.id) {
      const carrier = state.players.find((p) => p.id === puck.holder);
      if (carrier && carrier.team !== you.team && Math.hypot(carrier.x - you.x, carrier.z - you.z) < 1.2) {
        if (human.check) {
          // Body check!
          bodyCheck(state, you, carrier, rng);
          humanChecked = true;
        } else if (rng() < 0.6) {
          puck.holder = you.id; // poke check
          state.events.push({ type: 'steal', playerId: you.id });
        }
      }
    }
    // Pass — to the teammate best aligned with the aim, led slightly
    if (human.pass && puck.holder === you.id) {
      const mate = pickPassTarget(state, you, human.aimDx || 0, human.aimDz || 0);
      if (mate) {
        puck.holder = null;
        puck.keepAwayFrom = you.id;
        puck.keepAwayT = 0.3;
        const lead = passLeadPoint(mate);
        const dx = lead.x - puck.x;
        const dz = lead.z - puck.z;
        const dist = Math.hypot(dx, dz) || 1;
        puck.vx = (dx / dist) * 22;
        puck.vz = (dz / dist) * 22;
        state.events.push({ type: 'pass', from: you.id, to: mate.id });
      }
    }
    // Shoot (fires on SHOOT release — type/power chosen by hold duration)
    if (human.shoot && puck.holder === you.id) {
      shootPuck(state, you, human.shotType || 'wrist', rng, human.shotPower);
    }
    // Body check without puck
    if (human.check && !humanChecked && (!puck.holder || puck.holder !== you.id)) {
      const target = nearestOpponent(state, you, 1.6);
      if (target) bodyCheck(state, you, target, rng);
    }
  }
  if (state.status !== 'play') return;

  // ---- AI ----
  for (const p of state.players) {
    if (p.isHuman || p.penalty > 0) continue;
    if (p.role === 'G') { goalieAI(state, p, dt, rng); continue; }

    // Delayed-offside tag-up (NHL 83.3): skate back across the blue line
    if (state.delayedOffside && state.delayedOffside.team === p.team &&
        offsideOffenders(state, p.team).includes(p.id)) {
      const lineZ = p.team === 'blue' ? -BLUE_LINE_Z : BLUE_LINE_Z;
      const safeZ = lineZ + (p.team === 'blue' ? 4 : -4);
      const dx = 0 - p.x;
      const dz = safeZ - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      p.x += (dx / dist) * 9 * dt;
      p.z += (dz / dist) * 9 * dt;
      p.x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, p.x));
      p.z = Math.max(-RINK_L / 2 + 1, Math.min(RINK_L / 2 - 1, p.z));
      continue;
    }

    const targetGoalZ = p.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;

    if (puck.holder === p.id) {
      // Carry up ice, pass or shoot
      const dx = -p.x * 0.25;
      const dz = targetGoalZ - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      p.x += (dx / dist) * 10 * dt;
      p.z += (dz / dist) * 10 * dt;
      puck.x = p.x; puck.z = p.z;
      // Pass if pressured
      const pressure = nearestOpponent(state, p, 3);
      if (pressure && rng() < 0.03) {
        const mate = nearestMate(state, p);
        if (mate) {
          puck.holder = null;
          const mdx = mate.x - puck.x;
          const mdz = mate.z - puck.z;
          const mdist = Math.hypot(mdx, mdz) || 1;
          puck.vx = (mdx / mdist) * 20;
          puck.vz = (mdz / mdist) * 20;
        }
      }
      // Shoot in range
      if (Math.abs(p.z - targetGoalZ) < 14 && rng() < 0.03) {
        shootPuck(state, p, rng() < 0.7 ? 'wrist' : 'slap', rng);
      }
      // AI body checks the human carrier
      if (you && puck.holder === you.id && Math.hypot(you.x - p.x, you.z - p.z) < 1.4 && rng() < 0.008) {
        bodyCheck(state, p, you, rng);
      }
    } else if (!puck.holder) {
      // Chase loose puck (not goalies, not penalized)
      const dx = puck.x - p.x;
      const dz = puck.z - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist < 20 && dist > 0.6) {
        p.x += (dx / dist) * 9 * dt;
        p.z += (dz / dist) * 9 * dt;
      }
      if (dist < 1.5 && canPickup(state, p)) puck.holder = p.id;
    } else {
      // Backcheck / defend
      const holder = state.players.find((x) => x.id === puck.holder);
      if (holder) {
        const dx = holder.x - p.x;
        const dz = holder.z - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        if (dist > 2) {
          p.x += (dx / dist) * 8.5 * dt;
          p.z += (dz / dist) * 8.5 * dt;
        }
        // Steal attempt
        if (dist < 1.3 && holder.team !== p.team && rng() < 0.012) {
          puck.holder = p.id;
          state.events.push({ type: 'steal', playerId: p.id });
        }
      }
    }
    p.x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, p.x));
    p.z = Math.max(-RINK_L / 2 + 1, Math.min(RINK_L / 2 - 1, p.z));
  }
  if (state.status !== 'play') return;

  // Puck physics
  if (!puck.holder) {
    if (puck.keepAwayT > 0) puck.keepAwayT -= dt;
    puck.x += puck.vx * dt;
    puck.z += puck.vz * dt;
    puck.vx *= (1 - 0.5 * dt);
    puck.vz *= (1 - 0.5 * dt);
    // Goalie saves
    for (const g of state.players.filter((p) => p.role === 'G')) {
      if (Math.hypot(puck.x - g.x, puck.z - g.z) < 1.2 && Math.hypot(puck.vx, puck.vz) > 4) {
        // Save! Puck deflects
        const ang = rng() * Math.PI * 2;
        puck.vx = Math.cos(ang) * 8;
        puck.vz = Math.sin(ang) * 8;
        state.events.push({ type: 'save', goalie: g.id });
        if (state.icing) {
          // Goalie played it — icing waved off (NHL 81)
          state.icing = null;
          state.lastShot = null;
          state.events.push({ type: 'icingWaved' });
        }
        break;
      }
    }
    // Boards
    if (Math.abs(puck.x) > RINK_W / 2 - 0.5) {
      puck.x = Math.sign(puck.x) * (RINK_W / 2 - 0.5);
      puck.vx *= -0.7;
    }
    // Goal line
    if (Math.abs(puck.z) > GOAL_LINE_Z) {
      if (Math.abs(puck.x) < GOAL_W / 2) {
        const attacking = puck.z < 0 ? 'blue' : 'red';
        const defending = attacking === 'blue' ? 'red' : 'blue';
        // Merlin 2026-11-02: a goal ONLY counts if the puck was SHOT.
        // Carrying/dumping it across the line is no goal — the shot must
        // have been taken from onside the goal line (no shooting from
        // inside the net after skating through).
        const shot = state.lastShot;
        const validShot = shot && shot.team === attacking && Math.abs(shot.z) <= GOAL_LINE_Z;
        if (!validShot) {
          state.events.push({ type: 'creaseViolation', team: attacking });
          whistle(state, attacking === 'blue' ? -BLUE_LINE_Z : BLUE_LINE_Z);
          return;
        }
        if (attackingSkaterInCrease(state, attacking, defending)) {
          // NHL 69: no goal with an attacker (other than the carrier) in the crease
          state.events.push({ type: 'creaseViolation', team: attacking });
          whistle(state, attacking === 'blue' ? -BLUE_LINE_Z : BLUE_LINE_Z);
          return;
        }
        scoreGoal(state, attacking);
        return;
      }
      maybeStartIcing(state, Math.sign(puck.z));
      puck.z = Math.sign(puck.z) * (RINK_L / 2 - 0.5);
      puck.vz *= -0.7;
    } else if (Math.abs(puck.z) > RINK_L / 2 - 0.5) {
      puck.z = Math.sign(puck.z) * (RINK_L / 2 - 0.5);
      puck.vz *= -0.7;
    }
  } else {
    const holder = state.players.find((p) => p.id === puck.holder);
    if (holder) {
      puck.x = holder.x; puck.z = holder.z;
      // Merlin 2026-11-02: skating the puck through the net is NO GOAL.
      // A held puck crossing the goal line inside the goal mouth = whistle,
      // faceoff, no goal. (Skating behind the net outside the posts is fine.)
      if (Math.abs(puck.z) > GOAL_LINE_Z && Math.abs(puck.x) < GOAL_W / 2) {
        state.events.push({ type: 'creaseViolation', team: holder.team });
        whistle(state, holder.team === 'blue' ? -BLUE_LINE_Z : BLUE_LINE_Z);
        return;
      }
    }
  }

  // Crease enforcement for AI skaters (NHL 69): stay out unless the puck is
  // already there (the carrier may skate it in)
  for (const p of state.players) {
    if (p.role === 'G' || p.penalty > 0 || p.isHuman || puck.holder === p.id) continue;
    const defending = p.team === 'blue' ? 'red' : 'blue';
    if (inCrease(p.x, p.z, defending) && !inCrease(puck.x, puck.z, defending)) {
      const gz = defending === 'blue' ? GOAL_LINE_Z : -GOAL_LINE_Z;
      const dx = p.x;
      const dz = p.z - gz;
      const d = Math.hypot(dx, dz) || 1;
      const r = CREASE_R + 0.4;
      p.x = (dx / d) * r;
      const nz = gz + (dz / d) * r;
      p.z = defending === 'blue' ? Math.min(nz, gz - 0.2) : Math.max(nz, gz + 0.2);
    }
  }

  // Delayed offside detection: puck entering the zone ahead of attackers (NHL 83)
  const entry = checkZoneEntryOffside(state, prevPuckZ);
  if (entry && !state.delayedOffside) {
    state.delayedOffside = { team: entry.team, zone: entry.team === 'blue' ? 'red-end' : 'blue-end', offenders: entry.offenders };
    state.events.push({ type: 'delayedOffside', team: entry.team });
  }

  // Post-play: possession changes drive icing, delayed offside, delayed penalty
  if (state.status === 'play') {
    const holder = puck.holder ? state.players.find((p) => p.id === puck.holder) : null;
    if (holder && puck.holder !== prevHolder) handlePuckTouch(state, holder);
  }
  if (state.status !== 'play') return;
  resolveDelayedOffside(state);
  if (state.status !== 'play') return;
  const dp = state.delayedPenalty;
  if (dp) {
    const holder = puck.holder ? state.players.find((p) => p.id === puck.holder) : null;
    if (holder && holder.team === dp.team) {
      applyPenalty(state, dp.playerId, dp.reason, dp.type);
    }
  }
}

function shootPuck(state, player, type, rng, power) {
  const spec = SHOT_TYPES[type] || SHOT_TYPES.wrist;
  const puck = state.puck;
  const shotPower = power || spec.power;
  puck.holder = null;
  // Merlin 2026-11-02: the puck MUST leave the stick. The shooter can't
  // re-catch their own shot for 0.35s (the old 1.5m pickup radius ate it
  // on the very first frame).
  puck.keepAwayFrom = player.id;
  puck.keepAwayT = 0.35;
  // Icing eligibility: where the shot was taken from (NHL 81)
  state.lastShot = { team: player.team, z: puck.z };
  const targetZ = player.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;
  const aimX = (rng() - 0.5) * GOAL_W * (1 + spec.spread * 4);
  const dx = aimX - puck.x;
  const dz = targetZ - puck.z;
  const dist = Math.hypot(dx, dz) || 1;
  const spread = (rng() - 0.5) * spec.spread;
  puck.vx = (dx / dist) * shotPower + spread * 10;
  puck.vz = (dz / dist) * shotPower;
  state.events.push({ type: 'shot', playerId: player.id, shotType: type, power: shotPower });
}

/**
 * Icing, NHL 81: shot from behind the center red line, crosses the far goal
 * line, first touched by a defender — and never on the penalty kill.
 */
function maybeStartIcing(state, endSign) {
  if (state.icing || !state.lastShot) return;
  const T = state.lastShot.team;
  const attacksNeg = T === 'blue'; // blue attacks the z=-26 net
  const crossedFarEnd = (endSign < 0) === attacksNeg;
  if (!crossedFarEnd) return;
  const fromBehindCenter = T === 'blue' ? state.lastShot.z > 0 : state.lastShot.z < 0;
  if (!fromBehindCenter) return;
  const other = T === 'blue' ? 'red' : 'blue';
  if (activeSkaters(state, T).length < activeSkaters(state, other).length) return; // penalty kill — no icing
  state.icing = { team: T };
}

/** First touch after a potential icing: defender → icing; attacker or goalie → waved off. */
function handlePuckTouch(state, p) {
  if (state.icing) {
    const defending = state.icing.team === 'blue' ? 'red' : 'blue';
    if (p.role === 'G' || p.team === state.icing.team) {
      state.icing = null;
      state.lastShot = null;
      state.events.push({ type: 'icingWaved' });
    } else if (p.team === defending) {
      const t = state.icing.team;
      state.events.push({ type: 'icing', team: t });
      // NHL 76.2: icing → faceoff in the offending team's zone
      whistle(state, t === 'blue' ? 14 : -14);
    }
    return;
  }
  state.lastShot = null; // any possession resets icing eligibility
}

function bodyCheck(state, checker, target, rng) {
  const targetHadPuck = state.puck.holder === target.id;
  // Knock the puck loose, maybe flatten the target
  if (targetHadPuck) state.puck.holder = null;
  // Puck pops loose in the check direction
  const dx = target.x - checker.x;
  const dz = target.z - checker.z;
  const dist = Math.hypot(dx, dz) || 1;
  state.puck.x = target.x + (dx / dist) * 2;
  state.puck.z = target.z + (dz / dist) * 2;
  state.puck.vx = (dx / dist) * 10;
  state.puck.vz = (dz / dist) * 10;
  state.events.push({ type: 'check', checker: checker.id, target: target.id });
  const fromBehind = (target.team === 'blue' ? 1 : -1) * (checker.z - target.z) > 0;
  if (!targetHadPuck) {
    // NHL 56: interference — a check on a player without the puck
    assessPenalty(state, checker.id, 'interference', 'minor');
    return;
  }
  if (fromBehind) {
    if (isBreakaway(state, target)) {
      awardPenaltyShot(state, target);
      return;
    }
    // NHL 43: checking from behind is an automatic minor; severe → misconduct
    assessPenalty(state, checker.id, 'boarding', rng() < 0.2 ? 'misconduct' : 'minor');
  }
}

function goalieAI(state, g, dt, rng) {
  const puck = state.puck;
  const netZ = g.team === 'blue' ? GOAL_LINE_Z - 0.6 : -GOAL_LINE_Z + 0.6;
  // Track the puck laterally, stay in the crease
  const targetX = Math.max(-GOAL_W / 2, Math.min(GOAL_W / 2, puck.x * 0.7));
  g.x += (targetX - g.x) * Math.min(1, 5 * dt);
  g.z += (netZ - g.z) * Math.min(1, 3 * dt);
  // Play a loose puck in the crease
  if (!puck.holder && canPickup(state, g) && Math.hypot(puck.x - g.x, puck.z - g.z) < 1.5 && Math.hypot(puck.vx, puck.vz) < 6) {
    puck.holder = g.id;
    // Goalie passes it out
    const mate = nearestMate(state, g);
    if (mate) {
      puck.holder = null;
      const dx = mate.x - puck.x;
      const dz = mate.z - puck.z;
      const dist = Math.hypot(dx, dz) || 1;
      puck.vx = (dx / dist) * 16;
      puck.vz = (dz / dist) * 16;
    }
  }
  if (puck.holder === g.id) { puck.x = g.x; puck.z = g.z; }
}

function nearestMate(state, p) {
  let best = null;
  let bestDist = Infinity;
  for (const q of state.players) {
    if (q.team !== p.team || q.id === p.id || q.role === 'G' || q.penalty > 0) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestDist) { bestDist = d; best = q; }
  }
  return best;
}

/** False while the puck is keeping away from this player (just shot/passed). */
function canPickup(state, p) {
  const k = state.puck;
  return !(k.keepAwayFrom === p.id && k.keepAwayT > 0);
}

/**
 * Pick the pass target (Merlin 2026-11-02): the teammate best aligned with
 * the passer's aim direction (joystick), not just the nearest. Falls back to
 * the nearest mate — never just dumps the puck.
 */
export function pickPassTarget(state, player, aimDx, aimDz) {
  const mates = state.players.filter(
    (q) => q.team === player.team && q.id !== player.id && q.role !== 'G' && q.penalty <= 0
  );
  if (!mates.length) return null;
  // Default aim: toward the opponent's goal when the stick is neutral
  let ax = aimDx;
  let az = aimDz;
  if (!ax && !az) {
    const targetZ = player.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;
    ax = 0 - player.x;
    az = targetZ - player.z;
  }
  const aLen = Math.hypot(ax, az) || 1;
  ax /= aLen;
  az /= aLen;
  let best = null;
  let bestScore = -Infinity;
  for (const m of mates) {
    const dx = m.x - player.x;
    const dz = m.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    const dot = (dx / d) * ax + (dz / d) * az; // 1 = dead ahead, -1 = behind
    const score = dot * 2 - d * 0.02; // alignment first, then closeness
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** Where to aim the pass: lead the target by their velocity (~0.45s of skate). */
export function passLeadPoint(mate) {
  const LEAD = 0.45;
  return { x: mate.x + (mate.vx || 0) * LEAD, z: mate.z + (mate.vz || 0) * LEAD };
}

function nearestOpponent(state, p, maxDist) {
  let best = null;
  let bestDist = maxDist || Infinity;
  for (const q of state.players) {
    if (q.team === p.team || q.role === 'G' || q.penalty > 0) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestDist) { bestDist = d; best = q; }
  }
  return best;
}

/** NHL 84.4: no shooter repeats until every eligible skater has shot. */
function pickShooter(state, team) {
  const so = state.shootout;
  so.shotBy = so.shotBy || [];
  const eligible = state.players.filter((p) => p.team === team && p.role !== 'G' && p.penalty <= 0);
  if (!eligible.length) return null;
  if (team === 'blue') {
    const you = eligible.find((p) => p.isHuman);
    if (you && !so.shotBy.includes(you.id)) return you.id;
  }
  let pick = eligible.find((p) => !so.shotBy.includes(p.id));
  if (!pick) {
    so.shotBy = [];
    pick = eligible[0];
  }
  return pick.id;
}

// ---- Shootout ----
function stepShootout(state, dt, human, rng) {
  state.events.length = 0;
  const so = state.shootout;
  if (so.phase === 'setup') {
    // Shooter at center, goalie in net, everyone else off
    const shooterTeam = so.turn;
    const shooterId = pickShooter(state, shooterTeam);
    const shooter = shooterId ? state.players.find((p) => p.id === shooterId) : null;
    const goalie = state.players.find((p) => p.team !== shooterTeam && p.role === 'G');
    if (shooter) {
      shooter.x = 0; shooter.z = shooterTeam === 'blue' ? 6 : -6;
      state.puck.holder = shooter.id;
      state.puck.x = shooter.x; state.puck.z = shooter.z;
    }
    if (goalie) { goalie.x = 0; goalie.z = goalie.team === 'blue' ? GOAL_LINE_Z - 0.6 : -GOAL_LINE_Z + 0.6; }
    so.phase = 'attempt';
    so.shooterId = shooterId;
    so.team = shooterTeam;
    if (shooterId) so.shotBy.push(shooterId);
    state.events.push({ type: 'shootoutShot', shooter: shooterTeam });
    return;
  }
  if (so.phase === 'attempt') {
    attemptTick(state, dt, human, rng, so, (scored) => endShootoutAttempt(state, scored));
  }
}

/** Shared breakaway-attempt engine for shootouts and penalty shots. */
function attemptTick(state, dt, human, rng, att, done) {
  const shooter = state.players.find((p) => p.id === att.shooterId);
  const goalie = state.players.find((p) => p.role === 'G' && p.team !== (shooter ? shooter.team : att.team));
  const puck = state.puck;

  // Goalie smothered a slow puck → no goal
  if (goalie && puck.holder === goalie.id) { done(false); return; }

  // Shooter skates in
  if (shooter && puck.holder === shooter.id) {
    const targetZ = shooter.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;
    if (shooter.isHuman && human) {
      shooter.x = Math.max(-8, Math.min(8, shooter.x + human.mx * 10 * dt));
      shooter.z += human.mz * 10 * dt;
      shooter.z = shooter.team === 'blue' ? Math.max(targetZ, Math.min(6, shooter.z)) : Math.min(-targetZ, Math.max(-6, shooter.z));
      puck.x = shooter.x; puck.z = shooter.z;
      if (human.shoot) {
        shootPuck(state, shooter, human.shotType || 'wrist', rng);
      }
    } else if (shooter) {
      // AI shooter: skate in and shoot
      shooter.z += (shooter.team === 'blue' ? -1 : 1) * 9 * dt;
      shooter.x += Math.sin(Date.now() * 0.003) * 3 * dt;
      puck.x = shooter.x; puck.z = shooter.z;
      const distGoal = Math.abs(shooter.z - targetZ);
      if (distGoal < 10 && rng() < 0.05) {
        shootPuck(state, shooter, rng() < 0.6 ? 'wrist' : 'backhand', rng);
      }
    }
  }
  // Goalie tracks
  if (goalie) goalieAI(state, goalie, dt, rng);

  // Puck physics (simplified)
  if (!puck.holder) {
    puck.x += puck.vx * dt;
    puck.z += puck.vz * dt;
    // Goalie save check
    if (goalie && Math.hypot(puck.x - goalie.x, puck.z - goalie.z) < 1.3) {
      done(false);
      return;
    }
    if (Math.abs(puck.z) > GOAL_LINE_Z) {
      done(Math.abs(puck.x) < GOAL_W / 2);
      return;
    }
    if (Math.hypot(puck.vx, puck.vz) < 1 || Math.abs(puck.z) > 30) {
      done(false);
      return;
    }
  }
}

function endShootoutAttempt(state, scored) {
  const so = state.shootout;
  const team = so.turn;
  so.attempts.push({ team, scored });
  if (scored) {
    if (team === 'blue') so.blueMade += 1;
    else so.redMade += 1;
  }
  state.events.push({ type: 'shootoutResult', team, scored });
  // Check for winner: best of 3, then sudden death
  const blueLeft = 3 - so.attempts.filter((a) => a.team === 'blue').length;
  const redLeft = 3 - so.attempts.filter((a) => a.team === 'red').length;
  if (so.blueMade > so.redMade + redLeft) return finishShootout(state, 'blue');
  if (so.redMade > so.blueMade + blueLeft) return finishShootout(state, 'red');
  if (blueLeft === 0 && redLeft === 0) {
    if (so.blueMade !== so.redMade) {
      return finishShootout(state, so.blueMade > so.redMade ? 'blue' : 'red');
    }
    // Sudden death: reset to 1-round rounds
    so.round += 1;
  }
  so.turn = team === 'blue' ? 'red' : 'blue';
  so.phase = 'setup';
}

function finishShootout(state, winner) {
  state.status = 'done';
  state.winner = winner;
  state.events.push({ type: 'win', winner });
}

// ---- Penalty shot (NHL 24) ----
function stepPenaltyShot(state, dt, human, rng) {
  state.events.length = 0;
  const ps = state.penaltyShot;
  if (!ps) { setFaceoff(state, 0); return; }
  if (ps.phase === 'setup') {
    const shooter = state.players.find((p) => p.id === ps.shooterId);
    const goalie = state.players.find((p) => p.role === 'G' && p.team !== ps.team);
    if (shooter) {
      shooter.x = 0; shooter.z = ps.team === 'blue' ? 6 : -6;
      state.puck.holder = shooter.id;
      state.puck.x = shooter.x; state.puck.z = shooter.z;
    }
    if (goalie) { goalie.x = 0; goalie.z = goalie.team === 'blue' ? GOAL_LINE_Z - 0.6 : -GOAL_LINE_Z + 0.6; }
    ps.phase = 'attempt';
    state.events.push({ type: 'penaltyShotAttempt', team: ps.team });
    return;
  }
  if (ps.phase === 'attempt') {
    attemptTick(state, dt, human, rng, ps, (scored) => endPenaltyShot(state, scored));
  }
}

function endPenaltyShot(state, scored) {
  const ps = state.penaltyShot;
  state.penaltyShot = null;
  if (!ps) return;
  if (scored) {
    // A penalty-shot goal never terminates a minor (NHL 26)
    scoreGoal(state, ps.team, true);
    return;
  }
  state.events.push({ type: 'penaltyShotMiss', team: ps.team });
  // Missed: faceoff where the infraction occurred (NHL 76.2)
  const z = ps.foulZ || 0;
  const dotZ = Math.abs(z) > BLUE_LINE_Z ? Math.sign(z) * 14 : Math.sign(z || 1) * BLUE_LINE_Z;
  whistle(state, dotZ);
}
