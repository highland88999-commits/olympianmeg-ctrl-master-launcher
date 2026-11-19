// lib/oblivion/useOblivionState.js — the Oblivion cycle, live, for any page.
//
// Polls GET /api/oblivion/state on mount and every 60 s (the
// /oblivion page's cadence — a long-open page never goes stale).
// Returns { armed, active, complete, endsAt, remainingMs, ready }:
//   armed=false → nothing is happening (or the state is
//     unreachable — the hook fails open to "not armed", never
//     blocks travel on a network blip).
//   active=true → Earth is gone, the timer runs, Earth travel is
//     refused; remainingMs ticks down once a second from the
//     server's endsAt, so the countdown moves even between polls.
//   complete=true → the 72 h are over, Earth is back.
// ready=false until the first fetch resolves.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOblivionState } from './client.js';
import { cycleState } from './state.js';

const POLL_MS = 60000;

export function useOblivionState() {
  const [state, setState] = useState({
    armed: false, active: false, complete: false, endsAt: null, remainingMs: 0, ready: false,
  });
  const endsAtRef = useRef(null);

  const refresh = useCallback(async () => {
    const data = await fetchOblivionState();
    if (!data) {
      setState((prev) => ({ ...prev, ready: true }));
      return;
    }
    endsAtRef.current = data.endsAt;
    const c = cycleState({ armed: data.armed, endsAtMs: data.endsAt, nowMs: Date.now() });
    setState({
      armed: c.armed, active: c.active, complete: c.complete,
      endsAt: data.endsAt, remainingMs: c.remainingMs, ready: true,
    });
  }, []);

  useEffect(() => {
    let alive = true;
    refresh();
    const poll = setInterval(() => { if (alive) refresh(); }, POLL_MS);
    // The displayed second ticks locally between polls.
    const tick = setInterval(() => {
      const endsAt = endsAtRef.current;
      if (!endsAt) return;
      const c = cycleState({ armed: true, endsAtMs: endsAt, nowMs: Date.now() });
      setState((prev) => {
        if (!prev.armed) return prev;
        return { ...prev, active: c.active, complete: c.complete, remainingMs: c.remainingMs };
      });
    }, 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  return state;
}

export default useOblivionState;
