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

async function callOpenAI(apiKey, system, user) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1800,
      temperature: 0.9,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(apiKey, system, user) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 1800, temperature: 0.9 },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

async function callAnthropic(apiKey, system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1800,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic HTTP ${res.status}`);
  return (data?.content || []).map((b) => b.text || '').join('').trim();
}

/**
 * Generate one fictional take. provider: 'openai'|'gemini'|'anthropic'.
 * tone: 'negative'|'positive'. Returns the fiction text.
 */
export async function generateFiction({ provider, apiKey, stories, newspaperName, tone }) {
  if (!apiKey) throw new Error('No AI API key configured.');
  if (!stories || stories.length === 0) throw new Error('No stories to work from.');
  const system = tone === 'negative' ? NEGATIVE_SYSTEM : POSITIVE_SYSTEM;
  const user = buildUserPrompt(stories, newspaperName);
  switch (provider) {
    case 'gemini':
      return callGemini(apiKey, system, user);
    case 'anthropic':
      return callAnthropic(apiKey, system, user);
    case 'openai':
    default:
      return callOpenAI(apiKey, system, user);
  }
}

export const TRIFOLD_AI_PROVIDERS = ['openai', 'gemini', 'anthropic'];
