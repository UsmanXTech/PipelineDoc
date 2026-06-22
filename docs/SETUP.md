# PipelineDoc Setup & Installation Guide

Welcome to the **PipelineDoc** installation guide. Follow these step-by-step instructions to set up, configure, and run the self-healing CI/CD platform locally or in a production-like environment.

---

## 📋 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Environment Configuration](#-1-environment-configuration)
3. [Database & Services Provisioning](#-2-database--services-provisioning)
4. [Database Schema Initialization](#-3-database-schema-initialization)
5. [Running the Mock Telemetry Simulation](#-4-running-the-mock-telemetry-simulation)
6. [Starting the Application Services](#-5-starting-the-application-services)
7. [Running Test Suites](#-6-running-test-suites)
8. [Troubleshooting & FAQs](#-troubleshooting--faqs)

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js**: `v18.0.0` or higher (tested on `v20.x`)
- **Docker & Docker Compose**: For starting up PostgreSQL and Redis instances instantly.
- **Git**: To clone and manage your local repository.
- **psql CLI** (Optional but highly recommended): For database validation and manual queries.

---

## 🔑 1. Environment Configuration

The application reads configuration parameters from environmental variables. Copy `.env.example` in both the workspace root and the `api/` directory:

```bash
# In the project root directory
cp .env.example .env

# In the API directory
cp .env.example api/.env
```

Open `.env` and fill in the required keys:

| Environment Variable | Description | Example / Mock Default |
|----------------------|-------------|-------------------------|
| `PORT` | The port the backend API runs on | `3000` |
| `JWT_SECRET` | Secret key used to sign authorization tokens | `super-secret-jwt-token-key` |
| `POSTGRES_URL` | PostgreSQL connection string | `postgres://admin:secret@localhost:5432/pipelinedoc` |
| `REDIS_URL` | Redis connection URL | `redis://127.0.0.1:6379` |
| `ANTHROPIC_API_KEY` | Anthropic Claude API Key for Gatekeeper & RCA | `sk-ant-api03-...` (Required for LLM features) |
| `GITHUB_TOKEN` | GitHub Token for Pull Request annotations | `ghp_...` |
| `GITHUB_WEBHOOK_SECRET` | Secret to sign webhook triggers | `github-webhook-signing-secret` |
| `SLACK_BOT_TOKEN` | Bot API token for Slack notifications | `xoxb-...` |
| `SLACK_SIGNING_SECRET` | Webhook verification secret for Slack slash commands | `slack-signing-secret` |
| `UIPATH_CLIENT_ID` | UiPath Orchestrator API Client ID | `uipath-maestro-client-id` |
| `UIPATH_CLIENT_SECRET` | UiPath Orchestrator API Client Secret | `uipath-maestro-client-secret` |
| `UIPATH_TENANT_NAME` | UiPath Tenant Name | `pipelinedoc-tenant` |
| `UIPATH_ORGANIZATION_ID` | UiPath Org ID | `pipelinedoc-org` |

> [!NOTE]
> If you are running in a non-production/hackathon environment, PipelineDoc runs in **Mock/Simulation mode** by default when live `UIPATH_*` and `ANTHROPIC_API_KEY` credentials are not present or use mock defaults.

---

## 🐳 2. Database & Services Provisioning

PipelineDoc relies on **PostgreSQL** (relational data store) and **Redis** (metrics collector, job queue, and rate limiting). You can spin them up in containerized mode using Docker Compose:

```bash
# Spin up containers in detached mode
docker-compose up -d
```

Verify that the containers are running properly:
```bash
docker ps
```
You should see:
- A PostgreSQL container listening on port `5432`.
- A Redis container listening on port `6379`.

---

## 🗄️ 3. Database Schema Initialization

Once PostgreSQL is up, initialize the database tables using the convenient root npm script:

```bash
# Create tables and schemas from the root directory
npm run db:init
```
*(Enter the password `secret` when prompted if using the default Docker Compose configuration).*

### Database Tables Configured:
- **`deployments`**: Logs strategy selections (Canary, Rolling, Blue-Green), active stages, risk evaluation scores, and deployment history logs.
- **`incidents`**: Holds Root Cause Analysis (RCA) diagnoses, raw logs, resolutions, and status details.
- **`runbooks`**: Stores standard resolution procedures matched against log error patterns.
- **`team_patterns`**: Tracks failure frequency grouped by developer commit signatures.
- **`uipath_jobs`**: Contains metadata about unattended UiPath Robot orchestrations (state, robot, start/end timestamps, arguments).
- **`uipath_queue_items`**: Tracks transactional queue items processed by robots (status, exceptions, durations).

---

## 📈 4. Running the Mock Telemetry Simulation

To display rich charts and show real-time agent self-healing on the dashboard, run the telemetry generator. It populates historical logs and simulates real-time activity:

```bash
# Populate initial history and run live simulation from root
npm run simulate
```

This script will run and dynamically push simulated logs, deployment check runs, unattended robot runs, and incident triggers.

---

## 🚀 5. Starting the Application Services

You can bootstrap and run all monorepo components (backend + frontend) from the project root directory:

### Step A: Bootstrap Dependencies
Installs packages for the root workspace, API server, and React dashboard concurrently:
```bash
npm run bootstrap
```

### Step B: Start Application (Concurrently)
Launch both the Express API backend and Vite frontend dev server at once:
```bash
npm run dev
```
- The API backend will listen on [http://localhost:3000](http://localhost:3000).
- The Vite development server will spin up on [http://localhost:5173](http://localhost:5173). 

Open [http://localhost:5173](http://localhost:5173) in your browser to view the **UiPath Orchestrator Hub & Self-Healing Pipeline Dashboard**!

*Note: Alternatively, you can start components individually:*
- Start Backend API only: `npm run dev:api`
- Start React Dashboard only: `npm run dev:frontend`

---

## 🧪 6. Running Test Suites

Before committing or deploying, validate that all agent components are functioning by running the root-level test command:

```bash
# Run all unit and integration tests with mock configs
npm run test
```

This will run all 92 tests verifying:
- Gatekeeper risk-scoring and secret-detection
- Strategy selector algorithms
- Deploy and rollback execution plans
- UiPath API endpoints and simulated job orchestrations
- LLM diagnostics integrations

---

## ❓ Troubleshooting & FAQs

### 🔴 Error: `connect ECONNREFUSED 127.0.0.1:5432`
- **Cause**: PostgreSQL is not running or port 5432 is occupied by another process.
- **Fix**: Check Docker status with `docker-compose ps` and restart using `docker-compose down && docker-compose up -d`.

### 🔴 Error: `Missing dependency: @types/react` or build warning during npm install
- **Cause**: React 19 package tree warnings.
- **Fix**: Run `npm install --legacy-peer-deps` inside the `frontend` folder to bypass dependency conflicts.

### 🔴 Telemetry isn't updating live on the dashboard
- **Cause**: The telemetry script `generate-telemetry.js` is not running, or Redis connection is offline.
- **Fix**: Verify Redis status and make sure you run `node scripts/generate-telemetry.js`.

