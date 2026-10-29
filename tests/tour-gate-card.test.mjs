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

test('gate label, progress, title and timer survive as labels', () => {
  assert.match(card, /Gate \{index \+ 1\} of \{gates\.length\}/);
  assert.match(card, /Moving on in \$\{GATE_SECONDS\} seconds/);
  assert.match(card, /\{titleFor\(gate\.key\)\}/);
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
  assert.match(card, /previewSrc/);
});

test('broadcast banner stays out of tour preview iframes only', () => {
  assert.match(listener, /get\('tourPreview'\) === '1'/);
  assert.match(listener, /if \(isTourPreview \|\| !base/);
});
