-- AEGIS Security Grid — database tables
-- DO NOT RUN until Merlin gives the green light.
--
-- Tables:
--   aegis_ip_log       — traced attacker IP addresses
--   aegis_incidents    — attack incident reports
--   aegis_agent_status — grid status snapshots

-- IP log: every traced attacker IP
CREATE TABLE IF NOT EXISTS aegis_ip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 1,
  classifications JSONB NOT NULL DEFAULT '{}',
  paths TEXT[] NOT NULL DEFAULT '{}',
  blacklisted BOOLEAN NOT NULL DEFAULT false,
  blacklist_reason TEXT,
  blacklist_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ip)
);

CREATE INDEX IF NOT EXISTS idx_aegis_ip_log_ip ON aegis_ip_log(ip);
CREATE INDEX IF NOT EXISTS idx_aegis_ip_log_blacklisted ON aegis_ip_log(blacklisted) WHERE blacklisted = true;
CREATE INDEX IF NOT EXISTS idx_aegis_ip_log_last_seen ON aegis_ip_log(last_seen DESC);

-- Incidents: attack reports filed to area programs
CREATE TABLE IF NOT EXISTS aegis_incidents (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  area_program TEXT NOT NULL DEFAULT 'core',
  target_path TEXT NOT NULL DEFAULT '/',
  severity INTEGER NOT NULL DEFAULT 1 CHECK (severity BETWEEN 0 AND 3),
  grid_mode TEXT NOT NULL DEFAULT 'engaged',
  attacker_count INTEGER NOT NULL DEFAULT 0,
  unique_ips INTEGER NOT NULL DEFAULT 0,
  blacklisted_ips INTEGER NOT NULL DEFAULT 0,
  countermeasures JSONB NOT NULL DEFAULT '[]',
  top_ips JSONB NOT NULL DEFAULT '[]',
  law_enforcement_notified BOOLEAN NOT NULL DEFAULT false,
  law_enforcement_email_to TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aegis_incidents_severity ON aegis_incidents(severity DESC);
CREATE INDEX IF NOT EXISTS idx_aegis_incidents_area ON aegis_incidents(area_program);
CREATE INDEX IF NOT EXISTS idx_aegis_incidents_reported ON aegis_incidents(reported_at DESC);

-- Grid status snapshots (for dashboard history)
-- active_agents default = the standing baseline: 10,000,000,000 since
-- the 2026-10-21 expansion (was 1,000,000 at first build).
CREATE TABLE IF NOT EXISTS aegis_agent_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode TEXT NOT NULL DEFAULT 'watchdog',
  active_agents BIGINT NOT NULL DEFAULT 10000000000,
  reserve_agents BIGINT NOT NULL DEFAULT 0,
  threat_level INTEGER NOT NULL DEFAULT 0,
  attackers_detected BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_aegis_agent_status_recorded ON aegis_agent_status(recorded_at DESC);

-- RLS: owner-only access (service_role bypasses RLS)
ALTER TABLE aegis_ip_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_agent_status ENABLE ROW LEVEL SECURITY;

-- No public policies: only service_role can read/write.
-- (Authenticated users get no access; the API routes use service_role server-side.)
