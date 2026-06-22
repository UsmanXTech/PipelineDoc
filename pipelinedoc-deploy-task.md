# PipelineDoc Deployment Task
> Agent task file for autonomous deployment of PipelineDoc to free-tier cloud services.

---

## Objective
Deploy PipelineDoc (AI-powered CI/CD diagnostics platform) across 5 free-tier services:
- **Frontend** → Vercel
- **Backend** → Render
- **PostgreSQL** → Neon.tech
- **Redis** → Upstash
- **Qdrant** → Qdrant Cloud

---

## Pre-flight Checks
Before starting, verify the following exist in the project root:

- [ ] `frontend/` directory with `package.json` and build script
- [ ] `backend/` directory with `package.json` and entry file (e.g. `index.js` or `server.js`)
- [ ] `.env.example` or existing `.env` file in backend
- [ ] `backend/package.json` has a `"start"` script defined

If any are missing, stop and report which item is missing before proceeding.

---

## Step 1 — Detect Project Structure

```
TASK: Scan the project and report:
1. Frontend entry point and build command (check package.json scripts)
2. Backend entry file name (index.js / server.js / app.js)
3. Backend start command (from package.json "start" script)
4. All environment variables referenced in backend code (grep for process.env)
5. Node.js version required (check .nvmrc or engines field in package.json)

OUTPUT FORMAT:
- frontend_build_cmd: <value>
- backend_entry: <value>
- backend_start_cmd: <value>
- env_vars_needed: [list]
- node_version: <value>
```

---

## Step 2 — Setup PostgreSQL on Neon.tech

```
TASK: Guide user to create a free Neon.tech PostgreSQL database.

Instructions to output:
1. Go to https://neon.tech and sign up (GitHub login recommended)
2. Create new project → name it "pipelinedoc"
3. Choose region closest to user (ap-southeast-1 for South Asia)
4. Copy the connection string from Dashboard → Connection Details
5. Format: postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/pipelinedoc?sslmode=require

COLLECT: DATABASE_URL from user
VALIDATE: String starts with "postgresql://" and contains "neon.tech"
```

---

## Step 3 — Setup Redis on Upstash

```
TASK: Guide user to create a free Upstash Redis instance.

Instructions to output:
1. Go to https://upstash.com and sign up
2. Create Database → name "pipelinedoc-redis"
3. Type: Regional → Region: ap-southeast-1 (Singapore)
4. Copy "REDIS_URL" from database details page
5. Format: rediss://default:xxx@xxx.upstash.io:6379

COLLECT: REDIS_URL from user
VALIDATE: String starts with "rediss://" and contains "upstash.io"
```

---

## Step 4 — Setup Qdrant Cloud

```
TASK: Guide user to create a free Qdrant Cloud cluster.

Instructions to output:
1. Go to https://cloud.qdrant.io and sign up
2. Create Cluster → Free tier → name "pipelinedoc-vectors"
3. Region: GCP us-east4 or AWS ap-southeast-1
4. After cluster starts, go to cluster → API Keys → Create API Key
5. Also copy the Cluster URL (format: https://xxx-xxx.us-east4-0.gcp.cloud.qdrant.io)

COLLECT:
- QDRANT_URL from user
- QDRANT_API_KEY from user

VALIDATE:
- URL ends with "qdrant.io" and starts with "https://"
- API key is non-empty string
```

---

## Step 5 — Deploy Backend to Render

```
TASK: Deploy Node.js backend to Render free tier.

Instructions to output:
1. Go to https://render.com and sign up (GitHub login)
2. New → Web Service → Connect GitHub → select PipelineDoc repo
3. Configure:
   - Name: pipelinedoc-api
   - Region: Singapore (nearest to South Asia)
   - Branch: main
   - Root Directory: backend (if monorepo)
   - Runtime: Node
   - Build Command: npm install
   - Start Command: <use backend_start_cmd from Step 1>
4. Add Environment Variables (click "Add Environment Variable" for each):
   - DATABASE_URL → <value from Step 2>
   - REDIS_URL → <value from Step 3>
   - QDRANT_URL → <value from Step 4>
   - QDRANT_API_KEY → <value from Step 4>
   - ANTHROPIC_API_KEY → <ask user to provide>
   - NODE_ENV → production
   - PORT → 3000
5. Click "Create Web Service"
6. Wait for build to complete (2-5 min)
7. Copy the service URL: https://pipelinedoc-api.onrender.com

COLLECT: BACKEND_URL (the Render service URL)
VALIDATE: URL ends with ".onrender.com" and health check returns 200
```

