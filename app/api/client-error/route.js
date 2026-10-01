// app/api/client-error/route.js — Client crash inbox.
// The global error page POSTs { kind, message, stack, digest, url, ua } here;
// we log it to Vercel runtime logs so the real client-side error is visible
// in the dashboard instead of only as "Application error" on the device.
// Fire-and-forget by design: never fails, never blocks the client.

export async function POST(req) {
  try {
    const b = await req.json();
    const stackLines = String(b.stack || '')
      .split('\n')
      .slice(0, 8)
      .join('\n    ');
    console.error(
      `[client-error] kind=${b.kind || 'unknown'} digest=${b.digest || '-'} url=${b.url || '-'}\n` +
        `  ua=${b.ua || '-'}\n` +
        `  message=${b.message || '-'}\n` +
        `  stack:\n    ${stackLines}`
    );
  } catch {
    /* never fail the reporter */
  }
  return new Response('ok', { status: 200 });
}
