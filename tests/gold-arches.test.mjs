// tests/gold-arches.test.mjs — headless tests for the GOLD ARCH WRAP
// (Merlin, 2026-11-15): every portal arch in every realm wears the
// scratched-gold texture on its stone structure (posts + lintel),
// light-reflecting (metalness 0.9, roughness 0.3). Run:
//   node tests/gold-arches.test.mjs (from the repo root).
// No browser, no network — proves:
//   * the gold photo is Merlin's upload, byte-for-byte, at the one
//     shared path (public/textures/gold/gold-scratched.jpg — the
//     Moon flag-pole wrap uses this same file, no second copy)
//   * the shared module exports the URL + hash + reflective props
//     and the house TextureLoader hook pattern
//   * all 25 realm scenes wire the gold into PortalArches (source-
//     level): the two stone meshes per arch wear {...archMat}, and
//     NO stone material is left inside any PortalArches
//   * the doorway art discs are untouched (13 nether scenes still
//     hang their destination art; the gold never covers them)
//   * the other stonework in these files is untouched (Descent
//     portal stones, floors, etc. — exact outside counts pinned)
//   * no new lights were added inside any PortalArches
//   * OUT OF SCOPE, untouched: the hub Omega Arch (video wrap by
//     design) and the hub realm gates (rectangular pillar-and-bar
//     frames, not arches — their gold-ring question is still open)
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  GOLD_TEXTURE_URL,
  GOLD_TEXTURE_SHA256,
  GOLD_ARCH_METALNESS,
  GOLD_ARCH_ROUGHNESS,
  useGoldTexture,
  useGoldArchMaterial,
} from '../lib/portal/gold-texture.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}`); }
}

/* The 25 realm scenes, each with its own PortalArches: 13 nether
 * (stone-spread variant + doorway art) + 11 higher + ghost-rider
 * (plain-stone variant, no doorway art). The OUTSIDE count is the
 * number of STONE-material meshes in the file OUTSIDE PortalArches
 * before this change — pinned so no other stonework moved. */
const SCENES = {
  'nether-realm': { variant: 'A', outside: 4 },
  helheim: { variant: 'A', outside: 3 },
  yomi: { variant: 'A', outside: 4 },
  hell: { variant: 'A', outside: 4 },
  naraka: { variant: 'A', outside: 4 },
  diyu: { variant: 'A', outside: 4 },
  annwn: { variant: 'A', outside: 3 },
  kur: { variant: 'A', outside: 3 },
  nav: { variant: 'A', outside: 3 },
  orun: { variant: 'A', outside: 3 },
  duat: { variant: 'A', outside: 3 },
  mictlan: { variant: 'A', outside: 4 },
  xibalba: { variant: 'A', outside: 4 },
  aaru: { variant: 'B', outside: 4 },
  elysium: { variant: 'B', outside: 4 },
  heaven: { variant: 'B', outside: 3 },
  'maya-sky': { variant: 'B', outside: 6 },
  svarga: { variant: 'B', outside: 3 },
  takamagahara: { variant: 'B', outside: 3 },
  tiangong: { variant: 'B', outside: 6 },
  'tir-na-nog': { variant: 'B', outside: 3 },
  tlalocan: { variant: 'B', outside: 6 },
  valhalla: { variant: 'B', outside: 4 },
  vyraj: { variant: 'B', outside: 6 },
  'ghost-rider': { variant: 'B', outside: 0 },
};

const ARCHES_IMPORT = "import { useGoldArchMaterial } from '@/lib/portal/gold-texture';";

/* Extract the PortalArches function body (brace-matched) so the
 * checks below only see the arch — never the rest of the file. */
function archBody(src) {
  const i = src.indexOf('function PortalArches');
  if (i === -1) return null;
  const j = src.indexOf('{', i);
  let depth = 0;
  let k = j;
  while (k < src.length) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
    k += 1;
  }
  return src.slice(j, k + 1);
}

