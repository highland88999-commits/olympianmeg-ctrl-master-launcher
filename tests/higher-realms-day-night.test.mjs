// tests/higher-realms-day-night.test.mjs — HIGHER REALMS DAY / NIGHT
// (Merlin, 2026-11-14): all 11 higher realms run the shared Earth 2
// day/night cycle through <DayNightRig shade="earth" /> — blue daylight,
// sunset fire, true night, moon by real phase — with NO lightning
// storms (their skies stay clean). The rig replaces each scene's four
// static sky/light lines (background / fog / ambient / directional);
// everything else — meshes, labels, point lights, camera rig — stays.
// Sun + moon wrap (Merlin, Nov 17, 2026): the tag also carries `sun
// moon`, so each realm renders the house sun (core disc + halo) and
// Merlin's photo moon on the rig's real sun/moon directions.
// Run: node tests/higher-realms-day-night.test.mjs   (from the repo root)
// No browser, no network, no WebGL — pure wired-source audit, same
// grep style as the realm-gates suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const HIGHER_REALMS = [
  'elysium',
  'valhalla',
  'aaru',
  'heaven',
  'svarga',
  'takamagahara',
  'tir-na-nog',
  'tlalocan',
  'maya-sky',
  'vyraj',
  'tiangong',
];

const FOG_DENSITY = {
  elysium: null, // 0.0035 rig default
  valhalla: null,
  aaru: null,
  heaven: 0.0028,
  svarga: 0.0028,
  takamagahara: 0.0028,
  'tir-na-nog': 0.0028,
  tlalocan: 0.0022,
  'maya-sky': 0.0022,
  vyraj: 0.0022,
  tiangong: 0.0022,
};

const count = (src, re) => (src.match(re) || []).length;

test('the shared rig exists and is the default export', () => {
  assert.ok(
    existsSync('components/DayNightRig.jsx'),
    'components/DayNightRig.jsx missing',
  );
  const rig = readFileSync('components/DayNightRig.jsx', 'utf8');
  assert.match(rig, /export default function DayNightRig\(/);
  assert.ok(existsSync('lib/day-night.js'), 'lib/day-night.js missing');
});

for (const realm of HIGHER_REALMS) {
  test(`${realm}: mounts <DayNightRig sun moon followRef={playerRef} shade="earth" /> and nothing else drives the sky`, () => {
    const path = `app/${realm}/world3d.js`;
    assert.ok(existsSync(path), `${path} missing`);
    const src = readFileSync(path, 'utf8');

    // One default import, from the shared component.
    assert.equal(
      count(src, /import DayNightRig from '@\/components\/DayNightRig';/g),
      1,
      `${realm}: expected exactly one DayNightRig import`,
    );

    // Exactly one mount, earth shade, sun + moon wrap, no storm prop
    // — higher realms get NO lightning storms; their skies stay clean.
    // The fog density is the realm's own (0.0035 default, thinner
    // where it was thinner). followRef rides the sun/moon visuals
    // with the walker (endless, Nov 18, 2026).
    assert.equal(
      count(src, /<DayNightRig sun moon followRef=\{playerRef\} shade="earth"(?: fogDensity=\{0\.00\d\d\})? \/>/g),
      1,
      `${realm}: expected exactly one <DayNightRig sun moon shade="earth" />`,
    );
    const wantFog = FOG_DENSITY[realm];
    if (wantFog === null) {
      assert.doesNotMatch(
        src,
        /<DayNightRig[^>]*\bfogDensity\b/,
        `${realm}: fog stays the 0.0035 rig default`,
      );
    } else {
      assert.ok(
        src.includes(`<DayNightRig sun moon followRef={playerRef} shade="earth" fogDensity={${wantFog}} />`),
        `${realm}: expected fogDensity={${wantFog}} (its own thinness, kept)`,
      );
    }
    assert.doesNotMatch(
      src,
      /<DayNightRig[^>]*\bstorm\b/,
      `${realm}: DayNightRig must not carry a storm prop`,
    );
    assert.doesNotMatch(
      src,
      /\bstorm\s*=/,
      `${realm}: no storm wiring in the scene`,
    );

    // The four static sky/light lines are gone — the rig owns the sky
    // now, so a leftover would double-paint it.
    assert.equal(count(src, /<color attach="background"/g), 0, `${realm}: stale background line`);
    assert.equal(count(src, /<fogExp2 attach="fog"/g), 0, `${realm}: stale fog line`);
    assert.equal(count(src, /<ambientLight/g), 0, `${realm}: stale ambient line`);
    assert.equal(count(src, /<directionalLight/g), 0, `${realm}: stale directional line`);

    // The realm's own lights survive: the torch/light-post point
    // lights are identity, not sky, and the rig never touches them.
    assert.equal(count(src, /<pointLight/g), 5, `${realm}: expected 5 point lights kept`);
  });
}
