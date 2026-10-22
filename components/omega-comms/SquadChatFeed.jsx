"use client";

// components/omega-comms/SquadChatFeed.jsx
// Ported from SquadChatFeed.jsx in Merlin's Communications-Array
// repo (MIT): named group chats, created or joined by invite id.
// Same tables and flows; adaptations are the Olympus profile lookup
// for sender names and honest setup-pending reporting.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMS_TABLES,
  buildEnvStamp,
  buildMessageRow,
  flattenSquadMemberships,
  isMissingTableError,
  validateMessageText,
} from "@/lib/omega-comms/core";
import { useUsernames } from "./useUsernames";

export default function SquadChatFeed({ supabase, repoId, currentUser, onSetupMissing }) {
  const [mySquads, setMySquads] = useState([]);
  const [activeSquad, setActiveSquad] = useState(null);
  const [messages, setMessages] = useState([]);
  const [squadNote, setSquadNote] = useState("");

  const [inputText, setInputText] = useState("");
  const [newSquadName, setNewSquadName] = useState("");
  const [joinSquadId, setJoinSquadId] = useState("");

  const feedRef = useRef(null);
  const { ensure, nameFor } = useUsernames(supabase);

  // 1. Fetch the user's squads on mount
  const fetchMySquads = useCallback(async () => {
    const { data, error } = await supabase
      .from(COMMS_TABLES.squadMembers)
      .select(`squad_id, squads!inner ( id, name, leader_id, repo_id )`)
      .eq("user_id", currentUser.id)
      .eq("squads.repo_id", repoId);

    if (error) {
      if (isMissingTableError(error)) onSetupMissing?.();
      return;
    }
    if (data) setMySquads(flattenSquadMemberships(data));
  }, [supabase, repoId, currentUser.id, onSetupMissing]);

  useEffect(() => {
    fetchMySquads();
  }, [fetchMySquads]);

  // 2. Fetch active squad messages & subscribe to its realtime channel
  useEffect(() => {
    if (!activeSquad) return;
    let cancelled = false;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from(COMMS_TABLES.squadChat)
        .select("id, message, created_at, sender_id, app_name, origin_url")
        .eq("squad_id", activeSquad.id)
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

    fetchMessages();

    const channel = supabase
      .channel(`squad_${activeSquad.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: COMMS_TABLES.squadChat, filter: `squad_id=eq.${activeSquad.id}` },
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
  }, [activeSquad, supabase, ensure, onSetupMissing]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  // 3. Create a new squad (creator leads it and joins it)
  const handleCreateSquad = async () => {
    if (!newSquadName.trim()) return;

    const { data: squadData, error: squadErr } = await supabase
      .from(COMMS_TABLES.squads)
      .insert({ repo_id: repoId, name: newSquadName.trim(), leader_id: currentUser.id })
      .select()
      .single();

    if (squadErr || !squadData) {
      if (squadErr && isMissingTableError(squadErr)) onSetupMissing?.();
      else setSquadNote("Failed to initialize squad.");
      return;
    }

    await supabase.from(COMMS_TABLES.squadMembers).insert({ squad_id: squadData.id, user_id: currentUser.id });

    setNewSquadName("");
    setSquadNote("");
    await fetchMySquads();
    setActiveSquad(squadData);
  };

  // 4. Join an existing squad by its invite id
  const handleJoinSquad = async () => {
    if (!joinSquadId.trim()) return;

    const { data: existing } = await supabase
      .from(COMMS_TABLES.squads)
      .select("id")
      .eq("id", joinSquadId.trim())
      .eq("repo_id", repoId)
      .single();

    if (!existing) {
      setSquadNote("Squad ID not found in this network sector.");
      return;
    }

    const { error: joinErr } = await supabase
      .from(COMMS_TABLES.squadMembers)
      .insert({ squad_id: existing.id, user_id: currentUser.id });

    if (joinErr && joinErr.code === "23505") {
      setSquadNote("You are already stationed in this squad.");
    } else if (joinErr) {
      if (isMissingTableError(joinErr)) onSetupMissing?.();
      else setSquadNote("Could not join that squad.");
    } else {
      setJoinSquadId("");
      setSquadNote("");
      await fetchMySquads();
    }
  };

  // 5. Send a message to the active squad
  const sendMessage = async () => {
    const check = validateMessageText(inputText);
    if (!check.ok || !activeSquad) return;
    setInputText("");

    const row = buildMessageRow({
      repoId,
      senderId: currentUser.id,
      squadId: activeSquad.id,
      text: check.text,
      env: buildEnvStamp({ title: document.title, hostname: window.location.hostname }),
    });
    if (!row) return;
    const { error } = await supabase.from(COMMS_TABLES.squadChat).insert([row]);
    if (error && isMissingTableError(error)) onSetupMissing?.();
  };

  const copySquadId = () => {
    if (!activeSquad) return;
    if (navigator.clipboard) navigator.clipboard.writeText(activeSquad.id);
    setSquadNote("Squad Invite Code copied to clipboard.");
  };

  return (
    <div className="p2p-interface">
      {/* Sidebar: Squad Management */}
      <div className="contacts-sidebar">
        <div className="new-chat-box">
          <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="New Squad Name..."
              value={newSquadName}
              onChange={(e) => setNewSquadName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateSquad()}
            />
            <button className="squad-action-btn" onClick={handleCreateSquad}>
              +
            </button>
          </div>
          <div style={{ display: "flex", gap: "5px" }}>
            <input
              type="text"
              placeholder="Paste Invite ID..."
              value={joinSquadId}
              onChange={(e) => setJoinSquadId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoinSquad()}
            />
            <button className="squad-action-btn" onClick={handleJoinSquad}>
              &gt;
            </button>
          </div>
          {squadNote && (
            <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "rgba(0,255,255,0.55)" }}>{squadNote}</div>
          )}
        </div>

        <div className="contacts-list">
          {mySquads.length === 0 ? (
            <div style={{ padding: "15px", fontSize: "0.8rem", color: "rgba(0,255,255,0.4)" }}>NO SQUADS FOUND</div>
          ) : (
            mySquads.map((squad) => (
              <div
                key={squad.id}
                className={`contact-item ${activeSquad?.id === squad.id ? "active" : ""}`}
                onClick={() => setActiveSquad(squad)}
              >
                {squad.name}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="p2p-chat-area">
        {!activeSquad ? (
          <div className="p2p-placeholder">Select or create a squad to view messages.</div>
        ) : (
          <>
            <div className="p2p-chat-header" style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                Squad: <span>{activeSquad.name}</span>
              </div>
              <div className="squad-invite-code" onClick={copySquadId} title="Click to copy Squad ID">
                ID: {activeSquad.id.substring(0, 8)}... [COPY]
              </div>
            </div>

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
                placeholder="Message this squad..."
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
