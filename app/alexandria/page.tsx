// @ts-nocheck
/* eslint-disable */
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import * as THREE from 'three';
import { Orbitron, Rajdhani } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['400', '700'] });
const rajdhani = Rajdhani({ subsets: ['latin'], weight: ['400', '600'] });

/** Escape user-controlled strings before injecting into HTML. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow real hex colors through to inline styles. */
function safeHex(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : fallback;
}

export default function Alexandria() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const gridRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [cloudOffline, setCloudOffline] = useState(false);

  // Auth gate: runs on mount, before any library DOM exists.
  useEffect(() => {
    let sessionPromise;
    try {
      sessionPromise = supabase.auth.getSession(); // throws when Supabase env vars are missing
    } catch {
      setCloudOffline(true);
      return;
    }
    sessionPromise.then(({ data: { session } }) => {
      if (!session) {
        if (window.top === window.self) router.push('/');
        else document.body.innerHTML = '<div style="color:#00f2ff; text-align:center; padding:50px; font-family:monospace;">Please log in at the Master Hub to continue.</div>';
        return;
      }
      setMounted(true);
    });
  }, [router]);

  // Main setup: runs once the authenticated library DOM is committed,
  // so every getElementById / ref lookup below is guaranteed to exist.
  useEffect(() => {
    if (!mounted) return;
    let reqId;
    let renderer = null;
    const renderViews = [];
    const disposables = [];
    let masterLibrary = [];
    let filteredLibrary = [];
    let currentPage = 1;
    const booksPerPage = 100;
    const cleanups = [];
    const on = (el, evt, fn, opts) => {
      if (!el) return;
      el.addEventListener(evt, fn, opts);
      cleanups.push(() => el.removeEventListener(evt, fn, opts));
    };

    const carousel = document.getElementById('mainCarousel');
    const swipeHint = document.getElementById('swipeHint');
    let hintDismissed = false;

    window.scrollToPage = function(pageName) {
      if (!carousel) return;
      const vw = window.innerWidth;
      if (pageName === 'studio') carousel.scrollTo({ left: 0, behavior: 'smooth' });
      else if (pageName === 'library') carousel.scrollTo({ left: vw, behavior: 'smooth' });
      else if (pageName === 'vault') carousel.scrollTo({ left: vw * 2, behavior: 'smooth' });
    };

    // Start on the library pane.
    const jumpTimer = setTimeout(() => { if (carousel) carousel.scrollLeft = window.innerWidth; }, 100);

    // Dismiss the swipe hint once the user navigates away from the library.
    on(carousel, 'scroll', () => {
      if (hintDismissed || !carousel || !swipeHint) return;
      if (Math.abs(carousel.scrollLeft - window.innerWidth) > 48) {
        hintDismissed = true;
        swipeHint.classList.add('dismissed');
      }
    }, { passive: true });

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

      filteredLibrary = masterLibrary.filter(b =>
        b.title?.toLowerCase().includes(query) || b.author?.toLowerCase().includes(query)
      );
      filteredLibrary.sort((a, b) => {
        if (sortMethod === 'newest') return new Date(b.created_at) - new Date(a.created_at);
        if (sortMethod === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        if (sortMethod === 'alpha') return String(a.title).localeCompare(String(b.title));
        if (sortMethod === 'author') return String(a.author).localeCompare(String(b.author));
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
      const pageInfo = document.getElementById('pageInfo');
      const prevBtn = document.getElementById('prevPage');
      const nextBtn = document.getElementById('nextPage');
      const controls = document.getElementById('pagination-controls');
      if (pageInfo) pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
      if (prevBtn) prevBtn.disabled = currentPage === 1;
      if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
      if (controls) controls.style.display = totalPages > 1 ? 'flex' : 'none';
    }

    on(document.getElementById('prevPage'), 'click', () => { if (currentPage > 1) { currentPage--; renderCurrentPage(); } });
    on(document.getElementById('nextPage'), 'click', () => {
      const maxP = Math.ceil(filteredLibrary.length / booksPerPage);
      if (currentPage < maxP) { currentPage++; renderCurrentPage(); }
    });
    on(document.getElementById('searchInput'), 'input', applyFiltersAndRender);
    on(document.getElementById('sortDropdown'), 'change', applyFiltersAndRender);

    // Open a book when its cover or button is activated (click or keyboard).
    const openBook = (el) => {
      const url = el && el.getAttribute('data-url');
      if (url) window.open(url, '_blank', 'noopener');
    };
    on(gridRef.current, 'click', (e) => openBook(e.target.closest('[data-url]')));
    on(gridRef.current, 'keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('[data-url]');
      if (target) { e.preventDefault(); openBook(target); }
    });

    function disposeLibrary() {
      disposables.forEach(d => {
        try { d.geometry && d.geometry.dispose(); } catch (e) {}
        try { d.edges && d.edges.dispose(); } catch (e) {}
        try { d.material && d.material.dispose(); } catch (e) {}
      });
      disposables.length = 0;
      renderViews.length = 0;
    }

    // Lightweight geometries: 100 books per page must stay smooth on phones.
    function getGeometry(type) {
      switch (type) {
        case 'torus': return new THREE.TorusGeometry(1.0, 0.4, 20, 40);
        case 'cylinder': return new THREE.CylinderGeometry(0.9, 0.9, 2.0, 20, 1);
        case 'cone': return new THREE.ConeGeometry(1.1, 2.0, 20, 1);
        case 'cube': return new THREE.BoxGeometry(1.4, 1.4, 1.4, 4, 4, 4);
        case 'icosahedron': return new THREE.IcosahedronGeometry(1.2, 1);
        case 'plane': return new THREE.PlaneGeometry(2.0, 3.0, 8, 8);
        case 'knot': return new THREE.TorusKnotGeometry(0.7, 0.25, 48, 10);
        default: return new THREE.SphereGeometry(1.2, 24, 18);
      }
    }

    function renderLibrary(books) {
      if (!gridRef.current) return;
      disposeLibrary();
      gridRef.current.innerHTML = '';
      if (books.length === 0) {
        gridRef.current.innerHTML = `<div class="no-results ${orbitron.className}">No books found. Try a different search.</div>`;
        return;
      }

      books.forEach(book => {
        const safeId = encodeURIComponent(String(book.id ?? ''));
        const coverId = `cover-${safeId}`;
        const title = escapeHtml(book.title || 'Untitled');
        const author = escapeHtml(book.author || 'Unknown author');
        const hex = safeHex(book.hex_color, '#00f2ff');
        const glowClass = escapeHtml(/^[a-z0-9-]+$/i.test(book.glow_class || '') ? book.glow_class : 'glow-blue');
        const priceRaw = String(book.price_btc ?? '');
        const isFree = !priceRaw || priceRaw === '0' || priceRaw.toLowerCase().includes('free');
        const displayPrice = escapeHtml(isFree ? 'Free' : priceRaw);
        const targetUrl = `/alexandria/artifact?id=${safeId}`;

        const article = document.createElement('article');
        article.className = 'book-card';
        article.innerHTML = `
          <div class="book-cover ${glowClass}" id="${coverId}" data-url="${targetUrl}" role="button" tabindex="0" aria-label="Open ${title} by ${author}"></div>
          <div class="book-body">
            <h2 class="book-title ${orbitron.className}">${title}</h2>
            <div class="book-author">${author}</div>
            <div class="book-foot">
              <span class="book-price">${displayPrice}</span>
              <button class="book-btn ${orbitron.className}" data-url="${targetUrl}" style="border-color:${hex};color:${hex};">${isFree ? 'Read' : 'Buy'}</button>
            </div>
          </div>
        `;
        gridRef.current.appendChild(article);

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
        dirLight.position.set(2, 3, 4);
        scene.add(dirLight);

        const material = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.85, roughness: 0.2, side: THREE.DoubleSide });
        const geom = getGeometry(book.shape);
        const mesh = new THREE.Mesh(geom, material);
        const edges = new THREE.EdgesGeometry(geom);
        mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })));
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        scene.add(mesh);
        disposables.push({ geometry: geom, edges, material });

        const targetElement = document.getElementById(coverId);
        const view = { scene, mesh, targetElement, isHovered: false, baseScale: 1.0, targetScale: 1.0 };
        if (targetElement) {
          on(targetElement, 'mouseenter', () => { view.isHovered = true; });
          on(targetElement, 'mouseleave', () => { view.isHovered = false; });
        }
        renderViews.push(view);
      });
    }

    if (canvasRef.current) {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setClearColor(0x000000, 0);
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 4.5;

      function animate() {
        reqId = requestAnimationFrame(animate);
        const width = window.innerWidth, height = window.innerHeight;
        if (canvasRef.current.width !== width || canvasRef.current.height !== height) renderer.setSize(width, height, false);
        renderer.setClearColor(0x000000, 0);
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setScissorTest(true);

        const pr = renderer.getPixelRatio();
        renderViews.forEach(view => {
          if (!view.targetElement) return;
          const rect = view.targetElement.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) return;
          const rw = rect.width * pr, rh = rect.height * pr, rl = rect.left * pr, rb = (height - rect.bottom) * pr;
          renderer.setViewport(rl, rb, rw, rh);
          renderer.setScissor(rl, rb, rw, rh);
          camera.aspect = rw / rh;
          camera.updateProjectionMatrix();

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

    return () => {
      clearTimeout(jumpTimer);
      cancelAnimationFrame(reqId);
      cleanups.forEach(fn => { try { fn(); } catch (e) {} });
      disposeLibrary();
      if (renderer) { try { renderer.dispose(); } catch (e) {} }
      delete window.scrollToPage;
    };
  }, [mounted, router]);

  if (!mounted) {
    if (cloudOffline) {
      return (
        <div style={{ background: '#050508', width: '100vw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#00f2ff', fontFamily: 'monospace', lineHeight: 1.8 }}>
            Cloud features are offline — the library needs the database connection.
          </p>
        </div>
      );
    }
    return <div style={{ background: '#050508', width: '100vw', height: '100dvh' }}></div>;
  }

  return (
    <>
      <style>{`
        .alexandria-wrapper { --bg-obsidian: #050508; --neon-cyan: #00f2ff; --neon-magenta: #fe53bb; --neon-gold: #FFD700; background-color: var(--bg-obsidian); color: #f2f2f2; width: 100vw; height: 100vh; height: 100dvh; overflow: hidden; }
        .alexandria-wrapper::before { content: ""; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: linear-gradient(rgba(8, 247, 254, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(8, 247, 254, 0.05) 1px, transparent 1px); background-size: 30px 30px; z-index: 0; pointer-events: none; }
        #webgl-canvas { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; height: 100dvh; z-index: 1; pointer-events: none; }

        .carousel-container { display: flex; width: 100vw; height: 100vh; height: 100dvh; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; position: relative; z-index: 10; overscroll-behavior-x: contain; touch-action: pan-x pan-y; }
        .carousel-container::-webkit-scrollbar { display: none; }
        .carousel-page { min-width: 100vw; width: 100vw; height: 100vh; height: 100dvh; scroll-snap-align: start; scroll-snap-stop: always; display: flex; flex-direction: column; align-items: center; overflow-y: auto; overflow-x: hidden; position: relative; -webkit-overflow-scrolling: touch; box-sizing: border-box; padding-bottom: calc(2rem + env(safe-area-inset-bottom)); }
        #page-studio { background: rgba(5, 5, 8, 0.95); border-right: 2px solid var(--neon-magenta); }
        #page-vault { background: rgba(5, 5, 8, 0.95); border-left: 2px solid var(--neon-cyan); }

        .hologram-wrapper { width: 100%; height: 100%; min-height: 0; display: flex; flex-direction: column; position: relative; background: var(--bg-obsidian); }
        .hologram-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 15px 5%; padding-top: calc(15px + env(safe-area-inset-top)); background: rgba(12, 12, 18, 0.9); border-bottom: 1px solid rgba(8, 247, 254, 0.2); font-size: clamp(0.7rem, 2vw, 0.9rem); letter-spacing: 2px; z-index: 20; }
        .hologram-frame { flex: 1 1 auto; min-height: 0; width: 100%; border: none; background: var(--bg-obsidian); position: relative; z-index: 2; }

        header { position: sticky; top: 0; z-index: 100; width: 100%; background: rgba(5, 5, 8, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid rgba(8, 247, 254, 0.1); padding: 1rem 5%; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 5px 25px rgba(8, 247, 254, 0.05); gap: 12px; flex-wrap: wrap; row-gap: 12px; }
        .logo { font-size: clamp(1.4rem, 4vw, 1.8rem); font-weight: bold; letter-spacing: 0.1em; color: var(--neon-cyan); text-transform: uppercase; text-shadow: 0 0 10px rgba(8, 247, 254, 0.4); }
        .search-wrap { display: flex; gap: 10px; flex: 1 1 280px; max-width: 700px; flex-wrap: wrap; }
        .search-input { flex: 1 1 180px; min-width: 0; min-height: 44px; padding: 0.65rem 1rem; background: #0a0a0c; border: 1px solid #333; border-radius: 6px; color: var(--neon-cyan); font-family: monospace; font-size: 16px; }
        .search-input::placeholder { color: #5a6a70; }
        .sort-select { min-height: 44px; background: #0a0a0c; border: 1px solid #333; color: var(--neon-cyan); padding: 0.65rem 0.75rem; border-radius: 6px; font-size: 0.8rem; }
        .nav-group { display: flex; gap: 10px; flex-wrap: wrap; }
        .nav-btn { background: transparent; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); min-height: 44px; padding: 0.65rem 1.1rem; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.25s, color 0.25s, box-shadow 0.25s; font-size: 0.8rem; letter-spacing: 1px; }
        .nav-btn:hover { background: var(--neon-cyan); color: #000; box-shadow: 0 0 15px rgba(8, 247, 254, 0.4); }
        .nav-btn:focus-visible, .page-btn:focus-visible, .book-btn:focus-visible, .search-input:focus-visible, .sort-select:focus-visible, .book-cover:focus-visible { outline: 2px solid var(--neon-cyan); outline-offset: 2px; }

        .video-hero-section { position: relative; width: 100%; padding: clamp(1.5rem, 5vw, 3rem) 5% 1rem 5%; display: flex; justify-content: center; align-items: center; z-index: 10; }
        .hero-video { position: relative; z-index: 2; width: 100%; max-width: 700px; aspect-ratio: 16/9; border: 1px solid rgba(255, 140, 0, 0.3); border-radius: 10px; box-shadow: 0 0 40px rgba(255, 69, 0, 0.25); background: #000; object-fit: cover; }
        .hero-text-section { text-align: center; padding: clamp(1.25rem, 4vw, 2rem) 6% clamp(1.5rem, 5vw, 3rem) 6%; z-index: 10; position: relative; max-width: 800px; }
        .hero-text-section h1 { font-size: clamp(1.8rem, 6vw, 3.2rem); color: var(--neon-gold); text-shadow: 0 0 15px rgba(255, 215, 0, 0.4); text-transform: uppercase; margin: 0 0 1rem 0; letter-spacing: 2px; line-height: 1.15; }
        .hero-text-section p { font-family: monospace; color: #ccc; font-size: clamp(0.9rem, 2.5vw, 1rem); line-height: 1.7; margin: 0; }

        .library-container { position: relative; z-index: 10; padding: clamp(1.5rem, 4vw, 2.5rem) 5% 8rem 5%; max-width: 1400px; width: 100%; flex-grow: 1; display: flex; flex-direction: column; align-items: center; border-top: 1px solid rgba(8, 247, 254, 0.2); background: rgba(5,5,8,0.6); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 2rem; width: 100%; padding-top: 1.5rem; }
        .no-results { grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--neon-magenta); letter-spacing: 2px; font-size: 1rem; line-height: 1.8; }

        .book-card { background: rgba(12,12,18,0.85); border: 1px solid rgba(8,247,254,0.15); border-radius: 10px; padding: 1.25rem; display: flex; flex-direction: column; backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); transition: border-color 0.3s, transform 0.3s; }
        .book-card:hover { border-color: rgba(8,247,254,0.45); transform: translateY(-3px); }
        .book-cover { width: 100%; aspect-ratio: 2/3; background: #000; border-radius: 6px; margin-bottom: 1.25rem; cursor: pointer; position: relative; }
        .book-cover.glow-blue { box-shadow: 0 0 24px rgba(8, 247, 254, 0.25); }
        .book-cover.glow-pink { box-shadow: 0 0 24px rgba(254, 83, 187, 0.25); }
        .book-cover.glow-gold { box-shadow: 0 0 24px rgba(255, 215, 0, 0.25); }
        .book-body { flex: 1; display: flex; flex-direction: column; text-align: center; }
        .book-title { font-size: 1.05rem; color: #f2f2f2; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 0.5rem 0; line-height: 1.4; }
        .book-author { font-family: monospace; font-size: 0.95rem; color: #999; margin-bottom: 1.25rem; line-height: 1.5; }
        .book-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid #333; padding-top: 1rem; }
        .book-price { font-family: monospace; color: #f7931a; font-weight: bold; font-size: 0.95rem; }
        .book-btn { background: transparent; border: 1px solid; min-height: 44px; padding: 0.6rem 1.25rem; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.8rem; letter-spacing: 1px; transition: transform 0.2s; }
        .book-btn:hover { transform: scale(1.05); }

        .global-footer { position: fixed; bottom: 0; left: 0; width: 100vw; background: rgba(5, 5, 8, 0.95); border-top: 1px solid rgba(8, 247, 254, 0.2); padding: 12px 5% calc(12px + env(safe-area-inset-bottom)) 5%; display: flex; justify-content: center; align-items: center; gap: 20px; font-size: 0.8rem; color: #888; z-index: 40000; font-family: monospace; text-align: center; }
        .swipe-hint { position: fixed; bottom: calc(70px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); font-family: monospace; font-size: 0.75rem; color: #aaa; pointer-events: none; z-index: 30000; background: rgba(0,0,0,0.85); padding: 8px 20px; border-radius: 20px; border: 1px solid #333; white-space: nowrap; transition: opacity 0.5s; }
        .swipe-hint.dismissed { opacity: 0; }
        .pagination { display: flex; gap: 15px; padding: 2.5rem 0 1rem 0; align-items: center; flex-wrap: wrap; justify-content: center; }
        .page-btn { background: transparent; border: 1px solid var(--neon-cyan); color: var(--neon-cyan); min-height: 44px; padding: 0.65rem 1.4rem; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.85rem; letter-spacing: 1px; }
        .page-btn:hover:not(:disabled) { background: var(--neon-cyan); color: #000; }
        .page-btn:disabled { border-color: #333; color: #555; cursor: not-allowed; }

        @media (max-width: 640px) {
          header { padding: 0.75rem 4%; }
          .grid { grid-template-columns: repeat(2, 1fr); gap: 1rem; }
          .book-card { padding: 0.9rem; }
          .book-title { font-size: 0.85rem; }
          .book-author { font-size: 0.8rem; margin-bottom: 0.9rem; }
          .book-foot { flex-direction: column; align-items: stretch; text-align: center; }
          .book-btn { width: 100%; }
          .hologram-header { font-size: 0.7rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .carousel-container { scroll-behavior: auto; }
          .book-card, .book-btn, .nav-btn { transition: none; }
        }
      `}</style>

      <div className={`alexandria-wrapper ${rajdhani.className}`}>
        <canvas id="webgl-canvas" ref={canvasRef} aria-hidden="true"></canvas>
        <div className="carousel-container" id="mainCarousel">

          <div className="carousel-page" id="page-studio" aria-label="Publisher studio">
            <div className="hologram-wrapper">
              <div className={`hologram-header ${orbitron.className}`} style={{ color: 'var(--neon-magenta)' }}>
                <span>Publisher Studio</span>
                <button className={`nav-btn ${orbitron.className}`} onClick={() => window.scrollToPage('library')} style={{ borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }}>Back to Library →</button>
              </div>
              <iframe id="iframe-studio" className="hologram-frame" src="/publisher-studio" title="Publisher Studio"></iframe>
            </div>
          </div>

          <div className="carousel-page" id="page-library" aria-label="Library">
            <header>
              <div className={`logo ${orbitron.className}`}>Alexandria</div>
              <div className="search-wrap">
                <input type="search" id="searchInput" className="search-input" placeholder="Search by title or author…" aria-label="Search books" />
                <select id="sortDropdown" className={`sort-select ${orbitron.className}`} aria-label="Sort books">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="alpha">Title A–Z</option>
                  <option value="author">Author A–Z</option>
                </select>
              </div>
              <nav className="nav-group" aria-label="Alexandria sections">
                <button className={`nav-btn ${orbitron.className}`} style={{ borderColor: 'var(--neon-magenta)', color: 'var(--neon-magenta)' }} onClick={() => window.scrollToPage('studio')}>← Studio</button>
                <button className={`nav-btn ${orbitron.className}`} onClick={() => window.scrollToPage('vault')}>Vault →</button>
                <button className={`nav-btn ${orbitron.className}`} onClick={() => router.push('/')} style={{ borderColor: '#ff3366', color: '#ff3366' }}>Home</button>
              </nav>
            </header>

            <div className="video-hero-section">
              <video className="hero-video" autoPlay loop muted playsInline preload="metadata" aria-label="Alexandria archive ambience">
                <source src="/assets/alexandria/neon-tower.mp4" type="video/mp4" />
              </video>
            </div>

            <section className="hero-text-section">
              <h1 className={orbitron.className}>The Indestructible<br />Archive</h1>
              <p>Bound geometries generated from the Nexus Codex. Direct, decentralized distribution — every book a world of its own.</p>
            </section>

            <main className="library-container">
              <div className="grid" id="libraryGrid" ref={gridRef}></div>
              <div className="pagination" id="pagination-controls" style={{ display: 'none' }}>
                <button id="prevPage" className={`page-btn ${orbitron.className}`}>← Previous</button>
                <span id="pageInfo" style={{ fontFamily: 'monospace', color: 'var(--neon-gold)' }}>Page 1 of 1</span>
                <button id="nextPage" className={`page-btn ${orbitron.className}`}>Next →</button>
              </div>
            </main>
          </div>

          <div className="carousel-page" id="page-vault" aria-label="Reader vault">
            <div className="hologram-wrapper">
              <div className={`hologram-header ${orbitron.className}`} style={{ color: 'var(--neon-cyan)' }}>
                <button className={`nav-btn ${orbitron.className}`} onClick={() => window.scrollToPage('library')}>← Back to Library</button>
                <span>Reader Vault</span>
              </div>
              <iframe id="iframe-vault" className="hologram-frame" src="/vault" title="Reader Vault"></iframe>
            </div>
          </div>
        </div>

        <div className="global-footer">
          <span>Hardcopy publisher contracts welcome</span>
        </div>
        <div className="swipe-hint" id="swipeHint">← Swipe to explore Studio and Vault →</div>
      </div>
    </>
  );
}
