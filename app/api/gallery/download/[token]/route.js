// app/api/gallery/download/[token]/route.js
// GET /api/gallery/download/<token>
// Verifies the signed, expiring download token and streams the artwork
// file as an attachment. This is the ONLY way to reach a downloadable
// file: the gallery UI never links to /textures/museum paths for
// downloading, and previews carry the watermark.

export const dynamic = 'force-dynamic';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ITEMS } from '@/lib/museum';
import { verifyDownloadToken } from '@/lib/gallery';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

function downloadSecret() {
  return process.env.GALLERY_DOWNLOAD_SECRET || process.env.STRIPE_SECRET_KEY || '';
}

export async function GET(req, { params }) {
  const secret = downloadSecret();
  if (!secret) return new Response('Downloads are not configured yet.', { status: 503 });

  let token = '';
  try { token = decodeURIComponent(params?.token || ''); } catch { token = ''; }
  const verified = await verifyDownloadToken(token, secret);
  if (!verified) {
    return new Response('This download link is invalid or has expired. Redeem your download again from the gallery.', { status: 403 });
  }

  const item = ITEMS.find((i) => i.id === verified.itemId);
  if (!item || typeof item.src !== 'string' || !item.src.startsWith('/textures/museum/')) {
    return new Response('That artwork is not available.', { status: 404 });
  }

  const rel = item.src.replace(/^\/+/, '');
  // Containment: only files inside public/textures/museum may be served.
  const root = join(process.cwd(), 'public', 'textures', 'museum');
  const filePath = join(process.cwd(), 'public', rel);
  if (!filePath.startsWith(root + '/')) {
    return new Response('That artwork is not available.', { status: 404 });
  }

  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch {
    return new Response('That artwork is not available.', { status: 404 });
  }

  const ext = (item.src.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
  const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || item.id;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${slug}${ext}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(bytes.length),
    },
  });
}
