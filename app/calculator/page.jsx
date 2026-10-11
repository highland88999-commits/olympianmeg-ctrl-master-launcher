"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AchievementBanner from "@/components/achievements/AchievementBanner";

/**
 * Calculator — a clean everyday calculator with a running history tape.
 * Tape persists per signed-in account in localStorage. Video-ready
 * background with an intentional gradient fallback until Merlin's
 * background video lands. Button labels are crisp CSS text (never
 * AI-generated glyphs).
 */

const VIDEO_SRC = "/videos/calculator-bg.mp4";
const FALLBACK_BG =
  "linear-gradient(160deg, #101018 0%, #1c1030 50%, #0a0a12 100%), radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.16), transparent 55%)";

function storeKey(uid) {
  return `olympus:calculator:${uid || "guest"}`;
}

// First-completed-calculation flag (per account). The achievement grant
// itself is idempotent server-side, so this is just a client fast-path.
function usedKey(uid) {
  return `olympus:calculator:used:${uid || "guest"}`;
}

function hasUsed(uid) {
  try {
    return window.localStorage.getItem(usedKey(uid)) === "1";
  } catch {
    return false;
  }
}

function markUsed(uid) {
  try {
    window.localStorage.setItem(usedKey(uid), "1");
  } catch {
    /* ignore */
  }
}

function compute(a, b, op) {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
    default:
      return b;
  }
}

function tidy(n) {
  if (Number.isNaN(n) || !Number.isFinite(n)) return "Error";
  const r = parseFloat(n.toPrecision(12));
  return String(r);
}

function fmtOp(op) {
  return op;
}

const shell = {
  position: "relative",
  minHeight: "100dvh",
  overflow: "hidden",
  backgroundColor: "#101018",
  color: "#f4f1ff",
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
  maxWidth: 430,
  width: "100%",
  margin: "0 auto",
  padding: "1rem 1rem calc(1.5rem + env(safe-area-inset-bottom))",
};

const keyBase = {
  border: "1px solid rgba(167,139,250,0.22)",
  background: "rgba(30,27,46,0.72)",
  color: "#f4f1ff",
  borderRadius: 16,
  fontSize: "1.5rem",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 68,
  backdropFilter: "blur(6px)",
  touchAction: "manipulation",
  userSelect: "none",
  WebkitTapHighlightColor: "transparent",
};

const keyOp = {
  ...keyBase,
  background: "rgba(124,93,250,0.28)",
  borderColor: "rgba(167,139,250,0.45)",
  color: "#ddd0ff",
};

const keyUtil = {
  ...keyBase,
  background: "rgba(20,18,32,0.72)",
  color: "#b9a8f5",
  fontSize: "1.25rem",
};

const keyEq = {
  ...keyBase,
  background: "linear-gradient(160deg, #7c5dfa, #5b3df0)",
  borderColor: "rgba(196,181,253,0.6)",
  color: "#ffffff",
  fontWeight: 700,
};

