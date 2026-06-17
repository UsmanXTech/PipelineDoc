# PipelineDoc 🚀

An AI-powered agent layer that sits between your source code and production. It acts as a doctor, gatekeeper, planner, and auto-healer for the entire software delivery pipeline.

## Features (Phased Rollout)
1. **Failure Doctor**: Log parsing, differential root-cause analysis, blame attribution, and flaky test detection.
2. **Gatekeeper**: Automated risk scoring, breaking change detection, vulnerability scanning, and secret detection.
3. **Deployment Planner**: Adaptive deployment strategies (Canary, Blue/Green, Rolling) and pre-generated rollback plans.
4. **Production Monitor**: Metrics ingestion, anomaly detection, predictive analytics, and SLO/error budget tracking.
5. **Auto-Healer**: Auto-rollback and automated healing actions (OOM, disk, connections, unhealthy endpoints).
6. **Intelligence & Memory**: Vector knowledge base, runbook builder, and postmortem generation.
7. **Conversational UI**: Chat API and Slack bot integration.
8. **UiPath Cloud Integration**: UiPath Maestro orchestration, Automation Ops, and Autopilot integration.
9. **Real-time Dashboard**: Web interface for tracking deployments, incidents, and SLOs.

## Folder Structure
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
