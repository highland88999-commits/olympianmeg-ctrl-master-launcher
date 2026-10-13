'use client';
// components/store/ShareButton.jsx
// The Omega Store's one reusable share control (Merlin, 2026-10-13:
// a share button beside every created product, and every product or
// category in the store shareable).
//
// Behaviour:
//   - Where the browser offers the Web Share API (navigator.share —
//     iOS Safari, Android Chrome, desktop Safari/Edge and some desktop
//     Chrome), tapping opens the native share sheet with the canonical
//     URL from lib/store/share.js.
//   - Everywhere else (desktop Chrome/Firefox without Web Share), the
//     link is copied to the clipboard — navigator.clipboard first, the
//     legacy textarea + execCommand('copy') path as a backstop — and
//     the button briefly reads "Link copied" with a check glyph.
//   - A user dismissing the share sheet (AbortError) is not an error
//     and never falls through to a surprise clipboard write.
// No third-party share widgets, no trackers, no pop-ups.
import { useEffect, useRef, useState } from 'react';
import { ShareIcon, CheckIcon } from '@/lib/hermes-icons';

const SIZES = {
  // Compact — product cards and category headers.
  sm: 'px-2.5 py-1.5 text-xs',
  // Full action-row — the custom designer's success screen, matching
  // its other action buttons.
  lg: 'px-4 py-3 text-sm justify-center',
};

export default function ShareButton({
  url,
  title,
  text,
  label = 'Share',
  size = 'sm',
  className = '',
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Clipboard API refused (permissions, non-secure context, older
      // browser) — try the legacy selection path before giving up.
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  };

  const onShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // Any other share failure falls through to copy-link.
      }
    }
    if (await copyLink()) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={copied ? 'Link copied' : `${label}: ${title || 'store link'}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 font-medium text-slate-300 transition hover:border-white/35 hover:text-white ${SIZES[size] || SIZES.sm} ${className}`}
    >
      {copied ? (
        <CheckIcon size={15} className="text-emerald-300" />
      ) : (
        <ShareIcon size={15} />
      )}
      {copied ? 'Link copied' : label}
    </button>
  );
}
