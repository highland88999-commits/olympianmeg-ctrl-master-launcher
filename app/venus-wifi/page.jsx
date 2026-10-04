'use client';

import { useEffect, useRef, useState } from 'react';
import { MicIcon, RadarIcon, SatelliteIcon, EraseIcon, RouteIcon, PinIcon } from '@/lib/hermes-icons';

const CSS = `
.vw-root { height: 100dvh; display: flex; flex-direction: column; background: #0a0a14; color: #fff;
  font-family: 'Courier New', Courier, monospace; overflow: hidden; position: relative;
  padding-bottom: env(safe-area-inset-bottom); }
.vw-scan { position: absolute; inset: 0; z-index: 60; pointer-events: none;
  background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%);
  background-size: 100% 2px; }
.vw-head { background: linear-gradient(rgba(13,13,26,.88), rgba(13,13,26,.88)), url(/images/venus-wifi/bg.webp);
  background-size: cover; background-position: center 30%; border-bottom: 2px solid #00f2ff; padding: 10px 15px;
  display: flex; justify-content: space-between; align-items: center; z-index: 61;
  box-shadow: 0 0 15px rgba(0,243,255,0.35); }
.vw-head h1 { text-shadow: 0 0 8px rgba(0,243,255,0.7), 0 0 22px rgba(212,175,55,0.25); }
.vw-readout { background: linear-gradient(rgba(7,7,15,.9), rgba(7,7,15,.9)), url(/images/hermes/gold-tile.webp);
  background-size: auto, 200px; }
.vw-vault { background: linear-gradient(rgba(7,7,15,.93), rgba(7,7,15,.93)), url(/images/hermes/gold-tile.webp);
  background-size: auto, 200px; }
.vw-btn svg { vertical-align: -2px; }
.vw-head h1 { margin: 0; font-size: 1rem; color: #00f2ff; text-shadow: 0 0 8px rgba(0,243,255,0.7);
  letter-spacing: 1px; }
.vw-status { color: #39ff14; font-size: 0.8rem; letter-spacing: 1px; }
.vw-dash { display: flex; flex-direction: column; gap: 10px; padding: 14px; background: #121225;
  border-bottom: 1px solid #2a2a4a; z-index: 61; }
.vw-search { display: flex; gap: 8px; }
.vw-search input { flex: 1; background: #07070f; border: 1px solid #00f2ff; color: #fff; padding: 12px;
  font-family: inherit; outline: none; box-shadow: inset 0 0 5px rgba(0,243,255,0.4); font-size: 1rem;
  border-radius: 0; min-width: 0; }
.vw-search input:focus { box-shadow: inset 0 0 5px rgba(0,243,255,0.4), 0 0 12px rgba(0,243,255,0.3); }
.vw-btn { background: transparent; border: 1px solid #00f2ff; color: #00f2ff; padding: 10px 14px;
  cursor: pointer; font-family: inherit; text-transform: uppercase; font-weight: 700; font-size: 0.9rem;
  min-height: 48px; min-width: 48px; }
.vw-btn:hover { background: rgba(0,243,255,0.12); }
.vw-btn.pink { border-color: #ff0055; color: #ff0055; }
.vw-btn.pink:hover { background: rgba(255,0,85,0.12); }
.vw-btn.wide { width: 100%; }
.vw-mapwrap { position: relative; flex: 1; min-height: 0; background: #050510; }
.vw-mapwrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.vw-readout { position: absolute; left: 10px; bottom: calc(5rem + 10px + env(safe-area-inset-bottom)); z-index: 62; background: rgba(7,7,15,0.85);
  border: 1px solid rgba(0,243,255,0.5); padding: 10px 12px; font-size: 0.78rem; color: #00f2ff;
  line-height: 1.7; max-width: 72vw; }
.vw-vault { position: absolute; right: 10px; top: 10px; z-index: 62; width: min(260px, 70vw);
  max-height: 60%; overflow-y: auto; background: rgba(7,7,15,0.9); border: 1px solid rgba(0,243,255,0.5);
  padding: 10px; }
.vw-vault h3 { margin: 0 0 8px; font-size: 0.75rem; letter-spacing: 2px; color: #00f2ff; }
.vw-wp { display: flex; justify-content: space-between; align-items: center; gap: 6px;
  border: 1px solid rgba(0,243,255,0.25); padding: 8px; margin-bottom: 6px; font-size: 0.75rem; }
.vw-wp button { background: none; border: 1px solid #00f2ff; color: #00f2ff; font-family: inherit;
  font-size: 0.7rem; padding: 6px 8px; cursor: pointer; min-height: 36px; }
.vw-wp button:hover { background: rgba(0,243,255,0.15); }
.vw-wp .vw-del { border-color: #ff0055; color: #ff0055; }
.vw-empty { color: #666; font-size: 0.75rem; }
.vw-addbar { display: flex; gap: 8px; margin-top: 4px; }
.vw-addbar input { flex: 1; background: #07070f; border: 1px solid rgba(0,243,255,0.4); color: #fff;
  padding: 10px; font-family: inherit; font-size: 0.8rem; min-width: 0; }
.vw-toast { position: absolute; bottom: calc(5rem + 16px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 63;
  background: rgba(0,243,255,0.92); color: #000; font-weight: 700; padding: 10px 18px;
  font-size: 0.8rem; white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
`;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a, b) {
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function compass(b) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(b / 45) % 8];
}

