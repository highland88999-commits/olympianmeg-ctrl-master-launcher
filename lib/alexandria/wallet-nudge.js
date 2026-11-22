// lib/alexandria/wallet-nudge.js
// Pure helper for the Publisher Studio's payout-address nudge at mint time.
//
// A priced book minted without a wallet address leaves the author's 97%
// with nowhere to go when payouts begin (sales go live Jan 1, 2027;
// payouts start after FINTRAC + compliance). So the Studio asks once,
// gently — and publishing is never blocked: the author can always publish
// anyway. Free books never prompt, and a book with a wallet on file never
// prompts. No imports, so node tests exercise this directly.
//
// "Priced" mirrors the Library's isFree logic in app/alexandria/page.tsx:
// empty, '0', or containing 'free' (case-insensitive) counts as free.

/** True when the mint flow should ask about the missing payout address. */
export function needsWalletNudge(price, wallet) {
  const raw = String(price ?? '');
  const isFree = !raw || raw === '0' || raw.toLowerCase().includes('free');
  if (isFree) return false;
  if (String(wallet ?? '').trim()) return false;
  return true;
}
