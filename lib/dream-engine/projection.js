// lib/dream-engine/projection.js
// THE PROJECTION — stage 4 of the Dream Engine.
// Pure helpers for the Gemini Veo video pipeline: build the
// predictLongRunning request body from a dream description, pull the
// operation name out of the start response, read a polled operation, and
// validate video URIs before the server proxies them. No network, no env —
// everything here is headless-testable. The route (app/api/dream-engine/
// project/route.js) stays a thin shell over these functions.

export const VEO_MODEL = 'veo-3.1-fast-generate-preview';

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function veoPredictUrl() {
  return `${GEMINI_API_BASE}/models/${VEO_MODEL}:predictLongRunning`;
}

export function operationUrl(opName) {
  return `${GEMINI_API_BASE}/${opName}`;
}

const MAX_DREAM_CHARS = 600;

// Turn a raw dream description (or a scene summary, for re-projection) into
// the cinematic video prompt Veo receives. The dream text leads; the craft
// language follows so every projection shares the house dream look.
export function buildDreamVideoPrompt(dreamText) {
  const dream = String(dreamText || '').trim().replace(/\s+/g, ' ').slice(0, MAX_DREAM_CHARS);
  const subject = dream || 'a quiet threshold between waking and sleep, floating forms in violet fog';
  return (
    `Cinematic dream sequence, one slow drifting camera move, surreal and ethereal: ${subject}. ` +
    'Impossible physics, objects floating weightlessly, soft volumetric light, deep atmosphere ' +
    'and fog, dreamlike slow motion, painterly photorealism, seamless dream logic, no text, ' +
    'no watermark, no people speaking.'
  );
}

// The exact JSON body for POST models/<veo>:predictLongRunning.
export function buildVeoRequestBody(dreamText) {
  return {
    instances: [{ prompt: buildDreamVideoPrompt(dreamText) }],
    parameters: { aspectRatio: '16:9' },
  };
}

// The predictLongRunning response IS the operation: { name: "models/.../operations/..." }.
export function parseOperationName(data) {
  if (data && typeof data === 'object' && typeof data.name === 'string' && data.name.includes('operations/')) {
    return data.name;
  }
  return null;
}

// Operation names we are willing to poll: a Gemini long-running operation
// resource name and nothing else (no URLs, no path tricks).
const OP_NAME_RE = /^(models\/[A-Za-z0-9._-]+\/)?operations\/[A-Za-z0-9_-]+$/;

export function isValidOperationName(name) {
  return typeof name === 'string' && name.length <= 300 && OP_NAME_RE.test(name);
}

// Dig the generated video URI out of a finished operation's response.
// Veo on the Gemini API nests it under generateVideoResponse.generatedSamples;
// the Vertex-style generatedVideos shape is accepted too.
function extractVideoUri(response) {
  if (!response || typeof response !== 'object') return null;
  const samples = response.generateVideoResponse?.generatedSamples;
  if (Array.isArray(samples)) {
    for (const s of samples) {
      const uri = s?.video?.uri;
      if (typeof uri === 'string' && uri) return uri;
    }
  }
  const videos = response.generatedVideos;
  if (Array.isArray(videos)) {
    for (const v of videos) {
      const uri = v?.video?.uri;
      if (typeof uri === 'string' && uri) return uri;
    }
  }
  return null;
}

// Read a polled operation into one of three states:
//   { done: false, videoUri: null, error: null }   — still rendering
//   { done: true,  videoUri,       error: null }   — film ready
//   { done: true,  videoUri: null, error }         — terminally failed
export function parseOperationStatus(data) {
  if (!data || typeof data !== 'object') {
    return { done: true, videoUri: null, error: 'The projection service answered with silence.' };
  }
  if (data.error) {
    const msg =
      typeof data.error.message === 'string' && data.error.message
        ? data.error.message
        : 'The projection failed while rendering.';
    return { done: true, videoUri: null, error: msg };
  }
  if (data.done !== true) {
    return { done: false, videoUri: null, error: null };
  }
  const uri = extractVideoUri(data.response);
  if (!uri) {
    return { done: true, videoUri: null, error: 'The projection finished without a film.' };
  }
  return { done: true, videoUri: uri, error: null };
}

// The stream proxy only ever fetches from Google's own hosts, over https.
// Anything else (spoofed subdomains, http, lookalike hosts) is refused.
const ALLOWED_VIDEO_HOSTS = new Set(['generativelanguage.googleapis.com', 'storage.googleapis.com']);

export function isAllowedVideoUri(uri) {
  if (typeof uri !== 'string' || !uri) return false;
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' && ALLOWED_VIDEO_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
