// lib/prime-chart.js — Prime's deterministic cosmos chart, pure logic.
//
// The chart is a "map on steroids" of the launcher: every satellite from the
// shared registry (lib/i18n/satellites.ts) becomes a destination node,
// grouped into constellation clusters. Positions are fully deterministic —
// seeded by each key's characters — so every user sees the same chart and
// the layout never shifts between visits. No network, no tiles, no telemetry.
// Fully headless-testable: no DOM, no canvas, no imports.

// --- deterministic RNG -------------------------------------------------------

// 32-bit FNV-1a hash of a string: stable across runtimes, tiny, and good
// enough to seed the layout.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32: small, fast, seeded PRNG with a long period for chart layout.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- constellation palette ---------------------------------------------------
// Neon-on-black like the source storefront, but quiet: one muted hue per
// constellation, low saturation so the map stays readable. The lighting rule
// applies to the map too — glow is localized to the selected node only.

export const CONSTELLATION_STYLE = Object.freeze({
  ZEUS: { hue: '#7dd3fc', label: 'Zeus — Games', radius: 1.0 },
  THOTH: { hue: '#c4b5fd', label: 'Thoth — Programs', radius: 0.92 },
  ARGUS: { hue: '#67e8f9', label: 'Argus — Observatory', radius: 0.98 },
  ARTEMIS: { hue: '#f9a8d4', label: 'Artemis — Sanctum', radius: 0.5 },
  ARES: { hue: '#fca5a5', label: 'Ares — Tools', radius: 0.85 },
  MEDUSA: { hue: '#a3e635', label: 'Medusa — Vaults', radius: 0.7 },
  UNKNOWN: { hue: '#94a3b8', label: 'Charted', radius: 0.7 },
});

export function styleFor(constellation) {
  return CONSTELLATION_STYLE[constellation] || CONSTELLATION_STYLE.UNKNOWN;
}

// World units are arbitrary (roughly "kilometers" of chart space). Clusters
// sit on a ring; satellites fan out around their cluster center.
export const CHART_RING_RADIUS = 2400;
export const CLUSTER_SPREAD = 560; // max satellite spread within a cluster
export const MIN_NODE_SEPARATION = 96; // min gap between satellite nodes

// --- chart construction ------------------------------------------------------

