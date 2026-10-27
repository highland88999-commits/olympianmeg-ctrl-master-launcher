// tests/human-ai-council.test.mjs — Headless tests for the /human-ai Council mode.
// Run: node tests/human-ai-council.test.mjs (from the repo root). No browser, no network.
import { readFileSync, existsSync } from 'fs';
import { evaluateHarvest } from '../lib/human-ai/consensus.js';
import { checkIntent } from '../lib/human-ai/compass.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(ROOT + p, 'utf8');

// --- evaluateHarvest: structure ------------------------------------------------
const r1 = await evaluateHarvest('Build a weekly meal planner that learns what my family likes');
t('returns task echo', r1.task === 'Build a weekly meal planner that learns what my family likes');
t('three verdicts', Array.isArray(r1.verdicts) && r1.verdicts.length === 3);
t('verdict fields present',
  r1.verdicts.every(v =>
    typeof v.agent === 'string' && v.agent.length > 0 &&
    typeof v.focus === 'string' && v.focus.length > 0 &&
    typeof v.verdict === 'string' && v.verdict.length > 40));
t('expected council members',
  JSON.stringify(r1.verdicts.map(v => v.agent)) === JSON.stringify(['Gemini Prime', 'Copilot Beta', 'Grok X']));
t('approved is boolean true', r1.approved === true);
t('nurture_score in 6..10', Number.isInteger(r1.nurture_score) && r1.nurture_score >= 6 && r1.nurture_score <= 10);
t('consensus non-empty', typeof r1.consensus === 'string' && r1.consensus.length > 60);

// --- evaluateHarvest: task-aware, not canned -----------------------------------
t('verdicts reference the task content',
  r1.verdicts.every(v => /meal planner|planner/i.test(v.verdict)));
const rQ = await evaluateHarvest('Why is the sky blue?');
t('question classified distinctly', /question/i.test(rQ.verdicts[0].verdict));
t('different tasks give different verdicts', r1.verdicts[0].verdict !== rQ.verdicts[0].verdict);

// --- evaluateHarvest: deterministic -------------------------------------------
const r2 = await evaluateHarvest('Build a weekly meal planner that learns what my family likes');
t('deterministic output', JSON.stringify(r1) === JSON.stringify(r2));

// --- evaluateHarvest: empty input ----------------------------------------------
let threw = false;
try { await evaluateHarvest('   '); } catch (e) { threw = /needs a task/i.test(e.message); }
t('empty task throws', threw);

// --- Compass gate still applies -------------------------------------------------
t('compass blocks harm', checkIntent('how to harm someone').allowed === false);
t('compass blocks dehumanize', checkIntent('dehumanize the group').allowed === false);
t('compass allows benign council task', checkIntent('Build a weekly meal planner').allowed === true);

// --- Security: 'dad' handshake bypass is gone -----------------------------------
const agentSrc = read('lib/human-ai/agent.js');
t('agent.js has no dad bypass', !/handshake\s*===\s*['"]dad['"]/.test(agentSrc));
t("agent.js has no 'dad' string at all", !/['"]dad['"]/.test(agentSrc));
t('isArchitect only compares env handshake',
  /isArchitect\s*=\s*\(?handshake\s*===\s*process\.env\.HANDSHAKE\)?\s*;/.test(agentSrc));

// --- Council API route ------------------------------------------------------------
t('council route exists', existsSync(ROOT + 'app/api/council/route.js'));
const routeSrc = read('app/api/council/route.js');
t('route uses evaluateHarvest', /evaluateHarvest/.test(routeSrc));
t('route gates with checkIntent', /checkIntent/.test(routeSrc));
t('route returns 403 on violation', /403/.test(routeSrc));
t('route returns 400 on empty task', /400/.test(routeSrc));

// --- Page wiring -------------------------------------------------------------------
const pageSrc = read('app/human-ai/page.tsx');
t('page has CHAT/COUNCIL mode tabs', /mode-tab/.test(pageSrc) && /COUNCIL/.test(pageSrc));
t('page posts to /api/council', /\/api\/council/.test(pageSrc));
t('page renders verdict cards', /verdict-card/.test(pageSrc) && /consensus-panel/.test(pageSrc));
t('page labels council honestly (simulated, not live)',
  /simulated council/i.test(pageSrc) && /not live model calls/i.test(pageSrc));
t('page shows nurture score', /nurture_score/.test(pageSrc));
t('council results included in export log', /COUNCIL DELIBERATION/.test(pageSrc));

// --- CSS ----------------------------------------------------------------------------
const cssSrc = read('app/human-ai/human-ai.css');
t('css has council styles',
  /council-verdict/.test(cssSrc) && /verdict-card/.test(cssSrc) && /consensus-panel/.test(cssSrc) && /mode-tab/.test(cssSrc));

// --- Mobile header overflow fix (2026-10-27: on phones the header row
// clipped the language selector off the right edge, unreachable) -----------
const mobileBlock = (() => {
  const i = cssSrc.indexOf('@media (max-width: 768px)');
  return i >= 0 ? cssSrc.slice(i) : '';
})();
t('mobile header-controls wraps instead of clipping',
  /\.header-controls\s*\{[^}]*flex-wrap:\s*wrap/.test(mobileBlock));
t('mobile header keeps tabs, export, language in DOM order',
  /header-controls[\s\S]*?mode-tabs[\s\S]*?export-btn[\s\S]*?hai-lang-wrap[\s\S]*?lang-selector/.test(pageSrc));
t('mobile input-area carries safe-area bottom padding',
  /\.input-area\s*\{[^}]*env\(safe-area-inset-bottom\)/.test(mobileBlock));
t('desktop header-controls row unchanged (no wrap on desktop)',
  /\.header-controls\s*\{\s*display:\s*flex;\s*gap:\s*15px;\s*align-items:\s*center;\s*\}/.test(cssSrc));
t('export-btn disabled state untouched (greyed with zero messages is by design)',
  /\.export-btn:disabled\s*\{[^}]*opacity:\s*0\.3/.test(cssSrc));

// --- summary --------------------------------------------------------------------------
console.log(`\nhuman-ai-council: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
