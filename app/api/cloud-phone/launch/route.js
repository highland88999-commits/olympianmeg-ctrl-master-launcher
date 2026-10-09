// app/api/cloud-phone/launch/route.js
// Cloud Phone — launch a user's installed app.
//
// POST /api/cloud-phone/launch { instance_id }
//   -> { instance, runtime: { connected: false } }
//
// Honest by design: the streaming runtime is not built yet, so this records
// the launch attempt (last_launched_at) and reports the runtime as
// disconnected. It NEVER returns a fake stream URL.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getCloudPhoneUser } from '@/lib/cloud-phone/server';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await getCloudPhoneUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user, supabase } = auth;

  const instanceId = typeof body?.instance_id === 'string' ? body.instance_id.trim() : '';
  if (!instanceId) return NextResponse.json({ error: 'Pick an installed app to launch.' }, { status: 400 });

  const { data: instance, error } = await supabase
    .from('cloud_phone_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !instance) {
    return NextResponse.json({ error: 'That app is not installed in your cloud.' }, { status: 404 });
  }

  // Record the attempt. Status stays "provisioning" until a real runtime
  // reports the container healthy — we never claim "running" without one.
  const { data: updated } = await supabase
    .from('cloud_phone_instances')
    .update({ last_launched_at: new Date().toISOString() })
    .eq('id', instance.id)
    .eq('user_id', user.id)
    .select()
    .single();

  // TODO (infra decision pending — see app/cloud-phone/STATUS.md):
  // Ask the container runtime for a WebRTC session for this instance and
  // return the real stream endpoint + session token here.

  return NextResponse.json({
    instance: updated || instance,
    runtime: {
      connected: false,
      message: 'The server runtime is not connected yet. Your instance is reserved — streaming starts once the runtime lands.',
    },
  });
}
