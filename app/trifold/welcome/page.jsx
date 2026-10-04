// app/trifold/welcome/page.jsx
// Post-checkout landing: the trial has started (Stripe handles the rest).
'use client';

import Link from 'next/link';
import { TRIFOLD_NAME, TRIFOLD_TRIAL_LABEL, TRIFOLD_PRICE_LABEL } from '@/lib/trifold/constants';

export default function TrifoldWelcome() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '4rem 1.25rem', color: '#e8e6df', textAlign: 'center' }}>
      <p style={{ fontSize: '3rem', margin: '0 0 1rem' }}>📰</p>
      <h1 style={{ margin: '0 0 0.8rem' }}>You're in!</h1>
      <p style={{ color: '#9aa0b5', lineHeight: 1.7, margin: '0 0 0.6rem' }}>
        Your <strong style={{ color: '#e8e6df' }}>{TRIFOLD_TRIAL_LABEL} free trial</strong> of {TRIFOLD_NAME} has started.
        A new issue lands every week — real, ruin, radiant.
      </p>
      <p style={{ color: '#6b7190', fontSize: '0.88rem', margin: '0 0 2rem' }}>
        After the trial: {TRIFOLD_PRICE_LABEL}/month, cancel anytime. We'll email you before anything is ever charged.
      </p>
      <Link href="/trifold/archive" style={{ display: 'inline-block', padding: '0.85rem 2rem', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
        Start reading
      </Link>
    </main>
  );
}
