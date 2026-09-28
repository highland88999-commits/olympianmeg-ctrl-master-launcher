// piano.js — 88-key piano layout math. No DOM, no network.

const BLACK_OFFSETS = new Set([1, 3, 6, 8, 10]); // semitone offsets that are black keys

export function isBlackKey(midi) {
  return BLACK_OFFSETS.has(((midi % 12) + 12) % 12);
}

// Index of this key among white keys only, starting at A0 (midi 21) = 0.
export function whiteKeyIndex(midi) {
  let count = 0;
  for (let m = 21; m < midi; m += 1) {
    if (!isBlackKey(m)) count += 1;
  }
  return count;
}

export function whiteKeyCount() {
  let count = 0;
  for (let m = 21; m <= 108; m += 1) {
    if (!isBlackKey(m)) count += 1;
  }
  return count; // 52
}

// Layout for drawing: each key gets x (left edge), w (width), black flag.
// whiteW is the pixel width of one white key; black keys are 0.62x wide.
export function layoutKeys(whiteW = 20) {
  const blackW = whiteW * 0.62;
  const keys = [];
  for (let m = 21; m <= 108; m += 1) {
    const black = isBlackKey(m);
    if (black) {
      // Black keys sit on the boundary after a white key.
      const wIndex = whiteKeyIndex(m);
      keys.push({ midi: m, black: true, x: wIndex * whiteW - blackW / 2, w: blackW });
    } else {
      keys.push({ midi: m, black: false, x: whiteKeyIndex(m) * whiteW, w: whiteW });
    }
  }
  return keys;
}

// Which key (if any) is under canvas pixel x.
export function keyAtX(x, whiteW = 20) {
  const keys = layoutKeys(whiteW);
  // Black keys first so they win on overlaps.
  for (const k of keys) {
    if (k.black && x >= k.x && x <= k.x + k.w) return k.midi;
  }
  for (const k of keys) {
    if (!k.black && x >= k.x && x <= k.x + k.w) return k.midi;
  }
  return null;
}

export const PIANO_LOW = 21; // A0
export const PIANO_HIGH = 108; // C8
