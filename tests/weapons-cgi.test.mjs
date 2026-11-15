// tests/weapons-cgi.test.mjs — the shared weapon CGI spec
// (lib/weapons/cgi.js): every catalogue/preset weapon has a spec,
// every GLB path exists on disk, the projectile sim flies and
// impacts, and a Middle-earth strike produces a visible
// projectile record (the revolver shoots real bullets).
// Run: node tests/weapons-cgi.test.mjs   (from the repo root)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  MODEL_BY_ID,
  MODEL_BY_PRESET_ID,
  FIRING_BY_CLASS,
  FIRING_KINDS,
  PROCEDURAL_BUILDS,
  cgiForWeapon,
  cgiForClass,
  firingForClass,
  spawnProjectile,
  stepProjectile,
  projectileLifeLeft,
  rangedFiringFor,
  meleeFiringFor,
  buildProceduralWeapon,
  proceduralBuildForWeapon,
  mountWeaponInHand,
  buildProjectileMesh,
  buildSwingArc,
  buildMuzzleFlash,
} from '../lib/weapons/cgi.js';
import { FORGE_WEAPONS } from '../lib/backpack/weapons.js';
import { TRIPO_PRESET_WEAPONS, MERLIN_GIFT_ITEMS } from '../lib/backpack/backpack.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const glbOnDisk = (src) => existsSync(join(ROOT, 'public', src.replace(/^\//, '')));

describe('every catalogue weapon has a CGI spec', () => {
  it('all 13 forge weapons resolve to a model + a valid firing kind', () => {
    assert.equal(FORGE_WEAPONS.length, 13);
    for (const w of FORGE_WEAPONS) {
      const spec = cgiForWeapon({ id: w.id, weaponClass: w.weaponClass });
      assert.ok(spec.model && (spec.model.kind === 'glb' || spec.model.kind === 'procedural'), w.id);
      assert.ok(FIRING_KINDS.includes(spec.firing.kind), `${w.id}: ${spec.firing.kind}`);
      assert.ok(spec.firing.speedMps > 0 && spec.firing.rangeM > 0, w.id);
    }
  });
  it('flint-shiv is the one procedural catalogue weapon (no GLB)', () => {
    assert.deepEqual(cgiForWeapon({ id: 'flint-shiv', weaponClass: 'blade' }).model,
      { kind: 'procedural', build: 'blade' });
  });
  it('every preset + gift weapon wraps its own real GLB', () => {
    for (const p of TRIPO_PRESET_WEAPONS) {
      const spec = cgiForWeapon({ id: p.id, weaponClass: p.weaponClass });
      assert.equal(spec.model.kind, 'glb', p.id);
      assert.equal(spec.model.src, p.model, p.id);
      assert.ok(glbOnDisk(spec.model.src), `${p.id}: ${spec.model.src} missing`);
    }
    for (const g of MERLIN_GIFT_ITEMS) {
      const spec = cgiForWeapon({ id: g.id, weaponClass: g.weaponClass });
      assert.equal(spec.model.kind, 'glb', g.id);
      assert.equal(spec.model.src, g.model, g.id);
      assert.ok(glbOnDisk(spec.model.src), `${g.id}: ${spec.model.src} missing`);
    }
  });
  it('the Redwater crystal sniper wraps its GLB', () => {
    const spec = cgiForWeapon({ id: 'crystal-sniper', weaponClass: 'firearm' });
    assert.equal(spec.model.src, '/models/weapons/crystal-sniper-rifle.glb');
    assert.ok(glbOnDisk(spec.model.src));
    assert.equal(spec.firing.kind, 'bullet');
  });
});

