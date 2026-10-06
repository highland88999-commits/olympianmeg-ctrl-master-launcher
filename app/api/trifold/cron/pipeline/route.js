// app/api/trifold/cron/pipeline/route.js
// GET /api/trifold/cron/pipeline  (CRON_SECRET bearer required;
//   also wired in vercel.json: every 15 min, Mon+Tue)
//
// The TRIFOLD late-post fallback — the week publishes on time even when the
// buddy's week goes sideways. Idempotent and Edmonton-wall-clock aware
// (Intl.DateTimeFormat, America/Edmonton — never UTC):
//
//   1. Find this week's open edition (most recent status != 'published').
//      If none exists at all, draft one (newspaper rotation + RSS) —
//      a week is NEVER empty.
//   2. Mon >= 12:59 Edmonton, status draft/review -> buddy missed his
//      deadline: AI writes both fictional takes with HIS key
//      (getBuddyAiCredentials + generateFiction). Missing key or failed
//      generation -> record a pipeline_note (best-effort; the column may
//      not exist yet) and leave status as-is. Success -> 'ai_generated'.
//   3. Tue >= 03:00 Edmonton, status in (devan_submitted, ai_generated,
//      draft, review) -> DECIDE: Devan's submitted version wins (trimmed,
//      FICTION closing line enforced, empty lens AI-filled if his key is
//      available); otherwise the AI version is finalized (missing takes
//      generated if the key is available, else OG stories only).
//      -> 'ready'.
//   4. Tue >= 06:00 Edmonton, status 'ready' -> PUBLISH: issue number,
//      published_at, then email all trialing/active subscribers.
//
// Every step is wrapped so one week's failure can never crash the run.
// The run returns a JSON summary of what happened.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, getBuddyAiCredentials, nextIssueNumber } from '@/lib/trifold/server';
import { generateFiction } from '@/lib/trifold/ai';
import { sendIssueEmails } from '@/lib/trifold/notify';
import {
  edmontonParts,
  pipelineStepFor,
  normalizeFiction,
  createDraftEdition,
} from '@/lib/trifold/pipeline';

function checkCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('TRIFOLD pipeline cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    const e = new Error('Not authorized.');
    e.status = 401;
    throw e;
  }
}

/** Best-effort status patch: degrades gracefully when the migration
 *  (new status values) hasn't run yet — never throws. */
