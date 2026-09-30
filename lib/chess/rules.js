// Shared chess rules — pure functions over plain piece objects.
//
// Piece shape: { id, type, team, x, z, alive, hasMoved }
// Teams: 'cyan' moves +z (back rank z=0), 'pink' moves -z (back rank z=7).
// Used by the stateful hook AND the AI search, so both sides of the board
// always agree on what is legal.

export const PROMOTION_CHOICES = ['queen', 'rook', 'bishop', 'knight'];

export function getBoard(pieces) {
  const board = Array(8)
    .fill()
    .map(() => Array(8).fill(null));
  for (const p of pieces) {
    if (p.alive) board[p.z][p.x] = p;
  }
  return board;
}

// Can `piece` attack (or move to) tx,tz on this board? Includes castling,
// en passant (needs lastMove), and pawn double-step.
export function attacksSquare(piece, tx, tz, board, lastMove) {
  if (tx < 0 || tx > 7 || tz < 0 || tz > 7) return false;
  const { x: sx, z: sz, type, team, hasMoved } = piece;
  const dx = tx - sx;
  const dz = tz - sz;
  const adx = Math.abs(dx);
  const adz = Math.abs(dz);
  const target = board[tz][tx];
  if (target && target.team === team) return false;

  const pathClearTo = (ex, ez) => {
    let cx = sx + Math.sign(dx);
    let cz = sz + Math.sign(dz);
    while (cx !== ex || cz !== ez) {
      if (cx < 0 || cx > 7 || cz < 0 || cz > 7 || board[cz][cx]) return false;
      cx += Math.sign(dx);
      cz += Math.sign(dz);
    }
    return true;
  };

  switch (type) {
    case 'pawn': {
      const dir = team === 'cyan' ? 1 : -1;
      if (dx === 0 && !target) {
        if (dz === dir) return true;
        if (dz === dir * 2 && !hasMoved && !board[sz + dir][sx]) return true;
      }
      if (adx === 1 && dz === dir && target) return true;
      if (adx === 1 && dz === dir && !target && lastMove) {
        const lm = lastMove;
        if (
          lm.piece.type === 'pawn' &&
          lm.to.x === tx &&
          lm.to.z === sz &&
          Math.abs(lm.from.z - lm.to.z) === 2
        ) {
          return true;
        }
      }
      return false;
    }
    case 'rook':
      return (dx === 0 || dz === 0) && pathClearTo(tx, tz);
    case 'bishop':
      return adx === adz && adx > 0 && pathClearTo(tx, tz);
    case 'knight':
      return (adx === 1 && adz === 2) || (adx === 2 && adz === 1);
    case 'queen':
      return (dx === 0 || dz === 0 || adx === adz) && (adx > 0 || adz > 0) && pathClearTo(tx, tz);
    case 'king': {
      if (adx <= 1 && adz <= 1 && (adx > 0 || adz > 0)) return true;
      if (!hasMoved && adx === 2 && dz === 0 && !target) {
        const rookX = dx > 0 ? 7 : 0;
        const rook = board[sz][rookX];
        // Every square between king and rook must be empty (the rook travels too).
        if (rook && rook.type === 'rook' && rook.team === team && !rook.hasMoved) {
          const step = Math.sign(rookX - sx);
          for (let x = sx + step; x !== rookX; x += step) {
            if (board[sz][x]) return false;
          }
          return true;
        }
      }
      return false;
    }
    default:
      return false;
  }
}

export function isKingInCheck(team, board, pieces, lastMove) {
  const king = pieces.find((p) => p.type === 'king' && p.team === team && p.alive);
  if (!king) return false;
  return pieces.some(
    (p) => p.team !== team && p.alive && attacksSquare(p, king.x, king.z, board, lastMove)
  );
}

