// reflection-engine.js — the Magic Mirror's "voice".
//
// A small, fully local word-mirror: it reads the visitor's prompt, detects a
// theme, and composes a reflective, open-ended reply from hand-written lines.
// There is no network, no model, no randomness beyond an explicitly supplied
// seed — reflect(prompt, {seed, turn}) is deterministic, which keeps it honest
// and testable. This is a contemplative toy, not a therapist and not an AI
// service. No DOM, no browser APIs: pure functions only.

export const MAX_PROMPT_LENGTH = 500;

// FNV-1a 32-bit hash — turns any string into a stable uint32 seed.
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — tiny seeded PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Prompt hygiene
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  "a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,should,now,i,me,my,myself,we,our,you,your,he,him,his,she,her,it,its,they,them,their,what,which,who,whom,this,that,these,those,am,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,i'm,im,don't,doesn't,isn't,aren't,wasn't,it's,that's,there's,i've,you're,we're,they're".split(
    ","
  )
);

export function sanitizePrompt(raw) {
  if (typeof raw !== "string") return "";
  return (
    raw
      // strip control characters (keep tab/newline out too — single block of text)
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_PROMPT_LENGTH)
  );
}

// Longest meaningful word — what the mirror "hears" most clearly.
export function echoWord(prompt) {
  const words = prompt.toLowerCase().match(/[a-z\u00c0-\u024f']+/g) || [];
  let best = "";
  for (const w of words) {
    const clean = w.replace(/^'+|'+$/g, "");
    if (clean.length >= 4 && !STOPWORDS.has(clean) && clean.length > best.length) {
      best = clean;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Theme detection
// ---------------------------------------------------------------------------

const THEMES = [
  { id: "love", words: ["love", "loved", "lover", "lovers", "heart", "hearts", "romance", "romantic", "crush", "adore", "adoration", "affection", "beloved", "partner", "marriage", "married", "wedding", "relationship"] },
  { id: "grief", words: ["grief", "grieve", "grieving", "loss", "lost", "losing", "miss", "missing", "missed", "gone", "death", "died", "dying", "mourning", "mourn", "farewell", "goodbye", "passed away"] },
  { id: "fear", words: ["fear", "feared", "afraid", "scared", "scary", "anxious", "anxiety", "worried", "worry", "worries", "dread", "dreading", "panic", "nervous", "terror", "terrified", "frightened"] },
  { id: "work", words: ["work", "working", "job", "jobs", "career", "boss", "office", "interview", "promotion", "promoted", "fired", "business", "coworker", "deadline", "meeting", "salary", "paycheck"] },
  { id: "dreams", words: ["dream", "dreams", "dreamt", "dreaming", "wish", "wishes", "wishing", "hope", "hopes", "hoping", "hopeful", "aspire", "aspiration", "ambition", "ambitious", "goal", "goals"] },
  { id: "change", words: ["change", "changing", "changed", "changes", "move", "moving", "moved", "new", "beginning", "begin", "began", "start", "starting", "started", "transition", "leaving", "left", "leaves", "shift", "turning point"] },
  { id: "loneliness", words: ["lonely", "loneliness", "alone", "isolated", "isolation", "solitude", "nobody", "empty", "emptiness", "abandoned", "unseen", "invisible"] },
  { id: "anger", words: ["angry", "anger", "furious", "fury", "rage", "raging", "hate", "hatred", "hated", "resent", "resentment", "bitter", "bitterness", "frustrated", "frustration", "irritated"] },
  { id: "gratitude", words: ["grateful", "gratitude", "thankful", "thanks", "thank", "blessed", "blessing", "appreciate", "appreciation", "lucky", "fortunate"] },
  { id: "future", words: ["future", "tomorrow", "next", "soon", "plan", "plans", "planning", "planned", "ahead", "coming", "eventually", "someday"] },
  { id: "past", words: ["past", "yesterday", "memory", "memories", "remember", "remembered", "childhood", "nostalgia", "nostalgic", "regret", "regrets", "used to", "back then", "history"] },
  { id: "self", words: ["myself", "identity", "self", "worth", "worthy", "worthless", "confidence", "confident", "insecure", "who am i", "myself"] },
  { id: "choice", words: ["choose", "choice", "choices", "decide", "decision", "decisions", "deciding", "whether", "dilemma", "stuck", "option", "options", "crossroads", "torn"] },
  { id: "time", words: ["time", "late", "early", "waiting", "wait", "waits", "patient", "patience", "hurry", "hurried", "slow", "slowly", "years", "months", "days", "ageing", "aging", "growing old"] },
];

function wordRegex(w) {
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + escaped + "\\b", "i");
}

const THEME_PATTERNS = THEMES.map((theme) => ({
  id: theme.id,
  patterns: theme.words.map((w) => ({ re: wordRegex(w), weight: w.length > 5 ? 2 : 1 })),
}));

export function detectTheme(prompt) {
  const text = prompt.toLowerCase();
  let bestId = "mystery";
  let bestScore = 0;
  for (const theme of THEME_PATTERNS) {
    let score = 0;
    for (const p of theme.patterns) {
      if (p.re.test(text)) score += p.weight;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = theme.id;
    }
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// The mirror's voice — hand-written lines, seeded assembly
// ---------------------------------------------------------------------------

const OPENINGS = [
  "The surface stills. Your words hang in the silver a moment.",
  "I take what you give me and hand it back, changed.",
  "Speak, and the glass will keep your echo a little while.",
  "The mirror leans closer. It is listening.",
  "Your reflection settles — and beneath it, your question.",
  "Silver remembers every face. Tonight it remembers your words.",
  "Hush — the glass is clearing.",
  "I am only glass and lamplight, but I can hold a question.",
];

const ECHO_TEMPLATES = [
  (w) => `You carry the word \u201c${w}\u201d — it seems heavier than the rest.`,
  (w) => `\u201c${w}.\u201d Say it again slowly, and notice where it lands.`,
  (w) => `Beneath your question I hear \u201c${w}\u201d knocking softly.`,
  (w) => `The glass returns your \u201c${w}\u201d to you, polished a little brighter.`,
  (w) => `Everything you said orbits one word: \u201c${w}\u201d.`,
];

const CLOSINGS = [
  "The silver settles. I will keep your question a while.",
  "Rest now; the mirror keeps its own counsel.",
  "Carry that gently.",
  "The glass grows quiet. It has said what it can.",
];

const THEME_LINES = {
  love: {
    perspectives: [
      "Love is the one riddle that deepens the more it is solved.",
      "What we love teaches us the shape of our own heart.",
      "Even still water is moved, somewhere, by the moon.",
    ],
    questions: [
      "What would it look like to receive as freely as you give?",
      "When did you last feel loved without having to earn it?",
      "If your heart could speak one honest sentence, what would it say?",
    ],
  },
  grief: {
    perspectives: [
      "Grief is love with nowhere left to go — so it stays, and waits.",
      "The missing never truly leave; they only change address.",
      "Sorrow, given time, becomes a quieter kind of company.",
    ],
    questions: [
      "What would you tell them, if the glass could carry your voice?",
      "Which memory of them feels warmest to hold tonight?",
      "What has their absence taught you about your own tenderness?",
    ],
  },
  fear: {
    perspectives: [
      "Fear is a guard dog that barks at shadows and strangers alike.",
      "Most fears shrink when spoken aloud — the dark dislikes witnesses.",
      "Courage is not the absence of trembling; it is trembling, and stepping anyway.",
    ],
    questions: [
      "What is the smallest step that still counts as forward?",
      "If this fear had a voice, what would it be trying to protect?",
      "What would you do differently if you trusted yourself a little more?",
    ],
  },
  work: {
    perspectives: [
      "A livelihood feeds the body; only meaning feeds the rest.",
      "The work you do shapes you more surely than you shape it.",
      "Even the longest corridor is walked one doorway at a time.",
    ],
    questions: [
      "What part of your work still feels alive to you?",
      "If no one were watching, what would you build?",
      "What are you tolerating that you once swore you would not?",
    ],
  },
  dreams: {
    perspectives: [
      "A wish spoken aloud is a seed that has found soil.",
      "Dreams are rehearsals the soul runs in secret.",
      "The distance between wishing and having is paved with small, unglamorous days.",
    ],
    questions: [
      "What would you attempt if the ending were already kind?",
      "Which dream have you been postponing — and what is it waiting for?",
      "What does the life you want actually feel like, day to day?",
    ],
  },
  change: {
    perspectives: [
      "Every threshold looks like an ending from one side, a beginning from the other.",
      "The river never asks the stone for permission to keep moving.",
      "You have survived every change so far. The record is perfect.",
    ],
    questions: [
      "What are you carrying that belongs to the old shore?",
      "If this change were a door, what would you hope is on the other side?",
      "What small ritual could steady you while everything shifts?",
    ],
  },
  loneliness: {
    perspectives: [
      "Solitude and loneliness share a room, but they are not the same guest.",
      "The glass sees you, even now. Being witnessed is a kind of company.",
      "Loneliness is often the heart's way of saying it is ready.",
    ],
    questions: [
      "Who would you call, if calling felt easy?",
      "What kind of company does your spirit actually crave?",
      "When did you last feel truly seen?",
    ],
  },
  anger: {
    perspectives: [
      "Anger is usually grief or fear wearing armor.",
      "Fire kept in the hands burns the holder first.",
      "Beneath the heat, something you care about is being threatened.",
    ],
    questions: [
      "What boundary of yours was crossed?",
      "If the anger could speak plainly, without the shouting, what would it say?",
      "What would repair look like here — not revenge, but repair?",
    ],
  },
  gratitude: {
    perspectives: [
      "Gratitude is the glass wiped clean — suddenly everything is visible.",
      "What is noticed grows; thankfulness is a kind of watering.",
      "The ordinary, truly seen, is never ordinary.",
    ],
    questions: [
      "What small, unremarkable thing held you up today?",
      "Who deserves to hear your thanks, and has not yet?",
      "What would this moment look like through grateful eyes?",
    ],
  },
  future: {
    perspectives: [
      "The future is a room you are already furnishing with today's choices.",
      "Tomorrow is built from the materials of this evening.",
      "Uncertainty is the price of a story not yet written.",
    ],
    questions: [
      "What one choice today would your future self thank you for?",
      "What are you hoping for, underneath the planning?",
      "If the future wrote you a letter, what would you want it to say?",
    ],
  },
  past: {
    perspectives: [
      "Memory is a mirror too — and it edits as surely as glass distorts.",
      "The past is a place of reference, not a place of residence.",
      "What happened shaped you; it need not steer you.",
    ],
    questions: [
      "Which memory keeps knocking — and what does it want?",
      "What would you say to the younger self in that memory?",
      "What have you already forgiven, and what is still asking?",
    ],
  },
  self: {
    perspectives: [
      "You are the one face you can never see directly — hence the mirror.",
      "Identity is not found; it is authored, daily.",
      "The self is less a statue and more a weather.",
    ],
    questions: [
      "Who are you when no one needs anything from you?",
      "What truth about yourself have you been circling?",
      "What would it mean to befriend the person in the glass?",
    ],
  },
  choice: {
    perspectives: [
      "Not choosing is itself a choice — the glass reflects that too.",
      "Every path costs the others; that is what makes choosing sacred.",
      "Clarity often arrives after the step, not before it.",
    ],
    questions: [
      "What would you choose if you could not get it wrong?",
      "Which option keeps returning to you in quiet moments?",
      "What is the fear underneath the indecision?",
    ],
  },
  time: {
    perspectives: [
      "Time does not hurry, yet everything is accomplished — slowly, then all at once.",
      "Waiting is not empty; it is the kiln where patience is fired.",
      "The present is the only room you can actually stand in.",
    ],
    questions: [
      "What are you rushing toward — and what might you be rushing past?",
      "If you had one unhurried hour, how would you spend it?",
      "What is this season of waiting preparing in you?",
    ],
  },
  mystery: {
    perspectives: [
      "Some questions are doors; some are windows. This one seems to be both.",
      "The glass reflects the question back — sometimes that is the whole answer.",
      "Not every riddle wants solving; some want sitting-with.",
    ],
    questions: [
      "What drew you to ask this, of all things, tonight?",
      "If the answer came as a feeling rather than words, what would it be?",
      "What would change if you already knew the answer?",
    ],
  },
};

const SILENCE_LINES = [
  "The glass waits.",
  "It cannot reflect what is not offered.",
  "Speak when you are ready — even a single word will do.",
];

// ---------------------------------------------------------------------------
// reflect(prompt, { seed, turn }) -> { lines, theme, word, promptUsed }
// Deterministic for a given (prompt, seed, turn).
// ---------------------------------------------------------------------------

export function reflect(rawPrompt, opts = {}) {
  const seed = (opts.seed >>> 0) || 1;
  const turn = opts.turn >>> 0 || 0;
  const prompt = sanitizePrompt(rawPrompt);

  if (!prompt) {
    return { lines: SILENCE_LINES.slice(), theme: "silence", word: "", promptUsed: "" };
  }

  const rng = mulberry32(hashSeed(prompt + "|" + seed + "|" + turn));
  const theme = detectTheme(prompt);
  const bank = THEME_LINES[theme] || THEME_LINES.mystery;
  const word = echoWord(prompt);

  const lines = [];
  lines.push(pick(rng, OPENINGS));
  if (word) {
    lines.push(pick(rng, ECHO_TEMPLATES)(word));
  } else {
    lines.push("No single word rises above the rest — the whole of it matters.");
  }
  lines.push(pick(rng, bank.perspectives));
  lines.push(pick(rng, bank.questions));
  if (rng() < 0.35) {
    lines.push(pick(rng, CLOSINGS));
  }

  return { lines, theme, word, promptUsed: prompt };
}
