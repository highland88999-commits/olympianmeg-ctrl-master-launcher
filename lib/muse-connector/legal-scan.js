// lib/muse-connector/legal-scan.js — the incoming legal-threat scan.
//
// When the incoming scan finds a LEGAL threat (a threat with legal
// implications), the agent that found it WRITES A LEGAL REPORT and
// SENDS THE REPORT HOME — home is the ARES console, per the SCOUT
// doctrine (one report home to the ARES console only, then the agent's
// business with it is done). The legal report is a factual,
// evidence-grade record; it records FACTS only — the agent does not
// invent legal conclusions. There is deliberately NO legal-conclusion
// field anywhere in the report: what was found, when, what it was,
// what the agent did. A human decides what any of it means.
//
// What counts as LEGAL vs ordinary:
//   - ORDINARY threat: a scanner probe, a bot, a flood, a honeypot
//     trip — the existing ARES vocabulary (honeypot_hit, scanner_path,
//     bot_blocked, rate_limited). Handled by the existing machinery.
//   - LEGAL threat: incoming content that carries legal implications —
//     threats of legal action, claims of unlawful conduct, demands
//     framed in legal process (takedown, subpoena, court order), or
//     regulatory exposure. The agent does NOT decide the law; it flags
//     content matching the explicit signal list below, records the
//     matched signals as facts, and sends the report home. A human
//     (Review Queue) decides whether it matters.
//
// The signal list is explicit and conservative by design: short,
// plain phrases that name legal process or unlawful conduct. It is a
// tripwire, not a lawyer — a false positive costs a human a glance,
// a false negative costs the record. The list lives here in code so
// it can be read, tested, and changed in one place.
//
// Pure: no I/O. The route scans the incoming directions text and, on
// a hit, builds the legal report (lib/muse-connector/report.js) and
// sends it home through logEvent as 'connector_legal_threat'.

// One signal: an id, the plain phrase it names, and the pattern that
// matches it. Keep the list short and literal — clever patterns invent
// hits; literal phrases record what was actually said.
export const LEGAL_SIGNALS = [
  { id: 'threat-to-sue', label: 'Threat of legal action', pattern: /\b(i will sue|we will sue|going to sue|take legal action|see you in court|my lawyer will|my attorney will)\b/i },
  { id: 'legal-action', label: 'Legal action named', pattern: /\b(lawsuit|litigation|legal proceedings|press charges|file a claim|file a lawsuit)\b/i },
  { id: 'cease-and-desist', label: 'Cease-and-desist demand', pattern: /\b(cease and desist|cease-and-desist)\b/i },
  { id: 'takedown-demand', label: 'Takedown demand', pattern: /\b(dmca|takedown (notice|request|demand)|copyright (infringement|claim|violation))\b/i },
  { id: 'court-process', label: 'Court process named', pattern: /\b(subpoena|court order|injunction|restraining order|search warrant)\b/i },
  { id: 'unlawful-conduct', label: 'Unlawful conduct claimed', pattern: /\b(illegal (content|activity|conduct)|unlawful (content|activity|conduct)|break the law|against the law|criminal (activity|conduct|offence|offense))\b/i },
  { id: 'regulatory', label: 'Regulatory exposure named', pattern: /\b(fintrac|report (you|this) to (the )?(police|fbi|ftc|regulator|authorities)|file a complaint with)\b/i },
  { id: 'lawyer-involved', label: 'Lawyer involvement claimed', pattern: /\b(my lawyer|my attorney|our lawyers|our attorneys|legal counsel)\b/i },
];

// The excerpt around a match: 80 chars either side, capped, so the
// report shows what was actually said without carrying the whole text.
export function excerptAround(text, index, length) {
  const s = String(text || '');
  const start = Math.max(0, index - 80);
  const end = Math.min(s.length, index + length + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < s.length ? '…' : '';
  return `${prefix}${s.slice(start, end)}${suffix}`;
}

/**
 * Scan incoming text for legal-threat signals.
 * Returns { found, signals } — signals is [{ id, label, excerpt }],
 * one entry per signal that matched (each signal fires once per text).
 * found is false and signals is [] for empty or non-matching text.
 * The result states what matched; it never states what it means.
 */
export function scanIncomingLegalThreat(text) {
  const s = typeof text === 'string' ? text : '';
  const signals = [];
  if (!s) return { found: false, signals };
  for (const sig of LEGAL_SIGNALS) {
    const m = sig.pattern.exec(s);
    if (m) {
      signals.push({
        id: sig.id,
        label: sig.label,
        excerpt: excerptAround(s, m.index, m[0].length),
      });
    }
  }
  return { found: signals.length > 0, signals };
}