export default function CalculatorPage() {
  const [uid, setUid] = useState(null);
  const [uidReady, setUidReady] = useState(false);
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState(null);
  const [op, setOp] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [tape, setTape] = useState([]);
  const [videoOk, setVideoOk] = useState(true);
  const [celebrateKey, setCelebrateKey] = useState(null); // achievement celebration

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
    try {
      const arr = JSON.parse(window.localStorage.getItem(storeKey(uid)) || "[]");
      if (Array.isArray(arr)) setTape(arr.slice(0, 20));
    } catch {
      /* ignore */
    }
  }, [uid, uidReady]);

  useEffect(() => {
    if (!uidReady) return;
    try {
      window.localStorage.setItem(storeKey(uid), JSON.stringify(tape.slice(0, 20)));
    } catch {
      /* ignore */
    }
  }, [tape, uid, uidReady]);

  const pushTape = useCallback((entry) => {
    setTape((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  const inputDigit = useCallback(
    (d) => {
      setDisplay((prev) => {
        if (waiting) {
          setWaiting(false);
          return d;
        }
        if (prev === "Error") return d;
        if (prev === "0") return d;
        if (prev === "-0") return "-" + d;
        return prev.replace(/,/g, "").length >= 12 ? prev : prev + d;
      });
    },
    [waiting]
  );

  const inputDot = useCallback(() => {
    setDisplay((prev) => {
      if (waiting) {
        setWaiting(false);
        return "0.";
      }
      if (prev === "Error") return "0.";
      return prev.includes(".") ? prev : prev + ".";
    });
  }, [waiting]);

  const clearAll = useCallback(() => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setWaiting(false);
  }, []);

  const backspace = useCallback(() => {
    setDisplay((prev) => {
      if (waiting || prev === "Error") return prev;
      const next = prev.slice(0, -1);
      return next === "" || next === "-" ? "0" : next;
    });
  }, [waiting]);

  const toggleSign = useCallback(() => {
    setDisplay((prev) => {
      if (prev === "Error" || prev === "0") return prev;
      return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
    });
  }, []);

  const percent = useCallback(() => {
    setDisplay((prev) => {
      if (prev === "Error") return prev;
      return tidy(parseFloat(prev) / 100);
    });
  }, []);

  const applyOperator = useCallback(
    (nextOp) => {
      const cur = parseFloat(display);
      if (Number.isNaN(cur)) return;
      if (acc !== null && op && !waiting) {
        const result = compute(acc, cur, op);
        const r = tidy(result);
        pushTape(`${tidy(acc)} ${fmtOp(op)} ${tidy(cur)} = ${r}`);
        setAcc(result);
        setDisplay(r);
      } else if (acc === null) {
        setAcc(cur);
      }
      setOp(nextOp);
      setWaiting(true);
    },
    [acc, op, waiting, display, pushTape]
  );

  // First Calculation achievement: fire-and-forget grant. Signed-in users
  // only (guests earn nothing server-side); the banner shows only when the
  // server confirms a fresh award.
  const grantFirstUse = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/achievements/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: "calculator-first-use" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json && json.awarded) setCelebrateKey("calculator-first-use");
    } catch {
      /* achievement failure must never break the calculator */
    }
  }, []);

  const equals = useCallback(() => {
    if (acc === null || !op) return;
    const cur = parseFloat(display);
    if (Number.isNaN(cur)) return;
    const result = compute(acc, cur, op);
    const r = tidy(result);
    pushTape(`${tidy(acc)} ${fmtOp(op)} ${tidy(cur)} = ${r}`);
    setDisplay(r);
    setAcc(null);
    setOp(null);
    setWaiting(true);
    // First Calculation: first completed calculation (a valid `=` result).
    if (r !== "Error" && !hasUsed(uid)) {
      markUsed(uid);
      grantFirstUse();
    }
  }, [acc, op, display, pushTape, uid, grantFirstUse]);

  const press = useCallback(
    (label) => {
      if (/^[0-9]$/.test(label)) return inputDigit(label);
      switch (label) {
        case ".":
          return inputDot();
        case "C":
          return clearAll();
        case "⌫":
          return backspace();
        case "±":
          return toggleSign();
        case "%":
          return percent();
        case "=":
          return equals();
        case "+":
        case "−":
        case "×":
        case "÷":
          return applyOperator(label);
        default:
          return undefined;
      }
    },
    [inputDigit, inputDot, clearAll, backspace, toggleSign, percent, equals, applyOperator]
  );

  useEffect(() => {
    function onKey(e) {
      const k = e.key;
      if (/^[0-9]$/.test(k)) return press(k);
      if (k === ".") return press(".");
      if (k === "+") return press("+");
      if (k === "-") return press("−");
      if (k === "*") return press("×");
      if (k === "/") {
        e.preventDefault();
        return press("÷");
      }
      if (k === "Enter" || k === "=") {
        e.preventDefault();
        return press("=");
      }
      if (k === "Backspace") return press("⌫");
      if (k === "Escape") return press("C");
      if (k === "%") return press("%");
      return undefined;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const rows = [
    [
      { label: "C", style: keyUtil },
      { label: "±", style: keyUtil },
      { label: "%", style: keyUtil },
      { label: "÷", style: keyOp },
    ],
    [
      { label: "7", style: keyBase },
      { label: "8", style: keyBase },
      { label: "9", style: keyBase },
      { label: "×", style: keyOp },
    ],
    [
      { label: "4", style: keyBase },
      { label: "5", style: keyBase },
      { label: "6", style: keyBase },
      { label: "−", style: keyOp },
    ],
    [
      { label: "1", style: keyBase },
      { label: "2", style: keyBase },
      { label: "3", style: keyBase },
      { label: "+", style: keyOp },
    ],
    [
      { label: "⌫", style: keyUtil },
      { label: "0", style: keyBase },
      { label: ".", style: keyBase },
      { label: "=", style: keyEq },
    ],
  ];

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
        <h1
          style={{
            margin: "0 0 0.4rem",
            fontSize: "1.5rem",
            fontWeight: 800,
            letterSpacing: "0.01em",
          }}
        >
          Calculator
        </h1>

        {tape.length > 0 && (
          <div
            aria-label="History tape"
            style={{
              maxHeight: 120,
              overflowY: "auto",
              marginBottom: "0.6rem",
              padding: "0.5rem 0.8rem",
              background: "rgba(2,2,10,0.55)",
              border: "1px solid rgba(167,139,250,0.18)",
              borderRadius: 12,
              fontSize: "0.82rem",
              color: "#b9a8f5",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.25rem",
              }}
            >
              <span style={{ fontWeight: 700, color: "#8f7fd6", fontSize: "0.72rem" }}>HISTORY</span>
              <button
                onClick={() => setTape([])}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6f5fb8",
                  cursor: "pointer",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                }}
              >
                Clear
              </button>
            </div>
            {tape.map((t, i) => (
              <div key={`${i}-${t}`} style={{ padding: "0.12rem 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t}
              </div>
            ))}
          </div>
        )}

        <div
          aria-live="polite"
          style={{
            background: "rgba(2,2,10,0.6)",
            border: "1px solid rgba(167,139,250,0.25)",
            borderRadius: 16,
            padding: "0.9rem 1.1rem",
            marginBottom: "0.8rem",
            textAlign: "right",
            backdropFilter: "blur(6px)",
          }}
        >
          <div style={{ minHeight: "1.2rem", fontSize: "0.95rem", color: "#8f7fd6" }}>
            {acc !== null && op ? `${tidy(acc)} ${fmtOp(op)}` : "\u00a0"}
          </div>
          <div
            style={{
              fontSize: "2.6rem",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {display}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
              {row.map((k) => (
                <button
                  key={k.label}
                  onClick={() => press(k.label)}
                  aria-label={k.label === "⌫" ? "Backspace" : `Key ${k.label}`}
                  style={k.style}
                >
                  {k.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <AchievementBanner
        achievementKey={celebrateKey}
        show={!!celebrateKey}
        onDismiss={() => setCelebrateKey(null)}
      />
    </div>
  );
}
