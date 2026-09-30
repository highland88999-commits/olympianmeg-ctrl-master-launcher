'use client';
import { useRouter } from 'next/navigation';

export default function ColosseumAccordPage() {
  const router = useRouter();
  return (
    <div className="min-h-dvh bg-[#0a0a10] text-white" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <main className="max-w-xl mx-auto px-5 py-8">
        <button
          onClick={() => router.push('/colosseum')}
          className="text-sm text-white/50 hover:text-white/80 mb-6 min-h-[44px]"
        >
          ← Colosseum
        </button>
        <h1 className="text-3xl font-black tracking-widest mb-1">THE ACCORD</h1>
        <p className="text-white/50 text-sm mb-8">The rules of the pit, in plain English. Last updated September 2026.</p>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-teal-300 mb-2">What Colosseum is</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Colosseum is a free arena game. You tap gladiators to strike them down and earn glory
            in 60-second rounds. There is no way to pay for anything, win anything of monetary
            value, or buy any placement, land, or advantage. The old idea of paid &ldquo;nodes&rdquo;
            or digital real estate in the arena does not exist here and never will.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-teal-300 mb-2">No payments, no gambling</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            There are no payments, no cryptocurrency, no staking, and no gambling of any kind.
            The &ldquo;Injector&rdquo; is an in-game ability meter charged by defeating gladiators —
            it has no cash value and cannot be bought, sold, or transferred.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-teal-300 mb-2">What we store</h2>
          <p className="text-white/70 text-sm leading-relaxed mb-2">
            Nothing is recorded unless you explicitly press <b>SAVE</b> after a round. When you do,
            we store exactly:
          </p>
          <ul className="text-white/70 text-sm leading-relaxed list-disc pl-5 space-y-1">
            <li>the gladiator name you typed (up to 24 characters),</li>
            <li>your glory score,</li>
            <li>the mode (arena or champion fight),</li>
            <li>the party room code, if you played in an OASIS party room,</li>
            <li>the time the score was saved.</li>
          </ul>
          <p className="text-white/70 text-sm leading-relaxed mt-2">
            Scores are kept in a shared leaderboard table so every player can see the Hall of Champions.
            That is the entire database footprint of this game.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-teal-300 mb-2">No tracking</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            We do not track you. There is no visitor identification, no device fingerprinting,
            no analytics beacon, and no third-party script watching your play. The game runs
            entirely in your browser; only a score you choose to save ever leaves your device.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-teal-300 mb-2">Your name</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Pick any gladiator name — it does not have to be your real name. Names are shown
            publicly on the leaderboard. If you want a saved score removed, contact us and we
            will delete it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-teal-300 mb-2">Fair play</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Scores are submitted from your own device. Tampered or automated submissions may be
            removed from the leaderboard. Play with honor.
          </p>
        </section>
      </main>
      <div aria-hidden="true" className="player-clear" />
    </div>
  );
}
