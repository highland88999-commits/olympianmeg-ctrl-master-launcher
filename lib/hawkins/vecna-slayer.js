// Vecna Slayer milestone achievements (Hawkins: Hunt For Vecna).
// Each milestone is awarded once, ever, to a single slayer. All milestones
// earn the SAME video: one legendary Vecna Slayer film. The video prompt is
// a unique collectible — the slayer can keep it or sell it.

export const VECNA_SLAYER_VIDEO_PROMPT =
  'Cinematic 10-second AI video, 16:9. A girl with a close-cropped buzz cut stands at the center of Hawkins at dusk, blood trickling from her nose, her hand outstretched in psychokinetic focus. Behind her swirls the town portal — a tower of violet light at the central intersection. The sky splits: warm amber sunset over quiet streets and the water tower on one side, the Upside Down\'s storm of floating rock and black lightning on the other. A cracked grandfather clock drifts through the rift, its hands spinning backward. Threads of golden light stream from her palm, stitching the tear in reality closed. The clock shatters into glowing embers that rise like fireflies over the town, and ghostly tally marks ignite across the sky — one for every Vecna sealed. Volumetric light, film grain, mythic and solemn. Title card feel: "VECNA SLAYER".';

export const VECNA_MILESTONES = {
  first: {
    killNumber: 1,
    title: '1st Vecna Slayer',
    videoPrompt: VECNA_SLAYER_VIDEO_PROMPT,
  },
  '100th': {
    killNumber: 100,
    title: '100th Vecna Slayer',
    videoPrompt: VECNA_SLAYER_VIDEO_PROMPT,
  },
  '1000th': {
    killNumber: 1000,
    title: '1000th Vecna Slayer',
    videoPrompt: VECNA_SLAYER_VIDEO_PROMPT,
  },
  't-1000': {
    killNumber: 1000000,
    title: '1,000,000th Vecna Slayer T-1000',
    videoPrompt: VECNA_SLAYER_VIDEO_PROMPT,
  },
};

// Returns the milestone key awarded for a given global kill number, or null.
export function milestoneForKillNumber(n) {
  for (const [key, m] of Object.entries(VECNA_MILESTONES)) {
    if (m.killNumber === n) return key;
  }
  return null;
}
