// app/trifold/studio/page.jsx
// TRIFOLD studio — the buddy's full authoring surface. BUDDY-LOGIN-GATED:
// visible UI checks the session, but the REAL enforcement is server-side
// (requireBuddy: account-ID check on every edit API route). Everyone else
// sees published issues only — no edit UI, no draft traces.
//
// AI is an option here, never a requirement: the buddy can hand-write the
// whole issue. The two fictional lenses (Ruin / Radiant) ALWAYS render with
// a FICTION badge — in the editor and in the live preview — never let a
// reader mistake them for real news.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TRIFOLD_AI_PROVIDERS } from '@/lib/trifold/ai';
import { TRIFOLD_NAME, TRIFOLD_LENSES } from '@/lib/trifold/constants';

const LENS_KEYS = TRIFOLD_LENSES.map((l) => l.key); // ['og','negative','positive']

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// Same as authed(), but for multipart form uploads — no Content-Type header,
// so the browser sets the multipart boundary itself.
async function authedForm(path, formData) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// ---------------------------------------------------------------------------
// data helpers
// ---------------------------------------------------------------------------
function blockId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function clampPageCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.min(40, Math.max(1, Math.round(v)));
}

function blankPages(n) {
  const out = {};
  for (const k of LENS_KEYS) {
    out[k] = Array.from({ length: n }, () => ({ blocks: [] }));
  }
  return out;
}

// Coerce whatever the server sent into full page arrays (pads / truncates).
function normalizePages(raw, n) {
  const out = {};
  for (const k of LENS_KEYS) {
    const arr = Array.isArray(raw && raw[k]) ? raw[k] : [];
    out[k] = Array.from({ length: n }, (_, i) => {
      const p = arr[i];
      const blocks = Array.isArray(p && p.blocks)
        ? p.blocks.map((b) => ({ ...b, id: b.id || blockId() }))
        : [];
      return { blocks };
    });
  }
  return out;
}

// Split long text into n page-chunks (paragraphs distributed evenly).
function splitTextToPages(text, n) {
  const paras = String(text || '').split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  const chunks = Array.from({ length: n }, () => []);
  if (!paras.length) return chunks;
  const per = Math.max(1, Math.ceil(paras.length / n));
  paras.forEach((p, i) => chunks[Math.min(n - 1, Math.floor(i / per))].push(p));
  return chunks;
}

// Auto-build the presentation layout from the legacy text fields.
// Used when publishing/submitting with empty pages.
function autoBuildPages(draft) {
  const n = clampPageCount(draft.page_count || 3);
  const pages = blankPages(n);
  const stories = Array.isArray(draft.og_stories) ? draft.og_stories : [];
  stories.forEach((s, i) => {
    const txt = `${s.title || 'Untitled'}\n\n${s.summary || ''}`.trim();
    if (!txt) return;
    pages.og[i % n].blocks.push({ id: blockId(), kind: 'text', text: txt, source: 'manual' });
  });
  splitTextToPages(draft.negative_fiction, n).forEach((chunk, i) => {
    if (chunk.length) pages.negative[i].blocks.push({ id: blockId(), kind: 'text', text: chunk.join('\n\n'), source: 'manual' });
  });
  splitTextToPages(draft.positive_fiction, n).forEach((chunk, i) => {
    if (chunk.length) pages.positive[i].blocks.push({ id: blockId(), kind: 'text', text: chunk.join('\n\n'), source: 'manual' });
  });
  return pages;
}

function pagesHaveBlocks(pages) {
  if (!pages) return false;
  return LENS_KEYS.some((k) => (pages[k] || []).some((p) => (p.blocks || []).length > 0));
}

// Turn extracted upload text into editable story items (title + summary).
function extractedToStories(text) {
  const chunks = String(text || '').split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  return chunks.map((c, i) => {
    const lines = c.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = (lines[0] || `Story ${i + 1}`).slice(0, 90);
    const rest = lines.slice(1).join(' ').slice(0, 280);
    const summary = rest || c.slice(title.length).trim().slice(0, 280);
    return { title, summary };
  });
}

// YouTube / Vimeo links become embed_url; everything else stays a direct url.
function embedInfo(url) {
  const u = String(url || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) return { embed_url: `https://www.youtube.com/embed/${m[1]}` };
  m = u.match(/vimeo\.com\/(\d+)/i);
  if (m) return { embed_url: `https://player.vimeo.com/video/${m[1]}` };
  return { url: u };
}

function draftFromEdition(edition) {
  const n = clampPageCount(Number(edition.page_count) || 3);
  return {
    og_stories: Array.isArray(edition.og_stories) ? edition.og_stories : [],
    negative_fiction: edition.negative_fiction || '',
    positive_fiction: edition.positive_fiction || '',
    page_count: n,
    pages: normalizePages(edition.pages, n),
    og_file_url: edition.og_file_url || '',
    og_file_type: edition.og_file_type || '',
    status: edition.status || 'draft',
    newspaper_name: edition.newspaper_name || '',
    newspaper_region: edition.newspaper_region || '',
  };
}

