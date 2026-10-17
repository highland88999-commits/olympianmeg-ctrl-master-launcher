// FILE: app/agent-forge/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const MASTER_OWNER_EMAIL = 'olympiannexus@gmail.com';

const INITIAL_CREATED_FILES = [
  'app/api/agents/command/route.ts',
  'app/api/brain/route.ts',
  'app/api/user-agents/route.ts',
  'app/agent-forge/page.tsx',
  'public/muse_provision_manifest.txt'
];

export default function AgentForgeAndBrainConsole() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'forge' | 'brain'>('forge');

  // --- PUBLIC USER AGENT FORGE STATE (Isolated per User Account) ---
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [helpStyle, setHelpStyle] = useState('');
  const [creating, setCreating] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // --- OWNER-ONLY BRAIN & MUSE MANIFEST STATE (olympiannexus@gmail.com) ---
  const [brainSnapshot, setBrainSnapshot] = useState<any | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);
  const [manifestText, setManifestText] = useState<string>(INITIAL_CREATED_FILES.join('\n'));
  const [newPathInput, setNewPathInput] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

  const isMasterOwner = session?.user?.email?.toLowerCase() === MASTER_OWNER_EMAIL;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
        return;
      }
      setSession(session);
      setMounted(true);
      fetchMyAgents(session.access_token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/');
      else setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const fetchMyAgents = async (token: string) => {
    try {
      const res = await fetch('/api/user-agents', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
        if (data.agents.length > 0 && !selectedAgent) {
          setSelectedAgent(data.agents[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load private user agents:', e);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim() || !agentRole.trim() || !helpStyle.trim() || !session) return;
    setCreating(true);

    try {
      const res = await fetch('/api/user-agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'create_agent',
          agentName,
          agentRole,
          helpStyle
        })
      });
      const data = await res.json();
      if (data.agent) {
        const updated = [data.agent, ...agents];
        setAgents(updated);
        setSelectedAgent(data.agent);
        setAgentName('');
        setAgentRole('');
        setHelpStyle('');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedAgent || !session) return;
    const msg = chatInput;
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/user-agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          action: 'assist_user',
          agentId: selectedAgent.id,
          message: msg
        })
      });
      const data = await res.json();
      if (data.memory_log) {
        const updatedAgent = { ...selectedAgent, memory_log: data.memory_log };
        setSelectedAgent(updatedAgent);
        setAgents(prev => prev.map(a => a.id === updatedAgent.id ? updatedAgent : a));
      }
    } finally {
      setChatLoading(false);
    }
  };

  // --- MASTER OWNER FUNCTIONS (olympiannexus@gmail.com ONLY) ---
  const triggerBrainRead = async () => {
    if (!isMasterOwner || !session) return;
    setBrainLoading(true);
    setStatusBanner('READING SUPABASE SQL BRAIN & SYNCING FULL COPY TO APPLICATION...');

    try {
      // First ensure initial files are registered in the Muse manifest
      await fetch('/api/brain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ filePaths: manifestText.split('\n').filter(Boolean) })
      });

      const res = await fetch('/api/brain', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      setBrainSnapshot(data);

      // Store full copy in application state / localStorage for cross-module access
      localStorage.setItem('olympus_full_brain_copy', JSON.stringify(data));
      if (data.muse_manifest && data.muse_manifest.length > 0) {
        setManifestText(data.muse_manifest.join('\n'));
      }
      setStatusBanner('BRAIN SYNCHRONIZED. FULL COPY CACHED IN MAIN APPLICATION.');
    } catch (e: any) {
      setStatusBanner(`BRAIN SYNC ERROR: ${e.message}`);
    } finally {
      setBrainLoading(false);
    }
  };

  const handleAddFilePathToManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPathInput.trim() || !isMasterOwner || !session) return;

    const updatedLines = Array.from(
      new Set([...manifestText.split('\n').map(l => l.trim()).filter(Boolean), newPathInput.trim()])
    );
    setManifestText(updatedLines.join('\n'));
    setNewPathInput('');

    const res = await fetch('/api/brain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ filePaths: updatedLines })
    });
    const data = await res.json();
    if (data.manifestTxtContent) {
      setManifestText(data.manifestTxtContent);
      setStatusBanner('MUSE PROVISION MANIFEST UPDATED.');
    }
  };

  const downloadMuseTxt = () => {
    const cleanContent = manifestText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n') + '\n';
    const blob = new Blob([cleanContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'muse_provision_manifest.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBrainCopyJson = () => {
    if (!brainSnapshot) return;
    const blob = new Blob([JSON.stringify(brainSnapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympus_brain_full_copy_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!mounted || !session) return <div className="w-screen h-screen bg-[#050508]" />;

  return (
    <div className="w-screen h-[100dvh] bg-[#050508] text-white font-mono flex flex-col overflow-hidden select-none">
      {/* TOP HEADER BAR */}
      <header className="flex flex-wrap items-center justify-between px-6 py-4 bg-zinc-950/90 border-b border-cyan-500/30 z-20">
        <div className="flex items-center gap-4">
          <span className="text-lg font-black tracking-[0.25em] text-cyan-400 uppercase">
            OLYMPUS // AGENT FORGE
          </span>
          <span className="text-[10px] px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300">
            NODE: {session.user.email}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('forge')}
            className={`px-4 py-2 text-xs font-bold tracking-widest uppercase rounded border transition-all ${
              activeTab === 'forge'
                ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_15px_rgba(0,255,255,0.4)]'
                : 'bg-black/60 text-zinc-400 border-zinc-700 hover:text-white'
            }`}
          >
            PRIVATE AGENT GENERATOR
          </button>

          {/* STRICT OWNER GATE: Only visible & accessible to olympiannexus@gmail.com */}
          {isMasterOwner && (
            <button
              onClick={() => setActiveTab('brain')}
              className={`px-4 py-2 text-xs font-bold tracking-widest uppercase rounded border transition-all ${
                activeTab === 'brain'
                  ? 'bg-fuchsia-500 text-black border-fuchsia-400 shadow-[0_0_20px_rgba(255,0,255,0.5)]'
                  : 'bg-fuchsia-950/30 text-fuchsia-400 border-fuchsia-500/50 hover:bg-fuchsia-500/20'
              }`}
            >
              ⚡ MASTER BRAIN & MUSE (.TXT)
            </button>
          )}

          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-xs font-bold tracking-widest text-zinc-400 uppercase border rounded bg-black/80 border-zinc-700 hover:text-red-400 hover:border-red-400"
          >
            EXIT HUB
          </button>
        </div>
      </header>

      {/* =====================================================================
          TAB 1: UNIVERSAL PRIVATE AGENT GENERATOR (OPEN TO EVERY USER)
         ===================================================================== */}
      {activeTab === 'forge' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT COLUMN: CREATE & SELECT PRIVATE AGENTS */}
          <div className="lg:col-span-4 border-r border-zinc-800 bg-zinc-950/60 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            <form onSubmit={handleCreateAgent} className="flex flex-col gap-3 p-4 rounded-xl bg-black/60 border border-cyan-500/30">
              <div className="text-xs font-bold tracking-widest text-cyan-400 uppercase border-b border-zinc-800 pb-2">
                + Synthesize Personal Agent
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Every agent you create is strictly private and bound to your account. Tell it how you ask for help, and it will adapt to your workflow.
              </p>

              <input
                type="text"
                placeholder="Agent Callsign (e.g., Hephaestus, Navigator)"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                required
                className="w-full p-2.5 text-xs bg-zinc-950 border border-zinc-700 rounded text-white focus:border-cyan-400 outline-none"
              />

              <input
                type="text"
                placeholder="Primary Role (e.g., Code Debugger, Lore Architect)"
                value={agentRole}
                onChange={e => setAgentRole(e.target.value)}
                required
                className="w-full p-2.5 text-xs bg-zinc-950 border border-zinc-700 rounded text-white focus:border-cyan-400 outline-none"
              />

              <textarea
                rows={3}
                placeholder="How do you ask for help? (e.g., 'Give me full files only with zero fluff', 'Walk me through step-by-step')"
                value={helpStyle}
                onChange={e => setHelpStyle(e.target.value)}
                required
                className="w-full p-2.5 text-xs bg-zinc-950 border border-zinc-700 rounded text-white focus:border-cyan-400 outline-none resize-none"
              />

              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 text-xs font-bold tracking-widest uppercase bg-cyan-500/20 border border-cyan-400 text-cyan-300 rounded hover:bg-cyan-400 hover:text-black transition-all"
              >
                {creating ? 'SYNTHESIZING MATRIX...' : 'SPAWN PRIVATE AGENT'}
              </button>
            </form>

            {/* USER'S PRIVATE AGENT ROSTER */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] tracking-widest text-zinc-500 uppercase">
                YOUR PRIVATE AGENTS ({agents.length})
              </span>
              {agents.length === 0 && (
                <div className="text-xs text-zinc-600 italic p-4 border border-dashed border-zinc-800 rounded text-center">
                  No personal agents spawned yet.
                </div>
              )}
              {agents.map(ag => (
                <div
                  key={ag.id}
                  onClick={() => setSelectedAgent(ag)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedAgent?.id === ag.id
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

          {/* RIGHT COLUMN: ACTIVE PRIVATE AGENT CONSOLE */}
          <div className="lg:col-span-8 flex flex-col bg-[#030306] overflow-hidden">
            {selectedAgent ? (
              <>
                <div className="p-4 bg-zinc-950/80 border-b border-zinc-800 flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-widest">
                      {selectedAgent.agent_name} // {selectedAgent.agent_role}
                    </h2>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      CALIBRATED TO YOUR STYLE: {selectedAgent.help_style}
                    </p>
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                  {(selectedAgent.memory_log || []).length === 0 && (
                    <div className="m-auto text-center max-w-md p-6 border border-zinc-800/80 rounded-xl bg-zinc-950/40">
                      <div className="text-xs text-cyan-400 uppercase tracking-widest mb-2">
                        {selectedAgent.agent_name} ONLINE
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        This agent instance is private to your account and pre-configured to help you the exact way you ask. Transmit your request below.
                      </p>
                    </div>
                  )}

                  {(selectedAgent.memory_log || []).map((entry: any, i: number) => (
                    <div
                      key={i}
                      className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] p-4 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                          entry.role === 'user'
                            ? 'bg-cyan-950/40 border border-cyan-500/40 text-cyan-100'
                            : 'bg-zinc-900/90 border border-zinc-700 text-zinc-200'
                        }`}
                      >
                        {entry.text}
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="text-xs text-cyan-400 animate-pulse tracking-widest">
                      {selectedAgent.agent_name.toUpperCase()} IS SYNTHESIZING...
                    </div>
                  )}
                </div>

                <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex gap-3">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    placeholder={`Ask ${selectedAgent.agent_name} for help...`}
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
              </>
            ) : (
              <div className="m-auto text-center text-xs text-zinc-500">
                Spawn or select a personal agent on the left to begin.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: MASTER BRAIN READER & MUSE MANIFEST (STRICTLY OLYMPIANNEXUS@GMAIL.COM)
         ===================================================================== */}
      {activeTab === 'brain' && isMasterOwner && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden p-6 gap-6 bg-[#040208]">
          {/* LEFT: SUPABASE SQL BRAIN READER */}
          <div className="lg:col-span-7 flex flex-col border border-fuchsia-500/40 rounded-xl bg-zinc-950/80 p-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-sm font-black tracking-widest text-fuchsia-400 uppercase">
                  SUPABASE SQL BRAIN READER
                </h2>
                <p className="text-[10px] text-zinc-400">
                  OWNER VERIFIED: {MASTER_OWNER_EMAIL}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={triggerBrainRead}
                  disabled={brainLoading}
                  className="px-4 py-2 text-xs font-bold tracking-widest uppercase bg-fuchsia-500 text-black rounded hover:bg-white transition-all"
                >
                  {brainLoading ? 'READING BRAIN...' : '⚡ READ BRAIN & SYNC COPY'}
                </button>
                {brainSnapshot && (
                  <button
                    onClick={downloadBrainCopyJson}
                    className="px-3 py-2 text-xs font-bold tracking-widest uppercase border border-cyan-400 text-cyan-400 rounded hover:bg-cyan-400 hover:text-black transition-all"
                  >
                    DOWNLOAD BRAIN (.JSON)
                  </button>
                )}
              </div>
            </div>

            {statusBanner && (
              <div className="my-3 px-3 py-2 text-[11px] bg-fuchsia-950/40 border border-fuchsia-500/40 text-fuchsia-200 rounded">
                {statusBanner}
              </div>
            )}

            <div className="flex-1 mt-3 bg-black/90 border border-zinc-800 rounded-lg p-4 overflow-y-auto custom-scrollbar font-mono text-[11px] text-emerald-400">
              {brainSnapshot ? (
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(brainSnapshot, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-center">
                  Click [READ BRAIN & SYNC COPY] to pull the full Supabase schema and table states back into the main application.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: MUSE PROVISION FILE MANIFEST (.TXT) */}
          <div className="lg:col-span-5 flex flex-col border border-cyan-500/40 rounded-xl bg-zinc-950/80 p-5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h2 className="text-sm font-black tracking-widest text-cyan-400 uppercase">
                  MUSE PROVISION MANIFEST (.TXT)
                </h2>
                <p className="text-[10px] text-zinc-400">
                  One full file path per line for instant Muse ingestion
                </p>
              </div>
              <button
                onClick={downloadMuseTxt}
                className="px-4 py-2 text-xs font-bold tracking-widest uppercase bg-cyan-400 text-black rounded hover:bg-white transition-all"
              >
                DOWNLOAD .TXT
              </button>
            </div>

            <form onSubmit={handleAddFilePathToManifest} className="flex gap-2 my-3">
              <input
                type="text"
                placeholder="e.g., app/components/EarthConsole.tsx"
                value={newPathInput}
                onChange={e => setNewPathInput(e.target.value)}
                className="flex-1 p-2.5 text-xs bg-black border border-zinc-700 rounded text-white focus:border-cyan-400 outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold uppercase border border-cyan-400 text-cyan-400 rounded hover:bg-cyan-400 hover:text-black transition-all"
              >
                + LOG PATH
              </button>
            </form>

            <textarea
              value={manifestText}
              onChange={e => setManifestText(e.target.value)}
              className="flex-1 w-full bg-black/90 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-cyan-300 leading-relaxed outline-none resize-none custom-scrollbar"
            />
          </div>
        </div>
      )}
    </div>
  );
}
