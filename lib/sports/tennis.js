// lib/sports/tennis.js — Tennis / table tennis rules (pure, node-tested).
//
// Singles: you vs AI.
//
// TENNIS (ITF): 15/30/40/deuce/advantage → games → sets (best of 3).
//   Serve alternates every game (ITF 14/16). Tie-break at 6-6: 7 points,
//   win by 2, 1-2-2 serve rotation (ITF 6). Serves go to the diagonal
//   service box with second serves, faults, double faults and lets
//   (ITF 17-20, 22). Net cords that cross stay live (ITF 24). A first
//   bounce outside the lines is out (ITF 12/13/24).
//
// TABLE TENNIS (ITTF): first to 11, win by 2. Serve alternates every
//   2 points, every point at 10-10 (ITTF 2.13.3). The serve is tossed
//   ≥16cm from an open palm above the table and must touch the
//   server's court then the receiver's (ITTF 2.6). Net-cord serves that
//   land good are lets (ITTF 2.9.1.1). No volleys / no obstruction:
//   a return is only legal after one bounce on the hitter's side
//   (ITTF 2.10.1.6). Point attribution tracks whether the ball legally
//   touched the receiver's court (hitter fault vs receiver failure,
//   ITTF 2.10.1.2).
//
// variant: 'tennis' | 'table' — scales court, speed, scoring.

export function courtDims(variant) {
  return variant === 'table'
    ? { W: 1.525, L: 2.74, NET_H: 0.1525, BALL_R: 0.02 }
    : { W: 10.97, L: 23.77, NET_H: 0.914, BALL_R: 0.033 };
}

const TABLE_Y = 0.76; // table surface height (table tennis)
const TENNIS_SERVICE_LINE = 6.4; // metres from net to service line

function other(p) {
  return p === 'you' ? 'ai' : 'you';
}

export function createRacket(variant = 'tennis', playerName = 'You') {
  const state = {
    variant,
    target: variant === 'table' ? 11 : 6,
    status: 'serve',
    score: { you: 0, ai: 0 },
    serving: 'you',
    ball: {
      x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, lastHit: null,
      prevZ: 0, bounces: 0, lastBounceSide: null,
      serve: null, // 'tennis' | 'table' while a serve is in flight
      servePhase: null, // 'toss' during the table-tennis toss
      serveBounces: 0,
      netTouch: false, clipNet: false, inNetZone: false,
      toSide: null, // court side the ball must next legally bounce on
      touchedReceiver: false, // ball legally touched the receiver's court
    },
    you: { x: 0, z: variant === 'table' ? 1.2 : 10 },
    ai: { x: 0, z: variant === 'table' ? -1.2 : -10 },
    events: [],
    winner: null,
  };
  if (variant === 'tennis') {
    state.points = { you: 0, ai: 0 }; // 0,1,2,3 → 0,15,30,40
    state.games = { you: 0, ai: 0 };
    state.sets = { you: 0, ai: 0 };
    state.tiebreak = null; // { you, ai, points } while a tie-break runs
    state.serveSide = 'deuce'; // deuce/ad court, alternates every point
    state.serveAttempt = 1; // 1st / 2nd serve
  } else {
    state.serveTurns = 0; // points played (drives serve alternation)
  }
  return state;
}

// ---------------------------------------------------------------- scoring

function scoreRacketPoint(state, winner) {
  if (state.variant === 'table') scoreTablePoint(state, winner);
  else scoreTennisPoint(state, winner);
}

// --- Table tennis: first to 11, win by 2 (ITTF, unchanged) ---------------
function scoreTablePoint(state, winner) {
  state.score[winner] += 1;
  state.events.push({ type: 'point', winner, score: { ...state.score } });
  const loser = other(winner);
  if (state.score[winner] >= 11 && state.score[winner] - state.score[loser] >= 2) {
    state.status = 'done';
    state.winner = winner;
    state.events.push({ type: 'win', winner });
    return;
  }
  // Serve alternates every 2 points; every point at 10-10 (ITTF 2.13.3)
  state.serveTurns += 1;
  const deuce = state.score.you >= 10 && state.score.ai >= 10;
  if (state.serveTurns % (deuce ? 1 : 2) === 0) state.serving = other(state.serving);
  state.status = 'serve';
}

