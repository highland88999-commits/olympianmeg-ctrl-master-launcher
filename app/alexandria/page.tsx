// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import * as THREE from 'three';

export default function Alexandria() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const gridRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let reqId;
    let renderViews = [];
    let masterLibrary = [];
    let filteredLibrary = [];
    let currentPage = 1;
    const booksPerPage = 100;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#08f7fe; text-align:center; padding:50px; font-family:monospace;">UNAUTHORIZED. PLEASE LOG IN AT MASTER HUB.</div>';
        return;
      }
      setMounted(true);
      
      const REPO_NAME = window.location.hostname || 'Unknown-Node';
      supabase.from('central_telemetry').insert([{
          repository_name: REPO_NAME,
          action_type: 'page_load',
          details: { url: window.location.href, timestamp: new Date().toISOString() }
      }]);
    });

    const carousel = document.getElementById('mainCarousel');
    window.scrollToPage = function(pageName) {
        const vw = window.innerWidth;
        if (pageName === 'studio') carousel.scrollTo({ left: 0, behavior: 'smooth' });
        else if (pageName === 'library') carousel.scrollTo({ left: vw, behavior: 'smooth' });
        else if (pageName === 'vault') carousel.scrollTo({ left: vw * 2, behavior: 'smooth' });
    };

    setTimeout(() => { if (carousel) carousel.scrollLeft = window.innerWidth; }, 100);

    async function fetchBooks() {
        const { data, error } = await supabase.from('manuscripts').select('*');
        if (!error && data) {
            masterLibrary = data;
            applyFiltersAndRender();
        }
    }

    function applyFiltersAndRender() {
        const query = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const sortMethod = document.getElementById('sortDropdown')?.value || 'newest';

        filteredLibrary = masterLibrary.filter(b => b.title?.toLowerCase().includes(query) || b.author?.toLowerCase().includes(query));
        filteredLibrary.sort((a, b) => {
            if (sortMethod === 'newest') return new Date(b.created_at) - new Date(a.created_at);
            if (sortMethod === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
            if (sortMethod === 'alpha') return a.title.localeCompare(b.title);
            if (sortMethod === 'author') return a.author.localeCompare(b.author);
            return 0;
        });

        currentPage = 1;
        renderCurrentPage();
    }

    function renderCurrentPage() {
        const startIndex = (currentPage - 1) * booksPerPage;
        const booksToShow = filteredLibrary.slice(startIndex, startIndex + booksPerPage);
        renderLibrary(booksToShow);

        const totalPages = Math.ceil(filteredLibrary.length / booksPerPage) || 1;
        document.getElementById('pageInfo').innerText = `PAGE ${currentPage} OF ${totalPages}`;
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage >= totalPages;
        document.getElementById('pagination-controls').style.display = totalPages > 1 ? 'flex' : 'none';
    }

    document.getElementById('prevPage')?.addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderCurrentPage(); }});
    document.getElementById('nextPage')?.addEventListener('click', () => { const maxP = Math.ceil(filteredLibrary.length / booksPerPage); if(currentPage < maxP) { currentPage++; renderCurrentPage(); }});
    document.getElementById('searchInput')?.addEventListener('input', applyFiltersAndRender);
    document.getElementById('sortDropdown')?.addEventListener('change', applyFiltersAndRender);

    function getGeometry(type) {
        switch(type) {
            case 'torus': return new THREE.TorusGeometry(1.0, 0.4, 32, 64);
            case 'cylinder': return new THREE.CylinderGeometry(0.9, 0.9, 2.0, 32, 32);
            case 'cone': return new THREE.ConeGeometry(1.1, 2.0, 32, 32);
            case 'cube': return new THREE.BoxGeometry(1.4, 1.4, 1.4, 16, 16, 16);
            case 'icosahedron': return new THREE.IcosahedronGeometry(1.2, 2);
            case 'plane': return new THREE.PlaneGeometry(2.0, 3.0, 32, 32);
            case 'knot': return new THREE.TorusKnotGeometry(0.7, 0.25, 100, 16);
            default: return new THREE.SphereGeometry(1.2, 32, 32);
        }
    }

    function renderLibrary(books) {
      if (!gridRef.current) return;
      gridRef.current.innerHTML = ''; renderViews = [];
      if (books.length === 0) { gridRef.current.innerHTML = '<div class="no-results" style="grid-column:1/-1;text-align:center;padding:4rem;color:#fe53bb;font-family:Orbitron;letter-spacing:2px;">NO CODEX DATA LOCATED IN ARCHIVE.</div>'; return; }

      books.forEach(book => {
        const article = document.createElement('article'); 
        article.className = 'book-card';
        article.style.cssText = 'background:rgba(12,12,18,0.85);border:1px solid rgba(8,247,254,0.15);border-radius:8px;padding:1.5rem;display:flex;flex-direction:column;backdrop-filter:blur(5px);transition:all 0.3s;';
        
        const coverId = `cover-${book.id}`;
        const isFree = !book.price_btc || book.price_btc === "0" || book.price_btc.toLowerCase().includes("free");
        const displayPrice = isFree ? "PUBLIC DOMAIN" : book.price_btc;
        const targetUrl = `/alexandria/artifact?id=${book.id}`;

        article.innerHTML = `
          <div style="width:100%;aspect-ratio:2/3;background:#000;border-radius:4px;margin-bottom:1.5rem;cursor:pointer;position:relative;" class="${book.glow_class || 'glow-blue'}" id="${coverId}" onclick="window.open('${targetUrl}', '_blank')"></div>
          <div style="flex:1;display:flex;flex-direction:column;text-align:center;">
            <h2 style="font-family:Orbitron;font-size:1.1rem;color:#f2f2f2;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem;">${book.title}</h2>
            <div style="font-family:monospace;font-size:0.95rem;color:#888;margin-bottom:1.5rem;">${book.author}</div>
            <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #333;padding-top:1rem;">
              <span style="font-family:monospace;color:#f7931a;font-weight:bold;">${displayPrice}</span>
              <button style="background:transparent;border:1px solid ${book.hex_color||'#08f7fe'};color:${book.hex_color||'#08f7fe'};padding:0.5rem 1rem;border-radius:4px;cursor:pointer;font-family:Orbitron;font-weight:bold;font-size:0.8rem;" onclick="window.open('${targetUrl}', '_blank')">${isFree ? "ACCESS NODE" : "ACQUIRE"}</button>
            </div>
          </div>
        `;
        gridRef.current.appendChild(article);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0); dirLight.position.set(2, 3, 4); scene.add(dirLight);

        const material = new THREE.MeshStandardMaterial({ color: book.hex_color || '#08f7fe', metalness: 0.85, roughness: 0.15, side: THREE.DoubleSide });
        const geom = getGeometry(book.shape);
        const mesh = new THREE.Mesh(geom, material);
        const edges = new THREE.EdgesGeometry(geom);
        mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })));
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        scene.add(mesh);

        const targetElement = document.getElementById(coverId);
        const view = { scene, mesh, targetElement, isHovered: false, baseScale: 1.0, targetScale: 1.0 };
        targetElement.addEventListener('mouseenter', () => view.isHovered = true);
        targetElement.addEventListener('mouseleave', () => view.isHovered = false);
        renderViews.push(view);
      });
    }

    if (canvasRef.current) {
        const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.z = 4.5;

        function animate() {
            reqId = requestAnimationFrame(animate);
            const width = window.innerWidth, height = window.innerHeight;
            if (canvasRef.current.width !== width || canvasRef.current.height !== height) renderer.setSize(width, height, false);
            renderer.setClearColor(0x000000, 0); renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);

            const pr = renderer.getPixelRatio();
            renderViews.forEach(view => {
                const rect = view.targetElement.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) return; 
                const rw = rect.width * pr, rh = rect.height * pr, rl = rect.left * pr, rb = (height - rect.bottom) * pr;
                renderer.setViewport(rl, rb, rw, rh); renderer.setScissor(rl, rb, rw, rh);
                camera.aspect = rw / rh; camera.updateProjectionMatrix();

                if (view.isHovered) { view.mesh.rotation.y += 0.04; view.mesh.rotation.x += 0.02; view.targetScale = 1.15; } 
                else { view.mesh.rotation.y += 0.005; view.mesh.rotation.x += 0.002; view.targetScale = 1.0; }
                view.baseScale += (view.targetScale - view.baseScale) * 0.1;
                view.mesh.scale.setScalar(view.baseScale);
                renderer.render(view.scene, camera);
            });
        }
        animate();
    }
    fetchBooks();

    return () => cancelAnimationFrame(reqId);
  }, [router]);

  if (!mounted) return <div style={{background: '#050508', width: '100vw', height: '100vh'}}></div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Rajdhani:wght@400;600&display=swap');
        .alexandria-wrapper { --bg-obsidian: #050508; --neon-cyan: #08f7fe; --neon-magenta: #fe53bb; --neon-gold: #FFD700; background-color: var(--bg-obsidian); color: #f2f2f2; width: 100vw; height: 100vh; overflow: hidden; font-family: 'Rajdhani', sans-serif; }
        .alexandria-wrapper::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: linear-gradient(rgba(8, 247, 254, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(8, 247, 254, 0.05) 1px, transparent 1px); background-size: 30px 30px; z-index: -1; pointer-events: none; }
        #webgl-canvas { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1; pointer-events: none; }
        .carousel-container { display: flex; width: 100vw; height: 100vh; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; position: relative; z-index: 10; }
        .carousel-container::-webkit-scrollbar { display: none; }
        .carousel-page { min-width: 100vw; height: 100vh; scroll-snap-align: start; scroll-snap-stop: always; display: flex; flex-direction: column; align-items: center; overflow-y: auto; overflow-x: hidden; position: relative; }
        #page-studio { background: rgba(5, 5, 8, 0.95); border-right: 2px solid var(--neon-magenta); }
        #page-vault { background: rgba(5, 5, 8, 0.95); border-left: 2px solid var(--neon-cyan); }
        .hologram-wrapper { width: 100%; height: 100%; display: flex; flex-direction: column; position: relative; background: var(--bg-obsidian); }
        .hologram-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 5%; background: rgba(12, 12, 18, 0.9); border-bottom: 1px solid rgba(8, 247, 254, 0.2); font-family: 'Orbitron', sans-serif; font-size: clamp(0.7rem, 2vw, 0.9rem); letter-spacing: 2px; z-index: 20; }
        .hologram-frame { flex-grow: 1; width: 100%; border: none; background: var(--bg-obsidian); position: relative; z-index: 2; }
        header { position: sticky; top: 0; z-index: 100; width: 100%; background: rgba(5, 5, 8, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(8, 247, 254, 0.1); padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 5px 25px rgba(8, 247, 254, 0.05); gap: 15px; flex-wrap: wrap; }
        .logo { font-family: 'Orbitron', sans-serif; font-size: clamp(1.4rem, 4vw, 1.8rem); font-weight: bold; letter-spacing: 0.1em; color: var(--neon-cyan); text-transform: uppercase; text-shadow: 0 0 10px rgba(8, 247, 254, 0.4); }
        .search-input { flex: 1; min-width: 200px; padding: 0.75rem 1rem; background: #0a0a0c; border: 1px solid #333; border-radius: 4px; color: var(--neon-cyan); font-family: monospace; }
        .sort-select { background: #0a0a0c; border: 1px solid #333; color: var(--neon-cyan); padding: 0.75rem; border-radius: 4px; font-family: 'Orbitron', sans-serif; }
        .nav-btn { background: transparent; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 0.5rem 1rem; border-radius: 4px; font-family: 'Orbitron', sans-serif; font-weight: bold; cursor: pointer; transition: 0.3s; font-size: 0.8rem; }
        .nav-btn:hover { background: var(--neon-cyan); color: #000; box-shadow: 0 0 15px rgba(8, 247, 254, 0.4); }
        .video-hero-section { position: relative; width: 100%; padding: 3rem 5% 1rem 5%; display: flex; justify-content: center; align-items: center; z-index: 10; margin-top: 1rem; }
        .hero-video { position: relative; z-index: 2; width: 100%; max-width: 700px; aspect-ratio: 16/9; border: 1px solid rgba(255, 140, 0, 0.3); border-radius: 8px; box-shadow: 0 0 40px rgba(255, 69, 0, 0.25); background: #000; object-fit: cover; }
        .hero-text-section { text-align: center; padding: 2rem 5% 3rem 5%; z-index: 10; position: relative; }
        .hero-text-section h1 { font-family: 'Orbitron', sans-serif; font-size: clamp(1.8rem, 5vw, 3.2rem); color: var(--neon-gold); text-shadow: 0 0 15px rgba(255, 215, 0, 0.4); text-transform: uppercase; margin-bottom: 1.5rem; letter-spacing: 2px; }
        .library-container { position: relative; z-index: 10; padding: 2rem 5% 6rem 5%; max-width: 1400px; width: 100%; flex-grow: 1; display: flex; flex-direction: column; align-items: center; border-top: 1px solid rgba(8, 247, 254, 0.2); background: rgba(5,5,8,0.6); backdrop-filter: blur(5px); }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2.5rem; width: 100%; padding-top: 2rem;}
        .global-footer { position: fixed; bottom: 0; left: 0; width: 100vw; background: rgba(5, 5, 8, 0.95); border-top: 1px solid rgba(8, 247, 254, 0.2); padding: 12px 5%; display: flex; justify-content: center; align-items: center; gap: 20px; font-size: 0.8rem; color: #888; z-index: 40000; font-family: monospace; }
        .swipe-hint { position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%); font-family: monospace; font-size: 0.75rem; color: #888; pointer-events: none; z-index: 30000; background: rgba(0,0,0,0.8); padding: 6px 20px; border-radius: 20px; border: 1px solid #333; }
        .pagination { display: flex; gap: 15px; padding: 3rem 0; align-items: center; }
        .page-btn { background: transparent; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); padding: 0.5rem 1.2rem; border-radius: 4px; cursor: pointer; font-family: 'Orbitron', sans-serif; font-weight: bold; }
        .page-btn:hover:not(:disabled) { background: var(--neon-cyan); color: #000; }
        .page-btn:disabled { border-color: #333; color: #555; cursor: not-allowed; }
      `}</style>

      <div className="alexandria-wrapper">
        <canvas id="webgl-canvas" ref={canvasRef}></canvas>
        <div className="carousel-container" id="mainCarousel">
          
          <div className="carousel-page" id="page-studio">
            <div className="hologram-wrapper">
              <div className="hologram-header" style={{color: 'var(--neon-magenta)'}}>
                <span>⚡ PUBLISHER STUDIO PORTAL</span>
                <button className="nav-btn" onClick={() => window.scrollToPage('library')} style={{borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)'}}>RETURN TO LIBRARY ➔</button>
              </div>
              <iframe id="iframe-studio" className="hologram-frame" src="/publisher-studio"></iframe>
            </div>
          </div>

          <div className="carousel-page" id="page-library">
            <header>
              <div className="logo">Alexandria</div>
              <div style={{display:'flex', gap:'10px', flex:'1', maxWidth:'700px'}}>
                <input type="text" id="searchInput" className="search-input" placeholder="Query archive matrix..." />
                <select id="sortDropdown" className="sort-select">
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="alpha">Alphabetical</option>
                </select>
              </div>
              <div style={{display:'flex', gap:'10px'}}>
                <button className="nav-btn" style={{borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)'}} onClick={() => window.scrollToPage('studio')}>⮜ STUDIO</button>
                <button className="nav-btn" onClick={() => router.push('/')} style={{borderColor: '#ff3366', color: '#ff3366'}}>EXIT HUB</button>
                <button className="nav-btn" onClick={() => window.scrollToPage('vault')}>VAULT ⮞</button>
              </div>
            </header>

            <div className="video-hero-section">
              <video className="hero-video" autoPlay loop muted playsInline>
                <source src="https://file.garden/alXjUY_coXedLaNA/gemini_generated_video_B1DA76E4.mp4" type="video/mp4" />
              </video>
            </div>

            <section className="hero-text-section">
              <h1>THE INDESTRUCTIBLE<br/>ARCHIVE</h1>
              <p style={{fontFamily:'monospace', color:'#ccc'}}>Discover bound geometries generated from the Nexus Codex. Direct, decentralized distribution.</p>
            </section>

            <main className="library-container">
              <div className="grid" id="libraryGrid"></div>
              <div className="pagination" id="pagination-controls" style={{display:'none'}}>
                <button id="prevPage" className="page-btn">◀ PREV</button>
                <span id="pageInfo" style={{fontFamily:'monospace', color:'var(--neon-gold)'}}>PAGE 1 OF 1</span>
                <button id="nextPage" className="page-btn">NEXT ▶</button>
              </div>
            </main>
          </div>

          <div className="carousel-page" id="page-vault">
            <div className="hologram-wrapper">
              <div className="hologram-header" style={{color: 'var(--neon-cyan)'}}>
                <button className="nav-btn" onClick={() => window.scrollToPage('library')}>⮜ RETURN TO LIBRARY</button>
                <span>⚡ READER VAULT PORTAL</span>
              </div>
              <iframe id="iframe-vault" className="hologram-frame" src="/vault"></iframe>
            </div>
          </div>
        </div>

        <div className="global-footer">
          <span>HARDCOPY PUBLISHER CONTRACTS WELCOME</span>
        </div>
        <div className="swipe-hint">⮜ SWIPE LEFT / RIGHT FOR NODES ⮞</div>
      </div>
    </>
  );
}


