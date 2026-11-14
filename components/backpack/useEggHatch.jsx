'use client';

// components/backpack/useEggHatch.js
// THE BACKPACK EGG HATCH (Merlin, 2026-11-14): the baby-dino
// egg / dino selection function lives in the backpack — in
// EVERY realm the backpack lives in. The BackpackHud mounts
// this hook by default, so an egg row is tappable in any realm
// and the species picker opens there; Earth 2 passes its own
// onEggHatch instead (its scene-owned hatch, with the titles
// leg and the live-allies cap count) and this hook stays idle.
//
// The law is lib/earth2/hatch.js (cold egg refuses, 1 dino
// for anyone / 4 for a land owner, tap = hatch right away, the
// user picks the species, the baby hatches INTO the backpack).
// This hook is only the thin shell around it: it resolves who
// the user is (explicit email, else the signed-in session),
// reads the device-local claims for the landowner leg, opens
// the picker, and mints the dino into the record on pick.
// Feedback goes to onNotice when the realm passes one;
// otherwise the hook shows its own top-centre toast, so a
// realm with no notice of its own still answers the tap.

import { useCallback, useEffect, useRef, useState } from 'react';
import DinoSelectionMenu from '@/components/earth2/DinoSelectionMenu';
import { getBackpackRecord, updateBackpack } from '@/lib/backpack/store';
import { loadLocalClaims } from '@/lib/earth2/build-store';
import { hatchEggRecord, hatchPrecheck, isLandownerFor } from '@/lib/earth2/hatch';

// The signed-in email, resolved once per page load — the
// session read is async, so the hatch tap awaits it (a few
// milliseconds; the picker opens right after).
let cachedEmailPromise = null;
async function currentUserEmail() {
  if (!cachedEmailPromise) {
    cachedEmailPromise = (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.auth.getSession();
        return (data && data.session && data.session.user && data.session.user.email) || '';
      } catch {
        return '';
      }
    })();
  }
  return cachedEmailPromise;
}

export default function useEggHatch({ email, owners, claims, liveDinoIds, onNotice } = {}) {
  const [pickEgg, setPickEgg] = useState(null);
  const [note, setNote] = useState('');
  const noteTimer = useRef(null);
  const pickEggRef = useRef(null);
  // The ownership context resolved at tap time — the picker
  // needs the same email/owners/claims when the user picks,
  // and the record may have moved since the tap.
  const hatchCtxRef = useRef(null);

  const notify = useCallback((text) => {
    if (typeof onNotice === 'function') {
      onNotice(text);
      return;
    }
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), 4000);
  }, [onNotice]);

  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);

  // Tap an egg in the backpack: cold or cap-full answers with
  // the plain reason; otherwise the species picker opens.
  const hatch = useCallback(async (eggItem) => {
    if (!eggItem) return;
    const myEmail = email || (await currentUserEmail());
    const myClaims = claims || loadLocalClaims();
    const landowner = isLandownerFor(myEmail, owners, myClaims);
    const rec = getBackpackRecord();
    const pre = hatchPrecheck(eggItem, {
      items: rec.items || [],
      isLandowner: landowner,
      liveDinoIds: liveDinoIds || [],
    });
    if (!pre.ok) {
      if (pre.reason) notify(pre.reason);
      return;
    }
    hatchCtxRef.current = { email: myEmail, owners, claims: myClaims };
    pickEggRef.current = eggItem;
    setPickEgg(eggItem);
  }, [email, owners, claims, liveDinoIds, notify]);

  const closePicker = useCallback(() => {
    pickEggRef.current = null;
    hatchCtxRef.current = null;
    setPickEgg(null);
  }, []);

  // The picker: the user chooses what hatches; the baby mints
  // INTO the backpack (state 'pack') — no spawn here.
  const picker = pickEgg ? (
    <DinoSelectionMenu
      onPick={(dino) => {
        const egg = pickEggRef.current;
        const ctx = hatchCtxRef.current || { email: email || '', owners, claims: claims || [] };
        if (egg) {
          updateBackpack((r) => {
            const items = hatchEggRecord(r.items || [], egg, dino.id, {
              email: ctx.email,
              owners: ctx.owners,
              claims: ctx.claims,
            });
            return { ...r, items };
          });
          notify(`🥚 A baby ${dino.label} hatches — it lives in your backpack now. Tap it to summon.`);
        }
        closePicker();
      }}
      onClose={closePicker}
    />
  ) : null;

  // Fallback toast — only when the realm passed no onNotice.
  // The picker overlay covers the screen while open; the toast
  // sits above it so a refusal is never hidden behind it.
  const toast = note ? (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', top: '4.5rem', transform: 'translateX(-50%)',
        zIndex: 300, maxWidth: 'calc(100vw - 2rem)', textAlign: 'center',
        background: 'rgba(18,16,28,0.92)', border: '1px solid #d8b25c',
        color: '#fff', borderRadius: 999, padding: '0.5rem 1rem',
        fontSize: 13, pointerEvents: 'none',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      }}
    >{note}</div>
  ) : null;

  return { hatch, picker, toast };
}
