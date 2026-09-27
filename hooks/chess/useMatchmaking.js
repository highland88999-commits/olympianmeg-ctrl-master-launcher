import { useState, useEffect } from 'react';
import { supabase } from '@/lib/chess/supabase';

export function useMatchmaking(username) {
  const [sectorId, setSectorId] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [opponentMove, setOpponentMove] = useState(null);
  const [opponentResigned, setOpponentResigned] = useState(false);
  const [gameStatus, setGameStatus] = useState('idle'); 
  const [channel, setChannel] = useState(null);

  const [fullStateSync, setFullStateSync] = useState(null);
  const [hostNeedsToSync, setHostNeedsToSync] = useState(0);

  useEffect(() => {
    if (!sectorId) return;

    const newChannel = supabase.channel(`chess_sector_${sectorId}`, {
      config: { broadcast: { ack: false } }
    });

    newChannel.on('broadcast', { event: 'player_joined' }, () => {
      if (playerColor === 'cyan') {
        setGameStatus('active');
        setHostNeedsToSync(Date.now()); 
      }
    });

    newChannel.on('broadcast', { event: 'sync_state' }, (payload) => {
      if (playerColor === 'pink') {
        setGameStatus('active');
        setFullStateSync(payload.payload); 
      }
    });

    newChannel.on('broadcast', { event: 'move_piece' }, (payload) => {
      const { pieceId, to, nextTurn, senderColor } = payload.payload;
      if (senderColor !== playerColor) {
        setOpponentMove({ pieceId, to, nextTurn });
      }
    });

    newChannel.on('broadcast', { event: 'resign' }, (payload) => {
      if (payload.payload.senderColor !== playerColor) {
        setOpponentResigned(true);
      }
    });

    newChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (playerColor === 'pink') {
          let attempts = 0;
          const pingInterval = setInterval(() => {
            if (attempts > 10) {
              clearInterval(pingInterval);
              return;
            }
            newChannel.send({ type: 'broadcast', event: 'player_joined', payload: {} });
            attempts++;
          }, 1000);
        }
      }
    });

    setChannel(newChannel);

    return () => { supabase.removeChannel(newChannel); };
  }, [sectorId, playerColor]);

  const hostMatch = async () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    setSectorId(code);
    setPlayerColor('cyan'); 
    setGameStatus('waiting');
  };

  const joinMatch = async (code) => {
    setSectorId(code);
    setPlayerColor('pink'); 
    setGameStatus('waiting');
  };

  const broadcastMove = async (pieceId, tx, tz, nextTurn) => {
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'move_piece',
        payload: { pieceId, to: { x: tx, z: tz }, nextTurn, senderColor: playerColor }
      });
    }
  };

  const broadcastState = (pieces, currentTurn) => {
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'sync_state',
        payload: { pieces, currentTurn }
      });
    }
  };

  const broadcastResign = () => {
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'resign',
        payload: { senderColor: playerColor }
      });
    }
  };

  return { 
    sectorId, playerColor, gameStatus, opponentMove, opponentResigned,
    hostMatch, joinMatch, broadcastMove, broadcastResign,
    broadcastState, fullStateSync, hostNeedsToSync 
  };
}


