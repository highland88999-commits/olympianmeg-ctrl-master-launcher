// World Engine — shared builder-sector UI.
//
// The original repo had seven near-identical forge pages (architect,
// characters, weapons, vehicles, weather, objects, uplink), each with its own
// copy of the synthesis handler. This component holds the shared logic;
// each page only supplies its configuration.
//
// Fixes vs the original:
// - Sends the session access token as a Bearer header (the original never
//   sent Authorization, so every synthesis failed with 401).
// - Saves to the scoped `world_engine_assets` table (the original used a
//   `nexus_assets` table that does not exist in the launcher).
// - Cost is shown up front from the shared cost map.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useEngineStore } from '@/lib/world-engine/useEngineStore';
import { costFor } from '@/lib/world-engine/economy';
import MiniViewport from '@/components/world-engine/MiniViewport';
import ResourceToolkit from '@/components/world-engine/ResourceToolkit';

export default function ForgeSector({ config }) {
  const { sectorName, tagline, category, accent, sliders, showAssetUrl, promptLabel, promptPlaceholder } = config;

  const [prompt, setPrompt] = useState('');
  const [assetUrl, setAssetUrl] = useState('');
  const [creationName, setCreationName] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [savedName, setSavedName] = useState(null);

  const applyParams = useEngineStore((s) => s.applySynthesizedParams);
  const params = useEngineStore((s) => s[config.storeKey]);
  const setParams = useEngineStore((s) => s[config.storeSetter]);

  const handleSynthesis = async () => {
    if (!prompt && !assetUrl) {
      setNotice('Describe what you want to build, or paste an asset URL first.');
      return;
    }
    setIsSynthesizing(true);
    setNotice(null);
    setSavedName(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNotice('Sign in from the launcher to use AI synthesis and save your work.');
        return;
      }

      const res = await fetch('/api/world-engine/synthesize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt, targetUrl: assetUrl || undefined, category }),
      });
      const aiData = await res.json();
      if (!aiData.success) throw new Error(aiData.error || 'Synthesis failed.');

      applyParams(category, aiData.parameters);

      const chosenName = creationName.trim().slice(0, 60);
      const displayName = chosenName || `${sectorName} creation`;
      const { error } = await supabase.from('world_engine_assets').insert([
        {
          user_id: session.user.id,
          name: chosenName || `${sectorName} generation`,
          display_name: displayName,
          category,
          asset_url: assetUrl || 'procedural_generation',
          generation_params: aiData.parameters,
          prompt: prompt.trim().slice(0, 2000) || null,
        },
      ]);
      if (error) throw error;

      setSavedName(displayName);

      const billing = aiData.billing || {};
      setNotice(
        billing.paymentType === 'free_tier'
          ? `Done — used one of your free monthly generations (${billing.freeGenerationsRemaining} left).`
          : `Done — ${billing.cost} Aether used (${billing.tokensRemaining} remaining).`
      );
      setPrompt('');
      setAssetUrl('');
      setCreationName('');
    } catch (err) {
      console.error(err);
      setNotice(err.message || 'Synthesis failed. Please try again.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const getNested = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

  return (
    <main className="min-h-dvh bg-black text-white p-6 md:p-8 pb-24 font-mono">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <header className="border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4" style={{ borderColor: accent }}>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-widest" style={{ color: accent }}>
              {sectorName}
            </h1>
            <p className="text-xs text-gray-400 mt-1">{tagline}</p>
          </div>
          <Link
            href="/world-engine/dashboard"
            className="border border-gray-700 bg-black/50 hover:text-white transition-all px-4 py-2 text-xs font-bold tracking-wider"
            style={{ '--tw': 1 }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = accent)}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = '')}
          >
            &larr; Back to dashboard
          </Link>
        </header>

        {notice && (
          <div className="border p-3 rounded text-sm" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}11`, color: '#e5e5e5' }}>
            {notice}
          </div>
        )}

        {savedName && (
          <div className="border p-3 rounded text-sm flex items-center justify-between gap-3" style={{ borderColor: `${accent}55`, backgroundColor: `${accent}11`, color: '#e5e5e5' }}>
            <span>&ldquo;{savedName}&rdquo; saved to your profile.</span>
            <Link href="/profile" className="shrink-0 font-bold underline underline-offset-2 hover:opacity-80" style={{ color: accent }}>
              View your creations
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex flex-col gap-6 border border-gray-800 bg-black/80 p-6">
            <h2 className="text-sm font-bold tracking-widest border-b border-gray-800 pb-2" style={{ color: accent }}>
              Build settings
            </h2>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest">Name your creation</label>
              <input
                type="text"
                value={creationName}
                onChange={(e) => setCreationName(e.target.value.slice(0, 60))}
                placeholder={`e.g. My ${sectorName.toLowerCase()} design`}
                maxLength={60}
                className="w-full bg-gray-950 border border-gray-800 p-3 text-sm text-gray-300 outline-none transition-colors"
                style={{ caretColor: accent }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest">{promptLabel}</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={promptPlaceholder}
                className="h-24 w-full bg-gray-950 border border-gray-800 p-3 text-sm text-gray-300 outline-none transition-colors resize-none"
                style={{ caretColor: accent }}
              />
            </div>

            {showAssetUrl && (
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest">Asset URL (optional)</label>
                <input
                  type="url"
                  value={assetUrl}
                  onChange={(e) => setAssetUrl(e.target.value)}
                  placeholder="Paste a .glb URL"
                  className="w-full bg-gray-950 border border-gray-800 p-3 text-sm text-gray-300 outline-none transition-colors"
                />
              </div>
            )}

            {sliders && sliders.length > 0 && (
              <div className="pt-4 border-t border-gray-800 grid grid-cols-2 gap-4">
                {sliders.map((sl) => {
                  const raw = getNested(params, sl.key);
                  const value = raw === undefined ? sl.default : raw;
                  return (
                    <div key={sl.key} className="flex flex-col gap-2">
                      <label className="text-[10px] text-gray-500 uppercase tracking-widest">{sl.label}</label>
                      <input
                        type="range"
                        min={sl.min}
                        max={sl.max}
                        step={sl.step}
                        value={sl.display ? sl.display(value) : value}
                        onChange={(e) => setParams({ [sl.key]: sl.parse(e.target.value) })}
                        className="w-full"
                        style={{ accentColor: accent }}
                      />
                      <span className="text-xs" style={{ color: accent }}>
                        {sl.format ? sl.format(value) : value}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-gray-500">
              AI generation costs {costFor(category)} Aether (or one of your 20 free monthly generations). Manual slider
              changes are free and never leave your browser.
            </p>

            <button
              onClick={handleSynthesis}
              disabled={isSynthesizing}
              className="mt-2 w-full border bg-white/5 hover:text-black transition-all py-3 text-sm font-bold tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: accent, color: accent }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = accent; e.currentTarget.style.color = '#000'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = ''; e.currentTarget.style.color = accent; }}
            >
              {isSynthesizing ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>

          <div className="flex flex-col border border-gray-800 bg-gray-950 flex-1 min-h-[400px] relative items-center justify-center overflow-hidden">
            <div className="absolute top-4 left-4 text-[10px] tracking-widest z-10 bg-black/50 px-2 py-1 border backdrop-blur-sm" style={{ color: accent, borderColor: `${accent}44` }}>
              <span className="mr-2 inline-block h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
              Live preview
            </div>
            <MiniViewport category={category} params={params} />
          </div>
        </div>

        <ResourceToolkit />
      </div>
    </main>
  );
}
