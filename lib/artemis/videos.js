// lib/artemis/videos.js
//
// Canonical video links for the ARTEMIS pocket universe.
//
// Merlin's rule: these URLs stay VERBATIM — exactly as they appear in his
// original repos (Architect-Artemis, artemis-hub, artemis-os). They are never
// replaced with self-hosted copies and never stripped.
//
// Resolution check 2026-10-01 (HEAD / ranged GET):
//   200 OK — ks3oum.mp4, tuw4of.mp4, juj3w9.mov, file.garden 69CBAF0E.mp4,
//            5xh10y.mp4, f21cnc.mov, unsplash photo-1614850523296
//   DEAD   — pixabay 85732-590457611_tiny.mp4 (404), pixabay 185834-876615024_tiny.mp4 (404),
//            unsplash photo-1635326445090-67f139618175 (404 poster)
// Dead sources stay in place per his verbatim rule; each <video> carries a
// poster/fallback so a dead source degrades to a still frame, never a hole.

export const ARTEMIS_VIDEOS = {
  // Architect-Artemis — oracle experience
  landing: 'https://files.catbox.moe/ks3oum.mp4', // hero background, landing screen
  oracleCircle: 'https://files.catbox.moe/tuw4of.mp4', // rotating oracle circle
  forge: 'https://files.catbox.moe/juj3w9.mov', // forge visual loop
  holoBg: 'https://file.garden/alXjUY_coXedLaNA/gemini_generated_video_69CBAF0E.mp4', // holo panel bg

  // artemis-hub — APEX HERITAGE OS
  boot: 'https://files.catbox.moe/5xh10y.mp4', // boot screen
  desktopBg: 'https://files.catbox.moe/f21cnc.mov', // desktop background
  authBg: 'https://cdn.pixabay.com/video/2021/08/20/85732-590457611_tiny.mp4', // auth wallpaper (dead 2026-10-01; kept verbatim)
  authPoster: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop',
  desktopPoster: 'https://images.unsplash.com/photo-1635326445090-67f139618175?q=80&w=2070&auto=format&fit=crop', // dead 2026-10-01; kept verbatim

  // artemis-os — NOVA mode
  novaBg: 'https://cdn.pixabay.com/video/2023/10/20/185834-876615024_tiny.mp4', // NOVA wallpaper (dead 2026-10-01; kept verbatim)
  linuxBg: 'https://cdn.pixabay.com/video/2021/08/20/85732-590457611_tiny.mp4', // LINUX wallpaper (dead 2026-10-01; kept verbatim)
};

// Merlin's ecosystem deployments — the oracle's nav HUD links.
// Kept verbatim; these are his live programs, linked not copied.
export const ECOSYSTEM_APPS = [
  { name: 'Architect', url: 'https://architect-artemis-merlin-ambros-projects.vercel.app/' },
  { name: 'Meet The Gods', url: 'https://meet-the-gods.vercel.app/' },
  { name: 'Georgia Aquarium', url: 'https://georgia-aquarium.vercel.app/' },
  { name: 'Colossus XI', url: 'https://colossus-xi.vercel.app/' },
  { name: 'Olympus LAC', url: 'https://olympus-lac.vercel.app/' },
  { name: 'Valkyries', url: 'https://valkyries-of-olympus.vercel.app/' },
  { name: 'Persymphony', url: 'https://persymphony.vercel.app/' },
  { name: 'Olympus Social', url: 'https://olympus-social.vercel.app/' },
  { name: 'Fortress of Solitude', url: 'https://fortress-of-solitude.vercel.app/' },
  { name: 'Sanctuary', url: 'https://medusas-lair.vercel.app/' },
  { name: 'Hermes Landing', url: 'https://hermes-landing-nu.vercel.app/' },
  { name: 'R.E.M.', url: 'https://rem-psi-mauve.vercel.app/' },
  { name: 'Flying Dutchman', url: 'https://the-flying-dutchman.vercel.app/' },
  { name: 'Light Particle Engine', url: 'https://light-particle-engine.vercel.app/' },
  { name: 'BC-1', url: 'https://bc-1-nine.vercel.app/' },
  { name: 'Blueprint Protocol', url: 'https://olympus-blueprint-protocol.vercel.app/' },
  { name: 'Magic Mirror', url: 'https://magic-mirror-puce.vercel.app/' },
  { name: 'Alexandria', url: 'https://alexandria-gules-seven.vercel.app/' },
  { name: 'Olympus B2B', url: 'https://olympus-b2-b.vercel.app/' },
  { name: 'The Big Bang', url: 'https://the-big-bang-teal.vercel.app/' },
  { name: 'Multiverse Tracker', url: 'https://multiverse-tracker-api.vercel.app/' },
];
