// Artemis OS — procedural "system vitals" (pure logic, no DOM).
// Simulated gauges for the Monitor app. Not measured from anything.

// Deterministic PRNG so tests and first paint are stable.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMonitor(seed = 1337) {
  const rand = mulberry32(seed);
  return {
    cpu: 18 + rand() * 20,
    mem: 34 + rand() * 15,
    net: 4 + rand() * 10,
    temp: 36 + rand() * 4,
    rand,
    history: [],
  };
}

// One tick: values wander like a living system. Returns a fresh snapshot.
export function tickMonitor(mon) {
  const r = mon.rand;
  const wander = (v, lo, hi, amt) => {
    const nv = v + (r() - 0.5) * amt;
    return Math.max(lo, Math.min(hi, nv));
  };
  const next = {
    ...mon,
    cpu: wander(mon.cpu, 4, 96, 14),
    mem: wander(mon.mem, 22, 88, 6),
    net: wander(mon.net, 0, 60, 10),
    temp: wander(mon.temp, 31, 72, 2),
  };
  next.history = [...mon.history, Math.round(next.cpu)].slice(-40);
  return next;
}

export function gaugeLevel(value) {
  if (value < 40) return 'calm';
  if (value < 75) return 'busy';
  return 'hot';
}

export function sparkline(values, width = 40, height = 8) {
  // Returns rows of a tiny text sparkline for tests; the page draws canvas.
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const rows = [];
  for (let y = height; y >= 1; y--) {
    let row = '';
    const step = Math.max(1, Math.floor(values.length / width));
    for (let i = 0; i < values.length; i += step) {
      row += values[i] / max >= y / height ? '█' : ' ';
    }
    rows.push(row);
  }
  return rows.join('\n');
}
