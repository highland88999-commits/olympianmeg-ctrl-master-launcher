-- Handshake claim tracking: ensures only ONE Muse account acknowledges
-- a user inquiry or bug report, even when both the new and old accounts
-- are watching the same queues via /api/handshake.
--
-- claimed_by: which account/agent picked it up ('new-account' | 'old-account' | agent id)
-- claimed_at: when the claim happened
-- ack_sent: whether the user-facing "received" acknowledgment was sent

ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ack_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE muse_threads
  ADD COLUMN IF NOT EXISTS claimed_by TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ack_sent BOOLEAN DEFAULT FALSE;

-- Index for the handshake pull queries (unclaimed items first)
CREATE INDEX IF NOT EXISTS idx_bug_reports_claimed ON bug_reports (claimed_by) WHERE claimed_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_muse_threads_claimed ON muse_threads (claimed_by) WHERE claimed_by IS NULL;
