"use client";

// /journal — the Journal (Merlin, 2026-10-22): a per-user journal in
// the UTILITIES menu. Entries are stored in the user's own database
// rows via /api/journal and timestamped AUTOMATICALLY by the
// database — the page never invents a date. Default view: a
// horizontal carousel, newest -> oldest. Two toggle switches let the
// user flip the order (newest <-> oldest) and the layout
// (carousel <-> vertical list); both preferences persist on-device.
//
// CSS rule (Merlin): no overlapping — every region is plain flex/grid
// flow with gaps; cards have fixed shrink-0 widths in the carousel
// and min-w-0 text runs, so nothing can collide at 390px or 1280px.
//
// Honest states: signed-out and setup-pending (until
// supabase/journal.sql gets Merlin's green light) are shown plainly;
// entries are never fake-saved.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import JournalEntryCard from "@/components/journal/JournalEntryCard";
import ToggleSwitch from "@/components/journal/ToggleSwitch";
import { normalizeLayout, normalizeOrder } from "@/lib/journal/entries";

const PREFS_KEY = "olympus:journal:prefs:v1";

async function getToken() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

function loadPrefs() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}");
    return { order: normalizeOrder(raw.order), layout: normalizeLayout(raw.layout) };
  } catch {
    return { order: "desc", layout: "horizontal" };
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked — preferences still apply for this visit */
  }
}

