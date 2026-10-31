// tests/muse-engine.test.mjs
// Muse lives inside the engines — engine-aware system prompts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../lib/muse/responder.js';

describe('muse engine integration', () => {
  it('builds a base prompt without engine context', () => {
    const prompt = buildSystemPrompt();
    assert.ok(prompt.length > 100, 'prompt too short');
    assert.ok(!prompt.includes('INSIDE the'), 'should not mention engine');
  });

  it('includes the engine name when helping inside an engine', () => {
    const prompt = buildSystemPrompt('world-engine', '');
    assert.ok(prompt.includes('world-engine'), 'missing engine name');
    assert.ok(prompt.includes('INSIDE the world-engine'), 'missing inside phrasing');
  });

  it('includes the build context so Muse sees the work', () => {
    const ctx = JSON.stringify({ category: 'world', params: { terrainRoughness: 0.9 } });
    const prompt = buildSystemPrompt('world-engine', ctx);
    assert.ok(prompt.includes('terrainRoughness'), 'missing context params');
    assert.ok(prompt.includes('0.9'), 'missing param value');
  });

  it('handles all nine engines', () => {
    const engines = [
      'world-engine', 'agent-engine', 'agent-forge', 'dream-engine',
      'geometry-engine', 'light-particle-engine', 'manuscript-forge',
      'weapons-forge', 'forge',
    ];
    for (const e of engines) {
      const prompt = buildSystemPrompt(e, '');
      assert.ok(prompt.includes(e), `missing: ${e}`);
    }
  });
});
