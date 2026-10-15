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
// - The flight axis itself is AUTOMATIC (Merlin: no buttons — the phone's
//   pitch IS the selector): the onAutoAxis callback fires with the
//   axisFromTiltDelta() result whenever it changes (past the ±8° dead-zone
//   → vertical, held level → horizontal). The FLIGHT AXIS readout stays a
//   passive readout; the toggle button stays gone.
// - The joystick always wins: while joyActive, tilt writes are skipped.
// - prefers-reduced-motion: tilt never enables.
// - iOS: DeviceOrientationEvent.requestPermission() fires on the FIRST TAP
//   that engages the flight surface (invisible infrastructure — no visible
//   button), never on mount. Taps on shell chrome (menus, buttons, the
//   radio — ordinary browsing) never trigger it and never surface a
//   denial: the one-shot listener re-arms silently (demo fix, 2026-10-15).
// - Tilt arms automatically (no toggle UI); the persisted preference is
//   per-device (localStorage), not account state.

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fx } from './fx';
import {
  axisFromTiltDelta,
  classifyTiltEnv,
  classifyTiltPermission,
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

export function useTilt({ controlsRef, flightAxis, appState, joyActive, onAutoAxis }) {
  const [tiltOn, setTiltOn] = useState(false);   // listener actively driving moveY
  const [tiltArmed, setTiltArmed] = useState(false); // tilt wanted (button glow, legacy)
  const [tiltMsg, setTiltMsg] = useState(null);   // transient message (auto-dismiss)

  // Refs so the single deviceorientation listener never goes stale.
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const axisRef = useRef(flightAxis);
  axisRef.current = flightAxis;
  const joyRef = useRef(joyActive);
  joyRef.current = joyActive;
  const autoAxisRef = useRef(null);
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
      const beta = e && e.beta;
      if (!Number.isFinite(beta)) return;
      // Calibrate on the first event after enabling: the user's natural hold
      // becomes neutral, so the ±8° dead-zone is measured from rest.
      if (neutralRef.current === null) neutralRef.current = beta;
      const delta = beta - neutralRef.current;
      // Auto flight axis (Merlin: no buttons — the phone's pitch IS the
      // selector). Past the ±8° dead-zone → vertical; held level → horizontal.
      // Notify only on change; otherwise the axis holds its value and no
      // redundant state update fires.
      const nextAxis = axisFromTiltDelta(delta);
      if (nextAxis !== axisRef.current) {
        axisRef.current = nextAxis;
        const cb = autoAxisRef.current;
        if (cb) cb(nextAxis);
      }
      if (joyRef.current) return; // joystick wins — never fight it
      if (!TILT_STATES.has(appStateRef.current)) return;
      if (axisRef.current !== 'vertical') return;
      const target = tiltInputFromDelta(delta);
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

  // Programmatic toggle, retained for API compatibility. Nothing renders it
  // (Merlin removed the toggle button deliberately) — the iOS permission now
  // flows through the first-tap gesture above, not through here. If ever
  // called, it must still run inside a user gesture for iOS to grant
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

  // Enablement: tilt is the primary vertical input (Merlin: "tilt instead of
  // a button"), so it arms automatically — no toggle UI. Direct-capable
  // devices subscribe on mount. iOS gates DeviceOrientationEvent behind
  // requestPermission(), which Apple requires to run inside a user gesture:
  // the FIRST TAP anywhere is that gesture (invisible infrastructure — no
  // visible button, no pop-up, never on mount).
  useEffect(() => {
    const env = tiltEnvNow();
    if (!env.ok) return; // reduced-motion or no gyro: stay off, keep it honest
    setTiltArmed(true);
    if (env.reason === 'direct') {
      startTilt();
      return () => stopTilt(false);
    }
    // iOS ('permission-needed'): one-shot first-tap permission flow, capture
    // phase so it runs before any other tap handling. ENGAGEMENT-GATED
    // (demo fix, 2026-10-15): a tap on the shell's chrome — the
    // .ui-element floaters, any button/link/input, an open dialog — is
    // ordinary browsing, NOT an engagement with the tilt-driven flight
    // feature. Such a tap must never surface a "Tilt denied" nag, so the
    // handler re-arms the one-shot listener silently and keeps waiting.
    // Only a tap on the open scene itself — the user grabbing the world
    // to fly it — runs the permission flow, and only that flow may
    // surface a denial.
    let settled = false;
    const isChromeTap = (e) => {
      const el = e && e.target;
      if (!el || typeof el.closest !== 'function') return false;
      return !!el.closest(
        '.ui-element, button, a, input, select, textarea, [role="dialog"]'
      );
    };
    const onFirstTap = (e) => {
      if (settled) return;
      if (isChromeTap(e)) {
        // Ordinary browsing: stay silent, re-arm the one-shot listener
        // this tap just consumed, and wait for a real flight engagement.
        window.addEventListener('pointerdown', onFirstTap, { once: true, capture: true });
        return;
      }
      settled = true;
      if (activeRef.current) return; // already running — nothing to do
      try {
        const DOE =
          typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined;
        if (!DOE || typeof DOE.requestPermission !== 'function') {
          startTilt(); // gate gone (or already granted) — just start
          return;
        }
        DOE.requestPermission()
          .then((res) => {
            const p = classifyTiltPermission(res);
            if (p.ok) startTilt();
            else setTiltMsg(p.message);
          })
          .catch(() => setTiltMsg('Tilt denied — enable motion access in Settings.'));
      } catch {
        /* sensor unavailable — tilt stays off, honest */
      }
    };
    window.addEventListener('pointerdown', onFirstTap, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstTap, { capture: true });
      stopTilt(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tiltOn, tiltArmed, tiltMsg, toggleTilt };
}
