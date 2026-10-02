// app/shadow-realm/launch.js — the realm's public entry surface.
//
// HOW THE HUB LINKS THE BIKE-MOUNT INTO THE REALM (proposal for the
// coordinator):
//   import { fx } from '@/lib/fx';
//   import { shadowRealmUrl } from '@/app/shadow-realm/launch';
//   fx.bikeMount();                                   // engine-up sweep + haptics
//   launchPocketUniverse(shadowRealmUrl('race'), 'shadow-realm', null, null);
// or, without the launcher's orbit animation:
//   router.push(shadowRealmUrl('roam'));
//
// Modes: 'race' (default) and 'roam'. Unknown values fall back to 'race'.

export const SHADOW_REALM_ROUTE = '/shadow-realm';

export const SHADOW_MODES = ['race', 'roam'];

export function parseShadowMode(value) {
  const v = String(value || '').toLowerCase().trim();
  return SHADOW_MODES.includes(v) ? v : 'race';
}

export function shadowRealmUrl(mode = 'race', opts = {}) {
  const m = parseShadowMode(mode);
  const params = new URLSearchParams({ mode: m });
  if (opts.track) params.set('track', String(opts.track));
  if (opts.vehicle) params.set('vehicle', String(opts.vehicle));
  return `${SHADOW_REALM_ROUTE}?${params.toString()}`;
}
