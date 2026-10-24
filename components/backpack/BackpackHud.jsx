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

import { useState } from 'react';
import Link from 'next/link';
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close backpack' : 'Open backpack'}
        title={equipped ? `Backpack — equipped: ${equipped.name}` : 'Backpack'}
        style={{
          minHeight: 36, padding: '0.3rem 0.7rem', borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.45)',
          color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        🎒 {totalQty > 0 ? totalQty : ''}
        {equipped ? <span style={{ opacity: 0.8, fontWeight: 400, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{equipped.name}</span> : null}
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
