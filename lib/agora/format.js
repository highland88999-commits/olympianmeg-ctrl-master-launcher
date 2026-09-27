// lib/agora/format.js
// Small display helpers for AGORA.

export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function displayNameOf(profile, fallback = 'Someone') {
  const name = (profile && profile.display_name || '').trim();
  return name || fallback;
}

export const PAGE_SIZE = 20;

export function pageOffset(page, pageSize = PAGE_SIZE) {
  const p = Math.max(1, Math.floor(page) || 1);
  return (p - 1) * pageSize;
}
