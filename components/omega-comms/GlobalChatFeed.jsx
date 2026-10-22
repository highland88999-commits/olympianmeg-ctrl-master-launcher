"use client";

// components/omega-comms/GlobalChatFeed.jsx
// Ported from GlobalChatFeed.jsx in Merlin's Communications-Array
// repo (MIT). Same feed, same realtime channel; adaptations are the
// Olympus profile lookup (public.profiles instead of the source's
// user_profiles join) and honest setup-pending reporting.

import React, { useEffect, useRef, useState } from "react";
import {
  COMMS_TABLES,
  buildEnvStamp,
  buildMessageRow,
  isMissingTableError,
  validateMessageText,
} from "@/lib/omega-comms/core";
import { useUsernames } from "./useUsernames";

export default function GlobalChatFeed({ supabase, repoId, currentUser, onSetupMissing }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const feedRef = useRef(null);
  const { ensure, nameFor } = useUsernames(supabase);

  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from(COMMS_TABLES.global)
        .select("id, message, created_at, sender_id, app_name, origin_url")
        .eq("repo_id", repoId)
        .order("created_at", { ascending: true });

      if (error) {
        if (isMissingTableError(error)) onSetupMissing?.();
        return;
      }
      if (data && !cancelled) {
        setMessages(data);
        ensure(data.map((m) => m.sender_id));
      }
    };

    fetchHistory();

    // Real-Time Subspace Channel (source channel name preserved)
    const channel = supabase
      .channel(`global_${repoId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: COMMS_TABLES.global, filter: `repo_id=eq.${repoId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          ensure([payload.new.sender_id]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, repoId, ensure, onSetupMissing]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    const check = validateMessageText(inputText);
    if (!check.ok) return;
    setInputText("");

    const row = buildMessageRow({
      repoId,
      senderId: currentUser.id,
      text: check.text,
      env: buildEnvStamp({ title: document.title, hostname: window.location.hostname }),
    });
    if (!row) return;
    const { error } = await supabase.from(COMMS_TABLES.global).insert([row]);
    if (error && isMissingTableError(error)) onSetupMissing?.();
  };

  return (
    <div className="chat-interface">
      <div className="message-feed" ref={feedRef}>
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser.id;
          const senderName = isMe && currentUser.username ? currentUser.username : nameFor(msg.sender_id);
          return (
            <div key={msg.id} className={`message-wrapper ${isMe ? "msg-right" : "msg-left"}`}>
              <span className="msg-sender">{senderName}</span>

              {(msg.app_name || msg.origin_url) && (
                <span className="msg-env">
                  [{msg.app_name}] {"//"} {msg.origin_url}
                </span>
              )}

              <div className={`message-bubble ${isMe ? "my-bubble" : "their-bubble"}`}>{msg.message}</div>
            </div>
          );
        })}
      </div>

      <div className="input-container">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Send a message to everyone..."
        />
        <button className="send-btn" onClick={sendMessage}>
          SEND
        </button>
      </div>
    </div>
  );
}
