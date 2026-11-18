// AETHELGARD CGI — procedural rainforest pass (Merlin, Nov 15, 2026).
// Pins the CGI kit (lib/aethelgard/cgi.js: seeded DataTextures, clock-pure
// motion) and that every mechanic that worked before still works:
// orbit/walk/fly rigs, touch controls, focus, hotspots, and the
// standing no-new-lights rule. Run: node --test tests/aethelgard-cgi.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  AETHELGARD_DAPPLE_COUNT,
  AETHELGARD_LEAF_CARD_COUNT,
  AETHELGARD_LEAF_FALL_COUNT,
  AETHELGARD_MIST_BANK_COUNT,
  AETHELGARD_RIPPLE_COUNT,
  AETHELGARD_SPORE_COUNT,
  AETHELGARD_WIND,
  aethelgardWindAt,
  canopySway,
  dappleAt,
  fallingLeafAt,
  forestFloorMaps,
  leafClusterTexture,
  mistBankAt,
  rippleAt,
  windCompass,
  windVector,
} from '../lib/aethelgard/cgi.js';
import { PLANET_CGI_EPOCH_MS } from '../lib/planet-cgi/motion.js';
import {
  seasonAt, skyPalette, timeLabel, timeString, HOTSPOTS, SEASONS,
} from '../lib/aethelgard/data.js';

const T0 = PLANET_CGI_EPOCH_MS + 12_345_678; // a fixed instant for determinism checks
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const scene = read('../components/aethelgard/RainforestScene.jsx');
const canopy = read('../components/aethelgard/Canopy.jsx');
const ground = read('../components/aethelgard/Ground.jsx');
const atmosphere = read('../components/aethelgard/Atmosphere.jsx');
const water = read('../components/aethelgard/Water.jsx');
const wildlife = read('../components/aethelgard/Wildlife.jsx');
const landmarks = read('../components/aethelgard/Landmarks.jsx');
const skydome = read('../components/aethelgard/SkyDome.jsx');
const page = read('../app/aethelgard/page.jsx');

describe('forest floor maps', () => {
  it('builds a 256x256 colour + bump pair, cached per seed', () => {
    const a = forestFloorMaps('test-floor');
    const b = forestFloorMaps('test-floor');
    assert.ok(a.map instanceof THREE.DataTexture);
    assert.ok(a.bumpMap instanceof THREE.DataTexture);
    assert.equal(a.map.image.width, 256);
    assert.equal(a.map.image.height, 256);
    assert.equal(a, b, 'same seed returns the cached pair');
  });

  it('is deterministic: same seed, same bytes', () => {
    const a = forestFloorMaps('det-seed');
    const b = forestFloorMaps('det-seed');
    assert.deepEqual([...a.map.image.data], [...b.map.image.data]);
    assert.deepEqual([...a.bumpMap.image.data], [...b.bumpMap.image.data]);
  });

  it('reads as mossy leaf litter: green-dominant with real bump relief', () => {
    const { map, bumpMap } = forestFloorMaps('green-check');
    const d = map.image.data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    assert.ok(g / n > r / n, `mean green ${g / n} should beat mean red ${r / n}`);
    assert.ok(g / n > b / n, `mean green ${g / n} should beat mean blue ${b / n}`);
    const bd = bumpMap.image.data;
    let lo = 255, hi = 0;
    for (const v of bd) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(hi - lo > 40, `bump spread ${hi - lo} should carry relief`);
  });
});

describe('leaf-cluster texture', () => {
  it('builds a 128x128 RGBA cutout with leaves and transparent gaps', () => {
    const tex = leafClusterTexture('test-leaf');
    assert.ok(tex instanceof THREE.DataTexture);
    assert.equal(tex.image.width, 128);
    assert.equal(tex.image.height, 128);
    const d = tex.image.data;
    let opaque = 0, clear = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] === 255) opaque++;
      else if (d[i] === 0) clear++;
    }
    assert.ok(opaque > 1000, `should paint leaves, got ${opaque} opaque px`);
    assert.ok(clear > 1000, `should leave gaps between leaves, got ${clear} clear px`);
    assert.equal(tex, leafClusterTexture('test-leaf'), 'same seed is cached');
  });

  it('is deterministic and seed-sensitive', () => {
    const a = leafClusterTexture('leaf-a');
    const b = leafClusterTexture('leaf-a');
    assert.deepEqual([...a.image.data], [...b.image.data]);
    const c = leafClusterTexture('leaf-b');
    assert.notDeepEqual([...a.image.data], [...c.image.data]);
  });
});

