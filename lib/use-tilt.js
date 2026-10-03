// lib/use-tilt.js — React hook wiring phone-tilt vertical control into the
// hub. Pure math and permission classification live in lib/tilt-control.js
// (headless-testable); this file owns the DOM: the deviceorientation
// listener, the iOS permission gesture, and the transient message.
//
// Rules (Merlin's ask: "tilting for vertical level instead of a button",
// then "remove the steering button and the vertical/horizontal button"):
// - AUTOMATIC flight axis: no toggle, no button. Tilt the phone beyond the
//   ±8° dead-zone and the axis goes vertical with tilt driving moveY; hold
//   the phone level and the axis returns to horizontal. The optional
//   `onAutoAxis` callback is invoked only when the axis actually changes.
// - Writes ONLY to controlsRef.current.moveY — the same channel as the
//   joystick — and only in states where the joystick works
//   (hub_intro / hub_freeroam / on_bike).
// - The joystick always wins: while joyActive, tilt writes AND axis
//   changes are skipped (the joystick owns moveY mid-gesture).
// - prefers-reduced-motion: tilt never enables.
// - iOS: DeviceOrientationEvent.requestPermission() is called from the
//   first pointerdown (a user gesture) — one-shot, never nagging. If the
//   user denies, the axis simply stays horizontal.
// - Tilt is always on when available (no preference, no button); the
//   persisted-preference helpers remain in tilt-control.js for tests.

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fx } from './fx';
import {
  axisFromTiltDelta,
  classifyTiltEnv,
  classifyTiltPermission,
  smoothTiltInput,
  tiltInputFromDelta,
} from './tilt-control';

// App states where the joystick channel is live — tilt mirrors exactly.
const TILT_STATES = new Set(['hub_intro', 'hub_freeroam', 'on_bike']);

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

function tiltEnvNow() {
  const DOE = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined;
  return classifyTiltEnv({
    reducedMotion: prefersReducedMotion(),
    hasDeviceOrientationEvent: !!DOE,
    hasRequestPermission: !!DOE && typeof DOE.requestPermission === 'function',
  });
}

