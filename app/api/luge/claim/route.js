// app/api/luge/claim/route.js
// POST /api/luge/claim { size } -> { ok, orderId, size, email, instructions }
//
// The Luge free-hoodie reward: complete ALL 20 courses AND own the Complete
// Arsenal -> one FREE hoodie, redeemed here through the store as a $0 order.
// Entirely separate from the Valkyrie referral program — the tracks never
// mix.
//
// One redemption per rider, enforced twice: the luge_redemptions primary
// key (user_id) rejects a second insert with 23505, and the server checks
// for an existing redemption before writing. Eligibility is verified
// server-side from luge_course_completions + luge_inventory — never from
// client claims. Only runs recorded after the reward launched count; no
// historical completions are ever backfilled.
import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { decideRewardEligibility, LUGE_PREMIUM_COUNT } from '@/lib/luge/logic.js';
import { apiGuard } from '@/lib/api-guard';

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const HOODIE_PRODUCT_NAME = 'Axiom Repository - Premium Unisex Hoodie';

function tableMissing(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg);
}

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request.', 400);
  }
  const size = typeof body?.size === 'string' ? body.size.trim().toUpperCase() : '';
  if (!SIZES.includes(size)) {
    return jsonError('Pick a hoodie size first.', 400);
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('The claim service is not available right now. Try again later.', 503);
  }

  const { data: completions, error: compError } = await supabase
    .from('luge_course_completions')
    .select('course_id')
    .eq('user_id', user.id);
  if (compError) {
    if (tableMissing(compError)) {
      return jsonError('Reward tracking is not connected yet. Your runs will count once it is — nothing is lost.', 503);
    }
    console.error('Luge claim completions error:', compError.message);
    return jsonError('Could not check your progress. Try again.', 500);
  }

  const { data: owned, error: invError } = await supabase
    .from('luge_inventory')
    .select('sled_id')
    .eq('user_id', user.id);
  if (invError) {
    if (tableMissing(invError)) {
      return jsonError('Reward tracking is not connected yet. Your runs will count once it is — nothing is lost.', 503);
    }
    console.error('Luge claim inventory error:', invError.message);
    return jsonError('Could not check your garage. Try again.', 500);
  }

  const { data: existing, error: redError } = await supabase
    .from('luge_redemptions')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (redError && !tableMissing(redError)) {
    console.error('Luge claim redemption check error:', redError.message);
    return jsonError('Could not check your claim status. Try again.', 500);
  }
  if (redError && tableMissing(redError)) {
    return jsonError('Reward tracking is not connected yet. Your runs will count once it is — nothing is lost.', 503);
  }

  const decision = decideRewardEligibility({
    completedCourseIds: (completions || []).map((r) => r.course_id),
    ownedSledIds: (owned || []).map((r) => r.sled_id),
    alreadyRedeemed: !!existing,
  });
  if (!decision.ok) return jsonError(decision.error, decision.status);

  // 1. Take the one-per-rider lock FIRST. A concurrent second claim hits
  //    the primary key and gets a clean 409 instead of a double order.
  const { error: redeemError } = await supabase
    .from('luge_redemptions')
    .insert({ user_id: user.id, reward: 'luge_free_hoodie', size });
  if (redeemError) {
    if (redeemError.code === '23505') {
      return jsonError('This hoodie has already been claimed on your account. One per rider.', 409);
    }
    if (tableMissing(redeemError)) {
      return jsonError('Reward tracking is not connected yet. Your runs will count once it is — nothing is lost.', 503);
    }
    console.error('Luge claim redemption error:', redeemError.message);
    return jsonError('Could not record your claim. Try again.', 500);
  }

  // 2. The $0 store order — same pipeline Merlin fulfills by hand, no
  //    charge, no Stripe session. If the orders table is not provisioned
  //    yet, roll the redemption back so the rider can retry cleanly.
  const sessionRef = `luge-reward:${user.id}`;
  let orderId = null;
  try {
    const { data: order, error: orderError } = await supabase
      .from('store_orders')
      .insert([{
        user_id: user.id,
        stripe_session_id: sessionRef,
        product_name: HOODIE_PRODUCT_NAME,
        amount_cents: 0,
        currency: 'cad',
        size,
        status: 'paid',
        paid_at: new Date().toISOString(),
        customer_notes: `FREE — Luge reward: all ${decision.courses.total} courses completed + Complete Arsenal (${LUGE_PREMIUM_COUNT} sleds) owned. One per rider.`,
      }])
      .select('id')
      .single();
    if (orderError || !order) throw orderError || new Error('order insert failed');
    orderId = order.id;

    const { error: linkError } = await supabase
      .from('luge_redemptions')
      .update({ store_order_id: orderId })
      .eq('user_id', user.id);
    if (linkError) console.error('Luge claim link error:', linkError.message);
  } catch (err) {
    await supabase.from('luge_redemptions').delete().eq('user_id', user.id);
    if (tableMissing(err)) {
      return jsonError('Reward orders are not connected yet. Your progress is safe — try claiming again later.', 503);
    }
    console.error('Luge claim order error:', err?.message || err);
    return jsonError('Could not record your order. Try again.', 500);
  }

  const email = process.env.LUGE_FULFILLMENT_EMAIL;
  const instructions = [
    'Your free hoodie is recorded — no charge was made.',
    'Merlin confirms every claim by hand before anything ships.',
  ];
  if (email) {
    instructions.push(
      `Email ${email} from the same address you use to sign in here.`,
      'Use the subject line: LUGE HOODIE CLAIM',
      `Include your full shipping address and your size (${size}).`,
      'One hoodie per rider.'
    );
  } else {
    instructions.push(
      'Watch your account email — you will be asked for your shipping address there.',
      'One hoodie per rider.'
    );
  }

  return Response.json({ ok: true, orderId, size, email: email || null, instructions });
});
