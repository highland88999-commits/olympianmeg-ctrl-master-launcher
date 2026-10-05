// app/plutus/page.jsx
// PLUTUS — local-only personal finance dashboard. All data lives in the
// browser's localStorage. No accounts, no bank connections, no network calls.
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  STORAGE_KEY, EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_COLORS, CURRENCIES,
  blankData, demoData, loadData, saveData, clearData, newId,
  monthKey, currentMonthKey, lastNMonths, monthlyTotals, categoryTotals,
  netForMonth, budgetStatus, goalProgress, formatMoney, validateEntry, validateGoal,
} from './finance';
import { DonutChart, MonthBars } from './Charts';
import { StillBackdrop } from '@/components/ambience/AmbienceBackdrop';

// Inline SVG glyph system (zero image weight) — PLUTUS batch.
const PATHS = {
  overview: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  budget:
    'M21 7H5a1 1 0 0 1 0-2h16V3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm-4 7a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z',
  goals: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-6a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 16a6 6 0 1 1 0-12 6 6 0 0 1 0 12z',
  data: 'M12 3C7.58 3 4 4.79 4 7c0 2.21 3.58 4 8 4s8-1.79 8-4c0-2.21-3.58-4-8-4zm0 16c-4.42 0-8-1.79-8-4v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4zm0-8c-4.42 0-8-1.79-8-4 0-.34.09-.67.26-.98C5.4 6.79 8.42 8 12 8s6.6-1.21 7.74-1.98c.17.31.26.64.26.98 0 2.21-3.58 4-8 4z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  flag: 'M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z',
  coins:
    'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  download: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z',
  trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
};

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className || 'w-4 h-4 shrink-0'}>
      <path d={d} />
    </svg>
  );
}

// Shared obsidian panel texture under a near-black wash.
const cardTile = {
  backgroundImage:
    'linear-gradient(rgba(9,9,11,0.88), rgba(9,9,11,0.88)), url(/images/plutus-shared/panel-tile.webp)',
  backgroundSize: 'auto, 200px',
};

function Empty({ icon, children }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700/80 p-6 text-center" style={cardTile}>
      <Glyph d={icon} className="w-6 h-6 mx-auto text-emerald-500/50" />
      <p className="text-zinc-500 text-sm mt-2">{children}</p>
    </div>
  );
}

const TABS = ['Overview', 'Budget', 'Goals', 'Data'];

