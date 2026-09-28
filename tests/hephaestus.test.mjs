// tests/hephaestus.test.mjs
// Headless tests for the Hephaestus forge module. Run: node tests/hephaestus.test.mjs
// (from the repo root). No browser, no network — pure logic in lib/hephaestus.js.
import {
  FORGE_STAGES, FORGE_STAGE_IDS, IDEA_STAGES, IDEA_STAGE_IDS, SEED_IDEAS,
  nextIdeaStage, nextForgeStage,
  validateCommission, suggestMythicName, buildShareCopy,
  loadJSON, saveJSON, makeId,
  OLYMPUS_FACTS, OLYMPUS_PRODUCTS, LUGE_ARSENAL_FACTS, FACTORY_LOOP,
} from '../lib/hephaestus.js';

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- Forge pipeline stages ---
t('6 forge stages', FORGE_STAGES.length === 6);
t('forge order is concept->audit->strip->build->test->publish',
  FORGE_STAGE_IDS.join(',') === 'concept,audit,strip,build,test,publish');
t('forge advance: concept -> audit', nextForgeStage('concept') === 'audit');
t('forge advance: publish stays publish', nextForgeStage('publish') === 'publish');
t('forge advance: unknown stays', nextForgeStage('nope') === 'nope');

// --- Idea stages ---
t('3 idea stages: spark->ember->forged', IDEA_STAGE_IDS.join(',') === 'spark,ember,forged');
t('idea advance: spark -> ember', nextIdeaStage('spark') === 'ember');
t('idea advance: ember -> forged', nextIdeaStage('ember') === 'forged');
t('idea advance: forged stays forged', nextIdeaStage('forged') === 'forged');
t('idea advance: unknown stays', nextIdeaStage('nope') === 'nope');

// --- Seed ideas: Merlin's words ---
t('9 seed ideas', SEED_IDEAS.length === 9);
const byId = Object.fromEntries(SEED_IDEAS.map((s) => [s.id, s]));
t('poverty seed present, prime', byId['seed-poverty'] && byId['seed-poverty'].prime === true
  && byId['seed-poverty'].text === 'Poverty needs to end.');
t('homelessness seed present, prime', byId['seed-homelessness'] && byId['seed-homelessness'].prime === true
  && /homeless/i.test(byId['seed-homelessness'].text));
t('homelessness seed links tensegrity housing', /tensegrity/i.test(byId['seed-homelessness'].detail)
  && /spider web/i.test(byId['seed-homelessness'].detail));
t('homelessness seed names the Factory arm', /factory/i.test(byId['seed-homelessness'].detail));
t('multiply mission seeded', SEED_IDEAS.some((s) => /multiply to as many people as possible/i.test(s.text)));
t('reverse pollution seeded', SEED_IDEAS.some((s) => /reverse pollution/i.test(s.text)));
t('digital pays for physical seeded', SEED_IDEAS.some((s) => /digital pays for physical/i.test(s.text)));
t('alchemy seeded', SEED_IDEAS.some((s) => /alchemy/i.test(s.text)));
t('air car seeded', SEED_IDEAS.some((s) => /air-powered car/i.test(s.text)));
t('data centre seeded', SEED_IDEAS.some((s) => /data centre/i.test(s.text)));
t('tensegrity housing seeded', SEED_IDEAS.some((s) => /tensegrity housing/i.test(s.text)));
t('all seeds from artemis', SEED_IDEAS.every((s) => s.origin === 'artemis'));
t('all seeds start at spark or ember', SEED_IDEAS.every((s) => s.stage === 'spark' || s.stage === 'ember'));

// --- Commission validation ---
let v = validateCommission({ name: 'Testverse', concept: 'A pocket universe for testing.', mythicName: 'Talos' });
t('valid commission passes', v.ok && v.errors.length === 0);
v = validateCommission({ name: '', concept: 'A fine concept indeed.' });
t('missing name fails', !v.ok && v.errors.length > 0);
v = validateCommission({ name: 'X', concept: 'short' });
t('short concept fails', !v.ok);
v = validateCommission({ name: 'x'.repeat(61), concept: 'A fine concept indeed.' });
t('overlong name fails', !v.ok);
v = validateCommission({ name: 'X', concept: 'A fine concept indeed.', mythicName: 'y'.repeat(41) });
t('overlong mythic name fails', !v.ok);

// --- Mythic name suggestions ---
t('sea concept -> Proteus', suggestMythicName('an ocean world of shifting currents') === 'Proteus');
t('forge concept -> Daedalus', suggestMythicName('a place to build inventions') === 'Daedalus');
t('deterministic fallback', suggestMythicName('zzz qqq') === suggestMythicName('zzz qqq'));
t('fallback returns a real name', /^[A-Z][a-z]+$/.test(suggestMythicName('zzz qqq')));

// --- Share copy ---
let s = buildShareCopy('idea', 'End homelessness.', 'Shelter for everyone.', 'https://example.com/');
t('share url ends at /hephaestus', s.url === 'https://example.com/hephaestus');
t('share text carries the title', s.text.includes('End homelessness.'));
t('share text carries the mission', /multiply/i.test(s.text));
s = buildShareCopy('commission', 'Testverse', 'A test.', 'https://example.com');
t('commission kind label', /pocket universe/i.test(s.text));
s = buildShareCopy('product', 'Olympus store', 'Tees.', 'https://example.com');
t('product kind label', /physical good/i.test(s.text));

// --- Storage helpers (headless: no window) ---
t('loadJSON returns fallback without window', loadJSON('x', 42) === 42);
t('saveJSON returns false without window', saveJSON('x', 1) === false);

// --- IDs ---
const a = makeId('idea'), b = makeId('idea');
t('makeId has prefix', a.startsWith('idea-'));
t('makeId unique', a !== b);

// --- Factory: real product facts ---
t('olympus: 24 products', OLYMPUS_FACTS.count === 24 && OLYMPUS_PRODUCTS.length === 24);
t('olympus: CAD 95.00', OLYMPUS_FACTS.priceCad === 95.0);
t('olympus: all have name+tag', OLYMPUS_PRODUCTS.every((p) => p.name && p.tag));
t('olympus: Hey Zeus!! present (real catalog)', OLYMPUS_PRODUCTS.some((p) => p.name === 'Hey Zeus!!'));
t('luge arsenal: $129 USD', LUGE_ARSENAL_FACTS.priceUsd === 129);
t('luge arsenal: 26 premium hulls', LUGE_ARSENAL_FACTS.premiumHulls === 26);
t('luge arsenal: hoodie claim', /hoodie/i.test(LUGE_ARSENAL_FACTS.includes));
t('factory loop: 4 steps', FACTORY_LOOP.length === 4);
t('factory loop ends in real hands', FACTORY_LOOP[3].id === 'hands');

// --- source wiring: page imports the lib, zero external requests ---
import { readFileSync } from 'fs';
const page = readFileSync('app/hephaestus/page.jsx', 'utf8');
t('page imports lib/hephaestus', page.includes("@/lib/hephaestus"));
t('page imports the satellite registry', page.includes('@/lib/i18n/satellites'));
t('page has zero http(s) URLs', !/https?:\/\//.test(page));
t('page states the mission', page.includes('multiply to as many people as possible'));
t('page states the prime directive', page.includes('POVERTY NEEDS TO END'));
t('page has back-to-launcher link', page.includes('href="/"'));
t('page has 44px touch targets', page.includes('minHeight: 44') || page.includes('minHeight:44'));
t('page honors reduced motion', page.includes('prefers-reduced-motion'));

console.log(`\nhephaestus: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
