'use client';

// Shared back affordance — the placement language for "leave this page".
// Matches the Prime build's back-button convention: 44px touch target,
// hairline border, small uppercase label. Falls back to the launcher hub
// when there is no history entry to go back to.
import { useRouter } from 'next/navigation';

export default function PageBack({ label = 'Back', href = '/' }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="page-back"
      onClick={() => {
        try {
          if (window.history.length > 1) router.back();
          else router.push(href);
        } catch {
          router.push(href);
        }
      }}
    >
      ← {label}
    </button>
  );
}
