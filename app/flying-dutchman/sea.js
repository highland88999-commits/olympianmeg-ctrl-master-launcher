/*
 * THE FLYING DUTCHMAN — procedural ghost-ship logic.
 *
 * Source structure (index.html) this module adapts:
 *   Stage 1: entry curtain ("INITIATE SIGNAL" handshake screen)
 *   Stage 2: full-screen cinematic (was a YouTube embed of a ship battle)
 *   Stage 3: command center with an oracle + three holo windows on a dock
 *            (Driver / Brand / Product — a vehicle-ad lead funnel)
 *
 * Rebuilt as an atmospheric visual ghost story, fully procedural:
 *   Stage 1: "HAIL THE SHIP" entry gate
 *   Stage 2: THE VOYAGE — canvas night-sea cinematic in four chapters
 *   Stage 3: CAPTAIN'S LOG — glass terminal with three story windows
 *            (The Voyage / The Manifest / The Crew)
 *
 * DROPPED from source: OMEGA MIND telemetry uplink (Supabase + ipify),
 * the silent track_ping uplink, all four hailuo MP4s, both YouTube iframes,
 * the architect-artemis link, the dutchmanautoads@gmail.com mailto funnel,
 * the jsdelivr Supabase CDN. Zero external requests. No audio.
 *
 * Pure logic here — no DOM — so it is unit-testable.
 */

/* Four chapters of the haunting. Durations in seconds. */
export const CHAPTERS = [
  {
    id: 'calm',
    numeral: 'I',
    title: 'THE CALM',
    dur: 14,
    caption: 'The sea lay flat as black glass. The moon kept its one good eye on the water — and on the empty horizon.',
    scene: { fog: 0.25, rough: 0.25, shipDist: 1.0, shipOpacity: 0.0, glow: 0.0, lightning: false, moon: 1.0, green: 0.0 },
  },
  {
    id: 'crossing',
    numeral: 'II',
    title: 'THE CROSSING',
    dur: 16,
    caption: 'Out of the fog she came: black sails, cold fire in her rigging. No ship moves that fast with no wind behind her.',
    scene: { fog: 0.7, rough: 0.45, shipDist: 0.55, shipOpacity: 0.85, glow: 0.25, lightning: false, moon: 0.7, green: 0.15 },
  },
  {
    id: 'haunting',
    numeral: 'III',
    title: 'THE HAUNTING',
    dur: 18,
    caption: 'They say her crew never sleeps. Lanterns drift where no hands hold them. She is searching — for a captain, or a crew.',
    scene: { fog: 0.5, rough: 0.6, shipDist: 0.35, shipOpacity: 1.0, glow: 1.0, lightning: false, moon: 0.85, green: 1.0 },
  },
  {
    id: 'curse',
    numeral: 'IV',
    title: 'THE CURSE',
    dur: 16,
    caption: 'Doomed to sail until the seas run dry. When the storm takes her, look away. Part of the ship… part of the crew.',
    scene: { fog: 0.9, rough: 1.0, shipDist: 0.7, shipOpacity: 0.35, glow: 0.5, lightning: true, moon: 0.25, green: 0.4 },
  },
];

export const VOYAGE_LENGTH = CHAPTERS.reduce((s, c) => s + c.dur, 0);

/** Which chapter is playing at elapsed seconds (loops the voyage). */
export function chapterAt(elapsed) {
  const t = ((elapsed % VOYAGE_LENGTH) + VOYAGE_LENGTH) % VOYAGE_LENGTH;
  let acc = 0;
  for (let i = 0; i < CHAPTERS.length; i++) {
    acc += CHAPTERS[i].dur;
    if (t < acc) return { index: i, chapter: CHAPTERS[i], local: t - (acc - CHAPTERS[i].dur), progress: t / VOYAGE_LENGTH };
  }
  return { index: 0, chapter: CHAPTERS[0], local: 0, progress: 0 };
}

