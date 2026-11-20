// tests/hub-loaded.test.mjs
// Hub-loaded signal (Merlin, Nov 19, 2026: "Maybe don't load concourse
// until after the main hub finishes loading" — "That might help with
// the crash"; his diagnosis: "I'm pretty sure it's a graphics
// overload").
//   - lib/hub-loaded.js: the event name, the fire function, and the
//     pure mount predicate (hub: only after the signal; elsewhere:
//     immediately)
//   - components/HomeScene.jsx: fires the signal on the Canvas's first
//     frame, and the moment the scene cannot start (WebGL unavailable
//     / context lost / mount error) so the menu is never dead-gated
//   - components/Concourse.jsx: mounts ConcoursePortals only when the
//     predicate says so; an Orb tap or the ?portals3d=1 deep link
//     before the signal still records the intent (portal3dOpen) and
//     the menu appears the moment the hub is up
//
// Run: node --test tests/hub-loaded.test.mjs (from the repo root)

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HUB_LOADED_EVENT, fireHubLoaded, shouldMountConcoursePortals } from '../lib/hub-loaded.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

afterEach(() => { delete global.window; });

describe('lib/hub-loaded.js', () => {
  it('names the event olympus:hub-loaded', () => {
    assert.equal(HUB_LOADED_EVENT, 'olympus:hub-loaded');
  });

  it('mounts the portal menu on the hub only after the signal', () => {
    assert.equal(shouldMountConcoursePortals({ hubLoaded: false, onHub: true }), false);
    assert.equal(shouldMountConcoursePortals({ hubLoaded: true, onHub: true }), true);
  });

  it('mounts the portal menu immediately off the hub (no scene to wait for)', () => {
    assert.equal(shouldMountConcoursePortals({ hubLoaded: false, onHub: false }), true);
    assert.equal(shouldMountConcoursePortals({ hubLoaded: true, onHub: false }), true);
  });

  it('fireHubLoaded dispatches the event on window', () => {
    const seen = [];
    global.window = { dispatchEvent: (e) => seen.push(e) };
    fireHubLoaded();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, HUB_LOADED_EVENT);
  });

  it('fireHubLoaded is a no-op without a window (SSR)', () => {
    delete global.window;
    assert.doesNotThrow(() => fireHubLoaded());
  });
});

describe('the hub-loaded wiring (source pins)', () => {
  it('HomeScene fires the signal on the first frame', () => {
    const scene = read('components/HomeScene.jsx');
    assert.ok(scene.includes("import { fireHubLoaded } from '../lib/hub-loaded'"), 'imports the signal');
    assert.ok(scene.includes('FirstFrameReporter'), 'has the first-frame reporter');
    assert.ok(scene.includes('<FirstFrameReporter onFirstFrame={onFirstFrame} />'), 'reporter rides in the Canvas');
    assert.ok(scene.includes('onFirstFrame={fireHubLoadedOnce}'), 'first frame fires the signal once');
  });

  it('HomeScene fires the signal when the scene cannot start', () => {
    const scene = read('components/HomeScene.jsx');
    assert.ok(scene.includes('if (unavailable) fireHubLoadedOnce()'), 'probe fail / context lost settles the gate');
    assert.ok(scene.includes('onError={fireHubLoadedOnce}'), 'mount error settles the gate');
  });

  it('Concourse mounts the portal menu only when the predicate says so', () => {
    const concourse = read('components/Concourse.jsx');
    assert.ok(concourse.includes("import { HUB_LOADED_EVENT, shouldMountConcoursePortals } from '@/lib/hub-loaded'"), 'imports the signal + predicate');
    assert.ok(concourse.includes('window.addEventListener(HUB_LOADED_EVENT, onHubLoaded)'), 'listens for the signal');
    assert.ok(concourse.includes('shouldMountConcoursePortals({ hubLoaded, onHub })'), 'gates the portal menu mount');
    assert.ok(concourse.includes('<ConcoursePortals'), 'menu still rendered');
  });

  it('the Orb tap and the deep link still record the intent before the signal', () => {
    const concourse = read('components/Concourse.jsx');
    // portal3dOpen is the intent; the gate only delays the mount, never the tap.
    assert.ok(concourse.includes('setPortal3dOpen(true)'), 'Orb / deep link still set the open intent');
    assert.ok(!concourse.includes('hubLoaded && portal3dOpen'), 'the gate never rewrites the intent itself');
  });
});
