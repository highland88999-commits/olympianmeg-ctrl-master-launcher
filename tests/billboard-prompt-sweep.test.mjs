// tests/billboard-prompt-sweep.test.mjs
// Billboard prompt sweep (Merlin, 2026-10-27): the "VISIT SITE" prompt
// and "Advertise Here: Email Us" inquiry are gone from the remaining
// surfaces — street monuments + god panels — after the hub tower
// cleanup. Tap-to-link survives everywhere: only the visible prompt
// texts go, never the links.
// Run: node tests/billboard-prompt-sweep.test.mjs (from the repo root).
// No browser, no network — asserts on the wired source (same grep
// style as the hub suites).
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// --- street monuments: both prompts gone, face tap-to-link kept ---
{
  const m = src('components/argo/BillboardMonument.jsx');
  t('monument: no VISIT SITE', !m.includes('VISIT SITE'));
  t('monument: no ADVERTISE CTA text', !m.includes("'ADVERTISE'"));
  t('monument: no Email Us inquiry', !m.includes('Advertise Here: Email Us'));
  t('monument: no dead CTA/email handlers', !m.includes('openMail') && !m.includes('ctaHover') && !m.includes('mailHover'));
  t('monument: face still opens its link', m.includes('onClick={openLink}') && m.includes('window.open(slot.trackingUrl'));
}

// --- god panels: inquiry gone, VISIT SITE absent, stake link kept ---
for (const god of ['Ares', 'Argus', 'Medusa', 'Thoth', 'Zeus']) {
  const g = src(`components/${god}.jsx`);
  t(`${god}: no Email Us inquiry`, !g.includes('Advertise Here: Email Us'));
  t(`${god}: no VISIT SITE`, !g.includes('VISIT SITE'));
  t(`${god}: no dead email handler/state`, !g.includes('handleEmailClick') && !g.includes('emailHovered') && !g.includes('inquiriesEmail'));
  t(`${god}: face + ENTER NOW still open the stake link`, g.includes('onClick={handleStakeClick}') && g.includes('ENTER NOW') && g.includes('onLaunchExternal(stakeUrl)'));
}

// --- hub tower regression: the earlier cleanup holds ---
{
  const h = src('components/GodTower.jsx');
  t('hub tower: no VISIT SITE', !h.includes('VISIT SITE'));
  t('hub tower: no Email Us inquiry', !h.includes('Advertise Here: Email Us'));
  t('hub tower: tap-to-link kept', h.includes('trackingUrl'));
}

console.log(`billboard-prompt-sweep: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
