// plutus/finance.js — pure finance logic for the Plutus module.
// Everything is local-only: data lives in the browser's localStorage.
// No network calls, no telemetry. This module is fully testable in Node.

export const STORAGE_KEY = 'plutus-data-v1';

export const EXPENSE_CATEGORIES = [
  'Housing', 'Food', 'Transport', 'Utilities',
  'Entertainment', 'Health', 'Shopping', 'Savings', 'Other',
];

export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Other'];

export const CATEGORY_COLORS = {
  Housing: '#f59e0b', Food: '#50ffb0', Transport: '#38bdf8', Utilities: '#a78bfa',
  Entertainment: '#f472b6', Health: '#fb7185', Shopping: '#facc15', Savings: '#34d399',
  Other: '#9ca3af', Salary: '#4ade80', Freelance: '#22d3ee', Investments: '#e879f9',
};

export const CURRENCIES = {
  CAD: { symbol: '$', code: 'CAD' },
  USD: { symbol: '$', code: 'USD' },
  EUR: { symbol: '€', code: 'EUR' },
  GBP: { symbol: '£', code: 'GBP' },
};

export function blankData() {
  return {
    version: 1,
    currency: 'CAD',
    demo: false,
    entries: [],   // { id, type: 'expense'|'income', amount, category, date: 'YYYY-MM-DD', note }
    goals: [],     // { id, name, target, saved, createdAt }
    budgets: {},   // { category: monthlyLimit }
  };
}

// A clearly-labeled seed so the dashboard never looks broken on first run.
export function demoData() {
  const now = new Date();
  const d = (monthOffset, day) => {
    const t = new Date(now.getFullYear(), now.getMonth() + monthOffset, Math.min(day, 28));
    return t.toISOString().slice(0, 10);
  };
  let n = 0;
  const e = (type, amount, category, date, note = '') => ({ id: `demo-${++n}`, type, amount, category, date, note });
  const entries = [];
  for (let m = -5; m <= 0; m++) {
    entries.push(e('income', 5200, 'Salary', d(m, 1), 'Paycheque'));
    if (m % 2 === 0) entries.push(e('income', 640, 'Freelance', d(m, 15), 'Side project'));
    entries.push(e('expense', 1450, 'Housing', d(m, 2), 'Rent'));
    entries.push(e('expense', 480, 'Food', d(m, 5), 'Groceries'));
    entries.push(e('expense', 160, 'Food', d(m, 12), 'Dining out'));
    entries.push(e('expense', 220, 'Transport', d(m, 3), 'Fuel + transit'));
    entries.push(e('expense', 190, 'Utilities', d(m, 8), 'Power + internet'));
    entries.push(e('expense', 140, 'Entertainment', d(m, 20), 'Movies + games'));
    entries.push(e('expense', 90, 'Health', d(m, 11), 'Pharmacy'));
    entries.push(e('expense', 260, 'Shopping', d(m, 18), 'Clothes + gear'));
    entries.push(e('expense', 600, 'Savings', d(m, 25), 'Auto-transfer'));
  }
  return {
    version: 1,
    currency: 'CAD',
    demo: true,
    entries,
    goals: [
      { id: 'demo-g1', name: 'Emergency fund', target: 10000, saved: 6200, createdAt: d(-4, 1) },
      { id: 'demo-g2', name: 'New workstation', target: 3500, saved: 1200, createdAt: d(-2, 1) },
    ],
    budgets: { Housing: 1500, Food: 700, Transport: 260, Utilities: 220, Entertainment: 180, Health: 120, Shopping: 300 },
  };
}

export function monthKey(dateStr) {
  return String(dateStr).slice(0, 7); // YYYY-MM
}

export function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

// Last N months including the current one, oldest first. Each is "YYYY-MM".
export function lastNMonths(n) {
  const out = [];
  const t = new Date();
  t.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
}

export function monthlyTotals(entries) {
  // { 'YYYY-MM': { income, expense } }
  const out = {};
  for (const e of entries) {
    const k = monthKey(e.date);
    if (!out[k]) out[k] = { income: 0, expense: 0 };
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') out[k].income += amt;
    else out[k].expense += amt;
  }
  return out;
}

export function categoryTotals(entries, type, mKey) {
  const out = {};
  for (const e of entries) {
    if (e.type !== type) continue;
    if (mKey && monthKey(e.date) !== mKey) continue;
    out[e.category] = (out[e.category] || 0) + (Number(e.amount) || 0);
  }
  return out;
}

export function netForMonth(entries, mKey) {
  const t = monthlyTotals(entries)[mKey] || { income: 0, expense: 0 };
  return t.income - t.expense;
}

export function budgetStatus(data, mKey) {
  // Per-category: { spent, limit, pct } for categories with a budget set.
  const spent = categoryTotals(data.entries, 'expense', mKey);
  const out = {};
  for (const [cat, limit] of Object.entries(data.budgets || {})) {
    const s = spent[cat] || 0;
    out[cat] = { spent: s, limit: Number(limit) || 0, pct: limit > 0 ? s / limit : 0 };
  }
  return out;
}

export function goalProgress(goal) {
  const target = Number(goal.target) || 0;
  const saved = Number(goal.saved) || 0;
  return { target, saved, pct: target > 0 ? Math.min(1, saved / target) : 0, remaining: Math.max(0, target - saved) };
}

export function formatMoney(amount, currency = 'CAD') {
  const cur = CURRENCIES[currency] || CURRENCIES.CAD;
  const n = Number(amount) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = Math.round((abs - Math.floor(abs)) * 100).toString().padStart(2, '0');
  return `${sign}${cur.symbol}${whole}.${cents}`;
}

// --- validation ------------------------------------------------------------

export function validateEntry({ type, amount, category, date, note }) {
  const errors = [];
  if (type !== 'expense' && type !== 'income') errors.push('Type must be expense or income.');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) errors.push('Amount must be a positive number.');
  const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!cats.includes(category)) errors.push(`Category must be one of: ${cats.join(', ')}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) errors.push('Date must be YYYY-MM-DD.');
  if (note && String(note).length > 140) errors.push('Note is too long (max 140 chars).');
  return errors;
}

export function validateGoal({ name, target }) {
  const errors = [];
  if (!name || !String(name).trim()) errors.push('Goal needs a name.');
  if (String(name).length > 60) errors.push('Goal name is too long (max 60 chars).');
  const t = Number(target);
  if (!Number.isFinite(t) || t <= 0) errors.push('Target must be a positive number.');
  return errors;
}

// --- storage (browser only) ------------------------------------------------

export function loadData() {
  if (typeof window === 'undefined' || !window.localStorage) return blankData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return blankData();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return blankData();
    return { ...blankData(), ...parsed };
  } catch {
    return blankData();
  }
}

export function saveData(data) {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearData() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