/* --- the gold file: Merlin's upload, byte-for-byte, one path --- */
const goldFile = join(ROOT, 'public', GOLD_TEXTURE_URL.replace(/^\//, ''));
t('gold texture URL is the shared path', GOLD_TEXTURE_URL === '/textures/gold/gold-scratched.jpg');
t('gold texture file exists on disk', existsSync(goldFile));
if (existsSync(goldFile)) {
  const bytes = readFileSync(goldFile);
  t('gold texture is a JPEG (magic bytes)', bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
  t('gold texture is 400,196 bytes (the upload)', bytes.length === 400196);
  const hash = createHash('sha256').update(bytes).digest('hex');
  t('gold texture SHA-256 matches the upload', hash === GOLD_TEXTURE_SHA256);
  t('gold texture SHA-256 matches the module constant',
    GOLD_TEXTURE_SHA256 === '260de1b4ad6e465d00b5c5f4d4ccebfd315eeef84e6a5f551067b7fa151d4293');
}

/* --- the shared module --- */
t('gold metalness is 0.9 (light-reflecting)', GOLD_ARCH_METALNESS === 0.9);
t('gold roughness is 0.3 (fairly smooth)', GOLD_ARCH_ROUGHNESS === 0.3);
t('useGoldTexture is a function', typeof useGoldTexture === 'function');
t('useGoldArchMaterial is a function', typeof useGoldArchMaterial === 'function');
const goldSrc = readFileSync(join(ROOT, 'lib', 'portal', 'gold-texture.js'), 'utf8');
t('module: hook loads with the house TextureLoader pattern',
  goldSrc.includes('new THREE.TextureLoader().load(GOLD_TEXTURE_URL'));
t('module: hook sets SRGBColorSpace',
  goldSrc.includes('t.colorSpace = THREE.SRGBColorSpace'));
t('module: gold props carry the metalness + roughness constants',
  goldSrc.includes('metalness: GOLD_ARCH_METALNESS')
  && goldSrc.includes('roughness: GOLD_ARCH_ROUGHNESS'));
t('module: fallback returns the caller stone props (never blank)',
  goldSrc.includes('return fallback;'));

/* --- wire-ins are really in all 25 scene files --- */
const realms = Object.keys(SCENES);
t('25 realm scenes carry PortalArches', realms.length === 25);
for (const realm of realms) {
  const { variant, outside } = SCENES[realm];
  const src = readFileSync(join(ROOT, 'app', realm, 'world3d.js'), 'utf8');
  const body = archBody(src);
  t(`${realm}: defines PortalArches`, body !== null);
  if (body === null) continue;
  t(`${realm}: imports useGoldArchMaterial`, src.includes(ARCHES_IMPORT));
  t(`${realm}: PortalArches calls the hook once`,
    (body.match(/useGoldArchMaterial\(/g) || []).length === 1);
  t(`${realm}: both arch meshes wear {...archMat}`,
    (body.match(/<meshStandardMaterial \{\.\.\.archMat\} \/>/g) || []).length === 2);
  t(`${realm}: no stone material left inside PortalArches`,
    !body.includes('<meshStandardMaterial {...stone} color={STONE} roughness={0.9} />')
    && !/<meshStandardMaterial color=\{STONE\} roughness=\{0\.9\} \/>/.test(body));
  t(`${realm}: posts + lintel geometry intact`,
    body.includes('boxGeometry args={[1.2, 8, 1.2]}')
    && body.includes('boxGeometry args={[8.4, 1.2, 1.2]}'));
  if (variant === 'A') {
    t(`${realm}: gold falls back to the scene stone spread`,
      body.includes('useGoldArchMaterial({ ...stone, color: STONE, roughness: 0.9 })'));
  } else {
    t(`${realm}: gold falls back to the plain stone colour`,
      body.includes('useGoldArchMaterial({ color: STONE, roughness: 0.9 })'));
  }
  t(`${realm}: no new lights inside PortalArches`,
    !/<pointLight|<spotLight|<directionalLight/.test(body));
  const outsideCount = (src.replace(body, '').match(/meshStandardMaterial[^>]*STONE[^>]*>/g) || []).length;
  t(`${realm}: other stonework untouched (${outside} STONE meshes outside the arches)`,
    outsideCount === outside);
}

/* --- doorway art untouched (nether scenes only) --- */
const netherRealms = realms.filter((r) => SCENES[r].variant === 'A');
t('13 nether scenes carry doorway art', netherRealms.length === 13);
for (const realm of netherRealms) {
  const src = readFileSync(join(ROOT, 'app', realm, 'world3d.js'), 'utf8');
  t(`${realm}: still imports useArchTextures`,
    src.includes("import { useArchTextures } from '@/lib/portal/arch-graphics'"));
  t(`${realm}: art mesh still hangs at [0, 3.6, 0.12] opacity 0.92`,
    src.includes('position={[0, 3.6, 0.12]}')
    && src.includes('map={archTex[p.key]} transparent opacity={0.92}'));
}

/* --- Descent portal untouched (a ring of stones, not an arch) --- */
function fnBody(src, name) {
  const i = src.indexOf(`function ${name}`);
  if (i === -1) return null;
  const j = src.indexOf('{', i);
  let depth = 0;
  let k = j;
  while (k < src.length) {
    if (src[k] === '{') depth += 1;
    else if (src[k] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
    k += 1;
  }
  return src.slice(j, k + 1);
}
for (const realm of realms) {
  const src = readFileSync(join(ROOT, 'app', realm, 'world3d.js'), 'utf8');
  const descent = fnBody(src, 'DescentPortal');
  if (descent === null) continue;
  t(`${realm}: DescentPortal still exists`, true);
  t(`${realm}: DescentPortal still wears stone (not gold)`,
    !descent.includes('archMat') && descent.includes('stone'));
}

/* --- out of scope, untouched --- */
const omegaSrc = readFileSync(join(ROOT, 'components', 'OmegaHubGate.jsx'), 'utf8');
t('hub Omega Arch: no gold texture (video wrap by design)',
  !omegaSrc.includes('gold-texture') && !omegaSrc.includes('gold-scratched'));
const gatesSrc = readFileSync(join(ROOT, 'components', 'SpacePortalGates.jsx'), 'utf8');
t('hub realm gates: no gold texture (rectangular frames, not arches)',
  !gatesSrc.includes('gold-texture') && !gatesSrc.includes('gold-scratched'));
const registrySrc = readFileSync(join(ROOT, 'lib', 'portal', 'arch-graphics.js'), 'utf8');
t('doorway-art registry: no gold-texture reference in it (art discs keep their own graphics)',
  !registrySrc.includes('gold-texture') && !registrySrc.includes('gold-scratched')
  && !registrySrc.includes('GOLD_TEXTURE'));

console.log(`\ngold-arches: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
