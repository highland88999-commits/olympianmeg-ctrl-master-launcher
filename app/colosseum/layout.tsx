import './colosseum.css';

export const metadata = {
  title: 'Telemetry Dashboard',
  description: 'System telemetry and network tracking',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="colosseum-wrapper">
      <div className="background-layer"></div>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}


