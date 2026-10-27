// Fortress of Solitude — temporary upload lane (all four targets).
//
// HARD RULE, no exceptions: the file is locked in the browser with the
// existing AES-GCM-256 vault lock (lockBlob) BEFORE anything leaves the
// device. Every target receives ciphertext only; the passphrase never
// leaves the device and is never stored. If a target cannot be fed
// ciphertext, it does not ship (see Filegarden below).
//
// Targets:
//  - Litterbox: anonymous temp host, up to 1 GB, expiry 1h/12h/24h/72h.
//    Files vanish at expiry — the lane says so everywhere.
//  - Catbox: anonymous, up to 200 MB, ~2-year default for anonymous uploads.
//  - Dropbox: the user's OWN account (OAuth PKCE, token stays in their
//    browser localStorage, never sent to Olympus). Files persist under
//    their own plan. Needs NEXT_PUBLIC_DROPBOX_APP_KEY — without it the
//    option honestly says Dropbox isn't connected yet.
//  - Filegarden: NO verified public upload API, so it ships MANUAL only:
//    download the locked blob, upload it on file.garden yourself (it
//    requires sign-up), paste the link back. No invented cap or endpoint.
//
// Optimization (Merlin, 2026-10-26): right-sized suggestion (smallest
// lane that fits), no duplicate copies (pull moves the one copy into
// the vault; the temp link just expires on its own), no background
// polling (one slow 30 s tick while the panel is open), pull only when
// the user asks, expired entries pruned on open/tick.

import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { X, Upload, Download, Copy, Trash2, Link2, Cloud, Clock } from "lucide-react";
import { lockBlob } from "@/lib/fortress/vault-crypto";
import { formatBytes } from "@/lib/fortress/tiers";
import {
  TEMP_TARGETS,
  LITTERBOX_EXPIRIES,
  blockedExtensionReason,
  suggestTarget,
  fitsTarget,
  isLockedVaultBlob,
  litterboxExpiresAt,
  minutesLeft,
  pruneExpiredTempEntries,
} from "@/lib/fortress/temp-targets";

const TEMP_LIST_KEY = "fortress:temp-uploads";
const DROPBOX_TOKEN_KEY = "fortress:dropbox-token";
const DROPBOX_APP_KEY = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY || "";

