/**
 * curriculum.js — the Olympian Education course catalog.
 *
 * The source page was three drifting orbs that opened external school
 * websites inside iframes (Harvard, Khan Academy, Codecademy, …) over a
 * hotlinked background video. This module keeps the orbital idea but the
 * lessons live here: an original mini-curriculum of twelve lessons across
 * three schools, with progress tracked on the visitor's own device.
 */

export const STORAGE_KEY = "olympian-education-progress-v1";

export const SCHOOLS = [
  {
    id: "athens",
    name: "Wisdom of Athens",
    color: "#d4af37",
    tagline: "Philosophy, history, and the examined life.",
  },
  {
    id: "scrolls",
    name: "The Open Scrolls",
    color: "#00f2ff",
    tagline: "Science and nature, explained plainly.",
  },
  {
    id: "forge",
    name: "The Forge",
    color: "#b06dff",
    tagline: "Craft and code — how things are made.",
  },
];

export const LESSONS = [
  {
    id: "socratic",
    school: "athens",
    title: "The Socratic Method",
    minutes: 6,
    intro:
      "Socrates, a stonecutter's son in ancient Athens, claimed he knew nothing — and then proved everyone else knew less than they thought. His method is simple: keep asking questions until the weak ideas fall apart.",
    points: [
      "Start with a claim you believe, e.g. 'courage is never running away.'",
      "Ask for a definition, then hunt for a counterexample — a soldier who retreats to save their unit is still courageous.",
      "Refine the claim and repeat. The surviving idea is stronger for the beating it took.",
    ],
    tryIt:
      "Pick something you 'know' — like what makes a good friend — and ask 'why?' five times in a row. Write down where the answers start getting interesting.",
  },
  {
    id: "democracy",
    school: "athens",
    title: "Democracy Is Born",
    minutes: 7,
    intro:
      "Around 508 BCE, Athens tried something no city had done: letting ordinary citizens vote on the laws. It was messy, loud, and limited — but the seed of every modern democracy.",
    points: [
      "Citizens (free adult men — a narrow group by our standards) voted directly on laws in the assembly, not just for representatives.",
      "Many offices were filled by lottery, on the theory that any citizen could govern.",
      "Ostracism let citizens vote to exile a politician for ten years — democracy with a safety valve.",
    ],
    tryIt:
      "Think of one decision in your life usually made by one person. How would you redesign it so everyone affected gets a real vote?",
  },
  {
    id: "alphabet",
    school: "athens",
    title: "The Greek Alphabet",
    minutes: 5,
    intro:
      "The alphabet you are reading descends from Greek letters. The Greeks took the Phoenician script and did something revolutionary: they wrote down the vowels.",
    points: [
      "Alpha, beta, gamma… 'alphabet' is literally alpha + beta.",
      "Vowels made reading learnable by anyone, not just trained scribes — writing exploded across the Mediterranean.",
      "Greek letters still name things: π in math, Δ for change, Ω for ohms, α/β software releases.",
    ],
    tryIt:
      "Write your name in Greek capitals: Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω. Sound it out — many letters match ours.",
  },
  {
    id: "stoicism",
    school: "athens",
    title: "Stoicism in Plain Words",
    minutes: 6,
    intro:
      "The Stoics — Zeno, Epictetus, Marcus Aurelius — taught a practical philosophy for hard times: you can't control what happens, only what you do about it.",
    points: [
      "Split everything into two lists: what you control (your effort, your response) and what you don't (the weather, other people).",
      "Spend your energy only on the first list. The second list is weather — dress for it, don't argue with it.",
      "Marcus Aurelius wrote his Meditations as private notes to himself, never meant for publication. It became one of history's most-read books.",
    ],
    tryIt:
      "Tonight, write down one thing bothering you. Draw the two lists. Notice how much of the worry sits in the 'can't control' column.",
  },
  {
    id: "pythagoras",
    school: "scrolls",
    title: "The Pythagorean Theorem",
    minutes: 6,
    intro:
      "For any right triangle, the square on the longest side equals the sum of the squares on the other two: a² + b² = c². Builders, navigators, and game programmers use it daily.",
    points: [
      "The 3-4-5 triangle is the classic: 9 + 16 = 25, so the hypotenuse is 5.",
      "Carpenters use it to check square corners — measure 3 units along one wall, 4 along the other; the diagonal must be 5.",
      "It works in reverse too: if a² + b² = c², the corner is exactly square.",
    ],
    tryIt:
      "Measure your phone's screen width and height. Square both, add them, take the square root — that's the diagonal. Check it with a ruler.",
  },
  {
    id: "nightsky",
    school: "scrolls",
    title: "Reading the Night Sky",
    minutes: 7,
    intro:
      "You can navigate, tell time, and track seasons with nothing but your eyes. Start with three landmarks and the sky stops being random dots.",
    points: [
      "Find the Big Dipper: the two stars at the end of its 'bowl' point straight at Polaris, the North Star.",
      "Polaris sits almost directly above the North Pole, so it barely moves all night — every other star wheels around it.",
      "Orion's belt — three stars in a row — rises in winter evenings and sets in spring. Farmers used such risings as calendars.",
    ],
    tryIt:
      "On the next clear night, find the Big Dipper and trace to Polaris. Note the time and direction — you've just read a 3,000-year-old map.",
  },
  {
    id: "levers",
    school: "scrolls",
    title: "Levers with Archimedes",
    minutes: 5,
    intro:
      "'Give me a place to stand and I will move the Earth,' Archimedes boasted. He was describing the lever: a small force, applied far from the pivot, beats a large force close to it.",
    points: [
      "A lever multiplies force by the ratio of the arms: push twice as far from the fulcrum, get twice the lift.",
      "Seesaws, crowbars, bottle openers, and your own forearm are all levers.",
      "Archimedes also ran naked through Syracuse shouting 'Eureka!' after solving a buoyancy puzzle in his bath. Science has always been like this.",
    ],
    tryIt:
      "Open a heavy door by pushing near the hinge, then near the handle. Feel the difference — that ratio is the lever at work.",
  },
  {
    id: "watercycle",
    school: "scrolls",
    title: "The Water Cycle",
    minutes: 5,
    intro:
      "The water in your glass is older than the mountains — every drop has been ocean, cloud, rain, and river countless times. Nothing is created or destroyed; it just travels.",
    points: [
      "Evaporation lifts water from oceans and lakes; plants add their share through transpiration.",
      "Rising air cools, vapor condenses on dust particles, and clouds form.",
      "Precipitation returns it to land, where it flows downhill and the loop restarts. A drop can circle the planet in about nine days as vapor.",
    ],
    tryIt:
      "Put a clear glass of water on a sunny windowsill with plastic wrap over the top. Check back in a few hours — you've built a tiny weather system.",
  },
  {
    id: "binary",
    school: "forge",
    title: "How Binary Works",
    minutes: 6,
    intro:
      "Every photo, song, and message on your device is stored as switches: on or off, 1 or 0. Counting with just two digits turns out to be enough for everything.",
    points: [
      "Each position doubles in value: 1, 2, 4, 8, 16… So 1011 means 8 + 2 + 1 = 11.",
      "Eight switches make a byte — 256 possible values, enough for every letter, digit, and symbol you type.",
      "Transistors are the physical switches: billions of them flipping billions of times per second is what 'computing' is.",
    ],
    tryIt:
      "Count to 31 on one hand using binary — each finger is a switch (folded = 0, up = 1). Thumb is 16, index is 8, and so on.",
  },
  {
    id: "algorithms",
    school: "forge",
    title: "What Is an Algorithm?",
    minutes: 6,
    intro:
      "An algorithm is just a recipe: steps so precise that even a machine with no common sense can follow them. You already use them — every recipe, every set of directions, is one.",
    points: [
      "Good algorithms state the input, the steps, and when to stop. 'Stir until thick' is too vague for a computer; 'stir 200 times' is not.",
      "Sorting a hand of cards is an algorithm: scan for the smallest, pull it out, repeat.",
      "The same task can have fast and slow algorithms — finding a name in a sorted list by halving it each time beats checking one by one.",
    ],
    tryIt:
      "Write instructions for making a sandwich so literally that a robot couldn't misunderstand. Then spot the three places it still could.",
  },
  {
    id: "webpage",
    school: "forge",
    title: "Your First Web Page",
    minutes: 8,
    intro:
      "Every website — including this one — is a text file with angle brackets. You can write one in the next five minutes.",
    points: [
      "HTML gives structure: <h1> is a heading, <p> is a paragraph, <button> is a button.",
      "Tags usually come in pairs: <p>hello</p>. The browser renders what's between them.",
      "CSS adds the looks, JavaScript adds the behavior — but HTML alone is already a real web page.",
    ],
    tryIt:
      "Open a text editor, type <h1>Hello, world</h1><p>My first page.</p>, save it as hello.html, and open it in your browser. You're a web developer now.",
  },
  {
    id: "pixels",
    school: "forge",
    title: "Light, Color and Pixels",
    minutes: 6,
    intro:
      "Your screen fakes every color with just three: red, green, and blue. Each pixel is three tiny lamps, and your eye blends them from a distance.",
    points: [
      "Red + green light makes yellow — that's why #FFFF00 is yellow on screens, though it's nothing like mixing paint.",
      "All three at full blast make white; all off is black. Everything else is a ratio.",
      "A 1080p screen has over 2 million pixels × 3 lamps = 6 million tiny lights, refreshed 60+ times a second.",
    ],
    tryIt:
      "Put a drop of water on your phone screen (carefully!) — it magnifies the pixels and you'll see the red, green, and blue stripes.",
  },
];

export function schoolById(id) {
  return SCHOOLS.find((s) => s.id === id) || null;
}

export function lessonsForSchool(schoolId) {
  return LESSONS.filter((l) => l.school === schoolId);
}

/** Pure progress math over a list of completed lesson ids. */
export function getProgress(completedIds) {
  const done = new Set(completedIds);
  const bySchool = {};
  for (const s of SCHOOLS) {
    const lessons = lessonsForSchool(s.id);
    const n = lessons.filter((l) => done.has(l.id)).length;
    bySchool[s.id] = { done: n, total: lessons.length, pct: Math.round((n / lessons.length) * 100) };
  }
  const overallPct = Math.round((done.size / LESSONS.length) * 100);
  return { bySchool, overallPct, totalDone: done.size, total: LESSONS.length };
}

/** Pure toggle helper for the completed-id list. */
export function toggleCompleted(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function loadProgress(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => LESSONS.some((l) => l.id === id)) : [];
  } catch {
    return [];
  }
}

export function saveProgress(storage, list) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage full or unavailable — progress just won't persist
  }
}
