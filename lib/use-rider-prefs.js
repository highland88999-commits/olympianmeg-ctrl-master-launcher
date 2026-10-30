'use client';

// useRiderPrefs — the rider's saved landing prefs (perspective + chosen
// character) for vortex tube rides. Fetched once per session from
// /api/ui-state and cached module-level, so portal surfaces can preload
// it and the ride starts instantly on tap — no waiting for the fetch
// when the overlay mounts.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CHARACTERS } from '@/lib/characters/roster';
import {
  LANDING_PERSPECTIVE_KEY,
  LANDING_CHARACTER_KEY,
  LANDING_DEFAULT_PERSPECTIVE,
} from '@/lib/fintrac-explanation';

const DEFAULTS = { perspective: LANDING_DEFAULT_PERSPECTIVE, characterPreview: null };
let cached = null;
let inflight = null;

function load() {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return DEFAULTS;
      const res = await fetch('/api/ui-state', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return DEFAULTS;
      const body = await res.json().catch(() => null);
      const prefs = (body && body.preferences) || {};
      const perspective =
        prefs[LANDING_PERSPECTIVE_KEY] === '1st' || prefs[LANDING_PERSPECTIVE_KEY] === '3rd'
          ? prefs[LANDING_PERSPECTIVE_KEY]
          : LANDING_DEFAULT_PERSPECTIVE;
      const character = CHARACTERS.find((c) => c.id === prefs[LANDING_CHARACTER_KEY]) || null;
      cached = { perspective, characterPreview: character ? character.preview : null };
      return cached;
    } catch {
      return DEFAULTS;
    }
  })();
  return inflight;
}

export function useRiderPrefs() {
  const [prefs, setPrefs] = useState(cached || DEFAULTS);
  useEffect(() => {
    let live = true;
    load().then((p) => {
      if (live) setPrefs(p);
    });
    return () => { live = false; };
  }, []);
  return prefs;
}
