// tests/arch-graphics.test.mjs — headless tests for the hell-realms
// ARCH DOORWAY treatment (lib/portal/arch-graphics.js, wired into
// PortalArches in all 13 app/<realm>/world3d.js scenes).
// Run: node tests/arch-graphics.test.mjs (from the repo root).
// No browser, no network — proves:
//   * all 9 arch destinations are mapped, no path repeats
//   * medusa reuses the EXISTING lair graphic (no new image, no dup)
//   * every graphic file exists on disk under public/art/arches/
//     (except medusa, under public/art/portals/) with unique bytes
//   * every destination has a depicts entry
//   * artForArch returns undefined for unknown keys — NO Hades fallback
//   * the wire-ins are really in all 13 scene files (source-level)
//   * the Cerberus door HAS art (map entry + a Cerberus arch renders it)
//   * the verified arch inventory: 61 instances across the 13 realms
//   * ORIGINAL ONLY — no Mortal Kombat strings anywhere in the new code
//
// NOTE on sequencing: the 8 new door images land from the art worker
// in parallel. The file-existence / hash assertions below fail until
// they land; everything else in this suite runs green before that.
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ARCH_GRAPHICS,
  ARCH_DEPICTS,
  artForArch,
} from '../lib/portal/arch-graphics.js';
import { PORTALS as HADES_PORTALS } from '../lib/nether-realm/world.js';
import { PORTALS as HELHEIM_PORTALS } from '../lib/helheim/world.js';
import { PORTALS as YOMI_PORTALS } from '../lib/yomi/world.js';
import { PORTALS as HELL_PORTALS } from '../lib/hell/world.js';
import { PORTALS as NARAKA_PORTALS } from '../lib/naraka/world.js';
import { PORTALS as DIYU_PORTALS } from '../lib/diyu/world.js';
import { PORTALS as ANNWN_PORTALS } from '../lib/annwn/world.js';
import { PORTALS as KUR_PORTALS } from '../lib/kur/world.js';
import { PORTALS as NAV_PORTALS } from '../lib/nav/world.js';
import { PORTALS as ORUN_PORTALS } from '../lib/orun/world.js';
import { PORTALS as DUAT_PORTALS } from '../lib/duat/world.js';
import { PORTALS as MICTLAN_PORTALS } from '../lib/mictlan/world.js';
import { PORTALS as XIBALBA_PORTALS } from '../lib/xibalba/world.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}`); }
}

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

const REALMS = {
  'nether-realm': HADES_PORTALS,
  helheim: HELHEIM_PORTALS,
  yomi: YOMI_PORTALS,
  hell: HELL_PORTALS,
  naraka: NARAKA_PORTALS,
  diyu: DIYU_PORTALS,
  annwn: ANNWN_PORTALS,
  kur: KUR_PORTALS,
  nav: NAV_PORTALS,
  orun: ORUN_PORTALS,
  duat: DUAT_PORTALS,
  mictlan: MICTLAN_PORTALS,
  xibalba: XIBALBA_PORTALS,
};

const EXPECTED = {
  'nether-realm': ['styx', 'cerberus', 'medusa', 'persephone', 'afterlife', 'erebus', 'zeus-v-hades'],
  helheim: ['persephone', 'erebus', 'nether-realm', 'styx', 'cerberus'],
  yomi: ['afterlife', 'sanctuary', 'nether-realm', 'styx', 'zeus-v-hades'],
  hell: ['nether-realm', 'styx', 'cerberus', 'erebus', 'zeus-v-hades'],
  naraka: ['styx', 'nether-realm', 'afterlife', 'sanctuary'],
  diyu: ['nether-realm', 'styx', 'cerberus', 'persephone', 'afterlife'],
  annwn: ['persephone', 'afterlife', 'nether-realm', 'styx', 'cerberus'],
  kur: ['styx', 'cerberus', 'nether-realm', 'erebus'],
  nav: ['styx', 'sanctuary', 'nether-realm', 'persephone', 'erebus'],
  orun: ['styx', 'afterlife', 'nether-realm', 'persephone'],
  duat: ['styx', 'nether-realm', 'cerberus', 'persephone'],
  mictlan: ['sanctuary', 'nether-realm', 'erebus', 'zeus-v-hades'],
  xibalba: ['styx', 'nether-realm', 'afterlife', 'erebus'],
};

