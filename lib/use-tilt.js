// lib/use-tilt.js — React hook wiring phone-tilt vertical control into the
// hub. Pure math and permission classification live in lib/tilt-control.js
// (headless-testable); this file owns the DOM: the deviceorientation
// listener, the iOS permission gesture, the transient message, and the
// persisted preference.
//
// Rules (Merlin's ask: "tilting for vertical level instead of a button"):
// - Writes ONLY to controlsRef.current.moveY — the same channel as the
//   joystick — and only when flightAxis === 'vertical' and the app is in a
//   state where the joystick works (hub_intro / hub_freeroam / on_bike).
// - The joystick always wins: while joyActive, tilt writes are skipped.
// - prefers-reduced-motion: tilt never enables.
// - iOS: DeviceOrientationEvent.requestPermission() is called from the
//   toggle's click handler (user gesture), never on mount.
// - The tilt preference is per-device (localStorage), not account state.

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fx } from './fx';
import {
  classifyTiltEnv,
  classifyTiltPermission,
  loadTiltPref,
  saveTiltPref,
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

export function useTilt({ controlsRef, flightAxis, appState, joyActive }) {
  const [tiltOn, setTiltOn] = useState(false);   // listener actively driving moveY
  const [tiltArmed, setTiltArmed] = useState(false); // persisted preference (button glow)
  const [tiltMsg, setTiltMsg] = useState(null);   // transient message (auto-dismiss)

  // Refs so the single deviceorientation listener never goes stale.
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const axisRef = useRef(flightAxis);
  axisRef.current = flightAxis;
  const joyRef = useRef(joyActive);
  joyRef.current = joyActive;
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
      if (joyRef.current) return; // joystick wins — never fight it
      if (!TILT_STATES.has(appStateRef.current)) return;
      if (axisRef.current !== 'vertical') return;
      const beta = e && e.beta;
      if (!Number.isFinite(beta)) return;
      // Calibrate on the first event after enabling: the user's natural hold
      // becomes neutral, so the ±8° dead-zone is measured from rest.
      if (neutralRef.current === null) neutralRef.current = beta;
      const target = tiltInputFromDelta(beta - neutralRef.current);
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
    saveTiltPref(typeof window !== 'undefined' ? window.localStorage : null, true);
    setTiltArmed(true);
  }, [handleOrientation]);

  // forget=true: user tapped the toggle off — drop the persisted preference.
  // forget=false: teardown only (unmount) — the preference survives.
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
      if (forget) {
        saveTiltPref(typeof window !== 'undefined' ? window.localStorage : null, false);
        setTiltArmed(false);
      }
    },
    [controlsRef, handleOrientation]
  );

  // The toggle. MUST run inside the click handler's user gesture so iOS
  // grants DeviceOrientationEvent.requestPermission().
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

  // Mount: restore the persisted preference. Direct-capable devices (no
  // permission gate) re-arm silently; iOS keeps the button armed and waits
  // for the tap that grants permission — iOS requires a user gesture.
  useEffect(() => {
    const saved = loadTiltPref(typeof window !== 'undefined' ? window.localStorage : null);
    if (!saved) return;
    const env = tiltEnvNow();
    if (!env.ok) return; // reduced-motion or no gyro: stay off, keep it honest
    setTiltArmed(true);
    if (env.reason === 'direct') startTilt();
    return () => stopTilt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tiltOn, tiltArmed, tiltMsg, toggleTilt };
}
