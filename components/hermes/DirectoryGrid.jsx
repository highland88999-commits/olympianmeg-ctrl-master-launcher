// components/hermes/DirectoryGrid.jsx
// Category tabs + approved listing cards. External links are plainly labeled.
'use client';

import React, { useState } from 'react';
import { CATEGORIES } from '@/lib/hermes/listings.js';

export default function DirectoryGrid({ links }) {
  const [activeCategory, setActiveCategory] = useState('all');

  const present = [...new Set(links.map((l) => l.category))].filter(Boolean);
  const tabs = ['all', ...present];
  const filtered = activeCategory === 'all' ? links : links.filter((l) => l.category === activeCategory);

  return (
    <div className="w-full">
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-zinc-800">
        {tabs.map((slug) => (
          <button
            key={slug}
            onClick={() => setActiveCategory(slug)}
            className={`whitespace-nowrap px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeCategory === slug
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {slug === 'all' ? 'All' : (CATEGORIES[slug] || slug)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-zinc-500 py-16">
          No listings here yet. Be the first — submit yours below.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col p-5 bg-zinc-950/80 border border-zinc-800 rounded-xl hover:border-amber-500/60 transition-colors group"
            >
              <span className="text-[10px] uppercase tracking-widest text-amber-500/80 mb-2">
                {CATEGORIES[link.category] || link.category}
              </span>
              <h3 className="text-base font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">
                {link.name}
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-1 truncate">{link.root_domain}</p>
              <span className="mt-3 text-xs text-zinc-400 group-hover:text-zinc-200">
                Visit site <span aria-hidden="true">↗</span>
                <span className="sr-only">(opens in a new tab)</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