/** Layered wave field. rough scales amplitude (0 = glass, 1 = storm). */
export function waveY(x, t, rough, layer = 0) {
  const a = (6 + layer * 10) * (0.3 + rough);
  return (
    Math.sin(x * 0.008 + t * (0.6 + layer * 0.25)) * a +
    Math.sin(x * 0.021 - t * (0.9 + layer * 0.2) + layer * 2.1) * a * 0.45 +
    Math.sin(x * 0.05 + t * 1.7 + layer) * a * 0.18
  );
}

/** Ship screen position: sails in from the far right toward center-left as the story progresses. */
export function shipScreenX(W, scene, chapterLocal, chapterDur) {
  // Drift within the chapter for a living feel
  const drift = Math.sin((chapterLocal / chapterDur) * Math.PI * 2) * W * 0.02;
  return W * (0.32 + scene.shipDist * 0.5) + drift;
}

export function shipScale(scene) {
  return 0.55 + (1 - scene.shipDist) * 0.9;
}

/** Deterministic lightning scheduler for the curse chapter. */
export function lightningAt(t) {
  // A bolt every ~3.7s, flash envelope decays over 0.5s
  const cycle = 3.7;
  const ph = t % cycle;
  if (ph < 0.5) return { active: true, intensity: 1 - ph / 0.5 };
  return { active: false, intensity: 0 };
}

/** Drifting fog banks. */
export class FogSim {
  constructor(seed = 2026, count = 26) {
    let s = seed >>> 0;
    const rnd = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.banks = [];
    for (let i = 0; i < count; i++) {
      this.banks.push({
        x: rnd(), y: 0.35 + rnd() * 0.45, w: 0.15 + rnd() * 0.3,
        speed: 0.004 + rnd() * 0.01, alpha: 0.05 + rnd() * 0.1,
      });
    }
  }
  step(dt) {
    for (const b of this.banks) {
      b.x += b.speed * dt;
      if (b.x - b.w > 1) b.x = -b.w;
    }
  }
}

/** Ghost-lantern wisps that drift around the ship during the haunting. */
export class WispSim {
  constructor(seed = 99, count = 14) {
    let s = seed >>> 0;
    const rnd = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.wisps = [];
    for (let i = 0; i < count; i++) {
      this.wisps.push({ ox: (rnd() - 0.5) * 2, oy: (rnd() - 0.5) * 1.4, ph: rnd() * Math.PI * 2, sp: 0.4 + rnd() * 0.8 });
    }
  }
  /** Positions relative to the ship center, in ship-scale units. */
  positions(t) {
    return this.wisps.map((w) => ({
      x: w.ox + Math.sin(t * w.sp + w.ph) * 0.35,
      y: w.oy + Math.cos(t * w.sp * 0.7 + w.ph) * 0.3,
      tw: 0.5 + 0.5 * Math.sin(t * 3 + w.ph * 2),
    }));
  }
}

/* Captain's log windows (stage 3). Story content replaces the ad funnel. */
export const LOG_WINDOWS = [
  {
    id: 'voyage',
    icon: '⛵',
    title: 'THE VOYAGE',
    body: [
      'Sighted 03:12 — no moon, no wind, yet she made eleven knots.',
      'Her bell tolled thirteen times. We counted twice.',
      'The captain ordered full sail away. The sea would not let us.',
      'She sails still. If you see her lanterns, do not answer.',
    ],
  },
  {
    id: 'manifest',
    icon: '📜',
    title: 'THE MANIFEST',
    body: [
      'CARGO: one hundred souls, unclaimed.',
      'CARGO: black canvas, storm-torn, mended with moonlight.',
      'CARGO: a bell that rings without a hand.',
      'DESTINATION: none recorded. None ever recorded.',
    ],
  },
  {
    id: 'crew',
    icon: '🏮',
    title: 'THE CREW',
    body: [
      'THE CAPTAIN — pays his debts in centuries.',
      'THE LOOKOUT — still watching for a shore.',
      'THE COOK — serves a supper no one eats.',
      'YOU — the sea is hiring. It always is.',
    ],
  },
];
