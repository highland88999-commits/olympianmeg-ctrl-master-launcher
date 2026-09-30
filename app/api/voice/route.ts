export const dynamic = 'force-dynamic';

import twilio from 'twilio';
import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';

// Numbers must look like real international numbers before anything dials.
const E164 = /^\+[1-9]\d{7,14}$/;

function twimlResponse(say: string) {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(say);
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export const POST = apiGuard(async function POST(request: Request) {
  const callerId = process.env.TWILIO_CALLER_ID;
  if (!callerId) return twimlResponse('Calling is not set up yet.');

  let params: Record<string, string> = {};
  try {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      params[key] = String(value);
    });
  } catch {
    return twimlResponse('Sorry, that request was not understood.');
  }

  // Only Twilio itself may drive this webhook: its request signature is
  // verified against the account auth token. Without the token configured
  // the webhook refuses to dial rather than serving unsigned requests.
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('Twilio voice webhook: TWILIO_AUTH_TOKEN is not set; refusing unsigned request.');
    return twimlResponse('Calling is not set up yet.');
  }
  const signature = request.headers.get('x-twilio-signature') || '';
  if (!twilio.validateRequest(authToken, signature, request.url, params)) {
    return twimlResponse('Sorry, that request could not be verified.');
  }

  const to = (params.To || '').trim();
  if (!to || !E164.test(to)) {
    return twimlResponse('Sorry, that number cannot be dialed.');
  }

  const twiml = new twilio.twiml.VoiceResponse();
  const dial = twiml.dial({ callerId });
  dial.number(to);
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
});