describe('canopy breeze', () => {
  it('is a pure function of the clock inside the gust range', () => {
    assert.deepEqual(aethelgardWindAt(T0), aethelgardWindAt(T0));
    for (let s = 0; s < 300; s += 7) {
      const w = aethelgardWindAt(T0 + s * 1000);
      assert.ok(w.speed >= AETHELGARD_WIND.gustMinMps && w.speed <= AETHELGARD_WIND.gustMaxMps,
        `speed ${w.speed} outside gust range`);
      assert.ok(w.gust >= 0 && w.gust <= 1, `gust ${w.gust} outside 0..1`);
      assert.ok(Math.abs(w.dirX * w.dirX + w.dirZ * w.dirZ - 1) < 1e-9, 'wind dir is a unit vector');
      assert.ok(w.bearingDeg >= 280 && w.bearingDeg <= 320,
        `bearing ${w.bearingDeg} should veer ±20° around 300°`);
    }
  });

  it('varies over a gust cycle and names its compass point', () => {
    const speeds = new Set();
    for (let s = 0; s < 120; s += 5) speeds.add(aethelgardWindAt(T0 + s * 1000).speed.toFixed(2));
    assert.ok(speeds.size > 3, 'wind should breathe, not sit flat');
    assert.equal(windCompass(300), 'NW');
    const v = windVector(315);
    assert.ok(Math.abs(v.x * v.x + v.z * v.z - 1) < 1e-9);
  });

  it('canopy sway is bounded, deterministic, and grows with the gust', () => {
    const calm = { dirX: 1, dirZ: 0, gust: 0, speed: 0.8, bearingDeg: 300 };
    const gale = { dirX: 1, dirZ: 0, gust: 1, speed: 6, bearingDeg: 300 };
    let calmMax = 0, galeMax = 0;
    for (let i = 0; i < 60; i++) {
      const ph = i * 0.37;
      const c = canopySway(ph, T0, calm, 1);
      const g = canopySway(ph, T0, gale, 1);
      calmMax = Math.max(calmMax, Math.abs(c.x), Math.abs(c.z));
      galeMax = Math.max(galeMax, Math.abs(g.x), Math.abs(g.z));
      assert.deepEqual(canopySway(ph, T0, calm, 1), c, 'sway is deterministic');
    }
    assert.ok(calmMax <= 0.1, `calm sway ${calmMax} should stay tiny`);
    assert.ok(galeMax > 0.25, `gust sway ${galeMax} should read as wind`);
    assert.ok(galeMax <= 0.65, `gust sway ${galeMax} is capped`);
  });
});

describe('dappled light', () => {
  it('patches stay in the world, fade with the day, and vanish at night', () => {
    for (let i = 0; i < AETHELGARD_DAPPLE_COUNT; i++) {
      const d = dappleAt(i, T0, 0.5);
      assert.ok(Math.abs(d.x) <= 85 && Math.abs(d.z) <= 85, 'patch stays in the forest');
      assert.ok(d.opacity >= 0 && d.opacity <= 0.5, `opacity ${d.opacity} outside 0..dayFactor`);
      assert.equal(dappleAt(i, T0, 0).opacity, 0, 'no dapple at night');
      assert.deepEqual(d, dappleAt(i, T0, 0.5), 'dapple is deterministic');
    }
  });
});

describe('falling leaves', () => {
  it('fall from the canopy to the floor on a clock cycle', () => {
    for (let i = 0; i < AETHELGARD_LEAF_FALL_COUNT; i++) {
      const L = fallingLeafAt(i, T0);
      assert.ok(L.y >= 0.15 && L.y <= 36, `leaf height ${L.y} outside canopy-to-floor`);
      assert.ok(L.opacity >= 0 && L.opacity <= 1, 'opacity in 0..1');
      assert.ok(Number.isFinite(L.rotX) && Number.isFinite(L.rotZ), 'tumble is finite');
      assert.deepEqual(L, fallingLeafAt(i, T0), 'leaf is deterministic');
    }
    // Over time the leaves move: not frozen at one height.
    const ys = new Set();
    for (let s = 0; s < 20; s++) ys.add(fallingLeafAt(3, T0 + s * 1000).y.toFixed(2));
    assert.ok(ys.size > 5, 'leaves should fall, not hover');
  });
});

