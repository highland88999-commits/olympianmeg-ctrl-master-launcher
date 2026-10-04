'use client';
// components/agora/CategoryTabs.jsx

import { CATEGORIES } from '@/lib/agora/categories';

export default function CategoryTabs({ active, onChange }) {
  const tabs = [{ id: 'all', name: 'All' }, ...CATEGORIES];
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Categories">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-rose-400 text-black'
                : 'bg-white/5 text-zinc-300 hover:bg-white/10'
            }`}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
