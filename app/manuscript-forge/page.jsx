// Manuscript Forge — a local-first manuscript studio.
// Port of highland88999-commits/Manuscript-Forge. Write chapters in a rich
// text editor, organize them in the sidebar, import .txt, export .txt/.md/.html.
// Everything is stored in localStorage on this device; nothing leaves the page.
"use client";

import { useEffect, useRef, useState } from 'react';
import {
  STORAGE_KEY,
  createDoc,
  createChapter,
  addChapter,
  renameChapter,
  updateChapterBody,
  deleteChapter,
  moveChapter,
  wordCount,
  readingMinutes,
  totalWords,
  exportText,
  exportMarkdown,
  exportHtml,
  importTextFile,
  serializeDoc,
  deserializeDoc,
  downloadFilename,
} from './manuscript.js';
import MuseEngineChat from '@/components/muse/MuseEngineChat';

const BTN =
  'min-h-[44px] px-4 py-2 rounded font-bold tracking-widest text-xs uppercase transition-colors inline-flex items-center justify-center gap-2';
const TOOL = 'min-h-[36px] min-w-[40px] px-2 rounded border border-zinc-700 text-sm text-zinc-200 hover:border-orange-500 hover:text-orange-300 inline-flex items-center justify-center gap-1.5';

const MF_CSS = `
.mf-theme { --mf-noise: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.72 0 0 0 0 0.42 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); }
.mf-amb { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.mf-amb img { width: 100%; height: 100%; object-fit: cover; opacity: 0.3; }
.mf-scrim { position: fixed; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(180deg, rgba(5,3,2,0.8) 0%, rgba(5,3,2,0.5) 40%, rgba(5,3,2,0.88) 100%); }
.mf-panel { background-image: var(--mf-noise), linear-gradient(180deg, rgba(30,18,8,0.55), rgba(8,5,3,0.65)); background-size: 140px 140px, cover; }
.mf-pulse { animation: mf-pulse 1.6s ease-in-out infinite; }
@keyframes mf-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mf-pulse { animation: none; } }
`;

function Glyph({ size = 15, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0 }}>{children}</svg>
  );
}

