'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RocketIcon, RotateIcon } from "@/lib/hermes-icons";
import { SATELLITES } from "@/lib/i18n/satellites";
import { prettifyKey } from "@/lib/tour/itinerary";
import { pickVortexWraps } from "@/lib/vortex/wraps";
import { VORTEX_RIDE_MS } from './lib/tube.js';
import VortexTubeRide from './components/VortexTubeRide.jsx';
import { supabase } from "@/lib/supabase";
import { CHARACTERS } from "@/lib/characters/roster";
import {
  LANDING_PERSPECTIVE_KEY,
  LANDING_CHARACTER_KEY,
  LANDING_DEFAULT_PERSPECTIVE,
} from "@/lib/fintrac-explanation";

// Nexus Vortex — fast travel for Olympus (Merlin, 2026-10-29).
// Pick a destination (or let the vortex decide), drop into the spinning
// vortex tube, and step through on arrival. The tube spins around the
// rider; the rider does not spin — the camera auto-fixes forward so the
// destination renders in front of them at the ride's end. Every ride
// wears two different random ecosystem skins: one outside (watchers),
// one inside (the rider).

// Every registered program is a destination, except the vortex
// itself — flying to yourself is a circle.
const DESTINATIONS = SATELLITES.filter((s) => s.key !== 'nexus-vortex')
  .map((s) => ({ key: s.key, route: s.route, name: prettifyKey(s.key) }));

export default function NexusVortexPage() {
  const router = useRouter();
  const [phase, setPhase] = useState('pick'); // pick | flying | arrived
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState(null);
  // The skin chain: each ride's pair bans the previous pair's files,
  // so no texture ever appears in back-to-back vortexes.
  const skinsRef = useRef(null);
  // The rider's landing prefs: 3rd person shows their character in front
  // of them in the tube; 1st person keeps the ride as-is.
  const [riderPrefs, setRiderPrefs] = useState({
    perspective: LANDING_DEFAULT_PERSPECTIVE,
    characterPreview: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/ui-state', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const prefs = (body && body.preferences) || {};
        const perspective =
          prefs[LANDING_PERSPECTIVE_KEY] === '1st' || prefs[LANDING_PERSPECTIVE_KEY] === '3rd'
            ? prefs[LANDING_PERSPECTIVE_KEY]
            : LANDING_DEFAULT_PERSPECTIVE;
        const character = CHARACTERS.find((c) => c.id === prefs[LANDING_CHARACTER_KEY]) || null;
        setRiderPrefs({ perspective, characterPreview: character ? character.preview : null });
      } catch {
        /* defaults stand */
      }
    })();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? DESTINATIONS.filter((d) =>
          d.name.toLowerCase().includes(q) || d.key.toLowerCase().includes(q))
      : DESTINATIONS;
    return pool.slice(0, 8);
  }, [query]);

  const beginFlight = useCallback((dest) => {
    if (!dest) return;
    setDestination(dest);
    setQuery('');
    skinsRef.current = pickVortexWraps(skinsRef.current);
    setPhase('flying');
  }, []);

  const surpriseMe = useCallback(() => {
    const pick = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
    beginFlight(pick);
  }, [beginFlight]);

  const stepThrough = useCallback(() => {
    if (destination) router.push(destination.route);
  }, [destination, router]);

  const pickAnother = useCallback(() => {
    setDestination(null);
    setPhase('pick');
  }, []);

  const rideDone = useCallback(() => setPhase('arrived'), []);

  return (
    <main style={styles.page}>
      {phase === 'pick' && (
        <div style={styles.intro}>
          <p style={styles.kicker}>Nexus Vortex</p>
          <h1 style={styles.h1}>Where to?</h1>
          <p style={styles.sub}>Choose a destination — or let the vortex decide.</p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search programs…"
            aria-label="Search destinations"
            style={styles.search}
          />
          <div style={styles.list} role="listbox" aria-label="Destinations">
            {matches.map((d) => (
              <button key={d.key} type="button" role="option" aria-selected="false"
                onClick={() => beginFlight(d)} style={styles.row}>
                <span>{d.name}</span>
                <span aria-hidden="true" style={styles.rowArrow}>→</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p style={styles.noMatch}>No program matches that — try another word.</p>
            )}
          </div>
          <button type="button" style={{ ...styles.cta, marginTop: 18 }} onClick={surpriseMe}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span aria-hidden="true">🎲</span>Surprise me
            </span>
          </button>
          <p style={styles.hint}>The tube spins around you — you stay steady, facing forward.</p>
        </div>
      )}

      {phase === 'flying' && skinsRef.current && (
        <VortexTubeRide
          outsideSkin={skinsRef.current.outside}
          insideSkin={skinsRef.current.inside}
          destinationName={destination ? destination.name : ''}
          durationMs={VORTEX_RIDE_MS}
          onDone={rideDone}
          characterPreview={riderPrefs.characterPreview}
          perspective={riderPrefs.perspective}
        />
      )}

      {phase === 'arrived' && destination && (
        <div style={styles.portal} role="dialog" aria-label="Arrival">
          <p style={styles.kicker}>You arrived</p>
          <h2 style={styles.portalH}>{destination.name}</h2>
          <p style={styles.portalP}>
            The vortex held steady all the way. Step through when you're ready.
          </p>
          <button type="button" style={styles.cta} onClick={stepThrough}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <RocketIcon size={18} />Step through
            </span>
          </button>
          <p style={styles.hint}>
            <button type="button" onClick={pickAnother} style={styles.linkBtn}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <RotateIcon size={14} />Fly somewhere else
              </span>
            </button>
          </p>
        </div>
      )}
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </main>
  );
}

