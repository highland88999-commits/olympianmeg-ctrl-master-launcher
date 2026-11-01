// lib/sports/hockey.js — Ice hockey, true fundamentals (Merlin, 2026-10-31).
//
// 4v4 (3 skaters + goalie). Blue lines, offside, creases, goalies with
// sticks, pass / body check / steal, wrist / slap / backhand shots,
// penalties (2 min, short-handed), overtime (3v3 sudden death),
// shootout. Pure logic, node-tested.

export const RINK_W = 30;
export const RINK_L = 60;
export const GOAL_W = 4;
export const BLUE_LINE_Z = 10; // blue lines at z = ±10
export const GOAL_LINE_Z = 26; // nets 4m off the end boards
export const CREASE_R = 1.8;
export const PERIOD_SECONDS = 180;
export const PENALTY_SECONDS = 30; // shortened for arcade pace
export const OT_SECONDS = 120;

export const SHOT_TYPES = {
  wrist: { power: 24, spread: 0.12, windup: 0 },
  slap: { power: 34, spread: 0.3, windup: 0.6 },
  backhand: { power: 18, spread: 0.2, windup: 0 },
};

export function createHockey(playerName = 'You') {
  const mkSkaters = (team, isBlue) => {
    const base = isBlue ? 1 : -1;
    return [
      { id: `${team}-c`, name: team === 'blue' ? 'AI Center' : 'AI Opponent', team, isHuman: false, role: 'C', x: 0, z: base * 8, vx: 0, vz: 0, penalty: 0 },
      { id: `${team}-w1`, name: team === 'blue' ? 'AI Winger' : 'AI Opponent', team, isHuman: false, role: 'W', x: -7, z: base * 12, vx: 0, vz: 0, penalty: 0 },
      { id: `${team}-w2`, name: team === 'blue' ? 'AI Winger' : 'AI Opponent', team, isHuman: false, role: 'W', x: 7, z: base * 12, vx: 0, vz: 0, penalty: 0 },
    ];
  };
  return {
    status: 'faceoff',
    period: 1, // 1, 2, then 'ot', then 'shootout'
    clock: PERIOD_SECONDS,
    score: { blue: 0, red: 0 },
    puck: { x: 0, z: 0, vx: 0, vz: 0, holder: null },
    players: [
      { id: 'you', name: playerName, team: 'blue', isHuman: true, role: 'C', x: 0, z: 8, vx: 0, vz: 0, penalty: 0 },
      ...mkSkaters('blue', true).slice(1),
      ...mkSkaters('red', false),
      { id: 'blue-g', name: 'AI Goalie', team: 'blue', isHuman: false, role: 'G', x: 0, z: GOAL_LINE_Z - 0.6, vx: 0, vz: 0, penalty: 0 },
      { id: 'red-g', name: 'AI Goalie', team: 'red', isHuman: false, role: 'G', x: 0, z: -GOAL_LINE_Z + 0.6, vx: 0, vz: 0, penalty: 0 },
    ],
    shootout: { round: 0, blueMade: 0, redMade: 0, turn: 'blue', attempts: [] },
    events: [],
    winner: null,
  };
}

export function activeSkaters(state, team) {
  return state.players.filter((p) => p.team === team && p.role !== 'G' && p.penalty <= 0);
}

export function faceoff(state, dotZ = 0) {
  state.puck.x = 0; state.puck.z = dotZ;
  state.puck.vx = 0; state.puck.vz = 0;
  state.puck.holder = null;
  const isOT = state.period === 'ot';
  for (const p of state.players) {
    if (p.penalty > 0) continue; // penalized stay in the box
    const base = p.team === 'blue' ? 1 : -1;
    if (p.role === 'G') { p.x = 0; p.z = base * (GOAL_LINE_Z - 0.6); }
    else if (p.role === 'C') { p.x = p.isHuman ? 0 : (p.team === 'blue' ? 1.5 : -1.5); p.z = base * 6 + dotZ * 0.3; }
    else { p.x = p.id.endsWith('w1') ? -7 : 7; p.z = base * 12; }
    // OT: 3v3 — already 3 skaters, fine
    p.vx = 0; p.vz = 0;
  }
  // In OT the extra skater sits (we only have 3 anyway)
  state.status = 'play';
}

function scoreGoal(state, team) {
  state.score[team] += 1;
  state.events.push({ type: 'goal', team, score: { ...state.score } });
  if (state.period === 'ot') {
    // Sudden death — game over
    state.status = 'done';
    state.winner = team;
    state.events.push({ type: 'win', winner: team });
  } else {
    state.status = 'faceoff';
  }
}

