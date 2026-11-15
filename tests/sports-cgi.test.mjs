// tests/sports-cgi.test.mjs — procedural CGI surfaces for the sports games.
//
// Every builder must produce deterministic DataTexture colour + bump maps
// (same seed → identical bytes, different seed → different bytes), with
// RepeatWrapping, so soccer / hockey / basketball / volleyball all wear
// the same seeded coat on every load. Render only — no game rules here.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CGI_TEXTURE_SIZE,
  mulberry32, hashString, valueNoise2D,
  grassMaps, iceMaps, sandMaps, woodMaps, crowdMaps, netTexture,
  soccerBallMaps, volleyballMaps, basketballMaps, jerseyMaps,
  breathScale, breathTilt, phaseFor, cachedMaps,
} from '../lib/sports/cgi.js';

const builders = {
  grass: grassMaps, ice: iceMaps, sand: sandMaps, wood: woodMaps,
  crowd: crowdMaps, soccerBall: soccerBallMaps,
  volleyball: volleyballMaps, basketball: basketballMaps,
};

function bytes(tex) {
  return Buffer.from(tex.image.data.buffer, tex.image.data.byteOffset, tex.image.data.byteLength);
}

describe('seeded PRNG', () => {
  it('mulberry32 is deterministic per seed and spreads across seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, [c(), c(), c()]);
    for (const v of seqA) assert.ok(v >= 0 && v < 1);
  });
  it('hashString is stable and phaseFor stays in range', () => {
    assert.equal(hashString('p1'), hashString('p1'));
    assert.notEqual(hashString('p1'), hashString('p2'));
    const ph = phaseFor('player-7');
    assert.ok(ph >= 0 && ph < 2 * Math.PI + 0.01);
  });
  it('valueNoise2D stays in 0..1 and is smooth', () => {
    const n = valueNoise2D(7, 8, 8);
    assert.ok(n(0.5, 0.5) >= 0 && n(0.5, 0.5) <= 1);
    assert.ok(Math.abs(n(0.5, 0.5) - n(0.51, 0.5)) < 0.1);
  });
});

describe('surface maps', () => {
  for (const [kind, build] of Object.entries(builders)) {
    it(`${kind}: 128+ colour+bump DataTextures, repeat-wrapped, deterministic`, () => {
      const first = build(1234);
      const second = build(1234);
      const other = build(9876);
      for (const m of [first, second, other]) {
        assert.ok(m.map instanceof THREE.DataTexture);
        assert.ok(m.bumpMap instanceof THREE.DataTexture);
        assert.equal(m.map.wrapS, THREE.RepeatWrapping);
        assert.equal(m.map.wrapT, THREE.RepeatWrapping);
        assert.equal(m.map.colorSpace, THREE.SRGBColorSpace);
        assert.ok(m.map.image.width >= CGI_TEXTURE_SIZE);
        assert.ok(m.map.image.data.length > 0);
      }
      assert.ok(bytes(first.map).equals(bytes(second.map)), 'same seed, same coat');
      assert.ok(!bytes(first.map).equals(bytes(other.map)), 'different seed, different coat');
      assert.ok(bytes(first.bumpMap).equals(bytes(second.bumpMap)));
    });
  }
  it('grass stripes alternate bands along v', () => {
    const { map } = grassMaps(5);
    const { width, data } = map.image;
    const rowLuma = (y) => {
      let s = 0;
      for (let x = 0; x < width; x += 8) {
        const i = (y * width + x) * 4;
        s += data[i] + data[i + 1] + data[i + 2];
      }
      return s;
    };
    const top = rowLuma(4);
    const next = rowLuma(Math.floor(map.image.height / 8) + 4);
    assert.notEqual(top, next, 'adjacent mow stripes differ');
  });
  it('ice is pale and sand is warm', () => {
    const ice = iceMaps(5).map.image.data;
    const sand = sandMaps(5).map.image.data;
    // average red channel over a sample
    const avg = (d) => { let s = 0; for (let i = 0; i < d.length; i += 400) s += d[i]; return s / (d.length / 400); };
    assert.ok(avg(ice) > 180, 'ice reads pale');
    assert.ok(avg(sand) > 180 && avg(sand) < 250, 'sand reads warm sand');
  });
  it('netting is a transparent grid', () => {
    const tex = netTexture();
    assert.ok(tex instanceof THREE.DataTexture);
    const { width, data } = tex.image;
    let transparent = 0;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
      else opaque++;
    }
    assert.ok(transparent > opaque, 'most of the net is see-through');
    assert.ok(opaque > 0, 'grid lines present');
    assert.equal(width, 128);
  });
  it('jersey weave tints to the team colour', () => {
    const blue = jerseyMaps(5, '#3b82f6').map.image.data;
    const red = jerseyMaps(5, '#ef4444').map.image.data;
    // blue jersey: blue channel dominates; red jersey: red dominates
    assert.ok(blue[2] > blue[0], 'blue jersey reads blue');
    assert.ok(red[0] > red[2], 'red jersey reads red');
  });
  it('cachedMaps returns the same pair per kind+seed', () => {
    const a = cachedMaps('grass', 77, grassMaps);
    const b = cachedMaps('grass', 77, grassMaps);
    const c = cachedMaps('grass', 78, grassMaps);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe('idle life', () => {
  it('breathScale hovers near 1 and breathTilt stays small', () => {
    for (let t = 0; t < 10; t += 0.37) {
      const s = breathScale(t, 1.2);
      assert.ok(s > 0.98 && s < 1.03, `breath ${s}`);
      assert.ok(Math.abs(breathTilt(t, 1.2)) <= 0.021);
    }
    // breathing actually moves
    assert.notEqual(breathScale(0, 0), breathScale(1, 0));
  });
});
