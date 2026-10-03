// tests/persymphony-tickets.test.mjs
// Headless tests for the PerSymphony ticket module:
// - ticket numbers: format, unambiguous alphabet, uniqueness, normalization
// - fee math: 10% of net to the platform, 90% to the performer, sums exact
// - entry gate decisions: valid / invalid / wrong-event / already-redeemed
// - entry payloads adapt per venue type; stream URL only post-validation
// - show input validation incl. physical + virtual venue flows
// - webhook idempotency decision + cent-splitting
// Run: node --test tests/persymphony-tickets.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeTicketNumber,
  normalizeTicketNumber,
  isWellFormedTicketNumber,
  computeLedger,
  ledgerFromTickets,
  decideEntry,
  entryPayload,
  validateShowInput,
  shouldFulfill,
  splitCents,
  VENUE_TYPES,
  PLATFORM_FEE_RATE,
} from '../lib/persymphony/tickets.js';

describe('ticket numbers', () => {
  it('matches PS-XXXXXXXX format', () => {
    assert.match(makeTicketNumber(), /^PS-[A-Z2-9]{8}$/);
  });
  it('uses an unambiguous alphabet (no 0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const n = makeTicketNumber();
      assert.ok(!/[01IL]/u.test(n.replace('PS-', '')), `ambiguous char in ${n}`);
      assert.ok(!/O/.test(n.replace('PS-', '')), `letter O in ${n}`);
    }
  });
  it('generates unique numbers', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const n = makeTicketNumber();
      assert.ok(!seen.has(n), `duplicate ${n}`);
      seen.add(n);
    }
  });
  it('normalizes user input variants', () => {
    assert.equal(normalizeTicketNumber('ps-7kq2m9xd'), 'PS-7KQ2M9XD');
    assert.equal(normalizeTicketNumber('PS7KQ2M9XD'), 'PS-7KQ2M9XD');
    assert.equal(normalizeTicketNumber('  ps 7kq2m9xd '), 'PS-7KQ2M9XD');
  });
  it('validates well-formed numbers', () => {
    assert.ok(isWellFormedTicketNumber('PS-7KQ2M9XD'));
    assert.ok(!isWellFormedTicketNumber('PS-7KQ2M9X')); // short
    assert.ok(!isWellFormedTicketNumber('XX-7KQ2M9XD')); // wrong prefix
    assert.ok(!isWellFormedTicketNumber('PS-70Q2M9XD')); // 0 is not in the alphabet
  });
});

describe('fee math (10% of net to the platform)', () => {
  it('platform rate is 10%', () => {
    assert.equal(PLATFORM_FEE_RATE, 0.1);
  });
  it('typical sale: gross 2000c, fee 66c', () => {
    const l = computeLedger({ gross_cents: 2000, stripe_fee_cents: 66 });
    assert.equal(l.net_cents, 1934);
    assert.equal(l.platform_fee_cents, 193); // round(193.4)
    assert.equal(l.performer_share_cents, 1741);
    assert.equal(l.platform_fee_cents + l.performer_share_cents, l.net_cents);
  });
  it('platform + performer always equals net (rounding invariant)', () => {
    let rnd = 12345;
    const rand = () => {
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      return rnd;
    };
    for (let i = 0; i < 500; i++) {
      const gross = Math.floor((rand() / 0x7fffffff) * 100000);
      const fee = Math.floor((rand() / 0x7fffffff) * Math.min(gross, 5000));
      const l = computeLedger({ gross_cents: gross, stripe_fee_cents: fee });
      assert.equal(l.platform_fee_cents + l.performer_share_cents, l.net_cents);
      assert.ok(l.platform_fee_cents <= l.net_cents);
    }
  });
  it('zero and negative inputs clamp safely', () => {
    const l = computeLedger({ gross_cents: 0, stripe_fee_cents: 0 });
    assert.deepEqual(
      [l.gross_cents, l.net_cents, l.platform_fee_cents, l.performer_share_cents],
      [0, 0, 0, 0]
    );
    const l2 = computeLedger({ gross_cents: -50, stripe_fee_cents: 999 });
    assert.equal(l2.net_cents, 0);
  });
  it('aggregates tickets into a ledger', () => {
    const l = ledgerFromTickets([
      { amount_cents: 2000, stripe_fee_cents: 66 },
      { amount_cents: 2000, stripe_fee_cents: 66 },
    ]);
    assert.equal(l.tickets_sold, 2);
    assert.equal(l.gross_cents, 4000);
    assert.equal(l.stripe_fee_cents, 132);
    assert.equal(l.net_cents, 3868);
    assert.equal(l.platform_fee_cents + l.performer_share_cents, 3868);
  });
});

