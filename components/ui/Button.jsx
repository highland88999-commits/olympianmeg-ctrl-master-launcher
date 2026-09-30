'use client';

// Canonical button — 44px minimum touch target, one visual language.
// Variants: primary (cyan), gold, ghost, danger.
const VARIANTS = {
  primary:
    'bg-[#00f2ff] text-black hover:brightness-110 border border-transparent',
  gold: 'bg-[#ffd700] text-black hover:brightness-110 border border-transparent',
  ghost:
    'bg-transparent text-zinc-200 border border-white/15 hover:border-white/35 hover:text-white',
  danger:
    'bg-transparent text-[#ff003c] border border-[#ff003c]/40 hover:border-[#ff003c]',
};

export default function Button({
  variant = 'ghost',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 rounded-[10px] text-[0.8rem] font-semibold uppercase tracking-[0.08em] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.ghost} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