// ---------------------------------------------------------------------------
// sign-in + settings
// ---------------------------------------------------------------------------
function SignIn({ onDone }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function go(e) {
    e.preventDefault();
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      if (error) throw error;
      setSent(true);
    } catch (err) { setError(err.message); }
  }
  if (sent) return <p style={{ color: '#9aa0b5' }}>Check your email for the sign-in link, then come back here.</p>;
  return (
    <form onSubmit={go} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="editor@example.com"
        style={input} />
      <button type="submit" style={btnPrimary}>Email me a sign-in link</button>
      {error && <p style={{ width: '100%', color: '#fda4af' }}>{error}</p>}
    </form>
  );
}

function StripeConnectSection() {
  const [state, setState] = useState('checking'); // checking | not-deployed | error | ready
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/trifold/connect/status', {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        });
        if (res.status === 404) { setState('not-deployed'); return; }
        const data = await res.json().catch(() => ({}));
        if (!data.ok) throw new Error(data.error || 'Request failed.');
        setInfo(data);
        setState('ready');
      } catch (e) {
        setState('error');
        setMsg(e.message);
      }
    })();
  }, []);

  async function onboard() {
    setBusy(true); setMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/trifold/connect/onboard', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      if (res.status === 404) { setMsg('Stripe onboarding arrives with the next deploy.'); setBusy(false); return; }
      const data = await res.json().catch(() => ({}));
      if (!data.ok) throw new Error(data.error || 'Could not start onboarding.');
      if (data.url) { window.location.href = data.url; return; }
      setMsg('Onboarding started — check the link provided.');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  const connected = !!(info && (info.connected || info.charges_enabled || info.payouts_enabled || info.onboarding_complete));
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 0.5rem' }}>Stripe Connect — cash withdrawals</h3>
      <p style={{ color: '#9aa0b5', fontSize: '0.9rem', margin: '0 0 0.8rem' }}>
        Your $4.99 per subscriber lands in your in-house wallet automatically — no Stripe
        account needed to earn. Connect Stripe only when you want to withdraw cash to
        your bank. You'll finish Stripe's identity verification on Stripe's site, then
        come back here.
      </p>
      {state === 'checking' && <p style={{ color: '#6b7190' }}>Checking status…</p>}
      {state === 'not-deployed' && (
        <p style={{ color: '#fbbf24' }}>Stripe onboarding arrives with the next deploy.</p>
      )}
      {state === 'error' && <p style={{ color: '#fda4af' }}>{msg}</p>}
      {state === 'ready' && (
        <>
          <p style={{ color: connected ? '#34d399' : '#fbbf24', margin: '0 0 0.8rem' }}>
            {connected ? '✓ Stripe is connected.' : (info.status_text || 'Not connected yet.')}
          </p>
          {!connected && (
            <button onClick={onboard} disabled={busy} style={btnPrimary}>
              {busy ? 'Starting…' : 'Connect with Stripe'}
            </button>
          )}
        </>
      )}
      {msg && state !== 'error' && <p style={{ color: '#fbbf24', margin: '0.6rem 0 0' }}>{msg}</p>}
    </div>
  );
}

function SettingsPanel({ onSaved }) {
  const [s, setS] = useState(null);
  const [provider, setProvider] = useState('openai');
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    authed('/api/trifold/settings').then((d) => {
      setS(d.settings);
      setProvider(d.settings.ai_provider);
      setEmail(d.settings.buddy_email || '');
    }).catch((e) => setMsg(e.message));
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const body = { ai_provider: provider, buddy_email: email };
      if (key.trim()) body.api_key = key.trim();
      const d = await authed('/api/trifold/settings', { method: 'POST', body: JSON.stringify(body) });
      setMsg('Saved.' + (d.key_configured ? ' AI key is configured.' : ''));
      setKey('');
      onSaved && onSaved();
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }
  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      <div style={card}>
        {(!s && !msg) && <p style={{ color: '#6b7190' }}>Loading settings…</p>}
        {(s || msg) && (
          <form onSubmit={save} style={{ display: 'grid', gap: '0.8rem', maxWidth: 480 }}>
            <h3 style={{ margin: 0 }}>Your AI key</h3>
            <p style={{ color: '#9aa0b5', fontSize: '0.9rem', margin: 0 }}>
              Connect <strong>your own</strong> AI account. The key is encrypted on our server and never shown back to anyone — not even you.
              {s?.ai_key_configured ? ' ✓ Key on file.' : ' No key on file yet.'}
            </p>
            <label style={label}>AI provider
              <select value={provider} onChange={(e) => setProvider(e.target.value)} style={input}>
                {TRIFOLD_AI_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label style={label}>Your {provider} API key (write-only)
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s?.ai_key_configured ? '•••••••• (on file — leave blank to keep)' : 'paste your key'} style={input} autoComplete="off" />
            </label>
            <label style={label}>Editor email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={input} />
            </label>
            <div><button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving…' : 'Save settings'}</button></div>
            {msg && <p style={{ color: '#9aa0b5', margin: 0 }}>{msg}</p>}
          </form>
        )}
      </div>
      <StripeConnectSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// compose tab: OG upload + story composer + the two fictional takes
