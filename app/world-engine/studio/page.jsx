// World Engine — Hologram Studio.
//
// Design glowing text holograms, preview them live, and export the schema as
// JSON (or save it to your library). Plain-English labels; the bloom slider
// is capped so previews stay readable (lighting rule).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
// Design values live in the Hologram Studio datasheet
// (lib/world-engine/datasheets/studio.js) — the single source of truth.
import {
  STUDIO_DEFAULTS,
  STUDIO_SLIDERS,
  STUDIO_LIMITS,
  STUDIO_SAVE_RULES,
  buildHologramSchema,
  hologramPreviewStyle,
} from '@/lib/world-engine/datasheets/studio';

export default function StudioPage() {
  const [text, setText] = useState(STUDIO_DEFAULTS.text);
  const [color, setColor] = useState(STUDIO_DEFAULTS.color);
  const [scale, setScale] = useState(STUDIO_DEFAULTS.scale);
  const [glowIntensity, setGlowIntensity] = useState(STUDIO_DEFAULTS.glowIntensity);
  const [rotationX, setRotationX] = useState(STUDIO_DEFAULTS.rotationX);
  const [rotationY, setRotationY] = useState(STUDIO_DEFAULTS.rotationY);
  const [notice, setNotice] = useState(null);

  const exportSchema = JSON.stringify(
    buildHologramSchema({ text, color, scale, glowIntensity, rotationX, rotationY }),
    null,
    2
  );

  // Live CSS approximation for the 2D preview. Glow is deliberately capped.
  const previewStyle = {
    ...hologramPreviewStyle({ text, color, scale, glowIntensity, rotationX, rotationY }),
    transition: 'all 0.1s ease-out',
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportSchema);
      setNotice('Schema copied to your clipboard.');
    } catch {
      setNotice('Copy failed — select the schema text manually.');
    }
  };

  const saveToLibrary = async () => {
    setNotice(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setNotice(STUDIO_SAVE_RULES.signInNotice);
      return;
    }
    const { error } = await supabase.from(STUDIO_SAVE_RULES.table).insert([
      {
        user_id: session.user.id,
        name: `${STUDIO_SAVE_RULES.namePrefix}${text.slice(0, STUDIO_SAVE_RULES.nameMaxLength) || 'untitled'}`,
        category: STUDIO_SAVE_RULES.category,
        asset_url: STUDIO_SAVE_RULES.assetUrl,
        generation_params: JSON.parse(exportSchema).parameters,
      },
    ]);
    setNotice(error ? `Save failed: ${error.message}` : 'Saved to your library.');
  };

  return (
    <main className="min-h-dvh bg-black text-white p-8 font-mono">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <header className="border-b border-[#a78bfa] pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#a78bfa] tracking-widest">HOLOGRAM STUDIO</h1>
            <p className="text-xs text-gray-400 mt-1">Design glowing text holograms and export them as 3D-ready schemas.</p>
          </div>
          <Link href="/world-engine/dashboard" className="border border-gray-700 bg-black/50 hover:border-[#a78bfa] hover:text-[#a78bfa] transition-all px-4 py-2 text-xs font-bold tracking-wider">
            &larr; Back to dashboard
          </Link>
        </header>

        {notice && (
          <div className="border border-[#a78bfa]/40 bg-[#a78bfa]/10 p-3 rounded text-sm text-gray-200">{notice}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="flex flex-col gap-6 bg-[#05050a] p-6 rounded-lg border border-gray-800">
            <h2 className="text-xl text-gray-400 border-b border-gray-800 pb-2">Design</h2>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#a78bfa]">Text</label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={STUDIO_LIMITS.maxTextLength}
                className="bg-black border border-gray-700 p-3 text-white outline-none focus:border-[#a78bfa] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#a78bfa]">Glow color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-12 bg-black border border-gray-700 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              {STUDIO_SLIDERS.map((s) => {
                const values = { scale, glowIntensity, rotationX, rotationY };
                const setters = {
                  scale: (v) => setScale(parseFloat(v)),
                  glowIntensity: (v) => setGlowIntensity(parseFloat(v)),
                  rotationX: (v) => setRotationX(parseInt(v, 10)),
                  rotationY: (v) => setRotationY(parseInt(v, 10)),
                };
                const value = values[s.key];
                return (
                  <div key={s.key} className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400">{`${s.label}: ${s.format(value)}`}</label>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={value} onChange={(e) => setters[s.key](e.target.value)} className="w-full accent-[#a78bfa]" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div className="flex-1 bg-black border border-gray-800 rounded-lg p-8 flex items-center justify-center overflow-hidden relative min-h-[280px]" style={{ perspective: '1000px' }}>
              <div className="absolute top-4 left-4 text-xs text-gray-600 tracking-widest">Preview</div>
              <div style={previewStyle}>{text}</div>
            </div>

            <div className="bg-[#020204] border border-gray-800 rounded-lg p-4 relative">
              <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-2">
                <span className="text-xs text-[#a78bfa] tracking-widest">HOLOGRAM SCHEMA</span>
                <div className="flex gap-2">
                  <button onClick={saveToLibrary} className="bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa] px-4 py-1 text-xs font-bold hover:bg-[#a78bfa] hover:text-black transition-colors">
                    Save to library
                  </button>
                  <button onClick={copyToClipboard} className="bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa] px-4 py-1 text-xs font-bold hover:bg-[#a78bfa] hover:text-black transition-colors">
                    Copy schema
                  </button>
                </div>
              </div>
              <pre className="text-[11px] text-gray-400 overflow-x-auto whitespace-pre-wrap p-2">{exportSchema}</pre>
            </div>
          </div>
        </div>
      <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
