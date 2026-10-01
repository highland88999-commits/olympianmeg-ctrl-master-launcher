'use client';

/*
 * OracleView — ARCHITECT-ARTEMIS, Merlin's original program, migrated.
 *
 * Source: index.html in his Architect-Artemis repo (1056 lines), ported to
 * React. Same experience: landing video -> Supabase auth (was Firebase) ->
 * oracle circle + council pips + prompt console -> Gemini via
 * /api/artemis/transmit -> forge via /api/artemis/forge -> holo overlays
 * (transmission log, DEPLOY / PREVIEW / TXT / COPY) -> ecosystem nav HUD.
 *
 * His video links are embedded verbatim (see lib/artemis/videos.js).
 * STRIPPED: the central_telemetry phone-home insert (lives server-side in
 * the old api/transmit.js) — history now goes to artemis_history in our
 * Supabase, account-scoped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ARTEMIS_VIDEOS, ECOSYSTEM_APPS } from '@/lib/artemis/videos';
import { PERSONAS, PERSONA_KEYS, FORGE_TYPES, FORGE_TYPE_KEYS, parsePersonaPrefix } from '@/lib/artemis/personas';

const CYAN = '#00f2ff';

function useAccessToken() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setToken(data?.session?.access_token || null);
          setUser(data?.session?.user || null);
        }
      } catch {
        if (!cancelled) { setToken(null); setUser(null); }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token || null);
      setUser(session?.user || null);
    });
    return () => { cancelled = true; sub?.subscription?.unsubscribe(); };
  }, []);
  return { token, user, ready };
}

async function authedFetch(token, url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ---------------- Landing ---------------- */
function Landing({ onEnter }) {
  return (
    <section style={s.landing} aria-label="Artemis landing">
      <video
        src={ARTEMIS_VIDEOS.landing}
        autoPlay muted loop playsInline
        style={s.bgVideo}
        aria-hidden="true"
      />
      <div style={s.landingShade} />
      <div style={s.landingInner}>
        <div style={s.eyebrow}>ARCHITECT PROGRAM</div>
        <h1 style={s.title}>ARTEMIS</h1>
        <p style={s.tagline}>System architect · scanner · harvester · optimizer · analyst.</p>
        <button type="button" onClick={onEnter} style={s.enterBtn}>
          ENTER THE ORACLE
        </button>
      </div>
    </section>
  );
}

