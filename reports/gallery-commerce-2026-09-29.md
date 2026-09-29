# Gallery pay-per-download — 2026-09-29

The Museum gallery (`/museum`) is now pay-per-download: **$0.10 per image**, sold as download credits because Stripe can't charge $0.10 directly.

## Commerce model

- **C$1.00 = 10 download credits; 1 credit = 1 download.** The $0.10-per-image price is exact.
- Stripe product: **"Olympus Gallery Download Credits"** — `prod_VLmvHAVIXonNuH` (live mode)
- Stripe price: **C$1.00 one-time** — `price_1UL5LGC6BMYhx5j9DHtYlkNi` (live mode, set as default price)
- Checkout: Stripe Checkout session, `mode: 'payment'`, metadata `surface:'gallery'` + `user_id`.
- The reuse license is shown in the lightbox before download and granted at redemption time:
  *"Your purchase grants you a non-exclusive, perpetual, worldwide, royalty-free license to download and reuse the purchased image for any purpose, including commercial use and modification. Credit "Merlin Ambros / Olympus Gallery" is appreciated but not required. You may not resell the unmodified image as a standalone stock file."*

## Protection stack (and its honest limit)

**What was implemented:**
- Visible watermark **burned into all 107 preview files** (`public/textures/museum/**` — bottom-right "© OLYMPUS GALLERY" ribbon). Originals backed up at `~/workspace/scratch/museum-originals/`.
- A second CSS watermark overlay on every tile and lightbox image.
- Right-click / long-press context menu suppressed, drag suppressed, `draggable={false}`, `user-select: none`, `-webkit-touch-callout: none` on gallery images.
- **No direct file URLs anywhere in the UI.** The only download path is a signed, expiring (15 min) HMAC token URL issued after 1 credit is redeemed; the file streams as an attachment from `/api/gallery/download/<token>`.

**The plain truth:** no website can block OS-level screenshots or screen recording on iOS/Android. That is a device capability, not a browser permission. The burned-in watermark is the real protection — it travels with any screenshot. Do not promise buyers (or Merlin) that screenshots are disabled.

## Ledger (server-side, webhook-verified)

- `supabase/gallery.sql` — new, queued for the frozen consolidated SQL (Merlin runs it; see below). Tables: `gallery_balances`, `gallery_ledger` (append-only), `gallery_downloads`. Single write path: `gallery_credit_apply()` — idempotent (Stripe session id = idempotency key, so webhook retries never double-credit), refuses negative balances, serializes per user. RLS: owner-read only.
- `POST /api/gallery/checkout` — signed-in users only; resolves the Stripe product by exact name at runtime and re-verifies the 100¢ CAD price server-side; refuses a surprise price change rather than charging the wrong amount.
- `POST /api/gallery/webhook` — signature-verified; on `checkout.session.completed` with `surface:'gallery'`, credits 10. Degrades honestly (acknowledge 200) until the tables exist.
- `GET /api/gallery/credits` — balance for the signed-in user.
- `POST /api/gallery/redeem` — debits 1 credit (402 if insufficient), records the license grant, returns the signed download URL.
- `GET /api/gallery/download/<token>` — verifies HMAC + 15-min expiry, containment-checks the path to `public/textures/museum/`, streams as attachment.

## Full catalog import (the 3,927)

`scripts/gallery-import-map.mjs` maps the censused AI graphics into the two-tier pipeline:
- **Tier 1 (originals, private):** full-res clean files, server-side only — the future clean-file download source.
- **Tier 2 (previews, public):** downscaled (max 1600px) + burned watermark → `public/textures/museum/<series>/`.
- Verified on a sample: manifest.json + gallery-import.sql (future `gallery_items` table) + watermarked previews all generate correctly. The repo was NOT bloated with 3,927 images in this pass.
- Note: until the import runs, downloads serve the current watermarked catalog files through the payment gate. The import script documents the clean-original tier for the full drop-in.

## What Merlin must do

1. **Run `supabase/gallery.sql`** in the Supabase SQL editor (folds into the consolidated draft later). Until then, routes answer honestly: checkout/credits/redeem return "not connected yet", the webhook acknowledges without crediting.
2. **Register the webhook** in the Stripe dashboard: endpoint `https://olympusverse.com/api/gallery/webhook` (or the active deployment domain), listening to `checkout.session.completed`.
3. **Set env vars** in Vercel: `STRIPE_GALLERY_WEBHOOK_SECRET` (or the shared `STRIPE_WEBHOOK_SECRET`); optional `GALLERY_DOWNLOAD_SECRET` (falls back to `STRIPE_SECRET_KEY`).
4. **Test mode vs live:** the connected Stripe credential is **live mode**. The product/price above are LIVE catalog objects (creating them charges nobody and moves no money). Real test purchases will charge real $1.00 — do a live $1 test only when ready, or ask for a test-mode key to be connected first.
5. **Nothing was published to the store.** No card was used. No telemetry added.

## Files changed

- `lib/gallery.js` (new) — commerce constants, license, signed-token helpers
- `supabase/gallery.sql` (new) — ledger tables + `gallery_credit_apply()`
- `app/api/gallery/checkout/route.js`, `webhook/route.js`, `credits/route.js`, `redeem/route.js`, `download/[token]/route.js` (new)
- `app/museum/page.jsx` — credit bar, buy flow, lightbox download + license, watermark overlays, gesture suppression
- `public/textures/museum/**` — 107 preview files watermarked (originals backed up at `~/workspace/scratch/museum-originals/`)
- `scripts/gallery-import-map.mjs` (new) — 3,927-image import mapping
- `tests/gallery.test.mjs` (new) — 24/24 headless tests pass
- `reports/gallery-commerce-2026-09-29.md` (this file)
