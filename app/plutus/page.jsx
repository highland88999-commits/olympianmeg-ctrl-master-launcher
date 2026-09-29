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

const TABS = ['Overview', 'Budget', 'Goals', 'Data'];

function Card({ title, children, right }) {
  return (
    <section className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-300">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const inputCls = 'w-full bg-black/60 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const btnCls = 'px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-black text-sm font-bold transition-colors';
const ghostCls = 'px-4 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm transition-colors';

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

  if (!loaded) return <main className="min-h-screen bg-black text-white flex items-center justify-center"><p className="text-zinc-500 text-sm">Loading Plutus…</p></main>;

  return (
    <main className="min-h-screen w-full bg-black text-white">
      {/* subtle emerald starfield backdrop */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(80,255,176,0.07), transparent)' }} />

      <div className="relative max-w-6xl mx-auto px-5 pt-24 pb-24">
        <header className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-500/80 mb-3">Utilities · Ares</p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-wide">PLUTUS</h1>
          <p className="text-zinc-400 mt-3 max-w-xl mx-auto text-sm">
            Your personal finance dashboard. Track spending, set budgets, grow savings goals.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs">
            <span aria-hidden>🔒</span>
            Your data never leaves this device — no accounts, no bank connections, no tracking.
          </div>
          {data.demo && (
            <div className="mt-3">
              <button onClick={wipeAll} className="text-xs text-amber-400 underline underline-offset-2 hover:text-amber-300">
                You&apos;re viewing demo data — wipe it and start fresh
              </button>
            </div>
          )}
        </header>

        {/* tabs */}
        <nav className="flex justify-center gap-2 mb-8 flex-wrap" aria-label="Plutus sections">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-colors ${tab === t ? 'bg-emerald-600 text-black' : 'border border-zinc-700 text-zinc-400 hover:border-emerald-500 hover:text-white'}`}>
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
              {data.goals.length === 0 && <p className="text-zinc-500 text-sm">No goals yet — add one in the Goals tab.</p>}
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
              {data.entries.length === 0 && <p className="text-zinc-500 text-sm">Nothing recorded yet — add your first entry in the Budget tab.</p>}
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
                <button className={btnCls + ' w-full'} onClick={addEntry}>Add entry</button>
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
                {Object.keys(budgets).length === 0 && <p className="text-zinc-500 text-sm">Set a monthly limit on the left to track it here.</p>}
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
                {data.entries.length === 0 && <p className="text-zinc-500 text-sm">No entries yet.</p>}
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
              <button className={btnCls + ' w-full'} onClick={addGoal}>Create goal</button>
            </Card>
            <div className="lg:col-span-2 grid gap-5 sm:grid-cols-2">
              {data.goals.length === 0 && (
                <p className="text-zinc-500 text-sm sm:col-span-2">No goals yet — create your first one.</p>
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
                      <button className={ghostCls} onClick={() => fundGoal(g.id)}>Add</button>
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
                <button className={ghostCls} onClick={exportJson}>Export backup (JSON)</button>
                <label className={ghostCls + ' cursor-pointer'}>
                  Import backup
                  <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className={ghostCls} onClick={seedDemo}>Load demo data</button>
                <button className="px-4 py-2 rounded border border-rose-700 text-rose-400 hover:bg-rose-950 text-sm transition-colors" onClick={wipeAll}>
                  Wipe all data
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
                Plutus has no accounts and no servers. Backups are plain JSON files you keep —
                nothing is ever uploaded anywhere.
              </p>
            </Card>
          </div>
        )}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
      </div>
    </main>
  );
}
