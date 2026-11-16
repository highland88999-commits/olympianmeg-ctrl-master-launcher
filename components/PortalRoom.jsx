// components/PortalRoom.jsx — THE PORTAL ROOM (Merlin, Nov 13, 2026).
//
// Click a hub portal → the AURORA SYSTEM BOOT SEQUENCE (it activates
// and appears for entering both portals) → the traveller arrives in
// a ROOM. The room's surroundings use the portal transit look. In
// front of them: the menu — a HOLOGRAPHIC SCREEN, a horizontally
// scrolling carousel / portal slider, one portal card per realm.
//
// LIGHTING: the nether room burns with red flame light like the
// Hades torches (flickering glows, embers); the heaven room glows
// with aurora light in the same style — slow-moving light
// transitions, comparable to torch lighting. The gun's room wears
// BOTH, heaven and hell as one gradient.
//
// SELECT a realm → the traveller ENTERS the screen → the one vortex
// system (useVortexTravel — "all entry points should use this vortex
// system", Merlin 2026-10-29) carries them there, the tunnel tinted
// by the realm's own hue. The entry is counted: nether visits open
// Heaven at 1, portal entries earn the Portal Gun at 10 — and when
// an entry unlocks something, the room says so before the ride.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVortexTravel } from './VortexTravel';
import { realmsForSide, realmCardNote, ROOM_LIGHTING } from '@/lib/portal/realms';
import {
  getPortalProgress,
  updatePortalProgress,
  recordPortalEntryFromRoom,
  heavenUnlocked,
  portalGunEarned,
  portalsToGun,
  usePortalProgress,
} from '@/lib/portal/progress';
import { updateBackpack } from '@/lib/backpack/store';
import { maybeAwardPortalGun } from '@/lib/portal/gun';
import { portalCardBackground } from '@/lib/portal/portal-graphics';
import PortalFaceVideo from './PortalFaceVideo';

const BOOT_MS = 1600;
const NOTICE_MS = 1600;

// A few deterministic drifting motes (fixed positions — the room
// never reshuffles on re-render).
const MOTES = [
  { left: '8%', top: '22%', size: 5, delay: '0s', dur: '7s' },
  { left: '18%', top: '68%', size: 4, delay: '1.2s', dur: '9s' },
  { left: '32%', top: '14%', size: 6, delay: '0.6s', dur: '8s' },
  { left: '47%', top: '78%', size: 4, delay: '2s', dur: '10s' },
  { left: '61%', top: '26%', size: 5, delay: '0.3s', dur: '7.5s' },
  { left: '74%', top: '62%', size: 6, delay: '1.6s', dur: '9.5s' },
  { left: '86%', top: '18%', size: 4, delay: '0.9s', dur: '8.5s' },
  { left: '93%', top: '72%', size: 5, delay: '2.4s', dur: '7s' },
  { left: '25%', top: '44%', size: 3, delay: '1.8s', dur: '11s' },
  { left: '70%', top: '44%', size: 3, delay: '0.1s', dur: '10.5s' },
];

