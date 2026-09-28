// plutus/Charts.jsx — procedural canvas charts. No chart libraries, no network.
'use client';

import { useEffect, useRef } from 'react';
import { CATEGORY_COLORS } from './finance';

function setupCanvas(canvas, height) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const w = canvas.clientWidth;
  canvas.width = w * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, w, h: height };
}

export function DonutChart({ data, currency }) {
  // data: { [category]: amount }
  const ref = useRef(null);
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas, 220);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12, inner = r * 0.62;
    ctx.clearRect(0, 0, w, h);
    if (total <= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.arc(cx, cy, (r + inner) / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#71717a'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('No data yet', cx, cy + 4);
      return;
    }
    let a = -Math.PI / 2;
    for (const [cat, val] of entries) {
      const sweep = (val / total) * Math.PI * 2;
      ctx.strokeStyle = CATEGORY_COLORS[cat] || '#9ca3af';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(cx, cy, (r + inner) / 2, a + 0.02, a + sweep - 0.02);
      ctx.stroke();
      a += sweep;
    }
    // Restraint: glow stays local, texture/numbers stay readable.
    ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui'; ctx.textAlign = 'center';
    const shown = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total.toFixed(0);
    ctx.fillText(shown, cx, cy - 2);
    ctx.fillStyle = '#71717a'; ctx.font = '11px system-ui';
    ctx.fillText('total', cx, cy + 16);
  }, [data, total]);

  return (
    <div>
      <canvas ref={ref} className="w-full" style={{ height: 220 }} aria-label="Expense breakdown donut chart" />
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.slice(0, 10).map(([cat, val]) => (
          <div key={cat} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CATEGORY_COLORS[cat] || '#9ca3af' }} />
            <span className="text-zinc-400 truncate">{cat}</span>
            <span className="ml-auto text-zinc-200 font-mono">{total > 0 ? Math.round((val / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthBars({ months, totals }) {
  // months: ['YYYY-MM', ...]; totals: { 'YYYY-MM': { income, expense } }
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas, 200);
    ctx.clearRect(0, 0, w, h);
    const maxV = Math.max(1, ...months.map(m => Math.max(totals[m]?.income || 0, totals[m]?.expense || 0)));
    const n = months.length;
    const slot = w / n;
    const barW = Math.min(22, slot / 3.2);
    months.forEach((m, i) => {
      const x = slot * i + slot / 2;
      const inc = totals[m]?.income || 0;
      const exp = totals[m]?.expense || 0;
      const baseY = h - 26;
      const ih = (inc / maxV) * (h - 46);
      const eh = (exp / maxV) * (h - 46);
      // income bar
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(x - barW - 3, baseY - ih, barW, ih);
      // expense bar
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(x + 3, baseY - eh, barW, eh);
      // month label
      ctx.fillStyle = '#71717a'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
      const [y, mo] = m.split('-').map(Number);
      ctx.fillText(new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' }), x, h - 8);
    });
  }, [months, totals]);

  return (
    <div>
      <canvas ref={ref} className="w-full" style={{ height: 200 }} aria-label="Monthly income versus expenses bar chart" />
      <div className="mt-2 flex items-center justify-center gap-5 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400" />Income</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />Expenses</span>
      </div>
    </div>
  );
}
