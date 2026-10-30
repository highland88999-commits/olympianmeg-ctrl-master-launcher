'use client';

// THE FLYING DUTCHMAN — 3D naval world.
//
// Crew the Dutchman across a real storm ocean: trim your sails to the
// wind, work the helm, fire full broadsides, sink ghost ships and claim
// their souls to grow your crew. Solo against the damned fleet, or duel
// another captain live over Supabase Realtime.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  makeWorld, spawnWave, stepWorld, makeShip,
  fireBroadside, stepBalls, stepSouls, stepWind, stepShip,
  SHIP, SAILS, reloadTime, waveHeight, clamp, wrapAngle,
} from './engine.js';
import { buildShip, buildGhostShip, animateShip } from './ship3d.js';
import {
  createOcean, createSky, poseShip,
  createBallPool, createFlashPool, createSplashPool, createSoulPool,
} from './sea3d.js';
import {
  createDuelRoom, joinDuelRoom, getCaptainId, DuelSync,
  getRoom, setRoomStatus, ROOM_STATUS,
} from './pvp-sync.js';
import { supabase } from '@/lib/supabase';

const BEST_KEY = 'dutchman-best';
const SAIL_ORDER = [SAILS.FULL, SAILS.BATTLE, SAILS.FURLED];
const SAIL_LABEL = { [SAILS.FULL]: 'FULL SAIL', [SAILS.BATTLE]: 'BATTLE SAIL', [SAILS.FURLED]: 'FURLED' };