// ---------------------------------------------------------------------------
function OgUpload({ editionId, ogFileUrl, ogFileType, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true); setMsg('');
    try {
      const form = new FormData();
      form.append('edition_id', editionId);
      form.append('file', file);
      const d = await authedForm('/api/trifold/upload', form);
      onUploaded(d);
      setMsg(d.extracted_text
        ? `Uploaded — pulled ${d.extracted_text.length.toLocaleString()} characters of readable text into the story composer below. Trim it to summaries; never repost full articles.`
        : 'Uploaded. This file is viewable but has no extractable text — add stories by hand below.');
    } catch (err) { setMsg(err.message); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 0.5rem' }}>📰 This week's newspaper</h3>
      <p style={{ color: '#9aa0b5', fontSize: '0.9rem', margin: '0 0 0.8rem' }}>
        Upload the real paper (PDF, image, or text file). <strong>Summarize or link the stories below — never repost full articles.</strong>{' '}
        The original stays attached so readers can see the source.
      </p>
      <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.md"
          onChange={handleFile} disabled={busy}
          style={{ color: '#9aa0b5', fontSize: '0.88rem' }} />
        {busy && <span style={{ color: '#c4b5fd' }}>Uploading…</span>}
      </div>
      {ogFileUrl && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {ogFileType === 'image' && (
            <img src={ogFileUrl} alt="Uploaded newspaper original" style={{ maxWidth: 220, borderRadius: 8, border: '1px solid #2a3352' }} />
          )}
          {ogFileType === 'pdf' && (
            <div style={{ width: 220, height: 140, borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>📄</div>
          )}
          <div style={{ fontSize: '0.9rem' }}>
            <div style={{ color: '#34d399', marginBottom: '0.4rem' }}>✓ Original attached ({ogFileType || 'file'})</div>
            <a href={ogFileUrl} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc' }}>View the original →</a>
          </div>
        </div>
      )}
      {msg && <p style={{ color: '#9aa0b5', fontSize: '0.9rem', margin: '0.8rem 0 0' }}>{msg}</p>}
    </div>
  );
}

function StoryComposer({ stories, onChange }) {
  function set(i, patch) { onChange(stories.map((s, j) => (j === i ? { ...s, ...patch } : s))); }
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= stories.length) return;
    const c = [...stories];
    [c[i], c[j]] = [c[j], c[i]];
    onChange(c);
  }
  function remove(i) { onChange(stories.filter((_, j) => j !== i)); }
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 0.5rem' }}>Real stories ({stories.length})</h3>
      <p style={{ color: '#9aa0b5', fontSize: '0.9rem', margin: '0 0 0.8rem' }}>
        Your own words — titles + short summaries. These feed the fiction takes and the OG pages.
      </p>
      <div style={{ display: 'grid', gap: '0.7rem' }}>
        {stories.map((s, i) => (
          <div key={i} style={{ border: '1px solid #232a45', borderRadius: 10, padding: '0.8rem', background: '#0b0e1a' }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: '#c9cede', fontWeight: 700, fontSize: '0.85rem' }}>{i + 1}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={btnTiny} title="Move up">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === stories.length - 1} style={btnTiny} title="Move down">↓</button>
                <button onClick={() => remove(i)} style={btnTinyDanger} title="Remove">✕</button>
              </span>
            </div>
            <input value={s.title || ''} onChange={(e) => set(i, { title: e.target.value })} placeholder="Story headline"
              style={{ ...input, marginBottom: '0.5rem' }} />
            <textarea value={s.summary || ''} onChange={(e) => set(i, { summary: e.target.value })} rows={2}
              placeholder="One or two sentences, in your own words…" style={textarea} />
          </div>
        ))}
        {stories.length === 0 && <p style={{ color: '#fbbf24', margin: 0 }}>No stories yet — upload the paper above or add them by hand.</p>}
        <div>
          <button onClick={() => onChange([...stories, { title: '', summary: '' }])} style={btnGhost}>+ Add a story</button>
        </div>
      </div>
    </div>
  );
}

