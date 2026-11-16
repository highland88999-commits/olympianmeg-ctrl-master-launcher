'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AresBackdrop, AresButton, AresIcon, AresPanel, ARES } from '@/components/ares/ares-chrome';
import { recordSoulArrival } from '../../lib/land-of-the-dead/souls.js';
import {
  circleHit,
  clamp,
  approach,
  HIT,
  laserDamage,
  enemyHP,
  killsToAdvance,
  enemySpawnChance,
  asteroidSpawnChance,
  enemyFireChance,
  enemyFallSpeed,
  asteroidFallSpeed,
  powerupDurationFrames,
  powerupDef,
  randomPowerupType,
  initialState,
  resolvePlayerHit,
  absorbHit,
  advanceLevel,
  KILL_SCORE,
  playfieldBounds,
} from './zeus-engine';

const HIGH_SCORE_KEY = 'zeus_highscore_v1';

function loadHighScore() {
  try {
    return parseInt(window.localStorage.getItem(HIGH_SCORE_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(v) {
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

// Deterministic PRNG for decorative blobs (continents, asteroid shapes).
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function ZeusProtocolPage() {
  const canvasRef = useRef(null);
  const [screen, setScreen] = useState('menu'); // menu | playing | gameover | paused
  const [hud, setHud] = useState({ score: 0, level: 1, lives: 5, powerup: null, highScore: 0 });
  const gameRef = useRef(null);

  // ---------------------------------------------------------------
  // Boot the game engine once.
  // ---------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const G = {
      state: initialState(),
      playing: false,
      paused: false,
      frame: 0,
      targetX: 0,
      keys: {},
      lasers: [],
      missiles: [],
      enemyLasers: [],
      enemies: [],
      asteroids: [],
      powerups: [],
      mines: [],
      particles: [],
      stars: [],
      blobs: [], // earth continents
      bounds: playfieldBounds(1, 1),
      w: 0,
      h: 0,
      unit: 1,
      hudTimer: 0,
    };
    G.state.highScore = loadHighScore();
    gameRef.current = G;

    const resize = () => {
      G.w = canvas.clientWidth || window.innerWidth;
      G.h = canvas.clientHeight || window.innerHeight;
      canvas.width = G.w;
      canvas.height = G.h;
      G.bounds = playfieldBounds(G.w, G.h);
      G.unit = clamp(Math.min(G.w, G.h) / 620, 0.72, 1.15);
      G.targetX = clamp(G.targetX || G.w / 2, G.bounds.minX, G.bounds.maxX);
      const rng = mulberry(20260927);
      G.stars = Array.from({ length: reduceMotion ? 90 : 170 }, () => ({
        x: rng() * G.w,
        y: rng() * G.h,
        s: 0.5 + rng() * 1.6,
        v: (0.15 + rng() * 0.6) * (reduceMotion ? 0.4 : 1),
      }));
      G.blobs = Array.from({ length: 14 }, () => ({
        a: rng() * Math.PI * 2,
        r: 0.25 + rng() * 0.55,
        s: 0.06 + rng() * 0.13,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    // -------------------------------------------------------------
    // Input
    // -------------------------------------------------------------
    const pointTo = (clientX) => {
      G.targetX = clamp(clientX, G.bounds.minX, G.bounds.maxX);
    };
    const onPointerDown = (e) => pointTo(e.clientX);
    const onPointerMove = (e) => {
      if (e.pointerType === 'mouse' || e.buttons > 0) pointTo(e.clientX);
    };
    const onTouchMove = (e) => {
      if (e.touches[0]) pointTo(e.touches[0].clientX);
    };
    const onKeyDown = (e) => {
      G.keys[e.key] = true;
      if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e) => {
      G.keys[e.key] = false;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const pushHud = () => {
      setHud({
        score: G.state.score,
        level: G.state.level,
        lives: G.state.lives,
        powerup: G.state.activePowerup ? powerupDef(G.state.activePowerup).label : null,
        highScore: G.state.highScore,
      });
    };
    G.pushHud = pushHud;

    // -------------------------------------------------------------
    // Spawning
    // -------------------------------------------------------------
    const spawnEnemy = () => {
      const u = G.unit;
      G.enemies.push({
        x: G.bounds.minX + Math.random() * (G.bounds.maxX - G.bounds.minX),
        y: G.bounds.spawnY,
        hp: enemyHP(G.state.level),
        sway: Math.random() * Math.PI * 2,
        swayAmp: (10 + Math.random() * 22) * u,
        swaySpeed: 0.008 + Math.random() * 0.02,
      });
    };

    const spawnAsteroid = () => {
      const u = G.unit;
      const rng = Math.random;
      const r = (14 + rng() * 22) * u;
      const verts = [];
      const n = 7 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        verts.push(0.75 + rng() * 0.45);
      }
      G.asteroids.push({
        x: G.bounds.minX + rng() * (G.bounds.maxX - G.bounds.minX),
        y: G.bounds.spawnY,
        r,
        rot: rng() * Math.PI * 2,
        rotSpeed: (rng() - 0.5) * 0.04,
        speed: asteroidFallSpeed(G.state.level) * u,
        verts,
      });
    };

    const spawnPowerup = (x, y) => {
      G.powerups.push({ x, y, type: randomPowerupType(Math.random), spin: 0 });
    };

    const dropMine = () => {
      G.mines.push({
        x: G.bounds.minX + Math.random() * (G.bounds.maxX - G.bounds.minX),
        y: G.h * 0.15 + Math.random() * G.h * 0.45,
        pulse: 0,
      });
    };

    const explode = (x, y, color, count) => {
      const n = reduceMotion ? Math.ceil(count / 2) : count;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 3.2;
        G.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: 0.015 + Math.random() * 0.02,
          color,
          size: 1 + Math.random() * 3,
        });
      }
    };

    const firePlayer = () => {
      const u = G.unit;
      const px = G.playerX;
      const py = G.bounds.playerY;
      const p = G.state.activePowerup;
      if (p === 'missile') {
        G.missiles.push({ x: px - 8 * u, y: py, vx: 0 });
        G.missiles.push({ x: px + 8 * u, y: py, vx: 0 });
      } else if (p === 'burst') {
        G.lasers.push({ x: px, y: py, vx: 0, color: '#ff00ff' });
        G.lasers.push({ x: px, y: py, vx: -1.6, color: '#ff00ff' });
        G.lasers.push({ x: px, y: py, vx: 1.6, color: '#ff00ff' });
      } else {
        G.lasers.push({ x: px, y: py, vx: 0, color: '#00f2ff' });
      }
    };

    const fireEnemy = (e) => {
      G.enemyLasers.push({ x: e.x, y: e.y + 14 * G.unit });
    };

    const clearEntities = () => {
      G.enemies = [];
      G.lasers = [];
      G.missiles = [];
      G.enemyLasers = [];
      G.asteroids = [];
      G.powerups = [];
      G.mines = [];
    };

    // -------------------------------------------------------------
    // Damage resolution
    // -------------------------------------------------------------
    const hurtPlayer = (sx, sy) => {
      const res = resolvePlayerHit(G.state);
      if (res === 'immune') return;
      if (res === 'absorbed') {
        absorbHit(G.state);
        explode(sx, sy, '#00f2ff', 26);
        pushHud();
        return;
      }
      explode(sx, sy, '#ff5500', 60);
      explode(sx, sy, '#ffffff', 20);
      if (res === 'gameover') {
        G.playing = false;
        // The Land of the Dead (Merlin, Nov 16 ~04:17): the player's
        // ship going down arrives there too — additive only, the
        // high-score save below is untouched. G.playing = false stops
        // the step loop, so this fires once per game over.
        recordSoulArrival({ kind: 'user', origin: 'zeus-protocol', diedAt: Date.now() });
        if (G.state.score > G.state.highScore) {
          G.state.highScore = G.state.score;
          saveHighScore(G.state.highScore);
        }
        pushHud();
        setScreen('gameover');
      } else {
        G.playerX = G.w / 2;
        G.targetX = G.w / 2;
        pushHud();
      }
    };

    const killEnemy = (idx) => {
      const e = G.enemies[idx];
      explode(e.x, e.y, '#ff5500', 34);
      explode(e.x, e.y, '#ff2222', 16);
      G.enemies.splice(idx, 1);
      G.state.score += KILL_SCORE;
      G.state.kills += 1;
      // The Land of the Dead (Merlin, Nov 16 ~04:17): every enemy
      // kill arrives there too — additive only, the score/kills above
      // are untouched. killEnemy is the single choke point (lasers,
      // missiles and mines all resolve deaths here), so this fires
      // once per kill. The invaders are unnamed in code, so no name
      // is passed — the module falls back to 'Fallen monster'.
      recordSoulArrival({ kind: 'monster', origin: 'zeus-protocol', diedAt: Date.now() });
      if (Math.random() < 0.1) spawnPowerup(e.x, e.y);
      if (G.state.kills >= killsToAdvance(G.state.level)) {
        advanceLevel(G.state);
        clearEntities();
        explode(G.w / 2, G.h * 0.4, '#ffd700', 70);
      }
      pushHud();
    };

    // -------------------------------------------------------------
    // Update
    // -------------------------------------------------------------
    const update = () => {
      const u = G.unit;
      G.frame += 1;
      const st = G.state;

      // stars always drift
      for (const s of G.stars) {
        s.y += s.v;
        if (s.y > G.h) {
          s.y = -4;
          s.x = Math.random() * G.w;
        }
      }

      if (!G.playing) {
        updateParticles();
        return;
      }

      // keyboard steering
      if (G.keys.ArrowLeft) G.targetX = clamp(G.targetX - 7 * u, G.bounds.minX, G.bounds.maxX);
      if (G.keys.ArrowRight) G.targetX = clamp(G.targetX + 7 * u, G.bounds.minX, G.bounds.maxX);
      G.playerX = approach(G.playerX ?? G.w / 2, G.targetX, 0.14);

      if (st.immunityTimer > 0) st.immunityTimer -= 1;
      if (st.powerupTimer > 0) {
        st.powerupTimer -= 1;
        if (st.powerupTimer <= 0) {
          st.activePowerup = null;
          pushHud();
        }
      }

      if (G.frame % 10 === 0) firePlayer();
      if (Math.random() < enemySpawnChance(st.level)) spawnEnemy();
      if (Math.random() < asteroidSpawnChance(st.level)) spawnAsteroid();

      const px = G.playerX;
      const py = G.bounds.playerY;

      // lasers
      for (let i = G.lasers.length - 1; i >= 0; i--) {
        const l = G.lasers[i];
        l.y -= 11 * u;
        l.x += l.vx * u;
        if (l.y < -20) {
          G.lasers.splice(i, 1);
        }
      }

      // homing missiles
      for (let i = G.missiles.length - 1; i >= 0; i--) {
        const m = G.missiles[i];
        if (G.enemies.length > 0) {
          const t = G.enemies[0];
          m.x += (t.x - m.x) * 0.06;
          m.y += (t.y - m.y) * 0.06 - 1.2 * u;
        } else {
          m.y -= 8 * u;
        }
        if (m.y < -20) G.missiles.splice(i, 1);
      }

      // enemy lasers
      for (let i = G.enemyLasers.length - 1; i >= 0; i--) {
        const el = G.enemyLasers[i];
        el.y += 5.5 * u;
        if (circleHit(el.x, el.y, HIT.laser * u, px, py, HIT.player * u)) {
          hurtPlayer(px, py);
          G.enemyLasers.splice(i, 1);
        } else if (el.y > G.h + 20) {
          G.enemyLasers.splice(i, 1);
        }
      }

      // enemies
      for (let i = G.enemies.length - 1; i >= 0; i--) {
        const e = G.enemies[i];
        e.sway += e.swaySpeed;
        e.y += enemyFallSpeed(st.level) * u;
        e.x += Math.cos(e.sway) * 0.7 * u;
        if (Math.random() < enemyFireChance(st.level)) fireEnemy(e);

        // hit by player projectiles
        let dead = false;
        for (let j = G.lasers.length - 1; j >= 0; j--) {
          const l = G.lasers[j];
          if (circleHit(l.x, l.y, HIT.laser * u, e.x, e.y, HIT.enemy * u)) {
            G.lasers.splice(j, 1);
            e.hp -= laserDamage;
            explode(l.x, l.y, '#ffffff', 6);
            if (e.hp <= 0) {
              killEnemy(i);
              dead = true;
            }
            break;
          }
        }
        if (dead) continue;
        for (let j = G.missiles.length - 1; j >= 0; j--) {
          const m = G.missiles[j];
          if (circleHit(m.x, m.y, HIT.laser * u, e.x, e.y, HIT.enemy * u)) {
            G.missiles.splice(j, 1);
            e.hp -= laserDamage;
            if (e.hp <= 0) {
              killEnemy(i);
              dead = true;
            }
            break;
          }
        }
        if (dead) continue;

        // mines
        for (let k = G.mines.length - 1; k >= 0; k--) {
          const mn = G.mines[k];
          if (circleHit(mn.x, mn.y, HIT.mineTrigger * u, e.x, e.y, HIT.enemy * u)) {
            explode(mn.x, mn.y, '#ffff00', 46);
            G.mines.splice(k, 1);
            killEnemy(i);
            dead = true;
            break;
          }
        }
        if (dead) continue;

        // ram the player
        if (circleHit(e.x, e.y, HIT.enemy * u, px, py, HIT.player * u)) {
          explode(e.x, e.y, '#ff5500', 30);
          G.enemies.splice(i, 1);
          hurtPlayer(px, py);
        } else if (e.y > G.bounds.killY) {
          G.enemies.splice(i, 1);
        }
      }

      // asteroids
      for (let i = G.asteroids.length - 1; i >= 0; i--) {
        const a = G.asteroids[i];
        a.y += a.speed;
        a.rot += a.rotSpeed;

        // mines smash asteroids too
        let gone = false;
        for (let k = G.mines.length - 1; k >= 0; k--) {
          const mn = G.mines[k];
          if (circleHit(mn.x, mn.y, HIT.mineTrigger * u, a.x, a.y, a.r)) {
            explode(mn.x, mn.y, '#ffff00', 40);
            explode(a.x, a.y, '#ffaa00', 30);
            G.mines.splice(k, 1);
            G.asteroids.splice(i, 1);
            G.state.score += 25;
            gone = true;
            break;
          }
        }
        if (gone) continue;

        if (circleHit(a.x, a.y, a.r * 0.85, px, py, HIT.player * u)) {
          explode(a.x, a.y, '#ffaa00', 34);
          G.asteroids.splice(i, 1);
          hurtPlayer(px, py);
        } else if (a.y > G.bounds.killY) {
          G.asteroids.splice(i, 1);
        }
      }

      // powerups
      for (let i = G.powerups.length - 1; i >= 0; i--) {
        const p = G.powerups[i];
        p.y += 1.6 * u;
        p.spin += 0.08;
        if (circleHit(p.x, p.y, HIT.powerup * u, px, py, HIT.player * u)) {
          if (p.type === 'mine') {
            dropMine();
          } else {
            st.activePowerup = p.type;
            st.powerupTimer = powerupDurationFrames(Math.random);
          }
          explode(p.x, p.y, powerupDef(p.type).color, 18);
          G.powerups.splice(i, 1);
          pushHud();
        } else if (p.y > G.bounds.killY) {
          G.powerups.splice(i, 1);
        }
      }

      for (const mn of G.mines) mn.pulse += 0.06;

      updateParticles();

      G.hudTimer += 1;
      if (G.hudTimer % 20 === 0) pushHud();
    };

    const updateParticles = () => {
      for (let i = G.particles.length - 1; i >= 0; i--) {
        const p = G.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.life -= p.decay;
        if (p.life <= 0) G.particles.splice(i, 1);
      }
    };

    // -------------------------------------------------------------
    // Render
    // -------------------------------------------------------------
    const drawEarth = () => {
      const u = G.unit;
      const R = Math.max(G.w, G.h) * 0.85;
      const cx = G.w / 2;
      const cy = -R + G.h * 0.16;
      // ocean
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      g.addColorStop(0, '#2a7fd4');
      g.addColorStop(0.55, '#144a8f');
      g.addColorStop(1, '#081c44');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // continents (procedural blobs on the visible limb)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const t = G.frame * 0.0006;
      for (const b of G.blobs) {
        const bx = cx + Math.cos(b.a + t) * R * b.r;
        const by = cy + Math.sin(b.a * 1.3 + t * 0.7) * R * b.r;
        ctx.fillStyle = 'rgba(46, 125, 70, 0.85)';
        ctx.beginPath();
        ctx.arc(bx, by, R * b.s, 0, Math.PI * 2);
        ctx.fill();
      }
      // polar cap hint
      ctx.fillStyle = 'rgba(230, 242, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy - R * 0.92, R * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // atmosphere rim — localized glow, never full-screen bloom
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 2 * u, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.16)';
      ctx.lineWidth = 10 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, R + 8 * u, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    };

    const drawShip = (x, y) => {
      const u = G.unit;
      const st = G.state;
      const blink = st.immunityTimer > 0 && !reduceMotion ? (Math.sin(G.frame * 0.5) + 1) / 2 : 1;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.65 * blink;
      ctx.translate(x, y);
      // engine flame
      const flick = 10 + Math.random() * 8;
      ctx.fillStyle = 'rgba(0, 220, 255, 0.85)';
      ctx.beginPath();
      ctx.moveTo(-5 * u, 12 * u);
      ctx.lineTo(5 * u, 12 * u);
      ctx.lineTo(0, (12 + flick) * u);
      ctx.closePath();
      ctx.fill();
      // hull
      ctx.fillStyle = '#232a33';
      ctx.strokeStyle = '#00c8ff';
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(0, -16 * u);
      ctx.lineTo(11 * u, 12 * u);
      ctx.lineTo(0, 6 * u);
      ctx.lineTo(-11 * u, 12 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // cockpit
      ctx.fillStyle = '#9be9ff';
      ctx.beginPath();
      ctx.arc(0, -4 * u, 3.2 * u, 0, Math.PI * 2);
      ctx.fill();
      // shield ring
      if (st.activePowerup === 'shield') {
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.75)';
        ctx.lineWidth = 2 * u;
        ctx.setLineDash([7 * u, 5 * u]);
        ctx.lineDashOffset = -G.frame * 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, 24 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    };

    const render = () => {
      const u = G.unit;
      ctx.fillStyle = '#04060b';
      ctx.fillRect(0, 0, G.w, G.h);

      // starfield
      ctx.fillStyle = '#cfe6ff';
      for (const s of G.stars) {
        ctx.globalAlpha = 0.35 + (s.s % 1) * 0.5;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      drawEarth();

      const px = G.playerX ?? G.w / 2;
      const py = G.bounds.playerY;

      // mines
      for (const mn of G.mines) {
        const pr = 0.6 + 0.4 * Math.sin(mn.pulse * 3);
        ctx.save();
        ctx.translate(mn.x, mn.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#3a3a10';
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2 * u;
        const r = 11 * u;
        ctx.fillRect(-r / 1.4, -r / 1.4, (r * 2) / 1.4, (r * 2) / 1.4);
        ctx.strokeRect(-r / 1.4, -r / 1.4, (r * 2) / 1.4, (r * 2) / 1.4);
        ctx.fillStyle = `rgba(255, 255, 0, ${0.5 + 0.5 * pr})`;
        ctx.beginPath();
        ctx.arc(0, 0, 3.4 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // powerups
      for (const p of G.powerups) {
        const def = powerupDef(p.type);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(0, 0, 15 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.rotate(p.spin);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4 * u, -4 * u, 8 * u, 8 * u);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(-4 * u, -4 * u, 8 * u, 8 * u);
        ctx.restore();
      }

      // asteroids
      for (const a of G.asteroids) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        ctx.beginPath();
        const n = a.verts.length;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          const rr = a.r * a.verts[i];
          if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = '#4a4f58';
        ctx.fill();
        ctx.strokeStyle = '#23262c';
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        // localized aura ring
        ctx.strokeStyle = 'rgba(255, 170, 0, 0.28)';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(0, 0, a.r * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // enemies
      for (const e of G.enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const pulse = 1 + 0.08 * Math.sin(G.frame * 0.15 + e.sway);
        ctx.scale(pulse, pulse);
        const r = 15 * u;
        ctx.fillStyle = '#1a0505';
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 2.2 * u;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.8, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r * 0.8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff5555';
        ctx.beginPath();
        ctx.arc(0, 0, 4.5 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // projectiles
      const bolt = (x, y, color, wdt) => {
        ctx.fillStyle = color;
        ctx.fillRect(x - wdt / 2, y - 9 * u, wdt, 18 * u);
      };
      for (const l of G.lasers) bolt(l.x, l.y, l.color, 4 * u);
      for (const el of G.enemyLasers) bolt(el.x, el.y, '#ff3333', 4 * u);
      for (const m of G.missiles) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.fillStyle = '#39ff6a';
        ctx.beginPath();
        ctx.moveTo(0, -8 * u);
        ctx.lineTo(4 * u, 6 * u);
        ctx.lineTo(-4 * u, 6 * u);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // particles
      for (const p of G.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        const s = p.size * u;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;

      if (G.playing || G.paused) drawShip(px, py);
    };

    // -------------------------------------------------------------
    // Main loop
    // -------------------------------------------------------------
    let raf = 0;
    const loop = () => {
      if (!G.paused) {
        update();
        render();
      }
      raf = requestAnimationFrame(loop);
    };
    G.playerX = G.w / 2;
    G.targetX = G.w / 2;
    pushHud();
    raf = requestAnimationFrame(loop);

    const onVis = () => {
      if (document.hidden && G.playing) {
        G.paused = true;
        setScreen('paused');
      }
    };
    document.addEventListener('visibilitychange', onVis);

    // expose controls to React
    G.start = () => {
      G.state = initialState();
      G.state.highScore = loadHighScore();
      clearEntities();
      G.particles = [];
      G.frame = 0;
      G.playerX = G.w / 2;
      G.targetX = G.w / 2;
      G.playing = true;
      G.paused = false;
      pushHud();
      setScreen('playing');
    };
    G.togglePause = () => {
      if (!G.playing && !G.paused) return;
      G.paused = !G.paused;
      setScreen(G.paused ? 'paused' : 'playing');
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => gameRef.current && gameRef.current.start(), []);
  const togglePause = useCallback(() => gameRef.current && gameRef.current.togglePause(), []);

  const hearts = Array.from({ length: Math.max(0, hud.lives) }, (_, i) => (
    <span key={i} className="zs-heart">❤</span>
  ));

  return (
    <>
    <main className="zs-root">
      {/* ARES interior art: page backdrop behind menus/HUD (never over gameplay) */}
      <AresBackdrop src="/images/zeus-protocol/zeus-protocol-bg.webp" strength={0.4} />
      <canvas ref={canvasRef} className="zs-canvas" />

      {(screen === 'playing' || screen === 'paused') && (
        <div className="zs-hud">
          <div className="zs-hud-left">
            <div className="zs-score">SCORE {hud.score.toLocaleString('en-US')}</div>
            <div className="zs-level">LEVEL {hud.level}</div>
          </div>
          <div className="zs-powerup">{hud.powerup ? `◈ ${hud.powerup}` : ''}</div>
          <div className="zs-hud-right">
            <div className="zs-lives">{hearts}</div>
            <button type="button" className="zs-icon-btn" onClick={togglePause} aria-label="Pause">
              <AresIcon name={screen === 'paused' ? 'play' : 'pause'} className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {screen === 'menu' && (
        <div className="zs-overlay">
          <div className="zs-kicker">ARGUS · OBSERVATORY</div>
          <h1 className="zs-title">SPACE SHOOTER</h1>
          <p className="zs-tag">DEEP-SPACE DEFENCE — HOLD THE LINE ABOVE EARTH</p>
          <AresPanel className="px-6 py-4">
          <p className="zs-help">
            Auto-fire engaged. Drag, move the mouse, or use ← → to steer.
            <br />
            Intercept hostiles and asteroids. Grab powerups. Survive.
          </p>
          </AresPanel>
          {hud.highScore > 0 && <p className="zs-best">BEST {hud.highScore.toLocaleString('en-US')}</p>}
          <AresButton icon="rocket" tone="gold" onClick={start} className="mt-6">
            ENGAGE
          </AresButton>
        </div>
      )}

      {screen === 'paused' && (
        <div className="zs-overlay">
          <h1 className="zs-title zs-title-small">STANDBY</h1>
          <p className="zs-tag">DEFENCE GRID PAUSED</p>
          <AresButton icon="play" tone="gold" onClick={togglePause}>
            RESUME
          </AresButton>
        </div>
      )}

      {screen === 'gameover' && (
        <div className="zs-overlay">
          <div className="zs-kicker">SIGNAL LOST</div>
          <h1 className="zs-title zs-title-doom">SYSTEM FAILURE</h1>
          <p className="zs-tag">
            FINAL SCORE {hud.score.toLocaleString('en-US')} · LEVEL {hud.level}
          </p>
          {hud.score >= hud.highScore && hud.score > 0 && <p className="zs-best">NEW BEST</p>}
          <AresButton icon="rotate" tone="crimson" onClick={start}>
            REBOOT
          </AresButton>
        </div>
      )}

      <style>{`
        .zs-root { position: relative; height: 100dvh; background: #04060b; overflow: hidden;
          font-family: ui-monospace, Menlo, Consolas, monospace; color: #e8f1f8;
          -webkit-user-select: none; user-select: none; }
        .zs-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block;
          touch-action: none; cursor: crosshair; }
        .zs-hud { position: absolute; top: 0; left: 0; right: 0; display: flex;
          justify-content: space-between; align-items: flex-start; padding: 14px 16px;
          pointer-events: none; z-index: 5; }
        .zs-hud-right { display: flex; align-items: center; gap: 10px; pointer-events: auto; }
        .zs-score { font-size: 1.05rem; letter-spacing: 2px; color: #00f2ff;
          text-shadow: 0 0 10px rgba(0,242,255,0.6); }
        .zs-level { font-size: 0.85rem; letter-spacing: 2px; color: #ffaa00; margin-top: 4px;
          text-shadow: 0 0 10px rgba(255,170,0,0.6); }
        .zs-powerup { font-size: 0.8rem; letter-spacing: 2px; color: #ff00ff; align-self: center;
          text-shadow: 0 0 10px rgba(255,0,255,0.6); }
        .zs-lives { letter-spacing: 4px; font-size: 1rem; }
        .zs-heart { color: #ff2d55; text-shadow: 0 0 8px rgba(255,45,85,0.7); }
        .zs-icon-btn { background: rgba(10,16,24,0.7); border: 1px solid #33414f; color: #c8d6e2;
          width: 44px; height: 44px; border-radius: 10px; font-size: 1rem; cursor: pointer; }
        .zs-icon-btn:hover { border-color: #00f2ff; color: #00f2ff; }
        .zs-overlay { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column;
          align-items: center; justify-content: center; text-align: center; padding: 24px;
          background: rgba(2,4,8,0.55); }
        .zs-kicker { font-size: 0.72rem; letter-spacing: 5px; color: #8fa3b8; margin-bottom: 12px; }
        .zs-title { font-size: clamp(2.2rem, 9vw, 4.2rem); letter-spacing: 8px; margin: 0 0 10px; color: #fff;
          text-shadow: 0 0 18px rgba(255,170,0,0.75), 0 0 46px rgba(255,60,0,0.45); }
        .zs-title-small { font-size: clamp(1.8rem, 7vw, 3rem); }
        .zs-title-doom { text-shadow: 0 0 18px rgba(255,45,85,0.8), 0 0 46px rgba(255,0,60,0.4); }
        .zs-tag { font-size: clamp(0.72rem, 2.6vw, 0.9rem); letter-spacing: 3px; color: #9fb2c5; margin: 0 0 14px; }
        .zs-help { font-size: 0.82rem; line-height: 1.9; color: #b9c9d8; max-width: 460px; margin: 0 0 18px; }
        .zs-best { font-size: 0.85rem; letter-spacing: 3px; color: #ffd700; margin: 0 0 16px;
          text-shadow: 0 0 12px rgba(255,215,0,0.5); }
        .zs-btn { font: 700 1rem ui-monospace, Menlo, monospace; letter-spacing: 3px; color: #0a0f14;
          background: linear-gradient(90deg, #ff8a00, #ff5500); border: none; border-radius: 6px;
          padding: 16px 58px; cursor: pointer; box-shadow: 0 0 24px rgba(255,85,0,0.35);
          transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .zs-btn:hover { transform: scale(1.05); box-shadow: 0 0 34px rgba(255,85,0,0.55); }
        @media (prefers-reduced-motion: reduce) {
          .zs-btn { transition: none; }
        }
      `}</style>
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed game viewport */}
    <div aria-hidden="true" className="player-clear" />
    </>
  );
}
