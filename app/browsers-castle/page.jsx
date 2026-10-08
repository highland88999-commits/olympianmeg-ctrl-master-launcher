"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * Browser's Castle — a real tabbed web browser inside the castle.
 * Merged from highland88999-commits/Browsers-Castle (desktop hero)
 * and highland88999-commits/Browsers-Castle-Mobile (command deck).
 * All telemetry stripped. Tabs, vault (bookmarks), and history all live
 * on this device — nothing is uploaded anywhere.
 */

const VIDEO_SRC = "/videos/browsers-castle/courtyard.mp4";
const LOGO_SRC = "/videos/browsers-castle/logo.webp";
const VAULT_KEY = "browsers-castle-vault";
const HISTORY_KEY = "browsers-castle-history";
const MAX_TABS = 6;
const LOAD_TIMEOUT_MS = 15000;

// --- DIONYSUS interior treatment: SVG glyph system + panel tile (existing video/ember art untouched) ---
const BC_TILE = "/images/shared/magenta-marble-tile.webp";
const BC_GLYPHS = {
  bookmark: "M6 3h12v18l-6-4.5L6 21z",
  bookmarkFill: "M6 3h12v18l-6-4.5L6 21z",
  x: "M6 6l12 12M18 6 6 18",
  go: "M5 11h11V7l5 5-5 5v-4H5z",
  vault: "M4 10h16v10H4zm0-6h16v4H4zM8 14h8v2H8z",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v2h-2zm0 4h2v6h-2z",
  back: "M15 5l-7 7 7 7",
  fwd: "M9 5l7 7-7 7",
  reload: "M12 5a7 7 0 1 1-6.32 4M5 3v5h5",
  plus: "M12 5v14M5 12h14",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 5h2v2h-2zm0 4h2v6h-2z",
  external: "M14 4h6v6M20 4L10 14M9 5H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4",
};
function BcIcon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={BC_GLYPHS[name]} />
    </svg>
  );
}
const bcPanelTile = {
  backgroundImage: `url(${BC_TILE})`,
  backgroundSize: "128px 128px",
  backgroundBlendMode: "overlay",
};

