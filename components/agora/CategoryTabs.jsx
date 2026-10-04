'use client';
// components/agora/CategoryTabs.jsx

import { CATEGORIES } from '@/lib/agora/categories';
import { submenuArtFor } from '@/lib/god-menus';

// Menu Art Transfer batch 2 — submenu art. Background image + dark legibility
// scrim; a missing image hides itself via onError so the tab falls back to
// its plain styled chip. Never breaks the UI.
function SubmenuArt({ slot }) {
  return (
    <>
      <img
        src={submenuArtFor(slot)}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/55" />
    </>
  );
}

export default function CategoryTabs({ active, onChange }) {
  const tabs = [{ id: 'all', name: 'All' }, ...CATEGORIES];
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Categories">
      {tabs.map((t) => {
        const isActive = active === t.id;
        // The 'all' tab has no art slot; the active tab keeps its solid
        // highlight so the selected state stays obvious.
        const artSlot = t.id === 'all' ? null : `submenu-agora-${t.id}`;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`relative min-h-[44px] shrink-0 overflow-hidden rounded-full px-4 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[#3a86ff] text-white'
                : 'bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            {artSlot && !isActive && <SubmenuArt slot={artSlot} />}
            <span className="relative">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
