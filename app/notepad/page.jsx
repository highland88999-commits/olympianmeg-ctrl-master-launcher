"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Notepad — a clean, quiet place for notes.
 * Per-user persistence via localStorage (keyed to the signed-in account;
 * cloud sync is a known backlog item). Video-ready background with an
 * intentional gradient fallback until Merlin's background video lands.
 */

const VIDEO_SRC = "/videos/notepad-bg.mp4";
const FALLBACK_BG =
  "linear-gradient(160deg, #0b1526 0%, #12263f 45%, #0b1526 100%), radial-gradient(ellipse at 50% 0%, rgba(96,165,250,0.14), transparent 55%)";

function storeKey(uid) {
  return `olympus:notepad:${uid || "guest"}`;
}

function loadNotes(uid) {
  try {
    const arr = JSON.parse(window.localStorage.getItem(storeKey(uid)) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persistNotes(uid, notes) {
  try {
    window.localStorage.setItem(storeKey(uid), JSON.stringify(notes));
  } catch {
    /* storage full/blocked — notes still work in memory */
  }
}

function fmtDate(ts) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function noteTitle(body) {
  const first = (body || "").split("\n")[0].trim();
  return first ? first.slice(0, 60) : "Untitled note";
}

function noteSnippet(body) {
  const rest = (body || "").split("\n").slice(1).join(" ").trim();
  return rest.slice(0, 90);
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `n-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const shell = {
  position: "relative",
  minHeight: "100dvh",
  overflow: "hidden",
  backgroundColor: "#0b1526",
  color: "#e8eef7",
  display: "flex",
  flexDirection: "column",
};

const content = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  maxWidth: 640,
  width: "100%",
  margin: "0 auto",
  padding: "1rem 1rem calc(1.5rem + env(safe-area-inset-bottom))",
};

const btn = {
  border: "1px solid rgba(147,197,253,0.35)",
  background: "rgba(59,130,246,0.16)",
  color: "#dbeafe",
  borderRadius: 10,
  padding: "0.55rem 1rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

export default function NotepadPage() {
  const [uid, setUid] = useState(null);
  const [uidReady, setUidReady] = useState(false);
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // { id: string|null, body: string }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [videoOk, setVideoOk] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) setUid(data?.session?.user?.id || null);
      } catch {
        if (alive) setUid(null);
      } finally {
        if (alive) setUidReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!uidReady) return;
    setNotes(loadNotes(uid));
  }, [uid, uidReady]);

  useEffect(() => {
    if (!uidReady) return;
    persistNotes(uid, notes);
  }, [notes, uid, uidReady]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter((n) => (n.body || "").toLowerCase().includes(q));
  }, [notes, query]);

  function openNote(note) {
    setConfirmDelete(null);
    setEditing({ id: note.id, body: note.body || "" });
  }

  function startNew() {
    setConfirmDelete(null);
    setEditing({ id: null, body: "" });
  }

  function closeEditor() {
    if (!editing) return;
    const body = editing.body;
    if (editing.id) {
      if (!body.trim()) {
        setNotes((prev) => prev.filter((n) => n.id !== editing.id));
      } else {
        setNotes((prev) =>
          prev.map((n) => (n.id === editing.id ? { ...n, body, updatedAt: Date.now() } : n))
        );
      }
    } else if (body.trim()) {
      const now = Date.now();
      setNotes((prev) => [{ id: newId(), body, createdAt: now, updatedAt: now }, ...prev]);
    }
    setEditing(null);
  }

  function requestDelete(id) {
    if (confirmDelete === id) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setConfirmDelete(null);
      if (editing && editing.id === id) setEditing(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete((c) => (c === id ? null : c)), 3000);
    }
  }

  return (
    <div style={shell}>
      {videoOk && (
        <video
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          onError={() => setVideoOk(false)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.35,
            pointerEvents: "none",
          }}
        />
      )}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", background: FALLBACK_BG }}
      />

      <div style={content}>
        {editing ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <button onClick={closeEditor} style={btn} aria-label="Back to notes">
                ← Notes
              </button>
              <div style={{ flex: 1 }} />
              {editing.id && (
                <button
                  onClick={() => requestDelete(editing.id)}
                  aria-label="Delete note"
                  style={{
                    ...btn,
                    borderColor:
                      confirmDelete === editing.id
                        ? "rgba(248,113,113,0.7)"
                        : "rgba(148,163,184,0.3)",
                    background:
                      confirmDelete === editing.id
                        ? "rgba(239,68,68,0.22)"
                        : "rgba(148,163,184,0.12)",
                    color: confirmDelete === editing.id ? "#fecaca" : "#cbd5e1",
                  }}
                >
                  {confirmDelete === editing.id ? "Tap again to delete" : "Delete"}
                </button>
              )}
            </div>
            <textarea
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="Start writing…"
              autoFocus
              aria-label="Note text"
              style={{
                flex: 1,
                minHeight: "50dvh",
                resize: "none",
                background: "rgba(2,6,17,0.55)",
                border: "1px solid rgba(147,197,253,0.25)",
                borderRadius: 14,
                color: "#f1f5f9",
                padding: "1rem",
                fontSize: "1.05rem",
                lineHeight: 1.6,
                outline: "none",
                backdropFilter: "blur(6px)",
              }}
            />
            <div style={{ marginTop: "0.6rem", fontSize: "0.78rem", color: "#7d8da6" }}>
              Saves automatically when you go back.
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.9rem",
              }}
            >
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, letterSpacing: "0.01em" }}>
                Notepad
              </h1>
              <div style={{ flex: 1 }} />
              <button onClick={startNew} style={btn} aria-label="New note">
                + New
              </button>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              aria-label="Search notes"
              style={{
                background: "rgba(2,6,17,0.55)",
                border: "1px solid rgba(147,197,253,0.25)",
                borderRadius: 10,
                color: "#f1f5f9",
                padding: "0.6rem 0.9rem",
                fontSize: "0.95rem",
                outline: "none",
                marginBottom: "0.9rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            {filtered.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#7d8da6",
                  padding: "3rem 1rem",
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                }}
              >
                {query ? (
                  <>No notes match “{query}”.</>
                ) : (
                  <>
                    Nothing here yet.
                    <br />
                    Tap <strong style={{ color: "#bfdbfe" }}>+ New</strong> to write your first
                    note.
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {filtered.map((n) => (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNote(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openNote(n);
                    }}
                    aria-label={`Open note: ${noteTitle(n.body)}`}
                    style={{
                      background: "rgba(2,6,17,0.55)",
                      border: "1px solid rgba(147,197,253,0.18)",
                      borderRadius: 12,
                      padding: "0.8rem 1rem",
                      cursor: "pointer",
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "1rem",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {noteTitle(n.body)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDelete(n.id);
                        }}
                        aria-label={`Delete note: ${noteTitle(n.body)}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: confirmDelete === n.id ? "#fca5a5" : "#5b6b85",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "0.3rem 0.5rem",
                        }}
                      >
                        {confirmDelete === n.id ? "Confirm?" : "✕"}
                      </button>
                    </div>
                    {noteSnippet(n.body) && (
                      <div
                        style={{
                          color: "#9fb0c9",
                          fontSize: "0.88rem",
                          marginTop: "0.25rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {noteSnippet(n.body)}
                      </div>
                    )}
                    <div style={{ color: "#5b6b85", fontSize: "0.75rem", marginTop: "0.35rem" }}>
                      {fmtDate(n.updatedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
