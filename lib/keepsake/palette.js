// lib/keepsake/palette.js
// Colour work for Keepsake: sample a photo's palette and build the
// extended backdrop the diorama wears beyond the photo's edges.
//
// The fill beyond the edges is an HONEST reconstruction: it reuses the
// photo's own edge colours and light, painted as soft gradients. It never
// claims to be the original scene — the page footer says so in plain words.

export function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export function rgbString(c) {
  return `rgb(${clampByte(c.r)}, ${clampByte(c.g)}, ${clampByte(c.b)})`;
}

// Average the rows y0..y1 (fractions of the height) of an RGBA buffer.
// Pure — tested in tests/keepsake.test.mjs.
export function averageRegion(pixels, width, height, y0, y1, step = 4) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const top = Math.floor(y0 * height);
  const bottom = Math.max(top + 1, Math.floor(y1 * height));
  for (let y = top; y < bottom; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      r += pixels[i];
      g += pixels[i + 1];
      b += pixels[i + 2];
      n += 1;
    }
  }
  if (!n) return { r: 128, g: 128, b: 128 };
  return { r: clampByte(r / n), g: clampByte(g / n), b: clampByte(b / n) };
}

// Average the most saturated 5% of sampled pixels -> the accent colour.
// Pure — tested in tests/keepsake.test.mjs.
export function mostSaturated(pixels, width, height, step = 8) {
  const scored = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      scored.push({ s: Math.max(r, g, b) - Math.min(r, g, b), r, g, b });
    }
  }
  if (!scored.length) return { r: 200, g: 170, b: 90 };
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.05)));
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of top) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  return { r: clampByte(r / top.length), g: clampByte(g / top.length), b: clampByte(b / top.length) };
}

// Average the brightest pixels, favouring warm light -> the glow colour.
// Pure — tested in tests/keepsake.test.mjs.
export function brightestWarm(pixels, width, height, step = 8) {
  const scored = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      scored.push({ s: r + g + b + Math.max(0, r - b) * 0.5, r, g, b });
    }
  }
  if (!scored.length) return { r: 255, g: 220, b: 160 };
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.max(1, Math.floor(scored.length * 0.05)));
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of top) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  return { r: clampByte(r / top.length), g: clampByte(g / top.length), b: clampByte(b / top.length) };
}

// Sample a photo's palette. img is an HTMLImageElement or a canvas.
// Needs a DOM canvas — call it in the browser, never in a node test.
export function samplePalette(img) {
  const W = 64;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  return {
    sky: averageRegion(data, W, H, 0, 0.25, 2),
    ground: averageRegion(data, W, H, 0.75, 1, 2),
    accent: mostSaturated(data, W, H, 2),
    glow: brightestWarm(data, W, H, 2),
  };
}

// Build the extended backdrop: the photo cover-fit, its left and right
// edges melting into soft gradients painted from its own edge colours.
// That melt is the reconstruction — the photo itself is untouched in
// the middle. Needs a DOM canvas — browser only.
export function makeBackdropCanvas(img, width = 1024, height = 512) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);

  // Edge colours, sampled from the drawn photo.
  const probe = (x) => {
    const px = ctx.getImageData(x, 0, 1, height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = height;
    for (let y = 0; y < n; y += 4) {
      r += px[y * 4];
      g += px[y * 4 + 1];
      b += px[y * 4 + 2];
    }
    const m = Math.ceil(n / 4);
    return { r: Math.round(r / m), g: Math.round(g / m), b: Math.round(b / m) };
  };
  const left = probe(0);
  const right = probe(width - 1);
  const wing = width * 0.22;

  const lg = ctx.createLinearGradient(0, 0, wing, 0);
  lg.addColorStop(0, `rgba(${left.r}, ${left.g}, ${left.b}, 0.92)`);
  lg.addColorStop(1, `rgba(${left.r}, ${left.g}, ${left.b}, 0)`);
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, wing, height);

  const rg = ctx.createLinearGradient(width, 0, width - wing, 0);
  rg.addColorStop(0, `rgba(${right.r}, ${right.g}, ${right.b}, 0.92)`);
  rg.addColorStop(1, `rgba(${right.r}, ${right.g}, ${right.b}, 0)`);
  ctx.fillStyle = rg;
  ctx.fillRect(width - wing, 0, wing, height);

  return c;
}

// Build the foreground snow bank: the photo's lower strip, faded down
// into white — the near ground the diorama stands on. Browser only.
export function makeForegroundCanvas(img, width = 1024, height = 256) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  // Lower third of the photo, stretched across the bank.
  ctx.drawImage(img, 0, ih * 0.68, iw, ih * 0.32, 0, 0, width, height);
  const fade = ctx.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, 'rgba(255, 255, 255, 0)');
  fade.addColorStop(0.55, 'rgba(255, 255, 255, 0.55)');
  fade.addColorStop(1, 'rgba(255, 255, 255, 0.96)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height);
  return c;
}
