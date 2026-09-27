"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Browser's Castle — concept showcase.
 * Merged from highland88999-commits/Browsers-Castle (desktop hero)
 * and highland88999-commits/Browsers-Castle-Mobile (command deck).
 * All telemetry stripped. This is a showcase of a browser concept —
 * it is not itself a working browser.
 */

const VIDEO_SRC = "/videos/browsers-castle/courtyard.mp4";
const LOGO_SRC = "/videos/browsers-castle/logo.webp";
const VAULT_KEY = "browsers-castle-vault";

function normalizeTarget(raw) {
  const q = raw.trim();
  if (!q) return null;
  const looksLikeUrl = /^(https?:\/\/)?([\da-z.-]+)\.([a-z]{2,})([/\w .-]*)\/?$/i.test(q);
  if (looksLikeUrl) return q.startsWith("http") ? q : `https://${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
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

function VaultPanel() {
  const [items, setItems] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VAULT_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      setItems([]);
    }
  }, []);

  const persist = (next) => {
    setItems(next);
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — vault stays in memory */
    }
  };

  const addItem = () => {
    const target = normalizeTarget(urlInput);
    if (!target) return;
    let label = nameInput.trim();
    if (!label) {
      try {
        label = new URL(target).hostname.replace(/^www\./, "");
      } catch {
        label = target;
      }
    }
    persist([{ id: Date.now().toString(), label, url: target }, ...items]);
    setUrlInput("");
    setNameInput("");
  };

  return (
    <section aria-label="Link vault" style={panelStyle}>
      <h3 style={panelTitleStyle}>Your link vault</h3>
      <p style={panelTextStyle}>
        Saved links live only on this device, in your browser. Nothing is uploaded anywhere.
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
        <button onClick={addItem} style={buttonStyle} aria-label="Save link">
          Save
        </button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {items.length === 0 && (
          <li style={{ ...panelTextStyle, textAlign: "center", padding: 12 }}>
            Nothing saved yet.
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
              borderBottom: "1px solid rgba(0,255,255,0.12)",
            }}
          >
            <a
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, color: "#ffd700", fontSize: 14, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {it.label}
            </a>
            <button
              onClick={() => persist(items.filter((x) => x.id !== it.id))}
              style={{ ...buttonStyle, padding: "8px 12px", fontSize: 12 }}
              aria-label={`Remove ${it.label}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const panelStyle = {
  background: "rgba(8,8,20,0.78)",
  border: "1px solid rgba(0,255,255,0.25)",
  borderRadius: 12,
  padding: 20,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  width: "100%",
  maxWidth: 560,
  marginTop: 16,
};

const panelTitleStyle = {
  color: "#00ffff",
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
  border: "1px solid rgba(0,255,255,0.35)",
  borderRadius: 8,
  color: "#fff",
  padding: "12px 14px",
  fontSize: 15,
  minHeight: 44,
  width: "100%",
  boxSizing: "border-box",
};

const buttonStyle = {
  background: "rgba(0,255,255,0.12)",
  border: "1px solid rgba(0,255,255,0.5)",
  borderRadius: 8,
  color: "#00ffff",
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 700,
  minHeight: 44,
  cursor: "pointer",
  letterSpacing: 1,
};

export default function BrowsersCastlePage() {
  const [address, setAddress] = useState("");
  const [panel, setPanel] = useState(null); // null | "vault" | "about"

  const go = () => {
    const target = normalizeTarget(address);
    // Only ever opens on the user's explicit tap — never automatically.
    if (target) window.open(target, "_blank", "noopener,noreferrer");
  };

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
          padding: "max(20px, env(safe-area-inset-top)) 20px 40px",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        {/* Castle header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, width: "100%" }}>
          <img src={LOGO_SRC} alt="Browser's Castle logo" width={48} height={48} style={{ borderRadius: 10 }} />
          <div>
            <div style={{ color: "#00ffff", fontWeight: 800, letterSpacing: 3, fontSize: 15, textTransform: "uppercase" }}>
              Browser&apos;s Castle
            </div>
            <div
              style={{
                display: "inline-block",
                marginTop: 4,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#ffd700",
                border: "1px solid rgba(255,215,0,0.5)",
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              Concept showcase
            </div>
          </div>
        </header>

        {/* Hero */}
        <section style={{ textAlign: "center", marginBottom: 32 }}>
          <h1
            style={{
              color: "#00ffff",
              letterSpacing: 5,
              textTransform: "uppercase",
              fontSize: "clamp(1.8rem, 7vw, 2.8rem)",
              margin: "0 0 12px",
              textShadow: "0 0 14px rgba(0,255,255,0.45)",
            }}
          >
            Browser&apos;s Castle
          </h1>
          <p style={{ color: "#b8c4d8", fontSize: "clamp(0.95rem, 3.5vw, 1.1rem)", lineHeight: 1.7, margin: 0, maxWidth: 560 }}>
            A concept for a calmer, safer web browser — your links kept in a vault on your own device.
            This page is a showcase of the idea. It is not a working browser yet.
          </p>
        </section>

        {/* Command deck */}
        <section
          aria-label="Command deck"
          style={{
            width: "100%",
            background: "rgba(8,8,20,0.72)",
            border: "1px solid rgba(0,255,255,0.25)",
            borderRadius: 14,
            padding: 16,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="Type a web address or search…"
              aria-label="Web address or search"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={go} style={buttonStyle} aria-label="Open address in a new tab">
              Go
            </button>
          </div>
          <p style={{ color: "#8a93a8", fontSize: 12, margin: "10px 2px 0", lineHeight: 1.5 }}>
            Pressing Go opens the address in a new tab. Nothing here tracks what you type.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => togglePanel("vault")}
              aria-expanded={panel === "vault"}
              style={{ ...buttonStyle, flex: "1 1 140px", ...(panel === "vault" ? { background: "rgba(255,215,0,0.15)", borderColor: "#ffd700", color: "#ffd700" } : {}) }}
            >
              ★ Link vault
            </button>
            <button
              onClick={() => togglePanel("about")}
              aria-expanded={panel === "about"}
              style={{ ...buttonStyle, flex: "1 1 140px", ...(panel === "about" ? { background: "rgba(0,255,255,0.22)" } : {}) }}
            >
              ⓘ About
            </button>
          </div>
        </section>

        {panel === "vault" && <VaultPanel />}

        {panel === "about" && (
          <section aria-label="About the concept" style={panelStyle}>
            <h3 style={panelTitleStyle}>What is this?</h3>
            <p style={panelTextStyle}>
              Browser&apos;s Castle is Merlin&apos;s concept for a web browser built like a fortress:
              a calm home screen, an address bar, and a vault where your saved links stay on your own
              device instead of being uploaded to someone else&apos;s servers.
            </p>
            <h3 style={{ ...panelTitleStyle, marginTop: 16 }}>Roadmap</h3>
            <ul style={{ ...panelTextStyle, paddingLeft: 20, margin: 0 }}>
              <li>Link vault on this device — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>Address bar that opens pages in a new tab — <strong style={{ color: "#00ff9d" }}>working now</strong></li>
              <li>Desktop apps for Mac and Windows — <strong style={{ color: "#ffd700" }}>coming soon</strong></li>
              <li>A full browser of its own — <strong style={{ color: "#ffd700" }}>a bigger project for later</strong></li>
            </ul>
          </section>
        )}

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
          Concept showcase merged from the desktop and mobile prototypes.
          <br />
          No accounts, no tracking, no uploads.
        </footer>
      </div>
    </main>
  );
}
