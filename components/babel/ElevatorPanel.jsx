'use client';
import { useEffect, useState } from 'react';
import AphroIcon from '@/components/aphrodite/icons';
import { aphroPanel } from '@/components/aphrodite/ambience';

// BABEL elevator menu — collapsible. Expanded: the full floor grid.
// Collapsed: a single floating icon button, bottom-left, out of the way so
// the tower can be explored with zero menu chrome blocking the view.
// The collapsed/expanded preference persists in localStorage.
// `reduced` (prefers-reduced-motion) → instant toggle, no animation.
const STORE_KEY = 'babel-elevator-collapsed';

// APHRODITE icon per floor id.
const FLOOR_ICONS = {
  vault: 'layers',
  sylva: 'orbit',
  duat: 'flame',
  avalon: 'globe',
  hermes: 'bolt',
  aquarium: 'eye',
};

export default function ElevatorPanel({ floors, onSelect, reduced }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORE_KEY) === '1');
    } catch {
      // private mode — default to expanded
    }
    setReady(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORE_KEY, next ? '1' : '0');
      } catch {
        // private mode — session-only toggle
      }
      return next;
    });
  };

  // Wait for the stored preference so the first paint matches it.
  if (!ready) return null;

  if (collapsed) {
    return (
      <button
        data-ui
        onClick={toggle}
        aria-label="Open elevator menu"
        title="Elevator"
        className="absolute left-4 sm:left-6 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 w-[52px] h-[52px] rounded-full border border-amber-500/40 bg-black/60 backdrop-blur-md text-amber-200 flex items-center justify-center hover:bg-amber-500/20 active:scale-95"
        style={reduced ? undefined : { transition: 'transform 160ms ease, background-color 160ms ease' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v18" />
          <path d="m7 8 5-5 5 5" />
          <path d="m7 16 5 5 5-5" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <div className="max-w-2xl mx-auto rounded-xl border border-amber-500/25 backdrop-blur-md p-3 sm:p-4 relative"
        style={aphroPanel({ backgroundColor: 'rgba(10,4,8,0.66)' })}>
        <p className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 uppercase mb-2 text-center pr-12">
          Elevator — choose a floor
        </p>
        <button
          data-ui
          onClick={toggle}
          aria-label="Collapse elevator menu"
          title="Collapse"
          className="absolute top-2 right-2 w-[44px] h-[44px] rounded-full border border-amber-500/30 text-amber-200/80 flex items-center justify-center hover:bg-amber-500/20 active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="min-h-[52px] px-3 py-2 rounded-lg border text-left transition-all hover:scale-[1.02]"
              style={{ borderColor: `${f.accent}55`, background: `${f.accent}14` }}
            >
              <span className="flex items-center gap-2 text-sm font-black tracking-widest uppercase" style={{ color: f.accent }}>
                <AphroIcon name={FLOOR_ICONS[f.id] || 'layers'} size={16} />
                {f.name}
              </span>
              <span className="block text-[10px] text-zinc-400 mt-0.5">{f.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
