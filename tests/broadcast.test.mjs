// Vocal broadcast system: changer presets, path rules, pointer shape,
// owner-gated routes, studio hold-to-talk, site-wide listener.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BROADCAST_MAX_SECONDS,
  BROADCAST_PRESETS,
  isBroadcastPath,
  latestJsonUrl,
  normalizeAudioType,
  pickMime,
  validateLatest,
} from '../lib/broadcast/voice-changer.js';

test('presets: deep/high shift pitch, robot distorts, original passes through', () => {
  assert.equal(BROADCAST_PRESETS.original.pitch, 1);
  assert.equal(BROADCAST_PRESETS.original.robot, false);
  assert.ok(BROADCAST_PRESETS.deep.pitch < 1);
  assert.ok(BROADCAST_PRESETS.high.pitch > 1);
  assert.equal(BROADCAST_PRESETS.robot.robot, true);
  assert.equal(BROADCAST_MAX_SECONDS, 120);
});

test('mime normalization strips codec parameters', () => {
  assert.equal(normalizeAudioType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioType('audio/mp4'), 'audio/mp4');
});

test('pickMime falls back cleanly without a recorder', () => {
  assert.equal(pickMime(['audio/webm']), '');
});

test('clip paths must live under the sender own folder', () => {
  assert.equal(isBroadcastPath('clips/u1/abc.webm', 'u1'), true);
  assert.equal(isBroadcastPath('clips/u2/abc.webm', 'u1'), false);
  assert.equal(isBroadcastPath('clips/u1/../x.webm', 'u1'), false);
  assert.equal(isBroadcastPath('clips/u1/a/b.webm', 'u1'), false);
  assert.equal(isBroadcastPath('clips/u1/abc.mp3', 'u1'), false);
});

test('latest pointer validation rejects junk before any page trusts it', () => {
  const good = validateLatest({
    id: 'clips/u1/x.webm', audioUrl: 'https://example.supabase.co/storage/v1/object/public/broadcasts/clips/u1/x.webm',
    preset: 'deep', durationMs: 4000, createdAt: 123,
  });
  assert.ok(good && good.preset === 'deep');
  assert.equal(validateLatest({ audioUrl: 'http://evil/x', preset: 'deep', createdAt: 1 }), null);
  assert.equal(validateLatest({ audioUrl: 'https://x/y', preset: 'nope', createdAt: 1 }), null);
  assert.equal(validateLatest(null), null);
  assert.match(latestJsonUrl('https://x.supabase.co/'), /broadcasts\/latest\.json$/);
});

test('routes are owner-gated and publish through latest.json', () => {
  const up = readFileSync('app/api/broadcasts/upload-url/route.js', 'utf8');
  const pub = readFileSync('app/api/broadcasts/publish/route.js', 'utf8');
  for (const src of [up, pub]) assert.match(src, /isOwnerEmail/);
  assert.match(up, /createSignedUploadUrl/);
  assert.match(pub, /latest\.json/);
  assert.match(pub, /isBroadcastPath/);
});

test('studio holds to talk and sends through the changer', () => {
  const studio = readFileSync('components/broadcast/BroadcastStudio.jsx', 'utf8');
  assert.match(studio, /onPointerDown/);
  assert.match(studio, /onPointerUp/);
  assert.match(studio, /getUserMedia/);
  assert.match(studio, /pitch-shift-processor/);
  assert.match(studio, /uploadToSignedUrl/);
  assert.match(studio, /\/api\/broadcasts\/publish/);
});

test('listener polls latest.json site-wide and needs one tap for sound', () => {
  const listener = readFileSync('components/broadcast/BroadcastListener.jsx', 'utf8');
  assert.match(listener, /latestJsonUrl/);
  assert.match(listener, /setInterval/);
  assert.match(listener, /Turn on broadcast sound/);
  const layout = readFileSync('app/layout.jsx', 'utf8');
  assert.match(layout, /BroadcastListener/);
  const worklet = readFileSync('public/worklets/pitch-shift-processor.js', 'utf8');
  assert.match(worklet, /registerProcessor\('pitch-shift'/);
});

test('intercom duck: node-safe media helpers, wired on hold and on play', () => {  const mute = readFileSync('lib/broadcast/intercom-mute.js', 'utf8');
  assert.match(mute, /collectPlayingMedia/);
  assert.match(mute, /resumeMedia/);
  const studio = readFileSync('components/broadcast/BroadcastStudio.jsx', 'utf8');
  assert.match(studio, /Intercom \/\/ All systems/);
  assert.match(studio, /duckSounds\(\)/);
  assert.match(studio, /restoreSounds\(\)/);
  assert.match(studio, /Hold to speak/);
  const listener = readFileSync('components/broadcast/BroadcastListener.jsx', 'utf8');
  assert.match(listener, /duckSounds\(\)/);
  assert.match(listener, /restoreSounds\(\)/);
  const ares = readFileSync('app/ares/page.jsx', 'utf8');
  assert.ok(ares.indexOf('Defensive only') < ares.indexOf('<BroadcastStudio />'),
    'intercom section sits at the bottom of the console, after the footer');
});

test('broadcast storage SQL: public bucket, broadcasts record table, RLS', () => {
  const sql = readFileSync('supabase/broadcasts.sql', 'utf8');
  assert.match(sql, /insert into storage\.buckets/);
  assert.match(sql, /'broadcasts', 'broadcasts', true/);
  assert.match(sql, /create table if not exists public\.broadcasts/);
  assert.match(sql, /audio_path/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /broadcasts public read/);
  assert.match(sql, /broadcasts owner insert/);
  assert.match(sql, /AWAITS MERLIN'S EXPLICIT GREEN LIGHT/);
});

test('upload-url failure names the SQL fix; publish records the broadcast', () => {
  const up = readFileSync('app/api/broadcasts/upload-url/route.js', 'utf8');
  assert.match(up, /supabase\/broadcasts\.sql/);
  const pub = readFileSync('app/api/broadcasts/publish/route.js', 'utf8');
  assert.match(pub, /from\('broadcasts'\)\.insert/);
  assert.match(pub, /audio_path/);
  assert.match(pub, /latest\.json/);
});

test('studio: cancel recording, monitor unlock, post-send playback', () => {
  const studio = readFileSync('components/broadcast/BroadcastStudio.jsx', 'utf8');
  assert.match(studio, /Cancel recording/);
  assert.match(studio, /cancelSession/);
  assert.match(studio, /discardRef\.current = true/);
  assert.match(studio, /Escape/);
  assert.match(studio, /ctx\.resume\(\)/);
  assert.match(studio, /unlockAudioForPlayback/);
  assert.match(studio, /broadcast-self-sent/);
  assert.match(studio, /Hear it back/);
  assert.match(studio, /sentAudioUrl/);
});

test('listener: self-sent never double-plays; fresh arrivals unlock on any tap', () => {
  const listener = readFileSync('components/broadcast/BroadcastListener.jsx', 'utf8');
  assert.match(listener, /broadcast-self-sent/);
  assert.match(listener, /freshRef/);
  assert.match(listener, /pointerdown/);
  assert.match(listener, /keydown/);
  assert.match(listener, /data-broadcast-banner/);
});
