// OLYMPIAN MONSTERVERSE — menu orb faces + one-frame layout budget
// (Merlin, Nov 16, 2026 — the hunter-pick + missions-map orb rework).
//
// THE PICK IS THE ORB: every pick on the two start screens is a
// circle orb wearing that pick's own graphic, no words (the orb
// law). The faces are drawn by scripts/gen-hero-orb-art.py in the
// TRON house style (near-black disc, neon ring, one bold centered
// symbol) and registered as ORB_FUNCTIONS keys in
// components/world/OrbButton.jsx — the one shared orb mechanism,
// no per-screen orb logic. This module is the pure, testable half:
//   * the hero/cluster/mission -> fn/art maps (page.jsx wears them
//     through <OrbButton fn={...}>; tests pin that every hero,
//     cluster and mission has a face, that the file exists on disk,
//     and that ORB_FUNCTIONS registers the same art path),
//   * the stacked-height budget for both screens, in the same
//     numbers the page's inline styles use — so the "fits in one
//     frame" claim is computed from the real layout, not asserted.
//
// WHY THE OLD MENU OVERFLOWED (the Wave 1 322 px measurement was
// wrong): it measured the menu WITHOUT the banner. The banner
// image is a SQUARE 1080x1080 poster (and the fallback <img>), so
// at 390 px wide it renders ~390 px tall on its own — banner +
// the rest was ~800 px, past any phone frame. The fix caps the
// banner at BANNER_H with object-fit cover, and the budget below
// counts every row. Viewport: Merlin's phone is 390 wide; the
// budget is checked against VISIBLE_H (700 px — an 844 px tall
// phone with the browser chrome up) as well as the full 844, so
// the menu fits even while the URL bar is showing.
import { HERO_ORDER } from './characters.js';
import { CLUSTERS, CLUSTER_ORDER } from './data.js';

export const UI_DIR = '/images/shadow-realm/ui/';

// --- face maps: pick key -> ORB_FUNCTIONS key / art path -----------
export const HERO_ORB_FN = {
  'monster-hunter': 'hero-monster-hunter',
  wizard: 'hero-wizard',
  ranger: 'hero-ranger',
  'elf-archer': 'hero-elf-archer',
  dwarf: 'hero-dwarf',
  halfling: 'hero-halfling',
};

export const CLUSTER_ORB_FN = {
  wilds: 'cluster-wilds',
  stormlands: 'cluster-stormlands',
  'dark-reaches': 'cluster-dark-reaches',
};

// Mission id -> fn suffix (the full fn is `mission-<suffix>`).
export const MISSION_ORB_FN = {
  'wilds-ooze-crossing': 'mission-ooze-crossing',
  'wilds-mire-hunt': 'mission-mire-hunt',
  'stormlands-pylon-run': 'mission-pylon-run',
  'stormlands-storm-hunt': 'mission-storm-hunt',
  'dark-wreck-field': 'mission-wreck-field',
  'dark-gloom-hunt': 'mission-gloom-hunt',
  'dark-korus-approach': 'mission-throne-road',
};

export function heroOrbFn(key) {
  return HERO_ORB_FN[key] || HERO_ORB_FN['monster-hunter'];
}
export function clusterOrbFn(clusterId) {
  return CLUSTER_ORB_FN[clusterId] || CLUSTER_ORB_FN.wilds;
}
export function missionOrbFn(missionId) {
  return MISSION_ORB_FN[missionId] || 'mission';
}
export function orbArt(fn) {
  return `${UI_DIR}tron-${fn}.webp`;
}
export function heroOrbArt(key) {
  return orbArt(heroOrbFn(key));
}
export function clusterOrbArt(clusterId) {
  return orbArt(clusterOrbFn(clusterId));
}
export function missionOrbArt(missionId) {
  return orbArt(missionOrbFn(missionId));
}

