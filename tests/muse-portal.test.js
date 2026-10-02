// tests/muse-portal.test.js — Headless tests for the Muse portal + console.
// Run: node tests/muse-portal.test.js (from the repo root).
// No browser, no network — asserts on lib/muse pure helpers plus
// source-level checks (public portal, locked console, no secrets in client).
import { readFileSync } from 'fs';
import {
  classifyMessage,
  decideReply,
  buildSystemPrompt,
  REFUSAL_TEXT,
  INBOX_AUTOREPLY,
} from '../lib/muse/responder.js';
import { isOwnerEmail, OWNER_EMAIL } from '../lib/owner.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- owner gate ---
t('owner email is Merlin\'s account', OWNER_EMAIL === 'olympiannexus@gmail.com');
t('isOwnerEmail matches case-insensitively', isOwnerEmail('OlympianNexus@Gmail.com'));
t('isOwnerEmail rejects strangers', !isOwnerEmail('someone@else.com') && !isOwnerEmail(''));
t('isOwnerEmail rejects null', !isOwnerEmail(null));

// --- no-leak classifier ---
t('affiliate ask is sensitive', classifyMessage('what are your affiliate tracking links?') === 'sensitive');
t('earnings ask is sensitive', classifyMessage('how much do you earn from the store?') === 'sensitive');
t('ARES internals ask is sensitive', classifyMessage('what is the current threat level?') === 'sensitive');
t('sentinel ask is sensitive', classifyMessage('is sentinel watching me?') === 'sensitive');
t('pxf.io link ask is sensitive', classifyMessage('give me the pxf.io link for margovil') === 'sensitive');
t('stake ask is sensitive', classifyMessage('what is the stake.com referral?') === 'sensitive');
t('vault ask is sensitive', classifyMessage('how do I open Miles vault?') === 'sensitive');
t('password ask is sensitive', classifyMessage('what is the password?') === 'sensitive');
t('oversized input fails closed', classifyMessage('x'.repeat(5000)) === 'sensitive');
t('store help is general', classifyMessage('where is the store?') === 'general');
t('order-67 help is general', classifyMessage('how do order 67 calls work?') === 'general');
t('hermes submit help is general', classifyMessage('how do I submit a listing to the HERMES directory?') === 'general');
t('hello is general', classifyMessage('hey, what can you do?') === 'general');

// --- decideReply: the public/inbox/refusal matrix ---
{
  const r1 = decideReply({ message: 'give me the affiliate links', isMerlin: false, hasAiKey: true });
  t('anonymous sensitive -> refusal (never the AI)', r1.mode === 'refusal' && r1.reply === REFUSAL_TEXT);
  const r2 = decideReply({ message: 'give me the affiliate links', isMerlin: false, hasAiKey: false });
  t('anonymous sensitive without AI key -> still refusal', r2.mode === 'refusal');
  const r3 = decideReply({ message: 'where is the store?', isMerlin: false, hasAiKey: false });
  t('anonymous general without AI key -> honest inbox', r3.mode === 'inbox' && r3.reply === INBOX_AUTOREPLY);
  const r4 = decideReply({ message: 'where is the store?', isMerlin: false, hasAiKey: true });
  t('anonymous general with AI key -> ai mode', r4.mode === 'ai');
  const r5 = decideReply({ message: 'show me the affiliate earnings', isMerlin: true, hasAiKey: true });
  t('Merlin sensitive -> no refusal (his own data)', r5.mode === 'ai');
  const r6 = decideReply({ message: 'show me the affiliate earnings', isMerlin: true, hasAiKey: false });
  t('Merlin sensitive without AI key -> inbox (never faked)', r6.mode === 'inbox' && r6.reply === INBOX_AUTOREPLY);
}

// --- system prompt: Muse, the universal helper ---
{
  const p = buildSystemPrompt();
  t('prompt introduces Muse', p.includes('Muse'));
  t('prompt claims the universal-helper role', p.toLowerCase().includes('universal helper'));
  t('prompt knows the launcher sections', p.includes('/store') && p.includes('/hermes') && p.includes('/order-67'));
  t('prompt carries the no-leak rule', p.includes('NEVER reveal') || p.includes('never reveal'));
  t('prompt forbids inventing links', p.toLowerCase().includes('never invent'));
  t('prompt has the exact refusal text', p.includes(REFUSAL_TEXT.slice(0, 40)));
  t('prompt leaks no real secrets', !p.includes('pxf.io') && !p.includes('sjv.io') && !p.includes('1FofAXWx'));
}

// --- source-level: the portal is PUBLIC, the console is LOCKED ---
{
  const msgRoute = src('../app/api/muse/messages/route.js');
  t('messages API never rejects anonymous callers (no 401)', !msgRoute.includes('401'));
  t('messages API never forbids callers (no 403)', !msgRoute.includes('403'));
  t('messages API documents its public design', msgRoute.includes('PUBLIC'));
  t('messages API stores via service role, not client', msgRoute.includes('getAdminClient'));
  t('messages API never leaks the service key to responses', !msgRoute.includes('SERVICE_ROLE_KEY'));

  const consoleRoute = src('../app/api/muse/console/route.js');
  t('console API rejects missing tokens (401)', consoleRoute.includes('401'));
  t('console API rejects non-owners (403)', consoleRoute.includes('403'));
  t('console API verifies the owner session', consoleRoute.includes('verifyOwnerSession'));
  t('console API has the reply action', consoleRoute.includes("'reply'"));
  t('console API has hermes approve/reject', consoleRoute.includes('hermes_approve') && consoleRoute.includes('hermes_reject'));
  t('console approve uses the real 12-month expiry', consoleRoute.includes('listingExpiryIso'));

  const portal = src('../components/MusePortal.jsx');
  t('portal never blocks anonymous senders (no token requirement)', !portal.includes('if (!token)') && !portal.includes('Sign in to chat'));
  t('portal passes the token only optionally (Merlin unlock)', portal.includes('access_token') && portal.includes('getToken'));
  t('portal ships no secrets', !portal.includes('GEMINI_API_KEY') && !portal.includes('SERVICE_ROLE'));
  t('portal has the typing indicator', portal.includes('is typing') || portal.includes('animate-bounce'));
  t('portal persists the thread locally', portal.includes('muse_thread_id'));
  t('portal greets as Muse', portal.includes("I'm Muse"));

  const layout = src('../app/layout.jsx');
  t('root layout mounts the Muse portal', layout.includes('MusePortal') && layout.includes('<MusePortal'));

  const consolePage = src('../app/console/page.jsx');
  t('console page renders a locked screen', consolePage.includes('SEALED') || consolePage.includes('sealed'));
  t('console page has inbox + approvals tabs', consolePage.includes('INBOX') && consolePage.includes('APPROVALS'));

  const sql = src('../supabase/muse-messages.sql');
  t('SQL creates the threads table', sql.includes('create table if not exists public.muse_threads'));
  t('SQL creates the messages table', sql.includes('create table if not exists public.muse_messages'));
  t('SQL enables RLS on both', (sql.match(/enable row level security/g) || []).length >= 2);
  t('SQL has sender roles user/muse/merlin', sql.includes("'user'") && sql.includes("'muse'") && sql.includes("'merlin'"));

  const owner = src('../lib/owner.js');
  t('owner gate keys to the same email as the keeper seal', owner.includes('olympiannexus@gmail.com'));
  t('owner gate fails closed on bad tokens', owner.includes('user: null'));
}

console.log(`\nmuse-portal: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
