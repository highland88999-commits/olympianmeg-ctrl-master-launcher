// lib/use-bike-motion.js — React hook wiring phone steering + gyro look-around
// into the Shadow Realm neon-bike ride. Pure math lives in lib/bike-motion.js
// (headless-testable); this file owns the DOM: the deviceorientation listener,
// the iOS permission gesture, calibration, transient messages, and the
// persisted preference.
//
// Rules (Merlin's ask: tilt to steer, gyro to look around):
// - Writes inputRef.current.steer (analog [-1,1]) and .lookYaw/.lookPitch
//   (radians), the channels the Rig reads every frame. Only while stage is
//   'ride' — never during menus, countdown, or the finish screen.
// - Touch/joystick always wins: while a steer pad (or key) is actively
//   steering, tilt-steer writes are skipped. Gyro look keeps running —
//   separate channel, no fight.
// - Neutral is calibrated from the user's actual hold: on enable, on ride
//   start, and on recenter (double-tap / button). A stale neutral never
//   survives an orientation change — portrait/landscape flips recalibrate.
// - prefers-reduced-motion: motion never enables.
// - iOS: DeviceOrientationEvent.requestPermission() runs inside the toggle's
//   click handler (user gesture), never on mount.
// - Preference is per-device (localStorage), not account state.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fx } from './fx';
import {
  classifyTiltEnv,
  classifyTiltPermission,
  smoothTiltInput,
} from './tilt-control';
import {
  DEG2RAD,
  LOOK_SMOOTH,
  PEDAL_SMOOTH,
  STEER_SMOOTH,
  STEER_RAW_SMOOTH,
  brakeFromTilt,
  clamp01,
  landscapeSteerSign,
  loadMotionPref,
  lookFromOrientation,
  pickFwdDelta,
  pickSteerDelta,
  regenFromTilt,
  saveMotionPref,
  steerFromTilt2D,
  steerGainFromSpeed,
  steerInputFromTilt,
  throttleFromTilt,
} from './bike-motion';

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

function motionEnvNow() {
  const DOE = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined;
  return classifyTiltEnv({
    reducedMotion: prefersReducedMotion(),
    hasDeviceOrientationEvent: !!DOE,
    hasRequestPermission: !!DOE && typeof DOE.requestPermission === 'function',
  });
}

function orientationNow() {
  try {
    const landscape = window.innerWidth > window.innerHeight;
    const so = window.screen && window.screen.orientation;
    const angle =
      so && typeof so.angle === 'number'
        ? so.angle
        : typeof window.orientation === 'number'
          ? window.orientation
          : null;
    return { landscape, angle };
  } catch {
    return { landscape: false, angle: null };
  }
}

