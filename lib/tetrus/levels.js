// lib/tetrus/levels.js
// 100-level difficulty + story config for TETRUS.
// Pure functions — no DOM, no network. Shared by the engine and tests.
//
// Story: Kronos, devourer of his own children, stirs beneath the earth.
// You are the mason of Olympus: stack the stones of Tartarus into
// complete floors, seal the pit level by level across 100 depths, and
// every floor you complete frees the golden lights of the children he
// swallowed — they rise past you toward the sky. On the hundredth floor
// the lid shuts forever. If the stones overflow the pit, Kronos breaks
// free.

/** mulberry32 — small deterministic PRNG. */
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

export const MAX_LEVEL = 100;

// Ten acts of ten levels — the descent into Tartarus, floor by floor.
export const ACTS = [
  {
    title: 'The Threshold of Bronze',
    story:
      'Zeus has spoken: Kronos must never rise again. You descend with hammer and plumb-line to the mouth of Tartarus, where bronze gates once held the Titans. Lay the first floors true — the pit is listening.',
  },
  {
    title: 'The River of Wailing',
    story:
      'The Cocytus runs black beside your scaffolds, thick with the cries of the unburied. Work quickly and do not look down: every completed floor sends a golden light rising past the wailing dark.',
  },
  {
    title: 'Chains of the Hundred-Handers',
    story:
      'Briareos and his brothers lend you their hundred hands. The stones come faster now. The pit deepens, and somewhere below, something old turns in its sleep.',
  },
  {
    title: 'The Fields of Asphodel',
    story:
      'Pale flowers, pale shades. The dead watch your work in silence — all but one voice, laughing softly from the deep. Kronos has felt the weight of your floors and finds it… insufficient.',
  },
  {
    title: 'The Forge of the Cyclopes',
    story:
      'The Cyclopes forge your stones in lightning-fire, obsidian and bronze. Their gift is speed; their warning is plain: a titan does not beg. He waits.',
  },
  {
    title: 'The Screaming Dark',
    story:
      'No torch survives this depth. You build by the light of the freed children now — hundreds of small gold suns rising through the shaft you have made. Kronos screams, and the walls answer.',
  },
  {
    title: 'The Throne Room Ruined',
    story:
      'Here Kronos ruled the golden age and devoured it. His throne stands cracked in the dark below your scaffolds. Stack true, mason — he is reaching up through the cracks.',
  },
  {
    title: 'The Teeth of the Pit',
    story:
      'The pit bites back. Stones arrive twisted, the shaft narrows your margin for error to nothing. Below, a heartbeat like a war-drum. Above, the children’s lights — a river of gold now.',
  },
  {
    title: 'The Face in the Deep',
    story:
      'You can see him now, vast and patient, eyes like banked coals. “Little mason,” he says, “I have eaten gods. Your stones are crumbs.” You lay another floor. His smile falters.',
  },
  {
    title: 'The Lid of the World',
    story:
      'Ten floors remain between Kronos and the sky. Zeus himself holds the last stone ready. Build, mason of Olympus — and when the hundredth floor sings shut, the children rise like dawn, and the devourer dreams forever in the dark.',
  },
];

/**
 * Difficulty tuning for a 1-based level.
 * The well is a true 3D pit: wellW x wellD floor, wellH deep.
 * dropInterval is seconds per gravity step.
 */
export function levelConfig(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  const act = Math.floor((L - 1) / 10); // 0..9
  const actInfo = ACTS[act];
  // The pit widens slightly in the late game — more floor to complete,
  // but far faster stones.
  const wide = L >= 51;
  return {
    level: L,
    act: act + 1,
    actTitle: actInfo.title,
    title: `Depth ${L} — ${actInfo.title}`,
    story: actInfo.story,
    seed: L * 104729 + 6151,
    wellW: wide ? 6 : 5,
    wellD: 5,
    wellH: 14,
    // 0.85s per step at depth 1, tightening to a 0.07s floor by depth 100.
    dropInterval: Math.max(0.85 - (L - 1) * 0.0082, 0.07),
    // Floors (full horizontal layers) needed to seal this depth.
    layersGoal: Math.min(5 + Math.floor((L - 1) / 5), 12),
    // From depth 21 the pit starts partially filled with Kronos's rubble.
    prefillLayers: L < 21 ? 0 : Math.min(1 + Math.floor((L - 21) / 20), 4),
    prefillDensity: L < 21 ? 0 : Math.min(0.34 + (L - 21) * 0.002, 0.5),
    // Kronos strains harder against the lid as you near his face.
    strain: Math.min(0.15 + (L - 1) * 0.0085, 1),
  };
}

/** Story beat for a level (act intro text on act-opening levels). */
export function storyForLevel(level) {
  const cfg = levelConfig(level);
  const isActOpener = (cfg.level - 1) % 10 === 0;
  return {
    ...cfg,
    isActOpener,
    headline: isActOpener ? `Act ${cfg.act}: ${cfg.actTitle}` : cfg.title,
  };
}
