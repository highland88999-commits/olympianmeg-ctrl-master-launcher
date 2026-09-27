// Olympus order persistence. Uses the shared master-app Supabase client
// (env vars only — no secrets here). Order requests are public inserts;
// RLS on olympus_orders restricts anon inserts to status='requested'.

import { supabase } from '@/lib/supabase';

/**
 * Save an order request (no card payment).
 * @param {{ customer:{name,email,notes}, lines:Array, totalCents:number }} order
 * @returns {Promise<{ ok:boolean, orderId?:string, error?:string }>}
 */
export async function saveOrderRequest({ customer, lines, totalCents }) {
  try {
    const { data, error } = await supabase
      .from('olympus_orders')
      .insert([
        {
          customer_name: customer.name,
          customer_email: customer.email,
          customer_notes: customer.notes || null,
          items: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            size: l.size,
            qty: l.qty,
            unitCents: l.unitCents,
          })),
          total_cents: totalCents,
          currency: 'cad',
          status: 'requested',
        },
      ])
      .select('id')
      .single();

    if (error) throw error;
    return { ok: true, orderId: data.id };
  } catch (err) {
    return { ok: false, error: 'Could not send your order request. Please try again.' };
  }
}
