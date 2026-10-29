'use client';

// Molly's dot-matrix head — the glowing-blue digitized head from her
// ARES seat. Shared: the ARES panel uses it as the 3D head's fallback,
// and the broadcast overlay uses it when she speaks an announcement
// site-wide (the 30 MB GLB is too heavy to guarantee instant on a
// broadcast arrival). Dots are clipped to an angular head silhouette;
// the eyes are two bright bars; a slow pulse keeps it alive.
import { useId } from 'react';

export default function MollyHead2D({ className = '' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clipId = `molly-head-clip-${uid}`;
  const dots = [];
  for (let row = 0; row < 26; row += 1) {
    for (let col = 0; col < 24; col += 1) {
      dots.push({ x: 8 + col * 8, y: 10 + row * 8, key: `${row}-${col}` });
    }
  }
  return (
    <svg viewBox="0 0 200 220" role="img" aria-label="Molly — digitized head"
      className={`molly-head mx-auto block w-full max-w-[220px] ${className}`}>
      <defs>
        <clipPath id={clipId}>
          <path d="M100 8 L150 22 L168 70 L162 130 L138 178 L122 205 L100 212 L78 205 L62 178 L38 130 L32 70 L50 22 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {dots.map((d) => (
          <circle key={d.key} cx={d.x} cy={d.y} r="2.1" fill="#38bdf8" opacity="0.75" />
        ))}
        <polyline points="32,70 60,100 90,84 120,108 150,88 168,70" fill="none" stroke="#7dd3fc" strokeWidth="1" opacity="0.6" />
        <polyline points="38,130 70,150 100,138 132,152 162,130" fill="none" stroke="#7dd3fc" strokeWidth="1" opacity="0.6" />
      </g>
      <path d="M100 8 L150 22 L168 70 L162 130 L138 178 L122 205 L100 212 L78 205 L62 178 L38 130 L32 70 L50 22 Z"
        fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.9" />
      <rect x="62" y="96" width="26" height="7" rx="3.5" fill="#e0f2fe" />
      <rect x="112" y="96" width="26" height="7" rx="3.5" fill="#e0f2fe" />
    </svg>
  );
}
