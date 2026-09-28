'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { highlight } from './highlight.js';
import {
  insertIndent,
  outdent,
  countStats,
  findMatches,
  replaceAll,
  guessLanguage,
  defaultExtFor,
} from './editor.js';
import {
  loadTabs,
  saveTabs,
  loadActiveId,
  saveActiveId,
  blankTab,
  MAX_TABS,
} from './storage.js';
import { sanitizeFilename, triggerDownload } from './download.js';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'python', label: 'Python' },
  { id: 'text', label: 'Plain text' },
];

const WELCOME = [
  '// Welcome to Forge — a pocket code editor.',
  '// Everything you type is saved on this device only. Nothing leaves it.',
  '//',
  '// Try it:',
  '// - Tab indents, Shift+Tab removes a level of indent',
  '// - Ctrl/Command + S saves the file to your device',
  '// - Ctrl/Command + F opens find & replace',
  '// - Double-click a tab to rename it',
  '',
].join('\n');

const CSS = `
.forge-mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace; font-size: 14px; line-height: 1.6; }
.forge-scroll { overflow: auto; }
.forge-code-row { display: flex; width: max-content; min-width: 100%; min-height: 100%; }
.forge-gutter { position: sticky; left: 0; z-index: 2; user-select: none; text-align: right; padding: 12px 10px 12px 14px; color: #3d4455; background: #0a0a10; border-right: 1px solid rgba(255,255,255,0.06); }
.forge-code-wrap { position: relative; flex: 1; }
.forge-pre, .forge-ta { margin: 0; padding: 12px 16px; white-space: pre; tab-size: 4; border: 0; }
.forge-pre { min-height: 100%; color: #d6deeb; }
.forge-ta { position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; color: transparent; caret-color: #00d2ff; resize: none; overflow: hidden; outline: none; }
.forge-ta::selection { background: rgba(0, 210, 255, 0.25); }
.forge-wrap-on .forge-pre, .forge-wrap-on .forge-ta { white-space: pre-wrap; word-break: break-word; }
.tok-kw { color: #c792ea; }
.tok-str { color: #9ece6a; }
.tok-com { color: #5c6773; font-style: italic; }
.tok-num { color: #ff9e64; }
.tok-const { color: #7dcfff; }
.tok-fn { color: #7aa2f7; }
.tok-tag { color: #f7768e; }
.tok-attr { color: #bb9af7; }
.tok-attrv { color: #9ece6a; }
.tok-sel { color: #7aa2f7; }
.tok-prop { color: #bb9af7; }
.tok-val { color: #9ece6a; }
.tok-punc { color: #89ddff; }
.tok-key { color: #7aa2f7; }
.tok-head { color: #7dcfff; font-weight: 700; }
.tok-bold { font-weight: 700; color: #e0e0e0; }
.tok-italic { font-style: italic; color: #c0c8d8; }
.tok-code { color: #9ece6a; background: rgba(158,206,106,0.08); border-radius: 3px; }
.tok-link { color: #00d2ff; text-decoration: underline; }
.tok-quote { color: #5c6773; font-style: italic; }
.tok-list { color: #ff9e64; }
`;

