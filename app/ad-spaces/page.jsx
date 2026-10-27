// app/ad-spaces/page.jsx — the Billboard Manager. MERLIN ONLY.
// Owner-only: the page renders a locked screen unless the queue API
// proves ownership, and every write route is owner-gated server-side.
// NOT seated in the portal registry (owner-only pattern, like /console).
//
// Workflow (staged queue + Send, the Portal Menu Graphics pattern):
// - Top: the fortune-cookie slip — billboard numbers 1–44. Tap a
//   number to edit that billboard.
// - Below: that billboard's editor — rotation interval, its ad
//   entries (each: creative + company name + link), per-entry
//   Replace creative, per-entry Remove, per-entry Add to Queue,
//   and an Add Ad button under the entries.
// - Queue: staged entries (review, remove, clear) and a Send to
//   Muse button. Sending dispatches the queue to the builder; sent
//   entries sit at "Sent to builder — awaiting application" until
//   the builder wires them into the repo manifest and they show as
//   Live here. Queued ads are NEVER live on their own: the hub keeps
//   showing its previous creative until a queue is sent AND wired.
// - Live ads on a billboard can be queued for removal (a removal
//   row the builder applies). To replace a live ad: add its
//   replacement to the queue and queue a removal for the old one —
//   the builder applies both together.
// Drafts persist on this device (localStorage) so a reload never
// eats a half-filled billboard.
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DRAFT_KEY = 'olympus.adSpacesDrafts.v1';
const MANIFEST_URL = '/billboards/manifest.json';

function blankEntry() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    companyName: '',
    linkUrl: '',
    creativeType: null,
    creativeUrl: '',
    uploading: false,
    error: '',
    queued: false,
  };
}

function blankDraft() {
  return { intervalSeconds: 15, entries: [blankEntry()] };
}