// --- Tennis: ITF 5/6/7 ----------------------------------------------------
function scoreTennisPoint(state, winner) {
  const loser = other(winner);
  state.events.push({ type: 'point', winner });
  if (state.tiebreak) {
    const tb = state.tiebreak;
    tb[winner] += 1;
    tb.points += 1;
    // 1-2-2 serve rotation (ITF 6)
    if (tb.points === 1 || (tb.points - 1) % 2 === 0) state.serving = other(state.serving);
    if (tb[winner] >= 7 && tb[winner] - tb[loser] >= 2) {
      winTennisSet(state, winner);
    } else {
      state.serveSide = other(state.serveSide);
      state.serveAttempt = 1;
      state.status = 'serve';
    }
    return;
  }
  state.points[winner] += 1;
  const p = state.points;
  if (p[winner] >= 4 && p[winner] - p[loser] >= 2) {
    winTennisGame(state, winner);
  } else {
    state.serveSide = other(state.serveSide);
    state.serveAttempt = 1;
    state.status = 'serve';
  }
}

function winTennisGame(state, winner) {
  const loser = other(winner);
  state.games[winner] += 1;
  state.events.push({ type: 'game', winner, games: { ...state.games } });
  state.points = { you: 0, ai: 0 };
  state.serveSide = 'deuce';
  state.serveAttempt = 1;
  state.serving = other(state.serving); // serve alternates every game (ITF 14/16)
  const g = state.games;
  if (g.you === 6 && g.ai === 6) {
    state.tiebreak = { you: 0, ai: 0, points: 0 }; // ITF 6
  } else if (g[winner] >= 6 && g[winner] - g[loser] >= 2) {
    winTennisSet(state, winner);
    return;
  }
  state.score.you = state.games.you;
  state.score.ai = state.games.ai;
  state.status = 'serve';
}

function winTennisSet(state, winner) {
  state.sets[winner] += 1;
  state.events.push({ type: 'set', winner, sets: { ...state.sets } });
  state.games = { you: 0, ai: 0 };
  state.points = { you: 0, ai: 0 };
  state.tiebreak = null;
  state.serveSide = 'deuce';
  state.serveAttempt = 1;
  state.score = { you: 0, ai: 0 };
  if (state.sets[winner] >= 2) {
    state.status = 'done';
    state.winner = winner;
    state.events.push({ type: 'win', winner });
  } else {
    // Service order carries over into the next set.
    state.status = 'serve';
  }
}

// ---------------------------------------------------------------- serving

export function serveRacket(state, rng = Math.random) {
  if (state.status === 'done') return;
  if (state.variant === 'table') serveTable(state, rng);
  else serveTennis(state, rng);
}

// --- Tennis serve (ITF 17-20, 22): diagonal service box, 2nd serve --------
function serveTennis(state, rng) {
  const d = courtDims('tennis');
  const server = state.serving === 'you' ? state.you : state.ai;
  const dirZ = state.serving === 'you' ? -1 : 1;
  const side = state.serveSide;
  server.x = side === 'deuce' ? d.W / 4 : -d.W / 4;
  server.z = -dirZ * (d.L / 2 + 0.6);
  const b = state.ball;
  const y0 = 2.6;
  b.x = server.x;
  b.y = y0;
  b.z = server.z;
  b.prevZ = b.z;
  // Diagonal service box: deuce serves from +x to the -x box, ad mirrored.
  const boxX = side === 'deuce' ? [-d.W / 4, -0.3] : [0.3, d.W / 4];
  let tx = boxX[0] + rng() * (boxX[1] - boxX[0]);
  let tz = dirZ * (1.2 + rng() * (TENNIS_SERVICE_LINE - 2.0));
  let fault = null;
  if (rng() < 0.16) fault = ['long', 'wide', 'net'][Math.floor(rng() * 3)];
  if (fault === 'long') tz = dirZ * (TENNIS_SERVICE_LINE + 0.8 + rng() * 2.5);
  if (fault === 'wide') tx = (tx > 0 ? 1 : -1) * (d.W / 4 + 0.6 + rng() * 1.5);
  const g = 12;
  const hSpeed = 16 + rng() * 4;
  const dx = tx - b.x;
  const dz = tz - b.z;
  const dist = Math.hypot(dx, dz) || 1;
  const T = dist / hSpeed;
  b.vx = (dx / dist) * hSpeed;
  b.vz = (dz / dist) * hSpeed;
  b.vy = (0.05 - y0 + 0.5 * g * T * T) / T;
  // Clear the net with margin; arc a touch higher if the line is too flat.
  const tNet = Math.abs(b.z) / hSpeed;
  const yNet = y0 + b.vy * tNet - 0.5 * g * tNet * tNet;
  if (yNet < d.NET_H + 0.35) b.vy += (d.NET_H + 0.35 - yNet) / tNet;
  // A 'net' fault is aimed to clip the net cord and drop on the server's side.
  if (fault === 'net') b.vy = (d.NET_H * 0.5 - y0 + 0.5 * g * tNet * tNet) / tNet; // clips the net, drops on the server's side
  if (!fault && rng() < 0.05) b.clipNet = true; // service let cord
  b.bounces = 0;
  b.lastBounceSide = null;
  b.lastHit = state.serving;
  b.serve = 'tennis';
  b.netTouch = false;
  b.inNetZone = false;
  b.toSide = null;
  b.touchedReceiver = false;
  state.status = 'rally';
}

