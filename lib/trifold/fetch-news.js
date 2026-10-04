// lib/trifold/fetch-news.js
// Fetch this week's top stories from a newspaper's RSS feed. Server-only.
// Best-effort: RSS feeds move and die; every failure degrades gracefully
// to an empty list (the buddy can paste stories manually in the studio).

function stripTags(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? stripTags(m[1]) : '';
}

/**
 * Fetch up to `limit` stories from an RSS/Atom URL.
 * Returns [{ title, link, summary, published_at }]. Never throws.
 */
export async function fetchTopStories(rssUrl, limit = 8) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(rssUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TRIFOLD-newsletter/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
    return items.slice(0, limit).map((block) => ({
      title: pickTag(block, 'title').slice(0, 220),
      link: pickTag(block, 'link').slice(0, 500),
      summary: pickTag(block, 'description') || pickTag(block, 'summary'),
      published_at: pickTag(block, 'pubDate') || pickTag(block, 'published') || pickTag(block, 'updated'),
    })).filter((s) => s.title);
  } catch {
    return [];
  }
}
