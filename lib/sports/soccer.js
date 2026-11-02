// lib/sports/soccer.js — Soccer rules (pure, node-tested).
//
// 7v7 (FIFA Law 3 minimum: "A match may not start or continue if either
// team has fewer than seven players"): you + 6 AI vs 7 AI.
// Olympus Cup competition rules (Law 7): two 10-minute halves. Most goals wins.
// Implements: kickoff incl. change of ends (Law 8), ball in/out of play
// (Law 9), throw-ins (Law 15), goal kicks (Law 16), corners (Law 17),
// offside (Law 11), fouls / free kicks / penalties / cards (Laws 12-14).
// FIFA arcade style.

export const PITCH_W = 44;
export const PITCH_L = 68;
export const GOAL_W = 8;
export const HALF_SECONDS = 600;
export const COMPETITION = 'Olympus Cup';
export const FORMAT_LABEL = 'Olympus Cup · 2 x 10:00 halves · 7-a-side';
export const FORMAT_SHORT = 'Olympus Cup · 2×10:00';

// Penalty-area dimensions (scaled to this pitch).
const PEN_HALF_W = 12;
const PEN_DEPTH = 12;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const other = (t) => (t === 'blue' ? 'red' : 'blue');
// z of the goal a team DEFENDS this half (+/- PITCH_L/2). Swapped at half-time.
const ownGoalZ = (state, team) => state.sides[team] * (PITCH_L / 2);
// z of the goal a team ATTACKS this half.
const attackGoalZ = (state, team) => -ownGoalZ(state, team);

// Roster: [idSuffix, role, homeX, homeZ] — homeZ measured into the team's OWN half.
const ROSTER = [
  ['gk', 'gk', 0, PITCH_L / 2 - 3],
  ['d1', 'df', -9, 16],
  ['d2', 'df', 9, 16],
  ['m1', 'mf', -7, 7],
  ['m2', 'mf', 7, 7],
  ['f1', 'fw', -4, 2.5],
  ['f2', 'fw', 4, 2.5],
];

const AI_NAME = { gk: 'AI Keeper', df: 'AI Defender', mf: 'AI Midfielder', fw: 'AI Striker' };

export function createSoccer(playerName = 'You') {
  const mkTeam = (team) =>
    ROSTER.map(([suf, role, hx, hz]) => ({
      id: `${team}-${suf}`,
      name: team === 'blue' ? AI_NAME[role] : 'AI Opponent',
      team,
      isHuman: false,
      role,
      hx,
      hz,
      x: 0,
      z: 0,
      fouls: 0,   // fouls committed (persistent infringement tracking, Law 12)
      yellow: false,
      off: false, // sent off
    }));
  const players = [...mkTeam('blue'), ...mkTeam('red')];
  const you = players.find((p) => p.id === 'blue-f1');
  you.isHuman = true;
  you.name = playerName;
  const state = {
    status: 'kickoff',
    half: 1,
    clock: HALF_SECONDS,
    score: { blue: 0, red: 0 },
    sides: { blue: 1, red: -1 }, // own-goal z sign per team; swapped at half-time (Law 8)
    firstKickoff: 'blue',
    ball: { x: 0, z: 0, vx: 0, vz: 0, holder: null },
    lastTouch: null, // team that last touched the ball (for throw-in/corner/goal-kick awards)
    deadball: null,  // { kind, team, x, z, t } — restart pending after a stoppage
    offside: null,   // { team, ids:Set } — attackers flagged at the moment of a teammate's kick
    players,
    events: [],
    winner: null,
  };
  placeFormation(state, 'blue');
  return state;
}

// Kicker for a kickoff: team's first striker (blue's is the human).
function kickerId(state, team) {
  const pref = state.players.find((p) => p.id === `${team}-f1` && !p.off);
  if (pref) return pref.id;
  const any = state.players.find((p) => p.team === team && !p.off);
  return any ? any.id : null;
}

