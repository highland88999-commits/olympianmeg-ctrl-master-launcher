'use client';

/*
 * OSView — the deduped ARTEMIS desktop ("APEX HERITAGE" + "NOVA").
 *
 * Merges Merlin's two window-manager shells into one:
 *   artemis-hub (index.html, 41 KB): boot screen, auth gateway, draggable /
 *     resizable iframe windows, taskbar, start menu, command palette,
 *     themes (ARTEMIS/APPLE/LINUX/MICROSOFT), bookmarks, sessions, mobile
 *     adaptation.
 *   artemis-os (index.html): snap guides, side-dock layout, NOVA/LINUX boot
 *     configs (folded in as the NOVA theme + snap behavior).
 *
 * His video links are embedded verbatim (lib/artemis/videos.js).
 * Auth is the launcher's Supabase (was his own Supabase project); guests
 * keep working with localStorage, exactly like his original.
 *
 * STRIPPED from both originals (never ported):
 *   - OMEGA MIND TELEMETRY UPLINK (foreign Supabase, central_telemetry,
 *     connected_repos, ipify lookup, click tracking)
 *   - silentUplink() track_ping beacon (60s interval)
 *   - onrender.com from the iframe allowlist (zero Render reliance)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ARTEMIS_VIDEOS } from '@/lib/artemis/videos';
import {
  OS_THEMES,
  OS_THEME_KEYS,
  OS_APPS,
  OS_WINDOW_DEFAULTS,
  isAllowedFrameUrl,
} from '@/lib/artemis/os.js';

let winSeq = 1;

function newWindow(app, desktop) {
  const step = OS_WINDOW_DEFAULTS.cascadeStep * (winSeq % 8);
  const w = Math.min(OS_WINDOW_DEFAULTS.width, desktop.w - 40);
  const h = Math.min(OS_WINDOW_DEFAULTS.height, desktop.h - 120);
  const id = `w${Date.now()}_${winSeq++}`;
  return {
    id,
    appId: app.id,
    name: app.name,
    icon: app.icon,
    url: app.route,
    x: Math.max(8, (desktop.w - w) / 2 + step - 64),
    y: Math.max(8, (desktop.h - h) / 2 + step - 60),
    w,
    h,
    minimized: false,
    maximized: desktop.w < 720, // mobile adaptation: windows open maximized
    z: Date.now(),
  };
}

/* ---------------- Boot screen ---------------- */
function Boot({ onDone }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(t);
          setTimeout(onDone, 350);
          return 100;
        }
        return p + 8 + Math.random() * 10;
      });
    }, 220);
    return () => clearInterval(t);
  }, [onDone]);
  return (
    <div style={s.boot} aria-label="Booting">
      <video src={ARTEMIS_VIDEOS.boot} autoPlay muted loop playsInline style={s.bgVideo} aria-hidden="true" />
      <div style={s.bootShade} />
      <div style={s.bootInner}>
        <div style={s.bootTitle}>APEX HERITAGE</div>
        <div style={s.bootBar}><div style={{ ...s.bootFill, width: `${Math.min(100, progress)}%` }} /></div>
        <div style={s.bootSub}>NOVA kernel · waking the desktop</div>
      </div>
    </div>
  );
}

/* ---------------- Auth gateway ---------------- */
function Gateway({ onGuest, onSignIn }) {
  return (
    <div style={s.gate} aria-label="OS sign in">
      <video src={ARTEMIS_VIDEOS.authBg} poster={ARTEMIS_VIDEOS.authPoster} autoPlay muted loop playsInline style={s.bgVideo} aria-hidden="true" />
      <div style={s.bootShade} />
      <div style={s.gateCard}>
        <div style={s.gateTitle}>APEX HERITAGE</div>
        <p style={s.gateText}>Sign in to sync your desktop across sessions — or continue as a guest on this device.</p>
        <button type="button" onClick={onSignIn} style={s.gatePrimary}>SIGN IN AT THE HUB</button>
        <button type="button" onClick={onGuest} style={s.gateGhost}>Continue as guest</button>
      </div>
    </div>
  );
}

