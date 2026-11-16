// AETHELGARD — pocket rainforest universe data.
// Hotspots, rainforest "seasons" (moods), and the day/night sky palette.
// Pure data + math: deterministic, testable, no rendering here.

export const ACCENT = "#7ddf9a";

// 5 points of interest. pos = marker anchor [x, y, z]; cam = fly-to
// camera position; tgt = look-at target when focused.
export const HOTSPOTS = [
  {
    id: "ancient-kapok",
    title: "Ancient Kapok",
    body: "A thousand-year kapok, buttress roots taller than a person. Its crown breaks the canopy and drinks the first light. The grove council meets in its shade.",
    pos: [0, 0, -18],
    cam: [16, 7, 4],
    tgt: [0, 16, -18],
  },
  {
    id: "waterfall",
    title: "Waterfall",
    body: "The stream is born here, spilling off a moss-capped basalt shelf into a black pool. Orchids crowd the spray zone; the water never stops, even in dry season.",
    pos: [48, 0, 28],
    cam: [28, 9, 46],
    tgt: [48, 9, 28],
  },
  {
    id: "orchid-grove",
    title: "Orchid Grove",
    body: "Epiphytes in riot: magenta, gold, and ghost-white blooms on every trunk. In BLOOM season the air here smells of vanilla and rain.",
    pos: [-42, 0, 22],
    cam: [-28, 5, 36],
    tgt: [-42, 2.5, 22],
  },
  {
    id: "canopy-bridge",
    title: "Canopy Bridge",
    body: "A rope bridge strung between two emergents, twenty metres up. Cross it in FLY mode and look down — the forest floor is another country.",
    pos: [-12, 0, -46],
    cam: [6, 24, -28],
    tgt: [-12, 19, -46],
  },
  {
    id: "jaguar-den",
    title: "Jaguar Den",
    body: "A basalt overhang curtained in hanging moss. By day it is empty stone; by night, two amber eyes watch from the dark. Approach quietly.",
    pos: [36, 0, -42],
    cam: [22, 6, -26],
    tgt: [36, 2.5, -42],
  },
];

// Rainforest moods (replaces temperate seasons in the UI shell).
// rain: 0..1 particle intensity · fogMul: fog density multiplier
// rayMul: god-ray opacity multiplier · flutterMul: butterfly activity
// bloomMul: orchid/flower scale pop
export const SEASONS = [
  {
    id: "wet", name: "WET SEASON", rain: 1.0, fogMul: 1.25, rayMul: 0.35, flutterMul: 0.5, bloomMul: 1.0,
    desc: "Afternoon deluges. The stream runs fast, the falls roar, and every leaf drips.",
  },
  {
    id: "dry", name: "DRY SEASON", rain: 0.12, fogMul: 0.85, rayMul: 1.0, flutterMul: 1.0, bloomMul: 1.0,
    desc: "Light mist, strong god rays. The best light for the canopy bridge — and the jaguar hunts at dusk.",
  },
  {
    id: "bloom", name: "BLOOM", rain: 0.4, fogMul: 1.0, rayMul: 0.8, flutterMul: 1.5, bloomMul: 1.6,
    desc: "The orchid grove erupts. Butterflies everywhere; the air smells of vanilla and rain.",
  },
  {
    id: "mist", name: "MIST", rain: 0.0, fogMul: 1.8, rayMul: 0.15, flutterMul: 0.3, bloomMul: 1.0,
    desc: "The forest breathes out. Visibility drops to arm's length; fireflies linger past dawn.",
  },
];

export function seasonAt(i) {
  return SEASONS[((i % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

// --- clock helpers -------------------------------------------------
// (Moved here from the retired app/aethelgard/scene.js, Nov 15 2026:
// the page shell is the only caller, and the rest of that file was a
// dead medieval 2D diorama with no callers left.)
export function timeLabel(t) {
  const h = Math.floor((((t % 1) + 1) % 1) * 24);
  if (h >= 5 && h < 8) return "DAWN";
  if (h >= 8 && h < 17) return "DAY";
  if (h >= 17 && h < 20) return "DUSK";
  return "NIGHT";
}

export function timeString(t) {
  const mins = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

// --- day/night sky palette -------------------------------------------
// t: 0..1 fraction of a 24h day (0 = midnight). Returns lerped colors.
function lerp(a, b, s) { return a + (b - a) * s; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function smooth(a, b, x) {
  const s = clamp01((x - a) / (b - a));
  return s * s * (3 - 2 * s);
}
function mix3(c1, c2, s) {
  return [lerp(c1[0], c2[0], s), lerp(c1[1], c2[1], s), lerp(c1[2], c2[2], s)];
}
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const NIGHT = {
  bg: [4, 14, 10], fog: [7, 20, 14], sun: [140, 170, 255],
  sunI: 0.25, amb: 0.22, hemiSky: [40, 70, 110], hemiGround: [10, 25, 15],
  ray: 0.0, firefly: 1.0,
};
const DAY = {
  bg: [168, 214, 178], fog: [150, 195, 160], sun: [255, 244, 214],
  sunI: 1.6, amb: 0.55, hemiSky: [190, 230, 200], hemiGround: [60, 90, 55],
  ray: 0.55, firefly: 0.0,
};
const DUSK_TINT = [255, 150, 90];

export function skyPalette(t) {
  const elev = Math.sin((t - 0.25) * Math.PI * 2); // -1..1, 0 at 6h/18h
  const day = smooth(-0.06, 0.28, elev);
  const dusk = clamp01(1 - Math.abs(elev) * 4) * (elev > -0.25 ? 1 : 0);

  const bg = mix3(NIGHT.bg, DAY.bg, day);
  const fog = mix3(NIGHT.fog, DAY.fog, day);
  // warm the fog at dawn/dusk
  const fogW = mix3(fog, DUSK_TINT, dusk * 0.35);

  return {
    elev,
    day,
    dusk,
    bg: css(bg),
    fog: css(fogW),
    fogNear: lerp(30, 55, day),
    fogFar: lerp(85, 150, day),
    sunColor: css(mix3(mix3(NIGHT.sun, DAY.sun, day), DUSK_TINT, dusk * 0.5)),
    sunIntensity: lerp(NIGHT.sunI, DAY.sunI, day),
    ambient: lerp(NIGHT.amb, DAY.amb, day),
    hemiSky: css(mix3(NIGHT.hemiSky, DAY.hemiSky, day)),
    hemiGround: css(mix3(NIGHT.hemiGround, DAY.hemiGround, day)),
    godRay: lerp(NIGHT.ray, DAY.ray, day),
    firefly: lerp(NIGHT.firefly, DAY.firefly, day),
    // sun position on an arc; moon takes over at night
    sunPos: [
      Math.cos((t - 0.25) * Math.PI * 2) * 70,
      Math.max(elev, -0.4) * 80 + 12,
      -40,
    ],
  };
}
