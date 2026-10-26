'use client';
// components/characters/CharacterPicker.jsx
//
// WAVE 1 — the per-surface character picker for the open-world
// walkers (Mega City / Truman / Babel district; plan:
// characters-everywhere-plan.md §2/§4). One compact control in the
// GTA pages' own idiom (dark translucent panel, inline styles,
// safe-area aware): collapsed it shows who you currently walk as;
// open, it offers the whole roster as CharacterToken cards plus a
// "profile default" choice.
//
// Pick semantics are the Wave 0 chain (lib/characters/
// embodiment.js): choosing a character writes THIS surface's
// override (writeSurfaceOverride — roster-validated, unknown ids
// refused); "profile default" clears the override so the surface
// follows your profile character again (or the world's native
// figure when you have none). After every write the effective pick
// is re-resolved and handed to onPick so the live scene can swap
// the walker without a reload.
//
// Props:
//   surface   pick-chain surface key ('mega-city' | 'truman' |
//             'babel' | ...)
//   onPick    (effectiveCharacterId | null) => void — fired on
//             mount with the current pick and after every change
//   accent    theme color for the surface (Babel's gold, default
//             white)
//   style     placement styles from the host page (position etc.)
//   embedded  host-menu mode (Earth console): the picker lives IN
//             FLOW inside a bounded card — full-width header with
//             no "CHARACTER" word (the host labels its own
//             section), and the roster panel expands in flow,
//             pushing host content instead of floating over it.
//             Nothing paints outside the host card. Default false
//             keeps the floating GTA-pages behaviour unchanged.
import { useEffect, useRef, useState } from 'react';
import CharacterToken from './CharacterToken';
import {
  getEmbodiment, listEmbodiments, readProfileCharacterId,
  readSurfaceOverride, resolveSurfaceCharacterId, writeSurfaceOverride,
  PROFILE_CHARACTER_LS_KEY, EARTH_DEFAULT_CHARACTER_ID,
} from '@/lib/characters/embodiment';
import { isCharacterId } from '@/lib/characters/roster';

