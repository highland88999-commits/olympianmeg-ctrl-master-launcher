// Quantum AI — a real chess opponent. Negamax search with alpha-beta pruning,
// MVV-LVA-ish move ordering, piece-square tables, and checkmate scoring that
// prefers the fastest mate. Pure functions; operates on the same plain piece
// objects as lib/chess/rules.js.

import {
  getBoard,
  isKingInCheck,
  allLegalMoves,
  applyMove,
  positionKey,
} from './rules.js';

const VALUES = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 0 };
const MATE = 100000;

// Piece-square tables from White's (cyan's) perspective, z=0 back rank.
// Pink mirrors z.
const PST = {
  pawn: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  knight: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  bishop: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  rook: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ],
  queen: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  king: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
};

function pstValue(piece) {
  const table = PST[piece.type];
  if (!table) return 0;
  const z = piece.team === 'cyan' ? piece.z : 7 - piece.z;
  return table[z][piece.x];
}

// Static evaluation from `team`'s perspective, in centipawns.
export function evaluate(pieces, team) {
  let score = 0;
  for (const p of pieces) {
    if (!p.alive) continue;
    const v = (VALUES[p.type] || 0) + pstValue(p);
    score += p.team === team ? v : -v;
  }
  return score;
}

const other = (team) => (team === 'cyan' ? 'pink' : 'cyan');

// Order moves so the good stuff is searched first: captures (most valuable
// victim first), then promotions, then the rest.
function orderMoves(moves, pieces, board) {
  return moves
    .map((m) => {
      const piece = pieces.find((p) => p.id === m.pieceId);
      const victim = board[m.z][m.x];
      let s = 0;
      if (victim) s = 10 * (VALUES[victim.type] || 0) - (VALUES[piece.type] || 0);
      if (piece.type === 'pawn' && (m.z === 0 || m.z === 7)) s += 800;
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((e) => e.m);
}

function negamax(pieces, team, lastMove, depth, alpha, beta, ply, state) {
  state.nodes++;
  if (state.nodes > state.nodeCap) return evaluate(pieces, team);

  const board = getBoard(pieces);
  const moves = orderMoves(allLegalMoves(pieces, team, lastMove), pieces, board);

  if (moves.length === 0) {
    // No legal moves: checkmate or stalemate.
    return isKingInCheck(team, board, pieces, lastMove) ? -(MATE - ply) : 0;
  }
  if (depth === 0) return evaluate(pieces, team);

  let best = -Infinity;
  for (const m of moves) {
    const res = applyMove(pieces, m.pieceId, m.x, m.z, 'queen', lastMove);
    if (!res) continue;
    const score = -negamax(res.pieces, other(team), res.lastMove, depth - 1, -beta, -alpha, ply + 1, state);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
    if (state.nodes > state.nodeCap) break;
  }
  return best;
}

// Pick the AI's move. Returns { pieceId, x, z } or null when no legal moves.
export function chooseAiMove(pieces, team, lastMove, depth = 3) {
  const board = getBoard(pieces);
  const moves = orderMoves(allLegalMoves(pieces, team, lastMove), pieces, board);
  if (moves.length === 0) return null;

  const state = { nodes: 0, nodeCap: 120000 };
  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const m of moves) {
    const res = applyMove(pieces, m.pieceId, m.x, m.z, 'queen', lastMove);
    if (!res) continue;
    const score = -negamax(res.pieces, other(team), res.lastMove, depth - 1, -Infinity, Infinity, 1, state);
    // Tiny jitter so the AI doesn't play the same line every game.
    const jittered = score + Math.random() * 4;
    if (jittered > bestScore) {
      bestScore = jittered;
      bestMove = m;
    }
    if (state.nodes > state.nodeCap) break;
  }
  return { pieceId: bestMove.pieceId, x: bestMove.x, z: bestMove.z };
}

export { positionKey };
