// World Engine — settings.
//
// The original page only console.log'd the settings and showed an alert.
// This version actually persists them to `world_engine_settings` (RLS: own
// row only) and loads them on open.
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const DEFAULTS = { quality: 'high', audio_enabled: true, particle_limit: 5000, density_cap: 1.0 };

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('world_engine_settings')
          .select('quality, audio_enabled, particle_limit, density_cap')
          .single();
        if (data) setSettings({ ...DEFAULTS, ...data });
      } catch { /* first run: no row yet */ }
      setLoading(false);
    })();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNotice('Sign in from the launcher to save settings.');
        return;
      }
      const { error } = await supabase.from('world_engine_settings').upsert(
        { user_id: session.user.id, ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      setNotice('Settings saved.');
    } catch (err) {
      setNotice(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  if (loading) {
    return (
      <main className="min-h-dvh bg-black text-white p-8 font-mono flex items-center justify-center">
        <p className="text-[#00f0ff] animate-pulse tracking-widest">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-black text-white p-8 font-mono">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <header className="border-b border-[#00f0ff] pb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#00f0ff] tracking-widest">Settings</h1>
          <Link href="/world-engine/dashboard" className="text-xs text-gray-400 hover:text-[#00ffcc] transition-colors">
            &larr; Back to dashboard
          </Link>
        </header>

        {notice && (
          <div className="border border-[#00f0ff]/40 bg-[#00f0ff]/10 p-3 rounded text-sm text-gray-200">{notice}</div>
        )}

        <div className="flex flex-col gap-6 border border-gray-800 bg-[#05050a] p-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-[#00f0ff] tracking-widest">Render quality</label>
            <p className="text-[10px] text-gray-500 mb-2">Lower this if the 3D engine feels slow on your device.</p>
            <select
              value={settings.quality}
              onChange={(e) => set({ quality: e.target.value })}
              className="bg-black border border-gray-700 text-white p-3 outline-none focus:border-[#00f0ff] transition-colors"
            >
              <option value="low">Performance</option>
              <option value="medium">Balanced</option>
              <option value="high">Cinematic</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-800 pt-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#00f0ff] tracking-widest">Weather particle limit</label>
              <input
                type="range" min={1000} max={20000} step={1000}
                value={settings.particle_limit}
                onChange={(e) => set({ particle_limit: parseInt(e.target.value, 10) })}
                className="w-full accent-[#00f0ff]"
              />
              <span className="text-[10px] text-gray-400">{settings.particle_limit.toLocaleString()} particles</span>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#00f0ff] tracking-widest">Object density cap</label>
              <input
                type="range" min={0.1} max={2} step={0.1}
                value={settings.density_cap}
                onChange={(e) => set({ density_cap: parseFloat(e.target.value) })}
                className="w-full accent-[#00f0ff]"
              />
              <span className="text-[10px] text-gray-400">{Number(settings.density_cap).toFixed(1)}x</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-800 pt-6">
            <span className="text-xs font-bold text-[#00f0ff] tracking-widest">Sound</span>
            <button
              onClick={() => set({ audio_enabled: !settings.audio_enabled })}
              className={`px-6 py-2 border text-xs font-bold transition-all ${
                settings.audio_enabled ? 'border-[#00f0ff] text-[#00f0ff]' : 'border-red-500 text-red-500'
              }`}
            >
              {settings.audio_enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="mt-6 border border-[#00f0ff] bg-[#00f0ff]/10 hover:bg-[#00f0ff] hover:text-black transition-all py-4 text-sm font-bold tracking-widest disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
