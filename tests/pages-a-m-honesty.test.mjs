// tests/pages-a-m-honesty.test.mjs
// Honesty regression tests for Pages A–M (authenticity audit 2026-09-28).
// Run: node tests/pages-a-m-honesty.test.mjs (from the repo root).
// No browser, no network — asserts on route source so the fixed copy
// can never silently regress back into a facade.
import { readFileSync } from 'fs';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(p, 'utf8');

// --- basketball: NPC scores badged, never mixed silently ---
const bb = src('app/basketball/page.jsx');
t('basketball renders CPU badge', />CPU</.test(bb));
t('basketball passes isNpc on NPC submit', /isNpc:\s*true/.test(bb));
t('basketball discloses badge rollout state', /badged CPU once the leaderboard update is live/.test(bb));
const bstore = src('lib/basketball/storage.js');
t('storage tags NPC rows with is_npc', /is_npc:\s*true/.test(bstore));
t('storage retries without is_npc when column missing', /isUnknownColumn/.test(bstore));
t('storage sanitizes player names', /sanitizeName/.test(bstore));

// --- aetheris: simulation disclosed as fiction ---
const aep = src('app/aetheris/page.jsx');
t('aetheris console labeled fictional', /interactive simulation console for a fictional UNIT_07/.test(aep));
const aeplan = src('app/aetheris/plan-data.js');
t('aetheris plan honest about design status', /the ET-GAP-700 is a design, not a deployed product/.test(aeplan));
t('aetheris plan drops Production-ready', !/Production-ready/.test(aeplan));
const aecon = src('app/aetheris/console.jsx');
t('aetheris console discloses local readings', /Simulated unit — no real tower; readings are generated locally/.test(aecon));

// --- alexandria: no telemetry phone-home ---
const alex = src('app/alexandria/page.tsx');
t('alexandria has no central_telemetry insert', !/central_telemetry/.test(alex));

// --- hephaestus: illustration + local board disclosed ---
const heph = src('app/hephaestus/page.jsx');
t('hephaestus reach labeled illustration', /branches \(illustration\)/.test(heph));
t('hephaestus board disclosed as on-device only', /on this device only/.test(heph));

// --- holoframe: no fake ONLINE status ---
const holo = src('app/holoframe/page.jsx');
t('holoframe says READY not ONLINE', /STATUS: READY/.test(holo) && !/STATUS: ONLINE/.test(holo));

// --- atlantis: concept prospectus labeled ---
const atl = src('app/atlantis/engine.js');
t('atlantis propulsion labeled concept', /Propulsion & Navigation \(concept\)/.test(atl));
t('atlantis notes not-built status', /not a built vessel/.test(atl));

// --- iq-test: not an IQ measure ---
const iq = src('app/iq-test/page.jsx');
t('iq-test retitled Axiom Scramble', /Axiom Scramble/.test(iq) && !/IQ Test/.test(iq));
t('iq-test discloses puzzle score', /not an IQ measure/.test(iq));

// --- gym-equipment: concept showcase banner, honest tap copy ---
const gym = src('app/gym-equipment/page.jsx');
t('gym has concept showcase banner', /CONCEPT SHOWCASE — not a real product/.test(gym));
t('gym tap copy is honest', /TAP ANYWHERE FOR A BURST/.test(gym) && !/TAP ANYWHERE TO SYNC/.test(gym));

// --- geometry-engine: honest export label, working shape buttons ---
const geo = src('app/geometry-engine/page.tsx');
t('geometry export labeled Download PNG', /Download PNG/.test(geo) && !/PUSH TO PUBLISHER/.test(geo));
t('geometry assigns createNewGeometry to window', /window\.createNewGeometry\s*=/.test(geo));

// --- housing-architecture: structural warning present ---
const hous = src('app/housing-architecture/page.jsx');
t('housing warns concept not safe to build', /not engineered, not stamped, and not safe to build/.test(hous));

// --- language pass: no jargon/hype in touched copy ---
const bp = src('app/blueprint-protocol/page.jsx');
t('blueprint-protocol avoids Leverage jargon', !/Leverage the Pilot House/.test(bp));
const chessLayout = src('app/chess/layout.jsx');
t('chess metadata avoids Next-Generation hype', !/Next-Generation/.test(chessLayout));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