/* --- coverage: 9 destinations, one graphic each --- */
t('ARCH_GRAPHICS lists 9 destinations', Object.keys(ARCH_GRAPHICS).length === 9);
const allKeys = [...new Set(Object.values(EXPECTED).flat())];
t('the 9 distinct arch destinations are exactly the map keys',
  allKeys.length === 9 && allKeys.every((k) => ARCH_GRAPHICS[k]));
for (const [key, url] of Object.entries(ARCH_GRAPHICS)) {
  if (key === 'medusa') {
    t('medusa reuses the existing lair graphic (no new image)',
      url === '/art/portals/medusas-lair.jpg');
  } else {
    t(`${key}: graphic lives under /art/arches/`,
      url === `/art/arches/${key}.jpg`);
  }
}
const archPaths = Object.values(ARCH_GRAPHICS);
t('no graphic path repeats across destinations', new Set(archPaths).size === archPaths.length);

/* --- files on disk, no duplicate bytes (art lands in parallel) --- */
const hashes = new Map();
for (const [key, url] of Object.entries(ARCH_GRAPHICS)) {
  const file = join(ROOT, 'public', url.replace(/^\//, ''));
  t(`${key}: graphic file exists on disk (${url})`, existsSync(file));
  if (existsSync(file)) {
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    t(`${key}: graphic bytes are unique (no duplicate hash)`, !hashes.has(hash));
    hashes.set(hash, key);
  }
}

/* --- depicts: one true-to-destination line each --- */
for (const key of Object.keys(ARCH_GRAPHICS)) {
  t(`${key}: has a depicts entry`, typeof ARCH_DEPICTS[key] === 'string'
    && ARCH_DEPICTS[key].length > 20);
}

/* --- helper: NO fallback — a wrong image is worse than a plain disc --- */
t("artForArch('styx') is the styx graphic", artForArch('styx') === '/art/arches/styx.jpg');
t("artForArch('cerberus') is the cerberus graphic", artForArch('cerberus') === '/art/arches/cerberus.jpg');
t("artForArch('medusa') is the lair graphic", artForArch('medusa') === '/art/portals/medusas-lair.jpg');
t('artForArch returns undefined for an unknown key (no Hades fallback)',
  artForArch('no-such-destination') === undefined);
t('artForArch returns undefined for an empty key',
  artForArch('') === undefined);

/* --- verified arch inventory: 61 instances, 9 destinations --- */
let total = 0;
for (const [realm, portals] of Object.entries(REALMS)) {
  const keys = portals.map((p) => p.key);
  t(`${realm}: arch inventory matches (${keys.length} arches)`,
    keys.length === EXPECTED[realm].length
    && EXPECTED[realm].every((k) => keys.includes(k)));
  for (const k of keys) {
    t(`${realm}: arch '${k}' has an arch graphic`, typeof ARCH_GRAPHICS[k] === 'string');
  }
  total += keys.length;
}
t('61 arch instances total across the 13 realms', total === 61);

/* --- wire-ins are really in all 13 scene files --- */
for (const realm of Object.keys(REALMS)) {
  const src = readFileSync(join(ROOT, 'app', realm, 'world3d.js'), 'utf8');
  t(`${realm}: imports useArchTextures`,
    src.includes("import { useArchTextures } from '@/lib/portal/arch-graphics'"));
  t(`${realm}: PortalArches calls the hook with the realm's PORTALS keys`,
    src.includes('const archTex = useArchTextures(PORTALS.map((p) => p.key));'));
  t(`${realm}: art mesh sits at [0, 3.6, 0.12] opacity 0.92`,
    src.includes('position={[0, 3.6, 0.12]}')
    && src.includes('map={archTex[p.key]} transparent opacity={0.92}'));
  // Order inside PortalArches: glow disc (0.1) < art (0.12) < inner disc (0.15).
  const glow = src.indexOf('position={[0, 3.6, 0.1]}');
  const art = src.indexOf('map={archTex[p.key]}');
  const inner = src.indexOf('position={[0, 3.6, 0.15]}');
  t(`${realm}: art mesh sits between the glow disc and the inner disc`,
    glow !== -1 && art !== -1 && inner !== -1 && glow < art && art < inner);
  t(`${realm}: glow disc kept under the art (fallback before load)`,
    src.includes('color={PORTAL_GLOW} transparent opacity={0.55}'));
  t(`${realm}: art mesh is conditioned on the texture (no bare map)`,
    src.includes('{archTex[p.key] ? ('));
}

/* --- the Cerberus door HAS art (no exclusion, no special-casing) --- */
t('map has a cerberus entry', typeof ARCH_GRAPHICS.cerberus === 'string'
  && ARCH_GRAPHICS.cerberus === '/art/arches/cerberus.jpg');
const cerberusRealms = Object.entries(REALMS)
  .filter(([, portals]) => portals.some((p) => p.key === 'cerberus'))
  .map(([realm]) => realm);
t('Cerberus arches exist in 7 realms', cerberusRealms.length === 7);
for (const realm of cerberusRealms) {
  const src = readFileSync(join(ROOT, 'app', realm, 'world3d.js'), 'utf8');
  t(`${realm}: Cerberus arch renders the generic art mesh`,
    src.includes('map={archTex[p.key]}'));
  t(`${realm}: no Cerberus exclusion in the scene`,
    !src.includes("!== 'cerberus'") && !src.includes("!= 'cerberus'"));
}
const registrySrc = readFileSync(join(ROOT, 'lib', 'portal', 'arch-graphics.js'), 'utf8');
t('registry: no Cerberus exclusion or special-casing',
  !/exclu|skip.*cerberus|cerberus.*skip/i.test(stripComments(registrySrc))
  && !registrySrc.includes("!== 'cerberus'"));
t('registry: hook loads with the house TextureLoader pattern',
  registrySrc.includes('new THREE.TextureLoader().load(ARCH_GRAPHICS[k]'));
t('registry: hook sets SRGBColorSpace + centre-square crop',
  registrySrc.includes('tex.colorSpace = THREE.SRGBColorSpace')
  && registrySrc.includes('tex.repeat.set(2 / 3, 1)')
  && registrySrc.includes('tex.offset.set(1 / 6, 0)'));

/* --- Hades migration: same medusa visual, bespoke loader gone --- */
const hadesSrc = readFileSync(join(ROOT, 'app', 'nether-realm', 'world3d.js'), 'utf8');
t('hades: no bespoke lair loader left',
  !hadesSrc.includes('LAIR_GRAPHIC') && !hadesSrc.includes('lairTex')
  && !hadesSrc.includes("p.key === 'medusa'"));
t('hades: Cerberus() figure untouched (forge owns it)',
  hadesSrc.includes('function Cerberus()'));
t('hades: arch stone untouched (pillars + lintel only)',
  hadesSrc.includes('<boxGeometry args={[1.2, 8, 1.2]} />')
  && hadesSrc.includes('<boxGeometry args={[8.4, 1.2, 1.2]} />'));

/* --- original only: no Mortal Kombat strings in the new code --- */
const stripped = stripComments(registrySrc).toLowerCase();
t('registry: no Mortal Kombat strings',
  !/mortal|sub-zero|scorpion|raiden|liu kang|shang tsung|kitana/.test(stripped));
t('registry: no licensed IP strings in depicts',
  !/freddy|jason|voorhees|myers|leatherface|pennywise|krueger/.test(stripped));

console.log(`\narch-graphics: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