function uid() {
  return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export default function VenusWifiPage() {
  const canvasRef = useRef(null);
  const watchId = useRef(null);
  const [status, setStatus] = useState('READY');
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const [gpsOn, setGpsOn] = useState(false);
  const [waypoints, setWaypoints] = useState([]);
  const [dest, setDest] = useState(null);
  const [route, setRoute] = useState(null);
  const [wpName, setWpName] = useState('');
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);

  const stateRef = useRef({ pos, waypoints, dest, route });
  stateRef.current = { pos, waypoints, dest, route };

  const speak = (text) => {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch { /* voice unavailable */ }
  };

  const flash = (msg) => {
    setStatus(msg);
    setToast(msg);
  };

  // Load saved waypoints from this device
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('venus-waypoints');
      if (raw) setWaypoints(JSON.parse(raw));
    } catch { /* fresh vault */ }
    setReady(true);
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem('venus-waypoints', JSON.stringify(waypoints)); } catch { /* ignore */ }
  }, [waypoints, ready]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => { setToast(''); }, 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // Procedural radar map — fully local, no tile servers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0, h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = w; canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);

    const gridStars = Array.from({ length: 160 }, () => ({
      x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5,
      tw: Math.random() * Math.PI * 2, cyan: Math.random() > 0.8,
    }));
    let t = 0;

    // local flat projection around the user position
    const project = (p, center, scale) => {
      const dx = (p.lon - center.lon) * Math.cos((center.lat * Math.PI) / 180) * 111.32;
      const dy = (p.lat - center.lat) * 110.57;
      return [w / 2 + dx * scale, h / 2 - dy * scale];
    };

    const draw = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      // starfield
      for (const st of gridStars) {
        st.tw += 0.02;
        const a = 0.25 + Math.abs(Math.sin(st.tw)) * 0.55;
        ctx.fillStyle = st.cyan
          ? 'rgba(0,243,255,' + a.toFixed(2) + ')'
          : 'rgba(150,150,200,' + (a * 0.6).toFixed(2) + ')';
        ctx.fillRect(st.x * w, st.y * h, st.s, st.s);
      }
      const { pos: p, waypoints: wps, dest: d, route: r } = stateRef.current;
      const cx = w / 2, cy = h / 2;
      // radar rings
      ctx.strokeStyle = 'rgba(0,243,255,0.25)';
      ctx.lineWidth = 1;
      const maxR = Math.min(w, h) * 0.44;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, (maxR * i) / 3, 0, Math.PI * 2); ctx.stroke();
      }
      // crosshair
      ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();
      // sweep
      const sa = t * 0.9;
      const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sa) * maxR, cy + Math.sin(sa) * maxR);
      grad.addColorStop(0, 'rgba(0,243,255,0.35)');
      grad.addColorStop(1, 'rgba(0,243,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sa) * maxR, cy + Math.sin(sa) * maxR); ctx.stroke();

      const center = p || { lat: 0, lon: 0 };
      const scale = 900; // px per km — local tactical view
      // route
      if (r && p) {
        const [x2, y2] = project(r.to, center, scale);
        ctx.strokeStyle = '#00f2ff';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.setLineDash([]);
      }
      // waypoints
      for (const wp of wps) {
        const [x, y] = project(wp, center, scale);
        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
        const isDest = d && d.id === wp.id;
        ctx.fillStyle = isDest ? '#ff0055' : 'rgba(0,243,255,0.9)';
        ctx.beginPath(); ctx.arc(x, y, isDest ? 9 : 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isDest ? '#ff0055' : '#9fd8e8';
        ctx.font = '11px Courier New, monospace';
        ctx.fillText(wp.name.toUpperCase().slice(0, 14), x + 12, y + 4);
      }
      // user marker
      if (p) {
        ctx.fillStyle = '#39ff14';
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(57,255,20,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 12 + Math.sin(t * 3) * 3, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = '#666';
        ctx.font = '12px Courier New, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('NO POSITION FIX — ENGAGE GPS', cx, cy);
        ctx.textAlign = 'left';
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const startGPS = () => {
    if (!navigator.geolocation) { flash('GPS UNSUPPORTED'); return; }
    if (gpsOn) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setGpsOn(false);
      setPos(null);
      flash('GPS DISENGAGED');
      return;
    }
    flash('ACQUIRING FIX…');
    speak('GPS link requested.');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude });
        setGpsOn(true);
        flash('POSITION LOCK');
      },
      () => { flash('FIX FAILED'); speak('Position fix failed.'); },
      { enableHighAccuracy: true }
    );
  };

  const scanVault = () => {
    const q = query.trim().toLowerCase();
    if (!q) { flash('ENTER A VECTOR FIRST'); return; }
    const hit = waypoints.find((wp) => wp.name.toLowerCase().includes(q));
    if (hit) {
      setDest(hit);
      setRoute(null);
      flash('VECTOR ACQUIRED: ' + hit.name.toUpperCase());
      speak('Vector ' + hit.name + ' acquired.');
    } else {
      flash('NO MATCH — SAVE IT AS A WAYPOINT');
      speak('No waypoint found.');
    }
  };

  const startVoice = () => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) { flash('VOICE INPUT UNSUPPORTED'); return; }
    try {
      const rec = new Rec();
      rec.lang = 'en-US';
      speak('System listening.');
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        setQuery(text);
        setTimeout(() => { document.getElementById('vw-scan-btn')?.click(); }, 300);
      };
      rec.onerror = () => flash('VOICE ERROR');
      rec.start();
    } catch { flash('VOICE ERROR'); }
  };

  const saveWaypoint = () => {
    const name = wpName.trim() || query.trim();
    if (!pos) { flash('NEED POSITION FIX FIRST'); return; }
    if (!name) { flash('NAME THE WAYPOINT FIRST'); return; }
    const wp = { id: uid(), name, lat: pos.lat, lon: pos.lon };
    setWaypoints((w) => [...w, wp]);
    setWpName('');
    flash('WAYPOINT SAVED: ' + name.toUpperCase());
  };

  const lockRoute = (wp) => {
    if (!pos) { flash('NEED POSITION FIX FIRST'); return; }
    setDest(wp);
    setRoute({ to: wp });
    const km = haversineKm(pos, wp);
    const b = bearingDeg(pos, wp);
    flash('ROUTE LOCKED · ' + km.toFixed(2) + ' KM ' + compass(b));
    speak('Route locked. ' + km.toFixed(1) + ' kilometers ' + compass(b) + '.');
  };

  const clearRoute = () => { setRoute(null); setDest(null); flash('ROUTE CLEARED'); };
  const deleteWp = (id) => {
    setWaypoints((w) => w.filter((x) => x.id !== id));
    if (dest && dest.id === id) { setDest(null); setRoute(null); }
  };

  const readout = () => {
    if (!pos) return ['LAT —', 'LON —', 'SAT FIX: NONE'];
    const lines = [
      'LAT ' + pos.lat.toFixed(5),
      'LON ' + pos.lon.toFixed(5),
      'SAT FIX: LIVE',
    ];
    if (route && route.to) {
      const km = haversineKm(pos, route.to);
      const b = bearingDeg(pos, route.to);
      lines.push('DEST ' + route.to.name.toUpperCase().slice(0, 18));
      lines.push('DIST ' + km.toFixed(2) + ' KM · ' + b.toFixed(0) + '° ' + compass(b));
    }
    return lines;
  };

  return (
    <>
    <main className="vw-root">
      <style>{CSS}</style>
      <div className="vw-scan" aria-hidden="true" />

      <header className="vw-head">
        <h1>[ARTEMIS] SYSTEM_CORE_v3</h1>
        <div className="vw-status" aria-live="polite">{status}</div>
      </header>

      <div className="vw-dash">
        <div className="vw-search">
          <input id="vw-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') scanVault(); }}
            placeholder="ENTER VECTOR…" aria-label="Search waypoints" />
          <button className="vw-btn pink" onClick={startVoice} aria-label="Voice input" title="Voice input"><MicIcon size={17} /></button>
          <button id="vw-scan-btn" className="vw-btn" onClick={scanVault}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><RadarIcon size={15} />Scan</span></button>
        </div>
        <button className="vw-btn wide" onClick={startGPS}>
          {gpsOn ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SatelliteIcon size={16} />Disengage GPS</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SatelliteIcon size={16} />Engage GPS / Position Lock</span>)}
        </button>
      </div>

      <div className="vw-mapwrap">
        <canvas ref={canvasRef} aria-label="Tactical radar display" />
        <div className="vw-readout" aria-live="polite">
          {readout().map((l, i) => <div key={i}>{l}</div>)}
          {route && <button className="vw-btn pink" style={{ marginTop: 8 }} onClick={clearRoute}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><EraseIcon size={14} />Clear route</span></button>}
        </div>
        <aside className="vw-vault" aria-label="Waypoint vault">
          <h3>WAYPOINT VAULT</h3>
          {waypoints.length === 0 && <p className="vw-empty">Empty. Lock GPS, name a spot, save it.</p>}
          {waypoints.map((wp) => (
            <div className="vw-wp" key={wp.id}>
              <span>{wp.name.toUpperCase().slice(0, 16)}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => lockRoute(wp)}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RouteIcon size={13} />Route</span></button>
                <button className="vw-del" onClick={() => deleteWp(wp.id)} aria-label={'Delete ' + wp.name}>✕</button>
              </span>
            </div>
          ))}
          <div className="vw-addbar">
            <input value={wpName} onChange={(e) => setWpName(e.target.value)}
              placeholder="Waypoint name…" aria-label="Waypoint name" maxLength={30} />
            <button className="vw-btn" onClick={saveWaypoint}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PinIcon size={14} />Save</span></button>
          </div>
          <p className="vw-empty" style={{ marginTop: 8 }}>
            Offline console — waypoints live on this device only. No maps leave the browser.
          </p>
        </aside>
      </div>

      {toast && <div className="vw-toast" role="status">{toast}</div>}
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed console viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