function tennisServeInBox(state, x, z) {
  const d = courtDims('tennis');
  const dirZ = state.serving === 'you' ? -1 : 1;
  const inZ = z * dirZ > 0 && Math.abs(z) <= TENNIS_SERVICE_LINE;
  const inX = state.serveSide === 'deuce'
    ? x <= 0 && x >= -d.W / 4
    : x >= 0 && x <= d.W / 4;
  return inX && inZ;
}

function handleTennisServeBounce(state) {
  const b = state.ball;
  const receiver = other(state.serving);
  const side = b.z > 0 ? 'you' : 'ai';
  const inBox = tennisServeInBox(state, b.x, b.z);
  if (b.netTouch && side === receiver && inBox) {
    // Let — the serve is replayed, attempt unchanged (ITF 22)
    b.serve = null;
    state.status = 'serve';
    state.events.push({ type: 'let' });
    return;
  }
  if (!b.netTouch && side === receiver && inBox) {
    b.serve = null; // good serve — rally on
    return;
  }
  serveFault(state); // ITF 19
}

function serveFault(state) {
  state.ball.serve = null;
  if (state.serveAttempt === 1) {
    state.serveAttempt = 2;
    state.status = 'serve';
    state.events.push({ type: 'fault', double: false });
  } else {
    state.events.push({ type: 'fault', double: true });
    scoreRacketPoint(state, other(state.serving)); // double fault
  }
}

// --- Table-tennis serve (ITTF 2.6): toss ≥16cm from above the table --------
function serveTable(state, rng) {
  const server = state.serving === 'you' ? state.you : state.ai;
  const sSign = state.serving === 'you' ? 1 : -1;
  const b = state.ball;
  b.x = Math.max(-0.5, Math.min(0.5, server.x));
  b.z = sSign * 1.05;
  b.y = TABLE_Y + 0.3; // open palm above the table — never below it
  b.prevZ = b.z;
  b.vx = 0;
  b.vz = 0;
  b.vy = 2.3; // toss rises ~27cm, clearing the 16cm minimum (ITTF 2.6.2)
  b.bounces = 0;
  b.lastBounceSide = null;
  b.serve = 'table';
  b.servePhase = 'toss';
  b.serveBounces = 0;
  b.netTouch = false;
  b.clipNet = false;
  b.inNetZone = false;
  b.lastHit = state.serving;
  b.toSide = null;
  b.touchedReceiver = false;
  state.status = 'rally';
}

function strikeTableServe(state, rng) {
  // Contact on the way down: drive the ball onto the server's own court
  // so it kicks over the net onto the receiver's court (ITTF 2.6.3).
  const sSign = state.serving === 'you' ? 1 : -1;
  const dirZ = -sSign;
  const b = state.ball;
  b.servePhase = null;
  b.vx = (rng() - 0.5) * 0.3;
  b.vy = -3.0;
  b.vz = dirZ * 1.971;
  state.events.push({ type: 'hit', hitter: state.serving });
}

// ---------------------------------------------------------------- stepping

// A return is legal only if the ball was last bounced on the hitter's own
// side and the hitter didn't hit it last. Table tennis additionally bans
// volleys outright (ITTF 2.10.1.6); tennis lets the serve bounce first.
function canHit(state, who) {
  const b = state.ball;
  if (state.status !== 'rally') return false;
  if (b.lastHit === who) return false;
  if (state.variant === 'tennis') return b.serve !== 'tennis';
  const side = who === 'you' ? 'you' : 'ai';
  return b.serve === null && b.servePhase !== 'toss'
    && b.bounces >= 1 && b.lastBounceSide === side;
}