async function safeUpdate(admin, id, patch) {
  try {
    const { error } = await admin.from('trifold_editions').update(patch).eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** Record a failure note on the edition. The pipeline_note column arrives
 *  with the migration — pre-migration this just reports noted:false. */
async function noteFailure(admin, id, note) {
  const r = await safeUpdate(admin, id, { pipeline_note: String(note).slice(0, 500) });
  return r.ok;
}

/** Generate one fiction take with the buddy's key; returns '' on any
 *  failure so callers can degrade instead of dying. */
async function tryGenerate(creds, edition, tone) {
  try {
    const stories = Array.isArray(edition.og_stories) ? edition.og_stories : [];
    if (stories.length === 0) return '';
    return normalizeFiction(await generateFiction({
      provider: creds.provider,
      apiKey: creds.apiKey, // in-memory only; never logged, never stored
      stories,
      newspaperName: edition.newspaper_name,
      tone,
    }));
  } catch {
    return '';
  }
}

// --- Step 2: Monday deadline — the buddy missed it, AI drafts the fiction. ---
async function stepAiGenerate(admin, edition, actions) {
  let creds;
  try {
    creds = await getBuddyAiCredentials(admin);
  } catch (e) {
    await noteFailure(admin, edition.id, `Mon deadline passed; no AI key: ${e.message}`);
    actions.push({ step: 'ai_generate', ok: false, note: 'Buddy missed the Monday deadline, and no AI key is configured — left for him.' });
    return;
  }
  const negative = await tryGenerate(creds, edition, 'negative');
  const positive = await tryGenerate(creds, edition, 'positive');
  if (!negative && !positive) {
    await noteFailure(admin, edition.id, 'Mon deadline passed; AI generation failed (both lenses).');
    actions.push({ step: 'ai_generate', ok: false, note: 'Buddy missed the Monday deadline and AI generation failed — left for him.' });
    return;
  }
  const r = await safeUpdate(admin, edition.id, {
    negative_fiction: negative || edition.negative_fiction || '',
    positive_fiction: positive || edition.positive_fiction || '',
    status: 'ai_generated',
  });
  actions.push(r.ok
    ? { step: 'ai_generate', ok: true, note: 'Buddy missed the Monday deadline — AI drafted both fictional takes with his key.' }
    : { step: 'ai_generate', ok: false, note: `AI wrote the takes, but the status update failed (migration pending?): ${r.error}` });
}

// --- Step 3: Tuesday 03:00 — DECIDE. Devan's version wins when it exists. ---
async function stepDecide(admin, edition, actions) {
  let creds = null;
  try { creds = await getBuddyAiCredentials(admin); } catch { /* proceed without AI */ }

  const buddyWon = edition.status === 'devan_submitted';
  let negative = normalizeFiction(edition.negative_fiction);
  let positive = normalizeFiction(edition.positive_fiction);
  // Empty lens? AI-fill just that lens when his key is available.
  if (!negative && creds) negative = await tryGenerate(creds, edition, 'negative');
  if (!positive && creds) positive = await tryGenerate(creds, edition, 'positive');

  const r = await safeUpdate(admin, edition.id, {
    negative_fiction: negative,
    positive_fiction: positive,
    status: 'ready',
  });
  actions.push(r.ok
    ? {
        step: 'decide', ok: true,
        winner: buddyWon ? 'devan' : 'ai',
        note: buddyWon
          ? 'Devan submitted in time — his version approved and formatted.'
          : 'No buddy submission — the AI version was finalized for publish.',
      }
    : { step: 'decide', ok: false, note: `Could not finalize (migration pending?): ${r.error}` });
}

// --- Step 4: Tuesday 06:00 — publish + notify. ---
async function stepPublish(admin, edition, actions) {
  const issueNumber = await nextIssueNumber(admin);
  const r = await safeUpdate(admin, edition.id, {
    status: 'published',
    issue_number: issueNumber,
    published_at: new Date().toISOString(),
  });
  if (!r.ok) {
    actions.push({ step: 'publish', ok: false, note: `Publish failed (migration pending?): ${r.error}` });
    return;
  }
  try {
    const { sent } = await sendIssueEmails(admin, { ...edition, issue_number: issueNumber });
    actions.push({ step: 'publish', ok: true, issue_number: issueNumber, emailed: sent });
  } catch (e) {
    // Published is published — a failed email send must not unpublish.
    actions.push({ step: 'publish', ok: true, issue_number: issueNumber, emailed: 0, note: `Published, but subscriber emails failed: ${e.message}` });
  }
}

export const GET = apiGuard(async function GET(req) {
  checkCron(req);
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  const actions = [];
  const now = edmontonParts();

  let edition = null;
  try {
    const { data, error } = await admin
      .from('trifold_editions')
      .select('*')
      .neq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    // Prefer the newest edition WITH content (og_stories); orphans are empty.
    // Falls back to the newest row so a week is never empty.
    const rows = Array.isArray(data) ? data : [];
    edition = rows.find((r) => Array.isArray(r.og_stories) && r.og_stories.length > 0) || rows[0] || null;
    // Clean up orphans: delete empty drafts older than the chosen edition.
    if (edition && rows.length > 1) {
      const orphans = rows.filter((r) => r.id !== edition.id && (!Array.isArray(r.og_stories) || r.og_stories.length === 0));
      if (orphans.length > 0) {
        await admin.from('trifold_editions').delete().in('id', orphans.map((r) => r.id));
        actions.push({ step: 'dedupe', ok: true, note: `Removed ${orphans.length} empty orphan draft(s).` });
      }
    }
  } catch (e) {
    return Response.json({ ok: false, actions, error: `Could not load the open edition: ${e.message}` });
  }

  const statusBefore = edition ? edition.status : '(none)';

  // A week is NEVER empty.
  if (!edition) {
    try {
      const created = await createDraftEdition(admin);
      edition = created.edition;
      actions.push({
        step: 'ensure_draft', ok: true,
        note: `No open edition existed — drafted this week's (${created.paper.name}, ${created.stories.length} stories).`,
      });
    } catch (e) {
      return Response.json({ ok: false, actions, error: `No open edition and could not draft one: ${e.message}` });
    }
  }

  try {
    const step = pipelineStepFor(now.weekday, now.totalMinutes, edition.status);
    if (step === 'ai_generate') await stepAiGenerate(admin, edition, actions);
    else if (step === 'decide') await stepDecide(admin, edition, actions);
    else if (step === 'publish') await stepPublish(admin, edition, actions);
    else actions.push({ step: 'none', ok: true, note: 'Nothing due at this Edmonton time for this status.' });
  } catch (e) {
    // One week's failure never crashes the run.
    actions.push({ step: 'error', ok: false, note: String((e && e.message) || e) });
  }

  return Response.json({
    ok: true,
    edmonton: { weekday: now.weekday, time: `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}` },
    edition_id: edition.id,
    status_before: statusBefore,
    actions,
  });
});
