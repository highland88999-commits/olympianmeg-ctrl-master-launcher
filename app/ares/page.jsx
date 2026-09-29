'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { summarize } from '@/lib/ares/intel';
import ThreatGauge from '@/components/ares/ThreatGauge';
import EventsFeed from '@/components/ares/EventsFeed';
import TopLists from '@/components/ares/TopLists';
import ListsManager from '@/components/ares/ListsManager';
import ModuleToggles from '@/components/ares/ModuleToggles';
import LearningPanel from '@/components/ares/LearningPanel';

export default function AresConsole() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [events, setEvents] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [settings, setSettings] = useState({ sentinelEnabled: true, phalanxEnabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    const init = async () => {
      let auth;
      try {
        auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
      } catch {
        setCloudOffline(true);
        return;
      }
      const { data: { session } } = await auth.getSession();
      if (!session) { router.push('/'); return; }
      setToken(session.access_token);
    };
    init();
  }, [router]);

  const authedFetch = useCallback(async (url, opts = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), authorization: `Bearer ${token}` },
    });
    return res;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ev, bl, wl, st] = await Promise.all([
        authedFetch('/api/ares/events?limit=100').then((r) => r.json()),
        authedFetch('/api/ares/blocks').then((r) => r.json()),
        authedFetch('/api/ares/whitelist').then((r) => r.json()),
        authedFetch('/api/ares/settings').then((r) => r.json()),
      ]);
      setEvents(ev.events || []);
      setBlocks(bl.blocks || []);
      setWhitelist(wl.whitelist || []);
      if (st.settings) setSettings(st.settings);
    } catch { /* keep whatever loaded */ }
    setLoading(false);
  }, [token, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (next) => {
    setSettings(next);
    setSaving(true);
    try {
      await authedFetch('/api/ares/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch { /* UI already reflects the intent; a refresh shows truth */ }
    setSaving(false);
  };

  if (!token) {
    if (cloudOffline) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-black p-8 text-center">
          <p className="max-w-md text-sm text-zinc-400">
            Cloud features are offline — Ares needs the database connection. The watchtower will come back online once it&apos;s connected.
          </p>
        </div>
      );
    }
    return <div className="h-screen w-screen bg-black" />;
  }

  const summary = summarize(events);

  return (
    <main className="min-h-screen w-full bg-[#050505] px-4 py-6 text-zinc-200 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="bg-gradient-to-br from-fuchsia-400 to-red-500 bg-clip-text text-2xl font-black uppercase tracking-[0.2em] text-transparent sm:text-3xl">
              Ares
            </h1>
            <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-zinc-500">
              Autonomous Response and Evidence System
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:border-fuchsia-400 hover:text-fuchsia-300">
              Refresh
            </button>
            <button onClick={() => router.push('/')}
              className="rounded-lg border border-zinc-700 bg-black/80 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:border-fuchsia-400 hover:text-fuchsia-300">
              Exit
            </button>
          </div>
        </header>

        {loading ? (
          <p className="py-16 text-center text-sm uppercase tracking-widest text-zinc-600">Reading the watchtower...</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="md:col-span-3">
                <ThreatGauge level={summary.level} label={summary.label} trend={summary.trend} />
              </div>
              <div className="md:col-span-2">
                <ModuleToggles settings={settings} onChange={saveSettings} disabled={saving} />
              </div>
            </div>
            <TopLists events={events} />
            <EventsFeed events={events} />
            <LearningPanel events={events} authedFetch={authedFetch} />
            <ListsManager authedFetch={authedFetch} whitelist={whitelist} blocks={blocks} onRefresh={load} />
            <footer className="pb-8 pt-2 text-center text-[11px] text-zinc-600">
              Defensive only. Ares logs and blocks; it never retaliates. Evidence older than 90 days is purged.
            </footer>
            <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
          </>
        )}
      </div>
    </main>
  );
}