// Kickoff formation (Law 8): everyone in their own half except the kicker,
// who stands with the ball on the centre mark. Non-kicking team's forwards
// drop back so they are clear of the centre.
function placeFormation(state, kickingTeam) {
  const kickId = kickerId(state, kickingTeam);
  for (const p of state.players) {
    if (p.off) continue;
    const side = state.sides[p.team];
    if (p.id === kickId) {
      p.x = 0;
      p.z = 0;
    } else if (p.team !== kickingTeam && p.role === 'fw') {
      p.x = p.hx;
      p.z = side * 10;
    } else {
      p.x = p.hx;
      p.z = side * p.hz;
    }
  }
  return kickId;
}

function doKickoff(state, team) {
  const kickId = placeFormation(state, team);
  state.ball.x = 0;
  state.ball.z = 0;
  state.ball.vx = 0;
  state.ball.vz = 0;
  state.ball.holder = kickId;
  state.lastTouch = team;
  state.offside = null;
}

export function kickoff(state, team = 'blue') {
  doKickoff(state, team);
  state.deadball = null;
  state.status = 'play';
}

// Freeze play and schedule a restart. Law 9: the ball is out of play when
// the whistle blows / it fully crosses a line; restarts below cover Laws 8, 15, 16, 17.
function setDeadball(state, kind, team, x, z, t = 1.6) {
  state.ball.holder = null;
  state.ball.vx = 0;
  state.ball.vz = 0;
  state.ball.x = x;
  state.ball.z = z;
  state.lastTouch = team;
  state.offside = null;
  state.deadball = { kind, team, x, z, t };
}