export function useBikeMotion({ inputRef, hudRef, vehicle, stage, touchSteerRef }) {
  const [motionOn, setMotionOn] = useState(false); // listener actively driving
  const [motionArmed, setMotionArmed] = useState(false); // persisted pref (button glow)
  const [motionMsg, setMotionMsg] = useState(null); // transient message
  const armedRef = useRef(false);
  const grantedRef = useRef(false); // iOS motion permission granted this session
  useEffect(() => {
    armedRef.current = motionArmed;
  }, [motionArmed]);

  // Refs so the single listener never goes stale.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const vehicleRef = useRef(vehicle);
  vehicleRef.current = vehicle;
  const touchRef = useRef(touchSteerRef);
  touchRef.current = touchSteerRef;
  const activeRef = useRef(false);
  const neutralRef = useRef(null); // {alpha,beta,gamma,landscape} | null
  const steerSmRef = useRef(0);
  const thrSmRef = useRef(0);
  const brkSmRef = useRef(0);
  const regenSmRef = useRef(0);
  const yawSmRef = useRef(0);
  const pitchSmRef = useRef(0);
  // Raw tilt low-pass (Merlin 2026-10-03): the sensor degrees are smoothed
  // BEFORE the dead-zone/gain map, killing jitter at the source. The
  // post-map smoothing below stays as a second stage.
  const latRawSmRef = useRef(0);
  const fwdRawSmRef = useRef(0);

  // Transient messages auto-dismiss (no pop-ups, cleanest-UI rule).
  useEffect(() => {
    if (!motionMsg) return;
    const t = setTimeout(() => setMotionMsg(null), 2600);
    return () => clearTimeout(t);
  }, [motionMsg]);

  const writeZeros = useCallback(() => {
    steerSmRef.current = 0;
    thrSmRef.current = 0;
    brkSmRef.current = 0;
    regenSmRef.current = 0;
    yawSmRef.current = 0;
    pitchSmRef.current = 0;
    latRawSmRef.current = 0;
    fwdRawSmRef.current = 0;
    const input = inputRef && inputRef.current;
    if (!input) return;
    const touchActive = touchRef.current && touchRef.current.current;
    if (!touchActive) input.steer = 0;
    input.throttle = 0;
    input.brake = 0;
    input.regen = 0;
    input.lookYaw = 0;
    input.lookPitch = 0;
  }, [inputRef]);

  const handleOrientation = useCallback(
    (e) => {
      if (!activeRef.current) return;
      if (stageRef.current !== 'ride') return;
      const alpha = e && e.alpha;
      const beta = e && e.beta;
      const gamma = e && e.gamma;
      if (!Number.isFinite(beta) && !Number.isFinite(gamma)) return;

      const { landscape, angle } = orientationNow();
      // Orientation flipped mid-ride (portrait<->landscape): the old neutral
      // is meaningless — recalibrate silently on this frame, no jump.
      if (neutralRef.current && neutralRef.current.landscape !== landscape) {
        neutralRef.current = null;
        writeZeros();
      }
      if (!neutralRef.current) {
        // Calibrate only on a sane frame: beta and gamma must both be real
        // (alpha is optional — no magnetometer means no look-yaw, not no ride).
        if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
        neutralRef.current = { alpha, beta, gamma, landscape };
        return;
      }
      const n = neutralRef.current;

      // --- motion controls (Merlin's tilt driving map) ---
      // lateral: roll axis relative to neutral (+ = right edge dipped, never inverted)
      // forward: pitch axis relative to neutral (+ = top tipped away = gas)
      const latDeltaRaw = pickSteerDelta(
        { beta: beta - n.beta, gamma: gamma - n.gamma },
        landscape,
        landscapeSteerSign(angle)
      );
      const fwdDeltaRaw = pickFwdDelta(
        { beta: beta - n.beta, gamma: gamma - n.gamma },
        landscape
      );
      // Raw low-pass BEFORE the dead-zone/gain map (Merlin 2026-10-03):
      // sensor jitter is smoothed in degrees, so the maps see a clean
      // signal. NaN-safe: a lying sensor yields NaN -> every channel maps
      // it to 0, and the EMA holds its last sane value via smoothTiltInput.
      const latDelta = Number.isFinite(latDeltaRaw)
        ? (latRawSmRef.current = smoothTiltInput(latRawSmRef.current, latDeltaRaw, STEER_RAW_SMOOTH))
        : NaN;
      const fwdDelta = Number.isFinite(fwdDeltaRaw)
        ? (fwdRawSmRef.current = smoothTiltInput(fwdRawSmRef.current, fwdDeltaRaw, STEER_RAW_SMOOTH))
        : NaN;
      // NaN-safe: a lying sensor yields NaN -> every channel maps it to 0.
      const fwd = Number.isFinite(fwdDelta) ? fwdDelta : 0;
      const fwdPos = Math.max(0, fwd);
      const backPos = Math.max(0, -fwd);

      // steering: 2D — direction from the lateral sign, sharpness from the
      // lateral-vs-forward ratio (mostly-lateral = sharp, mostly-forward = gentle)
      let steerTarget = steerFromTilt2D(latDelta, fwdPos);
      // speed-sensitive gain: lively in the pits, calm at full throttle
      let speedFrac = 0;
      try {
        const mph = hudRef && hudRef.current && hudRef.current.speed;
        const maxSpeed = vehicleRef.current && vehicleRef.current.maxSpeed;
        if (Number.isFinite(mph) && Number.isFinite(maxSpeed) && maxSpeed > 0) {
          speedFrac = clamp01(mph / 2.2 / maxSpeed);
        }
      } catch {
        /* HUD not warm yet — full gain */
      }
      steerTarget *= steerGainFromSpeed(speedFrac);
      steerSmRef.current = smoothTiltInput(steerSmRef.current, steerTarget, STEER_SMOOTH);

      // gas / brake / regen — analog pedals from the pitch axis + hard left
      const thrTarget = throttleFromTilt(fwdPos);
      const brkTarget = brakeFromTilt(backPos);
      const regenTarget = regenFromTilt(latDelta);
      thrSmRef.current = smoothTiltInput(thrSmRef.current, thrTarget, PEDAL_SMOOTH);
      brkSmRef.current = smoothTiltInput(brkSmRef.current, brkTarget, PEDAL_SMOOTH);
      regenSmRef.current = smoothTiltInput(regenSmRef.current, regenTarget, PEDAL_SMOOTH);

      const touchActive = touchRef.current && touchRef.current.current;
      if (inputRef && inputRef.current) {
        // touch/keys always win the steering channel; tilt owns gas/brake/regen
        // (there are no touch pedals to fight over).
        if (!touchActive) inputRef.current.steer = steerSmRef.current;
        inputRef.current.throttle = thrSmRef.current;
        inputRef.current.brake = brkSmRef.current;
        inputRef.current.regen = regenSmRef.current;
        inputRef.current.motionDrive = true;
      }

      // --- look: absolute orientation relative to neutral (separate axes) ---
      const { yawDeg, pitchDeg } = lookFromOrientation(
        { alpha, beta, gamma },
        n,
        landscape
      );
      yawSmRef.current = smoothTiltInput(yawSmRef.current, yawDeg, LOOK_SMOOTH);
      pitchSmRef.current = smoothTiltInput(pitchSmRef.current, pitchDeg, LOOK_SMOOTH);
      if (inputRef && inputRef.current) {
        inputRef.current.lookYaw = yawSmRef.current * DEG2RAD;
        inputRef.current.lookPitch = pitchSmRef.current * DEG2RAD;
      }
    },
    [inputRef, hudRef, writeZeros]
  );

  const startMotion = useCallback(() => {
    neutralRef.current = null; // calibrate on the user's next hold
    writeZeros();
    activeRef.current = true;
    if (inputRef && inputRef.current) inputRef.current.motionDrive = true;
    grantedRef.current = true; // events are flowing: permission is settled
    window.addEventListener('deviceorientation', handleOrientation);
    setMotionOn(true);
    saveMotionPref(typeof window !== 'undefined' ? window.localStorage : null, true);
    setMotionArmed(true);
  }, [handleOrientation, writeZeros]);

  // forget=true: user tapped the toggle off — drop the persisted preference.
  // forget=false: teardown only (unmount / stage change) — preference survives.
  const stopMotion = useCallback(
    (forget = false) => {
      activeRef.current = false;
      neutralRef.current = null;
      if (typeof window !== 'undefined') window.removeEventListener('deviceorientation', handleOrientation);
      writeZeros();
      if (inputRef && inputRef.current) inputRef.current.motionDrive = false;
      setMotionOn(false);
      if (forget) {
        saveMotionPref(typeof window !== 'undefined' ? window.localStorage : null, false);
        setMotionArmed(false);
      }
    },
    [handleOrientation, writeZeros]
  );

  // Quiet recalibration: ride start and orientation flips use this (no toast).
  const recalibrate = useCallback(() => {
    neutralRef.current = null;
    writeZeros();
  }, [writeZeros]);

  // User-facing recenter: double-tap or the recenter button.
  const recenter = useCallback(() => {
    recalibrate();
    setMotionMsg('Recentered — this hold is neutral.');
  }, [recalibrate]);

  // The toggle. MUST run inside the click handler's user gesture so iOS
  // grants DeviceOrientationEvent.requestPermission().
  const toggleMotion = useCallback(() => {
    try {
      fx.tap();
    } catch {
      /* fx not unlocked yet — the tap is the unlocking gesture */
    }
    if (activeRef.current) {
      stopMotion(true);
      return;
    }
    const env = motionEnvNow();
    if (!env.ok) {
      setMotionMsg(env.message);
      return;
    }
    if (env.reason === 'permission-needed') {
      DeviceOrientationEvent.requestPermission()
        .then((res) => {
          const p = classifyTiltPermission(res);
          if (p.ok) startMotion();
          else setMotionMsg(p.message);
        })
        .catch(() => setMotionMsg('Motion denied — enable motion access in Settings.'));
    } else {
      startMotion();
    }
  }, [startMotion, stopMotion]);

  // Enable-only entry for the MOUNT & RIDE tap (Merlin 2026-10-03): the
  // mount tap IS a user gesture, so iOS grants requestPermission() from it
  // and motion drives the bike from the very first ride — no separate ◐
  // tap needed. Never toggles off (unlike toggleMotion). If permission was
  // already granted this page session, starts immediately without
  // re-prompting. Denials degrade honestly: toast + auto-throttle + the
  // touch steer pads keep the ride playable.
  const enableMotionFromGesture = useCallback(() => {
    if (activeRef.current) return;
    try {
      fx.tap();
    } catch {
      /* fx not unlocked yet — the tap is the unlocking gesture */
    }
    const env = motionEnvNow();
    if (!env.ok) {
      setMotionMsg(env.message);
      return;
    }
    if (env.reason === 'permission-needed' && !grantedRef.current) {
      DeviceOrientationEvent.requestPermission()
        .then((res) => {
          const p = classifyTiltPermission(res);
          if (p.ok) startMotion();
          else setMotionMsg(p.message);
        })
        .catch(() => setMotionMsg('Motion denied — enable motion access in Settings.'));
    } else {
      startMotion();
    }
  }, [startMotion]);

  // Leaving the ride stage: stop driving, but keep the armed preference.
  useEffect(() => {
    if (stage !== 'ride' && activeRef.current) {
      activeRef.current = false;
      neutralRef.current = null;
      if (typeof window !== 'undefined') window.removeEventListener('deviceorientation', handleOrientation);
      writeZeros();
      if (inputRef && inputRef.current) inputRef.current.motionDrive = false;
      setMotionOn(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Restart the listener when a new run begins if the rider left motion armed
  // (e.g. RIDE AGAIN after a finish). iOS permission, once granted, lasts
  // for the page session, so no new gesture is needed to resume.
  const resumeIfArmed = useCallback(() => {
    if (activeRef.current || !armedRef.current) return;
    const env = motionEnvNow();
    if (!env.ok) return;
    if (env.reason === 'direct' || grantedRef.current) startMotion();
  }, [startMotion]);

  // Mount: restore the persisted preference. Direct-capable devices re-arm
  // silently; iOS keeps the button armed and waits for the tap that grants
  // permission — iOS requires a user gesture.
  useEffect(() => {
    const saved = loadMotionPref(typeof window !== 'undefined' ? window.localStorage : null);
    if (!saved) return;
    const env = motionEnvNow();
    if (!env.ok) return; // reduced-motion or no gyro: stay off, keep it honest
    setMotionArmed(true);
    if (env.reason === 'direct') startMotion();
    return () => stopMotion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { motionOn, motionArmed, motionMsg, toggleMotion, enableMotionFromGesture, recenter, recalibrate, resumeIfArmed };
}
