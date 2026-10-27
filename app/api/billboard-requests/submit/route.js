// app/api/billboard-requests/submit/route.js
// POST a user billboard request: { companyName, linkUrl, creativeType,
// creativeUrl, plan ('rotating'|'solo'), preferredNumber? }.
// The request lands as `pending` for Merlin's review in the
// billboard-ad-requests artifact (via the token-gated feed route).
// Nothing here publishes to a live billboard: approval, wallet-credit
// subscription, and builder wiring all still have to happen first.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { serviceClient, authedUser, isMissingTable, storagePublicPrefix } from '@/lib/billboards/request-server';
import {
  validateCompanyName,
  validateLinkUrl,
  validateAdEntry,
  isValidBillboardNumber,
} from '@/lib/billboards/validate';
import { isValidPlan } from '@/lib/billboards/pricing';

export async function POST(req) {
  const admin = await serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'The billboard service is not connected yet.' }, { status: 503 });
  let user;
  try {
    user = await authedUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to request a billboard.' }, { status: e.status || 401 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const reasons = [];
  const companyError = validateCompanyName(body?.companyName);
  if (companyError) reasons.push(companyError);
  const linkError = validateLinkUrl(body?.linkUrl);
  if (linkError) reasons.push(linkError);
  if (!isValidPlan(body?.plan)) reasons.push('Pick a plan: rotating face-slot or whole billboard solo.');
  const prefix = storagePublicPrefix();
  if (!prefix) return NextResponse.json({ ok: false, error: 'Creative storage is not configured yet.' }, { status: 503 });
  reasons.push(...validateAdEntry({
    companyName: body?.companyName,
    linkUrl: body?.linkUrl,
    creativeType: body?.creativeType,
    creativeUrl: body?.creativeUrl,
  }, prefix));
  let preferred = null;
  if (body?.preferredNumber !== null && body?.preferredNumber !== undefined && body?.preferredNumber !== '') {
    preferred = Number(body.preferredNumber);
    if (!isValidBillboardNumber(preferred)) reasons.push('Preferred billboard number must be from 1 to 44.');
  }
  if (reasons.length > 0) return NextResponse.json({ ok: false, error: reasons[0], reasons }, { status: 400 });

  const { data, error } = await admin.from('billboard_requests').insert({
    user_id: user.id,
    requester_email: user.email || '',
    company_name: String(body.companyName).trim(),
    link_url: String(body.linkUrl).trim(),
    creative_type: body.creativeType,
    creative_url: body.creativeUrl,
    plan: body.plan,
    preferred_number: preferred,
    status: 'pending',
  }).select('*').single();
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: 'Could not save that request. Try again.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
