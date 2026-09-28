"use client";

import { useEffect, useRef, useState } from "react";
import {
  RUNES,
  LANES,
  MANA_PER_ROUND,
  createMatch,
  deployCard,
  battleRound,
  nextRound,
  elementColor,
} from "./game";

/**
 * Starblood — a rune-card battle game, rebuilt from the concept shell.
 * The original page had a board, a deck button, an empty rune codex and a
 * phony score table — but no game. This is the game: twelve original runes,
 * three lanes, blind deployment, best of five rounds. Wins and losses are
 * kept only on this device.
 */

function Glyph({ strokes, color, size = 64 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size / 20);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of strokes) {
      ctx.moveTo((x1 / 100) * size, (y1 / 100) * size);
      ctx.lineTo((x2 / 100) * size, (y2 / 100) * size);
    }
    ctx.stroke();
  }, [strokes, color, size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} aria-hidden="true" />;
}

function CardFace({ card, small }) {
  const color = elementColor(card.element);
  return (
    <div style={{ ...styles.card, ...(small ? styles.cardSmall : {}), borderColor: color }}>
      <Glyph strokes={card.glyph} color={color} size={small ? 40 : 56} />
      <div style={{ ...styles.cardName, color }}>{card.name}</div>
      <div style={styles.cardMeta}>
        <span style={styles.pow}>⚔ {card.power}</span>
        <span style={styles.cost}>🩸 {card.cost}</span>
      </div>
      {!small && <div style={styles.cardEffect}>{card.effectText}</div>}
    </div>
  );
}

function loadRecord() {
  try {
    const raw = window.localStorage.getItem("starblood-record");
    if (raw) {
      const r = JSON.parse(raw);
      if (typeof r.w === "number" && typeof r.l === "number") return r;
    }
  } catch (_) {}
  return { w: 0, l: 0 };
}

