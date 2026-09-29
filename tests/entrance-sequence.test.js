// tests/entrance-sequence.test.js — Headless tests for the entrance cinematic state machine.
// Run: node tests/entrance-sequence.test.js (from the repo root). No browser, no network.
import {
  INTRO_SKIP_KEY,
  PHASES,
  TOTAL_DURATION_MS,
  CAPTIONS,
  createEntranceMachine,
} from '../lib/entrance-sequence.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// in-memory localStorage stand-in
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// --- storyboard: phase order, ids, pacing ----------------------------------
t('exactly 5 phases', PHASES.length === 5);
t('phase order matches storyboard', PHASES.map((p) => p.id).join(',') === 'static,speech,glitch,commander,drop');
t('all phase ids are lowercase single words', PHASES.every((p) => /^[a-z]+$/.test(p.id)));
t('all durations positive', PHASES.every((p) => p.durationMs > 0));
t('total runtime is 8–12s', TOTAL_DURATION_MS >= 8000 && TOTAL_DURATION_MS <= 12000);

// --- captions: plain English, core metaphor ---------------------------------
t('speech caption sets up the metaphor', CAPTIONS.speech.replace(/[’‘]/g, "'").includes("don't launch it"));
t('commander caption delivers the DROP', CAPTIONS.commander === 'We DROP it.');
t('captions are plain strings', Object.values(CAPTIONS).every((c) => typeof c === 'string' && c.length > 0));

// --- autoplay: fresh visitor plays, skipper does not ------------------------
{
  const m = createEntranceMachine(memStorage());
  t('fresh storage: shouldAutoPlay true', m.shouldAutoPlay() === true);
}
{
  const s = memStorage();
  s.setItem(INTRO_SKIP_KEY, '1');
  const m = createEntranceMachine(s);
  t('skip flag set: shouldAutoPlay false', m.shouldAutoPlay() === false);
}
{
  const m = createEntranceMachine(null);
  t('null storage: shouldAutoPlay true, no throw', m.shouldAutoPlay() === true);
}
{
  const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  const m = createEntranceMachine(bad);
  t('throwing storage: shouldAutoPlay degrades gracefully', m.shouldAutoPlay() === true);
  t('throwing storage: skip does not throw', (() => { try { m.skip(); return true; } catch { return false; } })());
}

// --- lifecycle: idle → playing → done ---------------------------------------
{
  const m = createEntranceMachine(memStorage());
  t('starts idle', m.snapshot().status === 'idle' && m.phase() === null);
  const s0 = m.start();
  t('start → playing at phase static', s0.status === 'playing' && s0.phase === 'static');
  const seen = [m.phase()];
  let snap = m.snapshot();
  while (snap.status === 'playing') { snap = m.advance(); seen.push(snap.phase); }
  t('advance walks the full storyboard', seen.slice(0, 5).join(',') === 'static,speech,glitch,commander,drop');
  t('after last phase: done, reason completed', snap.status === 'done' && snap.reason === 'completed');
  t('phase() is null when done', m.phase() === null);
  t('advance after done is a no-op', m.advance().status === 'done');
}

// --- skip: ends immediately AND persists ------------------------------------
{
  const s = memStorage();
  const m = createEntranceMachine(s);
  m.start();
  m.advance(); // now in speech
  const snap = m.skip();
  t('skip → done, reason skipped', snap.status === 'done' && snap.reason === 'skipped');
  t('skip persists the flag', s.getItem(INTRO_SKIP_KEY) === '1');
  t('skip is idempotent', m.skip().reason === 'skipped');
  const m2 = createEntranceMachine(s);
  t('a later visit does not auto-play', m2.shouldAutoPlay() === false);
}

// --- watching through does NOT persist (only explicit skip does) ------------
{
  const s = memStorage();
  const m = createEntranceMachine(s);
  m.start();
  while (m.snapshot().status === 'playing') m.advance();
  t('completion leaves no skip flag', s.getItem(INTRO_SKIP_KEY) === null);
  t('after completion, a later visit still auto-plays', m.shouldAutoPlay() === true);
}

// --- replay: restarts, never clears the skip flag ---------------------------
{
  const s = memStorage();
  s.setItem(INTRO_SKIP_KEY, '1');
  const m = createEntranceMachine(s);
  const snap = m.replay();
  t('replay → playing at static', snap.status === 'playing' && snap.phase === 'static');
  t('replay does not clear the skip flag', s.getItem(INTRO_SKIP_KEY) === '1');
}

// --- fast cut (prefers-reduced-motion) ---------------------------------------
{
  const m = createEntranceMachine(memStorage(), { fast: true });
  t('fast cut shortens total runtime', m.totalDurationMs() < TOTAL_DURATION_MS);
  m.start();
  t('fast cut keeps phase order', PHASES.every((p) => p.durationMs > 0) && m.phase() === 'static');
  t('fast cut phase duration is scaled', m.phaseDurationMs() === Math.round(PHASES[0].durationMs * 0.35));
  const seen = [];
  let snap = m.snapshot();
  while (snap.status === 'playing') { seen.push(snap.phase); snap = m.advance(); }
  t('fast cut still visits every phase', seen.join(',') === 'static,speech,glitch,commander,drop');
}

// --- audio module: import-safe in node (no window) ---------------------------
{
  let ok = true;
  try {
    const audio = await import('../lib/entrance-audio.js');
    audio.playPhaseSound('static'); // must no-op, not throw
    audio.playPhaseSound('drop');
    audio.playPhaseSound('nope'); // unknown phase: no-op
    audio.stopAllEntranceAudio();
    audio.setEntranceAudioEnabled(false);
    audio.setEntranceAudioEnabled(true);
    audio.unlockEntranceAudio();
  } catch (e) {
    ok = false;
    console.error('  audio module threw:', e.message);
  }
  t('audio module is import-safe and no-ops without a browser', ok);
}

console.log(`\nentrance-sequence: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
