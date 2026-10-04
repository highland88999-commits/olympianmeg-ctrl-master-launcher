// app/hygieia/page.jsx — HYGIEIA: health reminders + step history.
//
// Health reminders you set yourself (once / daily / weekly), and your
// personal step history. Honest by design:
// - Notification delivery is NOT implemented: reminders show in-app only,
//   in the "Due now" strip, while the page is open. Phone push arrives
//   with the mobile phase (lib/hygieia/notify.ts is a documented stub).
// - Step counts are entered by hand — phone health sync comes later.
// - "Room to grow" sections (sleep, water) are static placeholders,
//   clearly marked "coming later". No fake inputs, no currency of any
//   kind (a step-to-credit currency is PARKED by Merlin, 2026-09-29 —
//   see lib/hygieia/notes.ts).
//
// Zero external requests at runtime beyond Supabase. No animations
// (reduced-motion safe by default). The page scrolls; Safari bottom-bar
// clearance is baked into the layout.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PageBack from '@/components/PageBack';
import {
  nextFire,
  formatSchedule,
  nextFireLabel,
  isDue,
  validateReminder,
  REMINDER_COLUMNS,
} from '@/lib/hygieia/schedule';
import { NOTIFICATION_NOTE } from '@/lib/hygieia/notify';
import { panelTileStyle } from '@/lib/hestia/ambience';

