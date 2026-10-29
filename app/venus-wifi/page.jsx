'use client';

import { useEffect, useRef, useState } from 'react';
import { MicIcon, RadarIcon, SatelliteIcon, EraseIcon, RouteIcon, PinIcon } from '@/lib/hermes-icons';
import { supabase } from '@/lib/supabase';
import { fetchDevicePrefs, LOCATION_ENABLED_KEY } from '@/lib/device-prefs';
import {
  haversineKm,
  bearingDeg,
  compassPoint,
  formatDistance,
  isSpotLive,
  withDistances,
  spotsWithinRadius,
  snapshotCanonicalString,
  snapshotIsStale,
  SNAPSHOT_KEY,
  DEFAULT_RADIUS_KM,
} from '@/lib/venus-wifi/spots';

const CSS = `
.vw-root { min-height: 100dvh; display: flex; flex-direction: column; background: #0a0a14; color: #fff;
  font-family: 'Courier New', Courier, monospace; position: relative;
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
.vw-btn.small { min-height: 36px; padding: 6px 8px; font-size: 0.7rem; min-width: 0; }
.vw-banner { z-index: 61; display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 10px 14px; font-size: 0.8rem; background: rgba(57,255,20,0.12); color: #b6ffb0;
  border-bottom: 1px solid rgba(57,255,20,0.5); }
.vw-banner.update { background: rgba(0,242,255,0.1); color: #aef7ff; border-bottom-color: rgba(0,242,255,0.5); }
.vw-mapwrap { position: relative; flex: none; height: 46dvh; min-height: 300px; background: #050510; }
.vw-mapwrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.vw-readout { position: absolute; left: 10px; bottom: 10px; z-index: 62; background: rgba(7,7,15,0.85);
  border: 1px solid rgba(0,243,255,0.5); padding: 10px 12px; font-size: 0.78rem; color: #00f2ff;
  line-height: 1.7; max-width: 72vw; }
.vw-panel { padding: 12px 14px calc(12px + env(safe-area-inset-bottom)); background: #0d0d1c; z-index: 61;
  display: flex; flex-direction: column; gap: 16px; }
.vw-panel h3 { margin: 0 0 8px; font-size: 0.75rem; letter-spacing: 2px; color: #00f2ff; }
.vw-wp { display: flex; justify-content: space-between; align-items: center; gap: 6px;
  border: 1px solid rgba(0,243,255,0.25); padding: 8px; margin-bottom: 6px; font-size: 0.75rem; }
.vw-wp button { background: none; border: 1px solid #00f2ff; color: #00f2ff; font-family: inherit;
  font-size: 0.7rem; padding: 6px 8px; cursor: pointer; min-height: 36px; }
.vw-wp button:hover { background: rgba(0,243,255,0.15); }
.vw-wp .vw-del { border-color: #ff0055; color: #ff0055; }
.vw-spot { border: 1px solid rgba(0,243,255,0.25); padding: 8px; margin-bottom: 6px; font-size: 0.78rem; }
.vw-spot .vw-spot-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.vw-spot .vw-dist { color: #39ff14; font-weight: 700; white-space: nowrap; }
.vw-spot .vw-note { color: #9fd8e8; margin-top: 2px; }
.vw-spot .vw-meta { color: #888; font-size: 0.68rem; margin-top: 2px; }
.vw-spot .vw-actions { display: flex; gap: 6px; margin-top: 6px; }
.vw-empty { color: #666; font-size: 0.75rem; }
.vw-addbar { display: flex; gap: 8px; margin-top: 4px; }
.vw-addbar input { flex: 1; background: #07070f; border: 1px solid rgba(0,243,255,0.4); color: #fff;
  padding: 10px; font-family: inherit; font-size: 0.8rem; min-width: 0; }
.vw-form { display: flex; flex-direction: column; gap: 8px; }
.vw-form input[type="text"] { background: #07070f; border: 1px solid rgba(0,243,255,0.4); color: #fff;
  padding: 10px; font-family: inherit; font-size: 0.85rem; min-width: 0; }
.vw-check { display: flex; gap: 8px; align-items: flex-start; font-size: 0.78rem; color: #cfe; cursor: pointer; }
.vw-check input { margin-top: 2px; width: 18px; height: 18px; accent-color: #00f2ff; flex: none; }
.vw-guide { border: 2px solid #ff0055; background: rgba(10,10,26,0.97); padding: 18px 14px;
  text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.vw-guide .vw-arrow { font-size: 6rem; line-height: 1; color: #ff0055; transition: transform 0.25s linear;
  text-shadow: 0 0 24px rgba(255,0,85,0.6); }
.vw-guide .vw-gdist { font-size: 2.2rem; font-weight: 700; color: #fff; }
.vw-guide .vw-gname { color: #00f2ff; letter-spacing: 1px; }
.vw-guide .vw-gbear { color: #9fd8e8; font-size: 0.9rem; }
.vw-toast { position: fixed; bottom: calc(5rem + 16px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 70;
  background: rgba(0,243,255,0.92); color: #000; font-weight: 700; padding: 10px 18px;
  font-size: 0.8rem; white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
`;

