// app/api/cloud-phone/stop/route.js
// Cloud Phone — stop a user's running instance.
//
// POST /api/cloud-phone/stop { instance_id }
//   -> { instance }  (status -> "stopped")

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
  if (!instanceId) return NextResponse.json({ error: 'Pick an installed app to stop.' }, { status: 400 });

  const { data: instance, error } = await supabase
    .from('cloud_phone_instances')
    .update({ status: 'stopped' })
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: 'That app is not installed in your cloud.' }, { status: 404 });
  }

  // TODO (infra decision pending): tell the container runtime to stop/suspend
  // the user's container for this instance.

  return NextResponse.json({ instance });
}