export default function StarbloodPage() {
  const [match, setMatch] = useState(() => createMatch((Date.now() % 100000) | 0));
  const [selected, setSelected] = useState(null);
  const [showCodex, setShowCodex] = useState(false);
  const [record, setRecord] = useState({ w: 0, l: 0 });
  const recordedRef = useRef(false);

  useEffect(() => {
    document.title = "Starblood";
    setRecord(loadRecord());
  }, []);

  useEffect(() => {
    if (match.phase === "over" && !recordedRef.current) {
      recordedRef.current = true;
      if (match.winner === "player" || match.winner === "enemy") {
        setRecord((prev) => {
          const next = {
            w: prev.w + (match.winner === "player" ? 1 : 0),
            l: prev.l + (match.winner === "enemy" ? 1 : 0),
          };
          try {
            window.localStorage.setItem("starblood-record", JSON.stringify(next));
          } catch (_) {}
          return next;
        });
      }
    }
  }, [match.phase, match.winner]);

  function touch(m) {
    setMatch({ ...m });
  }

  function onHandClick(i) {
    if (match.phase !== "deploy") return;
    setSelected(selected === i ? null : i);
  }

  function onLaneClick(lane) {
    if (match.phase !== "deploy") return;
    const m = { ...match };
    if (m.playerLanes[lane] && selected === null) {
      // recall a deployed rune
      const card = m.playerLanes[lane];
      m.playerLanes[lane] = null;
      m.playerHand.push(card);
      m.mana += card.cost;
      touch(m);
      return;
    }
    if (selected === null) return;
    if (deployCard(m, selected, lane)) {
      setSelected(null);
      touch(m);
    }
  }

  function onBattle() {
    const m = { ...match };
    const res = battleRound(m);
    if (res) touch(m);
  }

  function onNext() {
    const m = { ...match };
    if (nextRound(m)) {
      recordedRef.current = false;
      touch(m);
    }
  }

  function onRematch() {
    recordedRef.current = false;
    setSelected(null);
    setMatch(createMatch((Date.now() % 100000) | 0));
  }

  const result = match.lastRound;

  return (
    <div style={styles.page}>
      <style>{`
        .sb-lane { transition: transform .18s ease, box-shadow .18s ease; }
        .sb-card-btn { transition: transform .15s ease; }
        .sb-card-btn:active { transform: scale(.96); }
        @media (prefers-reduced-motion: reduce) {
          .sb-lane, .sb-card-btn { transition: none; }
        }
      `}</style>

      <header style={styles.header}>
        <h1 style={styles.title}>Starblood</h1>
        <div style={styles.scoreLine}>
          <span>You {match.playerScore}</span>
          <span style={styles.round}>Round {match.round} of 5</span>
          <span>{match.enemyScore} Foe</span>
        </div>
        <div style={styles.record}>
          {record.w}W · {record.l}L — kept on this device
        </div>
      </header>

      {/* enemy lanes */}
      <div style={styles.lanes}>
        {[0, 1, 2].map((lane) => {
          const card = match.enemyLanes[lane];
          const revealed = match.phase === "result" || match.phase === "over";
          const w = result && result.lanes[lane].winner;
          return (
            <div key={lane} className="sb-lane" style={{
              ...styles.lane,
              boxShadow: w === "enemy" ? "0 0 14px rgba(255,46,99,.55)" : w === "player" ? "0 0 14px rgba(0,255,204,.4)" : "none",
            }}>
              {card ? (
                revealed ? <CardFace card={card} small /> : <div style={styles.cardBack}>?</div>
              ) : (
                <div style={styles.emptySlot}>empty</div>
              )}
              {revealed && w && w !== "draw" && (
                <div style={styles.laneBadge}>{w === "enemy" ? "−" : "+"}{Math.abs(result.lanes[lane].enemyPower - result.lanes[lane].playerPower)}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.mid}>
        <div style={styles.mana}>
          {Array.from({ length: MANA_PER_ROUND }).map((_, i) => (
            <span key={i} style={{ ...styles.pip, opacity: i < match.mana ? 1 : 0.2 }}>●</span>
          ))}
          <span style={styles.manaLabel}>blood</span>
        </div>
        {match.phase === "deploy" && (
          <button style={styles.horn} onClick={onBattle}>Sound the horn</button>
        )}
        {match.phase === "result" && (
          <button style={styles.horn} onClick={onNext}>
            {match.round >= 5 ? "See the outcome" : `Begin round ${match.round + 1}`}
          </button>
        )}
      </div>

      {/* player lanes */}
      <div style={styles.lanes}>
        {[0, 1, 2].map((lane) => {
          const card = match.playerLanes[lane];
          return (
            <button key={lane} className="sb-lane" style={styles.laneBtn} onClick={() => onLaneClick(lane)}
              aria-label={`Lane ${lane + 1}${card ? `, ${card.name} (tap to recall)` : ", empty"}`}>
              {card ? <CardFace card={card} small /> : <div style={styles.emptySlot}>deploy here</div>}
            </button>
          );
        })}
      </div>

      {/* player hand */}
      <div style={styles.hand}>
        {match.playerHand.map((card, i) => (
          <button
            key={card.id}
            className="sb-card-btn"
            onClick={() => onHandClick(i)}
            disabled={match.phase !== "deploy" || card.cost > match.mana}
            style={{
              ...styles.handCard,
              borderColor: elementColor(card.element),
              opacity: card.cost > match.mana ? 0.35 : 1,
              transform: selected === i ? "translateY(-10px)" : "none",
              boxShadow: selected === i ? `0 0 16px ${elementColor(card.element)}` : "none",
            }}
            aria-label={`${card.name}, power ${card.power}, cost ${card.cost}`}
          >
            <CardFace card={card} small />
          </button>
        ))}
      </div>

      <div style={styles.footer}>
        <button style={styles.btn} onClick={() => setShowCodex(true)}>Rune codex</button>
        <span style={styles.tip}>
          {match.phase === "deploy"
            ? "Pick a rune, then a lane. Tap a deployed rune to take it back. Fire beats Frost beats Storm beats Stone beats Blood beats Fire."
            : result
              ? `Round ${match.round}: ${result.roundWinner === "draw" ? "a draw" : result.roundWinner === "player" ? "you take it" : "the foe takes it"} (${result.playerWins}–${result.enemyWins} lanes)`
              : ""}
        </span>
      </div>

      {match.phase === "over" && (
        <div style={styles.overlay}>
          <h2 style={styles.overTitle}>
            {match.winner === "player" ? "The field is yours" : match.winner === "enemy" ? "The foe prevails" : "A blood-stained draw"}
          </h2>
          <p style={styles.overSub}>Final: you {match.playerScore} — {match.enemyScore} foe</p>
          <button style={styles.horn} onClick={onRematch}>Fight again</button>
        </div>
      )}

      {showCodex && (
        <div style={styles.overlay} role="dialog" aria-label="Rune codex">
          <h2 style={styles.overTitle}>Rune Codex</h2>
          <div style={styles.codexGrid}>
            {RUNES.map((r) => (
              <div key={r.id} style={{ ...styles.codexCard, borderColor: elementColor(r.element) }}>
                <Glyph strokes={r.glyph} color={elementColor(r.element)} size={48} />
                <div style={styles.codexName}>{r.name}</div>
                <div style={styles.codexMeta}>{r.element} · ⚔ {r.power} · 🩸 {r.cost}</div>
                <div style={styles.codexEffect}>{r.effectText}</div>
              </div>
            ))}
          </div>
          <button style={styles.horn} onClick={() => setShowCodex(false)}>Back to battle</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", background: "radial-gradient(1200px 800px at 50% -10%, #2a0f1e 0%, #0d060d 55%, #060308 100%)", color: "#f5e9e2", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 10px 18px", userSelect: "none" },
  header: { textAlign: "center", marginBottom: 8 },
  title: { margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: 6, color: "#ff2e63", textTransform: "uppercase", textShadow: "0 0 18px rgba(255,46,99,.45)" },
  scoreLine: { display: "flex", gap: 18, justifyContent: "center", fontSize: 15, fontWeight: 700, marginTop: 4 },
  round: { opacity: 0.7, fontWeight: 400 },
  record: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  lanes: { display: "flex", gap: 10, justifyContent: "center", width: "100%", maxWidth: 560 },
  lane: { flex: 1, minHeight: 118, borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: 6 },
  laneBtn: { flex: 1, minHeight: 118, borderRadius: 12, border: "1px dashed rgba(255,46,99,.4)", background: "rgba(255,46,99,.05)", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, cursor: "pointer", color: "inherit", font: "inherit" },
  emptySlot: { fontSize: 12, opacity: 0.4, textAlign: "center" },
  cardBack: { width: 56, height: 76, borderRadius: 8, background: "linear-gradient(135deg,#3a1024,#180a14)", border: "1px solid #ff2e63", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#ff2e63" },
  laneBadge: { position: "absolute", top: 4, right: 6, fontSize: 12, fontWeight: 700, color: "#ffd76e" },
  mid: { display: "flex", alignItems: "center", gap: 16, margin: "10px 0" },
  mana: { display: "flex", alignItems: "center", gap: 4, fontSize: 18, color: "#ff2e63" },
  pip: { textShadow: "0 0 8px rgba(255,46,99,.8)" },
  manaLabel: { fontSize: 12, opacity: 0.6, marginLeft: 4 },
  horn: { background: "#ff2e63", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 15, fontWeight: 800, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" },
  hand: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", width: "100%", maxWidth: 620, marginTop: 4 },
  handCard: { background: "rgba(20,10,16,.85)", borderRadius: 12, border: "2px solid", padding: 4, cursor: "pointer", color: "inherit", font: "inherit" },
  card: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 4, minWidth: 76 },
  cardSmall: { minWidth: 64 },
  cardName: { fontSize: 13, fontWeight: 800, letterSpacing: 1 },
  cardMeta: { display: "flex", gap: 8, fontSize: 12 },
  pow: { color: "#ffd76e" },
  cost: { color: "#ff2e63" },
  cardEffect: { fontSize: 10, opacity: 0.65, textAlign: "center", maxWidth: 110, lineHeight: 1.3 },
  footer: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, maxWidth: 620, flexWrap: "wrap", justifyContent: "center" },
  btn: { background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  tip: { fontSize: 12, opacity: 0.6, maxWidth: 420, textAlign: "center", lineHeight: 1.5 },
  overlay: { position: "fixed", inset: 0, zIndex: 20, background: "rgba(6,3,8,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", overflowY: "auto" },
  overTitle: { fontSize: 32, color: "#ff2e63", letterSpacing: 3, textTransform: "uppercase", margin: "0 0 8px" },
  overSub: { fontSize: 15, opacity: 0.8, margin: "0 0 20px" },
  codexGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, width: "100%", maxWidth: 680, maxHeight: "62dvh", overflowY: "auto", marginBottom: 18 },
  codexCard: { border: "1px solid", borderRadius: 12, padding: 10, background: "rgba(255,255,255,.04)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  codexName: { fontSize: 14, fontWeight: 800, letterSpacing: 1 },
  codexMeta: { fontSize: 11, opacity: 0.7 },
  codexEffect: { fontSize: 11, opacity: 0.6, textAlign: "center", lineHeight: 1.4 },
};
