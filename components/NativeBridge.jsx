// components/NativeBridge.jsx — invisible native-shell bridge.
//
// Mounted once in the root layout. On the web it renders nothing and does
// nothing (initDeepLinks no-ops off native). Inside the Capacitor shell it
// wires appUrlOpen + cold-start launch URLs into SPA navigation so OASIS
// ?code= room links and other deep links land in the right pocket universe
// without a full page reload. No UI, no visual change, never throws.
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initDeepLinks } from '@/lib/native';

export default function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    initDeepLinks({
      onRoute: ({ path, search }) => {
        try {
          router.push(path + search);
        } catch {
          // fall back to a hard navigation rather than dropping the link
          try {
            window.location.assign(path + search);
          } catch {
            // routing must never break the launcher
          }
        }
      },
    }).then((fn) => {
      if (cancelled) {
        try {
          fn();
        } catch {
          // ignore
        }
      } else {
        cleanup = fn;
      }
    }).catch(() => {
      // initDeepLinks never rejects, but stay silent regardless
    });
    return () => {
      cancelled = true;
      try {
        cleanup();
      } catch {
        // ignore
      }
    };
  }, [router]);

  return null;
}
