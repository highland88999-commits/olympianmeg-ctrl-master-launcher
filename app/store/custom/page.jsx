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
// Merlin's placement rules (2026-10-13):
//   1. A template with more than one placement (the joggers' legs)
//      takes a DIFFERENT graphic per placement, or the same graphic
//      reused — the user's choice per placement.
//   2. On the AOP hoodie the user only ever handles the FRONT; the
//      pocket is filled by the backend from the same front file.
//   3. Print files are composed with an edge-mirrored fill by default:
//      space the graphic doesn't cover reflects the graphic at its
//      edges instead of staying blank (see composePrintCanvas).
//
// Flow:
//   1. Upload  — pick a product, then drag & drop or file picker,
//                client-side validation (type, size, dimensions,
//                transparency check).
//   2. Design  — drag the graphic to position it, slider to resize,
//                name the design, and set the creator markup (the
//                creation sells at base price + markup; the markup is
//                the creator's income per sale). The canvas exports a
//                print-ready PNG per placement at the product's print
//                resolution with the graphic baked at the chosen
//                position/scale over the mirrored fill.
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
  placementsFor,
  parseMarkupToCents,
  centsToCadString,
} from '@/lib/store/custom-products';
import { supabase } from '@/lib/supabase';
import ShareButton from '@/components/store/ShareButton';
import {
  productShareUrl,
  productShareText,
} from '@/lib/store/share';
import {
  ourError,
  friendlyDesignerError,
  jsonOrNull,
} from '@/lib/store/designer-errors';

const MAX_FILE_MB = 10;
const MIN_DIM = 800;

const STEPS = ['Upload', 'Design', 'Create'];

function cx(...xs) { return xs.filter(Boolean).join(' '); }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render design.'));
    img.src = src;
  });
}

// Compose a print canvas of W×H: the graphic drawn at `rect`, with
// every uncovered pixel filled by edge-mirroring the graphic (Rule 3).
// Reflected tiles are anchored on the graphic's own rect, so each
// reflection meets the graphic's edge exactly — the fill reads as the
// artwork continuing, never as blank space. The graphic itself is
// drawn last, pristine, on top of its own home tile.
function composePrintCanvas(img, W, H, rect) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const { x, y, w, h } = rect;
  if (w > 0 && h > 0) {
    const iMin = Math.floor((0 - x) / w), iMax = Math.ceil((W - x) / w);
    const jMin = Math.floor((0 - y) / h), jMax = Math.ceil((H - y) / h);
    for (let i = iMin; i < iMax; i++) {
      for (let j = jMin; j < jMax; j++) {
        if (i === 0 && j === 0) continue;
        const flipX = Math.abs(i % 2) === 1;
        const flipY = Math.abs(j % 2) === 1;
        ctx.save();
        ctx.translate(x + i * w + (flipX ? w : 0), y + j * h + (flipY ? h : 0));
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      }
    }
    ctx.drawImage(img, x, y, w, h);
  }
  return c;
}

// The placed rect (px) of a design on a W×H canvas: the graphic's
// width is `gs` of the canvas width, height keeps its aspect ratio,
// centred on (gx, gy) as fractions of the canvas.
function designRect(img, design, W, H) {
  const gw = W * design.gs;
  const gh = gw * (img.naturalHeight / img.naturalWidth);
  return { x: W * design.gx - gw / 2, y: H * design.gy - gh / 2, w: gw, h: gh };
}

// Full-resolution print PNG for one placement, as a binary Blob. The
// file travels to staging as raw bytes (lib/store/design-upload.js) —
// never as a base64 string inside a JSON body: at print resolution
// that string runs to ~30MB, and iOS Safari kills the send with a raw
// system error the customer should never see (2026-10-15).
function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob((b) => resolve(b || null), 'image/png');
        return;
      } catch { /* fall through to the data-URL path */ }
    }
    try {
      fetch(canvas.toDataURL('image/png'))
        .then((r) => r.blob())
        .then(resolve)
        .catch(() => resolve(null));
    } catch { resolve(null); }
  });
}

