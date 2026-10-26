'use client';

// HAWKINS — The Vecna Hunt.
// Open-world Stranger Things survival: hunt demogorgons & demo-bats,
// cross between Hawkins and the Upside Down, gather clock traces,
// survive the convergence, capture Vecna.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createEngine } from './engine';
import BackpackHud from '@/components/backpack/BackpackHud';
import { HAWKINS_PLAYER_CHARACTERS } from '../../lib/hawkins/models.js';

const CHARACTER_BLURBS = {
  eleven: 'THE HUNTER — small, quick, psychokinetic',
  eddie: 'THE METALHEAD — lanky, loose, fearless',
  hopper: 'THE CHIEF — heavy, broad, unbreakable',
};

const BANNER_CLEAR = 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))';
const BOTTOM_CLEAR = 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))';

export default function HawkinsPage() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [phase, setPhase] = useState('menu'); // menu | playing | won
  const [hud, setHud] = useState({
    health: 1, ammo: 8, magSize: 8, kills: 0, wave: 1,
    traces: 0, tracesNeeded: 5, bossHp: 1, bossRevealed: false,
    dimension: 'hawkins', convergence: 0, reloading: false,
    capturePrompt: false, hitmark: 0, dmgFlash: 0, dimFlash: 0,
    nav: null, bikePrompt: null,
  });
  const [banner, setBanner] = useState('');
  const [chime, setChime] = useState('');
  const [charId, setCharId] = useState('eleven');
  const [finishHim, setFinishHim] = useState(false);
  const [fatality, setFatality] = useState(false);
  const [objective, setObjective] = useState('');
  const [feed, setFeed] = useState([]);
  const bannerTimer = useRef(null);
  const chimeTimer = useRef(null);
  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  const pushFeed = useCallback((msg) => {
    setFeed((f) => [{ id: Date.now() + Math.random(), msg }, ...f].slice(0, 4));
  }, []);

  const showBanner = useCallback((msg) => {
    setBanner(msg);
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(''), 2800);
  }, []);

  const showChime = useCallback((msg) => {
    setChime(msg);
    clearTimeout(chimeTimer.current);
    chimeTimer.current = setTimeout(() => setChime(''), 2400);
  }, []);

  // ---- engine lifecycle ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hooks = {
      onHealth: (v) => setHud((h) => ({ ...h, health: v })),
      onAmmo: (ammo, magSize) => setHud((h) => ({ ...h, ammo, magSize })),
      onKill: (kills) => setHud((h) => ({ ...h, kills })),
      onWave: (wave) => setHud((h) => ({ ...h, wave })),
      onTrace: (traces, needed) => setHud((h) => ({ ...h, traces, tracesNeeded: needed })),
      onBossHp: (v) => setHud((h) => ({ ...h, bossHp: v })),
      onBossReveal: () => setHud((h) => ({ ...h, bossRevealed: true })),
      onDimension: (dimension, convergence) => setHud((h) => ({ ...h, dimension, convergence })),
      onReload: (reloading) => setHud((h) => ({ ...h, reloading })),
      onCapturePrompt: (show) => setHud((h) => ({ ...h, capturePrompt: show })),
      onDamage: (healthFrac) => {
        setHud((h) => ({ ...h, health: healthFrac, dmgFlash: 1 }));
        setTimeout(() => setHud((h) => ({ ...h, dmgFlash: 0 })), 320);
      },
      onDimFlash: () => {
        setHud((h) => ({ ...h, dimFlash: 1 }));
        setTimeout(() => setHud((h) => ({ ...h, dimFlash: 0 })), 950);
      },
      hitmarker: (headshot) => {
        setHud((h) => ({ ...h, hitmark: headshot ? 2 : 1 }));
        setTimeout(() => setHud((h) => ({ ...h, hitmark: 0 })), 140);
      },
      banner: showBanner,
      chime: showChime,
      feed: pushFeed,
      setObjective,
      onTick: () => {},
      onNav: (rel, label, dist) => setHud((h) => ({ ...h, nav: { rel, label, dist } })),
      onBikePrompt: (bikePrompt) => setHud((h) => ({ ...h, bikePrompt })),
      onFinishHim: () => {
        setFinishHim(true);
        setTimeout(() => setFinishHim(false), 2600);
      },
      onCaptureProgress: (p, t) => setHud((h) => ({ ...h, captureProgress: p, finishTimer: t })),
      onPerspective: (perspective) => setHud((h) => ({ ...h, perspective })),
      onFatality: () => {
        setFatality(true);
        // Report the Vecna kill for achievements (fire-and-forget; guests
        // get a 401 which we silently ignore).
        fetch('/api/hawkins/vecna-kill', { method: 'POST', credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && d.ok && d.milestone) {
              showBanner(`🏆 ${d.milestone.title} — #${d.killNumber} VECNA SEALED`, 6000);
              showChime(`A unique video prompt is yours — keep it or sell it. Check your profile.`);
            }
          })
          .catch(() => {});
      },
      onWin: (kills) => {
        setFatality(false);
        setPhase('won');
        setHud((h) => ({ ...h, finalStats: `${kills} DEMOGORGONS SLAIN — THE RIFTS SEAL… FOR NOW` }));
      },
    };

    const engine = createEngine(canvas, hooks);
    engine.boot();
    engineRef.current = engine;
    return () => { engine.dispose(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setPhase('playing');
    e.start();
  }, []);

  // Character select — Merlin's Tripo GLBs are the cast now. Picking
  // swaps the third-person body (and its gait personality) in the
  // engine; the hunt itself is identical for all three.
  const pickCharacter = useCallback((id) => {
    setCharId(id);
    const e = engineRef.current;
    if (e) e.setPlayerCharacter(id);
  }, []);

  const restart = useCallback(() => window.location.reload(), []);

  const dimLabel = hud.convergence >= 1
    ? 'CONVERGED'
    : hud.dimension === 'upside' ? 'THE UPSIDE DOWN' : 'HAWKINS';
  const dimClass = hud.convergence >= 1 ? 'converged' : hud.dimension === 'upside' ? 'upside' : '';

  return (
    <div style={styles.root}>
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* ---------- HUD ---------- */}
      {/* Flow layout: a top row, a middle column and a bottom row,
          each laying its children out in sequence with gaps — no
          two HUD pieces share coordinates any more, so nothing can
          sit on top of another piece. The reticle / hitmarker /
          damage and dimension flashes stay centred overlays inside
          this HUD component, which is their own component. */}
      {phase === 'playing' && (
        <div style={styles.hud}>
          <div style={styles.reticle}>
            <div style={styles.retRing} />
            <div style={styles.retDot} />
            <div style={{ ...styles.retTick, top: 0, left: '50%', transform: 'translateX(-50%)' }} />
            <div style={{ ...styles.retTick, bottom: 0, left: '50%', transform: 'translateX(-50%)' }} />
            <div style={{ ...styles.retTick, left: 0, top: '50%', transform: 'translateY(-50%)', width: 9, height: 2 }} />
            <div style={{ ...styles.retTick, right: 0, top: '50%', transform: 'translateY(-50%)', width: 9, height: 2 }} />
          </div>
          {hud.hitmark > 0 && (
            <div style={{ ...styles.hitmarker, borderColor: hud.hitmark === 2 ? '#ff3333' : '#fff' }} />
          )}
          {hud.dmgFlash > 0 && <div style={styles.dmgvin} />}
          {hud.dimFlash > 0 && <div style={styles.dimflash} />}

          {/* Top row: objective + feed | traces + boss + nav | stats + buttons.
              Wraps on narrow screens instead of colliding. */}
          <div style={styles.topRow}>
            <div style={styles.topLeft}>
              <div style={styles.objective} dangerouslySetInnerHTML={{ __html: '◈ ' + objective }} />
              <div style={styles.killfeed}>
                {feed.map((f) => <div key={f.id}>{f.msg}</div>)}
              </div>
            </div>
            <div style={styles.topCenter}>
              <div style={styles.tracemeter}>
                <div style={styles.traceLabel}>VECNA TRACES</div>
                <div style={styles.tracebg}>
                  <div style={{ ...styles.tracefill, width: `${(hud.traces / hud.tracesNeeded) * 100}%` }} />
                </div>
                <div style={styles.traceslots}>
                  {'● '.repeat(hud.traces)}{'○ '.repeat(hud.tracesNeeded - hud.traces)}
                </div>
              </div>
              {hud.bossRevealed && (
                <div style={styles.bossbar}>
                  <div style={styles.bossLabel}>V E C N A</div>
                  <div style={styles.bossbg}>
                    <div style={{ ...styles.bossfill, width: `${hud.bossHp * 100}%` }} />
                  </div>
                </div>
              )}
              {hud.nav && (
                <div style={styles.navwrap}>
                  <div style={{ ...styles.navarrow, transform: `rotate(${(hud.nav.rel * 180) / Math.PI}deg)` }}>▲</div>
                  <div style={styles.navlabel}>{hud.nav.label} · {Math.round(hud.nav.dist)}m</div>
                </div>
              )}
            </div>
            <div style={styles.topRight}>
              <div style={styles.stats}>
                <div style={styles.kills}>{hud.kills} KILLS</div>
                <div style={styles.wave}>WAVE {hud.wave}</div>
              </div>
              <div style={styles.topBtns}>
                <button
                  style={styles.perspbtn}
                  onClick={() => engineRef.current && engineRef.current.togglePerspective()}
                >
                  {(hud.perspective === 'third' ? '3RD' : '1ST') + ' PERSON · V'}
                </button>
                <BackpackHud realm="hawkins" realmLabel="Hawkins"
                  displayNote="The pack rides along — Hawkins keeps its own arms." />
              </div>
            </div>
          </div>

          {/* Middle column: banners and the capture prompt stack in
              order; the capture prompt sits below the reticle. */}
          <div style={styles.midCol}>
            {banner && <div style={styles.wavebanner}>{banner}</div>}
            {chime && <div style={styles.clockchime}>♱ {chime} ♱</div>}
            {hud.capturePrompt && (
              <div style={styles.captureprompt}>
                <div>FINISH HIM — HOLD E</div>
                <div style={styles.finishbar}>
                  <div style={{ ...styles.finishfill, width: `${(hud.captureProgress || 0) * 100}%` }} />
                </div>
                <div style={styles.finishtimer}>{Math.max(0, Math.ceil(hud.finishTimer || 0))}</div>
              </div>
            )}
          </div>

          {/* Bottom: reload / bike prompts, then the bottom row —
              ammo + vitals on the left, dimension centred. */}
          <div style={styles.bottomCol}>
            {hud.reloading && <div style={styles.reloadtip}>RELOADING…</div>}
            {hud.bikePrompt && (
              <div style={styles.bikeprompt}>
                {hud.bikePrompt === 'mount' ? 'E — RIDE BIKE' : 'E — DISMOUNT'}
              </div>
            )}
            <div style={styles.bottomRow}>
              <div style={styles.bottomLeft}>
                <div style={styles.ammobar}>
                  <div style={styles.barLabel}>AMMO — R TO RELOAD</div>
                  <div style={styles.ammobg}>
                    <div style={{ ...styles.ammofill, width: `${(hud.ammo / hud.magSize) * 100}%` }} />
                  </div>
                </div>
                <div style={styles.healthbar}>
                  <div style={styles.barLabel}>VITALS</div>
                  <div style={styles.healthbg}>
                    <div style={{ ...styles.healthfill, width: `${hud.health * 100}%` }} />
                  </div>
                </div>
              </div>
              <div style={{ ...styles.dimlabel, ...(dimClass ? styles['dim_' + dimClass] : {}) }}>{dimLabel}</div>
            </div>
          </div>

          {isTouch && (
            <>
              <div id="hw-stick" style={styles.stick}><div id="hw-nub" style={styles.nub} /></div>
              <div id="hw-fire" style={styles.firebtn}>FIRE</div>
              <div id="hw-act" style={styles.actbtn}>ACT</div>
            </>
          )}
        </div>
      )}

      {/* ---------- MENU ---------- */}
      {phase === 'menu' && (
        <div style={styles.overlay} onClick={begin}>
          <div style={styles.menuInner}>
            <h1 style={styles.title}>HAWKINS</h1>
            <p style={styles.subtitle}>THE VECNA HUNT</p>
            <div style={styles.lore}>
              Two worlds. One town.<br />
              Hunt the pack. Gather the five clock traces.<br />
              A <b style={{ color: '#aa66ff' }}>portal</b> tears open at the center of town — follow the arrow.<br />
              Grab the <b style={{ color: '#ffcc44' }}>bike</b> and ride, or roam on foot.<br />
              When the bell tolls… <b style={{ color: '#ff4444' }}>he waits in the Upside Down.</b><br />
              <span style={{ color: '#555' }}>To die is to wake in Hawkins. It won't save you from him.</span>
            </div>
            <div style={styles.charrow} onClick={(e) => e.stopPropagation()}>
              <div style={styles.charlabel}>— WHO HUNTS? —</div>
              <div style={styles.charbtns}>
                {HAWKINS_PLAYER_CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    style={charId === c.id ? { ...styles.charbtn, ...styles.charbtnOn } : styles.charbtn}
                    onClick={() => pickCharacter(c.id)}
                  >
                    <div style={styles.charname}>{c.name.toUpperCase()}</div>
                    <div style={styles.charblurb}>{CHARACTER_BLURBS[c.id] || ''}</div>
                  </button>
                ))}
              </div>
              <div style={styles.charnote}>your body in third person (V) — the hunt is the same</div>
            </div>
            <div style={styles.keys}>
              WASD — move · mouse — look · click — fire · R — reload<br />
              E — ride / dismount bike · E (hold, near weak Vecna) — capture · V — 1st/3rd person
            </div>
            <p style={styles.cta}>( CLICK TO ENTER HAWKINS )</p>
          </div>
        </div>
      )}

      {/* ---------- FINISH HIM ---------- */}
      {phase === 'playing' && finishHim && (
        <div style={styles.finisher}>
          <style>{`@keyframes hw-slam { 0% { transform: scale(2.6) rotate(-4deg); opacity: 0; } 55% { transform: scale(0.94) rotate(1deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }`}</style>
          <div style={{ ...styles.finishhim, animation: 'hw-slam 0.45s ease-out' }}>FINISH HIM!</div>
        </div>
      )}

      {/* ---------- FATALITY ---------- */}
      {phase === 'playing' && fatality && (
        <div style={styles.finisher}>
          <style>{`@keyframes hw-slam { 0% { transform: scale(2.6) rotate(-4deg); opacity: 0; } 55% { transform: scale(0.94) rotate(1deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }`}</style>
          <div style={{ ...styles.finishhim, color: '#ffcc00', textShadow: '0 0 12px #000, 0 0 44px #ff8800', animation: 'hw-slam 0.45s ease-out' }}>FATALITY!</div>
          <div style={styles.fatsub}>VECNA IS SEALED</div>
        </div>
      )}

      {/* ---------- VICTORY ---------- */}
      {phase === 'won' && (
        <div style={styles.overlay} onClick={restart}>
          <div style={styles.menuInner}>
            <h1 style={{ ...styles.title, color: '#66ff99', textShadow: '0 0 30px #00ff66' }}>VECNA CAPTURED</h1>
            <p style={{ ...styles.subtitle, color: '#aaffcc' }}>{hud.finalStats}</p>
            <p style={styles.cta}>( CLICK TO RETURN TO HAWKINS )</p>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { position: 'fixed', inset: 0, background: '#050005', overflow: 'hidden' },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  hud: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: BANNER_CLEAR, paddingBottom: BOTTOM_CLEAR, paddingLeft: 24, paddingRight: 24, boxSizing: 'border-box' },
  topRow: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  topLeft: { flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  topCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 0 },
  topRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  topBtns: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', pointerEvents: 'auto' },
  midCol: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 },
  bottomCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  bottomRow: { width: '100%', display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  bottomLeft: { display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  menuInner: { margin: 'auto', width: 'min(92vw, 600px)', minWidth: 0 },
  reticle: {
    position: 'absolute', left: '50%', top: '50%', width: 44, height: 44,
    transform: 'translate(-50%,-50%)', opacity: 0.95, pointerEvents: 'none',
    filter: 'drop-shadow(0 0 6px rgba(255,40,40,0.9))',
  },
  retRing: {
    position: 'absolute', inset: 6, borderRadius: '50%',
    border: '2px solid rgba(255,70,70,0.85)',
  },
  retDot: {
    position: 'absolute', left: '50%', top: '50%', width: 4, height: 4,
    transform: 'translate(-50%,-50%)', borderRadius: '50%',
    background: '#ff4444',
  },
  retTick: {
    position: 'absolute', width: 2, height: 9, background: 'rgba(255,70,70,0.9)',
  },
  perspbtn: {
    pointerEvents: 'auto', cursor: 'pointer',
    background: 'rgba(10,5,12,0.72)', color: '#ff8899',
    border: '1px solid rgba(255,80,100,0.5)', borderRadius: 8,
    padding: '8px 12px', fontSize: 11, letterSpacing: 2, fontWeight: 700,
  },
  hitmarker: {
    position: 'absolute', left: '50%', top: '50%', width: 34, height: 34,
    transform: 'translate(-50%,-50%) rotate(45deg)',
    border: '3px solid #fff', borderWidth: '3px 3px 0 0',
  },
  dmgvin: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle, transparent 40%, rgba(180,0,0,0.55) 100%)',
  },
  dimflash: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle, rgba(150,50,255,0.75) 0%, rgba(255,30,30,0.4) 60%, transparent 100%)',
    transition: 'opacity 0.9s',
  },
  objective: {
    color: '#ccaa66', fontSize: 13,
    letterSpacing: 1, maxWidth: 360, minWidth: 0, lineHeight: 1.8,
    textShadow: '0 0 8px rgba(200,150,50,0.5)',
  },
  tracemeter: { textAlign: 'center', minWidth: 0 },
  traceLabel: { color: '#9944ff', fontSize: 12, letterSpacing: 4, textShadow: '0 0 10px #8833ff', marginBottom: 6 },
  tracebg: { width: 'min(300px, 55vw)', height: 10, background: 'rgba(120,40,255,0.12)', border: '1px solid #7744cc', margin: '0 auto' },
  tracefill: { height: '100%', background: 'linear-gradient(90deg, #6622cc, #bb88ff)', boxShadow: '0 0 12px #8833ff', transition: 'width 0.4s' },
  traceslots: { color: '#bb88ff', fontSize: 20, letterSpacing: 6, marginTop: 6 },
  bossbar: { width: 'min(480px, 80vw)', textAlign: 'center' },
  bossLabel: { color: '#ff2222', fontSize: 16, letterSpacing: 8, textShadow: '0 0 16px #ff0000', marginBottom: 6 },
  bossbg: { height: 16, background: 'rgba(255,0,0,0.12)', border: '1px solid #ff2222' },
  bossfill: { height: '100%', background: 'linear-gradient(90deg, #880000, #ff2222)', boxShadow: '0 0 16px #ff0000', transition: 'width 0.3s' },
  dimlabel: {
    flex: '1 1 160px', minWidth: 0, textAlign: 'center',
    fontSize: 15, letterSpacing: 6, color: '#8899bb', textShadow: '0 0 12px #4466aa',
  },
  dim_upside: { color: '#ff5555', textShadow: '0 0 12px #ff0000' },
  dim_converged: { color: '#cc66ff', textShadow: '0 0 16px #aa33ff' },
  healthbar: { width: 'min(260px, 62vw)' },
  barLabel: { color: '#ff4444', fontSize: 12, letterSpacing: 3, marginBottom: 6, textShadow: '0 0 8px #ff0000' },
  healthbg: { height: 14, background: 'rgba(255,0,0,0.15)', border: '1px solid #ff2222' },
  healthfill: { height: '100%', background: 'linear-gradient(90deg, #ff2222, #ff6666)', boxShadow: '0 0 12px #ff0000', transition: 'width 0.25s' },
  ammobar: { width: 'min(180px, 45vw)' },
  ammobg: { height: 10, background: 'rgba(255,170,50,0.12)', border: '1px solid #cc8833' },
  ammofill: { height: '100%', background: 'linear-gradient(90deg, #cc8833, #ffcc66)', transition: 'width 0.2s' },
  stats: { textAlign: 'right', color: '#ff4444' },
  kills: { fontSize: 30, textShadow: '0 0 12px #ff0000' },
  wave: { fontSize: 14, color: '#aa6666', letterSpacing: 2, marginTop: 4 },
  wavebanner: {
    textAlign: 'center', maxWidth: '100%',
    color: '#ff2222', fontSize: 'min(40px, 8vw)', letterSpacing: 10, textShadow: '0 0 30px #ff0000',
  },
  clockchime: {
    textAlign: 'center', maxWidth: '100%',
    color: '#bb88ff', fontSize: 'min(26px, 6vw)', letterSpacing: 6, textShadow: '0 0 24px #8833ff',
  },
  killfeed: { color: '#ff8888', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  reloadtip: {
    textAlign: 'center',
    color: '#ffaa33', fontSize: 15, letterSpacing: 3, textShadow: '0 0 10px #ff8800',
  },
  captureprompt: {
    marginTop: 56, maxWidth: '100%',
    color: '#66ff99', fontSize: 20, letterSpacing: 4, textShadow: '0 0 16px #00ff66',
    textAlign: 'center',
  },
  finishbar: {
    width: 260, height: 12, margin: '10px auto 4px',
    background: 'rgba(0,255,100,0.12)', border: '1px solid #66ff99',
  },
  finishfill: {
    height: '100%', background: 'linear-gradient(90deg, #00aa44, #66ff99)',
    boxShadow: '0 0 14px #00ff66', transition: 'width 0.1s linear',
  },
  finishtimer: { fontSize: 30, color: '#ff4444', textShadow: '0 0 14px #ff0000' },
  finisher: {
    position: 'absolute', inset: 0, zIndex: 90, display: 'flex',
    flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    pointerEvents: 'none',
    background: 'radial-gradient(circle, rgba(60,0,0,0.45) 0%, transparent 70%)',
  },
  finishhim: {
    fontSize: 'min(17vw, 120px)', fontWeight: 'bold', letterSpacing: 6,
    color: '#ff2222', textShadow: '0 0 12px #000, 0 0 44px #ff0000',
    fontFamily: "'Courier New', monospace",
  },
  fatsub: {
    marginTop: 14, fontSize: 22, letterSpacing: 10, color: '#ffcc00',
    textShadow: '0 0 18px #ff8800', fontFamily: "'Courier New', monospace",
  },
  bikeprompt: {
    textAlign: 'center',
    color: '#ffcc44', fontSize: 16, letterSpacing: 3, textShadow: '0 0 10px #ffaa00',
  },
  navwrap: {
    textAlign: 'center', pointerEvents: 'none',
  },
  navarrow: {
    fontSize: 30, color: '#aa66ff', textShadow: '0 0 14px #8833ff',
    transition: 'transform 0.25s linear', display: 'inline-block',
  },
  navlabel: {
    color: '#aa66ff', fontSize: 11, letterSpacing: 3, marginTop: 2,
    textShadow: '0 0 8px #8833ff',
  },
  overlay: {
    position: 'absolute', inset: 0, zIndex: 100, display: 'flex',
    justifyContent: 'center', alignItems: 'center', textAlign: 'center',
    overflowY: 'auto', padding: '24px 16px', boxSizing: 'border-box',
    background: 'radial-gradient(circle, #1a0000 0%, #050005 100%)',
    color: '#ff2222', cursor: 'pointer', fontFamily: "'Courier New', monospace",
  },
  title: { fontSize: 44, letterSpacing: 10, margin: '0 0 8px', textShadow: '0 0 30px #ff0000', fontWeight: 'normal' },
  subtitle: { color: '#888', fontSize: 14, letterSpacing: 2 },
  lore: { color: '#773333', fontSize: 12, marginTop: 16, maxWidth: 560, lineHeight: 1.7 },
  keys: { color: '#aaa', fontSize: 13, marginTop: 20, lineHeight: 2 },
  charrow: { marginTop: 22 },
  charlabel: { color: '#aa6666', fontSize: 11, letterSpacing: 4, marginBottom: 10 },
  charbtns: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  charbtn: {
    background: 'rgba(20,4,8,0.8)', color: '#cc8888', cursor: 'pointer',
    border: '1px solid rgba(255,80,100,0.35)', borderRadius: 10,
    padding: '10px 14px', minWidth: 150, fontFamily: "'Courier New', monospace",
  },
  charbtnOn: {
    color: '#ffd9d9', borderColor: '#ff4455',
    boxShadow: '0 0 16px rgba(255,30,50,0.45)', background: 'rgba(60,6,14,0.9)',
  },
  charname: { fontSize: 14, letterSpacing: 2, fontWeight: 'bold' },
  charblurb: { fontSize: 10, color: '#997777', marginTop: 4, letterSpacing: 1 },
  charnote: { fontSize: 10, color: '#555', marginTop: 8, letterSpacing: 1 },
  cta: { fontSize: 13, marginTop: 18, color: '#888' },
  stick: {
    position: 'absolute', left: 30, bottom: 110, width: 120, height: 120,
    border: '2px solid rgba(255,60,60,0.4)', borderRadius: '50%', zIndex: 60, pointerEvents: 'auto',
    touchAction: 'none',
  },
  nub: {
    position: 'absolute', left: 38, top: 38, width: 44, height: 44,
    background: 'rgba(255,60,60,0.35)', borderRadius: '50%',
  },
  firebtn: {
    position: 'absolute', right: 34, bottom: 120, width: 96, height: 96,
    border: '2px solid rgba(255,60,60,0.6)', borderRadius: '50%', zIndex: 60,
    color: '#ff4444', fontSize: 13, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(255,0,0,0.08)', pointerEvents: 'auto',
    touchAction: 'none',
  },
  actbtn: {
    position: 'absolute', right: 150, bottom: 120, width: 76, height: 76,
    border: '2px solid rgba(100,255,150,0.6)', borderRadius: '50%', zIndex: 60,
    color: '#66ff99', fontSize: 11, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'rgba(0,255,100,0.06)', pointerEvents: 'auto',
    touchAction: 'none',
  },
};
