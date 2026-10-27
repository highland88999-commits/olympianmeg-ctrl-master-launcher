// app/request-billboard/page.jsx — "Request a Billboard": the
// user-facing billboard space. Any signed-in user uploads the same
// information Merlin's manager takes (image OR video creative +
// company name + link), picks a plan, and optionally names a
// preferred billboard number (1–44; assignment itself stays with
// Merlin at approval).
//
// The flow, honestly stated on the page:
//   request → Merlin reviews (billboard-ad-requests artifact) →
//   approval assigns a billboard number → the user activates a
//   monthly subscription paid from wallet credit → Merlin Sends the
//   staged ad from the manager and the builder wires it live.
// Nothing here publishes to a live billboard on its own.
//
// Prices (settled rule, Merlin 2026-10-27): base $10 CAD/month
// rotating face-slot, $25 CAD/month whole billboard solo, paid from
// wallet credit. At 1,000,000 registered users prices become $50/$200
// — the only override. At 990,000 users every paying advertiser gets
// this page's pop-up + an email, with an opt-out. Billboard revenue
// feeds the ecosystem, its users, and everything Olympus builds.
//
// Ownership cap (Merlin, 2026-10-27): one billboard per satellite per
// advertiser — a solo billboard and a rotating face-slot both count
// as holding that billboard, and a paused subscription still holds
// its satellite. The purchase is blocked with a plain message when
// the cap would break; Merlin's own house/demo ads are exempt.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import LoadWalletCard from '@/components/billboards/LoadWalletCard';
import PriceNoticePopup from '@/components/billboards/PriceNoticePopup';

const BASE = { rotating: 1000, solo: 2500 };
const MILLION = { rotating: 5000, solo: 20000 };

function fmt(cents) {
  return `$${(cents / 100).toFixed(2)} CAD`;
}

function statusLabel(s) {
  if (s === 'pending') return 'In review';
  if (s === 'approved') return 'Approved — activate below';
  if (s === 'rejected') return 'Not approved';
  if (s === 'subscribed') return 'Subscribed';
  return s;
}

