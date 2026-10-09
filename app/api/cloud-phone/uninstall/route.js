// app/api/cloud-phone/uninstall/route.js
// Cloud Phone — remove an app from the user's cloud.
//
// POST /api/cloud-phone/uninstall { instance_id }
//   -> { ok: true }
// The instance row is deleted. (A future version may offer data export
// before removal; today the row — and the reservation — simply goes away.)

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
  if (!instanceId) return NextResponse.json({ error: 'Pick an installed app to remove.' }, { status: 400 });

  const { data, error } = await supabase
    .from('cloud_phone_instances')
    .delete()
    .eq('id', instanceId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'That app is not installed in your cloud.' }, { status: 404 });
  }

  // TODO (infra decision pending): tell the container runtime to destroy the
  // user's container/data volume for this instance.

  return NextResponse.json({ ok: true });
}
