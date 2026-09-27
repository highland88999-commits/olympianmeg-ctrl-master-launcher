// OASIS deep-link join: reads ?code=XXXXXX on page load and auto-attempts
// the join, then scrubs the param from the address bar (chess pattern).
'use client';

import { useEffect, useRef } from 'react';
import { codeFromSearch } from '@/lib/oasis/share';
import { isValidRoomCode } from '@/lib/oasis/rooms';

/**
 * @param {(code: string) => void | Promise<void>} onJoin called once with a valid code
 * @param {boolean} enabled gate (e.g. only after the user session is known)
 */
export function useOasisJoinLink(onJoin, enabled = true) {
  const consumed = useRef(false);

  useEffect(() => {
    if (!enabled || consumed.current) return;
    if (typeof window === 'undefined') return;
    const code = codeFromSearch(window.location.search);
    if (code && isValidRoomCode(code)) {
      consumed.current = true;
      window.history.replaceState({}, document.title, window.location.pathname);
      onJoin(code);
    }
  }, [enabled, onJoin]);
}
