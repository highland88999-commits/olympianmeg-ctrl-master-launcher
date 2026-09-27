import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AQUARIUM | Multi-Node Console',
  description: 'Observatory video matrix terminal.',
};

export default function AquariumLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="aquarium-wrapper">
      {children}
    </div>
  );
}


