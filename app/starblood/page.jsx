// app/starblood/page.jsx
// STARBLOOD — the 20-card rune memory-match game, ported from Merlin's
// highland88999-commits/Starblood repo into the launcher's ZEUS games
// constellation (ARES god menu).
//
// Faithful to the original: 10 unique card faces x2, 3D flip, deck-deploy
// animation, win screen, and the rune-codex easter egg (triple-click the
// leaderboard title).
//
// Deliberately NOT ported:
// - the "OMEGA MIND TELEMETRY UPLINK" (posted IPs/user-agents/clicks to a
//   foreign central_telemetry table — phone-home, never ships)
// - the "MULTIVERSE TRACKER" (track_ping/global_stats on a foreign Supabase
//   project — also phone-home; the footer counter is gone with it)
// - the external HERMES MALL link (now the launcher's internal /hermes route)
//
// The leaderboard is GLOBAL (Merlin's standing rule): wins post to
// /api/starblood/leaderboard and every rider reads the same world board.
// If the board is unreachable the page says so honestly — scores are never
// faked and a local list is never passed off as the world board.
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { grantAchievement } from '@/lib/achievements/award';
import AchievementBanner from '@/components/achievements/AchievementBanner';
import { AresIcon, AresLoader, AresEmpty } from '@/components/ares/ares-chrome';
import {
  buildDeck,
  shuffleDeck,
  CARD_FACES,
  BOARD_SLOTS,
  topEntries,
} from '@/lib/starblood/board';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const CARD_BACK_VIDEO = '/media/starblood-cardback.mp4';
const BG_VIDEO = '/media/starblood-bg.webm';

const RUNES = [
  { rune: 'ᚠ', name: 'Fehu', meaning: 'Wealth, abundance, success, prosperity, new beginnings' },
  { rune: 'ᚢ', name: 'Uruz', meaning: 'Strength, vitality, health, endurance, raw power' },
  { rune: 'ᚦ', name: 'Thurisaz', meaning: 'Protection, defense, conflict, breakthrough, giant force' },
  { rune: 'ᚨ', name: 'Ansuz', meaning: 'Communication, wisdom, inspiration, divine breath, signals' },
  { rune: 'ᚱ', name: 'Raido', meaning: 'Journey, travel, rhythm, progress, wagon path' },
  { rune: 'ᚲ', name: 'Kenaz', meaning: 'Torch, knowledge, creativity, illumination, craft' },
  { rune: 'ᚷ', name: 'Gebo', meaning: 'Gift, partnership, exchange, balance, generosity' },
  { rune: 'ᚹ', name: 'Wunjo', meaning: 'Joy, harmony, bliss, fellowship, achievement' },
  { rune: 'ᚺ', name: 'Hagalaz', meaning: 'Hail, disruption, transformation, natural forces, crisis' },
  { rune: 'ᚾ', name: 'Naudiz', meaning: 'Need, constraint, endurance, resistance, self-reliance' },
];

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

