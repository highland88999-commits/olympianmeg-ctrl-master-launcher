// ARES honeypot trap: fake .DS_Store. Logs the visit, serves fake bait
// (200) to ordinary visitors; extra-malicious visitors go to the
// abyss sandbox instead. Defensive only: nothing here harms the
// visitor, and every secret shown is provably fake.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleTrap } from '@/lib/ares/honeypot';
import { apiGuard } from '@/lib/api-guard';
import { fakeBaitFor } from '@/lib/ares/fake-bait';

export const GET = apiGuard(async function GET(request) {
  return handleTrap(request, '/api/honeypot/ds-store', { fakeContent: fakeBaitFor('ds-store') });
});
