// Content data layer for the Middle-earth open-world pocket universe.
// Pure module: no JSX, no document/window access at import time.
// A tribute to J.R.R. Tolkien — all descriptive text here is original.
// Place-names appear as factual labels only; no poems, songs, or quotes.

export const PROGRESS_KEY = 'olympus:middleearth:progress';

export const REGIONS = [
  { id: 'shire', name: 'The Shire', x: -260, blurb: 'Green hills, round doors, and quiet lanes where the road begins.' },
  { id: 'rivendell', name: 'Rivendell', x: -190, blurb: 'A hidden valley of white stone and waterfalls, kept apart from the world.' },
  { id: 'moria', name: 'Moria', x: -120, blurb: 'Deep halls under the mountains, dark and silent since the drums stopped.' },
  { id: 'lothlorien', name: 'Lothlórien', x: -50, blurb: 'Golden trees that hold the light, where time seems to move more slowly.' },
  { id: 'mirkwood', name: 'Mirkwood', x: 20, blurb: 'A dark forest where the path is narrow and the shadows watch.' },
  { id: 'rohan', name: 'Rohan', x: 90, blurb: 'Open grasslands where horses run and the wind never quite stops.' },
  { id: 'gondor', name: 'Gondor', x: 160, blurb: 'White stone towers and terraced streets guarding the southern plains.' },
  { id: 'mordor', name: 'Mordor', x: 240, blurb: 'Ash and fire under a watchful shadow, where the journey must end.' },
];

export const QUESTS = [
  {
    id: 'leave-shire',
    region: 'shire',
    title: 'Leave the Shire',
    text: 'The road runs east past the last fence and into the unknown. Pack light and keep walking.',
    objective: 'Reach the East Road',
    target: { x: -215, z: 0, r: 12, label: 'East Road' },
  },
  {
    id: 'council-rivendell',
    region: 'rivendell',
    title: 'The Council',
    text: 'Voices gather on the terrace to decide what must be done. Listen, then accept the task.',
    objective: 'Attend the council on the terrace',
    target: { x: -190, z: -18, r: 10, label: 'Council terrace' },
  },
  {
    id: 'cross-moria',
    region: 'moria',
    title: 'The Bridge of Khazad-dûm',
    text: 'The mines are empty but not empty — stay together and keep moving. The bridge is narrow; do not stop.',
    objective: 'Cross the mines from west gate to east gate',
    checkpoints: [
      { x: -140, z: 0, r: 8, label: 'West gate' },
      { x: -115, z: -10, r: 8, label: 'The bridge' },
      { x: -95, z: 0, r: 8, label: 'East gate' },
    ],
  },
  {
    id: 'mirror-galadriel',
    region: 'lothlorien',
    title: 'The Mirror',
    text: 'In the golden wood a still basin waits for those who dare to look. What it shows is yours alone.',
    objective: 'Look into the mirror in the glade',
    target: { x: -50, z: -15, r: 8, label: 'Mirror glade' },
  },
  {
    id: 'through-mirkwood',
    region: 'mirkwood',
    title: 'Through the Dark Wood',
    text: 'The old path fades between the trunks, and the spiders are patient. Do not leave the trail.',
    objective: 'Follow the trail through the wood',
    checkpoints: [
      { x: 0, z: 20, r: 8, label: 'Trailhead' },
      { x: 25, z: -10, r: 8, label: 'Spider hollow' },
      { x: 45, z: 15, r: 8, label: 'Far edge' },
    ],
  },
  {
    id: 'ride-rohan',
    region: 'rohan',
    title: 'The Golden Hall',
    text: 'Riders sweep across the grass to a hill crowned with a golden roof. There you will be heard.',
    objective: 'Enter the hall at Edoras',
    target: { x: 90, z: -25, r: 10, label: 'Edoras' },
  },
  {
    id: 'stand-gondor',
    region: 'gondor',
    title: 'The White City',
    text: 'Seven circles of stone rise against the mountain, and beacons burn on the ridge. Stand your ground.',
    objective: 'Reach the citadel',
    target: { x: 160, z: -30, r: 10, label: 'Citadel' },
  },
  {
    id: 'cast-ring',
    region: 'mordor',
    title: 'The Fire',
    text: 'The last climb is ash and heat, and the door of the mountain stands open. Finish it.',
    objective: 'Reach the summit of Mount Doom',
    target: { x: 265, z: -20, r: 10, label: 'Mount Doom summit' },
  },
];

export function createProgress() {
  return { beatsDone: {} };
}

export function isBeatUnlocked(progress, i) {
  if (i === 0) return true;
  if (!progress || typeof progress !== 'object' || !progress.beatsDone) return false;
  const prev = QUESTS[i - 1];
  return Boolean(prev && progress.beatsDone[prev.id]);
}

export function completeBeat(progress, questId) {
  const base = progress && typeof progress === 'object' ? progress : createProgress();
  const beatsDone = { ...(base.beatsDone && typeof base.beatsDone === 'object' ? base.beatsDone : {}) };
  beatsDone[questId] = true;
  return { ...base, beatsDone };
}

export function loadProgress() {
  try {
    if (typeof localStorage === 'undefined') return createProgress();
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return createProgress();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.beatsDone || typeof parsed.beatsDone !== 'object') {
      return createProgress();
    }
    return parsed;
  } catch {
    return createProgress();
  }
}

export function saveProgress(p) {
  try {
    if (typeof localStorage === 'undefined') return;
    const value = p && typeof p === 'object' && p.beatsDone ? p : createProgress();
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable — progress just won't persist this session
  }
}

export function regionOfX(x) {
  let best = REGIONS[0];
  let bestDist = Math.abs(x - best.x);
  for (const r of REGIONS) {
    const d = Math.abs(x - r.x);
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}