describe('entry gate decisions', () => {
  const showId = 'show-1';
  const ticket = { show_id: showId, status: 'valid' };
  it('admits a valid ticket', () => {
    const d = decideEntry({ ticket, showId });
    assert.ok(d.ok && d.code === 'admitted');
  });
  it('rejects unknown numbers', () => {
    const d = decideEntry({ ticket: null, showId });
    assert.ok(!d.ok && d.code === 'invalid');
  });
  it('rejects tickets for a different show', () => {
    const d = decideEntry({ ticket: { show_id: 'other', status: 'valid' }, showId });
    assert.ok(!d.ok && d.code === 'wrong_event');
  });
  it('rejects already-redeemed tickets (duplicate scan)', () => {
    const d = decideEntry({ ticket: { show_id: showId, status: 'redeemed' }, showId });
    assert.ok(!d.ok && d.code === 'already_redeemed');
  });
  it('rejects refunded tickets', () => {
    const d = decideEntry({ ticket: { show_id: showId, status: 'refunded' }, showId });
    assert.ok(!d.ok && d.code === 'invalid');
  });
});

describe('entry payloads per venue type', () => {
  it('physical: door info, no stream', () => {
    const p = entryPayload(
      { venue_type: 'physical', venue_name: 'The Hall', venue_address: '1 Main St', title: 'T' },
      { stream_url: 'https://x' }
    );
    assert.ok(p.door && p.door.venue_address === '1 Main St');
    assert.ok(!p.stream, 'physical must not reveal a stream');
    assert.ok(!p.arena);
  });
  it('virtual: arena link, no stream', () => {
    const p = entryPayload(
      { venue_type: 'virtual', arena_id: 'nebula', title: 'T' },
      { stream_url: 'https://x' }
    );
    assert.ok(p.arena && p.arena.url.includes('arena=nebula'));
    assert.ok(!p.stream);
    assert.ok(!p.door);
  });
  it('livestream: stream URL revealed only post-validation', () => {
    const withSecrets = entryPayload(
      { venue_type: 'livestream', title: 'T' },
      { stream_url: 'https://stream.example/live' }
    );
    assert.equal(withSecrets.stream.url, 'https://stream.example/live');
    const withoutSecrets = entryPayload({ venue_type: 'livestream', title: 'T' }, null);
    assert.ok(!withoutSecrets.stream, 'no stream without validated secrets');
  });
  it('hybrid: door + stream', () => {
    const p = entryPayload(
      {
        venue_type: 'hybrid',
        venue_name: 'The Hall',
        venue_address: '1 Main St',
        arena_id: 'nebula',
        title: 'T',
      },
      { stream_url: 'https://stream.example/live' }
    );
    assert.ok(p.door && p.stream && p.arena);
  });
  it('all four venue types are supported', () => {
    assert.deepEqual([...VENUE_TYPES].sort(), ['hybrid', 'livestream', 'physical', 'virtual']);
  });
});

