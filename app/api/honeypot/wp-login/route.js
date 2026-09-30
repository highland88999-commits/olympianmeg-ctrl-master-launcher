// ARES honeypot trap: fake WordPress login. Logs the visit, answers 404.
// Defensive only: nothing here harms the visitor.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleTrap } from '@/lib/ares/honeypot';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(request) {
  return handleTrap(request, '/api/honeypot/wp-login');
});
export const POST = apiGuard(async function POST(request) {
  return handleTrap(request, '/api/honeypot/wp-login');
});
