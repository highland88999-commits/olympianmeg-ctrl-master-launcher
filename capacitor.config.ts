// Capacitor config — NEXUS VORTEX native shell (iOS + Android).
//
// Strategy (see ~/workspace/github-work/reports/mobile-conversion-plan-2026-09-29.md):
// live-URL wrapper — the shell loads the production deployment, so every API route,
// Supabase auth callback, and Stripe webhook keeps working with zero rearchitecture.
// `webDir` is required by the CLI but unused at runtime in server-url mode.
// The ios/ and android/ platform folders are CI-generated (Mac CI for iOS) and are
// NOT committed by hand.
//
// Capacitor v8: @capacitor/cli is an installed dependency, so the typed
// config is safe (tsc --noEmit verified 2026-09-30). If the import ever goes
// unresolvable again, `next build` type-checking on Vercel breaks — drop back
// to the plain object before touching anything else.
import type { CapacitorConfig } from '@capacitor/cli';

// Plain-object config (CapacitorConfig shape); typed automatically once @capacitor/cli is installed.
const config: CapacitorConfig = {
  // Provisional bundle id — Merlin registers the final id in App Store Connect /
  // Play Console at enrollment; update here to match before the first native build.
  appId: 'com.olympusverse.nexus',
  appName: 'NEXUS VORTEX',
  webDir: 'public',
  server: {
    url: 'https://olympusverse.com',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#050505',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#050505',
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
