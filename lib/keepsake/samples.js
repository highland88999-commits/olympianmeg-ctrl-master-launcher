// lib/keepsake/samples.js
// The three sample scenes a visitor can try without uploading a photo.
// Real photographs, generated for Keepsake (Nov 17, 2026) — a snowy
// cabin at dusk, a frozen mountain lake at sunrise, a snowy cottage
// garden. 1920x1280, in public/images/keepsake/.

export const SAMPLES = [
  { key: 'cabin', label: 'Cabin', src: '/images/keepsake/cabin.jpg' },
  { key: 'lake', label: 'Lake', src: '/images/keepsake/lake.jpg' },
  { key: 'garden', label: 'Garden', src: '/images/keepsake/garden.jpg' },
];

export const DEFAULT_SAMPLE = 'cabin';

export function sampleByKey(key) {
  return SAMPLES.find((s) => s.key === key) || SAMPLES[0];
}