/** Offside check: attacking skaters ahead of the puck over the blue line. */
function checkOffside(state) {
  const puck = state.puck;
  // Which zone is the puck in?
  const puckZone = puck.z > BLUE_LINE_Z ? 'blue-end' : puck.z < -BLUE_LINE_Z ? 'red-end' : 'neutral';
  if (puckZone === 'neutral') return null;
  const attacking = puckZone === 'red-end' ? 'blue' : 'red'; // blue attacks red's net (z<0)
  const lineZ = puckZone === 'red-end' ? -BLUE_LINE_Z : BLUE_LINE_Z;
  for (const p of state.players) {
    if (p.team !== attacking || p.role === 'G' || p.penalty > 0) continue;
    const overLine = puckZone === 'red-end' ? p.z < lineZ : p.z > lineZ;
    const puckOver = puckZone === 'red-end' ? puck.z < lineZ : puck.z > lineZ;
    if (overLine && !puckOver && puck.holder !== p.id) {
      return attacking; // offside against the attacking team
    }
  }
  return null;
}

function callPenalty(state, playerId, reason) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.role === 'G') return;
  p.penalty = PENALTY_SECONDS;
  if (state.puck.holder === playerId) state.puck.holder = null;
  state.events.push({ type: 'penalty', playerId, team: p.team, reason });
  state.status = 'faceoff';
}

export function stepHockey(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status === 'shootout') {
    stepShootout(state, dt, human, rng);
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
      state.period = 2; state.clock = PERIOD_SECONDS; state.status = 'faceoff';
      state.events.push({ type: 'period', period: 2 });
    } else if (state.period === 2) {
      if (state.score.blue !== state.score.red) {
        state.status = 'done';
        state.winner = state.score.blue > state.score.red ? 'blue' : 'red';
        state.events.push({ type: 'win', winner: state.winner });
      } else {
        state.period = 'ot'; state.clock = OT_SECONDS; state.status = 'faceoff';
        state.events.push({ type: 'period', period: 'ot' });
      }
    } else if (state.period === 'ot') {
      // Still tied → shootout
      state.period = 'shootout';
      state.status = 'shootout';
      state.shootout = { round: 0, blueMade: 0, redMade: 0, turn: 'blue', attempts: [], phase: 'setup' };
      state.events.push({ type: 'shootout' });
    }
    return;
  }

  const puck = state.puck;
  const you = state.players.find((p) => p.isHuman);

  // ---- Human ----
  if (you && human && you.penalty <= 0) {
    const speed = 12;
    you.vx = human.mx * speed;
    you.vz = human.mz * speed;
    you.x = Math.max(-RINK_W / 2 + 1, Math.min(RINK_W / 2 - 1, you.x + you.vx * dt));
    you.z = Math.max(-RINK_L / 2 + 1, Math.min(RINK_L / 2 - 1, you.z + you.vz * dt));

    if (!puck.holder && Math.hypot(puck.x - you.x, puck.z - you.z) < 1.5) {
      puck.holder = you.id;
    }
    // Steal: skate into the carrier
    if (puck.holder && puck.holder !== you.id) {
      const carrier = state.players.find((p) => p.id === puck.holder);
      if (carrier && carrier.team !== you.team && Math.hypot(carrier.x - you.x, carrier.z - you.z) < 1.2) {
        if (human.check) {
          // Body check!
          bodyCheck(state, you, carrier, rng);
        } else if (rng() < 0.6) {
          puck.holder = you.id; // poke check
          state.events.push({ type: 'steal', playerId: you.id });
        }
      }
    }
    // Pass
    if (human.pass && puck.holder === you.id) {
      const mate = nearestMate(state, you);
      if (mate) {
        puck.holder = null;
        const dx = mate.x - puck.x;
        const dz = mate.z - puck.z;
        const dist = Math.hypot(dx, dz) || 1;
        puck.vx = (dx / dist) * 20;
        puck.vz = (dz / dist) * 20;
        state.events.push({ type: 'pass', from: you.id, to: mate.id });
      }
    }
    // Shoot
    if (human.shoot && puck.holder === you.id) {
      shootPuck(state, you, human.shotType || 'wrist', rng);
    }
    // Body check without puck
    if (human.check && (!puck.holder || puck.holder !== you.id)) {
      const target = nearestOpponent(state, you, 1.6);
      if (target) bodyCheck(state, you, target, rng);
    }
  }

  // ---- AI ----
  for (const p of state.players) {
    if (p.isHuman || p.penalty > 0) continue;
    if (p.role === 'G') { goalieAI(state, p, dt, rng); continue; }

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
      if (dist < 1.5) puck.holder = p.id;
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

  // Offside whistle
  const offside = checkOffside(state);
  if (offside) {
    state.events.push({ type: 'offside', team: offside });
    state.status = 'faceoff';
    return;
  }

  // Puck physics
  if (!puck.holder) {
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
        scoreGoal(state, puck.z < 0 ? 'blue' : 'red');
        return;
      }
      puck.z = Math.sign(puck.z) * (RINK_L / 2 - 0.5);
      puck.vz *= -0.7;
    } else if (Math.abs(puck.z) > RINK_L / 2 - 0.5) {
      puck.z = Math.sign(puck.z) * (RINK_L / 2 - 0.5);
      puck.vz *= -0.7;
    }
  } else {
    const holder = state.players.find((p) => p.id === puck.holder);
    if (holder) { puck.x = holder.x; puck.z = holder.z; }
  }
}

