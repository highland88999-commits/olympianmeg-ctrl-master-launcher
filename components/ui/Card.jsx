'use client';

// Canonical card/panel — the single panel language for the launcher.
// Replaces the dozens of hand-rolled bg-black/60 border-zinc-800 rounded panels.
export default function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-[#0b0b0d] border border-white/10 rounded-2xl p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
