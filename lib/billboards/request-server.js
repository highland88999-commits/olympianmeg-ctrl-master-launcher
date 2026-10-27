// lib/billboards/request-server.js — Shared server helpers for the
// user-facing billboard request routes. Server-only.

import { getServiceClient } from '@/lib/economy/supabase';
import { requireUser } from '@/lib/wallet/server';

/** True when a Supabase error means "table not created yet". */
export function isMissingTable(error) {
  return /does not exist|relation .* does not exist/i.test(String(error?.message || ''));
}

/** Public storage URL prefix for the billboard-creatives bucket. */
export function storagePublicPrefix() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/billboard-creatives/`;
}

/** Service client or null when the database is not connected. */
export async function serviceClient() {
  try {
    return await getServiceClient();
  } catch {
    return null;
  }
}

/**
 * Review-feed token check (artifact server → repo). The token lives in
 * BILLBOARD_REVIEW_TOKEN (Vercel env); Merlin pastes the same value
 * once into the billboard-ad-requests artifact's settings. Compared
 * in constant time when lengths match. False when no token is set —
 * the feed then honestly answers "not connected yet".
 */
export function reviewTokenOk(req) {
  const expected = process.env.BILLBOARD_REVIEW_TOKEN || '';
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return false;
  const given = header.slice(7).trim();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Signed-in user (throws with .status when the session is missing). */
export async function authedUser(req, admin) {
  return requireUser(req, admin);
}

/** Public view of a billboard request row. */
export function publicRequest(r) {
  return {
    id: r.id,
    companyName: r.company_name,
    linkUrl: r.link_url,
    creativeType: r.creative_type,
    creativeUrl: r.creative_url,
    plan: r.plan,
    preferredNumber: r.preferred_number,
    assignedNumber: r.assigned_number,
    requesterEmail: r.requester_email,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

/** Public view of a subscription row. */
export function publicSubscription(s) {
  return {
    id: s.id,
    requestId: s.request_id,
    plan: s.plan,
    billboardNumber: s.billboard_number,
    companyName: s.company_name,
    linkUrl: s.link_url,
    creativeType: s.creative_type,
    creativeUrl: s.creative_url,
    priceCents: s.price_cents,
    status: s.status,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    createdAt: s.created_at,
  };
}
