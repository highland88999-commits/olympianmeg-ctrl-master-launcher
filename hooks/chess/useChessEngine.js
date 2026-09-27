import { useState, useCallback } from 'react';

const INITIAL_LAYOUT = ['rook','knight','bishop','queen','king','bishop','knight','rook'];

export function useChessEngine(gameMode, playerColor, broadcastMove) {
  const [pieces, setPieces] = useState([]);
  const [currentTurn, setCurrentTurn] = useState('cyan');
  const [isGameOver, setIsGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isCheck, setIsCheck] = useState(false);
  const [lastMove, setLastMove] = useState(null);

  const getBoard = (pieceList) => {
    const board = Array(8).fill().map(() => Array(8).fill(null));
    pieceList.forEach(p => { if (p.alive) board[p.z][p.x] = p; });
    return board;
  };

  const initGame = useCallback(() => {
    let newPieces = [];
    let idCounter = 1;
    for (let i = 0; i < 8; i++) {
      newPieces.push({ id: idCounter++, type: INITIAL_LAYOUT[i], team: 'cyan', x: i, z: 0, alive: true, hasMoved: false, isAttacking: false });
      newPieces.push({ id: idCounter++, type: 'pawn', team: 'cyan', x: i, z: 1, alive: true, hasMoved: false, isAttacking: false });
      newPieces.push({ id: idCounter++, type: INITIAL_LAYOUT[i], team: 'pink', x: i, z: 7, alive: true, hasMoved: false, isAttacking: false });
      newPieces.push({ id: idCounter++, type: 'pawn', team: 'pink', x: i, z: 6, alive: true, hasMoved: false, isAttacking: false });
    }
    setPieces(newPieces);
    setCurrentTurn('cyan');
    setIsGameOver(false);
    setWinner(null);
    setIsCheck(false);
    setLastMove(null);
  }, []);

  const canAttack = (piece, tx, tz, board) => {
    const { x: sx, z: sz, type, team, hasMoved } = piece;
    const dx = tx - sx, dz = tz - sz, adx = Math.abs(dx), adz = Math.abs(dz);
    const target = board[tz][tx];

    if (target && target.team === team) return false;

    const pathClear = () => {
      let cx = sx + Math.sign(dx), cz = sz + Math.sign(dz);
      while (cx !== tx || cz !== tz) {
        if (board[cz][cx]) return false;
        cx += Math.sign(dx); cz += Math.sign(dz);
      }
      return true;
    };

    switch(type) {
      case 'pawn': 
        const dir = team === 'cyan' ? 1 : -1;
        if (dx === 0 && !target) {
          if (dz === dir) return true;
          if (dz === dir * 2 && !hasMoved && !board[sz + dir][sx]) return true;
        }
        if (adx === 1 && dz === dir && target) return true;
        if (adx === 1 && dz === dir && !target && lastMove) {
          if (lastMove.piece.type === 'pawn' && lastMove.to.x === tx && lastMove.to.z === sz && Math.abs(lastMove.from.z - lastMove.to.z) === 2) {
            return true;
          }
        }
        return false;
      case 'rook': return (dx === 0 || dz === 0) && pathClear();
      case 'bishop': return adx === adz && pathClear();
      case 'knight': return (adx === 1 && adz === 2) || (adx === 2 && adz === 1);
      case 'queen': return (dx === 0 || dz === 0 || adx === adz) && pathClear();
      case 'king': 
        if (adx <= 1 && adz <= 1) return true;
        if (!hasMoved && adx === 2 && dz === 0) {
          const rookX = dx > 0 ? 7 : 0;
          const rook = board[sz][rookX];
          if (rook && rook.type === 'rook' && !rook.hasMoved && pathClear()) return true; 
        }
        return false;
      default: return false;
    }
  };

  const isKingInCheck = (teamToCheck, boardState, piecesList) => {
    const king = piecesList.find(p => p.type === 'king' && p.team === teamToCheck && p.alive);
    if (!king) return false;
    return piecesList.some(p => p.team !== teamToCheck && p.alive && canAttack(p, king.x, king.z, boardState));
  };

  const isValidMove = (piece, tx, tz) => {
    const board = getBoard(pieces);
    if (!canAttack(piece, tx, tz, board)) return false;

    const clonedPieces = pieces.map(p => ({ ...p }));
    const simPiece = clonedPieces.find(p => p.id === piece.id);
    const simTarget = clonedPieces.find(p => p.x === tx && p.z === tz && p.alive);
    
    if (simTarget) simTarget.alive = false;
    
    if (simPiece.type === 'pawn' && tx !== simPiece.x && !simTarget) {
      const epVictim = clonedPieces.find(p => p.x === tx && p.z === simPiece.z && p.alive);
      if (epVictim) epVictim.alive = false;
    }

    simPiece.x = tx; simPiece.z = tz;
    const simBoard = getBoard(clonedPieces);
    
    if (simPiece.type === 'king' && Math.abs(tx - piece.x) === 2) {
      if (isKingInCheck(piece.team, board, pieces)) return false; 
      const passX = piece.x + Math.sign(tx - piece.x);
      simPiece.x = passX;
      if (isKingInCheck(piece.team, getBoard(clonedPieces), clonedPieces)) return false;
    }

    return !isKingInCheck(piece.team, simBoard, clonedPieces);
  };

  const executeMove = (pieceId, tx, tz, isNetworkMove = false) => {
    if (isGameOver) return;
    
    let nextTurnCheck = false;
    let nextTurn = currentTurn === 'cyan' ? 'pink' : 'cyan';

    setPieces(prev => {
      let nextPieces = prev.map(p => ({ ...p, isAttacking: false }));
      const piece = nextPieces.find(p => p.id === pieceId);
      const target = nextPieces.find(p => p.x === tx && p.z === tz && p.alive);

      if (target) {
        target.alive = false;
        piece.isAttacking = true;
      }

      if (piece.type === 'pawn' && tx !== piece.x && !target) {
         const epTarget = nextPieces.find(p => p.x === tx && p.z === piece.z && p.alive);
         if (epTarget) {
            epTarget.alive = false;
            piece.isAttacking = true;
         }
      }

      if (piece.type === 'king' && Math.abs(tx - piece.x) === 2) {
         const rookX = tx > piece.x ? 7 : 0;
         const newRookX = tx > piece.x ? 5 : 3;
         const rook = nextPieces.find(p => p.x === rookX && p.z === piece.z && p.alive);
         if (rook) { rook.x = newRookX; rook.hasMoved = true; }
      }

      setLastMove({ piece: { ...piece }, from: { x: piece.x, z: piece.z }, to: { x: tx, z: tz } });
      piece.x = tx; 
      piece.z = tz;
      piece.hasMoved = true;

      if (piece.type === 'pawn' && ((piece.team === 'cyan' && tz === 7) || (piece.team === 'pink' && tz === 0))) {
         piece.type = 'queen';
      }

      const newBoard = getBoard(nextPieces);
      nextTurnCheck = isKingInCheck(nextTurn, newBoard, nextPieces);
      
      const nextTurnHasMoves = nextPieces.filter(p => p.team === nextTurn && p.alive).some(p => {
         for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
           const epVictim = (p.type === 'pawn' && x !== p.x && !newBoard[z][x]) ? nextPieces.find(v => v.x === x && v.z === p.z && v.alive) : null;
           const simNext = nextPieces.map(sp => ({ ...sp, alive: (sp.x === x && sp.z === z) ? false : (epVictim && sp.id === epVictim.id) ? false : sp.alive }));
           const spTarget = simNext.find(sp => sp.id === p.id);
           spTarget.x = x; spTarget.z = z;
           
           if (canAttack(p, x, z, newBoard) && !isKingInCheck(nextTurn, getBoard(simNext), simNext)) return true;
         }
         return false;
      });

      if (!nextTurnHasMoves) {
         setIsGameOver(true);
         setWinner(nextTurnCheck ? piece.team : 'draw');
      }

      return nextPieces;
    });

    setCurrentTurn(nextTurn);
    setIsCheck(nextTurnCheck);
    
    if (gameMode === 'global' && broadcastMove && !isNetworkMove) {
       broadcastMove(pieceId, tx, tz, nextTurn);
    }
  };

  const setGameState = useCallback((newPieces, newTurn) => {
    setPieces(newPieces);
    setCurrentTurn(newTurn);
    const board = getBoard(newPieces);
    setIsCheck(isKingInCheck(newTurn, board, newPieces));
  }, []);

  // NEW: Triggers immediate checkmate for the opposing team
  const resignGame = useCallback((resigningTeam) => {
    setIsGameOver(true);
    setWinner(resigningTeam === 'cyan' ? 'pink' : 'cyan');
  }, []);

  return { pieces, currentTurn, isGameOver, winner, isCheck, initGame, isValidMove, executeMove, setGameState, resignGame };
}


