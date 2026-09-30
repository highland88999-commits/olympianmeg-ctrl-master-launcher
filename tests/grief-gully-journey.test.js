// tests/grief-gully-journey.test.js
// Headless tests for the Grief Gully media archive. Run: node tests/grief-gully-journey.test.js
// (from the repo root). No browser, no network.
import { readFileSync } from 'fs';
import { TRACKS, getTrack, youtubeEmbedUrl, mediaReducer, initialMediaState } from '../app/grief-gully/journey.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- film clip mapping (from the highland88999 Grief-Gully repo media archive) ---
const EXPECTED = {
  'batty-rap': 'PiOVFkbHaeI',
  'toxic-love': 'hr4knvNNgtU',
  'end-of-hexxus': '91Rvj0Ftp6s',
};

t('three tracks, one per archive video', TRACKS.length === 3);

for (const [trackId, videoId] of Object.entries(EXPECTED)) {
  const track = getTrack(trackId);
  t(`track ${trackId} exists`, !!track);
  t(`track ${trackId} maps to video ${videoId}`, track && track.youtubeId === videoId);
  t(`track ${trackId} has a video title`, !!(track && track.videoTitle && track.videoTitle.length > 0));
}

t('every track carries a valid 11-char video id',
  TRACKS.every((tr) => /^[\w-]{11}$/.test(tr.youtubeId || '')));

t('video ids are unique', new Set(TRACKS.map((tr) => tr.youtubeId)).size === TRACKS.length);

t('youtubeEmbedUrl builds the embed url',
  youtubeEmbedUrl('PiOVFkbHaeI') === 'https://www.youtube.com/embed/PiOVFkbHaeI?rel=0');

t('youtubeEmbedUrl rejects garbage',
  youtubeEmbedUrl('nope') === null && youtubeEmbedUrl('') === null && youtubeEmbedUrl(null) === null);

// --- the page renders each clip as an expanding option ---
const pageSrc = readFileSync('app/grief-gully/page.jsx', 'utf8');
t('page renders film-clip details expanders', pageSrc.includes('className="film-clip"'));
t('page uses native details/summary', pageSrc.includes('<details') && pageSrc.includes('<summary>'));
t('page lazy-loads the iframe only when opened',
  pageSrc.includes('openClips[track.id]') && pageSrc.includes('loading="lazy"'));
t('page stops generative audio when a clip opens', pageSrc.includes('if (open) stopGenerative()'));
t('page has film-clip styles', pageSrc.includes('.film-frame') && pageSrc.includes('aspect-ratio: 16 / 9'));
t('iframe has an accessible title', pageSrc.includes('title={track.videoTitle}'));

// --- existing media state machine still intact ---
t('media reducer initial state', JSON.stringify(initialMediaState) === JSON.stringify({ activeTrackId: null, playing: false }));
const s1 = mediaReducer(initialMediaState, { type: 'TOGGLE', id: 'batty-rap' });
t('TOGGLE starts a track', s1.playing && s1.activeTrackId === 'batty-rap');
const s2 = mediaReducer(s1, { type: 'STOP' });
t('STOP clears', !s2.playing && s2.activeTrackId === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