function uid() {
  return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

// The page's own points use { lat, lon } (the console's original shape);
// the shared lib uses { lat, lng }. These adapters bridge the two.
const toLngPt = (p) => ({ lat: p.lat, lng: p.lng ?? p.lon });
const havKm = (a, b) => haversineKm(toLngPt(a), toLngPt(b));
const bearDeg = (a, b) => bearingDeg(toLngPt(a), toLngPt(b));

function agoText(iso) {
  const t = new Date(iso || 0).getTime();
  if (!t) return 'unknown';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : months + ' months ago';
}

async function sha256Hex(text) {
  if (!window.crypto?.subtle) return null;
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Verify a downloaded snapshot against its own checksum. The stored copy
// is only ever replaced by a payload that passes — a corrupt or partial
// download must never wipe a good list.
async function verifySnapshot(payload) {
  if (!payload || !Array.isArray(payload.spots) || !payload.version || !payload.checksum) return false;
  const digest = await sha256Hex(snapshotCanonicalString(payload));
  if (digest === null) return false; // cannot verify -> do not replace
  return digest === payload.checksum;
}

export default function VenusWifiPage() {
  const canvasRef = useRef(null);
  const watchId = useRef(null);
  const hadFixRef = useRef(false);
  const [status, setStatus] = useState('READY');
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState(null);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsDenied, setGpsDenied] = useState(false);
  const [waypoints, setWaypoints] = useState([]);
  const [dest, setDest] = useState(null);
  const [route, setRoute] = useState(null);
  const [wpName, setWpName] = useState('');
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);

  // Collective map state
  const [snapshot, setSnapshot] = useState(null); // stored offline copy
  const [liveSpots, setLiveSpots] = useState([]); // fresh radius reads (carry ids)
  const [pendingUpdate, setPendingUpdate] = useState(null); // fetched + verified, awaiting tap
  const [guide, setGuide] = useState(null); // { name, lat, lng }
  const [heading, setHeading] = useState(null); // device compass heading, degrees
  const [logSsid, setLogSsid] = useState('');
  const [logNote, setLogNote] = useState('');
  const [logFree, setLogFree] = useState(false);
  const [logging, setLogging] = useState(false);

  // Merged collective spots, deduped: live rows (with ids) win over the
  // snapshot's copies of the same network.
  const spotKey = (s) => (s.id ? 'id:' + s.id : 'k:' + String(s.ssid).toLowerCase() + '|' + Number(s.lat).toFixed(4) + '|' + Number(s.lng).toFixed(4));
  const allSpots = (() => {
    const seen = new Map();
    for (const s of liveSpots) seen.set(spotKey(s), s);
    for (const s of (snapshot?.spots || [])) {
      if (!isSpotLive(s)) continue; // aged out while sitting on the device
      if (!seen.has(spotKey(s))) seen.set(spotKey(s), s);
    }
    return [...seen.values()];
  })();

  const stateRef = useRef({ pos, waypoints, dest, route, spots: [], guide });
  stateRef.current = { pos, waypoints, dest, route, spots: allSpots, guide };

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

  const authToken = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch { return null; }
  };

  // ----- offline snapshot: check, download, apply -----
  const applySnapshot = (payload) => {
    const stored = {
      version: payload.version,
      generatedAt: payload.generatedAt,
      checksum: payload.checksum,
      spots: payload.spots,
      savedAt: new Date().toISOString(),
    };
    try { window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(stored)); } catch { /* storage full/blocked */ }
    setSnapshot(stored);
    setPendingUpdate(null);
    return stored;
  };

  const fetchSnapshot = async () => {
    const res = await fetch('/api/venus-wifi/snapshot', { cache: 'no-store' });
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload?.ok) return null;
    return payload;
  };

  // A check never replaces anything by itself — it offers the update.
  const checkForUpdate = async (quiet) => {
    try {
      const payload = await fetchSnapshot();
      if (!payload) { if (!quiet) flash('UPDATE CHECK FAILED — STILL OFFLINE-SAFE'); return; }
      const okChecksum = await verifySnapshot(payload);
      if (!okChecksum) { if (!quiet) flash('UPDATE FAILED ITS CHECKSUM — YOUR LIST IS UNTOUCHED'); return; }
      setSnapshot((current) => {
        if (!current || current.version !== payload.version) {
          setPendingUpdate(payload);
          if (!quiet) flash('A NEWER WIFI LIST IS AVAILABLE');
          return current;
        }
        // Same list: re-validate the stored copy's age so the monthly
        // prompt does not nag when everything is already current.
        const refreshed = { ...current, savedAt: new Date().toISOString() };
        try { window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(refreshed)); } catch { /* ignore */ }
        if (!quiet) flash('YOUR WIFI LIST IS UP TO DATE');
        return refreshed;
      });
    } catch { if (!quiet) flash('UPDATE CHECK FAILED — STILL OFFLINE-SAFE'); }
  };

  const downloadList = async () => {
    flash('DOWNLOADING WIFI LIST…');
    try {
      const payload = pendingUpdate || (await fetchSnapshot());
      if (!payload) { flash('DOWNLOAD FAILED — NO CONNECTION?'); return; }
      const okChecksum = await verifySnapshot(payload);
      if (!okChecksum) { flash('DOWNLOAD FAILED ITS CHECKSUM — YOUR OLD LIST IS KEPT'); return; }
      const stored = applySnapshot(payload);
      flash('WIFI LIST SAVED · ' + stored.spots.length + ' SPOTS · WORKS OFFLINE');
      speak('WiFi list saved. ' + stored.spots.length + ' spots, works offline.');
    } catch { flash('DOWNLOAD FAILED — YOUR OLD LIST IS KEPT'); }
  };

  // ----- live radius read (online only; offline the snapshot carries us) -----
  const fetchNearby = async (p) => {
    if (!p || !navigator.onLine) return;
    try {
      const res = await fetch('/api/venus-wifi/spots?lat=' + p.lat + '&lng=' + p.lng + '&radiusKm=' + DEFAULT_RADIUS_KM, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok && Array.isArray(data.spots)) setLiveSpots(data.spots);
    } catch { /* offline or not connected yet — snapshot carries us */ }
  };

  // Load saved waypoints + the offline snapshot from this device
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('venus-waypoints');
      if (raw) setWaypoints(JSON.parse(raw));
    } catch { /* fresh vault */ }
    let stored = null;
    try {
      const rawSnap = window.localStorage.getItem(SNAPSHOT_KEY);
      if (rawSnap) { stored = JSON.parse(rawSnap); setSnapshot(stored); }
    } catch { /* no snapshot yet */ }
    setReady(true);
    // Monthly refresh: if the stored list is over a month old (or there
    // is none), quietly check for a newer one whenever we are online.
    if (navigator.onLine && (!stored || snapshotIsStale(stored.savedAt))) {
      checkForUpdate(true);
    }
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Device compass heading while guiding (permission asked on GUIDE tap)
  useEffect(() => {
    if (!guide) return undefined;
    const onOrient = (e) => {
      if (typeof e.webkitCompassHeading === 'number') setHeading(e.webkitCompassHeading);
      else if (typeof e.alpha === 'number' && e.absolute) setHeading((360 - e.alpha) % 360);
    };
    window.addEventListener('deviceorientation', onOrient, true);
    return () => window.removeEventListener('deviceorientation', onOrient, true);
  }, [guide]);

  // Procedural radar map — fully local, no tile servers. Plots the user's
  // own waypoints and the collective free-WiFi spots from the same fix.
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
      const { pos: p, waypoints: wps, dest: d, route: r, spots, guide: g } = stateRef.current;
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
      // collective free-WiFi spots (diamonds)
      for (const s of spots || []) {
        const pt = { lat: s.lat, lon: s.lng };
        const [x, y] = project(pt, center, scale);
        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
        const isGuide = g && g.name === s.ssid && Math.abs(g.lat - s.lat) < 1e-9 && Math.abs(g.lng - s.lng) < 1e-9;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isGuide ? '#ff0055' : 'rgba(57,255,20,0.9)';
        const sz = isGuide ? 8 : 5;
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();
        ctx.fillStyle = isGuide ? '#ff0055' : '#b6ffb0';
        ctx.font = '11px Courier New, monospace';
        ctx.fillText(String(s.ssid).toUpperCase().slice(0, 14), x + 12, y + 4);
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

  const startGPS = async () => {
    if (!navigator.geolocation) { flash('GPS UNSUPPORTED'); return; }
    if (gpsOn) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      hadFixRef.current = false;
      setGpsOn(false);
      setPos(null);
      flash('GPS DISENGAGED');
      return;
    }
    // The onboarding location toggle is the master switch (Merlin, 2026-10-29).
    const prefs = await fetchDevicePrefs(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
      } catch { return null; }
    });
    if (!prefs[LOCATION_ENABLED_KEY]) {
      flash('LOCATION IS OFF — TURN IT ON IN DEVICE CONTROLS');
      speak('Location is turned off. Turn it on in Device Controls to log spots.');
      return;
    }
    flash('ACQUIRING FIX…');
    speak('GPS link requested.');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lon: p.coords.longitude };
        if (!hadFixRef.current) {
          hadFixRef.current = true;
          fetchNearby({ lat: fix.lat, lng: fix.lon });
        }
        setPos(fix);
        setGpsOn(true);
        setGpsDenied(false);
        flash('POSITION LOCK');
      },
      (err) => {
        if (err && err.code === 1) { setGpsDenied(true); flash('LOCATION DECLINED'); }
        else flash('FIX FAILED');
        speak('Position fix failed.');
      },
      { enableHighAccuracy: true }
    );
  };

  // ----- guidance -----
  const startGuide = async (target) => {
    // iOS asks for compass permission from a user gesture — this tap is it.
    try {
      if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
        await window.DeviceOrientationEvent.requestPermission();
      }
    } catch { /* compass stays text-only; bearing still shown */ }
    setGuide(target);
    if (!gpsOn) flash('ENGAGE GPS TO START GUIDANCE');
    else flash('GUIDING TO ' + String(target.name).toUpperCase());
    speak('Guiding to ' + target.name + '.');
  };

  const scanVault = () => {
    const q = query.trim().toLowerCase();
    if (!q) { flash('ENTER A VECTOR FIRST'); return; }
    const spotHit = allSpots.find((s) => String(s.ssid).toLowerCase().includes(q));
    if (spotHit) {
      startGuide({ name: spotHit.ssid, lat: spotHit.lat, lng: spotHit.lng });
      return;
    }
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

  // ----- contribute: log a free open network at this position -----
  const logSpot = async () => {
    if (!pos) { flash('NEED POSITION FIX FIRST'); return; }
    if (!logSsid.trim()) { flash('NAME THE NETWORK FIRST'); return; }
    if (!logFree) { flash('CONFIRM IT IS FREE + OPEN FIRST'); return; }
    if (!navigator.onLine) { flash('NO CONNECTION — SPOTS ARE SHARED WHEN YOU ARE BACK ONLINE'); return; }
    const token = await authToken();
    if (!token) { flash('SIGN IN TO ADD TO THE MAP'); return; }
    setLogging(true);
    try {
      const res = await fetch('/api/venus-wifi/spots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          ssid: logSsid.trim(),
          lat: pos.lat,
          lng: pos.lon,
          openFree: true,
          note: logNote.trim() || undefined,
          source: 'manual',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        flash(data.merged ? 'ALREADY MAPPED — YOUR CONFIRMATION COUNTS' : 'SPOT ADDED TO THE MAP — THANK YOU');
        speak(data.merged ? 'Already mapped. Your confirmation counts.' : 'Spot added to the map.');
        setLogSsid('');
        setLogNote('');
        setLogFree(false);
        fetchNearby({ lat: pos.lat, lng: pos.lon });
      } else if (res.status === 503) {
        flash('THE MAP IS NOT CONNECTED YET — TRY AGAIN SOON');
      } else {
        flash((data?.error || 'COULD NOT SAVE THAT SPOT').toUpperCase());
      }
    } catch { flash('COULD NOT SAVE THAT SPOT'); }
    setLogging(false);
  };

  // ----- "still here" confirm -----
  const confirmSpot = async (spot) => {
    if (!spot.id) { flash('DOWNLOAD THE LATEST LIST TO CONFIRM SPOTS'); return; }
    if (!navigator.onLine) { flash('NO CONNECTION — CONFIRM WHEN YOU ARE BACK ONLINE'); return; }
    const token = await authToken();
    if (!token) { flash('SIGN IN TO CONFIRM A SPOT'); return; }
    try {
      const res = await fetch('/api/venus-wifi/spots/' + spot.id + '/confirm', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        flash('CONFIRMED — STILL HERE');
        speak('Confirmed. Still here.');
        setLiveSpots((rows) => rows.map((r) => (r.id === spot.id ? { ...r, ...data.spot } : r)));
      } else {
        flash((data?.error || 'COULD NOT CONFIRM THAT SPOT').toUpperCase());
      }
    } catch { flash('COULD NOT CONFIRM THAT SPOT'); }
  };

  // ----- personal waypoints (this device only) -----
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
    const km = havKm(pos, wp);
    const b = bearDeg(pos, wp);
    flash('ROUTE LOCKED · ' + km.toFixed(2) + ' KM ' + compassPoint(b));
    speak('Route locked. ' + km.toFixed(1) + ' kilometers ' + compassPoint(b) + '.');
  };

  const clearRoute = () => { setRoute(null); setDest(null); flash('ROUTE CLEARED'); };
  const deleteWp = (id) => {
    setWaypoints((w) => w.filter((x) => x.id !== id));
    if (dest && dest.id === id) { setDest(null); setRoute(null); }
  };

  // ----- derived display data -----
  const origin = pos ? { lat: pos.lat, lng: pos.lon } : null;
  const nearSpots = origin
    ? spotsWithinRadius(allSpots, origin, DEFAULT_RADIUS_KM)
    : withDistances(allSpots, null).sort((a, b) => String(a.ssid).localeCompare(String(b.ssid)));
  const nearest = origin && nearSpots.length ? nearSpots[0] : null;
  const showProximity = nearest && nearest.distanceKm <= 0.25 && !(guide && guide.name === nearest.ssid);

  const guideData = (() => {
    if (!guide) return null;
    if (!origin) return { ...guide, distanceKm: null, bearing: null, rel: null };
    const distanceKm = havKm(origin, guide);
    const bearing = bearDeg(origin, guide);
    const rel = heading != null ? (bearing - heading + 360) % 360 : bearing;
    return { ...guide, distanceKm, bearing, rel };
  })();

  const readout = () => {
    if (!pos) return ['LAT —', 'LON —', 'SAT FIX: NONE'];
    const lines = [
      'LAT ' + pos.lat.toFixed(5),
      'LON ' + pos.lon.toFixed(5),
      'SAT FIX: LIVE',
    ];
    if (guideData && guideData.distanceKm != null) {
      lines.push('GUIDE ' + String(guideData.name).toUpperCase().slice(0, 18));
      lines.push('DIST ' + formatDistance(guideData.distanceKm) + ' · ' + guideData.bearing.toFixed(0) + '° ' + compassPoint(guideData.bearing));
    } else if (route && route.to) {
      const km = havKm(pos, route.to);
      const b = bearDeg(pos, route.to);
      lines.push('DEST ' + route.to.name.toUpperCase().slice(0, 18));
      lines.push('DIST ' + km.toFixed(2) + ' KM · ' + b.toFixed(0) + '° ' + compassPoint(b));
    } else if (nearest) {
      lines.push('NEAREST WIFI ' + String(nearest.ssid).toUpperCase().slice(0, 14));
      lines.push('DIST ' + formatDistance(nearest.distanceKm));
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
            placeholder="ENTER VECTOR…" aria-label="Search waypoints and WiFi spots" />
          <button className="vw-btn pink" onClick={startVoice} aria-label="Voice input" title="Voice input"><MicIcon size={17} /></button>
          <button id="vw-scan-btn" className="vw-btn" onClick={scanVault}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><RadarIcon size={15} />Scan</span></button>
        </div>
        <button className="vw-btn wide" onClick={startGPS}>
          {gpsOn ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SatelliteIcon size={16} />Disengage GPS</span>) : (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SatelliteIcon size={16} />Engage GPS / Position Lock</span>)}
        </button>
      </div>

      {pendingUpdate && (
        <div className="vw-banner update" role="status">
          <span>A newer WiFi list is available ({pendingUpdate.spots.length} spots).</span>
          <button className="vw-btn small" onClick={downloadList}>Download update</button>
        </div>
      )}
      {!pendingUpdate && snapshot && snapshotIsStale(snapshot.savedAt) && (
        <div className="vw-banner update" role="status">
          <span>Your offline WiFi list is over a month old.</span>
          <button className="vw-btn small" onClick={() => checkForUpdate(false)}>Check for update</button>
        </div>
      )}
      {showProximity && (
        <div className="vw-banner" role="status">
          <span>FREE WIFI NEARBY — {String(nearest.ssid).toUpperCase()} · {formatDistance(nearest.distanceKm)}</span>
          <button className="vw-btn small" onClick={() => startGuide({ name: nearest.ssid, lat: nearest.lat, lng: nearest.lng })}>Guide</button>
        </div>
      )}

      <div className="vw-mapwrap">
        <canvas ref={canvasRef} aria-label="Tactical radar display" />
        <div className="vw-readout" aria-live="polite">
          {readout().map((l, i) => <div key={i}>{l}</div>)}
          {route && <button className="vw-btn pink" style={{ marginTop: 8 }} onClick={clearRoute}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><EraseIcon size={14} />Clear route</span></button>}
        </div>
      </div>

      {guide && guideData && (
        <section className="vw-guide" aria-label={'Guidance to ' + guideData.name}>
          <button className="vw-btn pink small" style={{ alignSelf: 'flex-end' }} onClick={() => setGuide(null)}>Close guidance</button>
          <div className="vw-gname">{String(guideData.name).toUpperCase()}</div>
          {guideData.distanceKm != null ? (
            <>
              <div className="vw-arrow" style={{ transform: 'rotate(' + guideData.rel.toFixed(0) + 'deg)' }} aria-hidden="true">▲</div>
              <div className="vw-gdist">{formatDistance(guideData.distanceKm)}</div>
              <div className="vw-gbear">
                Bearing {guideData.bearing.toFixed(0)}° {compassPoint(guideData.bearing)}
                {heading == null ? ' — arrow points from north; face the bearing, or allow compass access for a live arrow.' : ' — arrow turns with you.'}
              </div>
            </>
          ) : (
            <div className="vw-gbear">Engage GPS above to see live distance and bearing to this spot. It is on your downloaded list, so this works with no connection.</div>
          )}
        </section>
      )}

      <div className="vw-panel">
        <section aria-label="Free WiFi near you">
          <h3>FREE WIFI NEAR YOU</h3>
          <p className="vw-empty" style={{ margin: '0 0 8px' }}>
            {snapshot
              ? 'Offline list on this device: ' + snapshot.spots.length + ' spots · saved ' + new Date(snapshot.savedAt).toLocaleDateString() + ' · a fresh copy is offered about once a month. Viewing it never needs a connection.'
              : 'No offline list on this device yet. Download it once and this page — spots, distances, guidance — works with no connection at all.'}
          </p>
          <button className="vw-btn wide" onClick={downloadList} style={{ marginBottom: 10 }}>
            {snapshot ? 'Download the latest WiFi list' : 'Download the WiFi list'}
          </button>
          {nearSpots.length === 0 && (
            <p className="vw-empty">
              {origin
                ? 'No free WiFi mapped within ' + DEFAULT_RADIUS_KM + ' km yet. Be the first to log one below.'
                : 'Engage GPS to see the spots around you, nearest first — or download the list and browse it offline.'}
            </p>
          )}
          {nearSpots.map((s) => (
            <div className="vw-spot" key={spotKey(s)}>
              <div className="vw-spot-top">
                <span>{String(s.ssid).toUpperCase().slice(0, 26)}</span>
                <span className="vw-dist">{s.distanceKm != null ? formatDistance(s.distanceKm) : '—'}</span>
              </div>
              {s.note ? <div className="vw-note">{s.note}</div> : null}
              <div className="vw-meta">
                Last confirmed {agoText(s.lastConfirmed)} · confirmed {s.confirmations ?? 1}×{s.id ? '' : ' · from your downloaded list'}
              </div>
              <div className="vw-actions">
                <button className="vw-btn small" onClick={() => startGuide({ name: s.ssid, lat: s.lat, lng: s.lng })}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RouteIcon size={13} />Guide</span>
                </button>
                {s.id ? (
                  <button className="vw-btn small" onClick={() => confirmSpot(s)}>Still here ✓</button>
                ) : null}
              </div>
            </div>
          ))}
          <p className="vw-empty" style={{ marginTop: 8 }}>
            Spots nobody has confirmed for 12 months drop off the map. Nearby alerts appear while this page is open — a web page can't watch in the background.
          </p>
        </section>

        <section aria-label="Log a free WiFi spot">
          <h3>LOG FREE WIFI HERE</h3>
          <p className="vw-empty" style={{ margin: '0 0 8px' }}>
            Standing on a free, open network? Log it and everyone can find it when they're out of data.
            Your location is only taken when you log a spot, and only to place that network on the map — who logged it is never shown.
          </p>
          {gpsDenied ? (
            <p className="vw-empty">Location is off, so new spots can't be placed right now. You can still browse the downloaded list and navigate to spots.</p>
          ) : (
            <div className="vw-form">
              <input type="text" value={logSsid} onChange={(e) => setLogSsid(e.target.value)}
                placeholder="Network name (SSID) — exactly as it appears on your phone" aria-label="Network name" maxLength={64} />
              <input type="text" value={logNote} onChange={(e) => setLogNote(e.target.value)}
                placeholder="Note (optional) — e.g. library lobby, no password" aria-label="Spot note" maxLength={280} />
              <label className="vw-check">
                <input type="checkbox" checked={logFree} onChange={(e) => setLogFree(e.target.checked)} />
                <span>This network is free and needs no password.</span>
              </label>
              <button className="vw-btn wide" onClick={logSpot} disabled={logging || !pos}>
                {pos ? (logging ? 'Logging…' : 'Log this spot for everyone') : 'Engage GPS first — a spot needs its position'}
              </button>
            </div>
          )}
        </section>

        <section aria-label="Waypoint vault">
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
            Offline list — your own waypoints live on this device only. The shared WiFi map above is downloaded to this device too, so it works with no connection.
          </p>
        </section>
      </div>

      {toast && <div className="vw-toast" role="status">{toast}</div>}
    </main>
    {/* Safari bottom-bar clearance: blank space under the console */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
