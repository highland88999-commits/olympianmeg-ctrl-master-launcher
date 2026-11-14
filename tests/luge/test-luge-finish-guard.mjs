// tests/luge/test-luge-finish-guard.mjs
// Headless tests for the one-finish-one-recording guard
// (lib/luge/finish-guard.js) + static wiring checks that app/luge/page.tsx
// actually uses it. Run: node tests/luge/test-luge-finish-guard.mjs
// (from the repo root). No browser, no network.
import { readFileSync } from 'node:fs';
import { createFinishGuard } from '../../lib/luge/finish-guard.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const count = (src, sub) => src.split(sub).length - 1;

// --- the guard itself ---
const g = createFinishGuard();
t('first claim wins', g.claim() === true);
t('second claim loses', g.claim() === false);
t('a 50-frame flood after the first claim records zero more times', (() => {
  let trues = 0;
  for (let i = 0; i < 50; i++) if (g.claim()) trues++;
  return trues === 0;
})());
g.reset();
t('reset re-arms the next run', g.claim() === true);
t('reset twice is harmless', (() => { g.reset(); g.reset(); return g.claim() === true; })());

const a = createFinishGuard();
const b = createFinishGuard();
a.claim();
t("guards are independent (one run's claim does not arm another)", b.claim() === true);

// --- the page actually wires it ---
const page = readFileSync(new URL('../../app/luge/page.tsx', import.meta.url), 'utf8');
t('page imports the guard', page.includes("import { createFinishGuard } from '@/lib/luge/finish-guard'"));
t('handleFinish claims once and bails on later frames', page.includes('if (!finishGuardRef.current.claim()) return;'));
t('the guard is re-armed on both race starts (solo + PvP)', count(page, 'finishGuardRef.current.reset();') === 2);
t('handleFinish refreshes the session token before posting', page.includes('await supabase.auth.getSession()'));
t('the finish posts carry the refreshed token', count(page, 'headers: finishHeaders') === 3);
t('handleFinish refreshes the board so the new time shows at once', page.includes('void refreshBoard(selectedCourse.id);'));
t('the board refresh is a shared function, not a one-off fetch', page.includes('const refreshBoard = useCallback'));
t('a failed recording is shown on the menu board and the podium', count(page, '{recordError && (') === 2);

console.log(`finish-guard: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
