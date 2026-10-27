// tests/billboard-playlist.test.mjs — Merlin's billboard playlist rule
// (2026-10-27). Run: node tests/billboard-playlist.test.mjs (from
// the repo root).
//
// Rules under test:
// - ROTATING board: newest published paid ad first, older paid ads
//   newest-first, house ad LAST (even when the house timestamp is
//   newest — house-last is unconditional).
// - Publish time is the queue row's sent_at (Send stamps it); rows
//   sharing one send batch tie-break on created_at (earlier-staged
//   plays later); timestamp-less entries keep manifest order.
// - SOLO board: an ACTIVE solo subscription plays ALONE — house and
//   rotating entries are off that number. Paused/cancelled solos do
//   not enforce.
// - SOLO ENDS: the next wire restores house + still-sent rotating ads
//   newest-first (never a blank board) — the wire takes the ended
//   solo's company+link as endedSoloTriples, since it cannot tell an
//   ex-solo entry from a rotating entry by shape alone.
// - Wirings MERGE: boards untouched by rows or solo keep their
//   entries (house on still-unsold panels is never wholesale-
//   replaced away).
// - Panel resolution agrees with wire order: manifestToOverrides
//   orders the same way and enforces a solo map even on a stale
//   manifest; the rotation cycler still just walks the array in
//   order, and a single entry stays static.
import assert from 'node:assert';
import {
  orderBoardEntries,
  resolveBoardPlaylist,
  isActiveSoloSubscription,
  soloEntryFromSubscription,
  normalizeSoloInput,
  wireQueueIntoManifest,
} from '../lib/billboards/playlist.js';
import {
  manifestToOverrides,
  overrideSlotFor,
  nextRotationIndex,
  clampRotationIndex,
  billboardRotates,
} from '../lib/billboards/overrides.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

const HOUSE = {
  company: 'Olympus',
  link: 'https://olympusverse.com/request-billboard',
  creativeType: 'video',
  creativeUrl: '/billboards/house-ad-space.mp4',
  house: true,
};
const paid = (company, publishedAt, createdAt) => ({
  company,
  link: `https://${company.toLowerCase()}.example/`,
  creativeType: 'image',
  creativeUrl: `/billboards/${company.toLowerCase()}.png`,
  publishedAt,
  createdAt,
});

// --- ordering ---

check('rotating: newest published paid first, older paid newest-first', () => {
  const out = orderBoardEntries([
    paid('Old', '2026-10-20T00:00:00.000Z', '2026-10-19T00:00:00.000Z'),
    paid('New', '2026-10-27T00:00:00.000Z', '2026-10-26T00:00:00.000Z'),
    paid('Mid', '2026-10-24T00:00:00.000Z', '2026-10-23T00:00:00.000Z'),
  ]);
  assert.deepEqual(out.map((e) => e.company), ['New', 'Mid', 'Old']);
});

check('rotating: house always last even with the newest timestamp', () => {
  const out = orderBoardEntries([
    { ...HOUSE, publishedAt: '2026-10-28T00:00:00.000Z' },
    paid('Paid', '2026-10-20T00:00:00.000Z', '2026-10-19T00:00:00.000Z'),
  ]);
  assert.deepEqual(out.map((e) => e.company), ['Paid', 'Olympus']);
});

check('rotating: same send batch ties break on created_at, earlier-staged plays later', () => {
  const out = orderBoardEntries([
    paid('First', '2026-10-27T10:00:00.000Z', '2026-10-26T09:00:00.000Z'),
    paid('Second', '2026-10-27T10:00:00.000Z', '2026-10-26T10:00:00.000Z'),
  ]);
  assert.deepEqual(out.map((e) => e.company), ['Second', 'First']);
});

check('rotating: timestamp-less entries keep manifest order (legacy manifests unchanged)', () => {
  const out = orderBoardEntries([
    { company: 'Acme', link: 'https://acme.example/', creativeType: 'image', creativeUrl: '/a.png' },
    { company: 'Beta', link: 'https://beta.example/', creativeType: 'video', creativeUrl: '/b.mp4' },
  ]);
  assert.deepEqual(out.map((e) => e.company), ['Acme', 'Beta']);
});

