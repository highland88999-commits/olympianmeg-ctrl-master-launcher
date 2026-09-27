export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runHumanAI, checkIntent } from '@/lib/human-ai/engine';

export async function POST(req) {
  try {
    const { prompt, language } = await req.json();

    const ethicsCheck = checkIntent(prompt);
    if (!ethicsCheck.allowed) {
      return NextResponse.json({ 
        error: `[HUMAN AI INTERVENTION]: ${ethicsCheck.reason}` 
      }, { status: 403 });
    }

    const responseText = await runHumanAI(prompt, language);
    return NextResponse.json({ text: responseText });
    
  } catch (error) {
    console.error('Core Engine Error:', error);

    // Gracefully handle the Google AI Quota Exceeded (429) Error
    if (error.status === 429 || error.message?.includes('429')) {
      return NextResponse.json(
        { error: '[SYSTEM LIMIT REACHED]: Your Gemini API key has exceeded its usage quota. Please wait before transmitting again, or upgrade your Google AI Studio plan.' }, 
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Connection to the OMEGA Matrix disrupted.' }, 
      { status: 500 }
    );
  }
}


