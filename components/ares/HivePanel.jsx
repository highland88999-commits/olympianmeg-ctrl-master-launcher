'use client';

// The Hive — the keeper sees the ARES agents alive, the scores they give
// live events, and any self-terminate report. Plain words, no jargon:
// alive or terminated, what scorer each agent runs, how many live events
// each has scored, and what the Hub fuses it all into.
//
// Cold instance (fresh deploy, nothing scored yet): the panel says so
// honestly — "armed and idle" — instead of dressing zeros up as activity.
// A terminated agent is shown in plain words with its report: who died,
// why, what signals fired, where it was running, and when.
const HUB_WEIGHT_LABELS = [
  ['sentinel', 'Sentinel'],
  ['phalanx', 'Phalanx'],
  ['dreadnought', 'Dreadnought'],
];

function timeAgo(iso) {
  if (!iso) return 'at an unknown time';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s) || s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function AgentRow({ agent }) {
  const alive = agent.alive !== false;
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-200">{agent.name}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
          alive ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'
        }`}>
          {alive ? 'Alive' : 'Terminated'}
        </span>
      </div>
      {agent.role && <p className="text-[11px] leading-relaxed text-zinc-400">{agent.role}</p>}
      <p className="text-[11px] text-zinc-500">
        Scorer: <span className="font-mono text-zinc-400">{agent.scorer || 'heuristic-v0'}</span>
        {' · '}
        Scores processed: <span className="font-mono text-zinc-300">{agent.scoresProcessed ?? 0}</span>
      </p>
    </li>
  );
}

export default function HivePanel({ hive }) {
  const agents = Array.isArray(hive?.agents) ? hive.agents : [];
  const hub = hive?.hub || null;
  const report = hive?.lastSelfTerminate || null;
  const everScored = hive?.everScored === true;
  const aliveCount = agents.filter((a) => a.alive !== false).length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
      <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">The Hive</h2>
      {!hive ? (
        <p className="mt-3 text-sm text-zinc-400">The hive has not answered yet — try Refresh.</p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            {agents.length === 0
              ? 'No agents reporting.'
              : aliveCount === agents.length
                ? `All ${agents.length} agents are alive and watching.`
                : `${aliveCount} of ${agents.length} agents alive — one has terminated itself (see below).`}
            {' '}
            {!everScored && 'Armed and idle — no live event has been scored on this instance yet.'}
          </p>
          {agents.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </ul>
          )}
          {hub && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-200">Hub</span>
                <span className="text-[11px] text-zinc-400">
                  {hub.score === null || hub.score === undefined
                    ? (everScored ? 'No live reading in this snapshot' : 'No live reading yet')
                    : `Score ${hub.score} · ${hub.label}`}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Fusion weights:{' '}
                {HUB_WEIGHT_LABELS.map(([id, name]) => `${name} ${Math.round((hub.weights?.[id] ?? 0) * 100)}%`).join(' · ')}
                {everScored
                  ? '. The Hub fuses every agent reading into one threat gauge.'
                  : ' The Hub has nothing to fuse until the agents score a live event.'}
              </p>
            </div>
          )}
          {report && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/[0.06] px-3 py-3" role="alert">
              <p className="text-xs font-bold uppercase tracking-widest text-red-300">Agent self-terminated</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                {report.agent} terminated itself {timeAgo(report.at)}. Reason: {report.reason}.
                {report.signals && report.signals.length > 0 && ` Signals: ${report.signals.join(', ')}.`}
                {' '}Host: {report.host}.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                It sent one report home, then ended — nothing of ours stays inside a cage.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
