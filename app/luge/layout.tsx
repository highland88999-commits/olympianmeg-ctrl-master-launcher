import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cyberpunk Luge | Zeus Nexus',
  description: 'Neon Descent Engine.',
};

export default function LugeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen m-0 p-0 overflow-hidden bg-black font-mono">
      {children}
    </div>
  );
}


