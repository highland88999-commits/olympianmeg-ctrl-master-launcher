import { useState, useCallback, useRef } from 'react';
import {
  getBoard,
  isKingInCheck,
  legalMovesFor,
  applyMove,
  positionKey,
  initialPieces,
  PROMOTION_CHOICES,
} from '@/lib/chess/rules';

// Stateful chess engine: full rules (castling, en passant, promotion),
// check / checkmate / stalemate, threefold-repetition and fifty-move draws.
// Move legality comes from the shared rules module so the AI search and the
// board always agree.
export function useChessEngine(gameMode, playerColor, broadcastMove) {
  const [pieces, setPieces] = useState([]);
  const [currentTurn, setCurrentTurn] = useState('cyan');
  const [isGameOver, setIsGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isCheck, setIsCheck] = useState(false);
  const [lastMove, setLastMove] = useState(null);

  const historyRef = useRef([]); // position keys, for threefold repetition
  const halfmoveRef = useRef(0); // since last pawn move or capture
  const overRef = useRef(false);

  const initGame = useCallback(() => {
    const fresh = initialPieces();
    setPieces(fresh);
    setCurrentTurn('cyan');
    setIsGameOver(false);
    setWinner(null);
    setIsCheck(false);
    setLastMove(null);
    overRef.current = false;
    historyRef.current = [positionKey(fresh, 'cyan')];
    halfmoveRef.current = 0;
  }, []);

  const isValidMove = useCallback(
    (piece, tx, tz) => {
      if (!piece || overRef.current) return false;
      return legalMovesFor(piece, pieces, lastMove).some((m) => m.x === tx && m.z === tz);
    },
    [pieces, lastMove]
  );

  const getLegalMoves = useCallback(
    (pieceId) => {
      if (overRef.current) return [];
      const piece = pieces.find((p) => p.id === pieceId);
      if (!piece) return [];
      return legalMovesFor(piece, pieces, lastMove);
    },
    [pieces, lastMove]
  );

  // Returns 'cyan' | 'pink' | 'draw' when the move ends the game, else null.
  const applyMoveAndJudge = useCallback(
    (pieceId, tx, tz, promotion) => {
      const piece = pieces.find((p) => p.id === pieceId);
      if (!piece || overRef.current) return { end: null };
      const legal = legalMovesFor(piece, pieces, lastMove).some((m) => m.x === tx && m.z === tz);
      if (!legal) return { end: null };

      const res = applyMove(pieces, pieceId, tx, tz, promotion, lastMove);
      if (!res) return { end: null };
      const nextPieces = res.pieces;
      const nextTurn = currentTurn === 'cyan' ? 'pink' : 'cyan';
      const board = getBoard(nextPieces);
      const check = isKingInCheck(nextTurn, board, nextPieces, res.lastMove);

      // Does the side to move have any legal reply?
      const hasReply = nextPieces
        .filter((p) => p.team === nextTurn && p.alive)
        .some((p) => legalMovesFor(p, nextPieces, res.lastMove).length > 0);

      let end = null;
      if (!hasReply) {
        end = check ? piece.team : 'draw'; // checkmate or stalemate
      } else {
        // Fifty-move rule: 100 halfmoves without a pawn move or capture.
        const half = res.pawnMoved || res.captured ? 0 : halfmoveRef.current + 1;
        halfmoveRef.current = half;
        if (half >= 100) {
          end = 'draw';
        } else {
          // Threefold repetition.
          const key = positionKey(nextPieces, nextTurn);
          historyRef.current.push(key);
          const reps = historyRef.current.filter((k) => k === key).length;
          if (reps >= 3) end = 'draw';
        }
      }

      setPieces(nextPieces);
      setLastMove(res.lastMove);
      setCurrentTurn(nextTurn);
      setIsCheck(check);
      if (end) {
        overRef.current = true;
        setIsGameOver(true);
        setWinner(end);
      }
      return { end, nextTurn, lastMove: res.lastMove };
    },
    [pieces, currentTurn, lastMove]
  );

  const executeMove = (pieceId, tx, tz, isNetworkMove = false, promotion = 'queen') => {
    const promo = PROMOTION_CHOICES.includes(promotion) ? promotion : 'queen';
    const { end, nextTurn } = applyMoveAndJudge(pieceId, tx, tz, promo) || {};
    if (nextTurn === undefined) return; // illegal or game already over
    if (!end && gameMode === 'global' && broadcastMove && !isNetworkMove) {
      broadcastMove(pieceId, tx, tz, nextTurn, promo);
    }
  };

  const setGameState = useCallback((newPieces, newTurn) => {
    setPieces(newPieces);
    setCurrentTurn(newTurn);
    const board = getBoard(newPieces);
    setIsCheck(isKingInCheck(newTurn, board, newPieces, null));
    historyRef.current.push(positionKey(newPieces, newTurn));
  }, []);

  const resignGame = useCallback((resigningTeam) => {
    if (overRef.current) return;
    overRef.current = true;
    setIsGameOver(true);
    setWinner(resigningTeam === 'cyan' ? 'pink' : 'cyan');
  }, []);

  return {
    pieces,
    currentTurn,
    isGameOver,
    winner,
    isCheck,
    lastMove,
    initGame,
    isValidMove,
    getLegalMoves,
    executeMove,
    setGameState,
    resignGame,
  };
}
