import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'app', 'architect-artemis');
const { parseCommand, executeCommand, createState, suggestCommands, COMMANDS, LAUNCHABLE_MODULES, PERSONA, MODE_LABEL } =
  await import(join(appDir, 'engine.js'));

const ctx = { voiceInput: true, voiceOutput: true, micOn: false, speakOn: false, now: new Date('2026-09-27T19:42:00') };

/* ---------------- command parsing ---------------- */

test('parseCommand: splits command and args, lowercases command', () => {
  const p = parseCommand('  Launch Oasis  ');
  assert.equal(p.command, 'launch');
  assert.deepEqual(p.args, ['Oasis']);
  assert.equal(p.raw, 'Launch Oasis');
});

test('parseCommand: empty input yields empty command', () => {
  const p = parseCommand('   ');
  assert.equal(p.command, '');
  assert.deepEqual(p.args, []);
});

test('parseCommand: echo keeps multi-word args', () => {
  const p = parseCommand('echo hello brave world');
  assert.equal(p.command, 'echo');
  assert.deepEqual(p.args, ['hello', 'brave', 'world']);
});

/* ---------------- command execution ---------------- */

test('help lists every command with usage', () => {
  const r = executeCommand(createState(), parseCommand('help'), ctx);
  const text = r.lines.map((l) => l.text).join('\n');
  for (const c of COMMANDS) assert.match(text, new RegExp(c.name), `help should mention ${c.name}`);
  assert.equal(r.action, null);
});

test('about describes the persona without fake AI claims', () => {
  const r = executeCommand(createState(), parseCommand('about'), ctx);
  const text = r.lines.map((l) => l.text).join(' ');
  assert.match(text, /local/i);
  assert.match(text, /no AI model on the other end/);
  assert.doesNotMatch(text, /powered by AI|live model responding|connected to Gemini/i);
  assert.ok(PERSONA.principles.length >= 3);
});

test('status labels the simulated mode and reports voice support', () => {
  const r = executeCommand(createState(), parseCommand('status'), ctx);
  const text = r.lines.map((l) => l.text).join(' ');
  assert.match(text, /SIMULATED/);
  assert.match(text, /nothing leaves your device/);
  assert.match(text, /yes/);
});

test('time uses the provided date (deterministic)', () => {
  const r = executeCommand(createState(), parseCommand('time'), ctx);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0].text, /2026/);
});

test('echo repeats args, handles empty', () => {
  const r = executeCommand(createState(), parseCommand('echo hi there'), ctx);
  assert.equal(r.lines[0].text, 'hi there');
  const r2 = executeCommand(createState(), parseCommand('echo'), ctx);
  assert.match(r2.lines[0].text, /nothing to repeat/);
});

test('modules lists launchable routes', () => {
  const r = executeCommand(createState(), parseCommand('modules'), ctx);
  const text = r.lines.map((l) => l.text).join(' ');
  assert.match(text, /oasis/);
  assert.equal(LAUNCHABLE_MODULES.length, 10);
});

test('launch known module returns navigate action', () => {
  const r = executeCommand(createState(), parseCommand('launch oasis'), ctx);
  assert.deepEqual(r.action, { type: 'navigate', to: '/oasis' });
  assert.match(r.lines[0].text, /Opening Oasis/);
});

test('launch accepts leading slash and is case-insensitive', () => {
  const r = executeCommand(createState(), parseCommand('LAUNCH /Artemis'), ctx);
  assert.deepEqual(r.action, { type: 'navigate', to: '/artemis' });
});

test('launch unknown module errors and suggests valid ones', () => {
  const r = executeCommand(createState(), parseCommand('launch banana'), ctx);
  assert.equal(r.action, null);
  assert.equal(r.lines[0].kind, 'err');
  assert.match(r.lines[1].text, /oasis/);
});

test('demo returns the labeled simulation script', () => {
  const r = executeCommand(createState(), parseCommand('demo'), ctx);
  const text = r.lines.map((l) => l.text).join('\n');
  assert.match(text, /SIMULATED/);
  assert.match(text, /End of demo script/);
  assert.match(text, /scripted replies/);
});

test('voice/speak toggle returns mic/speak actions', () => {
  assert.deepEqual(executeCommand(createState(), parseCommand('voice on'), ctx).action, { type: 'mic', on: true });
  assert.deepEqual(executeCommand(createState(), parseCommand('voice off'), ctx).action, { type: 'mic', on: false });
  assert.deepEqual(executeCommand(createState(), parseCommand('speak on'), ctx).action, { type: 'speak', on: true });
  const bad = executeCommand(createState(), parseCommand('voice maybe'), ctx);
  assert.equal(bad.action, null);
  assert.match(bad.lines[0].text, /Usage/);
});

test('clear returns the clear action', () => {
  const r = executeCommand(createState(), parseCommand('clear'), ctx);
  assert.deepEqual(r.action, { type: 'clear' });
  assert.equal(r.lines.length, 0);
});

test('unknown command offers suggestions', () => {
  const r = executeCommand(createState(), parseCommand('elp'), ctx);
  assert.equal(r.lines[0].kind, 'err');
  assert.match(r.lines[0].text, /help/);
  const r2 = executeCommand(createState(), parseCommand('xyzzy'), ctx);
  assert.doesNotMatch(r2.lines[0].text, /Did you mean/);
});

test('state object is returned unchanged in shape', () => {
  const r = executeCommand(createState(), parseCommand('help'), ctx);
  assert.deepEqual(Object.keys(r.state).sort(), ['demoIndex', 'mode']);
});

test('suggestCommands: prefix and substring matches', () => {
  assert.ok(suggestCommands('lau').includes('launch'));
  assert.ok(suggestCommands('od').includes('modules'));
  assert.deepEqual(suggestCommands(''), []);
});

test('MODE_LABEL marks simulation', () => {
  assert.match(MODE_LABEL, /SIMULATED/);
});

/* ---------------- static scans ---------------- */

const TELEMETRY = /central_telemetry|ipify|supabase\.co|OMEGA MIND|brain-uplink|api[_-]?key|apikey/i;
const EXTERNAL = /https?:\/\//;
const MARKUP = /<iframe|<video|mailto:/i;

const sourceFiles = readdirSync(appDir).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));

test('no telemetry patterns in module source', () => {
  for (const f of sourceFiles) {
    const src = readFileSync(join(appDir, f), 'utf8');
    assert.doesNotMatch(src, TELEMETRY, `${f} must not contain telemetry patterns`);
  }
});

test('no external URLs in module source', () => {
  for (const f of sourceFiles) {
    const src = readFileSync(join(appDir, f), 'utf8');
    assert.doesNotMatch(src, EXTERNAL, `${f} must not contain remote URLs`);
  }
});

test('no iframe/video/mailto in module source', () => {
  for (const f of sourceFiles) {
    const src = readFileSync(join(appDir, f), 'utf8');
    assert.doesNotMatch(src, MARKUP, `${f} must not contain iframe/video/mailto`);
  }
});
