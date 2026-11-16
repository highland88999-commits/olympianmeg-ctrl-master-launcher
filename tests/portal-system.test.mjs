// tests/portal-system.test.mjs — THE PORTAL SYSTEM (Merlin, Nov 13, 2026).
// Two horizontal nanite discs in the hub (Heaven above the tower top,
// Nether below Earth), the aurora boot + holographic room, the Heaven
// unlock (1 Nether visit), and the Portal Gun (10 portals, in the
// backpack, fired from anywhere the pack lives). Street monuments
// 16:9 ride here too (point 8).
// Run: node tests/portal-system.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits
// (same grep style as the hub suites).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  HEAVEN_PORTAL,
  NETHER_PORTAL,
  HEAVEN_UNLOCK_VISITS,
  PORTAL_GUN_VISITS,
  PORTAL_REALMS,
  portalRealmByKey,
  realmsForSide,
  hueForRealm,
  realmCardNote,
} from '../lib/portal/realms.js';
import {
  emptyPortalProgress,
  sanitizePortalProgress,
  recordPortalEntryFromRoom,
  heavenUnlocked,
  portalGunEarned,
  portalsToGun,
} from '../lib/portal/progress.js';
import { FORGED_PORTAL_GUN_OPENING, hasForgedPortalGunEntry, hasPortalGun, healForgedPortalGun, maybeAwardPortalGun, PORTAL_GUN_ID } from '../lib/portal/gun.js';
import { PORTAL_GUN_FORGE_PROMPT } from '../lib/world-engine/forge-agent.js';
import { addItem, createItem, emptyBackpackRecord } from '../lib/backpack/backpack.js';
import { ORBIT_CENTER, EARTH_CENTER, EARTH_RADIUS } from '../lib/god-orbits.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- 1. The two hub portals: horizontal discs, placed by the design ---

test('heaven portal is a horizontal disc above the tower top', () => {
  // Tower tops sit at ~74 (god label 24.5 inner x 1.6 scale + 35);
  // the disc floats at y 100, centred on the hub axis.
  assert.equal(HEAVEN_PORTAL.center[0], ORBIT_CENTER.x);
  assert.equal(HEAVEN_PORTAL.center[2], ORBIT_CENTER.z);
  assert.ok(HEAVEN_PORTAL.center[1] > 74, `heaven disc y ${HEAVEN_PORTAL.center[1]} must clear the tower tops (~74)`);
  assert.ok(HEAVEN_PORTAL.radius > 0 && HEAVEN_PORTAL.ringRadius > HEAVEN_PORTAL.radius);
});

test('nether portal is a horizontal disc below Earth', () => {
  const earthBottom = EARTH_CENTER.y - EARTH_RADIUS; // -85
  assert.equal(NETHER_PORTAL.center[0], EARTH_CENTER.x);
  assert.equal(NETHER_PORTAL.center[2], EARTH_CENTER.z);
  assert.ok(NETHER_PORTAL.center[1] < earthBottom, `nether disc y ${NETHER_PORTAL.center[1]} must sit below Earth's underside (${earthBottom})`);
  assert.ok(NETHER_PORTAL.radius > 0 && NETHER_PORTAL.ringRadius > NETHER_PORTAL.radius);
});

test('hub discs render lying flat, not as vertical doorways', () => {
  const hub = src('../components/HubPortals.jsx');
  // Flat: the disc + ring meshes rotate -PI/2 about X (the Hades
  // ground-ring pattern). No standing-stone ring, no vertical arch.
  assert.ok(hub.includes('rotation={[-Math.PI / 2, 0, 0]}'), 'no horizontal rotation on the disc');
  // The one torus on a gate is the transit's gold exit ring, lying
  // FLAT around the disc rim (Merlin, Nov 13 ~22:27) — a vertical
  // doorway torus would stand upright instead.
  const torusCount = (hub.match(/torusGeometry/g) || []).length;
  assert.equal(torusCount, 1, 'exactly one torus: the flat gold transit ring');
  assert.ok(
    /<mesh rotation=\{\[-Math\.PI \/ 2, 0, 0\]\}[^>]*>\s*<torusGeometry/s.test(hub),
    'the gold torus lies flat (rotation -PI/2), never upright'
  );
});

