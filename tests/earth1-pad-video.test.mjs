// tests/earth1-pad-video.test.mjs — the boost-pad video wrap
// (Merlin, 2026-11-15, correction): the pads wear a LOOPING VIDEO
// TEXTURE on their surface — a top-down glowing boost-pad energy
// pattern — the way the nether realms wear video skies and floors.
// The earlier concept video (a supercar passing over a glowing
// pad) is NOT wired in.
//
// Pins: the wrap video exists on disk (video stream, no audio);
// the lib names it + loop + mute; padVideoModulation tints it per
// state (armed / flare / recharging); the component wires it as
// the disc's map + emissiveMap and never adds a real light.
//
// Run: node tests/earth1-pad-video.test.mjs (from the repo root).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAD_VIDEO_URL,
  PAD_VIDEO_LOOP,
  PAD_VIDEO_MUTED,
  PAD_COLOR_ARMED,
  PAD_COLOR_FLARE,
  PAD_COLOR_RECHARGING,
  padVideoModulation,
} from '../lib/earth/boost-pads.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${name}`); }
}
function eq(name, a, b) {
  t(name, a === b);
}

// --- The video file on disk ---
{
  const rel = PAD_VIDEO_URL.replace(/^\//, '');
  const abs = join(root, 'public', rel);
  t('pad video URL is the wrap file', PAD_VIDEO_URL === '/videos/earth1/boost-pad-wrap.mp4');
  t('pad wrap video exists on disk', existsSync(abs));
  const size = statSync(abs).size;
  t('pad wrap video is a real file (> 1 MB)', size > 1_000_000);
  // ffprobe when available: the wrap must be video-only (no audio
  // — the generated file carried an AAC stream, stripped on
  // re-encode), h264, ~10 s. If ffprobe is missing the file pins
  // above still hold and these are skipped, not faked.
  try {
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_streams', '-show_format', abs,
    ], { encoding: 'utf8', timeout: 15000 }));
    const video = (probe.streams || []).filter((s) => s.codec_type === 'video');
    const audio = (probe.streams || []).filter((s) => s.codec_type === 'audio');
    eq('wrap has exactly one video stream', video.length, 1);
    eq('wrap has NO audio stream (muted by construction)', audio.length, 0);
    t('wrap video is h264', video[0] && video[0].codec_name === 'h264');
    const dur = Number(probe.format && probe.format.duration);
    t(`wrap duration is ~10 s (${dur}s)`, Number.isFinite(dur) && dur > 9 && dur < 11);
  } catch (err) {
    console.log('  (ffprobe unavailable — video-stream pins skipped, file pins hold)');
  }
  // The concept video is NOT the wrap.
  const lib = read('lib/earth/boost-pads.js');
  t('the concept video is never referenced', !lib.includes('boost-effect'));
  const comp = read('components/EarthBoostPads.jsx');
  t('the component never references the concept video', !comp.includes('boost-effect'));
}

// --- Loop + mute constants ---
{
  eq('pad video loops', PAD_VIDEO_LOOP, true);
  eq('pad video is muted', PAD_VIDEO_MUTED, true);
}

// --- State modulation (the video tints per pad state) ---
{
  const armed = padVideoModulation('armed');
  eq('armed disc wears the armed cyan', armed.discColor, PAD_COLOR_ARMED);
  eq('armed disc opacity is 0.54', armed.discOpacity, 0.54);
  eq('armed ring opacity is 0.95', armed.ringOpacity, 0.95);
  eq('armed disc pulses', armed.pulseDisc, true);
  eq('armed chevron scale is 1', armed.chevScale, 1);
  const flare = padVideoModulation('flare');
  eq('flare disc is white-hot', flare.discColor, PAD_COLOR_FLARE);
  eq('flare disc opacity is 0.95', flare.discOpacity, 0.95);
  eq('flare ring opacity is 1', flare.ringOpacity, 1);
  eq('flare chevron pops to 1.25', flare.chevScale, 1.25);
  eq('flare disc does not pulse', flare.pulseDisc, false);
  const recharging = padVideoModulation('recharging');
  eq('recharging disc is slate', recharging.discColor, PAD_COLOR_RECHARGING);
  eq('recharging disc opacity is 0.18', recharging.discOpacity, 0.18);
  eq('recharging ring opacity is 0.35', recharging.ringOpacity, 0.35);
  eq('recharging disc does not pulse', recharging.pulseDisc, false);
  const unknown = padVideoModulation('bogus');
  eq('an unknown state falls back to armed', unknown.discColor, PAD_COLOR_ARMED);
}

// --- The wiring: disc wears the video, no new real lights ---
{
  const comp = read('components/EarthBoostPads.jsx');
  t('component builds one shared VideoTexture', comp.includes('new THREE.VideoTexture(video)'));
  t('component sets the video source from PAD_VIDEO_URL', comp.includes('video.src = PAD_VIDEO_URL'));
  t('component mutes the video', comp.includes('video.muted = true'));
  t('component loops the video', comp.includes('video.loop = true'));
  t('component plays it inline (phone)', comp.includes('video.playsInline = true'));
  t('component maps the video onto the disc', comp.includes('map={videoTex'));
  t('component modulates the video per state', comp.includes('padVideoModulation(visual)'));
  t('component falls back to a plain tint when the video is absent', comp.includes('map={videoTex || undefined}'));
  t('pad visuals are unlit (no new real lights)', comp.includes('meshBasicMaterial'));
  t('pad component never adds a light',
    !comp.includes('<pointLight') && !comp.includes('<spotLight') && !comp.includes('<directionalLight'));
}

console.log(`earth1-pad-video: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