/* ---------------- Council pips ---------------- */
function CouncilPips({ active, onPick }) {
  return (
    <div style={s.pips} role="tablist" aria-label="Council personas">
      {PERSONA_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={active === k}
          title={`${k} — ${PERSONAS[k].epithet}`}
          onClick={() => onPick(k)}
          style={{ ...s.pip, ...(active === k ? s.pipActive : null) }}
        >
          {k[0]}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Main oracle view ---------------- */
export default function OracleView() {
  const { token, user, ready } = useAccessToken();
  const [entered, setEntered] = useState(false);
  const [persona, setPersona] = useState('ORACLE');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [emailable, setEmailable] = useState(null); // last counsel, ready to email
  const [mailBusy, setMailBusy] = useState(false);
  const [forges, setForges] = useState([]);
  const [forgeType, setForgeType] = useState('image');
  const [preview, setPreview] = useState(null); // forge entry under preview
  const [notice, setNotice] = useState('');
  const logRef = useRef(null);

  // Load recent history for signed-in users (honest offline if table missing).
  useEffect(() => {
    if (!entered || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('artemis_history')
          .select('persona, prompt, reply, created_at')
          .order('created_at', { ascending: true })
          .limit(50);
        if (error || cancelled) return;
        setMessages((data || []).flatMap((h) => [
          { kind: 'user', text: h.prompt },
          { kind: 'ai', persona: h.persona, text: h.reply },
        ]));
      } catch { /* cloud offline — chat still works, history just isn't loaded */ }
    })();
    return () => { cancelled = true; };
  }, [entered, user]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const saveHistory = useCallback(async (personaKey, promptText, replyText, functionsCalled) => {
    if (!user) return;
    try {
      await supabase.from('artemis_history').insert([{
        user_id: user.id,
        persona: personaKey,
        prompt: promptText,
        reply: replyText,
        functions_called: functionsCalled || [],
      }]);
    } catch { /* history is a nicety, not the chat */ }
  }, [user]);

  const send = useCallback(async () => {
    const raw = input.trim();
    if (!raw || busy || !token) return;
    const parsed = parsePersonaPrefix(raw);
    const personaKey = PERSONAS[parsed.persona] ? parsed.persona : persona;
    const promptText = parsed.prompt || raw;
    setInput('');
    setBusy(true);
    setNotice('');
    setMessages((m) => [...m, { kind: 'user', text: raw }]);
    try {
      const data = await authedFetch(token, '/api/artemis/transmit', { prompt: promptText, persona: personaKey });
      if (!data?.ok) {
        setMessages((m) => [...m, { kind: 'err', text: data?.error || 'The oracle did not answer.' }]);
      } else {
        setMessages((m) => [...m, { kind: 'ai', persona: data.persona, text: data.reply }]);
        setEmailable({ persona: data.persona, prompt: promptText, reply: data.reply });
        saveHistory(data.persona, promptText, data.reply, data.functionsCalled);
      }
    } catch {
      setMessages((m) => [...m, { kind: 'err', text: 'The oracle did not answer. Try again.' }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, token, persona, saveHistory]);

  const forge = useCallback(async () => {
    const promptText = input.trim();
    if (!promptText || busy || !token) return;
    setInput('');
    setBusy(true);
    setNotice('');
    try {
      const data = await authedFetch(token, '/api/artemis/forge', { prompt: promptText, type: forgeType });
      if (!data?.ok) {
        setNotice(data?.error || 'The forge failed.');
      } else {
        const entry = {
          id: `${Date.now()}`,
          type: data.type,
          kind: data.kind,
          prompt: promptText,
          url: data.url || null,
          html: data.html || null,
          at: new Date().toISOString(),
        };
        setForges((f) => [entry, ...f].slice(0, 20));
        setMessages((m) => [...m, { kind: 'sys', text: `FORGE [${FORGE_TYPES[data.type].label}] complete — see transmission log.` }]);
      }
    } catch {
      setNotice('The forge failed. Try again.');
    } finally {
      setBusy(false);
    }
  }, [input, busy, token, forgeType]);

  const emailCounsel = useCallback(async () => {
    if (!emailable || mailBusy || !token) return;
    setMailBusy(true);
    setNotice('');
    try {
      const data = await authedFetch(token, '/api/artemis/mail', {
        action: 'counsel',
        persona: emailable.persona,
        prompt: emailable.prompt,
        text: emailable.reply,
      });
      setNotice(data?.ok ? `Counsel emailed to ${data.to}.` : (data?.error || 'The email failed to send.'));
    } catch {
      setNotice('The email failed to send. Try again.');
    } finally {
      setMailBusy(false);
    }
  }, [emailable, mailBusy, token]);

  const deploy = useCallback(async (entry) => {    // DEPLOY — archive to the sandbox table and open the artifact.
    try {
      if (user) {
        await supabase.from('artemis_deployments').insert([{
          user_id: user.id,
          name: `${FORGE_TYPES[entry.type].label}: ${entry.prompt.slice(0, 60)}`,
          url: entry.url || null,
        }]);
      }
    } catch { /* archive is best-effort */ }
    if (entry.kind === 'image' && entry.url) {
      window.open(entry.url, '_blank', 'noopener');
    } else if (entry.kind === 'html' && entry.html) {
      const blob = new Blob([entry.html], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    }
  }, [user]);

  const downloadTxt = useCallback((entry) => {
    const text = entry.kind === 'image' ? entry.url : entry.html;
    const blob = new Blob([text || ''], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `artemis-forge-${entry.id}.${entry.kind === 'image' ? 'url.txt' : 'html'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, []);

  const copyOut = useCallback(async (entry) => {
    try {
      await navigator.clipboard.writeText(entry.kind === 'image' ? entry.url : entry.html || '');
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Copy failed in this browser.');
    }
  }, []);

  if (!entered) return <Landing onEnter={() => setEntered(true)} />;

  if (!ready) {
    return (
      <section style={s.gate} aria-label="Waking the oracle">
        <div style={s.bootSub}>Waking the oracle…</div>
      </section>
    );
  }

  if (!user) {
    return (
      <section style={s.gate} aria-label="Sign in required">
        <h2 style={s.gateTitle}>THE ORACLE KNOWS ITS ARCHITECT</h2>
        <p style={s.gateText}>Sign in at the master hub to wake the council. The forge answers only its architect.</p>
        <a href="/" style={s.enterBtn}>RETURN TO THE HUB</a>
      </section>
    );
  }

  return (
    <main style={s.main}>
      {/* Oracle circle + council */}
      <section style={s.oracleRow} aria-label="Oracle">
        <div style={s.circleWrap}>
          <video src={ARTEMIS_VIDEOS.oracleCircle} autoPlay muted loop playsInline style={s.circleVideo} aria-hidden="true" />
        </div>
        <div style={s.councilCol}>
          <CouncilPips active={persona} onPick={setPersona} />
          <div style={s.personaName}>{persona} <span style={s.epithet}>· {PERSONAS[persona].epithet}</span></div>
        </div>
      </section>

      {/* Response panel */}
      <section style={s.panel} aria-label="Oracle responses">
        <div ref={logRef} style={s.log} role="log" aria-live="polite">
          {messages.length === 0 && !busy && (
            <div style={s.sysLine}>The council is listening. Type below, or prefix with /oracle /warden /weaver /midas /archivist /cure.</div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={m.kind === 'user' ? s.userLine : m.kind === 'err' ? s.errLine : m.kind === 'sys' ? s.sysLine : s.aiLine}>
              {m.kind === 'ai' && <div style={s.aiTag}>{m.persona}</div>}
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
            </div>
          ))}
          {busy && <div style={s.sysLine}>Consulting the council…</div>}
        </div>

        {/* Prompt console */}
        <div style={s.console}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the oracle… (/warden, /weaver, /midas, /archivist, /cure)"
            aria-label="Oracle prompt"
            style={s.input}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={send} disabled={busy || !input.trim()} style={s.sendBtn}>SEND</button>
          <button
            type="button"
            onClick={emailCounsel}
            disabled={busy || mailBusy || !emailable}
            style={s.emailBtn}
            title="Email the last counsel to the architect"
          >
            {mailBusy ? 'SENDING…' : '✉ EMAIL'}
          </button>
        </div>

        {/* Forge */}
        <div style={s.forgeRow}>
          <div style={s.forgeTypes} role="radiogroup" aria-label="Forge type">
            {FORGE_TYPE_KEYS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={forgeType === t}
                onClick={() => setForgeType(t)}
                style={{ ...s.forgeType, ...(forgeType === t ? s.forgeTypeActive : null) }}
              >
                {FORGE_TYPES[t].label}
              </button>
            ))}
          </div>
          <button type="button" onClick={forge} disabled={busy || !input.trim()} style={s.forgeBtn}>
            ⚒ FORGE
          </button>
        </div>
        {notice && <div style={s.notice} role="status">{notice}</div>}
      </section>

      {/* Transmission log (holo) */}
      {forges.length > 0 && (
        <section style={s.panel} aria-label="Transmission log">
          <h2 style={s.holoTitle}>TRANSMISSION LOG</h2>
          <div style={s.holoBg}>
            <video src={ARTEMIS_VIDEOS.holoBg} autoPlay muted loop playsInline style={s.holoVideo} aria-hidden="true" />
          </div>
          <ul style={s.forgeList}>
            {forges.map((f) => (
              <li key={f.id} style={s.forgeItem}>
                <div style={s.forgeMeta}>
                  <span style={s.forgeLabel}>[{FORGE_TYPES[f.type].label}]</span>
                  <span style={s.forgePrompt}>{f.prompt}</span>
                </div>
                {f.kind === 'image' ? (
                  <img src={f.url} alt={f.prompt} style={s.forgeImg} loading="lazy" />
                ) : (
                  <video src={ARTEMIS_VIDEOS.forge} autoPlay muted loop playsInline style={s.forgeImg} aria-hidden="true" />
                )}
                <div style={s.forgeActions}>
                  <button type="button" onClick={() => setPreview(f)} style={s.miniBtn}>PREVIEW</button>
                  <button type="button" onClick={() => deploy(f)} style={s.miniBtn}>DEPLOY</button>
                  <button type="button" onClick={() => downloadTxt(f)} style={s.miniBtn}>TXT</button>
                  <button type="button" onClick={() => copyOut(f)} style={s.miniBtn}>COPY</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ecosystem nav HUD */}
      <section style={s.panel} aria-label="Ecosystem">
        <h2 style={s.holoTitle}>ECOSYSTEM</h2>
        <div style={s.ecoGrid}>
          {ECOSYSTEM_APPS.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" style={s.ecoLink}>
              {a.name}
            </a>
          ))}
        </div>
      </section>

      {/* Preview overlay */}
      {preview && (
        <div style={s.overlay} role="dialog" aria-modal="true" aria-label="Forge preview" onClick={() => setPreview(null)}>
          <div style={s.overlayInner} onClick={(e) => e.stopPropagation()}>
            <div style={s.overlayBar}>
              <span style={s.forgeLabel}>[{FORGE_TYPES[preview.type].label}] PREVIEW</span>
              <button type="button" onClick={() => setPreview(null)} style={s.miniBtn}>CLOSE</button>
            </div>
            {preview.kind === 'image' ? (
              <img src={preview.url} alt={preview.prompt} style={s.overlayMedia} />
            ) : (
              <iframe
                title="Forge preview"
                srcDoc={preview.html}
                sandbox="allow-scripts allow-modals"
                style={s.overlayFrame}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

const s = {
  landing: { position: 'relative', minHeight: 'calc(100dvh - 73px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bgVideo: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  landingShade: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(4,6,10,0.25) 0%, rgba(4,6,10,0.88) 100%)' },
  landingInner: { position: 'relative', zIndex: 1, textAlign: 'center', padding: 24 },
  eyebrow: { fontSize: 11, letterSpacing: 6, color: CYAN, marginBottom: 14 },
  title: { margin: '0 0 10px', fontSize: 'clamp(52px, 12vw, 120px)', letterSpacing: 14, color: '#fff', fontWeight: 200 },
  tagline: { color: '#9fb6c6', fontSize: 15, margin: '0 0 30px' },
  enterBtn: { display: 'inline-block', minHeight: 52, padding: '0 34px', border: `1px solid ${CYAN}`, borderRadius: 999, background: 'rgba(0,242,255,0.1)', color: '#fff', fontSize: 14, letterSpacing: 3, cursor: 'pointer', textDecoration: 'none', lineHeight: '52px' },
  gate: { maxWidth: 560, margin: '0 auto', padding: '80px 24px', textAlign: 'center' },
  bootSub: { fontSize: 12, letterSpacing: 2, color: '#7d93a5' },
  gateTitle: { fontSize: 22, letterSpacing: 4, color: '#fff', margin: '0 0 14px' },
  gateText: { color: '#9fb6c6', fontSize: 15, lineHeight: 1.7, margin: '0 0 26px' },
  main: { maxWidth: 980, margin: '0 auto', padding: '22px 16px 8px', display: 'grid', gap: 16 },
  oracleRow: { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' },
  circleWrap: { width: 148, height: 148, borderRadius: '50%', overflow: 'hidden', border: `1px solid rgba(0,242,255,0.4)`, flexShrink: 0 },
  circleVideo: { width: '100%', height: '100%', objectFit: 'cover' },
  councilCol: { flex: '1 1 220px' },
  pips: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  pip: { width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(0,242,255,0.35)', background: 'transparent', color: '#9fb6c6', fontSize: 16, cursor: 'pointer' },
  pipActive: { borderColor: CYAN, color: '#fff', background: 'rgba(0,242,255,0.16)', boxShadow: '0 0 14px rgba(0,242,255,0.35)' },
  personaName: { fontSize: 15, letterSpacing: 3, color: '#fff' },
  epithet: { color: '#7d93a5', letterSpacing: 1, fontSize: 12 },
  panel: { border: '1px solid rgba(0,242,255,0.22)', borderRadius: 14, background: 'rgba(8,14,20,0.72)', overflow: 'hidden' },
  log: { height: 'min(46vh, 380px)', overflowY: 'auto', padding: 16, display: 'grid', gap: 12, alignContent: 'start' },
  userLine: { color: '#9fd8e8', fontSize: 14, borderLeft: `2px solid ${CYAN}`, paddingLeft: 10 },
  aiLine: { color: '#e8f1f7', fontSize: 14, lineHeight: 1.65 },
  aiTag: { fontSize: 11, letterSpacing: 3, color: CYAN, marginBottom: 4 },
  errLine: { color: '#ffb3a7', fontSize: 14 },
  sysLine: { color: '#7d93a5', fontSize: 13, fontStyle: 'italic' },
  console: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(0,242,255,0.18)' },
  input: { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,242,255,0.25)', borderRadius: 10, color: '#fff', fontSize: 15, padding: '0 14px', minHeight: 48, outline: 'none' },
  sendBtn: { minHeight: 48, padding: '0 22px', borderRadius: 10, border: `1px solid ${CYAN}`, background: 'rgba(0,242,255,0.12)', color: '#fff', fontSize: 13, letterSpacing: 2, cursor: 'pointer' },
  emailBtn: { minHeight: 48, padding: '0 18px', borderRadius: 10, border: '1px solid rgba(0,242,255,0.35)', background: 'transparent', color: '#9fd8e8', fontSize: 12, letterSpacing: 2, cursor: 'pointer' },
  forgeRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(0,242,255,0.18)', flexWrap: 'wrap', alignItems: 'center' },
  forgeTypes: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
  forgeType: { minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(0,242,255,0.25)', background: 'transparent', color: '#9fb6c6', fontSize: 12, letterSpacing: 1, cursor: 'pointer' },
  forgeTypeActive: { borderColor: CYAN, color: '#fff', background: 'rgba(0,242,255,0.14)' },
  forgeBtn: { minHeight: 44, padding: '0 20px', borderRadius: 10, border: '1px solid #c9a86a', background: 'rgba(201,168,106,0.12)', color: '#ffe9c4', fontSize: 13, letterSpacing: 2, cursor: 'pointer' },
  notice: { padding: '0 14px 12px', color: '#ffd9a8', fontSize: 13 },
  holoTitle: { margin: 0, padding: '14px 16px 0', fontSize: 12, letterSpacing: 4, color: CYAN },
  holoBg: { position: 'relative', height: 90, overflow: 'hidden', margin: '10px 16px 0', borderRadius: 10 },
  holoVideo: { width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 },
  forgeList: { listStyle: 'none', margin: 0, padding: 16, display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' },
  forgeItem: { border: '1px solid rgba(0,242,255,0.18)', borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' },
  forgeMeta: { padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'baseline' },
  forgeLabel: { fontSize: 11, letterSpacing: 2, color: CYAN, flexShrink: 0 },
  forgePrompt: { fontSize: 12, color: '#9fb6c6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  forgeImg: { width: '100%', height: 150, objectFit: 'cover', display: 'block' },
  forgeActions: { display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap' },
  miniBtn: { minHeight: 36, padding: '0 12px', fontSize: 11, letterSpacing: 1, borderRadius: 7, border: '1px solid rgba(0,242,255,0.3)', background: 'transparent', color: '#cfe6f2', cursor: 'pointer' },
  ecoGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: 16 },
  ecoLink: { fontSize: 12, letterSpacing: 1, color: '#9fd8e8', textDecoration: 'none', border: '1px solid rgba(0,242,255,0.2)', borderRadius: 999, padding: '8px 14px', minHeight: 36, display: 'inline-flex', alignItems: 'center' },
  overlay: { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(2,4,8,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  overlayInner: { width: 'min(920px, 100%)', maxHeight: '86dvh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(0,242,255,0.35)', borderRadius: 14, overflow: 'hidden', background: '#060a10' },
  overlayBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(0,242,255,0.2)' },
  overlayMedia: { width: '100%', maxHeight: '70dvh', objectFit: 'contain', background: '#000' },
  overlayFrame: { width: '100%', height: '70dvh', border: 'none', background: '#fff' },
};
