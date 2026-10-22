"use client";

// components/omega-comms/useUsernames.js
// Display-name resolution for Omega Comms. The source joined a
// user_profiles table; Olympus keeps public names in public.profiles
// (personal + business rows per account). This hook batches lookups
// by auth user id and caches them for the life of the panel, so the
// feeds can render a username for any sender id on demand.

import { useCallback, useRef, useState } from "react";
import { usernameMapFromProfiles } from "@/lib/omega-comms/core";

export function useUsernames(supabase) {
  const [names, setNames] = useState(() => new Map());
  const requestedRef = useRef(new Set());

  const ensure = useCallback(
    async (ids) => {
      if (!supabase) return;
      const wanted = [...new Set((ids || []).filter(Boolean))].filter(
        (id) => !requestedRef.current.has(id)
      );
      if (wanted.length === 0) return;
      wanted.forEach((id) => requestedRef.current.add(id));
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, username, type")
          .in("user_id", wanted);
        if (error || !data) return;
        const found = usernameMapFromProfiles(data);
        if (found.size === 0) return;
        setNames((prev) => {
          const next = new Map(prev);
          found.forEach((username, userId) => next.set(userId, username));
          return next;
        });
      } catch {
        /* names are decoration — a failed lookup leaves the id fallback */
      }
    },
    [supabase]
  );

  const nameFor = useCallback(
    (id) => {
      if (!id) return "unknown";
      return names.get(id) || id;
    },
    [names]
  );

  return { ensure, nameFor };
}
