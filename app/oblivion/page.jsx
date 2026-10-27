// app/oblivion/page.jsx — the Oblivion waiting space
// (Merlin, 2026-10-26 late evening orders).
//
// THE SEQUENCE, IN HIS ORDER:
//   1. Oblivion triggers -> Earth gets sucked into the middle
//      and disappears (the collapse cinematic, played once per
//      session on arrival during the wait; a Replay button
//      brings it back).
//   2. THEN the 3D countdown of 72 hours begins, on the floating
//      holographic 4-sided cube above, with the waiting
//      navigation beneath it.
//   3. AT THE END (countdown reaches 0) -> Earth 2 is released
//      for each member of the passing team (server-enforced;
//      this page only REPORTS what /api/earth2/release says).
//
// WAITING NAVIGATION (his refinement, superseding the short
// curated program list): beneath the cube sit ALL THREE portal
// menu options as LINK BUTTONS — real working navigation, not
// labels or decorative tiles:
//   Concourse -> /?concourse=1 (hub with the program menu
//     collapsed, so the Concourse scene itself shows)
//   Portal Room -> /portal-room
//   Program Menu -> / (the hub program menu is expanded by
//     default on a fresh load)
// While Earth 2 counts down, the waiter steps into any of the
// three and goes anywhere from there. The three entries function
// independently of Earth 1 (gone) and Earth 2 (still sealed), so
// there is no conflict.
//
// HONEST STATES: before arming (no OBLIVION_ENDS_AT set), the
// page says plainly that Oblivion has not begun — it never fakes
// a countdown. After the end, released members get the Earth 2
// door; everyone else gets the truth plus the same three buttons.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import OblivionCollapse from '@/components/earth/OblivionCollapse';
import OblivionCountdownCube from '@/components/earth/OblivionCountdownCube';
import { supabase } from '@/lib/supabase';
import { formatCountdown, remainingMs as remainingMsOf } from '@/lib/earth/oblivion';

const COLLAPSE_SEEN_KEY = 'olympus:oblivion-collapse-seen:v1';

const PORTAL_BUTTONS = [
  { label: 'Concourse', sub: "The hub's 3D world", href: '/?concourse=1' },
  { label: 'Portal Room', sub: 'Card wall', href: '/portal-room' },
  { label: 'Program Menu', sub: 'All programs', href: '/' },
];

function PortalButtons() {
  return (
    <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
      {PORTAL_BUTTONS.map((b) => (
        <a
          key={b.label}
          href={b.href}
          className="flex flex-1 flex-col items-center rounded-2xl border border-cyan-400/40 bg-cyan-950/30 px-4 py-3.5 text-center transition-colors hover:bg-cyan-900/40"
        >
          <span className="text-sm font-black tracking-widest text-cyan-100 uppercase">{b.label}</span>
          <span className="mt-0.5 text-[11px] text-cyan-300/70">{b.sub}</span>
        </a>
      ))}
    </div>
  );
}

