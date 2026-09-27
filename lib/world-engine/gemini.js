// World Engine — Gemini synthesis helpers (pure logic; fetch is injectable).
//
// The model name defaults to gemini-2.5-flash and can be overridden with the
// WORLD_ENGINE_GEMINI_MODEL env var without touching code.

export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash';
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiModel() {
  return (typeof process !== 'undefined' && process.env.WORLD_ENGINE_GEMINI_MODEL) || GEMINI_MODEL_DEFAULT;
}

export const SYSTEM_INSTRUCTION = `You are the core Synthesis AI for a 3D world-building studio.
Based on the user's prompt or URL, generate parameters for a 3D environment, including terrain, weather, and object distribution.
Respond ONLY with a raw JSON object containing exactly these keys:
- sunColor: (string) hex code (e.g., "#00f0ff")
- terrainRoughness: (float) 0.1 to 1.0
- rotationSpeed: (float) 0.0001 to 0.05
- atmosphereDensity: (float) 0.0 to 1.0
- ambientLightIntensity: (float) 0.1 to 2.0
- terrainType: (string) one of: plains, mountains, desert, ocean, alien
- weatherType: (string) one of: clear, rain, snow, fog, storm, ash
- precipitationIntensity: (float) 0.0 to 1.0
- windSpeed: (float) 0.0 to 100.0
- objectDensity: (float) 0.0 to 1.0`;

/** Build the user-side query from a prompt and/or a target URL. */
export function buildInputQuery(prompt, targetUrl) {
  if (prompt && prompt.trim()) return prompt.trim();
  return `Analyze this URL and generate a corresponding 3D world ecosystem: ${targetUrl}`;
}

/**
 * Pull the raw JSON text out of a Gemini generateContent response.
 * Throws a descriptive Error when the payload is missing or malformed.
 */
export function extractJsonText(geminiData) {
  const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Empty or malformed payload returned from the synthesis AI.');
  }
  return text;
}

/** Parse the AI's raw text into an object; throws on invalid JSON. */
export function parseParams(rawJsonText) {
  try {
    return JSON.parse(rawJsonText);
  } catch {
    throw new Error('The synthesis AI returned invalid JSON.');
  }
}

/**
 * Call the Gemini generateContent endpoint.
 * `fetchImpl` defaults to the global fetch but can be stubbed in tests.
 * Returns the parsed raw parameter object.
 */
export async function synthesizeWithGemini({ apiKey, prompt, targetUrl, model, fetchImpl }) {
  if (!apiKey) throw new Error('The synthesis service is not configured (missing API key).');
  const doFetch = fetchImpl || fetch;
  const useModel = model || geminiModel();

  const res = await doFetch(`${GEMINI_API_URL}/${useModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: buildInputQuery(prompt, targetUrl) }] }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0.7 },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'The synthesis AI rejected the request.');
  }
  return parseParams(extractJsonText(data));
}

/** Validate the synthesize request body. Returns { ok, prompt, targetUrl, error }. */
export function validateSynthesizeInput(body) {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
  const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl.trim().slice(0, 500) : '';
  if (!prompt && !targetUrl) {
    return { ok: false, error: 'Describe the world you want, or provide a URL to base it on.' };
  }
  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    return { ok: false, error: 'The target URL must start with http:// or https://.' };
  }
  return { ok: true, prompt, targetUrl };
}