check('ordering never mutates the input array', () => {
  const input = [paid('A', '2026-10-20T00:00:00.000Z'), paid('B', '2026-10-27T00:00:00.000Z')];
  const snapshot = JSON.stringify(input);
  orderBoardEntries(input);
  assert.equal(JSON.stringify(input), snapshot);
});

// --- solo resolution ---

check('solo: active solo subscription plays alone, house + rotating evicted', () => {
  const sub = {
    plan: 'solo', status: 'active', billboard_number: 7,
    company_name: 'SoloCo', link_url: 'https://soloco.example/',
    creative_type: 'video', creative_url: '/billboards/solo.mp4',
  };
  assert.equal(isActiveSoloSubscription(sub), true);
  const out = resolveBoardPlaylist(
    [paid('Paid', '2026-10-27T00:00:00.000Z'), HOUSE],
    soloEntryFromSubscription(sub),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].company, 'SoloCo');
});

check('solo: paused and cancelled solos do not enforce', () => {
  const paused = { plan: 'solo', status: 'paused', company_name: 'X', link_url: 'https://x.example/', creative_type: 'image', creative_url: '/x.png' };
  const cancelled = { ...paused, status: 'cancelled' };
  const rotating = { plan: 'rotating', status: 'active', company_name: 'Y', link_url: 'https://y.example/', creative_type: 'image', creative_url: '/y.png' };
  assert.equal(isActiveSoloSubscription(paused), false);
  assert.equal(isActiveSoloSubscription(cancelled), false);
  assert.equal(isActiveSoloSubscription(rotating), false);
  assert.equal(normalizeSoloInput(paused), null);
  assert.equal(normalizeSoloInput(cancelled), null);
  assert.equal(normalizeSoloInput(rotating), null);
  const out = resolveBoardPlaylist([paid('Paid', '2026-10-27T00:00:00.000Z'), HOUSE], null);
  assert.deepEqual(out.map((e) => e.company), ['Paid', 'Olympus']);
});

check('solo: entry-shaped solo input resolves alone; bad solo input falls back to rotation', () => {
  const out = resolveBoardPlaylist([HOUSE], {
    company: 'SoloCo', link: 'https://soloco.example/', creativeType: 'image', creativeUrl: '/s.png',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].company, 'SoloCo');
  assert.deepEqual(
    resolveBoardPlaylist([paid('Paid', '2026-10-27T00:00:00.000Z'), HOUSE], { company: 'Broken' }).map((e) => e.company),
    ['Paid', 'Olympus'],
  );
});

// --- wire transform ---

const LIVE_HOUSE_MANIFEST = {
  version: 1,
  billboards: {
    7: { intervalSeconds: 15, entries: [{ ...HOUSE }] },
    8: { intervalSeconds: 15, entries: [{ ...HOUSE }] },
  },
};

check('wire: first paid wiring orders newest-first with house last, untouched boards keep house', () => {
  const out = wireQueueIntoManifest({
    manifest: LIVE_HOUSE_MANIFEST,
    sentRows: [
      { kind: 'ad', billboard_number: 7, company_name: 'Old', link_url: 'https://old.example/', creative_type: 'image', creative_url: '/old.png', rotation_interval_seconds: 15, is_house: false, created_at: '2026-10-26T09:00:00.000Z', sent_at: '2026-10-26T10:00:00.000Z' },
      { kind: 'ad', billboard_number: 7, company_name: 'New', link_url: 'https://new.example/', creative_type: 'video', creative_url: '/new.mp4', rotation_interval_seconds: 15, is_house: false, created_at: '2026-10-27T09:00:00.000Z', sent_at: '2026-10-27T10:00:00.000Z' },
    ],
    soloByNumber: new Map(),
    houseEntry: HOUSE,
  });
  assert.deepEqual(out.billboards['7'].entries.map((e) => e.company), ['New', 'Old', 'Olympus']);
  assert.equal(out.billboards['7'].entries[0].publishedAt, '2026-10-27T10:00:00.000Z');
  assert.deepEqual(out.billboards['8'].entries.map((e) => e.company), ['Olympus']);
});

