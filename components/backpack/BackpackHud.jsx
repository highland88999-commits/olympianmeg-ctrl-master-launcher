'use client';

// components/backpack/BackpackHud.jsx
// THE BACKPACK, INSIDE A 3D REALM (Merlin, 2026-10-24): the one
// pack, opened from any realm's HUD. It reads the SAME record
// through the SAME store as the profile section (lib/backpack/
// store.js) — no second record, no second schema — and equips a
// weapon by writing record.activeWeaponUid, which the profile
// section reads back. The button rides in the realm's own HUD
// row (flow layout, never overlapping); the panel is a centred
// sheet that only exists while open, so it never blocks the 3D
// canvas when closed. Keyboard, touch and gamepad behaviour are
// untouched while the panel is closed.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BACKPACK_ICON_SAVE_DEBOUNCE_MS,
  BACKPACK_ICON_SIZE,
  BACKPACK_ICON_STORAGE_KEY,
  BACKPACK_ICON_UI_STATE_KEY,
  backpackIconFracToPx,
  backpackIconPxToFrac,
  clampBackpackIconPx,
  defaultBackpackIconFractions,
  dragBackpackIconTopLeft,
  isBackpackIconDrag,
  resolveBackpackIconPosition,
} from '@/lib/backpack/icon';
import {
  equippedDamageForSlot,
  equippedWeaponEntry,
  itemsOfKind,
  lightsaberEntry,
  setActiveWeapon,
  weaponHand,
  weaponReticle,
} from '@/lib/backpack/backpack';
import { useBackpack, updateBackpack } from '@/lib/backpack/store';

const RETICLE_GLYPH = { crosshair: '✛', dot: '•', chevron: '»' };

const KIND_GROUPS = [
  { kind: 'material', label: 'Materials', icon: '🧪' },
  { kind: 'collectible', label: 'Collectibles', icon: '💠' },
  { kind: 'consumable', label: 'Consumables', icon: '🧴' },
];

function weaponLine(entry) {
  const r = weaponReticle(entry);
  const dmg = Math.floor(Number(entry.meta && entry.meta.damage));
  return (
    <>
      {entry.name}
      <span style={{ opacity: 0.65 }}>
        {' '}· {entry.meta && entry.meta.weaponClass ? entry.meta.weaponClass : 'blade'}
        {Number.isFinite(dmg) && dmg > 0 ? ` · ${dmg} dmg` : ''}
        {r ? ` ${RETICLE_GLYPH[r.style] || ''}` : ''}
      </span>
    </>
  );
}

/**
 * Backpack HUD entry for a 3D realm.
 *   realm: id written to the record on equip ('hub', 'earth-2',
 *     'star-wars', 'middle-earth', 'hollow-earth', 'mars', 'planet').
 *   realmLabel: display name for the "last equipped in" note.
 *   combatApplies: true when this realm's combat consumes the
 *     equipped weapon (ME + Hollow Earth hands); false keeps the
 *     realm's native arms and the panel says so (displayNote).
 *   displayNote: plain line for display-only realms (saber line
 *     for Star Wars, etc.). Defaults to the pack-rides-along line.
 */
