import type { Metadata } from "next";
import "./fortress.css";

export const metadata: Metadata = {
  title: "Olympus | Personal Fortress",
  description: "Secure 3D Crystal Data Vault",
  manifest: "/manifest.json",
};

export default function FortressLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-[100dvh] overflow-hidden bg-black text-white touch-none overscroll-none antialiased">
      {children}
    </div>
  );
}