---

## Step 6 — Deploy Frontend to Vercel

```
TASK: Deploy React frontend to Vercel.

Instructions to output:
1. Go to https://vercel.com and sign up (GitHub login)
2. New Project → Import Git Repository → select PipelineDoc repo
3. Configure:
   - Framework Preset: Vite (or Create React App — auto-detected)
   - Root Directory: frontend (if monorepo)
   - Build Command: npm run build (auto-detected)
   - Output Directory: dist (for Vite) or build (for CRA)
4. Add Environment Variables:
   - VITE_API_URL → <BACKEND_URL from Step 5>
   (use REACT_APP_API_URL if using Create React App)
5. Click Deploy
6. Wait for deployment (1-2 min)
7. Copy the deployment URL: https://pipelinedoc.vercel.app

COLLECT: FRONTEND_URL
VALIDATE: Frontend loads without blank screen, API calls reach backend
```

---

## Step 7 — Post-Deployment Verification

```
TASK: Verify all services are connected and working.

Run these checks:

1. BACKEND HEALTH CHECK:
   curl https://<BACKEND_URL>/health
   Expected: { "status": "ok" } or similar

2. DATABASE CHECK:
   curl https://<BACKEND_URL>/api/health/db
   Expected: { "db": "connected" }

3. REDIS CHECK:
   curl https://<BACKEND_URL>/api/health/redis
   Expected: { "redis": "connected" }

4. QDRANT CHECK:
   curl https://<BACKEND_URL>/api/health/qdrant
   Expected: { "qdrant": "connected" }

5. FRONTEND CHECK:
   Open https://<FRONTEND_URL> in browser
   Expected: PipelineDoc UI loads, no console errors

If any check fails:
- DB fail → Re-verify DATABASE_URL format, ensure ?sslmode=require is appended
- Redis fail → Re-verify REDIS_URL starts with rediss:// (double s)
- Qdrant fail → Re-verify API key and cluster URL
- Frontend blank → Check VITE_API_URL env var is set correctly in Vercel
```

---

## Step 8 — Update Backend CORS (if needed)

```
TASK: If frontend cannot reach backend due to CORS errors, update backend config.

Add FRONTEND_URL env var to Render:
  FRONTEND_URL → https://pipelinedoc.vercel.app

Verify backend CORS config allows this origin.
If backend uses Express, check for:
  app.use(cors({ origin: process.env.FRONTEND_URL }))

If missing, report the exact file and line where CORS should be added.
```

---

## Final Output Report

```
TASK: After all steps complete, generate a deployment summary:

=== PipelineDoc Deployment Summary ===

Frontend URL   : https://pipelinedoc.vercel.app
Backend URL    : https://pipelinedoc-api.onrender.com
Database       : Neon.tech (free tier)
Redis          : Upstash (free tier)
Vector DB      : Qdrant Cloud (free tier)

Status         : ✅ All services connected
Deployed on    : <date>

⚠️  Render Note: Free tier backend sleeps after 15 min of inactivity.
   First request after sleep takes ~30 seconds (cold start).
   Upgrade to Render Starter ($7/mo) to disable sleep.

Next Steps:
- Add custom domain (free via Vercel/Render)
- Set up GitHub Actions for auto-deploy on push
- Enable Render health checks to reduce cold start impact
```

---

## Notes for Agent

- Do NOT proceed to next step if current step's COLLECT fields are empty
- If user provides invalid values, explain correct format and ask again
- All services support GitHub OAuth — recommend it over email signup for faster flow
- Render free tier spins down after 15 min inactivity — mention this to user
- Neon free tier: 0.5 GB storage, 1 compute unit — sufficient for PipelineDoc MVP
- Upstash free tier: 10,000 commands/day — sufficient for Redis caching/queues
- Qdrant free tier: 1 GB RAM, 0.5 vCPU — sufficient for vector storage
