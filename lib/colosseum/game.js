// COLOSSEUM — "Pit of Champions" game logic.
// Pure logic, no DOM, no three.js. The React layer creates one instance,
// calls update(dt) every frame, and re-renders on 'ui' events.
// Listeners: game.onEvent(fn) — fn(type, payload). Event types:
//   ui, strike, kill, finish, hurt, inject, shockwave, spawn, comboLost, over, pause

export const ROUND_SECONDS = 60;
export const STRIKE_COOLDOWN = 0.35;
export const COMBO_WINDOW = 3.0;
export const MAX_COMBO_MULT = 8;
export const INJECTOR_MAX = 8;
export const PLAYER_HEARTS = 3;
export const PIT_RADIUS = 30; // world units: enemies spawn at rim, walk to center

export const ENEMY_TYPES = {
  shade: { hp: 2, speed: 3.2, glory: 100, color: '#8b5cf6', scale: 1.0, label: 'Shade' },
  swift: { hp: 1, speed: 5.2, glory: 120, color: '#22d3ee', scale: 0.85, label: 'Swift' },
  brute: { hp: 4, speed: 2.2, glory: 200, color: '#f97316', scale: 1.35, label: 'Brute' },
  herald: { hp: 6, speed: 2.9, glory: 400, color: '#eab308', scale: 1.2, label: "Herald" },
  champion: { hp: 24, speed: 3.4, glory: 2000, color: '#ef4444', scale: 1.7, label: 'Undying Champion' },
};

let nextId = 1;

export class ColosseumGame {
  constructor(mode = 'arena') {
    this.mode = mode === 'boss' ? 'boss' : 'arena'; // 'arena' | 'boss'
    this.screen = 'game'; // game | over
    this.paused = false;
    this.timeLeft = ROUND_SECONDS;
    this.elapsed = 0;
    this.score = 0; // glory
    this.hearts = PLAYER_HEARTS;
    this.kills = 0;
    this.finishes = 0;
    this.bestCombo = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.injector = 0;
    this.enemies = []; // {id,type,hp,maxHp,dist,angle,speed,staggered,staggerT,hitFlash}
    this.effects = []; // transient visuals {id,kind,x,z,t,ttl}
    this.spawnTimer = 0;
    this.heraldTimer = 12; // first herald at 12s
    this.strikeTimer = 0;
    this.invulnTimer = 0;
    this.over = false;
    this.overReason = null; // 'time' | 'fallen' | 'championFallen'
    this.listeners = [];
    this._bossEnraged = false;
    if (this.mode === 'boss') this.spawnChampion();
  }

