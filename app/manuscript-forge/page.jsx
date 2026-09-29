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

const BTN =
  'min-h-[44px] px-4 py-2 rounded font-bold tracking-widest text-xs uppercase transition-colors';
const TOOL = 'min-h-[36px] min-w-[40px] px-2 rounded border border-zinc-700 text-sm text-zinc-200 hover:border-cyan-500 hover:text-cyan-300';

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
      <div className="min-h-[100dvh] bg-[#050508] text-zinc-200 flex items-center justify-center">
        <p className="font-mono text-sm">Opening the forge…</p>
      </div>
    );
  }

  const words = totalWords(doc);

  return (
    <div className="min-h-[100dvh] bg-[#050508] text-zinc-100 flex flex-col">
      <header className="border-b border-cyan-900/60 bg-black/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold tracking-[0.25em] uppercase text-cyan-300">Forge</h1>
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
        <aside className="w-full md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-cyan-900/60 bg-black/40 p-4 flex flex-col gap-3 max-h-[38dvh] md:max-h-none overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-cyan-500">Chapters</h2>
            <button
              type="button"
              className={`${BTN} border border-cyan-600 text-cyan-300 hover:bg-cyan-600 hover:text-black`}
              onClick={() => {
                const ch = createChapter(`Chapter ${doc.chapters.length + 1}`);
                setDoc(addChapter(doc, ch));
                setActiveId(ch.id);
              }}
            >
              + Add
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {doc.chapters.map((c, i) => (
              <li
                key={c.id}
                className={`rounded border px-3 py-2 flex items-center gap-2 cursor-pointer ${
                  c.id === active.id
                    ? 'border-cyan-500 bg-cyan-950/50'
                    : 'border-zinc-800 hover:border-zinc-600'
                }`}
                onClick={() => selectChapter(c.id)}
              >
                <span className="font-mono text-[10px] text-zinc-500 w-6">{i + 1}</span>
                {renaming && c.id === active.id ? (
                  <input
                    autoFocus
                    className="bg-black border border-cyan-600 rounded px-1 text-sm flex-1 min-w-0"
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
              Rename
            </button>
            <button
              type="button"
              className={TOOL}
              onClick={() => setDoc(moveChapter(doc, active.id, -1))}
              title="Move chapter up"
            >
              ↑
            </button>
            <button
              type="button"
              className={TOOL}
              onClick={() => setDoc(moveChapter(doc, active.id, 1))}
              title="Move chapter down"
            >
              ↓
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
              Delete
            </button>
          </div>

          <div className="border-t border-zinc-800 pt-3 flex flex-col gap-2">
            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-amber-400/90">Import / Export</h2>
            <label className={`${BTN} border border-cyan-600 text-cyan-300 text-center cursor-pointer hover:bg-cyan-600 hover:text-black`}>
              Import .txt
              <input type="file" accept=".txt,text/plain" className="hidden" onChange={onImportFile} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-200 hover:border-zinc-400`}
                onClick={() => downloadFile(downloadFilename(doc, 'txt'), exportText(doc), 'text/plain')}
              >
                .txt
              </button>
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-200 hover:border-zinc-400`}
                onClick={() => downloadFile(downloadFilename(doc, 'md'), exportMarkdown(doc), 'text/markdown')}
              >
                .md
              </button>
              <button
                type="button"
                className={`${BTN} border border-zinc-600 text-zinc-200 hover:border-zinc-400`}
                onClick={() => downloadFile(downloadFilename(doc, 'html'), exportHtml(doc), 'text/html')}
              >
                .html
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
            <button type="button" className={TOOL} onClick={() => exec('bold')} title="Bold"><b>B</b></button>
            <button type="button" className={TOOL} onClick={() => exec('italic')} title="Italic"><i>I</i></button>
            <button type="button" className={TOOL} onClick={() => exec('underline')} title="Underline"><u>U</u></button>
            <button type="button" className={TOOL} onClick={() => exec('strikeThrough')} title="Strikethrough"><s>S</s></button>
            <button type="button" className={TOOL} onClick={() => exec('formatBlock', 'h2')} title="Heading">H2</button>
            <button type="button" className={TOOL} onClick={() => exec('formatBlock', 'h3')} title="Subheading">H3</button>
            <button type="button" className={TOOL} onClick={() => exec('formatBlock', 'blockquote')} title="Quote">❝</button>
            <button type="button" className={TOOL} onClick={() => exec('insertUnorderedList')} title="Bullet list">• List</button>
            <button type="button" className={TOOL} onClick={() => exec('insertOrderedList')} title="Numbered list">1. List</button>
            <button type="button" className={TOOL} onClick={() => exec('removeFormat')} title="Clear formatting">Clear</button>
            <span className="ml-auto font-mono text-[11px] text-zinc-500 self-center">
              {wordCount(active.body).toLocaleString()} words in this chapter
            </span>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={onEditorInput}
            className="flex-1 min-h-[50dvh] rounded border border-cyan-900/60 bg-black/50 p-6 md:p-10 text-[1.05rem] leading-8 outline-none focus:border-cyan-600 overflow-y-auto prose-styles"
            aria-label={`Editing ${active.title}`}
          />
          <style>{`
            .prose-styles h2 { color: #fbbf24; font-size: 1.5rem; margin: 1em 0 0.5em; font-weight: bold; }
            .prose-styles h3 { color: #fbbf24; font-size: 1.2rem; margin: 1em 0 0.5em; font-weight: bold; }
            .prose-styles p { margin: 0 0 1em; }
            .prose-styles blockquote { border-left: 3px solid #22d3ee; padding-left: 1em; color: #a1a1aa; margin: 1em 0; }
            .prose-styles ul, .prose-styles ol { margin: 0 0 1em 1.5em; }
          `}</style>
        </main>

        {/* Safari bottom-bar clearance */}
        <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </div>
    </div>
  );
}
