import type { Metadata } from 'next';
import './human-ai.css';

export const metadata: Metadata = {
  title: 'HUMAN AI | OMEGA x OLYMPUS',
  description: 'A universal digital assistant with real-time global awareness.',
};

export default function HumanAILayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="human-ai-wrapper">
      {children}
    </div>
  );
}