  onEvent(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((l) => l !== fn); };
  }

  emit(type, payload = {}) {
    for (const fn of this.listeners) fn(type, payload);
  }

  snapshot() {
    return {
      mode: this.mode,
      screen: this.screen,
      paused: this.paused,
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)),
      timeLeftRaw: Math.max(0, this.timeLeft),
      score: this.score,
      hearts: this.hearts,
      kills: this.kills,
      finishes: this.finishes,
      bestCombo: this.bestCombo,
      combo: this.combo,
      comboMult: Math.min(Math.max(this.combo, 1), MAX_COMBO_MULT),
      injector: this.injector,
      injectorMax: INJECTOR_MAX,
      injectorReady: this.injector >= INJECTOR_MAX,
      enemies: this.enemies.map((e) => ({
        id: e.id, type: e.type, hp: e.hp, maxHp: e.maxHp,
        x: Math.cos(e.angle) * e.dist, z: Math.sin(e.angle) * e.dist,
        staggered: e.staggered, hitFlash: e.hitFlash,
        enraged: !!e.enraged,
      })),
      effects: this.effects.map((e) => ({ ...e })),
      overReason: this.overReason,
      bossEnraged: this._bossEnraged,
    };
  }

  togglePause() {
    if (this.screen !== 'game') return;
    this.paused = !this.paused;
    this.emit('pause', { paused: this.paused });
    this.emit('ui');
  }

  // ---- spawning ---------------------------------------------------------

  spawnEnemy(forceType) {
    const t = this.elapsed / ROUND_SECONDS; // 0..1 difficulty ramp
    let type = forceType;
    if (!type) {
      const r = Math.random();
      if (this.elapsed > 40 && r < 0.22) type = 'brute';
      else if (this.elapsed > 15 && r < 0.45) type = 'swift';
      else if (this.elapsed > 25 && r < 0.62) type = 'brute';
      else type = 'shade';
    }
    const def = ENEMY_TYPES[type];
    const speedScale = 1 + t * 0.35;
    const e = {
      id: nextId++,
      type,
      hp: def.hp,
      maxHp: def.hp,
      dist: PIT_RADIUS,
      angle: Math.random() * Math.PI * 2,
      speed: def.speed * speedScale,
      staggered: false,
      staggerT: 0,
      hitFlash: 0,
      enraged: false,
    };
    this.enemies.push(e);
    this.emit('spawn', { id: e.id, type });
    return e;
  }

  spawnChampion() {
    const def = ENEMY_TYPES.champion;
    const e = {
      id: nextId++,
      type: 'champion',
      hp: def.hp,
      maxHp: def.hp,
      dist: PIT_RADIUS,
      angle: 0,
      speed: def.speed,
      staggered: false,
      staggerT: 0,
      hitFlash: 0,
      enraged: false,
    };
    this.enemies.push(e);
    this.emit('spawn', { id: e.id, type: 'champion' });
    return e;
  }

  spawnInterval() {
    const t = this.elapsed / ROUND_SECONDS;
    return 1.6 - t * 0.7; // 1.6s -> 0.9s
  }

  // ---- combat -----------------------------------------------------------

  /** Strike an enemy by id. Returns true if a strike landed. */
  strike(id) {
    if (this.screen !== 'game' || this.paused || this.over) return false;
    if (this.strikeTimer > 0) return false;
    const e = this.enemies.find((x) => x.id === id);
    if (!e) return false;
    this.strikeTimer = STRIKE_COOLDOWN;
    const wasStaggered = e.staggered; // capture before clearing: a finishing
    // blow only counts when it lands inside the stagger (flash) window
    e.hp -= 1;
    e.hitFlash = 0.18;
    e.staggered = false;
    e.staggerT = 0;
    const wasFinish = e.hp <= 0 && wasStaggered;
    this.emit('strike', { id: e.id, type: e.type, hp: e.hp });
    if (e.hp <= 0) {
      this.killEnemy(e, wasFinish);
    } else if (e.hp === 1 && e.maxHp >= 2) {
      // wounded to last breath: stagger window opens — a finishing blow
      // struck now earns double glory. The crowd favors the bold.
      e.staggered = true;
      e.staggerT = 1.2;
    }
    this.emit('ui');
    return true;
  }

  killEnemy(e, isFinish) {
    this.enemies = this.enemies.filter((x) => x.id !== e.id);
    const def = ENEMY_TYPES[e.type];
    // combo: kills within the window chain the multiplier
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = Math.min(this.combo, MAX_COMBO_MULT);
    let points = Math.round(def.glory * mult);
    if (isFinish) {
      points *= 2;
      this.finishes += 1;
      this.effects.push({ id: nextId++, kind: 'finish', x: Math.cos(e.angle) * e.dist, z: Math.sin(e.angle) * e.dist, t: 0, ttl: 0.9, text: `FINISH x2 +${points}` });
      this.emit('finish', { id: e.id, type: e.type, points, combo: this.combo });
    } else {
      this.emit('kill', { id: e.id, type: e.type, points, combo: this.combo });
    }
    this.effects.push({ id: nextId++, kind: 'burst', x: Math.cos(e.angle) * e.dist, z: Math.sin(e.angle) * e.dist, t: 0, ttl: 0.5, color: def.color });
    this.score += points;
    this.kills += 1;
    this.injector = Math.min(INJECTOR_MAX, this.injector + 1);
    if (e.type === 'champion') this.endRound('championFallen');
  }

  /** Injector shockwave: spends a full charge, damages all enemies by 2. */
  inject() {
    if (this.screen !== 'game' || this.paused || this.over) return false;
    if (this.injector < INJECTOR_MAX) return false;
    this.injector = 0;
    this.effects.push({ id: nextId++, kind: 'shockwave', x: 0, z: 0, t: 0, ttl: 0.7 });
    this.emit('inject', {});
    // damage all, then resolve deaths (finish rule applies per enemy:
    // a shockwave kill only counts as a finish if the enemy was staggered)
    const targets = [...this.enemies];
    for (const e of targets) {
      const wasStaggered = e.staggered;
      e.hp -= 2;
      e.hitFlash = 0.25;
      e.staggered = false;
      e.staggerT = 0;
      if (e.hp <= 0) {
        this.killEnemy(e, wasStaggered);
      } else if (e.hp === 1 && e.maxHp >= 2) {
        e.staggered = true;
        e.staggerT = 1.2;
      }
    }
    this.emit('shockwave', { targets: targets.length });
    this.emit('ui');
    return true;
  }

  hurtPlayer(n = 1) {
    if (this.invulnTimer > 0 || this.over) return;
    this.hearts -= n;
    this.invulnTimer = 1.0;
    this.combo = 0;
    this.comboTimer = 0;
    this.emit('hurt', { hearts: this.hearts });
    this.emit('comboLost', {});
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.endRound('fallen');
    }
  }

  endRound(reason) {
    if (this.over) return;
    this.over = true;
    this.overReason = reason;
    this.screen = 'over';
    this.emit('over', { reason, score: this.score, kills: this.kills });
    this.emit('ui');
  }

  // ---- per-frame ----------------------------------------------------------

  update(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    if (this.paused || this.over) return;

    this.elapsed += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endRound('time');
      return;
    }

    this.strikeTimer = Math.max(0, this.strikeTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.combo > 0) {
        this.combo = 0;
        this.emit('comboLost', {});
      }
    }

    // spawning (arena mode only; boss mode has the single champion)
    if (this.mode === 'arena') {
      this.spawnTimer -= dt;
      const active = this.enemies.length;
      if (this.spawnTimer <= 0 && active < 6) {
        this.spawnEnemy();
        this.spawnTimer = this.spawnInterval();
      }
      this.heraldTimer -= dt;
      if (this.heraldTimer <= 0) {
        this.spawnEnemy('herald');
        this.heraldTimer = 15;
      }
    }

    // enemies advance; reaching the center wounds the player
    for (const e of [...this.enemies]) {
      let sp = e.speed;
      if (e.type === 'champion' && e.enraged) sp *= 1.5; // enrage: strikes hit harder/faster
      e.dist -= sp * dt;
      if (e.staggerT > 0) {
        e.staggerT -= dt;
        if (e.staggerT <= 0) e.staggered = false;
      }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      // champion enrage below 25% health
      if (e.type === 'champion' && !e.enraged && e.hp <= e.maxHp * 0.25) {
        e.enraged = true;
        this._bossEnraged = true;
        this.emit('enrage', { id: e.id });
      }
      if (e.dist <= 2.2) {
        this.enemies = this.enemies.filter((x) => x.id !== e.id);
        // the champion hits twice as hard when she breaks through
        this.hurtPlayer(e.type === 'champion' ? 2 : 1);
        this.emit('breach', { type: e.type });
      }
    }

    // effects age out
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < fx.ttl);

    this.emit('ui');
  }
}
