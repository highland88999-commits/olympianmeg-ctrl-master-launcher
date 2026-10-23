// tests/refinery.test.mjs
// Headless tests for the Liquid Gold Refinery (Merlin's corrected
// model, 2026-10-22): molten gold converts to GOLD BARS (the upgrade
// currency, an internal uncapped loop) or to AETHER (the true currency,
// credited to the server aether balance under a 1000 gold-value/day
// cap on that leg alone), with server-persisted state and checkpointed
// replay. Run: node tests/refinery.test.mjs (from the repo root).
import { ECONOMY } from '../lib/economy/config.js';
import {
  creditAether, debitAether, getAetherBalance, AetherInsufficientError,
} from '../lib/economy/aether.js';
import {
  replayRefinery, processRefineryClaim,
  loadRefineryRow, saveRefinerySave, refinerySummary, refineryMintKey,
  RefinerySetupError, RefineryResyncError,
} from '../lib/economy/refinery.js';
import {
  toStoredState, toEngineState, cleanLogAction,
} from '../lib/economy/refinery-shared.js';
import {
  newState, pourTick, refineTick, setPouring, setOutput,
  buyUpgradeWithBars, buyUpgrade, sellBars, upgradeBarCost, TICK,
} from '../app/liquid-gold/engine.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Fake Supabase: aether_apply mirrors supabase/aether.sql; the
// refinery tables mirror supabase/refinery.sql. There are deliberately
// NO gold/wallet tables here: if the refinery touched platform gold or
// the wallet, these tests would crash — the corrected model forbids it.
class QB {
  constructor(db, table) {
    this.db = db; this.table = table;
    this.filters = []; this.op = 'select'; this.payload = null; this.cols = '*';
  }
  select(cols) { if (this.op === 'select') this.cols = cols || '*'; return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  insert(row) { this.op = 'insert'; this.payload = row; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  rows() {
    return (this.db.tables[this.table] || []).filter((r) =>
      this.filters.every(([c, v]) => r[c] === v));
  }
  project(r) {
    if (this.cols === '*') return { ...r };
    const out = {};
    for (const c of this.cols.split(',').map((s) => s.trim())) out[c] = r[c];
    return out;
  }
  async exec() {
    const db = this.db;
    if (db.missing.has(this.table)) {
      return { data: null, error: { code: '42P01', message: `relation "${this.table}" does not exist` } };
    }
    if (this.op === 'insert') {
      const row = { ...(db.defaults[this.table] || {}), ...this.payload };
      if (row.created_at === undefined) row.created_at = new Date().toISOString();
      if ((db.unique[this.table] || []).some((col) =>
        (db.tables[this.table] || []).some((r) => r[col] === row[col]))) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      row.id = row.id || `${this.table}-${(db.tables[this.table] || []).length + 1}`;
      (db.tables[this.table] = db.tables[this.table] || []).push(row);
      return { data: this.project(row), error: null };
    }
    if (this.op === 'update') {
      for (const r of this.rows()) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    return { data: this.rows().map((r) => this.project(r)), error: null };
  }
  async maybeSingle() {
    const { data, error } = await this.exec();
    if (error) return { data: null, error };
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    return { data: rows[0] || null, error: null };
  }
  async single() {
    const { data, error } = await this.exec();
    if (error) return { data: null, error };
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } };
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
}

class FakeDb {
  constructor() {
    this.tables = { aether_ledger: [], refinery_state: [], refinery_conversions: [] };
    this.defaults = {
      refinery_state: {
        game_state: null, action_log: [], save_base: null, checkpoint_state: null,
        checkpoint_base_tick: 0, checkpoint_covered: 0, checkpoint_prefix_hash: null,
      },
      refinery_conversions: { aether_credited: 0 },
    };
    this.unique = { refinery_conversions: ['idempotency_key'], refinery_state: ['user_id'] };
    this.aetherBalances = new Map();
    this.aetherKeys = new Map();
    this.missing = new Set();
  }
  from(table) { return new QB(this, table); }
  async rpc(name, p) {
    if (name !== 'aether_apply') return { data: null, error: { message: 'unknown function' } };
    if (this.missing.has('aether_ledger')) {
      return { data: null, error: { code: '42P01', message: 'relation "aether_ledger" does not exist' } };
    }
    if (this.aetherKeys.has(p.p_idempotency_key)) {
      const e = this.aetherKeys.get(p.p_idempotency_key);
      return { data: [{ entry_id: e.id, balance_after: e.balance_after, was_duplicate: true, capped: false, insufficient: false }], error: null };
    }
    const uid = p.p_user_id;
    const bal = this.aetherBalances.get(uid) ?? 0;
    if (p.p_cap_group && p.p_cap_limit && p.p_delta > 0) {
      const day = new Date().toISOString().slice(0, 10);
      const sum = this.tables.aether_ledger
        .filter((r) => r.user_id === uid && r.reason.startsWith(p.p_cap_group + ':') && r.created_at.slice(0, 10) === day && r.delta > 0)
        .reduce((s, r) => s + r.delta, 0);
      if (sum + p.p_delta > p.p_cap_limit) {
        return { data: [{ entry_id: null, balance_after: bal, was_duplicate: false, capped: true, insufficient: false }], error: null };
      }
    }
    if (bal + p.p_delta < 0) {
      return { data: [{ entry_id: null, balance_after: bal, was_duplicate: false, capped: false, insufficient: true }], error: null };
    }
    const entry = {
      id: `a${this.tables.aether_ledger.length}`, user_id: uid, delta: p.p_delta,
      balance_after: bal + p.p_delta, reason: p.p_reason,
      idempotency_key: p.p_idempotency_key, meta: p.p_meta,
      created_at: new Date().toISOString(),
    };
    this.tables.aether_ledger.push(entry);
    this.aetherKeys.set(p.p_idempotency_key, entry);
    this.aetherBalances.set(uid, entry.balance_after);
    return { data: [{ entry_id: entry.id, balance_after: entry.balance_after, was_duplicate: false, capped: false, insufficient: false }], error: null };
  }
}

// getAetherBalance() reads aether_balances through from().select() —
// bridge the Map like the gold suite bridged gold_balances.
function withAetherBalances(db) {
  const origFrom = db.from.bind(db);
  db.from = (table) => {
    if (table !== 'aether_balances') return origFrom(table);
    return {
      select() { return this; },
      eq(col, val) { this._val = val; return this; },
      async maybeSingle() {
        if (db.missing.has('aether_balances')) {
          return { data: null, error: { code: '42P01', message: 'relation "aether_balances" does not exist' } };
        }
        const b = db.aetherBalances.get(this._val);
        return { data: b === undefined ? null : { balance: b }, error: null };
      },
    };
  };
  return db;
}
const newDb = () => withAetherBalances(new FakeDb());

// --- Play a session exactly like the page: actions applied locally AND
// logged with completed ticks + absolute index; loop advances, pours, refines.
function makePlayer() {
  const st = newState();
  const log = [];
  let nextI = 0;
  const ti = () => Math.round(st.now / TICK);
  const act = (entry) => {
    if (entry.a === 'pour') setPouring(st, entry.on);
    if (entry.a === 'mode') setOutput(st, entry.out);
    if (entry.a === 'buy') buyUpgradeWithBars(st, entry.kind);
    log.push({ t: ti(), i: nextI++, ...entry });
  };
  const run = (n) => { for (let k = 0; k < n; k++) { st.now += TICK; pourTick(st, TICK); refineTick(st, TICK); } };
  const runUntilMints = (want) => {
    let guard = 0;
    while (st.barsMinted < want && guard++ < 4000000) run(10);
    if (st.barsMinted < want) throw new Error('player never minted');
  };
  return { st, log, act, run, runUntilMints, ti };
}

// --- config pins: other sources untouched; the aether-cap derivation --
{
  t('mining cap unchanged', ECONOMY.MINING_DAILY_CAP === 1000);
  t('engagement caps unchanged', ECONOMY.ENGAGEMENT_DAILY_CAP === 60 && ECONOMY.ENGAGEMENT_DAILY_CAP_USD1 === 1000);
  t('bar rate + peg unchanged', ECONOMY.MINE_GOLD_PER_BAR === 25 && ECONOMY.GOLD_PER_DOLLAR === 1000);
  t('refinery aether-leg cap is 1000 gold-value/day', ECONOMY.REFINERY_DAILY_CAP === 1000);
  t('aether per bar is 1 (scarce, matches gift scales)', ECONOMY.AETHER_PER_BAR === 1);
  t('aether backstop cap derives from the gold-value cap',
    ECONOMY.REFINERY_AETHER_DAILY_CAP
      === (ECONOMY.REFINERY_DAILY_CAP / ECONOMY.MINE_GOLD_PER_BAR) * ECONOMY.AETHER_PER_BAR);
}

// --- engine: outputs + bar-denominated upgrades ------------------------
{
  const st = newState();
  t('default output is bars', st.output === 'bars');
  st.crude = 50; st.purity = 0.99;
  refineTick(st, TICK);
  t('bars-mode mint lands in inventory', st.bars === 1 && st.aetherMinted === 0 && st.barsMinted === 1);
  setOutput(st, 'aether');
  st.crude = 50; st.purity = 0.99;
  refineTick(st, TICK);
  t('aether-mode mint leaves inventory, tallies aether', st.bars === 1 && st.aetherMinted === 1 && st.barsMinted === 2);
  t('bar costs: pump L0 = 1, vat L2 = 4', upgradeBarCost('pump', 0) === 1 && upgradeBarCost('vat', 2) === 4);
  t('bar buy spends bars', buyUpgradeWithBars(st, 'pump') === true && st.bars === 0 && st.upgrades.pump === 1);
  t('bar buy refuses when short', buyUpgradeWithBars(st, 'vat') === false);
  // Legacy mining path intact:
  const legacy = newState();
  legacy.bars = 2;
  const sold = sellBars(legacy);
  t('legacy sellBars still pays credits', sold > 0 && legacy.credits === sold && legacy.bars === 0);
  t('legacy buyUpgrade still spends credits', buyUpgrade(legacy, 'pump') === true && legacy.credits === sold - 25);
}

// --- shared: log vocabulary + state sanitizing --------------------------
{
  t('mode action validated', cleanLogAction({ t: 0, a: 'mode', out: 'aether' })?.out === 'aether'
    && cleanLogAction({ t: 0, a: 'mode', out: 'bogus' }) === null
    && cleanLogAction({ t: 0, a: 'mode' }) === null);
  t('old sell vocabulary is gone', cleanLogAction({ t: 0, a: 'sell', out: 'gold' }) === null);
  t('pour/buy still valid', !!cleanLogAction({ t: 1, a: 'pour', on: true }) && !!cleanLogAction({ t: 1, a: 'buy', kind: 'vat' }));
  const stored = toStoredState({ ...newState(), output: 'aether', aetherMinted: 3 });
  t('stored state carries output + aetherMinted', stored.output === 'aether' && stored.aetherMinted === 3);
  const back = toEngineState(stored);
  t('round trip restores output mode', back.output === 'aether' && back.aetherMinted === 3);
  t('missing output defaults to bars (older saves)', toStoredState({ ...newState(), output: undefined }).output === 'bars');
  t('garbage output rejected', toStoredState({ ...newState(), output: 'dollars' }) === null);
}

// --- replay: mode attribution + global mint identity --------------------
{
  const p = makePlayer();
  p.act({ a: 'pour', on: true });
  p.runUntilMints(1); // bars mint
  p.act({ a: 'mode', out: 'aether' });
  p.runUntilMints(2); // aether mint
  const r = replayRefinery({ log: p.log, tickCount: p.ti() });
  t('replay ok', r.ok);
  t('only the post-flip mint is an aether conversion', r.conversions.length === 1);
  t('conversion carries the GLOBAL mint index', r.conversions[0]?.mintIndex === 1);
  t('bars mint stayed in inventory through replay', r.endState.bars === 1 && r.endState.aetherMinted === 1);

  const longStart = { ...newState(), barsMinted: 41 };
  const r2 = replayRefinery({ log: [{ t: 0, a: 'pour', on: true }], tickCount: 40001, startState: longStart });
  t('segment past the old 36k wall replays', r2.ok);
  const r3 = replayRefinery({ log: [{ t: 0, a: 'mode', out: 'aether' }, { t: 0, a: 'pour', on: true }], tickCount: 40001, startState: { ...newState(), barsMinted: 41 } });
  t('mint identity continues from the checkpoint count', r3.ok && r3.conversions[0]?.mintIndex === 41);
}

// --- claim: aether leg credits the server balance ------------------------
{
  const db = newDb();
  const p = makePlayer();
  p.act({ a: 'mode', out: 'aether' });
  p.act({ a: 'pour', on: true });
  p.runUntilMints(2);
  const r1 = await processRefineryClaim({ userId: 'u-a', log: p.log, tickCount: p.ti(), base: null }, db);
  t('two aether mints credit 2 aether', r1.creditedAether === 2 && r1.aetherBalance === 2);
  t('ledger rows carry the refinery reason', db.tables.aether_ledger.length === 2
    && db.tables.aether_ledger.every((e) => e.reason === 'refinery:conversion' && e.delta === 1));
  t('diary keyed by global mint', db.tables.refinery_conversions[0].mint_key === refineryMintKey('u-a', 0)
    && db.tables.refinery_conversions[1].mint_key === refineryMintKey('u-a', 1));
  t('claim reports the tally', r1.convertedTodayGold === 50 && r1.capRemainingGold === 950);
  t('checkpoint sealed after full conversion', !!r1.sealed && r1.sealed.coveredI === p.log.length);
  // Retry the identical claim: duplicates, no double credit.
  const r2 = await processRefineryClaim({ userId: 'u-a', log: p.log, tickCount: p.ti(), base: null }, db);
  t('retry never double-credits', r2.creditedAether === 0 && r2.aetherBalance === 2
    && r2.conversions.every((c) => c.outcome === 'duplicate'));
  t('no platform gold anywhere in the refinery path', !('gold_ledger' in db.tables) && !('wallets' in db.tables));
}

// --- claim: bars path needs no conversion; bar buys replay --------------
{
  const db = newDb();
  const p = makePlayer();
  p.act({ a: 'pour', on: true });
  p.runUntilMints(1);
  p.act({ a: 'buy', kind: 'pump' }); // costs 1 bar
  const r = await processRefineryClaim({ userId: 'u-b', log: p.log, tickCount: p.ti(), base: null }, db);
  t('bars play converts nothing', r.creditedAether === 0 && db.tables.aether_ledger.length === 0);
  const row = await loadRefineryRow('u-b', db);
  t('checkpoint proves the bar-spend upgrade', row?.checkpoint_state?.upgrades?.pump === 1
    && row?.checkpoint_state?.bars === 0);
}

// --- cap: 1000 gold-value/day on the aether leg only ----------------------
{
  const db = newDb();
  // Pre-seed today's diary at 975 gold-value (39 bars worth).
  for (let i = 0; i < 39; i++) {
    db.tables.refinery_conversions.push({
      id: `seed-${i}`, user_id: 'u-cap', mint_key: `refinery:u-cap:mint:old${i}`,
      mint_index: -1 - i, gold_value: 25, aether_credited: 1,
      idempotency_key: `seed-${i}`, created_at: new Date().toISOString(),
    });
  }
  const p = makePlayer();
  p.act({ a: 'mode', out: 'aether' });
  p.act({ a: 'pour', on: true });
  p.runUntilMints(2);
  const r = await processRefineryClaim({ userId: 'u-cap', log: p.log, tickCount: p.ti(), base: null }, db);
  t('first mint converts up to the cap exactly', r.conversions[0].outcome === 'converted' && r.creditedAether === 1);
  t('second mint is capped, whole', r.conversions[1].outcome === 'capped' && r.conversions[1].converted === 0);
  t('tally sits at the cap', r.convertedTodayGold === 1000 && r.capRemainingGold === 0 && r.capped === true);
  t('seal does not pass the unconverted mint', r.sealed !== null
    && (await loadRefineryRow('u-cap', db)).checkpoint_state.barsMinted === 1);
}
{
  // Headroom smaller than one bar (10): the mint waits, whole.
  const db = newDb();
  db.tables.refinery_conversions.push({
    id: 'seed-x', user_id: 'u-part', mint_key: 'refinery:u-part:mint:old',
    mint_index: -1, gold_value: 990, aether_credited: 39,
    idempotency_key: 'seed-x', created_at: new Date().toISOString(),
  });
  const p = makePlayer();
  p.act({ a: 'mode', out: 'aether' });
  p.act({ a: 'pour', on: true });
  p.runUntilMints(1);
  const r = await processRefineryClaim({ userId: 'u-part', log: p.log, tickCount: p.ti(), base: null }, db);
  t('sub-bar headroom converts nothing (no fractional aether)', r.creditedAether === 0 && r.conversions[0].outcome === 'capped');
  t('no seal over the waiting mint', r.sealed === null);
}
{
  // The aether ledger's own backstop cap fires even if the diary is empty.
  const db = newDb();
  for (let i = 0; i < ECONOMY.REFINERY_AETHER_DAILY_CAP; i++) {
    await creditAether({ userId: 'u-back', amount: 1, reason: 'refinery:conversion', idemKey: `pre-${i}`, capGroup: 'refinery', capLimit: ECONOMY.REFINERY_AETHER_DAILY_CAP }, db);
  }
  const p = makePlayer();
  p.act({ a: 'mode', out: 'aether' });
  p.act({ a: 'pour', on: true });
  p.runUntilMints(1);
  const r = await processRefineryClaim({ userId: 'u-back', log: p.log, tickCount: p.ti(), base: null }, db);
  t('ledger backstop caps when the diary cannot', r.creditedAether === 0 && r.conversions[0].outcome === 'capped'
    && db.tables.refinery_conversions.length === 0);
  // The cap group sums ONLY 'refinery:%' reasons: a balance full of
  // gift aether does not eat the refinery group's headroom.
  const db2 = newDb();
  await creditAether({ userId: 'u-gift', amount: 100, reason: 'earth2:gift', idemKey: 'g1' }, db2);
  const conv = await creditAether({ userId: 'u-gift', amount: 1, reason: 'refinery:conversion', idemKey: 'c1', capGroup: 'refinery', capLimit: ECONOMY.REFINERY_AETHER_DAILY_CAP }, db2);
  t('gift aether does not consume the refinery cap group', conv.balanceAfter === 101);
}

// --- segmented claims + resync -------------------------------------------
{
  const db = newDb();
  const p = makePlayer();
  p.act({ a: 'mode', out: 'aether' });
  p.act({ a: 'pour', on: true });
  p.runUntilMints(1);
  const r1 = await processRefineryClaim({ userId: 'u-seg', log: p.log, tickCount: p.ti(), base: null }, db);
  const base = { prefixHash: r1.sealed.prefixHash, baseTick: r1.sealed.baseTick, coveredI: r1.sealed.coveredI };
  // Play on; claim only the tail against the checkpoint.
  const tailStart = p.log.length;
  p.runUntilMints(2);
  const tail = p.log.slice(tailStart).map((a, idx) => ({ ...a, i: base.coveredI + idx }));
  const fullLog = [...p.log.slice(0, tailStart), ...tail];
  const r2 = await processRefineryClaim({ userId: 'u-seg', log: fullLog.filter((a) => a.i >= base.coveredI), tickCount: p.ti(), base }, db);
  t('segmented claim converts the second mint', r2.creditedAether === 1 && r2.aetherBalance === 2);
  t('second mint keeps its global identity', db.tables.refinery_conversions.some((c) => c.mint_key === refineryMintKey('u-seg', 1)));
  let resync = false;
  try {
    await processRefineryClaim({ userId: 'u-seg', log: [], tickCount: p.ti(), base: { ...base, coveredI: 999 } }, db);
  } catch (e) { resync = e instanceof RefineryResyncError; }
  t('stale base is a resync, not a credit', resync);
}

// --- persistence: save/restore round trip ---------------------------------
{
  const db = newDb();
  const gameState = { ...newState(), output: 'aether', aetherMinted: 3, barsMinted: 5, bars: 2, crude: 40 };
  await saveRefinerySave('u-save', { gameState, log: [{ t: 0, a: 'mode', out: 'aether' }], base: null }, db);
  const row = await loadRefineryRow('u-save', db);
  t('save persists', !!row && row.game_state.output === 'aether');
  const restored = toEngineState(row.game_state);
  t('restore round-trips the game', restored.output === 'aether' && restored.aetherMinted === 3
    && restored.bars === 2 && restored.crude === 40);
  const sum = await refinerySummary('u-save', db);
  t('summary reads the diary, not the save', sum.convertedTodayGold === 0 && sum.capRemainingGold === 1000);
}

// --- aether ledger unit behavior -------------------------------------------
{
  const db = newDb();
  const c1 = await creditAether({ userId: 'u-led', amount: 5, reason: 'test:grant', idemKey: 'k1' }, db);
  const c2 = await creditAether({ userId: 'u-led', amount: 5, reason: 'test:grant', idemKey: 'k1' }, db);
  t('aether credit is idempotent', c1.balanceAfter === 5 && c2.wasDuplicate === true && c2.balanceAfter === 5);
  t('balance reads back', (await getAetherBalance('u-led', db)) === 5);
  let insuff = false;
  try { await debitAether({ userId: 'u-led', amount: 9, reason: 'test:spend', idemKey: 'k2' }, db); }
  catch (e) { insuff = e instanceof AetherInsufficientError; }
  t('debits refuse to go negative', insuff && (await getAetherBalance('u-led', db)) === 5);
}

// --- setup honesty -----------------------------------------------------------
{
  const db = newDb();
  db.missing.add('refinery_state');
  let setup = false;
  try { await loadRefineryRow('u-x', db); } catch (e) { setup = e instanceof RefinerySetupError; }
  t('missing refinery tables = setup error', setup);

  const db2 = newDb();
  db2.missing.add('aether_ledger');
  db2.missing.add('aether_balances');
  const p = makePlayer();
  p.act({ a: 'mode', out: 'aether' });
  p.act({ a: 'pour', on: true });
  p.runUntilMints(1);
  let setup2 = false;
  try { await processRefineryClaim({ userId: 'u-y', log: p.log, tickCount: p.ti(), base: null }, db2); }
  catch (e) { setup2 = e instanceof RefinerySetupError; }
  t('aether mint with aether tables missing = setup error, nothing credited', setup2
    && db2.tables.refinery_conversions.length === 0);
  // Bars-only play still claims fine while aether tables are absent:
  const p2 = makePlayer();
  p2.act({ a: 'pour', on: true });
  p2.runUntilMints(1);
  const rb = await processRefineryClaim({ userId: 'u-y', log: p2.log, tickCount: p2.ti(), base: null }, db2);
  t('bars-only claim works without aether tables', rb.ok && rb.aetherBalance === null);
}

console.log(`refinery: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
