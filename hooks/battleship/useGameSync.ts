import { useEffect } from 'react'
import { supabase } from '@/lib/battleship/supabase'
import { useGameStore } from '@/store/battleship/useGameStore'

export function useGameSync() {
  const roomId = useGameStore(state => state.roomId)
  const mode = useGameStore(state => state.mode)
  const isHost = useGameStore(state => state.isHost)
  const fireShot = useGameStore(state => state.fireShot)
  const receiveShot = useGameStore(state => state.receiveShot)

  useEffect(() => {
    if (mode === 'pve' || !roomId) return;

    const channel = supabase.channel(`olympus_battleship_${roomId}`, {
      config: { broadcast: { ack: false }, presence: { key: isHost ? 'host' : 'guest' } }
    })

    channel.on('broadcast', { event: 'fire_shot' }, (payload) => {
      const { x, z, sender } = payload.payload;
      if (sender !== (isHost ? 'host' : 'guest')) receiveShot(x, z);
    })

    channel.on('broadcast', { event: 'fleet_ready' }, (payload) => {
      const { fleet, sender } = payload.payload;
      if (sender !== (isHost ? 'host' : 'guest')) useGameStore.getState().receiveOpponentFleet(fleet);
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log(`%c[NEXUS COMMAND] Uplink Established: ${roomId}`, 'color: #00ffff; font-weight: bold; text-shadow: 0 0 5px #00ffff;')
    })

    useGameStore.setState({
      broadcastShot: (x: number, z: number) => {
        fireShot(x, z);
        channel.send({ type: 'broadcast', event: 'fire_shot', payload: { x, z, sender: isHost ? 'host' : 'guest' } });
      },
      broadcastFleet: (fleet: any[]) => {
        channel.send({ type: 'broadcast', event: 'fleet_ready', payload: { fleet, sender: isHost ? 'host' : 'guest' } });
      }
    });

    return () => { supabase.removeChannel(channel) }
  }, [roomId, mode, isHost, fireShot, receiveShot])
}


