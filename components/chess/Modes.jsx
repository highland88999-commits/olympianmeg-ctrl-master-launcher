import { useState } from 'react';
import { AresButton, AresIcon, ARES } from '@/components/ares/ares-chrome';

export default function Modes({ onSelectMode }) {
  const [roomInput, setRoomInput] = useState('');

  return (
    <div className="absolute z-20 flex items-center justify-center w-full h-full overflow-hidden">
      {/* ARES interior art behind the command lobby */}
      <img
        src="/images/chess/chess-bg.webp"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.9) 100%)' }}
      />
      <div className="relative flex flex-col items-center gap-8 p-10 bg-zinc-950/90 border border-fuchsia-500/40 rounded-xl shadow-[0_0_40px_rgba(255,0,255,0.15)] w-[450px] max-w-[95vw] overflow-hidden">
        {/* ARES panel texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url('${ARES.panelTile}')`,
            backgroundSize: '512px 512px',
            opacity: 0.25,
          }}
        />
        <div className="relative text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center" style={{ color: ARES.goldSoft }}>
            <AresIcon name="crown" className="h-10 w-10" />
          </div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-fuchsia-500 tracking-[0.2em] mb-2 uppercase">COMMAND LOBBY</h1>
          <p className="text-xs tracking-widest text-cyan-500/70 uppercase">Choose Combat Mode</p>
        </div>
        <div className="relative flex flex-col w-full gap-4">
          <AresButton icon="home" tone="ghost" onClick={() => onSelectMode('local')} className="w-full">Play Local Offline</AresButton>
          <AresButton icon="robot" tone="gold" onClick={() => onSelectMode('ai')} className="w-full">Play vs Quantum AI</AresButton>
          <AresButton icon="users" tone="crimson" onClick={() => onSelectMode('oasis')} className="w-full">Oasis — NPCs, Bosses & Rooms</AresButton>
          <div className="flex items-center gap-4 my-2 opacity-50"><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /><span className="font-mono text-xs text-white">OR</span><div className="flex-1 h-px bg-gradient-to-r from-transparent via-white to-transparent" /></div>
          <AresButton icon="flag" tone="crimson" onClick={() => onSelectMode('host')} className="w-full">Host Multiplayer Sector</AresButton>
          <div className="flex gap-2">
            <input type="text" placeholder="ENTER 6-CHARACTER CODE" maxLength={6} value={roomInput} onChange={(e) => setRoomInput(e.target.value.toUpperCase())} className="w-full px-4 py-3 font-mono text-center text-white uppercase transition-all bg-black border outline-none border-zinc-700 focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(0,242,255,0.2)] placeholder:text-zinc-600" />
            <AresButton icon="check" tone="ghost" onClick={() => onSelectMode('join', roomInput)} disabled={roomInput.length !== 6}>JOIN</AresButton>
          </div>
        </div>
      </div>
    </div>
  );
}