export function stepRacket(state, dt, human, rng = Math.random) {
  state.events.length = 0;
  if (state.status !== 'rally') return;
  const d = courtDims(state.variant);
  const b = state.ball;
  const gravity = state.variant === 'table' ? 9.8 : 12;

  b.prevZ = b.z;
  b.vy -= gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Table-tennis toss: strike on the way down (ITTF 2.6.2)
  if (state.variant === 'table' && b.serve === 'table'
      && b.servePhase === 'toss' && b.vy < 0 && b.y <= TABLE_Y + 0.24) {
    strikeTableServe(state, rng);
  }

  // Net — heights measured relative to the playing surface.
  // A cord that crosses stays live (tennis ITF 24; table ITTF 2.10.1.2).
  const surfY = state.variant === 'table' ? TABLE_Y : 0;
  const netZone = state.variant === 'table'
    ? Math.abs(b.z) < 0.12 && Math.abs(b.x) < d.W / 2 + 0.1
    : Math.abs(b.z) < 0.18 && Math.abs(b.x) < d.W / 2 + 0.5;
  if (netZone && !b.inNetZone && b.y < surfY + d.NET_H) {
    b.netTouch = true;
    b.vz *= 0.35;
    b.vy = Math.min(b.vy, 0.5);
    b.z += b.vz >= 0 ? 0.03 : -0.03;
  }
  b.inNetZone = netZone;
  // Forced service-let cord (tennis)
  if (b.clipNet && (b.prevZ > 0) !== (b.z > 0)) {
    b.netTouch = true;
    b.vz *= 0.45;
    b.vy = Math.min(b.vy, 0.5);
    b.clipNet = false;
  }

  // Bounce
  if (state.variant === 'table') {
    if (b.y <= TABLE_Y + d.BALL_R && b.vy < 0) {
      b.y = TABLE_Y + d.BALL_R;
      b.vy *= -0.75;
      tableBounce(state);
      if (state.status !== 'rally') return;
    }
    // Out of bounds in flight (backstop — the ball never came down)
    if (state.status === 'rally'
        && (Math.abs(b.z) > d.L / 2 + 0.6
          || (Math.abs(b.x) > d.W / 2 + 0.6 && b.y < TABLE_Y + 0.5))) {
      if (b.serve === 'table') {
        scoreRacketPoint(state, other(state.serving)); // serve never landed
      } else {
        // Hitter fault unless the ball legally touched the receiver's court
        scoreRacketPoint(state, b.touchedReceiver ? b.lastHit : other(b.lastHit));
      }
      return;
    }
  } else {
    if (b.y <= d.BALL_R && b.vy < 0) {
      b.y = d.BALL_R;
      b.vy *= -0.75;
      if (b.serve === 'tennis') {
        b.bounces = 1;
        b.lastBounceSide = b.z > 0 ? 'you' : 'ai';
        handleTennisServeBounce(state);
        return;
      }
      b.bounces += 1;
      b.lastBounceSide = b.z > 0 ? 'you' : 'ai';
      const inCourt = Math.abs(b.z) <= d.L / 2 && Math.abs(b.x) <= d.W / 2;
      // Out on the FIRST bounce (ITF 12/13/24) — no tolerance, no 2nd bounce
      if (b.bounces === 1 && !inCourt) {
        scoreRacketPoint(state, other(b.lastHit));
        return;
      }
      if (b.bounces >= 2) {
        scoreRacketPoint(state, other(b.lastHit));
        return;
      }
    }
    // Out of bounds in flight (backstop)
    if (state.status === 'rally'
        && (Math.abs(b.z) > d.L / 2 + 6 || Math.abs(b.x) > d.W / 2 + 4)) {
      if (b.serve === 'tennis') serveFault(state);
      else scoreRacketPoint(state, other(b.lastHit));
      return;
    }
  }

  // Human hit
  if (human && human.act && canHit(state, 'you')) {
    const dx = b.x - state.you.x;
    const dz = b.z - state.you.z;
    const reach = state.variant === 'table' ? 0.6 : 2.5;
    if (Math.hypot(dx, b.y - 1, dz) < reach) {
      returnBall(state, 'you', rng);
    }
  }
  // Human movement
  if (human) {
    const speed = state.variant === 'table' ? 2.5 : 9;
    state.you.x = Math.max(-d.W / 2 - 1, Math.min(d.W / 2 + 1, state.you.x + human.mx * speed * dt));
    const baseZ = state.variant === 'table' ? 1.2 : 10;
    state.you.z = Math.max(baseZ - 2, Math.min(baseZ + 3, state.you.z + human.mz * speed * dt));
  }

  // AI: track the ball, hit it back
  const ai = state.ai;
  const aiBaseZ = state.variant === 'table' ? -1.2 : -10;
  if (b.vz < 0 || b.z < 0) {
    // Ball coming to AI side — move to intercept
    const tHit = b.vz !== 0 ? (aiBaseZ - b.z) / b.vz : 0;
    const predictX = b.x + b.vx * Math.max(0, tHit);
    ai.x += (Math.max(-d.W / 2, Math.min(d.W / 2, predictX)) - ai.x) * Math.min(1, 6 * dt);
    ai.z += ((aiBaseZ + Math.max(-1, Math.min(1, b.z - aiBaseZ))) - ai.z) * Math.min(1, 4 * dt);
  } else {
    ai.x += (0 - ai.x) * Math.min(1, 3 * dt);
    ai.z += (aiBaseZ - ai.z) * Math.min(1, 3 * dt);
  }
  const adx = b.x - ai.x;
  const adz = b.z - ai.z;
  const aiReach = state.variant === 'table' ? 0.5 : 2.2;
  if (Math.hypot(adx, b.y - 1, adz) < aiReach && b.vz < 0 && rng() < 0.95 && canHit(state, 'ai')) {
    returnBall(state, 'ai', rng);
  }
}