check('wire: publish time is sent_at, not created_at', () => {
  const out = wireQueueIntoManifest({
    manifest: { version: 1, billboards: { 7: { intervalSeconds: 15, entries: [{ ...HOUSE }] } } },
    sentRows: [
      { kind: 'ad', billboard_number: 7, company_name: 'Staged', link_url: 'https://staged.example/', creative_type: 'image', creative_url: '/s.png', rotation_interval_seconds: 15, is_house: false, created_at: '2026-10-20T00:00:00.000Z', sent_at: '2026-10-27T00:00:00.000Z' },
    ],
    soloByNumber: new Map(),
    houseEntry: HOUSE,
  });
  assert.equal(out.billboards['7'].entries[0].publishedAt, '2026-10-27T00:00:00.000Z');
  assert.equal(out.billboards['7'].entries[0].createdAt, '2026-10-20T00:00:00.000Z');
});

check('wire: solo activation evicts house + rotating from that number only', () => {
  const out = wireQueueIntoManifest({
    manifest: { version: 1, billboards: {
      7: { intervalSeconds: 15, entries: [paid('Paid', '2026-10-27T00:00:00.000Z'), { ...HOUSE }] },
      8: { intervalSeconds: 15, entries: [{ ...HOUSE }] },
    } },
    sentRows: [],
    soloByNumber: new Map([[7, {
      plan: 'solo', status: 'active', company_name: 'SoloCo',
      link_url: 'https://soloco.example/', creative_type: 'video', creative_url: '/solo.mp4',
    }]]),
    houseEntry: HOUSE,
  });
  assert.deepEqual(out.billboards['7'].entries.map((e) => e.company), ['SoloCo']);
  assert.deepEqual(out.billboards['8'].entries.map((e) => e.company), ['Olympus']);
});

check('wire: solo end restores house + still-sent rotating newest-first, never blank', () => {
  const out = wireQueueIntoManifest({
    manifest: { version: 1, billboards: {
      7: { intervalSeconds: 15, entries: [{ company: 'SoloCo', link: 'https://soloco.example/', creativeType: 'video', creativeUrl: '/solo.mp4', house: false }] },
    } },
    sentRows: [
      { kind: 'ad', billboard_number: 7, company_name: 'Old', link_url: 'https://old.example/', creative_type: 'image', creative_url: '/old.png', rotation_interval_seconds: 15, is_house: false, created_at: '2026-10-26T09:00:00.000Z', sent_at: '2026-10-26T10:00:00.000Z' },
      { kind: 'ad', billboard_number: 7, company_name: 'New', link_url: 'https://new.example/', creative_type: 'video', creative_url: '/new.mp4', rotation_interval_seconds: 15, is_house: false, created_at: '2026-10-27T09:00:00.000Z', sent_at: '2026-10-27T10:00:00.000Z' },
    ],
    soloByNumber: new Map(),
    houseEntry: HOUSE,
    endedSoloTriples: [{ billboardNumber: 7, company: 'SoloCo', link: 'https://soloco.example/' }],
  });
  assert.deepEqual(out.billboards['7'].entries.map((e) => e.company), ['New', 'Old', 'Olympus']);
});

check('wire: an ended solo triple for another board (or a non-match) is harmless', () => {
  const out = wireQueueIntoManifest({
    manifest: { version: 1, billboards: {
      7: { intervalSeconds: 15, entries: [paid('Paid', '2026-10-27T00:00:00.000Z'), { ...HOUSE }] },
    } },
    sentRows: [],
    soloByNumber: new Map(),
    houseEntry: HOUSE,
    endedSoloTriples: [
      { billboardNumber: 8, company: 'Paid', link: 'https://paid.example/' },
      { billboardNumber: 7, company: 'Nobody', link: 'https://nobody.example/' },
    ],
  });
  assert.deepEqual(out.billboards['7'].entries.map((e) => e.company), ['Paid', 'Olympus']);
});

