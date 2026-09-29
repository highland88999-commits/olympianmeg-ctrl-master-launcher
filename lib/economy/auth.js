// lib/economy/auth.js
// Server-only auth for the economy routes. Same pattern as the other modules:
// the client sends `Authorization: Bearer <supabase access_token>` and we
// verify it with the service-role client to get the real user id.

import { getServiceClient } from './supabase.js';

export async function getUserFromRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return { error: 'Sign in to use gold.', status: 401 };

  const admin = await getServiceClient();
  if (!admin) return { error: 'The gold service is not connected yet.', status: 503 };

  try {
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return { error: 'Your session has expired. Please sign in again.', status: 401 };
    return { user };
  } catch {
    return { error: 'Could not verify your session.', status: 503 };
  }
}
