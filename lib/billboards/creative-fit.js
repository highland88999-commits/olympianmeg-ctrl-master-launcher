// lib/billboards/creative-fit.js — Billboard frame-fit requirement
// (Merlin, 2026-10-27). The billboard frame is a tall portrait: the
// creative fills the WHOLE frame edge to edge, inside the border rim
// — no black bars, no gaps, no dark surround. Cover-crop (fill +
// center-crop overflow), never stretch.
//
// ONE frame spec serves every billboard surface: hub tower panels
// (face 4.0×7.0 world units) and street monuments (face 9.0×15.75)
// share the same 4:7 aspect, so one upload rule covers both.
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

// Frame aspect: 4 wide : 7 tall, portrait.
export const FRAME_ASPECT_NUM = 4;
export const FRAME_ASPECT_DEN = 7;
export const FRAME_ASPECT = FRAME_ASPECT_NUM / FRAME_ASPECT_DEN;

// Frame pixel sizes, derived from the real face texture resolution:
// the hub face canvas is 400×700 (100 px per world unit on a 4.0×7.0
// face), so 400×700 is the minimum that stays crisp; 800×1400 (2×)
// is the recommended size for phones.
export const FRAME_MIN_W = 400;
export const FRAME_MIN_H = 700;
export const FRAME_REC_W = 800;
export const FRAME_REC_H = 1400;

// Aspect tolerance: within 5% of 4:7 passes. Phone portrait video
// (9:16 = 0.5625) sits 1.6% off 4:7, so the format uploaders most
// often have already fits; landscape (16:9), square (1:1), and
// 3:4 all fall far outside and are rejected.
export const FRAME_ASPECT_TOLERANCE = 0.05;

/** True when w/h sits within tolerance of the 4:7 frame aspect. */
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
  'Billboard frame: tall portrait 4:7. Minimum 400×700 px, recommended 800×1400 px or larger at 4:7. ' +
  'Phone portrait (9:16) also fits. Landscape or square graphics do not fit the frame and will be rejected.';

/** Rejection message for a file that fails checkCreativeFit. */
export function fitRejectMessage(w, h, check) {
  const c = check || checkCreativeFit(w, h);
  if (!c.aspectOk) {
    return (
      `That graphic does not fit the billboard frame. The frame is tall portrait 4:7 ` +
      `(minimum 400×700 px, recommended 800×1400 px). Your file is ${w}×${h}.`
    );
  }
  return (
    `That graphic is too small for the billboard frame. Minimum 400×700 px ` +
    `(recommended 800×1400 px). Your file is ${w}×${h}.`
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