export default function BackpackHud({ realm, realmLabel, combatApplies = false, displayNote = null }) {
  const record = useBackpack();
  const [open, setOpen] = useState(false);
  const equipped = equippedWeaponEntry(record);
  const weapons = itemsOfKind(record, 'weapon');
  const saber = lightsaberEntry(record);
  const totalQty = record.items.reduce((n, e) => n + e.qty, 0);

  // --- Circle icon position (item 9b, Merlin 2026-10-26) ------------
  // The trigger is a small draggable CIRCLE, exactly like the
  // Concourse Orb (lib/backpack/icon.js mirrors
  // lib/concourse-icon.js): press-and-move past 8px drags it, a
  // still press taps it open; the spot is viewport fractions,
  // written to localStorage instantly and to /api/ui-state
  // (key `backpack_icon`) debounced, and the account copy wins
  // on login. Signed out, the device copy stands alone. The icon
  // is fixed-position inside this component only — the accepted
  // exception to the no-overlap rule for user-draggable controls,
  // same as the Concourse panels; nothing else here is absolutely
  // positioned except the count badge inside the circle itself.
  const [iconFrac, setIconFrac] = useState(null);
  const [dragPx, setDragPx] = useState(null);
  const [viewport, setViewport] = useState(null);
  const iconRef = useRef(null);
  const suppressClickRef = useRef(0);
  const saveTimerRef = useRef(null);

  const persistIcon = useCallback((frac) => {
    try {
      localStorage.setItem(BACKPACK_ICON_STORAGE_KEY, JSON.stringify(frac));
    } catch {}
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      let token = null;
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || null;
      } catch {}
      if (!token) return; // signed out: localStorage only
      try {
        await fetch('/api/ui-state', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ preferences: { [BACKPACK_ICON_UI_STATE_KEY]: frac } }),
        });
        // NOTE: until the route accepts `backpack_icon` (see
        // lib/backpack/icon.js), this answers 400 and is ignored
        // — localStorage already holds the spot, and the next
        // drag retries.
      } catch {
        // offline — localStorage already holds it; next drag retries
      }
    }, BACKPACK_ICON_SAVE_DEBOUNCE_MS);
  }, []);

  // Hydrate: localStorage instantly; the account copy wins when
  // signed in (the Concourse rule — that is what will carry the
  // icon's spot to a new device at login, once the route accepts
  // the key). A resize/rotation listener keeps fractions rendering
  // back inside the viewport at every size.
  useEffect(() => {
    const applyViewport = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    applyViewport();
    window.addEventListener('resize', applyViewport);
    let local = null;
    try {
      const raw = localStorage.getItem(BACKPACK_ICON_STORAGE_KEY);
      local = raw ? JSON.parse(raw) : null;
    } catch {}
    const resolved = resolveBackpackIconPosition({
      local,
      fallback: defaultBackpackIconFractions(window.innerWidth, window.innerHeight, BACKPACK_ICON_SIZE),
    });
    setIconFrac(resolved);
    let cancelled = false;
    (async () => {
      let token = null;
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token || null;
      } catch {}
      if (!token || cancelled) return;
      try {
        const res = await fetch('/api/ui-state', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const server = resolveBackpackIconPosition({ server: data && data.preferences ? data.preferences[BACKPACK_ICON_UI_STATE_KEY] : null });
        if (!cancelled && server) setIconFrac(server);
      } catch {
        // offline — the device copy stands
      }
    })();
    return () => {
      window.removeEventListener('resize', applyViewport);
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Drag engine (the Concourse Orb's, via lib/backpack/icon.js):
  // a press that never crosses 8px stays a tap and the click
  // handler opens the panel; a real drag swallows its click, so
  // the two never mix. The grab offset is kept and the top-left
  // is clamped live, so the circle stays fully on screen.
  // touch-none so a touch-drag never fights page scroll.
  const beginIconDrag = (e) => {
    if (e.isPrimary === false) return;
    if (e.button != null && e.button !== 0) return;
    const el = iconRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const origin = iconFrac
      ? clampBackpackIconPx(backpackIconFracToPx(iconFrac, vw, vh, BACKPACK_ICON_SIZE), vw, vh, BACKPACK_ICON_SIZE)
      : { x: 16, y: vh - BACKPACK_ICON_SIZE - 16 };
    try { el.setPointerCapture(e.pointerId); } catch {}
    const info = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: origin.x,
      origY: origin.y,
      x: origin.x,
      y: origin.y,
      moved: false,
    };
    const onMove = (ev) => {
      if (ev.pointerId !== info.pointerId) return;
      if (!info.moved && !isBackpackIconDrag(ev.clientX - info.startX, ev.clientY - info.startY)) return; // still a tap
      info.moved = true;
      const tl = dragBackpackIconTopLeft(
        { x: info.origX, y: info.origY },
        { x: info.startX, y: info.startY },
        { x: ev.clientX, y: ev.clientY },
        window.innerWidth,
        window.innerHeight,
        BACKPACK_ICON_SIZE
      );
      info.x = tl.x;
      info.y = tl.y;
      setDragPx(tl);
    };
    const onUp = (ev) => {
      if (ev.pointerId !== info.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      try { el.releasePointerCapture(info.pointerId); } catch {}
      setDragPx(null);
      if (!info.moved) return; // plain tap — the click handler runs
      suppressClickRef.current = Date.now();
      const next = backpackIconPxToFrac({ x: info.x, y: info.y }, window.innerWidth, window.innerHeight, BACKPACK_ICON_SIZE);
      setIconFrac(next);
      persistIcon(next);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const iconPx = iconFrac && viewport
    ? clampBackpackIconPx(backpackIconFracToPx(iconFrac, viewport.w, viewport.h, BACKPACK_ICON_SIZE), viewport.w, viewport.h, BACKPACK_ICON_SIZE)
    : null;
  const iconPosStyle = dragPx
    ? { left: dragPx.x, top: dragPx.y }
    : iconPx
      ? { left: iconPx.x, top: iconPx.y }
      : { left: 16, bottom: 16 };

  const combatNote = (() => {
    if (!combatApplies) {
      return displayNote || 'The pack rides along — this realm keeps its own arms.';
    }
    if (!equipped) return 'Equip a weapon and it arms its hand here.';
    const hand = weaponHand(equipped);
    const dmg = equippedDamageForSlot(equipped, hand);
    return dmg
      ? `⚔ ${equipped.name} arms your ${hand} hand here (${dmg} dmg).`
      : `⚔ ${equipped.name} arms your ${hand} hand here (native damage — this weapon carries no rating).`;
  })();

  return (
    <>
      {/* The circle icon: a 56px round button (same size as the
          Concourse Orb), fixed inside this component so its owner
          can drag it anywhere on screen. The equipped weapon's
          name no longer fits on the circle itself — it lives in
          the title tooltip and in the panel header, as before.
          The count badge sits inside the circle itself. */}
      <button
        ref={iconRef}
        type="button"
        onPointerDown={beginIconDrag}
        onClick={() => { if (Date.now() - suppressClickRef.current < 500) return; setOpen((v) => !v); }}
        aria-label={open ? 'Close backpack' : 'Open backpack'}
        title={equipped ? `Backpack — drag to move · equipped: ${equipped.name}` : 'Backpack — drag to move'}
        style={{
          position: 'fixed', zIndex: 150,
          width: BACKPACK_ICON_SIZE, height: BACKPACK_ICON_SIZE, borderRadius: '50%',
          border: '2px solid #d8b25c', background: 'rgba(18,16,28,0.85)',
          color: '#fff', cursor: dragPx ? 'grabbing' : 'grab', fontSize: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 22px rgba(216,178,92,0.22)',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          ...iconPosStyle,
        }}
      >
        <span aria-hidden="true">🎒</span>
        {totalQty > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -4, right: -4,
              minWidth: 20, height: 20, padding: '0 4px', borderRadius: '50%',
              background: '#d8b25c', color: '#1a1426', fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{totalQty > 99 ? '99+' : totalQty}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Backpack"
          style={{
            position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
            background: 'rgba(0,0,0,0.6)',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: 'min(92vw, 360px)', maxHeight: '82vh', overflowY: 'auto',
              background: '#12101c', border: '2px solid #d8b25c', borderRadius: 16,
              padding: '1rem', color: '#fff', fontFamily: 'inherit', textAlign: 'left',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 800 }}>🎒 Backpack</div>
              <button
                type="button" onClick={() => setOpen(false)} aria-label="Close backpack"
                style={{ border: '1px solid rgba(255,255,255,0.25)', background: 'none', color: '#fff', borderRadius: 999, width: 32, height: 32, cursor: 'pointer' }}
              >✕</button>
            </div>

            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
              🪙 {record.tallies.gold.toLocaleString('en-US')} field gold · ◆ {record.tallies.aether.toLocaleString('en-US')} field aether
              <span style={{ opacity: 0.6 }}> — Earth 2 field tallies, not ledger balances</span>
            </div>

            <div style={{ fontSize: 13, marginTop: 10, padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(216,178,92,0.12)', border: '1px solid rgba(216,178,92,0.35)' }}>
              {equipped ? (
                <>
                  <div>⚔ Equipped: {weaponLine(equipped)}</div>
                  <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>
                    Last equipped in {realmLabel}
                    {' · '}
                    <button
                      type="button"
                      onClick={() => updateBackpack((rec) => setActiveWeapon(rec, null, realm))}
                      style={{ background: 'none', border: 'none', color: '#d8b25c', cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}
                    >Unequip</button>
                  </div>
                </>
              ) : 'No weapon equipped.'}
              <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>{combatNote}</div>
            </div>

            {/* Lightsaber slot (Merlin, 2026-10-24): before the user
                owns a saber this is a link to the crystal forge —
                the Kyber Smith's commissions on the Weapons Forge
                page. Once a saber is created it lives here in
                place of the link, with the same Equip behaviour
                as any other weapon. Flow layout, no overlap. */}
            <div style={{ fontSize: 13, marginTop: 10, padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(103,232,249,0.10)', border: '1px solid rgba(103,232,249,0.35)' }}>
              <div style={{ fontWeight: 700 }}>🔦 Lightsaber</div>
              {!saber ? (
                <div style={{ marginTop: 2 }}>
                  <Link href="/weapons-forge" style={{ color: '#67e8f9', fontWeight: 700 }}>
                    Forge your first saber →
                  </Link>
                  <span style={{ opacity: 0.7 }}> at the Kyber Smith&apos;s crystal forge</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ minWidth: 0 }}>{weaponLine(saber)}</span>
                  {equipped && equipped.uid === saber.uid ? (
                    <span style={{ color: '#d8b25c', fontWeight: 700, flexShrink: 0 }}>Equipped</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateBackpack((rec) => setActiveWeapon(rec, saber.uid, realm))}
                      style={{ background: '#d8b25c', color: '#1a1426', border: 'none', borderRadius: 999, padding: '0.25rem 0.8rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                    >Equip</button>
                  )}
                </div>
              )}
            </div>

            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 12 }}>⚔️ Weapons</div>
            {weapons.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>No weapons yet — the Weapons Forge awaits.</div>}
            {weapons.map((w) => {
              const isEq = equipped && equipped.uid === w.uid;
              return (
                <div key={w.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, padding: '0.35rem 0' }}>
                  <span style={{ minWidth: 0 }}>{weaponLine(w)}</span>
                  {isEq ? (
                    <span style={{ color: '#d8b25c', fontWeight: 700, flexShrink: 0 }}>Equipped</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateBackpack((rec) => setActiveWeapon(rec, w.uid, realm))}
                      style={{ background: '#d8b25c', color: '#1a1426', border: 'none', borderRadius: 999, padding: '0.25rem 0.8rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                    >Equip</button>
                  )}
                </div>
              );
            })}

            {KIND_GROUPS.map((g) => {
              const items = itemsOfKind(record, g.kind);
              if (items.length === 0) return null;
              return (
                <div key={g.kind} style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{g.icon} {g.label}</div>
                  {items.map((it) => (
                    <div key={it.uid} style={{ fontSize: 13, opacity: 0.85, padding: '0.15rem 0' }}>
                      {it.name} × {it.qty}
                    </div>
                  ))}
                </div>
              );
            })}

            <div style={{ marginTop: 14 }}>
              <Link href="/profile" style={{ color: '#d8b25c', fontWeight: 700, fontSize: 13 }}>
                View full profile →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
