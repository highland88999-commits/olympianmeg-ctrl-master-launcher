// components/persephone/PayoutMethodPanel.jsx
// Artist payout-method form for PERSEPHONE.
//
// SCOPE: method selection only. No money moves here — payouts are a future
// build (Stripe Connect). This panel:
// - flags every sensitive field with a lock warning in the UI,
// - stores the method on the ARTIST'S OWN DEVICE ONLY (localStorage),
//   never sends it anywhere, never logs it,
// - renders a saved method only through redactForDisplay() (masked).

'use client';

import { useEffect, useState } from 'react';
import {
  STORAGE_KEY, PAYOUT_TYPES, fieldMeta,
  validatePayoutMethod, redactForDisplay, buildRecord,
} from '@/lib/persephone/payout-methods';

const inputCls =
  'w-full rounded-xl border border-[#3a2f1a] bg-[#0e0b07] px-4 py-3 text-sm text-[#e8d9b0] placeholder-[#5a5348]';

export default function PayoutMethodPanel() {
  const [type, setType] = useState('bank');
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(null); // redacted view only
  const [errors, setErrors] = useState([]);
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const view = redactForDisplay(JSON.parse(raw));
        if (view) setSaved(view);
      }
    } catch { /* private mode — nothing saved */ }
  }, []);

  const fields = fieldMeta(type);

  function save() {
    const check = validatePayoutMethod(type, values);
    setErrors(check.errors);
    if (!check.ok) return;
    const record = buildRecord(type, values);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      setErrors(['This device refused to save it (private mode?). Nothing was stored.']);
      return;
    }
    setSaved(redactForDisplay(record));
    setValues({});
    setConfirm('Saved on this device only. We never see the full details here, and nothing is sent anywhere.');
  }

  function forget() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    setSaved(null);
    setConfirm('Removed from this device.');
  }

  return (
    <section aria-label="Payout method" className="w-full">
      <h2 className="text-2xl font-light tracking-[0.2em] text-[#ffd700]">GET PAID</h2>
      <p className="mt-2 text-sm text-[#a89a78] leading-relaxed">
        Tell us how you want your cut. This stays <span className="text-[#e8d9b0]">on this device only</span> —
        it is never sent to a server and never logged. Actual payouts are a future build; this just records your preference.
      </p>

      {saved ? (
        <div className="mt-5 rounded-2xl border border-[#3a2f1a] bg-[#0e0b07] p-5">
          <p className="text-sm text-[#8a7f66] uppercase tracking-[0.25em]">Saved method</p>
          <p className="mt-1 text-lg text-[#e8d9b0]">{saved.typeLabel}</p>
          <dl className="mt-3 space-y-2">
            {saved.fields.map((f) => (
              <div key={f.name} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-[#8a7f66]">
                  {f.label}{f.sensitive && <span className="ml-2 text-[#ffd700]" title="Sensitive field — masked everywhere">🔒</span>}
                </dt>
                <dd className="text-sm text-[#e8d9b0] tabular-nums">{f.display}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setSaved(null)}
              className="rounded-xl border border-[#ffd700]/60 px-4 py-2 text-xs tracking-widest uppercase text-[#ffd700] hover:bg-[#ffd700]/10 transition">
              Change
            </button>
            <button type="button" onClick={forget}
              className="rounded-xl border border-[#5a2a2a] px-4 py-2 text-xs tracking-widest uppercase text-[#d8a8a8] hover:bg-[#5a2a2a]/20 transition">
              Remove from this device
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-[#3a2f1a] bg-[#0e0b07] p-5">
          <label className="block">
            <span className="text-xs tracking-[0.25em] uppercase text-[#8a7f66]">Payout method</span>
            <select value={type} onChange={(e) => { setType(e.target.value); setValues({}); setErrors([]); }}
              className={`${inputCls} mt-1`} aria-label="Payout method type">
              {Object.entries(PAYOUT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>

          <div className="mt-4 space-y-4">
            {fields.map((f) => (
              <label key={f.name} className="block">
                <span className="text-xs tracking-[0.25em] uppercase text-[#8a7f66]">
                  {f.label}
                  {f.sensitive && (
                    <span className="ml-2 normal-case tracking-normal text-[#ffd700]">🔒 sensitive — masked everywhere, stays on this device</span>
                  )}
                </span>
                <input
                  value={values[f.name] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  type={f.name === 'paypal_email' || f.name === 'etransfer_email' ? 'email' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputCls} mt-1`}
                  placeholder={f.sensitive ? 'Kept private' : ''}
                />
              </label>
            ))}
          </div>

          {errors.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-[#d8a8a8]" role="alert">
              {errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}

          <button type="button" onClick={save}
            className="mt-5 w-full rounded-xl bg-[#ffd700] px-4 py-3 text-sm font-bold tracking-widest text-black uppercase hover:brightness-110 transition">
            Save payout method
          </button>
          <p className="mt-3 text-xs text-[#6a6050] leading-relaxed">
            🔒 Fields marked sensitive are stored only in this browser and always shown masked.
            They are never transmitted, never logged, and never committed anywhere.
          </p>
        </div>
      )}

      {confirm && <p className="mt-3 text-sm text-[#b8d8b8]" role="status">{confirm}</p>}
    </section>
  );
}