export default function OblivionPage() {
  const [status, setStatus] = useState(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [remaining, setRemaining] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const fetchStatus = useCallback(async () => {
    try {
      let headers = {};
      try {
        const { data } = await supabase.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (token) headers = { Authorization: `Bearer ${token}` };
      } catch {}
      const res = await fetch('/api/earth2/release', { headers, cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!data || !data.ok) return null;
      return data;
    } catch {
      return null;
    }
  }, []);

  const applyStatus = useCallback((data) => {
    if (!data) return;
    setStatus(data);
    setOffsetMs((data.serverNow || Date.now()) - Date.now());
    if (!data.armed) {
      setPhase('not-armed');
      return;
    }
    if (data.complete) {
      setPhase(data.released ? 'released' : 'complete-locked');
      setRemaining(0);
      return;
    }
    setRemaining(remainingMsOf(data.endsAt, Date.now() + ((data.serverNow || Date.now()) - Date.now())));
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(COLLAPSE_SEEN_KEY) === '1';
    } catch {}
    setPhase(seen ? 'waiting' : 'collapse');
  }, []);

  useEffect(() => {
    let alive = true;
    fetchStatus().then((data) => {
      if (alive) applyStatus(data);
    });
    return () => {
      alive = false;
    };
  }, [fetchStatus, applyStatus]);

  // One-second tick while waiting; refetch the moment the
  // counter hits zero so the release panel is server truth,
  // plus a 60 s poll so a long-open page never goes stale.
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'collapse') return undefined;
    if (!status || !status.endsAt) return undefined;
    const tick = setInterval(() => {
      const left = remainingMsOf(status.endsAt, Date.now() + offsetMs);
      setRemaining(left);
      if (left <= 0) {
        fetchStatus().then((data) => {
          if (data) applyStatus(data);
        });
      }
    }, 1000);
    const poll = setInterval(() => {
      fetchStatus().then((data) => {
        if (data) applyStatus(data);
      });
    }, 60000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase, status, offsetMs, fetchStatus, applyStatus]);

  const handleCollapseDone = useCallback(() => {
    try {
      window.sessionStorage.setItem(COLLAPSE_SEEN_KEY, '1');
    } catch {}
    setPhase('waiting');
  }, []);

  if (phase === 'loading') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 text-center">
        <p className="text-sm text-zinc-400">Checking the wait…</p>
      </main>
    );
  }

  if (phase === 'not-armed') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black px-6 text-center">
        <p className="text-2xl font-black tracking-wide text-zinc-100">Oblivion has not begun.</p>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          Earth still stands. The 72-hour wait begins when Earth is fully mapped — keep mapping.
        </p>
        <a
          href="/"
          className="rounded-full border border-cyan-400/50 bg-cyan-950/40 px-6 py-2.5 text-sm font-bold text-cyan-100"
        >
          Back to the hub
        </a>
      </main>
    );
  }

  if (phase === 'released') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black px-6 text-center">
        <p className="text-2xl font-black tracking-wide text-emerald-300">Earth 2 is open for you.</p>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          The wait is over, and your team passed. Step through when you are ready.
        </p>
        <a
          href="/earth-2"
          className="rounded-full border border-emerald-400/60 bg-emerald-950/50 px-8 py-3 text-base font-black tracking-widest text-emerald-100 uppercase"
        >
          Enter Earth 2
        </a>
        <div className="mt-4 flex w-full justify-center">
          <PortalButtons />
        </div>
      </main>
    );
  }

  if (phase === 'complete-locked') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black px-6 text-center">
        <p className="text-2xl font-black tracking-wide text-zinc-100">Earth 2 has opened for the passing teams.</p>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          Your account is not on a passing team, so the Earth 2 door stays shut for you — but
          everything below is still open, same as always.
        </p>
        <div className="mt-2 flex w-full justify-center">
          <PortalButtons />
        </div>
      </main>
    );
  }

  if (phase === 'collapse') {
    return (
      <main className="flex min-h-dvh flex-col bg-black">
        <div className="h-[62dvh] w-full">
          <OblivionCollapse onDone={handleCollapseDone} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-8 text-center">
          <p className="text-sm text-zinc-400">Earth is gone. The wait begins.</p>
          <button
            type="button"
            onClick={handleCollapseDone}
            className="text-xs font-bold tracking-widest text-cyan-300/80 uppercase underline underline-offset-4"
          >
            Skip to the countdown
          </button>
        </div>
      </main>
    );
  }

  // Waiting: the cube above, the three portal link buttons beneath.
  return (
    <main className="flex min-h-dvh flex-col items-center bg-black px-4 py-6">
      <p className="text-center text-sm text-zinc-400">
        Earth is gone. The wait is 72 hours.
      </p>
      <div className="mt-4 h-[46dvh] w-full max-w-2xl">
        <OblivionCountdownCube remainingMs={remaining} />
      </div>
      <p className="mt-2 font-mono text-lg font-bold tracking-widest text-cyan-100" aria-hidden="true">
        {formatCountdown(remaining)}
      </p>
      <p className="mt-5 text-center text-sm text-zinc-400">
        While you wait, step into any portal:
      </p>
      <div className="mt-3 flex w-full justify-center">
        <PortalButtons />
      </div>
      <button
        type="button"
        onClick={() => setPhase('collapse')}
        className="mt-6 text-xs font-bold tracking-widest text-zinc-500 uppercase underline underline-offset-4"
      >
        Replay the collapse
      </button>
    </main>
  );
}
