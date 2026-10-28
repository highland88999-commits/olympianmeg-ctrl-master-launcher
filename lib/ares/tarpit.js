// lib/ares/tarpit.js — the abyss sandbox (server only).
//
// DEFENSIVE ONLY, and only for the extra-malicious tier. Ordinary bots
// still get what they always got: a 403 from the edge middleware, or a
// 404 from a honeypot trap. The abyss is reserved for attacks that cross
// the extra-malicious bar below — harvesters and auth-gate bypass
// attempts that keep coming back.
//
// What the abyss IS: a fake environment served from our side. Every
// link and form inside it points back into the abyss, so the bot can
// crawl forever without ever reaching a real page, real data, or a real
// session. The trapped flag persists per source, so every later request
// from that source lands back in the sandbox until the keeper releases
// it from the console. That persistence is what makes it inescapable,
// not any single connection: one connection still ends (serverless
// functions cannot drip forever), but the next request falls straight
// back in.
//
// What the abyss is NOT: it never attacks the source, never sends a
// payload, never exfiltrates anything, and never touches a real system.
// It serves fake rows, slowly, on our server. Bait and report — never
// hack back. This tier deliberately overrides the honeypot module's old
// "no tarpits" comment, by the keeper's order, for this tier only.
//
// Source reporting: every trapped source is recorded in
// ares_attack_sources (hashed IP only, never a raw IP, matching the
// existing ARES source guardrail) and shown in the console. Nothing is
// sent to any outside authority on its own — external reports stay
// keeper-approved, as they always have.
//
// NOTE: NextResponse is imported lazily inside abyssResponse so the
// pure decision helpers stay importable from plain node tests
// (next/server does not resolve under node --test).

import { serviceClient, hashVisitorIp } from './server.js';

// Extra-malicious bar: a middleware score of 75 means a flagged scanner
// UA on a scanner path (45 + 30) — the harvester signature. A repeat
// offender with 3+ strikes that still trips bot signals also qualifies.
export const ABYSS_THRESHOLD = 75;

/** Pure decision: does this request cross into the abyss tier? */
export function isExtraMalicious({ score = 0, strikes = 0 } = {}) {
  const s = Number(score) || 0;
  const st = Number(strikes) || 0;
  if (s >= ABYSS_THRESHOLD) return true;
  if (st >= 3 && s >= 40) return true;
  return false;
}

/** The fake environment: plausible-looking rows, zero real data, and
 *  every exit leads back into the abyss. */
export function abyssPageHtml() {
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push(
      `<tr><td>shard-${1000 + i}</td><td>null-row-${9000 + i}</td>` +
      `<td>syncing…</td><td><a href="/api/ares/abyss/shard-${1000 + i}">open</a></td></tr>`,
    );
  }
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>Console — shard index</title></head><body>` +
    `<h1>Shard index</h1><p>Replicating. Please wait.</p>` +
    `<table>${rows.join('')}</table>` +
    `<form method="get" action="/api/ares/abyss/search">` +
    `<input name="q" placeholder="Search shards">` +
    `<button>Search</button></form>` +
    `<p><a href="/api/ares/abyss">Back to index</a> · ` +
    `<a href="/api/ares/abyss/next">Next page</a></p>` +
    `</body></html>`;
}

function dripStream() {
  const encoder = new TextEncoder();
  let count = 0;
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(abyssPageHtml()));
      while (count < 25) {
        await new Promise((r) => setTimeout(r, 2000));
        count += 1;
        controller.enqueue(encoder.encode(
          `\n<!-- shard sync ${count} of 9999: replicating null rows, please wait -->\n`,
        ));
      }
      controller.close();
    },
  });
}

/** The abyss response: fake page, then a slow drip of fake log lines. */
export async function abyssResponse() {
  const { NextResponse } = await import('next/server');
  return new NextResponse(dripStream(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function db() {
  try {
    return serviceClient();
  } catch {
    return null;
  }
}

/** Record (or refresh) the attack-source report for one hostile visitor. */
export async function recordAttackSource({ ip, userAgent = null, path = null, score = 0, reasons = [], trapped = false }) {
  const client = db();
  if (!client || !ip || ip === 'unknown') return null;
  const ipHash = hashVisitorIp(ip);
  try {
    const { data: existing } = await client
      .from('ares_attack_sources')
      .select('path_count, max_score, reasons')
      .eq('ip_hash', ipHash)
      .single();
    const mergedReasons = [...new Set([...(existing?.reasons || []), ...reasons])].slice(0, 10);
    await client.from('ares_attack_sources').upsert([{
      ip_hash: ipHash,
      user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      last_path: path ? String(path).slice(0, 300) : null,
      path_count: (existing?.path_count || 0) + 1,
      max_score: Math.max(existing?.max_score || 0, Number(score) || 0),
      reasons: mergedReasons,
      trap_status: trapped ? 'trapped' : (existing?.trap_status || 'none'),
      last_seen: new Date().toISOString(),
    }], { onConflict: 'ip_hash' });
    return ipHash;
  } catch {
    return null;
  }
}

/** Trap a source in the abyss (persists until the keeper releases it). */
export async function trapAttackSource({ ip, reason = 'Extra-malicious attack', score = 0 }) {
  const client = db();
  if (!client || !ip || ip === 'unknown') return null;
  const ipHash = hashVisitorIp(ip);
  try {
    const { data: existing } = await client
      .from('ares_trapped')
      .select('hits')
      .eq('ip_hash', ipHash)
      .single();
    await client.from('ares_trapped').upsert([{
      ip_hash: ipHash,
      reason,
      score: Number(score) || 0,
      hits: (existing?.hits || 0) + 1,
      last_seen: new Date().toISOString(),
    }], { onConflict: 'ip_hash' });
    await client.from('ares_attack_sources')
      .update({ trap_status: 'trapped', last_seen: new Date().toISOString() })
      .eq('ip_hash', ipHash);
    return ipHash;
  } catch {
    return null;
  }
}

/** Is this source currently trapped? Never throws: unknown means no. */
export async function isTrapped(ipHash) {
  const client = db();
  if (!client || !ipHash) return false;
  try {
    const { data, error } = await client
      .from('ares_trapped')
      .select('ip_hash')
      .eq('ip_hash', ipHash)
      .single();
    return !error && !!data;
  } catch {
    return false;
  }
}

/** Bump a trapped source's hit count (abyss pages call this per visit). */
export async function bumpTrapHit(ip) {
  const client = db();
  if (!client || !ip || ip === 'unknown') return;
  const ipHash = hashVisitorIp(ip);
  try {
    const { data: existing } = await client
      .from('ares_trapped')
      .select('hits')
      .eq('ip_hash', ipHash)
      .single();
    if (!existing) return;
    await client.from('ares_trapped').update({
      hits: (existing.hits || 0) + 1,
      last_seen: new Date().toISOString(),
    }).eq('ip_hash', ipHash);
  } catch {}
}

/** Release a trapped source (keeper only, via the console route). */
export async function releaseTrap(ipHash) {
  const client = db();
  if (!client || !ipHash) return false;
  try {
    await client.from('ares_trapped').delete().eq('ip_hash', ipHash);
    await client.from('ares_attack_sources')
      .update({ trap_status: 'released', last_seen: new Date().toISOString() })
      .eq('ip_hash', ipHash);
    return true;
  } catch {
    return false;
  }
}
