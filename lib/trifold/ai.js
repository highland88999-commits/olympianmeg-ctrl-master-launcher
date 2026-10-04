// lib/trifold/ai.js
// Fiction generation via the BUDDY'S OWN AI account — never Merlin's keys.
// Server-only. The plaintext key is passed in-memory, used once, never logged.
//
// Providers: 'openai' | 'gemini' | 'anthropic' (key-based).
// Two tones per edition: 'negative' (Ruin) and 'positive' (Radiant).
// FICTION labeling is baked into the prompt AND enforced at render time
// (the page always shows a FICTION badge on these two lenses).

const NEGATIVE_SYSTEM = `You are writing FICTION — a darkly satirical, fully fictional newspaper edition. \
Take the real news stories provided and reimagine the same week as if everything went as badly as \
absurdly possible. This is dystopian satire, clearly not real. Rules: never present anything as fact; \
keep it obviously fictional and over-the-top; no real people harmed — use fictional names or clearly \
absurd scenarios; end with the line: "— This edition is 100% FICTION."`;

const POSITIVE_SYSTEM = `You are writing FICTION — a warmly utopian, fully fictional newspaper edition. \
Take the real news stories provided and reimagine the same week as if everything went as wonderfully as \
impossibly possible. This is hopeful speculative fiction, clearly not real. Rules: never present anything \
as fact; keep it obviously fictional and uplifting; no real people depicted — use fictional names or \
clearly idealized scenarios; end with the line: "— This edition is 100% FICTION."`;

function buildUserPrompt(stories, newspaperName) {
  const list = stories
    .map((s, i) => `${i + 1}. ${s.title}${s.summary ? ' — ' + s.summary : ''}`)
    .join('\n');
  return `This week's real stories from ${newspaperName}:\n${list}\n\nWrite the fictional edition as a newspaper with a headline, 3-5 short articles, and a closing line.`;
}

async function callOpenAI(apiKey, system, user, { maxTokens = 1800, temperature = 0.9 } = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(apiKey, system, user, { maxTokens = 1800, temperature = 0.9 } = {}) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

async function callAnthropic(apiKey, system, user, { maxTokens = 1800, temperature = 0.9 } = {}) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  return (data?.content || []).map((b) => b.text || '').join('').trim();
}

/**
 * Shared provider dispatch. provider: 'openai'|'gemini'|'anthropic'.
 * The key is passed in-memory and used once — never logged, never stored.
 */
async function callProvider(provider, apiKey, system, user, { maxTokens = 1800, temperature = 0.9 } = {}) {
  if (!apiKey) throw new Error('No AI API key configured.');
  switch (provider) {
    case 'gemini':
      return callGemini(apiKey, system, user, { maxTokens, temperature });
    case 'anthropic':
      return callAnthropic(apiKey, system, user, { maxTokens, temperature });
    case 'openai':
    default:
      return callOpenAI(apiKey, system, user, { maxTokens, temperature });
  }
}

/**
 * Generate one fictional take. provider: 'openai'|'gemini'|'anthropic'.
 * tone: 'negative'|'positive'. hint: optional extra focus for a single
 * block (e.g. "focus on the AI-lab fire"). Returns the fiction text.
 */
export async function generateFiction({ provider, apiKey, stories, newspaperName, tone, hint = '' }) {
  if (!stories || stories.length === 0) throw new Error('No stories to work from.');
  const system = tone === 'negative' ? NEGATIVE_SYSTEM : POSITIVE_SYSTEM;
  let user = buildUserPrompt(stories, newspaperName);
  if (hint.trim()) user += `\n\nExtra focus for this piece: ${hint.trim().slice(0, 300)}`;
  return callProvider(provider, apiKey, system, user);
}

const OG_SUMMARY_SYSTEM = `You are a careful news summarizer. You summarize REAL news, \
never invent it. Rules: write only about the stories provided; no invented \
facts, names, or quotes; plain factual language, no sensationalism, no fiction; \
if a story is unclear, say what is and isn't known.`;

/**
 * Summarize the week's real stories for a single OG text block (per-block
 * generation; the buddy's own AI key). hint: optional extra focus.
 * Returns one short paragraph plus 3 bullet takeaways.
 */
export async function generateOgSummary({ provider, apiKey, stories, newspaperName, hint = '' }) {
  if (!stories || stories.length === 0) throw new Error('No stories to work from.');
  const list = stories
    .map((s, i) => `${i + 1}. ${s.title}${s.summary ? ' — ' + s.summary : ''}`)
    .join('\n');
  let user = `Summarize this week's real stories from ${newspaperName} into ONE short paragraph (under 120 words) followed by 3 bullet takeaways:\n${list}`;
  if (hint.trim()) user += `\n\nExtra focus for this piece: ${hint.trim().slice(0, 300)}`;
  return callProvider(provider, apiKey, OG_SUMMARY_SYSTEM, user, { maxTokens: 600, temperature: 0.3 });
}

export const TRIFOLD_AI_PROVIDERS = ['openai', 'gemini', 'anthropic'];