// Every legal destination for one piece (king-safety enforced).
export function legalMovesFor(piece, pieces, lastMove) {
  if (!piece || !piece.alive) return [];
  const board = getBoard(pieces);
  const moves = [];
  for (let z = 0; z < 8; z++) {
    for (let x = 0; x < 8; x++) {
      if (!attacksSquare(piece, x, z, board, lastMove)) continue;
      const sim = pieces.map((p) => ({ ...p }));
      const sp = sim.find((p) => p.id === piece.id);
      const victim = sim.find((p) => p.x === x && p.z === z && p.alive && p.id !== sp.id);
      if (victim) victim.alive = false;
      // en passant capture
      if (sp.type === 'pawn' && x !== sp.x && !victim) {
        const ep = sim.find((p) => p.x === x && p.z === sp.z && p.alive && p.id !== sp.id);
        if (ep) ep.alive = false;
      }
      const fromX = sp.x;
      sp.x = x;
      sp.z = z;
      // castling may not pass through check
      if (sp.type === 'king' && Math.abs(x - fromX) === 2) {
        if (isKingInCheck(sp.team, board, pieces, lastMove)) continue;
        const passX = fromX + Math.sign(x - fromX);
        sp.x = passX;
        if (isKingInCheck(sp.team, getBoard(sim), sim, lastMove)) continue;
        sp.x = x;
      }
      if (!isKingInCheck(sp.team, getBoard(sim), sim, lastMove)) {
        moves.push({ x, z });
      }
    }
  }
  return moves;
}

export function allLegalMoves(pieces, team, lastMove) {
  const moves = [];
  for (const p of pieces) {
    if (p.team !== team || !p.alive) continue;
    for (const m of legalMovesFor(p, pieces, lastMove)) {
      moves.push({ pieceId: p.id, x: m.x, z: m.z });
    }
  }
  return moves;
}

// Apply a (previously validated) move. Returns the new state plus metadata
// the draw rules need. Never mutates the input.
export function applyMove(pieces, pieceId, tx, tz, promotion, lastMove) {
  const next = pieces.map((p) => ({ ...p, isAttacking: false }));
  const piece = next.find((p) => p.id === pieceId);
  if (!piece || !piece.alive) return null;
  const target = next.find((p) => p.x === tx && p.z === tz && p.alive);
  let captured = false;

  if (target) {
    target.alive = false;
    piece.isAttacking = true;
    captured = true;
  }
  // en passant
  if (piece.type === 'pawn' && tx !== piece.x && !target) {
    const ep = next.find((p) => p.x === tx && p.z === piece.z && p.alive);
    if (ep) {
      ep.alive = false;
      piece.isAttacking = true;
      captured = true;
    }
  }
  // castling: the rook hops too
  if (piece.type === 'king' && Math.abs(tx - piece.x) === 2) {
    const rookX = tx > piece.x ? 7 : 0;
    const newRookX = tx > piece.x ? 5 : 3;
    const rook = next.find((p) => p.x === rookX && p.z === piece.z && p.alive);
    if (rook) {
      rook.x = newRookX;
      rook.hasMoved = true;
    }
  }

  const pawnMoved = piece.type === 'pawn';
  const from = { x: piece.x, z: piece.z };
  piece.x = tx;
  piece.z = tz;
  piece.hasMoved = true;

  if (pawnMoved && ((piece.team === 'cyan' && tz === 7) || (piece.team === 'pink' && tz === 0))) {
    piece.type = PROMOTION_CHOICES.includes(promotion) ? promotion : 'queen';
  }

  const newLastMove = { piece: { ...piece }, from, to: { x: tx, z: tz } };
  return { pieces: next, lastMove: newLastMove, captured, pawnMoved };
}

// Position identity for threefold-repetition detection.
export function positionKey(pieces, turn) {
  const sig = pieces
    .filter((p) => p.alive)
    .map((p) => `${p.id}:${p.type}:${p.x},${p.z}`)
    .sort()
    .join(';');
  return `${turn}|${sig}`;
}

export function initialPieces() {
  const layout = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  const pieces = [];
  let id = 1;
  for (let i = 0; i < 8; i++) {
    pieces.push({ id: id++, type: layout[i], team: 'cyan', x: i, z: 0, alive: true, hasMoved: false, isAttacking: false });
    pieces.push({ id: id++, type: 'pawn', team: 'cyan', x: i, z: 1, alive: true, hasMoved: false, isAttacking: false });
    pieces.push({ id: id++, type: layout[i], team: 'pink', x: i, z: 7, alive: true, hasMoved: false, isAttacking: false });
    pieces.push({ id: id++, type: 'pawn', team: 'pink', x: i, z: 6, alive: true, hasMoved: false, isAttacking: false });
  }
  return pieces;
}
