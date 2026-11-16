// World Engine — Gemini synthesis helpers (pure logic; fetch is injectable).
//
// The model name defaults to gemini-3.8-flash and can be overridden with the
// WORLD_ENGINE_GEMINI_MODEL env var without touching code.

export const GEMINI_MODEL_DEFAULT = 'gemini-3.8-flash';
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

/** Weapon forge: asks for firearm build parameters instead of environment params. */
export const WEAPON_SYSTEM_INSTRUCTION = `You are the Synthesis AI for a 3D weapon forge in a world-building studio.
Based on the user's prompt, generate build parameters for a detailed procedural firearm.
Map the user's descriptive words to the enum values: if they say "scope" or "scoped", opticType MUST be "scope"; "red dot" means "red-dot"; "suppressed" or "silenced" implies a suppressor-friendly smg or rifle build; "sniper" or "long range" means weaponType "precision" with opticType "scope"; "telescoping" or "adjustable stock" means stockType "telescoping".
Respond ONLY with a raw JSON object containing exactly these keys:
- weaponType: (string) one of: rifle, smg, precision (assault rifle, submachine gun, precision/sniper rifle)
- barrelLength: (float) 0.3 to 2.0 (meters)
- stockType: (string) one of: telescoping, wire, precision, none
- opticType: (string) one of: iron, red-dot, scope, none
- finishColor: (string) hex code for the weapon finish (e.g., "#1c1f26")
- damageRating: (integer) 1 to 100`;

/** Pick the system instruction for a forge category. */
export function systemInstructionFor(category) {
  switch (normalizeCategory(category)) {
    case 'weapon':
      return WEAPON_SYSTEM_INSTRUCTION;
    case 'character':
      return CHARACTER_SYSTEM_INSTRUCTION;
    case 'creature':
      return CREATURE_SYSTEM_INSTRUCTION;
    case 'vehicle':
      return VEHICLE_SYSTEM_INSTRUCTION;
    case 'object':
      return OBJECT_SYSTEM_INSTRUCTION;
    case 'asset_link':
      return ASSET_LINK_SYSTEM_INSTRUCTION;
    default:
      // world + weather + unknown: the generic environment prompt
      // already asks for the weather keys, and weather synthesis was
      // verified (Nov 15) to move the weather slice on it — so
      // weather needs no instruction of its own.
      return SYSTEM_INSTRUCTION;
  }
}

/**
 * Normalise a category string for instruction / clamp dispatch.
 * The uplink builder is 'asset_link' in the economy and the store,
 * but callers also spell it 'assetlink' or 'uplink'.
 */
export function normalizeCategory(category) {
  const cat = (category || '').toString().toLowerCase();
  if (cat === 'assetlink' || cat === 'uplink') return 'asset_link';
  return cat;
}

/** Character builder: asks for humanoid build parameters instead of environment params. */
export const CHARACTER_SYSTEM_INSTRUCTION = `You are the Synthesis AI for a 3D character builder in a world-building studio.
Based on the user's prompt, generate build parameters for one procedural humanoid character.
Respond ONLY with a raw JSON object containing exactly these keys:
- height: (float) 0.5 to 5.0 (metres)
- proportions: (object) { head: (float) 0.5 to 2.0, torso: (float) 0.5 to 2.0, limbs: (float) 0.5 to 2.0 } — 1.0 is an even build; a larger head reads younger, a larger torso reads broader, longer limbs read lankier
- color: (string) hex code for the character's main colour (e.g., "#c9a86a")
- animationSet: (string) one of: idle`;

