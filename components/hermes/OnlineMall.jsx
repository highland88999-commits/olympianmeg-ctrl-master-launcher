// components/hermes/OnlineMall.jsx
// Merlin's Online Mall — his original mall build from the Hermes-Landing repo,
// ported verbatim in design: slidable category pages, per-card ambient video
// backgrounds, the unrealBloom pulse, cyberpunk accent strips, PREV/NEXT
// navigation. His section header carries his own Online Mall logo.
//
// Adaptations (function only, never look):
//   - Listings arrive as a prop from the server (one fetch on the page) instead
//     of a client-side Supabase query; `link.title` is mapped from `link.name`.
//   - The seven catbox.moe video hotlinks are replaced with his two videos from
//     the Hermes-Landing media/ folder, self-hosted under /public/hermes.
//   - Prev/Next buttons meet the 44px iPhone touch target.
//   - Category labels resolve through the launcher's CATEGORIES map.
//   - No telemetry, no phone-home: this component only renders directory data.
'use client';

import React, { useState } from 'react';
import {
  MALL_LOGO,
  labelForCategory,
  formatMallUrl,
  groupLinksByCategory,
  mallVideoFor,
} from '@/lib/hermes/online-mall.js';

export default function OnlineMall({ links = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Group links by their category (his grouping, verbatim)
  const { grouped: categorizedData, categories } = groupLinksByCategory(links);

  const nextSlide = () => {
    if (categories.length === 0) return;
    setCurrentIndex((prevIndex) => (prevIndex + 1) % categories.length);
  };

  const prevSlide = () => {
    if (categories.length === 0) return;
    setCurrentIndex((prevIndex) => (prevIndex - 1 + categories.length) % categories.length);
  };

  const currentCategory = categories[currentIndex];
  const linksInCategory = currentCategory ? categorizedData[currentCategory] || [] : [];

  return (
    <section aria-label="Online Mall" className="mt-20">
      {/* His Online Mall masthead */}
      <div className="text-center mb-8">
        <img
          src={MALL_LOGO}
          alt="Online Mall"
          className="mx-auto rounded-xl border border-cyan-500/30 shadow-[0_0_40px_rgba(0,255,255,0.15)]"
          style={{ width: 'min(320px, 72vw)', height: 'auto' }}
          loading="lazy"
        />
        <p className="mt-4 text-xs tracking-[0.3em] text-cyan-400/80 uppercase">
          Merlin&apos;s original mall — every listing below is a paid directory node
        </p>
      </div>

      {/*
        This style block handles the slow pulsing unreal bloom effect
        without relying on Tailwind config files. (His, verbatim.)
      */}
      <style>{`
        @keyframes unrealBloom {
          0% {
            opacity: 0.3;
            filter: brightness(1) contrast(1.2) blur(1px) drop-shadow(0 0 5px rgba(0,255,255,0.2));
          }
          100% {
            opacity: 0.65;
            filter: brightness(1.5) contrast(1.4) blur(0px) drop-shadow(0 0 20px rgba(0,255,255,0.6));
          }
        }
        .card-hover:hover {
          border-color: #00ffff !important;
          box-shadow: 0 0 25px rgba(0, 255, 255, 0.4) !important;
          transform: translateY(-2px);
        }
      `}</style>

      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '60px 20px', letterSpacing: '2px' }}>
          No active nodes found in the network.
        </div>
      ) : (
        <div style={{
          position: 'relative', width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          {/* PAGE / CATEGORY HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '30px', width: '100%' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '6px', color: '#00ffff', textTransform: 'uppercase', textShadow: '0 0 15px rgba(0,255,255,0.5)' }}>
              {labelForCategory(currentCategory)}
            </h2>
            <span style={{ fontSize: '12px', color: '#888', letterSpacing: '2px' }}>
              Node Page {currentIndex + 1} of {categories.length}
            </span>
          </div>

          {/* SLIDABLE CONTAINER (Cards for the current category page) */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '20px',
            width: '100%', maxWidth: '700px', padding: '0 20px'
          }}>
            {linksInCategory.map((link, index) => (
              <a
                key={link.id || link.root_domain || link.url}
                href={formatMallUrl(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="card-hover"
                style={{
                  display: 'flex', flexDirection: 'column', position: 'relative', width: '100%',
                  backgroundColor: 'rgba(5, 5, 5, 0.8)', borderRadius: '12px', padding: '24px',
                  textDecoration: 'none', border: '1px solid rgba(0, 255, 255, 0.2)',
                  transition: 'all 0.4s ease', overflow: 'hidden', minHeight: '110px',
                  justifyContent: 'center'
                }}
              >
                {/* Background Video Layer (his media, self-hosted) */}
                <video
                  autoPlay loop muted playsInline preload="metadata"
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    objectFit: 'cover', zIndex: 0, pointerEvents: 'none',
                    animation: 'unrealBloom 5s infinite alternate ease-in-out',
                    mixBlendMode: 'screen'
                  }}
                >
                  <source src={mallVideoFor(index)} type="video/mp4" />
                </video>

                {/* Cyberpunk Accent Strip */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'linear-gradient(to bottom, #00ffff, #bc13fe)', zIndex: 1 }}></div>

                {/* Text Content (Z-index ensures it sits above the video) */}
                <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '2px', textShadow: '0 2px 5px rgba(0,0,0,0.9)' }}>
                    {link.title || link.root_domain || link.url}
                  </span>
                  <span style={{ fontSize: '11px', color: '#cccccc', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
                    {link.url}
                  </span>
                </div>
              </a>
            ))}
          </div>

          {/* NAVIGATION CONTROLS */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', maxWidth: '700px', padding: '30px 20px', marginTop: '10px'
          }}>
            <button
              onClick={prevSlide}
              style={{
                padding: '12px 20px', minHeight: '44px', backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0, 255, 255, 0.4)',
                color: '#00ffff', borderRadius: '8px', fontSize: '12px', letterSpacing: '2px', cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              &laquo; PREV
            </button>

            <span style={{ fontSize: '10px', color: '#00ffff', letterSpacing: '4px', textTransform: 'uppercase', opacity: 0.7 }}>
              Swipe / Navigate
            </span>

            <button
              onClick={nextSlide}
              style={{
                padding: '12px 20px', minHeight: '44px', backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0, 255, 255, 0.4)',
                color: '#00ffff', borderRadius: '8px', fontSize: '12px', letterSpacing: '2px', cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              NEXT &raquo;
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