// --- 2. Realm assignment ---

test('24 unique realms, 13 nether + 11 heaven', () => {
  assert.equal(PORTAL_REALMS.length, 24);
  assert.equal(new Set(PORTAL_REALMS.map((r) => r.key)).size, 24, 'realm keys unique');
  assert.equal(new Set(PORTAL_REALMS.map((r) => r.route)).size, 24, 'realm routes unique');
  const nether = PORTAL_REALMS.filter((r) => r.side === 'nether' || r.side === 'both');
  const heaven = PORTAL_REALMS.filter((r) => r.side === 'heaven' || r.side === 'both');
  assert.equal(nether.length, 14, '13 nether-realms + Elysium field door');
  assert.equal(heaven.length, 12, '11 higher realms + Orun');
  assert.equal(PORTAL_REALMS.filter((r) => r.side === 'nether').length, 12);
  assert.equal(PORTAL_REALMS.filter((r) => r.side === 'heaven').length, 10);
});

test('Orun lives in both portals; Elysium has two doors into one realm', () => {
  assert.equal(portalRealmByKey('orun').side, 'both');
  assert.equal(portalRealmByKey('elysium').side, 'both');
  assert.equal(portalRealmByKey('elysium').route, '/elysium', 'one Elysium, one route');
  assert.ok(realmsForSide('heaven').some((r) => r.key === 'orun'), 'Orun in the upper portal');
  assert.ok(realmsForSide('nether').some((r) => r.key === 'orun'), 'Orun in the lower portal');
  assert.ok(realmsForSide('nether').some((r) => r.key === 'elysium'), 'Elysium field door in the lower portal');
  assert.ok(realmCardNote(portalRealmByKey('elysium'), 'nether').includes('one Elysium'), 'field door says so');
});

test('every portal route exists as a live app route', () => {
  for (const r of PORTAL_REALMS) {
    assert.ok(existsSync(new URL(`../app${r.route}/page.jsx`, import.meta.url)), `no page for ${r.label} (${r.route})`);
  }
});