function nearestPlayer(state, team, x, z, { aiOnly = true, roles = null } = {}) {
  let list = state.players.filter((p) => p.team === team && !p.off);
  if (roles) list = list.filter((p) => roles.includes(p.role));
  if (!list.length) list = state.players.filter((p) => p.team === team && !p.off);
  const ai = list.filter((p) => !p.isHuman);
  if (aiOnly && ai.length) list = ai;
  let best = null;
  let bd = Infinity;
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function executeDeadball(state, db) {
  const { kind, team } = db;
  if (kind === 'kickoff') {
    doKickoff(state, team);
  } else {
    let bx = db.x;
    let bz = db.z;
    if (kind === 'throwin') {
      bx = Math.sign(db.x || 1) * (PITCH_W / 2 - 0.6);
      bz = clamp(db.z, -PITCH_L / 2 + 2, PITCH_L / 2 - 2);
    } else if (kind === 'goalkick') {
      const gz = ownGoalZ(state, team);
      bx = clamp(db.x, -6, 6);
      bz = gz - Math.sign(gz) * 5.5;
    } else if (kind === 'corner') {
      const gz = attackGoalZ(state, team);
      bx = Math.sign(db.x || 1) * (PITCH_W / 2 - 1);
      bz = gz - Math.sign(gz) * 1;
    } else if (kind === 'penalty') {
      const gz = attackGoalZ(state, team);
      bx = clamp(db.x, -10, 10);
      bz = gz - Math.sign(gz) * 7;
    }
    // freekick: taken at the spot of the offence.
    const taker = kind === 'penalty'
      ? nearestPlayer(state, team, bx, bz, { roles: ['fw', 'mf'] })
      : nearestPlayer(state, team, bx, bz);
    bx = clamp(bx, -PITCH_W / 2 + 1, PITCH_W / 2 - 1);
    bz = clamp(bz, -PITCH_L / 2 + 1, PITCH_L / 2 - 1);
    if (taker) {
      taker.x = bx;
      taker.z = bz;
      state.ball.holder = taker.id;
    }
    state.ball.x = bx;
    state.ball.z = bz;
    state.ball.vx = 0;
    state.ball.vz = 0;
    state.lastTouch = team;
  }
  state.events.push({ type: kind, team });
}

function scoreGoal(state, team) {
  state.score[team] += 1;
  state.events.push({ type: 'goal', team, score: { ...state.score } });
  // Law 8: kick-off is taken by the team that CONCEDED the goal.
  setDeadball(state, 'kickoff', other(team), 0, 0, 2.2);
}

// Law 11: snapshot offside positions at the moment the ball is played by a
// teammate. An attacker is flagged when, in the opponents' half, they are
// nearer to the opponents' goal line than both the ball and the
// second-last opponent. Flagged players commit an offence only if they then
// become involved in active play (touch the ball).
function snapshotOffside(state, kicker) {
  const s = Math.sign(attackGoalZ(state, kicker.team));
  const a = (z) => z * s;
  const opps = state.players
    .filter((p) => p.team !== kicker.team && !p.off)
    .map((p) => a(p.z))
    .sort((x, y) => y - x);
  const secondLast = opps.length > 1 ? opps[1] : -Infinity;
  const ids = new Set();
  for (const tm of state.players) {
    if (tm.team !== kicker.team || tm.id === kicker.id || tm.off) continue;
    if (a(tm.z) > 0 && a(tm.z) > a(state.ball.z) && a(tm.z) > secondLast) ids.add(tm.id);
  }
  state.offside = ids.size ? { team: kicker.team, ids } : null;
}

// Returns true when the pickup IS an offside offence (dead ball awarded).
function checkOffside(state, p) {
  const os = state.offside;
  if (!os) return false;
  if (os.team === p.team && os.ids.has(p.id)) {
    state.events.push({ type: 'offside', playerId: p.id });
    // Law 11: indirect free kick to the defending team where the offence occurred.
    setDeadball(state, 'freekick', other(p.team), p.x, p.z, 1.6);
    return true;
  }
  if (os.team !== p.team) state.offside = null; // opponent's touch starts a new phase
  return false;
}

// Every kick in open play: release the ball, record last touch, judge offside.
function kickBall(state, player, vx, vz) {
  state.ball.holder = null;
  state.ball.vx = vx;
  state.ball.vz = vz;
  state.lastTouch = player.team;
  snapshotOffside(state, player);
}

// Law 12: a tackle is a foul when it is careless/reckless — here, tackles
// from behind are much more likely to be penalised. Returns 'foul' | 'clean'.
function attemptTackle(state, tackler, carrier, rng) {
  const agz = attackGoalZ(state, carrier.team);
  const behind = Math.abs(tackler.z - agz) > Math.abs(carrier.z - agz) + 0.5;
  const foulP = behind ? 0.4 : 0.12;
  if (rng() < foulP) {
    whistle(state, tackler, carrier, rng);
    return 'foul';
  }
  state.ball.holder = tackler.id;
  state.lastTouch = tackler.team;
  if (state.offside && state.offside.team !== tackler.team) state.offside = null;
  state.events.push({ type: 'steal', playerId: tackler.id });
  return 'clean';
}

function inOwnBox(state, team, x, z) {
  const gz = ownGoalZ(state, team);
  return Math.sign(z) === Math.sign(gz) && Math.abs(x) < PEN_HALF_W && Math.abs(z) > PITCH_L / 2 - PEN_DEPTH;
}

// Law 12-14: blow the whistle on a foul — free kick at the spot (penalty if
// inside the offender's own box), plus cards for serious or repeated fouls.
function whistle(state, tackler, victim, rng) {
  tackler.fouls += 1;
  state.events.push({ type: 'foul', playerId: tackler.id, victimId: victim.id });
  const severity = rng();
  const x = victim.x;
  const z = victim.z;
  if (severity < 0.06 || (tackler.yellow && (severity < 0.25 || tackler.fouls >= 3))) {
    sendOff(state, tackler, 'red');
  } else if (severity < 0.25 || tackler.fouls >= 3) {
    if (tackler.yellow) {
      sendOff(state, tackler, 'red'); // second yellow
    } else {
      tackler.yellow = true;
      state.events.push({ type: 'card', color: 'yellow', playerId: tackler.id });
    }
  }
  if (state.status !== 'play') return; // match was abandoned by the sending-off
  // Law 14: foul inside the offender's own penalty area = penalty kick,
  // otherwise a direct free kick (Law 13) at the spot of the offence.
  if (inOwnBox(state, tackler.team, x, z)) {
    setDeadball(state, 'penalty', victim.team, x, z, 2.0);
  } else {
    setDeadball(state, 'freekick', victim.team, x, z, 1.6);
  }
}

// Law 12: sending-off. Law 3: the match cannot continue if a team drops
// below seven players, so a red at 7-a-side abandons the match.
function sendOff(state, p, color) {
  p.off = true;
  if (state.ball.holder === p.id) state.ball.holder = null;
  state.events.push({ type: 'card', color, playerId: p.id });
  const remaining = state.players.filter((q) => q.team === p.team && !q.off).length;
  if (remaining < 7) {
    state.status = 'done';
    state.winner = other(p.team);
    state.deadball = null;
    state.events.push({ type: 'abandoned', team: p.team, winner: state.winner });
  }
}

export function stepSoccer(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'play') return;

  state.clock -= dt;
  if (state.clock <= 0) {
    if (state.half === 1) {
      state.half = 2;
      state.clock = HALF_SECONDS;
      // Law 8: teams change ends at half-time; the other team kicks off.
      state.sides.blue *= -1;
      state.sides.red *= -1;
      setDeadball(state, 'kickoff', other(state.firstKickoff), 0, 0, 2.5);
      state.events.push({ type: 'half', half: 2 });
    } else {
      state.status = 'done';
      state.winner = state.score.blue > state.score.red ? 'blue' : state.score.red > state.score.blue ? 'red' : 'tie';
      state.events.push({ type: 'win', winner: state.winner });
    }
    return;
  }

  // Stoppage: freeze play, count down to the restart.
  if (state.deadball) {
    state.deadball.t -= dt;
    if (state.deadball.t <= 0) {
      const db = state.deadball;
      state.deadball = null;
      executeDeadball(state, db);
    }
    return;
  }

  const ball = state.ball;
  const you = state.players.find((p) => p.isHuman);

  if (you && human && !you.off) {
    const speed = 11;
    you.x = clamp(you.x + human.mx * speed * dt, -PITCH_W / 2 + 1, PITCH_W / 2 - 1);
    you.z = clamp(you.z + human.mz * speed * dt, -PITCH_L / 2 + 1, PITCH_L / 2 - 1);
    if (!ball.holder && Math.hypot(ball.x - you.x, ball.z - you.z) < 1.6) {
      if (!checkOffside(state, you)) {
        ball.holder = you.id;
        state.lastTouch = you.team;
      }
    }
    if (human.act && ball.holder === you.id) {
      const targetZ = attackGoalZ(state, you.team);
      const dx = (rng() - 0.5) * GOAL_W - ball.x;
      const dz = targetZ - ball.z;
      const dist = Math.hypot(dx, dz) || 1;
      const power = 30;
      kickBall(state, you, (dx / dist) * power, (dz / dist) * power);
      state.events.push({ type: 'shot', playerId: you.id });
    }
  }

  for (const p of state.players) {
    if (p.isHuman || p.off) continue;
    const targetGoalZ = attackGoalZ(state, p.team);

    if (ball.holder === p.id) {
      const dx = -p.x * 0.3;
      const dz = targetGoalZ - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      const sp = p.role === 'gk' ? 6 : 9;
      p.x += (dx / dist) * sp * dt;
      p.z += (dz / dist) * sp * dt;
      ball.x = p.x;
      ball.z = p.z;
      if (Math.abs(p.z - targetGoalZ) < 16 && rng() < 0.025) {
        const sdx = (rng() - 0.5) * GOAL_W - ball.x;
        const sdz = targetGoalZ - ball.z;
        const sdist = Math.hypot(sdx, sdz) || 1;
        kickBall(state, p, (sdx / sdist) * 28, (sdz / sdist) * 28);
        state.events.push({ type: 'shot', playerId: p.id });
      }
    } else if (!ball.holder) {
      // Chase or hold shape
      const shouldChase = p.role !== 'gk' && Math.hypot(ball.x - p.x, ball.z - p.z) < 18;
      if (shouldChase) {
        const dx = ball.x - p.x;
        const dz = ball.z - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        p.x += (dx / dist) * 8.5 * dt;
        p.z += (dz / dist) * 8.5 * dt;
        if (dist < 1.6 && !checkOffside(state, p)) {
          ball.holder = p.id;
          state.lastTouch = p.team;
        }
      }
      // Keeper stays near goal
      if (p.role === 'gk') {
        const gz = ownGoalZ(state, p.team);
        p.x += (clamp(ball.x, -4, 4) - p.x) * 2 * dt;
        p.z += (gz - p.z) * 2 * dt;
        if (Math.hypot(ball.x - p.x, ball.z - p.z) < 1.8) {
          ball.holder = p.id;
          // Keeper clears it upfield
          kickBall(state, p, (rng() - 0.5) * 10, -Math.sign(ownGoalZ(state, p.team)) * 22);
        }
      }
    } else {
      // Defend: move toward the ball carrier and attempt a tackle.
      const holder = state.players.find((q) => q.id === ball.holder);
      if (!holder || holder.team === p.team) continue; // never tackle your own side
      const dx = ball.x - p.x;
      const dz = ball.z - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > 2 && p.role !== 'gk') {
        p.x += (dx / dist) * 8 * dt;
        p.z += (dz / dist) * 8 * dt;
      }
      if (dist < 1.4 && rng() < 0.012) attemptTackle(state, p, holder, rng);
    }
    p.x = clamp(p.x, -PITCH_W / 2 + 1, PITCH_W / 2 - 1);
    p.z = clamp(p.z, -PITCH_L / 2 + 1, PITCH_L / 2 - 1);
  }

  if (!ball.holder) {
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    ball.vx *= 1 - 0.8 * dt;
    ball.vz *= 1 - 0.8 * dt;
    // Law 9/15: fully over the touchline = out — throw-in to the opponents
    // of the team that last touched it, from where it crossed.
    if (Math.abs(ball.x) > PITCH_W / 2 - 0.5) {
      const side = Math.sign(ball.x);
      setDeadball(state, 'throwin', other(state.lastTouch || 'blue'), side * (PITCH_W / 2), clamp(ball.z, -PITCH_L / 2 + 2, PITCH_L / 2 - 2));
      return;
    }
    // Law 9/16/17: over the goal line — goal, or goal kick / corner.
    if (Math.abs(ball.z) > PITCH_L / 2 - 0.5) {
      // goalSign: which goal line was crossed (+1 / -1).
      const goalSign = Math.sign(ball.z);
      if (Math.abs(ball.x) < GOAL_W / 2) {
        // Scorer = the team attacking this goal line (ends swap at half-time).
        scoreGoal(state, state.sides.blue === -goalSign ? 'blue' : 'red');
        return;
      }
      const defending = state.sides.blue === goalSign ? 'blue' : 'red';
      if ((state.lastTouch || 'blue') === defending) {
        // Defender touched it last: corner to the attackers (Law 17).
        setDeadball(state, 'corner', other(defending), ball.x, goalSign * (PITCH_L / 2), 1.6);
      } else {
        // Attacker touched it last: goal kick to the defenders (Law 16).
        setDeadball(state, 'goalkick', defending, ball.x, goalSign * (PITCH_L / 2), 1.6);
      }
      return;
    }
  }
}
