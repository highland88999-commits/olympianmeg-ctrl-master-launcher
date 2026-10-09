"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CLOUD_PHONE_CATALOG, CATALOG_SOURCES } from "@/lib/cloud-phone/catalog";

/**
 * Cloud Phone — one thin client on the user's phone; every app runs as the
 * user's own private instance on Merlin's server and streams down.
 * v1 product surface: catalog, install flow, instance records, launch UI.
 * The Android container runtime is NOT built yet — the launch viewport is
 * honest about that (see app/cloud-phone/STATUS.md). Nothing here fakes a
 * working stream.
 */

const CATEGORY_HUES = {
  Media: ["#7c3aed", "#2e1065"],
  Browser: ["#ea580c", "#431407"],
  Communication: ["#059669", "#022c22"],
  Files: ["#0284c7", "#082f49"],
  Audio: ["#db2777", "#500724"],
  Security: ["#ca8a04", "#422006"],
  Maps: ["#16a34a", "#052e16"],
  Productivity: ["#4f46e5", "#1e1b4b"],
  Utilities: ["#475569", "#0f172a"],
};

function tileGradient(category) {
  const [a, b] = CATEGORY_HUES[category] || CATEGORY_HUES.Utilities;
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const shell = {
  position: "relative",
  minHeight: "100dvh",
  backgroundColor: "#0a0f1c",
  color: "#e8eef7",
  display: "flex",
  flexDirection: "column",
};

const content = {
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  maxWidth: 860,
  width: "100%",
  margin: "0 auto",
  padding: "1.25rem 1rem calc(2rem + env(safe-area-inset-bottom))",
};

const btn = {
  border: "1px solid rgba(147,197,253,0.35)",
  background: "rgba(59,130,246,0.16)",
  color: "#dbeafe",
  borderRadius: 10,
  padding: "0.55rem 1rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const btnDanger = {
  ...btn,
  borderColor: "rgba(248,113,113,0.45)",
  background: "rgba(239,68,68,0.14)",
  color: "#fecaca",
};

const card = {
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(147,197,253,0.16)",
  borderRadius: 14,
  backdropFilter: "blur(6px)",
};

const STATUS_LABEL = {
  provisioning: "Provisioning",
  running: "Running",
  stopped: "Stopped",
};

const STATUS_COLOR = {
  provisioning: "#fbbf24",
  running: "#34d399",
  stopped: "#94a3b8",
};

async function authedFetch(path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in to use Cloud Phone.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong.");
  return json;
}

export default function CloudPhonePage() {
  const [uid, setUid] = useState(null);
  const [uidReady, setUidReady] = useState(false);
  const [catalog, setCatalog] = useState(CLOUD_PHONE_CATALOG);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // "install:<app_id>" | "launch:<id>" | ...
  const [notice, setNotice] = useState(null); // { kind: 'ok'|'err', text }
  const [confirmUninstall, setConfirmUninstall] = useState(null);
  const [launching, setLaunching] = useState(null); // { instance, phase: 'provisioning'|'waiting' }

  const flash = useCallback((kind, text) => {
    setNotice({ kind, text });
  }, []);

  // Session ---------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) setUid(data?.session?.user?.id || null);
      } catch {
        if (alive) setUid(null);
      } finally {
        if (alive) setUidReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    // Catalog: prefer the server table; fall back to the built-in seed.
    try {
      const { data, error } = await supabase
        .from("cloud_phone_catalog")
        .select("app_id,name,description,category,apk_size_mb,source")
        .order("name");
      if (!error && Array.isArray(data) && data.length > 0) setCatalog(data);
      else setCatalog(CLOUD_PHONE_CATALOG);
    } catch {
      setCatalog(CLOUD_PHONE_CATALOG);
    }
    // Instances: the user's own rows (RLS). Guests see none.
    try {
      const { data } = await supabase
        .from("cloud_phone_instances")
        .select("*")
        .order("created_at", { ascending: false });
      setInstances(Array.isArray(data) ? data : []);
    } catch {
      setInstances([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!uidReady) return;
    refresh();
  }, [uid, uidReady, refresh]);

  const catalogById = useMemo(() => {
    const m = new Map();
    for (const a of catalog) m.set(a.app_id, a);
    return m;
  }, [catalog]);

  const installedIds = useMemo(() => new Set(instances.map((i) => i.app_id)), [instances]);

  const savedMb = useMemo(
    () =>
      instances.reduce((sum, i) => {
        const app = catalogById.get(i.app_id);
        return sum + (app?.apk_size_mb || 0);
      }, 0),
    [instances, catalogById]
  );

  // Actions ----------------------------------------------------------------
  async function doInstall(appId) {
    setBusy(`install:${appId}`);
    setNotice(null);
    try {
      await authedFetch("/api/cloud-phone/install", { app_id: appId });
      await refresh();
      const app = catalogById.get(appId);
      flash("ok", `${app?.name || "App"} is now reserved in your cloud.`);
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function doLaunch(instance) {
    setBusy(`launch:${instance.id}`);
    setNotice(null);
    setLaunching({ instance, phase: "provisioning" });
    try {
      const { runtime } = await authedFetch("/api/cloud-phone/launch", {
        instance_id: instance.id,
      });
      // Honest state: the runtime is not connected yet. Show the waiting
      // viewport rather than pretending a stream started.
      setLaunching({ instance, phase: "waiting", runtimeMessage: runtime?.message });
      await refresh();
    } catch (e) {
      setLaunching(null);
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function doStop(instance) {
    setBusy(`stop:${instance.id}`);
    setNotice(null);
    try {
      await authedFetch("/api/cloud-phone/stop", { instance_id: instance.id });
      await refresh();
      flash("ok", "Instance stopped.");
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  function requestUninstall(instance) {
    if (confirmUninstall === instance.id) {
      doUninstall(instance);
    } else {
      setConfirmUninstall(instance.id);
      setTimeout(() => setConfirmUninstall((c) => (c === instance.id ? null : c)), 3000);
    }
  }

  async function doUninstall(instance) {
    setBusy(`uninstall:${instance.id}`);
    setNotice(null);
    try {
      await authedFetch("/api/cloud-phone/uninstall", { instance_id: instance.id });
      setConfirmUninstall(null);
      await refresh();
      flash("ok", "Removed from your cloud.");
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  // Launch viewport (honest placeholder — no fake stream) -------------------
  if (launching) {
    const app = catalogById.get(launching.instance.app_id);
    return (
      <div style={shell}>
        <div style={{ ...content, maxWidth: 720, justifyContent: "center" }}>
          <div
            style={{
              ...card,
              padding: "2rem 1.5rem",
              textAlign: "center",
              minHeight: "46dvh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "1rem",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: tileGradient(app?.category),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "#fff",
              }}
            >
              {initials(app?.name || "?")}
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{app?.name || "App"}</div>
            {launching.phase === "provisioning" ? (
              <>
                <div style={{ color: "#9fb0c9" }}>Provisioning your instance…</div>
                <div
                  aria-hidden="true"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "3px solid rgba(147,197,253,0.25)",
                    borderTopColor: "#93c5fd",
                    animation: "cp-spin 0.9s linear infinite",
                  }}
                />
                <style>{`@keyframes cp-spin { to { transform: rotate(360deg); } }`}</style>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "inline-block",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "#fbbf24",
                    border: "1px solid rgba(251,191,36,0.4)",
                    background: "rgba(251,191,36,0.1)",
                    borderRadius: 999,
                    padding: "0.25rem 0.8rem",
                  }}
                >
                  Server runtime not connected
                </div>
                <p style={{ color: "#9fb0c9", fontSize: "0.95rem", lineHeight: 1.7, margin: 0, maxWidth: 420 }}>
                  {launching.runtimeMessage ||
                    "Your instance is reserved. Streaming starts once the server runtime lands."}
                </p>
                <p style={{ color: "#5b6b85", fontSize: "0.82rem", lineHeight: 1.6, margin: 0, maxWidth: 420 }}>
                  This screen will become your live app window — the app runs on the server,
                  you just see the picture. Nothing is faked here.
                </p>
              </>
            )}
            <button onClick={() => setLaunching(null)} style={btn}>
              ← Back to Cloud Phone
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main view ----------------------------------------------------------------
  return (
    <div style={shell}>
      <div style={content}>
        {/* Hero */}
        <div style={{ marginBottom: "1.25rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.7rem", fontWeight: 800, letterSpacing: "0.01em" }}>
            Cloud Phone
          </h1>
          <p style={{ margin: "0.4rem 0 0", color: "#9fb0c9", fontSize: "1rem" }}>
            One app on your phone. Every app in your cloud.
          </p>
        </div>

        {/* How it works */}
        <div
          style={{
            ...card,
            padding: "0.9rem 1rem",
            marginBottom: "1.25rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {[
            ["1", "Pick an app below"],
            ["2", "It installs on the server, just for you"],
            ["3", "Stream it here — 0 MB on your phone"],
          ].map(([n, t]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 150 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "rgba(59,130,246,0.2)",
                  border: "1px solid rgba(147,197,253,0.4)",
                  color: "#bfdbfe",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {n}
              </span>
              <span style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>{t}</span>
            </div>
          ))}
        </div>

        {/* Storage meter */}
        <div style={{ ...card, padding: "1rem 1.1rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
            <div style={{ fontSize: "1.9rem", fontWeight: 800, color: "#34d399" }}>
              {loading ? "…" : `${savedMb} MB`}
            </div>
            <div style={{ color: "#9fb0c9", fontSize: "0.9rem" }}>of phone storage saved</div>
          </div>
          <div style={{ color: "#5b6b85", fontSize: "0.8rem", marginTop: "0.25rem" }}>
            {instances.length === 0
              ? "Install an app below and watch this number grow."
              : `${instances.length} app${instances.length === 1 ? "" : "s"} in your cloud · 0 MB on this device`}
          </div>
        </div>

        {notice && (
          <div
            role="status"
            style={{
              ...card,
              padding: "0.7rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.9rem",
              borderColor:
                notice.kind === "ok" ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.45)",
              color: notice.kind === "ok" ? "#a7f3d0" : "#fecaca",
            }}
          >
            {notice.text}
          </div>
        )}

        {!uidReady || loading ? (
          <div style={{ color: "#7d8da6", textAlign: "center", padding: "2rem" }}>Loading…</div>
        ) : (
          <>
            {/* My Cloud Apps */}
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "0 0 0.75rem" }}>
              My Cloud Apps
            </h2>
            {instances.length === 0 ? (
              <div style={{ ...card, padding: "1.5rem", textAlign: "center", color: "#7d8da6", marginBottom: "1.5rem", fontSize: "0.92rem" }}>
                Nothing installed yet — your cloud is empty.
                {!uid && (
                  <div style={{ marginTop: "0.5rem" }}>Sign in to install apps into your cloud.</div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
                {instances.map((inst) => {
                  const app = catalogById.get(inst.app_id);
                  const name = app?.name || inst.app_id;
                  return (
                    <div key={inst.id} style={{ ...card, padding: "0.8rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div
                          aria-hidden="true"
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: tileGradient(app?.category),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "1rem",
                            fontWeight: 800,
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        >
                          {initials(name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{name}</div>
                          <div
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: STATUS_COLOR[inst.status] || "#94a3b8",
                              marginTop: "0.15rem",
                            }}
                          >
                            {STATUS_LABEL[inst.status] || inst.status}
                          </div>
                        </div>
                        <button
                          onClick={() => doLaunch(inst)}
                          disabled={busy === `launch:${inst.id}`}
                          style={{ ...btn, opacity: busy === `launch:${inst.id}` ? 0.6 : 1 }}
                        >
                          Launch
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                        <button
                          onClick={() => doStop(inst)}
                          disabled={busy === `stop:${inst.id}` || inst.status === "stopped"}
                          style={{
                            ...btn,
                            fontSize: "0.8rem",
                            padding: "0.4rem 0.8rem",
                            opacity: busy === `stop:${inst.id}` || inst.status === "stopped" ? 0.5 : 1,
                          }}
                        >
                          Stop
                        </button>
                        <button
                          onClick={() => requestUninstall(inst)}
                          disabled={busy === `uninstall:${inst.id}`}
                          style={{
                            ...btnDanger,
                            fontSize: "0.8rem",
                            padding: "0.4rem 0.8rem",
                          }}
                        >
                          {confirmUninstall === inst.id ? "Tap again to remove" : "Uninstall"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Catalog */}
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "0 0 0.75rem" }}>
              App Catalog
            </h2>
            <p style={{ color: "#5b6b85", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>
              Open-source apps, installable today. Each one runs in your own private
              server instance — your phone carries none of the weight.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {catalog.map((app) => {
                const installed = installedIds.has(app.app_id);
                const busyKey = `install:${app.app_id}`;
                return (
                  <div key={app.app_id} style={{ ...card, padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 13,
                          background: tileGradient(app.category),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.1rem",
                          fontWeight: 800,
                          color: "#fff",
                          flexShrink: 0,
                        }}
                      >
                        {initials(app.name)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{app.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#7d8da6" }}>
                          {app.category} · {CATALOG_SOURCES[app.source] || app.source}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: "0.86rem", color: "#9fb0c9", lineHeight: 1.55, minHeight: "2.6em" }}>
                      {app.description}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#5b6b85", margin: "0.5rem 0 0.75rem" }}>
                      <span style={{ textDecoration: "line-through" }}>{app.apk_size_mb} MB on-device</span>
                      {" → "}
                      <span style={{ color: "#34d399", fontWeight: 700 }}>0 MB on your phone</span>
                    </div>
                    {installed ? (
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          color: "#34d399",
                          border: "1px solid rgba(52,211,153,0.35)",
                          borderRadius: 10,
                          padding: "0.55rem",
                        }}
                      >
                        In your cloud
                      </div>
                    ) : (
                      <button
                        onClick={() => doInstall(app.app_id)}
                        disabled={!uid || busy === busyKey}
                        title={!uid ? "Sign in to install" : `Install ${app.name}`}
                        style={{
                          ...btn,
                          width: "100%",
                          opacity: !uid || busy === busyKey ? 0.55 : 1,
                        }}
                      >
                        {!uid ? "Sign in to install" : busy === busyKey ? "Installing…" : "Install"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ color: "#5b6b85", fontSize: "0.78rem", marginTop: "1.5rem", lineHeight: 1.6 }}>
              Cloud Phone is in early build. Installing reserves your private instance;
              live streaming starts once the server runtime is connected. No app here
              touches your phone's storage.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