// --- Table-tennis bounce: serve legality + rally point attribution --------
function tableBounce(state) {
  const d = courtDims('table');
  const b = state.ball;
  const side = b.z > 0 ? 'you' : 'ai';
  const inTable = Math.abs(b.x) <= d.W / 2 && Math.abs(b.z) <= d.L / 2;
  b.lastBounceSide = side;

  if (b.serve === 'table') {
    b.serveBounces += 1;
    const server = state.serving;
    const receiver = other(server);
    if (b.serveBounces === 1) {
      // Must touch the server's own court first (ITTF 2.6.3)
      if (side !== server || !inTable) scoreRacketPoint(state, receiver);
    } else if (b.serveBounces === 2) {
      if (b.netTouch && side === receiver && inTable) {
        // Net-cord serve that lands good is a let (ITTF 2.9.1.1)
        b.serve = null;
        state.status = 'serve';
        state.events.push({ type: 'let' });
      } else if (side === receiver && inTable) {
        b.serve = null;
        b.bounces = 1;
        b.toSide = receiver;
        b.touchedReceiver = true;
        b.lastHit = server;
      } else {
        scoreRacketPoint(state, receiver);
      }
    }
    return;
  }

  // Rally — point attribution (ITTF 2.10.1.2)
  b.bounces += 1;
  const hitter = b.lastHit;
  const receiver = b.toSide;
  if (side !== receiver) {
    scoreRacketPoint(state, other(hitter)); // hitter fault: never reached
    return;
  }
  if (!inTable) {
    // Out: hitter fault unless the ball legally touched the receiver's court
    scoreRacketPoint(state, b.touchedReceiver ? hitter : other(hitter));
    return;
  }
  b.touchedReceiver = true;
  if (b.bounces >= 2) scoreRacketPoint(state, hitter); // receiver never got there
}

function returnBall(state, hitter, rng) {
  const d = courtDims(state.variant);
  const b = state.ball;
  const dirZ = hitter === 'you' ? -1 : 1;
  // Aim for the other side with some randomness
  const targetX = (rng() - 0.5) * d.W * 0.8;
  const targetZ = dirZ * (d.L / 4 + rng() * d.L / 4);
  const speed = state.variant === 'table' ? 3.5 + rng() * 2 : 14 + rng() * 8;
  const dx = targetX - b.x;
  const dz = targetZ - b.z;
  const dist = Math.hypot(dx, dz) || 1;
  b.vx = (dx / dist) * speed;
  b.vz = (dz / dist) * speed;
  b.vy = (state.variant === 'table' ? 1.5 : 3) + rng() * 2;
  b.bounces = 0;
  b.lastBounceSide = null;
  b.lastHit = hitter;
  b.serve = null;
  b.servePhase = null;
  b.serveBounces = 0;
  b.netTouch = false;
  b.clipNet = false;
  b.inNetZone = false;
  b.toSide = other(hitter);
  b.touchedReceiver = false;
  state.events.push({ type: 'hit', hitter });
}

// ---------------------------------------------------------------- display

const POINT_NAMES = ['0', '15', '30', '40'];

export function formatScore(state) {
  if (state.variant === 'table') {
    return `${state.score.you}–${state.score.ai}`;
  }
  const sets = `${state.sets.you}–${state.sets.ai}`;
  const games = `${state.games.you}–${state.games.ai}`;
  let pts;
  if (state.tiebreak) {
    pts = `TB ${state.tiebreak.you}–${state.tiebreak.ai}`;
  } else {
    const p = state.points;
    if (p.you >= 3 && p.ai >= 3) {
      pts = p.you === p.ai ? 'Deuce' : (p.you > p.ai ? 'Ad You' : 'Ad AI');
    } else {
      pts = `${POINT_NAMES[p.you]}–${POINT_NAMES[p.ai]}`;
    }
  }
  return `${sets} · ${games} · ${pts}`;
}
