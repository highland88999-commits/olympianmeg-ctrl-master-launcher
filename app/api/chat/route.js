export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runHumanAI, checkIntent } from '@/lib/human-ai/engine';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Say something first.' }, { status: 400 });
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const language = typeof body?.language === 'string' ? body.language : 'en';
  if (!prompt) {
    return NextResponse.json({ error: 'Say something first.' }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'The chat service is not connected yet. Check back soon.' },
      { status: 503 }
    );
  }

  const ethicsCheck = checkIntent(prompt);
  if (!ethicsCheck.allowed) {
    return NextResponse.json(
      { error: `[HUMAN AI INTERVENTION]: ${ethicsCheck.reason}` },
      { status: 403 }
    );
  }

  try {
    const responseText = await runHumanAI(prompt, language);
    return NextResponse.json({ text: responseText });
  } catch (error) {
    console.error('Core Engine Error:', error);

    // Gracefully handle the Google AI Quota Exceeded (429) Error
    if (error.status === 429 || error.message?.includes('429')) {
      return NextResponse.json(
        { error: 'The chat service is at its usage limit. Wait a moment and try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'The chat service stumbled. Try again in a moment.' },
      { status: 500 }
    );
  }
});
