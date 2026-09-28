// tests/liquid-gold.test.mjs
// Headless tests for the Liquid Gold Refinery mint flow.
// Run: node tests/liquid-gold.test.mjs (from the repo root). No browser, no network.
import {
  newState, pourTick, refineTick, barValue, sellBars, buyUpgrade,
  upgradeCost, vatCapacity, flowRate, canSurge, activateSurge,
  surgeRemaining, surgeCooldownRemaining, togglePour, TICK,
} from '../app/liquid-gold/engine.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// Simulate one game tick exactly like app/liquid-gold/page.jsx does.
function tick(st) {
  st.now += TICK;
  pourTick(st, TICK);
  return refineTick(st, TICK);
}

// --- Full mint loop: pour a while, release, bar must mint promptly at 98% ---
{
  const st = newState();
  st.pouring = true;
  for (let s = 0; s < 20; s += TICK) tick(st);
  st.pouring = false;
  t('pouring fills the vat', st.crude > 50);

  let mintedAt = null, hit98At = null, tsec = 0;
  while (tsec < 60) {
    // observe purity just before refining so the 98% crossing isn't masked
    // by the post-mint purity reset inside refineTick
    st.now += TICK; pourTick(st, TICK);
    const prePurity = st.purity;
    const m = refineTick(st, TICK); tsec += TICK;
    if (hit98At === null && (prePurity >= 0.98 || m > 0)) hit98At = tsec;
    if (m > 0 && mintedAt === null) { mintedAt = tsec; break; }
  }
  t('a bar mints', mintedAt !== null);
  // REGRESSION: mint used to be gated on crude < 5, forcing ~80s of dead
  // waiting AFTER 98% purity was reached. It must mint at 98% promptly.
  t('mint fires promptly at 98% (dead wait < 5s)', mintedAt !== null && hit98At !== null && (mintedAt - hit98At) < 5);
  t('mint resets crude to 0', st.crude === 0);
  t('mint resets purity to base', st.purity === 0.12);
  t('bars inventory incremented', st.bars === 1);
  t('lifetime barsMinted incremented', st.barsMinted === 1);
  t('lastMintAt stamped for UI flash', st.lastMintAt === st.now);
}

// --- No premature mint below 98% ---
{
  const st = newState();
  st.crude = 3; st.purity = 0.5;
  const m = refineTick(st, TICK);
  t('no mint below 98% purity even with low crude', m === 0 && st.bars === 0);
}

// --- Purity progress survives small pours (no wipe when crude drains) ---
{
  const st = newState();
  st.pouring = true;
  for (let s = 0; s < 3; s += TICK) tick(st);
  st.pouring = false;
  const p1 = st.purity;
  for (let s = 0; s < 30; s += TICK) tick(st);
  t('small pour raises purity above base', p1 > 0.12);
  t('purity is preserved (not wiped) when crude drains', st.purity >= p1 - 1e-9);
}

// --- Continuous pouring mints repeatedly (steady production) ---
{
  const st = newState();
  st.pouring = true;
  for (let s = 0; s < 120; s += TICK) tick(st);
  t('holding pour produces bars over time', st.bars >= 2);
}

// --- Sell / economy ---
{
  const st = newState();
  st.bars = 3;
  const v = sellBars(st);
  t('sellBars pays bars * barValue', v === 3 * barValue(st) && st.credits === v);
  t('sellBars empties inventory', st.bars === 0);
  t('selling zero bars is a no-op', sellBars(newState()) === 0);
}

// --- Upgrades ---
{
  const st = newState();
  st.credits = 1000;
  t('upgrade cost grows geometrically', upgradeCost('pump', 1) > upgradeCost('pump', 0));
  t('buyUpgrade fails when broke', buyUpgrade({ credits: 0, upgrades: { pump: 0 } }, 'pump') === false);
  const ok = buyUpgrade(st, 'pump');
  t('buyUpgrade deducts cost and levels up', ok && st.upgrades.pump === 1 && st.credits === 1000 - upgradeCost('pump', 0));
  t('vat capacity scales with vat level', vatCapacity(st) === 120);
  st.upgrades.vat = 2;
  t('vat capacity +60/level', vatCapacity(st) === 240);
  t('flow rate scales with pump level', flowRate(st) > 6);
}

// --- Surge ---
{
  const st = newState();
  t('surge available at start', canSurge(st));
  t('activateSurge succeeds', activateSurge(st));
  t('surge triples flow', flowRate(st) > 6 * 2.9);
  t('surge on cooldown afterwards', !canSurge(st));
  t('activateSurge blocked on cooldown', activateSurge(st) === false);
  t('surgeRemaining counts down', surgeRemaining(st) > 0 && surgeRemaining(st) <= 12);
  t('cooldown remaining counts down', surgeCooldownRemaining(st) > 0 && surgeCooldownRemaining(st) <= 45);
}

// --- Pour latch toggle (UI button contract: "tap to stop" must actually stop) ---
// REGRESSION: the pour button used to wire onPointerUp (pouring=false) AND
// onClick (toggle) together, so every release re-latched pouring ON — the
// button could never be turned off once tapped. The button is now a clean
// toggle through togglePour.
{
  const st = newState();
  t('pour starts off', st.pouring === false);
  t('togglePour turns pouring on', togglePour(st) === true && st.pouring === true);
  t('togglePour turns pouring off again (tap to stop)', togglePour(st) === false && st.pouring === false);
  // a full tap-on/tap-off cycle must still leave the mint loop functional
  st.pouring = true;
  for (let s = 0; s < 60; s += TICK) tick(st);
  t('mint loop unaffected by pour toggling', st.barsMinted >= 1);
}

console.log(`liquid-gold: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
