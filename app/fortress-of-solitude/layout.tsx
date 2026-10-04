import type { Metadata } from "next";
import "./fortress.css";

export const metadata: Metadata = {
  title: "Olympus | Personal Fortress",
  description: "Secure 3D Crystal Data Vault",
  manifest: "/manifest.json",
};

export default function FortressLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fortress-scope w-screen h-[100dvh] overflow-hidden bg-black text-white touch-none overscroll-none antialiased">
      {/* ATHENA interior treatment: depth-field behind the 3D canvas + boot veil */}
      <div className="fortress-bg" aria-hidden="true" />
      <div className="fortress-veil" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 L20 7 V12 C20 16.5 16.8 20 12 22 C7.2 20 4 16.5 4 12 V7 Z" />
          <path d="M12 8v6 M9 11h6" />
        </svg>
        <span>Warming the fortress</span>
      </div>
      {children}
    </div>
  );
}


