// Streetball — game state machine. Plain JS class, no React dependency.
// The React layer creates one instance, calls update(dt) every frame, and
// listens to events for sounds / popups / UI state changes.
//
// Listeners: game.onEvent(fn) — fn(type, payload). Event types:
//   'score' {points, swish, streak, total}   'miss' {}
//   'bounce' {intensity}  'rim' {intensity}  'board' {}
//   'swish' {}  'buzzer' {}  'buzzerBeater' {points}
//   'spot' {label, end}  'ui' {}  (score/time/phase changed — refresh HUD)
//   'over' {score, makes, attempts, bestStreak}  'pause' {paused}

import {
  BALL_START_H,
  GAME,
  SHOT,
  rimForEnd,
  spotsForEnd,
} from './constants.js';
import {
  makeBall,
  placeBall,
  shootBall,
  stepBall,
  shotVelocity,
  defaultShotSpeed,
} from './physics.js';

export class BasketballGame {
  constructor(mode = 'shootout') {
    this.mode = mode; // 'shootout' | 'freeplay'
    this.listeners = [];
    this.ball = makeBall();
    this.reset();
  }

  onEvent(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(type, payload = {}) {
    for (const fn of this.listeners) fn(type, payload);
  }

  reset() {
    this.screen = 'game'; // 'menu' handled by React; game manages 'game'|'over'
    this.phase = 'idle'; // idle | aiming | flying | resetting
    this.paused = false;
    this.score = 0;
    this.makes = 0;
    this.attempts = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.timeLeft = GAME.shootoutSeconds;
    this.end = 0;
    this.spotIndex = 2; // start at the top
    this.resetTimer = 0;
    this.timeScale = 1;
    this.slowMo = false;
    this.overEmitted = false;
    // aim state
    this.aim = { power01: 0.55, azimOffset: 0, elevDeg: SHOT.defaultElevDeg };
    this._placeAtSpot();
    this.emit('ui');
  }

  get spots() {
    return spotsForEnd(this.end);
  }

  get rim() {
    return rimForEnd(this.end);
  }

  get ballPos() {
    const s = this.spots[this.spotIndex];
    return { x: s.x, y: BALL_START_H, z: s.z };
  }

  _placeAtSpot() {
    const p = this.ballPos;
    placeBall(this.ball, p.x, p.y, p.z);
    this.phase = 'idle';
    const s = this.spots[this.spotIndex];
    this.emit('spot', { label: s.label, end: this.end });
    this.emit('ui');
  }

  // --- aiming ---------------------------------------------------------------
  startAim() {
    if (this.phase !== 'idle' || this.paused) return;
    this.phase = 'aiming';
    // seed a sensible default: speed that reaches the rim at default elevation
    const from = this.ballPos;
    const speed = defaultShotSpeed(from, this.rim, this.aim.elevDeg);
    this.aim.power01 =
      (speed - SHOT.minSpeed) / (SHOT.maxSpeed - SHOT.minSpeed);
    this.aim.azimOffset = 0;
    this.emit('ui');
  }

  moveAim(dxPx, dyPx) {
    if (this.phase !== 'aiming') return;
    // drag down = more power, drag up = less; left/right steers
    this.aim.power01 = Math.min(
      1,
      Math.max(0, this.aim.power01 + dyPx * SHOT.powerPerPx)
    );
    this.aim.azimOffset = Math.min(
      SHOT.maxAzimOffset,
      Math.max(-SHOT.maxAzimOffset, this.aim.azimOffset + dxPx * SHOT.azimPerPx)
    );
  }

  currentShotVelocity() {
    const from = this.ballPos;
    const speed =
      SHOT.minSpeed + this.aim.power01 * (SHOT.maxSpeed - SHOT.minSpeed);
    return shotVelocity(from, this.rim, {
      elevDeg: this.aim.elevDeg,
      azimOffset: this.aim.azimOffset,
      speed,
    });
  }

  releaseShot() {
    if (this.phase !== 'aiming' || this.paused) return;
    const v = this.currentShotVelocity();
    shootBall(this.ball, v);
    this.phase = 'flying';
    this.attempts += 1;
    this.emit('ui');
  }

  cancelAim() {
    if (this.phase === 'aiming') {
      this.phase = 'idle';
      this.emit('ui');
    }
  }

  moveToSpot(i) {
    if (this.phase !== 'idle' || this.paused) return;
    if (i === this.spotIndex) return;
    this.spotIndex = i;
    this._placeAtSpot();
  }

  togglePause() {
    if (this.screen !== 'game') return;
    this.paused = !this.paused;
    this.emit('pause', { paused: this.paused });
    this.emit('ui');
  }

  // --- scoring ----------------------------------------------------------------
  _onScore(swish) {
    this.makes += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const streakBonus = Math.min(this.streak - 1, GAME.maxStreakBonus);
    const points = GAME.basePoints + streakBonus + (swish ? GAME.swishBonus : 0);

    // Buzzer-beater: the clock already hit zero while the ball was live.
    const buzzerBeater = this.mode === 'shootout' && this.timeLeft <= 0;
    this.score += points;
    this.emit('score', { points, swish, streak: this.streak, total: this.score });
    if (buzzerBeater) {
      this.emit('buzzerBeater', { points });
      this.slowMo = false;
      this.timeScale = 1;
    }
    this.phase = 'resetting';
    this.resetTimer = 1.0;
    this.emit('ui');
  }

  _onMiss() {
    this.streak = 0;
    this.emit('miss', {});
    this.phase = 'resetting';
    this.resetTimer = 0.9;
    this.emit('ui');
  }

  _nextSpot(scored) {
    if (this.mode === 'shootout' && scored) {
      // alternate ends after every make
      this.end = this.end === 0 ? 1 : 0;
      this.spotIndex = 2;
    } else {
      this.spotIndex = (this.spotIndex + 1) % this.spots.length;
    }
    this._placeAtSpot();
  }

  _finishIfTimeUp() {
    if (this.mode === 'shootout' && this.timeLeft <= 0 && !this.overEmitted) {
      // If the ball is still live, go slow-mo and let the shot resolve.
      if (this.phase === 'flying' && !this.slowMo) {
        this.slowMo = true;
        this.timeScale = GAME.buzzerSlowMo;
        this.emit('buzzer', {});
        return;
      }
      if (this.phase === 'flying' || this.phase === 'resetting') return;
      this.screen = 'over';
      this.overEmitted = true;
      this.timeScale = 1;
      this.slowMo = false;
      this.emit('over', {
        score: this.score,
        makes: this.makes,
        attempts: this.attempts,
        bestStreak: this.bestStreak,
      });
      this.emit('ui');
    }
  }

  // --- frame update -------------------------------------------------------------
  update(rawDt) {
    if (this.paused || this.screen !== 'game') return;
    const dt = Math.min(rawDt, 1 / 20) * this.timeScale;

    if (this.mode === 'shootout' && !this.slowMo) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      this._finishIfTimeUp();
      if (this.screen === 'over') return;
    }

    if (this.phase === 'flying' || this.phase === 'resetting') {
      const events = stepBall(this.ball, this.rim, dt);
      for (const e of events) {
        if (e.type === 'score') this._onScore(e.swish);
        else if (e.type === 'dead') {
          if (e.reason === 'scored') {
            // already handled by the score event; just advance
            this._nextSpot(true);
          } else {
            this._onMiss();
            // _onMiss sets resetting; advance spot when the timer elapses
            this._pendingAdvance = true;
          }
        } else if (e.type === 'bounce' || e.type === 'rim' || e.type === 'board' || e.type === 'swish') {
          this.emit(e.type, e);
        }
      }
    }

    if (this.phase === 'resetting') {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) {
        if (this._pendingAdvance) {
          this._pendingAdvance = false;
          this._nextSpot(false);
        }
        // scored path already advanced in the dead handler
        if (this.phase === 'resetting') this._placeAtSpot();
      }
    }

    // timer + power-meter UI refresh (React throttles this)
    this._uiAcc = (this._uiAcc || 0) + rawDt;
    if (this._uiAcc > 0.1) {
      this._uiAcc = 0;
      this.emit('ui');
    }
  }

  snapshot() {
    return {
      screen: this.screen,
      phase: this.phase,
      paused: this.paused,
      mode: this.mode,
      score: this.score,
      makes: this.makes,
      attempts: this.attempts,
      streak: this.streak,
      bestStreak: this.bestStreak,
      timeLeft: Math.ceil(this.timeLeft),
      timeLeftRaw: this.timeLeft,
      end: this.end,
      spotIndex: this.spotIndex,
      spotLabel: this.spots[this.spotIndex].label,
      aiming: this.phase === 'aiming',
      power01: this.aim.power01,
      slowMo: this.slowMo,
    };
  }
}
