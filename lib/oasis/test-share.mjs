// OASIS share tests — deep-link building and code extraction (pure parts).
import { buildJoinUrl, codeFromSearch } from './share.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// Deep links.
ok(buildJoinUrl('https://example.com', 'chess', 'ABCDEF') === 'https://example.com/chess?code=ABCDEF', 'join URL format');
ok(buildJoinUrl('https://example.com/', 'basketball', 'abcdef') === 'https://example.com/basketball?code=ABCDEF', 'origin slash stripped, code uppercased');
ok(buildJoinUrl('https://example.com', 'colosseum', '  xy1234 ') === 'https://example.com/colosseum?code=XY1234', 'code trimmed + uppercased');

// Code extraction from query strings.
ok(codeFromSearch('?code=ABCDEF') === 'ABCDEF', 'extracts code');
ok(codeFromSearch('?code=abcdef') === 'ABCDEF', 'extracts lowercase code uppercased');
ok(codeFromSearch('?foo=1&code=XY1234') === 'XY1234', 'extracts among params');
ok(codeFromSearch('') === null, 'empty search -> null');
ok(codeFromSearch('?foo=bar') === null, 'missing code -> null');
ok(codeFromSearch(null) === null, 'null search safe');

// Round trip: build a URL, pull the code back out.
{
  const url = buildJoinUrl('https://example.com', 'chess', 'QWERTY');
  const back = codeFromSearch('?' + url.split('?')[1]);
  ok(back === 'QWERTY', 'build/extract round trip');
}

console.log(`share: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
