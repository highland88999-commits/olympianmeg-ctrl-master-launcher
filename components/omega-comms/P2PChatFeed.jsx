"use client";

// components/omega-comms/P2PChatFeed.jsx
// Ported from P2PChatFeed.jsx in Merlin's Communications-Array repo
// (MIT) — the Direct feed: person-to-person messages with read
// receipts. Same tables, same realtime behaviour; adaptations are
// the Olympus profile lookup (contacts and names come from
// public.profiles) and honest setup-pending reporting.

import React, { useEffect, useRef, useState } from "react";
import {
  COMMS_TABLES,
  applyRealtimeEvent,
  buildEnvStamp,
  buildMessageRow,
  deriveContacts,
  isConversationMessage,
  isMissingTableError,
  normalizeUsername,
  unreadMessageIds,
  validateMessageText,
} from "@/lib/omega-comms/core";
import { useUsernames } from "./useUsernames";

export default function P2PChatFeed({ supabase, repoId, currentUser, onSetupMissing }) {
  const [contacts, setContacts] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [newContactUsername, setNewContactUsername] = useState("");
  const [contactNote, setContactNote] = useState("");
  const feedRef = useRef(null);
  const { ensure, nameFor } = useUsernames(supabase);

  // 1. Fetch unique contacts on load (derived from message history)
  useEffect(() => {
    const fetchContacts = async () => {
      const { data, error } = await supabase
        .from(COMMS_TABLES.p2p)
        .select("sender_id, receiver_id, created_at")
        .eq("repo_id", repoId)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order("created_at", { ascending: false });

      if (error) {
        if (isMissingTableError(error)) onSetupMissing?.();
        return;
      }
      if (data) {
        const found = deriveContacts(data, currentUser.id);
        setContacts(found);
        ensure(found.map((c) => c.id));
      }
    };
    fetchContacts();
  }, [supabase, repoId, currentUser.id, ensure, onSetupMissing]);

  // 2. Fetch messages & mark as read when the active contact changes
  useEffect(() => {
    if (!activeContact) return;
    let cancelled = false;

    const markRead = async (rows) => {
      const unreadIds = unreadMessageIds(rows, currentUser.id);
      if (unreadIds.length === 0) return;
      await supabase
        .from(COMMS_TABLES.p2p)
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
    };

    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from(COMMS_TABLES.p2p)
        .select("*")
        .eq("repo_id", repoId)
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeContact.id}),and(sender_id.eq.${activeContact.id},receiver_id.eq.${currentUser.id})`
        )
        .order("created_at", { ascending: true });

      if (error) {
        if (isMissingTableError(error)) onSetupMissing?.();
        return;
      }
      if (data && !cancelled) {
        setMessages(data);
        await markRead(data);
      }
    };

    fetchHistory();

    // 3. Real-Time Channel for this conversation
    const channel = supabase
      .channel(`p2p_${currentUser.id}_${activeContact.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: COMMS_TABLES.p2p, filter: `repo_id=eq.${repoId}` },
        (payload) => {
          // DELETE payloads carry only the primary key in `old`, so no
          // conversation check is possible — removing by id from this
          // conversation's own list is already correctly scoped.
          if (payload.eventType === "DELETE") {
            setMessages((prev) => applyRealtimeEvent(prev, payload));
            return;
          }
          if (!isConversationMessage(payload.new, currentUser.id, activeContact.id)) return;
          setMessages((prev) => applyRealtimeEvent(prev, payload));
          // A message that arrives while we are looking at the chat is read instantly
          if (payload.eventType === "INSERT" && payload.new.receiver_id === currentUser.id) {
            supabase
              .from(COMMS_TABLES.p2p)
              .update({ read_at: new Date().toISOString() })
              .eq("id", payload.new.id);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeContact, supabase, repoId, currentUser.id, onSetupMissing]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  const startNewChat = async () => {
    const username = normalizeUsername(newContactUsername);
    if (!username) return;

    // Look up the account by its exact public username
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, username")
      .eq("username", username)
      .limit(1);

    const profile = !error && data && data.length > 0 ? data[0] : null;
    if (profile && profile.user_id !== currentUser.id) {
      const contact = { id: profile.user_id };
      ensure([profile.user_id]);
      if (!contacts.find((c) => c.id === contact.id)) setContacts((prev) => [contact, ...prev]);
      setActiveContact(contact);
      setNewContactUsername("");
      setContactNote("");
    } else if (profile) {
      setContactNote("That is your own username.");
    } else {
      setContactNote("User not found on the network.");
    }
  };

  const sendMessage = async () => {
    const check = validateMessageText(inputText);
    if (!check.ok || !activeContact) return;
    setInputText("");

    const row = buildMessageRow({
      repoId,
      senderId: currentUser.id,
      receiverId: activeContact.id,
      text: check.text,
      env: buildEnvStamp({ title: document.title, hostname: window.location.hostname }),
    });
    if (!row) return;
    const { error } = await supabase.from(COMMS_TABLES.p2p).insert([row]);
    if (error && isMissingTableError(error)) onSetupMissing?.();
  };

  const contactName = (contact) => nameFor(contact.id);

  return (
    <div className="p2p-interface">
      {/* Sidebar: Contacts */}
      <div className="contacts-sidebar">
        <div className="new-chat-box">
          <input
            type="text"
            placeholder="Search username..."
            value={newContactUsername}
            onChange={(e) => setNewContactUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startNewChat()}
          />
          {contactNote && (
            <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "rgba(0,255,255,0.55)" }}>{contactNote}</div>
          )}
        </div>
        <div className="contacts-list">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`contact-item ${activeContact?.id === contact.id ? "active" : ""}`}
              onClick={() => setActiveContact(contact)}
            >
              {contactName(contact)}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="p2p-chat-area">
        {!activeContact ? (
          <div className="p2p-placeholder">Select a contact to start messaging.</div>
        ) : (
          <>
            <div className="p2p-chat-header">
              Chatting with: <span>{contactName(activeContact)}</span>
            </div>
            <div className="message-feed" ref={feedRef}>
              {messages.map((msg) => {
                const isMe = msg.sender_id === currentUser.id;
                const senderName = isMe
                  ? currentUser.username || nameFor(msg.sender_id)
                  : contactName(activeContact);

                return (
                  <div key={msg.id} className={`message-wrapper ${isMe ? "msg-right" : "msg-left"}`}>
                    <span className="msg-sender">{senderName}</span>

                    {(msg.app_name || msg.origin_url) && (
                      <span className="msg-env">
                        [{msg.app_name}] {"//"} {msg.origin_url}
                      </span>
                    )}

                    <div className={`message-bubble ${isMe ? "my-bubble" : "their-bubble"}`}>{msg.message}</div>
                    {isMe && <span className="msg-status">{msg.read_at ? "[READ]" : "[DELIVERED]"}</span>}
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
                placeholder="Message this contact..."
              />
              <button className="send-btn" onClick={sendMessage}>
                SEND
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
