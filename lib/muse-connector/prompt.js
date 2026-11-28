// lib/muse-connector/prompt.js — the setup prompt, in ONE place.
//
// THE single source for the prompt users give their Muse to set up
// the connector (Merlin, Nov 27 ~04:16: the prompt is given to users
// to copy FROM THEIR APP). The Connect Muse button in the app renders
// this constant with a COPY button; the connector doc carries the same
// text verbatim; a test pins that the doc still matches it. One
// prompt, no drift — edit here, then copy the same text to the doc.
//
// Revised Nov 27 ~04:15 (key placement dropped): no key step, no
// paste step. Supabase is the gatekeeper — the user's Olympus sign-in
// is the credential and the server verifies it on every request.
// Every name and route in it is real and verified in the code.

export const SETUP_PROMPT = `Set up the Olympus connector for me. Here is exactly what to do, in order.

Step 0 — the invite. If you joined Muse with Merlin's invite and have not redeemed it yet, redeem code 7HADJF at https://muse.ai/join, in Settings, within 48 hours of joining. On the phone: Settings, then Redeem token. On the web: Settings, then General, then Usage, then Redeem invite code. Both of us get 1 billion Muse tokens. If you already redeemed it, skip this step.

Step 1 — sign in to Olympus. Go to https://olympusverse.com and sign in with your Olympus account. Tap Continue with Google for one-tap sign-in, or sign in with your email and password. You must be signed in before anything else works, because the connector belongs to your Olympus account.

Step 2 — connect your Muse. In Olympus, open your Profile and tap Connect Muse. That registers your account with the connector. Supabase is the gatekeeper: it checks your sign-in and your registration on every request, server-side. There is no key to copy, no code to paste, nothing to put anywhere — your Olympus sign-in is the credential, and the server verifies it every time.

Step 3 — check it works. Ask Muse to read your connector registry: it calls GET https://olympusverse.com/api/muse-connector?action=registry with your Olympus sign-in and shows you your registration and your scope. If it answers that the registry is not set up yet, the Olympus keeper is still wiring it — wait and try again.

Step 4 — use it. Ask Muse to list your creations (GET https://olympusverse.com/api/muse-connector?action=assets). To change one of your worlds, tell Muse the world and what you want different — Muse calls POST https://olympusverse.com/api/muse-connector with action direct, the world id as asset_id, and your directions as prompt (up to 2000 characters). Your world is re-forged with your directions, on the same path as the Direct it with Muse box on the world page.

The rules, plainly. Your Muse can only ever change what belongs to your account — your own worlds, creations, builds, and planets. It cannot change anything that belongs to another account, and it cannot run any action on something outside your account. If it tries, Olympus refuses it. There is no key: nothing is shown to you, copied, or pasted at any point — Supabase checks your sign-in and your registration on every request. ARES watches every request on the connector route, and everything your Muse sends out through the connector is recorded. If you want to stop it, tell Muse to revoke it, or tap Connect Muse in your Profile again and revoke it there — the connection stops at once.`;