check('wire: remove rows delete their match; a board emptied by removals falls back to house', () => {
  const out = wireQueueIntoManifest({
    manifest: { version: 1, billboards: {
      7: { intervalSeconds: 15, entries: [paid('Paid', '2026-10-27T00:00:00.000Z'), { ...HOUSE }] },
    } },
    sentRows: [
      { kind: 'remove', billboard_number: 7, company_name: 'Paid', link_url: 'https://paid.example/', sent_at: '2026-10-28T00:00:00.000Z', created_at: '2026-10-28T00:00:00.000Z' },
    ],
    soloByNumber: new Map(),
    houseEntry: HOUSE,
  });
  assert.deepEqual(out.billboards['7'].entries.map((e) => e.company), ['Olympus']);
});

check('wire: inputs are never mutated', () => {
  const manifest = { version: 1, billboards: { 7: { intervalSeconds: 15, entries: [{ ...HOUSE }] } } };
  const snapshot = JSON.stringify(manifest);
  wireQueueIntoManifest({
    manifest,
    sentRows: [{ kind: 'ad', billboard_number: 7, company_name: 'New', link_url: 'https://new.example/', creative_type: 'image', creative_url: '/n.png', rotation_interval_seconds: 15, is_house: false, created_at: '2026-10-27T00:00:00.000Z', sent_at: '2026-10-27T00:00:00.000Z' }],
    soloByNumber: new Map(),
    houseEntry: HOUSE,
  });
  assert.equal(JSON.stringify(manifest), snapshot);
});

// --- panel resolution agrees with wire order ---

check('resolution: manifest entries resolve newest-first with house last', () => {
  const map = manifestToOverrides({ version: 1, billboards: {
    7: { intervalSeconds: 15, entries: [
      paid('Old', '2026-10-20T00:00:00.000Z'),
      { ...HOUSE },
      paid('New', '2026-10-27T00:00:00.000Z'),
    ] },
  } });
  assert.deepEqual(map.get(7).entries.map((e) => e.company), ['New', 'Old', 'Olympus']);
});

check('resolution: solo map enforces solo-only on a stale manifest (pre-rewire)', () => {
  const map = manifestToOverrides({ version: 1, billboards: {
    7: { intervalSeconds: 15, entries: [paid('Paid', '2026-10-27T00:00:00.000Z'), { ...HOUSE }] },
  } }, new Map([[7, {
    billboardNumber: 7, company: 'SoloCo', link: 'https://soloco.example/',
    creativeType: 'video', creativeUrl: '/solo.mp4', house: false,
  }]]));
  assert.deepEqual(map.get(7).entries.map((e) => e.company), ['SoloCo']);
  const slot = overrideSlotFor(7, map.get(7));
  assert.equal(slot.entries.length, 1);
  assert.equal(slot.trackingUrl, 'https://soloco.example/');
});

check('resolution: timestamps survive normalization for the ordering layer', () => {
  const map = manifestToOverrides({ version: 1, billboards: {
    7: { intervalSeconds: 15, entries: [paid('Paid', '2026-10-27T00:00:00.000Z', '2026-10-26T00:00:00.000Z')] },
  } });
  assert.equal(map.get(7).entries[0].publishedAt, '2026-10-27T00:00:00.000Z');
  assert.equal(map.get(7).entries[0].createdAt, '2026-10-26T00:00:00.000Z');
});

// --- rotation cycler unchanged ---

check('rotation: single entry static, multi-entry cycles in resolved array order', () => {
  assert.equal(nextRotationIndex(0, 1), 0);
  assert.equal(nextRotationIndex(0, 3), 1);
  assert.equal(nextRotationIndex(2, 3), 0);
  assert.equal(clampRotationIndex(2, 2), 0);
  assert.equal(billboardRotates({ entries: [{}, {}] }), true);
  assert.equal(billboardRotates({ entries: [{}] }), false);
});

console.log(`billboard-playlist: ${passed} checks passed`);
