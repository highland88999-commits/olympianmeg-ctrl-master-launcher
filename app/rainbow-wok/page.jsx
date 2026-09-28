'use client';

/*
 * Rainbow Wok & Grill — Interactive Lounge Terminal.
 * Rebuilt from the single-file original as a self-contained module.
 * The original loaded three.js, postprocessing addons, and es-module-shims
 * from unpkg.com; this build replaces the 3D wood-slat background with
 * pure CSS gradients (no external requests at all).
 * The order tray is a local staging buffer saved on this device only;
 * tapping the dispatch button keeps the tray on this device — no network
 * calls, nothing is sent to any POS or kitchen system.
 */

import { useEffect, useMemo, useState } from 'react';

const TITLE = 'Rainbow Wok & Grill - Interactive Lounge Terminal';
const TRAY_KEY = 'rainbow-wok.tray.v1';

const MENU = {
  apps: [
    { name: 'Thai Bites', desc: 'Crispy chicken & wonton chips tossed thoroughly in sweet spicy Thai glaze variants.', price: 15.0, glyph: '🍢' },
    { name: 'Green Onion Cakes', desc: 'House-made crisp recipe staples served accompanied by signature sweet chili lines.', price: 8.5, glyph: '🥞' },
    { name: 'Baked Potato Spring Rolls', desc: 'Crisp shells packed tight with potato mash mix, cheddar blends, bacon bits, and chives.', price: 11.0, glyph: '🥟' },
    { name: 'Gourmet Wings', desc: '1 full pound of crispy wings tossed completely inside your choice of 18 flavor configurations.', price: 16.0, glyph: '🍗' },
    { name: 'Chicken Satay', desc: '4 seasoned, flame-grilled skewers served alongside our signature dipping sauce setup.', price: 14.0, glyph: '🍢' },
    { name: 'Crab Rangoon', desc: '6 pieces of crisp, hand-wrapped wonton shells stuffed with seasoned cream cheese and real crab meat.', price: 12.0, glyph: '🥟' },
    { name: 'Pork Potstickers', desc: '6 pieces of traditional pan-fried or steamed dumplings accompanied by spicy ginger soy sauce glaze.', price: 13.0, glyph: '🥟' },
    { name: 'Calamari with Aioli', desc: 'Lightly dusted tender local rings flash-fried until golden crisp, served with zesty citrus garlic aioli.', price: 16.0, glyph: '🦑' },
  ],
  grill: [
    { name: 'The Rainbow Beast Burger', desc: 'Two signature 6+ oz prime sirloin beef patties, double smoked bacon, double melted cheese, and house secret sauce.', price: 22.0, glyph: '🍔' },
    { name: 'Teriyaki Chicken Sandwich', desc: 'Flame-broiled chicken breast glazed in ginger teriyaki sauce topped with grilled pineapple rings.', price: 19.0, glyph: '🥪' },
    { name: '8oz Sirloin Steak', desc: 'AAA Alberta premium sirloin beef aged perfectly and charbroiled precisely to your specifications.', price: 32.0, glyph: '🥩' },
    { name: 'Ultimate Clubhouse', desc: 'Classic toasted triple-decker packed tight with grilled chicken breast, shaved ham, crispy bacon, lettuce, and tomato.', price: 18.0, glyph: '🥪' },
    { name: 'BBQ Pork Ribs', desc: 'Full rack of fall-off-the-bone tender baby back ribs basted continuously in honey apple cider BBQ sauce.', price: 38.0, glyph: '🍖' },
    { name: 'Mega Mac Poutine', desc: 'Two smashed beef patties, house special sauce, crisp lettuce, dynamic cheese curds, and special gravy over fries.', price: 17.0, glyph: '🍟' },
    { name: 'Monte Cristo', desc: 'Golden-fried pan sandwich tracking layers of sweet ham, roasted chicken breast, and melted cheese with berry jam.', price: 18.0, glyph: '🥪' },
  ],
  wok: [
    { name: 'The Rainbow Bowl', desc: 'Wok-fried shrimp, chicken, and BBQ pork tossed with fresh seasonal vegetables over soft chow mein noodles.', price: 19.5, glyph: '🍜' },
    { name: 'Spicy Shanghai Bowls', desc: 'Thick wheat noodles stir-fried under intense high heat with peppers, mushrooms, and select protein choices.', price: 18.0, glyph: '🍲' },
    { name: 'Wor Wonton', desc: 'Savory house broth packed with fresh vibrant vegetables, shrimp, chicken, sweet BBQ pork, and pork wontons.', price: 19.5, glyph: '🥣' },
    { name: 'Curry Chicken Bowl', desc: 'Indian-style mild yellow curry base containing tender chicken pieces and pan root vegetables served with Naan.', price: 19.0, glyph: '🍛' },
    { name: "General Tso's Chicken", desc: 'Crispy dark meat chunks tossed in sweet, spicy garlic glaze infused with dried chili peppers.', price: 21.0, glyph: '🥡' },
    { name: 'Beef with Broccoli', desc: 'Tender flank steak slivers flash-seared alongside crisp green broccoli crowns in premium oyster sauce context.', price: 23.0, glyph: '🥦' },
    { name: 'Shrimp Fried Rice', desc: 'Wok-fried jasmine rice pearls containing jumbo shrimp, sweet peas, green onions, and farm eggs.', price: 20.0, glyph: '🍚' },
    { name: 'Vegetable Pad Thai', desc: 'Traditional sweet-tangy tamarind rice noodle toss mixed with pressed tofu, bean sprouts, and crushed peanuts.', price: 19.0, glyph: '🥢' },
  ],
  lounge: [
    { name: 'Bow-Berry Fizz', desc: '1.5 oz Bow Berry Blend, 1 oz lemon juice, 1 oz simple syrup, topped off with 7Up over crushed ice.', price: 9.5, glyph: '🍹' },
    { name: 'Very Berry Mule', desc: '1 oz Bow-Berry Blend, 1/2 oz Premium Vodka, fresh splash of lime juice, topped off with crisp ginger beer.', price: 10.0, glyph: '🍸' },
    { name: 'Swedish Berries', desc: '1.5 oz Bow-Berry Blend, 1/2 oz banana liqueur, finished with 7Up and garnished with maraschino cherries.', price: 9.5, glyph: '🍒' },
    { name: 'Peachy Creamy', desc: '1.5 oz Peaches & Cream Blend, roughly 3 oz orange juice, topped with a bright splash of 7Up.', price: 9.5, glyph: '🍑' },
    { name: 'Purple Rain', desc: '1 oz Purple Rain Blend, dynamic splash of fresh lime juice, topped off with sparkling 7Up.', price: 9.5, glyph: '🍇' },
    { name: 'Purple Hurricane', desc: '1 oz grenadine baseline, 1 oz Purple Rain Blend, 1 oz Gin, 1 oz lime juice, filled to the brim with 7Up.', price: 11.0, glyph: '🌪️' },
  ],
};

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'apps', label: 'Apps & Shares' },
  { id: 'grill', label: 'Grill Favourites' },
  { id: 'wok', label: 'Wok Specialties' },
  { id: 'lounge', label: 'Bow Blends' },
  { id: 'hours', label: 'Hours & Location' },
];

