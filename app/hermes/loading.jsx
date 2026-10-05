// app/hermes/loading.jsx
// Route-level loading state for the HERMES mall — gold shimmer while the
// server fetches the directory.
import { HermesLoader } from '@/components/hermes-ui/HermesUi';

export default function HermesLoading() {
  return (
    <main className="relative min-h-dvh w-full bg-black text-white">
      <div className="max-w-6xl mx-auto px-5 pt-14 sm:pt-20 pb-16">
        <header className="text-center mb-10">
          <p className="text-xs tracking-[0.3em] text-amber-500/80 mb-3">Argus Observatory</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wide">HERMES</h1>
        </header>
        <HermesLoader label="Opening the mall" />
      </div>
    </main>
  );
}
