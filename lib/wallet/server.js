// lib/wallet/server.js
// Server-only auth gates for the wallet routes. Never import from clients.

import { getServiceClient } from '@/lib/economy/supabase';

/** Merlin-only gate (the no-leak rule): money release stays in his hands. */
export const WALLET_OWNER_EMAIL = 'olympiannexus@gmail.com';
export function isWalletOwner(user) {
  return String(user?.email || '').toLowerCase() === WALLET_OWNER_EMAIL;
}

/** Any signed-in user, verified against Supabase auth. Throws with .status. */
export async function requireUser(req, admin) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    const e = new Error('Sign in to use your wallet.');
    e.status = 401;
    throw e;
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    const e = new Error('Your session has expired. Please sign in again.');
    e.status = 401;
    throw e;
  }
  return data.user;
}

/** Merlin only. Throws 403 for everyone else. */
export async function requireOwner(req, admin) {
  const user = await requireUser(req, admin);
  if (!isWalletOwner(user)) {
    const e = new Error('Only Merlin can release payouts.');
    e.status = 403;
    throw e;
  }
  return user;
}

/** Best-effort account email for the admin queue display. */
export async function emailForUserId(admin, userId) {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email || '';
  } catch {
    return '';
  }
}

export { getServiceClient };
