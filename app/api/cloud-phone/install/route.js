// app/api/cloud-phone/install/route.js
// Cloud Phone — install an app into the user's cloud.
//
// POST /api/cloud-phone/install { app_id }
//   -> { instance }  (status starts as "provisioning")
//
// The instance row is the source of truth for "this user owns this app in
// their cloud." The actual Android container is NOT provisioned here yet —
// see the TODO below. Honest states only: nothing here fakes a running app.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getCloudPhoneUser } from '@/lib/cloud-phone/server';
import { catalogById } from '@/lib/cloud-phone/catalog';
import { getServiceClient } from '@/lib/economy/supabase';

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

  const appId = typeof body?.app_id === 'string' ? body.app_id.trim() : '';
  if (!appId) return NextResponse.json({ error: 'Choose an app to install.' }, { status: 400 });

  // The app must exist in the curated catalog — never trust a bare app_id.
  if (!catalogById(appId)) {
    const { data: catalogRow } = await supabase
      .from('cloud_phone_catalog')
      .select('app_id')
      .eq('app_id', appId)
      .maybeSingle();
    if (!catalogRow) return NextResponse.json({ error: 'That app is not in the catalog.' }, { status: 404 });
  }

  // Idempotent: installing twice returns the existing instance.
  const { data: existing } = await supabase
    .from('cloud_phone_instances')
    .select('*')
    .eq('user_id', user.id)
    .eq('app_id', appId)
    .maybeSingle();
  if (existing) return NextResponse.json({ instance: existing, reused: true });

  const { data: instance, error } = await supabase
    .from('cloud_phone_instances')
    .insert({ user_id: user.id, app_id: appId, status: 'provisioning' })
    .select()
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: 'Could not install that app. Please try again.' }, { status: 500 });
  }

  // TODO (infra decision pending — see app/cloud-phone/STATUS.md):
  // Call the container runtime here to actually provision the user's private
  // Android instance for this app (e.g. Anbox Cloud session create), then
  // update the row: status -> 'provisioning' stays until the runtime reports
  // ready, and container_ref <- the runtime's session/container id.
  // Until that lands, the instance waits honestly in "provisioning".

  // Cloud Phone Pioneer: pure-prestige trophy for the user's FIRST cloud
  // install, ever. Server-side only — clients can never request it (same
  // principle as the Spooky Coin Collector trophy). Insert (not upsert): a
  // 23505 from a racing request just means the other request won the insert.
  // Prestige-only: a trophy failure must never break an install, and a
  // missing user_achievements table (migration not run yet) is a soft skip.
  let pioneerEarned = false;
  try {
    const { count } = await supabase
      .from('cloud_phone_instances')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (count === 1) {
      const admin = await getServiceClient();
      if (admin) {
        const { error: trophyErr } = await admin.from('user_achievements').insert({
          user_id: user.id,
          key: 'cloud-phone-pioneer',
          title: 'Cloud Phone Pioneer',
          metadata: { description: 'Installed your first app into Cloud Phone.' },
        });
        pioneerEarned = !trophyErr;
      }
    }
  } catch {
    // Prestige-only: never break an install over the trophy.
  }

  return NextResponse.json({
    instance,
    reused: false,
    ...(pioneerEarned ? { pioneerEarned: true } : {}),
  });
}
