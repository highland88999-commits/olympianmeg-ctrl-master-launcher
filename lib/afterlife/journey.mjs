// Journey data for /the-afterlife ("Elysium Odyssey").
// A contemplative art piece: tap-to-continue through calm procedural scenes.
// Pure data + pure progression logic — no DOM, no network.
// Tone: comforting and honest. Nothing here is presented as fact about
// what comes after death; it is an imagined quiet, a place to rest.

export const SCENES = [
  {
    id: 'gate',
    art: 'gate',
    palette: { sky: ['#05030a', '#141026'], glow: '#c5a059', ground: '#0a0812' },
    title: 'The Gate',
    lines: [
      'You have arrived.',
      'There is no hurry here. Take your time.',
    ],
  },
  {
    id: 'threshold',
    art: 'gate',
    palette: { sky: ['#0a0812', '#1c1633'], glow: '#e8c876', ground: '#0d0a16' },
    title: 'The Threshold',
    lines: [
      'Step through slowly.',
      'Whatever you carried, you may set it down now. Nothing is asked of you.',
    ],
  },
  {
    id: 'river',
    art: 'river',
    palette: { sky: ['#04101c', '#0a2438'], glow: '#7fd4e8', ground: '#06202e' },
    title: 'The Quiet River',
    lines: [
      'The water moves slowly, and it asks nothing back.',
      'Watch it a while. That is enough.',
    ],
  },
  {
    id: 'fields',
    art: 'fields',
    palette: { sky: ['#0b1220', '#1d3320'], glow: '#d8e08a', ground: '#14230f' },
    title: 'The Fields',
    lines: [
      'The grass is soft, and the light is kind.',
      'Somewhere, your name is still spoken with love.',
    ],
  },
  {
    id: 'grove',
    art: 'grove',
    palette: { sky: ['#06120e', '#10261c'], glow: '#9fe8b4', ground: '#081a12' },
    title: 'The Grove',
    lines: [
      'Rest beneath the trees.',
      'The shade holds you gently. There is nothing you must earn here.',
    ],
  },
  {
    id: 'stars',
    art: 'stars',
    palette: { sky: ['#020208', '#0a0a24'], glow: '#00f3ff', ground: '#05051a' },
    title: 'The Stars',
    lines: [
      'Look up.',
      'You are not lost. You are only small — and that is alright.',
    ],
  },
  {
    id: 'dawn',
    art: 'dawn',
    palette: { sky: ['#1a0f1c', '#4a2a3a'], glow: '#ffb469', ground: '#241420' },
    title: 'The Dawn',
    lines: [
      'Morning comes the way it always did — gently.',
      'Every ending you feared has softened into this.',
    ],
  },
  {
    id: 'rest',
    art: 'rest',
    palette: { sky: ['#0e0a18', '#241a3a'], glow: '#c9a8ff', ground: '#120d20' },
    title: 'The Rest',
    lines: [
      'You can linger here as long as you like.',
      'This is only a story made of light — an imagined quiet, not a doctrine.',
      'When you are ready, the world is still there, waiting patiently.',
    ],
  },
];

export const SCENE_COUNT = SCENES.length;

export function sceneByIndex(i) {
  if (typeof i !== 'number' || i < 0 || i >= SCENES.length) return null;
  return SCENES[i];
}

export function initialJourney() {
  return { stage: 'gatekeeper', index: 0 };
}

/**
 * Journey state machine.
 * stages: 'gatekeeper' -> 'scene' (index 0..n-1). Beyond the last scene stays
 * on the final scene; PREV can step back; RESTART returns to gatekeeper.
 */
export function journeyReducer(state, action) {
  switch (action.type) {
    case 'BEGIN':
      return state.stage === 'gatekeeper' ? { stage: 'scene', index: 0 } : state;
    case 'NEXT':
      if (state.stage !== 'scene') return state;
      return { stage: 'scene', index: Math.min(state.index + 1, SCENES.length - 1) };
    case 'PREV':
      if (state.stage !== 'scene') return state;
      if (state.index === 0) return { stage: 'gatekeeper', index: 0 };
      return { stage: 'scene', index: state.index - 1 };
    case 'RESTART':
      return initialJourney();
    default:
      return state;
  }
}

export function isFinalScene(state) {
  return state.stage === 'scene' && state.index === SCENES.length - 1;
}
