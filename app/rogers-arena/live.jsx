'use client';

// Rogers Arena — Live game center.
// Real-time NHL scores, play-by-play, and stats, served through our own
// server route (/rogers-arena/api/live). Scores are real and never invented:
// when the NHL feed is unreachable the UI says so honestly.

import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_MS = 30 * 1000;

async function apiJson(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function clockLine(game) {
  if (game.status === 'final') return 'Final';
  if (game.status === 'upcoming') {
    const when = `${dayLabel(game.startTimeUTC)} ${timeLabel(game.startTimeUTC)}`.trim();
    return when || 'Scheduled';
  }
  if (game.intermission) return `End of ${game.label} · break`;
  const t = game.timeRemaining || '';
  const running = game.running ? '' : ' (stopped)';
  return `${game.label}${t ? ` · ${t}` : ''}${running}`.trim();
}

function StatusBadge({ game }) {
  if (game.status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-400 text-xs font-bold uppercase tracking-widest">
        <span className="w-2 h-2 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden="true" />
        Live
      </span>
    );
  }
  if (game.status === 'final') {
    return (
      <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Final</span>
    );
  }
  return (
    <span className="text-cyan-300 text-xs font-bold uppercase tracking-widest">
      {`${dayLabel(game.startTimeUTC)} ${timeLabel(game.startTimeUTC)}`.trim()}
    </span>
  );
}

