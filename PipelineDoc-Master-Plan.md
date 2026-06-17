# 🚀 PipelineDoc — Master Project Plan
> **Project Manager:** AI Orchestrator  
> **Version:** 1.0  
> **Type:** Agentic CI/CD Layer — Between Code & Production  
> **Status:** Planning Phase  

---

## 📋 TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Agent Roster — Who Does What](#2-agent-roster)
3. [Phase 0 — Foundation & Setup](#phase-0--foundation--setup)
4. [Phase 1 — Failure Doctor (MVP)](#phase-1--failure-doctor-mvp)
5. [Phase 2 — Gatekeeper](#phase-2--gatekeeper)
6. [Phase 3 — Deployment Planner](#phase-3--deployment-planner)
7. [Phase 4 — Production Monitor](#phase-4--production-monitor)
8. [Phase 5 — Auto-Healer](#phase-5--auto-healer)
9. [Phase 6 — Intelligence & Memory](#phase-6--intelligence--memory)
10. [Phase 7 — Conversational UI](#phase-7--conversational-ui)
11. [Phase 8 — UiPath Cloud Integration](#phase-8--uipath-cloud-integration)
12. [Phase 9 — Dashboard & Frontend](#phase-9--dashboard--frontend)
13. [Phase 10 — Testing, Security & Launch](#phase-10--testing-security--launch)
14. [Data Flow Architecture](#data-flow-architecture)
15. [Tech Stack](#tech-stack)
16. [Done Definition Per Phase](#done-definition-per-phase)

---

## 1. PROJECT OVERVIEW

**What is PipelineDoc?**  
An AI-powered agent layer that sits between your source code and production. It acts as a doctor, gatekeeper, planner, and auto-healer for the entire software delivery pipeline. It does not replace CI/CD tools — it wraps around them and gives them a brain.

**Core Loop:**
```
Code Push → Agent Analyzes → Agent Plans → Agent Gates → Deploy → Agent Monitors → Agent Heals
```

**Key Principle:** Every task in this plan must be completed in order within each phase. No phase starts until the previous one is marked ✅ DONE. Each todo item has an assigned subagent and exact instructions.

---

## 2. AGENT ROSTER

These are the subagents. Each one owns specific tasks in the plan below.

| Agent ID | Agent Name | Role | Tools |
|---|---|---|---|
| `@InfraAgent` | Infrastructure Agent | Sets up servers, DBs, cloud resources, OCI/Terraform | Terraform, OCI CLI, Docker |
| `@IntegrationAgent` | Integration Agent | Connects GitHub, CI providers, webhooks, APIs | GitHub API, UiPath CLI, REST APIs |
| `@AnalysisAgent` | Analysis Agent | Reads logs, diffs, traces, does RCA | Claude API, log parsers, AST tools |
| `@GatekeeperAgent` | Gatekeeper Agent | Pre-deploy checks, risk scoring, security scans | OWASP tools, Snyk, Semgrep |
| `@PlannerAgent` | Planner Agent | Generates deploy strategies, rollback plans | Claude API, Kubernetes API |
| `@MonitorAgent` | Monitor Agent | Watches production, detects anomalies | Prometheus, Grafana, CloudWatch |
| `@HealerAgent` | Healer Agent | Auto-rollbacks, restarts, hotfix PRs | UiPath Healing Agent, K8s API |
| `@MemoryAgent` | Memory Agent | Stores history, learns patterns, indexes knowledge | Vector DB, Postgres, embeddings |
| `@UIAgent` | UI/Frontend Agent | Builds dashboard, chat interface, Slack bots | React, Tailwind, Slack API |
| `@TestAgent` | Test Agent | Runs test suites, validates code quality | UiPath Test Cloud, Jest, Pytest |
| `@OrchestratorAgent` | Orchestrator | Master coordinator — routes tasks to subagents | UiPath Maestro / Claude API |

---

## PHASE 0 — FOUNDATION & SETUP

> **Owner:** `@InfraAgent` + `@OrchestratorAgent`  
> **Goal:** Project scaffolding, repo structure, cloud resources, base configs  
> **Estimated Time:** 3–5 days

---

### 0.1 — Repository Setup
**Assigned to:** `@InfraAgent`

- [x] **0.1.1** Create a new GitHub repository named `pipelinedoc`
  - Visibility: Private
  - Initialize with README.md
  - Add `.gitignore` for Node, Python, Terraform
  - Add MIT or Apache-2.0 LICENSE

- [x] **0.1.2** Create the following folder structure exactly:
  ```
  pipelinedoc/
  ├── agents/
  │   ├── analysis/          # Failure Doctor logic
  │   ├── gatekeeper/        # Pre-deploy checks
  │   ├── planner/           # Deploy strategy
  │   ├── monitor/           # Production watcher
  │   ├── healer/            # Auto-remediation
  │   ├── memory/            # Knowledge store
  │   └── orchestrator/      # Master agent
  ├── api/                   # REST API server (Node/Express or FastAPI)
  ├── frontend/              # React dashboard
  ├── integrations/
  │   ├── github/
  │   ├── uipath/
  │   ├── slack/
  │   └── cloud/
  ├── infra/                 # Terraform / OCI configs
  ├── scripts/               # Utility scripts
  ├── tests/                 # Test suites
  ├── docs/                  # Documentation
  └── docker-compose.yml
  ```

- [x] **0.1.3** Set up branch protection rules:
  - `main` branch: require PR + 1 review, no direct push
  - `dev` branch: working branch for all development
  - Create `dev` branch immediately

- [x] **0.1.4** Create GitHub Project board with columns: `Backlog → In Progress → Review → Done`

- [x] **0.1.5** Add all phase tasks from this document as GitHub Issues, tagged by phase label

---

### 0.2 — Environment Configuration
**Assigned to:** `@InfraAgent`

- [x] **0.2.1** Create `.env.example` file with all required environment variables:
  ```env
  # Anthropic
  ANTHROPIC_API_KEY=

  # GitHub
  GITHUB_TOKEN=
  GITHUB_WEBHOOK_SECRET=

  # UiPath
  UIPATH_CLIENT_ID=
  UIPATH_CLIENT_SECRET=
  UIPATH_TENANT_NAME=
  UIPATH_ORGANIZATION_ID=

  # Database
  POSTGRES_URL=
  REDIS_URL=
  VECTOR_DB_URL=

  # OCI
  OCI_COMPARTMENT_ID=
  OCI_TENANCY_OCID=
  OCI_USER_OCID=
  OCI_FINGERPRINT=
  OCI_PRIVATE_KEY_PATH=

  # Slack
  SLACK_BOT_TOKEN=
  SLACK_SIGNING_SECRET=
  SLACK_CHANNEL_ID=

  # App
  APP_PORT=3000
  NODE_ENV=development
  JWT_SECRET=
  ```

- [x] **0.2.2** Set up GitHub Secrets for all env vars in the repo settings (never commit real keys)

- [x] **0.2.3** Create `config/` directory with separate config files per service:
  - `config/anthropic.js`
  - `config/github.js`
  - `config/uipath.js`
  - `config/database.js`

---

### 0.3 — Cloud Infrastructure (OCI)
**Assigned to:** `@InfraAgent`

- [x] **0.3.1** Write Terraform config in `infra/` to provision:
  - 1x OCI Ampere A1 Flex (Always Free) — 4 OCPUs, 24GB RAM
  - 1x OCI Block Volume — 50GB for persistent data
  - VCN with public + private subnet
  - Security list: allow TCP 3000 (API), TCP 5432 (Postgres), TCP 6379 (Redis)

- [x] **0.3.2** Run `terraform init && terraform plan` — verify output before apply

- [x] **0.3.3** Run `terraform apply` — capture all output resource IDs, store in `.terraform.tfstate` (add to .gitignore)

- [x] **0.3.4** SSH into provisioned instance and run initial setup:
  ```bash
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y docker.io docker-compose git curl
  sudo usermod -aG docker ubuntu
  ```

- [x] **0.3.5** Verify Docker and Docker Compose are working:
  ```bash
  docker --version
  docker-compose --version
  ```

---

### 0.4 — Database Setup
**Assigned to:** `@InfraAgent`

- [x] **0.4.1** Create `docker-compose.yml` with the following services:
  ```yaml
  services:
    postgres:
      image: postgres:16
      ports: ["5432:5432"]
      environment:
        POSTGRES_DB: pipelinedoc
        POSTGRES_USER: admin
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      volumes:
        - pgdata:/var/lib/postgresql/data

    redis:
      image: redis:7-alpine
      ports: ["6379:6379"]

    qdrant:
      image: qdrant/qdrant
      ports: ["6333:6333"]
      volumes:
        - qdrantdata:/qdrant/storage

  volumes:
    pgdata:
    qdrantdata:
  ```

- [x] **0.4.2** Run `docker-compose up -d postgres redis qdrant`

- [x] **0.4.3** Write and run database migration script `scripts/db-init.sql`:
  ```sql
  CREATE TABLE deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo TEXT NOT NULL,
    branch TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    status TEXT NOT NULL,   -- pending, running, success, failed, rolled_back
    risk_score INTEGER,
    strategy TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID REFERENCES deployments(id),
    type TEXT NOT NULL,     -- build_failure, test_failure, prod_anomaly, rollback
    root_cause TEXT,
    raw_logs TEXT,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE runbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    trigger_pattern TEXT,
    steps JSONB,
    success_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE team_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_email TEXT,
    failure_type TEXT,
    frequency INTEGER DEFAULT 1,
    last_seen TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [x] **0.4.4** Verify all tables created successfully: `\dt` in psql

---

### 0.5 — API Server Scaffold
**Assigned to:** `@InfraAgent`

- [x] **0.5.1** Initialize Node.js project in `api/`:
  ```bash
  cd api && npm init -y
  npm install express dotenv cors helmet morgan jsonwebtoken
  npm install @anthropic-ai/sdk axios pg redis ioredis
  npm install -D nodemon eslint
  ```

- [x] **0.5.2** Create `api/src/index.js` entry point with Express server, middleware (helmet, cors, morgan), and health check route `GET /health → { status: "ok" }`

- [x] **0.5.3** Create route structure:
  ```
  api/src/routes/
  ├── deployments.js
  ├── incidents.js
  ├── analysis.js
  ├── webhooks.js
  └── chat.js
  ```

- [x] **0.5.4** Start server and verify `GET /health` returns 200

---

### ✅ Phase 0 Done When:
- [x] Repo created with full folder structure
- [x] OCI instance running with Docker
- [x] Postgres, Redis, Qdrant all healthy
- [x] API server starts and returns 200 on `/health`
- [x] All env vars documented in `.env.example`

---

## PHASE 1 — FAILURE DOCTOR (MVP)

> **Owner:** `@AnalysisAgent` + `@IntegrationAgent`  
> **Goal:** Agent can receive CI failure logs, analyze root cause, and return a diagnosis  
> **Estimated Time:** 5–7 days  
> **Depends on:** Phase 0 ✅

---

### 1.1 — GitHub Webhook Integration
**Assigned to:** `@IntegrationAgent`

- [ ] **1.1.1** Create `integrations/github/webhook.js` — receives GitHub webhook events
  - Events to listen: `workflow_run`, `check_run`, `push`, `pull_request`
  - Verify webhook signature using `GITHUB_WEBHOOK_SECRET`
  - Route events to appropriate handlers

- [ ] **1.1.2** Register webhook on your GitHub repo:
  - Go to repo Settings → Webhooks → Add webhook
  - Payload URL: `https://YOUR_OCI_IP:3000/webhooks/github`
  - Content type: `application/json`
  - Secret: value from `.env`
  - Events: Workflow runs, Check runs, Pull requests

- [ ] **1.1.3** Test webhook by pushing a commit and verifying the server receives the event (log it to console first)

- [ ] **1.1.4** Create `integrations/github/client.js` — GitHub API client:
  - `getWorkflowLogs(owner, repo, runId)` → fetches raw logs from GitHub Actions
  - `getCommitDiff(owner, repo, sha)` → fetches the diff for a commit
  - `getPRDetails(owner, repo, prNumber)` → fetches PR metadata
  - `createPRComment(owner, repo, prNumber, body)` → posts comment on PR

- [ ] **1.1.5** Write unit test for each GitHub client function using mock data in `tests/integrations/github.test.js`

---

### 1.2 — Log Ingestion Pipeline
**Assigned to:** `@AnalysisAgent`

- [ ] **1.2.1** Create `agents/analysis/log-ingester.js`:
  - Input: raw GitHub Actions log text (can be very long, 50k+ tokens)
  - Step 1: Strip ANSI color codes from logs
  - Step 2: Remove timestamp prefixes
  - Step 3: Detect log sections (build, test, deploy) by header patterns
  - Step 4: Extract only ERROR, FATAL, FAILED lines + 5 lines of context around each
  - Step 5: Truncate to 8000 tokens max for Claude API input
  - Output: structured object `{ sections: [], errors: [], warnings: [], truncated: boolean }`

- [ ] **1.2.2** Create `agents/analysis/diff-parser.js`:
  - Input: raw git diff text
  - Extracts: list of changed files, lines added/removed per file, new function names added
  - Output: `{ files: [{path, additions, deletions, isNew, isDeleted}], summary: string }`

- [ ] **1.2.3** Test log-ingester with a real GitHub Actions failure log (save one as `tests/fixtures/sample-failure.log`)

---

### 1.3 — Root Cause Analysis Engine
**Assigned to:** `@AnalysisAgent`

- [ ] **1.3.1** Create `agents/analysis/rca-engine.js` — the core Failure Doctor:
  - Function: `analyzeFailure({ logs, diff, commitMessage, previousRuns })`
  - Calls Claude API (model: `claude-sonnet-4-6`) with the following system prompt:
    ```
    You are PipelineDoc Failure Doctor, an expert CI/CD diagnostic agent.
    Given CI failure logs and a code diff, you must:
    1. Identify the ROOT CAUSE of the failure (be specific — file, line, function if possible)
    2. Classify the failure type: build_error | test_failure | dependency_issue | config_error | flaky_test | environment_issue
    3. Assign a confidence score 0-100
    4. Suggest 1-3 specific fixes
    5. Check if this error appeared in previous runs (flakiness signal)
    Respond in JSON only. No explanation text outside JSON.
    ```
  - Response schema:
    ```json
    {
      "root_cause": "string",
      "failure_type": "string",
      "confidence": 0-100,
      "affected_file": "string or null",
      "affected_line": "number or null",
      "is_flaky": boolean,
      "fixes": ["string"],
      "summary": "one sentence plain English"
    }
    ```

- [ ] **1.3.2** Add retry logic — if Claude API call fails, retry up to 3 times with exponential backoff (1s, 2s, 4s)

- [ ] **1.3.3** Save every RCA result to `incidents` table in Postgres with `raw_logs`, `root_cause`, `type`

- [ ] **1.3.4** Create `agents/analysis/blame-attribution.js`:
  - Input: commit SHA, RCA result
  - Calls GitHub API to get commit author from the SHA
  - Checks the last 5 commits to the affected file
  - Output: `{ author_email, author_name, commit_sha, blame_confidence }`

- [ ] **1.3.5** Create `agents/analysis/flaky-detector.js`:
  - Queries last 10 runs of the same workflow from `incidents` table
  - If same error appears >3 times in 10 runs: flag as flaky, confidence = high
  - If same error appeared and passed on retry: flag as flaky
  - Output: `{ is_flaky: boolean, flaky_confidence: 0-100, historical_occurrences: number }`

---

### 1.4 — Failure Notification
**Assigned to:** `@IntegrationAgent`

- [ ] **1.4.1** Create `integrations/slack/client.js`:
  - Function: `sendDiagnosisAlert(channel, diagnosis)` — posts formatted Slack message
  - Format must include:
    - ❌ header with repo name and branch
    - Root cause in plain English
    - Failure type badge
    - Confidence score
    - Top fix suggestion
    - Link to GitHub Actions run
    - "Is Flaky?" indicator if applicable

- [ ] **1.4.2** Create Slack App at api.slack.com:
  - Bot Token Scopes: `chat:write`, `channels:read`, `files:write`
  - Install to your workspace
  - Copy `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` to `.env`

- [ ] **1.4.3** Create `integrations/github/pr-commenter.js`:
  - After RCA on a PR, post a comment to the PR with the diagnosis
  - Comment format: collapsible `<details>` block with full diagnosis + fix suggestions

- [ ] **1.4.4** Wire everything together in `agents/orchestrator/failure-flow.js`:
  ```
  GitHub webhook (workflow_run failed)
    → fetch logs (IntegrationAgent)
    → fetch diff (IntegrationAgent)
    → ingest logs (AnalysisAgent)
    → run RCA (AnalysisAgent)
    → check flakiness (AnalysisAgent)
    → get blame (AnalysisAgent)
    → save to DB (MemoryAgent)
    → post to Slack (IntegrationAgent)
    → comment on PR (IntegrationAgent)
  ```

---

### ✅ Phase 1 Done When:
- [ ] Push a commit that breaks CI → Slack message received within 60 seconds with diagnosis
- [ ] Diagnosis includes root cause, failure type, fix suggestion
- [ ] PR gets a comment with the diagnosis
- [ ] Incident saved to Postgres `incidents` table
- [ ] Flaky test detection working on repeated failures

---

## PHASE 2 — GATEKEEPER

> **Owner:** `@GatekeeperAgent` + `@TestAgent`  
> **Goal:** Score every PR for risk before it merges. Block high-risk deploys.  
> **Estimated Time:** 5–7 days  
> **Depends on:** Phase 1 ✅

---

### 2.1 — Risk Scoring Engine
**Assigned to:** `@GatekeeperAgent`

- [ ] **2.1.1** Create `agents/gatekeeper/risk-scorer.js`:
  - Input: PR diff, changed files list, author history from DB
  - Scoring model (0–100, higher = riskier):
    - Files changed > 20: +20 points
    - DB migration files touched: +30 points
    - Auth/security files touched (auth/, middleware/, jwt, password): +25 points
    - API contract files changed (openapi.yml, routes/): +20 points
    - `package.json` or `requirements.txt` changed: +15 points
    - Author has >2 incidents in last 30 days: +10 points
    - No test files changed alongside code files: +15 points
    - Config files changed (`.env`, `docker-compose`, `terraform`): +20 points
  - Risk levels: `low (0-30)` | `medium (31-60)` | `high (61-80)` | `critical (81-100)`

- [ ] **2.1.2** Create `agents/gatekeeper/breaking-change-detector.js`:
  - Checks if any exported function signatures changed (TypeScript AST parsing)
  - Checks if REST API routes were removed or parameters changed
  - Checks if DB schema columns were dropped or renamed (look for `DROP COLUMN`, `RENAME`)
  - Checks if environment variable names were changed
  - Output: `{ has_breaking_changes: boolean, changes: [{ type, description, file }] }`

- [ ] **2.1.3** Create `agents/gatekeeper/dependency-scanner.js`:
  - Reads `package.json` or `requirements.txt` diff
  - Calls Snyk API (free tier) or OSV.dev API (free) to check for known CVEs in new/updated packages
  - Output: `{ vulnerabilities: [{ package, version, severity, cve_id, fix_version }] }`

- [ ] **2.1.4** Create `agents/gatekeeper/secret-detector.js`:
  - Scans diff for patterns: API keys, JWT secrets, passwords in code
  - Patterns to detect: `sk-`, `AIza`, `AKIA`, `ghp_`, base64 strings >40 chars, strings containing `password=` or `secret=`
  - Output: `{ secrets_found: boolean, findings: [{ file, line, pattern_type }] }`

---

### 2.2 — Pre-Deploy Gate Decision
**Assigned to:** `@GatekeeperAgent`

- [ ] **2.2.1** Create `agents/gatekeeper/gate-decision.js`:
  - Aggregates: risk score + breaking changes + vulnerabilities + secret scan
  - Decision rules:
    - `secrets_found = true` → **BLOCK** (no exceptions)
    - `risk_score >= 81` → **BLOCK** (require manual override)
    - `vulnerability severity = critical` → **BLOCK**
    - `risk_score 61-80` → **WARN** (flag but allow)
    - `risk_score 0-60` → **PASS**
  - Output: `{ decision: PASS|WARN|BLOCK, reason: string, risk_score: number, details: {} }`

- [ ] **2.2.2** Create GitHub Status Check integration:
  - For every PR, create a GitHub Check Run named `PipelineDoc / Gate`
  - Status: `success` (PASS), `neutral` (WARN), `failure` (BLOCK)
  - Include full gate report in check details

- [ ] **2.2.3** Create override mechanism:
  - If a PR has label `gate-override` AND is approved by 2 reviewers, allow blocked PRs through
  - Log all overrides to `incidents` table with type `gate_override`

---

### 2.3 — UiPath Test Cloud Integration
**Assigned to:** `@TestAgent`

- [ ] **2.3.1** Create `integrations/uipath/test-cloud.js`:
  - Function: `triggerTestSuite(suiteId, environment)` → starts a test suite run
  - Function: `pollTestResults(executionId)` → polls every 15s until complete
  - Function: `getTestReport(executionId)` → returns pass/fail/flaky per test case

- [ ] **2.3.2** Authenticate with UiPath Automation Cloud:
  - Use Client Credentials OAuth2 flow
  - Endpoint: `https://account.uipath.com/oauth/token`
  - Store token in Redis with TTL = expiry - 60s (auto-refresh)

- [ ] **2.3.3** Wire test results into gate decision:
  - If test suite fails: add +40 to risk score
  - If flaky tests detected by UiPath Test Cloud: add +15

---

### ✅ Phase 2 Done When:
- [ ] Open a PR with a hardcoded secret → PR gets BLOCKED with GitHub Check
- [ ] Open a PR touching auth files → PR gets WARN with risk score shown
- [ ] Clean PR → GitHub Check shows PASS with risk score 0-30
- [ ] UiPath Test Cloud suite triggers on new PRs and result feeds into gate

---

## PHASE 3 — DEPLOYMENT PLANNER

> **Owner:** `@PlannerAgent`  
> **Goal:** For each deploy, generate an intelligent strategy, ordering, and rollback plan  
> **Estimated Time:** 4–6 days  
> **Depends on:** Phase 2 ✅

---

### 3.1 — Strategy Selector
**Assigned to:** `@PlannerAgent`

- [ ] **3.1.1** Create `agents/planner/strategy-selector.js`:
  - Input: risk score, changed services, number of users affected, time of day
  - Strategy rules:
    - `risk_score >= 61`: **canary** (5% → 25% → 100% with health checks between)
    - `risk_score 31-60`: **blue/green** (full switch with instant rollback capability)
    - `risk_score 0-30` + no DB changes: **rolling** (replace pods one at a time)
    - DB migration present: **maintenance window** (drain traffic, migrate, deploy, restore)
  - Output: `{ strategy: string, stages: [{ traffic_percent, wait_minutes, health_checks }] }`

- [ ] **3.1.2** Create `agents/planner/time-window-advisor.js`:
  - Queries `deployments` table for historical traffic patterns by hour/day
  - Recommends lowest-traffic 2-hour windows for the next 48 hours
  - Output: `{ recommended_windows: [{ start, end, risk_level, reason }] }`

- [ ] **3.1.3** Create `agents/planner/dependency-resolver.js`:
  - For multi-service repos (monorepo), reads `SERVICE_DEPENDENCIES` config
  - Topologically sorts services so dependencies deploy before dependents
  - Output: `{ deploy_order: ["service-a", "service-b", "service-c"], dependency_graph: {} }`

---

### 3.2 — Rollback Plan Generator
**Assigned to:** `@PlannerAgent`

- [ ] **3.2.1** Create `agents/planner/rollback-planner.js`:
  - CRITICAL: Generates rollback steps BEFORE deploy starts, not after failure
  - For each deploy, creates:
    - Previous image tag/commit SHA to roll back to
    - DB migration rollback script (if migration present)
    - Feature flag values to restore
    - DNS/load balancer settings to restore
  - Saves rollback plan to `deployments` table before deploy begins

- [ ] **3.2.2** Create rollback plan JSON schema:
  ```json
  {
    "deployment_id": "uuid",
    "rollback_steps": [
      {
        "order": 1,
        "type": "kubernetes_rollout | db_rollback | config_restore | dns_switch",
        "command": "exact command string",
        "timeout_seconds": 120,
        "verify_command": "command to verify rollback succeeded"
      }
    ],
    "estimated_downtime_seconds": 0,
    "can_auto_rollback": true
  }
  ```

- [ ] **3.2.3** Store rollback plan encrypted at rest in Postgres using `pgcrypto`

---

### 3.3 — Deploy Execution Coordination
**Assigned to:** `@PlannerAgent` + `@OrchestratorAgent`

- [ ] **3.3.1** Create `agents/planner/deploy-coordinator.js`:
  - Reads strategy + rollback plan
  - Executes deploy stages in order:
    1. Pre-deploy: run health check on current prod
    2. Stage 1: deploy to first % of traffic
    3. Wait: poll for error rate, latency (15s intervals for N minutes)
    4. If healthy: proceed to next stage
    5. If unhealthy: immediately trigger rollback plan
  - Emit events at each stage to Slack

- [ ] **3.3.2** Create deploy status endpoint `GET /api/deployments/:id/status` → returns live deploy stage

- [ ] **3.3.3** Write deploy history to `deployments` table at each stage change

---

### ✅ Phase 3 Done When:
- [ ] A high-risk PR deploy triggers canary strategy automatically
- [ ] Rollback plan is generated and saved before deploy starts
- [ ] Slack receives stage-by-stage deploy progress messages
- [ ] Deploy status API returns live stage info

---

## PHASE 4 — PRODUCTION MONITOR

> **Owner:** `@MonitorAgent`  
> **Goal:** Continuously watch production for anomalies, not just at deploy time  
> **Estimated Time:** 5–7 days  
> **Depends on:** Phase 3 ✅

---

### 4.1 — Metrics Ingestion
**Assigned to:** `@MonitorAgent`

- [ ] **4.1.1** Create `agents/monitor/metrics-collector.js`:
  - Connects to Prometheus API (if available) or CloudWatch (OCI Monitoring)
  - Polls every 30 seconds for:
    - HTTP error rate (5xx count / total requests)
    - P95 and P99 latency
    - Memory usage %
    - CPU usage %
    - Pod restart count (K8s)
  - Stores time-series in Redis with 24h TTL (ring buffer per metric)

- [ ] **4.1.2** Create `agents/monitor/log-streamer.js`:
  - Tails production logs from CloudWatch Logs or a log aggregator
  - Filters for ERROR and FATAL lines
  - Groups identical errors (same message, same file) into buckets
  - Counts occurrences per 5-minute window

---

### 4.2 — Anomaly Detection
**Assigned to:** `@MonitorAgent`

- [ ] **4.2.1** Create `agents/monitor/anomaly-detector.js`:
  - Baseline calculation: rolling average of last 7 days same time window
  - Anomaly thresholds:
    - Error rate > baseline × 3: **ALERT**
    - P99 latency > baseline × 2: **ALERT**
    - Memory > 90%: **ALERT**
    - CPU > 95% for > 5 minutes: **ALERT**
    - New error message not seen before: **ALERT**
  - Deduplication: same alert not re-fired within 15 minutes

- [ ] **4.2.2** Create `agents/monitor/predictive-analyzer.js`:
  - Memory trend: linear regression over last 2 hours
  - If projected to hit 100% within 4 hours: fire PREDICTIVE alert
  - Disk space trend: same logic
  - Alert payload: `{ type: "predictive", metric, current_value, projected_breach_at, confidence }`

- [ ] **4.2.3** Create `agents/monitor/correlated-alerter.js`:
  - Groups alerts that fire within 2 minutes of each other into one INCIDENT
  - Avoids alert storms (50 notifications for one outage → 1 incident notification)
  - Each incident has: severity (P1/P2/P3/P4), affected_services, started_at

---

### 4.3 — SLO Tracking
**Assigned to:** `@MonitorAgent`

- [ ] **4.3.1** Create `agents/monitor/slo-tracker.js`:
  - Define SLOs in `config/slos.json`:
    ```json
    [
      { "name": "API Uptime", "target": 99.9, "window_days": 30 },
      { "name": "P99 Latency < 500ms", "target": 99.5, "window_days": 7 }
    ]
    ```
  - Calculate error budget remaining: `error_budget = (1 - target) × window_minutes`
  - Alert when error budget < 20% remaining
  - Alert when burn rate > 14.4× (will exhaust budget in 2 hours)

- [ ] **4.3.2** Expose `GET /api/slos` endpoint → returns all SLOs with current compliance %

---

### ✅ Phase 4 Done When:
- [ ] Manually spike error rate in staging → Slack alert fires within 90 seconds
- [ ] Correlated alerts group into single incident notification
- [ ] SLO dashboard shows real compliance %
- [ ] Predictive alert fires when memory trend is climbing

---

## PHASE 5 — AUTO-HEALER

> **Owner:** `@HealerAgent`  
> **Goal:** Take autonomous remediation actions when problems detected  
> **Estimated Time:** 5–7 days  
> **Depends on:** Phase 4 ✅

---

### 5.1 — Auto-Rollback
**Assigned to:** `@HealerAgent`

- [ ] **5.1.1** Create `agents/healer/auto-rollback.js`:
  - Trigger condition: error rate > 10× baseline for > 3 minutes post-deploy
  - Actions:
    1. Fetch rollback plan from `deployments` table for most recent deploy
    2. Execute each rollback step in order
    3. After each step: run `verify_command`, check it exits 0
    4. If verify fails: STOP, alert human immediately (do not continue)
    5. Post Slack message: "🔄 Auto-rollback triggered for deploy [id]. Reason: [error_rate]"
  - All rollback actions logged to `incidents` table with type `auto_rollback`
  - Add 5-minute human override window before rollback executes (Slack button: "Cancel Rollback")

- [ ] **5.1.2** Create Slack interactive button handler `POST /webhooks/slack/actions`:
  - Handle "Cancel Rollback" button within 5-minute window
  - Handle "Approve Rollback Now" button to skip waiting

---

### 5.2 — Self-Healing Actions
**Assigned to:** `@HealerAgent`

- [ ] **5.2.1** Create `agents/healer/healing-actions.js` — library of healing actions:
  ```javascript
  const HEALING_ACTIONS = {
    pod_oom: {
      detect: "pod restart count > 3 in 10 minutes AND reason=OOMKilled",
      action: "kubectl set resources deployment $NAME --limits=memory=$CURRENT×2",
      verify: "kubectl rollout status deployment $NAME"
    },
    disk_full: {
      detect: "disk usage > 95%",
      action: "find /var/log -name '*.log' -mtime +7 -delete && docker system prune -f",
      verify: "df -h | awk '{print $5}' | grep -v Use | sort -n | tail -1"
    },
    connection_pool_exhausted: {
      detect: "error log contains 'too many connections' OR 'connection pool exhausted'",
      action: "restart app pods with rolling restart",
      verify: "check error rate drops below baseline within 2 minutes"
    },
    service_unhealthy: {
      detect: "health check endpoint returning non-200 for > 2 minutes",
      action: "kubectl rollout restart deployment $NAME",
      verify: "kubectl rollout status deployment $NAME --timeout=5m"
    }
  }
  ```

- [ ] **5.2.2** Create `agents/healer/action-executor.js`:
  - Before executing any action: log intent to `incidents` table with status `pending`
  - Execute action with 120s timeout
  - After execution: run verify command
  - If verify passes: update status to `resolved`
  - If verify fails: update status to `healer_failed`, alert human immediately

- [ ] **5.2.3** Create `agents/healer/hotfix-suggester.js`:
  - When RCA identifies a specific file + line causing failure
  - Calls Claude API with the failing code and error message
  - Generates a one-line or small patch fix
  - Opens a GitHub PR automatically with the fix, titled `[PipelineDoc Hotfix] ...`
  - PR body includes: diagnosis, confidence, the fix, test to verify
  - Requires human approval — never auto-merges

---

### 5.3 — UiPath Healing Agent Integration
**Assigned to:** `@HealerAgent`

- [ ] **5.3.1** Create `integrations/uipath/healing-agent.js`:
  - Connect to UiPath Orchestrator API
  - Function: `triggerHealingProcess(processName, inputArgs)` → starts a UiPath process
  - Use this for UI-based healing (e.g., restarting a web app via its admin UI when API is unavailable)

- [ ] **5.3.2** Map PipelineDoc healing triggers to UiPath processes:
  - `service_admin_restart` → UiPath Robot clicks admin panel restart button
  - `cache_clear` → UiPath Robot navigates to cache management UI
  - `certificate_renewal_alert` → UiPath Robot opens certificate management tool

---

### ✅ Phase 5 Done When:
- [ ] Manually trigger high error rate post-deploy → auto-rollback fires after 3 minutes
- [ ] "Cancel Rollback" Slack button works within 5-minute window
- [ ] Pod OOM detected → resources scaled up automatically
- [ ] Hotfix PR opened on GitHub for a simulated known error

---

## PHASE 6 — INTELLIGENCE & MEMORY

> **Owner:** `@MemoryAgent`  
> **Goal:** Agent learns from every event, builds runbooks, tracks team patterns  
> **Estimated Time:** 4–5 days  
> **Depends on:** Phase 5 ✅

---

### 6.1 — Vector Knowledge Base
**Assigned to:** `@MemoryAgent`

- [ ] **6.1.1** Create `agents/memory/knowledge-indexer.js`:
  - After every resolved incident: embed the `root_cause + resolution` text using Claude embeddings API
  - Store vector in Qdrant collection named `incident_knowledge`
  - Metadata: `{ incident_id, failure_type, repo, resolution_time_minutes, success }`

- [ ] **6.1.2** Create `agents/memory/knowledge-retriever.js`:
  - Input: new error message or log snippet
  - Embed the input
  - Search Qdrant for top-5 similar past incidents
  - Return: `{ similar_incidents: [{ root_cause, resolution, similarity_score }] }`
  - Inject this context into every RCA prompt to `@AnalysisAgent`

---

### 6.2 — Runbook Builder
**Assigned to:** `@MemoryAgent`

- [ ] **6.2.1** Create `agents/memory/runbook-builder.js`:
  - Query `incidents` table for same `root_cause` pattern appearing > 3 times
  - For repeated incidents: call Claude API to codify the fix into a step-by-step runbook
  - Save runbook to `runbooks` table with `trigger_pattern` (regex that matches the error)

- [ ] **6.2.2** Create `agents/memory/runbook-matcher.js`:
  - On each new incident: check if `root_cause` matches any `trigger_pattern` in `runbooks` table
  - If match found: include runbook steps in Slack notification
  - After auto-healing succeeds using a runbook: increment `success_count` on that runbook

---

### 6.3 — Team Pattern Learning
**Assigned to:** `@MemoryAgent`

- [ ] **6.3.1** Create `agents/memory/pattern-learner.js`:
  - After each incident with blame attribution: upsert to `team_patterns` table
  - Track: which author emails cause which failure types most often
  - Example insights: "author@email.com has caused 4 test_failure incidents in last 14 days"

- [ ] **6.3.2** Create `agents/memory/postmortem-generator.js`:
  - Triggered when incident is marked resolved
  - Calls Claude API with full incident timeline (from `incidents` table)
  - Generates structured postmortem:
    - **Timeline:** what happened and when
    - **Root cause:** the diagnosis
    - **Impact:** duration, error rate, users affected (estimate)
    - **Resolution:** what fixed it
    - **Action items:** 3 specific things to prevent recurrence
  - Saves as markdown file and posts link to Slack

---

### ✅ Phase 6 Done When:
- [ ] Second occurrence of same error includes "Similar past incident" in Slack message
- [ ] After 3 occurrences of same error: runbook auto-generated and saved
- [ ] Postmortem markdown generated automatically on incident resolution
- [ ] Team patterns table populated after several incidents

---

## PHASE 7 — CONVERSATIONAL UI

> **Owner:** `@UIAgent`  
> **Goal:** Natural language interface to query and control the entire agent  
> **Estimated Time:** 4–5 days  
> **Depends on:** Phase 6 ✅

---

### 7.1 — Chat API
**Assigned to:** `@UIAgent`

- [ ] **7.1.1** Create `api/src/routes/chat.js` — `POST /api/chat`:
  - Input: `{ message: string, conversation_history: [] }`
  - System prompt for the chat agent:
    ```
    You are PipelineDoc Assistant. You have access to the following tools:
    - get_recent_deployments() → last 10 deployments with status
    - get_incident(id) → full incident details
    - get_slo_status() → current SLO compliance
    - trigger_deploy(repo, branch, strategy) → start a deployment
    - trigger_rollback(deployment_id) → rollback a deployment
    - get_risk_score(pr_number) → gate score for a PR
    Answer in plain English. Be concise. If asked to take an action, confirm before executing.
    ```
  - Use Claude API with tool_use to route to appropriate backend functions
  - Return streaming response (SSE — Server-Sent Events)

- [ ] **7.1.2** Implement the tool functions as actual API calls to the backend services built in prior phases

- [ ] **7.1.3** Example queries that must work:
  - "Why did the last deploy fail?" → calls `get_recent_deployments` + `get_incident`
  - "What's our SLO status?" → calls `get_slo_status`
  - "Deploy main branch to production using canary" → calls `trigger_deploy` after confirming
  - "Roll back the auth service deploy" → calls `trigger_rollback` after confirming

---

### 7.2 — Slack Bot Commands
**Assigned to:** `@UIAgent`

- [ ] **7.2.1** Register Slack Slash Commands:
  - `/pd status` → current SLO and recent deploys
  - `/pd deploy [repo] [branch]` → trigger deploy
  - `/pd rollback [deployment-id]` → trigger rollback
  - `/pd why` → explain last failure

- [ ] **7.2.2** Create Slack command handler at `POST /webhooks/slack/commands`

- [ ] **7.2.3** Add natural language fallback: if command not recognized, pass message to chat API

---

### ✅ Phase 7 Done When:
- [ ] "Why did the last deploy fail?" returns accurate diagnosis from real data
- [ ] "Deploy main branch" triggers an actual deploy with Slack confirmation
- [ ] Slack `/pd status` returns current SLOs and deploy history

---

## PHASE 8 — UIPATH CLOUD INTEGRATION

> **Owner:** `@IntegrationAgent` + `@OrchestratorAgent`  
> **Goal:** Wire PipelineDoc agent pipeline to UiPath Maestro, Autopilot, and Automation Ops  
> **Estimated Time:** 5–6 days  
> **Depends on:** Phase 7 ✅

---

### 8.1 — UiPath Maestro Orchestration
**Assigned to:** `@OrchestratorAgent`

- [ ] **8.1.1** Create `integrations/uipath/maestro.js`:
  - Connect to UiPath Orchestrator API
  - Function: `startOrchestration(processName, inputs)` → triggers a Maestro-managed multi-agent flow
  - Function: `getOrchestrationStatus(jobId)` → polls job status

- [ ] **8.1.2** Map PipelineDoc agent flows to UiPath Maestro processes:
  - `FailureDoctorFlow` → runs AnalysisAgent → MemoryAgent → IntegrationAgent in sequence
  - `DeployFlow` → runs GatekeeperAgent → PlannerAgent → MonitorAgent in sequence
  - `HealingFlow` → runs MonitorAgent → HealerAgent in sequence

- [ ] **8.1.3** Register these processes in UiPath Automation Cloud Orchestrator under a dedicated Folder named `PipelineDoc`

---

### 8.2 — Automation Ops CI/CD Pipelines
**Assigned to:** `@IntegrationAgent`

- [ ] **8.2.1** Create a UiPath Solution package in Automation Ops that bundles all PipelineDoc UiPath processes

- [ ] **8.2.2** Set up UiPath Automation Ops Pipeline to:
  - Trigger on PipelineDoc repo push to `main`
  - Pack the Solution using UiPath CLI
  - Run UiPath Test Cloud suite
  - Deploy Solution to Automation Cloud

- [ ] **8.2.3** Configure pipeline YAML using UiPath CLI commands:
  ```bash
  # Pack
  dotnet uipcli.dll package pack "pipelinedoc-solution.json" --output "./packages"
  # Analyze
  dotnet uipcli.dll package analyze "./packages/*.nupkg"
  # Deploy
  dotnet uipcli.dll orchestrator package deploy "./packages/*.nupkg" \
    --organizationUnit "PipelineDoc" \
    --environments "Production"
  ```

---

### 8.3 — Autopilot Interface
**Assigned to:** `@UIAgent`

- [ ] **8.3.1** Create a Specialized Autopilot in UiPath Automation Cloud:
  - Name: "PipelineDoc Assistant"
  - Purpose: Allow any team member to interact with PipelineDoc via Autopilot web interface
  - Connect Autopilot to PipelineDoc's chat API via a UiPath Agent that calls `POST /api/chat`

- [ ] **8.3.2** Test the following queries via Autopilot:
  - "Show me the last 5 failed deploys"
  - "What is our current error budget?"
  - "Start a canary deploy for the payments service"

---

### ✅ Phase 8 Done When:
- [ ] UiPath Maestro coordinates multi-agent failure doctor flow end to end
- [ ] Automation Ops pipeline deploys PipelineDoc Solution package on push
- [ ] Autopilot responds to natural language pipeline queries

---

## PHASE 9 — DASHBOARD & FRONTEND

> **Owner:** `@UIAgent`  
> **Goal:** Web dashboard showing all pipeline intelligence in real time  
> **Estimated Time:** 5–7 days  
> **Depends on:** Phase 8 ✅

---

### 9.1 — React App Setup
**Assigned to:** `@UIAgent`

- [ ] **9.1.1** Initialize React app in `frontend/`:
  ```bash
  npx create-react-app . --template typescript
  npm install recharts react-query axios tailwindcss lucide-react
  ```

- [ ] **9.1.2** Set up Tailwind CSS with custom PipelineDoc theme:
  - Primary: `#0A0F1E` (deep navy)
  - Accent: `#00D4FF` (electric cyan — the signature element)
  - Success: `#00C48C`
  - Warning: `#FFB800`
  - Danger: `#FF4444`
  - Font: JetBrains Mono for code/metrics, Inter for UI text

---

### 9.2 — Dashboard Pages
**Assigned to:** `@UIAgent`

- [ ] **9.2.1** Create **Overview Page** `/`:
  - Live deploy status (current stage if deploy in progress)
  - Last 10 deployments with status badges
  - SLO compliance gauges (3 metrics)
  - Active incidents list
  - Real-time error rate sparkline (last 60 minutes)

- [ ] **9.2.2** Create **Incident Page** `/incidents/:id`:
  - Full RCA report (root cause, failure type, confidence, affected file)
  - Timeline of events
  - Blame attribution card
  - Fix suggestions with copy button
  - Similar past incidents (from vector search)
  - Generated postmortem (if resolved)

- [ ] **9.2.3** Create **Deploy Page** `/deployments/:id`:
  - Stage progress visualization (step by step)
  - Risk score breakdown (which factors contributed)
  - Gate decision (PASS/WARN/BLOCK) with details
  - Rollback plan steps (read-only, collapsible)
  - Manual rollback button (triggers confirmation modal)

- [ ] **9.2.4** Create **Chat Page** `/chat`:
  - Full-screen chat interface
  - SSE streaming responses
  - Suggested quick queries as buttons
  - Conversation history persisted in localStorage

- [ ] **9.2.5** Create **Intelligence Page** `/intelligence`:
  - Team patterns table (author → failure type → frequency)
  - Runbooks list with success rates
  - MTTR chart by service (last 30 days)
  - Velocity vs Stability score graph

---

### 9.3 — Real-Time Updates
**Assigned to:** `@UIAgent`

- [ ] **9.3.1** Create WebSocket server in API using `ws` package
- [ ] **9.3.2** Emit events on: new incident, deploy stage change, alert fired, rollback triggered
- [ ] **9.3.3** Frontend connects to WebSocket and updates Overview Page in real time without refresh

---

### ✅ Phase 9 Done When:
- [ ] All 5 pages render with real data from the API
- [ ] Overview page updates in real time during an active deploy
- [ ] Chat page streams responses from Claude
- [ ] Dashboard is mobile-responsive

---

## PHASE 10 — TESTING, SECURITY & LAUNCH

> **Owner:** `@TestAgent` + `@GatekeeperAgent` + `@OrchestratorAgent`  
> **Goal:** Full system testing, security hardening, and production readiness  
> **Estimated Time:** 5–7 days  
> **Depends on:** Phase 9 ✅

---

### 10.1 — End-to-End Testing
**Assigned to:** `@TestAgent`

- [ ] **10.1.1** Write E2E test: Push a broken commit → verify Slack message received with correct RCA within 90s
- [ ] **10.1.2** Write E2E test: Open PR with hardcoded secret → verify GitHub Check blocks the PR
- [ ] **10.1.3** Write E2E test: Spike error rate → verify auto-rollback fires and Slack button appears
- [ ] **10.1.4** Write E2E test: Ask "why did last deploy fail?" in chat → verify answer references real incident
- [ ] **10.1.5** Load test the API with 100 concurrent webhook events using k6 — P99 latency must be < 500ms

---

### 10.2 — Security Hardening
**Assigned to:** `@GatekeeperAgent`

- [ ] **10.2.1** Add JWT authentication to all `/api/*` routes (except `/health` and `/webhooks/*`)
- [ ] **10.2.2** Add rate limiting: 100 req/minute per IP on all routes
- [ ] **10.2.3** Rotate all secrets and regenerate GitHub webhook secret
- [ ] **10.2.4** Ensure all DB queries use parameterized statements (no string concatenation)
- [ ] **10.2.5** Enable HTTPS on OCI instance with Let's Encrypt (use `certbot`)
- [ ] **10.2.6** Run `npm audit --audit-level=high` — fix all high/critical vulnerabilities

---

### 10.3 — Observability for PipelineDoc Itself
**Assigned to:** `@MonitorAgent`

- [ ] **10.3.1** Add structured JSON logging to all agent functions using `pino` logger
- [ ] **10.3.2** Add Prometheus metrics endpoint `/metrics` — track: `rca_requests_total`, `rca_duration_ms`, `gate_decisions_total{result}`, `healing_actions_total{type}`
- [ ] **10.3.3** Create a Grafana dashboard for PipelineDoc's own health

---

### 10.4 — Documentation
**Assigned to:** `@OrchestratorAgent`

- [ ] **10.4.1** Write `docs/SETUP.md` — complete installation guide from zero
- [ ] **10.4.2** Write `docs/AGENTS.md` — what each agent does and how to configure it
- [ ] **10.4.3** Write `docs/INTEGRATIONS.md` — how to connect GitHub, UiPath, Slack, OCI
- [ ] **10.4.4** Write `docs/API.md` — every API endpoint with request/response examples
- [ ] **10.4.5** Write `README.md` — project overview, architecture diagram, quick start (< 5 minute setup)

---

### ✅ Phase 10 Done When:
- [ ] All 5 E2E tests pass
- [ ] HTTPS enabled, JWT auth on all API routes
- [ ] No high/critical npm vulnerabilities
- [ ] All docs written
- [ ] Grafana shows PipelineDoc's own health metrics

---

## DATA FLOW ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                          TRIGGER LAYER                          │
│   GitHub Webhook  │  UiPath Autopilot  │  Slack Command  │ API │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR AGENT                           │
│          Routes events to the right subagent flow              │
│                    (UiPath Maestro)                             │
└──────┬──────────────────┬─────────────────┬────────────────────┘
       │                  │                 │
       ▼                  ▼                 ▼
┌──────────────┐  ┌───────────────┐  ┌─────────────────┐
│ FAILURE FLOW │  │  DEPLOY FLOW  │  │  MONITOR FLOW   │
│              │  │               │  │                 │
│ @Analysis    │  │ @Gatekeeper   │  │ @Monitor        │
│ @Memory      │  │ @Planner      │  │ @Healer         │
│ @Integration │  │ @Integration  │  │ @Memory         │
└──────┬───────┘  └───────┬───────┘  └────────┬────────┘
       │                  │                    │
       └──────────────────┼────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       MEMORY LAYER                              │
│   Postgres (events/history)  │  Redis (cache)  │  Qdrant (AI)  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT LAYER                               │
│   Slack Alerts  │  PR Comments  │  GitHub Checks  │  Dashboard │
└─────────────────────────────────────────────────────────────────┘
```

---

## TECH STACK

| Layer | Technology | Why |
|---|---|---|
| Agent LLM | Claude Sonnet 4.6 (Anthropic API) | RCA, planning, chat, postmortems |
| Orchestration | UiPath Maestro | Multi-agent coordination |
| UI Automation | UiPath Healing Agent | Self-healing for UI-based tasks |
| Testing | UiPath Test Cloud | Pre-deploy test gate |
| Backend API | Node.js + Express | Webhook handler, REST API |
| Database | PostgreSQL 16 | Deployment/incident history |
| Cache | Redis 7 | Metrics time-series, token cache |
| Vector DB | Qdrant | Semantic incident search |
| Frontend | React + Tailwind + Recharts | Dashboard |
| Infra | OCI A1 Flex + Terraform | Always-free cloud |
| CI/CD | GitHub Actions + UiPath CLI | Pipeline execution |
| Notifications | Slack API | Alerts and commands |
| Monitoring | Prometheus + Grafana | Metrics |

---

## DONE DEFINITION PER PHASE

| Phase | Done When |
|---|---|
| 0 — Foundation | OCI server running, DBs healthy, API returns 200 |
| 1 — Failure Doctor | Break CI → Slack message with RCA in < 90 seconds |
| 2 — Gatekeeper | Secret in PR → GitHub Check blocks it |
| 3 — Planner | High-risk deploy → canary strategy auto-selected |
| 4 — Monitor | Spiked error rate → correlated alert in Slack in < 90s |
| 5 — Healer | Post-deploy error spike → auto-rollback fires in 3 min |
| 6 — Intelligence | Same error twice → "similar incident" context shown |
| 7 — Chat | "Why did last deploy fail?" → accurate answer |
| 8 — UiPath | Maestro coordinates full failure flow end to end |
| 9 — Dashboard | All 5 pages live with real data, real-time updates |
| 10 — Launch | E2E tests pass, HTTPS on, docs complete |

---

> **Total Estimated Time:** 50–70 days solo, 20–30 days with a team of 3  
> **Next Action for Agent:** Start Phase 0, Task 0.1.1 — Create GitHub repository named `pipelinedoc`