const HOURS = [
  ['Monday', '11:00 AM – 10:00 PM'],
  ['Tuesday', '11:00 AM – 10:00 PM'],
  ['Wednesday', '11:00 AM – 10:00 PM'],
  ['Thursday', '11:00 AM – 10:00 PM'],
  ['Friday', '11:00 AM – 11:00 PM'],
  ['Saturday', '11:00 AM – 11:00 PM'],
  ['Sunday', '12:00 PM – 9:00 PM'],
];

const money = (n) => '$' + n.toFixed(2);

const CSS = `
.rw-wrap { min-height: 100vh; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; background:
  linear-gradient(rgba(0,0,0,0.82), rgba(0,0,0,0.88)),
  repeating-linear-gradient(90deg, #3d2516 0px, #3d2516 28px, #23130b 28px, #23130b 56px, #2a170d 56px, #2a170d 84px);
  background-attachment: fixed; user-select: none; display: flex; flex-direction: column; }
.rw-header { background: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.75)), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: auto, 80px 40px, 80px 40px; background-color: #111215; padding: 18px 16px 0; position: sticky; top: 0; z-index: 10; border-bottom: 2px solid #e68a00; }
.rw-brand h1 { margin: 0; color: #fff; font-size: clamp(1.6rem, 5vw, 2.2rem); text-shadow: 0 0 18px rgba(255,170,68,0.55); letter-spacing: 1px; }
.rw-brand span { color: #ffaa44; font-size: 0.95rem; letter-spacing: 3px; }
.rw-nav { display: flex; gap: 6px; overflow-x: auto; padding: 14px 0 12px; -webkit-overflow-scrolling: touch; }
.rw-navbtn { background: transparent; border: 1px solid rgba(255,170,68,0.5); color: #ffd9a0; font-family: inherit; font-size: 0.85rem; padding: 12px 16px; cursor: pointer; border-radius: 4px; white-space: nowrap; min-height: 44px; }
.rw-navbtn.active { background: #e68a00; color: #1a0d07; font-weight: 700; }
.rw-main { flex: 1; padding: 18px 16px 120px; max-width: 1100px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.rw-sectionhead { font-size: 1.3rem; color: #ffaa44; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 14px; }
.rw-sectionhead small { color: #94a3b8; font-size: 0.8rem; letter-spacing: 0; margin-left: 10px; }
.rw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.rw-card { background: rgba(248,250,252,0.97); color: #1e293b; border-radius: 8px; padding: 14px; cursor: pointer; border: 3px solid transparent; transition: border-color 0.15s, transform 0.15s; text-align: left; font-family: inherit; width: 100%; }
.rw-card:hover { border-color: #e68a00; }
.rw-card:active { transform: scale(0.98); }
.rw-cardmeta { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.rw-cardtitle { font-weight: 700; font-size: 1rem; color: #23130b; }
.rw-cardprice { font-weight: 800; color: #b36600; white-space: nowrap; }
.rw-carddesc { font-size: 0.85rem; color: #64748b; line-height: 1.5; margin: 0; }
.rw-glyph { font-size: 1.4rem; margin-right: 6px; }
.rw-ribbon { position: fixed; left: 0; right: 0; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 9; display: flex; gap: 8px; overflow-x: auto; padding: 8px 12px; background: rgba(17,18,21,0.92); border-top: 1px solid rgba(255,170,68,0.4); -webkit-overflow-scrolling: touch; }
.rw-chip { flex: 0 0 auto; background: #1c1d22; border: 1px solid rgba(255,170,68,0.5); color: #ffd9a0; font-family: inherit; font-size: 0.8rem; padding: 10px 14px; border-radius: 20px; cursor: pointer; min-height: 44px; }
.rw-chip:active { background: #e68a00; color: #1a0d07; }
.rw-footer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #0b0c0e; border-top: 2px solid #e68a00; padding: 12px 16px max(12px, env(safe-area-inset-bottom)); }
.rw-trayinfo { font-size: 0.85rem; color: #cbd5e1; }
.rw-trayinfo strong { display: block; font-size: 1.2rem; color: #fff; }
.rw-send { background: linear-gradient(to bottom, #e68a00, #b36600); border: 1px solid #ffaa44; color: #fff; padding: 14px 24px; font-weight: bold; border-radius: 4px; cursor: pointer; text-transform: uppercase; font-size: 0.85rem; min-height: 48px; }
.rw-send:disabled { opacity: 0.45; cursor: default; }
.rw-clear { background: transparent; border: 1px solid #64748b; color: #94a3b8; padding: 12px 16px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; min-height: 44px; }
.rw-home { text-align: center; padding: 40px 10px; }
.rw-home h2 { font-size: 2rem; color: #fff; margin-bottom: 12px; text-transform: uppercase; }
.rw-home p { color: #cbd5e1; max-width: 620px; margin: 0 auto 20px; line-height: 1.6; }
.rw-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 50; background: #052e16; border: 1px solid #22c55e; color: #bbf7d0; padding: 14px 20px; border-radius: 8px; font-size: 0.9rem; max-width: 90vw; }
.rw-hours li { color: #e2e8f0; margin-bottom: 8px; list-style: none; }
.rw-hours strong { color: #ffaa44; display: inline-block; min-width: 110px; }
.rw-mapsbtn { display: inline-block; margin-top: 14px; background: #e68a00; color: #1a0d07; font-weight: 700; text-decoration: none; padding: 14px 22px; border-radius: 6px; min-height: 48px; }
`;

