import { useState } from 'react';

export default function Modes({ onSelectMode }) {
  const [roomInput, setRoomInput] = useState('');

  return (
    <div className="absolute z-20 flex items-center justify-center w-full h-full bg-black/90 backdrop-blur-md">
      <div className="flex flex-col items-center gap-8 p-10 bg-zinc-950 border border-fuchsia-500/40 rounded-xl shadow-[0_0_40px_rgba(255,0,255,0.15)] w-[450px] max-w-[95vw]">
        <div className="text-center">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-fuchsia-500 tracking-[0.2em] mb-2 uppercase">COMMAND LOBBY</h1>
          <p className="text-xs tracking-widest text-cyan-500/70 uppercase">Choose Combat Mode</p>
        </div>
        <div className="flex flex-col w-full gap-4">
          <button onClick={() => onSelectMode('local')} className="w-full px-6 py-4 text-sm font-bold tracking-widest text-cyan-400 uppercase transition-all border border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-900/40 hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]">Play Local Offline</button>
          <button onClick={() => onSelectMode('ai')} className="w-full px-6 py-4 text-sm font-bold tracking-widest text-cyan-400 uppercase transition-all border border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-900/40 hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]">Play vs Quantum AI</button>
          <div className="flex items-center gap-4 my-2 opacity-50"><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /><span className="font-mono text-xs text-white">OR</span><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /></div>
          <button onClick={() => onSelectMode('host')} className="w-full px-6 py-4 text-sm font-bold tracking-widest text-fuchsia-400 uppercase transition-all border border-fuchsia-500/50 bg-fuchsia-950/20 hover:bg-fuchsia-900/40 hover:shadow-[0_0_20px_rgba(255,0,255,0.3)]">Host Multiplayer Sector</button>
          <div className="flex gap-2">
            <input type="text" placeholder="ENTER 5-DIGIT CODE" maxLength={5} value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} className="w-full px-4 py-3 font-mono text-center text-white uppercase transition-all bg-black border outline-none border-zinc-700 focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(0,255,255,0.2)] placeholder:text-zinc-600" />
            <button onClick={() => onSelectMode('join', roomInput)} disabled={roomInput.length !== 5} className="px-6 font-bold tracking-widest text-white transition-all border disabled:opacity-50 disabled:cursor-not-allowed border-zinc-500 hover:bg-white hover:text-black">JOIN</button>
          </div>
        </div>
      </div>
    </div>
  );
}


