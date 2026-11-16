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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useEngineStore } from '@/lib/world-engine/useEngineStore';
import { updateBackpack } from '@/lib/backpack/store';
import { costFor } from '@/lib/world-engine/economy';
import { executeForgeSynthesis, mintForgeWeapon } from '@/lib/world-engine/forge-agent';
import { mintWorldSeed, readSeed, stampSeed } from '@/lib/world-engine/world-seed';
import MiniViewport from '@/components/world-engine/MiniViewport';
import ResourceToolkit from '@/components/world-engine/ResourceToolkit';
import MuseEngineChat from '@/components/muse/MuseEngineChat';

export default function ForgeSector({ config }) {
  const { sectorName, tagline, category, accent, sliders, showAssetUrl, promptLabel, promptPlaceholder, presets, creaturePresets } = config;

  const [prompt, setPrompt] = useState('');
  // The pasted URL also lives in the store (assetLink.url — the slice
  // is persisted) so the live preview can load it without a synthesis
  // round-trip; the field rehydrates from the store on reload.
  const [assetUrl, setAssetUrl] = useState(() => useEngineStore.getState()[config.storeKey]?.url || '');
  const [creationName, setCreationName] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [savedName, setSavedName] = useState(null);

  const applyParams = useEngineStore((s) => s.applySynthesizedParams);
  const params = useEngineStore((s) => s[config.storeKey]);
  const setParams = useEngineStore((s) => s[config.storeSetter]);
  const setCreatureParams = useEngineStore((s) => s.setCreatureParams);

  // Saved creations for this category (world_engine_assets — the same
  // table the synthesis handler saves to). null = not loaded yet.
  const [savedItems, setSavedItems] = useState(null);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedSignedOut, setSavedSignedOut] = useState(false);

  const savedLabel =
    { world: 'worlds', character: 'characters', weapon: 'weapons', vehicle: 'vehicles', weather: 'weather', object: 'objects', asset_link: 'linked assets' }[category] || category;

  const loadSaved = async () => {
    setSavedLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSavedSignedOut(true);
        setSavedItems([]);
        return;
      }
      setSavedSignedOut(false);
      const { data, error } = await supabase
        .from('world_engine_assets')
        .select('id, display_name, name, asset_url, generation_params, prompt, created_at')
        .eq('user_id', session.user.id)
        .eq('category', category)
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      setSavedItems(data || []);
    } catch (err) {
      console.error('Failed to load saved creations:', err);
      setSavedItems([]);
    } finally {
      setSavedLoading(false);
    }
  };

  useEffect(() => { loadSaved(); }, [category]);

  // Presets are free: they only set the sliders (and, for weapons, the
  // prompt/name fields) — nothing is charged and nothing is saved until
  // the user generates. The live preview updates because the store does.
  const applyPreset = (preset) => {
    if (!preset) return;
    if (preset.params) setParams(preset.params);
    if (preset.promptText) setPrompt(preset.promptText);
    if (preset.nameText) setCreationName(preset.nameText);
    if (preset.assetUrlText) setAssetUrl(preset.assetUrlText);
    setNotice(`Started from “${preset.name}” — free: presets only set the sliders, nothing is charged or saved until you generate.`);
  };

  // Creature presets target the store's separate creature slice; the
  // preview in this builder stays the humanoid capsule — creatures
  // render in worlds, not here.
  const applyCreaturePreset = (preset) => {
    if (!preset) return;
    if (preset.params) setCreatureParams(preset.params);
    setNotice(`Started from creature “${preset.name}” — free, set on the creature slice. The preview here stays the humanoid capsule; creatures render in worlds.`);
  };

  // Loading a saved creation puts its stored params back into the
  // builder (prompt, URL and name too) — tweak it and generate to save
  // a new copy; the original row is never overwritten.
  const loadSavedItem = (row) => {
    if (row.generation_params && typeof row.generation_params === 'object') applyParams(category, row.generation_params);
    if (row.prompt) setPrompt(row.prompt);
    if (row.asset_url && row.asset_url !== 'procedural_generation') setAssetUrl(row.asset_url);
    if (row.display_name) setCreationName(row.display_name);
    setNotice(`Loaded “${row.display_name || 'saved creation'}” — tweak it and generate to save a new copy.`);
  };

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

      // The forge agent is the one handler for forge prompts: the
      // synthesis call goes through it (billing stays server-side
      // — 20 free monthly generations, then the cost map — resolved
      // BEFORE the AI call, deducted only AFTER success).
      const aiData = await executeForgeSynthesis({
        prompt,
        assetUrl,
        category,
        fetchImpl: fetch,
        getAuthHeaders: async () => ({ Authorization: `Bearer ${session.access_token}` }),
      });
      if (!aiData.ok) throw new Error(aiData.error || 'Synthesis failed.');

      // Worlds are born with a seed (lib/world-engine/world-seed.js):
      // minted here when the synthesis did not carry one. stampSeed only
      // fills fields the AI left out — the forged look stays the AI's;
      // the seed becomes the world's identity and its re-derivation key.
      let finalParams = aiData.parameters;
      if (category === 'world' && !readSeed(finalParams)) {
        finalParams = stampSeed(finalParams, mintWorldSeed());
      }

      applyParams(category, finalParams);

      const chosenName = creationName.trim().slice(0, 60);
      const displayName = chosenName || `${sectorName} creation`;
      const { error } = await supabase.from('world_engine_assets').insert([
        {
          user_id: session.user.id,
          name: chosenName || `${sectorName} generation`,
          display_name: displayName,
          category,
          asset_url: assetUrl || 'procedural_generation',
          generation_params: finalParams,
          prompt: prompt.trim().slice(0, 2000) || null,
        },
      ]);
      if (error) throw error;

      setSavedName(displayName);
      loadSaved();

      // WEAPONS LIVE IN THE BACKPACK (Merlin, 2026-10-24): a
      // weapon created here mints a backpack weapon entry at the
      // moment its generation completes — the same record the
      // profile and the realm panels read. Gated to the weapon
      // sector only; other sectors never touch the pack. The mint
      // goes through the forge agent (mintForgeWeapon): the
      // builder makes firearms (rifle/smg/precision are all the
      // backpack law's 'firearm' class); its Damage slider runs
      // 1–100 AP, clamped into the backpack's [5, 40] damage
      // band, and left unset when it carries no usable rating
      // so the realms' native-damage fallback applies. A mint
      // failure never breaks a paid generation — it is caught
      // and the creation still stands, without the pack note.
      let mintedToBackpack = false;
      if (category === 'weapon') {
        try {
          const fresh = useEngineStore.getState().weapon || {};
          let mintOk = false;
          updateBackpack((rec) => {
            const result = mintForgeWeapon(rec, {
              name: displayName,
              description: prompt.trim().slice(0, 2000),
              assetUrl: assetUrl || '',
              length: fresh.length,
              damage: fresh.damage,
              weaponType: typeof finalParams.weaponType === 'string' ? finalParams.weaponType : undefined,
            });
            mintOk = result.ok;
            return result.record;
          });
          mintedToBackpack = mintOk;
        } catch (mintErr) {
          console.error('Backpack mint failed for a weapon-builder creation:', mintErr);
        }
      }

      const billing = aiData.billing || {};
      setNotice(
        (billing.paymentType === 'free_tier'
          ? `Done — used one of your free monthly generations (${billing.freeGenerationsRemaining} left).`
          : `Done — ${billing.cost} Aether used (${billing.tokensRemaining} remaining).`)
        + (mintedToBackpack ? ' Added to your backpack 🎒.' : '')
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
                  onChange={(e) => {
                    const next = e.target.value;
                    setAssetUrl(next);
                    // Uplink preview wiring (GAP 4): MiniViewport reads
                    // the store slice, so the pasted URL has to reach
                    // the store to preview — no synthesis round-trip.
                    // Other sectors keep the URL local-only (their
                    // previews do not load it).
                    if (category === 'asset_link') setParams({ url: next });
                  }}
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

            {presets && presets.length > 0 && (
              <div className="pt-4 border-t border-gray-800 flex flex-col gap-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Start from a preset — free</span>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      title={preset.description}
                      className="border border-gray-700 bg-black/50 hover:text-white transition-all px-3 py-2 text-xs font-bold tracking-wide"
                      style={{ color: accent }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">
                  Presets only set the sliders — nothing is charged and nothing is saved until you generate.
                </p>
                {category === 'asset_link' && (
                  <p className="text-[11px] text-gray-500">
                    Preset URLs are example shapes, not real assets — paste your real .glb URL before generating.
                  </p>
                )}
              </div>
            )}

            {creaturePresets && creaturePresets.length > 0 && (
              <div className="pt-4 border-t border-gray-800 flex flex-col gap-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest">Start from a creature — free</span>
                <div className="flex flex-wrap gap-2">
                  {creaturePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyCreaturePreset(preset)}
                      title={preset.description}
                      className="border border-gray-700 bg-black/50 hover:text-white transition-all px-3 py-2 text-xs font-bold tracking-wide"
                      style={{ color: accent }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500">
                  Creatures live in the creature slice and render in worlds — the preview here stays the humanoid capsule.
                </p>
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

        <div className="border border-gray-800 bg-black/80 p-6 flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-widest border-b border-gray-800 pb-2" style={{ color: accent }}>
            Your saved {savedLabel}
          </h2>
          {savedSignedOut ? (
            <p className="text-xs text-gray-400">Sign in from the launcher to see your saved creations.</p>
          ) : savedLoading && savedItems === null ? (
            <p className="text-xs text-gray-400">Loading your saved {savedLabel}…</p>
          ) : savedItems && savedItems.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {savedItems.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 border border-gray-800 bg-black/50 px-3 py-2">
                  <span className="text-xs text-gray-300 truncate">
                    {row.display_name || row.name || 'Unnamed creation'}
                    {row.created_at && (
                      <span className="text-gray-500"> — {new Date(row.created_at).toLocaleDateString()}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadSavedItem(row)}
                    className="shrink-0 border border-gray-700 bg-black/50 hover:text-white transition-all px-3 py-1 text-xs font-bold tracking-wide"
                    style={{ color: accent }}
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">
              No saved {savedLabel} yet — generate one above and it will appear here.
            </p>
          )}
        </div>

        <ResourceToolkit />
      </div>
      {/* Muse lives inside the engine — contextual build help */}
      <MuseEngineChat
        engine="world-engine"
        title={sectorName}
        context={{ category, params, prompt: prompt.slice(0, 500) }}
        accent={accent}
      />
    </main>
  );
}
