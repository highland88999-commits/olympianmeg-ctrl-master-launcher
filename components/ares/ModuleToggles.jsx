'use client';

// Sentinel / Phalanx module toggles + the Phase 1 kill switch.
function Toggle({ on, onChange, disabled }) {
  return (
    <button onClick={() => onChange(!on)} disabled={disabled}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-fuchsia-600' : 'bg-zinc-700'} disabled:opacity-50`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export default function ModuleToggles({ settings, onChange, disabled }) {
  const killSwitch = settings.killSwitch === true;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
      <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Defense modules</h2>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-widest text-cyan-300">Sentinel</div>
            <p className="mt-1 text-[11px] text-zinc-500">Detection and evidence logging: bots, scanners, honeypot trips.</p>
          </div>
          <Toggle on={settings.sentinelEnabled} disabled={disabled}
            onChange={(v) => onChange({ ...settings, sentinelEnabled: v })} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-widest text-red-300">Phalanx</div>
            <p className="mt-1 text-[11px] text-zinc-500">Blocking: temporary bans and 403 responses for repeat offenders.</p>
          </div>
          <Toggle on={settings.phalanxEnabled} disabled={disabled}
            onChange={(v) => onChange({ ...settings, phalanxEnabled: v })} />
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-zinc-800/70 pt-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-widest text-amber-300">Kill switch — Phase 1 off</div>
            <p className="mt-1 text-[11px] text-zinc-500">Stops all rotation, watch-band randomness, and jitter at once. Scoring falls back to the static v0 rules. The system keeps defending while humans investigate.</p>
          </div>
          <Toggle on={killSwitch} disabled={disabled}
            onChange={(v) => onChange({ ...settings, killSwitch: v })} />
        </div>
      </div>
      <p className="mt-4 text-[11px] text-zinc-600">Turning Sentinel off stops all logging. Turning Phalanx off stops bans but keeps logging. {killSwitch ? 'Kill switch is ON: Phase 1 hardening is off and the static v0 rules are in force.' : 'Kill switch is off: Phase 1 rotation and watch-band handling are live (when a rotation seed is set on the server).'}</p>
    </div>
  );
}
