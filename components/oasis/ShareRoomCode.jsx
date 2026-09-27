// OASIS ShareRoomCode — the universal copy/share room-code control.
// Same behavior in every PvP lobby: show the code, COPY it with feedback,
// SHARE it (native sheet on mobile, clipboard fallback on desktop).
// Styled to each game's visual language through the `theme` prop.
'use client';

import { useState } from 'react';
import { copyTextToClipboard, shareRoomInvite, buildJoinUrl } from '@/lib/oasis/share';

const DEFAULT_THEME = {
  accentText: 'text-fuchsia-400',
  accentBorder: 'border-fuchsia-500/50',
  accentHover: 'hover:bg-fuchsia-500/20',
  secondaryText: 'text-cyan-400',
  secondaryBorder: 'border-cyan-500/50',
};

export default function ShareRoomCode({
  gameSlug,
  code,
  codeLabel = 'ROOM CODE',
  shareTitle = 'Join my game',
  shareText,
  theme = DEFAULT_THEME,
  compact = false,
}) {
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');

  if (!code) return null;

  const flash = (msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(code);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      flash('Copy not available on this device.');
    }
  };

  const handleShare = async () => {
    const result = await shareRoomInvite({ gameSlug, code, title: shareTitle, text: shareText });
    if (result === 'copied') flash('Invite link copied to clipboard.');
    else if (result === 'failed') flash('Sharing is not available here.');
    // 'shared' needs no feedback — the OS sheet handled it.
  };

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3 p-4 sm:p-5 bg-zinc-950/90 border rounded-lg backdrop-blur-md ' + theme.accentBorder}>
      {!compact && (
        <div className={`text-xs sm:text-sm font-bold tracking-widest uppercase ${theme.accentText}`}>
          {codeLabel}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`px-4 py-2 font-mono text-xl font-bold tracking-[0.2em] text-white bg-black/50 border rounded ${theme.accentBorder}`}>
          {code}
        </div>
        <button
          onClick={handleCopy}
          className={`px-3 py-2 text-xs font-bold tracking-widest uppercase border rounded transition-colors ${theme.accentText} ${theme.accentBorder} ${theme.accentHover} active:opacity-70`}
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
        <button
          onClick={handleShare}
          className={`px-3 py-2 text-xs font-bold tracking-widest uppercase border rounded transition-colors ${theme.secondaryText} ${theme.secondaryBorder} hover:opacity-80 active:opacity-70`}
        >
          SHARE
        </button>
      </div>
      {notice && (
        <p className="text-xs tracking-widest uppercase text-zinc-400">{notice}</p>
      )}
      <p className="text-[10px] tracking-widest uppercase text-zinc-600">
        Friends open this link to jump straight in:{' '}
        <span className="text-zinc-400 break-all">
          {typeof window !== 'undefined' ? buildJoinUrl(window.location.origin, gameSlug, code) : `/${gameSlug}?code=${code}`}
        </span>
      </p>
    </div>
  );
}
