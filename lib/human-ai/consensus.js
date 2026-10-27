// lib/human-ai/consensus.js — The Council: live Muse + Gemini deliberation
// for /human-ai COUNCIL mode.
//
// The Council is the dynamic duo, called live on every task:
//   - Muse — the Olympus helper voice, through the same backend the orb
//     panel uses (lib/muse/responder.js generateMuseReply: Gemini model
//     behind the Muse system prompt, no-leak rules included).
//   - Gemini — the Human AI voice, through the engine behind /api/chat
//     (lib/human-ai/engine.js runHumanAI: gemini-1.5-flash with search
//     and code execution tools).
//
// Both voices share the site's GEMINI_API_KEY. If a voice is unavailable
// (key missing, key pending its swap to a standard AI Studio key, model
// error, quota), that voice yields an honest down message — never a
// fabricated verdict, never a silent simulated substitute. The consensus
// and note then say plainly which voices were live.
//
// evaluateHarvest(task, voices?) -> {
//   task, verdicts: [{ agent, focus, verdict, live }],
//   approved, nurture_score, consensus, note
// }
//   voices is a test seam only: { muse?, gemini? } async functions taking
//   the deliberation prompt and returning verdict text (or throwing /
//   returning empty for the down path). Production callers pass nothing
//   and get the two real voices. Only an empty task throws.
//
// The Compass gate lives in the /api/council route, not here: reaching
// deliberation means the task passed the gate, so approved is true
// whenever at least one live verdict exists.

import { generateMuseReply } from '../muse/responder.js';
import { runHumanAI } from './engine.js';

const MUSE_FOCUS = 'User-first judgment';
const GEMINI_FOCUS = 'Long-term analytical patterns';

const MUSE_DOWN = 'Muse is offline right now — no verdict from this voice.';
const GEMINI_DOWN = 'Gemini is offline right now — no verdict from this voice.';

const STOPWORDS = new Set(
  'a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,do,does,did,doing,have,has,had,having,i,you,he,she,it,we,they,them,this,that,these,those,my,your,his,her,its,our,their,me,him,us,what,when,where,which,who,whom,how,why,can,could,should,would,will,just,very,more,most,not,no,yes,please,into,out,up,down,over,under,again,once,some,any,all,each,both,few,many,such,only,own,same,so,than,too,also,there,here,now,today'.split(',')
);