const styles = {
  page: {
    position: 'fixed', inset: 0, background: '#000', color: '#E0E0E0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', overflow: 'hidden',
  },
  intro: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px',
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0.8) 100%), url(/images/nexus-vortex/bg.webp)',
    backgroundSize: 'auto, cover', backgroundPosition: 'center',
  },
  kicker: { letterSpacing: '6px', textTransform: 'uppercase', color: '#ffd700', fontSize: '12px', margin: '0 0 10px' },
  h1: { fontSize: 'clamp(2rem, 6vw, 3.4rem)', margin: '0 0 12px', letterSpacing: '4px', color: '#fff' },
  sub: { color: '#9aa', fontSize: '1rem', margin: '0 0 24px', lineHeight: 1.6 },
  hint: { color: '#555', fontSize: '0.8rem', marginTop: '16px' },
  cta: {
    minHeight: '52px', padding: '0 36px', background: 'transparent', border: '2px solid #ffd700',
    color: '#ffd700', borderRadius: '999px', cursor: 'pointer', fontSize: '1.05rem',
    letterSpacing: '2px', textTransform: 'uppercase',
  },
  search: {
    width: 'min(92vw, 380px)', padding: '12px 18px', marginBottom: '12px',
    background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,215,0,0.35)',
    borderRadius: '999px', color: '#fff', fontSize: '1rem', outline: 'none',
  },
  list: {
    width: 'min(92vw, 380px)', maxHeight: '38vh', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '6px',
  },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
    color: '#E0E0E0', fontSize: '0.95rem', cursor: 'pointer', textAlign: 'left',
  },
  rowArrow: { color: '#ffd700', fontSize: '1.1rem' },
  noMatch: { color: '#777', fontSize: '0.9rem', textAlign: 'center', margin: '12px 0' },
  linkBtn: {
    background: 'none', border: 'none', color: '#9aa', fontSize: '0.85rem',
    cursor: 'pointer', textDecoration: 'underline', padding: '4px',
  },
  portal: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 'min(92vw, 480px)',
    background: 'linear-gradient(rgba(4,4,8,0.94), rgba(4,4,8,0.94)), url(/images/nexus-vortex/bg.webp)',
    backgroundSize: 'auto, cover', backgroundPosition: 'center',
    border: '2px solid #ffd700', borderRadius: '10px', padding: '36px 28px', textAlign: 'center',
    boxShadow: '0 0 40px rgba(212,175,55,.25)',
  },
  portalH: { color: '#fff', fontSize: '1.5rem', margin: '0 0 12px', letterSpacing: '2px' },
  portalP: { color: '#9aa', fontSize: '0.92rem', lineHeight: 1.7, margin: '0 0 24px' },
};
