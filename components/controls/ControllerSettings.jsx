'use client';

// components/controls/ControllerSettings.jsx
//
// The controller's Settings panel (Merlin's design): layout options
// that are variations of HIS arrangement — Signature / Low / Ghost /
// Mirrored / Custom — plus pad size, border transparency, labels,
// desktop mode, and camera feel. Every change applies instantly and
// is persisted the moment it's made (see lib/controls/settings.js):
// the last choice is restored on load and never changes on its own.

import {
  LAYOUT_IDS,
  LAYOUT_LABELS,
  DEFAULT_CONTROLLER_SETTINGS,
} from '../../lib/controls/settings.js';

const LAYOUT_HINTS = {
  signature: 'As drawn — pads at the corners',
  low: 'Hugs the bottom edge',
  ghost: 'Smaller, fainter at rest',
  mirrored: 'Left and right swapped',
  custom: 'Your own placement — drag the pads',
};

function Slider({ label, value, min, max, step, format, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] font-black tracking-widest text-white/60">
        <span>{label}</span>
        <span className="text-white/85">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-red-500"
      />
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
      style={{ touchAction: 'manipulation' }}
    >
      <span className="text-[11px] font-black tracking-widest text-white/60">{label}</span>
      <span className={`text-[11px] font-black ${value ? 'text-emerald-300' : 'text-white/35'}`}>
        {value ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export default function ControllerSettings({
  settings,
  onChange,
  onClose,
  editMode,
  onToggleEditMode,
}) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/65 sm:items-center"
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="max-h-[86%] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/12 bg-[#101018] px-4 pb-6 pt-4 text-white sm:rounded-3xl"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black tracking-[0.25em] text-white/85">CONTROLLER</h2>
          <button
            onClick={onClose}
            aria-label="Close controller settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white/80"
            style={{ touchAction: 'manipulation' }}
          >✕</button>
        </div>

        {/* layouts — variations of Merlin's arrangement only */}
        <h3 className="mb-2 text-[11px] font-black tracking-[0.25em] text-white/40">LAYOUT</h3>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_IDS.map((id) => (
            <button
              key={id}
              onClick={() => set({ layout: id })}
              className={`rounded-xl border-2 px-3 py-2.5 text-left ${
                settings.layout === id ? 'border-red-400 bg-red-500/15' : 'border-white/10 bg-white/5'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className={`text-sm font-black ${settings.layout === id ? 'text-red-200' : 'text-white/75'}`}>
                {LAYOUT_LABELS[id]}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-white/40">{LAYOUT_HINTS[id]}</div>
            </button>
          ))}
          {settings.layout === 'custom' ? (
            <button
              onClick={onToggleEditMode}
              className={`rounded-xl border-2 px-3 py-2.5 text-left ${
                editMode ? 'border-amber-300 bg-amber-400/20' : 'border-amber-300/50 bg-amber-400/10'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className="text-sm font-black text-amber-200">{editMode ? 'DONE ARRANGING' : 'ARRANGE PADS'}</div>
              <div className="mt-0.5 text-[10px] leading-snug text-white/40">
                Drag each pad over the live arena. Saved the moment you set it down.
              </div>
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4">
          <Slider label="PAD SIZE" value={settings.padScale} min={0.8} max={1.3} step={0.05}
            format={pct} onChange={(v) => set({ padScale: v })} />
          <Slider label="BORDER TRANSPARENCY" value={settings.borderOpacity} min={0.15} max={1} step={0.05}
            format={pct} onChange={(v) => set({ borderOpacity: v })} />
          <Toggle label="LABELS" value={settings.labels} onChange={(v) => set({ labels: v })} />
        </div>

        <h3 className="mb-2 mt-5 text-[11px] font-black tracking-[0.25em] text-white/40">DESKTOP</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['standard', 'Standard', 'Keyboard always works'],
            ['mousepad', 'Mouse Pad', 'Click the neutral center to engage'],
          ].map(([id, label, hint]) => (
            <button
              key={id}
              onClick={() => set({ desktopMode: id })}
              className={`rounded-xl border-2 px-3 py-2.5 text-left ${
                settings.desktopMode === id ? 'border-red-400 bg-red-500/15' : 'border-white/10 bg-white/5'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <div className={`text-sm font-black ${settings.desktopMode === id ? 'text-red-200' : 'text-white/75'}`}>{label}</div>
              <div className="mt-0.5 text-[10px] leading-snug text-white/40">{hint}</div>
            </button>
          ))}
        </div>

        <h3 className="mb-2 mt-5 text-[11px] font-black tracking-[0.25em] text-white/40">CAMERA</h3>
        <div className="grid gap-4">
          <Slider label="CAMERA SENSITIVITY" value={settings.cameraSensitivity} min={0.4} max={2} step={0.1}
            format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set({ cameraSensitivity: v })} />
          <Toggle label="INVERT Y" value={settings.invertY} onChange={(v) => set({ invertY: v })} />
          <p className="text-[10px] leading-snug text-white/35">
            Camera settings drive the dead-space camera in roaming games.
            Kombat's camera is fixed arena framing — the dead space rests here.
          </p>
        </div>

        <button
          onClick={() => onChange({ ...DEFAULT_CONTROLLER_SETTINGS, custom: {} })}
          className="mt-6 w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-[11px] font-black tracking-widest text-white/60"
          style={{ touchAction: 'manipulation' }}
        >RESET TO SIGNATURE DEFAULTS</button>
      </div>
    </div>
  );
}
