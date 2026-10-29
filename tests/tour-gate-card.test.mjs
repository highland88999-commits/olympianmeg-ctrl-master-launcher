// The Travelator gate card redesign (Merlin, 2026-10-29):
// the program iframe is the card's full-bleed background, the
// overtop card is see-through (labels, symbols, borders, buttons
// only), the word buttons become circular icon buttons whose
// symbols match their functions (words survive as aria-labels),
// and tour preview iframes hide the broadcast announcement box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync('components/tour/Travelator.jsx', 'utf8');
const listener = readFileSync('components/broadcast/BroadcastListener.jsx', 'utf8');

test('iframe is the full-bleed background', () => {
  assert.match(card, /className="pointer-events-none absolute inset-0 block h-full w-full/);
});

test('overtop card has no solid fills', () => {
  const riding = card.slice(card.indexOf("mode === 'riding'"));
  assert.doesNotMatch(riding, /bg-zinc-950/);
  assert.doesNotMatch(riding, /bg-black\/40/);
});

test('gate label and timer survive; visible title, subtitle and route are gone (decluttered 2026-10-29)', () => {
  const riding = card.slice(card.indexOf("mode === 'riding'"));
  assert.match(card, /Gate \{index \+ 1\} of \{gates\.length\}/);
  assert.match(card, /Moving on in \$\{GATE_SECONDS\} seconds/);
  // No visible program title/subtitle/route in the tour chrome (the
  // iframe's accessibility title attribute may still name the program).
  assert.doesNotMatch(riding, /<h2[^>]*>\{titleFor\(gate\.key\)\}<\/h2>/);
  assert.doesNotMatch(riding, /subtitleFor\(gate\.key\)/);
  assert.doesNotMatch(riding, /<p[^>]*>\{gate\.route\}<\/p>/);
});

test('HUB button sits top-left above the gate label; timer sits below the buttons', () => {
  const riding = card.slice(card.indexOf("mode === 'riding'"));
  assert.match(riding, /← HUB/);
  assert.match(riding, /aria-label="Back to the hub"/);
  // HUB renders before the gate label in source order (top of the card).
  assert.ok(riding.indexOf('← HUB') < riding.indexOf('Gate {index + 1}'));
  // The moving-on line renders after the button row in source order.
  const btnRow = riding.indexOf('aria-label="End tour"');
  const timer = riding.indexOf('Moving on in ${GATE_SECONDS} seconds');
  assert.ok(btnRow > 0 && timer > btnRow);
});

test('word buttons are gone; circular icon buttons carry aria-labels', () => {
  const riding = card.slice(card.indexOf("mode === 'riding'"));
  for (const words of ['Previous gate', 'Next gate', 'Open this program', 'End tour']) {
    assert.doesNotMatch(riding, new RegExp(`>\\s*${words}\\s*<`));
  }
  assert.doesNotMatch(riding, />\s*(Pause|Resume)\s*</);
  for (const label of ['aria-label="Previous gate"', 'aria-label="Next gate"',
    'aria-label="Open this program"', 'aria-label="End tour"']) {
    assert.match(riding, new RegExp(label));
  }
  assert.match(riding, /aria-label=\{paused \? 'Resume' : 'Pause'\}/);
});

test('symbols match the functions and buttons are circular', () => {
  assert.match(card, /<span aria-hidden="true">«<\/span>/);
  assert.match(card, /<span aria-hidden="true">»<\/span>/);
  assert.match(card, /\{paused \? '▶' : '❚❚'\}/);
  assert.match(card, /<span aria-hidden="true">⬈<\/span>/);
  assert.match(card, /<span aria-hidden="true">■<\/span>/);
  assert.match(card, /rounded-full/);
});

test('preview URL tells the page to hide the announcement box', () => {
  assert.match(card, /tourPreview=1/);
  assert.match(card, /srcFor/);
});

test('next gate preloads hidden so advancing never flashes black', () => {
  const riding = card.slice(card.indexOf("mode === 'riding'"));
  assert.match(riding, /gates\[index \+ 1\]/);
  assert.match(riding, /preview \(preloading\)/);
  assert.match(riding, /invisible absolute inset-0/);
  assert.match(riding, /aria-hidden="true"/);
});

test('riding frame is expanded near-fullscreen (2026-10-29)', () => {
  const riding = card.slice(card.indexOf("mode === 'riding'"));
  assert.match(riding, /h-\[94dvh\]/);
  assert.match(card, /max-w-3xl/);
});

test('broadcast banner stays out of tour preview iframes only', () => {
  assert.match(listener, /get\('tourPreview'\) === '1'/);
  assert.match(listener, /if \(isTourPreview \|\| !base/);
});
