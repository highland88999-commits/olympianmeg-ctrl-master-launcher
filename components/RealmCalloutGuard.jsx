// components/RealmCalloutGuard.jsx — mounted ONCE in app/layout.jsx.
//
// Kills the iOS long-press callout (Copy | Look Up) and text selection
// across ALL realm/game views, with zero per-realm edits. Realms are
// recognized structurally (see lib/realm-surface.js): a full-viewport game
// canvas marks the page as a realm, and the no-select treatment applies to
// the whole page. Chat, forms, stores, and other text UI have no such
// canvas, so selection keeps working there.
//
// The guard never touches gestures: orbit drag, tilt steering, gyro look,
// and the iOS first-tap motion-permission listener are pointer /
// deviceorientation events, not selection events.

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  REALM_SURFACE_CLASS,
  canvasCoversViewport,
  isSelectableTarget,
} from '@/lib/realm-surface';

function pageHasGameCanvas() {
  try {
    const rects = [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    return canvasCoversViewport(rects, window.innerWidth, window.innerHeight);
  } catch {
    return false;
  }
}

export default function RealmCalloutGuard() {
  const pathname = usePathname();

  useEffect(() => {
    let raf = 0;
    let mo = null;

    const apply = () => {
      try {
        document.body.classList.toggle(REALM_SURFACE_CLASS, pageHasGameCanvas());
      } catch {
        /* best-effort */
      }
    };

    // Canvases mount late (3D engines) and routes swap them: measure after
    // paint, and re-check whenever the DOM mutates (debounced).
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTimeout(apply, 120);
      });
    };
    schedule();
    try {
      mo = new MutationObserver(schedule);
      mo.observe(document.body, { childList: true, subtree: true });
    } catch {
      /* best-effort */
    }

    // contextmenu (iOS long-press callout, desktop right-click) and
    // selectstart: suppressed only inside a detected realm, and never for
    // selectable targets (inputs, chat text, [data-selectable]).
    const guard = (e) => {
      try {
        if (
          document.body.classList.contains(REALM_SURFACE_CLASS) &&
          !isSelectableTarget(e.target)
        ) {
          e.preventDefault();
        }
      } catch {
        /* best-effort */
      }
    };
    document.addEventListener('contextmenu', guard);
    document.addEventListener('selectstart', guard);

    return () => {
      cancelAnimationFrame(raf);
      if (mo) {
        try {
          mo.disconnect();
        } catch {
          /* best-effort */
        }
      }
      document.removeEventListener('contextmenu', guard);
      document.removeEventListener('selectstart', guard);
      try {
        document.body.classList.remove(REALM_SURFACE_CLASS);
      } catch {
        /* best-effort */
      }
    };
  }, [pathname]);

  return null;
}
