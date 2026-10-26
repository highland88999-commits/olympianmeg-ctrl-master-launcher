// OLYMPIAN MONSTERVERSE — procedural behavior (pure, no three.js).
//
// Batch 4 arrived with ZERO baked animations and ZERO morph
// targets in all 76 files, so every behavior here is procedural:
// breathing, blinking, cloth sway, roar tones, run styles, and
// expressions are computed from time + seed, never read from a
// clip or a blend shape. That is the wiring consequence of the
// files as they are, stated plainly, not a gap in this module.
//
// EYES + EXPRESSIONS — METHOD (read this before promising more):
// 0 of 76 files carry morph targets, so blinking and facial
// expression CANNOT be morph-driven. The method used here is
// BONE-DRIVEN EYELIDS for rigged GLBs (eyelid-bone scale/rotation
// once the pose test maps the generic bone names) and, for the
// procedural stand-ins that still render most of the field,
// eye-mesh scale (open fraction 0..1 squashes the eye spheres).
// Expression is a bone/expression parameter set — brow tilt,
// mouth shape, eye openness — keyed by the monster's state
// (idle / fighting / talking / laughing); the GLB eyelid-bone
// mapping itself is OUTSTANDING pending the pose test, because
// 19 files use generic bone names that do not say which joints
// are eyelids. Nothing here pretends otherwise.

// ---- breathing: idle chest rise and fall (nobody stands statue-still) ----
export function breatheScale(t, seed = 0) {
  const ph = t * 1.5 + seed * 2.1; // ~4.2 s breath cycle
  const b = Math.sin(ph) * 0.5 + 0.5; // 0..1
  return { x: 1 + b * 0.012, y: 1 + b * 0.022, z: 1 + b * 0.012, breath: b };
}

// ---- blinking: eye open fraction 0..1 (1 = fully open) ----
export function blinkOpen(t, seed = 0) {
  const cycle = 4.2 + ((seed * 7) % 1.3); // 4.2–5.5 s between blinks
  const local = (t + seed * 13.7) % cycle;
  if (local < 0.12) return 0.15 + (local / 0.12) * 0.85; // opening
  if (local < 0.24) return 1 - ((local - 0.12) / 0.12) * 0.85; // closing
  return 1;
}

// ---- cloth: procedural sway on baked-in cloth regions ----
// No file carries separate cloth geometry (capes/robes are baked
// into the body mesh), so sway cannot come from separate cloth
// parts: it is a small rotational sway applied to the figure,
// standing in for wind over the baked-in cloth regions, plus a
// per-region phase value a GLB skeleton pass can apply to
// cloth-region bones once they are mapped.
export function clothSway(t, wind = 0.5, seed = 0) {
  const w = Math.max(0, Math.min(1, wind));
  return {
    swayX: Math.sin(t * 1.3 + seed) * 0.02 * (0.4 + w),
    swayZ: Math.sin(t * 0.9 + seed * 2.3) * 0.015 * (0.4 + w),
    gust: 0.4 + w + Math.sin(t * 0.23 + seed) * 0.2,
  };
}

// ---- expressions: state → bone/expression parameters ----
export function expressionFor(state) {
  const table = {
    idle: { brow: 0, mouth: 0.1, eyeOpen: 1, label: 'at rest' },
    fighting: { brow: -0.7, mouth: 0.9, eyeOpen: 0.85, label: 'snarling' },
    talking: { brow: 0.2, mouth: 0.5, eyeOpen: 1, label: 'speaking' },
    laughing: { brow: 0.5, mouth: 1, eyeOpen: 0.6, label: 'laughing' },
    hunting: { brow: -0.4, mouth: 0.7, eyeOpen: 0.95, label: 'on the hunt' },
  };
  return table[state] || table.idle;
}

// ---- run styles ----
// Characters: John Wick — urgent, tactical, leaning forward, all
// business. Monsters: NEUTRAL for now — Merlin's Hulk-style idea
// was tentative ("idk") and is NOT locked. This flag is the TBD.
export const RUN_STYLES = {
  character: { style: 'wick', leanForward: 0.22, urgency: 1, note: 'urgent, tactical, leaning forward' },
  monster: { style: 'neutral', leanForward: 0.05, urgency: 0.6, note: 'neutral placeholder — Hulk-style idea tentative, NOT locked' },
};
export const MONSTER_RUN_STYLE_TBD = true;

