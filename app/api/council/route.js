export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { checkIntent } from '@/lib/human-ai/compass';
import { evaluateHarvest } from '@/lib/human-ai/consensus';

export async function POST(req) {
  try {
    const { task } = await req.json();

    if (!task || !String(task).trim()) {
      return NextResponse.json(
        { error: 'Present a task for the Council to deliberate.' },
        { status: 400 }
      );
    }

    // Same ethics gate as the chat channel: the Council never convenes
    // on a task that fails the Compass check.
    const ethicsCheck = checkIntent(task);
    if (!ethicsCheck.allowed) {
      return NextResponse.json(
        { error: `[HUMAN AI INTERVENTION]: ${ethicsCheck.reason}` },
        { status: 403 }
      );
    }

    const result = await evaluateHarvest(task);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Council Error:', error);
    if (error.message === 'The Council needs a task to deliberate.') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'The Council could not convene.' },
      { status: 500 }
    );
  }
}
