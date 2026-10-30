'use client';

// DUO-Math panel for ARES — encode and decode using the 20-symbol
// bijective base-20 shared alphabet (1-9, a-k, dash separator).
// Owner console only (ARES is keeper-gated); everything runs in the browser.

import { useState } from 'react';
import { duoEncode, duoDecode, duoEncodeText, duoDecodeText } from '@/lib/duo/codec';

export default function DuoMathPanel() {
  const [mode, setMode] = useState('number'); // 'number' | 'text'
  const [mod, setMod] = useState('7');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const modNum = Math.floor(Number(mod));

  function run(direction) {
    setError('');
    setOutput('');
    if (!(modNum >= 1)) { setError('Mod must be 1 or higher.'); return; }
    try {
      if (mode === 'number') {
        if (direction === 'encode') {
          const n = Math.floor(Number(input));
          if (!(n >= 1)) { setError('Enter a whole number of 1 or higher.'); return; }
          setOutput(duoEncode(n, modNum) || '');
        } else {
          const d = duoDecode(input, modNum);
          if (!d.ok) { setError(d.error); return; }
          setOutput(String(d.value));
        }
      } else {
        if (direction === 'encode') {
          if (!input.trim()) { setError('Enter some text.'); return; }
          setOutput(duoEncodeText(input, modNum));
        } else {
          const d = duoDecodeText(input, modNum);
          if (!d.ok) { setError(d.error); return; }
          setOutput(d.text);
        }
      }
    } catch (e) {
      setError('Something went wrong: ' + (e && e.message ? e.message : e));
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-widest text-amber-200/90">DUO-MATH CODEC</h3>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => { setMode('number'); setOutput(''); setError(''); }}
            className={`rounded px-2 py-1 ${mode === 'number' ? 'bg-amber-400/20 text-amber-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >Numbers</button>
          <button
            onClick={() => { setMode('text'); setOutput(''); setError(''); }}
            className={`rounded px-2 py-1 ${mode === 'text' ? 'bg-amber-400/20 text-amber-100' : 'text-zinc-400 hover:text-zinc-200'}`}
          >Text</button>
        </div>
      </div>

      <p className="mb-3 text-xs text-zinc-400">
        20-symbol bijective alphabet (1-9, a-k). Same number wears a different
        face under each Mod — the Mod is the key.
      </p>

      <div className="mb-2 flex items-center gap-2">
        <label className="text-xs text-zinc-400">Mod</label>
        <input
          value={mod}
          onChange={(e) => setMod(e.target.value.replace(/[^0-9]/g, ''))}
          className="w-24 rounded bg-zinc-900 px-2 py-1 text-sm text-amber-100 outline-none ring-1 ring-zinc-700 focus:ring-amber-400/60"
          inputMode="numeric"
        />
        <span className="text-[11px] text-zinc-500">
          {modNum >= 1 ? `${modNum - 1} positions per span` : ''}
        </span>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={mode === 'text' ? 3 : 2}
        placeholder={mode === 'number' ? 'Enter a number to encode, or a DUO code like 2-1d to decode…' : 'Enter text to encode, or space-separated DUO codes to decode…'}
        className="mb-2 w-full rounded bg-zinc-900 px-2 py-2 font-mono text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-amber-400/60"
      />

      <div className="mb-2 flex gap-2">
        <button
          onClick={() => run('encode')}
          className="rounded bg-amber-400/20 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-400/30"
        >Encode →</button>
        <button
          onClick={() => run('decode')}
          className="rounded bg-zinc-700/60 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
        >← Decode</button>
        <button
          onClick={() => { setInput(''); setOutput(''); setError(''); }}
          className="rounded px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
        >Clear</button>
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {output && (
        <div className="rounded bg-black/40 p-2">
          <p className="mb-1 text-[11px] uppercase tracking-widest text-zinc-500">Result</p>
          <p className="break-all font-mono text-sm text-amber-100">{output}</p>
        </div>
      )}
    </div>
  );
}
