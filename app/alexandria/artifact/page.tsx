// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Orbitron, Rajdhani } from 'next/font/google';
import { BackButton } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700'] });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['400', '600'] });

export default function ArtifactReader() {
  const router = useRouter();
  const [loadingMsg, setLoadingMsg] = useState('Opening your book…');
  const [meta, setMeta] = useState({ title: '…', author: '…' });
  const [coverUrl, setCoverUrl] = useState('');
  const [chapters, setChapters] = useState([]);

  useEffect(() => {
    let sessionPromise;
    try {
      sessionPromise = supabase.auth.getSession(); // throws when Supabase env vars are missing
    } catch {
      setLoadingMsg('Cloud features are offline — this reader needs the database connection.');
      return;
    }
    sessionPromise.then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#00f2ff; text-align:center; padding:50px; font-family:monospace;">Please log in at the Master Hub to continue.</div>';
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const codexId = urlParams.get('id');

      if (!codexId) {
        setLoadingMsg('Please pick a book from the library first.');
        return;
      }

      supabase.from('manuscripts').select('*').eq('id', codexId).single()
        .then(({ data, error }) => {
          if (error || !data) {
            setLoadingMsg('Something went wrong — that book could not be found.');
            return;
          }
          setMeta({ title: data.title || 'Untitled', author: data.author || 'Unknown author' });
          if (data.cover_url) setCoverUrl(data.cover_url);

          const chaps = String(data.content || '').split('\n\n').filter(p => p.trim() !== '');
          setChapters(chaps);
          setLoadingMsg('');
        });
    });
  }, [router]);

  return (
    <>
      <style>{`
        .artifact-wrapper { --obsidian: #050507; --neon-gold: #FFD700; --neon-cyan: #00f2ff; background-color: var(--obsidian); color: #E0E0E0; width: 100vw; height: 100dvh; overflow: hidden; margin: 0; }
        .artifact-wrapper::before { content: ""; position: fixed; inset: 0; background-image: linear-gradient(rgba(0, 243, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 243, 255, 0.05) 1px, transparent 1px); background-size: 30px 30px; z-index: 0; pointer-events: none; }
        .carousel { display: flex; width: 100vw; height: 100dvh; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; position: relative; z-index: 10; overscroll-behavior-x: contain; touch-action: pan-x pan-y; }
        .carousel::-webkit-scrollbar { display: none; }
        .page { min-width: 100vw; width: 100vw; height: 100dvh; scroll-snap-align: start; scroll-snap-stop: always; display: flex; justify-content: center; overflow-y: auto; overflow-x: hidden; padding: clamp(1rem, 4vw, 60px) clamp(0.75rem, 4vw, 20px); padding-top: calc(clamp(1rem, 4vw, 60px) + env(safe-area-inset-top)); padding-bottom: calc(clamp(1rem, 4vw, 60px) + env(safe-area-inset-bottom)); box-sizing: border-box; -webkit-overflow-scrolling: touch; }
        .content { max-width: 900px; width: 100%; background: rgba(18, 18, 21, 0.85); border: 1px solid rgba(0, 243, 255, 0.2); border-radius: 8px; padding: clamp(1.25rem, 5vw, 50px); box-shadow: 0 0 20px rgba(0, 243, 255, 0.03); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; flex-direction: column; margin: auto; position: relative; z-index: 2; }
        h1, h2 { text-transform: uppercase; text-align: center; letter-spacing: 2px; }
        h1 { color: var(--neon-gold); text-shadow: 0 0 12px rgba(255, 215, 0, 0.5); font-size: clamp(1.9rem, 7vw, 3.5rem); line-height: 1.2; margin: 0 0 1rem 0; }
        h2 { color: var(--neon-cyan); border-bottom: 1px solid rgba(0, 243, 255, 0.3); padding-bottom: 15px; margin: 0 0 1.75rem 0; font-size: clamp(1rem, 3.5vw, 1.4rem); }
        .author { text-align: center; color: var(--neon-cyan); font-size: clamp(1rem, 3vw, 1.2rem); letter-spacing: 2px; text-transform: uppercase; line-height: 1.6; }
        .chapter-body { flex-grow: 1; }
        .chapter-body p { margin: 0 0 1.25rem 0; line-height: 1.85; font-size: clamp(1.05rem, 2.8vw, 1.18rem); color: #d8d8d8; }
        .chapter-body p:last-child { margin-bottom: 0; }
        .chapter-body p:first-child::first-letter { color: var(--neon-gold); font-size: 1.5em; }
        .footer { text-align: center; color: rgba(255, 215, 0, 0.6); font-size: 0.8rem; letter-spacing: 3px; text-transform: uppercase; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(0, 243, 255, 0.15); line-height: 1.8; }
        .cover-page { background: #050508; background-size: cover; background-position: center; box-shadow: inset 0 0 100px rgba(0,0,0,0.9); align-items: stretch; }
        .cover-page .content { background: transparent; border: none; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
        .loading-screen { position: fixed; inset: 0; background: #050507; display: flex; justify-content: center; align-items: center; text-align: center; padding: 2rem; color: #fe53bb; font-size: clamp(1.1rem, 4.5vw, 2rem); letter-spacing: 2px; line-height: 1.8; z-index: 9999; }
        .back-btn { position: fixed; top: calc(14px + env(safe-area-inset-top)); left: 14px; z-index: 50000; background: rgba(5, 5, 8, 0.85); border: 1px solid var(--neon-cyan); color: var(--neon-cyan); min-height: 44px; min-width: 44px; padding: 0.6rem 1.1rem; border-radius: 8px; font-family: 'Orbitron', sans-serif; font-weight: bold; font-size: 0.8rem; letter-spacing: 1px; cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
        .back-btn:hover { background: var(--neon-cyan); color: #000; }
        .back-btn:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }
        .page-hint { position: fixed; bottom: calc(16px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); font-family: monospace; font-size: 0.75rem; color: #888; background: rgba(0,0,0,0.8); padding: 6px 18px; border-radius: 20px; border: 1px solid #333; z-index: 40000; pointer-events: none; white-space: nowrap; }
        @media (prefers-reduced-motion: reduce) { .carousel { scroll-behavior: auto; } }
      `}</style>

      <div className={`artifact-wrapper ${rajdhani.className}`}>
        <BackButton label="Library" href="/alexandria" />
        {loadingMsg && <div className={`loading-screen ${orbitron.className}`} role="status">{loadingMsg}</div>}

        <div className="carousel" id="book-carousel">
          <div className="page cover-page" style={{ backgroundImage: coverUrl ? `url('${coverUrl}')` : 'none' }} aria-label="Book cover"></div>

          <div className="page">
            <div className="content" style={{ justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h1 className={orbitron.className}>{meta.title}</h1>
                <div className="author">Written by {meta.author}</div>
              </div>
              <div className={`footer ${orbitron.className}`}>Powered by Olympus</div>
            </div>
          </div>

          {chapters.map((chap, idx) => (
            <div className="page" key={idx} aria-label={`Chapter ${idx + 1} of ${chapters.length}`}>
              <div className="content">
                <h2 className={orbitron.className}>Chapter {idx + 1} of {chapters.length}</h2>
                <div className="chapter-body">
                  {chap.split('\n').filter(l => l.trim() !== '').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <div className={`footer ${orbitron.className}`}>Hardcopy publisher contracts welcome</div>
              </div>
            </div>
          ))}
        </div>
        {!loadingMsg && chapters.length > 0 && (
          <div className="page-hint">← Swipe to turn pages →</div>
        )}
      </div>
    </>
  );
}