function ScoreRow({ game, onOpen }) {
  const score = (t) => (t.score == null ? '–' : t.score);
  return (
    <button
      onClick={() => onOpen(game)}
      className="w-full min-h-[44px] text-left px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-cyan-400/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-black tracking-wide">{game.away.abbrev}</span>
            <span className="text-zinc-500 text-sm truncate">{game.away.name}</span>
            <span className="ml-auto font-black text-lg">{score(game.away)}</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-black tracking-wide">{game.home.abbrev}</span>
            <span className="text-zinc-500 text-sm truncate">{game.home.name}</span>
            <span className="ml-auto font-black text-lg">{score(game.home)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <StatusBadge game={game} />
          <div className="text-zinc-500 text-xs mt-1">{clockLine(game)}</div>
        </div>
      </div>
    </button>
  );
}

function GameDetail({ game, onBack }) {
  const score = (t) => (t.score == null ? '–' : t.score);
  return (
    <div>
      <button
        onClick={onBack}
        className="min-h-[44px] px-4 rounded-full text-xs font-bold uppercase tracking-widest border border-white/20 text-zinc-300 hover:border-cyan-400/60"
      >
        ← All games
      </button>

      <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-4 sm:p-6 text-center">
        <StatusBadge game={game} />
        <div className="mt-2 flex items-center justify-center gap-4 sm:gap-8">
          <div>
            <div className="text-2xl sm:text-3xl font-black tracking-wide">{game.away.abbrev}</div>
            <div className="text-xs text-zinc-500 mt-1">{game.away.name}</div>
            <div className="text-4xl sm:text-5xl font-black mt-2">{score(game.away)}</div>
          </div>
          <div className="text-zinc-600 font-black text-xl">@</div>
          <div>
            <div className="text-2xl sm:text-3xl font-black tracking-wide">{game.home.abbrev}</div>
            <div className="text-xs text-zinc-500 mt-1">{game.home.name}</div>
            <div className="text-4xl sm:text-5xl font-black mt-2">{score(game.home)}</div>
          </div>
        </div>
        <div className="mt-3 text-sm text-zinc-400">{clockLine(game)}</div>
        <div className="mt-2 text-xs text-zinc-500 uppercase tracking-widest">
          Shots on goal · {game.away.abbrev} {game.away.sog ?? '–'} — {game.home.sog ?? '–'} {game.home.abbrev}
        </div>
        {game.live && (
          <p className="mt-3 text-[11px] text-zinc-500">Scores refresh automatically while the game is live.</p>
        )}
      </div>

      {game.scoring.length > 0 && (
        <section className="mt-6" aria-label="Scoring summary">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Scoring</h2>
          <ul className="space-y-2">
            {game.scoring.map((s, i) => (
              <li
                key={`${s.period}-${s.timeInPeriod}-${i}`}
                className="px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/10 text-sm"
              >
                <span className="font-black text-cyan-300">{s.team}</span>
                <span className="text-zinc-500"> · {s.periodLabel} {s.timeInPeriod}</span>
                <div className="mt-0.5 text-zinc-200">{s.detail || 'Goal'}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {game.recentPlays.length > 0 && (
        <section className="mt-6" aria-label="Recent plays">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Recent plays</h2>
          <ul className="space-y-1.5">
            {game.recentPlays.map((p, i) => (
              <li
                key={`${p.period}-${p.timeInPeriod}-${p.key}-${i}`}
                className="px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.07] text-sm flex gap-3"
              >
                <span className="shrink-0 text-zinc-500 text-xs pt-0.5 w-16">
                  {p.periodLabel} {p.timeInPeriod}
                </span>
                <span className="min-w-0">
                  <span className="font-bold">{p.team ? `${p.team} · ` : ''}{p.label}</span>
                  {p.detail && <span className="text-zinc-400"> — {p.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Live() {
  const [games, setGames] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailStatus, setDetailStatus] = useState('idle'); // idle | loading | error
  const timerRef = useRef(null);

  const loadBoard = useCallback(async () => {
    setStatus('loading');
    const { res, data } = await apiJson('/rogers-arena/api/live?view=scoreboard');
    if (!res.ok) {
      setStatus('error');
      return;
    }
    setGames(Array.isArray(data.games) ? data.games : []);
    setUpdatedAt(data.updatedAt || null);
    setStatus('idle');
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetailStatus('loading');
    const { res, data } = await apiJson(`/rogers-arena/api/live?view=game&id=${encodeURIComponent(id)}`);
    if (!res.ok || !data.game) {
      setDetailStatus('error');
      return;
    }
    setDetail(data.game);
    setDetailStatus('idle');
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const openGame = useCallback(
    (game) => {
      setSelectedId(game.id);
      setDetail(null);
      loadDetail(game.id);
    },
    [loadDetail]
  );

  const backToList = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailStatus('idle');
  }, []);

  // Auto-refresh every 30s while a live game is open and the tab is visible.
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (selectedId == null || !detail || !detail.live) return;
    const tick = () => {
      if (document.hidden) return;
      loadDetail(selectedId);
      loadBoard();
    };
    timerRef.current = setInterval(tick, REFRESH_MS);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [selectedId, detail, loadDetail, loadBoard]);

  const liveCount = games.filter((g) => g.status === 'live').length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
      <div className="pt-4 sm:pt-6 pb-4">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest uppercase">
          Live Games
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Real NHL scores, play-by-play, and stats — updated while games are live.
        </p>
      </div>

      {selectedId != null ? (
        detailStatus === 'loading' && !detail ? (
          <p className="text-zinc-400 text-sm py-8 text-center">Loading game…</p>
        ) : detailStatus === 'error' && !detail ? (
          <div className="text-center py-8">
            <p className="text-zinc-300 text-sm">Couldn&apos;t reach live scores.</p>
            <p className="text-zinc-500 text-xs mt-1">Check your connection and try again — no scores are shown rather than guessed ones.</p>
            <button
              onClick={backToList}
              className="mt-4 min-h-[44px] px-6 rounded-full text-xs font-bold uppercase tracking-widest border border-white/20 text-zinc-200 hover:border-cyan-400/60"
            >
              ← Back to games
            </button>
          </div>
        ) : detail ? (
          <GameDetail game={detail} onBack={backToList} />
        ) : null
      ) : status === 'loading' && games.length === 0 ? (
        <p className="text-zinc-400 text-sm py-8 text-center">Loading today&apos;s games…</p>
      ) : status === 'error' ? (
        <div className="text-center py-8">
          <p className="text-zinc-300 text-sm">Couldn&apos;t reach live scores.</p>
          <p className="text-zinc-500 text-xs mt-1">Check your connection and try again — no scores are shown rather than guessed ones.</p>
          <button
            onClick={loadBoard}
            className="mt-4 min-h-[44px] px-6 rounded-full text-xs font-bold uppercase tracking-widest bg-cyan-400/90 text-black"
          >
            Try again
          </button>
        </div>
      ) : games.length === 0 ? (
        <p className="text-zinc-400 text-sm py-8 text-center">No NHL games today. Check back on game day.</p>
      ) : (
        <>
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-3">
            {liveCount > 0 ? `${liveCount} live now` : "Today's games"}
            {updatedAt && (
              <span className="normal-case tracking-normal"> · updated {timeLabel(updatedAt)}</span>
            )}
          </p>
          <div className="space-y-2.5">
            {games.map((g) => (
              <ScoreRow key={g.id} game={g} onOpen={openGame} />
            ))}
          </div>
          <button
            onClick={loadBoard}
            className="mt-6 min-h-[44px] px-6 rounded-full text-xs font-bold uppercase tracking-widest border border-white/20 text-zinc-300 hover:border-cyan-400/60"
          >
            Refresh scores
          </button>
        </>
      )}
    </div>
  );
}
