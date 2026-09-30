// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { Orbitron, Rajdhani } from 'next/font/google';
import { supabase } from '@/lib/supabase';

// next/font replaces the render-blocking Google Fonts @import (was Orbitron
// 400;700 + Rajdhani 400;600). Variables cascade from .forge-wrapper.
const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-orbitron' });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-rajdhani' });

export default function PublisherStudio() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  useEffect(() => {
    (async () => {
      let session;
      try {
        ({ data: { session } } = await supabase.auth.getSession());
      } catch {
        // No database connection — open the studio with an honest banner.
        // Draft saving and publishing stay disabled until it is set up.
        setCloudOffline(true);
        setMounted(true);
        return;
      }
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#fe53bb; text-align:center; padding:50px; font-family:monospace;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
        return;
      }
      setMounted(true);

      const checkScripts = setInterval(() => {
        if (window.Quill && window.mammoth) {
          clearInterval(checkScripts);
          initEditorAndLogic(session.user);
        }
      }, 200);
    })();
  }, [router]);

  function initEditorAndLogic(currentUser) {
    let currentDraftId = new URLSearchParams(window.location.search).get('id');
    let lastSavedState = "";
    let finalCoverBase64 = null;

    const quill = new window.Quill('#editor-core', {
        theme: 'snow',
        placeholder: 'Format your manuscript...',
        modules: { toolbar: [ [{ 'header': [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ 'color': [] }, { 'background': [] }], ['blockquote', 'code-block'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], [{ 'align': [] }], ['clean'] ] }
    });

    const titleInput = document.getElementById('doc-title');
    const authorInput = document.getElementById('input-author');
    const priceInput = document.getElementById('input-price');
    const walletInput = document.getElementById('input-wallet');
    const statusEl = document.getElementById('save-status');

    function getEditorState() { return JSON.stringify({ title: titleInput.value, content: quill.root.innerHTML }); }

    async function loadOrCreateDraft() {
        if (currentDraftId) {
            const { data } = await supabase.from('drafts').select('*').eq('id', currentDraftId).single();
            if (data) {
                titleInput.value = data.title || "";
                authorInput.value = data.author || "";
                priceInput.value = data.price_btc || "";
                walletInput.value = data.wallet_address || "";
                if (data.content) quill.root.innerHTML = data.content;
                if (data.cover_base64) {
                    finalCoverBase64 = data.cover_base64;
                    document.getElementById('cover-preview').style.backgroundImage = `url('${finalCoverBase64}')`;
                    document.getElementById('cover-placeholder-text').style.display = 'none';
                }
                lastSavedState = getEditorState();
            }
        } else {
            const { data } = await supabase.from('drafts').insert([{ author_id: currentUser.id }]).select();
            if (data && data.length > 0) {
                currentDraftId = data[0].id;
                window.history.replaceState({}, '', `?id=${currentDraftId}`);
                lastSavedState = getEditorState();
            }
        }
    }
    loadOrCreateDraft();

    async function saveDraft() {
        if (!currentDraftId) return;
        const currentState = getEditorState();
        if (currentState === lastSavedState) return;
        statusEl.innerText = "SAVING..."; statusEl.style.color = "var(--neon-gold)";
        const { error } = await supabase.from('drafts').update({
            title: titleInput.value, author: authorInput.value, price_btc: priceInput.value,
            wallet_address: walletInput.value, content: quill.root.innerHTML, cover_base64: finalCoverBase64
        }).eq('id', currentDraftId);
        if (!error) { lastSavedState = currentState; statusEl.innerText = "ALL CHANGES SAVED"; statusEl.style.color = "#0f0"; }
    }
    setInterval(saveDraft, 5000);

    document.getElementById('file-parser').addEventListener('change', function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        if (file.name.endsWith('.docx')) {
            reader.onload = ev => window.mammoth.convertToHtml({ arrayBuffer: ev.target.result }).then(res => { quill.root.innerHTML = res.value; saveDraft(); });
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = ev => { quill.root.innerHTML = ev.target.result.split('\n').map(l => `<p>${l}</p>`).join(''); saveDraft(); };
            reader.readAsText(file);
        }
    });

    window.addEventListener('message', async (event) => {
        if (event.data && event.data.type === 'COVER_EXPORT') {
            finalCoverBase64 = event.data.image;
            document.getElementById('cover-preview').style.backgroundImage = `url('${finalCoverBase64}')`;
            document.getElementById('cover-placeholder-text').style.display = 'none';
            document.getElementById('app-modal').classList.add('hidden');
            await saveDraft();
        }
    });

    document.getElementById('initBtn').onclick = async () => {
        await saveDraft();
        const htmlContent = quill.root.innerHTML;
        if(!titleInput.value || !authorInput.value || htmlContent === '<p><br></p>') return alert("Title, Author, and Content are required.");
        
        document.getElementById('terminal-overlay').style.display = 'flex';
        let coverUrl = null;
        if (finalCoverBase64) {
            const response = await fetch(finalCoverBase64);
            const blob = await response.blob();
            const fileName = `cover_${Date.now()}.png`;
            await supabase.storage.from('covers').upload(fileName, blob, { contentType: 'image/png' });
            const { data: pubData } = supabase.storage.from('covers').getPublicUrl(fileName);
            coverUrl = pubData.publicUrl;
        }

        const payload = {
            publisher_id: currentUser.id, title: titleInput.value, author: authorInput.value, 
            price_btc: priceInput.value, wallet_address: walletInput.value, content: htmlContent, 
            cover_url: coverUrl, shape: document.getElementById('input-shape').value,
            glow_class: document.getElementById('input-glow').value, hex_color: document.getElementById('input-hex').value
        };
        await supabase.from('manuscripts').insert([payload]);
        document.getElementById('term-text').innerHTML = `> SUCCESS. CODEX BOUND.<br><span style="color:#0f0;">ARTIFACT IS NOW LIVE IN ALEXANDRIA.</span>`;
    };
  }

  if (!mounted) return <div style={{background: '#050508', width: '100vw', height: '100dvh'}}></div>;

  return (
    <>
      <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet" />
      <Script src="https://cdn.quilljs.com/1.3.6/quill.min.js" strategy="afterInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js" strategy="afterInteractive" />

      <style>{`
        .forge-wrapper { --bg-obsidian: #050508; --panel-bg: rgba(12, 12, 18, 0.95); --neon-cyan: #00f2ff; --neon-magenta: #fe53bb; --neon-gold: #FFD700; background-color: var(--bg-obsidian); color: #fff; display: flex; flex-direction: column; min-height: 100dvh; overflow-y: auto; font-family: var(--font-rajdhani), sans-serif; }
        .forge-wrapper::before { content: ""; position: fixed; inset: 0; background-image: linear-gradient(rgba(8, 247, 254, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(8, 247, 254, 0.03) 1px, transparent 1px); background-size: 40px 40px; z-index: -1; pointer-events: none; }
        header { background: rgba(5, 5, 8, 0.95); border-bottom: 1px solid rgba(8, 247, 254, 0.3); padding: 15px 25px; display: flex; justify-content: space-between; align-items: center; z-index: 100; }
        .logo { font-family: var(--font-orbitron), sans-serif; font-size: 1.5rem; color: var(--neon-cyan); text-transform: uppercase; letter-spacing: 2px; }
        .doc-title-input { background: transparent; border: none; border-bottom: 1px dashed #444; color: #fff; font-family: var(--font-orbitron), sans-serif; font-size: 1.2rem; text-align: center; width: 300px; outline:none; }
        .status-indicator { font-family: monospace; font-size: 0.8rem; color: #888; }
        .video-hero { position: relative; width: 100%; height: 15vh; min-height: 120px; display: flex; justify-content: center; align-items: center; border-bottom: 1px solid rgba(255, 215, 0, 0.3); overflow: hidden; flex-shrink: 0; }
        .hero-video { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; object-fit: cover; opacity: 0.6; z-index: 2; }
        .workspace { display: flex; flex-grow: 1; overflow: hidden; position: relative; z-index: 10; }
        .sidebar { width: 380px; padding: 1.5rem; background: rgba(12, 12, 18, 0.8); height: 100%; overflow-y: auto; border-right: 1px solid rgba(8, 247, 254, 0.2); }
        .forge-section { background: rgba(5, 5, 8, 0.6); border: 1px solid rgba(8, 247, 254, 0.15); border-radius: 6px; padding: 1.2rem; margin-bottom: 1.5rem; box-shadow: inset 0 0 15px rgba(0,0,0,0.5); }
        .section-title { font-family: var(--font-orbitron), sans-serif; font-size: 0.9rem; color: var(--neon-cyan); margin-bottom: 1rem; border-bottom: 1px solid rgba(8,247,254,0.2); padding-bottom: 5px; }
        .form-group { margin-bottom: 1rem; }
        .form-group label { display: block; font-size: 0.7rem; text-transform: uppercase; color: #888; margin-bottom: 0.4rem; font-family: monospace; }
        .form-group input, .form-group select, .form-group textarea { width: 100%; background: #000; border: 1px solid #333; padding: 0.7rem; color: #fff; border-radius: 4px; font-size: 0.9rem; font-family: inherit; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
        .parser-box { border: 1px dashed var(--neon-cyan); padding: 1.5rem; text-align: center; border-radius: 4px; cursor: pointer; background: rgba(8,247,254,0.05); }
        .cover-preview-box { width: 100%; aspect-ratio: 2/3; border: 1px dashed #444; border-radius: 4px; display: flex; justify-content: center; align-items: center; text-align: center; color: #555; background-size: cover; background-position: center; font-family: monospace; cursor: pointer; }
        .action-btn { background: transparent; border: 1px solid var(--neon-gold); color: var(--neon-gold); padding: 1rem; width: 100%; font-size: 1rem; font-weight: bold; cursor: pointer; font-family: var(--font-orbitron), sans-serif; letter-spacing: 2px; }
        .editor-container { flex-grow: 1; display: flex; flex-direction: column; padding: 1.5rem; }
        .editor-wrapper { background: #0a0a0c; border: 1px solid rgba(8, 247, 254, 0.2); border-radius: 6px; flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; }
        .ql-toolbar.ql-snow { background: #111; border: none !important; border-bottom: 1px solid rgba(8, 247, 254, 0.2) !important; padding: 12px !important; }
        .ql-container.ql-snow { border: none !important; flex-grow: 1; font-family: var(--font-rajdhani), sans-serif; font-size: 1.15rem; color: #fff; background: rgba(0,0,0,0.4); }
        .ql-snow .ql-stroke { stroke: var(--neon-cyan) !important; }
        .ql-snow .ql-fill { fill: var(--neon-cyan) !important; }
        .ql-snow .ql-picker { color: var(--neon-cyan) !important; }
        .floating-action-btn { position: fixed; bottom: 50px; right: 25px; width: 55px; height: 55px; border-radius: 50%; background: var(--bg-obsidian); border: 2px solid var(--neon-cyan); color: var(--neon-cyan); font-size: 1.5rem; cursor: pointer; z-index: 10000; }
        .app-modal { position: fixed; top: 2%; left: 2%; width: 96%; height: 88%; background: #050508; border: 1px solid var(--neon-cyan); z-index: 10001; display: flex; flex-direction: column; }
        .app-modal.hidden { opacity: 0; pointer-events: none; }
        #app-iframe { flex-grow: 1; width: 100%; border: none; background: #000; }
        #terminal-overlay { position: fixed; inset:0; background: rgba(0,0,0,0.95); z-index: 15000; display: none; flex-direction: column; justify-content: center; align-items: center; color: var(--neon-gold); font-family: monospace; }
      `}</style>

      <div className={`forge-wrapper ${orbitron.variable} ${rajdhani.variable}`}>
        <header>
            <div className="logo">Forge</div>
            <input type="text" id="doc-title" className="doc-title-input" placeholder="UNTITLED DRAFT" />
            <div className="status-indicator" id="save-status">AWAITING INPUT</div>
        </header>

        {cloudOffline && (
          <div style={{margin:'12px 24px 0', padding:'12px 16px', border:'1px solid #eab308', background:'rgba(234,179,8,0.08)', color:'#fde68a', fontFamily:'monospace', fontSize:'0.85rem', lineHeight:'1.6'}}>
            Cloud features are offline — this page needs the database connection. Draft saving, cloud sync, and publishing are unavailable until it's set up.
          </div>
        )}

        <div className="video-hero">
            <video src="/assets/publisher-studio/golden-rings.mp4" autoPlay loop muted playsInline className="hero-video"></video>
            <div style={{position:'absolute', inset:0, background:'linear-gradient(to bottom, rgba(5,5,8,0.2) 0%, #050508 100%)', zIndex:3}}></div>
        </div>

        <div className="workspace">
            <div className="sidebar">
              <div className="forge-section">
                  <div className="section-title">1. CORE MATRIX</div>
                  <div className="grid-2">
                    <div className="form-group"><label>Author Alias</label><input type="text" id="input-author" placeholder="Merlin Ambros" /></div>
                    <div className="form-group"><label>List Price (BTC)</label><input type="text" id="input-price" placeholder="₿ 0.00020" /></div>
                  </div>
                  <div className="form-group"><label>Settlement Address</label><input type="text" id="input-wallet" placeholder="bc1qxy..." /></div>
              </div>

              <div className="forge-section">
                  <div className="section-title">2. DATA SLATE PARSER</div>
                  <div className="form-group">
                      <label>Upload .docx or .txt</label>
                      <input type="file" id="file-parser" accept=".txt, .docx" style={{display:'none'}} />
                      <div className="parser-box" onClick={() => document.getElementById('file-parser').click()}>
                          <span id="parser-status" style={{fontFamily:'monospace', color:'var(--neon-cyan)'}}>CLICK TO INJECT RAW FILE</span>
                      </div>
                  </div>
              </div>

              <div className="forge-section">
                  <div className="section-title">3. OMNI-GEOMETRIC ENGINE</div>
                  <div className="form-group">
                      <div className="cover-preview-box" id="cover-preview" onClick={() => document.getElementById('app-modal').classList.remove('hidden')}>
                          <span id="cover-placeholder-text">NO COVER DETECTED<br/><br/>Click to launch<br/>Geometry Engine</span>
                      </div>
                  </div>
                  <div className="grid-2">
                      <div className="form-group">
                          <label>Library Geometry</label>
                          <select id="input-shape">
                              <option value="cube">Cube</option><option value="sphere">Sphere</option>
                              <option value="torus">Torus</option><option value="knot">Torus Knot</option>
                              <option value="icosahedron">Icosahedron</option><option value="cylinder">Cylinder</option>
                          </select>
                      </div>
                      <div className="form-group">
                          <label>Library Aura</label>
                          <select id="input-glow">
                              <option value="glow-blue">Neon Cyan</option><option value="glow-gold">Obsidian Gold</option><option value="glow-neon">Cyber Magenta</option>
                          </select>
                      </div>
                  </div>
                  <div className="form-group">
                      <label>Geometry Hex</label>
                      <input type="color" id="input-hex" defaultValue="#00f2ff" style={{height:'40px', padding:'0.2rem'}} />
                  </div>
              </div>

              <div className="forge-section" style={{borderColor: 'var(--neon-gold)', background: 'rgba(255,215,0,0.05)'}}>
                  <div className="section-title" style={{color: 'var(--neon-gold)'}}>4. THE SYNTHESIZER</div>
                  <button className="action-btn" id="initBtn">MINT TO ALEXANDRIA</button>
              </div>
            </div>

            <div className="editor-container">
                <div className="editor-wrapper">
                    <div id="editor-core">
                      <h1>Chapter 1: Genesis</h1>
                      <p>Begin transmitting your codex here.</p>
                    </div>
                </div>
            </div>
        </div>

        <button className="floating-action-btn" onClick={() => document.getElementById('app-modal').classList.remove('hidden')}>💠</button>

        <div id="app-modal" className="app-modal hidden">
          <div style={{display:'flex', justifyContent:'space-between', padding:'12px 20px', background:'#111', color:'var(--neon-cyan)', fontFamily:'var(--font-orbitron), sans-serif', fontWeight:'bold', borderBottom:'1px solid rgba(8,247,254,0.3)'}}>
            <span>OMNI-GEOMETRIC ENGINE</span>
            <button onClick={() => document.getElementById('app-modal').classList.add('hidden')} style={{background:'none', border:'none', color:'#fe53bb', fontSize:'1.5rem', cursor:'pointer'}}>✖</button>
          </div>
          <iframe id="app-iframe" src="/geometry-engine" style={{flexGrow:1, width:'100%', border:'none', background:'#000'}}></iframe>
        </div>

        <div id="terminal-overlay"><div id="term-text" style={{maxWidth:'600px', textAlign:'left', lineHeight:'1.6'}}></div></div>
        {/* Safari bottom-bar clearance: blank space under the editor shell */}
        <div aria-hidden="true" className="player-clear" />
      </div>
    </>
  );
}