// Inline SVG glyph system — one icon per action, zero image weight.
function HygIcon({ name, size = 14 }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    className: 'shrink-0',
  };
  switch (name) {
    case 'plus': return (<svg {...p}><path d="M12 5v14M5 12h14" /></svg>);
    case 'check': return (<svg {...p}><path d="M20 6 9 17l-5-5" /></svg>);
    case 'x': return (<svg {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>);
    case 'pencil': return (<svg {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
    case 'trash': return (<svg {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>);
    case 'power': return (<svg {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></svg>);
    case 'bell': return (<svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
    case 'steps': return (<svg {...p}><ellipse cx="9" cy="7.5" rx="3" ry="4" /><ellipse cx="15.5" cy="16.5" rx="3" ry="4" /></svg>);
    default: return null;
  }
}

const TITLE = 'Hygieia';
const SUBTITLE = 'Your health corner — reminders you set, and your steps.';

const STEP_COLUMNS = 'step_date,steps';

const DAY_OPTIONS = [
  { n: 0, label: 'Sun' },
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
];

const EMPTY_FORM = {
  title: '',
  schedule_type: 'daily',
  remind_time: '08:00',
  days: [1, 2, 3, 4, 5],
  enabled: true,
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True when a Supabase error means the table simply isn't there yet. */
function isMissingTable(err) {
  if (!err) return false;
  if (err.code === 'PGRST205' || err.code === '42P01') return true;
  return /relation .* does not exist|table .* does not exist/i.test(String(err.message || ''));
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function SectionCard({ title, children }) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black/60 p-4 sm:p-5">
      <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
      <div className="relative">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-300">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

function EmptyNote({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-amber-200/25 bg-amber-100/[0.03] px-4 py-6 text-center text-sm text-zinc-400">
      {children}
    </p>
  );
}

function ErrorNote({ children }) {
  return (
    <p className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200/90">
      {children}
    </p>
  );
}

function LoadingNote({ children }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-black/50 px-4 py-6" role="status">
      <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none" style={panelTileStyle()} />
      <p className="relative text-center text-sm text-zinc-400 animate-pulse">{children}</p>
      <div aria-hidden="true" className="relative mx-auto mt-4 h-1 w-36 overflow-hidden rounded bg-white/10">
        <div className="h-full w-1/2 rounded bg-gradient-to-r from-amber-500 to-yellow-200 animate-[hyg-shimmer_1.4s_ease-in-out_infinite]" />
      </div>
      <style>{`@keyframes hyg-shimmer { 0% { transform: translateX(-100%);} 100% { transform: translateX(300%);} }`}</style>
    </div>
  );
}

const inputCls =
  'w-full min-h-[44px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-zinc-100 px-5 py-2 text-sm font-bold text-black hover:bg-white disabled:opacity-40';
const btnGhost =
  'inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900';

// ---------------------------------------------------------------------------
// Reminder form (add + edit)
// ---------------------------------------------------------------------------

function ReminderForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    if (initial) {
      setForm({
        title: initial.title || '',
        schedule_type: initial.schedule_type || 'daily',
        remind_time: (initial.remind_time || '08:00').slice(0, 5),
        days: Array.isArray(initial.days) && initial.days.length ? initial.days : [1, 2, 3, 4, 5],
        enabled: initial.enabled !== false,
      });
      setErrors([]);
    }
  }, [initial && initial.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (n) => {
    setForm((f) => {
      const days = f.days.includes(n) ? f.days.filter((d) => d !== n) : [...f.days, n];
      return { ...f, days };
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const v = validateReminder(form);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    onSave(v.clean);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div>
        <label htmlFor="hyg-title" className="mb-1 block text-xs font-bold uppercase tracking-widest text-zinc-500">
          Reminder
        </label>
        <input
          id="hyg-title"
          className={inputCls}
          value={form.title}
          maxLength={120}
          placeholder="e.g. Take the evening walk"
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-40">
          <label htmlFor="hyg-type" className="mb-1 block text-xs font-bold uppercase tracking-widest text-zinc-500">
            Repeats
          </label>
          <select
            id="hyg-type"
            className={inputCls}
            value={form.schedule_type}
            onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}
          >
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="sm:w-40">
          <label htmlFor="hyg-time" className="mb-1 block text-xs font-bold uppercase tracking-widest text-zinc-500">
            Time
          </label>
          <input
            id="hyg-time"
            type="time"
            className={inputCls}
            value={form.remind_time}
            onChange={(e) => setForm({ ...form, remind_time: e.target.value })}
          />
        </div>
      </div>

      {form.schedule_type === 'weekly' && (
        <fieldset>
          <legend className="mb-1 block text-xs font-bold uppercase tracking-widest text-zinc-500">Days</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d.n}
                type="button"
                aria-pressed={form.days.includes(d.n)}
                onClick={() => toggleDay(d.n)}
                className={`min-h-[44px] min-w-[48px] rounded-lg border px-3 text-sm font-bold ${
                  form.days.includes(d.n)
                    ? 'border-zinc-100 bg-zinc-100 text-black'
                    : 'border-zinc-700 text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-zinc-300">
        <input
          type="checkbox"
          className="h-5 w-5 accent-zinc-100"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        Reminder is turned on
      </label>

      {errors.length > 0 && (
        <ul className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-2 text-sm text-red-200">
          {errors.map((er, i) => (
            <li key={i}>• {er}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : (
            <>
              <HygIcon name="check" />
              {initial ? 'Save changes' : 'Add reminder'}
            </>
          )}
        </button>
        <button type="button" className={btnGhost} onClick={onCancel} disabled={saving}>
          <HygIcon name="x" />
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function HygieiaPage() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);
  const [tab, setTab] = useState('reminders');

  // Reminders
  const [reminders, setReminders] = useState([]);
  const [remLoading, setRemLoading] = useState(false);
  const [remMissing, setRemMissing] = useState(false);
  const [remError, setRemError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0); // re-render clock for the "due now" strip

  // Steps
  const [steps, setSteps] = useState([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsMissing, setStepsMissing] = useState(false);
  const [stepsError, setStepsError] = useState('');
  const [todaySteps, setTodaySteps] = useState('');
  const [stepsSaving, setStepsSaving] = useState(false);

  useEffect(() => {
    try {
      supabase.auth.getUser().then(({ data }) => {
        setUser(data?.user || null);
        setAuthChecked(true);
      }).catch(() => {
        setCloudOffline(true);
        setAuthChecked(true);
      });
    } catch {
      setCloudOffline(true);
      setAuthChecked(true);
    }
  }, []);

  const loadReminders = useCallback(async () => {
    if (!user) return;
    setRemLoading(true);
    setRemError('');
    try {
      const { data, error } = await supabase
        .from('reminder_items')
        .select(REMINDER_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) {
        if (isMissingTable(error)) setRemMissing(true);
        else setRemError('Could not load your reminders. Please try again.');
        setReminders([]);
      } else {
        setRemMissing(false);
        setReminders(data || []);
      }
    } catch {
      setRemError('Could not load your reminders. Please try again.');
    } finally {
      setRemLoading(false);
    }
  }, [user]);

  const loadSteps = useCallback(async () => {
    if (!user) return;
    setStepsLoading(true);
    setStepsError('');
    try {
      const { data, error } = await supabase
        .from('user_steps')
        .select(STEP_COLUMNS)
        .order('step_date', { ascending: false });
      if (error) {
        if (isMissingTable(error)) setStepsMissing(true);
        else setStepsError('Could not load your steps. Please try again.');
        setSteps([]);
      } else {
        setStepsMissing(false);
        setSteps(data || []);
        const today = (data || []).find((r) => r.step_date === todayISO());
        setTodaySteps(today ? String(today.steps) : '');
      }
    } catch {
      setStepsError('Could not load your steps. Please try again.');
    } finally {
      setStepsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadReminders();
      loadSteps();
    }
  }, [user, loadReminders, loadSteps]);

  // Re-check the "due now" strip every 30s while the page is open.
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const now = useMemo(() => new Date(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const dueNow = useMemo(() => reminders.filter((r) => isDue(r, now)), [reminders, now]);

  const saveReminder = useCallback(async (clean) => {
    setSaving(true);
    setRemError('');
    try {
      let error = null;
      if (editing) {
        ({ error } = await supabase.from('reminder_items').update(clean).eq('id', editing.id));
      } else {
        ({ error } = await supabase.from('reminder_items').insert({ ...clean, user_id: user.id }));
      }
      if (error) {
        if (isMissingTable(error)) setRemMissing(true);
        else setRemError('Could not save the reminder. Please try again.');
      } else {
        setShowForm(false);
        setEditing(null);
        await loadReminders();
      }
    } catch {
      setRemError('Could not save the reminder. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [editing, user, loadReminders]);

  const toggleEnabled = useCallback(async (r) => {
    setRemError('');
    const { error } = await supabase.from('reminder_items').update({ enabled: !r.enabled }).eq('id', r.id);
    if (error) setRemError('Could not update the reminder. Please try again.');
    else setReminders((list) => list.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)));
  }, []);

  const deleteReminder = useCallback(async (r) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    setRemError('');
    const { error } = await supabase.from('reminder_items').delete().eq('id', r.id);
    if (error) setRemError('Could not delete the reminder. Please try again.');
    else setReminders((list) => list.filter((x) => x.id !== r.id));
  }, []);

  const saveTodaySteps = useCallback(async () => {
    const n = Number(String(todaySteps).trim());
    if (!Number.isInteger(n) || n < 0) {
      setStepsError('Enter a whole number of steps (0 or more).');
      return;
    }
    setStepsSaving(true);
    setStepsError('');
    try {
      const { error } = await supabase
        .from('user_steps')
        .upsert({ user_id: user.id, step_date: todayISO(), steps: n, updated_at: new Date().toISOString() });
      if (error) {
        if (isMissingTable(error)) setStepsMissing(true);
        else setStepsError('Could not save your steps. Please try again.');
      } else {
        await loadSteps();
      }
    } catch {
      setStepsError('Could not save your steps. Please try again.');
    } finally {
      setStepsSaving(false);
    }
  }, [todaySteps, user, loadSteps]);

  const stepTotals = useMemo(() => {
    const all = steps.reduce((s, r) => s + (Number(r.steps) || 0), 0);
    const today = steps.find((r) => r.step_date === todayISO());
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    const week = steps
      .filter((r) => new Date(`${r.step_date}T12:00:00`) >= weekAgo)
      .reduce((s, r) => s + (Number(r.steps) || 0), 0);
    return { all, today: today ? Number(today.steps) : 0, week };
  }, [steps]);

  const orderedReminders = useMemo(() => {
    // Enabled reminders first, ordered by their next fire time.
    const withFire = reminders.map((r) => ({ r, fire: nextFire(r, now) }));
    withFire.sort((a, b) => {
      if ((a.r.enabled === false) !== (b.r.enabled === false)) return a.r.enabled === false ? 1 : -1;
      const af = a.fire ? a.fire.getTime() : Infinity;
      const bf = b.fire ? b.fire.getTime() : Infinity;
      return af - bf;
    });
    return withFire.map((x) => x.r);
  }, [reminders, now]);

  return (
    <div className="min-h-dvh bg-black text-zinc-100">
      {/* Warm temple sanctuary behind the page — still, low, calm. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img src="/images/hygieia/bg-temple.webp" alt="" className="h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/85" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 pt-6 pb-32" style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))' }}>
        <PageBack label="Hub" href="/" />

        <div aria-hidden="true" className="mt-4 overflow-hidden rounded-xl border border-amber-200/15">
          <img src="/images/hygieia/header-healing.webp" alt="" className="h-32 w-full object-cover opacity-85 sm:h-40" />
        </div>

        <header className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500">Pocket universe</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">{TITLE}</h1>
          <p className="mt-1 text-sm text-zinc-400">{SUBTITLE}</p>
        </header>

        {!authChecked ? (
          <div className="mt-8">
            <LoadingNote>Waking Hygieia…</LoadingNote>
          </div>
        ) : cloudOffline ? (
          <ErrorNote>
            The database connection isn&apos;t configured right now, so reminders and steps can&apos;t be
            loaded. Everything else on this page still works offline.
          </ErrorNote>
        ) : !user ? (
          <div className="mt-8">
            <EmptyNote>
              Sign in to use Hygieia. Your reminders and your steps belong to your account — there&apos;s
              nothing to show until you&apos;re signed in.
            </EmptyNote>
          </div>
        ) : (
          <>
            <nav className="mt-6 flex gap-2" aria-label="Hygieia sections">
              {[
                { key: 'reminders', label: 'Reminders', icon: 'bell' },
                { key: 'steps', label: 'Steps', icon: 'steps' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key ? 'page' : undefined}
                  className={`inline-flex items-center justify-center gap-2 min-h-[44px] flex-1 rounded-lg border px-4 text-sm font-bold ${
                    tab === t.key
                      ? 'border-zinc-100 bg-zinc-100 text-black'
                      : 'border-zinc-700 text-zinc-400 hover:bg-zinc-900'
                  }`}
                >
                  <HygIcon name={t.icon} />
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'reminders' && (
              <div className="mt-4 flex flex-col gap-4">
                <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs leading-relaxed text-zinc-400">
                  {NOTIFICATION_NOTE}
                </p>

                {remMissing && (
                  <ErrorNote>
                    The reminders database isn&apos;t set up yet, so nothing can be saved right now. Your
                    reminders will work once the Hygieia database update is run.
                  </ErrorNote>
                )}
                {remError && <ErrorNote>{remError}</ErrorNote>}

                <SectionCard title="Due now">
                  {dueNow.length === 0 ? (
                    <EmptyNote>Nothing is due right now. When a reminder&apos;s time comes, it shows up here while this page is open.</EmptyNote>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {dueNow.map((r) => (
                        <li key={r.id} className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-3">
                          <p className="text-sm font-bold text-white">{r.title}</p>
                          <p className="mt-0.5 text-xs text-zinc-400">{formatSchedule(r)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard title="Your reminders">
                  {remLoading ? (
                    <LoadingNote>Loading your reminders…</LoadingNote>
                  ) : orderedReminders.length === 0 ? (
                    <EmptyNote>
                      No reminders yet. Add one below — a nudge to move, to drink water, to step outside.
                      It shows up here when its time comes.
                    </EmptyNote>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {orderedReminders.map((r) => (
                        <li
                          key={r.id}
                          className={`rounded-lg border px-4 py-3 ${r.enabled ? 'border-zinc-700 bg-zinc-900/40' : 'border-zinc-800 bg-black/40 opacity-60'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-white">{r.title}</p>
                              <p className="mt-0.5 text-xs text-zinc-400">{formatSchedule(r)}</p>
                              <p className="mt-0.5 text-xs text-zinc-500">{nextFireLabel(r, now)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleEnabled(r)}
                              aria-pressed={!!r.enabled}
                              aria-label={r.enabled ? `Turn off ${r.title}` : `Turn on ${r.title}`}
                              className={`inline-flex items-center gap-1.5 min-h-[44px] shrink-0 rounded-lg border px-3 text-xs font-bold ${
                                r.enabled ? 'border-zinc-600 text-zinc-200' : 'border-zinc-800 text-zinc-500'
                              }`}
                            >
                              <HygIcon name="power" size={12} />
                              {r.enabled ? 'On' : 'Off'}
                            </button>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-zinc-800 px-3 text-xs text-zinc-400 hover:bg-zinc-900"
                              onClick={() => { setEditing(r); setShowForm(true); }}
                            >
                              <HygIcon name="pencil" size={12} />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-zinc-800 px-3 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-red-300"
                              onClick={() => deleteReminder(r)}
                            >
                              <HygIcon name="trash" size={12} />
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3">
                    {!showForm ? (
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={remMissing}
                        onClick={() => { setEditing(null); setShowForm(true); }}
                      >
                        <HygIcon name="plus" />
                        Add a reminder
                      </button>
                    ) : (
                      <ReminderForm
                        initial={editing}
                        saving={saving}
                        onSave={saveReminder}
                        onCancel={() => { setShowForm(false); setEditing(null); }}
                      />
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {tab === 'steps' && (
              <div className="mt-4 flex flex-col gap-4">
                {stepsMissing && (
                  <ErrorNote>
                    The step-history database isn&apos;t set up yet, so steps can&apos;t be saved or shown
                    right now. Everything will appear once the steps database update is run.
                  </ErrorNote>
                )}
                {stepsError && <ErrorNote>{stepsError}</ErrorNote>}

                <SectionCard title="Your totals">
                  {stepsLoading ? (
                    <LoadingNote>Loading your steps…</LoadingNote>
                  ) : steps.length === 0 ? (
                    <EmptyNote>
                      No steps logged yet. Your first entry starts the count — every step after that adds up.
                    </EmptyNote>
                  ) : (
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Today', value: stepTotals.today },
                        { label: 'Last 7 days', value: stepTotals.week },
                        { label: 'All time', value: stepTotals.all },
                      ].map((s) => (
                        <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2 py-3">
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{s.label}</dt>
                          <dd className="mt-1 text-xl font-black text-white">{s.value.toLocaleString()}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </SectionCard>

                <SectionCard title="Log today's steps">
                  <p className="mb-2 text-xs text-zinc-500">
                    Entered by hand — phone health sync comes with the mobile app.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      className={inputCls}
                      value={todaySteps}
                      placeholder="e.g. 8432"
                      aria-label="Steps today"
                      onChange={(e) => setTodaySteps(e.target.value)}
                    />
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={stepsSaving || stepsMissing}
                      onClick={saveTodaySteps}
                    >
                      {stepsSaving ? 'Saving…' : (
                        <>
                          <HygIcon name="check" />
                          Save
                        </>
                      )}
                    </button>
                  </div>
                </SectionCard>

                <SectionCard title="History">
                  {steps.length === 0 && !stepsLoading ? (
                    <EmptyNote>Your step history will grow here, one day at a time.</EmptyNote>
                  ) : (
                    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                      {steps.map((r) => (
                        <li
                          key={r.step_date}
                          className="flex items-center justify-between rounded-lg border border-zinc-800/70 px-4 py-2.5"
                        >
                          <span className="text-sm text-zinc-300">{r.step_date}</span>
                          <span className="text-sm font-bold text-white">{Number(r.steps).toLocaleString()} steps</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard title="Room to grow">
                  <ul className="flex flex-col gap-2">
                    {[
                      { name: 'Sleep', note: 'Nightly sleep hours and quality.' },
                      { name: 'Water', note: 'Daily water intake.' },
                    ].map((m) => (
                      <li key={m.name} className="rounded-lg border border-dashed border-zinc-800 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-300">{m.name}</span>
                          <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            Coming later
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">{m.note}</p>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
