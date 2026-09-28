/**
 * Starblood — pure logic for a rune-card battle game.
 * No DOM, no canvas. Three lanes, blind deployment, best of 5 rounds.
 */

// Element wheel: each element beats the next one in the ring.
export const ELEMENTS = ["fire", "frost", "storm", "stone", "blood"];
export function beats(a, b) {
  return ELEMENTS[(ELEMENTS.indexOf(a) + 1) % ELEMENTS.length] === b;
}

// Glyph strokes: line segments in a 0..100 box, drawn by the page.
export const RUNES = [
  { id: "brandr", name: "Brandr", element: "fire", power: 6, cost: 2, effect: "bane:frost", effectText: "+3 power against Frost",
    glyph: [[22, 8, 22, 92], [22, 8, 62, 34], [22, 46, 58, 70]] },
  { id: "isbrand", name: "Isbrand", element: "frost", power: 5, cost: 2, effect: "bane:storm", effectText: "+3 power against Storm",
    glyph: [[50, 8, 50, 92], [20, 30, 80, 30], [28, 70, 72, 70]] },
  { id: "vindr", name: "Vindr", element: "storm", power: 5, cost: 2, effect: "bane:stone", effectText: "+3 power against Stone",
    glyph: [[30, 8, 70, 40], [70, 40, 30, 60], [30, 60, 70, 92]] },
  { id: "stein", name: "Stein", element: "stone", power: 6, cost: 2, effect: "bane:blood", effectText: "+3 power against Blood",
    glyph: [[20, 20, 80, 20], [80, 20, 80, 80], [80, 80, 20, 80], [20, 80, 20, 20]] },
  { id: "blod", name: "Blod", element: "blood", power: 5, cost: 2, effect: "bane:fire", effectText: "+3 power against Fire",
    glyph: [[50, 8, 20, 92], [50, 8, 80, 92], [35, 55, 65, 55]] },
  { id: "sol", name: "Sol", element: "fire", power: 3, cost: 1, effect: "oath", effectText: "Wins ties in its lane",
    glyph: [[50, 15, 50, 85], [22, 50, 78, 50], [30, 30, 70, 70], [70, 30, 30, 70]] },
  { id: "natt", name: "Natt", element: "frost", power: 4, cost: 1, effect: null, effectText: "No effect",
    glyph: [[25, 85, 50, 15], [50, 15, 75, 85]] },
  { id: "oth", name: "Oth", element: "storm", power: 2, cost: 1, effect: "tithe", effectText: "+1 power for each empty enemy lane",
    glyph: [[20, 50, 80, 50], [50, 20, 50, 80], [50, 20, 72, 38]] },
  { id: "jarn", name: "Jarn", element: "stone", power: 4, cost: 1, effect: null, effectText: "No effect",
    glyph: [[30, 15, 30, 85], [30, 85, 70, 85], [30, 50, 60, 50]] },
  { id: "hrafn", name: "Hrafn", element: "blood", power: 3, cost: 1, effect: "oath", effectText: "Wins ties in its lane",
    glyph: [[25, 15, 75, 50], [75, 50, 25, 85], [25, 85, 25, 15]] },
  { id: "eldr", name: "Eldr", element: "fire", power: 8, cost: 3, effect: null, effectText: "No effect — raw power",
    glyph: [[50, 8, 78, 50], [78, 50, 50, 92], [50, 92, 22, 50], [22, 50, 50, 8], [50, 30, 50, 70]] },
  { id: "vargr", name: "Vargr", element: "blood", power: 7, cost: 3, effect: "tithe", effectText: "+1 power for each empty enemy lane",
    glyph: [[20, 15, 80, 15], [80, 15, 40, 55], [40, 55, 75, 90], [40, 55, 20, 90]] },
];

