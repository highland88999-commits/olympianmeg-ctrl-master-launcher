// lib/human-ai/consensus.js — The Council: multi-agent deliberation for /human-ai.
//
// Each council member is a DELIBERATION PERSONA: a deterministic, local analysis
// lens applied to the user's task. These are NOT live calls to third-party
// models — no network, no API keys, no quota. The UI labels them honestly as
// simulated council personas.
//
// evaluateHarvest(task) -> {
//   task, verdicts: [{ agent, focus, verdict }], approved, nurture_score, consensus
// }

const COUNCIL = [
  {
    name: 'Gemini Prime',
    focus: 'Long-term analytical patterns',
    deliberate: (task, profile) =>
      `Analytical read of "${profile.headline}": this is a ${profile.kind} request built around ` +
      `${profile.keyTerms.length ? profile.keyTerms.join(', ') : 'a single open question'}. ` +
      `Pattern check: ${profile.hasQuestion ? 'it asks a direct question — answerable in one pass. ' : ''}` +
      `${profile.isPlan ? 'It spans multiple steps — break it into phases with clear exit criteria. ' : ''}` +
      `${profile.isBuild ? 'It implies construction — confirm the deliverable and the constraints before starting. ' : ''}` +
      `Long-term view: the same structure recurs in future requests, so solving it cleanly once pays off repeatedly.`,
  },
  {
    name: 'Copilot Beta',
    focus: 'Practical logic and code utility',
    deliberate: (task, profile) =>
      `Practical read of "${profile.headline}": ${profile.wordCount} words, ` +
      `${profile.hasSteps ? 'already carries step structure — keep it, tighten it. ' : 'no explicit steps — impose a short ordered checklist. '}` +
      `${profile.hasCode ? 'Code or technical terms detected — respond with something runnable, not just described. ' : ''}` +
      `Utility test: after this answer, the user should be able to act within five minutes. ` +
      `Strip anything that does not move them toward that.`,
  },
  {
    name: 'Grok X',
    focus: 'Raw efficiency and unfiltered truth',
    deliberate: (task, profile) =>
      `Efficient read of "${profile.headline}": the core ask is "${profile.core}". ` +
      `${profile.isVague ? 'This is underspecified — the honest move is one sharp clarifying question, not a padded guess. ' : 'This is concrete enough to answer directly. '}` +
      `Shortest path: ${profile.core}. Everything else is scaffolding — keep it only if it saves time later.`,
  },
];

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
  const headline = task.length > 90 ? task.slice(0, 90).replace(/\s+\S*$/, '') + '…' : task;
  const firstClause = task.split(/[.!?;]/)[0].trim().slice(0, 120);
  const core = firstClause.length < 6 ? headline : firstClause;

  const isQuestion = /[?]\s*$/.test(task) || /^(what|how|why|when|where|which|who|can|could|should|is|are|do|does)\b/i.test(task);
  const isBuild = /\b(build|create|make|write|code|generate|design|implement|script|app|website|module)\b/i.test(task);
  const isPlan = /\b(plan|strategy|roadmap|steps|phases|timeline|schedule|organize)\b/i.test(task);
  const hasSteps = /(^|\n)\s*(\d+[.)]|\*|-|•)/m.test(task);
  const hasCode = /[{}();=<>\/\\]|```/.test(task);
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

export async function evaluateHarvest(task) {
  const clean = String(task ?? '').trim();
  if (!clean) {
    throw new Error('The Council needs a task to deliberate.');
  }

  const profile = profileTask(clean);
  const verdicts = COUNCIL.map((member) => ({
    agent: member.name,
    focus: member.focus,
    verdict: member.deliberate(clean, profile),
  }));

  const nurture_score = scoreNurture(clean, profile);
  const approved = true; // reached only after Compass gates the task

  const consensus =
    `The Council convened on a ${profile.kind} — "${profile.headline}". ` +
    `Gemini Prime maps the structure, Copilot Beta extracts the actionable path, and Grok X cuts it to the core: ${profile.core}. ` +
    `Verdict: approved with a nurture score of ${nurture_score}/10. ` +
    `Recommended execution: follow the practical checklist, keep the shortest path in view, and solve it in a way that survives the next time the same shape of request appears.`;

  return {
    task: clean,
    verdicts,
    approved,
    nurture_score,
    consensus,
  };
}
