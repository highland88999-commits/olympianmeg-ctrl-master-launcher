import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Battleship",
  description: "WebGL 3D Neon Battleship - Powered by Olympus",
};

export default function BattleshipLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="w-screen h-dvh overflow-hidden bg-[#050505] text-white antialiased">
      {children}
    </div>
  );
}