export default function ForgePage() {
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [ready, setReady] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [wrap, setWrap] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [toast, setToast] = useState(null);
  const [selTick, setSelTick] = useState(0);
  const taRef = useRef(null);
  const saveTimer = useRef(null);
  const toastTimer = useRef(null);

  const activeTab = tabs.find((t) => t.id === activeId) || tabs[0] || null;
  const content = activeTab ? activeTab.content : '';

  // Load tabs from this device once.
  useEffect(() => {
    let initial = null;
    try {
      initial = loadTabs(window.localStorage);
    } catch {
      initial = null;
    }
    if (!initial || initial.length === 0) {
      const t = blankTab('welcome', 'javascript');
      t.content = WELCOME;
      initial = [t];
    }
    let aid = null;
    try {
      aid = loadActiveId(window.localStorage);
    } catch {
      aid = null;
    }
    if (!initial.some((t) => t.id === aid)) aid = initial[0].id;
    setTabs(initial);
    setActiveId(aid);
    setReady(true);
  }, []);

  // Auto-save to this device (debounced).
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        saveTabs(window.localStorage, tabs);
        saveActiveId(window.localStorage, activeId);
      } catch {
        /* storage unavailable — editing still works */
      }
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tabs, activeId, ready]);

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const updateContent = (next) => {
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, content: next } : t)));
  };

  const newTab = () => {
    if (tabs.length >= MAX_TABS) {
      showToast('Tab limit reached (' + MAX_TABS + ')');
      return;
    }
    const t = blankTab('untitled');
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    setFindQuery('');
    setMatchIndex(0);
  };

  const closeTab = (id) => {
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    if (next.length === 0) {
      const t = blankTab('untitled');
      setTabs([t]);
      setActiveId(t.id);
    } else {
      setTabs(next);
      if (id === activeId) setActiveId(next[Math.min(idx, next.length - 1)].id);
    }
  };

  const changeLanguage = (lang) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, lang, ext: defaultExtFor(lang) } : t))
    );
  };

  const saveToDevice = () => {
    if (!activeTab) return;
    const filename = sanitizeFilename(activeTab.name, activeTab.ext);
    triggerDownload(filename, activeTab.content);
    showToast('Saved ' + filename + ' to this device');
  };

  const startRename = (id, current) => {
    setRenamingId(id);
    setRenameValue(current);
  };

  const commitRename = () => {
    if (renamingId) {
      const v = renameValue.trim();
      if (v) {
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== renamingId) return t;
            const dot = v.lastIndexOf('.');
            if (dot > 0) {
              const ext = v.slice(dot).toLowerCase();
              return {
                ...t,
                name: v.slice(0, dot).slice(0, 80),
                ext,
                lang: guessLanguage(v),
              };
            }
            return { ...t, name: v.slice(0, 80) };
          })
        );
      }
    }
    setRenamingId(null);
  };

  const onEditorKeyDown = (e) => {
    const ta = taRef.current;
    if (!ta) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const fn = e.shiftKey ? outdent : insertIndent;
      const r = fn(ta.value, ta.selectionStart, ta.selectionEnd);
      updateContent(r.text);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (el) el.setSelectionRange(r.start, r.end);
      });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveToDevice();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setFindOpen(true);
    } else if (e.key === 'Escape' && findOpen) {
      setFindOpen(false);
      ta.focus();
    }
  };

  const matches = useMemo(
    () => findMatches(content, findQuery, { caseSensitive, wholeWord }),
    [content, findQuery, caseSensitive, wholeWord]
  );
  const shownIndex = matches.length === 0 ? 0 : (matchIndex % matches.length) + 1;

  const gotoMatch = (i) => {
    if (matches.length === 0) return;
    const n = ((i % matches.length) + matches.length) % matches.length;
    setMatchIndex(n);
    const m = matches[n];
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(m.start, m.end);
    }
  };

  const doReplace = () => {
    if (matches.length === 0) return;
    const m = matches[matchIndex % matches.length];
    updateContent(content.slice(0, m.start) + replaceQuery + content.slice(m.end));
    const ta = taRef.current;
    if (ta) {
      const pos = m.start + replaceQuery.length;
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (el) el.setSelectionRange(pos, pos);
      });
    }
  };

  const doReplaceAll = () => {
    const r = replaceAll(content, findQuery, replaceQuery, { caseSensitive, wholeWord });
    if (r.count > 0) {
      updateContent(r.text);
      showToast('Replaced ' + r.count + (r.count === 1 ? ' match' : ' matches'));
    }
  };

  const highlighted = useMemo(() => {
    const html = highlight(content, activeTab ? activeTab.lang : 'text');
    return html + (content === '' || content.endsWith('\n') ? '\n' : '');
  }, [content, activeTab]);

  const lineCount = content.split('\n').length;
  const stats = countStats(content);
  const selChars = useMemo(() => {
    const ta = taRef.current;
    if (!ta) return 0;
    return Math.abs(ta.selectionEnd - ta.selectionStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, selTick]);

  if (!ready) {
    return (
      <main className="min-h-screen bg-[#050508] text-zinc-200 flex items-center justify-center">
        <p className="text-sm tracking-widest uppercase text-zinc-500">Opening Forge…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050508] text-zinc-200 flex flex-col">
      <style>{CSS}</style>

      {/* Header */}
      <header className="px-4 sm:px-6 pt-5 pb-3">
        <h1 className="text-2xl font-black tracking-widest uppercase bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Forge
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          A pocket code editor. Everything you type is saved on this device only — nothing
          ever leaves it.
        </p>
      </header>

      {/* Tab bar */}
      <div className="px-4 sm:px-6">
        <div className="flex items-end gap-1 overflow-x-auto" role="tablist" aria-label="Open files">
          {tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === activeId}
              className={
                'flex items-center gap-2 px-3 py-2 rounded-t-lg border border-b-0 text-sm whitespace-nowrap cursor-pointer ' +
                (t.id === activeId
                  ? 'bg-[#0a0a10] border-cyan-500/40 text-white'
                  : 'bg-black/40 border-white/10 text-zinc-400 hover:text-zinc-200')
              }
              onClick={() => setActiveId(t.id)}
              onDoubleClick={() => startRename(t.id, t.name + t.ext)}
              title="Double-click to rename"
            >
              {renamingId === t.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-black/60 border border-cyan-500/40 rounded px-1 py-0.5 text-sm w-32 outline-none"
                  aria-label="Rename file"
                />
              ) : (
                <span className="font-mono">{t.name + t.ext}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="text-zinc-500 hover:text-white px-1"
                aria-label={'Close ' + t.name + t.ext}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={newTab}
            className="ml-1 mb-1 px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:border-cyan-500/40 text-sm"
            aria-label="New file"
          >
            + New
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 sm:px-6 py-2 flex flex-wrap items-center gap-2 border-y border-white/10 bg-black/40">
        <label className="text-xs text-zinc-500 uppercase tracking-widest" htmlFor="forge-lang">
          Language
        </label>
        <select
          id="forge-lang"
          value={activeTab ? activeTab.lang : 'text'}
          onChange={(e) => changeLanguage(e.target.value)}
          className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setWrap((w) => !w)}
          className={
            'px-3 py-2 rounded-lg border text-sm ' +
            (wrap
              ? 'border-cyan-500/50 text-cyan-300'
              : 'border-white/10 text-zinc-400 hover:text-white')
          }
          aria-pressed={wrap}
        >
          Wrap: {wrap ? 'on' : 'off'}
        </button>
        <button
          onClick={() => setFindOpen((o) => !o)}
          className={
            'px-3 py-2 rounded-lg border text-sm ' +
            (findOpen
              ? 'border-cyan-500/50 text-cyan-300'
              : 'border-white/10 text-zinc-400 hover:text-white')
          }
          aria-pressed={findOpen}
        >
          Find &amp; replace
        </button>
        <div className="flex-1" />
        <button
          onClick={saveToDevice}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold text-sm hover:shadow-[0_0_15px_rgba(58,134,255,0.4)]"
        >
          Save to device
        </button>
      </div>

      {/* Find & replace panel */}
      {findOpen && (
        <div className="px-4 sm:px-6 py-3 border-b border-white/10 bg-black/60 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              setMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') gotoMatch(matchIndex + 1);
            }}
            placeholder="Find"
            className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50 w-48"
            aria-label="Find text"
          />
          <input
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace with"
            className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50 w-48"
            aria-label="Replace with"
          />
          <span className="text-xs text-zinc-500 tabular-nums" aria-live="polite">
            {matches.length === 0 ? 'no matches' : shownIndex + ' of ' + matches.length}
          </span>
          <button
            onClick={() => gotoMatch(matchIndex - 1)}
            className="px-3 py-2 rounded-lg border border-white/10 text-sm hover:border-cyan-500/40"
            aria-label="Previous match"
          >
            ↑
          </button>
          <button
            onClick={() => gotoMatch(matchIndex + 1)}
            className="px-3 py-2 rounded-lg border border-white/10 text-sm hover:border-cyan-500/40"
            aria-label="Next match"
          >
            ↓
          </button>
          <button
            onClick={doReplace}
            className="px-3 py-2 rounded-lg border border-white/10 text-sm hover:border-cyan-500/40"
          >
            Replace
          </button>
          <button
            onClick={doReplaceAll}
            className="px-3 py-2 rounded-lg border border-white/10 text-sm hover:border-cyan-500/40"
          >
            Replace all
          </button>
          <label className="flex items-center gap-1 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Match case
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
            />
            Whole word
          </label>
          <button
            onClick={() => setFindOpen(false)}
            className="px-3 py-2 rounded-lg border border-white/10 text-sm text-zinc-500 hover:text-white"
            aria-label="Close find and replace"
          >
            Close
          </button>
        </div>
      )}

      {/* Editor */}
      <div className={'flex-1 min-h-[50vh] forge-scroll ' + (wrap ? 'forge-wrap-on' : '')}>
        <div className="forge-code-row">
          <div className="forge-gutter forge-mono" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <div className="forge-code-wrap">
            <pre
              className="forge-pre forge-mono"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              ref={taRef}
              value={content}
              onChange={(e) => updateContent(e.target.value)}
              onKeyDown={onEditorKeyDown}
              onSelect={() => setSelTick((t) => t + 1)}
              wrap={wrap ? 'soft' : 'off'}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="forge-ta forge-mono"
              aria-label="Code editor"
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <footer className="px-4 sm:px-6 py-2 border-t border-white/10 bg-black/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="tabular-nums">
          {stats.lines} {stats.lines === 1 ? 'line' : 'lines'} · {stats.words}{' '}
          {stats.words === 1 ? 'word' : 'words'} · {stats.chars} characters
        </span>
        {selChars > 0 && <span className="tabular-nums">{selChars} selected</span>}
        <span className="uppercase tracking-widest">
          {(activeTab ? activeTab.lang : 'text')}
        </span>
        <div className="flex-1" />
        <span>Auto-saved on this device</span>
      </footer>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-cyan-500/90 text-black text-sm font-semibold shadow-lg"
          role="status"
        >
          {toast}
        </div>
      )}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </main>
  );
}
