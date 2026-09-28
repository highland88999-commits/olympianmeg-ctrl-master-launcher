'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  validateItem,
  createVaultItem,
  listVaultItems,
  openVaultItem,
  deleteVaultItem,
  describeItemType,
  ITEM_TYPES,
} from '@/lib/babel/vault';

const TYPE_LABELS = { photo: 'Photo', note: 'Note', credential: 'Account credential' };

export default function MilesVaultPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cloudOffline, setCloudOffline] = useState(false);

  // add-item form
  const [itemType, setItemType] = useState('note');
  const [name, setName] = useState('');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState([]);

  // open-item modal
  const [openItem, setOpenItem] = useState(null);
  const [openPw, setOpenPw] = useState('');
  const [openResult, setOpenResult] = useState(null); // {kind:'text',text}|{kind:'photo',url}
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    let auth;
    try {
      auth = supabase.auth; // throws 'Supabase is not configured' when env vars are missing
    } catch {
      setAuthChecked(true);
      setCloudOffline(true);
      return;
    }
    auth.getSession().then(({ data: { session } }) => {
      setAuthChecked(true);
      if (!session) return;
      setUserId(session.user.id);
      refresh(session.user.id);
    });
  }, []);

  const refresh = async (uid) => {
    setLoading(true);
    try {
      setItems(await listVaultItems({ supabase, userId: uid }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearSecrets = () => {
    setPassphrase('');
    setConfirm('');
    setOpenPw('');
  };

  const handleSave = async () => {
    setFormErrors([]);
    setError('');
    const fileInfo = file ? { type: file.type, size: file.size } : null;
    const errs = validateItem({ itemType, name, passphrase, confirmPassphrase: confirm, textContent, fileInfo });
    if (errs.length) {
      setFormErrors(errs);
      return;
    }
    setSaving(true);
    try {
      let fileBytes = null;
      if (itemType === 'photo') fileBytes = new Uint8Array(await file.arrayBuffer());
      await createVaultItem({
        supabase,
        userId,
        itemType,
        name,
        passphrase,
        textContent,
        fileBytes,
        mimeType: file ? file.type : 'text/plain',
      });
      // reset the form; passphrases never linger
      setName('');
      setTextContent('');
      setFile(null);
      clearSecrets();
      setFormErrors([]);
      await refresh(userId);
    } catch (e) {
      setFormErrors([e.message]);
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async () => {
    setOpenError('');
    setOpening(true);
    try {
      const res = await openVaultItem({ supabase, itemId: openItem.id, passphrase: openPw });
      if (res.kind === 'photo') {
        const url = URL.createObjectURL(res.blob);
        setOpenResult({ kind: 'photo', url, mimeType: res.mimeType });
      } else {
        setOpenResult({ kind: 'text', text: res.text });
      }
      setOpenPw('');
    } catch (e) {
      setOpenError(e.message);
    } finally {
      setOpening(false);
    }
  };

  const closeModal = () => {
    if (openResult && openResult.kind === 'photo' && openResult.url) URL.revokeObjectURL(openResult.url);
    setOpenItem(null);
    setOpenResult(null);
    setOpenError('');
    setOpenPw('');
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteVaultItem({ supabase, itemId: item.id });
      await refresh(userId);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-amber-200/60 tracking-[0.3em] uppercase text-xs animate-pulse">Opening the vault…</p>
      </div>
    );
  }

  if (cloudOffline) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-black tracking-[0.25em] text-amber-200 uppercase">Miles&apos; Vault</h1>
        <p className="text-zinc-400 mt-3 max-w-sm">
          Cloud features are offline — the vault needs the database connection. Nothing can be listed,
          sealed, or opened until it&apos;s back.
        </p>
        <button
          onClick={() => router.push('/babel')}
          className="mt-6 min-h-[44px] px-6 rounded border border-amber-500/40 text-amber-200 font-bold tracking-widest uppercase text-sm hover:bg-amber-500/20"
        >
          Back to the Tower
        </button>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-black tracking-[0.25em] text-amber-200 uppercase">Miles&apos; Vault</h1>
        <p className="text-zinc-400 mt-3 max-w-sm">Please sign in at the Master Hub first — the vault only opens for its keeper.</p>
        <button
          onClick={() => router.push('/')}
          className="mt-6 min-h-[44px] px-6 rounded border border-amber-500/40 text-amber-200 font-bold tracking-widest uppercase text-sm hover:bg-amber-500/20"
        >
          Back to the Hub
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-[0.2em] text-amber-200 uppercase">Miles&apos; Vault</h1>
            <p className="text-zinc-500 text-xs mt-1">At the base of the tower. Sealed per item — only Miles holds the keys.</p>
          </div>
          <button
            onClick={() => router.push('/babel')}
            className="min-h-[44px] px-4 rounded border border-zinc-700 text-zinc-300 text-xs font-bold tracking-widest uppercase hover:bg-zinc-800"
          >
            Tower
          </button>
        </div>

        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

        {/* ---- add item ---- */}
        <section className="mt-8 rounded-xl border border-amber-500/25 bg-zinc-950 p-4 sm:p-5">
          <h2 className="text-sm font-black tracking-[0.2em] text-amber-200 uppercase">Seal something new</h2>

          <div className="grid grid-cols-3 gap-2 mt-4">
            {ITEM_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setItemType(t)}
                className={`min-h-[44px] rounded-lg border text-xs font-bold tracking-widest uppercase transition-all ${
                  itemType === t
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <label className="block mt-4 text-xs text-zinc-400 tracking-widest uppercase">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={itemType === 'photo' ? 'e.g. Miles at the lake, summer' : itemType === 'credential' ? 'e.g. Bank login' : 'e.g. Letter for graduation'}
            className="mt-1 w-full min-h-[44px] rounded-lg bg-black border border-zinc-700 px-3 text-white placeholder:text-zinc-600 focus:border-amber-400 outline-none"
            maxLength={80}
          />

          {(itemType === 'note' || itemType === 'credential') && (
            <>
              <label className="block mt-4 text-xs text-zinc-400 tracking-widest uppercase">
                {itemType === 'credential' ? 'Account details' : 'Words for Miles'}
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={5}
                placeholder={itemType === 'credential' ? 'Site, username, password, notes…' : 'Write it like you would say it…'}
                className="mt-1 w-full rounded-lg bg-black border border-zinc-700 px-3 py-2 text-white placeholder:text-zinc-600 focus:border-amber-400 outline-none"
              />
            </>
          )}

          {itemType === 'photo' && (
            <>
              <label className="block mt-4 text-xs text-zinc-400 tracking-widest uppercase">Photo</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                className="mt-1 w-full min-h-[44px] rounded-lg bg-black border border-zinc-700 px-3 py-2 text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-amber-500/20 file:text-amber-200 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-widest"
              />
              {file && <p className="text-zinc-500 text-xs mt-1">{file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
            </>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-xs text-zinc-400 tracking-widest uppercase">Item passphrase</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="new-password"
                placeholder="Only Miles will know this"
                className="mt-1 w-full min-h-[44px] rounded-lg bg-black border border-zinc-700 px-3 text-white placeholder:text-zinc-600 focus:border-amber-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 tracking-widest uppercase">Repeat it</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat it"
                className="mt-1 w-full min-h-[44px] rounded-lg bg-black border border-zinc-700 px-3 text-white placeholder:text-zinc-600 focus:border-amber-400 outline-none"
              />
            </div>
          </div>
          <button onClick={() => setShowPw(!showPw)} className="mt-2 text-xs text-zinc-500 underline">
            {showPw ? 'Hide passphrases' : 'Show passphrases'}
          </button>

          {formErrors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {formErrors.map((e, i) => (
                <li key={i} className="text-red-400 text-sm">{e}</li>
              ))}
            </ul>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full min-h-[48px] rounded-lg bg-amber-500/90 text-black font-black tracking-[0.2em] uppercase text-sm hover:bg-amber-400 disabled:opacity-50 transition-all"
          >
            {saving ? 'Sealing…' : 'Seal it in the vault'}
          </button>
          <p className="text-zinc-600 text-[11px] mt-2 leading-relaxed">
            Encryption happens on this device before anything is sent. The vault never sees your passphrase or
            the unsealed contents. If a passphrase is forgotten, the item cannot be recovered — that is the point.
          </p>
        </section>

        {/* ---- items ---- */}
        <section className="mt-8">
          <h2 className="text-sm font-black tracking-[0.2em] text-amber-200 uppercase">Sealed items</h2>
          {loading ? (
            <p className="text-zinc-500 text-sm mt-3">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-zinc-500 text-sm mt-3">Nothing sealed yet. The first stone is yours to lay.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate">{item.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {describeItemType(item.item_type)} — {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setOpenItem(item); setOpenResult(null); setOpenError(''); setOpenPw(''); }}
                      className="min-h-[44px] px-4 rounded-lg border border-amber-500/40 text-amber-200 text-xs font-bold tracking-widest uppercase hover:bg-amber-500/20"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="min-h-[44px] px-4 rounded-lg border border-red-900 text-red-400 text-xs font-bold tracking-widest uppercase hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---- open modal ---- */}
      {openItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl border border-amber-500/30 bg-zinc-950 p-5 mt-10 sm:mt-0">
            <h3 className="text-amber-200 font-black tracking-[0.2em] uppercase text-sm">{openItem.name}</h3>
            <p className="text-zinc-500 text-xs mt-1">{describeItemType(openItem.item_type)}</p>

            {!openResult ? (
              <>
                <label className="block mt-4 text-xs text-zinc-400 tracking-widest uppercase">Item passphrase</label>
                <input
                  type="password"
                  value={openPw}
                  onChange={(e) => setOpenPw(e.target.value)}
                  autoComplete="off"
                  placeholder="Enter the passphrase Miles knows"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleOpen(); }}
                  className="mt-1 w-full min-h-[44px] rounded-lg bg-black border border-zinc-700 px-3 text-white placeholder:text-zinc-600 focus:border-amber-400 outline-none"
                />
                {openError && <p className="text-red-400 text-sm mt-2">{openError}</p>}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleOpen}
                    disabled={opening || !openPw}
                    className="flex-1 min-h-[48px] rounded-lg bg-amber-500/90 text-black font-black tracking-[0.2em] uppercase text-sm hover:bg-amber-400 disabled:opacity-50"
                  >
                    {opening ? 'Unsealing…' : 'Unseal'}
                  </button>
                  <button
                    onClick={closeModal}
                    className="min-h-[48px] px-5 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-bold tracking-widest uppercase hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-black p-4 max-h-[50vh] overflow-auto">
                  {openResult.kind === 'text' ? (
                    <pre className="whitespace-pre-wrap text-zinc-200 text-sm font-sans">{openResult.text}</pre>
                  ) : (
                    <img src={openResult.url} alt={openItem.name} className="w-full rounded" />
                  )}
                </div>
                <button
                  onClick={closeModal}
                  className="mt-4 w-full min-h-[48px] rounded-lg border border-amber-500/40 text-amber-200 text-sm font-black tracking-[0.2em] uppercase hover:bg-amber-500/20"
                >
                  Seal it back up
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
