'use client';
// /store/custom — Custom Product Designer.
// A native Omega Store category: pick a blank product, upload your own
// graphic, position and size it, then create a real Printful product and
// buy it through the existing Stripe checkout.
//
// Templates live in lib/store/custom-products.js — one per completed
// product type (the original All-Over Print Recycled Unisex Hoodie,
// White, CA$95, is the default). Print resolution, placements, variants
// and prices all come from the Printful catalog specs in that config.
//
// Flow:
//   1. Upload  — pick a product, then drag & drop or file picker,
//                client-side validation (type, size, dimensions,
//                transparency check).
//   2. Design  — drag the graphic to position it, slider to resize,
//                name the design, and set the creator markup (the
//                creation sells at base price + markup; the markup is
//                the creator's income per sale). The canvas exports a
//                print-ready PNG at the chosen product's print resolution
//                with the graphic baked at the chosen position/scale.
//   3. Create  — POST /api/store/custom/create uploads to Printful and
//                creates the sync product at the server-computed store
//                price; the official mockup is shown with purchase via
//                POST /api/store/custom/buy (server-priced from the
//                creation record), including the creator's one-time
//                first copy at the base price, and View in Store.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CUSTOM_PRODUCTS,
  getCustomProduct,
  DEFAULT_PRODUCT_KEY,
  parseMarkupToCents,
  centsToCadString,
} from '@/lib/store/custom-products';
import { supabase } from '@/lib/supabase';

const MAX_FILE_MB = 10;
const MIN_DIM = 800;

const STEPS = ['Upload', 'Design', 'Create'];

function cx(...xs) { return xs.filter(Boolean).join(' '); }