describe('every GLB path exists on disk', () => {
  it('no MODEL_BY_ID or MODEL_BY_PRESET_ID entry points at a missing file', () => {
    for (const [id, model] of Object.entries({ ...MODEL_BY_ID, ...MODEL_BY_PRESET_ID })) {
      if (model.kind !== 'glb') continue;
      assert.ok(glbOnDisk(model.src), `${id}: ${model.src} is not on disk`);
    }
  });
  it('every file in public/models/weapons/ is referenced by the table', () => {
    // A GLB nobody maps to is a weapon nobody can ever hold.
    const files = readdirSync(join(ROOT, 'public/models/weapons')).filter((f) => f.endsWith('.glb'));
    assert.ok(files.length > 0, 'no GLBs on disk at all');
    const referenced = new Set(
      Object.values({ ...MODEL_BY_ID, ...MODEL_BY_PRESET_ID })
        .filter((m) => m.kind === 'glb')
        .map((m) => m.src.split('/').pop()),
    );
    for (const f of files) assert.ok(referenced.has(f), `${f} is on disk but no weapon maps to it`);
  });
});

describe('firing by class', () => {
  it('firearm shoots bullets, bow arrows, staff blasts, blade swings', () => {
    assert.equal(firingForClass('firearm').kind, 'bullet');
    assert.equal(firingForClass('bow').kind, 'arrow');
    assert.equal(firingForClass('staff').kind, 'blast');
    assert.equal(firingForClass('blade').kind, 'swing');
    assert.equal(firingForClass('spear').kind, 'thrust');
    assert.equal(firingForClass('blunt').kind, 'swing');
    assert.equal(firingForClass('cane').kind, 'swing');
  });
  it('unknown classes fall back to the blade swing, never an invented kind', () => {
    assert.equal(firingForClass('axe').kind, 'swing');
    assert.equal(firingForClass(undefined).kind, 'swing');
    assert.equal(cgiForClass('axe').model.build, 'blade');
  });
  it('the Dutchman cannon matches the engine (64 m/s, 130 m)', () => {
    const spec = cgiForWeapon({ id: 'dutchman-cannon' });
    assert.equal(spec.firing.kind, 'cannonball');
    assert.equal(spec.firing.speedMps, 64);
    assert.equal(spec.firing.rangeM, 130);
  });
});

describe('projectile sim', () => {
  it('a bullet spawns at the origin, travels along the aim, and impacts at range', () => {
    const firing = firingForClass('firearm');
    const s = spawnProjectile(firing, [0, 1.5, 0], [0, 0, -1], 100);
    assert.equal(s.kind, 'bullet');
    assert.deepEqual(s.pos, [0, 1.5, 0]);
    assert.equal(s.alive, true);
    let impacted = false;
    for (let i = 0; i < 40 && !impacted; i++) impacted = stepProjectile(s, 0.05);
    assert.equal(impacted, true);
    assert.equal(s.alive, false);
    assert.ok(s.traveled >= firing.rangeM);
    assert.ok(Math.abs(s.pos[2] + s.traveled) < 1e-6);
  });
  it('an arrow flies slower and shorter than a bullet', () => {
    const a = spawnProjectile(firingForClass('bow'), [0, 1, 0], [1, 0, 0], 0);
    stepProjectile(a, 1);
    assert.equal(a.traveled, 70);
    assert.equal(a.alive, true);
    const b = spawnProjectile(firingForClass('firearm'), [0, 1, 0], [1, 0, 0], 0);
    stepProjectile(b, 1);
    assert.equal(b.traveled, 350);
  });
  it('a zero direction falls back to -Z and a range override wins', () => {
    const s = spawnProjectile(firingForClass('staff'), [1, 2, 3], [0, 0, 0], 0, 26);
    assert.deepEqual(s.dir, [0, 0, -1]);
    assert.equal(s.rangeM, 26);
    assert.ok(projectileLifeLeft(s) > 0);
    stepProjectile(s, 10);
    assert.equal(s.alive, false);
    assert.equal(projectileLifeLeft(s), 0);
  });
  it('stepping a dead projectile never moves it again', () => {
    const s = spawnProjectile(firingForClass('firearm'), [0, 0, 0], [0, 0, -1], 0, 1);
    assert.equal(stepProjectile(s, 1), true);
    const pos = [...s.pos];
    assert.equal(stepProjectile(s, 1), false);
    assert.deepEqual(s.pos, pos);
  });
});