function Card({ title, children, right }) {
  return (
    <section className="border border-zinc-800 rounded-xl p-5" style={cardTile}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-300">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const inputCls = 'w-full bg-black/60 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const btnCls = 'px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-black text-sm font-bold transition-colors inline-flex items-center justify-center gap-2';
const ghostCls = 'px-4 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm transition-colors inline-flex items-center justify-center gap-2';

const TAB_ICONS = { Overview: 'overview', Budget: 'budget', Goals: 'goals', Data: 'data' };

export default function PlutusPage() {
  const [data, setData] = useState(blankData);
  const [tab, setTab] = useState('Overview');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setData(loadData());
    setLoaded(true);
  }, []);

  const update = (next) => { setData(next); saveData(next); };

  const mKey = currentMonthKey();
  const totals = useMemo(() => monthlyTotals(data.entries), [data.entries]);
  const monthT = totals[mKey] || { income: 0, expense: 0 };
  const net = monthT.income - monthT.expense;
  const catSpend = useMemo(() => categoryTotals(data.entries, 'expense', mKey), [data.entries, mKey]);
  const months6 = useMemo(() => lastNMonths(6), []);
  const budgets = useMemo(() => budgetStatus(data, mKey), [data, mKey]);
  const cur = data.currency || 'CAD';

  // ---- entry form ----
  const [form, setForm] = useState({ type: 'expense', amount: '', category: 'Food', date: new Date().toISOString().slice(0, 10), note: '' });
  const [formErr, setFormErr] = useState([]);
  const cats = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const addEntry = () => {
    const errs = validateEntry(form);
    setFormErr(errs);
    if (errs.length) return;
    const entry = { id: newId(), type: form.type, amount: Number(form.amount), category: form.category, date: form.date, note: form.note.trim() };
    update({ ...data, demo: false, entries: [...data.entries, entry].sort((a, b) => b.date.localeCompare(a.date)) });
    setForm({ ...form, amount: '', note: '' });
  };

  const removeEntry = (id) => update({ ...data, entries: data.entries.filter((e) => e.id !== id) });

  // ---- goals ----
  const [gForm, setGForm] = useState({ name: '', target: '' });
  const [gErr, setGErr] = useState([]);
  const [fundAmt, setFundAmt] = useState({});

  const addGoal = () => {
    const errs = validateGoal(gForm);
    setGErr(errs);
    if (errs.length) return;
    update({ ...data, demo: false, goals: [...data.goals, { id: newId(), name: gForm.name.trim(), target: Number(gForm.target), saved: 0, createdAt: new Date().toISOString().slice(0, 10) }] });
    setGForm({ name: '', target: '' });
  };
  const fundGoal = (id) => {
    const amt = Number(fundAmt[id]);
    if (!Number.isFinite(amt) || amt <= 0) return;
    update({ ...data, goals: data.goals.map((g) => (g.id === id ? { ...g, saved: Number(g.saved) + amt } : g)) });
    setFundAmt({ ...fundAmt, [id]: '' });
  };
  const removeGoal = (id) => update({ ...data, goals: data.goals.filter((g) => g.id !== id) });

  // ---- budgets ----
  const setBudget = (cat, val) => {
    const b = { ...(data.budgets || {}) };
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) delete b[cat];
    else b[cat] = n;
    update({ ...data, budgets: b });
  };

  // ---- data tab ----
  const seedDemo = () => { const d = demoData(); update(d); };
  const wipeAll = () => { if (window.confirm('Delete ALL Plutus data on this device? This cannot be undone.')) { clearData(); setData(blankData()); } };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plutus-backup-${mKey}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('bad file');
        update({ ...blankData(), ...parsed });
      } catch { alert('That file is not a valid Plutus backup.'); }
    };
    reader.readAsText(file);
  };

  if (!loaded) return (
    <main className="min-h-dvh bg-black text-white flex items-center justify-center">
      <div className="text-center" role="status" aria-label="Loading Plutus">
        <div className="mx-auto w-10 h-10 rounded-full border-2 border-emerald-500/25 border-t-emerald-400 animate-spin" />
        <p className="text-zinc-500 text-xs mt-4 tracking-[0.25em] uppercase">Opening Plutus…</p>
      </div>
    </main>
  );

  return (
    <main className="min-h-dvh w-full bg-black text-white">
      <StillBackdrop src="/images/plutus/bg.webp" opacity={0.32} scrim="from-black/75 via-black/60 to-black/90" />
      {/* subtle emerald starfield backdrop */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(80,255,176,0.07), transparent)' }} />

      <div className="relative max-w-6xl mx-auto px-5 pt-14 sm:pt-20 pb-16">
        <header className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-500/80 mb-3">Utilities · Ares</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wide">FINANCE DASHBOARD</h1>
          <p className="text-zinc-400 mt-3 max-w-xl mx-auto text-sm">
            Your personal finance dashboard. Track spending, set budgets, grow savings goals.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs">
            <span aria-hidden>🔒</span>
            Your data never leaves this device — no accounts, no bank connections, no tracking.
          </div>
          <img
            src="/images/plutus/header.webp"
            alt=""
            aria-hidden="true"
            className="mt-6 h-32 sm:h-40 w-full object-cover rounded-2xl border border-emerald-500/25 shadow-[0_0_50px_rgba(16,185,129,0.15)]"
          />
        </header>

        {/* tabs */}
        <nav className="flex justify-center gap-2 mb-8 flex-wrap" aria-label="Plutus sections">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-2 ${tab === t ? 'bg-emerald-600 text-black' : 'border border-zinc-700 text-zinc-400 hover:border-emerald-500 hover:text-white'}`}>
              <Glyph d={PATHS[TAB_ICONS[t]]} />
              {t}
            </button>
          ))}
        </nav>

        {tab === 'Overview' && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="This month">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-zinc-500 uppercase">Income</p>
                  <p className="text-xl font-mono text-green-400">{formatMoney(monthT.income, cur)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase">Expenses</p>
                  <p className="text-xl font-mono text-rose-400">{formatMoney(monthT.expense, cur)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase">Net</p>
                  <p className={`text-xl font-mono ${net >= 0 ? 'text-emerald-300' : 'text-amber-400'}`}>{formatMoney(net, cur)}</p>
                </div>
              </div>
              <div className="mt-5">
                <MonthBars months={months6} totals={totals} />
              </div>
            </Card>
            <Card title="Spending by category" right={<span className="text-xs text-zinc-500">{mKey}</span>}>
              <DonutChart data={catSpend} currency={cur} />
            </Card>
            <Card title="Savings goals at a glance">
              {data.goals.length === 0 && <Empty icon={PATHS.goals}>No goals yet — add one in the Goals tab.</Empty>}
              <div className="space-y-3">
                {data.goals.map((g) => {
                  const p = goalProgress(g);
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-200">{g.name}</span>
                        <span className="font-mono text-zinc-400">{formatMoney(p.saved, cur)} / {formatMoney(p.target, cur)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round(p.pct * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card title="Recent activity">
              {data.entries.length === 0 && <Empty icon={PATHS.budget}>Nothing recorded yet — add your first entry in the Budget tab.</Empty>}
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {data.entries.slice(0, 12).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORY_COLORS[e.category] || '#9ca3af' }} />
                    <span className="text-zinc-300 truncate">{e.note || e.category}</span>
                    <span className="ml-auto font-mono text-xs text-zinc-500">{e.date}</span>
                    <span className={`font-mono ${e.type === 'income' ? 'text-green-400' : 'text-rose-400'}`}>
                      {e.type === 'income' ? '+' : '−'}{formatMoney(e.amount, cur)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {tab === 'Budget' && (
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <Card title="Add entry">
                {formErr.length > 0 && (
                  <ul className="mb-3 text-xs text-rose-400 space-y-1">{formErr.map((e, i) => <li key={i}>• {e}</li>)}</ul>
                )}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {['expense', 'income'].map((t) => (
                    <button key={t} onClick={() => setForm({ ...form, type: t, category: t === 'income' ? 'Salary' : 'Food' })}
                      className={`py-2 rounded text-sm font-bold uppercase ${form.type === t ? (t === 'expense' ? 'bg-rose-600 text-white' : 'bg-green-600 text-white') : 'border border-zinc-700 text-zinc-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <label className="block text-xs text-zinc-500 uppercase mb-1">Amount</label>
                <input className={inputCls + ' mb-3'} type="number" min="0" step="0.01" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" inputMode="decimal" />
                <label className="block text-xs text-zinc-500 uppercase mb-1">Category</label>
                <select className={inputCls + ' mb-3'} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {cats.map((c) => <option key={c}>{c}</option>)}
                </select>
                <label className="block text-xs text-zinc-500 uppercase mb-1">Date</label>
                <input className={inputCls + ' mb-3'} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                <label className="block text-xs text-zinc-500 uppercase mb-1">Note (optional)</label>
                <input className={inputCls + ' mb-4'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What was this?" maxLength={140} />
                <button className={btnCls + ' w-full'} onClick={addEntry}><Glyph d={PATHS.plus} />Add entry</button>
              </Card>
              <div className="mt-5">
                <Card title="Monthly budgets">
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <div key={c} className="flex items-center gap-2">
                        <span className="w-28 text-xs text-zinc-400 truncate">{c}</span>
                        <input className={inputCls + ' !py-1 text-xs'} type="number" min="0" step="1"
                          placeholder="No limit" defaultValue={data.budgets?.[c] || ''}
                          onBlur={(e) => setBudget(c, e.target.value)} aria-label={`${c} monthly budget`} />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
            <div className="lg:col-span-3 space-y-5">
              <Card title={`Budget progress — ${mKey}`}>
                {Object.keys(budgets).length === 0 && <Empty icon={PATHS.budget}>Set a monthly limit on the left to track it here.</Empty>}
                <div className="space-y-3">
                  {Object.entries(budgets).map(([cat, b]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-200">{cat}</span>
                        <span className="font-mono text-zinc-400">{formatMoney(b.spent, cur)} / {formatMoney(b.limit, cur)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div className={`h-full rounded-full ${b.pct > 1 ? 'bg-rose-500' : b.pct > 0.8 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, Math.round(b.pct * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="All entries">
                {data.entries.length === 0 && <Empty icon={PATHS.data}>No entries yet.</Empty>}
                <ul className="space-y-2 max-h-96 overflow-y-auto">
                  {data.entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 text-sm bg-black/40 border border-zinc-800 rounded px-3 py-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORY_COLORS[e.category] || '#9ca3af' }} />
                      <div className="min-w-0">
                        <p className="text-zinc-200 truncate">{e.note || e.category}</p>
                        <p className="text-xs text-zinc-500">{e.category} · {e.date}</p>
                      </div>
                      <span className={`ml-auto font-mono ${e.type === 'income' ? 'text-green-400' : 'text-rose-400'}`}>
                        {e.type === 'income' ? '+' : '−'}{formatMoney(e.amount, cur)}
                      </span>
                      <button onClick={() => removeEntry(e.id)} className="text-zinc-600 hover:text-rose-400 text-lg leading-none" aria-label="Delete entry">×</button>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}

        {tab === 'Goals' && (
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="New savings goal">
              {gErr.length > 0 && (
                <ul className="mb-3 text-xs text-rose-400 space-y-1">{gErr.map((e, i) => <li key={i}>• {e}</li>)}</ul>
              )}
              <label className="block text-xs text-zinc-500 uppercase mb-1">Name</label>
              <input className={inputCls + ' mb-3'} value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} placeholder="Emergency fund" maxLength={60} />
              <label className="block text-xs text-zinc-500 uppercase mb-1">Target amount</label>
              <input className={inputCls + ' mb-4'} type="number" min="0" step="0.01" value={gForm.target} onChange={(e) => setGForm({ ...gForm, target: e.target.value })} placeholder="10000" inputMode="decimal" />
              <button className={btnCls + ' w-full'} onClick={addGoal}><Glyph d={PATHS.flag} />Create goal</button>
            </Card>
            <div className="lg:col-span-2 grid gap-5 sm:grid-cols-2">
              {data.goals.length === 0 && (
                <div className="sm:col-span-2"><Empty icon={PATHS.goals}>No goals yet — create your first one.</Empty></div>
              )}
              {data.goals.map((g) => {
                const p = goalProgress(g);
                return (
                  <Card key={g.id} title={g.name} right={
                    <button onClick={() => removeGoal(g.id)} className="text-zinc-600 hover:text-rose-400" aria-label={`Delete ${g.name}`}>✕</button>
                  }>
                    <p className="text-2xl font-mono mb-1">{formatMoney(p.saved, cur)}</p>
                    <p className="text-xs text-zinc-500 mb-3">of {formatMoney(p.target, cur)} target · {formatMoney(p.remaining, cur)} to go</p>
                    <div className="h-3 rounded-full bg-zinc-800 overflow-hidden mb-4">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round(p.pct * 100)}%` }} />
                    </div>
                    <div className="flex gap-2">
                      <input className={inputCls + ' !py-1.5'} type="number" min="0" step="0.01" placeholder="Add funds"
                        value={fundAmt[g.id] || ''} onChange={(e) => setFundAmt({ ...fundAmt, [g.id]: e.target.value })} aria-label={`Add funds to ${g.name}`} />
                      <button className={ghostCls} onClick={() => fundGoal(g.id)}><Glyph d={PATHS.coins} />Add</button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'Data' && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Preferences">
              <label className="block text-xs text-zinc-500 uppercase mb-1">Currency</label>
              <select className={inputCls + ' mb-4'} value={cur} onChange={(e) => update({ ...data, currency: e.target.value })}>
                {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Storage key: <span className="font-mono text-zinc-400">{STORAGE_KEY}</span><br />
                {data.entries.length} entries · {data.goals.length} goals stored on this device.
              </p>
            </Card>
            <Card title="Backup & reset">
              <div className="flex flex-wrap gap-3 mb-4">
                <button className={ghostCls} onClick={exportJson}><Glyph d={PATHS.download} />Export backup (JSON)</button>
                <label className={ghostCls + ' cursor-pointer'}>
                  <Glyph d={PATHS.upload} />
                  Import backup
                  <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                {!data.demo && <button className={ghostCls} onClick={seedDemo}>Load demo data</button>}
                <button className="px-4 py-2 rounded border border-rose-700 text-rose-400 hover:bg-rose-950 text-sm transition-colors inline-flex items-center justify-center gap-2" onClick={wipeAll}>
                  <Glyph d={PATHS.trash} />
                  Wipe all data
                </button>
              </div>
            </Card>
          </div>
        )}
      <div aria-hidden="true" className="player-clear" />
      </div>
    </main>
  );
}
