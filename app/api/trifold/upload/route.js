// app/api/trifold/upload/route.js
// POST /api/trifold/upload  (multipart form-data; buddy only)
//
// Fields: edition_id, file (Blob/File), page (optional page number, for
// organizing block uploads).
//
// Accepts: pdf, jpg, jpeg, png, webp, gif, txt, md, mp4, webm, mov — ≤ 50MB.
// Uploads to the `trifold-uploads` Supabase storage bucket via the service
// client. If the bucket is missing, answers 400 telling the operator to run
// the pending migration.
//
// Extracts readable text server-side for PDFs (pdf-parse) and plain text
// files (txt/md). Images extract nothing — they're viewable only.
// Video files extract nothing either — the viewer just plays them.
//
// Returns: { ok, url, file_type: 'pdf'|'image'|'text'|'video',
//            extracted_text, page }
//
// NODE RUNTIME ONLY (multipart + pdf-parse do not run on edge).
// File contents are never logged.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireBuddy } from '@/lib/trifold/server';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_CHARS = 12000; // enough for the composer to work from; the buddy trims

const EXT_TO_TYPE = {
  pdf: 'pdf',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image',
  txt: 'text', md: 'text',
  mp4: 'video', webm: 'video', mov: 'video',
};

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function safeName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'file';
}

/** Extract readable text from the buffer. Images/video -> ''. Never logs content. */
async function extractText(buffer, fileType) {
  try {
    if (fileType === 'text') {
      return Buffer.from(buffer).toString('utf8').slice(0, MAX_TEXT_CHARS);
    }
    if (fileType === 'pdf') {
      // Import the inner module directly: pdf-parse's index.js tries to load
      // its own test PDF at require time and breaks Next.js bundling.
      const mod = await import('pdf-parse/lib/pdf-parse.js');
      const parse = mod.default || mod;
      const data = await parse(buffer);
      return String(data?.text || '').replace(/[ \t]+/g, ' ').slice(0, MAX_TEXT_CHARS);
    }
  } catch {
    return ''; // extraction is best-effort; the file itself is what matters
  }
  return '';
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The newsletter service is not connected yet.');
  await requireBuddy(req, admin);

  let form;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: 'Could not read the upload.' }, { status: 400 });
  }
  const editionId = String(form.get('edition_id') || '');
  const page = Number(form.get('page') || 0) || 0;
  const file = form.get('file');
  if (!editionId) return Response.json({ ok: false, error: 'Pick an issue first.' }, { status: 400 });
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ ok: false, error: 'No file attached.' }, { status: 400 });
  }

  const ext = extOf(file.name);
  const fileType = EXT_TO_TYPE[ext];
  if (!fileType) {
    return Response.json(
      { ok: false, error: 'That file type is not supported. Use PDF, JPG, PNG, WebP, GIF, TXT, MD, MP4, WebM or MOV.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ ok: false, error: 'Files must be 50MB or smaller.' }, { status: 400 });
  }

  // The bucket must exist — if the migration hasn't run, say so plainly.
  const { error: bucketErr } = await admin.storage.getBucket('trifold-uploads');
  if (bucketErr) {
    return Response.json(
      { ok: false, error: 'The upload bucket is missing — run the pending migration (20261004_trifold_fallback_pages.sql) first.' },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `editions/${editionId}/${Date.now()}-${safeName(file.name)}`;
  const { error: upErr } = await admin.storage
    .from('trifold-uploads')
    .upload(path, buf, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (upErr) {
    if (/bucket|not found|does not exist/i.test(upErr.message || '')) {
      return Response.json(
        { ok: false, error: 'The upload bucket is missing — run the pending migration (20261004_trifold_fallback_pages.sql) first.' },
        { status: 400 }
      );
    }
    throw new Error('The upload failed.');
  }

  const { data: urlData } = admin.storage.from('trifold-uploads').getPublicUrl(path);
  const extracted = await extractText(buf, fileType);

  return Response.json({
    ok: true,
    url: urlData?.publicUrl || '',
    file_type: fileType,
    extracted_text: extracted,
    page,
  });
});
