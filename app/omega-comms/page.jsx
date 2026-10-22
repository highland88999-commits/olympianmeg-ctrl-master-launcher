"use client";

// /omega-comms — Omega Comms (Merlin, 2026-10-22): the Master
// Communications Array from his Communications-Array repo, wired
// into Olympus as a first-class program. Three feeds — Global,
// Direct (person-to-person), Squad — over Supabase tables with
// Realtime delivery; identity is the Olympus account (Supabase Auth
// session + public.profiles username), never a mock user.
//
// Honest states: signed-out and setup-pending (until
// supabase/omega-comms.sql gets Merlin's green light) are shown
// plainly; messages are never fake-sent.
//
// Satellite registration is intentionally NOT done here — adding a
// satellite touches the registry, god-menus and 31 locales, and is
// the parent's call. The page is reachable at /omega-comms today.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { OMEGA_COMMS_REPO_ID, usernameMapFromProfiles } from "@/lib/omega-comms/core";
import OmegaCommsPanel from "@/components/omega-comms/OmegaCommsPanel";

export default function OmegaCommsPage() {
  // phase: loading | signed-out | ready
  const [phase, setPhase] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const resolveUser = async (session) => {
      if (!session?.user) {
        if (!cancelled) {
          setCurrentUser(null);
          setPhase("signed-out");
        }
        return;
      }
      let username = null;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, username, type")
          .eq("user_id", session.user.id);
        if (data) username = usernameMapFromProfiles(data).get(session.user.id) || null;
      } catch {
        /* username is display sugar — the id identity still works */
      }
      if (!cancelled) {
        setCurrentUser({ id: session.user.id, username });
        setPhase("ready");
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => resolveUser(data?.session || null))
      .catch(() => {
        if (!cancelled) setPhase("signed-out");
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveUser(session);
    });

    return () => {
      cancelled = true;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="page-back">
          ← Back
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-wide text-white">Omega Comms</h1>
          <p className="text-sm text-white/60">
            Network messages for Olympus — global feed, direct messages, and squads.
          </p>
        </div>
      </div>

      {phase === "loading" && <p className="text-sm text-white/60">Opening the comms array…</p>}

      {phase === "signed-out" && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Sign in to use Omega Comms</h2>
          <p className="mt-1 text-sm text-white/60">
            Messages ride on your Olympus account — your username is how other users find you for direct messages.
            Sign in from the hub, then come back here.
          </p>
        </section>
      )}

      {phase === "ready" && currentUser && (
        <OmegaCommsPanel supabase={supabase} repoId={OMEGA_COMMS_REPO_ID} currentUser={currentUser} />
      )}
    </main>
  );
}