// ---- weapons: archetype weapons from the shared backpack/forge ----
// No batch-4 file contains a native weapon mesh or a holster
// node (true count zero — an early "ElbowShareBone" bow flag was
// a false positive). So each fighter's weapon is an ARCHETYPE
// weapon from the backpack/forge system, and draw / holster /
// swap run through the backpack's equipped-weapon slots — the
// page already toggles melee/ranged and reads equipped damage
// and reticle from lib/backpack at strike time.
export const WEAPON_BY_ARCHETYPE = {
  knight: 'sword',
  hunter: 'blaster',
  ranger: 'bow',
  wizard: 'staff',
  warrior: 'sword',
  assassin: 'dagger',
  brawler: 'fists',
};
export function weaponForArchetype(arch) {
  return WEAPON_BY_ARCHETYPE[arch] || 'sword';
}

// ---- combat: the FULL set for every fighter, never one style each ----
export const COMBAT_STYLES = ['martial-arts', 'spell-casting', 'sword-fighting', 'gun-shooting'];
export function combatStylesFor() {
  return [...COMBAT_STYLES];
}

// Deterministic 0..1 seed from any id string, for per-monster
// phase offsets (breath, blink, sway) that never change.
export function seedFor(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

// ---- relatives: kin, not single specimens ----
// Cosmetic ONLY: variants change the figure's visual scale/tint
// and the HUD name suffix. HP, damage, speed, footprint, and
// spawn counts NEVER change — balance is untouched. The variant
// is picked deterministically from the monster id, so a given
// monster keeps its kin across frames.
export const RELATIVE_VARIANTS = [
  { suffix: '', scaleMul: 1, tint: 0, label: 'prime' },
  { suffix: ' the Elder', scaleMul: 1.12, tint: -0.08, label: 'elder' },
  { suffix: ' the Younger', scaleMul: 0.78, tint: 0.1, label: 'juvenile' },
];
export function variantFor(monsterId) {
  const s = String(monsterId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return RELATIVE_VARIANTS[h % RELATIVE_VARIANTS.length];
}

// ---- roar tones: DISTINCT per monster, no two share a roar ----
// Each tone is a WebAudio recipe: base frequency, waveform, and
// length, plus the SORT.md tone sketch it came from. The test
// locks distinctness on (baseHz, waveform) across every key.
function tone(baseHz, waveform, seconds, character) {
  return { baseHz, waveform, seconds, character };
}
export const ROAR_TONES = {
  // Original 37 slots — derived from element + slot, distinct by construction.
  'slot-01': tone(72, 'sawtooth', 1.4, 'bubbling hiss, corrosive giggles (acid)'),
  'slot-21': tone(78, 'sawtooth', 1.3, 'green-lit watcher hiss (acid)'),
  'slot-27': tone(66, 'square', 1.6, 'armoured rock grind (acid)'),
  'slot-29': tone(95, 'triangle', 1.9, 'gurgling, sweet, sinister — the Drowned Bloom (batch-3 plant in whirlpool)'),
  'slot-33': tone(90, 'sawtooth', 1.7, 'many-headed churn (acid)'),
  'slot-37': tone(60, 'square', 1.9, 'drooling bulk rumble (acid)'),
  'slot-02': tone(54, 'sawtooth', 1.6, 'lava hulk bellow (fire)'),
  'slot-03': tone(58, 'square', 1.5, 'ridge tyrant roar (fire)'),
  'slot-06': tone(50, 'sawtooth', 1.7, 'spiked battering-ram bellow (fire)'),
  'slot-07': tone(62, 'triangle', 1.8, 'crowned ember king proclamation (fire)'),
  'slot-08': tone(68, 'sawtooth', 1.1, 'scald lurker lunge-snap (fire)'),
  'slot-09': tone(46, 'square', 2.1, 'sea-scorch leviathan eruption (fire)'),
  'slot-14': tone(52, 'square', 1.7, 'volcano brute charge-roar (fire)'),
  'slot-18': tone(56, 'sawtooth', 1.4, 'ember pack brute bark (fire)'),
  'slot-22': tone(64, 'triangle', 1.5, 'molten sentinel drip-roar (fire)'),
  'slot-25': tone(70, 'sawtooth', 1.0, 'flameback runner yelp (fire)'),
  'slot-30': tone(61, 'square', 1.5, 'horned ember pack chorus (fire)'),
  'slot-32': tone(74, 'triangle', 0.9, 'cinder swarm chatter (fire)'),
  'slot-34': tone(67, 'sawtooth', 1.1, 'flameback charger snort (fire)'),
  'slot-16': tone(138, 'sawtooth', 1.3, 'storm herald crackle (lightning)'),
  'slot-17': tone(128, 'square', 1.9, 'storm-cloud fiend sky-roar (lightning)'),
  'slot-19': tone(148, 'triangle', 1.2, 'volt pack leader zap-bark (lightning)'),
  'slot-20': tone(158, 'sawtooth', 1.4, 'golden storm beast show-off thunder (lightning)'),
  'slot-39': tone(122, 'square', 1.8, 'storm roarer mountain thunder (lightning)'),
  'slot-36': tone(92, 'sawtooth', 1.9, 'pustule bloater cloud-hiss (poison)'),
  'slot-38': tone(98, 'triangle', 1.5, 'violet hollow pack whisper-chorus (poison)'),
  'slot-40': tone(86, 'square', 1.7, 'violet hulk knuckle-roar (poison)'),
  'slot-11': tone(44, 'sawtooth', 1.6, 'smoke stalker creep-hiss (shadow)'),
  'slot-12': tone(48, 'triangle', 1.3, 'grinning funnel rush-laugh (shadow)'),
  'slot-26': tone(41, 'square', 1.7, 'skull smoke walker drone (shadow)'),
  'slot-35': tone(47, 'sawtooth', 1.8, 'funnel row waiting hum (shadow)'),
  'slot-43': tone(38, 'square', 2.2, 'road colossus doom-step (shadow)'),
  'slot-05': tone(82, 'sawtooth', 1.6, 'low, sandy rumbles — the Dune Lurker (batch-3 desert creature)'),
  'slot-23': tone(88, 'square', 1.5, 'sand maw vortex bite-grind (sand)'),
  'slot-24': tone(76, 'triangle', 1.7, 'sandstorm hulk advance-rumble (sand)'),
  'slot-28': tone(94, 'sawtooth', 1.4, 'sand vortex pack sweep (sand)'),
  'slot-10': tone(58, 'triangle', 2.0, 'deep, snowy bellows (frost)'),
  // Batch-4 placements — SORT.md tone sketches, verbatim in spirit.
  korus: tone(36, 'sawtooth', 2.6, 'apocalyptic, commanding, storm-throated — Korus, the ultimate boss'),
  'sky-dragon': tone(132, 'sawtooth', 1.9, 'thunder-crack roars, rain-lashed fury — Stormwing'),
  'cinder-dragon': tone(49, 'square', 2.0, 'volcanic, roaring, ember-throated — Cinder Maw'),
  'muse-dragon': tone(112, 'sine', 2.2, 'luminous, eerie, beautiful and unsettling — Muse, the Luminous'),
  // New families — SORT.md tone sketches.
  'scarab-beetle': tone(180, 'square', 1.0, 'clicking, chittering, oddly regal — Khepri'),
  'embermane-horse': tone(104, 'triangle', 1.2, 'proud snorts, warm nickers — Embermane'),
  umbrax: tone(34, 'sawtooth', 2.3, 'subsonic rumble you feel in your ribs — Umbrax'),
  aureline: tone(168, 'triangle', 1.6, 'bright, brassy, laughter like breaking light — Aureline'),
  'eagle-talon': tone(210, 'square', 0.9, 'sharp cries, imperious, secretly kind — Lib Talon'),
  oozealot: tone(63, 'sine', 1.8, 'wet, glubbing, philosophical — Sir Oozealot'),
  'fenris-warg': tone(71, 'sawtooth', 1.4, 'low growls, wind-fast howls — Fenris'),
  'frostbite-lizard': tone(57, 'triangle', 1.7, 'slow huffs, ice-cracking grumbles — Frostbite'),
  'dune-maw-2': tone(79, 'square', 1.5, 'grinding, whispering sandstorm — Dune Maw the Second'),
  vice: tone(108, 'sine', 1.6, 'smooth, sinister, purring menace — Vice'),
  wonder: tone(190, 'sine', 1.8, 'warbling, curious, gentle — the Unnamed Wonder'),
};
const ELEMENT_TONE_FALLBACK = {
  acid: tone(75, 'sawtooth', 1.4, 'acid fallback'),
  fire: tone(55, 'sawtooth', 1.5, 'fire fallback'),
  lightning: tone(140, 'sawtooth', 1.3, 'lightning fallback'),
  poison: tone(90, 'sawtooth', 1.5, 'poison fallback'),
  shadow: tone(42, 'sawtooth', 1.7, 'shadow fallback'),
  sand: tone(80, 'sawtooth', 1.5, 'sand fallback'),
  frost: tone(60, 'triangle', 1.8, 'frost fallback'),
  mountain: tone(110, 'triangle', 1.4, 'mountain fallback'),
};

export function roarToneFor(key, element) {
  if (key && ROAR_TONES[key]) return ROAR_TONES[key];
  if (element && ELEMENT_TONE_FALLBACK[element]) return ELEMENT_TONE_FALLBACK[element];
  return tone(70, 'sawtooth', 1.4, 'generic roar');
}

// Ghorrum's laugh: deep, slow, stone-rolling — not a combat roar.
export const GHORRUM_LAUGH_TONE = tone(32, 'sine', 2.8, 'deep mountain laugh, stone-rolling warmth — Ghorrum');

// ---- procedural locomotion: walk cycles + arm swing on rigged GLBs ----
// Batch-4 files carry skeletons but ZERO baked animations, so every
// step and arm swing is computed here from the monster's speed and
// phase, then applied to its bones by the zone's figure sync.
// Bone names vary (Mixamo-style chains on most files, generic Tripo
// names on the rest), so classification matches by name pattern and
// reports what it found — a rig with no matchable leg/arm bones
// falls back to whole-figure sway/bob, never a crash.
export function classifyLocomotionBones(names) {
  const list = (names || []).map((n) => String(n));
  const sideOf = (n) => {
    if (/left/i.test(n)) return 'L';
    if (/right/i.test(n)) return 'R';
    if (/(^|[._-])l$/i.test(n) || /^l[._-]/i.test(n)) return 'L';
    if (/(^|[._-])r$/i.test(n) || /^r[._-]/i.test(n)) return 'R';
    return null;
  };
  const isFoot = (n) => /foot|toe/i.test(n);
  const isFore = (n) => /forearm|fore_arm|fore-arm|lowerarm|lower_arm/i.test(n);
  const isUpperArm = (n) => /upperarm|upper_arm|upper-arm/i.test(n) || (/arm/i.test(n) && !isFore(n));
  const isThigh = (n) => /upleg|thigh|upperleg|upper_leg/i.test(n);
  const isShin = (n) => (/shin|calf|lowerleg|lower_leg/i.test(n)) || (/leg/i.test(n) && !isThigh(n) && !isFoot(n));
  const out = { thighL: null, shinL: null, thighR: null, shinR: null, armL: null, foreL: null, armR: null, foreR: null };
  const shoulder = { L: null, R: null };
  for (const n of list) {
    const side = sideOf(n);
    if (!side) continue;
    if (isFoot(n)) continue;
    if (isFore(n)) { if (!out[`fore${side}`]) out[`fore${side}`] = n; continue; }
    if (isThigh(n)) { if (!out[`thigh${side}`]) out[`thigh${side}`] = n; continue; }
    if (isShin(n)) { if (!out[`shin${side}`]) out[`shin${side}`] = n; continue; }
    if (isUpperArm(n)) { if (!out[`arm${side}`]) out[`arm${side}`] = n; continue; }
    if (/shoulder/i.test(n)) { if (!shoulder[side]) shoulder[side] = n; }
  }
  // Shoulder bones stand in for upper arms when no arm bone matched.
  for (const side of ['L', 'R']) {
    if (!out[`arm${side}`] && shoulder[side]) out[`arm${side}`] = shoulder[side];
  }
  return out;
}

// Gait pose for one frame: leg/arm swings in radians, bob in metres.
// phase advances with speed (the zone advances it); speedNorm 0..1
// scales the whole motion down to a standstill, so a monster that
// stops moving eases back to its rest pose instead of freezing
// mid-stride. Legs oppose each other; each arm opposes its
// same-side leg (natural gait). Shin bends only on the back half
// of its side's swing, never past straight.
export function locomotionPose(phase, speedNorm = 1) {
  const a = Math.max(0, Math.min(1, speedNorm));
  const s = Math.sin(phase);
  const sOpp = Math.sin(phase + Math.PI);
  return {
    thighL: s * 0.55 * a,
    thighR: sOpp * 0.55 * a,
    shinL: Math.max(0, Math.sin(phase - 1.0)) * 0.6 * a,
    shinR: Math.max(0, Math.sin(phase + Math.PI - 1.0)) * 0.6 * a,
    armL: sOpp * 0.45 * a,
    armR: s * 0.45 * a,
    foreL: Math.max(0, Math.sin(phase + Math.PI - 0.6)) * 0.3 * a,
    foreR: Math.max(0, Math.sin(phase - 0.6)) * 0.3 * a,
    bob: Math.abs(Math.cos(phase)) * 0.07 * a,
  };
}
