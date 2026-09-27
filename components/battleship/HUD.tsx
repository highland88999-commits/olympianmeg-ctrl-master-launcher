import { useEffect } from 'react'
import { useGameStore } from '@/store/battleship/useGameStore'

export default function HUD() {
  const { status, turn, viewMode, setViewMode, placingIndex, playerShips, toggleOrientation, confirmFleet, winner, roomId } = useGameStore()
  
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'r') toggleOrientation() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggleOrientation])

  const setupComplete = placingIndex >= 5;
  const currentShip = !setupComplete ? playerShips[placingIndex] : null;

  return (
    <div className="absolute top-0 left-0 z-10 flex flex-col justify-between w-full h-full p-4 sm:p-8 pointer-events-none">
      
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="w-full sm:w-auto bg-zinc-950/90 border border-cyan-500/30 p-4 sm:p-5 rounded-lg backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.1)] min-w-[280px]">
          
          {status === 'setup' && (
            <>
              <h2 className="mb-2 text-xs tracking-widest text-cyan-400 uppercase sm:text-sm">Fleet Deployment</h2>
              {!setupComplete ? (
                <div className="flex flex-col gap-2 pointer-events-auto">
                  <span className="text-base font-bold text-white uppercase sm:text-lg">Place {currentShip?.type} ({currentShip?.length})</span>
                  <button onClick={toggleOrientation} className="w-full px-4 py-3 mt-2 text-xs font-bold tracking-widest text-white transition-all border rounded sm:w-auto border-zinc-600 hover:border-cyan-400 hover:bg-cyan-500/20 active:bg-cyan-500/40">
                    ROTATE (TAP / 'R')
                  </button>
                </div>
              ) : (
                <button onClick={confirmFleet} className="w-full px-4 py-3 mt-2 text-xs font-bold tracking-widest text-white transition-all border rounded pointer-events-auto sm:text-sm border-fuchsia-500 bg-fuchsia-600/20 hover:bg-fuchsia-500/40 animate-pulse">
                  CONFIRM FORMATION
                </button>
              )}
            </>
          )}

          {status === 'waiting_sync' && (
            <div className="flex flex-col gap-2">
              <h2 className="mb-1 text-xs tracking-widest uppercase text-fuchsia-400 sm:text-sm">Waiting for Opponent</h2>
              <p className="text-xs text-zinc-400">Share this code with your friend:</p>
              <div className="px-4 py-3 mt-1 text-center border rounded bg-black/50 border-fuchsia-500/50 pointer-events-auto">
                <span className="text-2xl font-mono font-bold tracking-[0.2em] text-white select-all sm:text-3xl">{roomId}</span>
              </div>
            </div>
          )}

          {status === 'playing' && (
            <div className="flex flex-col gap-2 sm:gap-3">
              <h2 className="text-xs tracking-widest text-cyan-400 uppercase sm:text-sm">
                {viewMode === 'target' ? 'Targeting Grid' : 'Ocean Fleet Grid'}
              </h2>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shadow-[0_0_10px] ${turn === 'player' ? 'bg-cyan-400 shadow-cyan-400' : 'bg-fuchsia-500 shadow-fuchsia-500'} animate-pulse`} />
                <span className="text-lg font-bold tracking-wider text-white uppercase sm:text-xl">
                  {turn === 'player' ? 'Your Turn' : 'Enemy Aiming...'}
                </span>
              </div>
            </div>
          )}

          {status === 'game_over' && (
            <div className="flex flex-col gap-2">
              <h2 className="text-xs tracking-widest uppercase text-fuchsia-400 sm:text-sm">Combat Concluded</h2>
              <span className="text-xl font-black tracking-wider text-white uppercase sm:text-2xl">
                {winner === 'player' ? 'Victory Secured' : 'Fleet Destroyed'}
              </span>
              <button onClick={() => window.location.reload()} className="w-full px-4 py-3 mt-4 text-xs font-bold text-white transition-all border rounded pointer-events-auto sm:w-auto border-zinc-600 hover:border-cyan-400 hover:bg-cyan-500/20 active:bg-cyan-500/40">
                RETURN TO LOBBY
              </button>
            </div>
          )}
        </div>
      </div>

      {status === 'playing' && (
        <div className="flex gap-2 pb-4 pointer-events-auto sm:pb-0 sm:self-start">
          <button 
            onClick={() => setViewMode('target')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-4 sm:py-3 font-bold tracking-widest text-[10px] sm:text-xs rounded border transition-all ${viewMode === 'target' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.3)]' : 'bg-black/80 border-zinc-700 text-zinc-500 hover:text-white'}`}
          >
            TARGET GRID
          </button>
          <button 
            onClick={() => setViewMode('fleet')}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-4 sm:py-3 font-bold tracking-widest text-[10px] sm:text-xs rounded border transition-all ${viewMode === 'fleet' ? 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-400 shadow-[0_0_15px_rgba(255,0,255,0.3)]' : 'bg-black/80 border-zinc-700 text-zinc-500 hover:text-white'}`}
          >
            FLEET STATUS
          </button>
        </div>
      )}
    </div>
  )
}


