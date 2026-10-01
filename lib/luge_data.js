// Hull-wrap provenance (authenticity rule: no unlabeled simulations).
//
// The authoritative sled designs live in the original GitHub repo
// highland88999-commits/Luge-Refuge, src/bobsleds/*.py — each file paints
// its sled's livery in pygame: a hull base color plus signature motifs
// (e.g. Neon Phantom's phantom-white hull + neon-pink eyes, Street
// Samurai's blade-silver hull + red 侍 runes).
//
// That repo ships NO image assets, so every hull-*.webp here is a wrap
// created to match the OG description — none is a screenshot or rip of
// an "original" texture:
//   - 25 wraps: pre-existing generated wraps whose base color + motifs
//     match the OG pygame livery (verified against the OG sources
//     2026-09-29; left untouched).
//   - 3 wraps: RECREATED from the OG descriptions 2026-09-29 (their base
//     hull color contradicted the OG livery, so the procedural placeholders
//     were retired and the wraps regenerated to the masterpiece bar):
//       hull-g2.webp  (Urban Glider)  — OG is COMPOSITE_GRAY (128,128,128)
//         with adaptive fins + neon underglow; wrap renders composite-grey
//         metal with diagonal fin plates and magenta underglow smoke.
//       hull-p3.webp  (Street Samurai) — OG is BLADE_SILVER (192,192,192)
//         with red samurai runes + green edges; wrap renders blade-silver
//         steel with crimson rune-like smoke and a green blade-edge glow.
//       hull-p11.webp (Rift Marauder) — OG is RIFT_GRAY (100,100,100)
//         with violet vortex emitters; wrap renders rift-grey torn open by
//         violet vortex spirals and glowing emitter cores.
//     Regenerated 2026-09-29 via the media image pipeline (the earlier
//     scripts/gen-luge-wraps.py procedurals were retired).
//     These three are recreations-from-description, not OG assets.
export const LUGE_COURSES = [
  { id: 1, name: "Neon Descent Alley", desc: "Beginner straight slope in cyberpunk megacity", bg: "#0a0a14", track: "#00ff00", length: 900, turns: 0, drop: 20, texture: "/luge/textures/IMG_3169.jpeg" },
  { id: 2, name: "Holo-Curve Boulevard", desc: "Beginner curve in neon megacity underbelly", bg: "#0a0a14", track: "#00ff00", length: 1200, turns: 1, drop: 30, texture: "/luge/textures/IMG_3172.jpeg" },
  { id: 3, name: "Binary Switchback Sprawl", desc: "Novice switchbacks in dystopian mid-level", bg: "#0a0a14", track: "#00ff00", length: 1500, turns: 2, drop: 40, texture: "/luge/textures/IMG_3173.jpeg" },
  { id: 4, name: "Quantum Drop Shaft", desc: "Novice drop in cybernetic hive-city shafts", bg: "#0a0a14", track: "#00ff00", length: 1800, turns: 2, drop: 50, texture: "/luge/textures/IMG_3174.jpeg" },
  { id: 5, name: "Synth-Serpentine Nexus", desc: "Intermediate S-curves in neural grid heart", bg: "#0a0a14", track: "#00ff00", length: 2100, turns: 3, drop: 60, texture: "/luge/textures/IMG_3176.jpeg" },
  { id: 6, name: "Augmented Hump Labyrinth", desc: "Intermediate humps in fractured skyline", bg: "#0a0a14", track: "#00ff00", length: 2400, turns: 4, drop: 70, texture: "/luge/textures/IMG_3177.jpeg" },
  { id: 7, name: "Cyber-Bank Helix", desc: "Intermediate banks in corporate financial spire", bg: "#0a0a14", track: "#00ff00", length: 2700, turns: 5, drop: 80, texture: "/luge/textures/IMG_3178.jpeg" },
  { id: 8, name: "Neon Chicane Underpass", desc: "Advanced beginner chicane in shadowed highways", bg: "#0a0a14", track: "#00ff00", length: 3000, turns: 6, drop: 90, texture: "/luge/textures/IMG_3179.jpeg" },
  { id: 9, name: "Plasma Steep Ravine", desc: "Advanced steep plunge in abyssal ravines", bg: "#0a0a14", track: "#00ff00", length: 3300, turns: 7, drop: 100, texture: "/luge/textures/IMG_3180.jpeg" },
  { id: 10, name: "Strata Cascade Descent", desc: "Advanced tiered drops in stratified layers", bg: "#0a0a14", track: "#00ff00", length: 3600, turns: 8, drop: 110, texture: "/luge/textures/IMG_3181.jpeg" },
  { id: 11, name: "Data Labyrinth Vortex", desc: "Expert beginner maze in data vaults core", bg: "#0a0a14", track: "#00ff00", length: 3900, turns: 10, drop: 120, texture: "/luge/textures/IMG_3182.jpeg" },
  { id: 12, name: "Aero-Tunnel Gale", desc: "Expert wind tunnels in megacity undergrid", bg: "#0a0a14", track: "#00ff00", length: 4200, turns: 11, drop: 130, texture: "/luge/textures/IMG_3183.jpeg" },
  { id: 13, name: "Plasma Storm", desc: "Expert spiral in plasma-charged storm conduits", bg: "#0a0a14", track: "#00ff00", length: 4500, turns: 12, drop: 140, texture: "/luge/textures/IMG_3184.jpeg" },
  { id: 14, name: "Quantum Rift Gauntlet", desc: "Expert gauntlet in unstable quantum rifts", bg: "#0a0a14", track: "#00ff00", length: 4800, turns: 13, drop: 150, texture: "/luge/textures/IMG_3185.jpeg" },
  { id: 15, name: "Neural Overload", desc: "Elite plunge in neural highways network", bg: "#0a0a14", track: "#00ff00", length: 5100, turns: 14, drop: 160, texture: "/luge/textures/IMG_3186.jpeg" },
  { id: 16, name: "Void Cascade", desc: "Elite combo in subspace voids cascade", bg: "#0a0a14", track: "#00ff00", length: 5400, turns: 16, drop: 170, texture: "/luge/textures/IMG_3187.jpeg" },
  { id: 17, name: "Quantum Rift Endurance", desc: "Elite endurance in expansive quantum rifts", bg: "#0a0a14", track: "#00ff00", length: 5700, turns: 17, drop: 180, texture: "/luge/textures/IMG_3188.jpeg" },
  { id: 18, name: "Neural Overload Asymmetric", desc: "Master asymmetry in shadow neural labyrinths", bg: "#0a0a14", track: "#00ff00", length: 6000, turns: 18, drop: 190, texture: "/luge/textures/IMG_3189.jpeg" },
  { id: 19, name: "Entropy Cascade", desc: "Master jumps in chaotic entropy cascades", bg: "#0a0a14", track: "#00ff00", length: 6300, turns: 19, drop: 200, texture: "/luge/textures/IMG_3190.jpeg" },
  { id: 20, name: "Quantum Rift Ultimatum", desc: "Master gauntlet in fracturing quantum rift", bg: "#0a0a14", track: "#00ff00", length: 6600, turns: 20, drop: 210, texture: "/luge/textures/IMG_3194.jpeg" }
];

