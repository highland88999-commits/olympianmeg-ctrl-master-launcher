// World Engine — credits page: balance, free tier, and honest credit purchases.
'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CREDIT_TIERS, formatBalance } from '@/lib/world-engine/economy';

export default function CreditsPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-black text-white font-mono p-10">Loading...</main>}>
      <CreditsInner />
    </Suspense>
  );
}

function CreditsInner() {
  const searchParams = useSearchParams();
  const [session, setSession] = useState(null);
  const [credits, setCredits] = useState(null);
  const [cardPayments, setCardPayments] = useState(null);
  const [buying, setBuying] = useState(null);
  const [notice, setNotice] = useState(null);

  const checkoutState = searchParams.get('checkout');

  const fetchCredits = useCallback(async (token) => {
    try {
      const res = await fetch('/api/world-engine/credits', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setCredits(await res.json());
    } catch { /* shown as unavailable */ }
  }, []);

  useEffect(() => {
    fetch('/api/world-engine/checkout').then((r) => r.json()).then(
      (d) => setCardPayments(!!d.cardPayments),
      () => setCardPayments(false)
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchCredits(session.access_token);
    });
  }, [fetchCredits]);

  useEffect(() => {
    if (checkoutState === 'success') {
      setNotice('Payment complete — your credits are on the way. They appear as soon as the payment confirmation arrives (usually within a minute).');
      if (session) {
        const t = setTimeout(() => fetchCredits(session.access_token), 4000);
        return () => clearTimeout(t);
      }
    } else if (checkoutState === 'cancelled') {
      setNotice('Checkout was cancelled — no charge was made.');
    }
  }, [checkoutState, session, fetchCredits]);

  const buy = async (tierId) => {
    setBuying(tierId);
    setNotice(null);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) {
        setNotice('Sign in from the launcher before buying credits.');
        return;
      }
      const res = await fetch('/api/world-engine/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ tier: tierId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed.');
      window.location.href = data.url;
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBuying(null);
    }
  };

  return (
    <main className="min-h-dvh bg-black text-white font-mono p-6 md:p-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">
        <header className="border-b border-[#00f0ff] pb-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#00f0ff] tracking-widest">Aether credits</h1>
          <Link href="/world-engine/dashboard" className="text-xs text-gray-400 hover:text-[#00ffcc] transition-colors">
            &larr; Back to dashboard
          </Link>
        </header>

        {notice && (
          <div className="border border-[#00f0ff]/40 bg-[#00f0ff]/10 p-3 rounded text-sm text-gray-200">{notice}</div>
        )}

        <div className="border border-gray-800 bg-[#05050a] p-6 flex flex-col gap-4">
          <h2 className="text-sm font-bold tracking-widest text-gray-400">Your balance</h2>
          {!session ? (
            <p className="text-sm text-gray-400">Sign in from the launcher to see your balance.</p>
          ) : (
            <>
              <p className="text-4xl font-bold text-[#00ffcc]">{credits ? formatBalance(credits.tokens) : '...'}</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                You get <span className="text-white font-bold">20 free AI generations every month</span>
                {credits ? ` — ${credits.freeRemaining} left this month.` : '.'} Paid generations cost
                Aether: worlds 500, weather 300, characters / creatures / vehicles 200,
                objects / weapons 100, asset uploads 50.
              </p>
            </>
          )}
        </div>

        <div className="border border-gray-800 bg-[#05050a] p-6 flex flex-col gap-4">
          <h2 className="text-sm font-bold tracking-widest text-gray-400">Buy credits</h2>
          {cardPayments === false && (
            <p className="text-sm text-yellow-300/90">
              Card payments are not connected yet (the site owner needs to add the Stripe keys).
              Your free monthly generations still work.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CREDIT_TIERS.map((tier) => (
              <div key={tier.id} className="border border-gray-700 p-5 flex flex-col gap-3">
                <p className="text-xl font-bold text-white">{tier.label}</p>
                <p className="text-2xl text-[#00ffcc] font-bold">{tier.price}</p>
                <button
                  onClick={() => buy(tier.id)}
                  disabled={buying !== null || cardPayments === false}
                  className="mt-2 border border-[#00ffcc] text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black transition-all py-2 text-sm font-bold tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {buying === tier.id ? 'Starting checkout...' : `Buy ${tier.label}`}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Checkout is handled by Stripe. Credits are added to your account automatically
            when the payment confirmation arrives — never enter card details anywhere else.
          </p>
        </div>
      </div>
    </main>
  );
}
