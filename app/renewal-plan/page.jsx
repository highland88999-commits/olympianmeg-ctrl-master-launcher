'use client';

import { useEffect, useState } from 'react';
import {
  PLAN_TITLE,
  PLAN_SUBTITLE,
  RENEWAL_PLAN_NODES,
  getNode,
} from '@/lib/renewal-plan';

/**
 * /renewal-plan — Merlin's written product roadmap, presented as he wrote it:
 * "RENEWAL PLAN TIMELINE (ZIG-ZAG)".
 *
 * A vertical zig-zag timeline: one node per entry. Each node opens an
 * inline (never modal) holographic detail view with his verbatim title and
 * description, the original demo video (mounted only when opened —
 * lazy-loaded), a "Launch in Olympus" deep link where a launcher module
 * exists, and the original prototype link, honestly labeled. The final node
 * is marked as future — no module is invented for it.
 *
 * No pop-ups, no clickbait, no payments. Reduced-motion aware.
 */

const CSS = `
.rp-page { background: #050505; }
.rp-holo {
  background: linear-gradient(180deg, rgba(10,14,18,.92), rgba(6,9,12,.94));
  border: 1px solid rgba(94,234,212,.18);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
}
.rp-holo-open { border-color: rgba(94,234,212,.38); }
.rp-scan {
  background-image: repeating-linear-gradient(
    0deg, rgba(148,233,255,.028) 0 1px, transparent 1px 4px
  );
}
.rp-kicker { letter-spacing: .35em; }
@media (prefers-reduced-motion: reduce) {
  .rp-anim { animation: none !important; transition: none !important; }
}
.rp-anim { transition: border-color .25s ease, background .25s ease, transform .25s ease; }
`;

function NodeDetail({ node, reduced }) {
  return (
    <div className="rp-holo rp-scan rp-anim rounded-lg mt-3 p-4 sm:p-5" role="region" aria-label={`${node.title} details`}>
      {node.video && (
        <div className="rounded-md overflow-hidden border border-teal-300/10 bg-black/60">
          <video
            src={node.video}
            controls
            preload="none"
            playsInline
            className="w-full aspect-video block"
            aria-label={`${node.title} demo video`}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {node.module && node.status === 'built' && (
          <a
            href={node.module}
            className="rp-anim px-5 py-3 min-h-[44px] inline-flex items-center rounded border border-teal-300/40 bg-teal-950/40 text-teal-100 text-[11px] font-bold tracking-[0.2em] uppercase hover:bg-teal-900/50 hover:border-teal-300/70"
          >
            Launch in Olympus
          </a>
        )}
        {node.originalLink && (
          <a
            href={node.originalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="rp-anim px-5 py-3 min-h-[44px] inline-flex items-center rounded border border-zinc-700 bg-zinc-950/60 text-zinc-300 text-[11px] font-bold tracking-[0.2em] uppercase hover:text-white hover:border-zinc-500"
          >
            Original prototype ↗
          </a>
        )}
      </div>

      {node.status === 'prototype' && (
        <p className="mt-3 text-[12px] text-amber-200/70 leading-relaxed">
          Not yet in the launcher — the original prototype above is all that exists so far.
        </p>
      )}
      {node.status === 'future' && (
        <p className="mt-3 text-[12px] text-zinc-400 leading-relaxed">
          Not yet built. This node is shown as Merlin wrote it — no module has been invented for it.
        </p>
      )}
    </div>
  );
}

function TimelineNode({ node, open, onToggle, reduced, side }) {
  const future = node.status === 'future';
  return (
    <div id={node.id} className="relative scroll-mt-24">
      {/* marker */}
      <div
        className={`absolute top-6 z-10 w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black font-mono border rp-anim ${
          future
            ? 'border-dashed border-zinc-600 text-zinc-500 bg-zinc-950'
            : 'border-teal-300/50 text-teal-200 bg-[#0a0f12]'
        } left-4 md:left-1/2 md:-translate-x-1/2`}
        aria-hidden="true"
      >
        {node.index}
      </div>

      {/* card */}
      <div
        className={`md:w-[calc(50%-2.5rem)] ml-16 ${
          side === 'left' ? 'md:ml-0 md:mr-auto' : 'md:ml-auto md:mr-0'
        }`}
      >
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${node.id}-detail`}
          className={`rp-holo rp-anim w-full text-left rounded-xl p-4 sm:p-5 cursor-pointer ${
            open ? 'rp-holo-open' : 'hover:border-teal-300/30'
          }`}
        >
          <div className="rp-kicker text-[10px] font-mono text-teal-300/60 uppercase">
            Node {String(node.index).padStart(2, '0')}
            {future && ' · Future'}
          </div>
          <h2 className="mt-1 text-lg sm:text-xl font-black tracking-wide text-white">
            {node.title}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">
            {node.description}
          </p>
          <div className="mt-3 text-[10px] font-bold tracking-[0.25em] uppercase text-teal-300/70">
            {open ? '− Close' : '+ Open'}
          </div>
        </button>
        {open && (
          <div id={`${node.id}-detail`}>
            <NodeDetail node={node} reduced={reduced} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function RenewalPlanPage() {
  const [openId, setOpenId] = useState(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    document.title = 'Renewal Plan — Olympus';
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const hash = window.location.hash.replace('#', '');
    if (hash && getNode(hash)) {
      setOpenId(hash);
      // Let the node render, then scroll to it.
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 60);
      });
    }
  }, []);

  return (
    <div className="rp-page min-h-dvh text-white">
      <style>{CSS}</style>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <header className="text-center mb-10">
          <div className="rp-kicker text-[10px] font-mono text-teal-300/60 uppercase">
            {PLAN_TITLE}
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-black tracking-wide">
            Renewal Plan Timeline
          </h1>
          <p className="mt-3 text-[13px] text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Merlin&rsquo;s written product roadmap — eight nodes, in his words.
            Open a node to watch the original demo and launch the build.
          </p>
        </header>

        <div className="relative">
          {/* the zig-zag spine */}
          <div
            className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-teal-300/30 via-teal-300/10 to-transparent left-[calc(1rem+1.125rem)] md:left-1/2"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-8">
            {RENEWAL_PLAN_NODES.map((node, i) => (
              <TimelineNode
                key={node.id}
                node={node}
                side={i % 2 === 0 ? 'left' : 'right'}
                open={openId === node.id}
                onToggle={() => setOpenId(openId === node.id ? null : node.id)}
                reduced={reduced}
              />
            ))}
          </div>
        </div>

        <footer className="mt-14 text-center">
          <p className="text-[11px] text-zinc-500 leading-relaxed max-w-lg mx-auto">
            Titles, descriptions, demo videos, and original prototype links are
            Merlin&rsquo;s own. Built nodes launch inside Olympus; everything
            else is labeled honestly.
          </p>
          <a
            href="/"
            className="rp-anim inline-block mt-5 px-6 py-3 min-h-[44px] rounded border border-zinc-700 text-zinc-300 text-[11px] font-bold tracking-[0.25em] uppercase hover:text-white hover:border-zinc-500"
          >
            ← Back to the Hub
          </a>
        </footer>
      </div>
    </div>
  );
}
