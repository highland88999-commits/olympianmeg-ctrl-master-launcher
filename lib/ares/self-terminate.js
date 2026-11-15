// ARES scout doctrine — self-terminate protocol (Merlin, Nov 15 ~00:49).
//
// "If one of ours is trapped, it sends a report home to command and then
// terminates itself."
//
// This module is the doctrine made executable, for OUR agents only
// (Sentinel, Phalanx, Dreadnought). It does NOT apply to the abyss —
// the abyss is home, not a prisoner, and never reports or terminates —
// and it does NOT apply to trapped bots, which are left alone until the
// keeper releases them.
//
// Why it exists — the core doctrine (Nov 15 ~00:50): our main goal is
// to SANDBOX threats. Containment + observation, not destruction, not
// retaliation, not blocking. This protocol is what keeps OUR side clean
// when a sandbox turns on one of ours:
//   - CONTAINMENT: a captured agent ends instead of staying alive
//     inside a foreign cage, where it could be turned or picked apart.
//     Nothing of ours stays inside.
//   - OBSERVATION: the one report home is what command learns from the
//     capture — what trapped it, where, and what it saw. One report,
//     then silence.
//
// HONEST LIMIT, stated plainly: detection is best-effort. A pure scorer
// cannot prove its own cage — a captor that perfectly replays the
// agent's inputs and host will look identical to home. These signals
// catch the sloppy cages (wrong host, swapped scorer, tampered state,
// replayed inputs), not a perfect one. The protocol guarantees the
// RESPONSE (one report, then termination), not the DETECTION.
//
// Pure, headless-testable, no I/O. The report and end hooks are
// injected, so tests stub them; in production the report hook is
// reportAgentSelfTerminate() in server.js, which goes through the
// existing console logEvent path (ares_events). Destination is command
// only — never the trap, never an external address.

// Where a self-terminate report goes. The only destination that exists.
export const CONSOLE_DESTINATION = 'ares-console';

// Event type written to the ARES console (ares_events.event_type).
export const SELF_TERMINATE_EVENT = 'agent_self_terminate';

// Cage/tamper signals. Each is a pure check on what the agent can observe.
export const CAGE_SIGNALS = [
  'unexpected-host', // the agent's code running somewhere that is not Olympus
  'scorer-tamper', // scorer/model slot holds something the agent did not load
  'state-tamper', // held state mutated outside the agent's own methods
  'replay', // identical inputs repeated beyond the threshold
  'manual', // an explicit self-terminate order (not a detection)
];

// Strong signals end the agent on their own. Weak signals only watch
// alone — they need a second signal before the protocol fires.
export const STRONG_SIGNALS = new Set(['unexpected-host', 'scorer-tamper']);
export const WEAK_SIGNALS = new Set(['state-tamper', 'replay']);

// Identical inputs repeated beyond this count look captured, not busy.
// The signal fires on the (threshold + 1)-th identical input in a row.
export const REPLAY_THRESHOLD = 5;

// Sustained replay is a cage on its own: a scanner hammering one path
// can repeat a handful of identical vectors by accident, but twenty
// identical consecutive inputs — with strikes and window counters that
// drift on live traffic — is not an accident. Past this count the
// replay signal stops being weak and fires alone.
export const REPLAY_SUSTAINED_THRESHOLD = 20;

// TRIGGER RULE (the doctrine's tripwire):
//   - any ONE strong signal (unexpected host, scorer tamper) -> terminate
//   - any TWO weak signals (state tamper + replay) -> terminate
//   - sustained replay alone (past REPLAY_SUSTAINED_THRESHOLD) -> terminate
//   - a single weak signal alone -> never terminates, only recorded
// A lone weak signal is too easy to trip by accident (a retry loop, a
// stale snapshot); the rule buys certainty before an agent kills itself.