function loadTempList() {
  try {
    const raw = localStorage.getItem(TEMP_LIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return pruneExpiredTempEntries(Array.isArray(list) ? list : []);
  } catch {
    return [];
  }
}

function saveTempList(list) {
  try {
    localStorage.setItem(TEMP_LIST_KEY, JSON.stringify(list));
  } catch { /* private mode — the list just won't persist */ }
}

function dropboxToken() {
  try {
    return JSON.parse(localStorage.getItem(DROPBOX_TOKEN_KEY) || "null");
  } catch {
    return null;
  }
}

export default function TempUpload({ onClose, matrixData, syncDatabase, authHeaders }) {
  const fileInputRef = useRef(null);
  const pullFileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [target, setTarget] = useState("litterbox");
  const [expiry, setExpiry] = useState("72h");
  const [locked, setLocked] = useState(null); // { blob, name, origSize, cipherSize }
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [tempList, setTempList] = useState(() => loadTempList());
  const [prunedNote, setPrunedNote] = useState("");
  const [dbx, setDbx] = useState(() => dropboxToken());
  const [pullTarget, setPullTarget] = useState(null); // temp entry awaiting a crystal pick
  const [pullNodeId, setPullNodeId] = useState("");
  const [pullBusy, setPullBusy] = useState(false);
  const [manual, setManual] = useState({ target: "filegarden", url: "", expiry: "72h" });

  // Prune expired entries on open; one slow tick while open (no polling).
  useEffect(() => {
    const before = loadTempList();
    try {
      const raw = localStorage.getItem(TEMP_LIST_KEY);
      const stored = raw ? JSON.parse(raw) : [];
      if (Array.isArray(stored) && stored.length > before.length) {
        setPrunedNote(`${stored.length - before.length} expired temp ${stored.length - before.length === 1 ? "copy" : "copies"} cleared — the remote files are already gone.`);
      }
    } catch { /* noop */ }
    setTempList(before);
    saveTempList(before);
    const tick = setInterval(() => {
      setTempList((prev) => {
        const next = pruneExpiredTempEntries(prev);
        if (next.length !== prev.length) saveTempList(next);
        return next;
      });
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  // Dropbox OAuth return (PKCE): exchange the code for the user's own token.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("dropbox") !== "1" || !params.get("code")) return;
      const verifier = localStorage.getItem("fortress:dropbox-verifier");
      if (!verifier || !DROPBOX_APP_KEY) return;
      const body = new URLSearchParams({
        code: params.get("code"),
        grant_type: "authorization_code",
        client_id: DROPBOX_APP_KEY,
        code_verifier: verifier,
        redirect_uri: `${window.location.origin}/fortress-of-solitude`,
      });
      fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.access_token) {
            const tok = { access: d.access_token, refresh: d.refresh_token || null, at: Date.now() };
            localStorage.setItem(DROPBOX_TOKEN_KEY, JSON.stringify(tok));
            setDbx(tok);
            setStatus("Dropbox connected — your own account, your own space.");
          } else {
            setStatus("Dropbox did not connect — please try again.");
          }
        })
        .catch(() => setStatus("Dropbox did not connect — please try again."))
        .finally(() => {
          localStorage.removeItem("fortress:dropbox-verifier");
          window.history.replaceState({}, "", window.location.pathname);
          setTimeout(() => setStatus(""), 5000);
        });
    } catch { /* OAuth return is best-effort */ }
  }, []);

  const emptyCrystals = (matrixData || []).filter((c) => !c.fileStorageKey);

  const onFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const blocked = blockedExtensionReason(f.name);
    if (blocked) {
      setStatus(blocked + " Pick a different file.");
      setTimeout(() => setStatus(""), 5000);
      e.target.value = "";
      return;
    }
    setFile(f);
    setLocked(null);
    setStatus("");
  };

  // Step 1 — lock it in the browser. Same packaging as a crystal store
  // (manifest + payload zipped, then AES-GCM-256), so a pulled file
  // opens with the existing crystal extract flow.
  const prepareLocked = async () => {
    if (!file) return;
    const phrase = passphrase.trim();
    if (!phrase) {
      setStatus("Enter a passphrase to lock this file first.");
      setTimeout(() => setStatus(""), 4000);
      return;
    }
    setBusy(true);
    setStatus("Locking your file in this browser…");
    try {
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({
        originName: file.name, mimeType: file.type, rawSizeBytes: file.size,
        timestamp: Date.now(), tempLane: true, encrypted: true,
      }));
      zip.file("payload.dat", await file.arrayBuffer(), { binary: true });
      const zipBytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
      const lockedBytes = await lockBlob(zipBytes, phrase);
      const blob = new Blob([lockedBytes], { type: "application/octet-stream" });
      const suggestion = suggestTarget(blob.size);
      setLocked({ blob, name: `${file.name}.enc`, origSize: file.size, cipherSize: blob.size });
      setTarget(suggestion);
      setStatus(`Locked — ${formatBytes(blob.size)} of ciphertext. Suggested lane: ${TEMP_TARGETS[suggestion].label}. You can pick another.`);
    } catch (err) {
      setStatus("Could not lock this file: " + (err?.message || "unknown error"));
    } finally {
      setBusy(false);
    }
  };

  const addTempEntry = (entry) => {
    const next = [entry, ...tempList];
    setTempList(next);
    saveTempList(next);
  };

  const uploadAnonymous = async (endpoint, form) => {
    const res = await fetch(endpoint, { method: "POST", body: form });
    const text = (await res.text()).trim();
    if (!res.ok || !/^https?:\/\//.test(text)) {
      throw new Error(text.slice(0, 200) || `Upload refused (${res.status}).`);
    }
    return text;
  };

  const downloadLockedBlob = () => {
    if (!locked) return;
    const url = URL.createObjectURL(locked.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = locked.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const uploadTemp = async () => {
    if (!locked) return;
    if (!fitsTarget(target, locked.cipherSize)) {
      const t = TEMP_TARGETS[target];
      setStatus(`This locked file is ${formatBytes(locked.cipherSize)} — too big for ${t.label} (${t.capLabel}). Pick ${TEMP_TARGETS[suggestTarget(locked.cipherSize)].label} instead.`);
      return;
    }
    setBusy(true);
    setStatus("Uploading ciphertext…");
    try {
      if (target === "litterbox" || target === "catbox") {
        const endpoint = target === "litterbox"
          ? "https://litterbox.catbox.moe/resources/internals/api.php"
          : "https://catbox.moe/user/api.php";
        const form = new FormData();
        form.append("reqtype", "fileupload");
        if (target === "litterbox") form.append("time", expiry);
        form.append("fileToUpload", locked.blob, locked.name);
        let url;
        try {
          url = await uploadAnonymous(endpoint, form);
        } catch (err) {
          // Browser-origin uploads can be refused by the host's CORS rules.
          // Honest fallback: the locked file downloads for a manual upload,
          // and the link comes back here.
          downloadLockedBlob();
          setStatus(`Direct upload was refused (${err.message}). The locked file downloaded instead — upload it on ${target === "litterbox" ? "litterbox.catbox.moe" : "catbox.moe"} yourself, then paste the link below. Only ciphertext ever leaves this device.`);
          setManual({ target, url: "", expiry });
          setBusy(false);
          return;
        }
        const now = Date.now();
        addTempEntry({
          id: `${now}`,
          target,
          url,
          name: locked.name,
          origName: file?.name || locked.name,
          origSize: locked.origSize,
          cipherSize: locked.cipherSize,
          uploadedAtMs: now,
          expiresAtMs: target === "litterbox" ? litterboxExpiresAt(now, expiry) : null,
          pulled: false,
        });
        setStatus(target === "litterbox"
          ? `Temporary copy live — it vanishes in ${expiry}. Pull it into your vault before then, or it is gone.`
          : "Copy live on Catbox — anonymous uploads are deleted after 2 years without being opened.");
        setLocked(null);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else if (target === "dropbox") {
        await uploadDropbox();
      } else if (target === "filegarden") {
        downloadLockedBlob();
        setStatus("Filegarden has no verified upload API, so this one is manual: the locked file downloaded — upload it on file.garden yourself (it requires sign-up), then paste the link below.");
        setManual({ target: "filegarden", url: "", expiry: "72h" });
      }
    } catch (err) {
      setStatus("Temporary upload failed: " + (err?.message || "unknown error"));
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(""), 8000);
    }
  };

  const dropboxFetch = async (url, opts, retry = true) => {
    if (!dbx?.access) throw new Error("Connect your Dropbox first.");
    const res = await fetch(url, { ...opts, headers: { ...(opts?.headers || {}), Authorization: `Bearer ${dbx.access}` } });
    if (res.status === 401 && retry && dbx.refresh && DROPBOX_APP_KEY) {
      const body = new URLSearchParams({
        grant_type: "refresh_token", refresh_token: dbx.refresh, client_id: DROPBOX_APP_KEY,
      });
      const tok = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
      }).then((r) => r.json());
      if (tok.access_token) {
        const next = { access: tok.access_token, refresh: tok.refresh_token || dbx.refresh, at: Date.now() };
        localStorage.setItem(DROPBOX_TOKEN_KEY, JSON.stringify(next));
        setDbx(next);
        return dropboxFetch(url, opts, false);
      }
    }
    return res;
  };

  const uploadDropbox = async () => {
    if (!dbx?.access) {
      setStatus("Connect your Dropbox first — it is your own account, not Olympus storage.");
      return;
    }
    const path = `/Olympus Fortress/${locked.name}`;
    const buf = new Uint8Array(await locked.blob.arrayBuffer());
    if (buf.length <= 150_000_000) {
      const res = await dropboxFetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true }) },
        body: buf,
      });
      if (!res.ok) throw new Error(`Dropbox refused the upload (${res.status}).`);
      const meta = await res.json();
      await finishDropboxEntry(meta.path_display || path);
      return;
    }
    // Chunked session: 8 MB chunks, then finish.
    const start = await dropboxFetch("https://content.dropboxapi.com/2/files/upload_session/start", {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(0),
    });
    if (!start.ok) throw new Error(`Dropbox refused the upload session (${start.status}).`);
    const { session_id } = await start.json();
    const CHUNK = 8_000_000;
    let offset = 0;
    while (offset < buf.length) {
      const chunk = buf.slice(offset, Math.min(offset + CHUNK, buf.length));
      const isLast = offset + chunk.length >= buf.length;
      if (!isLast) {
        const app = await dropboxFetch("https://content.dropboxapi.com/2/files/upload_session/append_v2", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ cursor: { session_id, offset } }) },
          body: chunk,
        });
        if (!app.ok) throw new Error(`Dropbox chunk failed at ${formatBytes(offset)} (${app.status}).`);
      } else {
        const fin = await dropboxFetch("https://content.dropboxapi.com/2/files/upload_session/finish", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ cursor: { session_id, offset }, commit: { path, mode: "add", autorename: true } }) },
          body: chunk,
        });
        if (!fin.ok) throw new Error(`Dropbox finish failed (${fin.status}).`);
        const meta = await fin.json();
        await finishDropboxEntry(meta.path_display || path);
      }
      offset += chunk.length;
    }
  };

  const finishDropboxEntry = async (dropboxPath) => {
    let url = null;
    try {
      const res = await dropboxFetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dropboxPath }),
      });
      if (res.ok) url = (await res.json()).url || null;
    } catch { /* share link is best-effort; the file itself is stored */ }
    addTempEntry({
      id: `${Date.now()}`,
      target: "dropbox",
      url,
      dropboxPath,
      name: locked.name,
      origName: file?.name || locked.name,
      origSize: locked.origSize,
      cipherSize: locked.cipherSize,
      uploadedAtMs: Date.now(),
      expiresAtMs: null,
      pulled: false,
    });
    setStatus(url
      ? "Copy live in your Dropbox — it persists under your own plan."
      : "Copy live in your Dropbox (no share link could be made — open it in your Dropbox).");
    setLocked(null);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const connectDropbox = async () => {
    if (!DROPBOX_APP_KEY) {
      setStatus("Dropbox isn't connected yet — Merlin needs to register the Dropbox app first.");
      return;
    }
    const rand = new Uint8Array(48);
    crypto.getRandomValues(rand);
    const verifier = Array.from(rand).map((b) => ("0" + b.toString(16)).slice(-2)).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem("fortress:dropbox-verifier", verifier);
    const params = new URLSearchParams({
      client_id: DROPBOX_APP_KEY,
      response_type: "code",
      code_challenge_method: "S256",
      code_challenge: challenge,
      token_access_type: "offline",
      redirect_uri: `${window.location.origin}/fortress-of-solitude`,
    });
    window.location.href = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  };

  const addManualEntry = () => {
    const url = manual.url.trim();
    if (!/^https?:\/\//.test(url)) {
      setStatus("Paste a full link (starting with https://) from the host.");
      return;
    }
    const now = Date.now();
    addTempEntry({
      id: `${now}`,
      target: manual.target,
      url,
      name: locked?.name || "manual-upload.enc",
      origName: file?.name || "manual upload",
      origSize: locked?.origSize || 0,
      cipherSize: locked?.cipherSize || 0,
      uploadedAtMs: now,
      expiresAtMs: manual.target === "litterbox" ? litterboxExpiresAt(now, manual.expiry) : null,
      pulled: false,
      manual: true,
    });
    setStatus("Link saved — pull it into your vault before it expires or disappears.");
    setManual({ target: "filegarden", url: "", expiry: "72h" });
  };

  // Pull: move the ONE copy into the vault (existing vault upload path,
  // subject to quota). Only when the user asks. The temp link is left to
  // expire on its own — anonymous hosts offer no delete, and the vault
  // copy is the one that counts.
  const pullIntoVault = async (entry, bytes) => {
    if (!pullNodeId) {
      setStatus("Pick an empty crystal to hold this file.");
      return;
    }
    setPullBusy(true);
    setStatus("Pulling into your vault…");
    try {
      const session = await fetch("/api/request-upload-link", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ nodeId: pullNodeId, encrypted: true, fileSize: bytes.length }),
      }).then((r) => r.json());
      if (session.error) throw new Error(session.error);
      const put = await fetch(session.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "application/octet-stream" } });
      if (!put.ok) throw new Error(`Vault refused the file (${put.status}).`);
      try {
        const ures = await fetch("/api/fortress/usage", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ op: "add", bytes: bytes.length }),
        });
        await ures.json();
      } catch { /* accounting refreshes on the next visit */ }
      const node = (matrixData || []).find((c) => c.id === pullNodeId);
      if (node && syncDatabase) {
        const updated = { ...node, fileStorageKey: session.fileStorageKey, name: entry.origName || entry.name, rawSize: entry.origSize || bytes.length, encrypted: true };
        await syncDatabase((matrixData || []).map((c) => (c.id === pullNodeId ? updated : c)));
      }
      const next = tempList.map((e) => (e.id === entry.id ? { ...e, pulled: true } : e));
      setTempList(next);
      saveTempList(next);
      setPullTarget(null);
      setPullNodeId("");
      setStatus("Pulled into your vault — the temp link just expires on its own now.");
    } catch (err) {
      setStatus("Pull failed: " + (err?.message || "unknown error") + " Your temp copy is untouched — try again.");
    } finally {
      setPullBusy(false);
      setTimeout(() => setStatus(""), 8000);
    }
  };

  const pullViaFetch = async (entry) => {
    if (!entry.url) {
      setStatus("No link on this entry — open it in Dropbox to download it, then use the file picker below.");
      return;
    }
    setPullBusy(true);
    setStatus("Fetching the temp copy…");
    try {
      let bytes = null;
      if (entry.target === "dropbox" && entry.dropboxPath && dbx?.access) {
        const res = await dropboxFetch("https://content.dropboxapi.com/2/files/download", {
          method: "POST",
          headers: { "Dropbox-API-Arg": JSON.stringify({ path: entry.dropboxPath }) },
        });
        if (!res.ok) throw new Error(`Dropbox download failed (${res.status}).`);
        bytes = new Uint8Array(await res.arrayBuffer());
      } else {
        const res = await fetch(entry.url);
        if (!res.ok) throw new Error(`Temp host refused the download (${res.status}).`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      if (!isLockedVaultBlob(bytes)) throw new Error("That file is not a locked vault copy — refusing it rather than storing something unexpected.");
      await pullIntoVault(entry, bytes);
    } catch (err) {
      setStatus("Direct pull failed: " + (err?.message || "unknown error") + " — download the file with its link, then pick it below; only already-locked copies are accepted.");
    } finally {
      setPullBusy(false);
    }
  };

  const pullViaFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !pullTarget) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (!isLockedVaultBlob(bytes)) {
      setStatus("That file is not a locked vault copy (it must start with the vault lock). Nothing was stored.");
      e.target.value = "";
      return;
    }
    await pullIntoVault(pullTarget, bytes);
    e.target.value = "";
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Link copied.");
      setTimeout(() => setStatus(""), 3000);
    } catch {
      setStatus("Copy the link from the field.");
    }
  };

  const removeEntry = (id) => {
    const next = tempList.filter((e) => e.id !== id);
    setTempList(next);
    saveTempList(next);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto touch-auto">
      <div className="glass-panel rounded-2xl w-full max-w-3xl p-6 md:p-8 relative my-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-cyan-400/70 hover:text-cyan-400 transition-colors" aria-label="Close temporary upload">
          <X size={22} />
        </button>

        <h2 className="text-cyan-400 tracking-[0.3em] text-sm font-bold mb-1">TEMPORARY UPLOAD</h2>
        <p className="text-white/60 text-xs tracking-wider mb-5 leading-relaxed">
          Locked in your browser first with AES-GCM-256 — only ciphertext ever leaves this device, and your
          passphrase never leaves it either. Temp copies vanish on their own schedule; pull one into your
          vault before then, or it is gone.
        </p>

        {prunedNote && <p className="text-amber-300/90 text-[11px] tracking-wider mb-4">{prunedNote}</p>}

        <div className="flex flex-col gap-3">
          <input type="file" ref={fileInputRef} className="hidden" accept="*/*" onChange={onFileSelect} />
          <button className="btn w-full flex items-center justify-center gap-2 py-3" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> {file ? file.name : "Choose a file"}
          </button>

          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Your passphrase — locks it before upload…"
            className="w-full bg-black/60 border border-cyan-400/50 rounded-xl py-3 px-4 text-center text-sm text-white outline-none focus:border-cyan-400"
          />

          {!locked ? (
            <button className="btn w-full py-3" disabled={!file || busy} onClick={prepareLocked}>
              {busy ? "Locking…" : "Lock it in this browser"}
            </button>
          ) : (
            <div className="flex flex-col gap-3 p-4 bg-black/40 rounded-xl border border-white/10">
              <div className="text-[11px] tracking-widest text-cyan-300 text-center">
                LOCKED — {formatBytes(locked.cipherSize)} of ciphertext, ready to go.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(TEMP_TARGETS).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTarget(t.id)}
                    className={`rounded-xl p-3 border text-left ${target === t.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 bg-black/40"}`}
                  >
                    <div className="text-sm font-bold text-white">{t.label}</div>
                    <div className="text-[11px] text-white/60">{t.capLabel}</div>
                    <div className="text-[11px] text-white/50 leading-relaxed">{t.retention}</div>
                  </button>
                ))}
              </div>
              {target === "litterbox" && (
                <div className="flex gap-2 items-center justify-center">
                  <span className="text-[11px] tracking-widest text-white/60 flex items-center gap-1"><Clock size={12} /> Vanishes after:</span>
                  {LITTERBOX_EXPIRIES.map((x) => (
                    <button key={x} onClick={() => setExpiry(x)} className={`px-3 py-1 rounded-full border text-[11px] ${expiry === x ? "border-cyan-400 text-cyan-300" : "border-white/20 text-white/60"}`}>{x}</button>
                  ))}
                </div>
              )}
              {target === "dropbox" && !DROPBOX_APP_KEY && (
                <p className="text-amber-300/90 text-[11px] tracking-wider text-center">Dropbox isn&apos;t connected yet — Merlin needs to register the Dropbox app first. The other lanes work now.</p>
              )}
              {target === "dropbox" && DROPBOX_APP_KEY && !dbx?.access && (
                <button className="btn w-full py-3 flex items-center justify-center gap-2" onClick={connectDropbox}><Cloud size={16} /> Connect your Dropbox</button>
              )}
              {target === "dropbox" && dbx?.access && (
                <div className="flex gap-2">
                  <button className="btn flex-1 py-2 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => { localStorage.removeItem(DROPBOX_TOKEN_KEY); setDbx(null); }}>Disconnect Dropbox</button>
                </div>
              )}
              <button className="btn w-full py-3" disabled={busy || (target === "dropbox" && (!DROPBOX_APP_KEY || !dbx?.access))} onClick={uploadTemp}>
                {busy ? "Uploading…" : `Upload locked copy to ${TEMP_TARGETS[target].label}`}
              </button>
              <p className="text-[11px] text-white/50 tracking-wider text-center leading-relaxed">
                Suggested lane by size: {TEMP_TARGETS[suggestTarget(locked.cipherSize)].label}. Temp copies are
                never a second vault — pull one into your vault and the temp link just expires on its own.
              </p>
            </div>
          )}

          <div className="p-4 bg-black/40 rounded-xl border border-white/10 flex flex-col gap-2">
            <span className="text-[10px] tracking-widest text-white/50 flex items-center gap-2"><Link2 size={12} /> PASTE A MANUAL LINK BACK</span>
            <p className="text-[11px] text-white/50 leading-relaxed">
              For Filegarden (manual only — no verified upload API) or when a direct upload was refused:
              upload the locked file on the host yourself, then paste its link here.
            </p>
            <div className="flex gap-2">
              <select value={manual.target} onChange={(e) => setManual({ ...manual, target: e.target.value })} className="bg-black/60 border border-white/20 rounded-lg px-2 py-2 text-xs text-white outline-none">
                <option value="filegarden">Filegarden</option>
                <option value="litterbox">Litterbox</option>
                <option value="catbox">Catbox</option>
              </select>
              {manual.target === "litterbox" && (
                <select value={manual.expiry} onChange={(e) => setManual({ ...manual, expiry: e.target.value })} className="bg-black/60 border border-white/20 rounded-lg px-2 py-2 text-xs text-white outline-none">
                  {LITTERBOX_EXPIRIES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              )}
              <input
                type="text" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })}
                placeholder="https://…"
                className="flex-1 min-w-0 bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none"
              />
              <button className="btn px-4 py-2" onClick={addManualEntry}>Save link</button>
            </div>
          </div>
        </div>

        {status && <p className="text-cyan-300 text-[11px] tracking-wider text-center mt-4 leading-relaxed">{status}</p>}

        {tempList.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <h3 className="text-white/70 text-[11px] tracking-[0.25em]">YOUR TEMP COPIES</h3>
            {tempList.map((entry) => (
              <div key={entry.id} className="p-3 bg-black/40 rounded-xl border border-white/10 flex flex-col gap-2">
                <div className="flex justify-between gap-2">
                  <span className="text-sm text-white truncate">{entry.origName || entry.name}</span>
                  <span className="text-[10px] tracking-widest text-white/50 shrink-0">{TEMP_TARGETS[entry.target]?.label || entry.target}</span>
                </div>
                <div className="text-[11px] text-white/60">
                  {entry.cipherSize ? `${formatBytes(entry.cipherSize)} locked` : "locked copy"}
                  {entry.target === "litterbox" && entry.expiresAtMs && !entry.pulled && (
                    <> · vanishes in {minutesLeft(entry.expiresAtMs)} min</>
                  )}
                  {entry.target === "litterbox" && entry.expiresAtMs && entry.pulled && <> · pulled into your vault</>}
                  {entry.target === "catbox" && <> · deleted after 2 years without being opened</>}
                  {entry.target === "dropbox" && <> · in your Dropbox</>}
                  {entry.target === "filegarden" && <> · retention unverified</>}
                  {entry.manual && <> · manual link</>}
                </div>
                {entry.url && (
                  <div className="flex gap-2">
                    <input type="text" readOnly value={entry.url} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 bg-black/60 border border-cyan-400/30 rounded-lg py-2 px-3 text-[11px] text-cyan-200 outline-none" />
                    <button className="btn px-3 py-2" onClick={() => copyText(entry.url)}><Copy size={14} /></button>
                  </div>
                )}
                {!entry.pulled && (
                  pullTarget?.id === entry.id ? (
                    <div className="flex flex-col gap-2">
                      <select value={pullNodeId} onChange={(e) => setPullNodeId(e.target.value)} className="w-full bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-xs text-white outline-none">
                        <option value="">Pick an empty crystal…</option>
                        {emptyCrystals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {emptyCrystals.length === 0 && <p className="text-amber-300/90 text-[11px] tracking-wider">No empty crystal — generate one first, then pull.</p>}
                      <div className="flex gap-2">
                        <button className="btn flex-1 py-2" disabled={pullBusy || !pullNodeId} onClick={() => pullViaFetch(entry)}>
                          <Download size={14} /> {pullBusy ? "Pulling…" : "Pull into vault"}
                        </button>
                        <button className="btn flex-1 py-2 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => { setPullTarget(null); setPullNodeId(""); }}>Cancel</button>
                      </div>
                      <p className="text-[11px] text-white/50 tracking-wider text-center">
                        If the direct pull is refused, download the file with its link, then pick it here — only already-locked copies are accepted.
                      </p>
                      <input type="file" ref={pullFileInputRef} className="hidden" accept="*/*" onChange={pullViaFile} />
                      <button className="btn w-full py-2 border-gray-400 text-gray-400 hover:bg-white/10" onClick={() => pullFileInputRef.current?.click()}>Pick a downloaded locked file</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button className="btn flex-1 py-2" onClick={() => { setPullTarget(entry); setPullNodeId(""); }}>Pull into vault</button>
                      <button className="btn px-3 py-2 border-red-400/60 text-red-400/80 hover:bg-red-500/10" onClick={() => removeEntry(entry.id)} aria-label="Remove from list"><Trash2 size={14} /></button>
                    </div>
                  )
                )}
                {entry.pulled && <span className="text-[11px] tracking-widest text-green-400">IN YOUR VAULT</span>}
              </div>
            ))}
            <p className="text-[11px] text-white/40 tracking-wider leading-relaxed">
              Removing an entry only clears it from this list — anonymous temp hosts offer no delete, so the
              remote copy simply expires on its own. Dropbox copies stay in your Dropbox until you remove them there.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
