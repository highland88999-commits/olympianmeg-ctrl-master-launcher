"use client";

import { useState } from "react";
import { formatEntryTimestamp, entryWasEdited } from "@/lib/journal/entries";

/**
 * JournalEntryCard — one journal entry: its automatic timestamp, an
 * optional title, the body, and Edit / Delete controls. Edit happens
 * inline on the card (title + body fields, Save / Cancel); Delete
 * asks first. Layout is pure flow (flex column with gaps, min-w-0 on
 * every text run) so text, stamps and buttons can never overlap.
 */
export default function JournalEntryCard({ entry, onSave, onDelete, busy }) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  function startEdit() {
    setDraftTitle(entry.title || "");
    setDraftBody(entry.body || "");
    setEditing(true);
  }

  async function saveEdit() {
    const saved = await onSave(entry.id, { title: draftTitle, body: draftBody });
    if (saved) setEditing(false);
  }

  function askDelete() {
    if (window.confirm("Delete this journal entry? This cannot be undone.")) {
      onDelete(entry.id);
    }
  }

  return (
    <article className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
      <header className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <time className="text-xs font-medium text-sky-300">
          {formatEntryTimestamp(entry.created_at)}
        </time>
        {entryWasEdited(entry) && (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-slate-400">
            edited
          </span>
        )}
      </header>

      {editing ? (
        <div className="flex min-w-0 flex-col gap-3">
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Title (optional)"
            maxLength={200}
            className="w-full min-w-0 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          />
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={6}
            className="w-full min-w-0 resize-y rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy || !draftBody.trim()}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {entry.title && (
            <h3 className="min-w-0 break-words text-base font-semibold text-slate-50">
              {entry.title}
            </h3>
          )}
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">
            {entry.body}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={startEdit}
              disabled={busy}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={askDelete}
              disabled={busy}
              className="rounded-lg border border-red-400/40 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
