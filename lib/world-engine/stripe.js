// World Engine — client-side Stripe loader (publishable key only, cached).
// The secret key never leaves the server; see app/api/world-engine/*.
import { loadStripe } from '@stripe/stripe-js';

let stripePromise;

export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.error('Stripe is not configured: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.');
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};