// Sled physics stats (Merlin 2026-09-30): premium sleds earn their price.
// sandResist 0..0.9 — fraction of sand-patch drag the hull shrugs off
//   (sand drag is multiplied by (1 - sandResist)).
// boostGain >= 1.0 — multiplier on speed-up zone acceleration.
// Base sleds ride 0 / 1.0. Premium sleds scale up in tiers by hull number:
//   p1-p5:   0.10 / 1.10   p6-p10:  0.20 / 1.20   p11-p15: 0.30 / 1.35
//   p16-p20: 0.45 / 1.50   p21-p25: 0.60 / 1.70   p26:      0.75 / 2.00
// Top speed NEVER changes: the client clamps every sled to the same
// baseMaxSpeed * 1.5, so boosts only reach the ceiling faster — the server
// anti-cheat floor in lib/luge/logic.js stays valid for every sled.
export const LUGE_SLEDS = [
  { id: 'g1', name: "Standard Racer", type: "generic", color: "#a9a9a9", accent: "#00ffff", desc: "Balanced racing", hull: "/textures/luge/hull-g1.webp", sandResist: 0, boostGain: 1.0 },
  { id: 'g2', hull: "/textures/luge/hull-g2.webp", name: "Urban Glider", type: "generic", color: "#808080", accent: "#ff00ff", desc: "Urban navigation", sandResist: 0, boostGain: 1.0 },
  { id: 'p1', name: "Neon Phantom", type: "premium", color: "#ffffff", accent: "#00ffff", desc: "Ghostly trails +5% evasion", hull: "/textures/luge/hull-p1.webp", sandResist: 0.1, boostGain: 1.1 },
  { id: 'p2', name: "Grid Runner", type: "premium", color: "#00c800", accent: "#ffff00", desc: "Circuit pulses +8 km/h straights", hull: "/textures/luge/hull-p2.webp", sandResist: 0.1, boostGain: 1.1 },
  { id: 'p3', name: "Street Samurai", type: "premium", color: "#c0c0c0", accent: "#00ff00", desc: "Blade grip on jagged +10 km/h", hull: "/textures/luge/hull-p3.webp", sandResist: 0.1, boostGain: 1.1 },
  { id: 'p4', hull: "/textures/luge/hull-p4.webp", name: "Hacker's Glide", type: "premium", color: "#000000", accent: "#00ff00", desc: "Wind resistance cut +10 km/h", sandResist: 0.1, boostGain: 1.1 },
  { id: 'p5', hull: "/textures/luge/hull-p5.webp", name: "Dysto Drifter", type: "premium", color: "#8b4513", accent: "#ff00ff", desc: "Scrap endurance +10 km/h flats", sandResist: 0.1, boostGain: 1.1 },
  { id: 'p6', hull: "/textures/luge/hull-p6.webp", name: "Plasma Fury", type: "premium", color: "#ff4500", accent: "#ffff00", desc: "Plasma vents +10 km/h plunges", sandResist: 0.2, boostGain: 1.2 },
  { id: 'p7', hull: "/textures/luge/hull-p7.webp", name: "Void Whisper", type: "premium", color: "#000000", accent: "#8000ff", desc: "Shadow stability +12 km/h jumps", sandResist: 0.2, boostGain: 1.2 },
  { id: 'p8', hull: "/textures/luge/hull-p8.webp", name: "AI Overlord", type: "premium", color: "#646464", accent: "#ff0000", desc: "Laser targeting stabilization", sandResist: 0.2, boostGain: 1.2 },
  { id: 'p9', hull: "/textures/luge/hull-p9.webp", name: "Cyber Zeus", type: "premium", color: "#ffd700", accent: "#00bfff", desc: "Lightning surges +12 km/h storms", sandResist: 0.2, boostGain: 1.2 },
  { id: 'p10', hull: "/textures/luge/hull-p10.webp", name: "Neural Nightmare", type: "premium", color: "#8b0000", accent: "#00ff00", desc: "Neural glitches +10 km/h chaotic", sandResist: 0.2, boostGain: 1.2 },
  { id: 'p11', hull: "/textures/luge/hull-p11.webp", name: "Rift Marauder", type: "premium", color: "#646464", accent: "#800080", desc: "Rift absorption +11 km/h distorted", sandResist: 0.3, boostGain: 1.35 },
  { id: 'p12', hull: "/textures/luge/hull-p12.webp", name: "Mech Titan", type: "premium", color: "#505050", accent: "#ffff00", desc: "Armor shifts +15% chaos durability", sandResist: 0.3, boostGain: 1.35 },
  { id: 'p13', hull: "/textures/luge/hull-p13.webp", name: "Holo Mirage", type: "premium", color: "#ff00ff", accent: "#00ffff", desc: "Holo clones +10 km/h crowded", sandResist: 0.3, boostGain: 1.35 },
  { id: 'p14', hull: "/textures/luge/hull-p14.webp", name: "Entropy Beast", type: "premium", color: "#141414", accent: "#800080", desc: "Chaos swirls random grip boosts", sandResist: 0.3, boostGain: 1.35 },
  { id: 'p15', hull: "/textures/luge/hull-p15.webp", name: "Mega Hermes", type: "premium", color: "#c0c0c0", accent: "#ffd700", desc: "Winged fins +14 km/h wind", sandResist: 0.3, boostGain: 1.35 },
  { id: 'p16', hull: "/textures/luge/hull-p16.webp", name: "Quantum Leviathan", type: "premium", color: "#0080ff", accent: "#c800ff", desc: "Quantum shields +20 km/h spirals", sandResist: 0.45, boostGain: 1.5 },
  { id: 'p17', name: "Bio-Fusion Predator", type: "premium", color: "#008000", accent: "#8b0000", desc: "Tendril healing +15 km/h damaged", hull: "/textures/luge/hull-p17.webp", sandResist: 0.45, boostGain: 1.5 },
  { id: 'p18', hull: "/textures/luge/hull-p18.webp", name: "Ares Warlord", type: "premium", color: "#8b0000", accent: "#ffa500", desc: "Weapon motifs +18 km/h turns", sandResist: 0.45, boostGain: 1.5 },
  { id: 'p19', hull: "/textures/luge/hull-p19.webp", name: "Stellar Vortex", type: "premium", color: "#000014", accent: "#800080", desc: "Star glow +15 km/h jumps", sandResist: 0.45, boostGain: 1.5 },
  { id: 'p20', hull: "/textures/luge/hull-p20.webp", name: "Chrono Phantom", type: "premium", color: "#969696", accent: "#0080ff", desc: "Timeline echoes time-slow precision", sandResist: 0.45, boostGain: 1.5 },
  { id: 'p21', hull: "/textures/luge/hull-p21.webp", name: "Olympus Eternal", type: "premium", color: "#ffd700", accent: "#0080ff", desc: "God armor all-terrain mastery", sandResist: 0.6, boostGain: 1.7 },
  { id: 'p22', hull: "/textures/luge/hull-p22.webp", name: "Abyss Sovereign", type: "premium", color: "#000000", accent: "#4b0082", desc: "Tentacle thrust +18 km/h plunges", sandResist: 0.6, boostGain: 1.7 },
  { id: 'p23', hull: "/textures/luge/hull-p23.webp", name: "Neural Sovereign", type: "premium", color: "#800080", accent: "#0080ff", desc: "Mind auras asymmetry correction", sandResist: 0.6, boostGain: 1.7 },
  { id: 'p24', hull: "/textures/luge/hull-p24.webp", name: "Entropy Emperor", type: "premium", color: "#141414", accent: "#ffd700", desc: "Crown chaos full distortion immunity", sandResist: 0.6, boostGain: 1.7 },
  { id: 'p25', hull: "/textures/luge/hull-p25.webp", name: "Multiversal Odin", type: "premium", color: "#646464", accent: "#0080ff", desc: "Wisdom eye path highlights", sandResist: 0.6, boostGain: 1.7 },
  { id: 'p26', name: "Merlin's Apex", type: "premium", color: "#800080", accent: "#ffd700", desc: "Cyber-magic fusion supreme stats", hull: "/textures/luge/hull-p26.webp", sandResist: 0.75, boostGain: 2.0 }
];

// Derived dynamically — never hardcode the premium count. If sleds are
// added or removed above, every consumer (store, podium, claim API) follows.
export const LUGE_PREMIUM_IDS = LUGE_SLEDS.filter((s) => s.type === 'premium').map((s) => s.id);
export const LUGE_PREMIUM_COUNT = LUGE_PREMIUM_IDS.length;


