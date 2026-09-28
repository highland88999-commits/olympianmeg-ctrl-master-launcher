/**
 * Labyrinth — procedural canvas textures.
 * Replaces the original's hotlinked remote video texture with
 * deterministic seeded canvas painters. No network, no video files.
 */

function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Dark worked-stone wall texture with faint violet veining. */
export function stoneWallTexture(seed = 42) {
  const rng = seededRandom(seed);
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');

  // Base: near-black blue-grey
  ctx.fillStyle = '#0b0d14';
  ctx.fillRect(0, 0, S, S);

  // Stone blocks
  const rows = 4;
  const bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (S / 8);
    for (let x = -1; x < 5; x++) {
      const bx = x * (S / 4) + offset;
      const shade = 11 + Math.floor(rng() * 10);
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 7})`;
      ctx.fillRect(bx + 2, r * bh + 2, S / 4 - 4, bh - 4);
    }
  }

  // Speckle noise
  for (let i = 0; i < 1400; i++) {
    const g = Math.floor(rng() * 40);
    ctx.fillStyle = `rgba(${g},${g},${g + 12},0.25)`;
    ctx.fillRect(rng() * S, rng() * S, 1.5, 1.5);
  }

  // Faint violet veins
  ctx.strokeStyle = 'rgba(138, 43, 226, 0.16)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    let x = rng() * S;
    let y = rng() * S;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rng() - 0.5) * 90;
      y += (rng() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return c;
}

/** Dark floor texture with a subtle grid of worn flagstones. */
export function floorTexture(seed = 77) {
  const rng = seededRandom(seed);
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, S, S);

  const n = 2;
  const cell = S / n;
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      const shade = 8 + Math.floor(rng() * 8);
      ctx.fillStyle = `rgb(${shade},${shade + 1},${shade + 4})`;
      ctx.fillRect(col * cell + 3, r * cell + 3, cell - 6, cell - 6);
      // worn center highlight
      const g = ctx.createRadialGradient(
        col * cell + cell / 2, r * cell + cell / 2, 4,
        col * cell + cell / 2, r * cell + cell / 2, cell / 2
      );
      g.addColorStop(0, 'rgba(60,70,95,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(col * cell, r * cell, cell, cell);
    }
  }

  for (let i = 0; i < 900; i++) {
    const g = Math.floor(rng() * 30);
    ctx.fillStyle = `rgba(${g},${g},${g + 8},0.22)`;
    ctx.fillRect(rng() * S, rng() * S, 1.5, 1.5);
  }
  return c;
}
