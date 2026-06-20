-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: deployments
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  status TEXT NOT NULL,   -- pending, running, success, failed, rolled_back
  risk_score INTEGER,
  strategy TEXT,
  current_stage TEXT,
  deploy_history JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: incidents
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id),
  type TEXT NOT NULL,     -- build_failure, test_failure, prod_anomaly, rollback
  root_cause TEXT,
  raw_logs TEXT,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: runbooks
CREATE TABLE IF NOT EXISTS runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  trigger_pattern TEXT,
  steps JSONB,
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: team_patterns
CREATE TABLE IF NOT EXISTS team_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_email TEXT,
  failure_type TEXT,
  frequency INTEGER DEFAULT 1,
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Table: uipath_jobs
CREATE TABLE IF NOT EXISTS uipath_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  process_name TEXT NOT NULL,
  robot_name TEXT,
  state TEXT NOT NULL,      -- Pending, Running, Successful, Faulted
  input_arguments JSONB,
  output_arguments JSONB,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: uipath_queue_items
CREATE TABLE IF NOT EXISTS uipath_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL,     -- New, InProgress, Failed, Successful
  exception_type TEXT,      -- BusinessException, ApplicationException
  exception_reason TEXT,
  processing_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

