export const metadata = {
  title: 'Wizards Chess',
  description: 'Next-Generation WebGL Wizards Chess Platform',
};

export default function ChessLayout({ children }) {
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#050505] text-white antialiased">
      {children}
    </div>
  );
}


