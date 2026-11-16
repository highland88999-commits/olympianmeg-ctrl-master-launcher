// lib/omega-arch.js
// THE OMEGA ARCH — ported from Merlin's OMEGA repo ("3Space – The OMEGA Arch",
// highland88999-commits/OMEGA). The original page built the monument in
// three.js: a giant Ω arch (a 288° torus with two feet) skinned with a
// looping VIDEO wrap, and a vortex video disc turning inside it. Both
// videos were imported into this repo on 2026-10-17 and are self-hosted:
//   wrap   /media/skyscraper/wmhz50.mp4  (5.9s loop, 1376x768)
//   vortex /media/skyscraper/4ab3h5.mp4  (10.0s loop, 1280x720)
// The original page's third-party telemetry scripts were deliberately NOT
// ported — Olympus does not phone its users home. Only the Arch and its
// wrap came across. (The Arch also lives as the 2D-canvas program at
// /omega; this module is the real video version for hub space.)
//
// In the hub the Arch stands just beyond the Sun as the showpiece gateway
// to the Portals 3D hall (/?concourse=1&portals3d=1 — Nov 16, 2026
// merge: the 2D Portal Room is gone; the Arch flies the user to the
// hub with the 3D hall open): click it, or fly through it.
// concourse=1 collapses the hub program menu (it would otherwise
// cover the hall sheet, z-40000 over z-62); portals3d=1 opens the
// hall itself (components/Concourse.jsx deep link).

export const OMEGA_WRAP_VIDEO = '/media/skyscraper/wmhz50.mp4';
export const OMEGA_VORTEX_VIDEO = '/media/skyscraper/4ab3h5.mp4';
export const OMEGA_ROUTE = '/?concourse=1&portals3d=1';

// Arch geometry — identical proportions to the OMEGA original.
export const OMEGA_ARCH = {
  radius: 80,
  tube: 15,
  arc: Math.PI * 1.6, // 288 degrees — the bottom gap makes the Ω opening
  rotationZ: -Math.PI * 0.3, // gap centered at the bottom
  footLength: 40,
};

// The vortex disc inside the arch (original: radius - tube - 5).
export const OMEGA_PORTAL_RADIUS = OMEGA_ARCH.radius - OMEGA_ARCH.tube - 5; // 60

// Where the Arch stands in hub space: on the Sun's axis, beyond it.
// Sun center (0, 158.75, 662.5), radius 67.5 — its far surface is z = 730,
// so the Arch at z = 1000 stands clear beyond it. OMEGA_POSITION is the
// Arch's feet plane; the ring center rides OMEGA_RING_CENTER_Y above it.
export const SUN_CENTER = { x: 0, y: 158.75, z: 662.5 };
export const SUN_RADIUS = 67.5;
export const OMEGA_POSITION = { x: 0, y: 158.75, z: 1000 };

// Endpoint math from the original: the torus gap ends at angle -0.3π, so
// offsetY = radius * sin(-0.3π) ≈ -64.72 and offsetX ≈ 47.02. The ring
// center sits |offsetY| + tube ≈ 79.72 above the feet plane, which puts
// each foot's center exactly one tube radius above that plane.
export const OMEGA_RING_CENTER_Y =
  Math.abs(OMEGA_ARCH.radius * Math.sin(-Math.PI * 0.3)) + OMEGA_ARCH.tube;

export function omegaFootX() {
  return OMEGA_ARCH.radius * Math.cos(-Math.PI * 0.3); // ≈ 47.02
}

export function omegaFootY() {
  return OMEGA_ARCH.radius * Math.sin(-Math.PI * 0.3); // ≈ -64.72
}

// World-space center of the vortex disc (before the breathing bob), for
// fly-through checks and labels.
export function omegaPortalCenter(bobY = 0) {
  return {
    x: OMEGA_POSITION.x,
    y: OMEGA_POSITION.y + OMEGA_RING_CENTER_Y + bobY,
    z: OMEGA_POSITION.z,
  };
}
