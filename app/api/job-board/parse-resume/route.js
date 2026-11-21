// app/api/job-board/parse-resume/route.js
// POST /api/job-board/parse-resume
// Accepts JSON { text } or multipart form-data with a file field:
//   PDF via pdf-parse, DOCX via mammoth, TXT as plain text.
// Max file 5 MB. The file is never stored, never logged, and the parsed
// result contains only what was in the text.
// Returns { ok: true, resume } or { ok: false, error }.
// Node runtime only (pdf-parse / mammoth do not run on edge).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { parseResumeText } from '@/lib/job-board/resume.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 200000;

async function extractText(file) {
  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new Error('File is larger than the 5 MB limit.');
  }
  if (name.endsWith('.pdf')) {
    const data = await pdfParse(buf);
    return data.text || '';
  }
  if (name.endsWith('.docx')) {
    const data = await mammoth.extractRawText({ buffer: buf });
    return data.value || '';
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return buf.toString('utf8');
  }
  throw new Error('Unsupported file type. Upload a PDF, DOCX, or TXT resume.');
}

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let text = '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!file || typeof file.arrayBuffer !== 'function') {
        return Response.json({ ok: false, error: 'No file uploaded.' }, { status: 400 });
      }
      text = await extractText(file);
    } else {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.text !== 'string' || !body.text.trim()) {
        return Response.json(
          { ok: false, error: 'Send JSON { text } or a multipart file.' },
          { status: 400 },
        );
      }
      text = body.text;
    }
    if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) {
      return Response.json({ ok: false, error: 'No readable text found.' }, { status: 400 });
    }
    const resume = parseResumeText(text);
    return Response.json({ ok: true, resume });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || 'Could not parse the resume.' },
      { status: 400 },
    );
  }
}