export default function JournalPage() {
  // phase: loading | signed-out | setup | error | ready
  const [phase, setPhase] = useState("loading");
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [order, setOrder] = useState("desc");
  const [layout, setLayout] = useState("horizontal");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef(null);

  // Hydrate the two view preferences (order + layout) from this device.
  useEffect(() => {
    const prefs = loadPrefs();
    setOrder(prefs.order);
    setLayout(prefs.layout);
  }, []);

  // Search is server-side; debounce keystrokes before asking.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const loadEntries = useCallback(
    async (q = debouncedQuery, ord = order) => {
      const token = await getToken();
      if (!token) {
        setPhase("signed-out");
        setEntries([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/journal?q=${encodeURIComponent(q)}&order=${ord}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          setPhase("signed-out");
          return;
        }
        if (data && data.setupRequired) {
          setPhase("setup");
          return;
        }
        if (!res.ok || !data || !data.ok) {
          setPhase("error");
          setNotice((data && data.error) || "Your journal could not be loaded.");
          return;
        }
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        setActiveIndex(0);
        setPhase("ready");
      } catch {
        setPhase("error");
        setNotice("Your journal could not be loaded.");
      }
    },
    [debouncedQuery, order]
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function authedFetch(path, init) {
    const token = await getToken();
    if (!token) {
      setPhase("signed-out");
      return null;
    }
    return fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async function handleCreate() {
    if (busy || !body.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await authedFetch("/api/journal", {
        method: "POST",
        body: JSON.stringify({ title: title.trim() || null, body }),
      });
      const data = res ? await res.json().catch(() => null) : null;
      if (data && data.setupRequired) {
        setPhase("setup");
        return;
      }
      if (!res || !res.ok || !data || !data.ok) {
        setNotice((data && data.error) || "That entry could not be saved.");
        return;
      }
      setTitle("");
      setBody("");
      setQuery("");
      setDebouncedQuery("");
      await loadEntries("", order);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id, draft) {
    setBusy(true);
    setNotice("");
    try {
      const res = await authedFetch("/api/journal", {
        method: "PATCH",
        body: JSON.stringify({ id, title: draft.title, body: draft.body }),
      });
      const data = res ? await res.json().catch(() => null) : null;
      if (data && data.setupRequired) {
        setPhase("setup");
        return false;
      }
      if (!res || !res.ok || !data || !data.ok) {
        setNotice((data && data.error) || "That edit could not be saved.");
        return false;
      }
      await loadEntries();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    setNotice("");
    try {
      const res = await authedFetch(`/api/journal?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = res ? await res.json().catch(() => null) : null;
      if (data && data.setupRequired) {
        setPhase("setup");
        return;
      }
      if (!res || !res.ok || !data || !data.ok) {
        setNotice((data && data.error) || "That entry could not be deleted.");
        return;
      }
      await loadEntries();
    } finally {
      setBusy(false);
    }
  }

  function changeOrder(showOldestFirst) {
    const next = showOldestFirst ? "asc" : "desc";
    setOrder(next);
    savePrefs({ order: next, layout });
  }

  function changeLayout(showVertical) {
    const next = showVertical ? "vertical" : "horizontal";
    setLayout(next);
    savePrefs({ order, layout: next });
  }

  function cardStep() {
    const el = scrollerRef.current;
    if (!el || !el.firstElementChild) return 336;
    return el.firstElementChild.offsetWidth + 16; // card width + gap-4
  }

  function scrollByCard(dir) {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * cardStep(), behavior: "smooth" });
  }

  function scrollToIndex(i) {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * cardStep(), behavior: "smooth" });
  }

  function handleScrollerScroll() {
    const el = scrollerRef.current;
    if (!el || entries.length === 0) return;
    const idx = Math.round(el.scrollLeft / cardStep());
    setActiveIndex(Math.max(0, Math.min(entries.length - 1, idx)));
  }

  const searching = debouncedQuery.length > 0;

  return (
    <main className="min-h-[100dvh] bg-[#0a1120] text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link href="/" className="page-back">
            ← Hub
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">📓 Journal</h1>
            <p className="text-sm text-slate-400">
              Your entries, kept in your account and timestamped automatically.
            </p>
          </div>
        </header>

        {phase === "loading" && (
          <p className="text-sm text-slate-400">Loading your journal…</p>
        )}

        {phase === "signed-out" && (
          <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Sign in to keep your journal</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Journal entries live in your own account — timestamped by the
              database the moment you write them, and visible only to you.
              Sign in from the hub, then come back here.
            </p>
            <div>
              <Link
                href="/"
                className="inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
              >
                Back to the hub
              </Link>
            </div>
          </section>
        )}

        {phase === "setup" && (
          <section className="flex flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-6">
            <h2 className="text-lg font-semibold text-amber-200">
              Database setup pending
            </h2>
            <p className="text-sm leading-relaxed text-amber-100/90">
              The <span className="font-mono">journal_entries</span> table has
              not landed yet, so entries cannot be saved. Nothing is written
              anywhere until setup completes — the journal switches on the
              moment the table exists.
            </p>
          </section>
        )}

        {phase === "error" && (
          <section className="flex flex-col gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
            <p className="text-sm text-red-200">
              {notice || "Your journal could not be loaded."}
            </p>
            <div>
              <button
                type="button"
                onClick={() => loadEntries()}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
              >
                Try again
              </button>
            </div>
          </section>
        )}

        {phase === "ready" && (
          <>
            <section
              aria-label="Write a new entry"
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                maxLength={200}
                className="w-full min-w-0 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Dear journal…"
                rows={4}
                className="w-full min-w-0 resize-y rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy || !body.trim()}
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add entry
                </button>
                <span className="text-xs text-slate-500">
                  The date and time are stamped automatically when you save.
                </span>
              </div>
            </section>

            <section
              aria-label="Journal controls"
              className="flex flex-wrap items-center gap-x-8 gap-y-4"
            >
              <label className="flex min-w-[220px] flex-1 items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Search
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your entries…"
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                />
              </label>
              <ToggleSwitch
                label="Order"
                offLabel="Newest first"
                onLabel="Oldest first"
                checked={order === "asc"}
                onToggle={changeOrder}
              />
              <ToggleSwitch
                label="Layout"
                offLabel="Carousel"
                onLabel="List"
                checked={layout === "vertical"}
                onToggle={changeLayout}
              />
            </section>

            {notice && (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {notice}
              </p>
            )}

            {entries.length === 0 && (
              <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-white/15 p-8 text-center">
                <p className="text-base font-medium text-slate-200">
                  {searching ? "No entries match your search" : "Your journal is empty"}
                </p>
                <p className="text-sm text-slate-400">
                  {searching
                    ? "Try different words, or clear the search to see everything."
                    : "Write your first entry above — it will be stamped with today's date and time."}
                </p>
              </section>
            )}

            {entries.length > 0 && layout === "horizontal" && (
              <section aria-label="Entries carousel" className="flex flex-col gap-3">
                <div
                  ref={scrollerRef}
                  onScroll={handleScrollerScroll}
                  className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
                >
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="w-[86%] shrink-0 snap-center sm:w-[380px]"
                    >
                      <JournalEntryCard
                        entry={entry}
                        onSave={handleSaveEdit}
                        onDelete={handleDelete}
                        busy={busy}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => scrollByCard(-1)}
                      aria-label="Previous entry"
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/10"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollByCard(1)}
                      aria-label="Next entry"
                      className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/10"
                    >
                      Next →
                    </button>
                  </div>
                  <span className="text-xs text-slate-400">
                    Entry {activeIndex + 1} of {entries.length}
                  </span>
                  {entries.length <= 30 && (
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map((entry, i) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => scrollToIndex(i)}
                          aria-label={`Go to entry ${i + 1}`}
                          className={`h-2.5 w-2.5 rounded-full transition ${
                            i === activeIndex ? "bg-sky-300" : "bg-white/25 hover:bg-white/50"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {entries.length > 0 && layout === "vertical" && (
              <section aria-label="Entries list" className="flex flex-col gap-4">
                {entries.map((entry) => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    onSave={handleSaveEdit}
                    onDelete={handleDelete}
                    busy={busy}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