async function exportDesignBlob(design, spec) {
  const img = await loadImage(design.imgUrl);
  const canvas = composePrintCanvas(img, spec.w, spec.h, designRect(img, design, spec.w, spec.h));
  return canvasToBlob(canvas);
}

// Low-resolution composite for the stage backdrop, so the user sees
// the mirrored fill while designing (same routine, smaller canvas).
async function previewDesignUrl(design, spec, targetW = 480) {
  const img = await loadImage(design.imgUrl);
  const W = targetW;
  const H = Math.max(1, Math.round(spec.h * (targetW / spec.w)));
  const canvas = composePrintCanvas(img, W, H, designRect(img, design, W, H));
  return canvas.toDataURL('image/png');
}

export default function CustomProductPage() {
  const [productKey, setProductKey] = useState(DEFAULT_PRODUCT_KEY);
  const product = getCustomProduct(productKey) || CUSTOM_PRODUCTS[0];
  const placements = placementsFor(product);
  const firstKey = placements.length ? placements[0].key : 'main';
  const multi = placements.length > 1;

  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Per-placement design state (Rule 1). designs[key] holds a
  // placement's own graphic + transform; reuse[key] names the
  // placement whose graphic this placement shares instead.
  // A design record: { imgUrl, imgSize, hasTransparency, qualityWarn,
  // gx, gy, gs } — position/size as fractions of the print area.
  const [designs, setDesigns] = useState({});
  const [reuse, setReuse] = useState({});
  const [activeKey, setActiveKey] = useState(() => {
    const p = getCustomProduct(DEFAULT_PRODUCT_KEY);
    const pls = p ? placementsFor(p) : [];
    return pls.length ? pls[0].key : 'main';
  });

  const [designName, setDesignName] = useState('');
  const [markup, setMarkup] = useState('0');       // creator markup, CAD dollars (string while typing)
  const [signedIn, setSignedIn] = useState(null);  // null = not checked yet
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);      // {productId, productName, mockupUrl, ...pricing}
  const [baselineUsed, setBaselineUsed] = useState(false);
  const [buySize, setBuySize] = useState(product.defaultSize || '');
  const [buying, setBuying] = useState(false);
  const [stageBg, setStageBg] = useState(null);    // mirrored-fill stage preview

  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const designsRef = useRef(designs);
  designsRef.current = designs;

  const activePlacement = placements.find((p) => p.key === activeKey) || placements[0] || null;
  const activeSourceKey = activePlacement
    ? (reuse[activePlacement.key] || activePlacement.key)
    : null;
  const activeDesign = activeSourceKey ? (designs[activeSourceKey] || null) : null;
  const activeIsReuse = !!(activePlacement && reuse[activePlacement.key]);
  const activeSpec = (activePlacement && activePlacement.print) || product.print;
  const PRINT_W = activeSpec.w;
  const PRINT_H = activeSpec.h;

  const labelOf = useCallback((key) => {
    const p = placements.find((pl) => pl.key === key);
    return p ? p.label : 'graphic';
  }, [placements]);

  const patchDesign = useCallback((key, patch) => {
    setDesigns((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  }, []);

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
  const selectProduct = (key) => {
    const p = getCustomProduct(key);
    if (!p) return;
    const pls = placementsFor(p);
    const first = pls.length ? pls[0] : null;
    const carried = activeDesign;
    const next = {};
    if (carried && first) {
      // Keep the graphic across the switch (as this page always has),
      // re-homed on the new template's first placement with that
      // template's default position/size.
      next[first.key] = { ...carried, gx: p.design.x, gy: p.design.y, gs: p.design.scale };
    }
    setProductKey(key);
    setDesigns(next);
    setReuse({});
    setActiveKey(first ? first.key : 'main');
    setBuySize(p.defaultSize || '');
    setResult(null);
    setError(null);
  };

  // ---- upload & validation (per placement) ----
  const validateAndLoad = useCallback((f, targetKey) => {
    setError(null);
    if (!f || !targetKey) return;
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
      // Transparency check: sample the canvas for any non-opaque pixel.
      let transparent = null;
      try {
        const c = document.createElement('canvas');
        const s = Math.min(200, w, h);
        c.width = s; c.height = s;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, s, s);
        const px = ctx.getImageData(0, 0, s, s).data;
        transparent = false;
        for (let i = 3; i < px.length; i += 40) {
          if (px[i] < 250) { transparent = true; break; }
        }
      } catch { transparent = null; }
      setDesigns((prev) => {
        const old = prev[targetKey];
        if (old && old.imgUrl && old.imgUrl !== url) URL.revokeObjectURL(old.imgUrl);
        return {
          ...prev,
          [targetKey]: {
            imgUrl: url,
            imgSize: { w, h },
            hasTransparency: transparent,
            qualityWarn: w < 2000 || h < 2000,
            gx: product.design.x, gy: product.design.y, gs: product.design.scale,
          },
        };
      });
      // A fresh upload for a placement ends any reuse set for it.
      setReuse((prev) => {
        if (!prev[targetKey]) return prev;
        const n = { ...prev };
        delete n[targetKey];
        return n;
      });
      setActiveKey(targetKey);
      if (targetKey === firstKey) setStep(1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Could not read that image — please try another file.');
    };
    img.src = url;
  }, [product, firstKey]);

  const pickFileFor = useCallback((key) => {
    uploadTargetRef.current = key;
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const onDropFor = useCallback((key) => (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) validateAndLoad(f, key);
  }, [validateAndLoad]);

  // ---- drag to reposition (pointer events: mouse + touch) ----
  const startDrag = useCallback((e) => {
    if (!stageRef.current || !activeSourceKey || activeIsReuse) return;
    e.preventDefault();
    const stage = stageRef.current;
    const rect = stage.getBoundingClientRect();
    const sourceKey = activeSourceKey;
    const move = (ev) => {
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      patchDesign(sourceKey, {
        gx: Math.min(0.95, Math.max(0.05, x)),
        gy: Math.min(0.95, Math.max(0.05, y)),
      });
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
  }, [activeSourceKey, activeIsReuse, patchDesign]);

  useEffect(() => () => {
    if (dragRef.current) {
      window.removeEventListener('pointermove', dragRef.current.move);
      window.removeEventListener('pointerup', dragRef.current.up);
    }
  }, []);

  useEffect(() => () => {
    Object.values(designsRef.current).forEach((d) => {
      if (d && d.imgUrl) URL.revokeObjectURL(d.imgUrl);
    });
  }, []);

  // ---- stage backdrop: the mirrored-fill composite (Rule 3 preview) ----
  useEffect(() => {
    if (!activeDesign) { setStageBg(null); return; }
    let alive = true;
    const timer = setTimeout(() => {
      previewDesignUrl(activeDesign, activeSpec)
        .then((u) => { if (alive) setStageBg(u); })
        .catch(() => {});
    }, 120);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDesign, product.key]);

  // ---- create product ----
  const createProduct = useCallback(async () => {
    setError(null);
    if (!markupParsed.ok) {
      setError(markupParsed.error);
      return;
    }
    setCreating(true);
    try {
      // One print file per placement that carries its own graphic; a
      // reusing placement names its source instead (Rule 1). Files are
      // rendered at full print resolution and staged as binary
      // uploads; the create call itself then carries only the small
      // staging paths (see lib/store/design-upload.js).
      const ownPlacements = placements.filter((p) => !reuse[p.key]);
      for (const p of ownPlacements) {
        if (!designs[p.key]) {
          throw ourError(`Add a graphic for the ${p.label.toLowerCase()} placement, or set it to use the same graphic as another placement.`);
        }
      }
      const blobs = {};
      for (const p of ownPlacements) {
        const blob = await exportDesignBlob(designs[p.key], p.print || product.print);
        if (!blob) {
          throw ourError('Could not render your design — please try uploading the graphic again.');
        }
        blobs[p.key] = blob;
      }
      // Mint one-time signed upload URLs, then send each file straight
      // to storage as binary data.
      const mintRes = await fetch('/api/store/custom/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ productKey, keys: ownPlacements.map((p) => p.key) }),
      });
      const mintData = await jsonOrNull(mintRes);
      if (!mintData || !mintData.ok || !Array.isArray(mintData.uploads)) {
        throw ourError((mintData && mintData.error) || 'Could not start the upload — please try again.');
      }
      const pathByKey = {};
      for (const up of mintData.uploads) {
        const blob = blobs[up.key];
        if (!blob || !up.bucket || !up.path || !up.token) {
          throw ourError('Could not start the upload — please try again.');
        }
        const { error: upError } = await supabase.storage
          .from(up.bucket)
          .uploadToSignedUrl(up.path, up.token, blob, { contentType: 'image/png' });
        if (upError) throw new Error(`Design upload failed: ${upError.message || 'storage error'}`);
        pathByKey[up.key] = up.path;
      }
      const images = placements.map((p) => (reuse[p.key]
        ? { key: p.key, sameAs: reuse[p.key] }
        : { key: p.key, storagePath: pathByKey[p.key] }));
      const res = await fetch('/api/store/custom/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          productKey,
          images,
          fileName: `custom-${productKey}-${Date.now()}.png`,
          designName: designName.trim() || `My Custom ${product.name}`,
          // Only the markup travels — the server recomputes the price.
          markup: markup === '' ? '0' : markup,
        }),
      });
      const data = await jsonOrNull(res);
      if (!data) throw ourError('The store did not answer — please try again in a moment.');
      if (!data.ok) throw ourError(data.error || 'Could not create your product.');
      setResult(data);
      setBaselineUsed(false);
      setStep(2);
    } catch (err) {
      setError(friendlyDesignerError(err, 'Something went wrong creating your product.'));
    } finally {
      setCreating(false);
    }
  }, [placements, reuse, designs, product, designName, productKey, markup, markupParsed, authHeaders]);

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
      const data = await jsonOrNull(res);
      if (data && data.type === 'stripe' && data.url) {
        window.location.href = data.url;
        return;
      }
      if (baselineOffer && res.status === 409) setBaselineUsed(true);
      throw ourError((data && data.error) || 'Checkout is not available right now.');
    } catch (err) {
      setError(friendlyDesignerError(err, 'Checkout is not available right now.'));
    } finally {
      setBuying(false);
    }
  }, [result, product, buySize, authHeaders]);

  const buyNow = useCallback(() => buyCustom(false), [buyCustom]);
  const buyBaseline = useCallback(() => buyCustom(true), [buyCustom]);

  const resetAll = useCallback(() => {
    Object.values(designsRef.current).forEach((d) => {
      if (d && d.imgUrl) URL.revokeObjectURL(d.imgUrl);
    });
    setDesigns({});
    setReuse({});
    const p = getCustomProduct(productKey) || CUSTOM_PRODUCTS[0];
    const pls = placementsFor(p);
    setActiveKey(pls.length ? pls[0].key : 'main');
    setBuySize(p.defaultSize || '');
    setDesignName(''); setMarkup('0'); setResult(null); setBaselineUsed(false); setError(null);
    setStep(0);
  }, [productKey]);

  const primaryDesign = designs[firstKey] || null;

  return (
    <div className="min-h-dvh bg-[#06070d] text-white"
      style={{ paddingBottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))', overflowX: 'clip' }}>
      {/* shared file picker for every placement's upload control */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) validateAndLoad(f, uploadTargetRef.current || firstKey);
        }}
      />
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* header */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
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
              'min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider',
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

            <div className="mb-3 text-sm font-semibold text-slate-200">
              2 · Add your graphic{multi ? ` — ${labelOf(firstKey)}` : ''}
            </div>
            <div
              onDrop={onDropFor(firstKey)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => pickFileFor(firstKey)}
              className={cx(
                'cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
                dragOver ? 'border-amber-400 bg-amber-400/10' : 'border-white/20 bg-white/5'
              )}
            >
              {primaryDesign ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={primaryDesign.imgUrl} alt="Your graphic" className="mx-auto max-h-40 rounded-lg" />
                  <div className="mt-3 font-semibold">Got it — tap to replace</div>
                </>
              ) : (
                <>
                  <div className="text-5xl">🎨</div>
                  <div className="mt-3 font-semibold">Drop your graphic here</div>
                  <div className="mt-1 text-sm text-slate-400">or tap to browse — PNG, JPG, or WebP</div>
                </>
              )}
              <div className="mt-3 text-xs text-slate-500">
                Transparent PNG works best · at least {MIN_DIM}×{MIN_DIM}px · max {MAX_FILE_MB}MB
              </div>
            </div>
            {multi && (
              <div className="mt-3 text-xs text-slate-400">
                This product has {placements.length} print placements. In the next step you can give the{' '}
                {placements.slice(1).map((p) => p.label.toLowerCase()).join(' and ')} its own graphic — or
                use this same one.
              </div>
            )}
            {product.pocketFromFront && (
              <div className="mt-3 text-xs text-slate-400">
                The pocket prints this same graphic, aligned with the front — nothing extra to upload.
              </div>
            )}
            {primaryDesign && (
              <button
                onClick={() => setStep(1)}
                className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 font-semibold text-black"
              >
                Continue to design →
              </button>
            )}
          </div>
        )}

        {/* STEP 2 — design */}
        {step === 1 && activeDesign && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-sm text-slate-400">
                Designing on: <span className="font-semibold text-slate-200">{product.name}</span> — CA${product.priceCad}
              </div>
              <button onClick={() => setStep(0)} className="shrink-0 text-xs text-slate-400 underline">
                Change product
              </button>
            </div>

            {/* placement tabs (Rule 1 templates only) */}
            {multi && (
              <div className="mb-3 flex gap-2">
                {placements.map((p) => {
                  const isActive = activePlacement && p.key === activePlacement.key;
                  const state = reuse[p.key]
                    ? `same as ${labelOf(reuse[p.key]).toLowerCase()}`
                    : designs[p.key] ? 'own graphic' : 'no graphic yet';
                  return (
                    <button
                      key={p.key}
                      onClick={() => setActiveKey(p.key)}
                      className={cx(
                        'flex-1 rounded-lg border px-3 py-2 text-left',
                        isActive ? 'border-amber-400 bg-amber-400/10' : 'border-white/15 bg-white/5'
                      )}
                    >
                      <div className="text-sm font-semibold">{p.label}</div>
                      <div className="text-xs text-slate-400">{state}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* per-placement graphic choice for non-primary placements */}
            {multi && activePlacement && activePlacement.key !== firstKey && (
              <div className="mb-4 rounded-xl border border-white/15 bg-white/5 p-4">
                <div className="text-sm font-semibold text-slate-200">{activePlacement.label} graphic</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setReuse((prev) => ({ ...prev, [activePlacement.key]: firstKey }))}
                    className={cx(
                      'rounded-lg border px-3 py-2 text-sm',
                      activeIsReuse ? 'border-amber-400 bg-amber-400/10 text-amber-200' : 'border-white/15 text-slate-300'
                    )}
                  >
                    Same as {labelOf(firstKey).toLowerCase()}
                  </button>
                  <button
                    onClick={() => setReuse((prev) => {
                      const n = { ...prev };
                      delete n[activePlacement.key];
                      return n;
                    })}
                    className={cx(
                      'rounded-lg border px-3 py-2 text-sm',
                      !activeIsReuse ? 'border-amber-400 bg-amber-400/10 text-amber-200' : 'border-white/15 text-slate-300'
                    )}
                  >
                    Different graphic
                  </button>
                </div>
                {!activeIsReuse && !designs[activePlacement.key] && (
                  <div
                    onDrop={onDropFor(activePlacement.key)}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => pickFileFor(activePlacement.key)}
                    className={cx(
                      'mt-3 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors',
                      dragOver ? 'border-amber-400 bg-amber-400/10' : 'border-white/20 bg-white/5'
                    )}
                  >
                    <div className="text-3xl">🎨</div>
                    <div className="mt-2 text-sm font-semibold">Drop the {activePlacement.label.toLowerCase()} graphic here</div>
                    <div className="mt-1 text-xs text-slate-400">or tap to browse — PNG, JPG, or WebP</div>
                  </div>
                )}
                {!activeIsReuse && designs[activePlacement.key] && (
                  <button
                    onClick={() => pickFileFor(activePlacement.key)}
                    className="mt-3 text-xs text-slate-400 underline"
                  >
                    Replace this graphic
                  </button>
                )}
                {activeIsReuse && (
                  <div className="mt-3 text-xs text-slate-400">
                    The {activePlacement.label.toLowerCase()} will print the {labelOf(firstKey).toLowerCase()} graphic,
                    positioned exactly as you placed it there.
                  </div>
                )}
              </div>
            )}

            <div className="mb-3 text-sm text-slate-400">
              Drag your graphic to move it · use the slider to resize
              <span className="block text-xs text-slate-500">
                Space around your graphic is filled by mirroring its edges — no blank space.
              </span>
            </div>
            {/* print-area stage */}
            <div className="mx-auto w-full max-w-sm">
              <div
                ref={stageRef}
                className="relative w-full overflow-hidden rounded-2xl border border-white/15 bg-white"
                style={{
                  aspectRatio: `${PRINT_W} / ${PRINT_H}`,
                  ...(stageBg ? { backgroundImage: `url(${stageBg})`, backgroundSize: 'cover' } : {}),
                }}
              >
                {/* product hint */}
                {!stageBg && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-xs uppercase tracking-widest text-slate-400/70">{product.stageHint}</span>
                  </div>
                )}
                {!activeIsReuse && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeDesign.imgUrl}
                    alt="Your graphic"
                    onPointerDown={startDrag}
                    draggable={false}
                    className="absolute cursor-grab touch-none select-none active:cursor-grabbing"
                    style={{
                      left: `${activeDesign.gx * 100}%`,
                      top: `${activeDesign.gy * 100}%`,
                      width: `${activeDesign.gs * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}
                {activeIsReuse && activePlacement && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-center text-xs text-slate-200">
                    Same graphic as {labelOf(reuse[activePlacement.key]).toLowerCase()}
                  </div>
                )}
              </div>
            </div>

            {/* size slider */}
            <div className="mt-5">
              <label className="text-sm text-slate-300">
                Graphic size — {Math.round(activeDesign.gs * 100)}% of print width
                <input
                  type="range" min={10} max={90} value={Math.round(activeDesign.gs * 100)}
                  disabled={activeIsReuse}
                  onChange={(e) => patchDesign(activeSourceKey, { gs: Number(e.target.value) / 100 })}
                  className="mt-2 w-full accent-amber-400 disabled:opacity-40"
                />
              </label>
              {activeIsReuse && activePlacement && (
                <div className="mt-1 text-xs text-slate-500">
                  Size and position follow the {labelOf(reuse[activePlacement.key]).toLowerCase()} graphic.
                </div>
              )}
            </div>

            {/* validation notes */}
            <div className="mt-4 space-y-1 text-xs">
              {activeDesign.imgSize && (
                <div className="text-slate-500">
                  {activeDesign.imgSize.w}×{activeDesign.imgSize.h}px
                  {activeDesign.qualityWarn && <span className="text-amber-300"> — a larger file would print sharper</span>}
                </div>
              )}
              {activeDesign.hasTransparency === false && (
                <div className="text-amber-300">
                  No transparency detected — the background of your image will print as-is.
                </div>
              )}
              {activeDesign.hasTransparency === true && (
                <div className="text-emerald-300">
                  Transparent background detected — open areas fill with a mirrored reflection of your graphic.
                </div>
              )}
              {product.pocketFromFront && (
                <div className="text-slate-400">
                  The pocket prints this same graphic, aligned with the front — nothing extra to upload.
                </div>
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
              // eslint-disable-next-line @next/next/no-img-element
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
              {/* Share the creation (Merlin, 2026-10-13): a share button
                  lives beside every product a user makes. The URL is the
                  product's canonical store link — the store page scrolls
                  straight to this product's card. */}
              <ShareButton
                url={productShareUrl(result.productId)}
                title={result.productName || `My Custom ${product.name}`}
                text={productShareText({
                  name: result.productName,
                  priceLabel: `CA$${result.finalPriceCad ?? product.priceCad}`,
                })}
                size="lg"
              />
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

