// MENU GRAPHICS — Middle-earth (Merlin, Nov 15 ~01:30).
// One distinct illustrated graphic per PART of the world, wired
// into the menus under the Swamp Run menu-dressing standard:
// illustrated art behind the buttons, everything still working
// exactly as before, NO layout change. Each pod's buttons — its
// pod card, its mission buttons, its Free Roam button — all carry
// that pod's graphic; no graphic repeats across pods. Non-part
// buttons (View the Map, Back, hero picks) carry the one neutral
// Middle-earth graphic. Generated art only — no Tripo, no paid
// assets. Assets live in public/art/middle-earth/ and ship with
// the build.
//
// Art direction (one consistent hand across all seven): painterly
// storybook illustration, warm golden light, soft brushwork,
// wide 3:1 landscape, readable at phone-button size, no text in
// the art itself.
//
// Legibility: every graphic is laid under a dark gradient overlay
// (see graphicStyle) and the button text keeps a soft shadow, so
// the cream labels read on a small phone in bright light — the
// dark pods (Mirkwood, Mordor) and the bright ones (Shire,
// Gondor) alike. The one exception is the gold "View the Map"
// primary button, whose dark-on-gold text becomes cream text
// over the photo — see the call site in page.jsx.

export const MENU_GRAPHICS = {
  shire: '/art/middle-earth/shire.jpg',
  rivendell: '/art/middle-earth/rivendell.jpg',
  rohan: '/art/middle-earth/rohan.jpg',
  gondor: '/art/middle-earth/gondor.jpg',
  mirkwood: '/art/middle-earth/mirkwood.jpg',
  mordor: '/art/middle-earth/mordor.jpg',
};

/* The neutral graphic: misty mountains at dawn with a winding
 * road — a journey scene that belongs to no single pod. */
export const NEUTRAL_GRAPHIC = '/art/middle-earth/middle-earth.jpg';

/* The asset for a pod id, falling back to the neutral graphic
 * for any unknown id so a button never renders imageless. */
export function graphicForPod(podId) {
  return MENU_GRAPHICS[podId] || NEUTRAL_GRAPHIC;
}

/* Inline-style fragment: the art as a cover background under a
 * dark gradient scrim, plus a text shadow so the label reads.
 * Spread AFTER the button's base style — the longhand
 * backgroundImage wins over any background shorthand in the base
 * (e.g. podCardMain's 'none', missionBtn's tint) without touching
 * its padding, border, radius, or layout. strength is the scrim
 * darkness (0.55 default — enough for cream text on the brightest
 * art, light enough that the scene still shows). */
export function graphicStyle(url, strength = 0.55) {
  const s = Math.max(0, Math.min(0.85, strength));
  return {
    backgroundImage: `linear-gradient(rgba(10,12,8,${s}), rgba(10,12,8,${s})), url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    textShadow: '0 1px 4px rgba(0,0,0,0.85)',
  };
}

/* A pod's buttons: pod card, mission buttons, Free Roam. */
export function podGraphic(podId) {
  return graphicStyle(graphicForPod(podId));
}

/* Non-part buttons: View the Map, Back, hero picks. */
export function neutralGraphic() {
  return graphicStyle(NEUTRAL_GRAPHIC);
}

export default { MENU_GRAPHICS, NEUTRAL_GRAPHIC, graphicForPod, graphicStyle, podGraphic, neutralGraphic };