function shootPuck(state, player, type, rng) {
  const spec = SHOT_TYPES[type] || SHOT_TYPES.wrist;
  const puck = state.puck;
  puck.holder = null;
  const targetZ = player.team === 'blue' ? -GOAL_LINE_Z : GOAL_LINE_Z;
  const aimX = (rng() - 0.5) * GOAL_W * (1 + spec.spread * 4);
  const dx = aimX - puck.x;
  const dz = targetZ - puck.z;
  const dist = Math.hypot(dx, dz) || 1;
  const spread = (rng() - 0.5) * spec.spread;
  puck.vx = (dx / dist) * spec.power + spread * 10;
  puck.vz = (dz / dist) * spec.power;
  state.events.push({ type: 'shot', playerId: player.id, shotType: type });
}

function bodyCheck(state, checker, target, rng) {
  // Knock the puck loose, maybe flatten the target
  if (state.puck.holder === target.id) state.puck.holder = null;
  // Puck pops loose in the check direction
  const dx = target.x - checker.x;
  const dz = target.z - checker.z;
  const dist = Math.hypot(dx, dz) || 1;
  state.puck.x = target.x + (dx / dist) * 2;
  state.puck.z = target.z + (dz / dist) * 2;
  state.puck.vx = (dx / dist) * 10;
  state.puck.vz = (dz / dist) * 10;
  state.events.push({ type: 'check', checker: checker.id, target: target.id });
  // Penalty: check from behind (target moving away, checker behind)
  const behind = (target.team === 'blue' ? 1 : -1) * (checker.z - target.z) > 0;
  if (behind && rng() < 0.5) {
    callPenalty(state, checker.id, 'boarding');
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
  if (!puck.holder && Math.hypot(puck.x - g.x, puck.z - g.z) < 1.5 && Math.hypot(puck.vx, puck.vz) < 6) {
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

// ---- Shootout ----
function stepShootout(state, dt, human, rng) {
  state.events.length = 0;
  const so = state.shootout;
  if (so.phase === 'setup') {
    // Shooter at center, goalie in net, everyone else off
    const shooterTeam = so.turn;
    const shooter = state.players.find((p) => p.team === shooterTeam && p.isHuman) ||
      state.players.find((p) => p.team === shooterTeam && p.role === 'C');
    const goalie = state.players.find((p) => p.team !== shooterTeam && p.role === 'G');
    if (shooter) {
      shooter.x = 0; shooter.z = shooterTeam === 'blue' ? 6 : -6;
      state.puck.holder = shooter.id;
      state.puck.x = shooter.x; state.puck.z = shooter.z;
    }
    if (goalie) { goalie.x = 0; goalie.z = goalie.team === 'blue' ? GOAL_LINE_Z - 0.6 : -GOAL_LINE_Z + 0.6; }
    so.phase = 'attempt';
    so.shooterId = shooter ? shooter.id : null;
    state.events.push({ type: 'shootoutShot', shooter: shooterTeam });
    return;
  }
  if (so.phase === 'attempt') {
    const shooter = state.players.find((p) => p.id === so.shooterId);
    const goalie = state.players.find((p) => p.role === 'G' && p.team !== (shooter ? shooter.team : so.turn));
    const puck = state.puck;
    const you = state.players.find((p) => p.isHuman);

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
        endShootoutAttempt(state, false);
        return;
      }
      if (Math.abs(puck.z) > GOAL_LINE_Z) {
        endShootoutAttempt(state, Math.abs(puck.x) < GOAL_W / 2);
        return;
      }
      if (Math.hypot(puck.vx, puck.vz) < 1 || Math.abs(puck.z) > 30) {
        endShootoutAttempt(state, false);
        return;
      }
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
