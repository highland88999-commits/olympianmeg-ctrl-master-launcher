// lib/job-board/adapters/we-work-remotely.js — We Work Remotely (remote, live).
// RSS: https://weworkremotely.com/remote-jobs.rss
// Verified live 2026-11-21 (HTTP 200, 100 items). Item title is
// "Company: Role". All listings are remote. Attribution: each item's link
// is the source's own URL.

import {
  fetchText, stripHtml, decodeEntities, parseLocationString,
  normalizeJob, matchesQuery,
} from './common.js';

const FEED_URL = 'https://weworkremotely.com/remote-jobs.rss';

export function parseWwrFeed(xml) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  const jobs = [];
  for (const item of items) {
    const get = (tag) => {
      const m = item.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return m ? decodeEntities(m[1]).trim() : '';
    };
    const rawTitle = get('title');
    const link = get('link');
    if (!rawTitle || !link) continue;
    const colon = rawTitle.indexOf(':');
    const company = colon > 0 ? rawTitle.slice(0, colon).trim() : null;
    const title = colon > 0 ? rawTitle.slice(colon + 1).trim() : rawTitle;
    const region = get('region');
    jobs.push(normalizeJob({
      id: `we-work-remotely:${link.split('/').filter(Boolean).pop() || rawTitle}`,
      source: 'we-work-remotely',
      title,
      company,
      location: parseLocationString(region, { remote: true }),
      salary: null,
      type: get('type') || null,
      postedAt: get('pubDate') || null,
      url: link,
      description: stripHtml(get('description')),
    }));
  }
  return jobs;
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const xml = await fetchText(FEED_URL);
  return parseWwrFeed(xml)
    .filter((j) => matchesQuery(j, q))
    .slice(0, limit);
}