export function prettifyKey(key) {
  return String(key)
    .split(/[-_]/g)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function sectionBlurb(section) {
  const s = String(section || '').toUpperCase();
  switch (s) {
    case 'GAMES': return 'Play — games and arenas.';
    case 'AI PROGRAMS': return 'Programs and mind-machines.';
    case 'OBSERVATORY': return 'Look around — scenes and worlds.';
    case 'TOOLS': return 'Tools for making things.';
    case 'UTILITIES': return 'Utilities for everyday work.';
    case 'THERAPY': return 'Quiet rooms.';
    case 'SANCTUM': return 'Sanctum.';
    default: return 'A charted destination.';
  }
}

// Build the chart from the SATELLITES registry. Returns:
// { clusters: [{ constellation, x, y, hue, label, nodes: [{key, route, section,
//   constellation, name, x, y}] }], nodeCount }
export function buildChart(satellites) {
  const list = Array.isArray(satellites) ? satellites : [];
  const byConstellation = new Map();
  for (const s of list) {
    if (!s || !s.key || !s.route) continue;
    const c = s.constellation || 'UNKNOWN';
    if (!byConstellation.has(c)) byConstellation.set(c, []);
    byConstellation.get(c).push(s);
  }

  // Constellation order is alphabetical so the chart is identical every load.
  const names = [...byConstellation.keys()].sort();
  const clusters = [];
  names.forEach((name, i) => {
    const sats = byConstellation.get(name).sort((a, b) => a.key.localeCompare(b.key));
    const style = styleFor(name);
    const rng = mulberry32(hashString('cluster:' + name));
    // Evenly spaced ring with a small seeded wobble, scaled by cluster size.
    const angle = (i / names.length) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const ring = CHART_RING_RADIUS * (0.72 + style.radius * 0.28);
    const cx = Math.cos(angle) * ring;
    const cy = Math.sin(angle) * ring;

    const nodes = [];
    const nodeRng = mulberry32(hashString('nodes:' + name));
    for (const sat of sats) {
      // Place on a seeded spiral so nodes never overlap and the pattern is
      // deterministic. Relax positions until separation is satisfied.
      const j = nodes.length;
      const golden = Math.PI * (3 - Math.sqrt(5));
      const spread = CLUSTER_SPREAD * (0.55 + style.radius * 0.45);
      let r = spread * Math.sqrt((j + 0.5) / Math.max(sats.length, 1));
      let a = j * golden + nodeRng() * 0.4;
      let x = cx + Math.cos(a) * r;
      let y = cy + Math.sin(a) * r;
      let guard = 0;
      while (guard++ < 40) {
        const tooClose = nodes.some(
          (n) => (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) < MIN_NODE_SEPARATION * MIN_NODE_SEPARATION
        );
        if (!tooClose) break;
        a += 0.35;
        r += 14;
        x = cx + Math.cos(a) * r;
        y = cy + Math.sin(a) * r;
      }
      nodes.push({
        key: sat.key,
        route: sat.route,
        section: sat.section || '',
        constellation: name,
        name: prettifyKey(sat.key),
        blurb: sectionBlurb(sat.section),
        x,
        y,
      });
    }

    clusters.push({
      constellation: name,
      x: cx,
      y: cy,
      hue: style.hue,
      label: style.label,
      count: sats.length,
      nodes,
    });
  });

  return { clusters, nodeCount: clusters.reduce((n, c) => n + c.nodes.length, 0) };
}

// Flatten all nodes across clusters (for search / hit testing).
export function allNodes(chart) {
  const out = [];
  for (const c of chart.clusters) {
    for (const n of c.nodes) out.push({ ...n, cluster: c });
  }
  return out;
}

// --- camera math --------------------------------------------------------------
// Camera: { x, y, zoom } — zoom is a scale factor (1 = whole chart fits ~2x).

export function screenToWorld(px, py, camera, viewW, viewH) {
  return {
    x: camera.x + (px - viewW / 2) / camera.zoom,
    y: camera.y + (py - viewH / 2) / camera.zoom,
  };
}

export function worldToScreen(wx, wy, camera, viewW, viewH) {
  return {
    x: (wx - camera.x) * camera.zoom + viewW / 2,
    y: (wy - camera.y) * camera.zoom + viewH / 2,
  };
}

// Hit-test a world point against nodes (returns the topmost node within its
// screen-space grab radius) then clusters (within their screen radius).
// nodeGrabPx / clusterGrabPx are in screen pixels so tapping stays forgiving.
export function hitTest(chart, worldX, worldY, camera, opts = {}) {
  const nodeGrabPx = opts.nodeGrabPx ?? 26;
  const clusterGrabPx = opts.clusterGrabPx ?? 48;
  const nodeGrabW = nodeGrabPx / camera.zoom;
  const clusterGrabW = clusterGrabPx / camera.zoom;

  let best = null;
  let bestD2 = Infinity;
  for (const c of chart.clusters) {
    for (const n of c.nodes) {
      const dx = n.x - worldX;
      const dy = n.y - worldY;
      const d2 = dx * dx + dy * dy;
      if (d2 <= nodeGrabW * nodeGrabW && d2 < bestD2) {
        best = { kind: 'node', node: n, cluster: c };
        bestD2 = d2;
      }
    }
  }
  if (best) return best;

  for (const c of chart.clusters) {
    const dx = c.x - worldX;
    const dy = c.y - worldY;
    if (dx * dx + dy * dy <= clusterGrabW * clusterGrabW) {
      return { kind: 'cluster', cluster: c, node: null };
    }
  }
  return null;
}

// --- search -------------------------------------------------------------------

export function searchChart(chart, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const matches = [];
  for (const c of chart.clusters) {
    const constellationHit = c.constellation.toLowerCase().includes(q);
    for (const n of c.nodes) {
      if (
        constellationHit ||
        n.name.toLowerCase().includes(q) ||
        n.key.toLowerCase().includes(q)
      ) {
        matches.push({ node: n, cluster: c });
      }
    }
  }
  return matches.slice(0, 24);
}

// --- initial camera -----------------------------------------------------------

// Start centered between all clusters, zoomed out to see the whole chart.
export function initialCamera(chart, viewW, viewH) {
  if (!chart.clusters.length) return { x: 0, y: 0, zoom: 0.25 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of chart.clusters) {
    minX = Math.min(minX, c.x - CLUSTER_SPREAD);
    maxX = Math.max(maxX, c.x + CLUSTER_SPREAD);
    minY = Math.min(minY, c.y - CLUSTER_SPREAD);
    maxY = Math.max(maxY, c.y + CLUSTER_SPREAD);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = Math.max(viewW, 1);
  const h = Math.max(viewH, 1);
  const zoom = Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.92;
  return { x: cx, y: cy, zoom: Math.max(0.05, Math.min(zoom, 0.5)) };
}

export const ZOOM_MIN = 0.04;
export const ZOOM_MAX = 3.2;
// Below this zoom satellites fade into their cluster; above it, clusters fade
// out so the map declutters as you dive. This keeps the interface minimal.
export const CLUSTER_BREAKOVER_ZOOM = 0.55;