function normalizeTarget(raw) {
  const q = raw.trim();
  if (!q) return null;
  const looksLikeUrl = /^(https?:\/\/)?([\da-z.-]+)\.([a-z]{2,})([/\w .-]*)\/?$/i.test(q);
  if (looksLikeUrl) return q.startsWith("http") ? q : `https://${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — stays in memory */
  }
}

function EmberField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = ["255,215,0", "0,255,255", "255,140,0"];
    const embers = Array.from({ length: 70 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 2.2,
      vy: 0.15 + Math.random() * 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
      a: 0.25 + Math.random() * 0.55,
      tw: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        const twinkle = e.a * (0.7 + 0.3 * Math.sin(e.tw));
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${e.c},${twinkle.toFixed(3)})`;
        ctx.fill();
      }
    };

    const tick = () => {
      for (const e of embers) {
        e.y -= e.vy;
        e.x += e.vx + Math.sin(e.tw) * 0.2;
        e.tw += 0.02;
        if (e.y < -6) {
          e.y = h + 6;
          e.x = Math.random() * w;
        }
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    draw();
    if (!reduced) raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}

/** Link vault = the browser's bookmarks. Lives in localStorage, on this device only. */
function VaultPanel({ items, onAdd, onRemove, onOpen }) {
  const [urlInput, setUrlInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  const addItem = () => {
    const target = normalizeTarget(urlInput);
    if (!target) return;
    let label = nameInput.trim();
    if (!label) label = hostnameOf(target);
    onAdd(label, target);
    setUrlInput("");
    setNameInput("");
  };

  return (
    <section aria-label="Link vault" style={panelStyle}>
      <h3 style={panelTitleStyle}>Your link vault</h3>
      <p style={panelTextStyle}>
        Your bookmarks. They live only on this device, in your browser. Nothing is uploaded anywhere.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Name (optional)"
          aria-label="Bookmark name"
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Paste a link, e.g. example.com"
          aria-label="Link address"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={addItem} style={{ ...buttonStyle, display: "inline-flex", alignItems: "center", gap: 8 }} aria-label="Save link">
          <BcIcon name="bookmark" />
          Save
        </button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {items.length === 0 && (
          <li style={{ ...panelTextStyle, textAlign: "center", padding: 12 }}>
            Nothing saved yet. Tap the star in the toolbar to bookmark the open page.
          </li>
        )}
        {items.map((it) => (
          <li
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 4px",
              borderBottom: "1px solid rgba(0,242,255,0.12)",
            }}
          >
            <button
              onClick={() => onOpen(it.url)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                padding: 0,
                color: "#ffd700",
                fontSize: 14,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: "pointer",
                minHeight: 44,
              }}
              aria-label={`Open ${it.label} in the castle`}
            >
              {it.label}
            </button>
            <button
              onClick={() => onRemove(it.id)}
              style={{ ...buttonStyle, padding: "8px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
              aria-label={`Remove ${it.label}`}
            >
              <BcIcon name="x" size={13} />
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryPanel({ entries, onOpen, onClear }) {
  return (
    <section aria-label="Browsing history" style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ ...panelTitleStyle, margin: 0 }}>History</h3>
        {entries.length > 0 && (
          <button onClick={onClear} style={{ ...buttonStyle, padding: "8px 14px", fontSize: 12 }} aria-label="Clear history">
            Clear all
          </button>
        )}
      </div>
      <p style={panelTextStyle}>Kept only on this device. Clearing wipes it for good.</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {entries.length === 0 && (
          <li style={{ ...panelTextStyle, textAlign: "center", padding: 12 }}>No history yet.</li>
        )}
        {entries.map((h) => (
          <li key={h.id} style={{ borderBottom: "1px solid rgba(0,242,255,0.12)" }}>
            <button
              onClick={() => onOpen(h.url)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                width: "100%",
                background: "none",
                border: "none",
                padding: "10px 4px",
                cursor: "pointer",
                minHeight: 44,
                textAlign: "left",
              }}
              aria-label={`Revisit ${hostnameOf(h.url)}`}
            >
              <span style={{ color: "#ffd700", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                {h.title || hostnameOf(h.url)}
              </span>
              <span style={{ color: "#5a6378", fontSize: 11 }}>
                {hostnameOf(h.url)} · {new Date(h.at).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const panelStyle = {
  background: "rgba(8,8,20,0.78)",
  border: "1px solid rgba(0,242,255,0.25)",
  borderRadius: 12,
  padding: 20,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  width: "100%",
  maxWidth: 560,
  marginTop: 16,
  ...bcPanelTile,
};

const panelTitleStyle = {
  color: "#00f2ff",
  fontSize: 16,
  letterSpacing: 3,
  textTransform: "uppercase",
  margin: "0 0 8px",
};

const panelTextStyle = {
  color: "#b8c4d8",
  fontSize: 14,
  lineHeight: 1.6,
  margin: "0 0 12px",
};

const inputStyle = {
  background: "rgba(0,0,0,0.6)",
  border: "1px solid rgba(0,242,255,0.35)",
  borderRadius: 8,
  color: "#fff",
  padding: "12px 14px",
  fontSize: 15,
  minHeight: 44,
  width: "100%",
  boxSizing: "border-box",
};

const buttonStyle = {
  background: "rgba(0,242,255,0.12)",
  border: "1px solid rgba(0,242,255,0.5)",
  borderRadius: 8,
  color: "#00f2ff",
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 700,
  minHeight: 44,
  cursor: "pointer",
  letterSpacing: 1,
};

const toolButtonStyle = {
  ...buttonStyle,
  padding: 0,
  width: 44,
  minWidth: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

let tabSeq = 0;
function newTab() {
  tabSeq += 1;
  return { id: `tab-${Date.now()}-${tabSeq}`, url: null, title: "New tab", blocked: false, loading: false, slow: false };
}

export default function BrowsersCastlePage() {
  const [tabs, setTabs] = useState(() => [newTab()]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState(null); // null | "vault" | "history" | "about"
  const [vault, setVault] = useState([]);
  const [history, setHistory] = useState([]);
  const iframeRefs = useRef({});
  const loadTimers = useRef({});

  useEffect(() => {
    setVault(readStore(VAULT_KEY, []));
    setHistory(readStore(HISTORY_KEY, []));
    return () => {
      Object.values(loadTimers.current).forEach(clearTimeout);
    };
  }, []);

  const activeTab = tabs.find((t) => t.id === activeId) || tabs[0];

  // Keep the address bar in sync with the active tab.
  useEffect(() => {
    setDraft(activeTab.url || "");
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchTab = (id, patch) =>
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? (typeof patch === "function" ? patch(t) : { ...t, ...patch }) : t))
    );

  const armLoadTimer = (id) => {
    clearTimeout(loadTimers.current[id]);
    loadTimers.current[id] = setTimeout(() => {
      patchTab(id, { slow: true });
    }, 6000);
    // Hard stop: never spin forever without saying something.
    loadTimers.current[`hard-${id}`] = setTimeout(() => {
      patchTab(id, (t) => (t.loading ? { loading: false, slow: false } : t));
    }, LOAD_TIMEOUT_MS);
  };

  const clearLoadTimers = (id) => {
    clearTimeout(loadTimers.current[id]);
    clearTimeout(loadTimers.current[`hard-${id}`]);
  };

  const recordHistory = (url, title) => {
    setHistory((prev) => {
      const entry = { id: `${Date.now()}`, url, title: title || hostnameOf(url), at: Date.now() };
      const next = [entry, ...prev.filter((h) => h.url !== url)].slice(0, 100);
      writeStore(HISTORY_KEY, next);
      return next;
    });
  };

  const navigate = (raw) => {
    const target = normalizeTarget(raw);
    if (!target || !activeTab) return;
    clearLoadTimers(activeTab.id);
    patchTab(activeTab.id, { url: target, title: hostnameOf(target), blocked: false, loading: true, slow: false });
    setDraft(target);
    setPanel(null);
    recordHistory(target);
    armLoadTimer(activeTab.id);
  };

  /** Frame-block detection: a refused frame fires load with location stuck at about:blank. */
  const handleIframeLoad = (id) => {
    const frame = iframeRefs.current[id];
    let blocked = false;
    let title = null;
    if (frame) {
      try {
        const href = frame.contentWindow.location.href;
        blocked = href === "about:blank";
        if (!blocked) {
          try {
            title = frame.contentDocument.title || null;
          } catch {
            /* cross-origin: title unreadable */
          }
        }
      } catch {
        // Cross-origin read throws — the page loaded fine, it just won't share its title.
        blocked = false;
      }
    }
    clearLoadTimers(id);
    patchTab(id, {
      loading: false,
      slow: false,
      blocked,
      ...(title ? { title } : {}),
    });
    if (!blocked && title) {
      setHistory((prev) => {
        const tab = tabs.find((t) => t.id === id);
        const next = prev.map((h) => (tab && h.url === tab.url ? { ...h, title } : h));
        writeStore(HISTORY_KEY, next);
        return next;
      });
    }
  };

  const frameOf = (id) => iframeRefs.current[id] || null;

  const goBack = () => {
    const f = frameOf(activeId);
    if (!f) return;
    try {
      f.contentWindow.history.back();
    } catch {
      /* frame refused history access */
    }
  };
  const goForward = () => {
    const f = frameOf(activeId);
    if (!f) return;
    try {
      f.contentWindow.history.forward();
    } catch {
      /* frame refused history access */
    }
  };
  const reloadTab = () => {
    const f = frameOf(activeId);
    if (!f || !activeTab.url) return;
    patchTab(activeId, { blocked: false, loading: true, slow: false });
    armLoadTimer(activeId);
    try {
      f.contentWindow.location.reload();
    } catch {
      // Fallback: re-assign src to force a fresh load.
      f.src = activeTab.url;
    }
  };

  const openNewTab = (url) => {
    const tab = newTab();
    let next = [...tabs, tab];
    if (next.length > MAX_TABS) {
      // Retire the oldest tab that isn't active.
      const victim = next.find((t) => t.id !== activeId);
      if (victim) {
        clearLoadTimers(victim.id);
        delete iframeRefs.current[victim.id];
        next = next.filter((t) => t.id !== victim.id);
      }
    }
    setTabs(next);
    setActiveId(tab.id);
    setDraft(url || "");
    setPanel(null);
    if (url) {
      const target = normalizeTarget(url);
      if (target) {
        patchTab(tab.id, { url: target, title: hostnameOf(target), loading: true });
        recordHistory(target);
        armLoadTimer(tab.id);
      }
    }
  };

  const closeTab = (id) => {
    clearLoadTimers(id);
    delete iframeRefs.current[id];
    if (tabs.length === 1) {
      const fresh = newTab();
      setTabs([fresh]);
      setActiveId(fresh.id);
      setDraft("");
      return;
    }
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (id === activeId) {
      setActiveId(next[next.length - 1].id);
      setDraft(next[next.length - 1].url || "");
    }
  };

  const openInTab = (url) => {
    // Open a vault/history link in the active tab (or a fresh one if it's busy).
    if (activeTab.url) openNewTab(url);
    else navigate(url);
  };

  const addBookmark = (label, url) => {
    setVault((prev) => {
      if (prev.some((b) => b.url === url)) return prev;
      const next = [{ id: Date.now().toString(), label, url }, ...prev];
      writeStore(VAULT_KEY, next);
      return next;
    });
  };
  const removeBookmark = (id) => {
    setVault((prev) => {
      const next = prev.filter((b) => b.id !== id);
      writeStore(VAULT_KEY, next);
      return next;
    });
  };
  const toggleBookmark = () => {
    if (!activeTab.url) return;
    if (vault.some((b) => b.url === activeTab.url)) removeBookmark(vault.find((b) => b.url === activeTab.url).id);
    else addBookmark(activeTab.title || hostnameOf(activeTab.url), activeTab.url);
  };
  const isBookmarked = activeTab.url ? vault.some((b) => b.url === activeTab.url) : false;

  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100dvh",
        background: "#05050a",
        color: "#e0e0ff",
        overflowX: "hidden",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Layer 0: video courtyard */}
      <video
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.5,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      {/* Layer 1: ember particles */}
      <EmberField />
      {/* Readability veil */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.72) 100%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "max(20px, env(safe-area-inset-top)) 16px 40px",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        {/* Castle header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, width: "100%" }}>
          <Image src={LOGO_SRC} alt="Browser's Castle logo" width={44} height={44} style={{ borderRadius: 10 }} />
          <div>
            <div style={{ color: "#00f2ff", fontWeight: 800, letterSpacing: 3, fontSize: 14, textTransform: "uppercase" }}>
              Browser&apos;s Castle
            </div>
            <div
              style={{
                display: "inline-block",
                marginTop: 4,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#00ff9d",
                border: "1px solid rgba(0,255,157,0.5)",
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              Working browser
            </div>
          </div>
        </header>

        {/* Tab strip */}
        <div
          role="tablist"
          aria-label="Open tabs"
          style={{
            display: "flex",
            gap: 8,
            width: "100%",
            overflowX: "auto",
            paddingBottom: 8,
            marginBottom: 8,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === activeId}
              onClick={() => setActiveId(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
                maxWidth: 200,
                padding: "0 6px 0 12px",
                borderRadius: 10,
                cursor: "pointer",
                flexShrink: 0,
                background: t.id === activeId ? "rgba(0,242,255,0.16)" : "rgba(8,8,20,0.6)",
                border: t.id === activeId ? "1px solid rgba(0,242,255,0.6)" : "1px solid rgba(0,242,255,0.2)",
              }}
            >
              <span
                style={{
                  color: t.id === activeId ? "#fff" : "#8a93a8",
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 140,
                }}
              >
                {t.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                aria-label={`Close tab ${t.title}`}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8a93a8",
                  cursor: "pointer",
                  minWidth: 44,
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BcIcon name="x" size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => openNewTab()}
            aria-label="Open a new tab"
            style={{ ...toolButtonStyle, borderRadius: 10 }}
          >
            <BcIcon name="plus" />
          </button>
        </div>

        {/* Toolbar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate(draft);
          }}
          aria-label="Browser toolbar"
          style={{
            width: "100%",
            background: "rgba(8,8,20,0.72)",
            border: "1px solid rgba(0,242,255,0.25)",
            borderRadius: 14,
            padding: 10,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            ...bcPanelTile,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={goBack} aria-label="Go back" style={toolButtonStyle}>
              <BcIcon name="back" />
            </button>
            <button type="button" onClick={goForward} aria-label="Go forward" style={toolButtonStyle}>
              <BcIcon name="fwd" />
            </button>
            <button type="button" onClick={reloadTab} aria-label="Reload page" style={toolButtonStyle}>
              <BcIcon name="reload" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a web address or search…"
              aria-label="Web address or search"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              onClick={toggleBookmark}
              aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
              aria-pressed={isBookmarked}
              disabled={!activeTab.url}
              style={{
                ...toolButtonStyle,
                ...(isBookmarked ? { color: "#ffd700", borderColor: "#ffd700" } : {}),
                opacity: activeTab.url ? 1 : 0.4,
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill={isBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d={BC_GLYPHS.bookmark} />
              </svg>
            </button>
            <button type="submit" style={{ ...buttonStyle, display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 16px" }} aria-label="Go to address">
              <BcIcon name="go" />
              <span className="bc-go-label">Go</span>
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => togglePanel("vault")}
              aria-expanded={panel === "vault"}
              style={{ ...buttonStyle, flex: "1 1 120px", padding: "10px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, ...(panel === "vault" ? { background: "rgba(255,215,0,0.15)", borderColor: "#ffd700", color: "#ffd700" } : {}) }}
            >
              <BcIcon name="vault" />
              Vault
            </button>
            <button
              type="button"
              onClick={() => togglePanel("history")}
              aria-expanded={panel === "history"}
              style={{ ...buttonStyle, flex: "1 1 120px", padding: "10px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, ...(panel === "history" ? { background: "rgba(0,242,255,0.22)" } : {}) }}
            >
              <BcIcon name="clock" />
              History
            </button>
            <button
              type="button"
              onClick={() => togglePanel("about")}
              aria-expanded={panel === "about"}
              style={{ ...buttonStyle, flex: "1 1 120px", padding: "10px 12px", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, ...(panel === "about" ? { background: "rgba(0,242,255,0.22)" } : {}) }}
            >
              <BcIcon name="info" />
              About
            </button>
          </div>
        </form>

        {panel === "vault" && (
          <VaultPanel items={vault} onAdd={addBookmark} onRemove={removeBookmark} onOpen={openInTab} />
        )}
        {panel === "history" && (
          <HistoryPanel
            entries={history}
            onOpen={openInTab}
            onClear={() => {
              setHistory([]);
              writeStore(HISTORY_KEY, []);
            }}
          />
        )}
        {panel === "about" && (
          <section aria-label="About the browser" style={panelStyle}>
            <h3 style={panelTitleStyle}>What is this?</h3>
            <p style={panelTextStyle}>
              Browser&apos;s Castle is Merlin&apos;s web browser built like a fortress: tabs, an address
              bar, a vault for your bookmarks, and a history — all kept on your own device instead of
              being uploaded to someone else&apos;s servers.
            </p>
            <h3 style={{ ...panelTitleStyle, marginTop: 16 }}>What works</h3>
            <ul style={{ ...panelTextStyle, paddingLeft: 20, margin: 0 }}>
              <li>Tabbed browsing inside the castle — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>Back, forward, reload — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>Link vault (bookmarks) on this device — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>History on this device, clearable — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>Sites that refuse to be framed open in a new tab instead — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>Desktop apps — <strong style={{ color: "#ffd700" }}>a bigger project for later</strong></li>
            </ul>
          </section>
        )}

        {/* Viewport */}
        <section aria-label="Browser viewport" style={{ width: "100%", marginTop: 16 }}>
          {tabs.map((t) => (
            <div
              key={t.id}
              style={{
                display: t.id === activeId ? "block" : "none",
                position: "relative",
                width: "100%",
                height: "clamp(340px, 62dvh, 720px)",
                borderRadius: 14,
                overflow: "hidden",
                background: "rgba(4,4,10,0.9)",
                border: "1px solid rgba(0,242,255,0.25)",
              }}
            >
              {!t.url ? (
                /* New-tab home */
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: "#00f2ff", fontSize: 15, letterSpacing: 4, textTransform: "uppercase", fontWeight: 800 }}>
                    The castle gates are open
                  </div>
                  <p style={{ color: "#8a93a8", fontSize: 14, margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
                    Type a web address or a search above and press Go. Your tabs, vault, and history
                    never leave this device.
                  </p>
                  {vault.length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                      {vault.slice(0, 6).map((b) => (
                        <button
                          key={b.id}
                          onClick={() => navigate(b.url)}
                          style={{ ...buttonStyle, padding: "10px 14px", fontSize: 13 }}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : t.blocked ? (
                /* Frame-blocked fallback — never a blank hang */
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    padding: 24,
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: "#ffd700", fontSize: 15, letterSpacing: 3, textTransform: "uppercase", fontWeight: 800 }}>
                    This site won&apos;t open inside the castle
                  </div>
                  <p style={{ color: "#8a93a8", fontSize: 14, margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
                    {hostnameOf(t.url)} refuses to be shown inside another page. That&apos;s the
                    site&apos;s choice, not a bug — you can still visit it directly.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    <button
                      onClick={() => window.open(t.url, "_blank", "noopener,noreferrer")}
                      style={{ ...buttonStyle, display: "inline-flex", alignItems: "center", gap: 8 }}
                    >
                      <BcIcon name="external" />
                      Open in new tab
                    </button>
                    <button onClick={reloadTab} style={buttonStyle}>
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <iframe
                    ref={(el) => {
                      if (el) iframeRefs.current[t.id] = el;
                      else delete iframeRefs.current[t.id];
                    }}
                    src={t.url}
                    title={t.title}
                    onLoad={() => handleIframeLoad(t.id)}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                    referrerPolicy="no-referrer"
                    allowFullScreen
                    style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
                  />
                  {t.loading && (
                    <div
                      aria-live="polite"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        background: "rgba(4,4,10,0.92)",
                        color: "#8a93a8",
                        fontSize: 14,
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          border: "3px solid rgba(0,242,255,0.25)",
                          borderTopColor: "#00f2ff",
                          animation: "bc-spin 0.9s linear infinite",
                        }}
                      />
                      {t.slow ? "Taking longer than usual…" : `Opening ${hostnameOf(t.url)}…`}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </section>

        {/* Desktop builds — honest placeholders */}
        <section style={{ ...panelStyle, textAlign: "center" }} aria-label="Desktop downloads">
          <h3 style={panelTitleStyle}>Desktop apps</h3>
          <p style={panelTextStyle}>The Mac and Windows versions of the castle aren&apos;t built yet.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button disabled style={{ ...buttonStyle, opacity: 0.45, cursor: "not-allowed" }} aria-disabled="true">
              Mac — coming soon
            </button>
            <button disabled style={{ ...buttonStyle, opacity: 0.45, cursor: "not-allowed" }} aria-disabled="true">
              Windows — coming soon
            </button>
          </div>
        </section>

        <footer style={{ marginTop: 28, color: "#5a6378", fontSize: 12, textAlign: "center", lineHeight: 1.6 }}>
          A real browser inside the castle. No accounts, no tracking, no uploads —
          your tabs, vault, and history stay on this device.
        </footer>
        {/* Radio-bar + Safari clearance: keeps last content above the fixed bottom bar */}
        <div aria-hidden="true" style={{ height: "calc(4.5rem + env(safe-area-inset-bottom))" }} />
      </div>

      <style>{`
        @keyframes bc-spin { to { transform: rotate(360deg); } }
        @media (max-width: 420px) {
          .bc-go-label { display: none; }
        }
      `}</style>
    </main>
  );
}
