// app/api/luge/claim/route.js
// POST {} -> { ok, email, instructions } — hoodie redemption.
// One redemption per user. The fulfillment email lives ONLY in the server
// env var LUGE_FULFILLMENT_EMAIL and is returned to verified redeemers.
import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { decideClaim } from '@/lib/luge/logic.js';

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { user } = auth;

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('The claim service is not available right now. Try again later.', 503);
  }

  // 1+2. Ownership and one-per-user, via the shared pure decision logic.
  const { data: owned, error: invError } = await supabase
    .from('luge_inventory')
    .select('sled_id')
    .eq('user_id', user.id);
  if (invError) {
    console.error('Luge claim inventory error:', invError.message);
    return jsonError('Could not check your garage. Try again.', 500);
  }

  const { data: existing } = await supabase
    .from('luge_redemptions')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const decision = decideClaim({
    ownedSledIds: (owned || []).map((r) => r.sled_id),
    alreadyRedeemed: !!existing,
  });
  if (!decision.ok) return jsonError(decision.error, decision.status);

  // 3. Record the redemption.
  const { error: redeemError } = await supabase
    .from('luge_redemptions')
    .insert({ user_id: user.id });
  if (redeemError) {
    if (redeemError.code === '23505') {
      return jsonError('This hoodie has already been claimed on your account. One per rider.', 409);
    }
    console.error('Luge claim redemption error:', redeemError.message);
    return jsonError('Could not record your claim. Try again.', 500);
  }

  const email = process.env.LUGE_FULFILLMENT_EMAIL;
  if (!email) {
    console.error('Luge claim: LUGE_FULFILLMENT_EMAIL is not set.');
    return jsonError('Claims are not open yet. Check back soon.', 503);
  }

  return Response.json({
    ok: true,
    email,
    instructions: [
      'Email us from the same email address you use to sign in here.',
      'Use the subject line: LUGE HOODIE CLAIM',
      'Include your full shipping address in the message.',
      'One hoodie per rider. We confirm every claim by hand before shipping.',
    ],
  });
}
