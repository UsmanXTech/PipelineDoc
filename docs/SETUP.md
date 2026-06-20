# PipelineDoc Setup Guide

Welcome to the PipelineDoc Self-Healing CI/CD Platform setup guide. Follow these instructions to initialize the system, database, configuration keys, and startup script instructions.

## Prerequisites

- **Node.js**: v18 or later (tested on v20+)
- **PostgreSQL**: v14 or later
- **Redis**: v6 or later (used for locking, metrics stream, and queueing)

---

## 1. Environment Setup

Copy `.env.example` to `.env` in both the workspace root and the `api/` folder:

```bash
cp .env.example .env
cp .env.example api/.env
```

Open `.env` and fill in the required credentials:
- `ANTHROPIC_API_KEY`: Used by FailureDoctor/RCA and Gatekeeper agents.
- `GITHUB_TOKEN` & `GITHUB_WEBHOOK_SECRET`: Used for PR comments and check run checks.
- `UIPATH_CLIENT_ID` & `UIPATH_CLIENT_SECRET`: Authentication credentials for UiPath Maestro integration.
- `POSTGRES_URL` & `REDIS_URL`: Database connection URIs.
- `JWT_SECRET`: Used to sign and verify web app client requests.

---

## 2. Database Initialization

Execute the database schema setup script located at `scripts/db-init.sql` to initialize deployments and incidents schemas:

```bash
psql -U <username> -d <database_name> -f scripts/db-init.sql
```

This creates the following tables:
- `deployments`: Logs Strategy selector runs, stage states, risk scores, and rollback plans.
- `incidents`: Holds RCA diagnostic reports, error categories, and resolution logs.

---

## 3. Running Backend and Frontend

### Step A: Install Backend Dependencies
Run the install command from the root folder:
```bash
npm install
```

### Step B: Start Backend API Server
Navigate to the `api` directory and run the API in development mode:
```bash
cd api
npm install
npm run dev
```
The backend server runs on `http://localhost:3000`.

### Step C: Install and Start Frontend Dashboard
Navigate to the `frontend` folder, install packages (using React 19 compatibility flags), and launch the Vite development server:
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```
Vite will proxy all `/api` and `/webhooks` traffic directly to the backend. Open `http://localhost:5173` to view the PipelineDoc dashboard.

---

## 4. Verifying Installation

Verify that the system compiles and works by running the test suites:

### Running Test Suites
From the repository root, run Node's native test runner:
```bash
node --test tests/**/*.test.js
```
All 87 tests should execute successfully and report complete pass status.
