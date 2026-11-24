// lib/billboards/panel-video.js — Pure helpers for hub tower panel video
// playback. Headless: no DOM, no three.js — node tests exercise this
// directly. The browser-side video elements + VideoTexture live in
// components/GodTower.jsx (shared records), which imports the list
// builder from here.
//
// Why this exists (Merlin, 2026-10-27): tower panels used to paint a
// static first frame of a video ad. First-frame capture is fragile
// (seek stalls, decode failures) and on his phone it produced dark
// static faces with no video playing anywhere. Panels now play the
// real video, preloaded in billboard-number order before the user
// drops into the hub.

/**
 * Cover-fit UV transform for wearing a video on a panel face WITHOUT
 * stretching it: the face samples its plane's full UV range, so a
 * video whose aspect differs from the face must be center-cropped,
 * never squeezed. Returns { repeat: [x, y], offset: [x, y] } for
 * THREE.Texture.repeat/.offset, or null for non-positive dims.
 * The crop is centered, so offset >= 0 and offset + repeat <= 1 on
 * both axes: the video fills the face edge to edge, nothing spills
 * outside the frame.
 */
export function videoCoverFit(faceW, faceH, videoW, videoH) {
  if (!(faceW > 0) || !(faceH > 0) || !(videoW > 0) || !(videoH > 0)) return null;
  const s = Math.max(faceW / videoW, faceH / videoH);
  const dw = videoW * s;
  const dh = videoH * s;
  const rx = faceW / dw;
  const ry = faceH / dh;
  return { repeat: [rx, ry], offset: [(1 - rx) / 2, (1 - ry) / 2] };
}

/**
 * The video preload list for the whole ring, in strict billboard-number
 * order: [{ number, url }]. towersPanels is the per-tower panels
 * array (one panels array per tower, in tower order); numberFor is
 * billboardNumberFor(towerIndex, panelIndex). Every video entry of
 * every rotating billboard is included — a rotating face needs each
 * of its videos ready before its turn comes — while image entries
 * are skipped. Identical URLs dedupe to their FIRST appearance: all
 * faces currently share one file, so one download serves the ring,
 * but the sequence order stays board order regardless.
 * The range is the whole board run, not 1→44: the ring is 24 towers
 * × 4 panels = 96 boards (Nov 2026), and the 44 cap predates it.
 * No hardcoded cap — the list is bounded by the input; only
 * non-positive or non-integer numbers are dropped.
 */
export function collectPanelVideoUrls(towersPanels, numberFor) {
  const seen = new Set();
  const out = [];
  if (!Array.isArray(towersPanels) || typeof numberFor !== 'function') return out;
  towersPanels.forEach((panels, towerIndex) => {
    if (!Array.isArray(panels)) return;
    panels.forEach((slot, panelIndex) => {
      if (!slot || typeof slot !== 'object') return;
      const number = numberFor(towerIndex, panelIndex);
      if (!Number.isInteger(number) || number < 1) return;
      const urls = [];
      const entries = Array.isArray(slot.entries) ? slot.entries : null;
      if (entries) {
        for (const e of entries) {
          if (e && e.creativeType === 'video' && typeof e.creativeUrl === 'string' && e.creativeUrl) {
            urls.push(e.creativeUrl);
          }
        }
      } else if (slot.creativeType === 'video' && typeof slot.creativeUrl === 'string' && slot.creativeUrl) {
        urls.push(slot.creativeUrl);
      }
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ number, url });
      }
    });
  });
  // Iteration already runs towers then panels in order, and billboard
  // numbers increase with both, so `out` is already in board order;
  // sort defensively so a caller passing towers out of order can
  // never scramble the preload sequence.
  out.sort((a, b) => a.number - b.number);
  return out;
}

/**
 * Run the preload list in order: loadOne(url) is awaited per item, in
 * sequence, never in parallel — the ring loads in board order, not
 * all at once. A failed load marks that item failed and the runner
 * moves on; it never throws, so the hub load gate can never hang on
 * a single dead video. Returns [{ url, ok }] in list order.
 * loadOne resolves truthy on success, falsy (or throws) on failure.
 */
export async function preloadInOrder(items, loadOne) {
  const results = [];
  const attempted = new Set();
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const url = item && typeof item.url === 'string' ? item.url : '';
    if (!url || attempted.has(url)) continue;
    attempted.add(url);
    try {
      const ok = await loadOne(url);
      results.push({ url, ok: Boolean(ok) });
    } catch {
      results.push({ url, ok: false });
    }
  }
  return results;
}

/**
 * Load order for one panel's video record (Merlin, 2026-11-24):
 * sequential loading runs badge 1, 2, 3, ... — the number visitors
 * see on the face. viewerId is `panel-<badge>` for tower faces;
 * anything else (a slot-key fallback) loads last, in registration
 * order. Pure and headless-testable.
 */
export function panelVideoBadgeOrder(viewerId) {
  const m = /^panel-(\d+)$/.exec(typeof viewerId === 'string' ? viewerId : '');
  return m ? Number(m[1]) : Infinity;
}

/**
 * Pick the next entry off a sequential load queue: lowest badge
 * order first; ties (a badge number shared across levels) in
 * registration order (seq). Returns the entry's index, or -1 when
 * the queue is empty. Pure and headless-testable — the browser
 * runner in components/GodTower.jsx picks through this helper, so
 * the order it loads in is exactly the order tested here.
 */
export function pickNextPanelVideoLoad(entries) {
  const list = Array.isArray(entries) ? entries : [];
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || typeof e !== 'object') continue;
    if (best < 0) { best = i; continue; }
    const a = list[best];
    const aOrder = typeof a.order === 'number' ? a.order : Infinity;
    const eOrder = typeof e.order === 'number' ? e.order : Infinity;
    const aSeq = typeof a.seq === 'number' ? a.seq : 0;
    const eSeq = typeof e.seq === 'number' ? e.seq : 0;
    if (eOrder < aOrder || (eOrder === aOrder && eSeq < aSeq)) best = i;
  }
  return best;
}