function getBest() {
  try { return Number(window.localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Menu / waiting / game-over screens
// ---------------------------------------------------------------------------

function MenuScreen({ best, joinCode, setJoinCode, onSolo, onCreate, onJoin, duelError }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#020608]/95 px-6 text-center">
      <p className="text-[11px] tracking-[0.5em] text-emerald-300/70">THE CURSED SEA</p>
      <h1 className="text-4xl font-black tracking-wide text-emerald-100" style={{ textShadow: '0 0 24px rgba(0,255,160,0.45)' }}>
        THE FLYING<br />DUTCHMAN
      </h1>
      <p className="max-w-sm text-sm text-zinc-400">
        Crew the Dutchman. Sail the storm. Sink ghost ships with your broadsides
        and claim their souls to man your guns.
      </p>
      {best > 0 && <p className="text-xs text-amber-300/80">BEST VOYAGE — {best} SOULS</p>}
      <button
        type="button" onClick={onSolo}
        className="w-64 rounded-xl bg-emerald-500/90 py-4 text-base font-black tracking-[0.2em] text-black hover:bg-emerald-400"
      >
        ⚓ SOLO VOYAGE
      </button>
      <div className="mt-2 flex w-64 flex-col gap-2 border-t border-zinc-800 pt-4">
        <p className="text-[11px] tracking-[0.3em] text-zinc-500">DUEL ANOTHER CAPTAIN</p>
        <button
          type="button" onClick={onCreate}
          className="rounded-xl border border-red-400/60 bg-red-950/40 py-3 text-sm font-black tracking-[0.2em] text-red-200 hover:bg-red-900/50"
        >
          ⚔ CREATE DUEL
        </button>
        <div className="flex gap-2">
          <input
            value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="CODE" aria-label="Duel code"
            className="w-24 rounded-lg border border-zinc-700 bg-black/60 px-3 py-3 text-center text-lg font-black tracking-[0.3em] text-zinc-100"
          />
          <button
            type="button" onClick={onJoin}
            className="flex-1 rounded-xl border border-zinc-600 bg-zinc-800/60 py-3 text-sm font-black tracking-[0.2em] text-zinc-100 hover:bg-zinc-700/60"
          >
            JOIN
          </button>
        </div>
        {duelError && <p className="text-xs text-red-300">{duelError}</p>}
      </div>
      <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-zinc-600">
        Helm with the left stick · trim sails for the wind · broadsides with PORT / STBD.
        Running before the wind is fastest — never sail straight into it.
      </p>
    </div>
  );
}

function WaitingScreen({ code, note, onCancel }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#020608]/95 px-6 text-center">
      <p className="text-[11px] tracking-[0.5em] text-red-300/70">DUEL LOBBY</p>
      <p className="text-sm text-zinc-400">Give this code to the rival captain:</p>
      <p className="rounded-xl border border-red-400/40 bg-black/60 px-8 py-4 text-4xl font-black tracking-[0.5em] text-red-100">
        {code}
      </p>
      <p className="text-sm text-zinc-500">{note || 'Waiting for the rival to board…'}</p>
      <button
        type="button" onClick={onCancel}
        className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300"
      >
        ABANDON DUEL
      </button>
    </div>
  );
}

function GameOverScreen({ over, onAgain, onMenu }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
      <p className="text-5xl">{over.won ? '👑' : '☠'}</p>
      <h2 className="text-3xl font-black text-zinc-100">{over.title}</h2>
      <p className="max-w-xs text-sm text-zinc-400">{over.subtitle}</p>
      <div className="flex gap-6 text-center">
        <div><p className="text-2xl font-black text-emerald-300">{over.souls}</p><p className="text-[10px] tracking-widest text-zinc-500">SOULS</p></div>
        <div><p className="text-2xl font-black text-red-300">{over.sunk}</p><p className="text-[10px] tracking-widest text-zinc-500">SHIPS SUNK</p></div>
        {over.wave > 0 && <div><p className="text-2xl font-black text-amber-300">{over.wave}</p><p className="text-[10px] tracking-widest text-zinc-500">WAVE</p></div>}
      </div>
      {over.best && <p className="text-xs text-amber-300/80">NEW BEST VOYAGE</p>}
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={onAgain} className="rounded-xl bg-emerald-500/90 px-6 py-3 text-sm font-black tracking-widest text-black">
          SAIL AGAIN
        </button>
        <button type="button" onClick={onMenu} className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300">
          MENU
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DutchmanPage() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const pollRef = useRef(null);

  const [screen, setScreen] = useState('menu'); // menu | waiting | game
  const [mode, setMode] = useState('solo');
  const [hud, setHud] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [gameOver, setGameOver] = useState(null);
  const [duelCode, setDuelCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [duelError, setDuelError] = useState('');
  const [waitingNote, setWaitingNote] = useState('');
  const [paused, setPaused] = useState(false);
  const [webglFail, setWebglFail] = useState(false);
  const [best, setBest] = useState(0);

  useEffect(() => { setBest(getBest()); }, []);

  function addToast(text) {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }

  function disposeGroup(grp) {
    grp.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }

  // -- duel lobby ------------------------------------------------------------
  async function doCreate() {
    setDuelError('');
    setWaitingNote('Raising the black flag…');
    try {
      const id = await getCaptainId();
      const room = await createDuelRoom(id);
      const code = room.room_code;
      setDuelCode(code);
      setScreen('waiting');
      setWaitingNote('Waiting for the rival to board…');
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const r = await getRoom(supabase, code);
          const ids = (r && r.player_ids) || [];
          if (ids.length >= 2) {
            clearInterval(pollRef.current); pollRef.current = null;
            await setRoomStatus(supabase, code, ROOM_STATUS.PLAYING);
            startDuelGame(code, true);
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch {
      setDuelError('Could not create a duel room. Check your connection.');
    }
  }

  async function doJoin(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (clean.length !== 6) { setDuelError('Enter the 6-character duel code.'); return; }
    setDuelError('');
    setDuelCode(clean);
    setScreen('waiting');
    setWaitingNote('Boarding the rival’s ship…');
    try {
      const id = await getCaptainId();
      const { error } = await joinDuelRoom(clean, id);
      if (error) { setScreen('menu'); setDuelError(error); return; }
      await setRoomStatus(supabase, clean, ROOM_STATUS.PLAYING);
      startDuelGame(clean, false);
    } catch {
      setScreen('menu');
      setDuelError('Could not join. Check the code and your connection.');
    }
  }

  function cancelWaiting() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setScreen('menu');
    setWaitingNote('');
  }

  // Invite accepts land here with ?code=XXXXXX.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const c = (q.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (c.length === 6) {
        setJoinCode(c);
        doJoin(c);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- game boot ---------------------------------------------------------------
  function startSolo() {
    const world = makeWorld(Date.now() % 1000000);
    spawnWave(world, 1);
    bootGame('solo', world, {});
    setMode('solo');
    setScreen('game');
  }

  async function startDuelGame(code, isHost) {
    const world = makeWorld((Date.now() % 1000000) + (isHost ? 11 : 22));
    const p = world.player;
    if (isHost) { p.x = -80; p.z = 0; p.heading = Math.PI / 2; }
    else { p.x = 80; p.z = 0; p.heading = -Math.PI / 2; }
    const remote = makeShip({ name: 'Rival Captain', crew: 8 });
    remote.x = isHost ? 80 : -80;
    remote.z = 0;
    remote.heading = isHost ? -Math.PI / 2 : Math.PI / 2;

    setWaitingNote('Linking ships…');
    const sync = new DuelSync(code, p.id);
    const { available, error } = await sync.connect({
      onState: (s) => {
        const G = gameRef.current;
        if (G && G.remote) G.remote.target = s;
      },
      onFire: (side) => {
        const G = gameRef.current;
        if (!G || G.over || G.mode !== 'duel') return;
        const rship = G.remote;
        rship.reloadPort = 0; rship.reloadStbd = 0;
        const r = fireBroadside(rship, side === 'port' ? 'port' : 'stbd', G.world.t);
        if (r.fired) {
          G.world.balls.push(...r.balls);
          G.handleEvents([{ type: 'fire', shipId: rship.id, side }]);
        }
      },
      onSunk: () => {
        const G = gameRef.current;
        if (G && !G.over) G.endDuel(true);
      },
    });
    if (!available) {
      sync.disconnect();
      setScreen('menu');
      setDuelError(`Live link failed (${error || 'no signal'}). Duels need a live connection — try a solo voyage.`);
      return;
    }
    bootGame('duel', world, { sync, remote, isHost });
    setMode('duel');
    setScreen('game');
    addToast(isHost ? '⚔ The rival has boarded. Sink them.' : '⚔ Duel! Sink the Dutchman.');
  }

  function bootGame(gameMode, world, extra) {
    // Tear down any previous game first.
    teardown();
    const mount = mountRef.current;
    if (!mount) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setWebglFail(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x06121c, 120, 900);
    const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 0.5, 6000);

    const ocean = createOcean();
    scene.add(ocean.mesh);
    const sky = createSky();
    scene.add(sky.group);

    const playerGroup = buildShip();
    playerGroup.userData.setCrew(Math.min(world.player.crew, 12));
    scene.add(playerGroup);

    const G = {
      mode: gameMode,
      world,
      renderer, scene, camera, ocean, sky,
      playerGroup,
      enemyGroups: new Map(),
      remote: extra.remote || null,
      remoteGroup: null,
      sync: extra.sync || null,
      isHost: !!extra.isHost,
      pools: {
        balls: createBallPool(scene),
        flash: createFlashPool(scene),
        splash: createSplashPool(scene),
        souls: createSoulPool(scene),
      },
      input: { rudder: 0, joy: 0, keys: { left: false, right: false }, sails: SAILS.FULL, fire: null },
      cam: { yaw: 0, pitch: 0.34, dist: 36 },
      acc: 0,
      raf: 0,
      last: performance.now(),
      lastHud: -1,
      lastSent: -1,
      sunkCount: 0,
      paused: false,
      over: false,
      disposed: false,
      crewShown: -1,
      sailsShown: '',
      tmpV: new THREE.Vector3(),
    };
    if (G.remote) {
      G.remoteGroup = buildGhostShip();
      G.remoteGroup.userData.setCrew(Math.min(G.remote.crew, 12));
      scene.add(G.remoteGroup);
    }

    // -- events ----------------------------------------------------------------
    G.handleEvents = (events) => {
      for (const e of events) {
        if (e.type === 'fire') {
          const grp = e.shipId === world.player.id ? G.playerGroup
            : e.shipId === (G.remote && G.remote.id) ? G.remoteGroup
            : G.enemyGroups.get(e.shipId);
          if (grp) {
            for (let i = 0; i < SHIP.cannonsPerSide; i++) {
              grp.userData.muzzle(e.side, i, G.tmpV);
              G.pools.flash.fire(G.tmpV.x, G.tmpV.y, G.tmpV.z);
            }
          }
          if (G.sync && e.shipId === world.player.id) G.sync.sendFire(e.side);
        } else if (e.type === 'splash') {
          G.pools.splash.splash(e.x, e.z, world.t, false);
        } else if (e.type === 'hit') {
          G.pools.splash.splash(e.x, e.z, world.t, true);
        } else if (e.type === 'sunk') {
          G.pools.splash.splash(e.x, e.z, world.t, true);
          if (e.shipId === world.player.id) {
            if (G.mode === 'duel') {
              if (G.sync) G.sync.sendSunk();
              G.endDuel(false);
            } else {
              addToast('☠ The Dutchman went down with all hands…');
            }
          } else {
            G.sunkCount += 1;
            addToast(`☠ ${e.name || 'Enemy ship'} sunk — claim their souls!`);
            if (G.mode === 'duel') G.endDuel(true);
          }
        }
      }
    };

    G.endDuel = (won) => {
      if (G.over) return;
      G.over = true;
      const p = world.player;
      if (won) {
        p.souls += 5;
        p.crew = Math.min(SHIP.maxCrew, p.crew + 3);
        addToast('👑 Rival sunk! Their souls join your crew.');
      }
      const souls = p.souls;
      const prevBest = getBest();
      const isBest = souls > prevBest;
      if (isBest) { try { window.localStorage.setItem(BEST_KEY, String(souls)); } catch {} setBest(souls); }
      setGameOver({
        won,
        title: won ? 'RIVAL SUNK' : 'SUNK',
        subtitle: won
          ? 'The rival captain feeds the deep. Their crew sails with you now.'
          : 'The Dutchman is claimed by the sea — but a cursed ship never truly dies.',
        souls, sunk: G.sunkCount + (won ? 1 : 0), wave: 0, best: isBest,
      });
    };

    // -- fixed-step simulation ---------------------------------------------------
    function stepOnce(step) {
      const input = G.input;
      const rudder = input.joy !== 0 ? input.joy : (input.keys.right ? 1 : 0) - (input.keys.left ? 1 : 0);
      const fire = input.fire;
      input.fire = null;
      if (G.mode === 'solo') {
        const events = stepWorld(world, { rudder, sails: input.sails, fire }, step);
        G.handleEvents(events);
      } else {
        stepDuel(step, rudder, fire);
      }
    }

    function stepDuel(step, rudder, fire) {
      const remote = G.remote;
      world.t += step;
      const ev = world.events;
      stepWind(world.wind, step);
      const p = world.player;
      p.rudder = clamp(rudder, -1, 1);
      p.sails = G.input.sails;
      stepShip(p, step, world.wind);
      if (fire && p.alive) {
        const r = fireBroadside(p, fire, world.t);
        if (r.fired) {
          world.balls.push(...r.balls);
          ev.push({ type: 'fire', shipId: p.id, side: fire });
        }
      }
      // Ease the rival toward the last broadcast snapshot.
      if (remote.target) {
        const k = 1 - Math.exp(-step * 5);
        remote.x += (remote.target.x - remote.x) * k;
        remote.z += (remote.target.z - remote.z) * k;
        remote.heading = wrapAngle(remote.heading + wrapAngle(remote.target.heading - remote.heading) * k);
        remote.speed = remote.target.speed || 0;
        remote.hull = remote.target.hull != null ? remote.target.hull : remote.hull;
        remote.crew = remote.target.crew != null ? remote.target.crew : remote.crew;
        if (remote.target.sails) remote.sails = remote.target.sails;
      }
      remote.reloadPort = Math.max(0, remote.reloadPort - step);
      remote.reloadStbd = Math.max(0, remote.reloadStbd - step);
      if (!remote.alive && remote.sinking) remote.sinkT += step;
      stepBalls(world.balls, [p, remote], world.souls, step, world.t, ev, world.rng);
      stepSouls(world.souls, [p, remote], step, world.t, ev);
      const out = ev.slice();
      ev.length = 0;
      G.handleEvents(out);
    }

    // -- per-frame render ----------------------------------------------------------
    function frame(now) {
      if (G.disposed) return;
      G.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - G.last) / 1000);
      G.last = now;

      if (!G.paused && !G.over) {
        G.acc += dt;
        const step = 1 / 60;
        let n = 0;
        while (G.acc >= step && n < 4) { G.acc -= step; n += 1; stepOnce(step); }
        if (n === 4) G.acc = 0;
      }

      const t = world.t;
      const p = world.player;

      // Ships on the waves.
      poseShip(G.playerGroup, p, t);
      animateShip(G.playerGroup, t, dt);
      if (p.crew !== G.crewShown) {
        G.playerGroup.userData.setCrew(Math.min(p.crew, 12));
        G.crewShown = p.crew;
      }
      if (p.sails !== G.sailsShown) {
        G.playerGroup.userData.setSails(p.sails);
        G.sailsShown = p.sails;
      }

      if (G.mode === 'solo') {
        // Enemy groups follow world.enemies.
        const seen = new Set();
        for (const e of world.enemies) {
          seen.add(e.id);
          let grp = G.enemyGroups.get(e.id);
          if (!grp) {
            grp = buildGhostShip();
            grp.userData.setCrew(Math.min(e.crew, 8));
            grp.userData.setSails(e.sails);
            scene.add(grp);
            G.enemyGroups.set(e.id, grp);
          }
          poseShip(grp, e, t);
          animateShip(grp, t, dt);
          if (e.sails !== grp.userData._sailsShown) {
            grp.userData.setSails(e.sails);
            grp.userData._sailsShown = e.sails;
          }
        }
        for (const [id, grp] of G.enemyGroups) {
          if (!seen.has(id)) {
            scene.remove(grp);
            disposeGroup(grp);
            G.enemyGroups.delete(id);
          }
        }
        // Solo game over once the wreck settles.
        if (!p.alive && p.sinkT > 5 && !G.over) {
          G.over = true;
          const souls = p.souls;
          const prevBest = getBest();
          const isBest = souls > prevBest;
          if (isBest) { try { window.localStorage.setItem(BEST_KEY, String(souls)); } catch {} setBest(souls); }
          setGameOver({
            won: false,
            title: 'CLAIMED BY THE SEA',
            subtitle: 'The Dutchman went down with all hands — but a cursed ship never truly dies.',
            souls, sunk: G.sunkCount, wave: world.wave, best: isBest,
          });
        }
      } else if (G.remote) {
        poseShip(G.remoteGroup, G.remote, t);
        animateShip(G.remoteGroup, t, dt);
        if (G.remote.crew !== G.remoteGroup.userData._crewShown) {
          G.remoteGroup.userData.setCrew(Math.min(G.remote.crew, 12));
          G.remoteGroup.userData._crewShown = G.remote.crew;
        }
        if (G.remote.sails !== G.remoteGroup.userData._sailsShown) {
          G.remoteGroup.userData.setSails(G.remote.sails);
          G.remoteGroup.userData._sailsShown = G.remote.sails;
        }
        if (G.sync && t - G.lastSent > 0.125) {
          G.lastSent = t;
          G.sync.sendState({
            x: p.x, z: p.z, heading: p.heading, speed: p.speed,
            hull: Math.round(p.hull), crew: p.crew, sails: p.sails,
          });
        }
      }

      // Effects.
      G.pools.balls.sync(world.balls, t);
      G.pools.souls.sync(world.souls, t);
      G.pools.flash.update(dt);
      G.pools.splash.update(dt);
      G.ocean.update(t, p.x, p.z);
      G.sky.update(t, dt, p.x, p.z);

      // Chase camera with orbit offsets.
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const yaw = p.heading + Math.PI + G.cam.yaw;
      const back = G.cam.dist * Math.cos(G.cam.pitch);
      const wh = waveHeight(p.x, p.z, t);
      camera.position.set(
        p.x + Math.sin(yaw) * back,
        wh + 9 + Math.sin(G.cam.pitch) * G.cam.dist,
        p.z + Math.cos(yaw) * back
      );
      camera.lookAt(p.x + fx * 10, wh + 3, p.z + fz * 10);

      // HUD snapshot, throttled.
      if (t - G.lastHud > 0.2) {
        G.lastHud = t;
        const rt = reloadTime(p);
        setHud({
          hull: Math.max(0, Math.round(p.hull)), maxHull: p.maxHull,
          crew: p.crew, souls: p.souls, wave: world.wave,
          windRel: wrapAngle(world.wind.dir - p.heading),
          windStr: world.wind.strength,
          speed: Math.abs(p.speed),
          sails: p.sails,
          reloadPort: p.reloadPort <= 0 ? 1 : 1 - p.reloadPort / rt,
          reloadStbd: p.reloadStbd <= 0 ? 1 : 1 - p.reloadStbd / rt,
          enemies: G.mode === 'solo' ? world.enemies.filter((e) => e.alive).length : 1,
          enemyHull: G.mode === 'duel' && G.remote ? Math.max(0, Math.round(G.remote.hull)) : null,
        });
      }

      renderer.render(scene, camera);
    }

    // -- canvas orbit / zoom ---------------------------------------------------------
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    const pointers = new Map();
    let pinchD = 0;
    el.addEventListener('pointerdown', (ev) => {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { el.setPointerCapture(ev.pointerId); } catch {}
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (ev) => {
      const prev = pointers.get(ev.pointerId);
      if (!prev) return;
      const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) G.cam.dist = clamp(G.cam.dist - (d - pinchD) * 0.08, 20, 70);
        pinchD = d;
      } else {
        G.cam.yaw -= dx * 0.005;
        G.cam.pitch = clamp(G.cam.pitch + dy * 0.003, 0.08, 1.1);
      }
    });
    const upPointer = (ev) => { pointers.delete(ev.pointerId); pinchD = 0; };
    el.addEventListener('pointerup', upPointer);
    el.addEventListener('pointercancel', upPointer);
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      G.cam.dist = clamp(G.cam.dist + ev.deltaY * 0.02, 20, 70);
    }, { passive: false });

    // -- keyboard ----------------------------------------------------------------------
    const onKey = (down) => (ev) => {
      if (ev.key === 'ArrowLeft') G.input.keys.left = down;
      else if (ev.key === 'ArrowRight') G.input.keys.right = down;
      else if (down && (ev.key === 'q' || ev.key === 'Q')) G.input.fire = 'port';
      else if (down && (ev.key === 'e' || ev.key === 'E')) G.input.fire = 'stbd';
      else if (down && ev.key === '1') G.input.sails = SAILS.FULL;
      else if (down && ev.key === '2') G.input.sails = SAILS.BATTLE;
      else if (down && ev.key === '3') G.input.sails = SAILS.FURLED;
      if (['ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault();
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const onResize = () => {
      const w2 = mount.clientWidth, h2 = mount.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener('resize', onResize);

    G.cleanup = () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', onResize);
    };

    gameRef.current = G;
    setHud(null);
    setGameOver(null);
    setPaused(false);
    G.raf = requestAnimationFrame(frame);
  }

  function teardown() {
    const G = gameRef.current;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!G) return;
    gameRef.current = null;
    G.disposed = true;
    cancelAnimationFrame(G.raf);
    if (G.cleanup) G.cleanup();
    if (G.sync) G.sync.disconnect();
    try {
      disposeGroup(G.playerGroup);
      for (const [, grp] of G.enemyGroups) disposeGroup(grp);
      if (G.remoteGroup) disposeGroup(G.remoteGroup);
      G.renderer.dispose();
      if (G.renderer.domElement.parentNode) G.renderer.domElement.parentNode.removeChild(G.renderer.domElement);
    } catch { /* teardown is best-effort */ }
  }

  function quitToMenu() {
    teardown();
    setGameOver(null);
    setHud(null);
    setScreen('menu');
    setPaused(false);
  }

  function sailAgain() {
    const m = mode;
    teardown();
    setGameOver(null);
    if (m === 'solo') startSolo();
    else setScreen('menu');
  }

  useEffect(() => () => { teardown(); if (pollRef.current) clearInterval(pollRef.current); }, []);

  // -- controls --------------------------------------------------------------------------
  function cycleSails() {
    const G = gameRef.current;
    if (!G) return;
    const i = SAIL_ORDER.indexOf(G.input.sails);
    G.input.sails = SAIL_ORDER[(i + 1) % SAIL_ORDER.length];
  }

  function fire(side) {
    const G = gameRef.current;
    if (G && !G.paused && !G.over) G.input.fire = side;
  }

  function togglePause() {
    const G = gameRef.current;
    if (!G || G.over) return;
    G.paused = !G.paused;
    setPaused(G.paused);
  }

  // Joystick (helm).
  const joyRef = useRef(null);
  const joyState = useRef({ id: null, dx: 0 });
  const [, setJoyTick] = useState(0);
  function joyStart(e) {
    joyState.current = { id: e.pointerId, dx: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function joyMove(e) {
    const s = joyState.current;
    if (s.id !== e.pointerId || !joyRef.current) return;
    const rect = joyRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    s.dx = clamp(dx / (rect.width / 2), -1, 1);
    const G = gameRef.current;
    if (G) G.input.joy = s.dx;
    setJoyTick((n) => n + 1);
  }
  function joyEnd(e) {
    if (joyState.current.id !== e.pointerId) return;
    joyState.current = { id: null, dx: 0 };
    const G = gameRef.current;
    if (G) G.input.joy = 0;
    setJoyTick((n) => n + 1);
  }

  const windDeg = hud ? (hud.windRel * 180) / Math.PI : 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#020608] text-zinc-100 select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {webglFail && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 px-6 text-center">
          <p className="text-sm text-zinc-400">This voyage needs WebGL, which your browser could not start.</p>
        </div>
      )}

      {screen === 'menu' && (
        <MenuScreen
          best={best} joinCode={joinCode} setJoinCode={setJoinCode}
          onSolo={startSolo} onCreate={doCreate} onJoin={() => doJoin(joinCode)}
          duelError={duelError}
        />
      )}

      {screen === 'waiting' && (
        <WaitingScreen code={duelCode} note={waitingNote} onCancel={cancelWaiting} />
      )}

      {screen === 'game' && hud && (
        <>
          {/* HUD top-left: hull, crew, souls */}
          <div className="absolute left-3 top-3 z-10 w-44 rounded-xl border border-zinc-800 bg-black/55 p-2 backdrop-blur">
            <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest text-zinc-400">
              <span>HULL</span><span>{hud.hull}/{hud.maxHull}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${hud.hull > 50 ? 'bg-emerald-400' : hud.hull > 25 ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${(hud.hull / hud.maxHull) * 100}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-zinc-300">
              <span>👻 {hud.crew} crew</span>
              <span>💀 {hud.souls} souls</span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <div>
                <p className="text-[9px] tracking-widest text-zinc-500">PORT</p>
                <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${hud.reloadPort * 100}%` }} /></div>
              </div>
              <div>
                <p className="text-[9px] tracking-widest text-zinc-500">STBD</p>
                <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-sky-400" style={{ width: `${hud.reloadStbd * 100}%` }} /></div>
              </div>
            </div>
            {hud.enemyHull != null && (
              <div className="mt-1.5">
                <p className="text-[9px] tracking-widest text-red-300/80">RIVAL HULL {hud.enemyHull}</p>
                <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full bg-red-500" style={{ width: `${hud.enemyHull}%` }} /></div>
              </div>
            )}
          </div>

          {/* top-center: wave / duel + toasts */}
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 text-center">
            <p className="rounded-full border border-zinc-800 bg-black/55 px-4 py-1 text-[11px] font-black tracking-[0.3em] text-amber-200/90 backdrop-blur">
              {mode === 'solo' ? (hud.wave > 0 ? `WAVE ${hud.wave}` : 'THE CURSED SEA') : '⚔ DUEL'}
            </p>
            <div className="mt-2 flex flex-col items-center gap-1">
              {toasts.map((t) => (
                <p key={t.id} className="rounded-full bg-black/70 px-3 py-1 text-xs text-emerald-200 backdrop-blur">{t.text}</p>
              ))}
            </div>
          </div>

          {/* pause */}
          <button
            type="button" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}
            className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-black/55 text-lg backdrop-blur"
          >
            {paused ? '▶' : '❚❚'}
          </button>

          {/* helm joystick */}
          <div className="absolute bottom-6 left-4 z-10">
            <div
              ref={joyRef}
              onPointerDown={joyStart} onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd}
              className="relative h-28 w-28 rounded-full border border-zinc-700 bg-black/45 backdrop-blur"
              style={{ touchAction: 'none' }} aria-label="Helm"
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-emerald-500/70"
                style={{ transform: `translate(calc(-50% + ${joyState.current.dx * 32}px), -50%)` }}
              />
              <p className="absolute -bottom-5 w-full text-center text-[9px] tracking-[0.3em] text-zinc-500">HELM</p>
            </div>
          </div>

          {/* sails + wind compass */}
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700 bg-black/55 backdrop-blur" aria-label="Wind compass">
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="23" fill="none" stroke="#3f3f46" strokeWidth="1.5" />
                <text x="26" y="10" textAnchor="middle" fill="#71717a" fontSize="8">N</text>
                <g transform={`rotate(${windDeg} 26 26)`}>
                  <line x1="26" y1="26" x2="26" y2="8" stroke="#34d399" strokeWidth="2.5" />
                  <polygon points="26,4 22.5,10 29.5,10" fill="#34d399" />
                </g>
                <polygon points="26,20 22,32 30,32" fill="#e4e4e7" />
                <text x="26" y="46" textAnchor="middle" fill="#52525b" fontSize="7">WIND</text>
              </svg>
            </div>
            <button
              type="button" onClick={cycleSails}
              className="rounded-xl border border-amber-400/50 bg-black/55 px-4 py-2.5 text-xs font-black tracking-[0.2em] text-amber-200 backdrop-blur"
            >
              ⛵ {hud ? SAIL_LABEL[hud.sails] : ''}
            </button>
            <p className="text-[10px] text-zinc-500">{hud ? `${Math.round(hud.speed)} kn` : ''}</p>
          </div>

          {/* cannons */}
          <div className="absolute bottom-6 right-4 z-10 flex flex-col gap-2">
            <button
              type="button" onPointerDown={() => fire('port')}
              className="h-16 w-24 rounded-xl border border-sky-400/60 bg-sky-950/60 text-sm font-black tracking-widest text-sky-200 active:bg-sky-800/70"
              style={{ touchAction: 'none' }}
            >
              ◀ PORT
            </button>
            <button
              type="button" onPointerDown={() => fire('stbd')}
              className="h-16 w-24 rounded-xl border border-sky-400/60 bg-sky-950/60 text-sm font-black tracking-widest text-sky-200 active:bg-sky-800/70"
              style={{ touchAction: 'none' }}
            >
              STBD ▶
            </button>
          </div>

          {/* pause overlay */}
          {paused && !gameOver && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70">
              <h2 className="text-2xl font-black tracking-widest text-zinc-100">BECALMED</h2>
              <button type="button" onClick={togglePause} className="w-52 rounded-xl bg-emerald-500/90 py-3 text-sm font-black tracking-widest text-black">
                RESUME
              </button>
              <button type="button" onClick={quitToMenu} className="w-52 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-300">
                ABANDON SHIP
              </button>
            </div>
          )}
        </>
      )}

      {screen === 'game' && gameOver && (
        <GameOverScreen over={gameOver} onAgain={sailAgain} onMenu={quitToMenu} />
      )}
    </div>
  );
}