describe('show input validation', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const base = {
    title: 'Friday Live',
    performance_type: 'comedy',
    starts_at: future,
    tiers: [{ name: 'General', price_cents: 2000, quantity: 100 }],
  };
  it('accepts a valid physical show', () => {
    const r = validateShowInput(
      { ...base, venue_type: 'physical', venue_name: 'Hall', venue_address: '1 Main St' },
      ['nebula']
    );
    assert.ok(r.ok, r.errors.join('; '));
  });
  it('accepts a valid virtual show', () => {
    const r = validateShowInput(
      { ...base, venue_type: 'virtual', arena_id: 'nebula' },
      ['nebula']
    );
    assert.ok(r.ok, r.errors.join('; '));
  });
  it('physical requires name and address', () => {
    const r = validateShowInput({ ...base, venue_type: 'physical' }, []);
    assert.ok(!r.ok && r.errors.some((e) => /address/i.test(e)));
  });
  it('virtual requires a real arena', () => {
    const bad = validateShowInput(
      { ...base, venue_type: 'virtual', arena_id: 'nope' },
      ['nebula']
    );
    assert.ok(!bad.ok);
    const missing = validateShowInput({ ...base, venue_type: 'virtual' }, ['nebula']);
    assert.ok(!missing.ok);
  });
  it('livestream requires a stream URL', () => {
    const r = validateShowInput({ ...base, venue_type: 'livestream' }, []);
    assert.ok(!r.ok && r.errors.some((e) => /stream url/i.test(e)));
  });
  it('rejects unknown venue types', () => {
    const r = validateShowInput({ ...base, venue_type: 'teleport' }, []);
    assert.ok(!r.ok);
  });
  it('tier quantities may not exceed venue capacity', () => {
    const r = validateShowInput(
      {
        ...base,
        venue_type: 'physical',
        venue_name: 'H',
        venue_address: 'A',
        venue_capacity: 50,
      },
      []
    );
    assert.ok(!r.ok && r.errors.some((e) => /capacity/i.test(e)));
  });
  it('accepts any performance type (no category restrictions)', () => {
    for (const t of ['music', 'comedy', 'theater', 'dance', 'livestream', 'talk', 'puppetry']) {
      const r = validateShowInput(
        { ...base, performance_type: t, venue_type: 'virtual', arena_id: 'nebula' },
        ['nebula']
      );
      assert.ok(r.ok, `${t}: ${r.errors.join('; ')}`);
    }
  });
});

describe('webhook idempotency + cent splitting', () => {
  it('fulfills when no tickets exist yet', () => {
    assert.ok(shouldFulfill({ existingTicketCount: 0 }));
  });
  it('skips when tickets already exist (double delivery)', () => {
    assert.ok(!shouldFulfill({ existingTicketCount: 2 }));
  });
  it('splits cents exactly across tickets', () => {
    assert.deepEqual(splitCents(1000, 3), [333, 333, 334]);
    assert.deepEqual(splitCents(199, 2), [99, 100]);
    const parts = splitCents(5432, 7);
    assert.equal(parts.reduce((a, b) => a + b, 0), 5432);
  });
});

describe('venue flows end to end (pure)', () => {
  it('physical flow: validate -> admitted -> door pass', () => {
    const showId = 'show-phys';
    const d = decideEntry({ ticket: { show_id: showId, status: 'valid' }, showId });
    assert.ok(d.ok);
    const p = entryPayload(
      { venue_type: 'physical', venue_name: 'The Hall', venue_address: '1 Main St', title: 'T' },
      null
    );
    assert.ok(p.door && !p.stream);
  });
  it('virtual flow: validate -> admitted -> arena link', () => {
    const showId = 'show-virt';
    const d = decideEntry({ ticket: { show_id: showId, status: 'valid' }, showId });
    assert.ok(d.ok);
    const p = entryPayload(
      { venue_type: 'virtual', arena_id: 'digital-rain', title: 'T' },
      null
    );
    assert.ok(p.arena && p.arena.url === '/persymphony?arena=digital-rain');
  });
});
