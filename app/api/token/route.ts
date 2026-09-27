export const dynamic = 'force-dynamic';

import twilio from 'twilio';
import { NextResponse } from 'next/server';

export async function GET() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const appSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !appSid) {
    return NextResponse.json(
      { error: 'Twilio credentials offline or not yet configured' },
      { status: 503 }
    );
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const grant = new VoiceGrant({
    outgoingApplicationSid: appSid,
    incomingAllow: false,
  });

  const token = new AccessToken(
    accountSid,
    apiKey,
    apiSecret,
    { identity: 'et_phone_home_node' }
  );
  
  token.addGrant(grant);

  return NextResponse.json({ token: token.toJwt() });
}


