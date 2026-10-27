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
  backpackIconKeys,
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
 *   docked: true when the mount is the realm's backpack HOME —
 *     the circle renders in flow next to that realm's main
 *     controls (its home slot) instead of floating, and persists
 *     under the separate v2 key pair so pre-home parked spots
 *     never win. Dragging still lifts it out of flow to a fixed
 *     spot, which then persists like any dragged spot.
 *   homeFractions: opt-in FIXED home slot for this mount (Earth
 *     2, Merlin 2026-10-26) — viewport fractions where the
 *     circle sits next to the realm's main control buttons, on
 *     screen whether or not any panel is expanded. While it is
 *     set, the mount reads the v2 key pair, so a pre-home parked
 *     spot never pulls it back, and the home is the fallback
 *     until the user drags after the home change. The circle
 *     stays draggable afterwards, like any user-movable control.
 *     Mounts with neither docked nor homeFractions keep the v1
 *     pair and today's behaviour exactly.
 *   headerDeadSpaceMinimize: opt-in (Earth 2) — a click on the
 *     blank area of the backpack dialog's header row closes it
 *     (its minimized state); the close button and the title
 *     text keep their own behaviour.
 */
export default function BackpackHud({ realm, realmLabel, combatApplies = false, displayNote = null, docked = false, homeFractions = null, headerDeadSpaceMinimize = false }) {
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
  // debounced, and the account copy wins on login. Signed out,
  // the device copy stands alone.
  //
  // HOME (Merlin, 2026-10-26): a mount with docked={true} renders
  // the circle IN FLOW inside its parent — its home slot next to
  // that realm's main controls — instead of fixed-position. A
  // docked mount persists under the SEPARATE v2 key pair, so it
  // never reads a pre-home parked spot: while v2 is empty the
  // circle sits in its home; once the user drags it (dragging
  // lifts it out of flow to a fixed spot, exactly like the
  // Concourse Orb), the dropped spot persists and later renders
  // use it. A mount with homeFractions (Earth 2) keeps the fixed
  // circle but homes it at those fractions under the same v2
  // pair, so its pre-home parked spot is likewise superseded —
  // and it stays on screen even when its host panel is shrunk,
  // which an in-flow mount cannot do. Non-homed mounts (Mars/
  // Planet consoles) keep the v1 pair and today's fixed behaviour
  // exactly.
  // The icon is fixed-position when floating — the accepted
  // exception to the no-overlap rule for user-draggable controls,
  // same as the Concourse panels; nothing else here is absolutely
  // positioned except the count badge inside the circle itself.
  // When docked and at home, the button sets pointerEvents auto
  // so it stays tappable inside rows that are pointer-events-none
  // (e.g. Star Wars' zoneTop).
  const iconKeys = backpackIconKeys(docked || homeFractions != null);
  const [iconFrac, setIconFrac] = useState(null);
  const [dragPx, setDragPx] = useState(null);
  const [viewport, setViewport] = useState(null);
  const iconRef = useRef(null);
  const suppressClickRef = useRef(0);
  const saveTimerRef = useRef(null);

  const persistIcon = useCallback((frac) => {
    try {
      localStorage.setItem(iconKeys.storage, JSON.stringify(frac));
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
          body: JSON.stringify({ preferences: { [iconKeys.uiState]: frac } }),
        });
        // NOTE: until the route accepts the key, this answers 400
        // and is ignored — localStorage already holds the spot,
        // and the next drag retries.
      } catch {
        // offline — localStorage already holds it; next drag retries
      }
    }, BACKPACK_ICON_SAVE_DEBOUNCE_MS);
  }, [iconKeys.storage, iconKeys.uiState]);

  // Hydrate: localStorage instantly; the account copy wins when
  // signed in (the Concourse rule — that is what will carry the
  // icon's spot to a new device at login). A resize/rotation listener
  // keeps fractions rendering back inside the viewport at every size.
  // (Keys come from the first render's docked/homeFractions props,
  // which never change for a mount — homed mounts read the v2 pair,
  // so a pre-home parked spot is never picked up; with v2 empty a
  // docked icon stays null here and renders in its in-flow home
  // slot, while a homeFractions icon resolves to its home.)
  useEffect(() => {
    const applyViewport = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    applyViewport();
    window.addEventListener('resize', applyViewport);
    let local = null;
    try {
      const raw = localStorage.getItem(iconKeys.storage);
      local = raw ? JSON.parse(raw) : null;
    } catch {}
    const resolved = docked
      ? resolveBackpackIconPosition({ local })
      : resolveBackpackIconPosition({
        local,
        fallback: homeFractions
          || defaultBackpackIconFractions(window.innerWidth, window.innerHeight, BACKPACK_ICON_SIZE),
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
        const server = resolveBackpackIconPosition({ server: data && data.preferences ? data.preferences[iconKeys.uiState] : null });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Drag origin: a floating icon starts from its fractions; a
    // docked icon at home starts from its on-screen box (its row
    // slot), so it never jumps when the drag begins.
    const origin = iconFrac
      ? clampBackpackIconPx(backpackIconFracToPx(iconFrac, vw, vh, BACKPACK_ICON_SIZE), vw, vh, BACKPACK_ICON_SIZE)
      : docked
        ? (() => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top }; })()
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
  // Floating (dragged, or a non-docked mount) renders fixed at
  // its spot; a docked mount with no stored spot renders IN FLOW
  // in its home slot — no left/top/bottom offsets at all.
  const iconPosStyle = dragPx
    ? { left: dragPx.x, top: dragPx.y }
    : iconPx
      ? { left: iconPx.x, top: iconPx.y }
      : docked
        ? {}
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
          Concourse Orb). When floating it is fixed-position, so
          its owner can drag it anywhere on screen; when docked
          and at home it renders in flow inside its parent row —
          its home slot next to that realm's main controls. The
          equipped weapon's name no longer fits on the circle
          itself — it lives in the title tooltip and in the panel
          header, as before. The count badge sits inside the
          circle itself. */}
      <button
        ref={iconRef}
        type="button"
        onPointerDown={beginIconDrag}
        onClick={() => { if (Date.now() - suppressClickRef.current < 500) return; setOpen((v) => !v); }}
        aria-label={open ? 'Close backpack' : 'Open backpack'}
        title={equipped ? `Backpack — drag to move · equipped: ${equipped.name}` : 'Backpack — drag to move'}
        style={{
          position: (dragPx || iconPx) ? 'fixed' : (docked ? 'relative' : 'fixed'),
          zIndex: 150,
          width: BACKPACK_ICON_SIZE, height: BACKPACK_ICON_SIZE, borderRadius: '50%',
          border: '2px solid #d8b25c', background: 'rgba(18,16,28,0.85)',
          color: '#fff', cursor: dragPx ? 'grabbing' : 'grab', fontSize: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 22px rgba(216,178,92,0.22)',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          pointerEvents: 'auto', flexShrink: 0,
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
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
              onClick={headerDeadSpaceMinimize ? (e) => {
                // HEADER DEAD-SPACE MINIMIZE (Merlin, 2026-10-26):
                // a click on the blank area of this header row
                // closes the dialog (its minimized state). The
                // close button and the title text keep their own
                // behaviour — only dead space closes.
                if (e.target.closest('button')) return;
                if (e.target.closest('[data-backpack-title]')) return;
                setOpen(false);
              } : undefined}
            >
              <div style={{ fontWeight: 800 }} data-backpack-title>🎒 Backpack</div>
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