export default function CharacterPicker({ surface, onPick, accent = '#ffffff', style, embedded = false }) {
  const [open, setOpen] = useState(false);
  const [overrideId, setOverrideId] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [effectiveId, setEffectiveId] = useState(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  function refresh(notify) {
    const eff = resolveSurfaceCharacterId(surface);
    setOverrideId(readSurfaceOverride(surface));
    setProfileId(readProfileCharacterId());
    setEffectiveId(eff);
    if (notify && onPickRef.current) onPickRef.current(eff);
    return eff;
  }

  // Picks live in localStorage (device mirror) — read after mount
  // so server-rendered markup and first client paint agree.
  useEffect(() => { refresh(true); }, [surface]); // eslint-disable-line react-hooks/exhaustive-deps

  // Account sync (demo fix, 2026-10-15): the pick chain's profile leg is
  // the ACCOUNT row (user_profiles.profile_character_id) — the device
  // mirror is only its local cache, written when a pick is saved on
  // THIS device. A pick saved on another device (or before the mirror
  // write existed) left the picker reading "Native figure" and the
  // walker a plain capsule while the account had a character all along
  // (Merlin's Mega City demo). On mount, read the account once: a valid
  // account pick refreshes the mirror — the account is the source of
  // truth, exactly the write MyCharacters makes on save — and
  // re-resolves, so the label and the host scene (via onPick) see the
  // real chain. A surface override still wins: refresh() resolves the
  // chain, it is never bypassed. Guests (401) and network failures stay
  // silent and keep the mirror's answer. An account with NO pick never
  // clears the mirror: a pick whose save didn't persist lives there
  // (the /api/profiles/me contract) and stays honored.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profiles/me', {
          headers: { accept: 'application/json' },
        });
        if (!res || !res.ok) return;
        const data = await res.json().catch(() => null);
        const accountId =
          data && data.profiles && data.profiles.personal
            ? data.profiles.personal.profile_character_id
            : null;
        if (cancelled || !isCharacterId(accountId)) return;
        if (readProfileCharacterId() !== accountId) {
          try {
            window.localStorage.setItem(PROFILE_CHARACTER_LS_KEY, accountId);
          } catch { /* the mirror is a cache — the refresh below still applies */ }
        }
        if (!cancelled) refresh(true);
      } catch { /* offline / guest: the mirror's answer stands */ }
    })();
    return () => { cancelled = true; };
  }, [surface]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(id) {
    if (id === null) writeSurfaceOverride(surface, null);
    else writeSurfaceOverride(surface, id);
    refresh(true);
    setOpen(false);
  }

  const effective = effectiveId ? getEmbodiment(effectiveId) : null;
  const profile = profileId ? getEmbodiment(profileId) : null;
  // Earth display only (video QA V2-1): with no pick at all the
  // walker on Earth is the Earth default, so the collapsed label
  // must say so instead of "Native figure" — otherwise the picker
  // promises a capsule the scene never shows. This changes no
  // pick state: choosing "Profile default" still just clears the
  // override, and EarthWalker resolves the same default.
  const displayEmb = effective
    || (surface === 'earth' ? getEmbodiment(EARTH_DEFAULT_CHARACTER_ID) : null);
  const border = accent === '#ffffff' ? 'rgba(255,255,255,0.2)' : accent;

  return (
    <div style={embedded
      ? { position: 'relative', width: '100%', minWidth: 0, ...style }
      : { position: 'absolute', zIndex: 30, ...style }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Choose your character"
        onClick={() => { if (!open) refresh(false); setOpen(!open); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${border}`, borderRadius: 8,
          color: '#fff', fontSize: 12, cursor: 'pointer',
          maxWidth: embedded ? '100%' : '78vw',
          width: embedded ? '100%' : undefined,
          boxSizing: 'border-box',
        }}
      >
        {displayEmb && displayEmb.preview ? (
          <img
            src={displayEmb.preview} alt=""
            style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover', display: 'block', flexShrink: 0 }}
          />
        ) : null}
        {!embedded && (
          <span style={{ fontWeight: 700, letterSpacing: 1, color: accent }}>CHARACTER</span>
        )}
        <span style={{
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: '1 1 auto', minWidth: 0, textAlign: 'left',
        }}>
          {displayEmb ? displayEmb.name : 'Native figure'}
        </span>
        <span aria-hidden="true" style={{ opacity: 0.7, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Character roster"
          style={embedded ? {
            // In flow: the panel takes real layout space inside the
            // host card (the host's own scroll region absorbs the
            // growth) — bounded by the card's width, never painted
            // over siblings or past the card's edge.
            position: 'static', width: '100%', boxSizing: 'border-box',
            marginTop: 8, maxHeight: '44vh', overflowY: 'auto',
            background: 'rgba(8,9,13,0.94)', border: `1px solid ${border}`,
            borderRadius: 12, padding: 10,
          } : {
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 'min(330px, 86vw)', maxHeight: '52vh', overflowY: 'auto',
            background: 'rgba(8,9,13,0.94)', border: `1px solid ${border}`,
            borderRadius: 12, padding: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
          }}
        >
          <button
            type="button"
            onClick={() => choose(null)}
            aria-pressed={!overrideId}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              textAlign: 'left', marginBottom: 10, padding: '9px 10px',
              background: !overrideId ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${!overrideId ? accent : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8, color: '#fff', cursor: 'pointer',
            }}
          >
            {profile && profile.preview ? (
              <img
                src={profile.preview} alt=""
                style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', display: 'block' }}
              />
            ) : null}
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Profile default</span>
              <span style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                {profile ? profile.name : (surface === 'earth' ? 'No profile character — Earth default (Neo)' : 'No profile character — native figure')}
              </span>
            </span>
          </button>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))', gap: 6,
          }}>
            {listEmbodiments().map((e) => (
              <CharacterToken
                key={e.id}
                embodiment={e}
                variant="token"
                size={52}
                selected={effectiveId === e.id}
                onClick={() => choose(e.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
