export const metadata = {
  title: 'Wizards Chess',
  description: 'WebGL Wizards Chess — play in your browser',
};

export default function ChessLayout({ children }) {
  return (
    <div className="w-screen h-dvh overflow-hidden bg-[#050505] text-white antialiased">
      {children}
    </div>
  );
}


