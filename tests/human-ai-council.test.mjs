// tests/human-ai-council.test.mjs — Headless tests for the /human-ai Council mode.
// Run: node tests/human-ai-council.test.mjs (from the repo root). No browser, no network.
// The Council is the live Muse + Gemini duo: evaluateHarvest calls the two real
// voices in production, so every test below injects stub voices (the `voices`
// seam) and never touches the network.
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

// Stub voices: echo the task so verdicts are task-aware without any network.
const liveVoices = {
  muse: async (prompt) => `Muse verdict on ${prompt.slice(-60)}`,
  gemini: async (prompt) => `Gemini verdict on ${prompt.slice(-60)}`,
};

// --- evaluateHarvest: structure ------------------------------------------------
const r1 = await evaluateHarvest('Build a weekly meal planner that learns what my family likes', liveVoices);
t('returns task echo', r1.task === 'Build a weekly meal planner that learns what my family likes');
t('exactly two verdicts — the duo', Array.isArray(r1.verdicts) && r1.verdicts.length === 2);
t('verdict fields present',
  r1.verdicts.every(v =>
    typeof v.agent === 'string' && v.agent.length > 0 &&
    typeof v.focus === 'string' && v.focus.length > 0 &&
    typeof v.verdict === 'string' && v.verdict.length > 10 &&
    typeof v.live === 'boolean'));
t('council members are Muse and Gemini, in that order',
  JSON.stringify(r1.verdicts.map(v => v.agent)) === JSON.stringify(['Muse', 'Gemini']));
t('no simulated personas survive',
  !r1.verdicts.some(v => /Gemini Prime|Copilot Beta|Grok X/.test(v.agent)));
t('both voices live when both answer', r1.verdicts.every(v => v.live === true));
t('approved is boolean true with live voices', r1.approved === true);
t('nurture_score in 6..10', Number.isInteger(r1.nurture_score) && r1.nurture_score >= 6 && r1.nurture_score <= 10);
t('consensus non-empty', typeof r1.consensus === 'string' && r1.consensus.length > 60);
t('consensus names both live voices', /Muse and Gemini/.test(r1.consensus));
t('note states live duo', r1.note === 'LIVE COUNCIL — Muse + Gemini deliberation');

// --- evaluateHarvest: task-aware, not canned -----------------------------------
t('verdicts reference the task content',
  r1.verdicts.every(v => /meal planner|planner/i.test(v.verdict)));
const rQ = await evaluateHarvest('Why is the sky blue?', liveVoices);
t('question classified distinctly', /question/i.test(rQ.consensus));
t('different tasks give different verdicts', r1.verdicts[0].verdict !== rQ.verdicts[0].verdict);

// --- evaluateHarvest: same stubs, same derivation ------------------------------
const r2 = await evaluateHarvest('Build a weekly meal planner that learns what my family likes', liveVoices);
t('same stub voices give same derivation', JSON.stringify(r1) === JSON.stringify(r2));

// --- evaluateHarvest: empty input ----------------------------------------------
let threw = false;
try { await evaluateHarvest('   ', liveVoices); } catch (e) { threw = /needs a task/i.test(e.message); }
t('empty task throws', threw);

// --- evaluateHarvest: one voice down — honest, never fabricated ---------------
const oneDown = await evaluateHarvest('Build a weekly meal planner', {
  muse: async () => { throw new Error('boom'); },
  gemini: liveVoices.gemini,
});
t('down voice yields live=false', oneDown.verdicts[0].live === false);
t('down voice verdict says offline, not a fabricated verdict',
  /offline right now/i.test(oneDown.verdicts[0].verdict));
t('live voice still delivers', oneDown.verdicts[1].live === true && oneDown.verdicts[1].verdict.length > 10);
t('approved stays true on one live verdict', oneDown.approved === true);
t('note names the offline voice', oneDown.note === 'LIVE COUNCIL — Gemini live, Muse offline (no verdict fabricated)');
t('consensus admits the offline voice', /Muse was offline/i.test(oneDown.consensus));

const otherDown = await evaluateHarvest('Build a weekly meal planner', {
  muse: liveVoices.muse,
  gemini: async () => null,
});
t('null reply counts as down', otherDown.verdicts[1].live === false);
t('note names Gemini offline', otherDown.note === 'LIVE COUNCIL — Muse live, Gemini offline (no verdict fabricated)');

// --- evaluateHarvest: both voices down ----------------------------------------
const bothDown = await evaluateHarvest('Build a weekly meal planner', {
  muse: async () => { throw new Error('boom'); },
  gemini: async () => '',
});
t('both down yields approved=false', bothDown.approved === false);
t('both down verdicts are down messages, not fabrications',
  bothDown.verdicts.every(v => v.live === false && /offline right now/i.test(v.verdict)));
t('both down note says council offline', bothDown.note === 'COUNCIL OFFLINE — both voices unavailable');
t('both down consensus says could not convene', /could not convene/i.test(bothDown.consensus));

// --- Production wiring: the real voices are the orb Muse backend + chat engine -
const consensusSrc = read('lib/human-ai/consensus.js');
t('Muse voice imports the orb responder backend',
  /from '\.\.\/muse\/responder\.js'/.test(consensusSrc) && /generateMuseReply/.test(consensusSrc));
t('Gemini voice imports the chat engine',
  /from '\.\/engine\.js'/.test(consensusSrc) && /runHumanAI/.test(consensusSrc));
t('no simulated persona templates remain in consensus',
  !/Gemini Prime|Copilot Beta|Grok X/.test(consensusSrc));

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
t('page renders the council note from live data, never a simulated claim',
  /msg\.council\.note/.test(pageSrc) && !/SIMULATED COUNCIL/.test(pageSrc));
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
