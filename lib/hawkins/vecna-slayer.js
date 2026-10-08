// Vecna Slayer milestone achievements (Hawkins: Hunt For Vecna).
// Each milestone is awarded once, ever, to a single slayer. The video prompt
// is a unique collectible: the slayer can keep it or sell it.

export const VECNA_MILESTONES = {
  first: {
    killNumber: 1,
    title: '1st Vecna Slayer',
    videoPrompt:
      'Cinematic 10-second AI video, 16:9. A lone figure stands in the center of a small midwestern town at dusk, facing a towering tear in reality pulsing with violet light — a girl with a close-cropped buzz cut, blood trickling from her nose, her hand outstretched in psychokinetic focus. The sky splits: one half warm amber sunset over quiet streets and a water tower, the other half a storm-wracked nightmare of floating rock and black lightning. A grandfather clock drifts, cracked, through the rift as its hands spin backward. Threads of golden light stream from her palm, stitching the tear closed. Final frame: the clock shatters into glowing embers that rise like fireflies over the town. Volumetric light, film grain, epic and solemn. Title card feel: "THE FIRST SEAL".',
  },
  '100th': {
    killNumber: 100,
    title: '100th Vecna Slayer',
    videoPrompt:
      'Cinematic 10-second AI video, 16:9. Night ride through Hawkins on a bicycle, headlight cutting the dark, pursued by a shrieking flock of demo-bats — the rider is a girl with a buzz cut, nose bleeding, pedaling with psychokinetic fury as street signs bend behind her. She skids to a stop at the town portal, a swirling column of purple energy at the central intersection. Ninety-nine ghostly tally marks burn in the air behind her like constellations. She dismounts, walks into the light, and the bats scatter. Slow motion, anamorphic lens flare, deep synth-wave grade. Title card feel: "THE HUNDREDTH HUNT".',
  },
  '1000th': {
    killNumber: 1000,
    title: '1000th Vecna Slayer',
    videoPrompt:
      'Cinematic 10-second AI video, 16:9. The Upside Down battlefield after the final convergence: a colossal Mind Flayer silhouette dissolving into ash above a ruined Hawkins. A warrior stands on the water tower, cloak snapping in the spore-wind — a girl with a buzz cut, blood on her upper lip, holding a sealed grandfather clock whose face reads midnight, her other hand crackling with psychokinetic light. Below, a thousand points of light rise — one for every Vecna sealed before. She hurls the clock into the collapsing portal; it detonates in a silent bloom of white-gold light that washes the whole frame. IMAX scale, mythic, triumphant. Title card feel: "THE THOUSANDTH SEAL".',
  },
  't-1000': {
    killNumber: 1000000,
    title: '1,000,000th Vecna Slayer T-1000',
    videoPrompt:
      'Cinematic 10-second AI video, 16:9. A chrome figure walks out of a wall of television static into a perfected Hawkins — every streetlamp lit, every window warm, children riding bikes under a clean blue dusk. Behind the figure, the Upside Down folds in on itself like a closing book, its last light a single violet ember the figure catches and crushes into diamond dust. The figure turns to camera: mercury ripples across its face, resolving — for just a heartbeat — into the face of a girl with a buzz cut and a nosebleed, smiling, before settling back to chrome calm. A million tally marks ignite across the sky as a new constellation. Flawless, inevitable, machine-grace. Title card feel: "VECNA SLAYER T-1000".',
  },
};

// Returns the milestone key awarded for a given global kill number, or null.
export function milestoneForKillNumber(n) {
  for (const [key, m] of Object.entries(VECNA_MILESTONES)) {
    if (m.killNumber === n) return key;
  }
  return null;
}
