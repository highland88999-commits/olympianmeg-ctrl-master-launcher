// World Engine — NeuralBackpack: the user's saved generations.
//
// Reads the scoped `world_engine_assets` table (the original pointed at an
// `inventory` table and silently fell back to fake mock items; the mocks are
// gone — an empty library now says so honestly). "Load into engine" applies
// the saved parameters back into the shared store.
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useEngineStore } from '@/lib/world-engine/useEngineStore';

const CATEGORY_LABELS = {
  world: 'World',
  weather: 'Weather',
  character: 'Character',
  vehicle: 'Vehicle',
  object: 'Object',
  weapon: 'Weapon',
  asset_link: 'Asset link',
};

export default function NeuralBackpack() {
  const [isOpen, setIsOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const applyParams = useEngineStore((s) => s.applySynthesizedParams);
  const setActiveModule = useEngineStore((s) => s.setActiveModule);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'i' || e.key === 'Tab') {
        if (e.key === 'Tab') e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && !loaded) fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('world_engine_assets')
        .select('id, name, category, asset_url, generation_params, created_at')
        .order('created_at', { ascending: false })
        .limit(60);
      if (!error && data) setAssets(data);
    } catch (err) {
      console.error('Backpack sync failed:', err);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  };

  const injectToWorld = (asset) => {
    if (asset.generation_params) applyParams(asset.category, asset.generation_params);
    setActiveModule(asset.category);
    setIsOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto border border-[#00ffcc] bg-black/80 p-3 text-xs font-mono text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black transition-all z-40 relative"
      >
        {isOpen ? 'CLOSE LIBRARY [ TAB ]' : 'MY LIBRARY [ TAB ]'}
      </button>

      <div
        className={`pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`relative flex h-[80vh] w-[90vw] max-w-5xl flex-col border border-gray-700 bg-gray-950 p-6 shadow-2xl transition-transform duration-300 ${
            isOpen ? 'scale-100' : 'scale-95'
          }`}
        >
          <div className="mb-6 flex items-center justify-between border-b border-gray-800 pb-4">
            <h2 className="font-mono text-2xl text-[#00ffcc] tracking-widest">SAVED GENERATIONS</h2>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-[#00ffcc] text-2xl" aria-label="Close">
              &times;
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {loading ? (
              <div className="flex h-full items-center justify-center font-mono text-[#00ffcc] animate-pulse">
                SYNCING...
              </div>
            ) : assets.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="font-mono text-sm text-gray-400 tracking-widest">Your library is empty.</p>
                <p className="text-xs text-gray-600 max-w-sm">
                  Generate something in any builder and it will be saved here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {assets.map((item) => (
                  <div
                    key={item.id}
                    className="group flex flex-col justify-between border border-gray-800 bg-black p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#00ffcc] relative"
                  >
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <h3 className="font-mono text-sm font-bold text-white group-hover:text-[#00ffcc] transition-colors truncate">
                          {item.name}
                        </h3>
                        <span className="text-[10px] uppercase border border-gray-700 px-1.5 py-0.5 text-gray-400 shrink-0">
                          {CATEGORY_LABELS[item.category] || item.category}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-gray-500 mb-4">
                        {new Date(item.created_at).toLocaleDateString()} · {item.asset_url === 'procedural_generation' ? 'AI generated' : 'Linked asset'}
                      </p>
                    </div>
                    <button
                      onClick={() => injectToWorld(item)}
                      className="mt-auto w-full border border-gray-700 bg-transparent py-2 font-mono text-xs text-gray-300 transition-all hover:border-[#00ffcc] hover:bg-[#00ffcc] hover:text-black hover:font-bold"
                    >
                      LOAD INTO ENGINE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