describe('strike firing decisions (the ME page reads these)', () => {
  it('an equipped revolver shoots bullets; an equipped bow shoots arrows', () => {
    assert.equal(
      rangedFiringFor({ equippedId: 'preset-revolver', equippedClass: 'firearm', heroKind: 'bow' }).kind,
      'bullet');
    assert.equal(
      rangedFiringFor({ equippedId: 'ember-revolver', equippedClass: 'firearm', heroKind: 'staff' }).kind,
      'bullet');
    assert.equal(
      rangedFiringFor({ equippedId: 'preset-bow', equippedClass: 'bow', heroKind: 'staff' }).kind,
      'arrow');
  });
  it('with nothing equipped the hero fires natively (staff blast, bow arrow)', () => {
    assert.equal(rangedFiringFor({ heroKind: 'staff' }).kind, 'blast');
    assert.equal(rangedFiringFor({ heroKind: 'bow' }).kind, 'arrow');
  });
  it('an equipped melee weapon never arms the ranged hand', () => {
    assert.equal(
      rangedFiringFor({ equippedId: 'preset-sword', equippedClass: 'blade', heroKind: 'bow' }).kind,
      'arrow');
    assert.equal(meleeFiringFor({ equippedId: 'preset-sword', equippedClass: 'blade' }).kind, 'swing');
    assert.equal(meleeFiringFor({ equippedId: 'preset-revolver', equippedClass: 'firearm' }), null);
    assert.equal(meleeFiringFor({}), null);
  });
});

describe('procedural builders', () => {
  it('every procedural build produces a group with real geometry', () => {
    for (const build of PROCEDURAL_BUILDS) {
      const g = buildProceduralWeapon(THREE, build);
      assert.ok(g && g.isGroup, build);
      let meshes = 0;
      g.traverse((o) => { if (o.isMesh) meshes += 1; });
      assert.ok(meshes >= 2, `${build}: only ${meshes} meshes`);
    }
  });
  it('builds are deterministic: same key, same shape', () => {
    const a = buildProceduralWeapon(THREE, 'blunt');
    const b = buildProceduralWeapon(THREE, 'blunt');
    const sizeOf = (g) => {
      const box = new THREE.Box3().setFromObject(g);
      const s = new THREE.Vector3();
      box.getSize(s);
      return [s.x, s.y, s.z].map((v) => v.toFixed(3)).join(',');
    };
    assert.equal(sizeOf(a), sizeOf(b));
  });
  it('unknown build keys fall back to the blade', () => {
    const g = buildProceduralWeapon(THREE, 'lightsaber');
    assert.equal(g.name, 'weapon-procedural:blade');
  });
  it('proceduralBuildForWeapon follows the GLB-or-class rule', () => {
    assert.equal(proceduralBuildForWeapon({ id: 'flint-shiv', weaponClass: 'blade' }), 'blade');
    assert.equal(proceduralBuildForWeapon({ id: 'ember-revolver', weaponClass: 'firearm' }), 'firearm');
    assert.equal(proceduralBuildForWeapon({ weaponClass: 'staff' }), 'staff');
  });
});

describe('in-hand mount', () => {
  it('mounts the weapon on the anchor at hand height, scaled to the figure', () => {
    const anchor = new THREE.Group();
    const g = buildProceduralWeapon(THREE, 'firearm');
    const out = mountWeaponInHand(THREE, anchor, g, { weaponClass: 'firearm', height: 1.9 });
    assert.equal(out, g);
    assert.equal(anchor.children.length, 1);
    assert.ok(g.position.y > 1 && g.position.y < 1.4, `hand y ${g.position.y}`);
    assert.equal(g.name, 'weapon-in-hand:firearm');
  });
  it('mounting with no anchor or group returns null', () => {
    assert.equal(mountWeaponInHand(THREE, null, new THREE.Group(), {}), null);
    assert.equal(mountWeaponInHand(THREE, new THREE.Group(), null, {}), null);
  });
});

