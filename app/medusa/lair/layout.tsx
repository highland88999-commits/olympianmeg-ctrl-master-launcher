import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MEDUSA\'S LAIR | THERAPY NODE',
  description: 'Gaze Chamber',
};

export default function MedusaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-dvh m-0 p-0 overflow-hidden bg-[#030305] font-mono">
      {children}
    </div>
  );
}


