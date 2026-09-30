import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CERBERUS | Global Network Node",
  description: "Universal Panning Environment & Web Proxy Workspace",
};

export default function CerberusLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="w-screen h-dvh overflow-hidden bg-[#050505] text-white antialiased overscroll-none font-bitcount">
      {children}
    </div>
  );
}


