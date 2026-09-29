// World Engine — 3D engine page: live canvas + credit HUD + library.
import dynamic from 'next/dynamic';
import Link from 'next/link';
import CreditsPanel from '@/components/world-engine/CreditsPanel';
import NeuralBackpack from '@/components/world-engine/NeuralBackpack';

const WorldCanvas = dynamic(() => import('@/components/world-engine/WorldCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-black font-mono text-[#00ffcc] tracking-widest">
      Starting 3D engine...
    </div>
  ),
});

export default function EnginePage() {
  return (
    <>
    <main className="relative h-dvh w-full overflow-hidden bg-black text-white">
      <div className="absolute inset-0 z-0">
        <WorldCanvas />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
        <div className="flex justify-between items-start">
          <Link
            href="/world-engine/dashboard"
            className="pointer-events-auto border border-gray-700 bg-black/70 px-4 py-2 text-xs font-mono font-bold tracking-widest hover:border-[#00ffcc] hover:text-[#00ffcc] transition-all"
          >
            &larr; Dashboard
          </Link>
          <div className="pointer-events-auto">
            <CreditsPanel />
          </div>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-6 z-20">
        <NeuralBackpack />
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 z-10 hidden md:block">
        <p className="font-mono text-[10px] text-gray-500 tracking-widest text-right leading-relaxed">
          Drag to orbit · Scroll to zoom<br />Press I for your library
        </p>
      </div>
    </main>
    {/* Safari bottom-bar clearance: blank space under the fixed 3D viewport */}
    <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </>
  );
}
