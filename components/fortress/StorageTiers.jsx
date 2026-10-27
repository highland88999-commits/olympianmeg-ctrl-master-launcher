// Fortress of Solitude — storage tier cards overlay.
//
// Five cards: the four real purchasable storage tiers (50 GB, 250 GB, 1 TB,
// 5 TB — recurring monthly subscriptions in CAD, prices from the Stripe
// dashboard) and the Secure Pipeline card, which is NOT a purchase: it
// honestly describes the real encrypted pipeline and its button shows
// pipeline status instead of starting a checkout.

import React, { useState } from "react";
import { X, ShieldCheck, ArrowUpCircle, PlusCircle } from "lucide-react";
import {
  PAID_TIER_IDS,
  getTier,
  formatBytes,
  CUSTOM_TIER_MIN_GB,
  CUSTOM_TIER_MAX_GB,
  CUSTOM_TIER_RATE_CENTS_PER_GB,
  customTierPriceCents,
} from "@/lib/fortress/tiers";

export default function StorageTiers({ currentTier, usedBytes, quotaBytes, stackedBytes = 0, onAscend, onAscendCustom, onClose }) {
  const [busyTier, setBusyTier] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  // Custom tier: any amount, priced proportionally, ADDED to the allowance
  // (stacking). Rate default = the 50 GB tier's rate — Merlin has not set
  // the custom rate yet, so the UI says so plainly.
  const [customGb, setCustomGb] = useState(100);
  const customGbValid = Number.isInteger(customGb) && customGb >= CUSTOM_TIER_MIN_GB && customGb <= CUSTOM_TIER_MAX_GB;
  const customPriceCents = customGbValid ? customTierPriceCents(customGb) : 0;

  const ascend = async (tierId) => {
    setBusyTier(tierId);
    try {
      await onAscend(tierId);
    } finally {
      setBusyTier(null);
    }
  };

  const ascendCustom = async () => {
    if (!customGbValid || !onAscendCustom) return;
    setBusyTier("custom");
    try {
      await onAscendCustom(customGb);
    } finally {
      setBusyTier(null);
    }
  };

  const pct = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto touch-auto">
      <div className="glass-panel rounded-2xl w-full max-w-3xl p-6 md:p-8 relative my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-400/70 hover:text-cyan-400 transition-colors"
          aria-label="Close storage tiers"
        >
          <X size={22} />
        </button>

        <h2 className="text-cyan-400 tracking-[0.3em] text-sm font-bold mb-1">VAULT STORAGE</h2>
        <p className="text-white/60 text-xs tracking-wider mb-5">
          Your vault, your allowance. Ascend to hold more.
        </p>

        {/* Current position */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex justify-between text-[11px] tracking-widest text-cyan-300 mb-2">
            <span>{formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used</span>
            <span className="text-white/50">{pct.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 shadow-[0_0_10px_#00f2ff] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {stackedBytes > 0 && (
            <p className="text-[11px] tracking-widest text-cyan-300 mt-2">
              STACKED ROOM: +{formatBytes(stackedBytes)} on top of your tier, from custom purchases.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAID_TIER_IDS.map((id) => {
            const tier = getTier(id);
            const isCurrent = currentTier === id;
            return (
              <div
                key={id}
                className={`rounded-xl p-5 border flex flex-col gap-3 transition-all ${
                  isCurrent
                    ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_25px_rgba(0,242,255,0.25)]"
                    : "border-white/15 bg-black/40 hover:border-cyan-400/60"
                }`}
              >
                <div>
                  <div className="text-[10px] tracking-[0.25em] text-white/50 mb-1">{tier.productName}</div>
                  <div className="text-2xl font-bold text-white tracking-wide">{tier.label}</div>
                  <div className="text-cyan-400 text-sm font-bold tracking-wider mt-1">{tier.priceLabel}</div>
                </div>
                <p className="text-white/60 text-xs leading-relaxed flex-1">{tier.blurb}</p>
                {isCurrent ? (
                  <div className="text-center text-[11px] tracking-[0.25em] text-cyan-400 font-bold py-2">
                    YOUR TIER
                  </div>
                ) : (
                  <button
                    className="btn w-full flex items-center justify-center gap-2 py-3"
                    disabled={busyTier === id}
                    onClick={() => ascend(id)}
                  >
                    <ArrowUpCircle size={16} />
                    {busyTier === id ? "Opening checkout…" : "Ascend"}
                  </button>
                )}
              </div>
            );
          })}

          {/* Custom tier — any amount, stacked on top of the allowance. */}
          <div className="rounded-xl p-5 border border-amber-400/50 bg-black/40 flex flex-col gap-3">
            <div>
              <div className="text-[10px] tracking-[0.25em] text-white/50 mb-1">YOUR SIZE, YOUR PRICE</div>
              <div className="text-2xl font-bold text-white tracking-wide">Custom room</div>
              <div className="text-cyan-400 text-sm font-bold tracking-wider mt-1">
                {customGbValid ? `$${(customPriceCents / 100).toFixed(2)} CAD / month` : "Pick an amount"}
              </div>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">
              Pick any amount from {CUSTOM_TIER_MIN_GB} GB to {CUSTOM_TIER_MAX_GB} GB. It ADDS to your
              allowance — buying twice doubles the added room, and your stored files are never touched.
              Priced at ${(CUSTOM_TIER_RATE_CENTS_PER_GB / 100).toFixed(2)} per GB per month (the 50 GB
              tier&apos;s rate, used as the default until Merlin sets the custom rate).
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={CUSTOM_TIER_MIN_GB}
                max={CUSTOM_TIER_MAX_GB}
                value={customGb}
                onChange={(e) => setCustomGb(Number(e.target.value))}
                className="w-24 bg-black/60 border border-cyan-400/50 rounded-lg py-2 px-3 text-sm text-white outline-none"
                aria-label="Custom storage amount in GB"
              />
              <span className="text-white/60 text-xs">GB</span>
              <input
                type="range"
                min={CUSTOM_TIER_MIN_GB}
                max={1000}
                value={Math.min(customGb, 1000)}
                onChange={(e) => setCustomGb(Number(e.target.value))}
                className="flex-1 min-w-0 accent-cyan-400"
                aria-label="Custom storage amount slider (up to 1000 GB; type more above)"
              />
            </div>
            {!customGbValid && (
              <p className="text-amber-300/90 text-[11px] tracking-wider">
                Pick a whole number of GB between {CUSTOM_TIER_MIN_GB} and {CUSTOM_TIER_MAX_GB}.
              </p>
            )}
            <button
              className="btn w-full flex items-center justify-center gap-2 py-3"
              disabled={busyTier === "custom" || !customGbValid}
              onClick={ascendCustom}
            >
              <PlusCircle size={16} />
              {busyTier === "custom" ? "Opening checkout…" : customGbValid ? `Add ${customGb} GB` : "Add room"}
            </button>
          </div>

          {/* Secure Pipeline — not a purchase. */}
          <div className="rounded-xl p-5 border border-fuchsia-500/40 bg-black/40 flex flex-col gap-3">
            <div>
              <div className="text-[10px] tracking-[0.25em] text-white/50 mb-1">THE PIPELINE</div>
              <div className="text-2xl font-bold text-white tracking-wide">Secure Pipeline</div>
            </div>
            <p className="text-white/60 text-xs leading-relaxed flex-1">
              Every file is locked in your browser with AES-GCM-256 before it
              ever leaves your device. The server holds only ciphertext — never
              your files, never your passphrase.
            </p>
            {pipelineStatus ? (
              <div className="flex items-center gap-2 text-[11px] tracking-widest text-green-400 py-2">
                <ShieldCheck size={16} />
                ENCRYPTION ACTIVE — AES-GCM-256
              </div>
            ) : (
              <button
                className="btn w-full flex items-center justify-center gap-2 py-3 border-fuchsia-500 text-fuchsia-400 hover:bg-fuchsia-500/10 hover:shadow-[0_0_15px_#d946ef]"
                onClick={() => setPipelineStatus(true)}
              >
                <ShieldCheck size={16} />
                Pipeline status
              </button>
            )}
          </div>
        </div>

        <p className="text-white/40 text-[11px] tracking-wider text-center mt-6">
          Subscriptions renew monthly in CAD and can be cancelled anytime. Your stored files are never touched by a tier change.
        </p>
      </div>
    </div>
  );
}
