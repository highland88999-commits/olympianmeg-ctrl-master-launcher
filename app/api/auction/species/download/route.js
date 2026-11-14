// app/api/auction/species/download/route.js
// POST /api/auction/species/download
//   Buy (or take free) one species file download.
//   Body: { file_key, pay_method ('wallet'|'stripe') }.
//   Sign-in required — the download is tied to the buyer's account.
//
//   Price rule (Merlin, 2026-11-12): the first 20 downloads of the
//   file are FREE (global counter, not per user), then $5.00 USD.
//   - Free: the counter claim is atomic (species_claim_free only fires
//     while the count is under 20), so two buyers racing the last free
//     slot cannot both win it. No money moves.
//   - Paid: $5.00 through the same legs as an auction buy-now — wallet
//     debit (idempotent on a per-purchase reference, so buying the same
//     file twice is two real purchases) or Stripe PaymentIntent
//     create+confirm with the real fee read off the charge; Merlin's
//     $1.00 platform fee via chargeOracleFee; the house (Merlin) is
//     credited net of the Stripe fee and the platform fee.
//   - Either way the buyer gets a 1-hour signed URL to the file in the
//     private `species-files` bucket. The file itself is never buffered
//     through this route (these are 186–337 MB files).
//   - The object is checked to exist BEFORE any money moves, so a paid
//     buyer can never pay for a file that is not in the vault yet.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { getServiceClient } from '@/lib/economy/supabase';
import { getStripe } from '@/lib/connect/server';
import { debitWallet, creditWallet } from '@/lib/wallet/ledger.js';
import { chargeOracleFee, getMerlinUserId } from '@/lib/oracle/server.js';
import { readStripeFeeCents } from '@/lib/auction/settle';
import {
  SPECIES_BUCKET,
  SPECIES_PRICE_CENTS,
  SPECIES_SIGNED_URL_TTL_SECONDS,
  speciesFileByKey,
  speciesPurchaseRef,
  speciesSaleRef,
  speciesFeeRef,
} from '@/lib/auction/species';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const fileKey = String(body.file_key || '').trim();
  const payMethod = String(body.pay_method || '').trim().toLowerCase();
  if (!fileKey) return NextResponse.json({ error: 'Choose a file to download.' }, { status: 400 });
  if (!['wallet', 'stripe'].includes(payMethod)) {
    return NextResponse.json({ error: 'Choose wallet or card as the payment method.' }, { status: 400 });
  }

  const found = speciesFileByKey(fileKey);
  if (!found) return NextResponse.json({ error: 'That file is not listed.' }, { status: 404 });
  const { file, dataset } = found;
  if (dataset.status !== 'live') {
    return NextResponse.json({ error: 'This file is not ready yet — it is still being built.' }, { status: 409 });
  }

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });
  const service = await getServiceClient();
  if (!service) return NextResponse.json({ error: 'The file vault is not connected yet.' }, { status: 503 });

  // The object must exist BEFORE any money moves.
  const objectName = String(file.storageKey).replace(/^species\//, '');
  let objectThere = false;
  try {
    const { data, error } = await service.storage
      .from(SPECIES_BUCKET)
      .list('species', { limit: 100, search: objectName });
    if (!error && Array.isArray(data)) {
      objectThere = data.some((o) => o && o.name === objectName);
    }
  } catch {
    objectThere = false;
  }
  if (!objectThere) {
    return NextResponse.json(
      { error: 'This file is still being placed in the vault. Check back soon.' },
      { status: 503 }
    );
  }

  // Mint the 1-hour signed URL BEFORE any money moves or any free slot
  // is claimed. The URL is useless until it is returned to the buyer,
  // and minting first means a paid buyer can never pay for a file that
  // fails to open — a signing failure stops here, before the charge.
  const { data: signed, error: signErr } = await service.storage
    .from(SPECIES_BUCKET)
    .createSignedUrl(file.storageKey, SPECIES_SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: 'The file could not be opened right now. Nothing was charged — try again.' },
      { status: 502 }
    );
  }
  const downloadUrl = signed.signedUrl;

  // Make sure the counter row exists (first download of a file).
  const { error: upsertErr } = await admin
    .from('species_download_counts')
    .upsert({ file_key: fileKey, download_count: 0 }, { onConflict: 'file_key' });
  if (upsertErr) {
    return NextResponse.json(
      { error: 'The download counter is not set up yet. The house needs its green-light SQL run first.' },
      { status: 503 }
    );
  }

  // Try the free claim first: atomic, one of the free 20 if any left.
  let downloadCount = null;
  let free = false;
  try {
    const { data: claimed, error: claimErr } = await admin.rpc('species_claim_free', { p_file_key: fileKey });
    if (!claimErr && claimed !== null && claimed !== undefined) {
      downloadCount = Math.round(Number(claimed) || 0);
      free = true;
    }
  } catch {
    free = false;
  }

  const purchaseId = crypto.randomUUID();
  let stripeFeeCents = 0;

  if (!free) {
    // Paid: $5.00 through the auction's own money legs.
    const price = SPECIES_PRICE_CENTS;
    const stripe = payMethod === 'stripe' ? await getStripe() : null;
    if (payMethod === 'stripe' && !stripe) {
      return NextResponse.json({ error: 'Card payments are not connected yet.' }, { status: 503 });
    }

    if (payMethod === 'wallet') {
      try {
        await debitWallet(admin, user.id, {
          program: 'species',
          amountCents: price,
          reason: `Species file — ${file.label}`,
          reference: speciesPurchaseRef(fileKey, user.id, purchaseId),
          fromHeld: false,
        });
      } catch (err) {
        return NextResponse.json(
          { error: String(err?.message || 'The wallet could not pay for this.') },
          { status: 402 }
        );
      }
    } else {
      try {
        const intent = await stripe.paymentIntents.create({
          amount: price,
          currency: 'usd',
          description: `Species file — ${file.label}`,
          metadata: { file_key: fileKey, buyer_id: String(user.id) },
        });
        const confirmed = await stripe.paymentIntents.confirm(intent.id);
        if (confirmed.status !== 'succeeded') {
          try { await stripe.paymentIntents.cancel(intent.id); } catch { /* best effort */ }
          throw new Error('The card needs extra verification to complete this purchase.');
        }
        stripeFeeCents = await readStripeFeeCents(stripe, confirmed, intent.id);
      } catch (err) {
        return NextResponse.json(
          { error: String(err?.message || 'The card could not be charged.') },
          { status: 402 }
        );
      }
    }

    // Merlin's $1.00 platform fee — same as every auction sale.
    let platformFeeCents = 0;
    try {
      const { feeCents } = await chargeOracleFee(admin, {
        program: 'species',
        transactionRef: speciesFeeRef(fileKey, purchaseId),
        transactionCents: price,
      });
      platformFeeCents = feeCents;
    } catch (err) {
      // Money already moved; the fee is a housekeeping leg, not the sale.
      // Log and continue so the buyer still gets the file they paid for.
      console.error('Species platform fee failed (sale continues):', err?.message || err);
    }

    // The house (Merlin) is credited net of the Stripe fee and the
    // platform fee — the same net rule as every auction sale.
    try {
      const merlinId = await getMerlinUserId(admin);
      await creditWallet(admin, merlinId, {
        program: 'species',
        grossCents: price,
        stripeFeeCents,
        platformFeeCents,
        reason: `Species file sale — ${file.label}`,
        reference: speciesSaleRef(fileKey, purchaseId),
      });
    } catch (err) {
      console.error('Species seller credit failed (sale continues):', err?.message || err);
    }

    // Record the paid download.
    try {
      const { data: counted } = await admin.rpc('species_record_download', { p_file_key: fileKey });
      if (counted !== null && counted !== undefined) downloadCount = Math.round(Number(counted) || 0);
    } catch {
      // The money legs already recorded the sale; the counter is a
      // display number, not the sale record.
      console.error('Species download count failed to record.');
    }
  }

  return NextResponse.json({
    ok: true,
    free,
    chargedCents: free ? 0 : SPECIES_PRICE_CENTS,
    downloadUrl,
    downloadCount,
    fileKey,
    label: file.label,
  });
});
