// FILE: app/agent-engine/page.tsx
'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const MASTER_OWNER_EMAIL = 'olympiannexus@gmail.com';

// Phase 1: Merlin's personal master agent. Always present, full engine toolset.
const MERLIN_AGENT = {
  id: 'merlin',
  agent_name: "MERLIN'S AGENT",
  agent_role: 'Master Agent',
  help_style: 'Full engine toolset',
};

type LogEntry = {
  kind: 'user' | 'agent' | 'tool';
  role: string;
  text: string;
  tool?: string;
  args?: string;
  ts: string;
};

function shortArgs(args: any): string {
  try {
    const s = typeof args === 'string' ? args : JSON.stringify(args ?? {});
    return s.length > 64 ? s.slice(0, 61) + '…' : s;
  } catch {
    return '';
  }
}

function AgentEngineConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  // --- AGENT ROSTER STATE ---
  const [engineAgents, setEngineAgents] = useState<any[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('merlin');

  // --- PER-AGENT IN-MEMORY LOGS (server persists the run ledger) ---
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // --- PENDING WRITE APPROVALS (per Merlin's governance rule) ---
  const [confirmations, setConfirmations] = useState<any[]>([]);

  const selectedAgent =
    selectedKey === 'merlin'
      ? MERLIN_AGENT
      : engineAgents.find((a) => String(a.id) === selectedKey) || MERLIN_AGENT;

  const log: LogEntry[] = logs[selectedKey] || [];

  // --- SESSION GATE: Merlin only in Phase 1 ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || session.user?.email?.toLowerCase() !== MASTER_OWNER_EMAIL) {
        router.push('/');
        return;
      }
      setSession(session);
      setMounted(true);
      fetchEngineAgents(session.access_token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user?.email?.toLowerCase() !== MASTER_OWNER_EMAIL) router.push('/');
      else setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // --- QUERY PARAM: ?agent=merlin preselects Merlin's agent ---
  useEffect(() => {
    if (searchParams.get('agent') === 'merlin') setSelectedKey('merlin');
  }, [searchParams]);

  const fetchEngineAgents = async (token: string) => {
    try {
      const res = await fetch('/api/user-agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.agents) {
        setEngineAgents(data.agents.filter((a: any) => a.engine_enabled === true));
      }
    } catch (e) {
      console.error('Failed to load engine-enabled agents:', e);
    }
  };

  // --- AUTO-SCROLL ---
  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, chatLoading, selectedKey]);

  const handleSendMessage = async (overrideMsg?: string, confirmed?: any[]) => {
    const raw = overrideMsg !== undefined ? overrideMsg : chatInput.trim();
    if (!raw || !session || chatLoading) return;
    const msg = raw;
    if (overrideMsg === undefined) setChatInput('');
    const key = selectedKey;
    const agentRef = selectedAgent;

    const userEntry: LogEntry = {
      kind: 'user',
      role: 'user',
      text: msg,
      ts: new Date().toISOString(),
    };
    const base = [...(logs[key] || []), userEntry];
    setLogs((prev) => ({ ...prev, [key]: base }));
    setChatLoading(true);

    try {
      const history = base.slice(-10).map((e) => ({ role: e.role, text: e.text }));
      const res = await fetch('/api/agent-engine/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          agent: key === 'merlin' ? 'merlin' : agentRef.id,
          message: msg,
          history,
          ...(confirmed && confirmed.length ? { confirmed } : {}),
        }),
      });
      const data = await res.json();

      if (Array.isArray(data.confirmationRequests) && data.confirmationRequests.length) {
        setConfirmations(data.confirmationRequests);
      }

      const entries: LogEntry[] = [...base];
      (data.toolCalls || []).forEach((tc: any) => {
        entries.push({
          kind: 'tool',
          role: 'tool',
          tool: String(tc.tool || 'unknown'),
          args: shortArgs(tc.args),
          text: String(tc.result ?? ''),
          ts: new Date().toISOString(),
        });
      });
      entries.push({
        kind: 'agent',
        role: 'agent',
        text: data.reply || 'No response synthesized.',
        ts: new Date().toISOString(),
      });
      setLogs((prev) => ({ ...prev, [key]: entries }));
    } catch (e: any) {
      setLogs((prev) => ({
        ...prev,
        [key]: [
          ...(prev[key] || []),
          {
            kind: 'agent',
            role: 'agent',
            text: `UPLINK ERROR: ${e.message}`,
            ts: new Date().toISOString(),
          },
        ],
      }));
    } finally {
      setChatLoading(false);
    }
  };

  const handleApprove = (c: any) => {
    setConfirmations((prev) => prev.filter((x) => x.confirmKey !== c.confirmKey));
    handleSendMessage('Approved — execute it.', [
      { confirmKey: c.confirmKey, tool: c.tool, args: c.args },
    ]);
  };

  const handleDecline = (c: any) => {
    setConfirmations((prev) => prev.filter((x) => x.confirmKey !== c.confirmKey));
    const key = selectedKey;
    const entry: LogEntry = {
      kind: 'agent',
      role: 'agent',
      text: 'Declined — the action was not executed.',
      ts: new Date().toISOString(),
    };
    setLogs((prev) => ({ ...prev, [key]: [...(prev[key] || []), entry] }));
  };

  if (!mounted || !session) return <div className="w-screen h-screen bg-[#050508]" />;

  return (
    <div className="w-screen h-[100dvh] bg-[#050508] text-white font-mono flex flex-col overflow-hidden select-none">
      {/* TOP HEADER BAR */}
      <header className="flex flex-wrap items-center justify-between px-6 py-4 bg-zinc-950/90 border-b border-cyan-500/30 z-20">
        <div className="flex items-center gap-4">
          <span className="text-lg font-black tracking-[0.25em] text-cyan-400 uppercase">
            OLYMPUS // AGENT ENGINE
          </span>
          <span className="text-[10px] px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
            NODE: {session.user.email}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-xs font-bold tracking-widest text-zinc-400 uppercase border rounded bg-black/80 border-zinc-700 hover:text-red-400 hover:border-red-400"
          >
            EXIT HUB
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT COLUMN: AGENT ROSTER */}
        <div className="lg:col-span-4 border-r border-zinc-800 bg-zinc-950/60 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {/* PINNED: MERLIN'S MASTER AGENT */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
              MASTER AGENT
            </span>
            <div
              onClick={() => setSelectedKey('merlin')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedKey === 'merlin'
                  ? 'bg-fuchsia-950/40 border-fuchsia-400 shadow-[0_0_15px_rgba(255,0,255,0.15)]'
                  : 'bg-black/40 border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white uppercase">{MERLIN_AGENT.agent_name}</span>
                <span className="text-[10px] text-fuchsia-400 uppercase">{MERLIN_AGENT.agent_role}</span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 truncate">
                Style: &ldquo;{MERLIN_AGENT.help_style}&rdquo;
              </p>
            </div>
          </div>

          {/* ENGINE-ENABLED USER AGENTS */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
              ENGINE-ENABLED AGENTS ({engineAgents.length})
            </span>
            {engineAgents.length === 0 && (
              <div className="text-xs text-zinc-600 italic p-4 border border-dashed border-zinc-800 rounded text-center">
                No engine-enabled agents yet. Flip the engine switch on an agent in the Forge to command it here.
              </div>
            )}
            {engineAgents.map((ag) => (
              <div
                key={ag.id}
                onClick={() => setSelectedKey(String(ag.id))}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedKey === String(ag.id)
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.15)]'
                    : 'bg-black/40 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-white uppercase">{ag.agent_name}</span>
                  <span className="text-[10px] text-cyan-400 uppercase">{ag.agent_role}</span>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1 truncate">
                  Style: &ldquo;{ag.help_style}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: ENGINE CONSOLE */}
        <div className="lg:col-span-8 flex flex-col bg-[#030306] overflow-hidden">
          <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-widest">
                {selectedAgent.agent_name} // {selectedAgent.agent_role}
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                ENGINE LINKED · TOOLSET ARMED
              </p>
            </div>
          </div>

          <div ref={logScrollRef} className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
            {log.length === 0 && (
              <div className="m-auto text-center max-w-md p-6 border border-zinc-800/80 rounded-xl bg-zinc-950/40">
                <div className="text-xs text-cyan-400 uppercase tracking-widest mb-2">
                  {selectedAgent.agent_name} ONLINE
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Describe the task. I can read the Brain, search places, check telemetry, look up store templates and creations — and with your approval, create real store products or mint checkout links.
                </p>
              </div>
            )}

            {log.map((entry, i) =>
              entry.kind === 'tool' ? (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[85%] p-3 rounded-xl text-xs leading-relaxed bg-black/60 border border-emerald-500/30">
                    <div className="text-emerald-400 tracking-widest uppercase">
                      ⚙ TOOL · {entry.tool}({entry.args})
                    </div>
                    <div className="text-zinc-400 mt-1 whitespace-pre-wrap">{entry.text}</div>
                  </div>
                </div>
              ) : (
                <div key={i} className={`flex ${entry.kind === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] p-4 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                      entry.kind === 'user'
                        ? 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-100'
                        : 'bg-zinc-900/90 border border-zinc-700 text-zinc-200'
                    }`}
                  >
                    {entry.text}
                  </div>
                </div>
              )
            )}

            {chatLoading && (
              <div className="text-xs text-cyan-400 animate-pulse tracking-widest">
                {selectedAgent.agent_name.toUpperCase()} IS SYNTHESIZING…
              </div>
            )}

            {confirmations.map((c) => (
              <div key={c.confirmKey} className="flex justify-start">
                <div className="max-w-[85%] p-4 rounded-xl text-xs leading-relaxed bg-amber-950/40 border border-amber-400/50">
                  <div className="text-amber-300 tracking-widest uppercase mb-2">
                    ⚠ APPROVAL REQUIRED · {String(c.tool).replace(/_/g, ' ')}
                  </div>
                  <div className="text-zinc-200 whitespace-pre-wrap">{c.summary}</div>
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => handleApprove(c)}
                      disabled={chatLoading}
                      className="px-5 py-2 text-xs font-bold tracking-widest uppercase bg-amber-400 text-black rounded-lg hover:bg-white transition-all disabled:opacity-50"
                    >
                      APPROVE
                    </button>
                    <button
                      onClick={() => handleDecline(c)}
                      disabled={chatLoading}
                      className="px-5 py-2 text-xs font-bold tracking-widest uppercase border border-zinc-600 text-zinc-300 rounded-lg hover:border-red-400 hover:text-red-400 transition-all disabled:opacity-50"
                    >
                      DECLINE
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex gap-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={`Command ${selectedAgent.agent_name}…`}
              className="flex-1 p-3 text-xs bg-black border border-zinc-700 rounded-lg text-white focus:border-cyan-400 outline-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={chatLoading}
              className="px-6 py-3 text-xs font-bold tracking-widest uppercase bg-cyan-400 text-black rounded-lg hover:bg-white transition-all"
            >
              TRANSMIT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentEnginePage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-[#050508]" />}>
      <AgentEngineConsole />
    </Suspense>
  );
}
