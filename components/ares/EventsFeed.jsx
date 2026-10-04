'use client';

// Recent events feed. Shows fingerprints (never raw IPs) and plain labels.
const LABELS = {
  honeypot_hit: 'Honeypot trip',
  scanner_path: 'Scanner probe',
  bot_blocked: 'Bot blocked',
  rate_limited: 'Rate limited',
  blocked_ip_hit: 'Banned visitor retry',
};

const COLORS = {
  honeypot_hit: 'border-fuchsia-500/40 text-fuchsia-300',
  scanner_path: 'border-orange-500/40 text-orange-300',
  bot_blocked: 'border-red-500/40 text-red-300',
  rate_limited: 'border-yellow-500/40 text-yellow-200',
  blocked_ip_hit: 'border-zinc-500/40 text-zinc-300',
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function EventsFeed({ events = [] }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 backdrop-blur-md">
      <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">Recent events</h2>
      {events.length === 0 ? (
        <div className="ares-empty" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ flex: 'none' }}>
            <path d="M12 3 L20 6 V11 C20 16 16.6 19.4 12 21 C7.4 19.4 4 16 4 11 V6 Z" />
            <path d="M9 11.5 L11.4 14 L15.4 9.6" />
          </svg>
          <span>Quiet. Nothing logged yet — the watchtower is watching.</span>
        </div>
      ) : (
        <ul className="mt-4 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {events.map((e) => (
            <li key={e.id} className={`rounded-lg border bg-black/40 px-3 py-2 ${COLORS[e.event_type] || 'border-zinc-700 text-zinc-300'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest">{LABELS[e.event_type] || e.event_type}</span>
                <span className="shrink-0 text-[10px] text-zinc-500">{timeAgo(e.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                {e.path && <span className="font-mono">{e.path}</span>}
                <span className="font-mono" title="Hashed visitor fingerprint, not an IP address">
                  {String(e.ip_hash).slice(0, 12)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-zinc-600">Visitor identities are stored as one-way hashes. Raw IP addresses are never kept.</p>
    </div>
  );
}
