export const dynamic = 'force-dynamic';

import twilio from 'twilio';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const to = formData.get('To')?.toString();

  const twiml = new twilio.twiml.VoiceResponse();
  const callerId = process.env.TWILIO_CALLER_ID;

  if (to && callerId) {
    const dial = twiml.dial({ callerId });
    dial.number(to);
  } else {
    twiml.say("Routing failure. Target node offline or caller ID missing.");
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
}


