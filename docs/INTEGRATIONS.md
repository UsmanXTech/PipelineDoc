# PipelineDoc Integrations Guide

PipelineDoc connects seamlessly with GitHub, Slack, and UiPath Cloud to orchestrate deployment audits, failure diagnostics, and self-healing.

---

## 1. GitHub Integration

### Webhook Setup
Configure a Webhook on your GitHub repository pointing to:
- **Payload URL**: `http://your-domain.com/webhooks/github`
- **Content Type**: `application/json`
- **Events**: Select `Pull requests` and `Workflow runs`.
- **Secret**: Set a secure signing secret matching `GITHUB_WEBHOOK_SECRET` in your `.env`.

### Check Runs & API
PipelineDoc uses `GITHUB_TOKEN` to:
- Post diagnostic feedback comments directly to pull requests when builds fail.
- Block merging using PR Check Runs if Gatekeeper detects secrets or critical vulnerabilities.

---

## 2. UiPath Maestro Integration

UiPath Cloud is used to invoke test runs, process execution pipelines, and execute healing automations.

### Orchestrator Config
Add the following credentials to `.env`:
- `UIPATH_CLIENT_ID`
- `UIPATH_CLIENT_SECRET`
- `UIPATH_TENANT_NAME`
- `UIPATH_ORGANIZATION_ID`

### Execution Sequences
PipelineDoc invokes orchestrator processes via:
- `FailureDoctorFlow`: Triggered when build logs fail. Runs RCA diagnostic tools.
- `DeployFlow`: Triggers package deployment via Test Cloud.
- `HealingFlow`: Dispatched to apply active remediation scripts.

---

## 3. Slack Integration

Slack commands provide human-in-the-loop control for dashboard management and triggering deployment actions.

### Slack App Setup
1. Create a Slack App in your workspace.
2. Under **Slash Commands**, add `/pd` with the Request URL: `http://your-domain.com/webhooks/slack/commands`.
3. Under **Interactive Components**, set the Request URL to: `http://your-domain.com/webhooks/slack/actions` to receive button confirmation responses.
4. Mount bot token permissions for `chat:write` and record `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`.

### Commands List
- `/pd status`: Query active deployments and SLO burn rate.
- `/pd deploy <repo> <branch> <strategy>`: Schedule a deployment run.
- `/pd rollback <deploy_id>`: Dispatches automatic rollback steps.
- `/pd why`: Outputs detailed root cause analysis for the last system anomaly.
- *(Fallback)*: Any natural language text sent to the `/pd` command is automatically forwarded to the AI assistant for intent parsing.
