'use client';
// components/EarthTeamPanel.jsx — Earth 1 mapping teams
// + team garage (Merlin, 2026-10-26 evening orders).
//
// TEAM LAW (2026-10-26 23:00 — SUPERSEDES "teams optional"):
// team joining for the Earth/Oblivion program is MANDATORY.
// Earth 2 entry is earned through a team: a solo team of one
// counts as solo effort, a team of up to five as group effort.
// Oblivion is an earned achievement either way. Personal
// mapping progress is NEVER deleted for teamless users, but
// the panel never presents a teamless user as eligible.
//
// What it does:
//   - Create a team (name it), create a SOLO team in one tap,
//     or join one from the all-teams roster (max 5 members,
//     hard cap enforced server-side twice); leave any time.
//   - The roster lists ALL existing teams with a Join team
//     button each. One team per user: a teamed user sees their
//     own team marked and other teams' Join buttons disabled
//     with the leave-first explanation.
//   - Standings: team name, rank, distinct ground covered.
//     Scores are DISTINCT ground (union of members' swept
//     cells) — overlaps count once, headcount alone never wins.
//   - Garage: the team's customizable 5-car garage — one bay per
//     member, floor + wall finish pickers in the Fortress room
//     idiom (the Fortress itself is untouched). The garage is
//     this panel's room: it is NOT placed on the Earth surface,
//     so no runway is ever touched.
//   - Craft parking: the panel reports the viewer's current craft
//     pick (localStorage, same key the picker writes) to their
//     team row, so bays show each member's parked craft. A bay
//     with no craft shows "No craft parked yet" — never a fake.
//   - Guests (no session) see a sign-in note: teams are
//     per-account by design.
//   - Before the teams migration has been run, the panel says
//     teams aren't ready yet — never an error, never a fake list.
//     The roster and the mandatory prompt light up only once
//     that migration is run (Merlin's dashboard step).

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CRAFT_PICK_KEY } from '@/lib/earth/vehicles';
import {
  MAX_TEAM_MEMBERS,
  PRIZE_DOLLARS_BY_PLACE,
  GARAGE_FLOOR_FINISHES,
  GARAGE_WALL_FINISHES,
} from '@/lib/earth/teams';

const PRIZE_NOTE = 'Oblivion Day prizes (in-world aether per member): 1st $10, 2nd $8, 3rd $6, 4th $4, 5th $2.';

async function teamFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data && data.session && data.session.access_token;
  if (!token) return { signedOut: true };
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { error: (json && json.error) || 'Teams request failed.' };
  return json;
}

