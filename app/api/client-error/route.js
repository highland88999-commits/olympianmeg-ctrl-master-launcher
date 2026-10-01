// app/api/client-error/route.js — Client crash inbox.
// The global error page POSTs { kind, message, stack, digest, url, ua } here.
// We log it to Vercel runtime logs AND persist it to the client_errors
// Supabase table so crashes stay readable without dashboard log access.
// Fire-and-forget by design: never fails, never blocks the client.

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
    if (report && url && key) {
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
