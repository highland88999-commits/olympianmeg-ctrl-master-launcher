// lib/billboards/creative-fit.js — Billboard frame-fit requirement
// (Merlin, 2026-10-31). The billboard frame is landscape 16:9: the
// creative fills the WHOLE frame edge to edge, inside the border rim
// — no black bars, no gaps, no dark surround. Cover-crop (fill +
// center-crop overflow), never stretch.
//
// ONE frame spec serves every billboard surface: hub tower panels
// (face 12.64×7.0 world units, 1264×700 canvas) are 16:9. Street
// monuments (face 9.0×15.75) are still 4:7 portrait — a 16:9 creative
// on a monument frame will cover-crop top and bottom; that mismatch
// is Merlin's call, not this module's.
//
// Pure + headless-testable, except probeCreativeDimensions (browser
// only: reads an image/video file's real dimensions before upload).
// The upload UIs (public /request-billboard and owner /ad-spaces)
// reject files that fail this check BEFORE any upload starts, and
// show SIZE_NOTICE so uploaders know the size up front. Server-side
// dimension probing is not in this module: the request flow is
// review-gated (Merlin reviews every request before anything goes
// live) and the manager is owner-only, so a file that slips past the
// client check is still caught before it reaches a panel.

// Frame aspect: 16 wide : 9 tall, landscape.
export const FRAME_ASPECT_NUM = 16;
export const FRAME_ASPECT_DEN = 9;
export const FRAME_ASPECT = FRAME_ASPECT_NUM / FRAME_ASPECT_DEN;

// Frame pixel sizes: 640×360 minimum, 1280×720 (HD) recommended.
export const FRAME_MIN_W = 640;
export const FRAME_MIN_H = 360;
export const FRAME_REC_W = 1280;
export const FRAME_REC_H = 720;

// Aspect tolerance: within 5% of 16:9 passes.
export const FRAME_ASPECT_TOLERANCE = 0.05;

/** True when w/h sits within tolerance of the 16:9 frame aspect. */
export function fitsFrameAspect(w, h) {
  if (!(w > 0) || !(h > 0)) return false;
  const aspect = w / h;
  return Math.abs(aspect - FRAME_ASPECT) / FRAME_ASPECT <= FRAME_ASPECT_TOLERANCE;
}

/** True when the file meets the frame's minimum pixel size. */
export function fitsFramePixels(w, h) {
  return w >= FRAME_MIN_W && h >= FRAME_MIN_H;
}

/**
 * Full frame-fit verdict for a creative of w×h pixels:
 * { ok, aspectOk, pixelsOk, width, height }.
 */
export function checkCreativeFit(w, h) {
  const aspectOk = fitsFrameAspect(w, h);
  const pixelsOk = fitsFramePixels(w, h);
  return { ok: aspectOk && pixelsOk, aspectOk, pixelsOk, width: w, height: h };
}

/** The size requirement, shown to uploaders before they pick a file. */
export const SIZE_NOTICE =
  'Billboard frame: landscape 16:9. Minimum 640×360 px, recommended 1280×720 px or larger at 16:9. ' +
  'Portrait or square graphics do not fit the frame and will be rejected.';

/** Rejection message for a file that fails checkCreativeFit. */
export function fitRejectMessage(w, h, check) {
  const c = check || checkCreativeFit(w, h);
  if (!c.aspectOk) {
    return (
      `That graphic does not fit the billboard frame. The frame is landscape 16:9 ` +
      `(minimum 640×360 px, recommended 1280×720 px). Your file is ${w}×${h}.`
    );
  }
  return (
    `That graphic is too small for the billboard frame. Minimum 640×360 px ` +
    `(recommended 1280×720 px). Your file is ${w}×${h}.`
  );
}

/**
 * Browser-only: read a File's real pixel dimensions. Images via an
 * <img> load, videos via loadedmetadata. Rejects when the file cannot
 * be read at all (an unreadable file could never display on a panel).
 * Callers treat a rejection as a failed upload with the error text.
 */
export function probeCreativeDimensions(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file.type !== 'string') {
      reject(new Error('Could not read that file.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const done = (fn) => (...args) => {
      URL.revokeObjectURL(url);
      fn(...args);
    };
    const fail = done(() =>
      reject(new Error('Could not read that file’s dimensions, so it can’t be checked against the frame. Please re-export it and try again.'))
    );
    const timer = setTimeout(fail, 15000);
    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = done(() => {
        clearTimeout(timer);
        resolve({ width: vid.videoWidth, height: vid.videoHeight });
      });
      vid.onerror = () => {
        clearTimeout(timer);
        fail();
      };
      vid.src = url;
    } else {
      const img = new Image();
      img.onload = done(() => {
        clearTimeout(timer);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      });
      img.onerror = () => {
        clearTimeout(timer);
        fail();
      };
      img.src = url;
    }
  });
}
