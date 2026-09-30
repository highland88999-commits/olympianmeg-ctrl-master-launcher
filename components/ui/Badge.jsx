'use client';

// Canonical micro-label / eyebrow — replaces the 7+ copy-pasted
// text-xs font-bold uppercase tracking-[0.25em] text-zinc-400 chains.
const TONES = {
  muted: 'text-zinc-400',
  cyan: 'text-[#00f2ff]',
  gold: 'text-[#ffd700]',
};

export default function Badge({ tone = 'muted', className = '', children, ...props }) {
  return (
    <span
      className={`text-xs font-bold uppercase tracking-[0.25em] ${TONES[tone] || TONES.muted} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