test('every realm carries its own hue (a real hex, never blank)', () => {
  for (const r of PORTAL_REALMS) {
    assert.match(r.hue, /^#[0-9a-f]{6}$/, `${r.label} hue`);
  }
  assert.equal(hueForRealm('hades'), '#ffb03a');
  assert.equal(hueForRealm('nope'), '#7c3aed', 'unknown realm falls back to portal violet');
});

test('carousel counts: heaven 12 cards, nether 15, gun 25', () => {
  assert.equal(realmsForSide('heaven').length, 12);
  assert.equal(realmsForSide('nether').length, 14);
  assert.equal(realmsForSide('gun').length, 24);
  assert.deepEqual(realmsForSide('bogus'), []);
});

// --- 3. Progress: unlock + gun rules ---

test('progress sanitizes junk to an empty record', () => {
  assert.deepEqual(sanitizePortalProgress(null), emptyPortalProgress());
  assert.deepEqual(sanitizePortalProgress({ netherVisits: -3, totalPortals: 'x', gunGranted: 'yes' }), emptyPortalProgress());
  assert.deepEqual(sanitizePortalProgress({ netherVisits: 2, totalPortals: 5 }), { v: 1, netherVisits: 2, totalPortals: 5, gunGranted: false });
});

test('a nether entry counts toward Heaven; a heaven entry does not', () => {
  const empty = emptyPortalProgress();
  const afterNether = recordPortalEntryFromRoom(empty, 'hades', 'nether');
  assert.equal(afterNether.netherVisits, 1);
  assert.equal(afterNether.totalPortals, 1);
  const afterHeaven = recordPortalEntryFromRoom(empty, 'elysium', 'heaven');
  assert.equal(afterHeaven.netherVisits, 0);
  assert.equal(afterHeaven.totalPortals, 1);
  // The gun into a nether realm is still a nether visit.
  const afterGun = recordPortalEntryFromRoom(empty, 'kur', 'gun');
  assert.equal(afterGun.netherVisits, 1);
  const afterGunHeaven = recordPortalEntryFromRoom(empty, 'valhalla', 'gun');
  assert.equal(afterGunHeaven.netherVisits, 0);
});

test('unknown realm keys never count', () => {
  const next = recordPortalEntryFromRoom(emptyPortalProgress(), 'atlantis', 'nether');
  assert.deepEqual(next, emptyPortalProgress());
});

test('Heaven unlocks at exactly 1 Nether visit', () => {
  assert.equal(HEAVEN_UNLOCK_VISITS, 1);
  assert.equal(heavenUnlocked(emptyPortalProgress()), false);
  assert.equal(heavenUnlocked(recordPortalEntryFromRoom(emptyPortalProgress(), 'hades', 'nether')), true);
});

test('Portal Gun earns at exactly 10 portals', () => {
  assert.equal(PORTAL_GUN_VISITS, 10);
  let p = emptyPortalProgress();
  for (let i = 0; i < 9; i += 1) p = recordPortalEntryFromRoom(p, 'hades', 'nether');
  assert.equal(portalGunEarned(p), false);
  assert.equal(portalsToGun(p), 1);
  p = recordPortalEntryFromRoom(p, 'helheim', 'nether');
  assert.equal(portalGunEarned(p), true);
  assert.equal(portalsToGun(p), 0);
});

// --- 4. The gun in the backpack ---

test('the gun is granted once, only when earned, with a reticle', () => {
  const pack = emptyBackpackRecord();
  const notEarned = emptyPortalProgress();
  assert.equal(maybeAwardPortalGun(pack, notEarned), pack, 'not earned: same record back');
  let p = emptyPortalProgress();
  for (let i = 0; i < 10; i += 1) p = recordPortalEntryFromRoom(p, 'hades', 'nether');
  const granted = maybeAwardPortalGun(pack, p);
  assert.notEqual(granted, pack);
  assert.equal(hasPortalGun(granted), true);
  const gun = granted.items.find((e) => e.id === PORTAL_GUN_ID);
  assert.equal(gun.kind, 'weapon');
  assert.equal(gun.meta.reticle.style, 'crosshair', 'reticle law: a firearm wears a crosshair');
  assert.equal(maybeAwardPortalGun(granted, p), granted, 'already held: same record back, never duplicated');
});

// A Portal Gun forged through the forge before the mint learned
// the gun's identity: a generic timestamp-id weapon entry, name
// 'Portal Gun', description the canonical prompt.
function forgedGunPack() {
  const entry = createItem({
    id: 'world-engine-weapon-m1234',
    kind: 'weapon',
    name: 'Portal Gun',
    meta: {
      weaponClass: 'firearm',
      damage: 0,
      source: 'world-engine-weapon-builder',
      description: PORTAL_GUN_FORGE_PROMPT.description,
    },
  });
  return addItem(emptyBackpackRecord(), entry);
}

test('the heal re-ids a forged Portal Gun to portal-gun, in place', () => {
  const pack = forgedGunPack();
  assert.equal(hasPortalGun(pack), false, 'before the heal: no gun by id');
  assert.equal(hasForgedPortalGunEntry(pack), true);
  const before = pack.items.find((e) => e.name === 'Portal Gun');
  const healed = healForgedPortalGun(pack);
  assert.notEqual(healed, pack, 'a new record when something heals');
  assert.equal(hasPortalGun(healed), true, 'after the heal: the Fire button appears');
  assert.equal(hasForgedPortalGunEntry(healed), false, 'nothing left to heal');
  const gun = healed.items.find((e) => e.id === PORTAL_GUN_ID);
  assert.equal(gun.uid, before.uid, 'same entry — an equipped gun stays equipped');
  assert.equal(gun.meta.description, PORTAL_GUN_FORGE_PROMPT.description, 'meta untouched');
  assert.equal(gun.meta.damage, 0);
  assert.equal(healed.items.length, pack.items.length, 'no entry added, none removed');
  assert.equal(healForgedPortalGun(healed), healed, 'second heal: same record back, idempotent');
});

test('the heal leaves other weapons alone and never fires on a lookalike', () => {
  const lookalike = createItem({
    id: 'world-engine-weapon-m5678',
    kind: 'weapon',
    name: 'Portal Gun',
    meta: { weaponClass: 'firearm', description: 'A chunky sci-fi hand cannon that shoots glowing plasma bolts.' },
  });
  const pack = addItem(emptyBackpackRecord(), lookalike);
  assert.equal(hasForgedPortalGunEntry(pack), false, 'name alone is not the gun');
  assert.equal(healForgedPortalGun(pack), pack, 'same record back, untouched');
  // The award gun's description opens differently — never re-healed.
  const award = maybeAwardPortalGun(emptyBackpackRecord(), (() => {
    let p = emptyPortalProgress();
    for (let i = 0; i < 10; i += 1) p = recordPortalEntryFromRoom(p, 'hades', 'nether');
    return p;
  })());
  assert.equal(healForgedPortalGun(award), award);
  assert.ok(!award.items[0].meta.description.startsWith(FORGED_PORTAL_GUN_OPENING));
});

test('no second gun at 10 portals once the forged gun is healed', () => {
  const healed = healForgedPortalGun(forgedGunPack());
  let p = emptyPortalProgress();
  for (let i = 0; i < 10; i += 1) p = recordPortalEntryFromRoom(p, 'hades', 'nether');
  assert.equal(portalGunEarned(p), true);
  assert.equal(maybeAwardPortalGun(healed, p), healed, 'already held: same record back, never duplicated');
  assert.equal(healed.items.filter((e) => e.id === PORTAL_GUN_ID).length, 1);
});

test('the heal never duplicates when the real gun is already held', () => {
  let p = emptyPortalProgress();
  for (let i = 0; i < 10; i += 1) p = recordPortalEntryFromRoom(p, 'hades', 'nether');
  const withAward = maybeAwardPortalGun(emptyBackpackRecord(), p);
  const forged = createItem({
    id: 'world-engine-weapon-m9999',
    kind: 'weapon',
    name: 'Portal Gun',
    meta: { weaponClass: 'firearm', description: PORTAL_GUN_FORGE_PROMPT.description },
  });
  const both = addItem(withAward, forged);
  assert.equal(healForgedPortalGun(both), both, 'gun already held: same record back, no re-id');
  assert.equal(both.items.filter((e) => e.id === PORTAL_GUN_ID).length, 1);
});

// --- 5. Wiring: the portals, the room, and the gun, in the app ---

test('hub mounts both discs behind the street-level gate, heaven gated on unlock', () => {
  const home = src('../components/HomeScene.jsx');
  assert.ok(home.includes("import HubPortals from './HubPortals'"), 'HubPortals imported');
  assert.ok(home.includes('<HubPortals heavenUnlocked={heavenUnlocked} onPortalClick={onHubPortal} />'), 'HubPortals mounted with props');
  const hub = src('../components/HubPortals.jsx');
  assert.ok(hub.includes('heavenUnlocked &&'), 'heaven disc renders only when unlocked');
  assert.ok(hub.includes('window.__hubPortals'), 'headless probe hook');
  assert.ok(hub.includes('AuroraField'), 'aurora field streams down from the heaven disc');
  assert.ok(hub.includes('paintPortalSwirl'), 'discs reuse the living swirl painter');
});

test('hub page opens the room on a portal click and passes the unlock down', () => {
  const page = src('../app/page.jsx');
  assert.ok(page.includes("import PortalRoom from '@/components/PortalRoom'"), 'PortalRoom imported');
  assert.ok(page.includes('onHubPortal={handleHubPortal}'), 'click handler reaches the scene');
  assert.ok(page.includes('heavenUnlocked={portalHeavenUnlocked(portalProgress)}'), 'unlock reaches the scene');
  assert.ok(page.includes('<PortalRoom'), 'room mounted in the hub page');
  assert.ok(page.includes('window.__portalRoom'), 'headless probe hook opens the room');
});

test('the room boots the aurora, shows the holographic carousel, and rides the vortex tinted', () => {
  const room = src('../components/PortalRoom.jsx');
  assert.ok(room.includes('useVortexTravel'), 'the one vortex system carries the traveller');
  assert.ok(room.includes('BOOT_MS') && room.includes('Booting'), 'aurora boot sequence');
  assert.ok(room.includes('scrollSnapType'), 'horizontally scrolling carousel');
  assert.ok(room.includes('realmsForSide(side)'), 'cards come from the realm assignment');
  assert.ok(room.includes('selectedRealm.hue'), 'transit tinted by the realm hue');
  assert.ok(room.includes('recordPortalEntryFromRoom'), 'entries are counted');
  assert.ok(room.includes('maybeAwardPortalGun'), 'the gun is awarded from the room');
  assert.ok(room.includes('Heaven portal unlocked'), 'unlock is announced, not silent');
});

test('the gun fires from everywhere the backpack lives', () => {
  const profile = src('../components/profile/BackpackSection.jsx');
  const hud = src('../components/backpack/BackpackHud.jsx');
  assert.ok(profile.includes('<PortalGunCard />'), 'profile pack carries the gun card');
  assert.ok(hud.includes('<PortalGunCard onClosePanel={() => setOpen(false)} />'), 'realm pack panels carry the gun card');
  const card = src('../components/PortalGunCard.jsx');
  assert.ok(card.includes('<PortalRoom side="gun"'), 'firing opens the gun room');
  assert.ok(card.includes('Fire'), 'a Fire button');
});

test('the gun catches up when the count already says earned but the pack does not hold it', () => {
  const card = src('../components/PortalGunCard.jsx');
  assert.ok(card.includes('portalGunEarned(progress)'), 'card reads the earn state');
  assert.ok(card.includes('maybeAwardPortalGun'), 'card can grant the gun itself');
  assert.ok(card.includes('updateBackpack'), 'card writes the grant into the backpack');
  assert.ok(card.includes('useEffect'), 'the catch-up runs on mount, not on a tap');
});

test('the card heals a forged Portal Gun the moment it mounts', () => {
  const card = src('../components/PortalGunCard.jsx');
  assert.ok(card.includes('healForgedPortalGun'), 'card runs the forged-gun heal');
  assert.ok(card.includes('hasForgedPortalGunEntry'), 'card only writes when a forged gun is waiting');
  assert.ok(card.includes('needsHeal'), 'the heal write is guarded, so the effect no-ops once healed');
});

test('the Portal Gun card in My Weapons fires, and no other weapon card does', () => {
  const mine = src('../components/profile/MyCreations.jsx');
  assert.ok(mine.includes("import PortalRoom from '@/components/PortalRoom'"), 'PortalRoom imported');
  assert.ok(mine.includes("FORGED_PORTAL_GUN_OPENING"), 'the card is recognised by the forged gun\'s prompt line');
  assert.ok(mine.includes('<PortalRoom side="gun"'), 'firing opens the gun room');
  assert.ok(mine.includes('isPortalGun'), 'a portal-gun gate on the card');
  // The Fire button renders only behind that gate — every other
  // weapon card (Rename / View prompt / List for sale) carries no
  // Fire button. The Download button (Merlin, Nov 15 — the
  // profile order, same push) is the one sanctioned addition to
  // every card, gun or not: it downloads the asset and never
  // fires a portal.
  const gateAt = mine.indexOf('{isPortalGun && (');
  const fireAt = mine.indexOf('🔫 Fire');
  assert.ok(gateAt >= 0, 'the portal-gun gate exists');
  assert.ok(fireAt > gateAt, 'Fire sits behind the portal-gun gate');
  assert.equal((mine.match(/🔫 Fire/g) || []).length, 1, 'exactly one Fire button in the file');
  assert.ok(mine.includes('⬇ Download'), 'the sanctioned Download button is on every card');
  assert.ok(mine.includes("await import('@/lib/world-engine/creation-download')"), 'Download loads the download module, not the portal room');
});

// --- 6. Billboards 16:9 (point 8): the monument face is 16:9, look unchanged ---

test('street monument face is 16:9 at the tower-panel scale', () => {
  const monument = src('../components/argo/BillboardMonument.jsx');
  const faceW = 28.0;
  const faceH = 15.75;
  assert.ok(monument.includes('FACE_W = 28.0') && monument.includes('FACE_H = 15.75'));
  assert.ok(Math.abs(faceW / faceH - 16 / 9) < 0.001, '28.0/15.75 is 16:9');
  assert.ok(monument.includes('FRAME_W = 28.45'), 'frame keeps the 0.225 inset');
  assert.ok(!monument.includes('FACE_W = 9.0'), 'no 4:7 face left');
});
