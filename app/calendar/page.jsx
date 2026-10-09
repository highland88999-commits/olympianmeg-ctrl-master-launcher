"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Calendar — a clean, quiet month view for your schedule.
 * Per-user persistence via localStorage (keyed to the signed-in account;
 * cloud sync is a known backlog item).
 *
 * Background layers (in order):
 *   1. Intentional gradient fallback (always present).
 *   2. /videos/calendar-bg.mp4 when the file exists (autoplay, muted, loop,
 *      playsInline, object-fit cover, fixed full-bleed behind content).
 *   3. USER UPLOAD OVERRIDE — the user's own image or video, stored in
 *      IndexedDB (database "olympus-calendar", store "backgrounds", keyed by
 *      uid) so files larger than localStorage limits work. Chosen via the
 *      settings gear; choice persists per-user in localStorage.
 */

const VIDEO_SRC = "/videos/calendar-bg.mp4";
const FALLBACK_BG =
  "linear-gradient(160deg, #0b1526 0%, #16294a 45%, #0b1526 100%), radial-gradient(ellipse at 50% 0%, rgba(129,140,248,0.14), transparent 55%)";
const SCRIM =
  "linear-gradient(180deg, rgba(4,8,18,0.62) 0%, rgba(4,8,18,0.55) 50%, rgba(4,8,18,0.72) 100%)";

const DB_NAME = "olympus-calendar";
const DB_STORE = "backgrounds";

function eventsKey(uid) {
  return `olympus:calendar:${uid || "guest"}`;
}
function bgChoiceKey(uid) {
  return `olympus:calendar:bg-choice:${uid || "guest"}`;
}

function loadEvents(uid) {
  try {
    const obj = JSON.parse(window.localStorage.getItem(eventsKey(uid)) || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function persistEvents(uid, events) {
  try {
    window.localStorage.setItem(eventsKey(uid), JSON.stringify(events));
  } catch {
    /* storage full/blocked — events still work in memory */
  }
}

function loadBgChoice(uid) {
  try {
    const v = window.localStorage.getItem(bgChoiceKey(uid));
    return v === "upload" ? "upload" : "default";
  } catch {
    return "default";
  }
}

function persistBgChoice(uid, choice) {
  try {
    window.localStorage.setItem(bgChoiceKey(uid), choice);
  } catch {
    /* ignore */
  }
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function dayKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Build the 6-row (or fewer) cell list for a month grid. */
function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  for (let i = startDay - 1; i >= 0; i--) {
    cells.push({
      y: prevYear,
      m: prevMonth,
      d: daysInPrevMonth - i,
      other: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: year, m: month, d, other: false });
  }
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ y: nextYear, m: nextMonth, d: trailing++, other: true });
  }
  return cells;
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtLongDate(y, m, d) {
  return new Date(y, m, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// --- IndexedDB: custom background storage -----------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

async function readUpload(uid) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(uid || "guest");
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("read failed"));
    tx.oncomplete = () => db.close();
  });
}

async function writeUpload(uid, blob, mimeType) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ blob, mimeType }, uid || "guest");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error || new Error("write failed"));
  });
}

async function deleteUpload(uid) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(uid || "guest");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error || new Error("delete failed"));
  });
}

// --- styles -----------------------------------------------------------------

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
  maxWidth: 560,
  width: "100%",
  margin: "0 auto",
  padding: "1rem 1rem calc(1.5rem + env(safe-area-inset-bottom))",
};

const btn = {
  border: "1px solid rgba(165,180,252,0.35)",
  background: "rgba(99,102,241,0.16)",
  color: "#e0e7ff",
  borderRadius: 10,
  padding: "0.55rem 1rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn = {
  ...btn,
  background: "rgba(148,163,184,0.10)",
  borderColor: "rgba(148,163,184,0.28)",
  color: "#cbd5e1",
};

