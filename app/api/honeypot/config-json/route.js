// ARES honeypot trap: fake JSON config. Logs the visit, serves fake bait
// (200) to ordinary visitors; extra-malicious visitors go to the
// abyss sandbox instead. Defensive only: nothing here harms the
// visitor, and every secret shown is provably fake.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { handleTrap } from '@/lib/ares/honeypot';
import { apiGuard } from '@/lib/api-guard';
import { fakeBaitFor, isMobileUserAgent } from '@/lib/ares/fake-bait';

export const GET = apiGuard(async function GET(request) {
  // A phone UA gets the mobile-app-config flavour; same fake, same score.
  const mobile = isMobileUserAgent(request.headers.get('user-agent'));
  return handleTrap(request, '/api/honeypot/config-json', { fakeContent: fakeBaitFor('config-json', { mobile }) });
});
