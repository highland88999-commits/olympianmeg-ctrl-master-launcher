// tests/holoframe.test.js
// Headless tests for the holographic monitor-array layout math (app/holoframe/array.js).
// Run: node tests/holoframe.test.js  (from the repo root). No browser, no network.
const {
  BASE_W, BASE_H, MAX_SCALE, responsiveScale, carouselRadius,
  layoutMonitors, statusLabel, MODES,
} = require('../app/holoframe/array.js');

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error('FAIL: ' + name); }
}

// --- responsive scale ---
t('scale caps at 1.1 on huge viewports', responsiveScale(4000, 3000) === MAX_SCALE);
t('scale shrinks on small viewports', responsiveScale(400, 300) < 1);
t('scale is exact fit for base frame', Math.abs(responsiveScale(1500, 1000) - 1) < 1e-9);
t('scale guards zero viewport', responsiveScale(0, 0) > 0);

// --- single mode ---
const single = layoutMonitors('single', 3, 0, 1);
t('single: returns one entry per monitor', single.length === 3);
t('single: first monitor centered at full scale', single[0].x === 0 && single[0].y === 0 && single[0].z === 0 && single[0].scale === 1);
t('single: hidden monitors parked far + scale 0', single[1].z === -3000 && single[1].scale === 0 && single[2].z === -3000);
t('single: zero monitors -> empty', layoutMonitors('single', 0, 0, 1).length === 0);

// --- carousel mode ---
const car = layoutMonitors('carousel', 4, 0, 0.8);
t('carousel: 4 monitors', car.length === 4);
t('carousel: evenly spaced angles', Math.abs(car[1].rotY - car[0].rotY - Math.PI / 2) < 1e-9);
t('carousel: radius grows with count', carouselRadius(10) > carouselRadius(3));
t('carousel: radius never below 1200', carouselRadius(1) >= 1200);
t('carousel: angle offset shifts positions', (() => {
  const a = layoutMonitors('carousel', 3, 0, 1);
  const b = layoutMonitors('carousel', 3, 0.5, 1);
  return Math.abs(a[0].x - b[0].x) > 1e-6;
})());
t('carousel: monitors sit on the ring', car.every((m) => Math.abs(Math.hypot(m.x, m.z) - carouselRadius(4)) < 1e-6));

// --- stacked mode ---
const stack = layoutMonitors('stacked', 3, 0, 1);
t('stacked: vertical spacing between monitors', stack[1].y < stack[0].y && stack[2].y < stack[1].y);
t('stacked: uniform gap', Math.abs((stack[0].y - stack[1].y) - (stack[1].y - stack[2].y)) < 1e-9);
t('stacked: slightly reduced scale', stack[0].scale < 1 && stack[0].scale > 0);

// --- fallbacks & labels ---
t('unknown mode falls back to single layout', layoutMonitors('bogus', 2, 0, 1)[0].scale === 1);
t('statusLabel zero-pads', statusLabel(0) === 'NODE ARRAY [01]' && statusLabel(11) === 'NODE ARRAY [12]');
t('MODES lists the three modes', JSON.stringify(MODES) === JSON.stringify(['single', 'carousel', 'stacked']));
t('base frame constants sane', BASE_W === 1200 && BASE_H === 800);

console.log(`\nholoframe: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
