// app/wallet/how-it-works/page.jsx
// The Doomsday tutorial: banner -> tutorial -> boom, they're in.
// Four steps, Loki-green, clean. Server component, no client JS needed.
import Link from 'next/link';

const STEPS = [
  {
    n: '01',
    title: 'Earn',
    body: 'Every program pays into your wallet. News subscriptions, Program Requests bounties, referrals, artist payouts — your cut lands here automatically, timestamped and viewable down to the cent.',
  },
  {
    n: '02',
    title: 'Accumulate',
    body: 'Nothing auto-pays out. Your balance grows in your wallet, safe and visible, while every transaction shows the full math: gross, fees, and exactly what landed.',
  },
  {
    n: '03',
    title: 'Doomsday — Dec 11',
    body: 'The financial system releases. Withdrawals unlock for everyone at once, and the payout queue starts moving — oldest earnings first, fully automatic.',
  },
  {
    n: '04',
    title: "Boom — you're in",
    body: 'Tap withdraw, join the queue, and the money moves to your bank. Every state is timestamped and honest: requested, queued, processing, completed. Never a fake state.',
  },
];

export const metadata = {
  title: 'How it works — Doomsday',
  description:
    'Earn, accumulate, and withdraw on Doomsday: how the wallet and the financial system release work.',
};

export default function HowItWorks() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#03130b',
        color: '#a7f3d0',
        padding: '3rem 1.25rem 5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ maxWidth: 640, width: '100%' }}>
        <p
          style={{
            color: '#34d399',
            fontWeight: 800,
            letterSpacing: '0.25em',
            fontSize: '0.8rem',
            marginBottom: '0.5rem',
          }}
        >
          DOOMSDAY
        </p>
        <h1
          style={{
            color: '#ecfdf5',
            fontSize: '2rem',
            fontWeight: 800,
            margin: '0 0 0.75rem',
            lineHeight: 1.2,
          }}
        >
          The financial system, in four steps.
        </h1>
        <p style={{ color: '#5fb98a', margin: '0 0 2.5rem', lineHeight: 1.6 }}>
          Your money earns, accumulates, and releases — all in one wallet, all timestamped, all
          yours.
        </p>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem' }}>
          {STEPS.map((s) => (
            <li
              key={s.n}
              style={{
                border: '1px solid rgba(52,211,153,0.25)',
                borderRadius: 12,
                padding: '1.25rem 1.4rem',
                background: 'rgba(52,211,153,0.05)',
              }}
            >
              <div
                style={{
                  color: '#34d399',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  letterSpacing: '0.2em',
                  marginBottom: '0.4rem',
                }}
              >
                {s.n}
              </div>
              <h2 style={{ color: '#ecfdf5', fontSize: '1.25rem', margin: '0 0 0.5rem' }}>
                {s.title}
              </h2>
              <p style={{ color: '#8fd6ae', margin: 0, lineHeight: 1.65 }}>{s.body}</p>
            </li>
          ))}
        </ol>

        <Link
          href="/wallet"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: '2.5rem',
            background: '#34d399',
            color: '#03130b',
            fontWeight: 800,
            fontSize: '1.05rem',
            borderRadius: 12,
            padding: '0.9rem',
            textDecoration: 'none',
          }}
        >
          View wallet →
        </Link>
        <p style={{ textAlign: 'center', color: '#4a7d5f', fontSize: '0.85rem', marginTop: '1rem' }}>
          Withdrawals unlock for everyone on December 11, 2026.
        </p>
      </div>
    </main>
  );
}
