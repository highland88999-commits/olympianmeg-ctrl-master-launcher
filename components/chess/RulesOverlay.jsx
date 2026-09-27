import { useState } from 'react';

export default function RulesOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="absolute top-5 left-5 z-20 px-4 py-2 text-xs font-bold tracking-widest text-zinc-400 transition-all border rounded bg-black/80 border-zinc-700 hover:text-cyan-400 hover:border-cyan-400 uppercase">
        Combat Directives (Rules)
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] gap-6 p-8 overflow-y-auto bg-zinc-950/90 border border-fuchsia-500/40 rounded-xl shadow-[0_0_40px_rgba(255,0,255,0.1)] custom-scrollbar">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-black text-transparent uppercase bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 tracking-widest">OFFICIAL COMBAT DIRECTIVES</h1>
          <button onClick={() => setIsOpen(false)} className="text-xs font-bold tracking-widest text-zinc-400 hover:text-white uppercase transition-all">← Close Directives</button>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm tracking-widest text-cyan-400 uppercase">Board Setup & Objective</h2>
          <ul className="text-sm text-zinc-300 space-y-2 list-disc pl-4">
            <li><strong className="text-white">The Goal:</strong> Checkmate the opponent's king.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}


