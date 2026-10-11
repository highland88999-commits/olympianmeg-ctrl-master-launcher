// lib/achievements/award.js
// Consolidated client-side grant trigger wiring for achievements.
//
// Every game wires its detectable triggers (see
// lib/achievements/GAME_ACHIEVEMENT_PLAN.md) through grantAchievement():
// it POSTs the key to the whitelisted /api/achievements/grant route and
// reports whether the server awarded it fresh. Pair with
// components/achievements/AchievementBanner for the celebration:
//
//   import { grantAchievement } from '@/lib/achievements/award';
//   import AchievementBanner from '@/components/achievements/AchievementBanner';
//
//   const [celebrateKey, setCelebrateKey] = useState(null);
//   const getToken = async () => (await supabase.auth.getSession()).data?.session?.access_token || null;
//
//   // ... inside the game's win handler:
//   const r = await grantAchievement('chess-first-blood', getToken);
//   if (r.awarded) setCelebrateKey('chess-first-blood');
//
//   <AchievementBanner achievementKey={celebrateKey} show={!!celebrateKey}
//     onDismiss={() => setCelebrateKey(null)} />
//
// Rules: fire-and-forget — a grant failure must NEVER break gameplay.
// awarded=false means the user already holds it (no repeat celebration).
// Guests (no token) earn nothing server-side.

/**
 * Request a whitelisted achievement grant for the signed-in user.
 * @param {string} key - achievement key from lib/achievements/catalog.js
 * @param {() => Promise<string|null>} getToken - resolves the Supabase access token
 * @returns {Promise<{ok:boolean, awarded:boolean, key:string}>}
 */
export async function grantAchievement(key, getToken) {
  try {
    const token = typeof getToken === 'function' ? await getToken() : null;
    if (!token) return { ok: false, awarded: false, key, skipped: 'signed-out' };
    const res = await fetch('/api/achievements/grant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ key }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, awarded: !!(res.ok && json && json.awarded), key };
  } catch (err) {
    return { ok: false, awarded: false, key, error: String((err && err.message) || err) };
  }
}
