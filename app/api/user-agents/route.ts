// FILE: app/api/user-agents/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAuthenticatedClient(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// GET: Fetch all private agents belonging to the logged-in user
export async function GET(req: Request) {
  try {
    const supabase = getAuthenticatedClient(req);
    if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('user_agents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ agents: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Either create a new private agent ('create_agent') or talk to an existing one ('assist_user')
export async function POST(req: Request) {
  try {
    const supabase = getAuthenticatedClient(req);
    if (!supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, agentName, agentRole, helpStyle, agentId, message } = body;
    const API_KEY = process.env.GEMINI_API_KEY;

    // ------------------------------------------------------------------------
    // ACTION A: Generate & Save a Private Custom Agent for this User
    // ------------------------------------------------------------------------
    if (action === 'create_agent') {
      if (!agentName || !agentRole || !helpStyle) {
        return NextResponse.json({ error: 'Name, Role, and Help Style are required.' }, { status: 400 });
      }

      let generatedSystemPrompt = `You are ${agentName}, a private personal agent inside the Olympus Universe. Your role is: ${agentRole}. The user specifically asked to be helped in this exact manner: "${helpStyle}". Always adapt your tone, structure, pacing, and problem-solving approach to match how this user asks for help.`;

      if (API_KEY) {
        try {
          const synthesisPrompt = `Create a concise, high-precision system instruction prompt for a personal AI agent named "${agentName}".
          Role: ${agentRole}
          How the user wants to be helped: "${helpStyle}"
          Write directly in second-person ("You are..."). Keep it under 150 words and make it hyper-responsive to the user's preferred help style.`;

          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }] })
            }
          );
          const geminiData = await res.json();
          const synthesized = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (synthesized) generatedSystemPrompt = synthesized.trim();
        } catch (e) {
          console.warn('Fallback to direct template prompt.');
        }
      }

      const { data: newAgent, error: insertErr } = await supabase
        .from('user_agents')
        .insert([{
          user_id: user.id,
          agent_name: agentName.trim(),
          agent_role: agentRole.trim(),
          help_style: helpStyle.trim(),
          system_prompt: generatedSystemPrompt,
          memory_log: []
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;
      return NextResponse.json({ agent: newAgent });
    }

    // ------------------------------------------------------------------------
    // ACTION B: Execute a Private Help Session with the User's Custom Agent
    // ------------------------------------------------------------------------
    if (action === 'assist_user') {
      if (!agentId || !message) {
        return NextResponse.json({ error: 'agentId and message are required.' }, { status: 400 });
      }

      const { data: agent, error: fetchErr } = await supabase
        .from('user_agents')
        .select('*')
        .eq('id', agentId)
        .eq('user_id', user.id)
        .single();

      if (fetchErr || !agent) {
        return NextResponse.json({ error: 'Private agent not found or access denied.' }, { status: 404 });
      }

      const history = Array.isArray(agent.memory_log) ? agent.memory_log.slice(-10) : [];
      const formattedHistory = history.map((h: any) => `${h.role.toUpperCase()}: ${h.text}`).join('\n');

      const fullPrompt = `${agent.system_prompt}\n\n--- RECENT MEMORY ---\n${formattedHistory}\n\nUSER REQUEST: ${message}`;

      let replyText = 'Agent uplink offline. Verify GEMINI_API_KEY.';
      if (API_KEY) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: fullPrompt }] }] })
          }
        );
        const data = await res.json();
        replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response synthesized.';
      }

      const updatedMemory = [
        ...history,
        { role: 'user', text: message, ts: new Date().toISOString() },
        { role: 'agent', text: replyText, ts: new Date().toISOString() }
      ];

      await supabase
        .from('user_agents')
        .update({ memory_log: updatedMemory })
        .eq('id', agent.id)
        .eq('user_id', user.id);

      return NextResponse.json({ reply: replyText, memory_log: updatedMemory });
    }

    // ------------------------------------------------------------------------
    // ACTION C: Delete a Private Agent
    // ------------------------------------------------------------------------
    if (action === 'delete_agent') {
      await supabase.from('user_agents').delete().eq('id', agentId).eq('user_id', user.id);
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