const field = {
  background: "rgba(2,6,17,0.55)",
  border: "1px solid rgba(165,180,252,0.25)",
  borderRadius: 10,
  color: "#f1f5f9",
  padding: "0.6rem 0.9rem",
  fontSize: "0.95rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const card = {
  background: "rgba(2,6,17,0.55)",
  border: "1px solid rgba(165,180,252,0.18)",
  borderRadius: 12,
  backdropFilter: "blur(6px)",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [uid, setUid] = useState(null);
  const [uidReady, setUidReady] = useState(false);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [events, setEvents] = useState({});
  const [selected, setSelected] = useState(null); // { y, m, d }
  const [editing, setEditing] = useState(null); // { id, title, time, notes } | { id:null, ... }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bgChoice, setBgChoice] = useState("default");
  const [videoOk, setVideoOk] = useState(true);
  const [upload, setUpload] = useState(null); // { blob, mimeType } | null
  const [uploadUrl, setUploadUrl] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef(null);
  const uploadUrlRef = useRef(null);

  // --- auth / uid -----------------------------------------------------------
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

  // --- load persisted state -------------------------------------------------
  useEffect(() => {
    if (!uidReady) return;
    setEvents(loadEvents(uid));
    setBgChoice(loadBgChoice(uid));
    let alive = true;
    (async () => {
      try {
        const rec = await readUpload(uid);
        if (alive) setUpload(rec);
      } catch {
        if (alive) setUpload(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, uidReady]);

  useEffect(() => {
    if (!uidReady) return;
    persistEvents(uid, events);
  }, [events, uid, uidReady]);

  // --- custom background object URL -----------------------------------------
  useEffect(() => {
    if (uploadUrlRef.current) {
      URL.revokeObjectURL(uploadUrlRef.current);
      uploadUrlRef.current = null;
    }
    if (upload && upload.blob) {
      const url = URL.createObjectURL(upload.blob);
      uploadUrlRef.current = url;
      setUploadUrl(url);
    } else {
      setUploadUrl(null);
    }
    return () => {
      if (uploadUrlRef.current) {
        URL.revokeObjectURL(uploadUrlRef.current);
        uploadUrlRef.current = null;
      }
    };
  }, [upload]);

  const cells = useMemo(() => monthCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedKey = selected ? dayKey(selected.y, selected.m, selected.d) : null;
  const selectedEvents = useMemo(() => {
    if (!selectedKey) return [];
    const list = events[selectedKey] || [];
    return [...list].sort((a, b) => (a.time || "99") < (b.time || "99") ? -1 : 1);
  }, [events, selectedKey]);

  function monthTitle() {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelected({ y: today.getFullYear(), m: today.getMonth(), d: today.getDate() });
  }

  function pickDay(cell) {
    setConfirmDelete(null);
    setEditing(null);
    if (cell.other) {
      setViewYear(cell.y);
      setViewMonth(cell.m);
    }
    setSelected({ y: cell.y, m: cell.m, d: cell.d });
  }

  // --- events ---------------------------------------------------------------
  function startNewEvent() {
    setConfirmDelete(null);
    setEditing({ id: null, title: "", time: "", notes: "" });
  }

  function startEditEvent(ev) {
    setConfirmDelete(null);
    setEditing({ id: ev.id, title: ev.title || "", time: ev.time || "", notes: ev.notes || "" });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function saveEvent() {
    if (!selectedKey || !editing) return;
    const title = (editing.title || "").trim();
    if (!title) return;
    const now = Date.now();
    setEvents((prev) => {
      const list = [...(prev[selectedKey] || [])];
      if (editing.id) {
        const i = list.findIndex((e) => e.id === editing.id);
        if (i >= 0) {
          list[i] = {
            ...list[i],
            title,
            time: editing.time || "",
            notes: (editing.notes || "").trim(),
            updatedAt: now,
          };
        }
      } else {
        list.push({
          id: newId(),
          title,
          time: editing.time || "",
          notes: (editing.notes || "").trim(),
          createdAt: now,
          updatedAt: now,
        });
      }
      const next = { ...prev, [selectedKey]: list };
      if (next[selectedKey].length === 0) delete next[selectedKey];
      return next;
    });
    setEditing(null);
  }

  function requestDelete(id) {
    if (confirmDelete === id) {
      setEvents((prev) => {
        const list = (prev[selectedKey] || []).filter((e) => e.id !== id);
        const next = { ...prev };
        if (list.length === 0) delete next[selectedKey];
        else next[selectedKey] = list;
        return next;
      });
      setConfirmDelete(null);
      if (editing && editing.id === id) setEditing(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete((c) => (c === id ? null : c)), 3000);
    }
  }

  // --- background settings ---------------------------------------------------
  function chooseBg(choice) {
    setBgChoice(choice);
    persistBgChoice(uid, choice);
  }

  async function handleFile(file) {
    setUploadError("");
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setUploadError("Please choose an image or video file.");
      return;
    }
    setUploadBusy(true);
    try {
      await writeUpload(uid, file, file.type || "application/octet-stream");
      setUpload({ blob: file, mimeType: file.type });
      chooseBg("upload");
    } catch {
      setUploadError("Could not save that file on this device.");
    } finally {
      setUploadBusy(false);
    }
  }

  async function removeUpload() {
    setUploadError("");
    setUploadBusy(true);
    try {
      await deleteUpload(uid);
    } catch {
      /* record may not exist — fine */
    }
    setUpload(null);
    chooseBg("default");
    setUploadBusy(false);
  }

  const useUploadBg = bgChoice === "upload" && upload && uploadUrl;
  const uploadIsVideo = upload && (upload.mimeType || "").startsWith("video/");

  return (
    <div style={shell}>
      {/* Layer 1: gradient fallback */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", background: FALLBACK_BG }}
      />
      {/* Layer 2: shipped background video (if present) */}
      {bgChoice === "default" && videoOk && (
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
            pointerEvents: "none",
          }}
        />
      )}
      {/* Layer 3: user upload override */}
      {useUploadBg &&
        (uploadIsVideo ? (
          <video
            src={uploadUrl}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage: `url(${uploadUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ))}
      {/* Readability scrim */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", background: SCRIM }}
      />

      <div style={content}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.9rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, letterSpacing: "0.01em" }}>
            Calendar
          </h1>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label={settingsOpen ? "Close settings" : "Open settings"}
            aria-expanded={settingsOpen}
            style={{
              ...ghostBtn,
              padding: "0.5rem 0.65rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.6a7.7 7.7 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.7 7.7 0 0 0 2.6 1.5l.5 2.6h4l.5-2.6a7.7 7.7 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div style={{ ...card, padding: "1rem", marginBottom: "0.9rem" }}>
            <div style={{ fontWeight: 800, fontSize: "1rem", marginBottom: "0.6rem" }}>
              Background
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <button
                onClick={() => chooseBg("default")}
                aria-pressed={bgChoice === "default"}
                style={bgChoice === "default" ? btn : ghostBtn}
              >
                Default
              </button>
              <button
                onClick={() => chooseBg("upload")}
                aria-pressed={bgChoice === "upload"}
                disabled={!upload}
                title={upload ? "Use your uploaded background" : "Upload a background first"}
                style={{
                  ...(bgChoice === "upload" ? btn : ghostBtn),
                  opacity: upload ? 1 : 0.5,
                  cursor: upload ? "pointer" : "not-allowed",
                }}
              >
                My upload
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              aria-label="Upload a background image or video"
              onChange={(e) => {
                handleFile(e.target.files && e.target.files[0]);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => fileRef.current && fileRef.current.click()} style={ghostBtn} disabled={uploadBusy}>
                {uploadBusy ? "Saving…" : upload ? "Replace upload" : "Upload image or video"}
              </button>
              {upload && (
                <button onClick={removeUpload} style={ghostBtn} disabled={uploadBusy}>
                  Remove
                </button>
              )}
            </div>
            {uploadError && (
              <div style={{ color: "#fca5a5", fontSize: "0.85rem", marginTop: "0.6rem" }}>
                {uploadError}
              </div>
            )}
            {upload && uploadUrl && (
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ fontSize: "0.78rem", color: "#7d8da6", marginBottom: "0.35rem" }}>
                  Current custom background
                </div>
                {uploadIsVideo ? (
                  <video
                    src={uploadUrl}
                    muted
                    playsInline
                    style={{
                      width: "100%",
                      maxHeight: 160,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid rgba(165,180,252,0.25)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 120,
                      borderRadius: 10,
                      border: "1px solid rgba(165,180,252,0.25)",
                      backgroundImage: `url(${uploadUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                )}
              </div>
            )}
            <div style={{ fontSize: "0.78rem", color: "#7d8da6", marginTop: "0.75rem", lineHeight: 1.6 }}>
              Your upload is stored on this device only, and applies to your account on this
              device.
            </div>
          </div>
        )}

        {/* Month controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" style={ghostBtn}>
            ‹
          </button>
          <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: "1.1rem" }}>
            {monthTitle()}
          </div>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" style={ghostBtn}>
            ›
          </button>
          <button onClick={goToday} style={ghostBtn} aria-label="Go to today">
            Today
          </button>
        </div>

        {/* Month grid */}
        <div style={{ ...card, padding: "0.75rem", marginBottom: "0.9rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              marginBottom: "0.4rem",
            }}
          >
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: "center",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#7d8da6",
                  padding: "0.3rem 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {w}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((c, i) => {
              const key = dayKey(c.y, c.m, c.d);
              const hasEvents = (events[key] || []).length > 0;
              const isToday =
                c.y === today.getFullYear() && c.m === today.getMonth() && c.d === today.getDate();
              const isSelected =
                selected && selected.y === c.y && selected.m === c.m && selected.d === c.d;
              return (
                <button
                  key={i}
                  onClick={() => pickDay(c)}
                  aria-label={`${fmtLongDate(c.y, c.m, c.d)}${hasEvents ? ", has events" : ""}`}
                  style={{
                    position: "relative",
                    aspectRatio: "1",
                    borderRadius: 10,
                    border: isSelected
                      ? "1px solid rgba(165,180,252,0.8)"
                      : "1px solid transparent",
                    background: isSelected
                      ? "rgba(99,102,241,0.28)"
                      : isToday
                        ? "rgba(99,102,241,0.14)"
                        : "transparent",
                    color: c.other ? "#4b5a75" : isToday ? "#e0e7ff" : "#dbe4f3",
                    fontSize: "0.92rem",
                    fontWeight: isToday || isSelected ? 800 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c.d}
                  {hasEvents && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        bottom: 6,
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: "#a5b4fc",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        {selected && (
          <div style={{ ...card, padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "1.05rem", flex: 1 }}>
                {fmtLongDate(selected.y, selected.m, selected.d)}
              </div>
              <button onClick={startNewEvent} style={btn} aria-label="Add event">
                + Add
              </button>
            </div>

            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Event title"
                  aria-label="Event title"
                  autoFocus
                  style={field}
                />
                <input
                  type="time"
                  value={editing.time}
                  onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                  aria-label="Event time (optional)"
                  style={{ ...field, colorScheme: "dark" }}
                />
                <textarea
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Notes (optional)"
                  aria-label="Event notes"
                  rows={3}
                  style={{ ...field, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={saveEvent}
                    disabled={!editing.title.trim()}
                    style={{
                      ...btn,
                      opacity: editing.title.trim() ? 1 : 0.5,
                      cursor: editing.title.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Save
                  </button>
                  <button onClick={cancelEdit} style={ghostBtn}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : selectedEvents.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#7d8da6",
                  padding: "1.5rem 1rem",
                  fontSize: "0.92rem",
                  lineHeight: 1.7,
                }}
              >
                Nothing scheduled.
                <br />
                Tap <strong style={{ color: "#c7d2fe" }}>+ Add</strong> to plan something.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      background: "rgba(99,102,241,0.10)",
                      border: "1px solid rgba(165,180,252,0.22)",
                      borderRadius: 10,
                      padding: "0.7rem 0.9rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.98rem" }}>{ev.title}</div>
                        {ev.time && (
                          <div style={{ color: "#a5b4fc", fontSize: "0.82rem", marginTop: "0.15rem" }}>
                            {fmtTime(ev.time)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => startEditEvent(ev)}
                        aria-label={`Edit event: ${ev.title}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#8b9bb8",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "0.3rem 0.4rem",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => requestDelete(ev.id)}
                        aria-label={`Delete event: ${ev.title}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: confirmDelete === ev.id ? "#fca5a5" : "#5b6b85",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "0.3rem 0.4rem",
                        }}
                      >
                        {confirmDelete === ev.id ? "Confirm?" : "✕"}
                      </button>
                    </div>
                    {ev.notes && (
                      <div
                        style={{
                          color: "#9fb0c9",
                          fontSize: "0.88rem",
                          marginTop: "0.35rem",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {ev.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