export default function EarthTeamPanel() {
  const [state, setState] = useState({ loading: true });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [myUserId, setMyUserId] = useState(null);
  const lastCraftRef = useRef(null);

  const refresh = useCallback(async () => {
    const json = await teamFetch('/api/earth/teams');
    if (json.signedOut) {
      setState({ loading: false, signedOut: true });
      return;
    }
    if (json.error) {
      setState({ loading: false, error: json.error });
      return;
    }
    setState({ loading: false, ...json });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Report the viewer's craft pick to their team row (bays show
  // each member's parked craft). Only when the pick changed, and
  // only while on a team — the route refuses otherwise anyway.
  useEffect(() => {
    if (!state.myTeam) return undefined;
    let stopped = false;
    const report = async () => {
      let pick = null;
      try { pick = localStorage.getItem(CRAFT_PICK_KEY); } catch {}
      if (stopped || pick === lastCraftRef.current) return;
      lastCraftRef.current = pick;
      await teamFetch('/api/earth/teams', {
        method: 'POST',
        body: JSON.stringify({ action: 'craft', craftId: pick || null }),
      });
      if (!stopped) refresh();
    };
    report();
    const id = setInterval(report, 2000);
    return () => { stopped = true; clearInterval(id); };
  }, [state.myTeam, refresh]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data && data.session && data.session.user) setMyUserId(data.session.user.id);
    }).catch(() => {});
  }, []);

  const act = async (body, label) => {
    setBusy(label);
    setNote('');
    const json = await teamFetch('/api/earth/teams', { method: 'POST', body: JSON.stringify(body) });
    setBusy('');
    if (json.error) {
      setNote(json.error);
      return;
    }
    await refresh();
  };

  if (state.loading) {
    return <div className="text-[12px] text-zinc-400">Loading teams…</div>;
  }
  if (state.signedOut) {
    return <div className="text-[12px] text-zinc-400">Sign in to create or join a team. Earth 2 entry is earned through a team — a solo team of one counts. Your mapped ground is never removed.</div>;
  }
  if (state.error) {
    return <div className="text-[12px] text-red-300">{state.error}</div>;
  }
  if (!state.teamsReady) {
    return <div className="text-[12px] text-zinc-400">Teams aren&apos;t ready yet — the teams table hasn&apos;t been set up. Solo mapping still counts toward the global Earth total. Once teams are ready, Earth 2 entry is earned through a team — a solo team of one counts.</div>;
  }

  const myTeam = state.myTeam;
  const myStanding = myTeam && state.standings
    ? state.standings.find((s) => s.teamId === myTeam.id)
    : null;

  // The all-teams roster, shared by both branches: every team
  // that exists, each with a Join team button. A teamed viewer
  // sees their own team marked and other teams' Join buttons
  // disabled — one team per user, leave first to switch.
  const renderRoster = () => (
    <div className="flex flex-col gap-1">
      <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-500">All teams · roster</div>
      {(state.teams || []).map((t) => {
        const full = t.memberCount >= MAX_TEAM_MEMBERS;
        const isMine = myTeam && t.id === myTeam.id;
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-zinc-900/60 border border-zinc-800">
            <span className="flex-1 min-w-0 text-[12px] text-zinc-100 truncate">
              {t.name}
              {isMine ? <span className="text-amber-200"> · Your team</span> : null}
            </span>
            <span className="text-[11px] text-zinc-500">{t.memberCount}/{MAX_TEAM_MEMBERS}</span>
            {!isMine && (
              <button
                disabled={busy !== '' || full || !!myTeam}
                title={myTeam ? 'Leave your team first to join another team.' : undefined}
                onClick={() => act({ action: 'join', teamId: t.id }, `join-${t.id}`)}
                className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-500/50 text-[11px] font-bold text-cyan-200 disabled:opacity-50"
              >
                {full ? 'Full' : 'Join team'}
              </button>
            )}
          </div>
        );
      })}
      {(state.teams || []).length === 0 && (
        <div className="text-[12px] text-zinc-400">No teams yet — create the first one.</div>
      )}
      {myTeam && (
        <div className="text-[11px] text-zinc-500">On a team already — leave it first to join another team.</div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {note && <div className="text-[12px] text-amber-200">{note}</div>}
      {!myTeam && (
        <>
          <div className="px-2 py-2 rounded bg-amber-950/40 border border-amber-600/40">
            <div className="text-[12px] font-bold text-amber-100">Earth 2 entry is earned through a team</div>
            <div className="text-[11px] text-zinc-400">A solo team of one counts — that is solo effort. Or join a team below and map together. Your mapped ground is never removed, with or without a team.</div>
          </div>
          <button
            disabled={busy !== ''}
            onClick={() => act({ action: 'create-solo' }, 'create-solo')}
            className="w-full py-2 rounded bg-amber-500/20 border border-amber-500/50 text-[12px] font-bold text-amber-200 disabled:opacity-50"
          >
            Create a solo team
          </button>
          <div className="flex gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your team…"
              maxLength={40}
              className="flex-1 min-w-0 px-2 py-1.5 rounded bg-zinc-900/60 border border-zinc-800 text-[12px] text-zinc-100 placeholder:text-zinc-500"
            />
            <button
              disabled={busy !== '' || !name.trim()}
              onClick={() => act({ action: 'create', name: name.trim() }, 'create')}
              className="px-3 py-1.5 rounded bg-amber-500/20 border border-amber-500/50 text-[12px] font-bold text-amber-200 disabled:opacity-50"
            >
              Create team
            </button>
          </div>
          <div className="text-[11px] text-zinc-500">Max {MAX_TEAM_MEMBERS} members per team. One team per user — leave your team first to join another.</div>
          {renderRoster()}
        </>
      )}
      {myTeam && (
        <>
          <div className="px-2 py-1.5 rounded bg-amber-950/40 border border-amber-600/40">
            <div className="text-[13px] font-bold text-amber-100">{myTeam.name}</div>
            {myStanding && (
              <div className="text-[11px] text-zinc-400">
                Rank #{myStanding.place} · {myStanding.coveredCells.toLocaleString()} cells · {myStanding.percent.toFixed(1)}% of Earth (distinct ground)
              </div>
            )}
            {!myStanding && (
              <div className="text-[11px] text-zinc-400">Standings need the global registry — your team still counts once it answers.</div>
            )}
          </div>
          {/* Garage: the team's customizable 5-car garage. A panel
              room reached from here — never placed on Earth, so
              no runway is ever touched. */}
          <div className="rounded border border-zinc-800 overflow-hidden">
            <div className="px-2 py-1 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">
              🏎 {myTeam.name} garage
            </div>
            <div className="flex flex-col gap-1 px-2 pb-2">
              {myTeam.garage.bays.map((bay) => (
                <div key={bay.bay} className="flex items-center gap-2 px-2 py-1.5 rounded bg-zinc-900/60 border border-zinc-800">
                  <span className="text-[11px] text-zinc-500 w-10">Bay {bay.bay}</span>
                  {bay.occupied ? (
                    <span className="flex-1 min-w-0 text-[12px] text-zinc-100 truncate">
                      {bay.craftEmoji ? `${bay.craftEmoji} ` : ''}{bay.craftName || 'No craft parked yet'}
                      {myUserId && bay.userId === myUserId ? <span className="text-zinc-500"> · your bay</span> : null}
                    </span>
                  ) : (
                    <span className="flex-1 text-[12px] text-zinc-500">Open bay</span>
                  )}
                </div>
              ))}
            </div>
            <div className="px-2 pb-2 flex flex-col gap-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-zinc-500 mr-1">Floor</span>
                {GARAGE_FLOOR_FINISHES.map((f) => (
                  <button
                    key={f.id}
                    disabled={busy !== ''}
                    onClick={() => act({ action: 'finishes', floorFinish: f.id }, `floor-${f.id}`)}
                    title={f.label}
                    className={`w-6 h-6 rounded-full border-2 ${myTeam.floorFinish === f.id ? 'border-amber-400' : 'border-zinc-700'}`}
                    style={{ backgroundColor: f.color }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-zinc-500 mr-1">Walls</span>
                {GARAGE_WALL_FINISHES.map((f) => (
                  <button
                    key={f.id}
                    disabled={busy !== ''}
                    onClick={() => act({ action: 'finishes', wallFinish: f.id }, `wall-${f.id}`)}
                    title={f.label}
                    className={`w-6 h-6 rounded-full border-2 ${myTeam.wallFinish === f.id ? 'border-amber-400' : 'border-zinc-700'}`}
                    style={{ backgroundColor: f.color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <button
            disabled={busy !== ''}
            onClick={() => act({ action: 'leave' }, 'leave')}
            className="w-full py-1.5 text-[11px] font-bold text-zinc-400 border border-zinc-800 rounded hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
          >
            Leave team
          </button>
          {renderRoster()}
        </>
      )}
      {/* Standings: names + scores only — no other team's roster. */}
      {(state.standings || []).length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-500">Standings · distinct ground</div>
          {state.standings.map((s) => (
            <div key={s.teamId} className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-900/40 border border-zinc-800/60">
              <span className="text-[11px] text-zinc-500 w-6">#{s.place}</span>
              <span className="flex-1 min-w-0 text-[12px] text-zinc-200 truncate">{s.name}</span>
              <span className="text-[11px] text-zinc-500">{s.percent.toFixed(1)}%</span>
              {s.place <= PRIZE_DOLLARS_BY_PLACE.length && (
                <span className="text-[11px] text-amber-200">${PRIZE_DOLLARS_BY_PLACE[s.place - 1]} / member</span>
              )}
            </div>
          ))}
          <div className="text-[11px] text-zinc-500">{PRIZE_NOTE}</div>
        </div>
      )}
    </div>
  );
}