export default function RainbowWokPage() {
  const [tab, setTab] = useState('home');
  const [tray, setTray] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    document.title = TITLE;
    try {
      const raw = window.localStorage.getItem(TRAY_KEY);
      if (raw) setTray(JSON.parse(raw));
    } catch { /* start with an empty tray */ }
  }, []);

  const saveTray = (next) => {
    setTray(next);
    try { window.localStorage.setItem(TRAY_KEY, JSON.stringify(next)); } catch { /* tray stays in memory */ }
  };

  const stageItem = (item) => {
    saveTray([...tray, { name: item.name, price: item.price }]);
  };

  const clearTray = () => saveTray([]);

  const dispatchOrder = () => {
    if (tray.length === 0) {
      setToast('Your tray is empty — tap menu items to add them first.');
      return;
    }
    const total = tray.reduce((s, i) => s + i.price, 0);
    setToast(`Order saved to your tray (local only): ${tray.length} item${tray.length === 1 ? '' : 's'} totaling ${money(total)} — show it at the counter to place it.`);
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const { count, total } = useMemo(() => ({
    count: tray.length,
    total: tray.reduce((s, i) => s + i.price, 0),
  }), [tray]);

  const allItems = useMemo(() => Object.entries(MENU).flatMap(([cat, items]) => items.map((i) => ({ ...i, cat }))), []);

  return (
    <div className="rw-wrap">
      <style>{CSS}</style>

      <header className="rw-header">
        <div className="rw-brand">
          <h1>Rainbow Wok &amp; Grill</h1>
          <span>The &apos;Bow Lounge</span>
        </div>
        <nav className="rw-nav" aria-label="Menu sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={'rw-navbtn' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="rw-main">
        {tab === 'home' && (
          <div className="rw-home">
            <h2>Lounge Ordering Terminal</h2>
            <p>Welcome to the remote station interface. Tap items across the menu headers above to load selections into your local order tray instantly.</p>
          </div>
        )}

        {tab !== 'home' && tab !== 'hours' && (
          <div>
            <h2 className="rw-sectionhead">{TABS.find((t) => t.id === tab).label}<small>Tap an item to add it to your tray</small></h2>
            <div className="rw-grid">
              {MENU[tab].map((item) => (
                <button key={item.name} type="button" className="rw-card" onClick={() => stageItem(item)}>
                  <div className="rw-cardmeta">
                    <span className="rw-cardtitle"><span className="rw-glyph" aria-hidden="true">{item.glyph}</span>{item.name}</span>
                    <span className="rw-cardprice">{money(item.price)}</span>
                  </div>
                  <p className="rw-carddesc">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'hours' && (
          <div>
            <h2 className="rw-sectionhead">Hours &amp; Location</h2>
            <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <h3 style={{ color: '#ffaa44' }}>📍 Find Us</h3>
                <p style={{ color: '#e2e8f0' }}>Main Street Axis, Redwater, Alberta, Canada</p>
                <h3 style={{ color: '#ffaa44' }}>📞 Call Us</h3>
                <p style={{ color: '#e2e8f0', fontWeight: 'bold' }}>780-942-2388</p>
                <a
                  className="rw-mapsbtn"
                  href="https://www.google.com/maps/search/?api=1&query=Rainbow+Wok+%26+Grill+Redwater+Alberta"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Directions
                </a>
              </div>
              <div>
                <h3 style={{ color: '#ffaa44' }}>🕐 Hours</h3>
                <ul className="rw-hours" style={{ padding: 0 }}>
                  {HOURS.map(([d, h]) => (
                    <li key={d}><strong>{d}:</strong> {h}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {toast && <div className="rw-toast" role="status">{toast}</div>}

      <div className="rw-ribbon" aria-label="Quick-add menu items">
        {allItems.map((item) => (
          <button key={item.cat + ':' + item.name} type="button" className="rw-chip" onClick={() => stageItem(item)}>
            <span aria-hidden="true">{item.glyph}</span> {item.name}
          </button>
        ))}
      </div>

      <footer className="rw-footer">
        <div className="rw-trayinfo">
          Tray: {count} item{count === 1 ? '' : 's'}
          <strong>{money(total)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="rw-clear" onClick={clearTray} disabled={count === 0}>Clear</button>
          <button type="button" className="rw-send" onClick={dispatchOrder} disabled={count === 0}>Stage Order</button>
        </div>
      </footer>
    </div>
  );
}
