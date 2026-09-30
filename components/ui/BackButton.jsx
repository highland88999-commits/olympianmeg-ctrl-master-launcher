'use client';

// Canonical back button. Re-exports the existing PageBack (placement language:
// .page-back CSS, 44px target, history-aware with hub fallback) so new code
// has one import path: @/components/ui.
export { default } from '../PageBack';
export { default as BackButton } from '../PageBack';
