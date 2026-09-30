import { ORBIT_CENTER } from './god-orbits';

export const ORBIT_RADIUS = 40;

export const ZEUS_POS = [ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z + ORBIT_RADIUS];
export const ARES_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 2) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 2) / 10) * ORBIT_RADIUS];
export const THOTH_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 4) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 4) / 10) * ORBIT_RADIUS];
export const ARGUS_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 6) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 6) / 10) * ORBIT_RADIUS];
export const BABEL_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 7) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 7) / 10) * ORBIT_RADIUS];
export const MEDUSA_POS = [ORBIT_CENTER.x + Math.sin((Math.PI * 8) / 10) * ORBIT_RADIUS, ORBIT_CENTER.y, ORBIT_CENTER.z + Math.cos((Math.PI * 8) / 10) * ORBIT_RADIUS];
// Merlin's seat — above the hub, apart from every cluster. Everything else orbits it.
export const ARTEMIS_POS = [ORBIT_CENTER.x, ORBIT_CENTER.y + 28, ORBIT_CENTER.z];
