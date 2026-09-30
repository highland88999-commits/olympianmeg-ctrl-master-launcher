// World Engine — Hologram Studio.
//
// Design glowing text holograms, preview them live, and export the schema as
// JSON (or save it to your library). Plain-English labels; the bloom slider
// is capped so previews stay readable (lighting rule).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function StudioPage() {
  const [text, setText] = useState('WORLD ENGINE');
  const [color, setColor] = useState('#00ffcc');
  const [scale, setScale] = useState(4);
  const [glowIntensity, setGlowIntensity] = useState(1.5);
  const [rotationX, setRotationX] = useState(0);
  const [rotationY, setRotationY] = useState(0);
  const [notice, setNotice] = useState(null);

  const exportSchema = JSON.stringify(
    {
      assetType: 'HolographicMesh',
      parameters: {
        content: text,
        emissiveColor: color,
        scaleMultiplier: scale,
        bloomIntensity: glowIntensity,
        rotation: { x: rotationX, y: rotationY, z: 0 },
      },
    },
    null,
    2
  );

  // Live CSS approximation for the 2D preview. Glow is deliberately capped.
  const previewStyle = {
    color,
    fontSize: `${scale}rem`,
    textShadow: `0 0 ${Math.min(glowIntensity, 3) * 8}px ${color}`,
    transform: `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    textAlign: 'center',
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
      setNotice('Sign in from the launcher to save to your library.');
      return;
    }
    const { error } = await supabase.from('world_engine_assets').insert([
      {
        user_id: session.user.id,
        name: `Hologram: ${text.slice(0, 40) || 'untitled'}`,
        category: 'object',
        asset_url: 'procedural_generation',
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
                maxLength={60}
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
              {[
                { label: `Size: ${scale}x`, min: 1, max: 10, step: 0.5, value: scale, set: (v) => setScale(parseFloat(v)) },
                { label: `Glow: ${glowIntensity}`, min: 0, max: 3, step: 0.1, value: glowIntensity, set: (v) => setGlowIntensity(parseFloat(v)) },
                { label: `Tilt: ${rotationX}°`, min: -90, max: 90, step: 1, value: rotationX, set: (v) => setRotationX(parseInt(v, 10)) },
                { label: `Turn: ${rotationY}°`, min: -90, max: 90, step: 1, value: rotationY, set: (v) => setRotationY(parseInt(v, 10)) },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400">{s.label}</label>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={(e) => s.set(e.target.value)} className="w-full accent-[#a78bfa]" />
                </div>
              ))}
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