/* ---------------- One window ---------------- */
function OsWindow({ win, active, accent, onFocus, onClose, onToggleMin, onToggleMax, onMove, onMoveEnd, onResize, onBookmark, bookmarked }) {
  const startDrag = (e) => {
    if (win.maximized || e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = win.x;
    const oy = win.y;
    const move = (ev) => onMove(win.id, ox + ev.clientX - sx, oy + ev.clientY - sy, ev.clientX);
    const up = () => {
      onMoveEnd(win.id);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (e) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const ow = win.w;
    const oh = win.h;
    const move = (ev) => onResize(win.id,
      Math.max(OS_WINDOW_DEFAULTS.minWidth, ow + ev.clientX - sx),
      Math.max(OS_WINDOW_DEFAULTS.minHeight, oh + ev.clientY - sy));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (win.minimized) return null;

  const style = win.maximized
    ? { ...s.win, left: 0, top: 0, width: '100%', height: 'calc(100% - 48px)', zIndex: win.z }
    : { ...s.win, left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <div
      style={{ ...style, borderColor: active ? accent : 'rgba(255,255,255,0.14)' }}
      onPointerDown={() => onFocus(win.id)}
      role="dialog"
      aria-label={win.name}
    >
      <div
        style={s.titlebar}
        onPointerDown={startDrag}
        onDoubleClick={() => onToggleMax(win.id)}
      >
        <span style={s.winTitle}>{win.icon} {win.name}</span>
        <div style={s.winBtns}>
          <button type="button" aria-label={`Bookmark ${win.name}`} onClick={() => onBookmark(win)} style={{ ...s.winBtn, color: bookmarked ? '#ffd76a' : undefined }}>
            {bookmarked ? '★' : '☆'}
          </button>
          <button type="button" aria-label="Minimize" onClick={() => onToggleMin(win.id)} style={s.winBtn}>–</button>
          <button type="button" aria-label="Maximize" onClick={() => onToggleMax(win.id)} style={s.winBtn}>▢</button>
          <button type="button" aria-label="Close" onClick={() => onClose(win.id)} style={s.winBtn}>✕</button>
        </div>
      </div>
      <div style={s.winBody}>
        {isAllowedFrameUrl(win.url) ? (
          <iframe title={win.name} src={win.url} style={s.frame} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        ) : (
          <div style={s.frameBlocked}>That address is not allowed in a window.</div>
        )}
      </div>
      {!win.maximized && <div style={s.resizeHandle} onPointerDown={startResize} aria-hidden="true" />}
    </div>
  );
}

/* ---------------- Desktop ---------------- */
export default function OSView() {
  const router = useRouter();
  const [phase, setPhase] = useState('boot'); // boot -> gate -> desktop
  const [user, setUser] = useState(null);
  const [windows, setWindows] = useState([]);
  const [theme, setTheme] = useState('ARTEMIS');
  const [sideDock, setSideDock] = useState(false); // folded in from artemis-os
  const [startOpen, setStartOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [snapHint, setSnapHint] = useState(null); // 'left' | 'right' | null — artemis-os snap guides
  const [now, setNow] = useState(() => new Date());
  const desktopRef = useRef(null);
  const saveTimer = useRef(null);

  const accent = OS_THEMES[theme].color;
  const signedIn = Boolean(user);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          setUser(data.session.user);
          setPhase('desktop');
        }
      } catch { /* stay at gate */ }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setPaletteQuery('');
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setStartOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const desktopSize = useCallback(() => {
    const el = desktopRef.current;
    if (!el) return { w: 1200, h: 800 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, []);

  /* sessions: restore */
  useEffect(() => {
    if (phase !== 'desktop') return;
    let cancelled = false;
    (async () => {
      let saved = null;
      try {
        if (signedIn) {
          const { data } = await supabase.from('apex_sessions').select('session_data').eq('user_id', user.id).maybeSingle();
          saved = data?.session_data || null;
        } else {
          saved = JSON.parse(localStorage.getItem('apex_session') || 'null');
        }
      } catch { saved = null; }
      if (cancelled) return;
      let themeSaved = null;
      try { themeSaved = localStorage.getItem('artemis-mode'); } catch { /* noop */ }
      if (themeSaved && OS_THEMES[themeSaved]) setTheme(themeSaved);
      if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
        const wins = Object.values(saved).filter((w) => w && w.url && isAllowedFrameUrl(w.url));
        setWindows(wins.map((w, i) => ({ ...w, z: Date.now() + i })));
      } else {
        setWindows([newWindow(OS_APPS[0], desktopSize())]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, signedIn]);

  /* sessions: save (debounced) */
  useEffect(() => {
    if (phase !== 'desktop') return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const snap = {};
      windows.forEach((w) => { snap[w.id] = { ...w }; });
      try {
        if (signedIn) {
          await supabase.from('apex_sessions').upsert(
            [{ user_id: user.id, session_data: snap, updated_at: new Date().toISOString() }],
            { onConflict: 'user_id' }
          );
        } else {
          localStorage.setItem('apex_session', JSON.stringify(snap));
        }
      } catch { /* session save is best-effort */ }
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [windows, phase, signedIn, user]);

  /* bookmarks: load */
  useEffect(() => {
    if (phase !== 'desktop') return;
    (async () => {
      try {
        if (signedIn) {
          const { data } = await supabase.from('apex_bookmarks').select('*').order('created_at', { ascending: false });
          setBookmarks(data || []);
        } else {
          setBookmarks(JSON.parse(localStorage.getItem('apex_bookmarks') || '[]'));
        }
      } catch { setBookmarks([]); }
    })();
  }, [phase, signedIn]);

  const openApp = useCallback((app) => {
    const d = desktopSize();
    setWindows((ws) => {
      const existing = ws.find((w) => w.appId === app.id && !w.minimized);
      if (existing) return ws.map((w) => (w.id === existing.id ? { ...w, z: Date.now() } : w));
      return [...ws, newWindow(app, d)];
    });
    setStartOpen(false);
    setPaletteOpen(false);
  }, [desktopSize]);

  const focusWin = useCallback((id) => {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, z: Date.now(), minimized: false } : w)));
  }, []);

  const closeWin = useCallback((id) => {
    setWindows((ws) => ws.filter((w) => w.id !== id));
  }, []);

  const toggleMin = useCallback((id) => {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w)));
  }, []);

  const toggleMax = useCallback((id) => {
    setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w)));
  }, []);

  /* Move with edge snapping — snap guides folded in from artemis-os. */
  const moveWin = useCallback((id, x, y, clientX) => {
    const d = desktopSize();
    const edge = 28;
    if (clientX <= edge) setSnapHint('left');
    else if (typeof window !== 'undefined' && clientX >= window.innerWidth - edge) setSnapHint('right');
    else setSnapHint(null);
    setWindows((ws) => ws.map((w) => {
      if (w.id !== id) return w;
      return { ...w, x: Math.max(-w.w + 80, Math.min(d.w - 80, x)), y: Math.max(0, Math.min(d.h - 120, y)) };
    }));
  }, [desktopSize]);

  const endMoveSnap = useCallback((id) => {
    setSnapHint((hint) => {
      if (hint) {
        const el = desktopRef.current;
        const dw = el ? el.getBoundingClientRect().width : 1200;
        const dh = el ? el.getBoundingClientRect().height : 800;
        setWindows((ws) => ws.map((w) => {
          if (w.id !== id) return w;
          return hint === 'left'
            ? { ...w, x: 0, y: 0, w: Math.floor(dw / 2), h: dh - 48, maximized: false }
            : { ...w, x: Math.ceil(dw / 2), y: 0, w: Math.floor(dw / 2), h: dh - 48, maximized: false };
        }));
      }
      return null;
    });
  }, []);

  const resizeWin = useCallback((id, w, h) => {
    setWindows((ws) => ws.map((x) => (x.id === id ? { ...x, w, h } : x)));
  }, []);

  const toggleBookmark = useCallback(async (win) => {
    const urlOf = (b) => b.app_url || b.url;
    const isBM = bookmarks.some((b) => urlOf(b) === win.url);
    try {
      if (signedIn) {
        if (isBM) {
          const row = bookmarks.find((b) => urlOf(b) === win.url);
          if (row?.id) await supabase.from('apex_bookmarks').delete().eq('id', row.id);
        } else {
          await supabase.from('apex_bookmarks').insert([{
            user_id: user.id, app_name: win.name, app_url: win.url, icon: win.icon,
          }]);
        }
        const { data } = await supabase.from('apex_bookmarks').select('*').order('created_at', { ascending: false });
        setBookmarks(data || []);
      } else {
        let bms = JSON.parse(localStorage.getItem('apex_bookmarks') || '[]');
        if (isBM) bms = bms.filter((b) => urlOf(b) !== win.url);
        else bms.unshift({ app_name: win.name, app_url: win.url, icon: win.icon });
        localStorage.setItem('apex_bookmarks', JSON.stringify(bms));
        setBookmarks(bms);
      }
    } catch { /* bookmark toggle is best-effort */ }
  }, [bookmarks, signedIn, user]);

  const switchTheme = useCallback((t) => {
    setTheme(t);
    try { localStorage.setItem('artemis-mode', t); } catch { /* noop */ }
    setPaletteOpen(false);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (phase === 'boot') return <Boot onDone={() => setPhase('gate')} />;
  if (phase === 'gate') {
    return (
      <Gateway
        onGuest={() => setPhase('desktop')}
        onSignIn={() => router.push('/')}
      />
    );
  }

  const themeCfg = OS_THEMES[theme];
  const paletteItems = [
    ...OS_APPS.filter((a) => a.name.toLowerCase().includes(paletteQuery.toLowerCase()))
      .map((a) => ({ kind: 'app', label: `Open ${a.name}`, run: () => openApp(a) })),
    ...OS_THEME_KEYS.filter((t) => t.toLowerCase().includes(paletteQuery.toLowerCase()))
      .map((t) => ({ kind: 'theme', label: `Theme: ${t}`, run: () => switchTheme(t) })),
    { kind: 'action', label: sideDock ? 'Dock: move to bottom' : 'Dock: move to side', run: () => { setSideDock((v) => !v); setPaletteOpen(false); } },
    { kind: 'action', label: 'Close all windows', run: () => { setWindows([]); setPaletteOpen(false); } },
  ];
  const topZ = windows.reduce((m, w) => Math.max(m, w.z || 0), 0);

  return (
    <div style={s.desktop} aria-label="Artemis OS desktop">
      {themeCfg.bg ? (
        <video src={themeCfg.bg} poster={themeCfg.poster || undefined} autoPlay muted loop playsInline style={s.bgVideo} aria-hidden="true" />
      ) : (
        <div style={{ ...s.bgVideo, background: `radial-gradient(circle at 50% 30%, ${accent}22 0%, #04060a 70%)` }} aria-hidden="true" />
      )}

      {/* Snap guides (artemis-os) */}
      <div style={{ ...s.snap, left: 0, opacity: snapHint === 'left' ? 1 : 0 }} aria-hidden="true" />
      <div style={{ ...s.snap, right: 0, opacity: snapHint === 'right' ? 1 : 0 }} aria-hidden="true" />

      <div ref={desktopRef} style={s.workarea}>
        {windows.map((w) => (
          <OsWindow
            key={w.id}
            win={w}
            active={w.z === topZ}
            accent={accent}
            onFocus={focusWin}
            onClose={closeWin}
            onToggleMin={toggleMin}
            onToggleMax={toggleMax}
            onMove={moveWin}
            onMoveEnd={endMoveSnap}
            onResize={resizeWin}
            onBookmark={toggleBookmark}
            bookmarked={bookmarks.some((b) => (b.app_url || b.url) === w.url)}
          />
        ))}
      </div>

      {/* Start menu */}
      {startOpen && (
        <div style={s.startMenu} role="menu" aria-label="Start menu">
          <div style={s.startTitle}>APPS</div>
          {OS_APPS.map((a) => (
            <button key={a.id} type="button" role="menuitem" onClick={() => openApp(a)} style={s.startItem}>
              <span style={s.startIcon}>{a.icon}</span> {a.name}
            </button>
          ))}
          <div style={s.startTitle}>THEME</div>
          <div style={s.themeRow}>
            {OS_THEME_KEYS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTheme(t)}
                title={t}
                aria-pressed={theme === t}
                style={{
                  ...s.themeDot,
                  background: OS_THEMES[t].color,
                  outline: theme === t ? `2px solid ${OS_THEMES[t].color}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          {bookmarks.length > 0 && (
            <>
              <div style={s.startTitle}>BOOKMARKS</div>
              {bookmarks.slice(0, 6).map((b, i) => (
                <button
                  key={b.id || i}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (isAllowedFrameUrl(b.app_url || b.url)) {
                      const d = desktopRef.current ? desktopRef.current.getBoundingClientRect() : { width: 1200, height: 800 };
                      setWindows((ws) => [...ws, newWindow({ id: `bm${i}`, name: b.app_name, icon: b.icon || '🔖', route: b.app_url || b.url }, d)]);
                    }
                    setStartOpen(false);
                  }}
                  style={s.startItem}
                >
                  <span style={s.startIcon}>{b.icon || '🔖'}</span> {b.app_name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Command palette */}
      {paletteOpen && (
        <div style={s.paletteWrap} onClick={() => setPaletteOpen(false)}>
          <div style={s.palette} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <input
              autoFocus
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
              placeholder="Type a command…"
              aria-label="Command palette"
              style={s.paletteInput}
            />
            <div style={s.paletteList}>
              {paletteItems.map((item, i) => (
                <button key={`${item.kind}-${i}`} type="button" onClick={item.run} style={s.paletteItem}>
                  <span style={s.paletteKind}>{item.kind}</span> {item.label}
                </button>
              ))}
              {paletteItems.length === 0 && <div style={s.paletteEmpty}>No matches.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Dock: bottom taskbar or side dock (artemis-os) */}
      <div style={sideDock ? { ...s.dock, ...s.dockSide } : { ...s.dock, ...s.dockBottom }} aria-label="Dock">
        <button type="button" onClick={() => setStartOpen((v) => !v)} style={{ ...s.dockBtn, borderColor: accent }} aria-label="Start menu" aria-expanded={startOpen}>
          Ω
        </button>
        {(sideDock ? [...OS_APPS].reverse() : OS_APPS).map((a) => (
          <button key={a.id} type="button" onClick={() => openApp(a)} title={a.name} aria-label={`Open ${a.name}`} style={s.dockBtn}>
            {a.icon}
          </button>
        ))}
        {!sideDock && (
          <div style={s.taskWins}>
            {windows.filter((w) => !w.minimized).map((w) => (
              <button key={w.id} type="button" onClick={() => toggleMin(w.id)} style={s.taskWin} title={w.name}>
                {w.icon}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }} style={s.dockBtn} title="Command palette (Ctrl+K)" aria-label="Command palette">
          ⌘
        </button>
        <div style={s.clock}>{timeStr}</div>
      </div>
    </div>
  );
}

const s = {
  desktop: { position: 'relative', height: 'calc(100dvh - 73px)', minHeight: 480, overflow: 'hidden', background: '#04060a' },
  bgVideo: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  workarea: { position: 'absolute', inset: 0, bottom: 48 },
  snap: { position: 'absolute', top: 0, width: 5, height: 'calc(100% - 48px)', background: 'rgba(0,242,255,0.5)', transition: 'opacity 0.15s', zIndex: 500, pointerEvents: 'none' },
  win: { position: 'absolute', display: 'flex', flexDirection: 'column', border: '1px solid', borderRadius: 10, overflow: 'hidden', background: 'rgba(6,10,16,0.96)', boxShadow: '0 18px 50px rgba(0,0,0,0.5)' },
  titlebar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 12px', background: 'rgba(255,255,255,0.05)', cursor: 'grab', userSelect: 'none', touchAction: 'none' },
  winTitle: { fontSize: 12, letterSpacing: 1, color: '#dfe9f2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  winBtns: { display: 'flex', gap: 2 },
  winBtn: { minWidth: 36, minHeight: 32, border: 'none', background: 'transparent', color: '#9fb6c6', fontSize: 14, cursor: 'pointer', borderRadius: 6 },
  winBody: { flex: 1, minHeight: 0, background: '#fff' },
  frame: { width: '100%', height: '100%', border: 'none', display: 'block' },
  frameBlocked: { padding: 24, color: '#333', fontSize: 14 },
  resizeHandle: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, cursor: 'nwse-resize', touchAction: 'none' },
  dock: { position: 'absolute', zIndex: 600, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(4,8,14,0.9)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' },
  dockBottom: { left: 0, right: 0, bottom: 0, height: 48, padding: '0 10px', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' },
  dockSide: { left: 0, top: 0, bottom: 48, width: 56, flexDirection: 'column', padding: '10px 0', borderTop: 'none', borderLeft: 'none', borderBottom: 'none' },
  dockBtn: { minWidth: 44, minHeight: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#e8f1f7', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  taskWins: { display: 'flex', gap: 4, marginLeft: 6, paddingLeft: 10, borderLeft: '1px solid rgba(255,255,255,0.12)' },
  taskWin: { minWidth: 40, minHeight: 40, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', fontSize: 16, cursor: 'pointer' },
  clock: { marginLeft: 'auto', fontSize: 13, color: '#9fb6c6', letterSpacing: 1, paddingRight: 4, whiteSpace: 'nowrap' },
  startMenu: { position: 'absolute', left: 10, bottom: 58, zIndex: 700, width: 250, maxHeight: '60%', overflowY: 'auto', background: 'rgba(6,10,16,0.97)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 10 },
  startTitle: { fontSize: 10, letterSpacing: 3, color: '#7d93a5', margin: '8px 4px 6px' },
  startItem: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', minHeight: 44, padding: '0 10px', border: 'none', borderRadius: 8, background: 'transparent', color: '#dfe9f2', fontSize: 14, cursor: 'pointer' },
  startIcon: { fontSize: 18 },
  themeRow: { display: 'flex', gap: 10, padding: '4px 6px 8px' },
  themeDot: { width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer' },
  paletteWrap: { position: 'absolute', inset: 0, zIndex: 800, background: 'rgba(2,4,8,0.6)', display: 'flex', justifyContent: 'center', paddingTop: '12%' },
  palette: { width: 'min(520px, 92%)', height: 'fit-content', maxHeight: '60%', display: 'flex', flexDirection: 'column', background: 'rgba(6,10,16,0.98)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, overflow: 'hidden' },
  paletteInput: { background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 16, padding: '14px 16px', outline: 'none' },
  paletteList: { overflowY: 'auto', padding: 8 },
  paletteItem: { display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '0 12px', border: 'none', borderRadius: 8, background: 'transparent', color: '#dfe9f2', fontSize: 14, cursor: 'pointer' },
  paletteKind: { fontSize: 10, letterSpacing: 2, color: '#7d93a5', marginRight: 8, textTransform: 'uppercase' },
  paletteEmpty: { padding: 16, color: '#7d93a5', fontSize: 14 },
  boot: { position: 'relative', height: 'calc(100dvh - 73px)', minHeight: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#04060a' },
  bootShade: { position: 'absolute', inset: 0, background: 'rgba(2,4,8,0.55)' },
  bootInner: { position: 'relative', zIndex: 1, textAlign: 'center', padding: 24 },
  bootTitle: { fontSize: 30, letterSpacing: 10, color: '#fff', marginBottom: 22, fontWeight: 200 },
  bootBar: { width: 260, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', margin: '0 auto 14px', overflow: 'hidden' },
  bootFill: { height: '100%', background: '#00f2ff', transition: 'width 0.2s' },
  bootSub: { fontSize: 12, letterSpacing: 2, color: '#7d93a5' },
  gate: { position: 'relative', height: 'calc(100dvh - 73px)', minHeight: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gateCard: { position: 'relative', zIndex: 1, width: 'min(420px, 92%)', background: 'rgba(6,10,16,0.88)', border: '1px solid rgba(0,242,255,0.25)', borderRadius: 16, padding: 32, textAlign: 'center' },
  gateTitle: { fontSize: 22, letterSpacing: 6, color: '#fff', marginBottom: 12 },
  gateText: { fontSize: 14, color: '#9fb6c6', lineHeight: 1.7, margin: '0 0 22px' },
  gatePrimary: { display: 'block', width: '100%', minHeight: 52, marginBottom: 10, borderRadius: 10, border: '1px solid #00f2ff', background: 'rgba(0,242,255,0.12)', color: '#fff', fontSize: 14, letterSpacing: 2, cursor: 'pointer' },
  gateGhost: { display: 'block', width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#9fb6c6', fontSize: 13, cursor: 'pointer' },
};
