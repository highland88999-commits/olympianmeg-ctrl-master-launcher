// ARES honeypot trap: fake admin panel. Logs the visit, answers 404.
// Defensive only: nothing here harms the visitor.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleTrap } from '@/lib/ares/honeypot';

export async function GET(request) {
  return handleTrap(request, '/api/honeypot/admin');
}
export async function POST(request) {
  return handleTrap(request, '/api/honeypot/admin');
}
