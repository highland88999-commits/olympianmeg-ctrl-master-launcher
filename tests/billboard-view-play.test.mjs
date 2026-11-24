// tests/billboard-view-play.test.mjs
// Billboard view-play + pass-through (Merlin, 2026-11-24):
// - A billboard's video plays only while THAT billboard is in view,
//   pauses when it leaves the screen, resumes from where it paused
//   when it comes back (per-panel records, not one shared per URL).
// - Users pass through the billboards and god towers freely: NO
//   tower collider is registered. Visually the towers stay fully
//   solid — no transparency, no fading, no ghost effect, no outline,
//   no visual cue of any kind that they are passable. Only the
//   invisible wall is gone (Merlin's clarification, same day).
// Run: node --test tests/billboard-view-play.test.mjs (from the repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { towerFixedYaw, towerBoxHalfExtents } from '../lib/tower-collider.js';
import { registerBoxCollider, unregisterCollider } from '../lib/hub-collision.js';

const tower = readFileSync(new URL('../components/GodTower.jsx', import.meta.url), 'utf8');
const homeScene = readFileSync(new URL('../components/HomeScene.jsx', import.meta.url), 'utf8');
const hubCollision = readFileSync(new URL('../lib/hub-collision.js', import.meta.url), 'utf8');
const argoMonument = readFileSync(new URL('../components/argo/BillboardMonument.jsx', import.meta.url), 'utf8');

// The TowerAdPanel function body: the panel visuals live here.
const panelStart = tower.indexOf('function TowerAdPanel');
const panelEnd = tower.indexOf('function GodTower', panelStart);
const panelSrc = panelStart >= 0 && panelEnd > panelStart
  ? tower.slice(panelStart, panelEnd)
  : '';

describe('billboard view-play (per panel)', () => {
  it('one video element per panel, keyed by panel + URL — not one shared per URL', () => {
    assert.ok(tower.includes('function panelVideoRecordKey(viewerId, url)'), 'record key helper');
    assert.ok(tower.includes('`${viewerId}::${url}`'), 'key is panel + URL');
    assert.ok(!tower.includes('viewers: new Set()'), 'no shared viewers set');
    assert.ok(tower.includes('rec.inView = inView'), 'per-panel in-view flag');
  });

  it('in-view guard math unchanged: front-facing AND inside the camera frustum', () => {
    assert.ok(tower.includes('const facing = _panelNormal.dot(_panelToCam) > 0;'), 'front-facing check');
    assert.ok(tower.includes('_panelFrustum.intersectsObject(mesh)'), 'frustum check');
    assert.ok(tower.includes('setPanelVideoViewer(viewerId, videoUrl, inView)'), 'per-panel seat');
  });

  it('pause keeps currentTime: resume, never restart', () => {
    assert.ok(!tower.includes('currentTime = 0'), 'no currentTime reset');
    assert.ok(!tower.includes('currentTime=0'), 'no currentTime reset (tight)');
  });

  it('panel elements preload metadata only — 132 faces must not all buffer media at mount', () => {
    assert.ok(tower.includes("video.preload = 'metadata'"), 'metadata preload');
    assert.ok(!tower.includes("video.preload = 'auto'"), 'no auto preload');
  });

  it('tab-hide pauses, visible resumes the in-view panels', () => {
    assert.ok(tower.includes("document.addEventListener('visibilitychange', refreshPanelVideoPlayback)"), 'visibility listener');
    assert.ok(tower.includes('rec.inView && !hidden'), 'resume only in-view panels');
  });
});

describe('god-tower pass-through (no collider, visuals solid)', () => {
  it('GodTower registers NO tower collider of any kind', () => {
    assert.ok(!tower.includes('registerBoxCollider('), 'no box collider');
    assert.ok(!tower.includes('`tower-${god}`'), 'no tower collider id');
    assert.ok(!tower.includes('@/lib/hub-collision'), 'no hub-collision import at all');
    assert.ok(!/(?<![A-Za-z])registerCollider\(`tower-\$\{god\}`/.test(tower), 'no sphere collider');
  });

  it('the tower still LOOKS fully solid: panel faces carry no transparency or fading', () => {
    assert.ok(panelSrc.length > 0, 'TowerAdPanel source found');
    assert.ok(!panelSrc.includes('opacity'), 'no opacity in the panel');
    assert.ok(!panelSrc.includes('transparent'), 'no transparency in the panel');
    assert.ok(
      panelSrc.includes('<meshBasicMaterial map={videoState.texture} color="#ffffff" toneMapped={false} />'),
      'video face is true-color, unlit'
    );
    assert.ok(panelSrc.includes('map={faceTex || undefined}'), 'honest canvas face intact');
  });

  it('tower geometry is untouched: pillar, hull, rings, propellers, panels all still there', () => {
    assert.ok(tower.includes('cylinderGeometry args={[2.5, 2.5, 43, 32]}'), 'pillar');
    assert.ok(tower.includes('cylinderGeometry args={[4.5, 3.5, 8, 8, 1, true]}'), 'hull cone');
    assert.ok(tower.includes('cylinderGeometry args={[15.0, 15.0, 0.4, 32]}'), 'ring discs');
    assert.ok(tower.includes('<group position={[0, 14.2, 10.12]}>'), 'level 1 mount');
    assert.ok(tower.includes('<group position={[0, -1, 10.12]}>'), 'level 2 mount');
    assert.ok(tower.includes('<group position={[0, -16.2, 10.12]}>'), 'level 3 mount');
  });

  it('the fixed yaw still squares the tower to the ring (visuals depend on it)', () => {
    assert.ok(tower.includes('const fixedYaw = towerFixedYaw(position);'), 'fixed yaw kept');
    assert.ok(tower.includes('rotation={[0, fixedYaw, 0]}'), 'yaw applied to the group');
  });

  it('hub-collision records the tower pass-through exception (portals are no longer the only one)', () => {
    assert.ok(hubCollision.includes('god towers + their billboards'), 'tower exception named');
    assert.ok(hubCollision.includes('2026-11-24'), 'exception dated');
    assert.ok(hubCollision.includes('GodTower'), 'exception points at GodTower');
  });

  it('HomeScene no longer describes tower colliders reaching 172', () => {
    assert.ok(!homeScene.includes('colliders reaching'), 'stale collider reach gone');
    assert.ok(homeScene.includes('no longer colliders'), 'pass-through noted');
  });

  it('the shared collision helpers stay exported and working for everything else', () => {
    assert.equal(typeof towerFixedYaw, 'function', 'towerFixedYaw exported');
    assert.equal(typeof towerBoxHalfExtents, 'function', 'towerBoxHalfExtents exported');
    assert.equal(typeof registerBoxCollider, 'function', 'registerBoxCollider exported');
    assert.equal(typeof unregisterCollider, 'function', 'unregisterCollider exported');
  });
});

describe('sweep: ARGO street monuments untouched (report only)', () => {
  it('BillboardMonument still plays unconditionally — NOT changed by this job', () => {
    assert.ok(argoMonument.includes('vid.play().catch(() => {});'), 'unconditional play intact');
    assert.ok(!argoMonument.includes('setPanelVideoViewer'), 'no view guard added there');
    assert.ok(!argoMonument.includes('registerBoxCollider'), 'no collider change there');
  });
});