export default function PortalRoom({ side = 'nether', open = false, onClose }) {
  const progress = usePortalProgress();
  const { travel, overlay: vortexOverlay, traveling } = useVortexTravel();
  const [phase, setPhase] = useState('boot'); // 'boot' | 'room'
  const [notice, setNotice] = useState(null);
  const [selectedRealm, setSelectedRealm] = useState(null);
  const timerRef = useRef(null);

  const lighting = ROOM_LIGHTING[side] || ROOM_LIGHTING.nether;
  const realms = realmsForSide(side);

  // Boot sequence on open: the aurora system activates and appears.
  useEffect(() => {
    if (!open) return undefined;
    setPhase('boot');
    setNotice(null);
    setSelectedRealm(null);
    const t = setTimeout(() => setPhase('room'), BOOT_MS);
    return () => {
      clearTimeout(t);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, side]);

  // A pending ride is cancelled if the room closes first.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const enterRealm = useCallback(
    (realm) => {
      if (traveling || selectedRealm) return;
      const before = getPortalProgress();
      const next = recordPortalEntryFromRoom(before, realm.key, side);
      updatePortalProgress(() => next);
      const unlocksHeaven = !heavenUnlocked(before) && heavenUnlocked(next);
      const earnsGun = !portalGunEarned(before) && portalGunEarned(next);
      if (earnsGun) {
        updateBackpack((rec) => maybeAwardPortalGun(rec, next));
        updatePortalProgress((p) => ({ ...p, gunGranted: true }));
      }
      setSelectedRealm(realm);
      const lines = [];
      if (unlocksHeaven) lines.push('Heaven portal unlocked — you passed through hell to get to heaven.');
      if (earnsGun) lines.push('Portal Gun earned — it is in your backpack now.');
      if (lines.length > 0) {
        setNotice(lines.join(' '));
        timerRef.current = setTimeout(() => travel(realm.route, realm.label), NOTICE_MS);
      } else {
        travel(realm.route, realm.label);
      }
    },
    [side, traveling, selectedRealm, travel]
  );

  if (!open) return null;

  const gunToGo = portalsToGun(progress);
  const statusLine =
    side === 'gun'
      ? `Portal Gun — every realm, on demand. Portals entered: ${progress.totalPortals}.`
      : heavenUnlocked(progress)
        ? `Heaven portal open. Portals entered: ${progress.totalPortals} · Portal Gun: ${gunToGo === 0 ? 'earned — in your backpack' : `${gunToGo} to go`}.`
        : `Heaven portal locked — 1 Nether Realm visit opens it. Portals entered: ${progress.totalPortals} · Portal Gun: ${gunToGo} to go.`;

  return (
    <>
      <style>{`
        @keyframes pr-aurora-drift { 0% { transform: translateX(-12%) rotate(-2deg); } 50% { transform: translateX(10%) rotate(2deg); } 100% { transform: translateX(-12%) rotate(-2deg); } }
        @keyframes pr-flame-flicker { 0%, 100% { opacity: 0.55; } 25% { opacity: 0.9; } 50% { opacity: 0.65; } 75% { opacity: 1; } }
        @keyframes pr-mote-float { 0% { transform: translateY(0); opacity: 0.2; } 50% { transform: translateY(-26px); opacity: 0.9; } 100% { transform: translateY(0); opacity: 0.2; } }
        @keyframes pr-boot-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pr-notice-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pr-card { scroll-snap-align: center; }
        .pr-scroll { scrollbar-width: thin; }
      `}</style>

      <div
        role="dialog"
        aria-label={`${lighting.title} — portal room`}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '16px',
          background: `radial-gradient(120% 90% at 50% 0%, ${lighting.glow}26 0%, ${lighting.deep} 55%, #000 100%)`,
          color: lighting.text, overflow: 'hidden',
        }}
      >
        {/* room light: two slow-moving glows (aurora) / flickering glows (flame) */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: '-20%', pointerEvents: 'none',
          background: `radial-gradient(40% 30% at 30% 30%, ${lighting.glow}55 0%, transparent 70%), radial-gradient(35% 30% at 70% 65%, ${lighting.ember}44 0%, transparent 70%)`,
          animation: side === 'nether' ? 'pr-flame-flicker 3.2s ease-in-out infinite' : 'pr-aurora-drift 14s ease-in-out infinite',
        }} />
        {/* drifting motes / embers */}
        {MOTES.map((m, i) => (
          <span key={i} aria-hidden="true" style={{
            position: 'absolute', left: m.left, top: m.top, width: m.size, height: m.size,
            borderRadius: 999, background: i % 2 ? lighting.ember : lighting.glow,
            opacity: 0.5, pointerEvents: 'none',
            animation: `pr-mote-float ${m.dur} ease-in-out ${m.delay} infinite`,
          }} />
        ))}

        {phase === 'boot' ? (
          <div style={{ position: 'relative', textAlign: 'center', padding: '0 16px' }}>
            <div aria-hidden="true" style={{
              width: 96, height: 96, margin: '0 auto 20px', borderRadius: '50%',
              background: 'conic-gradient(from 0deg, #7ef0c8, #8fd8ff, #c084fc, #ff7a1a, #7ef0c8)',
              filter: 'blur(2px)', opacity: 0.9, animation: 'pr-boot-spin 1.4s linear infinite',
            }} />
            <div style={{ letterSpacing: '0.35em', fontSize: 12, fontWeight: 700, opacity: 0.8 }}>AURORA SYSTEM</div>
            <div style={{ fontSize: 'clamp(1.4rem, 6vw, 2rem)', fontWeight: 800, marginTop: 8 }}>Booting…</div>
            <p style={{ opacity: 0.75, fontSize: 14, marginTop: 8 }}>The portal is waking up. One moment.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              <div style={{ letterSpacing: '0.35em', fontSize: 11, fontWeight: 700, opacity: 0.8 }}>
                {side === 'gun' ? 'PORTAL GUN' : side === 'heaven' ? 'UPPER PORTAL' : 'LOWER PORTAL'}
              </div>
              <h2 style={{ fontSize: 'clamp(1.5rem, 6vw, 2.2rem)', fontWeight: 800, margin: '6px 0 4px' }}>{lighting.title}</h2>
              <p style={{ fontSize: 13, opacity: 0.85, margin: 0, maxWidth: 560 }}>
                {side === 'gun'
                  ? 'The gun opened a portal that sucked you in — heaven light and hell fire, one gradient. Pick any realm.'
                  : side === 'heaven'
                    ? 'You passed through hell to get here. Pick a heaven to enter.'
                    : 'Pick a hell to descend into. One visit opens the Heaven portal above.'}
              </p>
            </div>

            {notice && (
              <div role="status" style={{
                marginTop: 14, padding: '10px 16px', borderRadius: 12, textAlign: 'center',
                background: 'rgba(255,217,138,0.16)', border: '1px solid rgba(255,217,138,0.55)',
                color: '#ffe9a8', fontSize: 14, fontWeight: 700, animation: 'pr-notice-in 0.3s ease-out',
              }}>
                {notice}
              </div>
            )}

            {/* HOLOGRAPHIC SCREEN — horizontally scrolling portal slider */}
            <div
              className="pr-scroll"
              style={{
                display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory',
                width: '100%', marginTop: 20, padding: '14px 6px 18px',
                borderRadius: 16, border: `1px solid ${lighting.glow}55`,
                background: `linear-gradient(180deg, ${lighting.glow}14 0%, transparent 60%)`,
                boxShadow: `0 0 40px ${lighting.glow}33 inset`,
              }}
            >
              {realms.map((realm) => (
                <button
                  key={`${side}-${realm.key}`}
                  type="button"
                  className="pr-card"
                  onClick={() => enterRealm(realm)}
                  disabled={!!selectedRealm}
                  style={{
                    flex: '0 0 auto', width: 208, minHeight: 148, textAlign: 'left', cursor: 'pointer',
                    position: 'relative', overflow: 'hidden',
                    borderRadius: 14, padding: '14px 14px 12px', color: lighting.text,
                    background: portalCardBackground(realm.key, realm.hue),
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: `1px solid ${realm.hue}88`,
                    boxShadow: `0 0 24px ${realm.hue}33`,
                    fontFamily: 'inherit',
                  }}
                >
                  {/* Video portal face (Merlin, Nov 15 ~22:25): the
                      muted looping video over the static graphic;
                      nothing when the realm has no video yet. The
                      text spans below carry position relative so
                      they paint above this absolute layer. */}
                  <PortalFaceVideo realmKey={realm.key} hue={realm.hue} />
                  <span style={{ position: 'relative', display: 'block', width: 14, height: 14, borderRadius: 999, background: realm.hue, boxShadow: `0 0 12px ${realm.hue}` }} />
                  <span style={{ position: 'relative', display: 'block', fontSize: 18, fontWeight: 800, marginTop: 10 }}>{realm.label}</span>
                  <span style={{ position: 'relative', display: 'block', fontSize: 12, opacity: 0.75, marginTop: 2 }}>{realm.mythos} {realm.side === 'both' ? '· both sides' : realm.side === 'heaven' ? '· heaven' : '· hell'}</span>
                  {realmCardNote(realm, side) && (
                    <span style={{ position: 'relative', display: 'block', fontSize: 12, opacity: 0.9, marginTop: 8, lineHeight: 1.35 }}>{realmCardNote(realm, side)}</span>
                  )}
                  <span style={{ position: 'relative', display: 'block', fontSize: 13, fontWeight: 700, marginTop: 10, color: realm.hue }}>
                    {selectedRealm && selectedRealm.key === realm.key ? 'Entering…' : 'Enter →'}
                  </span>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 12, textAlign: 'center' }}>
              Swipe sideways to see every realm · {statusLine}
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 6, padding: '10px 22px', borderRadius: 999, cursor: 'pointer',
                background: 'transparent', color: lighting.text, fontSize: 14, fontWeight: 700,
                border: `1px solid ${lighting.text}66`, fontFamily: 'inherit',
              }}
            >
              ← Step back
            </button>
          </div>
        )}
      </div>

      {/* The vortex ride itself, tinted by the chosen realm's hue. */}
      {vortexOverlay}
      {traveling && selectedRealm && (
        <div aria-hidden="true" style={{
          position: 'fixed', inset: 0, zIndex: 2147483647, pointerEvents: 'none',
          background: `radial-gradient(90% 90% at 50% 50%, ${selectedRealm.hue}00 40%, ${selectedRealm.hue}55 100%)`,
          mixBlendMode: 'screen',
        }} />
      )}
    </>
  );
}
