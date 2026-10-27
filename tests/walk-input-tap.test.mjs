// tests/walk-input-tap.test.mjs — the shared tap rule (Earth 2 v3):
// a tap lifts within 500 ms and within 10 px of where it landed,
// judged by ENDPOINT displacement. The old 300 ms window silently
// dropped slow one-handed taps (e.g. while holding a controller),
// reclassifying them as drag-look so strikes never fired.

import test from 'node:test';
import assert from 'node:assert/strict';

import { attachDragLook } from '../lib/world/walk-input.js';

function makeEl() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    emit(type, e) { for (const fn of (listeners[type] || []).slice()) fn(e); },
  };
}

// Controlled clock: attachDragLook reads global performance.now().
function withClock(fakeNow, fn) {
  const orig = performance.now;
  performance.now = () => fakeNow.value;
  try { fn(); } finally { performance.now = orig; }
}

function press(el, now, x, y, pid = 1) {
  el.emit('pointerdown', { pointerId: pid, clientX: x, clientY: y });
}

function lift(el, x, y, pid = 1) {
  el.emit('pointerup', { pointerId: pid, clientX: x, clientY: y });
}

test('tap within 500 ms and 10 px fires onTap, never onLook', () => {
  const now = { value: 1000 };
  withClock(now, () => {
    const el = makeEl();
    const taps = [];
    const looks = [];
    attachDragLook(el, { onTap: (x, y) => taps.push([x, y]), onLook: (dx, dy) => looks.push([dx, dy]) });
    press(el, now.value, 100, 100);
    now.value = 1400; // 400 ms later, slow one-handed tap
    lift(el, 103, 102); // endpoint displacement ~3.6 px
    assert.equal(taps.length, 1);
    assert.deepEqual(taps[0], [103, 102]);
    assert.equal(looks.length, 0);
  });
});

test('slow tap at 450 ms still fires (the 300 ms regression)', () => {
  const now = { value: 5000 };
  withClock(now, () => {
    const el = makeEl();
    const taps = [];
    attachDragLook(el, { onTap: () => taps.push(1) });
    press(el, now.value, 50, 50);
    now.value = 5450; // 450 ms — the old window would have dropped this
    lift(el, 51, 50);
    assert.equal(taps.length, 1);
  });
});

test('tap past 500 ms does not fire onTap', () => {
  const now = { value: 1000 };
  withClock(now, () => {
    const el = makeEl();
    const taps = [];
    attachDragLook(el, { onTap: () => taps.push(1) });
    press(el, now.value, 100, 100);
    now.value = 1600; // 600 ms — a hold, not a tap
    lift(el, 100, 100);
    assert.equal(taps.length, 0);
  });
});

test('tap ending far from its start does not fire onTap', () => {
  const now = { value: 1000 };
  withClock(now, () => {
    const el = makeEl();
    const taps = [];
    attachDragLook(el, { onTap: () => taps.push(1) });
    press(el, now.value, 100, 100);
    now.value = 1100;
    lift(el, 120, 100); // 20 px away — a flick, not a tap
    assert.equal(taps.length, 0);
  });
});

test('real drag looks but never taps (drag protection intact)', () => {
  const now = { value: 1000 };
  withClock(now, () => {
    const el = makeEl();
    const taps = [];
    const looks = [];
    attachDragLook(el, { onTap: () => taps.push(1), onLook: (dx, dy) => looks.push([dx, dy]) });
    press(el, now.value, 100, 100);
    el.emit('pointermove', { pointerId: 1, clientX: 150, clientY: 100 });
    el.emit('pointermove', { pointerId: 1, clientX: 200, clientY: 100 });
    now.value = 1100;
    lift(el, 200, 100);
    assert.equal(taps.length, 0);
    assert.ok(looks.length >= 1);
  });
});

test('second pointer is ignored; detach stops everything', () => {
  const now = { value: 1000 };
  withClock(now, () => {
    const el = makeEl();
    const taps = [];
    const detach = attachDragLook(el, { onTap: () => taps.push(1) });
    press(el, now.value, 100, 100, 1);
    press(el, now.value, 300, 300, 2); // ignored while pid 1 is down
    now.value = 1100;
    lift(el, 300, 300, 2); // ignored
    lift(el, 101, 100, 1); // real tap
    assert.equal(taps.length, 1);
    detach();
    press(el, now.value, 100, 100, 1);
    now.value = 1200;
    lift(el, 100, 100, 1);
    assert.equal(taps.length, 1); // nothing after detach
  });
});
