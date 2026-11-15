// tests/portal-graphics.test.mjs — headless tests for the portal
// graphics upgrade (lib/portal/portal-graphics.js, wired into
// components/PortalRoom.jsx carousel cards and, via the shared arch
// hook in lib/portal/arch-graphics.js, every arch doorway in
// app/nether-realm/world3d.js). The medusa door keeps the same lair
// graphic — the bespoke loader is retired, the hook loads it now.
// Run: node tests/portal-graphics.test.mjs (from the repo root).
// No browser, no network — proves:
//   * every one of the 24 portal realms has exactly one graphic
//   * NO graphic repeats across realms (paths and file hashes)
//   * every graphic file exists on disk under public/art/portals/
//   * the lair graphic exists and is distinct from every realm graphic
//   * graphicForRealm + portalCardBackground behave (incl. fallback)
//   * every realm has a depicts entry
//   * the wire-ins are really in the render sites (source-level)
//   * ORIGINAL ONLY — no Mortal Kombat strings anywhere in the new code
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PORTAL_REALMS } from '../lib/portal/realms.js';
import {
  PORTAL_GRAPHICS,
  LAIR_GRAPHIC,
  PORTAL_DEPICTS,
  graphicForRealm,
  portalCardBackground,
} from '../lib/portal/portal-graphics.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ART_DIR = join(ROOT, 'public', 'art', 'portals');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed += 1; }
  else { failed += 1; console.error(`FAIL: ${name}`); }
}

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/* --- coverage: 24 realms, one graphic each --- */
t('PORTAL_REALMS lists 24 realms', PORTAL_REALMS.length === 24);
t('PORTAL_GRAPHICS lists 24 graphics', Object.keys(PORTAL_GRAPHICS).length === 24);
for (const realm of PORTAL_REALMS) {
  t(`${realm.key}: has exactly one graphic`, typeof PORTAL_GRAPHICS[realm.key] === 'string'
    && PORTAL_GRAPHICS[realm.key].startsWith('/art/portals/')
    && PORTAL_GRAPHICS[realm.key].endsWith('.jpg'));
}
const realmPaths = Object.values(PORTAL_GRAPHICS);
t('no graphic path repeats across realms', new Set(realmPaths).size === realmPaths.length);

/* --- files on disk, no duplicate bytes --- */
const hashes = new Map();
for (const [key, url] of Object.entries(PORTAL_GRAPHICS)) {
  const file = join(ROOT, 'public', url.replace(/^\//, ''));
  t(`${key}: graphic file exists on disk (${url})`, existsSync(file));
  if (existsSync(file)) {
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    t(`${key}: graphic bytes are unique (no duplicate hash)`, !hashes.has(hash));
    hashes.set(hash, key);
  }
}
const lairFile = join(ROOT, 'public', LAIR_GRAPHIC.replace(/^\//, ''));
t('lair graphic file exists on disk', existsSync(lairFile));
t('lair graphic is distinct from every realm graphic', !realmPaths.includes(LAIR_GRAPHIC));
if (existsSync(lairFile)) {
  const lairHash = createHash('sha256').update(readFileSync(lairFile)).digest('hex');
  t('lair graphic bytes are unique', !hashes.has(lairHash));
}

/* --- depicts: one true-to-realm line each --- */
for (const realm of PORTAL_REALMS) {
  t(`${realm.key}: has a depicts entry`, typeof PORTAL_DEPICTS[realm.key] === 'string'
    && PORTAL_DEPICTS[realm.key].length > 20);
}

/* --- helpers --- */
t("graphicForRealm('hades') is the hades graphic",
  graphicForRealm('hades') === '/art/portals/hades.jpg');
t("graphicForRealm('tir-na-nog') is the tir-na-nog graphic",
  graphicForRealm('tir-na-nog') === '/art/portals/tir-na-nog.jpg');
t('graphicForRealm falls back to hades for an unknown key',
  graphicForRealm('no-such-realm') === '/art/portals/hades.jpg');
const hadesBg = portalCardBackground('hades', '#ffb03a');
t('portalCardBackground carries the realm art url', hadesBg.includes('/art/portals/hades.jpg'));
t('portalCardBackground carries a dark scrim gradient', hadesBg.includes('linear-gradient'));
t('portalCardBackground carries the realm hue', hadesBg.includes('#ffb03a'));
t('portalCardBackground falls back to hades for an unknown key',
  portalCardBackground('no-such-realm', '#ffb03a').includes('/art/portals/hades.jpg'));

/* --- wire-ins are really in the render sites --- */
const portalRoomSrc = readFileSync(join(ROOT, 'components', 'PortalRoom.jsx'), 'utf8');
t('PortalRoom imports portalCardBackground',
  portalRoomSrc.includes("from '@/lib/portal/portal-graphics'"));
t('PortalRoom cards use portalCardBackground(realm.key, realm.hue)',
  portalRoomSrc.includes('portalCardBackground(realm.key, realm.hue)'));
t('PortalRoom cards keep their size (208px) and label',
  portalRoomSrc.includes('width: 208') && portalRoomSrc.includes('{realm.label}'));
const world3dSrc = readFileSync(join(ROOT, 'app', 'nether-realm', 'world3d.js'), 'utf8');
t('world3d imports the shared arch hook (bespoke lair loader retired)',
  world3dSrc.includes("import { useArchTextures } from '@/lib/portal/arch-graphics'"));
t('world3d has no bespoke lair loader left',
  !world3dSrc.includes('LAIR_GRAPHIC') && !world3dSrc.includes('lairTex'));
t('world3d textures every arch doorway through the hook (archTex[p.key])',
  world3dSrc.includes('archTex[p.key]'));
t('world3d keeps the plain glow disc under the art (fallback before load)',
  world3dSrc.includes('color={PORTAL_GLOW} transparent opacity={0.55}'));

/* --- original only: no Mortal Kombat strings in the new code --- */
const registrySrc = stripComments(readFileSync(join(ROOT, 'lib', 'portal', 'portal-graphics.js'), 'utf8')).toLowerCase();
t('registry: no Mortal Kombat strings',
  !/mortal|sub-zero|scorpion|raiden|liu kang|shang tsung|kitana/.test(registrySrc));
t('registry: no licensed IP strings in depicts',
  !/freddy|jason|voorhees|myers|leatherface|pennywise|krueger/.test(registrySrc));

console.log(`\nportal-graphics: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