/** Creature builder: asks for creature build parameters instead of environment params. */
export const CREATURE_SYSTEM_INSTRUCTION = `You are the Synthesis AI for a 3D creature builder in a world-building studio.
Based on the user's prompt, generate build parameters for one procedural creature.
Respond ONLY with a raw JSON object containing exactly these keys:
- archetype: (string) one of: grazer, stalker, flyer, swarmer, burrower, drifter, darter, leviathan, weaver, mimic (herd herbivore, predator, airborne, small flocking, underground, slow floating, fast darting, massive slow titan, structure-builder, camouflaged ambusher)
- bauplan: (object) { bodyLength: (float) 0.4 to 2.5, bodyWidth: (float) 0.3 to 1.2, limbCount: (integer) 0 to 8, limbLength: (float) 0.2 to 1.5, stance: (float) 0.0 to 1.0, surface: (string) one of: smooth, armored, frilled, translucent }
- sizeClass: (string) one of: tiny, small, medium, large, huge
- aggression: (float) 0.0 to 1.0 (0.0 is calm, 1.0 is a relentless predator)
- color: (string) hex code for the creature's main colour (e.g., "#3d8b4f")`;

/** Vehicle builder: asks for vehicle build parameters instead of environment params. */
export const VEHICLE_SYSTEM_INSTRUCTION = `You are the Synthesis AI for a 3D vehicle builder in a world-building studio.
Based on the user's prompt, generate build parameters for one procedural vehicle.
Respond ONLY with a raw JSON object containing exactly these keys:
- vehicleClass: (string) one of: ground, air, space (stays on the surface, flies in atmosphere, vacuum-rated)
- speed: (float) 10 to 300 (top speed in km/h)
- handling: (float) 0.1 to 1.0 (0.1 is a heavy hauler, 1.0 is razor-sharp)
- color: (string) hex code for the vehicle's main colour (e.g., "#ff5500")`;

/** Object builder: asks for object build parameters instead of environment params. */
export const OBJECT_SYSTEM_INSTRUCTION = `You are the Synthesis AI for a 3D object builder in a world-building studio.
Based on the user's prompt, generate build parameters for one procedural object (a prop, marker, or piece of set dressing).
Respond ONLY with a raw JSON object containing exactly these keys:
- scale: (object) { x: (float) 0.1 to 10.0, y: (float) 0.1 to 10.0, z: (float) 0.1 to 10.0 } — size in metres on each axis
- density: (float) 0.0 to 1.0 (how often this object is placed across the world)
- material: (string) one of: standard
- color: (string) hex code for the object's main colour (e.g., "#00ffcc")`;

/** Asset uplink: asks the AI to describe the URL target as a 3D asset link. */
export const ASSET_LINK_SYSTEM_INSTRUCTION = `You are the Synthesis AI for a 3D asset uplink in a world-building studio.
Based on the user's prompt or URL, describe the linked target as a 3D asset to import. The URL the user gave is the asset — return it unchanged as url.
Respond ONLY with a raw JSON object containing exactly these keys:
- url: (string) the http(s) URL of the asset, exactly as given
- type: (string) one of: glb
- scale: (object) { x: (float) 0.1 to 10.0, y: (float) 0.1 to 10.0, z: (float) 0.1 to 10.0 } — import scale on each axis (1.0 is natural size)`;

/** Build the user-side query from a prompt and/or a target URL. */
export function buildInputQuery(prompt, targetUrl, category) {
  if (prompt && prompt.trim()) return prompt.trim();
  const whatByCategory = {
    weapon: 'firearm',
    character: 'humanoid character',
    creature: 'creature',
    vehicle: 'vehicle',
    object: '3D object',
    asset_link: '3D asset link',
  };
  const what = whatByCategory[normalizeCategory(category)] || '3D world ecosystem';
  return `Analyze this URL and generate a corresponding ${what}: ${targetUrl}`;
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
export async function synthesizeWithGemini({ apiKey, prompt, targetUrl, model, fetchImpl, category }) {
  if (!apiKey) throw new Error('The synthesis service is not configured (missing API key).');
  const doFetch = fetchImpl || fetch;
  const useModel = model || geminiModel();

  const res = await doFetch(`${GEMINI_API_URL}/${useModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstructionFor(category) }] },
      contents: [{ role: 'user', parts: [{ text: buildInputQuery(prompt, targetUrl, category) }] }],
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
