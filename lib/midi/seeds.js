// lib/midi/seeds.js
// Bundled seed entries for the Maestro universal MIDI library.
// These ship with the app so the library works even before the Supabase
// table exists; the /api/midi/library route merges them under DB rows and
// suppresses any seed whose hash is already in the database.

export const MIDI_SEEDS = [
  {
    id: 'seed-axel-f-1',
    title: 'Axel F',
    artist: 'Harold Faltermeyer',
    url: '/midi/axel-f-1.mid',
    hash: '7382306b143ea3a8e9612a1a07462ad345600db4296ae56865e5b4d9cc92123f',
    size: 38222,
    duration: 183.22,
    tracks: 10,
    notes: 4466,
    uses: 1,
    seed: true,
  },
];
