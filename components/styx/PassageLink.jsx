'use client';

import { useEffect, useState } from 'react';

/**
 * Floating "continue the passage" button. Rendered inside the four life
 * stations (anti-life, life, meaning-of-life, the-afterlife) — visible only
 * when the traveler arrived via the Styx passage (?passage=1).
 */
export default function PassageLink() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('passage') === '1') {
        setShow(true);
      }
    } catch {
      /* no URL — no passage */
    }
  }, []);

  if (!show) return null;

  return (
    <a
      href="/styx?advanced=1"
      className="fixed z-50 right-4 px-5 py-3 rounded-full text-sm tracking-widest uppercase
                 bg-black/70 border border-[#ffd700]/60 text-[#ffd700]
                 backdrop-blur-sm hover:bg-[#ffd700]/15 transition-colors"
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      Continue the Passage →
    </a>
  );
}
