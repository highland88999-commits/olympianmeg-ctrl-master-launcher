// The announcement workflow (Merlin, 2026-10-29):
// press send in the threat monitor console -> everyone online sees
// Molly's head speak the broadcast once -> her head disappears ->
// the file stays replayable from the Concourse notifications menu,
// whose separate Announcements portal button hosts past broadcasts.
// When done, SOON leaves the tour tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const head = readFileSync('components/molly/MollyHead2D.jsx', 'utf8');
const head3d = readFileSync('components/molly/MollyHead3D.jsx', 'utf8');
const panel = readFileSync('components/ares/MollyPanel.jsx', 'utf8');
const overlay = readFileSync('components/broadcast/MollyBroadcastOverlay.jsx', 'utf8');
const listener = readFileSync('components/broadcast/BroadcastListener.jsx', 'utf8');
const history = readFileSync('app/api/broadcasts/history/route.js', 'utf8');
const menu = readFileSync('components/concourse/AnnouncementsPanel.jsx', 'utf8');
const concourse = readFileSync('components/Concourse.jsx', 'utf8');

test('shared dot-matrix head exists with a per-instance clip id', () => {
  assert.match(head, /<svg viewBox="0 0 200 220"/);
  assert.match(head, /useId/);
  assert.match(head, /molly-head-clip-\$\{uid\}/);
});

test('MollyPanel uses the shared 3D head (no local copy), 2D kept as error fallback', () => {
  assert.match(panel, /import MollyHead3D from '@\/components\/molly\/MollyHead3D'/);
  assert.doesNotMatch(panel, /function MollyHead3D\(\)/);
  assert.match(panel, /<MollyHead3D fallback=\{<MollyHead \/>\} \/>/);
});

test('shared 3D head exposes motion-toggle and fallback props', () => {
  assert.match(head3d, /showMotionToggle = true/);
  assert.match(head3d, /fallback = null/);
  assert.match(head3d, /if \(status === 'error'\) return fallback;/);
  assert.match(head3d, /showMotionToggle && status === 'ready'/);
});

test('overlay shows her real 3D head, never the 2D placeholder', () => {
  assert.match(overlay, /import MollyHead3D from '@\/components\/molly\/MollyHead3D'/);
  assert.match(overlay, /<MollyHead3D/);
  assert.match(overlay, /showMotionToggle=\{false\}/);
  assert.doesNotMatch(overlay, /MollyHead2D/);
  assert.doesNotMatch(overlay, /<MollyHead[\s/>]/);
});

test('overlay tries autoplay, falls back to tap-to-hear, leaves on first end', () => {
  assert.match(overlay, /el\.play\(\)/);
  assert.match(overlay, /Tap to hear Molly/);
  assert.match(overlay, /onEnded=\{handleEnded\}/);
  assert.match(overlay, /finish\(onDone\)/);
});

test("overlay never double-plays on the sender's device", () => {
  assert.match(overlay, /selfSent \? 'sent' : 'trying'/);
  assert.doesNotMatch(overlay, /selfSent[\s\S]{0,400}el\.play\(\)/);
});

test('listener summons Molly on a fresh broadcast (banner retired)', () => {
  assert.match(listener, /setOverlay\(\{ item, selfSent: false \}\)/);
  assert.match(listener, /setOverlay\(\{ item, selfSent: true \}\)/);
  assert.match(listener, /<MollyBroadcastOverlay/);
  assert.doesNotMatch(listener, /data-broadcast-banner/);
  assert.doesNotMatch(listener, /Turn on broadcast sound/);
});

test('listener still hides everything inside tour preview iframes', () => {
  assert.match(listener, /get\('tourPreview'\) === '1'/);
  assert.match(listener, /if \(isTourPreview \|\| !base \|\| !overlay\) return null/);
});

test('listener tells the Concourse bell about each latest id', () => {
  assert.match(listener, /broadcast-latest/);
  assert.match(listener, /CustomEvent\('broadcast-latest'/);
});

test('self-sent overlay pops up exactly once per broadcast, never on later polls', () => {
  assert.match(listener, /if \(item\.id !== seenRef\.current\) \{/);
  assert.match(listener, /setOverlay\(\{ item, selfSent: true \}\)/);
});

test('history endpoint is signed-in readable and table-backed', () => {
  assert.match(history, /export const GET/);
  assert.match(history, /getUserFromRequest/);
  assert.match(history, /\.from\('broadcasts'\)/);
  assert.match(history, /order\('created_at', \{ ascending: false \}\)/);
});

test('notifications menu hosts the separate Announcements portal button', () => {
  assert.match(menu, /AnnouncementsBell/);
  assert.match(menu, /hasUnread/);
  assert.match(menu, /Announcements/);
  assert.match(menu, /Past broadcasts from the keeper/);
  assert.match(menu, /\/api\/broadcasts\/history/);
  assert.match(menu, /broadcast-last-opened/);
});

test('Concourse wires the bell, the menu, and drops SOON from the tour tile', () => {
  assert.match(concourse, /AnnouncementsBell hasUnread=\{hasUnread\}/);
  assert.match(concourse, /<AnnouncementsMenu open=\{notifOpen\}/);
  assert.match(concourse, /\{ id: 'tour', label: 'Tour', icon: '🗺️', art: '\/concourse-icons\/tour\.webp' \}/);
  assert.doesNotMatch(concourse, /id: 'tour'[^}]*soon: true/);
});
