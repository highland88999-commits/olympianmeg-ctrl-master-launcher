// lib/partners.js — Central partner + ad-slot data for the Olympus billboard
// network. ONE source of truth: every billboard in every pocket universe
// reads from here.
//
// Verified 2026-09-29/30 from the live impact.com catalog (account MerlinAmbros,
// ID 6240385). Tracking URLs are Merlin's own affiliate links — never altered.
// Creatives: partners' graphics used as-is. `creatives[]` fills in as the
// asset harvest lands (10 per partner); until then billboards render the
// branded placeholder face generated from name + tagline.
//
// Rules (Merlin): one company per billboard, all visible simultaneously;
// creatives rotate WITHIN their billboard; billboards are monuments, not
// posters; no pop-ups, no clickbait, no predatory UX, ever. Every NEW offer
// is approved before going live. Betty is gambling: honest placement, 19+,
// play responsibly — no targeting minors, no "guaranteed win" language.

export const PARTNERS = [
  {
    key: 'margovil',
    name: 'Margovil',
    programId: 44973,
    tagline: '15% of online sale',
    terms: '15% of online sale · 30-day window',
    trackingUrl: 'https://margovil.pxf.io/PzNOEj',
    accent: '#c2255c',
    kind: 'video',
    videoSrc: '/media/margovil-promo.mp4', // Olympus-style video (generated Nov 13, 2026)
    videoUploadPath:
      'workspace/imagine_media/billboard-videos/media-generation-margovil-olympus-0-fef03b55-0af6-4f25-9d10-b0ab1831771e.mp4',
    creativeCount: 10,
    creatives: [], // harvested asset URLs land here: { imageUrl, trackingUrl, w, h }
  },
  {
    key: 'wheeltop',
    name: 'WHEELTOP',
    programId: 41066,
    tagline: '10% of US online sale',
    terms: '10% of online sale (US) · 30-day window',
    trackingUrl: 'https://globaloneclicktechnologycolimited.pxf.io/k4GOEV',
    accent: '#1971c2',
    kind: 'video',
    videoSrc: '/media/wheeltop-promo.mp4', // deploy copy of Merlin's upload
    videoUploadPath:
      'workspace/user/media_library/video/6d/6dea169622985c02b2cc3f4b96a2b2f3210be1ae67544ab1fa798769d0fad1e9.mp4',
    creativeCount: 10,
    creatives: [],
  },
  {
    key: 'openart',
    name: 'OpenArt AI',
    programId: 38572,
    tagline: '10% of online sale',
    terms: '10% of online sale · 30-day window',
    trackingUrl: 'https://openartai.pxf.io/B5onaJ',
    accent: '#7c3aed',
    kind: 'video',
    videoSrc: '/media/openart-promo.mp4', // deploy copy of Merlin's upload
    videoUploadPath:
      'workspace/user/media_library/video/95/95db904f053b30e56c596f3791fe1aeece9015be37c4a7755d4d10cae866f4e8.mp4',
    creativeCount: 10,
    creatives: [],
  },
  {
    key: 'gearup',
    name: 'GearUP',
    programId: 40222,
    tagline: '70% of paid subscriptions',
    terms: '70% of paid subscription · 30-day window',
    trackingUrl: 'https://gearup.sjv.io/L03KL0',
    accent: '#d9480f',
    kind: 'video',
    videoSrc: '/media/gearup-promo.mp4', // Olympus-style video (generated Nov 13, 2026)
    videoUploadPath:
      'workspace/imagine_media/billboard-videos/media-generation-gearup-olympus-0-ad06d28c-064a-4807-a861-3854886eeae3.mp4',
    creativeCount: 10,
    creatives: [],
  },
  {
    key: 'petscosset',
    name: 'Petscosset',
    programId: 33724,
    tagline: '12% of online sale',
    terms: '12% of online sale · 30-day window',
    trackingUrl: 'https://petscosset.pxf.io/QY3j96',
    accent: '#2f9e44',
    kind: 'video',
    videoSrc: '/media/petscosset-promo.mp4', // Olympus-style remake (generated Nov 13, 2026) — replaces Merlin's upload; the original upload file is unchanged in the media library
    videoUploadPath:
      'workspace/imagine_media/billboard-videos/media-generation-petscosset-olympus-0-65a22d76-2f81-40ef-954c-37d7cbc20790.mp4',
    creativeCount: 10,
    creatives: [],
  },
  {
    key: 'missacc',
    name: 'Missacc',
    programId: 26892,
    tagline: '10% of online sales',
    terms: '10% of online sales · 30-day window',
    trackingUrl: 'https://missacccom.pxf.io/oNq1Po',
    accent: '#e67700',
    kind: 'video',
    videoSrc: '/media/missacc-promo.mp4', // deploy copy of Merlin's upload (HEVC→H.264 + referral lower-third)
    videoUploadPath:
      'workspace/user/media_library/video/33/335e4d18530e39b87925f688237e6005ba3c55b3ecf9453947769b42281da67d.mp4',
    creativeCount: 10,
    creatives: [],
  },
  {
    key: 'helloprenup',
    name: 'HelloPrenup',
    programId: 25752,
    tagline: '$100 per prenup purchase',
    terms: '$100 per prenup purchase · 30-day window',
    trackingUrl: 'https://helloprenupinc.sjv.io/AgXPOa',
    accent: '#0c8599',
    kind: 'video',
    videoSrc: '/media/helloprenup-promo.mp4', // deploy copy of Merlin's upload (H.264 + referral lower-third)
    videoUploadPath:
      'workspace/user/media_library/video/04/04f61866e44b5c2e6b57d6577032643f1adfed153c6c02cd6578189f09594ca0.mp4',
    creativeCount: 10,
    creatives: [],
  },
];

