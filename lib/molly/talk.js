// lib/molly/talk.js
//
// Shared scripted content for Molly's demo interfaces (the /molly sandbox
// portal and the Molly panel inside ARES). Pure data + pure functions: no
// network, no live mind, no outside services. The talk box answers from
// these replies, and the demo hunt replays these fixed practice lines.
//
// Deliberate boundary, kept in both interfaces: the tracking display
// follows a DECOY TRIP (a thing Molly planted), never a person. No facial,
// voice, DNA, or behavior scoring of any human, no clearance levels, no
// re-education language — the video's dystopian target panel is style
// reference only, never content.

export const MOLLY_PARTS = [
  ['Skin', 'Sentinel decoys — fake files, wallets, and profiles with tracking IDs. When one is taken, it reports home.'],
  ['Nerves', 'A small swarm that engages a tripwire contact and collects observations. Here it runs practice scenarios only.'],
  ['Brain', 'ARES-style scoring: detection leads (0.40), defense pattern (0.35), severity (0.25). Every catch sharpens the next.'],
  ['Conscience', 'Artemis governance: nurture, organize, protect. Two judges must agree, and a human must approve, before anything counts as report-ready.'],
  ['Memory', 'A hash-chained recall log. Every hunt is remembered, in order, tamper-evident.'],
];

export function mollyReplyFor(text) {
  const t = text.toLowerCase();
  if (/(^|\s)(hi|hello|hey)(\s|$|!)/.test(t)) return 'Hello. I am Molly — a sandbox copy of the hunter, here for testing. The real me stays sealed away; I am the version you can poke at safely.';
  if (t.includes('who are you') || t.includes('what are you')) return 'I am Molly, a predator-and-scam hunter. I bait and report — I never hack back. My job is to lure the people who exploit others into revealing themselves, gather clean evidence, and package it for the authorities.';
  if (t.includes('mission') || t.includes('why') || t.includes('purpose')) return 'My mission is to hunt online predation and eradicate it — and to grow, one day, into protection offline too: safe housing for people with nothing. Safety as a utility, like heat and light.';
  if (t.includes('skin') || t.includes('decoy') || t.includes('tripwire') || t.includes('canary')) return 'My skin is Sentinel decoys: fake credential files, wallet seeds, and profiles, each with a unique tracking ID. When someone takes one, the taking itself is the evidence.';
  if (t.includes('swarm') || t.includes('nerve') || t.includes('engage')) return 'My nerves are a small swarm. Agents engage a tripwire contact just long enough to collect observations — links, pressure, identifiers — and never attack. Here they run practice scenarios, not live chats.';
  if (t.includes('brain') || t.includes('score') || t.includes('ares')) return 'My brain scores every trip three ways: detection 0.40, defense pattern 0.35, severity 0.25. Detection leads, because a hunter that cannot detect cannot do anything else. Press "Run a demo hunt" and watch it work.';
  if (t.includes('conscience') || t.includes('govern') || t.includes('directive') || t.includes('mom')) return 'My conscience is three directives: nurture, organize, protect. Two judges must agree and a human must approve before any package counts as report-ready. And one command freezes me cold — the silver bullet.';
  if (t.includes('memory') || t.includes('recall') || t.includes('log')) return 'My memory is a hash-chained log: every hunt appended in order, each entry carrying the hash of the last, so tampering breaks the chain. What I remember, I remember in order.';
  if (t.includes('freeze') || t.includes('frozen') || t.includes('silver bullet')) return 'The silver bullet is my freeze: one command stops everything and preserves all state. Only the Architect unfreezes me. Try the Freeze button below — everything else will refuse until you unfreeze.';
  if (t.includes('hunt') || t.includes('demo')) return 'Press "Run a demo hunt" and I will walk you through one: plant a decoy, trip it, engage, score, govern, and package — all here, all offline.';
  if (t.includes('help') || t.includes('what can you')) return 'Ask me about my mission, my skin, my swarm, my brain, my conscience, or my memory — or press "Run a demo hunt" to watch a full hunt play out.';
  return 'I am a sandbox copy, so I answer from a small script, not a live mind. Ask me about my mission, my parts, or press "Run a demo hunt" — or ask for help to see what I can show you.';
}

export const MOLLY_DEMO_LINES = [
  'Planting decoy: a wallet seed with a fresh tracking ID… planted.',
  'Trip: the decoy was taken. Trip recorded.',
  'Swarm engaging (practice scenario)…',
  '  observation: contact asks for the wallet seed phrase.',
  '  observation: contact shares a lookalike wallet-restore link.',
  '  observation: contact urges immediate transfer before “expiry”.',
  '  observation: contact reveals a receiving address.',
  'Scoring: detection 0.750, pattern 0.675, severity 0.600 → total 0.686.',
  'Verification: verified and corroborated (4 distinct observation kinds).',
  'Council: both judges agree.',
  'Package pkg-0001 → pending-approval. It waits on the Architect — a human — before it ever counts as report-ready.',
];