const IC = {
  bold: <><path d="M7 4h7a4 4 0 0 1 0 8H7z" /><path d="M7 12h8a4 4 0 0 1 0 8H7z" /></>,
  italic: <path d="M19 4h-9M14 20H5M15 4L9 20" />,
  underline: <><path d="M6 3v7a6 6 0 0 0 12 0V3" /><path d="M4 21h16" /></>,
  strike: <><path d="M16 4H8a4 4 0 0 0 0 8h8a4 4 0 0 1 0 8H8" /><path d="M3 12h18" /></>,
  quote: <><path d="M7 6h4v5c0 3-2 4.5-3.5 5.5" /><path d="M14 6h4v5c0 3-2 4.5-3.5 5.5" /></>,
  bullets: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="5" cy="6" r="1.4" /><circle cx="5" cy="12" r="1.4" /><circle cx="5" cy="18" r="1.4" /></>,
  ordered: <><path d="M10 6h11M10 12h11M10 18h11" /><text x="2.5" y="8.5" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">1</text><text x="2.5" y="14.5" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">2</text><text x="2.5" y="20.5" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">3</text></>,
  eraser: <><path d="M5 15l8.5-8.5 5 5L13 17H8z" /><path d="M4 20l4.5-4.5M13 21h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="M17 3l4 4L8 20l-5 1 1-5z" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></>,
  upload: <><path d="M12 16V4m0 0L7 9m5-5l5 5" /><path d="M4 20h16" /></>,
  download: <><path d="M12 4v12m0 0l-5-5m5 5l5-5" /><path d="M4 20h16" /></>,
  flame: <path d="M12 2c1 4-4 6-4 11a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 5a6 6 0 0 1-12 0C6 8 12 6 12 2z" />,
  quill: <path d="M20 4c-6 0-12 4-14 12l-2 4 4-2c8-2 12-8 12-14zM6 18c2-4 5-8 9-10" />,
};

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function ManuscriptForgePage() {
  const [doc, setDoc] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const editorRef = useRef(null);
  const suppressSyncRef = useRef(false);

  // Load once from localStorage.
  useEffect(() => {
    let initial = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) initial = deserializeDoc(raw);
    } catch (e) {
      /* corrupted storage: start fresh */
    }
    if (!initial) initial = createDoc('Untitled draft', '');
    setDoc(initial);
    setActiveId(initial.chapters[0].id);
  }, []);

  // Persist on every change (debounced by React batching; cheap enough direct).
  useEffect(() => {
    if (!doc) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeDoc(doc));
      setSavedAt(new Date());
    } catch (e) {
      /* storage full or blocked: keep working in memory */
    }
  }, [doc]);

  const active = doc ? doc.chapters.find((c) => c.id === activeId) || doc.chapters[0] : null;

  // Push chapter body into the editor when switching chapters.
  useEffect(() => {
    if (editorRef.current && active) {
      suppressSyncRef.current = true;
      editorRef.current.innerHTML = active.body || '';
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onEditorInput() {
    if (suppressSyncRef.current) {
      suppressSyncRef.current = false;
      return;
    }
    const html = editorRef.current ? editorRef.current.innerHTML : '';
    setDoc((d) => (d && active ? updateChapterBody(d, active.id, html) : d));
  }

  function exec(cmd, value = null) {
    document.execCommand(cmd, false, value);
    editorRef.current && editorRef.current.focus();
    onEditorInput();
  }

  function selectChapter(id) {
    // Flush current edits before switching.
    if (editorRef.current && active) {
      const html = editorRef.current.innerHTML;
      setDoc((d) => updateChapterBody(d, active.id, html));
    }
    setActiveId(id);
    setRenaming(false);
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const imported = importTextFile(String(ev.target.result || ''), file.name);
      setDoc(imported);
      setActiveId(imported.chapters[0].id);
    };
    reader.readAsText(file);
  }

  if (!doc || !active) {
    return (
      <div className="mf-theme relative min-h-[100dvh] bg-[#050508] text-zinc-200 flex items-center justify-center overflow-hidden">
        <style>{MF_CSS}</style>
        <div className="mf-amb" aria-hidden="true"><img src="/images/manuscript-forge/manuscript-bg.webp" alt="" /></div>
        <div className="mf-scrim" aria-hidden="true" />
        <p className="relative z-10 flex items-center gap-3 font-mono text-sm tracking-[0.25em] uppercase text-orange-200/80 mf-pulse">
          <Glyph size={18}>{IC.quill}</Glyph>Opening the forge…
        </p>
      </div>
    );
  }

  const words = totalWords(doc);

  return (
    <div className="mf-theme relative min-h-[100dvh] bg-[#050508] text-zinc-100 flex flex-col">
      <style>{MF_CSS}</style>
      <div className="mf-amb" aria-hidden="true"><img src="/images/manuscript-forge/manuscript-bg.webp" alt="" /></div>
      <div className="mf-scrim" aria-hidden="true" />
      <div className="relative z-10 flex flex-col min-h-[100dvh]">
      <header className="mf-panel border-b border-orange-900/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-[0.25em] uppercase bg-gradient-to-r from-amber-200 via-orange-400 to-amber-600 bg-clip-text text-transparent">
          <span style={{ color: '#fb923c' }}><Glyph size={20}>{IC.quill}</Glyph></span>
          <span>Forge</span>
        </h1>
        <input
          className="bg-transparent border-b border-dashed border-zinc-600 focus:border-amber-400 outline-none text-center text-zinc-100 text-sm px-2 py-1 min-w-[160px] flex-1 max-w-xs"
          value={doc.title}
          onChange={(e) => setDoc({ ...doc, title: e.target.value })}
          placeholder="Untitled draft"
          aria-label="Manuscript title"
        />
        <input
          className="bg-transparent border-b border-dashed border-zinc-600 focus:border-amber-400 outline-none text-zinc-300 text-sm px-2 py-1 w-40"
          value={doc.author}
          onChange={(e) => setDoc({ ...doc, author: e.target.value })}
          placeholder="Author name"
          aria-label="Author name"
        />
        <div className="ml-auto font-mono text-[11px] text-zinc-500">
          {words.toLocaleString()} words &middot; ~{readingMinutes(words)} min read &middot;{' '}
          {savedAt ? 'saved on this device' : 'unsaved'}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Sidebar: chapters */}
        <aside className="mf-panel w-full md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-orange-900/60 p-4 flex flex-col gap-3 max-h-[38dvh] md:max-h-none overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-orange-400">Chapters</h2>
            <button
              type="button"
              className={`${BTN} border border-orange-600 text-orange-300 hover:bg-orange-600 hover:text-black`}
              onClick={() => {
                const ch = createChapter(`Chapter ${doc.chapters.length + 1}`);
                setDoc(addChapter(doc, ch));
                setActiveId(ch.id);
              }}
            >
              <Glyph size={14}>{IC.plus}</Glyph> Add
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {doc.chapters.map((c, i) => (
              <li
                key={c.id}
                className={`rounded border px-3 py-2 flex items-center gap-2 cursor-pointer ${
                  c.id === active.id
                    ? 'border-orange-500 bg-orange-950/50'
                    : 'border-zinc-800 hover:border-zinc-600'
                }`}
                onClick={() => selectChapter(c.id)}
              >
                <span className="font-mono text-[10px] text-zinc-500 w-6">{i + 1}</span>
                {renaming && c.id === active.id ? (
                  <input
                    autoFocus
                    className="bg-black border border-orange-600 rounded px-1 text-sm flex-1 min-w-0"
                    value={c.title}
                    onChange={(e) => setDoc(renameChapter(doc, c.id, e.target.value))}
                    onBlur={() => setRenaming(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setRenaming(false);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Chapter title"
                  />
                ) : (
                  <span className="text-sm flex-1 truncate">{c.title}</span>
                )}
                <span className="font-mono text-[10px] text-zinc-500">
                  {wordCount(c.body).toLocaleString()}w
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <button type="button" className={TOOL} onClick={() => setRenaming(true)} title="Rename chapter">
              <Glyph size={13}>{IC.pencil}</Glyph> Rename
            </button>
            <button
              type="button"
              className={TOOL}
              onClick={() => setDoc(moveChapter(doc, active.id, -1))}
              title="Move chapter up"
              aria-label="Move chapter up"
            >
              <Glyph size={13}>{IC.up}</Glyph>
            </button>
            <button
              type="button"
              className={TOOL}
              onClick={() => setDoc(moveChapter(doc, active.id, 1))}
              title="Move chapter down"
              aria-label="Move chapter down"
            >
              <Glyph size={13}>{IC.down}</Glyph>
            </button>
            <button
              type="button"
              className={`${TOOL} hover:!border-rose-500 hover:!text-rose-400`}
              onClick={() => {
                if (window.confirm(`Delete "${active.title}"?`)) {
                  const next = deleteChapter(doc, active.id);
                  setDoc(next);
                  setActiveId(next.chapters[0].id);
                }
              }}
              title="Delete chapter"
            >
              <Glyph size={13}>{IC.trash}</Glyph> Delete
            </button>
          </div>

          <div className="border-t border-zinc-800 pt-3 flex flex-col gap-2">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-amber-400/90">Import / Export</h2>
            <label className={`${BTN} border border-orange-600 text-orange-300 text-center cursor-pointer hover:bg-orange-600 hover:text-black`}>
              <Glyph size={14}>{IC.upload}</Glyph> Import .txt
              <input type="file" accept=".txt,text/plain" className="hidden" onChange={onImportFile} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-200 hover:border-zinc-400`}
                onClick={() => downloadFile(downloadFilename(doc, 'txt'), exportText(doc), 'text/plain')}
              >
                <Glyph size={14}>{IC.download}</Glyph>.txt
              </button>
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-200 hover:border-zinc-400`}
                onClick={() => downloadFile(downloadFilename(doc, 'md'), exportMarkdown(doc), 'text/markdown')}
              >
                <Glyph size={14}>{IC.download}</Glyph>.md
              </button>
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-200 hover:border-zinc-400`}
                onClick={() => downloadFile(downloadFilename(doc, 'html'), exportHtml(doc), 'text/html')}
              >
                <Glyph size={14}>{IC.download}</Glyph>.html
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Drafts save automatically to this device. Export to take a copy with you.
            </p>
          </div>
        </aside>

        {/* Editor */}
        <main className="flex-1 flex flex-col min-h-0 p-4">
          <div className="flex flex-wrap gap-1 mb-2" role="toolbar" aria-label="Formatting">
            <button type="button" className={TOOL} onClick={() => exec('bold')} title="Bold" aria-label="Bold"><Glyph size={14}>{IC.bold}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('italic')} title="Italic" aria-label="Italic"><Glyph size={14}>{IC.italic}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('underline')} title="Underline" aria-label="Underline"><Glyph size={14}>{IC.underline}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('strikeThrough')} title="Strikethrough" aria-label="Strikethrough"><Glyph size={14}>{IC.strike}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('formatBlock', 'h2')} title="Heading">H2</button>
            <button type="button" className={TOOL} onClick={() => exec('formatBlock', 'h3')} title="Subheading">H3</button>
            <button type="button" className={TOOL} onClick={() => exec('formatBlock', 'blockquote')} title="Quote" aria-label="Quote"><Glyph size={14}>{IC.quote}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('insertUnorderedList')} title="Bullet list" aria-label="Bullet list"><Glyph size={14}>{IC.bullets}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('insertOrderedList')} title="Numbered list" aria-label="Numbered list"><Glyph size={14}>{IC.ordered}</Glyph></button>
            <button type="button" className={TOOL} onClick={() => exec('removeFormat')} title="Clear formatting"><Glyph size={14}>{IC.eraser}</Glyph>Clear</button>
            <span className="ml-auto font-mono text-[11px] text-zinc-500 self-center">
              {wordCount(active.body).toLocaleString()} words in this chapter
            </span>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={onEditorInput}
            className="flex-1 min-h-[50dvh] rounded border border-orange-900/60 mf-panel p-6 md:p-10 text-[1.05rem] leading-8 outline-none focus:border-orange-600 overflow-y-auto prose-styles"
            aria-label={`Editing ${active.title}`}
          />
          <style>{`
            .prose-styles h2 { color: #ffd700; font-size: 1.5rem; margin: 1em 0 0.5em; font-weight: bold; }
            .prose-styles h3 { color: #ffd700; font-size: 1.2rem; margin: 1em 0 0.5em; font-weight: bold; }
            .prose-styles p { margin: 0 0 1em; }
            .prose-styles blockquote { border-left: 3px solid #00f2ff; padding-left: 1em; color: #a1a1aa; margin: 1em 0; }
            .prose-styles ul, .prose-styles ol { margin: 0 0 1em 1.5em; }
          `}</style>
        </main>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="player-clear" />
      </div>
      </div>
      <MuseEngineChat engine="manuscript-forge" title="Manuscript Forge"
        context={{ title: doc.title, author: doc.author, activeChapter: active ? active.title : null, totalWords: words, chapterCount: doc.chapters.length }} accent="#f59e0b" />
    </div>
  );
}
