export default function GameOver({ winner, onRestart }) {
  const isDraw = winner === 'draw';
  const isPlayerWin = winner === 'cyan'; 

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="flex flex-col items-center gap-6 p-10 bg-zinc-950 border border-cyan-500/40 rounded-xl shadow-[0_0_40px_rgba(0,242,255,0.15)] w-[450px] max-w-[95vw] text-center">
        <h2 className="text-xs tracking-widest uppercase text-fuchsia-400 sm:text-sm">Combat Concluded</h2>
        <h1 className={`text-4xl sm:text-5xl font-black tracking-wider uppercase text-transparent bg-clip-text ${isDraw ? 'bg-white' : isPlayerWin ? 'bg-gradient-to-r from-cyan-400 to-cyan-200' : 'bg-gradient-to-r from-fuchsia-500 to-fuchsia-300'}`}>
          {isDraw ? 'STALEMATE' : isPlayerWin ? 'Victory Secured' : 'King Destroyed'}
        </h1>
        <button onClick={onRestart} className="w-full px-8 py-4 mt-4 text-sm font-bold tracking-widest text-white uppercase transition-all border rounded pointer-events-auto border-zinc-600 hover:border-cyan-400 hover:bg-cyan-500/20 active:bg-cyan-500/40">
          RETURN TO COMMAND LOBBY
        </button>
      </div>
    </div>
  );
}


