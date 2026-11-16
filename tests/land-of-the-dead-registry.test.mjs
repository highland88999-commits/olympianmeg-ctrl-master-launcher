// tests/land-of-the-dead-registry.test.mjs
// Land of the Dead (Merlin, Nov 16, 2026) — FLOOR DROP ONLY, by his
// order Nov 16 ~04:49: the realm is deliberately in NEITHER registry
// (no god menu, no satellites.ts entry, no title/subtitle in any
// locale) and has NO portal card (no PORTAL_REALMS entry, no graphic
// registration, no static face key). The floor drop is the SOLE
// access; the return portal brings the user back to their origin
// realm. Also covers the route file, the souls import contract
// (worker D's lib/land-of-the-dead/souls.js), the floor-drop return
// (worker C mounts it at the anchor), and the SPECIES record.
// Run: node --test tests/land-of-the-dead-registry.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { GOD_MENUS } from '../lib/god-menus.js';
import { SATELLITES } from '../lib/i18n/satellites.ts';
import { portalRealmByKey } from '../lib/portal/realms.js';
import { PORTAL_GRAPHICS } from '../lib/portal/portal-graphics.js';
import { PORTAL_FACE_STATIC_KEYS } from '../lib/portal/portal-face-videos.js';
import { seedSouls, WanderingSoulField } from '../lib/land-of-the-dead/souls.js';
import { speciesFor } from '../lib/afterlife/operators.js';
import { FIGURE_MATERIALS } from '../lib/afterlife/humanoid-operators.js';

const KEY = 'land-of-the-dead';
const ROUTE = '/land-of-the-dead';

describe('Land of the Dead is floor-drop only (Merlin, Nov 16 ~04:49)', () => {
  it('lives in NO god menu: no portal card, no menu entry', () => {
    const menus = GOD_MENUS.filter((m) => (m.satellites || []).includes(KEY));
    assert.equal(menus.length, 0, `${KEY} must not live in any god menu — the floor drop is the only access`);
  });

  it('is NOT in satellites.ts', () => {
    const entry = SATELLITES.find((s) => s.key === KEY);
    assert.equal(entry, undefined, `${KEY} must not be in satellites.ts`);
  });

  it('route file exists (page + world3d, no scene.jsx)', () => {
    assert.ok(existsSync(`app${ROUTE}/page.jsx`), `app${ROUTE}/page.jsx missing`);
    assert.ok(existsSync(`app${ROUTE}/world3d.js`), `app${ROUTE}/world3d.js missing`);
    assert.ok(!existsSync(`app${ROUTE}/scene.jsx`), 'scene.jsx was renamed to world3d.js');
  });

  it('has NO title or subtitle in any locale', () => {
    const files = readdirSync('lib/i18n/locales').filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 34);
    for (const f of files) {
      const d = JSON.parse(readFileSync(`lib/i18n/locales/${f}`, 'utf8'));
      assert.equal(d[`sat.${KEY}.title`], undefined, `${f} must not carry a ${KEY} title`);
      assert.equal(d[`sat.${KEY}.subtitle`], undefined, `${f} must not carry a ${KEY} subtitle`);
    }
  });

  it('is NOT a portal realm — no card, no graphic registration, no static face key', () => {
    assert.equal(portalRealmByKey(KEY), null, `${KEY} must not be in PORTAL_REALMS`);
    assert.equal(PORTAL_GRAPHICS[KEY], undefined, 'portal graphic registration removed');
    assert.ok(!PORTAL_FACE_STATIC_KEYS.includes(KEY), 'static face key removed');
  });

  it('has a SPECIES record + FIGURE_MATERIALS row (drift figures need colours)', () => {
    const rec = speciesFor(KEY);
    assert.ok(rec, 'SPECIES record missing');
    assert.equal(rec.kind, 'Shade');
    assert.equal(rec.varName, 'shades');
    assert.equal(rec.diet, 'none');
    assert.equal(rec.sojournDays, 90);
    assert.equal(rec.fadeDays, 7);
    assert.equal(rec.areas.length, 3);
    assert.deepEqual(FIGURE_MATERIALS[KEY], [
      { color: '#e8e8ee', opacity: 0.45 },
      { color: '#bfe8d8', opacity: 0.5 },
      { color: '#2a2a33', opacity: 0.7 },
    ]);
  });
});

describe('Land of the Dead souls import contract (worker D)', () => {
  it('souls.js exports seedSouls() + WanderingSoulField', () => {
    assert.equal(typeof seedSouls, 'function');
    assert.equal(typeof WanderingSoulField, 'function');
  });

  it('seedSouls() returns a non-empty array of souls', () => {
    const souls = seedSouls();
    assert.ok(Array.isArray(souls) && souls.length > 0, 'seedSouls() must return souls');
    for (const s of souls) {
      assert.equal(typeof s.id, 'string');
      assert.equal(typeof s.name, 'string');
    }
  });

  it('the page seeds the souls state and renders the field', () => {
    const src = readFileSync(`app${ROUTE}/page.jsx`, 'utf8');
    assert.ok(
      src.includes(`from "@/lib/land-of-the-dead/souls"`),
      'page must import from @/lib/land-of-the-dead/souls',
    );
    assert.ok(src.includes('seedSouls'), 'page must call seedSouls()');
    assert.ok(
      src.includes('<WanderingSoulField souls={souls} />'),
      'page must render <WanderingSoulField souls={souls} />',
    );
  });

  it('the field is a DOM panel, so it rides on the page — never inside the WebGL Canvas', () => {
    const sceneSrc = readFileSync(`app${ROUTE}/world3d.js`, 'utf8');
    assert.ok(
      !sceneSrc.includes("from '@/lib/land-of-the-dead/souls'"),
      'scene must not import the DOM souls panel (R3F rejects DOM tags inside the Canvas)',
    );
    assert.ok(
      !sceneSrc.includes('<WanderingSoulField'),
      'scene must not render <WanderingSoulField> inside the Canvas',
    );
  });
});

describe('Land of the Dead floor-drop return (worker C)', () => {
  it('the page carries the marked mount point for the return UI', () => {
    const src = readFileSync(`app${ROUTE}/page.jsx`, 'utf8');
    assert.ok(
      src.includes('FLOOR-DROP RETURN — owned by WS-C'),
      'page must carry the FLOOR-DROP RETURN ownership comment',
    );
    assert.ok(
      src.includes('id="lotd-return-anchor"'),
      'page must carry the <div id="lotd-return-anchor"> mount point',
    );
  });

  it('the return is wired: hook + orb at the anchor + portal in the scene', () => {
    const page = readFileSync(`app${ROUTE}/page.jsx`, 'utf8');
    assert.ok(page.includes('useLandOfTheDeadReturn()'), 'page uses the return hook');
    assert.ok(page.includes('<LandOfTheDeadReturnOrb'), 'return orb mounted at the anchor');
    assert.ok(page.includes('onReturn={floorReturn.returnToOrigin}'), 'return threaded into the scene');
    const scene = readFileSync(`app${ROUTE}/world3d.js`, 'utf8');
    assert.ok(scene.includes('<LandOfTheDeadReturn'), 'floor portal mounted in the scene');
    assert.ok(scene.includes('LandOfTheDeadReturn position={pos} quaternion={q}'), 'portal sits on the sphere surface');
  });
});
