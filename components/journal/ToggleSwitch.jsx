"use client";

/**
 * ToggleSwitch — a labelled two-way switch used by the Journal for
 * its sort-order and layout preferences (Merlin, 2026-10-22).
 * Everything sits in normal flow with gaps — nothing overlaps, at
 * any width: the row wraps as a unit and the track never shrinks.
 */
export default function ToggleSwitch({ label, offLabel, onLabel, checked, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span
        className={`text-sm ${checked ? "text-slate-500" : "font-semibold text-slate-100"}`}
      >
        {offLabel}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onToggle(!checked)}
        className="relative h-7 w-12 shrink-0 rounded-full border border-white/20 bg-slate-700 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <span
          aria-hidden="true"
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-sky-300 shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span
        className={`text-sm ${checked ? "font-semibold text-slate-100" : "text-slate-500"}`}
      >
        {onLabel}
      </span>
    </div>
  );
}
