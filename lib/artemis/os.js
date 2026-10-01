// lib/artemis/os.js
//
// Deduped OS configuration for the ARTEMIS pocket universe.
//
// artemis-hub ("APEX HERITAGE") and artemis-os ("NOVA") were two separate
// window-manager shells in Merlin's repos. This module merges them into one
// definition: the hub's full window manager (themes, auth, sessions,
// bookmarks, command palette, mobile adaptation) plus the os's extras
// (snap guides, side-dock layout, NOVA/LINUX boot configs). One config,
// no duplicate logic.
//
// STRIPPED from both originals (never ported):
//   - OMEGA MIND TELEMETRY UPLINK (foreign Supabase, central_telemetry,
//     connected_repos, ipify lookup, click tracking)
//   - silentUplink() track_ping RPC (60s beacon)
//   - onrender.com from the iframe allowlist — zero Render reliance.
//     External fetches go through /api/artemis/fetch instead.

import { ARTEMIS_VIDEOS } from './videos.js';

// Desktop themes — the hub's four modes, verbatim behavior.
export const OS_THEMES = {
  ARTEMIS: {
    color: '#00f2ff',
    label: 'ARTEMIS',
    bg: ARTEMIS_VIDEOS.desktopBg,
    poster: ARTEMIS_VIDEOS.desktopPoster,
  },
  APPLE: { color: '#e8e8e8', label: 'APPLE', bg: null, poster: null },
  LINUX: {
    color: '#39ff14',
    label: 'LINUX',
    bg: ARTEMIS_VIDEOS.linuxBg,
    poster: null,
  },
  MICROSOFT: { color: '#00a2ed', label: 'MICROSOFT', bg: null, poster: null },
  // NOVA — folded in from artemis-os: its boot identity and wallpaper slot.
  NOVA: {
    color: '#00f2ff',
    label: 'NOVA',
    bg: ARTEMIS_VIDEOS.novaBg,
    poster: ARTEMIS_VIDEOS.desktopPoster,
  },
};

export const OS_THEME_KEYS = Object.keys(OS_THEMES);

// OS apps — the hub's app dock, rewired to launcher routes where the
// module lives here, so windows open inside the universe instead of
// bouncing out to old deployments.
export const OS_APPS = [
  { id: 'architect', name: 'ARCHITECT', icon: '📐', route: '/artemis?view=oracle' },
  { id: 'nexus', name: 'NEXUS HUB', icon: '🧬', route: '/' },
  { id: 'aetheris', name: 'AETHERIS', icon: '🔱', route: '/aetheris' },
  { id: 'tracker', name: 'TRACKER', icon: '🛰️', route: '/olympus-aetheris' },
  { id: 'starblood', name: 'STARBLOOD', icon: '🩸', route: '/starblood' },
];

// Hosts an iframe window is allowed to load. Internal launcher routes are
// always allowed. External hosts are limited to Merlin's own ecosystem —
// onrender.com was deliberately removed (zero Render reliance).
export const OS_IFRAME_ALLOWLIST = ['vercel.app', 'wikipedia.org', 'catbox.moe', 'nexusvortex.ca'];

export function isAllowedFrameUrl(url) {
  try {
    if (url.startsWith('/')) return true; // internal launcher route
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return OS_IFRAME_ALLOWLIST.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

// Window defaults shared by the manager.
export const OS_WINDOW_DEFAULTS = {
  width: 640,
  height: 420,
  minWidth: 280,
  minHeight: 200,
  cascadeStep: 32,
};