describe('visible shot meshes', () => {
  it('the revolver bullet builds a glowing tracer slug along its flight', () => {
    const firing = rangedFiringFor({ equippedId: 'preset-revolver', equippedClass: 'firearm', heroKind: 'bow' });
    const record = spawnProjectile(firing, [0, 1.5, 0], [0, 0, -1], 0, 30);
    const built = buildProjectileMesh(THREE, record);
    assert.ok(built.group && built.group.isGroup);
    assert.ok(built.group.children.length >= 2, 'slug + glow');
    assert.deepEqual(
      [built.group.position.x, built.group.position.y, built.group.position.z], [0, 1.5, 0]);
    built.dispose();
  });
  it('arrow and blast records build different meshes', () => {
    const arrow = buildProjectileMesh(THREE,
      spawnProjectile(firingForClass('bow'), [0, 1, 0], [1, 0, 0], 0, 30));
    const blast = buildProjectileMesh(THREE,
      spawnProjectile(firingForClass('staff'), [0, 1, 0], [1, 0, 0], 0, 26));
    assert.notEqual(arrow.group.children.length, 0);
    assert.notEqual(blast.group.children.length, 0);
    assert.ok(arrow.group.children.length > blast.group.children.length, 'arrow has shaft+head+fletching');
    arrow.dispose();
    blast.dispose();
  });
  it('a swing arc and a muzzle flash build with positive life', () => {
    const arc = buildSwingArc(THREE, { origin: [0, 1.2, 0], yaw: 0.5, kind: 'swing', color: '#ffe9b0' });
    assert.ok(arc.mesh && arc.mesh.isMesh);
    assert.equal(arc.life, 0.25);
    const thrust = buildSwingArc(THREE, { origin: [0, 1.2, 0], yaw: 0.5, kind: 'thrust' });
    assert.equal(thrust.life, 0.18);
    const flash = buildMuzzleFlash(THREE, [0, 1.5, 0], '#ffb347');
    assert.ok(flash.sprite && flash.sprite.isSprite);
    assert.equal(flash.life, 0.09);
    arc.dispose();
    thrust.dispose();
    flash.dispose();
  });
});

describe('Middle-earth strike produces a visible projectile record', () => {
  it('the ME page fires through spawnProjectile and renders with buildProjectileMesh', () => {
    const src = readFileSync(join(ROOT, 'app/middle-earth/page.jsx'), 'utf8');
    assert.ok(src.includes("from '../../lib/weapons/cgi.js'"), 'page imports the shared CGI module');
    assert.ok(src.includes('spawnProjectile('), 'strike spawns a projectile record');
    assert.ok(src.includes('buildProjectileMesh('), 'the record gets a visible mesh');
    assert.ok(src.includes('buildSwingArc('), 'melee strikes draw a swing arc');
    assert.ok(src.includes('rangedFiringFor('), 'the ranged hand reads the equipped weapon');
    assert.ok(src.includes('mountWeaponInHand('), 'the hero holds the equipped weapon');
  });
  it('an equipped revolver in ME yields a bullet record the page can fly', () => {
    // The page's exact decision, replayed headless: revolver armed
    // on the ranged hand, hero range 30 m — the bullet must be a
    // 'bullet' record travelling 350 m/s to that range.
    const firing = rangedFiringFor({ equippedId: 'preset-revolver', equippedClass: 'firearm', heroKind: 'bow' });
    const record = spawnProjectile(firing, [0, 1.5, 0], [0, 0, -1], 0, 30);
    assert.equal(record.kind, 'bullet');
    assert.equal(record.speedMps, 350);
    stepProjectile(record, 0.1);
    assert.ok(record.pos[2] < -30, `bullet at ${record.pos[2]} after 0.1 s`);
    assert.equal(record.alive, false, 'impacted at the 30 m strike range');
  });
  it('the Earth 2 hunter shot has a tracer (shootDino spawns one)', () => {
    const src = readFileSync(join(ROOT, 'components/earth2/Earth2World.jsx'), 'utf8');
    assert.ok(src.includes('spawnTracer('), 'hunter shots draw a tracer');
    assert.ok(src.includes('spawnTracer(muzzle'), 'the tracer starts at the walker muzzle');
  });
});
