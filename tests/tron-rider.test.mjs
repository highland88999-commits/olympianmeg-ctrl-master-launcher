// tests/tron-rider.test.mjs — Headless tests for the mounted TRON bike rider.
// Run: node tests/tron-rider.test.mjs (from the repo root).
// No browser, no network — asserts on lib/tron-rider.js pure logic plus
// source-level checks (profile hookup, reduced-motion gate, no telemetry,
// lighting rule: no lights, no bloom — glow is local geometry only).
import { readFileSync } from 'fs';
import {
  RIDER_FIT,
  riderFitFor,
  riderTagText,
  DEFAULT_RIDER_THEME,
} from '../lib/tron-rider.js';
import { isHexColor } from '../lib/profile.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// --- rider fit ------------------------------------------------------------
t('RIDER_FIT covers all three bikes', ['wisp', 'comet', 'atlas'].every((k) => k in RIDER_FIT));
t('wisp fit is the identity seat pose', riderFitFor('wisp').scale === 1 && riderFitFor('wisp').dy === 0 && riderFitFor('wisp').dz === 0);
t('atlas rider is lifted onto the taller frame', riderFitFor('atlas').dy > 0 && riderFitFor('atlas').scale > 1);
t('atlas rider sits back clear of the roll bar', riderFitFor('atlas').dz < 0);
t('unknown bike key falls back to wisp', riderFitFor('mystery') === riderFitFor('wisp'));
t('riderFitFor(undefined) falls back to wisp', riderFitFor(undefined).scale === 1);

// --- name tag --------------------------------------------------------------
t('tag prefers display name over callsign',
  riderTagText({ displayName: 'Merlin', callsign: 'Artemis' }) === 'Merlin');
t('tag falls back to callsign',
  riderTagText({ displayName: '', callsign: 'Artemis' }) === 'Artemis');
t('tag is empty (no fake identity) when nothing is set',
  riderTagText({ displayName: '', callsign: '' }) === '');
t('tag is empty for a null profile', riderTagText(null) === '');
t('tag never invents a placeholder',
  !/unknown|anonymous|rider/i.test(riderTagText(null)));

// --- default rider theme ----------------------------------------------------
t('default theme colors are all valid hex',
  isHexColor(DEFAULT_RIDER_THEME.suit) && isHexColor(DEFAULT_RIDER_THEME.helmet) && isHexColor(DEFAULT_RIDER_THEME.glow));

// --- source checks: TronRider.jsx --------------------------------------------
const riderSrc = stripComments(readFileSync('components/nova/TronRider.jsx', 'utf8'));
t('TronRider reads the /profile character via loadProfile', riderSrc.includes('loadProfile'));
t('TronRider applies profile colors via riderTheme', riderSrc.includes('riderTheme('));
t('TronRider falls back to DEFAULT_RIDER_THEME', riderSrc.includes('DEFAULT_RIDER_THEME'));
t('TronRider takes a reduced prop', /function TronRider\(\{\s*bikeKey[^}]*reduced/.test(riderSrc) || riderSrc.includes('reduced = false'));
t('TronRider gates the idle bob behind reduced motion',
  riderSrc.includes('if (reduced)') && riderSrc.includes('useFrame'));
t('TronRider rider is static when reduced (zeroes bob offsets)', riderSrc.includes('g.position.y = 0'));
t('TronRider has a name-tag sprite only from the profile tag', riderSrc.includes('riderTagText'));
t('TronRider adds no lights (would drown texture wraps)', !/pointLight|spotLight|directionalLight|ambientLight/.test(riderSrc));
t('TronRider has no bloom/postprocessing', !/EffectComposer|BloomPass|UnrealBloom/.test(riderSrc));
t('TronRider glow is local meshBasicMaterial geometry only', riderSrc.includes('meshBasicMaterial'));
t('TronRider performs no network/telemetry', !/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(riderSrc));

// --- source checks: wired into the three modules -----------------------------
const novaSrc = readFileSync('app/nova/page.jsx', 'utf8');
const myriadSrc = readFileSync('app/myriad/page.jsx', 'utf8');
const argoSrc = readFileSync('app/argo/page.jsx', 'utf8');
t('nova imports TronRider', novaSrc.includes("from '@/components/nova/TronRider'"));
t('nova flight rig mounts the rider', (novaSrc.match(/<TronRider /g) || []).length >= 2);
t('myriad imports TronRider', myriadSrc.includes("from '@/components/nova/TronRider'"));
t('myriad flight rig mounts the rider', myriadSrc.includes('<TronRider bikeKey={bikeKey} reduced={reduced} />'));
t('argo imports TronRider', argoSrc.includes("from '@/components/nova/TronRider'"));
t('argo mounts the rider only on tron bike archetypes', argoSrc.includes("isTronBike") && argoSrc.includes("vehicleKey === 'wisp' || vehicleKey === 'comet'"));
t('argo rider scales with the vehicle group', argoSrc.includes('<TronRider bikeKey={vehicleKey} reduced={reduced} />'));

console.log(`\ntron-rider: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