function loadDrafts() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function AdSpacesPage() {
  const [gate, setGate] = useState('checking'); // checking | locked | not-ready | open
  const [token, setToken] = useState(null);
  const [rows, setRows] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [selected, setSelected] = useState(1);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const draft = drafts[selected] || blankDraft();

  const saveDrafts = (next) => {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // Private-mode storage failure: drafts still work this session.
    }
  };

  const updateDraft = (mutate) => {
    saveDrafts((prev) => {
      const copy = { ...prev };
      const current = copy[selected] || blankDraft();
      copy[selected] = mutate({ ...current, entries: current.entries.map((e) => ({ ...e })) });
      return copy;
    });
  };

  const refreshQueue = async (authToken) => {
    const res = await fetch('/api/billboards/queue', {
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      setRows(data.rows || []);
      return true;
    }
    if (data?.error === 'not_ready') setGate('not-ready');
    return false;
  };

  const refreshManifest = async () => {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) {
        setManifest(null);
        return;
      }
      setManifest(await res.json());
    } catch {
      setManifest(null);
    }
  };

  useEffect(() => {
    setDrafts(loadDrafts());
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setGate('locked');
          return;
        }
        setToken(session.access_token);
        const res = await fetch('/api/billboards/queue', {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json().catch(() => null);
        if (res.status === 404 || (data && !data.owner)) {
          setGate('locked');
          return;
        }
        if (data?.error === 'not_ready') {
          setGate('not-ready');
          return;
        }
        if (data?.ok) {
          setRows(data.rows || []);
          setGate('open');
          refreshManifest();
        } else {
          setGate('locked');
        }
      } catch {
        setGate('locked');
      }
    })();
  }, []);

  const queueCall = async (action, params = {}) => {
    const res = await fetch('/api/billboards/queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...params }),
    });
    return res.json().catch(() => ({ ok: false, error: 'The queue did not answer.' }));
  };

  const perNumber = useMemo(() => {
    const map = {};
    for (let n = 1; n <= 44; n++) map[n] = { live: 0, staged: 0, sent: 0 };
    const boards = manifest?.billboards || {};
    for (const [key, board] of Object.entries(boards)) {
      const n = Number(key);
      if (map[n] && Array.isArray(board?.entries)) map[n].live = board.entries.length;
    }
    for (const r of rows) {
      if (!map[r.billboardNumber]) continue;
      if (r.status === 'staged') map[r.billboardNumber].staged += 1;
      if (r.status === 'sent') map[r.billboardNumber].sent += 1;
    }
    return map;
  }, [rows, manifest]);

  const liveEntriesForSelected = useMemo(() => {
    const board = manifest?.billboards?.[String(selected)];
    return Array.isArray(board?.entries) ? board.entries : [];
  }, [manifest, selected]);

  const manifestHas = (billboardNumber, companyName, linkUrl) => {
    const board = manifest?.billboards?.[String(billboardNumber)];
    if (!board || !Array.isArray(board.entries)) return false;
    return board.entries.some((e) => e.company === companyName && e.link === linkUrl);
  };

  const stagedRows = rows.filter((r) => r.status === 'staged');
  const sentRows = rows.filter((r) => r.status === 'sent');
  const liveMatchedSent = sentRows.filter((r) =>
    r.kind === 'ad'
      ? manifestHas(r.billboardNumber, r.companyName, r.linkUrl)
      : !manifestHas(r.billboardNumber, r.companyName, r.linkUrl)
  );

  const handleFile = async (entryKey, file) => {
    if (!file) return;
    updateDraft((d) => {
      const e = d.entries.find((x) => x.key === entryKey);
      if (e) {
        e.uploading = true;
        e.error = '';
      }
      return d;
    });
    try {
      const up = await fetch('/api/billboards/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          billboardNumber: selected,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      const upData = await up.json().catch(() => null);
      if (!up.ok || !upData?.uploadUrl) throw new Error(upData?.error || 'The upload could not start.');
      const put = await fetch(upData.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error('The file did not upload — try again.');
      updateDraft((d) => {
        const e = d.entries.find((x) => x.key === entryKey);
        if (e) {
          e.creativeType = upData.creativeType;
          e.creativeUrl = upData.publicUrl;
          e.uploading = false;
          e.queued = false;
        }
        return d;
      });
      setNotice('Creative uploaded — add the entry to the queue to stage it.');
    } catch (err) {
      updateDraft((d) => {
        const e = d.entries.find((x) => x.key === entryKey);
        if (e) {
          e.uploading = false;
          e.error = err.message || 'Upload failed.';
        }
        return d;
      });
    }
  };

  const addToQueue = async (entry) => {
    setBusy(true);
    setNotice('');
    const data = await queueCall('stage', {
      kind: 'ad',
      billboardNumber: selected,
      companyName: entry.companyName,
      linkUrl: entry.linkUrl,
      creativeType: entry.creativeType,
      creativeUrl: entry.creativeUrl,
      rotationIntervalSeconds: draft.intervalSeconds,
    });
    setBusy(false);
    if (data?.ok) {
      updateDraft((d) => {
        const e = d.entries.find((x) => x.key === entry.key);
        if (e) e.queued = true;
        return d;
      });
      setNotice(`"${entry.companyName}" is staged in the queue for billboard ${selected}. It is NOT live yet.`);
      refreshQueue(token);
    } else {
      setNotice(data?.error || 'That entry did not stage.');
    }
  };

  const queueRemoval = async (companyName, linkUrl) => {
    setBusy(true);
    const data = await queueCall('stage', {
      kind: 'remove',
      billboardNumber: selected,
      companyName,
      linkUrl,
      rotationIntervalSeconds: draft.intervalSeconds,
    });
    setBusy(false);
    setNotice(data?.ok ? `Removal of "${companyName}" is staged for billboard ${selected}.` : (data?.error || 'That removal did not stage.'));
    if (data?.ok) refreshQueue(token);
  };

  const sendQueue = async () => {
    setBusy(true);
    const data = await queueCall('send', {});
    setBusy(false);
    setNotice(data?.ok ? `Sent ${data.count} queued entries to the builder — they sit at "Sent to builder — awaiting application" until wired.` : (data?.error || 'Nothing sent.'));
    if (data?.ok) refreshQueue(token);
  };

  if (gate === 'checking') {
    return <main className="min-h-dvh bg-black px-4 py-10 text-zinc-100"><p className="mx-auto max-w-3xl text-sm text-zinc-400">Checking the manager lock…</p></main>;
  }

  if (gate === 'locked') {
    return (
      <main className="min-h-dvh bg-black px-4 py-10 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-zinc-900/60 p-6 text-center">
          <p className="text-[10px] tracking-[0.35em] text-violet-300/70">PRIVATE</p>
          <h1 className="mt-4 text-lg font-black tracking-[0.25em] text-white">AD SPACES ARE SEALED</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">The billboard manager is Merlin&apos;s tool only. Sign in with his account and knock again.</p>
        </div>
      </main>
    );
  }

  if (gate === 'not-ready') {
    return (
      <main className="min-h-dvh bg-black px-4 py-10 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <h1 className="text-lg font-black tracking-[0.2em] text-white">AD SPACES</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">The queue is not set up yet — the billboard storage still needs its one-time setup run in the dashboard (supabase/migrations/20261027_billboard_ads.sql). Until then the hub keeps its rotating inventory and nothing here can stage.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-black px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] text-zinc-100">
      <header className="mx-auto max-w-3xl">
        <p className="text-[10px] tracking-[0.35em] text-amber-300/70">PRIVATE · MERLIN ONLY</p>
        <h1 className="mt-1 text-2xl font-black tracking-[0.2em] text-white">AD SPACES</h1>
        <p className="mt-1 text-xs text-zinc-500">Pick a billboard number, fill its ads, queue them, then send the queue to the builder for wiring.</p>
      </header>

      {notice && (
        <p role="status" className="mx-auto mt-3 max-w-3xl rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-xs text-zinc-300">{notice}</p>
      )}

      {/* Fortune-cookie slip: the preset billboard numbers 1–44. */}
      <section className="mx-auto mt-4 max-w-3xl rounded-2xl border border-amber-200/30 bg-[#fdf6e3] p-3 text-zinc-900">
        <p className="px-1 text-[10px] font-bold tracking-[0.3em] text-zinc-500">YOUR NUMBERS · TAP ONE TO EDIT IT</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from({ length: 44 }, (_, i) => i + 1).map((n) => {
            const info = perNumber[n];
            const isSelected = n === selected;
            return (
              <button
                key={n}
                onClick={() => setSelected(n)}
                aria-pressed={isSelected}
                className={`min-h-[44px] min-w-[44px] rounded-lg border px-2 text-sm font-bold transition ${
                  isSelected
                    ? 'border-amber-600 bg-amber-500 text-white'
                    : 'border-zinc-300 bg-white text-zinc-800 hover:border-amber-500'
                }`}
              >
                {n}
                <span className="block text-[9px] font-semibold leading-none">
                  {info.live > 0 ? `● ${info.live} live` : info.staged > 0 || info.sent > 0 ? `○ ${info.staged + info.sent} queued` : 'empty'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selected billboard editor. */}
      <section className="mx-auto mt-4 max-w-3xl rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <h2 className="text-base font-black tracking-[0.15em] text-white">BILLBOARD {selected}</h2>
        <p className="mt-1 text-xs text-zinc-400">
          {liveEntriesForSelected.length > 0
            ? `${liveEntriesForSelected.length} ad${liveEntriesForSelected.length === 1 ? '' : 's'} live on this billboard right now.`
            : 'No ad live on this billboard yet — the hub shows its rotating inventory here.'}
        </p>

        <label className="mt-4 block text-xs font-bold tracking-[0.15em] text-zinc-300">
          ROTATION · SECONDS PER FACE (5–60)
          <input
            type="number"
            min={5}
            max={60}
            value={draft.intervalSeconds}
            onChange={(e) => updateDraft((d) => { d.intervalSeconds = Number(e.target.value); return d; })}
            className="mt-1 block w-32 rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white"
          />
        </label>
        <p className="mt-1 text-xs text-zinc-500">A billboard with one ad stays static. With more than one, the panel changes face every this-many seconds — long enough to read and tap.</p>

        <div className="mt-4 grid gap-3">
          {draft.entries.map((entry, idx) => (
            <article key={entry.key} className="rounded-2xl border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">Ad {idx + 1}</h3>
                <button
                  onClick={() => updateDraft((d) => { d.entries = d.entries.filter((x) => x.key !== entry.key); return d; })}
                  className="min-h-[44px] rounded-xl border border-red-500/40 px-3 text-xs font-bold text-red-300"
                >
                  Remove
                </button>
              </div>

              {entry.creativeUrl ? (
                entry.creativeType === 'video' ? (
                  <video src={entry.creativeUrl} controls muted loop playsInline className="mt-3 w-full max-w-sm rounded-xl" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.creativeUrl} alt="" className="mt-3 w-full max-w-sm rounded-xl" />
                )
              ) : (
                <p className="mt-3 text-xs text-zinc-500">No creative yet — upload an image or a video below.</p>
              )}

              <label className="mt-3 block text-xs font-bold text-zinc-300">
                REPLACE CREATIVE · IMAGE (≤ 8 MB) OR VIDEO (≤ 50 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  disabled={entry.uploading}
                  onChange={(e) => handleFile(entry.key, e.target.files?.[0])}
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white"
                />
              </label>
              {entry.uploading && <p className="mt-1 text-xs text-zinc-400">Uploading…</p>}
              {entry.error && <p className="mt-1 text-xs text-red-300">{entry.error}</p>}

              <label className="mt-3 block text-xs font-bold text-zinc-300">
                COMPANY NAME
                <input
                  type="text"
                  value={entry.companyName}
                  maxLength={80}
                  onChange={(e) => updateDraft((d) => { const x = d.entries.find((y) => y.key === entry.key); if (x) x.companyName = e.target.value; return d; })}
                  placeholder="Company name"
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white"
                />
              </label>

              <label className="mt-3 block text-xs font-bold text-zinc-300">
                LINK IT BRINGS VISITORS TO (https://)
                <input
                  type="url"
                  inputMode="url"
                  value={entry.linkUrl}
                  onChange={(e) => updateDraft((d) => { const x = d.entries.find((y) => y.key === entry.key); if (x) x.linkUrl = e.target.value; return d; })}
                  placeholder="https://example.com/page"
                  className="mt-1 block w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white"
                />
              </label>

              <button
                onClick={() => addToQueue(entry)}
                disabled={busy || entry.uploading || entry.queued}
                className="mt-3 min-h-[44px] w-full rounded-xl border border-amber-400/50 bg-amber-500/20 px-3 text-xs font-bold tracking-[0.15em] text-amber-200 disabled:opacity-50"
              >
                {entry.queued ? 'IN QUEUE ✓' : 'ADD TO QUEUE'}
              </button>
            </article>
          ))}
        </div>

        <button
          onClick={() => updateDraft((d) => { d.entries = [...d.entries, blankEntry()]; return d; })}
          className="mt-3 min-h-[44px] w-full rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-bold tracking-[0.15em] text-white"
        >
          + ADD AD
        </button>

        {liveEntriesForSelected.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
            <h3 className="text-sm font-bold text-white">Live on this billboard</h3>
            <p className="mt-1 text-xs text-zinc-500">Queue a removal and the builder drops it when the queue is wired. Removing one entry never disturbs the others.</p>
            <div className="mt-2 grid gap-2">
              {liveEntriesForSelected.map((e, i) => (
                <div key={`${e.company}-${e.link}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{e.company} · <span className="text-zinc-500">{e.link}</span></span>
                  <button
                    onClick={() => queueRemoval(e.company, e.link)}
                    disabled={busy}
                    className="min-h-[40px] shrink-0 rounded-xl border border-red-500/40 px-3 text-xs font-bold text-red-300"
                  >
                    Queue removal
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Queue + Send. */}
      <section className="mx-auto mt-4 max-w-3xl rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <h2 className="text-base font-black tracking-[0.15em] text-white">QUEUE</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          Queued ads are NOT live yet. The hub keeps showing its previous creative until you send the queue and the builder wires it into the site.
          After wiring, sent ads show as Live here.
        </p>

        {stagedRows.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">Nothing staged yet. Fill an ad above and press its Add to Queue button.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {stagedRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-white">Billboard {r.billboardNumber} · {r.kind === 'remove' ? `Remove ${r.companyName}` : r.companyName}</span>
                  <span className="block truncate text-xs text-zinc-500">{r.linkUrl}</span>
                </span>
                <button
                  onClick={async () => { await queueCall('unstage', { id: r.id }); refreshQueue(token); }}
                  className="min-h-[40px] shrink-0 rounded-xl border border-white/15 px-3 text-xs font-bold text-zinc-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={sendQueue}
            disabled={busy || stagedRows.length === 0}
            className="min-h-[44px] flex-1 rounded-xl border border-violet-400/50 bg-violet-500/25 px-3 text-xs font-bold tracking-[0.15em] text-violet-100 disabled:opacity-50"
          >
            SEND TO MUSE
          </button>
          <button
            onClick={async () => { await queueCall('clear-staged', {}); refreshQueue(token); }}
            disabled={busy || stagedRows.length === 0}
            className="min-h-[44px] rounded-xl border border-white/15 px-3 text-xs font-bold text-zinc-300 disabled:opacity-50"
          >
            Clear queue
          </button>
        </div>

        {sentRows.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold text-white">Sent to builder</h3>
            <div className="mt-2 grid gap-2">
              {sentRows.map((r) => {
                const isLive = liveMatchedSent.some((x) => x.id === r.id);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-white">Billboard {r.billboardNumber} · {r.kind === 'remove' ? `Remove ${r.companyName}` : r.companyName}</span>
                      <span className="block truncate text-xs text-zinc-500">{isLive ? 'Live ✓' : 'Sent to builder — awaiting application'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {liveMatchedSent.length > 0 && (
              <button
                onClick={async () => { await queueCall('clear-live', { ids: liveMatchedSent.map((r) => r.id) }); refreshQueue(token); }}
                disabled={busy}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-white/15 px-3 text-xs font-bold text-zinc-300 disabled:opacity-50"
              >
                Clear live entries from queue
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