export default function RequestBillboardPage() {
  const [signedIn, setSignedIn] = useState(null);
  const [requests, setRequests] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [credit, setCredit] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [priceState, setPriceState] = useState(null);
  const [priceNotice, setPriceNotice] = useState(null);
  const [notReady, setNotReady] = useState(false);
  const [formNotice, setFormNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [popupBusy, setPopupBusy] = useState(false);
  const [shortfall, setShortfall] = useState(null);

  const [file, setFile] = useState(null);
  const [creativeUrl, setCreativeUrl] = useState('');
  const [creativeType, setCreativeType] = useState('');
  const [company, setCompany] = useState('');
  const [link, setLink] = useState('');
  const [plan, setPlan] = useState('rotating');
  const [preferred, setPreferred] = useState('');

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }, []);

  const load = useCallback(async () => {
    const t = await token();
    setSignedIn(Boolean(t));
    if (!t) return;
    const headers = { authorization: `Bearer ${t}` };
    try {
      const mine = await (await fetch('/api/billboard-requests/mine', { headers })).json();
      if (mine.error === 'not_ready') { setNotReady(true); return; }
      setRequests(mine.requests || []);
    } catch { /* keep page usable */ }
    try {
      const sub = await (await fetch('/api/billboard-requests/subscription', { headers })).json();
      setSubscriptions(sub.subscriptions || []);
      setCredit(sub.credit || null);
      setHoldings(sub.holdings || []);
      setPriceState(sub.priceState || null);
      setPriceNotice(sub.priceNotice || null);
    } catch { /* keep page usable */ }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function uploadCreative() {
    if (!file) return;
    setBusy(true);
    setFormNotice('');
    try {
      const t = await token();
      const r = await fetch('/api/billboard-requests/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
      });
      const j = await r.json();
      if (!r.ok || !j.uploadUrl) throw new Error(j.error || 'Could not start the upload.');
      const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error('Upload failed. Try a smaller file.');
      setCreativeUrl(j.publicUrl);
      setCreativeType(j.creativeType);
      setFormNotice('Creative uploaded. Fill in the rest and submit.');
    } catch (e) {
      setFormNotice(e.message || 'Upload failed.');
    }
    setBusy(false);
  }

  async function submitRequest(e) {
    e.preventDefault();
    setBusy(true);
    setFormNotice('');
    setShortfall(null);
    try {
      const t = await token();
      const r = await fetch('/api/billboard-requests/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({
          companyName: company,
          linkUrl: link,
          creativeType,
          creativeUrl,
          plan,
          preferredNumber: preferred === '' ? null : Number(preferred),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not submit.');
      setFormNotice('Sent for review. Merlin reviews every request before anything goes live.');
      setCompany('');
      setLink('');
      setPreferred('');
      setFile(null);
      setCreativeUrl('');
      setCreativeType('');
      load();
    } catch (err) {
      setFormNotice(err.message || 'Could not submit.');
    }
    setBusy(false);
  }

  async function activate(requestId) {
    setBusy(true);
    setFormNotice('');
    setShortfall(null);
    try {
      const t = await token();
      const r = await fetch('/api/billboard-requests/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({ requestId }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        if (j.needTopUp) setShortfall(j);
        throw new Error(j.error || 'Could not activate.');
      }
      setFormNotice(j.queuePending
        ? 'Subscribed — the ad is active and Merlin will wire it to the billboard directly (the manager queue is still being set up).'
        : 'Subscribed — your ad is staged for Merlin to send live.');
      load();
    } catch (err) {
      setFormNotice(err.message || 'Could not activate.');
    }
    setBusy(false);
  }

  async function resume(subId) {
    setBusy(true);
    setFormNotice('');
    try {
      const t = await token();
      const r = await fetch('/api/billboard-requests/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({ subscriptionId: subId }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        if (j.needTopUp) setShortfall(j);
        throw new Error(j.error || 'Could not resume.');
      }
      setFormNotice('Resumed — your ad is live again.');
      load();
    } catch (err) {
      setFormNotice(err.message || 'Could not resume.');
    }
    setBusy(false);
  }

  async function cancelOne(subId) {
    setBusy(true);
    setFormNotice('');
    try {
      const t = await token();
      const r = await fetch('/api/billboard-requests/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({ subscriptionId: subId }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not cancel.');
      setFormNotice('Cancelled — that ad stops showing and will not renew.');
      load();
    } catch (err) {
      setFormNotice(err.message || 'Could not cancel.');
    }
    setBusy(false);
  }

  async function keepAds() {
    setPopupBusy(true);
    try {
      const t = await token();
      await fetch('/api/billboard-requests/acknowledge-notice', {
        method: 'POST',
        headers: { authorization: `Bearer ${t}` },
      });
      setPriceNotice(null);
    } finally {
      setPopupBusy(false);
    }
  }

  async function cancelAll() {
    setPopupBusy(true);
    try {
      const t = await token();
      const r = await fetch('/api/billboard-requests/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
        body: JSON.stringify({ all: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not cancel.');
      setPriceNotice(null);
      setFormNotice('All billboard ads cancelled — nothing will renew at the new price.');
      load();
    } catch (err) {
      setFormNotice(err.message || 'Could not cancel.');
    } finally {
      setPopupBusy(false);
    }
  }

  const livePrices = priceState?.tier === 'million' ? MILLION : BASE;
  const showUpcoming = Boolean(priceState?.noticeThresholdReached) && priceState?.tier !== 'million';

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.2rem', color: '#e8e6df' }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>Request a Billboard</h1>
      <p style={{ color: '#8b91a8', lineHeight: 1.55, margin: '0 0 0.6rem' }}>
        Put your company on a tower billboard. Upload your creative, name your company,
        and paste the link the billboard should open. Merlin reviews every request, and
        nothing goes live without his approval.
      </p>
      <p style={{ color: '#e8e6df', lineHeight: 1.55, margin: '0 0 0.6rem' }}>
        Rotating face-slot: <strong>{fmt(livePrices.rotating)} per month</strong> ·
        Whole billboard, solo: <strong>{fmt(livePrices.solo)} per month</strong> —
        paid from wallet credit, renewing monthly.
      </p>
      {showUpcoming && (
        <p style={{ border: '1px solid #fbbf24', borderRadius: 10, padding: '0.8rem', color: '#fde68a', lineHeight: 1.55, margin: '0 0 0.6rem' }}>
          Coming change: when registered users reach 1,000,000, prices become $50 CAD/month
          rotating and $200 CAD/month solo. Paying advertisers are notified in advance and
          can opt out before the change. Billboard revenue feeds the ecosystem, its users,
          and everything Olympus builds.
        </p>
      )}
      <p style={{ color: '#8b91a8', lineHeight: 1.55, margin: '0 0 1.2rem' }}>
        One billboard per satellite per advertiser: you can hold up to 11 billboards across
        Olympus, never two on the same satellite. A rotating face-slot counts the same as
        a solo billboard, and a paused ad still holds its satellite.
        {holdings.length > 0 && (
          <span> You currently hold: {holdings.map((h) => `${h.satelliteName} (billboard ${h.billboardNumber})`).join(', ')}.</span>
        )}
      </p>

      {notReady && (
        <p style={{ border: '1px solid #f87171', borderRadius: 10, padding: '0.8rem', color: '#fca5a5' }}>
          Requests are not set up yet — the billboard tables still need their one-time setup
          run in the dashboard (supabase/migrations/20261027_billboard_wallet.sql). Nothing
          here can submit until then.
        </p>
      )}
      {signedIn === false && (
        <p style={{ border: '1px solid #38bdf8', borderRadius: 10, padding: '0.8rem', color: '#bae6fd' }}>
          Sign in to request a billboard space.
        </p>
      )}
      {formNotice && <p style={{ color: '#38bdf8', margin: '0 0 1rem' }}>{formNotice}</p>}
      {shortfall && (
        <div style={{ border: '1px solid #fbbf24', borderRadius: 10, padding: '0.8rem', margin: '0 0 1rem' }}>
          <p style={{ margin: '0 0 0.6rem' }}>
            Not enough wallet credit: you need {fmt(shortfall.priceCents)}, you have {fmt(shortfall.balanceCents)}.
            Load wallet to cover it, then activate again.
          </p>
          <LoadWalletCard />
        </div>
      )}

      {signedIn && !notReady && (
        <>
          <form onSubmit={submitRequest} style={{ border: '1px solid #2a3352', borderRadius: 14, padding: '1.2rem', marginBottom: '1.2rem', background: '#0d1226' }}>
            <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.15rem' }}>Your ad</h2>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'end', marginBottom: '0.8rem' }}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ color: '#e8e6df', maxWidth: '100%' }}
              />
              <button type="button" onClick={uploadCreative} disabled={busy || !file} style={{ padding: '0.6rem 1.1rem', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}>
                Upload creative
              </button>
            </div>
            <p style={{ color: '#8b91a8', fontSize: '0.82rem', margin: '0 0 0.8rem' }}>
              Images up to 8 MB (JPEG, PNG, WebP, GIF) or videos up to 50 MB (MP4, WebM).
              {creativeUrl && <> Uploaded: {creativeType} — preview below.</>}
            </p>
            {creativeUrl && (creativeType === 'video'
              ? <video src={creativeUrl} controls style={{ maxWidth: '100%', borderRadius: 10, marginBottom: '0.8rem' }} />
              : <img src={creativeUrl} alt="Ad creative preview" style={{ maxWidth: '100%', borderRadius: 10, marginBottom: '0.8rem' }} />)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <input
                value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name"
                style={{ padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem' }}
              />
              <input
                value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (https://…)"
                style={{ padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem' }}
              />
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button" onClick={() => setPlan('rotating')}
                  style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: plan === 'rotating' ? '#fbbf24' : '#0b0e1a', color: plan === 'rotating' ? '#0b0e1a' : '#e8e6df', fontWeight: 700, cursor: 'pointer' }}
                >
                  Rotating face-slot — {fmt(livePrices.rotating)}/mo
                </button>
                <button
                  type="button" onClick={() => setPlan('solo')}
                  style={{ flex: 1, padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: plan === 'solo' ? '#fbbf24' : '#0b0e1a', color: plan === 'solo' ? '#0b0e1a' : '#e8e6df', fontWeight: 700, cursor: 'pointer' }}
                >
                  Whole billboard, solo — {fmt(livePrices.solo)}/mo
                </button>
              </div>
              <input
                value={preferred} onChange={(e) => setPreferred(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Preferred billboard number, 1–44 (optional — Merlin assigns it)"
                inputMode="numeric"
                style={{ padding: '0.7rem', borderRadius: 8, border: '1px solid #2a3352', background: '#0b0e1a', color: '#e8e6df', fontSize: '1rem' }}
              />
              <button type="submit" disabled={busy || !creativeUrl || !company.trim() || !link.trim()} style={{ padding: '0.8rem', borderRadius: 8, border: 'none', background: '#34d399', color: '#0b0e1a', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>
                {busy ? '…' : 'Send for review'}
              </button>
            </div>
          </form>

          <h2 style={{ fontSize: '1.15rem' }}>My requests</h2>
          {requests.length === 0 ? (
            <p style={{ color: '#8b91a8' }}>No requests yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.2rem' }}>
              {requests.map((r) => (
                <div key={r.id} style={{ border: '1px solid #2a3352', borderRadius: 12, padding: '0.9rem', background: '#0d1226' }}>
                  <div style={{ fontWeight: 700 }}>{r.companyName}</div>
                  <div style={{ color: '#8b91a8', fontSize: '0.85rem' }}>
                    {r.plan === 'solo' ? 'Whole billboard, solo' : 'Rotating face-slot'} · {statusLabel(r.status)}
                    {r.preferredNumber ? ` · preferred billboard ${r.preferredNumber}` : ''}
                    {r.assignedNumber ? ` · billboard ${r.assignedNumber}` : ''}
                  </div>
                  <a href={r.linkUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontSize: '0.85rem', wordBreak: 'break-all' }}>{r.linkUrl}</a>
                  {r.status === 'approved' && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <button type="button" onClick={() => activate(r.id)} disabled={busy} style={{ padding: '0.6rem 1.1rem', borderRadius: 8, border: 'none', background: '#34d399', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}>
                        Activate subscription — {fmt(livePrices[r.plan])}/mo from wallet credit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: '1.15rem' }}>My subscriptions</h2>
          {subscriptions.length === 0 ? (
            <p style={{ color: '#8b91a8' }}>No subscriptions yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.2rem' }}>
              {subscriptions.map((s) => (
                <div key={s.id} style={{ border: '1px solid #2a3352', borderRadius: 12, padding: '0.9rem', background: '#0d1226' }}>
                  <div style={{ fontWeight: 700 }}>{s.companyName} — billboard {s.billboardNumber}</div>
                  <div style={{ color: '#8b91a8', fontSize: '0.85rem' }}>
                    {s.plan === 'solo' ? 'Whole billboard, solo' : 'Rotating face-slot'} · {fmt(s.priceCents)}/mo · {s.status}
                    {s.periodEnd ? ` · renews ${new Date(s.periodEnd).toLocaleDateString()}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    {s.status === 'paused' && (
                      <button type="button" onClick={() => resume(s.id)} disabled={busy} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: '#34d399', color: '#0b0e1a', fontWeight: 800, cursor: 'pointer' }}>
                        Resume
                      </button>
                    )}
                    {(s.status === 'active' || s.status === 'paused') && (
                      <button type="button" onClick={() => cancelOne(s.id)} disabled={busy} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #f87171', background: 'transparent', color: '#f87171', fontWeight: 800, cursor: 'pointer' }}>
                        Cancel (opt out)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: '1.15rem' }}>Wallet credit</h2>
          {credit && (
            <p style={{ color: '#e8e6df', margin: '0 0 0.8rem' }}>
              {credit.ready ? <>Balance: <strong>{fmt(credit.balance_cents)}</strong></> : 'Wallet credit is being set up.'}
            </p>
          )}
          <LoadWalletCard />
        </>
      )}

      <PriceNoticePopup notice={priceNotice} busy={popupBusy} onKeep={keepAds} onCancelAll={cancelAll} />
    </main>
  );
}