function profileTask(raw) {
  const task = String(raw).trim();
  const words = task.split(/\s+/).filter(Boolean);
  const lower = task.toLowerCase();
  const keyTerms = [
    ...new Set(
      words
        .map((w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, ''))
        .filter((w) => w.length > 4 && !STOPWORDS.has(w))
        .slice(0, 6)
    ),
  ];
  const headline = task.length > 90 ? task.slice(0, 90).replace(/\s\S*$/, '') + '…' : task;
  const firstClause = task.split(/[.!?;]/)[0].trim().slice(0, 120);
  const core = firstClause.length < 6 ? headline : firstClause;

  const isQuestion = /[?]\s*$/.test(task) || /^(what|how|why|when|where|which|who|can|could|should|is|are|do|does)\b/i.test(task);
  const isBuild = /\b(build|create|make|write|code|generate|design|implement|script|app|website|module)\b/i.test(task);
  const isPlan = /\b(plan|strategy|roadmap|steps|phases|timeline|schedule|organize)\b/i.test(task);
  const hasSteps = /(^|\n)\s*(\d+[.)]|[*\-•])/m.test(task);
  const hasCode = /[{}();=<>/\\]|```/.test(task);
  const isVague = words.length < 8 && !isQuestion && !isBuild && !isPlan;

  let kind = 'exploration';
  if (isQuestion) kind = 'question';
  else if (isBuild) kind = 'build request';
  else if (isPlan) kind = 'planning request';

  return {
    headline,
    core,
    kind,
    keyTerms,
    wordCount: words.length,
    hasQuestion: isQuestion,
    isPlan,
    isBuild,
    hasSteps,
    hasCode,
    isVague,
  };
}

function scoreNurture(task, profile) {
  // Deterministic alignment estimate (Compass has already gated violations).
  // 6–10 scale: base 7, adjusted by tone keywords found in the task.
  const lower = task.toLowerCase();
  const positive = ['build', 'create', 'learn', 'help', 'grow', 'improve', 'design', 'plan', 'understand', 'make', 'better', 'kind', 'thank'];
  const negative = ['stuck', 'broken', 'fail', 'wrong', 'confused', 'hard', 'problem', 'issue', 'bug', 'crash'];
  let score = 7;
  for (const w of positive) if (lower.includes(w)) score += 0.5;
  for (const w of negative) if (lower.includes(w)) score -= 0.5;
  if (profile.wordCount > 40) score += 0.5; // detailed context reads as constructive
  return Math.max(6, Math.min(10, Math.round(score)));
}

// One voice's verdict: live text on success, honest down message on any
// failure (throw, empty, or null). Never fabricates.
async function voiceVerdict(voice, prompt, downText) {
  try {
    const text = await voice(prompt);
    if (typeof text === 'string' && text.trim()) {
      return { live: true, verdict: text.trim() };
    }
  } catch {
    // Fall through to the down message — the failure itself is reported,
    // never papered over with a made-up verdict.
  }
  return { live: false, verdict: downText };
}

export async function evaluateHarvest(task, voices = {}) {
  const clean = String(task ?? '').trim();
  if (!clean) {
    throw new Error('The Council needs a task to deliberate.');
  }

  const profile = profileTask(clean);
  const nurture_score = scoreNurture(clean, profile);

  const museVoice =
    voices.muse ?? ((prompt) => generateMuseReply({ message: prompt, history: [] }));
  const geminiVoice = voices.gemini ?? ((prompt) => runHumanAI(prompt, 'en'));

  const [muse, gemini] = await Promise.all([
    voiceVerdict(
      museVoice,
      `You are deliberating as a council member on this task. Give your verdict in 2–4 sentences, focused on what serves the user best: ${clean}`,
      MUSE_DOWN
    ),
    voiceVerdict(
      geminiVoice,
      `You are deliberating as a council member on this task. Give your verdict in 2–4 sentences, focused on the long-term, well-built answer: ${clean}`,
      GEMINI_DOWN
    ),
  ]);

  const verdicts = [
    { agent: 'Muse', focus: MUSE_FOCUS, verdict: muse.verdict, live: muse.live },
    { agent: 'Gemini', focus: GEMINI_FOCUS, verdict: gemini.verdict, live: gemini.live },
  ];

  const approved = muse.live || gemini.live;

  let consensus;
  let note;
  if (muse.live && gemini.live) {
    consensus =
      `The Council convened on a ${profile.kind} — "${profile.headline}". ` +
      `Muse and Gemini each delivered a live verdict (see cards). ` +
      `Verdict: approved with a nurture score of ${nurture_score}/10. ` +
      `Recommended execution: weigh both verdicts — Muse's user-first read against Gemini's long-term read — and act on where they agree first.`;
    note = 'LIVE COUNCIL — Muse + Gemini deliberation';
  } else if (approved) {
    const liveName = muse.live ? 'Muse' : 'Gemini';
    const downName = muse.live ? 'Gemini' : 'Muse';
    consensus =
      `The Council convened on a ${profile.kind} — "${profile.headline}". ` +
      `${downName} was offline, so the Council heard ${liveName} alone; no verdict was fabricated for the offline voice. ` +
      `Verdict: approved on the live verdict, with a nurture score of ${nurture_score}/10.`;
    note = `LIVE COUNCIL — ${liveName} live, ${downName} offline (no verdict fabricated)`;
  } else {
    consensus =
      `The Council could not convene — both Muse and Gemini are offline right now. ` +
      `No verdicts were fabricated; try again in a moment.`;
    note = 'COUNCIL OFFLINE — both voices unavailable';
  }

  return {
    task: clean,
    verdicts,
    approved,
    nurture_score,
    consensus,
    note,
  };
}