export const LANES = 3;
export const ROUNDS_TO_WIN = 3; // best of 5
export const HAND_SIZE = 4;
export const MANA_PER_ROUND = 3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffled copy of the rune deck. */
export function makeDeck(seed) {
  const rand = mulberry32(seed);
  const deck = RUNES.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function drawHand(seed, round) {
  return makeDeck(seed + round * 7919).slice(0, HAND_SIZE);
}

function baneBonus(card, foe) {
  if (card.effect && card.effect.startsWith("bane:") && foe) {
    const target = card.effect.slice(5);
    if (foe.element === target) return 3;
  }
  return 0;
}

function titheBonus(card, foeLanes) {
  if (card.effect === "tithe") {
    return foeLanes.filter((l) => !l).length;
  }
  return 0;
}

/** Effective power of card against foe in the context of foeLanes. */
export function effectivePower(card, foe, foeLanes) {
  if (!card) return 0;
  let p = card.power;
  if (foe && beats(card.element, foe.element)) p += 2;
  p += baneBonus(card, foe);
  p += titheBonus(card, foeLanes);
  return p;
}

/**
 * Resolve one lane. Returns 'player' | 'enemy' | 'draw'.
 * lanes arrays are needed for tithe effects.
 */
export function resolveLane(playerCard, enemyCard, playerLanes, enemyLanes) {
  if (!playerCard && !enemyCard) return "draw";
  if (!playerCard) return "enemy";
  if (!enemyCard) return "player";
  const pp = effectivePower(playerCard, enemyCard, enemyLanes);
  const ep = effectivePower(enemyCard, playerCard, playerLanes);
  if (pp > ep) return "player";
  if (ep > pp) return "enemy";
  // ties: oath runes win ties
  const pOath = playerCard.effect === "oath";
  const eOath = enemyCard.effect === "oath";
  if (pOath && !eOath) return "player";
  if (eOath && !pOath) return "enemy";
  return "draw";
}

export function resolveRound(playerLanes, enemyLanes) {
  const lanes = [];
  let playerWins = 0;
  let enemyWins = 0;
  for (let i = 0; i < LANES; i++) {
    const w = resolveLane(playerLanes[i], enemyLanes[i], playerLanes, enemyLanes);
    lanes.push({
      winner: w,
      playerPower: effectivePower(playerLanes[i], enemyLanes[i], enemyLanes),
      enemyPower: effectivePower(enemyLanes[i], playerLanes[i], playerLanes),
    });
    if (w === "player") playerWins++;
    if (w === "enemy") enemyWins++;
  }
  const roundWinner = playerWins > enemyWins ? "player" : enemyWins > playerWins ? "enemy" : "draw";
  return { lanes, playerWins, enemyWins, roundWinner };
}

/**
 * Enemy AI: blind deployment (does not see the player's lanes).
 * Plays affordable cards, strongest first, preferring lanes by a seeded
 * priority with a mild bias toward the center lane.
 */
export function aiDeploy(hand, seed) {
  const rand = mulberry32(seed);
  const lanes = [null, null, null];
  let mana = MANA_PER_ROUND;
  const order = hand
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.cost <= MANA_PER_ROUND)
    .sort((a, b) => b.c.power - a.c.power || a.c.cost - b.c.cost);
  const lanePref = [1, 0, 2].sort(() => rand() - 0.5);
  for (const { c } of order) {
    if (c.cost > mana) continue;
    const lane = lanePref.find((l) => !lanes[l]);
    if (lane === undefined) break;
    lanes[lane] = c;
    mana -= c.cost;
  }
  return lanes;
}

export function createMatch(seed) {
  return {
    seed,
    round: 1,
    playerScore: 0,
    enemyScore: 0,
    phase: "deploy", // deploy | reveal | result | over
    playerHand: drawHand(seed, 1),
    playerLanes: [null, null, null],
    enemyLanes: [null, null, null],
    mana: MANA_PER_ROUND,
    lastRound: null,
    winner: null,
  };
}

/** Deploy a hand card to a lane. Returns true on success. */
export function deployCard(match, handIndex, lane) {
  if (match.phase !== "deploy") return false;
  if (!Number.isInteger(lane) || lane < 0 || lane >= LANES) return false;
  if (!Number.isInteger(handIndex) || handIndex < 0 || handIndex >= match.playerHand.length) return false;
  const card = match.playerHand[handIndex];
  if (!card || match.playerLanes[lane] || card.cost > match.mana) return false;
  match.playerLanes[lane] = card;
  match.playerHand.splice(handIndex, 1);
  match.mana -= card.cost;
  return true;
}

/** Lock in the round: AI deploys blind, lanes resolve. */
export function battleRound(match) {
  if (match.phase !== "deploy") return null;
  match.enemyLanes = aiDeploy(drawHand(match.seed ^ 0x5eed, match.round), match.seed + match.round * 131);
  const result = resolveRound(match.playerLanes, match.enemyLanes);
  match.lastRound = result;
  if (result.roundWinner === "player") match.playerScore++;
  if (result.roundWinner === "enemy") match.enemyScore++;
  match.phase = "result";
  if (match.playerScore >= ROUNDS_TO_WIN || match.enemyScore >= ROUNDS_TO_WIN || match.round >= 5) {
    match.phase = "over";
    match.winner =
      match.playerScore > match.enemyScore ? "player" : match.enemyScore > match.playerScore ? "enemy" : "draw";
  }
  return result;
}

export function nextRound(match) {
  if (match.phase !== "result") return false;
  match.round++;
  match.playerHand = drawHand(match.seed, match.round);
  match.playerLanes = [null, null, null];
  match.enemyLanes = [null, null, null];
  match.mana = MANA_PER_ROUND;
  match.lastRound = null;
  match.phase = "deploy";
  return true;
}

export function elementColor(element) {
  return {
    fire: "#ff6b4a",
    frost: "#7ecbff",
    storm: "#c9a7ff",
    stone: "#d8b48a",
    blood: "#ff2e63",
  }[element] || "#fff";
}
