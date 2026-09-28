// Pure logic for the Grief Gully pocket universe.
// No DOM, no network, no storage side effects here — the page wires these in.

export const INTRO_STAGES = ["resting", "entering", "present"];

export function nextIntroStage(stage) {
  const i = INTRO_STAGES.indexOf(stage);
  if (i === -1) return "resting";
  return INTRO_STAGES[Math.min(i + 1, INTRO_STAGES.length - 1)];
}

export const TRACKS = [
  {
    id: "batty-rap",
    title: "The Batty Rap",
    note: "A slow pulse underneath quiet words. Take what you need from it.",
    character: "pulse",
  },
  {
    id: "toxic-love",
    title: "Toxic Love",
    note: "Warm, drifting tones for the heavy hours.",
    character: "drift",
  },
  {
    id: "end-of-hexxus",
    title: "End of Hexxus",
    note: "A descending line that resolves — nothing stays at the bottom.",
    character: "resolve",
  },
];

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || null;
}

// Media archive state machine: { activeTrackId, playing }
export const initialMediaState = { activeTrackId: null, playing: false };

export function mediaReducer(state, action) {
  switch (action.type) {
    case "PLAY": {
      if (!getTrack(action.id)) return state;
      return { activeTrackId: action.id, playing: true };
    }
    case "STOP":
      return { activeTrackId: null, playing: false };
    case "TOGGLE": {
      if (!getTrack(action.id)) return state;
      if (state.activeTrackId === action.id && state.playing) {
        return { activeTrackId: null, playing: false };
      }
      return { activeTrackId: action.id, playing: true };
    }
    default:
      return state;
  }
}

export const STORAGE_KEYS = {
  journal: "griefgully_journal_v1",
  ink: "griefgully_ink_v1",
};

let entrySeq = 0;

export function addEntry(entries, text, now = Date.now()) {
  const clean = String(text).trim();
  if (!clean) return entries;
  entrySeq += 1;
  const entry = {
    id: `${now}-${entrySeq}`,
    text: clean,
    createdAt: now,
  };
  return [...entries, entry];
}

export function removeEntry(entries, id) {
  return entries.filter((e) => e.id !== id);
}

export const RESOURCE_LINKS = [
  {
    name: "BetterHelp",
    href: "https://www.betterhelp.com",
    blurb: "Professional online therapy with licensed counselors.",
  },
  {
    name: "Calm",
    href: "https://www.calm.com",
    blurb: "Guided meditations and sleep stories for restless minds.",
  },
  {
    name: "Woebot",
    href: "https://www.woebothealth.com",
    blurb: "A conversational mental-health companion built with clinicians.",
  },
  {
    name: "988 Suicide & Crisis Lifeline",
    href: "https://988lifeline.org",
    blurb: "Free, confidential support in the US — call or text 988, anytime.",
  },
];

export const HONEST_NOTE =
  "Grief Gully is not a therapist. It cannot counsel you, understand your loss, " +
  "or heal your grief. It is simply a quiet place to sit with what you feel. " +
  "If grief ever feels like more than you can carry alone, please reach out to " +
  "a licensed professional or a crisis line such as the 988 Lifeline (US).";

export const INTRO_LINES = [
  "There is no right way to grieve.",
  "You do not have to be strong here.",
  "Stay as long as you like.",
];