// Merlin's own native inventory — never removed, never altered.
export const STAKE_SLOT = {
  key: 'stake',
  name: 'Stake.com',
  tagline: "Merlin's table",
  terms: 'Native inventory',
  trackingUrl: 'https://stake.com/?c=1FofAXWx',
  accent: '#1a7f5a',
  kind: 'native',
};

// Betty — real-money slots. Honest placement only.
export const BETTY_SLOT = {
  key: 'betty',
  name: 'Betty',
  tagline: 'Real-money slots · 19+ · Play responsibly',
  terms: 'Referral · 19+ only · Play responsibly',
  trackingUrl: 'https://betty.ca/join/richardnsky8g',
  referralCode: 'richardnsky8g',
  accent: '#e64980',
  kind: 'video',
  videoSrc: '/media/betty-promo.mp4', // deploy copy of Merlin's upload
  videoUploadPath:
    'workspace/user/media_library/video/a1/a18ca3359cbdcad9a983ff746540a44a166477888cb6f27225c356e7354bd959.mp4',
};

// Muse — Merlin's own referral. Personal AI agent; redeem code V0S8A7 in
// Settings within 48 hours of joining and you both get 1 billion Muse tokens.
export const MUSE_SLOT = {
  key: 'muse',
  name: 'Muse',
  tagline: 'Your personal AI agent · code V0S8A7 = 1B tokens each',
  terms: 'Referral · redeem V0S8A7 in Settings within 48h of joining',
  trackingUrl: 'https://muse.ai/join',
  referralCode: 'V0S8A7',
  accent: '#6366f1',
  kind: 'native',
};

// Unsold inventory: the YOUR AD HERE video (Nexus Vortex branded) fills every
// remaining slot. Video is generated from the prompt in the billboard spec;
// the canvas face below is the placeholder until it ships.
export const YOUR_AD_HERE_SLOTS = 3;
export const YOUR_AD_HERE = {
  key: 'your-ad-here',
  name: 'YOUR AD HERE',
  tagline: 'This monument could be yours',
  terms: 'Unsold inventory',
  trackingUrl: null, // taps open the advertise inquiry — wired when the sales surface ships
  accent: '#ffd700',
  kind: 'placeholder',
};

// Full billboard inventory in display order: 7 partners, Stake, Betty, Muse,
// then YOUR AD HERE fillers.
export function billboardInventory() {
  const slots = [
    ...PARTNERS.map((p) => ({ ...p, kind: 'partner' })),
    { ...STAKE_SLOT },
    { ...BETTY_SLOT },
    { ...MUSE_SLOT },
  ];
  for (let i = 0; i < YOUR_AD_HERE_SLOTS; i++) {
    slots.push({ ...YOUR_AD_HERE, key: `your-ad-here-${i + 1}` });
  }
  return slots;
}

// The one partner-data version string. Bump when the harvest lands.
export const PARTNERS_VERSION = '2026-09-29-harvest-pending';
