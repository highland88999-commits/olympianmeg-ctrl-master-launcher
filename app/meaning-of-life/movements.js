// Pure data + pacing logic for the Meaning of Life visualizer.

export const MOVEMENTS = [
  {
    id: "genesis",
    title: "Genesis",
    epithet: "The First Spark",
    durationMs: 26000,
    lines: [
      "Before the first star, there was a question.",
      "Every beginning is small, and every small thing matters.",
      "From stillness, a single point of light — and then, everything.",
    ],
  },
  {
    id: "interconnection",
    title: "Interconnection",
    epithet: "The Weaving",
    durationMs: 26000,
    lines: [
      "No thread is alone. Pull one, and the whole tapestry moves.",
      "You are the universe, experiencing itself from the inside.",
      "Every life touches a thousand others — most of them unknowingly.",
    ],
  },
  {
    id: "transcendence",
    title: "Transcendence",
    epithet: "The Rising",
    durationMs: 26000,
    lines: [
      "What rises is not the body, but what the body carried.",
      "Perpetual creation: the end of one thing is the seed of the next.",
      "The universe keeps asking — and keeps becoming the answer.",
    ],
  },
];

export const LINE_DWELL_MS = 7000;
export const TAGLINE = "The universe experiencing itself in perpetual creation";

export function movementCount() {
  return MOVEMENTS.length;
}

export function movementAt(index) {
  const n = MOVEMENTS.length;
  return MOVEMENTS[((index % n) + n) % n];
}

export function nextIndex(index) {
  return (index + 1) % MOVEMENTS.length;
}

export function prevIndex(index) {
  return (index - 1 + MOVEMENTS.length) % MOVEMENTS.length;
}

export function lineAt(movement, elapsedMs) {
  if (!movement.lines.length) return "";
  const i = Math.floor(elapsedMs / LINE_DWELL_MS) % movement.lines.length;
  return movement.lines[i];
}

export function isValidMovement(m) {
  return (
    m &&
    typeof m.id === "string" &&
    typeof m.title === "string" &&
    typeof m.epithet === "string" &&
    Array.isArray(m.lines) &&
    m.lines.length > 0 &&
    typeof m.durationMs === "number" &&
    m.durationMs > 0
  );
}