function FictionTakes({ draft, setDraft, editionId, onChange }) {
  const [genBusy, setGenBusy] = useState('');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  async function generate(tone) {
    setGenBusy(tone);
    try {
      await authed('/api/trifold/generate', { method: 'POST', body: JSON.stringify({ edition_id: editionId, tone }) });
      onChange(); // reload the edition (the route saved the draft)
    } catch (e) { alert(e.message); }
    setGenBusy('');
  }
  const takes = [
    { key: 'negative', title: 'Ruin', field: 'negative_fiction', tone: 'negative', ph: 'The fictional worst-case edition… write it yourself, or draft with your AI.' },
    { key: 'positive', title: 'Radiant', field: 'positive_fiction', tone: 'positive', ph: 'The fictional best-case edition… write it yourself, or draft with your AI.' },
  ];
  return (
    <>
      {takes.map((t) => (
        <div key={t.key} style={card}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{t.title} <span style={fictionTag}>FICTION</span></h3>
            <button onClick={() => generate(t.tone)} disabled={genBusy} style={btnSmall}>
              {genBusy === t.tone ? 'Writing…' : '✨ Draft with my AI'}
            </button>
          </div>
          <textarea value={draft[t.field] || ''} onChange={(e) => set({ [t.field]: e.target.value })}
            rows={10} style={textarea} placeholder={t.ph} />
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// layout tab: page_count stepper + per-lens paginated block editor
// ---------------------------------------------------------------------------
function BlockCard({ block, onUpdate, onRemove, onMove, first, last }) {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ border: '1px solid #232a45', borderRadius: 10, padding: '0.8rem', background: '#0b0e1a' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={kindTag}>{block.kind === 'text' ? '📝 Text' : block.kind === 'image' ? '🖼 Image' : '🎬 Video'}</span>
        {block.source === 'ai' && <span style={{ ...kindTag, background: '#1e1b4b', color: '#c4b5fd' }}>✨ AI</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
          <button onClick={() => onMove(-1)} disabled={first} style={btnTiny} title="Move up">↑</button>
          <button onClick={() => onMove(1)} disabled={last} style={btnTiny} title="Move down">↓</button>
          <button onClick={onRemove} style={btnTinyDanger} title="Delete">✕</button>
        </span>
      </div>

      {block.kind === 'text' && (
        editing ? (
          <>
            <textarea value={block.text || ''} onChange={(e) => onUpdate({ text: e.target.value })}
              rows={5} style={textarea} />
            <div style={{ marginTop: '0.5rem' }}><button onClick={() => setEditing(false)} style={btnSmall}>Done</button></div>
          </>
        ) : (
          <>
            <p style={{ color: '#c9cede', fontSize: '0.9rem', whiteSpace: 'pre-wrap', margin: '0 0 0.5rem', lineHeight: 1.6 }}>
              {(block.text || '').slice(0, 400)}{(block.text || '').length > 400 ? '…' : ''}
            </p>
            <button onClick={() => setEditing(true)} style={btnSmall}>Edit text</button>
          </>
        )
      )}

      {block.kind === 'image' && block.url && (
        <img src={block.url} alt={block.caption || 'Page image'} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, marginBottom: '0.5rem' }} />
      )}
      {block.kind === 'video' && (block.embed_url || block.url) && (
        block.embed_url ? (
          <div style={{ color: '#7dd3fc', fontSize: '0.85rem', marginBottom: '0.5rem' }}>▶ Embedded video: {block.embed_url}</div>
        ) : (
          <div style={{ color: '#7dd3fc', fontSize: '0.85rem', marginBottom: '0.5rem' }}>🎬 {block.url}</div>
        )
      )}
      {(block.kind === 'image' || block.kind === 'video') && (
        <input value={block.caption || ''} onChange={(e) => onUpdate({ caption: e.target.value })}
          placeholder="Caption (optional)" style={{ ...input, fontSize: '0.85rem' }} />
      )}
    </div>
  );
}

function PageLayoutEditor({ draft, setDraft, editionId, layoutLive }) {
  const [lensKey, setLensKey] = useState('og');
  const [pageIdx, setPageIdx] = useState(0);
  const [hint, setHint] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imgPage, setImgPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const n = clampPageCount(draft.page_count || 3);
  const lensInfo = TRIFOLD_LENSES.find((l) => l.key === lensKey);
  const pagesArr = (draft.pages && draft.pages[lensKey]) || [];
  const page = pagesArr[Math.min(pageIdx, n - 1)] || { blocks: [] };
  const blocks = page.blocks || [];

  function setPageCount(next) {
    const v = clampPageCount(next);
    setPageIdx((i) => Math.min(i, v - 1));
    setImgPage((p) => Math.min(p, v));
    setDraft((d) => ({ ...d, page_count: v, pages: normalizePages(d.pages, v) }));
  }

  function patchPages(fn) {
    setDraft((d) => ({ ...d, pages: fn(d.pages) }));
  }
  function updatePage(target, updater) {
    patchPages((pages) => ({
      ...pages,
      [lensKey]: pages[lensKey].map((p, i) => (i === target ? updater(p) : p)),
    }));
  }
  function addBlockTo(targetPage, block) {
    updatePage(targetPage, (p) => ({ ...p, blocks: [...(p.blocks || []), block] }));
  }

  // --- add: text -----------------------------------------------------------
  async function aiWrite() {
    setBusy('ai'); setMsg('');
    try {
      const d = await authed('/api/trifold/generate-block', {
        method: 'POST',
        body: JSON.stringify({ edition_id: editionId, lens: lensKey, hint: hint.trim() }),
      });
      addBlockTo(pageIdx, { id: blockId(), kind: 'text', text: d.text, source: 'ai' });
      setHint('');
    } catch (e) { setMsg(e.message); }
    setBusy('');
  }
  function pasteAdd() {
    if (!pasteText.trim()) return;
    addBlockTo(pageIdx, { id: blockId(), kind: 'text', text: pasteText.trim(), source: 'manual' });
    setPasteText('');
    setPasteOpen(false);
  }

  // --- add: image ----------------------------------------------------------
  async function uploadFile(e, kind) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy('upload'); setMsg('');
    try {
      const form = new FormData();
      form.append('edition_id', editionId);
      form.append('file', file);
      form.append('page', String(kind === 'image' ? imgPage : pageIdx + 1));
      const d = await authedForm('/api/trifold/upload', form);
      const target = kind === 'image' ? imgPage - 1 : pageIdx;
      addBlockTo(target, kind === 'image'
        ? { id: blockId(), kind: 'image', url: d.url, caption: '', source: 'upload' }
        : { id: blockId(), kind: 'video', url: d.url, caption: '', source: 'upload' });
    } catch (err) { setMsg(err.message); }
    setBusy('');
    e.target.value = '';
  }

  // --- add: video by link --------------------------------------------------
  function addVideoLink() {
    const u = videoUrl.trim();
    if (!u) return;
    const info = embedInfo(u);
    addBlockTo(pageIdx, { id: blockId(), kind: 'video', caption: '', source: 'link', ...info });
    setVideoUrl('');
  }

  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      {!layoutLive && (
        <div style={warnCard}>
          ⚠ The page-layout fields aren't live on the server yet (pending migration). Your layout is kept in this tab —
          save again after the next deploy. The text in Compose still saves normally.
        </div>
      )}

      {/* page count + lens tabs */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ color: '#9aa0b5', fontSize: '0.9rem' }}>Pages per paper:</span>
          <button onClick={() => setPageCount(n - 1)} disabled={n <= 1} style={btnTiny}>−</button>
          <strong style={{ minWidth: 28, textAlign: 'center' }}>{n}</strong>
          <button onClick={() => setPageCount(n + 1)} disabled={n >= 40} style={btnTiny}>+</button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TRIFOLD_LENSES.map((l) => (
            <button key={l.key} onClick={() => { setLensKey(l.key); setPageIdx(0); }}
              style={{ ...btnGhost, borderColor: lensKey === l.key ? '#7c3aed' : '#2a3352', color: lensKey === l.key ? '#c4b5fd' : '#9aa0b5' }}>
              {l.name} {l.fiction && <span style={fictionTag}>FICTION</span>}
            </button>
          ))}
        </div>
      </div>

      {/* page selector */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0} style={btnSmall}>← Prev</button>
        {Array.from({ length: n }, (_, i) => (
          <button key={i} onClick={() => setPageIdx(i)}
            style={{ ...btnTiny, ...(pageIdx === i ? { borderColor: '#7c3aed', color: '#c4b5fd' } : {}) }}>{i + 1}</button>
        ))}
        <button onClick={() => setPageIdx((i) => Math.min(n - 1, i + 1))} disabled={pageIdx >= n - 1} style={btnSmall}>Next →</button>
        <span style={{ color: '#6b7190', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
          {lensInfo.name} · page {pageIdx + 1} of {n}
        </span>
      </div>

      {/* blocks */}
      <div style={{ display: 'grid', gap: '0.7rem' }}>
        {blocks.map((b, i) => (
          <BlockCard key={b.id} block={b}
            onUpdate={(u) => updatePage(pageIdx, (p) => ({ ...p, blocks: p.blocks.map((x) => (x.id === b.id ? { ...x, ...u } : x)) }))}
            onRemove={() => updatePage(pageIdx, (p) => ({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) }))}
            onMove={(dir) => updatePage(pageIdx, (p) => {
              const arr = [...p.blocks];
              const j = dir + i;
              if (j < 0 || j >= arr.length) return p;
              [arr[i], arr[j]] = [arr[j], arr[i]];
              return { ...p, blocks: arr };
            })}
            first={i === 0} last={i === blocks.length - 1} />
        ))}
        {blocks.length === 0 && (
          <p style={{ color: '#6b7190', fontSize: '0.9rem', margin: 0 }}>
            Page {pageIdx + 1} is empty — add blocks below, or leave it: empty pages are auto-built from your text when you save.
          </p>
        )}
      </div>

      {/* add-block toolbox */}
      <div style={card}>
        <h4 style={{ margin: '0 0 0.8rem' }}>Add to {lensInfo.name} · page {pageIdx + 1}</h4>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <div style={{ color: '#9aa0b5', fontSize: '0.85rem', marginBottom: '0.4rem' }}>📝 Text block</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional hint for the AI (e.g. “focus on the AI-lab fire”)"
                style={{ ...input, maxWidth: 340 }} />
              <button onClick={aiWrite} disabled={busy} style={btnSmall}>{busy === 'ai' ? 'Writing…' : '✨ Write with AI'}</button>
              <button onClick={() => setPasteOpen((v) => !v)} style={btnSmall}>✍ Paste text</button>
            </div>
            {pasteOpen && (
              <div style={{ marginTop: '0.5rem' }}>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4}
                  placeholder="Paste or write the block…" style={textarea} />
                <div style={{ marginTop: '0.5rem' }}><button onClick={pasteAdd} style={btnPrimary}>Add block</button></div>
              </div>
            )}
          </div>
          <div>
            <div style={{ color: '#9aa0b5', fontSize: '0.85rem', marginBottom: '0.4rem' }}>🖼 Image block</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ color: '#9aa0b5', fontSize: '0.85rem' }}>Page
                <select value={imgPage} onChange={(e) => setImgPage(Number(e.target.value))} style={{ ...input, width: 'auto', marginLeft: '0.4rem', padding: '0.4rem 0.6rem' }}>
                  {Array.from({ length: n }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" onChange={(e) => uploadFile(e, 'image')}
                disabled={busy === 'upload'} style={{ color: '#9aa0b5', fontSize: '0.88rem' }} />
              {busy === 'upload' && <span style={{ color: '#c4b5fd', fontSize: '0.85rem' }}>Uploading…</span>}
            </div>
          </div>
          <div>
            <div style={{ color: '#9aa0b5', fontSize: '0.85rem', marginBottom: '0.4rem' }}>🎬 Video block — upload or paste a link</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="YouTube / Vimeo link, or a direct video file URL" style={{ ...input, maxWidth: 380 }} />
              <button onClick={addVideoLink} style={btnSmall}>Add video link</button>
              <input type="file" accept=".mp4,.webm,.mov" onChange={(e) => uploadFile(e, 'video')}
                disabled={busy === 'upload'} style={{ color: '#9aa0b5', fontSize: '0.88rem' }} />
            </div>
            <p style={{ color: '#6b7190', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
              YouTube and Vimeo links embed in the reader; direct files play natively.
            </p>
          </div>
        </div>
        {msg && <p style={{ color: '#fda4af', fontSize: '0.9rem', margin: '0.8rem 0 0' }}>{msg}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// preview tab: read-only mirror of what readers see
// ---------------------------------------------------------------------------
function IssuePreview({ draft }) {
  const [lensKey, setLensKey] = useState('og');
  const [pageIdx, setPageIdx] = useState(0);
  const n = clampPageCount(draft.page_count || 3);
  const pages = normalizePages(
    pagesHaveBlocks(draft.pages) ? draft.pages : autoBuildPages(draft),
    n
  );
  const lensInfo = TRIFOLD_LENSES.find((l) => l.key === lensKey);
  const blocks = (pages[lensKey][Math.min(pageIdx, n - 1)] || { blocks: [] }).blocks;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <p style={{ color: '#6b7190', fontSize: '0.85rem', margin: 0 }}>
        What readers will see — empty pages fall back to the auto-built layout from your text.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TRIFOLD_LENSES.map((l) => (
          <button key={l.key} onClick={() => { setLensKey(l.key); setPageIdx(0); }}
            style={{ ...btnGhost, borderColor: lensKey === l.key ? '#7c3aed' : '#2a3352', color: lensKey === l.key ? '#c4b5fd' : '#9aa0b5' }}>
            {l.name} {l.fiction && <span style={fictionTag}>FICTION</span>}
          </button>
        ))}
      </div>
      <div style={{ ...card, padding: '1.6rem', background: '#0a0d1c' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{lensInfo.name}</h2>
          {lensInfo.fiction && <span style={fictionTag}>FICTION</span>}
          <span style={{ color: '#6b7190', fontSize: '0.85rem' }}>{lensInfo.blurb}</span>
        </div>
        {blocks.length === 0 && <p style={{ color: '#6b7190' }}>Nothing on this page yet.</p>}
        {blocks.map((b) => (
          <div key={b.id} style={{ marginBottom: '1.2rem' }}>
            {b.kind === 'text' && b.text.split(/\n\s*\n+/).map((p, i) => (
              <p key={i} style={{ color: '#e8e6df', lineHeight: 1.7, margin: '0 0 0.8rem' }}>{p}</p>
            ))}
            {b.kind === 'image' && b.url && (
              <figure style={{ margin: 0 }}>
                <img src={b.url} alt={b.caption || ''} style={{ maxWidth: '100%', borderRadius: 10 }} />
                {b.caption && <figcaption style={{ color: '#8b91a8', fontSize: '0.85rem', marginTop: '0.4rem' }}>{b.caption}</figcaption>}
              </figure>
            )}
            {b.kind === 'video' && (b.embed_url
              ? (
                <div>
                  <iframe src={b.embed_url} title={b.caption || 'Video'} width="100%" height="315"
                    style={{ border: 'none', borderRadius: 10 }} allowFullScreen />
                  {b.caption && <p style={{ color: '#8b91a8', fontSize: '0.85rem' }}>{b.caption}</p>}
                </div>
              )
              : b.url && (
                <div>
                  <video src={b.url} controls style={{ maxWidth: '100%', borderRadius: 10 }} />
                  {b.caption && <p style={{ color: '#8b91a8', fontSize: '0.85rem' }}>{b.caption}</p>}
                </div>
              ))}
          </div>
        ))}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1.2rem' }}>
          <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0} style={btnSmall}>← Prev</button>
          <span style={{ color: '#8b91a8', fontSize: '0.85rem' }}>Page {pageIdx + 1} of {n}</span>
          <button onClick={() => setPageIdx((i) => Math.min(n - 1, i + 1))} disabled={pageIdx >= n - 1} style={btnSmall}>Next →</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// the per-issue editor: compose / layout / preview + save / submit / publish
// ---------------------------------------------------------------------------
function EditionEditor({ edition, onChange, onPublish, onNotify, busy }) {
  const [subTab, setSubTab] = useState('compose');
  const [draft, setDraft] = useState(() => draftFromEdition(edition));
  const [warn, setWarn] = useState('');
  const [saving, setSaving] = useState(false);
  const [genBusy, setGenBusy] = useState('');
  useEffect(() => { setDraft(draftFromEdition(edition)); setWarn(''); }, [edition.id]);

  // Defensive: the layout columns arrive via a pending migration + a sibling
  // PATCH extension. If the server doesn't return them, the layout editor
  // keeps everything locally and warns instead of crashing.
  const layoutLive = edition && Object.prototype.hasOwnProperty.call(edition, 'pages');

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  function effectivePages(d) {
    return pagesHaveBlocks(d.pages) ? d.pages : autoBuildPages(d);
  }

  async function patchStatus(status, extra = {}) {
    const d = draft;
    const body = {
      og_stories: d.og_stories,
      negative_fiction: d.negative_fiction,
      positive_fiction: d.positive_fiction,
      page_count: d.page_count,
      pages: effectivePages(d),
      og_file_url: d.og_file_url,
      og_file_type: d.og_file_type,
      status,
      ...extra,
    };
    try {
      const r = await authed(`/api/trifold/editions/${edition.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      // Did the server keep the new fields? (Sibling may not have extended EDITABLE yet.)
      const kept = r.edition || {};
      const dropped = (layoutLive === false)
        || (d.pages && pagesHaveBlocks(d.pages) && kept.pages && !pagesHaveBlocks(kept.pages))
        || (d.og_file_url && kept.og_file_url !== d.og_file_url);
      setWarn(dropped
        ? 'The server saved your text, but the layout fields are not live yet (next deploy). Your pages are kept in this tab — save again after the deploy.'
        : '');
      onChange();
    } catch (e) {
      if (/Bad status/i.test(e.message) && status === 'devan_submitted') {
        // Sibling hasn't extended statuses yet — fall back to 'review'.
        await authed(`/api/trifold/editions/${edition.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...body, status: 'review' }),
        });
        setWarn('Saved as "review" — the submit status arrives with the next deploy. Your version is still in.');
        onChange();
        return;
      }
      alert(e.message);
    }
  }

  async function saveDraft() {
    setSaving(true);
    await patchStatus('review');
    setSaving(false);
  }

  async function submitMine() {
    setSaving(true);
    await patchStatus('devan_submitted');
    setSaving(false);
  }

  async function generate(tone) {
    setGenBusy(tone);
    try {
      await authed('/api/trifold/generate', { method: 'POST', body: JSON.stringify({ edition_id: edition.id, tone }) });
      onChange();
    } catch (e) { alert(e.message); }
    setGenBusy('');
  }

  function publishIssue() {
    const published = edition.status === 'published';
    if (published) return;
    onPublish({ pages: effectivePages(draft), page_count: draft.page_count });
  }

  function handleUploaded(d) {
    const next = { og_file_url: d.url || '', og_file_type: d.file_type || '' };
    if (d.extracted_text) {
      next.og_stories = [...extractedToStories(d.extracted_text), ...(draft.og_stories || [])].slice(0, 20);
    }
    set(next);
  }

  const stories = Array.isArray(draft.og_stories) ? draft.og_stories : [];

  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.4rem' }}>{edition.newspaper_name} <span style={{ color: '#6b7190', fontWeight: 400 }}>({edition.newspaper_region})</span></h3>
        <p style={{ color: '#8b91a8', margin: '0 0 0.8rem' }}>
          Status: <strong>{edition.status}</strong> · {stories.length} real stories
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[['compose', '✍ Compose'], ['layout', '📰 Page layout'], ['preview', '👁 Preview']].map(([k, label]) => (
            <button key={k} onClick={() => setSubTab(k)}
              style={{ ...btnGhost, borderColor: subTab === k ? '#7c3aed' : '#2a3352', color: subTab === k ? '#c4b5fd' : '#9aa0b5' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {warn && <div style={warnCard}>{warn}</div>}

      {subTab === 'compose' && (
        <div style={{ display: 'grid', gap: '1.2rem' }}>
          <OgUpload editionId={edition.id} ogFileUrl={draft.og_file_url} ogFileType={draft.og_file_type} onUploaded={handleUploaded} />
          <StoryComposer stories={stories} onChange={(s) => set({ og_stories: s })} />
          <FictionTakes draft={draft} setDraft={setDraft} editionId={edition.id} onChange={onChange} />
        </div>
      )}

      {subTab === 'layout' && (
        <PageLayoutEditor draft={draft} setDraft={setDraft} editionId={edition.id} layoutLive={layoutLive} />
      )}

      {subTab === 'preview' && <IssuePreview draft={draft} />}

      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={saveDraft} disabled={busy || saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save draft'}</button>
        <button onClick={() => generate('both')} disabled={genBusy || busy} style={btnGhost}>
          {genBusy === 'both' ? 'Writing both…' : '✨ Draft both takes'}
        </button>
        {edition.status !== 'published' && edition.status !== 'devan_submitted' && (
          <button onClick={submitMine} disabled={busy || saving} style={btnTeal} title="Hand your version to the Tuesday 3AM checkpoint — it prefers your version over the AI's.">
            ✓ Submit my version
          </button>
        )}
        {edition.status !== 'published' && (
          <button onClick={publishIssue} disabled={busy} style={btnGold}>Publish issue</button>
        )}
        {edition.status === 'published' && (
          <button onClick={onNotify} disabled={busy} style={btnGold}>📧 Email subscribers</button>
        )}
      </div>
      <p style={{ color: '#6b7190', fontSize: '0.85rem', margin: 0 }}>
        Review everything before publishing — the machine drafts, you decide.
        {edition.status !== 'published' && ' "Submit my version" hands your cut to the Tuesday checkpoint, which prefers it over any AI version.'}
        {' '}Publishing assigns the next issue number and makes it public.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// top-level studio
// ---------------------------------------------------------------------------
export default function TrifoldStudio() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [editions, setEditions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('issues');

  const refresh = useCallback(async () => {
    try {
      const d = await authed('/api/trifold/editions?all=1');
      setEditions(d.editions);
      if (!activeId && d.editions.length) setActiveId(d.editions[0].id);
    } catch { /* not the editor — the API said so */ }
  }, [activeId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data?.session?.user || null); setChecked(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  async function publish(extra = {}) {
    const ed = editions.find((e) => e.id === activeId);
    if (!ed) return;
    if (!window.confirm(`Publish this issue? It becomes Issue #${(editions.filter((e) => e.status === 'published').length) + 1} and goes public.`)) return;
    setBusy(true);
    try {
      await authed(`/api/trifold/editions/${activeId}`, { method: 'PATCH', body: JSON.stringify({ status: 'published', ...extra }) });
      await refresh();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function notify() {
    setBusy(true);
    try {
      const d = await authed('/api/trifold/notify', { method: 'POST', body: JSON.stringify({ edition_id: activeId }) });
      alert(`Sent to ${d.sent} subscriber${d.sent === 1 ? '' : 's'}.`);
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  const active = editions.find((e) => e.id === activeId);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.25rem 4rem', color: '#e8e6df' }}>
      <h1 style={{ margin: '0 0 0.3rem' }}>{TRIFOLD_NAME} studio</h1>
      <p style={{ color: '#8b91a8', margin: '0 0 2rem' }}>Editor only. Drafts never leak to the public side.</p>

      {!checked && <p style={{ color: '#6b7190' }}>Loading…</p>}
      {checked && !user && (
        <div style={{ border: '1px solid #2a3352', borderRadius: 12, padding: '1.6rem', background: '#0d1226' }}>
          <h3 style={{ margin: '0 0 0.8rem' }}>Editor sign-in</h3>
          <SignIn />
        </div>
      )}
      {checked && user && (
        <>
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.6rem' }}>
            {[['issues', 'Issues'], ['settings', 'Settings']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ ...btnGhost, borderColor: tab === k ? '#7c3aed' : '#2a3352', color: tab === k ? '#c4b5fd' : '#9aa0b5' }}>{label}</button>
            ))}
            <span style={{ marginLeft: 'auto', color: '#6b7190', fontSize: '0.85rem', alignSelf: 'center' }}>{user.email}</span>
          </div>

          {tab === 'settings' && <SettingsPanel />}

          {tab === 'issues' && (
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
              <div>
                {editions.map((e) => (
                  <button key={e.id} onClick={() => setActiveId(e.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '0.5rem', padding: '0.7rem 0.9rem', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${activeId === e.id ? '#7c3aed' : '#232a45'}`, background: '#0d1226', color: '#e8e6df' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{e.status === 'published' ? `#${e.issue_number}` : '(draft)'} {e.newspaper_name}</div>
                    <div style={{ fontSize: '0.78rem', color: e.status === 'published' ? '#34d399' : '#fbbf24' }}>{e.status}</div>
                  </button>
                ))}
                {editions.length === 0 && <p style={{ color: '#6b7190', fontSize: '0.9rem' }}>No issues yet — the weekly cron drafts one every Monday.</p>}
              </div>
              <div>
                {active
                  ? <EditionEditor edition={active} onChange={refresh} onPublish={publish} onNotify={notify} busy={busy} />
                  : <p style={{ color: '#6b7190' }}>Pick an issue.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------
const card = { border: '1px solid #2a3352', borderRadius: 12, padding: '1.2rem', background: '#0d1226' };
const warnCard = { border: '1px solid #92400e', borderRadius: 10, padding: '0.9rem 1.1rem', background: '#1c1410', color: '#fbbf24', fontSize: '0.9rem' };
const input = { padding: '0.7rem 1rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', width: '100%', boxSizing: 'border-box' };
const label = { display: 'grid', gap: '0.35rem', fontSize: '0.88rem', color: '#9aa0b5' };
const textarea = { width: '100%', boxSizing: 'border-box', padding: '0.9rem', borderRadius: 10, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontFamily: 'inherit', fontSize: '0.92rem', lineHeight: 1.6 };
const btnPrimary = { padding: '0.7rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnTeal = { padding: '0.7rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#0d9488,#0f766e)', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnGold = { padding: '0.7rem 1.4rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#b45309,#92400e)', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '0.7rem 1.2rem', borderRadius: 10, border: '1px solid #2a3352', background: 'transparent', color: '#9aa0b5', cursor: 'pointer' };
const btnSmall = { padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0d1226', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.82rem' };
const btnTiny = { padding: '0.25rem 0.55rem', borderRadius: 6, border: '1px solid #2a3352', background: '#0d1226', color: '#9aa0b5', cursor: 'pointer', fontSize: '0.8rem' };
const btnTinyDanger = { ...btnTiny, color: '#fda4af' };
const kindTag = { fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', background: '#1e293b', color: '#94a3b8', borderRadius: 4, padding: '0.15rem 0.45rem' };
const fictionTag = { fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', background: '#f43f5e', color: '#fff', borderRadius: 4, padding: '0.12rem 0.4rem', marginLeft: '0.4rem' };