describe('mist banks and pool ripples', () => {
  it('mist thickens with fogMul and stays subtle', () => {
    for (let i = 0; i < AETHELGARD_MIST_BANK_COUNT; i++) {
      const dry = mistBankAt(i, T0, 0.85);
      const misty = mistBankAt(i, T0, 1.8);
      assert.ok(misty.opacity >= dry.opacity, 'mist season should be thicker than dry');
      assert.ok(misty.opacity <= 0.2, `mist opacity ${misty.opacity} should stay subtle`);
      assert.deepEqual(dry, mistBankAt(i, T0, 0.85), 'mist is deterministic');
    }
  });

  it('ripples expand and fade on a 4 s cycle, staggered per ring', () => {
    const r0 = rippleAt(0, T0);
    const r1 = rippleAt(1, T0);
    assert.ok(r0.scale >= 1 && r0.scale <= 7, 'ripple scale in 1..7');
    assert.ok(r0.opacity >= 0 && r0.opacity <= 0.5, 'ripple opacity in 0..0.5');
    assert.notEqual(r0.scale, r1.scale, 'rings are staggered, not in lockstep');
    assert.deepEqual(r0, rippleAt(0, T0), 'ripple is deterministic');
    const scales = new Set();
    for (let s = 0; s < 8; s++) scales.add(rippleAt(0, T0 + s * 500).scale.toFixed(2));
    assert.ok(scales.size > 3, 'ripples should expand over the cycle');
  });
});

describe('clock helpers moved to data.js', () => {
  it('timeLabel / timeString keep their old behaviour', () => {
    assert.equal(timeLabel(0.4), 'DAY');
    assert.equal(timeLabel(0.95), 'NIGHT');
    assert.equal(timeLabel(0.26), 'DAWN');
    assert.equal(timeLabel(0.72), 'DUSK');
    assert.equal(timeString(0.5), '12:00');
    assert.equal(timeString(0.32), '07:40');
  });

  it('seasons and sky palette are untouched', () => {
    assert.equal(SEASONS.length, 4);
    assert.equal(seasonAt(1).id, 'dry');
    assert.equal(HOTSPOTS.length, 5);
    const day = skyPalette(0.5);
    assert.ok(day.day > 0.9 && day.firefly < 0.1, 'midday is bright, fireflies off');
    const night = skyPalette(0.95);
    assert.ok(night.firefly > 0.9, 'night brings fireflies');
  });
});

describe('the dead medieval diorama is gone', () => {
  it('app/aethelgard/scene.js no longer exists', () => {
    assert.equal(existsSync(new URL('../app/aethelgard/scene.js', import.meta.url)), false);
  });

  it('the page imports the clock helpers from data.js, not ./scene', () => {
    assert.match(page, /timeLabel, timeString \} from "@\/lib\/aethelgard\/data"/);
    assert.doesNotMatch(page, /from "\.\/scene"/);
  });
});

