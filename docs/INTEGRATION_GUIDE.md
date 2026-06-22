# PipelineDoc CI/CD Integration Guide 🔌

This guide explains how to connect **any external repository or project** (Node, Python, Go, Java, etc.) to your **PipelineDoc** server. 

By integrating PipelineDoc, your pipeline will automatically:
1.  **Gate deployments** based on risk analysis before rollout (using Gatekeeper).
2.  **Log deployment runs** dynamically on the PipelineDoc dashboard.
3.  **Perform Root Cause Analysis (RCA)** in real-time when builds or deployments fail.
4.  **Enforce auto-healing and rollbacks** using UiPath cloud services or custom playbooks.

---

## 🔑 1. Security & Authentication

External CI/CD pipelines connect to the PipelineDoc API using a static API Key.

1.  On your PipelineDoc server, set the environment variable:
    ```env
    PIPELINEDOC_API_KEY=your-secure-secret-token
    ```
2.  In your external repository, configure the following secrets/environment variables in your CI/CD runner settings:
    *   `PIPELINEDOC_API_URL`: The URL of your running PipelineDoc server (e.g., `https://pipelinedoc.yourdomain.com`).
    *   `PIPELINEDOC_API_KEY`: The authorization token configured above.

---

## 📦 2. Installing the PipelineDoc CLI (`pd`)

The PipelineDoc CLI (`cli/pd.js`) is a zero-dependency Node.js script. You can run it inside any project runner that has Node.js (v18+) installed.

You can download or run the script directly from your PipelineDoc server in your pipeline:

```bash
# Download the CLI client script from your server
curl -f -s -o pd.js https://raw.githubusercontent.com/UsmanXTech/PipelineDoc/main/cli/pd.js
chmod +x pd.js
```

---

## 🚀 3. GitHub Actions Integration

Create a new file in your project under `.github/workflows/pipelinedoc.yml`:

```yaml
name: Deploy Pipeline with PipelineDoc Guard

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    env:
      PIPELINEDOC_API_URL: ${{ secrets.PIPELINEDOC_API_URL }}
      PIPELINEDOC_API_KEY: ${{ secrets.PIPELINEDOC_API_KEY }}

    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0 # Essential to extract code diffs

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Download PipelineDoc CLI
        run: |
          curl -f -s -o pd.js https://raw.githubusercontent.com/UsmanXTech/PipelineDoc/main/cli/pd.js
          chmod +x pd.js

      # ----------------------------------------------------
      # STEP 1: GATING (Run Gatekeeper Risk Check)
      # ----------------------------------------------------
      - name: Gatekeeper Risk Analysis
        if: github.event_name == 'pull_request'
        run: |
          # Generate git diff file
          git diff origin/${{ github.base_ref }}...HEAD > pr.diff
          
          # Run Gatekeeper evaluation. Exits 1 if BLOCKED.
          node pd.js gate --repo ${{ github.event.repository.name }} --diff-file pr.diff --author-email ${{ github.actor }}@users.noreply.github.com

      # ----------------------------------------------------
      # STEP 2: REGISTER DEPLOYMENT START
      # ----------------------------------------------------
      - name: Register Deployment Session
        id: deploy_start
        run: |
          # Start session and save the run ID
          DEPLOY_RUN_ID=$(node pd.js deploy-start --repo ${{ github.event.repository.name }} --branch ${{ github.ref_name }} --commit ${{ github.sha }} --strategy canary | grep "Deployment Run ID:" | awk '{print $4}')
          echo "DEPLOY_RUN_ID=$DEPLOY_RUN_ID" >> $GITHUB_ENV
          echo "Deployment Run ID is $DEPLOY_RUN_ID"

      # ----------------------------------------------------
      # STEP 3: PERFORM ACTUAL BUILD & DEPLOYMENT
      # ----------------------------------------------------
      - name: Build & Test Project
        id: build_step
        run: |
          # Replace this with your actual build/deploy steps
          npm ci
          npm run build
          npm test

      # ----------------------------------------------------
      # STEP 4: REPORT STATUS & TRIGGER RCA ON FAILURE
      # ----------------------------------------------------
      - name: Report Success
        if: success()
        run: |
          node pd.js deploy-finish --deploy-id ${{ env.DEPLOY_RUN_ID }} --status success

      - name: Report Failure & Diagnostic RCA
        if: failure()
        run: |
          # Capture build error logs
          echo "Capture build logs..."
          # Replace with your log output dump file path
          echo "ERROR: Database connection timed out" > error.log 
          
          # Report failure run
          node pd.js deploy-finish --deploy-id ${{ env.DEPLOY_RUN_ID }} --status failure --logs-file ./error.log

---

## 🦊 4. GitLab CI/CD Integration

For GitLab repositories, add the following configuration to your `.gitlab-ci.yml` file:

```yaml
stages:
  - gate
  - deploy

