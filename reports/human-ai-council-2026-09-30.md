# Council mode for /human-ai — 2026-09-30

## What changed

`lib/human-ai/consensus.js` (multi-agent council verdicts) and the agent loop in
`lib/human-ai/agent.js` existed in the repo but were dead — nothing imported them;
only the Compass ethics check was wired into the UI. The Council is now a first-class
mode of /human-ai.

- **CHAT / COUNCIL mode tabs** in the /human-ai header. Council mode sends the query
  to a new `POST /api/council` endpoint and renders the result inline:
  - a card per council agent (Gemini Prime, Copilot Beta, Grok X) with its focus lens
    and its verdict on the user's actual task;
  - a consensus panel: APPROVED status, nurture score (6–10), and a final consensus summary.
- **Honest labeling**: the verdict cards carry a "SIMULATED COUNCIL — deliberation
  personas, not live model calls" note. The council is deterministic, local, and
  task-aware (it profiles the task: kind, key terms, question/build/plan signals) —
  it makes no live calls to third-party models, costs no API quota.
- **Same ethics gate as chat**: `/api/council` runs the Compass `checkIntent` first;
  violations return 403 and the Council never convenes.
- Council deliberations are included in the EXPORT LOG as markdown.
- Scroll/safe-area clearance preserved (cards live inside the existing chat scroll).

## Ordering constraint (dad bypass)

The task required verifying the `dad` handshake-bypass strip in
`lib/human-ai/agent.js` before building. On first inspection the bypass was still
present (`handshake === 'dad'` in the `isArchitect` check); when re-read before
editing, the separate builder's strip had already landed:
`const isArchitect = (handshake === process.env.HANDSHAKE);`. No bypass remains —
a test asserts it (`agent.js has no 'dad' string at all`).

## Files

- `lib/human-ai/consensus.js` — rewritten: task profiling + per-agent deliberation
  + consensus summary. Keeps the `evaluateHarvest(task)` export contract.
- `lib/human-ai/agent.js` — verified clean of the `dad` bypass (changed by the
  separate builder, not this task; included in the publish allowlist only if it
  still differs from remote main).
- `app/api/council/route.js` — new: 400 on empty task, 403 on Compass violation,
  200 with the council result.
- `app/human-ai/page.tsx` — mode tabs, council fetch branch, verdict-card rendering,
  council-aware export log, mode-specific placeholder/loading text.
- `app/human-ai/human-ai.css` — mode tabs, verdict cards, consensus panel,
  mobile width handling.
- `tests/human-ai-council.test.mjs` — 30/30 green.

## Tests

`node tests/human-ai-council.test.mjs` → **30 passed, 0 failed**. Covers: verdict
structure (3 agents, fields), task-awareness (verdicts reference the task; different
tasks differ), determinism, empty-task rejection, Compass gating, dad-bypass absence,
route existence/shape, page wiring, honest-label copy, CSS presence.

## Build

`npm run build` → green (see build log tail in this report's verification notes).

## Supabase

None. No new tables, no migrations, no RLS changes. Nothing queued for Merlin.

## Merlin-only actions

None. No env vars, no webhooks, no SQL.
