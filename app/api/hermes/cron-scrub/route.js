// app/api/hermes/cron-scrub/route.js
// Removes pending submissions older than 24 hours (abandoned checkouts).
// Protected by CRON_SECRET. Configure in vercel.json:
//   { "crons": [{ "path": "/api/hermes/cron-scrub", "schedule": "0 4 * * *" }] }
import { getAdminClient, jsonError } from '../_server.js';
import { scrubCutoffIso, PENDING_TTL_HOURS } from '@/lib/hermes/listings.js';
import { apiGuard } from '@/lib/api-guard';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export const POST = apiGuard(async function POST(req) {
  if (!authorized(req)) {
    return jsonError('Not authorized.', 401);
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('Database not configured.', 503);
  }

  const cutoff = scrubCutoffIso();
  const { data, error } = await supabase
    .from('hermes_links')
    .delete()
    .eq('payment_status', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    console.error('Hermes cron scrub error:', error.message);
    return jsonError('Scrub failed.', 500);
  }

  return Response.json({ ok: true, removed: (data || []).length, ttlHours: PENDING_TTL_HOURS });
});

// Vercel Cron sends GET by default; accept it too.
export const GET = apiGuard(async function GET(req) {
  return POST(req);
});