export default function CustomProductPage() {
  const [productKey, setProductKey] = useState(DEFAULT_PRODUCT_KEY);
  const product = getCustomProduct(productKey) || CUSTOM_PRODUCTS[0];
  const PRINT_W = product.print.w;
  const PRINT_H = product.print.h;

  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);          // File object
  const [imgUrl, setImgUrl] = useState(null);      // object URL for preview
  const [imgSize, setImgSize] = useState(null);     // {w,h} natural dims
  const [hasTransparency, setHasTransparency] = useState(null);
  const [qualityWarn, setQualityWarn] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Design state — position/size as fractions of the print area.
  const [gx, setGx] = useState(product.design.x);   // center x (0..1)
  const [gy, setGy] = useState(product.design.y);   // center y (0..1)
  const [gs, setGs] = useState(product.design.scale); // graphic width as fraction of print width

  const [designName, setDesignName] = useState('');
  const [markup, setMarkup] = useState('0');       // creator markup, CAD dollars (string while typing)
  const [signedIn, setSignedIn] = useState(null);  // null = not checked yet
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);      // {productId, productName, mockupUrl, ...pricing}
  const [baselineUsed, setBaselineUsed] = useState(false);
  const [buySize, setBuySize] = useState(product.defaultSize || '');
  const [buying, setBuying] = useState(false);

  const fileInputRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  // ---- creator identity (Supabase session, same pattern as the wallet) ----
  // Creation works for guests too, but attribution + the baseline offer
  // need a verified creator, so the page attaches its session token to
  // the create/buy calls and says plainly when it can't.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) setSignedIn(!!(data && data.session));
      } catch { if (alive) setSignedIn(false); }
    })();
    return () => { alive = false; };
  }, []);

  const authHeaders = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data && data.session && data.session.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
  }, []);

  // Live markup math — display only; the server recomputes everything.
  const markupParsed = parseMarkupToCents(markup === '' ? '0' : markup, product.priceCents);
  const markupCents = markupParsed.ok ? markupParsed.markupCents : 0;
  const finalCents = product.priceCents + markupCents;

  // ---- pick a blank product (keeps any uploaded graphic) ----
  const selectProduct = useCallback((key) => {
    const p = getCustomProduct(key);
    if (!p) return;
    setProductKey(key);
    setGx(p.design.x);
    setGy(p.design.y);
    setGs(p.design.scale);
    setBuySize(p.defaultSize || '');
    setResult(null);
    setError(null);
  }, []);

  // ---- upload & validation ----
  const validateAndLoad = useCallback((f) => {
    setError(null);
    setQualityWarn(false);
    setHasTransparency(null);
    if (!f) return;
    const okTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!okTypes.includes(f.type)) {
      setError('Please use a PNG, JPG, or WebP image.');
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_FILE_MB}MB — please use a smaller one.`);
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w < MIN_DIM || h < MIN_DIM) {
        URL.revokeObjectURL(url);
        setError(`That image is ${w}×${h}px — please use at least ${MIN_DIM}×${MIN_DIM}px for a clean print.`);
        return;
      }
      setImgSize({ w, h });
      if (w < 2000 || h < 2000) setQualityWarn(true);
      // Transparency check: sample the canvas for any non-opaque pixel.
      try {
        const c = document.createElement('canvas');
        const s = Math.min(200, w, h);
        c.width = s; c.height = s;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, s, s);
        const px = ctx.getImageData(0, 0, s, s).data;
        let transparent = false;
        for (let i = 3; i < px.length; i += 40) {
          if (px[i] < 250) { transparent = true; break; }
        }
        setHasTransparency(transparent);
      } catch { setHasTransparency(null); }
      setFile(f);
      setImgUrl(url);
      setStep(1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Could not read that image — please try another file.');
    };
    img.src = url;
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) validateAndLoad(f);
  }, [validateAndLoad]);

  // ---- drag to reposition (pointer events: mouse + touch) ----
  const startDrag = useCallback((e) => {
    if (!stageRef.current) return;
    e.preventDefault();
    const stage = stageRef.current;
    const rect = stage.getBoundingClientRect();
    const move = (ev) => {
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      setGx(Math.min(0.95, Math.max(0.05, x)));
      setGy(Math.min(0.95, Math.max(0.05, y)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    dragRef.current = { move, up };
  }, []);

  useEffect(() => () => {
    if (dragRef.current) {
      window.removeEventListener('pointermove', dragRef.current.move);
      window.removeEventListener('pointerup', dragRef.current.up);
    }
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl); };
  }, [imgUrl]);

  // ---- export print-ready PNG at the product's print resolution ----
  const exportPrintFile = useCallback(() => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = PRINT_W; c.height = PRINT_H;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, PRINT_W, PRINT_H);
        // Graphic width in print px; height keeps aspect ratio.
        const gw = PRINT_W * gs;
        const gh = gw * (img.naturalHeight / img.naturalWidth);
        const cxp = PRINT_W * gx - gw / 2;
        const cyp = PRINT_H * gy - gh / 2;
        ctx.drawImage(img, cxp, cyp, gw, gh);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not render design.'));
      img.src = imgUrl;
    });
  }, [imgUrl, gx, gy, gs, PRINT_W, PRINT_H]);

  // ---- create product ----
  const createProduct = useCallback(async () => {
    setError(null);
    if (!markupParsed.ok) {
      setError(markupParsed.error);
      return;
    }
    setCreating(true);
    try {
      const dataUrl = await exportPrintFile();
      const base64 = dataUrl.split(',')[1];
      const res = await fetch('/api/store/custom/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          productKey,
          imageBase64: base64,
          fileName: `custom-${productKey}-${Date.now()}.png`,
          designName: designName.trim() || `My Custom ${product.name}`,
          // Only the markup travels — the server recomputes the price.
          markup: markup === '' ? '0' : markup,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Could not create your product.');
      setResult(data);
      setBaselineUsed(false);
      setStep(2);
    } catch (err) {
      setError(err.message || 'Something went wrong creating your product.');
    } finally {
      setCreating(false);
    }
  }, [exportPrintFile, designName, productKey, product.name, markup, markupParsed, authHeaders]);

  // ---- buy a creation via the custom buy route (server-priced from
  // the creation record: baseline + markup; baselineOffer asks for the
  // creator's one-time first copy at the base price — the server
  // verifies creator + redemption before honouring it) ----
  const buyCustom = useCallback(async (baselineOffer) => {
    if (!result || !result.productId) return;
    setError(null);
    setBuying(true);
    try {
      const payload = { productId: `pf_${result.productId}`, baselineOffer: !!baselineOffer };
      if (result.stripeProductId) payload.stripeProductId = result.stripeProductId;
      if (product.variants.length > 1) payload.size = buySize || product.defaultSize || product.variants[0].size;
      const res = await fetch('/api/store/custom/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.type === 'stripe' && data.url) {
        window.location.href = data.url;
        return;
      }
      if (baselineOffer && res.status === 409) setBaselineUsed(true);
      throw new Error(data.error || 'Checkout is not available right now.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBuying(false);
    }
  }, [result, product, buySize, authHeaders]);

  const buyNow = useCallback(() => buyCustom(false), [buyCustom]);
  const buyBaseline = useCallback(() => buyCustom(true), [buyCustom]);

  const resetAll = useCallback(() => {
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setFile(null); setImgUrl(null); setImgSize(null);
    setHasTransparency(null); setQualityWarn(false);
    setGx(product.design.x); setGy(product.design.y); setGs(product.design.scale);
    setBuySize(product.defaultSize || '');
    setDesignName(''); setMarkup('0'); setResult(null); setBaselineUsed(false); setError(null);
    setStep(0);
  }, [imgUrl, product]);

  return (
    <div className="min-h-dvh bg-[#06070d] text-white"
      style={{ paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))' }}>
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Design Your Own</h1>
            <p className="mt-1 text-sm text-slate-400">
              Pick a product, upload your graphic, place it, and we&apos;ll make it real.
            </p>
          </div>
          <Link href="/store" className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300">
            ← Store
          </Link>
        </div>

        {/* steps */}
        <div className="mb-6 flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className={cx(
              'flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider',
              i === step ? 'bg-amber-400/20 text-amber-300' :
              i < step ? 'bg-white/10 text-slate-300' : 'bg-white/5 text-slate-500'
            )}>
              {i + 1}. {s}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* STEP 1 — pick a product + upload */}
        {step === 0 && (
          <div>
            <div className="mb-3 text-sm font-semibold text-slate-200">1 · Pick your product</div>
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CUSTOM_PRODUCTS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => selectProduct(p.key)}
                  className={cx(
                    'rounded-xl border px-3 py-3 text-left transition-colors',
                    p.key === productKey
                      ? 'border-amber-400 bg-amber-400/10'
                      : 'border-white/15 bg-white/5 hover:border-white/30'
                  )}
                >
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="mt-1 text-sm font-semibold leading-tight">{p.pickerLabel}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{p.variantNote}</div>
                  <div className="mt-1 text-xs font-semibold text-amber-300">CA${p.priceCad}</div>
                </button>
              ))}
            </div>

            <div className="mb-3 text-sm font-semibold text-slate-200">2 · Add your graphic</div>
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className={cx(
                'cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
                dragOver ? 'border-amber-400 bg-amber-400/10' : 'border-white/20 bg-white/5'
              )}
            >
              <div className="text-5xl">🎨</div>
              <div className="mt-3 font-semibold">Drop your graphic here</div>
              <div className="mt-1 text-sm text-slate-400">or tap to browse — PNG, JPG, or WebP</div>
              <div className="mt-3 text-xs text-slate-500">
                Transparent PNG works best · at least {MIN_DIM}×{MIN_DIM}px · max {MAX_FILE_MB}MB
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => validateAndLoad(e.target.files && e.target.files[0])}
              />
            </div>
          </div>
        )}

        {/* STEP 2 — design */}
        {step === 1 && imgUrl && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-slate-400">
                Designing on: <span className="font-semibold text-slate-200">{product.name}</span> — CA${product.priceCad}
              </div>
              <button onClick={() => setStep(0)} className="text-xs text-slate-400 underline">
                Change product
              </button>
            </div>
            <div className="mb-3 text-sm text-slate-400">
              Drag your graphic to move it · use the slider to resize
            </div>
            {/* print-area stage */}
            <div className="mx-auto w-full max-w-sm">
              <div
                ref={stageRef}
                className="relative w-full overflow-hidden rounded-2xl border border-white/15 bg-white"
                style={{ aspectRatio: `${PRINT_W} / ${PRINT_H}` }}
              >
                {/* product hint */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-xs uppercase tracking-widest text-slate-400/70">{product.stageHint}</span>
                </div>
                <img
                  src={imgUrl}
                  alt="Your graphic"
                  onPointerDown={startDrag}
                  draggable={false}
                  className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
                  style={{
                    left: `${gx * 100}%`,
                    top: `${gy * 100}%`,
                    width: `${gs * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>
            </div>

            {/* size slider */}
            <div className="mt-5">
              <label className="text-sm text-slate-300">
                Graphic size — {Math.round(gs * 100)}% of print width
                <input
                  type="range" min={10} max={90} value={Math.round(gs * 100)}
                  onChange={(e) => setGs(Number(e.target.value) / 100)}
                  className="mt-2 w-full accent-amber-400"
                />
              </label>
            </div>

            {/* validation notes */}
            <div className="mt-4 space-y-1 text-xs">
              {imgSize && (
                <div className="text-slate-500">
                  {imgSize.w}×{imgSize.h}px
                  {qualityWarn && <span className="text-amber-300"> — a larger file would print sharper</span>}
                </div>
              )}
              {hasTransparency === false && (
                <div className="text-amber-300">
                  No transparency detected — the background of your image will print as-is.
                </div>
              )}
              {hasTransparency === true && (
                <div className="text-emerald-300">Transparent background detected — clean print.</div>
              )}
            </div>

            {/* name + actions */}
            <div className="mt-5">
              <label className="text-sm text-slate-300">
                Name your design
                <input
                  type="text"
                  value={designName}
                  onChange={(e) => setDesignName(e.target.value)}
                  placeholder={`My Custom ${product.name}`}
                  maxLength={80}
                  className="mt-1 block w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-white"
                />
              </label>
            </div>
            {/* markup — the creator sets their cut before the creation
                goes into the store (Merlin's creator marketplace) */}
            <div className="mt-5 rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="text-sm font-semibold text-slate-200">Sell it in the store</div>
              <p className="mt-1 text-xs text-slate-400">
                Your creation goes into the store at the base price plus your markup.
                Your markup is what you earn on every sale.
              </p>
              <label className="mt-3 block text-sm text-slate-300">
                Your markup (CA$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-white"
                />
              </label>
              {markupParsed.ok ? (
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Base price</span><span>CA${product.priceCad}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Your markup</span><span>CA${centsToCadString(markupCents)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-100">
                    <span>Store price</span><span>CA${centsToCadString(finalCents)}</span>
                  </div>
                  {markupCents > 0 ? (
                    <div className="pt-1 text-emerald-300">
                      You earn CA${centsToCadString(markupCents)} per sale.
                    </div>
                  ) : (
                    <div className="pt-1 text-amber-300">
                      At $0 markup your creation sells at the base price and you earn nothing per sale.
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-red-300">{markupParsed.error}</div>
              )}
              {signedIn === false && (
                <div className="mt-3 text-xs text-slate-400">
                  You&apos;re not signed in — sign in first so this creation, and its earnings, are credited to your account.
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                onClick={resetAll}
                className="rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-300"
              >
                Start over
              </button>
              <button
                onClick={createProduct}
                disabled={creating || !markupParsed.ok}
                className="flex-1 rounded-xl bg-amber-400 px-4 py-3 font-semibold text-black disabled:opacity-50"
              >
                {creating ? `Creating your ${product.pickerLabel.toLowerCase()}…` : `Create My ${product.pickerLabel} — CA$${centsToCadString(finalCents)}`}
              </button>
            </div>
            {creating && (
              <div className="mt-3 text-center text-sm text-slate-400">
                Uploading your design and building the product…
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — created */}
        {step === 2 && result && (
          <div className="text-center">
            <div className="text-5xl">{product.emoji}</div>
            <h2 className="mt-3 text-xl font-bold">Your {product.pickerLabel.toLowerCase()} is real</h2>
            <p className="mt-1 text-sm text-slate-400">{result.productName}</p>
            {result.mockupUrl ? (
              <img
                src={result.mockupUrl}
                alt={result.productName}
                className="mx-auto mt-4 w-full max-w-sm rounded-2xl border border-white/15"
              />
            ) : (
              <div className="mx-auto mt-4 flex aspect-square w-full max-w-sm items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-slate-500">
                Mockup on its way — check the store in a minute.
              </div>
            )}
            <div className="mx-auto mt-5 flex max-w-sm flex-col gap-3">
              {/* pricing breakdown — all figures server-computed at creation */}
              <div className="space-y-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Base price</span><span>CA${result.baselinePriceCad ?? product.priceCad}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Your markup</span><span>CA${result.markupCad ?? '0.00'}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-100">
                  <span>Store price</span><span>CA${result.finalPriceCad ?? product.priceCad}</span>
                </div>
                {result.creatorAttached ? (
                  <div className="pt-1 text-xs text-slate-400">
                    Listed under your account — you earn CA${result.markupCad ?? '0.00'} on every sale.
                  </div>
                ) : (
                  <div className="pt-1 text-xs text-slate-400">
                    Created without an account attached, so no earnings are credited for this one.
                  </div>
                )}
              </div>
              {product.variants.length > 1 && (
                <label className="text-left text-sm text-slate-300">
                  Size
                  <select
                    value={buySize}
                    onChange={(e) => setBuySize(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-white"
                  >
                    {product.variants.map((v) => (
                      <option key={v.id} value={v.size}>{v.size}</option>
                    ))}
                  </select>
                </label>
              )}
              {result.baselineOfferAvailable && !baselineUsed ? (
                <>
                  <button
                    onClick={buyBaseline}
                    disabled={buying}
                    className="rounded-xl bg-amber-400 px-4 py-3 font-semibold text-black disabled:opacity-50"
                  >
                    {buying ? 'Opening checkout…' : `Buy yours at base price — CA$${result.baselinePriceCad ?? product.priceCad}`}
                  </button>
                  <div className="-mt-1 text-xs text-slate-400">
                    Your one-time creator offer: your first copy at the base price — no markup.
                  </div>
                  <button
                    onClick={buyNow}
                    disabled={buying}
                    className="rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-200 disabled:opacity-50"
                  >
                    {buying ? 'Opening checkout…' : `Buy at store price — CA$${result.finalPriceCad ?? product.priceCad}`}
                  </button>
                </>
              ) : (
                <button
                  onClick={buyNow}
                  disabled={buying}
                  className="rounded-xl bg-amber-400 px-4 py-3 font-semibold text-black disabled:opacity-50"
                >
                  {buying ? 'Opening checkout…' : `Buy Now — CA$${result.finalPriceCad ?? product.priceCad}`}
                </button>
              )}
              <Link
                href="/store"
                className="rounded-xl border border-white/15 px-4 py-3 text-center text-sm text-slate-300"
              >
                View in Store
              </Link>
              <button onClick={resetAll} className="text-sm text-slate-500 underline">
                Design another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
