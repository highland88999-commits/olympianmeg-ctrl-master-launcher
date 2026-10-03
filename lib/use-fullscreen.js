// lib/use-fullscreen.js — fullscreen + focus-mode for the Shadow Realm ride.
//
// Honest capability model (never fake fullscreen):
//   'native'      — Fullscreen API present (desktop Chrome/Safari, Android
//                   Chrome): requestFullscreen() on the game container, with
//                   proper exit handling via fullscreenchange.
//   'focus-only'  — iOS Safari: NO element-fullscreen API exists (only
//                   <video> gets webkitEnterFullscreen). Best available is
//                   focus mode: hide all page chrome/overlays during the ride
//                   and attempt screen.orientation.lock('landscape'), which
//                   iOS also rejects — caught and ignored, reported honestly.
//   'unsupported' — neither available: the toggle explains itself and does nothing.
//
// The toggle is one immersion switch: on desktop it enters true fullscreen +
// focus chrome-hiding; on iPhone it enters focus chrome-hiding only, with a
// transient toast saying exactly that.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyFullscreenEnv, isIOSDevice } from './fullscreen-env';

function envNow() {
  const doc = typeof document !== 'undefined' ? document : null;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const el = doc ? doc.documentElement : null;
  return classifyFullscreenEnv({
    hasRequestFullscreen: !!el && typeof el.requestFullscreen === 'function',
    isIOS: isIOSDevice(nav),
  });
}

export function useFullscreen(containerRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false); // chrome hidden (both modes)
  const [fsMsg, setFsMsg] = useState(null);
  const fsMsgTimer = useRef(null);

  const say = useCallback((msg) => {
    setFsMsg(msg);
    if (fsMsgTimer.current) clearTimeout(fsMsgTimer.current);
    fsMsgTimer.current = setTimeout(() => setFsMsg(null), 2800);
  }, []);

  useEffect(() => () => {
    if (fsMsgTimer.current) clearTimeout(fsMsgTimer.current);
  }, []);

  // Track real fullscreen state (user can also exit via Escape / swipe).
  useEffect(() => {
    const onChange = () => {
      const fsEl =
        document.fullscreenElement || document.webkitFullscreenElement || null;
      const on = !!fsEl;
      setIsFullscreen(on);
      if (!on) setFocusMode(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const tryOrientationLock = useCallback(() => {
    // Best effort only: iOS Safari has no screen.orientation.lock and throws;
    // Android Chrome honors it inside fullscreen. Never let it break the ride.
    try {
      const o = window.screen && window.screen.orientation;
      if (o && typeof o.lock === 'function') {
        const p = o.lock('landscape');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      /* iOS: not supported — focus mode still applies */
    }
  }, []);

  const exitNative = useCallback(() => {
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen();
      } else if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === 'function') {
        document.webkitExitFullscreen();
      } else {
        setIsFullscreen(false);
        setFocusMode(false);
      }
    } catch {
      setIsFullscreen(false);
      setFocusMode(false);
    }
  }, []);

  // The immersion toggle. MUST be called from a user gesture on some browsers
  // for requestFullscreen to be granted.
  const toggleFullscreen = useCallback(() => {
    const env = envNow();
    if (env.mode === 'unsupported') {
      say(env.message);
      return;
    }
    // Exiting: leave native fullscreen if in it, always drop focus mode.
    if (isFullscreen || focusMode) {
      if (isFullscreen) exitNative();
      else setFocusMode(false);
      return;
    }
    // Entering.
    if (env.mode === 'native') {
      const el = containerRef && containerRef.current;
      if (el && typeof el.requestFullscreen === 'function') {
        const p = el.requestFullscreen();
        if (p && typeof p.catch === 'function') {
          p.catch(() => say('Fullscreen was blocked — focus mode on instead.'));
        }
      }
      setFocusMode(true);
      tryOrientationLock();
      return;
    }
    // focus-only (iOS): honest best-available, said out loud once per toggle.
    setFocusMode(true);
    tryOrientationLock();
    say(env.message);
  }, [containerRef, isFullscreen, focusMode, exitNative, tryOrientationLock, say]);

  // If the page unmounts mid-ride, leave fullscreen rather than stranding it.
  useEffect(() => {
    return () => {
      try {
        if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
          document.exitFullscreen();
        }
      } catch {
        /* teardown is best-effort */
      }
    };
  }, []);

  return { isFullscreen, focusMode, fsMsg, toggleFullscreen };
}
