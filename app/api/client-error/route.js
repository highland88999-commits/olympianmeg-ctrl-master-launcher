// app/api/client-error/route.js — Client crash inbox.
// The global error page POSTs { kind, message, stack, digest, url, ua } here.
// We log it to Vercel runtime logs AND persist it to the client_errors
// Supabase table so crashes stay readable without dashboard log access.
// Fire-and-forget by design: never fails, never blocks the client.
//
// Intake hygiene (2026-10-15, lib/client-error-hygiene.js): scanner /
// crawler reports are not persisted, and identical (message + UA) bursts
// dedupe within 10 minutes — one scanner burst once produced ~30 rows in
// ~20 minutes and buried the real signal. Conservative by design: a first
// occurrence is always recorded, and any plausible browser UA is kept.
import { isScannerUserAgent, createErrorDeduper } from '@/lib/client-error-hygiene';

const deduper = createErrorDeduper();

export async function POST(req) {
  let report = null;
  try {
    report = await req.json();
  } catch {
    /* bad body — still answer ok */
  }

  try {
    if (report) {
      const stackLines = String(report.stack || '')
        .split('\n')
        .slice(0, 8)
        .join('\n    ');
      console.error(
        `[client-error] kind=${report.kind || 'unknown'} digest=${report.digest || '-'} url=${report.url || '-'}\n` +
          `  ua=${report.ua || '-'}\n` +
          `  message=${report.message || '-'}\n` +
          `  stack:\n    ${stackLines}`
      );
    }
  } catch {
    /* logging must never fail the reporter */
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ua = report ? String(report.ua || '') : '';
    const scanner = report ? isScannerUserAgent(ua) : false;
    const duplicate =
      report && !scanner ? !deduper.shouldRecord(report.message, ua) : false;
    if (report && (scanner || duplicate)) {
      console.error(
        `[client-error] not persisted (${scanner ? 'scanner/crawler ua' : 'duplicate within 10m'}) message=${report.message || '-'}`
      );
    }
    if (report && !scanner && !duplicate && url && key) {
      await fetch(`${url}/rest/v1/client_errors`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          kind: String(report.kind || 'unknown').slice(0, 100),
          message: String(report.message || '').slice(0, 2000),
          stack: String(report.stack || '').slice(0, 8000),
          digest: report.digest ? String(report.digest).slice(0, 100) : null,
          url: String(report.url || '').slice(0, 500),
          ua: String(report.ua || '').slice(0, 500),
        }),
      });
    }
  } catch {
    /* persistence must never fail the reporter */
  }

  return new Response('ok', { status: 200 });
}
