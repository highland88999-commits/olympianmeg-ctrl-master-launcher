import { useState, useEffect } from 'react';

export default function HUD({ user, sectorId, gameMode, gameStatus, currentTurn, playerColor, isCheck, onResign, opponentName }) {
  const isYourTurn = currentTurn === playerColor;
  const [copied, setCopied] = useState(false);
  const [isNetworkOpen, setIsNetworkOpen] = useState(true);

  useEffect(() => { if (gameStatus === 'active') setIsNetworkOpen(false); }, [gameStatus]);

  const handleCopy = () => { navigator.clipboard.writeText(sectorId); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleShare = async () => {
    // Share links stay inside the master launcher (current origin), never a
    // hardcoded standalone deployment.
    const shareUrl = `${window.location.origin}/chess?code=${sectorId}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Quantum Chess', text: `Join my orbital combat sector! Code: ${sectorId}`, url: shareUrl }); } catch (err) { console.log('Share canceled or failed.', err); }
    } else {
      navigator.clipboard.writeText(shareUrl); alert('Direct join link copied to clipboard!');
    }
  };

  const confirmResign = () => { if (window.confirm("Are you sure you want to resign? This will instantly grant your opponent the victory.")) onResign(); };

  return (
    <div className="absolute top-0 left-0 z-10 flex flex-col justify-between w-full h-full p-4 pointer-events-none sm:p-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="w-full sm:w-auto bg-zinc-950/90 border border-cyan-500/30 p-4 sm:p-5 rounded-lg backdrop-blur-md shadow-[0_0_20px_rgba(0,255,255,0.1)] min-w-[280px]">
          <div className="flex flex-col gap-2 sm:gap-3">
            <h2 className="text-xs tracking-widest text-cyan-400 uppercase sm:text-sm">Quantum Combat Grid</h2>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full shadow-[0_0_10px] ${isYourTurn && gameStatus !== 'waiting' ? 'bg-cyan-400 shadow-cyan-400' : 'bg-fuchsia-500 shadow-fuchsia-500'} animate-pulse`} />
              <span className="text-lg font-bold tracking-wider text-white uppercase sm:text-xl">
                {gameMode === 'global' && gameStatus === 'waiting' ? <span className="text-fuchsia-400 animate-pulse">Awaiting Opponent...</span> : isCheck ? <span className="text-red-500">CHECK WARNING — {currentTurn}</span> : isYourTurn ? 'Your Turn' : opponentName ? `VS ${opponentName}` : 'Enemy Calculating...'}
              </span>
            </div>
          </div>
        </div>
        {gameMode === 'global' && sectorId && (
          <div className="flex flex-col pointer-events-auto">
            {isNetworkOpen ? (
              <div className="flex flex-col gap-3 p-4 border rounded-lg sm:p-5 bg-zinc-950/90 border-fuchsia-500/30 backdrop-blur-md shadow-[0_0_20px_rgba(255,0,255,0.1)] transition-all">
                <div className="flex items-center justify-between"><h2 className="text-xs tracking-widest uppercase text-fuchsia-400 sm:text-sm">Sector Uplink Code</h2><button onClick={() => setIsNetworkOpen(false)} className="text-xs font-bold text-zinc-500 hover:text-white">[ HIDE ]</button></div>
                <div className="flex items-center gap-2">
                  <div className="px-4 py-2 font-mono text-xl font-bold tracking-[0.2em] text-white bg-black/50 border border-fuchsia-500/50 rounded">{sectorId}</div>
                  <button onClick={handleCopy} className="px-3 py-2 text-xs font-bold tracking-widest text-fuchsia-400 uppercase transition-colors border rounded border-fuchsia-500/50 hover:bg-fuchsia-500/20 active:bg-fuchsia-500/40">{copied ? 'COPIED' : 'COPY'}</button>
                  <button onClick={handleShare} className="px-3 py-2 text-xs font-bold tracking-widest text-cyan-400 uppercase transition-colors border rounded border-cyan-500/50 hover:bg-cyan-500/20 active:bg-cyan-500/40">SHARE</button>
                </div>
              </div>
            ) : <button onClick={() => setIsNetworkOpen(true)} className="px-4 py-2 text-xs font-bold tracking-widest text-fuchsia-400 uppercase transition-colors border rounded bg-zinc-950/90 border-fuchsia-500/50 hover:bg-fuchsia-500/20 shadow-[0_0_15px_rgba(255,0,255,0.15)]">+ VIEW UPLINK CODE</button>}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between pb-4 pointer-events-auto sm:pb-0 sm:self-start w-full sm:w-auto sm:gap-4">
         <div className="px-6 py-3 text-xs font-bold tracking-widest uppercase border rounded text-zinc-400 bg-black/80 border-zinc-700">OPERATOR: <span className="text-cyan-400">{user}</span></div>
         {gameStatus === 'active' && <button onClick={confirmResign} className="px-6 py-3 text-xs font-bold tracking-widest uppercase border rounded text-red-500 border-red-500/50 bg-red-950/40 hover:bg-red-500/20 transition-all">RESIGN</button>}
      </div>
    </div>
  );
}


