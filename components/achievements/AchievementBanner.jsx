// components/achievements/AchievementBanner.jsx
// Shared achievement celebration. MERLIN'S RULE: achievements ALWAYS have a
// video celebration — if the catalog entry has a `video` path and the file
// loads, it plays (autoplay, muted, loop, playsInline); otherwise the
// typographic gold card renders as fallback.
//
// A banner, never a blocking modal (mirrors the Spooky Coin Collector
// TrophyOverlay pattern in components/SeasonalDecor.jsx): the backdrop is
// pointer-transparent, the card is dismissible with a clear close button,
// and it auto-dismisses after a few seconds. Mobile-first, Safari-safe.
//
// Usage: <AchievementBanner achievementKey="calendar-first-entry"
//          show={celebrate} onDismiss={() => setCelebrate(null)} />

"use client";

import { useEffect, useRef, useState } from "react";
import { getAchievement } from "@/lib/achievements/catalog";

const AUTO_DISMISS_MS = 8000;

export default function AchievementBanner({ achievementKey, show, onDismiss }) {
  const [videoOk, setVideoOk] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    // Reset video state each time the banner is shown for a new key.
    setVideoOk(true);
  }, [achievementKey, show]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onDismiss && onDismiss(), AUTO_DISMISS_MS);
    timerRef.current = t;
    return () => {
      clearTimeout(t);
      timerRef.current = null;
    };
  }, [show, achievementKey, onDismiss]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  if (!show) return null;
  const def = getAchievement(achievementKey);
  if (!def) return null;
  const useVideo = def.video && videoOk;

  const dismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (onDismiss) onDismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
        pointerEvents: "none", // banner, not a modal: page stays interactive
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          position: "relative",
          width: "100%",
          maxWidth: "min(92vw, 400px)",
          borderRadius: 18,
          overflow: "hidden",
          textAlign: "center",
          color: "#fff7e6",
          background: "rgba(10, 12, 26, 0.94)",
          border: "2px solid rgba(255, 190, 80, 0.65)",
          boxShadow:
            "0 0 42px rgba(255, 170, 60, 0.35), 0 18px 60px rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Close celebration"
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 2,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontSize: "1.1rem",
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        {useVideo ? (
          <video
            src={def.video}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            onError={() => setVideoOk(false)}
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "16 / 9",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        ) : null}

        <div style={{ padding: useVideo ? "12px 18px 20px" : "26px 18px 22px" }}>
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 800,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#ffd98a",
              marginBottom: "0.45rem",
            }}
          >
            Achievement unlocked
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              letterSpacing: "0.01em",
              marginBottom: "0.4rem",
            }}
          >
            {def.title}
          </div>
          {def.description && (
            <div
              style={{
                fontSize: "0.92rem",
                lineHeight: 1.6,
                color: "rgba(255,247,230,0.78)",
              }}
            >
              {def.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
