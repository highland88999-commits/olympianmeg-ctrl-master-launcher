// app/api/hermes/verify/route.js
// GET /api/hermes/verify?session_id=cs_... — verifies a just-completed
// Stripe Checkout session and approves the matching Hermes listing.
//
// Fallback for when the Stripe webhook secret is not configured (the
// webhook 503s); the webhook remains the primary path when it is.
// Idempotent, read-only for anyone without a real paid session id, and it
// never throws — failures return a reason code, never a stack trace.
import { NextResponse } from 'next/server';
import { approvePaidSession } from '../_approve.js';
import { apiGuard } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export const GET = apiGuard(async function GET(req) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  const result = await approvePaidSession(sessionId);
  return NextResponse.json(result);
});