export default function StarbloodPage() {
  const rootRef = useRef(null);
  const deckFrameRef = useRef(null);
  const slotRefs = useRef([]);
  // Imperative card engine (mirrors the original's DOM approach): the deck
  // lives outside React so the deploy animation never re-renders.
  const engine = useRef({ cards: [], selected: [], matches: 0, flips: 0, busy: false });

  const [phase, setPhase] = useState('ready'); // ready | dealing | playing | won
  const [flips, setFlips] = useState(0);
  const [matches, setMatches] = useState(0);

  const [celebrateKey, setCelebrateKey] = useState(null); // achievement celebration

  // Fire-and-forget achievement grant. Signed-in users only (guests earn
  // nothing server-side); the banner shows only when the server confirms
  // a fresh award (awarded=false means already held — no repeat celebration).
  const getToken = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  };
  const award = (key) => {
    grantAchievement(key, getToken).then((r) => {
      if (r && r.awarded) setCelebrateKey((cur) => cur ?? key);
    }).catch(() => {});
  };

  const [boardOpen, setBoardOpen] = useState(false);
  const [boardState, setBoardState] = useState('idle'); // idle | loading | ready | offline
  const [boardMsg, setBoardMsg] = useState('');
  const [entries, setEntries] = useState([]);

  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [codexOpen, setCodexOpen] = useState(false);
  const titleClicks = useRef(0);
  const titleTimer = useRef(null);

  // Restore the rider's last used name — a convenience, nothing more.
  useEffect(() => {
    try {
      const n = localStorage.getItem('starblood_name');
      if (n) setUsername(n);
    } catch { /* private mode: fine without it */ }
  }, []);

  // Unmount: sweep any deployed card nodes.
  useEffect(() => {
    const eng = engine.current;
    return () => {
      eng.cards.forEach((c) => c.remove());
      eng.cards = [];
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, []);

  function clearCards() {
    const eng = engine.current;
    eng.cards.forEach((c) => c.remove());
    eng.cards = [];
    eng.selected = [];
    eng.matches = 0;
    eng.flips = 0;
    eng.busy = false;
  }

  async function fetchBoard() {
    setBoardState('loading');
    setBoardMsg('');
    try {
      const res = await fetch('/api/starblood/leaderboard', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) {
        setEntries(topEntries(data.entries || []));
        setBoardState('ready');
      } else {
        setBoardMsg(data && data.error ? data.error : 'The global leaderboard is not connected yet.');
        setBoardState('offline');
      }
    } catch {
      setBoardMsg('The global leaderboard is not connected yet.');
      setBoardState('offline');
    }
  }

  function openBoard() {
    setBoardOpen(true);
    fetchBoard();
  }

  function deploy() {
    const eng = engine.current;
    const root = rootRef.current;
    const deckFrame = deckFrameRef.current;
    if (!root || !deckFrame || eng.busy) return;
    // A deck is already on the table.
    if (eng.cards.length > 0) return;

    eng.busy = true;
    eng.selected = [];
    eng.matches = 0;
    eng.flips = 0;
    setFlips(0);
    setMatches(0);
    setSaved(false);
    setSaveMsg('');
    setPhase('dealing');

    const deck = shuffleDeck(buildDeck(CARD_FACES));
    const deckRect = deckFrame.getBoundingClientRect();

    deck.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'card-entity';
      el.dataset.val = card.face;
      el.innerHTML =
        '<div class="card-inner">' +
        '<div class="back"><video autoplay muted loop playsinline src="' + CARD_BACK_VIDEO + '"></video></div>' +
        '<div class="front" style="background-image:url(\'' + card.face + '\')"></div>' +
        '</div>';
      el.style.left = deckRect.left + 'px';
      el.style.top = deckRect.top + 'px';
      el.style.transform = 'scale(0.3)';
      root.appendChild(el);
      eng.cards.push(el);

      const slot = slotRefs.current[i];
      const slotRect = slot ? slot.getBoundingClientRect() : deckRect;

      setTimeout(() => {
        el.style.transition = 'all 0.7s cubic-bezier(0.25, 1, 0.5, 1)';
        el.style.left = slotRect.left + 'px';
        el.style.top = slotRect.top + 'px';
        el.style.transform = 'scale(1)';
        setTimeout(() => {
          el.style.position = 'relative';
          el.style.left = '0';
          el.style.top = '0';
          if (slot) slot.appendChild(el);
          el.onclick = () => flip(el);
          if (i === deck.length - 1) {
            eng.busy = false;
            setPhase('playing');
          }
        }, 700);
      }, i * 40);
    });
  }

  function flip(card) {
    const eng = engine.current;
    if (eng.busy) return;
    if (
      eng.selected.length >= 2 ||
      card.classList.contains('active') ||
      card.classList.contains('matched')
    ) {
      return;
    }
    card.classList.add('active');
    eng.selected.push(card);
    eng.flips += 1;
    setFlips(eng.flips);
    if (eng.selected.length === 2) {
      eng.busy = true;
      setTimeout(checkMatch, 1000);
    }
  }

  function checkMatch() {
    const eng = engine.current;
    const [a, b] = eng.selected;
    if (a && b && a.dataset.val === b.dataset.val) {
      a.classList.add('matched');
      b.classList.add('matched');
      eng.matches += 1;
      setMatches(eng.matches);
      if (eng.matches === 1) award('starblood-first-pair');
      setTimeout(() => {
        a.style.display = 'none';
        b.style.display = 'none';
      }, 800);
      if (eng.matches === 10) {
        setTimeout(win, 1000);
      }
    } else {
      if (a) a.classList.remove('active');
      if (b) b.classList.remove('active');
    }
    eng.selected = [];
    eng.busy = false;
  }

  function win() {
    setPhase('won');
    award('starblood-clear-board');
    // Perfect Recall: cleared in 12 pair-attempts or fewer (2 flips per move).
    if (Math.round(engine.current.flips / 2) <= 12) award('starblood-perfect-recall');
    setBoardOpen(true);
    fetchBoard();
  }

  async function saveScore() {
    const eng = engine.current;
    const name = username.trim();
    if (!name || saving || saved) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/starblood/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, flips: eng.flips }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok) {
        setSaved(true);
        try { localStorage.setItem('starblood_name', name); } catch { /* optional */ }
        fetchBoard();
      } else if (data && data.offline) {
        // Honest: the world board is down. The win still counts on screen,
        // but this score is NOT recorded anywhere.
        setSaveMsg('The global board is offline — this score could not be recorded.');
      } else {
        setSaveMsg(data && data.error ? data.error : 'Could not record the score.');
      }
    } catch {
      setSaveMsg('The global board is offline — this score could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  function restart() {
    setBoardOpen(false);
    clearCards();
    setPhase('ready');
    // Let the slots clear before redeploying.
    requestAnimationFrame(() => deploy());
  }

  function onTitleClick() {
    titleClicks.current += 1;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => { titleClicks.current = 0; }, 800);
    if (titleClicks.current === 3) {
      setCodexOpen(true);
      titleClicks.current = 0;
    }
  }

  return (
    <div id="starblood-root" ref={rootRef}>
      <style>{STARBLOOD_CSS}</style>

      <div className="sb-bg" aria-hidden="true">
        {/* ARES still art behind the ambient video — shows if the video stalls */}
        <img src="/images/starblood/starblood-bg.webp" alt="" aria-hidden="true" draggable={false} className="sb-still" />
        <video autoPlay muted loop playsInline src={BG_VIDEO} />
      </div>

      <div className="sb-shell">
        <header className="sb-topbar">
          <BackButton />
          <h1 className="sb-title">
            <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 10, color: '#d4af37' }}>
              <AresIcon name="star" className="h-6 w-6" />
            </span>
            RUNE BATTLE
          </h1>
          <div className="sb-hud" aria-live="polite">
            {phase === 'playing' || phase === 'won' ? (
              <span>FLIPS {flips} · MATCHED {matches}/10</span>
            ) : (
              <span className="sb-hint">Tap the deck to deal</span>
            )}
          </div>
        </header>

        <div className="sb-board">
          {Array.from({ length: BOARD_SLOTS }).map((_, i) => (
            <div
              key={i}
              className="card-placeholder"
              ref={(el) => { slotRefs.current[i] = el; }}
            />
          ))}
        </div>

        <div className="sb-controls">
          <Link href="/hermes" className="holo-blue-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AresIcon name="rocket" className="h-4 w-4" />
            HERMES MALL
          </Link>
          <div
            id="deck-frame"
            ref={deckFrameRef}
            onClick={deploy}
            role="button"
            tabIndex={0}
            aria-label="Deal the cards"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') deploy(); }}
          />
          <button type="button" className="holo-blue-btn" onClick={openBoard} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AresIcon name="trophy" className="h-4 w-4" />
            BOARD
          </button>
        </div>
      </div>

      {boardOpen && (
        <div className="sb-overlay" role="dialog" aria-modal="true" aria-label="Leaderboard">
          <div className="holoframe">
            <h1 id="leaderboard-title" onClick={onTitleClick}>SYNC COMPLETE</h1>
            <p className="sb-sub">NEURAL LINK TERMINATED</p>

            {phase === 'won' && !saved && (
              <div className="sb-save">
                <p className="sb-save-line">
                  Cleared in <strong>{flips} flips</strong>. Name yourself on the world board:
                </p>
                <div className="sb-save-row">
                  <input
                    className="sb-name"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.slice(0, 24))}
                    placeholder="Your name"
                    maxLength={24}
                    aria-label="Your name for the leaderboard"
                  />
                  <button
                    type="button"
                    className="restart-btn"
                    onClick={saveScore}
                    disabled={saving || !username.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    <AresIcon name="save" className="h-4 w-4" />
                    {saving ? 'SAVING…' : 'SAVE SCORE'}
                  </button>
                </div>
                {saveMsg && <p className="sb-warn">{saveMsg}</p>}
              </div>
            )}
            {phase === 'won' && saved && (
              <p className="sb-ok">Score recorded on the world board.</p>
            )}

            <div className="scroll-area">
              {boardState === 'loading' && <AresLoader label="READING THE WORLD BOARD" />}
              {boardState === 'offline' && (
                <p className="sb-warn">GLOBAL BOARD OFFLINE — {boardMsg}</p>
              )}
              {boardState === 'ready' && entries.length === 0 && (
                <AresEmpty title="NO SCORES YET" hint="Be the first blood on the world board." />
              )}
              {boardState === 'ready' && entries.length > 0 && (
                <table className="leaderboard-table">
                  <thead>
                    <tr><th>#</th><th>Username</th><th>Flips</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={`${e.created_at}-${i}`}>
                        <td>{i + 1}</td>
                        <td>{e.username}</td>
                        <td>{e.flips}</td>
                        <td>{fmtDate(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="restart-strip">
              <button type="button" className="restart-btn" onClick={restart} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <AresIcon name="rotate" className="h-4 w-4" />
                RESTART
              </button>
              <button
                type="button"
                className="restart-btn sb-ghost"
                onClick={() => setBoardOpen(false)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <AresIcon name="close" className="h-4 w-4" />
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {codexOpen && (
        <div className="sb-codex show" role="dialog" aria-modal="true" aria-label="Rune codex">
          <button
            type="button"
            id="codex-close"
            aria-label="Close rune codex"
            onClick={() => setCodexOpen(false)}
          >
            <AresIcon name="close" className="h-5 w-5" />
          </button>
          <h1 className="sb-codex-title">RUNE CODEX</h1>
          <div>
            {RUNES.map((r) => (
              <div className="rune-entry" key={r.name}>
                <div className="rune-symbol">{r.rune}</div>
                <div className="rune-info">
                  <div className="rune-name">{r.name}</div>
                  <div className="rune-desc">{r.meaning}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AchievementBanner
        achievementKey={celebrateKey}
        show={!!celebrateKey}
        onDismiss={() => setCelebrateKey(null)}
      />
    </div>
  );
}

// Ported from the original Starblood stylesheet, scoped under #starblood-root
// so the game page can never leak styles into the launcher. Telemetry and
// tracker styles are gone with their scripts.
const STARBLOOD_CSS = `
#starblood-root {
  --blood-glow: #ff3333;
  --blood-dark: #8a0000;
  --card-h: clamp(60px, 12dvh, 110px);
  --card-w: calc(var(--card-h) * 0.72);
  position: fixed; inset: 0;
  background: #000; color: #fff;
  font-family: 'Courier New', monospace;
  overflow: hidden;
  -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none;
  z-index: 1;
}
#starblood-root .sb-bg { position: absolute; inset: 0; opacity: 0.4; pointer-events: none; }
#starblood-root .sb-bg video { width: 100%; height: 100%; object-fit: cover; position: relative; }
#starblood-root .sb-still { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#starblood-root .sb-shell {
  position: relative; height: 100dvh;
  display: flex; flex-direction: column;
}
#starblood-root .sb-topbar {
  display: flex; align-items: center; gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 4px 14px;
}
#starblood-root .sb-title {
  flex: 1; text-align: center; margin: 0;
  color: var(--blood-glow); font-size: 1.6rem;
  letter-spacing: 12px; text-shadow: 0 0 20px var(--blood-dark);
  font-weight: bold;
}
#starblood-root .sb-hud { font-size: 0.7rem; letter-spacing: 2px; color: #ffcccc; white-space: nowrap; }
#starblood-root .sb-hint { opacity: 0.7; }
#starblood-root .sb-board {
  flex: 1; display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 8px; padding: 10px 15px; justify-items: center; align-content: center;
  perspective: 1200px; min-height: 0;
}
#starblood-root .card-placeholder {
  width: var(--card-w); height: var(--card-h);
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,51,51,0.1);
  border-radius: 6px; position: relative;
}
#starblood-root .card-entity {
  position: absolute; width: var(--card-w); height: var(--card-h);
  transform-style: preserve-3d; z-index: 10; cursor: pointer;
}
#starblood-root .card-inner {
  width: 100%; height: 100%; transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 6px; border: 1px solid rgba(138,0,0,0.6);
  background: #050505; box-shadow: 0 0 15px rgba(0,0,0,0.8);
}
#starblood-root .card-entity.active .card-inner { transform: rotateY(180deg); }
#starblood-root .back, #starblood-root .front {
  position: absolute; width: 100%; height: 100%;
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
  border-radius: 6px; overflow: hidden; background-color: #000;
}
#starblood-root .back { transform: rotateY(0deg); }
#starblood-root .front {
  transform: rotateY(180deg);
  background-size: contain; background-position: center; background-repeat: no-repeat;
}
#starblood-root .front::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%),
    linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,255,0,0.06));
  background-size: 100% 2px, 3px 100%; pointer-events: none;
}
#starblood-root .back video { width: 100%; height: 100%; object-fit: cover; opacity: 0.6; }
#starblood-root .matched { animation: sbFadeBack 0.8s forwards; pointer-events: none; }
@keyframes sbFadeBack { to { opacity: 0; transform: scale(0.5) translateZ(-500px); } }
#starblood-root .sb-controls {
  display: flex; justify-content: space-between; align-items: center;
  width: 100%; box-sizing: border-box;
  padding: 10px 30px calc(env(safe-area-inset-bottom, 0px) + 65px) 30px;
  z-index: 20;
}
#starblood-root .holo-blue-btn {
  background: rgba(0,242,255,0.15); border: 1px solid #00f2ff; color: #00f2ff;
  padding: 12px 24px; text-decoration: none; font-weight: bold; letter-spacing: 2px;
  border-radius: 8px; box-shadow: 0 0 15px rgba(0,242,255,0.3);
  transition: all 0.3s; text-align: center; font-size: 0.8rem; text-transform: uppercase;
  font-family: inherit; cursor: pointer;
}
#starblood-root .holo-blue-btn:hover { background: #00f2ff; color: #000; box-shadow: 0 0 25px #00f2ff; }
#starblood-root #deck-frame {
  width: 55px; height: 75px; flex-shrink: 0;
  border: 2px solid var(--blood-glow); border-radius: 4px;
  background: rgba(138,0,0,0.2); cursor: pointer;
  box-shadow: 0 0 15px var(--blood-dark); transition: all 0.3s;
}
#starblood-root #deck-frame:hover { box-shadow: 0 0 25px var(--blood-glow); transform: scale(1.08); }
#starblood-root .sb-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.9);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 50; padding: 16px; overflow-y: auto;
}
#starblood-root .holoframe {
  width: 100%; max-width: 600px; background: rgba(40,0,0,0.2);
  backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
  border: 1px solid var(--blood-glow); border-radius: 20px; padding: 20px;
  box-shadow: 0 0 30px rgba(255,0,0,0.2), inset 0 0 15px rgba(255,0,0,0.3);
  position: relative; overflow: hidden;
}
/* ARES panel texture behind the leaderboard card content */
#starblood-root .holoframe::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: url('/images/ares/ares-panel.webp');
  background-size: 512px 512px; opacity: 0.18;
}
#starblood-root .holoframe > * { position: relative; }
#starblood-root #leaderboard-title {
  color: var(--blood-glow); text-align: center; letter-spacing: 10px;
  margin: 0 0 5px 0; cursor: pointer; font-size: 1.4rem;
}
#starblood-root .sb-sub {
  text-align: center; letter-spacing: 5px; color: #fff;
  margin: 0 0 16px 0; font-size: 0.8rem;
}
#starblood-root .sb-save { margin-bottom: 14px; }
#starblood-root .sb-save-line { text-align: center; color: #ffcccc; font-size: 0.85rem; margin: 0 0 10px 0; }
#starblood-root .sb-save-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
#starblood-root .sb-name {
  background: rgba(0,0,0,0.5); border: 1px solid var(--blood-dark);
  color: #fff; padding: 10px 14px; border-radius: 6px;
  font-family: inherit; font-size: 1rem; letter-spacing: 1px; width: 220px;
}
#starblood-root .sb-name:focus { outline: none; border-color: var(--blood-glow); box-shadow: 0 0 12px rgba(255,51,51,0.4); }
#starblood-root .sb-ok { text-align: center; color: #7CFC98; font-size: 0.85rem; letter-spacing: 2px; margin: 0 0 14px 0; }
#starblood-root .sb-warn { text-align: center; color: #ffb3b3; font-size: 0.8rem; letter-spacing: 1px; margin: 10px 0 0 0; }
#starblood-root .sb-muted { text-align: center; color: rgba(255,204,204,0.6); font-size: 0.85rem; letter-spacing: 2px; }
#starblood-root .scroll-area { max-height: 40dvh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
#starblood-root .leaderboard-table { width: 100%; border-collapse: collapse; color: #ffcccc; text-align: left; }
#starblood-root .leaderboard-table th {
  border-bottom: 1px solid var(--blood-dark); padding: 10px;
  font-size: 0.8rem; letter-spacing: 2px; color: var(--blood-glow);
}
#starblood-root .leaderboard-table td { padding: 10px; border-bottom: 1px solid rgba(138,0,0,0.2); font-size: 0.9rem; }
#starblood-root .restart-strip {
  margin-top: 16px; width: 100%; text-align: center;
  border-top: 1px solid var(--blood-dark); padding-top: 14px;
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
#starblood-root .restart-btn {
  background: transparent; color: #fff; border: 1px solid var(--blood-glow);
  padding: 10px 30px; cursor: pointer; letter-spacing: 5px; transition: 0.3s;
  font-family: inherit; font-size: 0.85rem; border-radius: 4px;
}
#starblood-root .restart-btn:hover:not(:disabled) { background: var(--blood-glow); box-shadow: 0 0 20px var(--blood-glow); }
#starblood-root .restart-btn:disabled { opacity: 0.4; cursor: default; }
#starblood-root .sb-ghost { border-color: rgba(255,51,51,0.4); }
#starblood-root .sb-codex {
  position: absolute; inset: 0; z-index: 60; background: rgba(0,0,0,0.92);
  display: none; flex-direction: column; align-items: center;
  color: var(--blood-glow); padding: 20px; overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
#starblood-root .sb-codex.show { display: flex; }
#starblood-root .sb-codex-title { letter-spacing: 8px; margin: 30px 0 10px 0; text-align: center; }
#starblood-root .rune-entry {
  display: flex; align-items: center; margin: 12px 0; width: 100%; max-width: 700px;
  padding: 14px; border: 1px solid rgba(255,51,51,0.3); border-radius: 8px;
  background: rgba(138,0,0,0.08);
}
#starblood-root .rune-symbol {
  font-size: 3.2rem; margin-right: 18px; min-width: 70px; text-align: center;
  text-shadow: 0 0 20px var(--blood-glow);
}
#starblood-root .rune-info { flex: 1; }
#starblood-root .rune-name { font-size: 1.2rem; margin-bottom: 4px; color: #fff; }
#starblood-root .rune-desc { font-size: 0.9rem; opacity: 0.9; color: #ffcccc; }
#starblood-root #codex-close {
  position: absolute; top: calc(env(safe-area-inset-top, 0px) + 12px); right: 24px;
  font-size: 2rem; cursor: pointer; color: var(--blood-glow);
  background: transparent; border: none; padding: 8px; line-height: 1;
}
`;