// Every pick that exists must have a face. (A missing face falls
// back to the caller's text in OrbFace — the orb law forbids bare
// text picks, so a gap here is a hard failure, not a fallback.)
export function missingFaces() {
  const missing = [];
  for (const key of HERO_ORDER) if (!HERO_ORB_FN[key]) missing.push(`hero:${key}`);
  for (const cid of CLUSTER_ORDER) if (!CLUSTER_ORB_FN[cid]) missing.push(`cluster:${cid}`);
  for (const cid of CLUSTER_ORDER) {
    for (const m of CLUSTERS[cid].missions) {
      if (!MISSION_ORB_FN[m.id]) missing.push(`mission:${m.id}`);
    }
  }
  return missing;
}

// --- one-frame layout budget (px, 390 px wide phone) ----------------
// Each row's number INCLUDES its margins/padding, and the page's
// inline styles use these same values — the stack total below is
// the real rendered height (text is single-line with ellipsis
// where the budget counts one line; mission text is budgeted at
// two lines, the campaign box at two lines).
export const PHONE_VIEWPORT = { width: 390, height: 844, visibleHeight: 700 };

export const MENU_LAYOUT = {
  padTop: 8,
  padBottom: 8,
  kicker: 15, // 12 px font, one line
  title: 34, // 24 px title, line-height 1.15, + 3 px margins each side
  banner: 150, // capped height (was: full-width square poster ~390 px)
  bannerGap: 6, // margins under the banner
  tagline: 15, // 12 px, one line
  pickTitle: 22, // "Choose your hunter", 15 px + 4 px top margin
  pickSub: 19, // one short line, 11 px + 5 px bottom margin
  orbs: 52, // one row of 6 hero orbs, 52 px (wraps to 2 rows at 320 px)
  orbsGap: 7, // 0.4 rem top margin on the orb row
  detail: 81, // detail strip, worst case: name + stats + blurb + trait
  detailGap: 6,
  enter: 34, // Enter pill, 8 px padding + 15 px text
  enterGap: 8,
  // At 320 px wide the 6 orbs wrap to two rows of three: +52 px.
  orbsWrapExtra: 52,
};

export const MAP_LAYOUT = {
  padTop: 8,
  padBottom: 8,
  backLink: 15, // "← Hunters", 13 px
  title: 24, // 18 px title + 2 px margins each side
  entering: 15, // "Entering as …", 12 px, one line
  campaign: 60, // up to 3 lines at 13 px (the Korus-gate line can wrap) + padding
  campaignGap: 8,
  clusterPad: 15, // 7 px padding top + bottom, rounded up
  clusterHeader: 40, // cluster orb 40 px + name/count line
  clusterBlurb: 17, // one line, 12 px, ellipsis + 2 px top margin
  missionRow: 40, // mission orb 36 px + 4 px top margin (text: 2 lines max)
  clusterGap: 8, // margin under each cluster card
};

export function menuStackHeight(layout = MENU_LAYOUT) {
  return layout.padTop + layout.kicker + layout.title + layout.banner
    + layout.bannerGap + layout.tagline + layout.pickTitle + layout.pickSub
    + layout.orbs + layout.orbsGap + layout.detail + layout.detailGap
    + layout.enter + layout.enterGap + layout.padBottom;
}

export function mapStackHeight(layout = MAP_LAYOUT) {
  let total = layout.padTop + layout.backLink + layout.title + layout.entering
    + layout.campaign + layout.campaignGap + layout.padBottom;
  for (const cid of CLUSTER_ORDER) {
    const c = CLUSTERS[cid];
    total += layout.clusterPad + layout.clusterHeader + layout.clusterBlurb
      + c.missions.length * layout.missionRow + layout.clusterGap;
  }
  return total;
}

// True when the whole screen fits in one frame with no scroll —
// checked against the visible height (browser chrome up), not
// just the full device height.
export function menuFitsOneFrame(layout = MENU_LAYOUT, viewport = PHONE_VIEWPORT) {
  return menuStackHeight(layout) <= viewport.visibleHeight;
}
export function mapFitsOneFrame(layout = MAP_LAYOUT, viewport = PHONE_VIEWPORT) {
  return mapStackHeight(layout) <= viewport.visibleHeight;
}
