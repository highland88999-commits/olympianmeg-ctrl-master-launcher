"use client";

// components/omega-comms/OmegaCommsPanel.jsx
// Ported from CommunicationsArray.jsx in Merlin's Communications-
// Array repo (MIT): the tabbed shell — GLOBAL / DIRECT / SQUAD —
// over the three feeds. Adaptations for Olympus: it renders as a
// page panel instead of a fixed overlay (no close button; the page
// provides navigation), the external background video is replaced
// by the .comm-panel-bg CSS wash (see omega-comms.css), and a
// missing database shows one honest setup-pending note instead of
// three broken feeds.

import React, { useCallback, useState } from "react";
import { COMMS_TABS } from "@/lib/omega-comms/core";
import GlobalChatFeed from "./GlobalChatFeed";
import P2PChatFeed from "./P2PChatFeed";
import SquadChatFeed from "./SquadChatFeed";
import "./omega-comms.css";

export default function OmegaCommsPanel({ supabase, repoId, currentUser }) {
  const [activeTab, setActiveTab] = useState("global");
  const [setupMissing, setSetupMissing] = useState(false);

  const handleSetupMissing = useCallback(() => setSetupMissing(true), []);

  const feedProps = { supabase, repoId, currentUser, onSetupMissing: handleSetupMissing };

  return (
    <div className="omega-comms-root">
      <div className="comm-panel">
        <div className="comm-panel-bg" aria-hidden="true" />

        <div className="comm-header">
          <h2>OMEGA COMMS</h2>
          <span style={{ fontSize: "0.7rem", letterSpacing: "2px", opacity: 0.6 }}>NETWORK MESSAGES</span>
        </div>

        <div className="tab-container">
          {COMMS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="feed-container">
          {setupMissing ? (
            <div className="omega-comms-note">
              <h3>DATABASE SETUP PENDING</h3>
              <p>
                The Omega Comms tables are not in the database yet, so nothing can be sent or received — and nothing
                here pretends otherwise. Once the setup in supabase/omega-comms.sql is run, this panel lights up on
                its own.
              </p>
            </div>
          ) : (
            <>
              {activeTab === "global" && <GlobalChatFeed {...feedProps} />}
              {activeTab === "p2p" && <P2PChatFeed {...feedProps} />}
              {activeTab === "squads" && <SquadChatFeed {...feedProps} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