export function useTilt({ controlsRef, flightAxis, appState, joyActive, onAutoAxis }) {
  const [tiltOn, setTiltOn] = useState(false);   // listener actively driving moveY
  const [tiltArmed, setTiltArmed] = useState(false); // armed state (mirrors tiltOn; kept for the hook contract)
  const [tiltMsg, setTiltMsg] = useState(null);   // transient message (auto-dismiss)

  // Refs so the single deviceorientation listener never goes stale.
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const axisRef = useRef(flightAxis);
  axisRef.current = flightAxis;
  const joyRef = useRef(joyActive);
  joyRef.current = joyActive;
  const autoAxisRef = useRef(typeof onAutoAxis === 'function' ? onAutoAxis : null);
  autoAxisRef.current = typeof onAutoAxis === 'function' ? onAutoAxis : null;
  const activeRef = useRef(false);
  const moveYRef = useRef(0);
  const neutralRef = useRef(null); // calibrated neutral beta, set on first event

  // Transient messages auto-dismiss (no pop-ups, per the cleanest-UI rule).
  useEffect(() => {
    if (!tiltMsg) return;
    const t = setTimeout(() => setTiltMsg(null), 2600);
    return () => clearTimeout(t);
  }, [tiltMsg]);

  const handleOrientation = useCallback(
    (e) => {
      if (!activeRef.current) return;
      if (joyRef.current) return; // joystick wins — never fight it, and never flip the axis mid-drag
      if (!TILT_STATES.has(appStateRef.current)) return;
      const beta = e && e.beta;
      if (!Number.isFinite(beta)) return;
      // Calibrate on the first event after enabling: the user's natural hold
      // becomes neutral, so the ±8° dead-zone is measured from rest.
      if (neutralRef.current === null) neutralRef.current = beta;
      const delta = beta - neutralRef.current;
      const auto = autoAxisRef.current;
      // Legacy (non-auto) path: the old manual-axis gate — tilt only writes
      // when the page holds the axis vertical itself.
      if (!auto && axisRef.current !== 'vertical') return;
      // Automatic axis: the axis follows the phone.
      const axisNow = auto ? axisFromTiltDelta(delta) : axisRef.current;
      if (auto && axisNow !== axisRef.current) auto(axisNow);
      // Tilt drives moveY only while vertical; otherwise the input decays
      // smoothly to zero so no stale deflection lingers when leveling out.
      const target = axisNow === 'vertical' ? tiltInputFromDelta(delta) : 0;
      moveYRef.current = smoothTiltInput(moveYRef.current, target);
      if (controlsRef && controlsRef.current) controlsRef.current.moveY = moveYRef.current;
    },
    [controlsRef]
  );

  const startTilt = useCallback(() => {
    neutralRef.current = null; // recalibrate on the user's next hold
    moveYRef.current = 0;
    activeRef.current = true;
    window.addEventListener('deviceorientation', handleOrientation);
    setTiltOn(true);
    setTiltArmed(true);
  }, [handleOrientation]);

  // forget=true: caller is tearing down for good. forget=false: teardown
  // only (unmount).
  const stopTilt = useCallback(
    (forget = false) => {
      activeRef.current = false;
      moveYRef.current = 0;
      neutralRef.current = null;
      if (typeof window !== 'undefined') window.removeEventListener('deviceorientation', handleOrientation);
      // Zero our channel so a stale tilt value doesn't linger — unless the
      // joystick is mid-gesture, in which case it owns moveY.
      if (!joyRef.current && controlsRef && controlsRef.current) controlsRef.current.moveY = 0;
      setTiltOn(false);
      if (forget) setTiltArmed(false);
    },
    [controlsRef, handleOrientation]
  );

  // Legacy toggle (kept for the hook contract — the hub no longer renders
  // a button). MUST run inside a user gesture so iOS grants
  // DeviceOrientationEvent.requestPermission().
  const toggleTilt = useCallback(() => {
    try {
      fx.tap();
    } catch {
      /* fx not unlocked yet — the tap is the unlocking gesture */
    }
    if (activeRef.current) {
      stopTilt(true);
      return;
    }
    const env = tiltEnvNow();
    if (!env.ok) {
      setTiltMsg(env.message);
      return;
    }
    if (env.reason === 'permission-needed') {
      DeviceOrientationEvent.requestPermission()
        .then((res) => {
          const p = classifyTiltPermission(res);
          if (p.ok) startTilt();
          else setTiltMsg(p.message);
        })
        .catch(() => setTiltMsg('Tilt denied — enable motion access in Settings.'));
    } else {
      startTilt();
    }
  }, [startTilt, stopTilt]);

  // Mount: tilt is automatic — no button, no preference. Direct-capable
  // devices (no permission gate) start listening immediately. iOS-style
  // devices wait for the first user gesture (one-shot): the tap that the
  // user was going to make anyway carries the permission request.
  useEffect(() => {
    const env = tiltEnvNow();
    if (!env.ok) return; // reduced-motion or no gyro: stay off, axis stays horizontal
    if (env.reason === 'direct') {
      startTilt();
      return () => stopTilt(false);
    }
    let done = false;
    const onFirstGesture = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointerdown', onFirstGesture);
      const e2 = tiltEnvNow();
      if (!e2.ok) return;
      if (e2.reason === 'permission-needed') {
        DeviceOrientationEvent.requestPermission()
          .then((res) => {
            const p = classifyTiltPermission(res);
            if (p.ok) {
              startTilt();
              setTiltMsg('Tilt your phone to climb / descend');
            }
            // denied: stay silent — the axis simply stays horizontal
          })
          .catch(() => {});
      } else {
        startTilt();
      }
    };
    window.addEventListener('pointerdown', onFirstGesture);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      stopTilt(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tiltOn, tiltArmed, tiltMsg, toggleTilt };
}