variables:
  PIPELINEDOC_API_URL: $PIPELINEDOC_API_URL # Configure in GitLab Settings > CI/CD > Variables
  PIPELINEDOC_API_KEY: $PIPELINEDOC_API_KEY # Configure in GitLab Settings > CI/CD > Variables

before_script:
  # Download the lightweight CLI client
  - curl -f -s -o pd.js https://raw.githubusercontent.com/UsmanXTech/PipelineDoc/main/cli/pd.js
  - chmod +x pd.js

gatekeeper_check:
  stage: gate
  image: node:18-alpine
  script:
    - git diff origin/main...HEAD > pr.diff
    - node pd.js gate --repo $CI_PROJECT_NAME --diff-file pr.diff --author-email $GITLAB_USER_EMAIL
  only:
    - merge_requests

deploy_application:
  stage: deploy
  image: node:18-alpine
  script:
    # 1. Register Deployment Start session and capture Run ID
    - DEPLOY_RUN_ID=$(node pd.js deploy-start --repo $CI_PROJECT_NAME --branch $CI_COMMIT_REF_NAME --commit $CI_COMMIT_SHA --strategy rolling | grep "Deployment Run ID:" | awk '{print $4}')
    
    # 2. Run actual deploy script
    - echo "Deploying project..."
    - ./deploy.sh || (node pd.js deploy-finish --deploy-id $DEPLOY_RUN_ID --status failure --logs-file ./deploy_error.log && exit 1)
    
    # 3. Report Success
    - node pd.js deploy-finish --deploy-id $DEPLOY_RUN_ID --status success
  only:
    - main
```

---

## 🐚 5. Generic Bash Script Integration (`deploy.sh`)

If you run deployments using custom scripts or Jenkins servers:

```bash
#!/usr/bin/env bash
set -e

# Setup Env Configurations
export PIPELINEDOC_API_URL="https://pipelinedoc.company.com"
export PIPELINEDOC_API_KEY="your-token"
REPO_NAME="payment-service"
BRANCH_NAME="main"
COMMIT_SHA=$(git rev-parse HEAD)

# Download pd-cli
curl -f -s -o pd.js https://raw.githubusercontent.com/UsmanXTech/PipelineDoc/main/cli/pd.js

# 1. Start session
echo "Registering run session with PipelineDoc..."
DEPLOY_RUN_ID=$(node pd.js deploy-start --repo "$REPO_NAME" --branch "$BRANCH_NAME" --commit "$COMMIT_SHA" | grep "Deployment Run ID:" | awk '{print $4}')

# 2. Execute deployment
echo "Starting build execution..."
if ! npm run build > build.log 2>&1; then
  echo "Build failed. Dispatching Failure Doctor RCA diagnostics..."
  node pd.js deploy-finish --deploy-id "$DEPLOY_RUN_ID" --status failure --logs-file ./build.log
  exit 1
fi

# 3. Complete session
echo "Deployment successful."
node pd.js deploy-finish --deploy-id "$DEPLOY_RUN_ID" --status success
```

---

## 🌐 6. Direct REST API payload Reference

If you do not want to use Node.js, you can interact with the server using standard HTTP requests:

### 1. Gatekeeper Analysis
*   **Endpoint**: `POST /api/analysis/gate`
*   **Headers**: `x-api-key: <token>`
*   **Request Body**:
    ```json
    {
      "rawDiff": "diff --git a/src/index.js b/src/index.js\n...",
      "files": [{"path": "src/index.js"}],
      "authorEmail": "dev@example.com"
    }
    ```

### 2. Register Deployment Start
*   **Endpoint**: `POST /api/deployments`
*   **Headers**: `x-api-key: <token>`
*   **Request Body**:
    ```json
    {
      "repo": "user-service",
      "branch": "main",
      "commit_sha": "sha-string",
      "strategy": "canary"
    }
    ```
*   **Response Body**:
    ```json
    {
      "success": true,
      "deploymentId": "uuid-string",
      "status": "running"
    }
    ```

### 3. Update Deployment Status (RCA on failure)
*   **Endpoint**: `PATCH /api/deployments/:id`
*   **Headers**: `x-api-key: <token>`
*   **Request Body**:
    ```json
    {
      "status": "failure",
      "current_stage": "Failed",
      "log_message": "Error details go here..."
    }
    ```

