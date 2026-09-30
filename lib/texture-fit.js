// lib/texture-fit.js
// Cover-fit UV math for billboard/ad faces: map any source image or video
// onto a plane with NO stretching, warping, or aspect distortion — the
// overflow is center-cropped instead. Pure math, headless-testable.

/**
 * Compute texture repeat/offset that cover-fits a source of aspect
 * (srcW/srcH) onto a plane of aspect (planeW/planeH).
 *
 * Returns { repeat: [rx, ry], offset: [ox, oy] } to assign to
 * texture.repeat / texture.offset. The sampled window always has exactly
 * the plane's aspect, so nothing stretches.
 */
export function coverFitUV(srcW, srcH, planeW, planeH) {
  const srcAspect = srcW / srcH;
  const dstAspect = planeW / planeH;
  if (!(srcAspect > 0) || !(dstAspect > 0)) {
    return { repeat: [1, 1], offset: [0, 0] };
  }
  if (srcAspect > dstAspect) {
    // Source is wider: fit height, crop the sides.
    const rx = dstAspect / srcAspect;
    return { repeat: [rx, 1], offset: [(1 - rx) / 2, 0] };
  }
  // Source is taller (or equal): fit width, crop top/bottom.
  const ry = srcAspect / dstAspect;
  return { repeat: [1, ry], offset: [0, (1 - ry) / 2] };
}

/**
 * Apply cover-fit to a live THREE texture. Safe to call on any texture;
 * no-ops (1:1) when dimensions are missing.
 */
export function applyCoverFit(tex, srcW, srcH, planeW, planeH) {
  if (!tex) return tex;
  const { repeat, offset } = coverFitUV(srcW, srcH, planeW, planeH);
  if (typeof tex.repeat !== 'undefined') tex.repeat.set(repeat[0], repeat[1]);
  if (typeof tex.offset !== 'undefined') tex.offset.set(offset[0], offset[1]);
  return tex;
}
