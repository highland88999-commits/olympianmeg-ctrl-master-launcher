'use client';

// The Overlook — a viewport over the wall at the crown of the tower.
// This embeds the LIVE aquarium module (/aquarium), not a copy.
export default function AquariumViewport({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm p-3 sm:p-6">
      <div className="flex items-center justify-between mb-2 max-w-5xl w-full mx-auto">
        <div>
          <h2 className="text-sky-300 font-black tracking-widest uppercase text-sm sm:text-base">
            The Overlook
          </h2>
          <p className="text-zinc-400 text-xs mt-0.5">Viewport over the wall — live water</p>
        </div>
        <button
          onClick={onClose}
          className="min-h-[44px] px-5 rounded border border-sky-500/40 text-sky-300 text-sm font-bold tracking-widest uppercase hover:bg-sky-500/20 transition-all"
        >
          Close
        </button>
      </div>
      <div className="flex-1 max-w-5xl w-full mx-auto rounded-lg overflow-hidden border border-sky-500/30 shadow-[0_0_40px_rgba(56,189,248,0.25)]">
        <iframe
          src="/aquarium"
          title="Aquarium"
          className="w-full h-full border-0 bg-black"
          allow="autoplay"
        />
      </div>
    </div>
  );
}
