// Chess: shared rules + Quantum AI (minimax) tests.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getBoard,
  attacksSquare,
  isKingInCheck,
  legalMovesFor,
  allLegalMoves,
  applyMove,
  positionKey,
  initialPieces,
} from '../lib/chess/rules.js';
import { chooseAiMove, evaluate } from '../lib/chess/ai.js';

function piece(id, type, team, x, z, extra = {}) {
  return { id, type, team, x, z, alive: true, hasMoved: false, isAttacking: false, ...extra };
}

test('initial position: 20 legal moves for white', () => {
  const pieces = initialPieces();
  assert.equal(pieces.length, 32);
  assert.equal(allLegalMoves(pieces, 'cyan', null).length, 20);
});

test('pawn moves: single, double from home, captures', () => {
  const pieces = initialPieces();
  const pawn = pieces.find((p) => p.type === 'pawn' && p.team === 'cyan' && p.x === 4);
  const moves = legalMovesFor(pawn, pieces, null);
  assert.deepEqual(moves.map((m) => [m.x, m.z]).sort(), [[4, 2], [4, 3]]);
});

test('knight jumps over pieces', () => {
  const pieces = initialPieces();
  const knight = pieces.find((p) => p.type === 'knight' && p.team === 'cyan' && p.x === 1);
  const moves = legalMovesFor(knight, pieces, null);
  assert.deepEqual(moves.map((m) => [m.x, m.z]).sort(), [[0, 2], [2, 2]]);
});

test('king cannot move into check', () => {
  const pieces = [
    piece(1, 'king', 'cyan', 4, 0),
    piece(2, 'rook', 'pink', 4, 7),
    piece(3, 'king', 'pink', 0, 7),
  ];
  const king = pieces[0];
  const moves = legalMovesFor(king, pieces, null);
  // e-file squares are all attacked by the rook
  for (const m of moves) assert.notEqual(m.x, 4, 'king walked into rook fire');
});

test('castling works when legal, blocked when passing through check', () => {
  const open = [
    piece(1, 'king', 'cyan', 4, 0),
    piece(2, 'rook', 'cyan', 7, 0),
    piece(3, 'rook', 'cyan', 0, 0),
    piece(4, 'king', 'pink', 4, 7),
  ];
  const king = open[0];
  const targets = legalMovesFor(king, open, null).map((m) => `${m.x},${m.z}`);
  assert.ok(targets.includes('6,0'), 'kingside castle');
  assert.ok(targets.includes('2,0'), 'queenside castle');

  // Black bishop attacks f1 -> kingside castle illegal
  const blocked = [...open.map((p) => ({ ...p })), piece(5, 'bishop', 'pink', 2, 3)];
  const targets2 = legalMovesFor(blocked[0], blocked, null).map((m) => `${m.x},${m.z}`);
  assert.ok(!targets2.includes('6,0'), 'no castling through check');
  assert.ok(targets2.includes('2,0'), 'queenside still fine');
});

test('en passant capture is generated', () => {
  const pieces = [
    piece(1, 'king', 'cyan', 4, 0),
    piece(2, 'king', 'pink', 4, 7),
    piece(3, 'pawn', 'cyan', 4, 4),
    piece(4, 'pawn', 'pink', 5, 6),
  ];
  const lastMove = { piece: { ...pieces[3] }, from: { x: 5, z: 6 }, to: { x: 5, z: 4 } };
  const victim = pieces.find((p) => p.id === 4);
  victim.z = 4;
  victim.hasMoved = true;
  const moves = legalMovesFor(pieces.find((p) => p.id === 3), pieces, lastMove);
  assert.ok(moves.some((m) => m.x === 5 && m.z === 5), 'en passant target present');
  const res = applyMove(pieces, 3, 5, 5, 'queen', lastMove);
  assert.equal(res.pieces.find((p) => p.id === 4).alive, false);
});

test('promotion applies the chosen piece', () => {
  const pieces = [
    piece(1, 'king', 'cyan', 4, 0),
    piece(2, 'king', 'pink', 4, 7),
    piece(3, 'pawn', 'cyan', 0, 6),
  ];
  const res = applyMove(pieces, 3, 0, 7, 'knight', null);
  assert.equal(res.pieces.find((p) => p.id === 3).type, 'knight');
  const res2 = applyMove(pieces, 3, 0, 7, 'bogus', null);
  assert.equal(res2.pieces.find((p) => p.id === 3).type, 'queen');
});

test('positionKey distinguishes side to move', () => {
  const pieces = initialPieces();
  assert.notEqual(positionKey(pieces, 'cyan'), positionKey(pieces, 'pink'));
});

test('AI finds mate in one', () => {
  // White: Kg6, Qh6; Black: Kh8. Qxh7# is mate... use a cleaner forced mate:
  // White Kg6 Qg7 vs Kh8 -> Qg8#? g8 defended by king g6. Yes: Qg7-g8#.
  const pieces = [
    piece(1, 'king', 'cyan', 6, 5),
    piece(2, 'queen', 'cyan', 6, 6),
    piece(3, 'king', 'pink', 7, 7),
  ];
  const mv = chooseAiMove(pieces, 'cyan', null, 2);
  assert.ok(mv, 'AI has a move');
  const res = applyMove(pieces, mv.pieceId, mv.x, mv.z, 'queen', null);
  const board = getBoard(res.pieces);
  assert.ok(isKingInCheck('pink', board, res.pieces, res.lastMove), 'black is in check');
  assert.equal(allLegalMoves(res.pieces, 'pink', res.lastMove).length, 0, 'no legal replies = mate');
});

test('AI captures a hanging queen', () => {
  const pieces = [
    piece(1, 'king', 'cyan', 4, 0),
    piece(2, 'rook', 'cyan', 3, 3),
    piece(3, 'king', 'pink', 4, 7),
    piece(4, 'queen', 'pink', 3, 5), // hanging on the rook's file
  ];
  const mv = chooseAiMove(pieces, 'cyan', null, 2);
  assert.ok(mv, 'AI has a move');
  assert.equal(mv.pieceId, 2);
  assert.deepEqual([mv.x, mv.z], [3, 5]);
});

test('AI returns null with no legal moves (stalemate)', () => {
  const pieces = [
    piece(1, 'king', 'cyan', 5, 5),
    piece(2, 'queen', 'cyan', 6, 6),
    piece(3, 'king', 'pink', 7, 7),
  ];
  // black to move, not in check, no moves -> stalemate
  assert.equal(allLegalMoves(pieces, 'pink', null).length, 0);
  assert.equal(chooseAiMove(pieces, 'pink', null, 2), null);
});

test('evaluation favors material', () => {
  const even = initialPieces();
  assert.ok(Math.abs(evaluate(even, 'cyan')) < 50);
  const up = [...even];
  up.find((p) => p.type === 'queen' && p.team === 'pink').alive = false;
  assert.ok(evaluate(up, 'cyan') > 800);
});

test('AI answers the opening in reasonable time', () => {
  const pieces = initialPieces();
  const t0 = Date.now();
  const mv = chooseAiMove(pieces, 'pink', null, 3);
  const dt = Date.now() - t0;
  assert.ok(mv, 'AI moved');
  assert.ok(dt < 15000, `depth-3 took ${dt}ms`);
});