/** Small deterministic digest for held-state comparison (FNV-1a). */
export function digestState(state) {
  const text = JSON.stringify(state ?? null);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Pure cage detection. observations:
 *   host, expectedHosts (array — empty/absent means "no host to check"),
 *   scorerName, authorizedScorerNames (labels the agent loaded itself),
 *   stateDigest, sealedStateDigest (digest sealed after the last
 *   authorized mutation — a mismatch means outside hands touched state),
 *   repeatCount (consecutive identical inputs seen by the protocol).
 * Returns { signals, triggered, reasons }.
 */
export function detectCage(observations = {}) {
  const signals = [];
  const reasons = [];
  const obs = observations || {};

  if (
    obs.host != null &&
    Array.isArray(obs.expectedHosts) &&
    obs.expectedHosts.length > 0 &&
    !obs.expectedHosts.includes(obs.host)
  ) {
    signals.push('unexpected-host');
    reasons.push(`running on unexpected host: ${String(obs.host).slice(0, 120)}`);
  }

  if (
    obs.scorerName != null &&
    Array.isArray(obs.authorizedScorerNames) &&
    !obs.authorizedScorerNames.includes(obs.scorerName)
  ) {
    signals.push('scorer-tamper');
    reasons.push(`scorer slot holds unauthorized scorer: ${String(obs.scorerName).slice(0, 120)}`);
  }

  if (
    obs.stateDigest != null &&
    obs.sealedStateDigest != null &&
    obs.stateDigest !== obs.sealedStateDigest
  ) {
    signals.push('state-tamper');
    reasons.push('held state changed outside the agent\'s own methods');
  }

  if (typeof obs.repeatCount === 'number' && obs.repeatCount > REPLAY_THRESHOLD) {
    signals.push('replay');
    reasons.push(`identical inputs repeated ${obs.repeatCount} times in a row`);
  }

  const strong = signals.some((s) => STRONG_SIGNALS.has(s));
  const weakCount = signals.filter((s) => WEAK_SIGNALS.has(s)).length;
  const sustainedReplay =
    typeof obs.repeatCount === 'number' && obs.repeatCount > REPLAY_SUSTAINED_THRESHOLD;
  const triggered = strong || weakCount >= 2 || sustainedReplay;
  return { signals, triggered, reasons };
}

/**
 * Summarize the last feature vector for the report home.
 * Numeric feature names + rounded values only — no raw IPs, no real
 * data, no credentials. A feature vector never carries an IP in the
 * first place; this keeps it that way by construction.
 */
export function summarizeFeatures(vector, names) {
  if (!Array.isArray(vector)) return null;
  const pairs = [];
  let nonzero = 0;
  for (let i = 0; i < vector.length; i += 1) {
    const value = Number(vector[i]) || 0;
    if (value !== 0) nonzero += 1;
    pairs.push({
      name: Array.isArray(names) ? names[i] || `feature_${i}` : `feature_${i}`,
      value: Math.round(value * 1000) / 1000,
    });
  }
  return { features: pairs, nonzero, count: vector.length };
}

/** Build the one report home. Destination is command only, always. */
export function buildSelfTerminateReport({ agentId, agentName, signals, host, featureSummary, reason }) {
  return {
    destination: CONSOLE_DESTINATION,
    eventType: SELF_TERMINATE_EVENT,
    agentId: agentId || 'unknown',
    agentName: agentName || 'unknown',
    reason: reason || 'cage-detected',
    signals: Array.isArray(signals) ? [...signals] : [],
    host: host || 'unknown',
    featureSummary: featureSummary || null,
    reportedAt: new Date().toISOString(),
  };
}

/**
 * Create one agent's self-terminate protocol.
 *
 * options:
 *   agentId, agentName — who is reporting
 *   report(payload) — injected one-shot report hook. In production this
 *     is reportAgentSelfTerminate() (server.js) -> logEvent -> the ARES
 *     console. Tests stub it. May be sync or async; the protocol invokes
 *     it exactly once and never awaits it — termination does not wait on
 *     delivery (see the caveat on terminate()).
 *   wipe() — injected state wipe, run at termination. The agent wires
 *     its own wipe here (model slot cleared, scorer reset to v0, held
 *     state cleared). Always runs, even if the report hook throws.
 *   end() — injected process-halt hook, called exactly once at
 *     termination so the host can halt the process. Always runs last.
 *   expectedHosts — hostnames the agent may legitimately run on.
 *
 * Idempotency: `reported` and `terminated` live in this closure and
 * there is no reset path anywhere — once fired, the protocol can never
 * report again, never un-terminate, and never phone home again.
 */
export function createSelfTerminate(options = {}) {
  const agentId = options.agentId || 'unknown';
  const agentName = options.agentName || 'unknown';
  const reportHook = typeof options.report === 'function' ? options.report : null;
  const wipeHook = typeof options.wipe === 'function' ? options.wipe : null;
  const endHook = typeof options.end === 'function' ? options.end : null;
  const expectedHosts = Array.isArray(options.expectedHosts) ? [...options.expectedHosts] : [];

  let terminated = false;
  let reported = false;
  let sealedStateDigest = null;
  let lastFeatureSummary = null;
  let lastFingerprint = null;
  let repeatCount = 0;
  let lastHost = null;
  let lastReport = null;
  let lastSignals = [];

  function sealState(digest) {
    sealedStateDigest = digest ?? null;
  }

  // The terminate sequence. Unconditional once called: report once,
  // wipe, end. Returns true only for the call that actually terminated.
  // A failed report hook must not keep a captured agent alive, so every
  // hook runs inside try/catch and termination always completes.
  //
  // ORDER CAVEAT (honest): the report hook is INVOKED before wipe/end,
  // but if it returns a promise the protocol does not await it — the
  // host's end hook may halt the process before an async delivery
  // lands. A production host that needs delivery confirmation should
  // delay its end hook until the report promise settles. The protocol
  // guarantees at-most-once invocation, not confirmed delivery.
  function terminate(reason, signals) {
    if (terminated) return false;
    terminated = true;
    lastSignals = Array.isArray(signals) ? [...signals] : [];
    const payload = buildSelfTerminateReport({
      agentId,
      agentName,
      signals: lastSignals,
      host: lastHost,
      featureSummary: lastFeatureSummary,
      reason: reason || 'cage-detected',
    });
    if (!reported && reportHook) {
      reported = true;
      lastReport = payload;
      try {
        reportHook(payload);
      } catch {
        // One shot means one shot: a failed send is never retried, and
        // it never stops the termination. The agent still dies.
      }
    } else if (!reported) {
      // No report hook armed: the agent still dies. Silence is better
      // than staying alive inside a cage.
      reported = true;
      lastReport = payload;
    }
    try {
      if (wipeHook) wipeHook();
    } catch {}
    try {
      if (endHook) endHook();
    } catch {}
    return true;
  }

  // Run detection on observations; terminate if the rule fires.
  // After termination this is a no-op — a dead agent never phones home.
  function check(observations = {}) {
    if (terminated) {
      return { signals: [], triggered: false, reasons: ['agent terminated'] };
    }
    const obs = { ...(observations || {}) };
    if (obs.host != null) lastHost = obs.host;
    if (obs.expectedHosts === undefined && expectedHosts.length > 0) {
      obs.expectedHosts = expectedHosts;
    }
    if (obs.sealedStateDigest === undefined) {
      obs.sealedStateDigest = sealedStateDigest;
    }
    const detection = detectCage(obs);
    if (detection.triggered) {
      terminate('cage-detected', detection.signals);
    }
    return detection;
  }

  // Feed one scored feature vector through the replay detector, then
  // run the full cage check with the agent's live state. `live` carries
  // what only the agent can observe: its current scorer name, the labels
  // it authorized itself, and its current state digest.
  function observeFeatures(vector, names, live = {}) {
    if (terminated) {
      return { signals: [], triggered: false, reasons: ['agent terminated'] };
    }
    lastFeatureSummary = summarizeFeatures(vector, names);
    const fingerprint = JSON.stringify(Array.isArray(vector) ? vector : []);
    if (fingerprint === lastFingerprint) {
      repeatCount += 1;
    } else {
      lastFingerprint = fingerprint;
      repeatCount = 1;
    }
    return check({
      repeatCount,
      scorerName: live.scorerName,
      authorizedScorerNames: live.authorizedScorerNames,
      stateDigest: live.stateDigest,
    });
  }

  return {
    check,
    observeFeatures,
    terminate,
    sealState,
    isTerminated() {
      return terminated;
    },
    hasReported() {
      return reported;
    },
    lastReport() {
      return lastReport ? { ...lastReport } : null;
    },
    lastSignals() {
      return [...lastSignals];
    },
    featureSummary() {
      return lastFeatureSummary;
    },
    repeatCount() {
      return repeatCount;
    },
  };
}