describe('CGI is wired into the scene', () => {
  it('RainforestScene mounts the sky dome and passes the CGI props', () => {
    assert.match(scene, /import SkyDome from '\.\/SkyDome'/);
    assert.match(scene, /<SkyDome sky=\{sky\} timeOfDay=\{timeOfDay\} \/>/);
    assert.match(scene, /<Ground dapple=\{sky\.godRay \* season\.rayMul\} \/>/);
    assert.match(scene, /fogMul=\{season\.fogMul\} dayFactor=\{sky\.day\}/);
  });

  it('the moon is Merlin’s photo on a sphere, not a flat disc — the sun keeps its disc + glow', () => {
    assert.match(skydome, /makeMoonTexture/);
    assert.match(skydome, /sphereGeometry args=\{\[9, 24, 24\]\}/);
    assert.match(skydome, /meshBasicMaterial map=\{moonMaps\.map\}/);
    assert.doesNotMatch(skydome, /circleGeometry args=\{\[9, 32\]\}/);
    assert.match(skydome, /circleGeometry args=\{\[13, 32\]\}/);
  });

  it('Canopy wears the leaf texture and sways on the breeze', () => {
    assert.match(canopy, /leafClusterTexture/);
    assert.match(canopy, /canopySway\(/);
    assert.match(canopy, /aethelgardWindAt\(/);
    assert.match(canopy, /alphaTest=\{0\.35\}/);
    assert.match(canopy, /AETHELGARD_LEAF_CARD_COUNT/);
  });

  it('Ground wears the floor maps and dapple patches (no flat disc)', () => {
    assert.match(ground, /forestFloorMaps\(/);
    assert.match(ground, /bumpMap=\{floorMaps\.bumpMap\}/);
    assert.match(ground, /dappleAt\(/);
    assert.match(ground, /AdditiveBlending/);
    assert.doesNotMatch(ground, /color="#22401f"/);
  });

  it('Atmosphere carries mist, spores and falling leaves', () => {
    assert.match(atmosphere, /mistBankAt\(/);
    assert.match(atmosphere, /fallingLeafAt\(/);
    assert.match(atmosphere, /makeDustField\(/);
    assert.match(atmosphere, /updateDustField\(/);
    assert.match(atmosphere, /AETHELGARD_SPORE_COUNT/);
  });

  it('Water carries falls mist and pool ripples', () => {
    assert.match(water, /rippleAt\(/);
    assert.match(water, /AETHELGARD_RIPPLE_COUNT/);
    assert.match(water, /getParticleTexture\('mist'\)/);
  });

  it('Wildlife wears macaw colour, winged butterflies and gnat swarms', () => {
    assert.match(wildlife, /butterflyGeometry\(\)/);
    assert.match(wildlife, /BIRD_COLORS/);
    assert.match(wildlife, /gnatRef/);
    assert.doesNotMatch(wildlife, /color="#22331f"/);
  });

  it('the kapok crown sways', () => {
    assert.match(landmarks, /crownRef/);
    assert.match(landmarks, /rotation\.z = Math\.sin\(t \* 0\.7\)/);
  });

  it('the sky dome is a vertex-colour gradient shell, not a light', () => {
    assert.match(skydome, /vertexColors/);
    assert.match(skydome, /side=\{THREE\.BackSide\}/);
    assert.match(skydome, /fog=\{false\}/);
    assert.match(skydome, /skyPalette\(/);
  });
});

describe('mechanics still work — nothing that worked may break', () => {
  it('orbit / walk / fly rigs, touch controls, focus and hotspots are intact', () => {
    assert.match(scene, /<OrbitControls ref=\{orbitRef\} makeDefault/);
    assert.match(scene, /<FirstPerson key=\{mode\} inputRef=\{inputRef\} fly=\{mode === 'fly'\} \/>/);
    assert.match(scene, /<FocusRig focusReq=\{focusReq\} orbitRef=\{orbitRef\} \/>/);
    assert.match(scene, /mode !== 'orbit' && <TouchControls inputRef=\{inputRef\} fly=\{mode === 'fly'\} \/>/);
    assert.match(scene, /<HotspotMarkers onHotspot=\{onHotspot\} activeId=\{activeId\} \/>/);
    assert.match(scene, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); onHotspot\(h\.id\); \}\}/);
  });

  it('the page still drives mode, time, season and hotspot panels', () => {
    assert.match(page, /useState\("orbit"\)/);
    assert.match(page, /setTime\(Number\(e\.target\.value\) \/ 1000\)/);
    assert.match(page, /setSeason\(i\)/);
    assert.match(page, /toggleMode\("walk"\)/);
    assert.match(page, /toggleMode\("fly"\)/);
    assert.match(page, /role="dialog" aria-label=\{hotspot\.title\}/);
  });

  it('no new real lights anywhere in the aethelgard scene', () => {
    for (const [name, src] of [['RainforestScene', scene], ['Canopy', canopy],
      ['Ground', ground], ['Atmosphere', atmosphere], ['Water', water],
      ['Wildlife', wildlife], ['Landmarks', landmarks], ['SkyDome', skydome]]) {
      assert.doesNotMatch(src, /pointLight|spotLight/i, `${name} must not add a light`);
    }
    const directional = (scene.match(/<directionalLight/g) || []).length;
    assert.equal(directional, 2, 'the two pre-existing directional lights stay exactly two');
  });
});
