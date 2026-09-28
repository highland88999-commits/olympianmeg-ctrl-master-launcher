// STATUE OF LIBERTY — exhibit data.
// Hotspot facts and the construction timeline. Coordinates are in the
// statue's local drawing space (0..400 wide, 0..820 tall, origin top-left),
// so the renderer can place markers after orbit/zoom transforms.

export const STATUE_SPACE = { w: 400, h: 820 };

export const HOTSPOTS = [
  {
    id: "torch",
    x: 296,
    y: 128,
    title: "The Torch",
    body: "Liberty's raised torch is the light of reason illuminating the world. The flame you see today is coated in 24-karat gold leaf, added in the 1986 restoration so it catches the sun by day and floodlights by night.",
  },
  {
    id: "crown",
    x: 200,
    y: 236,
    title: "The Crown",
    body: "Seven spikes radiate from the crown — one for each of the seven seas and seven continents, a symbol that liberty extends to the whole world. Visitors can still climb to the crown's 25 windows.",
  },
  {
    id: "tablet",
    x: 148,
    y: 372,
    title: "The Tablet",
    body: "In her left arm Liberty cradles a tablet inscribed JULY IV MDCCLXXVI — July 4, 1776, the date of American independence, rendered in Roman numerals.",
  },
  {
    id: "robe",
    x: 200,
    y: 560,
    title: "The Robe",
    body: "The flowing classical robe is built from repoussé copper — sheets hammered into shape over wooden forms, only about 2.4 mm thick. The green patina is copper carbonate, formed by a century of sea air.",
  },
  {
    id: "pedestal",
    x: 200,
    y: 742,
    title: "The Pedestal",
    body: "The star-shaped pedestal was funded by American donors after Joseph Pulitzer's famous newspaper campaign. The statue itself — 151 feet of copper and iron — was a gift from the people of France, dedicated October 28, 1886.",
  },
];

export const TIMELINE = [
  {
    year: "1876",
    title: "Conceived",
    body: "Sculptor Frédéric Auguste Bartholdi designs the statue as a centennial gift from France to the United States; engineer Gustave Eiffel designs the iron skeleton.",
  },
  {
    year: "1886",
    title: "Dedicated",
    body: "On October 28, 1886, the Statue of Liberty is dedicated in New York Harbor — 151 feet tall, 305 feet from ground to torch tip.",
  },
  {
    year: "1986",
    title: "Restored",
    body: "For her centennial, Lady Liberty is restored: a new gold-leaf torch, a replaced iron armature in stainless steel, and the crown reopened to visitors.",
  },
];

// Transform a statue-local point to screen space.
// orbit: -1..1 drag amount; zoom: scale factor; view: {w,h} css px of canvas.
export function toScreen(x, y, orbit, zoom, view) {
  const baseScale = Math.min(view.w / STATUE_SPACE.w, view.h / STATUE_SPACE.h) * 0.92;
  const s = baseScale * zoom;
  // parallax: statue layer shifts against the background with orbit
  const px = orbit * 46;
  const cx = view.w / 2 + px;
  const cy = view.h / 2;
  return {
    x: cx + (x - STATUE_SPACE.w / 2) * s,
    y: cy + (y - STATUE_SPACE.h / 2) * s,
    scale: s,
  };
}

export function hotspotById(id) {
  return HOTSPOTS.find((h) => h.id === id) || null;
}
