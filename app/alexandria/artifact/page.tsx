// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ArtifactReader() {
  const router = useRouter();
  const [loadingMsg, setLoadingMsg] = useState('DECRYPTING ARTIFACT...');
  const [meta, setMeta] = useState({ title: '...', author: '...' });
  const [coverUrl, setCoverUrl] = useState('');
  const [chapters, setChapters] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#08f7fe; text-align:center; padding:50px; font-family:monospace;">UNAUTHORIZED.</div>';
        return;
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      const codexId = urlParams.get('id');

      if (!codexId) {
        setLoadingMsg("ERROR: NO ARTIFACT ID PROVIDED");
        return;
      }

      supabase.from('manuscripts').select('*').eq('id', codexId).single()
        .then(({ data, error }) => {
          if (error || !data) {
            setLoadingMsg("ERROR: ARTIFACT CORRUPTED OR NOT FOUND");
            return;
          }
          setMeta({ title: data.title, author: data.author });
          if (data.cover_url) setCoverUrl(data.cover_url);

          const chaps = data.content.split('\n\n').filter(p => p.trim() !== '');
          setChapters(chaps);
          setLoadingMsg('');
        });
    });
  }, [router]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;600&display=swap');
        .artifact-wrapper { --obsidian: #050507; --neon-gold: #FFD700; --neon-cyan: #00F3FF; background-color: var(--obsidian); color: #E0E0E0; font-family: 'Rajdhani', sans-serif; width: 100vw; height: 100vh; overflow: hidden; margin:0; }
        .artifact-wrapper::before { content: ""; position: fixed; inset: 0; background-image: linear-gradient(rgba(0, 243, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 243, 255, 0.05) 1px, transparent 1px); background-size: 30px 30px; z-index: -1; }
        .carousel { display: flex; width: 100vw; height: 100vh; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; }
        .page { min-width: 100vw; height: 100vh; scroll-snap-align: start; display: flex; justify-content: center; overflow-y: auto; padding: 60px 20px; box-sizing: border-box; }
        .content { max-width: 900px; width: 100%; background: rgba(18, 18, 21, 0.85); border: 1px solid rgba(0, 243, 255, 0.2); border-radius: 4px; padding: 50px; box-shadow: 0 0 20px rgba(0, 243, 255, 0.03); backdrop-filter: blur(8px); display: flex; flex-direction: column; margin: auto; }
        h1, h2 { font-family: 'Orbitron', sans-serif; text-transform: uppercase; text-align: center; letter-spacing: 2px; }
        h1 { color: var(--neon-gold); text-shadow: 0 0 12px rgba(255, 215, 0, 0.5); font-size: 3.5rem; }
        h2 { color: var(--neon-cyan); border-bottom: 1px solid rgba(0, 243, 255, 0.3); padding-bottom: 15px; margin-bottom: 30px; }
        .author { text-align: center; color: var(--neon-cyan); font-size: 1.2rem; letter-spacing: 2px; text-transform: uppercase; }
        ul { list-style-type: none; padding: 0; flex-grow: 1; }
        li { margin-bottom: 18px; line-height: 1.7; font-size: 1.15rem; position: relative; padding-left: 25px; }
        li::before { content: "►"; color: var(--neon-gold); position: absolute; left: 0; top: 2px; font-size: 0.8rem; }
        .footer { text-align: center; font-family: 'Orbitron', sans-serif; color: rgba(255, 215, 0, 0.6); font-size: 0.85rem; letter-spacing: 3px; text-transform: uppercase; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(0, 243, 255, 0.15); }
        .cover-page { background: #050508; background-size: cover; background-position: center; box-shadow: inset 0 0 100px rgba(0,0,0,0.9); }
        .loading-screen { position: fixed; inset: 0; background: #050507; display: flex; justify-content: center; align-items: center; color: #fe53bb; font-family: 'Orbitron', sans-serif; font-size: 2rem; z-index: 9999; }
      `}</style>
      
      <div className="artifact-wrapper">
        {loadingMsg && <div className="loading-screen">{loadingMsg}</div>}
        
        <div className="carousel" id="book-carousel">
          <div className="page cover-page" style={{backgroundImage: coverUrl ? `url('${coverUrl}')` : 'none'}}></div>
          
          <div className="page">
            <div className="content" style={{justifyContent: 'center', textAlign: 'center', height: '100%'}}>
              <div style={{flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                <h1>{meta.title}</h1>
                <div className="author">Written by: {meta.author}</div>
              </div>
              <div className="footer">Powered By Olympus</div>
            </div>
          </div>

          {chapters.map((chap, idx) => (
            <div className="page" key={idx}>
              <div className="content">
                <h2>CHAPTER {idx + 1}</h2>
                <ul>
                  {chap.split('\n').filter(l => l.trim() !== '').map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                <div className="footer">HARDCOPY PUBLISHER CONTRACTS WELCOME</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


