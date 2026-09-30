// components/persephone/LedgerPanel.jsx
// The PERSEPHONE house-cut explainer + estimator.
//
// Merlin's rule, in plain English, on screen:
//   the house takes 10% of NET profit (revenue − card fees − costs).
//   Not 10% of the total. No profit, no cut.
//
// The estimator uses Stripe-fee ESTIMATES (labeled as such). Settled numbers
// come from Stripe once the webhook SQL is live — see supabase/persephone.sql
// (draft). Estimates are never presented as settled.

'use client';

import { useMemo, useState } from 'react';
import { splitLedger, estimateStripeFeeCents, formatCents } from '@/lib/persephone/ledger';

function parseDollars(str) {
  const n = Number(String(str).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

const inputCls =
  'w-full rounded-xl border border-[#3a2f1a] bg-[#0e0b07] px-4 py-3 text-sm text-[#e8d9b0] placeholder-[#5a5348]';

export default function LedgerPanel() {
  const [gross, setGross] = useState('10000');
  const [fees, setFees] = useState('');
  const [costs, setCosts] = useState('2000');
  const [useEstimate, setUseEstimate] = useState(true);

  const split = useMemo(() => {
    const grossCents = parseDollars(gross);
    const costsCents = parseDollars(costs);
    // Fee estimate assumes the average ticket in the order; the estimator
    // labels it clearly. Real fees come from Stripe at settlement.
    const feeCents = useEstimate
      ? estimateStripeFeeCents(5000) * Math.max(1, Math.round(grossCents / 5000))
      : parseDollars(fees);
    return { ...splitLedger({ grossCents, stripeFeesCents: feeCents, costsCents }), feeCents, estimated: useEstimate };
  }, [gross, fees, costs, useEstimate]);

  const rows = [
    ['Ticket revenue', split.revenueCents, ''],
    [`Card fees${split.estimated ? ' (estimate)' : ''}`, split.feeCents, '−'],
    ['Costs — venue, sound, staff', split.costsCents, '−'],
    ['Net profit', split.netCents, '='],
    ['House cut — 10% of net', split.houseCutCents, ''],
    ['Artist payout', split.artistPayoutCents, ''],
  ];

  return (
    <section aria-label="The house cut" className="w-full">
      <h2 className="text-2xl font-light tracking-[0.2em] text-[#ffd700]">THE HOUSE CUT</h2>
      <p className="mt-2 text-sm text-[#a89a78] leading-relaxed">
        Merlin&apos;s rule, plain and simple: the house takes <span className="text-[#e8d9b0] font-bold">10% of net profit</span> —
        what&apos;s left after card fees and costs. Not 10% of the total. If a night loses money, the house takes nothing.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs tracking-[0.25em] uppercase text-[#8a7f66]">Ticket revenue ($)</span>
          <input value={gross} onChange={(e) => setGross(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1`} aria-label="Ticket revenue in dollars" />
        </label>
        <label className="block">
          <span className="text-xs tracking-[0.25em] uppercase text-[#8a7f66]">Costs ($)</span>
          <input value={costs} onChange={(e) => setCosts(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1`} aria-label="Costs in dollars" />
        </label>
        <label className="block">
          <span className="text-xs tracking-[0.25em] uppercase text-[#8a7f66]">Card fees ($)</span>
          <input
            value={useEstimate ? 'estimated' : fees}
            onChange={(e) => { setUseEstimate(false); setFees(e.target.value); }}
            onFocus={() => setUseEstimate(false)}
            inputMode="decimal"
            className={`${inputCls} mt-1`}
            aria-label="Card fees in dollars"
            placeholder="or type actual fees"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => setUseEstimate(true)}
        className="mt-2 text-xs text-[#8a7f66] hover:text-[#ffd700] uppercase tracking-widest"
      >
        Use Stripe fee estimate instead
      </button>

      <div className="mt-4 rounded-2xl border border-[#3a2f1a] bg-[#0e0b07] overflow-hidden">
        {rows.map(([label, cents, op], i) => {
          const highlight = i >= 4;
          return (
            <div
              key={label}
              className={`flex items-center justify-between px-5 py-3 ${i > 0 ? 'border-t border-[#241e12]' : ''} ${highlight ? 'bg-[#151007]' : ''}`}
            >
              <span className={`text-sm ${highlight ? 'text-[#e8d9b0] font-bold' : 'text-[#a89a78]'}`}>
                {op && <span className="text-[#5a5348] mr-2">{op}</span>}{label}
              </span>
              <span className={`tabular-nums ${i === 5 ? 'text-[#ffd700] text-lg font-bold' : highlight ? 'text-[#e8d9b0]' : 'text-[#8a7f66]'}`}>
                {formatCents(cents)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-[#6a6050] leading-relaxed">
        This is an estimator. Settled numbers — real card fees from Stripe and the final payout —
        arrive once the payment records are live. Estimates are never shown as settled.
      </p>
    </section>
  );
}
