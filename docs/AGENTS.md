# PipelineDoc Agents Reference Guide

PipelineDoc is powered by a multi-agent cooperative architecture. Each agent is specialized for a distinct section of the deployment safety loop.

---

## 1. Gatekeeper Agent (`agents/gatekeeper/`)

The **Gatekeeper Agent** enforces static and dynamic compliance filters on incoming pull requests.

- **Risk Scorer (`risk-scorer.js`)**: Evaluates the potential risk score of changes (0-100) based on modified file paths (e.g. database migrations vs documentation) and author history.
- **Secret Detector (`secret-detector.js`)**: Runs regex audits scanning for credentials, API keys, and authorization tokens.
- **Breaking Change Detector (`breaking-change-detector.js`)**: Analyzes diff blocks for database column drops, routing alterations, or deleted environment variables.
- **Dependency Scanner (`dependency-scanner.js`)**: Extracts dependencies from `package.json` and requirements files, querying vulnerability DBs.
- **Override Check (`override-check.js`)**: Allows bypassing gate blocks if approvals are granted and the override label is present.

---

## 2. Planner Agent (`agents/planner/`)

The **Planner Agent** schedules deployment orchestration phases and constructs auto-rollback pathways.

- **Strategy Selector (`strategy-selector.js`)**: Chooses the appropriate deployment strategy (canary, rolling, blue/green, or maintenance window) depending on risk score and database migration properties.
- **Dependency Resolver (`dependency-resolver.js`)**: Topologically sorts service dependency graphs to prevent deployment ordering deadlocks.
- **Deploy Coordinator (`deploy-coordinator.js`)**: Runs stage updating checks, monitors health status, and coordinates automatic rollback triggering on anomalies.
- **Rollback Planner (`rollback-planner.js`)**: Encrypts rollback playbooks in the database for quick retrieval in the event of failure.

---

## 3. FailureDoctor Agent / Analysis Agent (`agents/analysis/`)

The **FailureDoctor Agent** acts as an AI-powered diagnostic engine when workflows break.

- **Log Ingester (`log-ingester.js`)**: Ingests, strips escape sequences, and parses raw logs to identify error signatures.
- **RCA Engine (`rca-engine.js`)**: Queries LLMs using RAG contexts of past incidents to isolate the root cause.
- **Blame Attribution (`blame-attribution.js`)**: Associates failure signatures with authors to trace regressions.
- **Flaky Detector (`flaky-detector.js`)**: Detects flaky test suites by cross-referencing previous run patterns.

---

## 4. Healer Agent (`agents/healer/`)

The **Healer Agent** executes automated remediation runbooks to recover from deployment anomalies.

- **Runbook Matcher (`runbook-matcher.js`)**: Evaluates error signatures against codified regex runbooks to match appropriate healing actions.
- **Action Executor (`action-executor.js`)**: Triggers shell commands (e.g., memory threshold limits), executes hotfix patches, or triggers UiPath Maestro healing processes.

---

## 5. Monitor Agent (`agents/monitor/`)

The **Monitor Agent** watches microservices health, compliance targets, and exposes application telemetry.

- **SLO Tracker (`slo-tracker.js`)**: Compiles compliance percentages and burn rates for service level objectives.
- **Predictive Analyzer (`predictive-analyzer.js`)**: Utilizes linear regression models to forecast memory exhaustion and disk shortages before outages happen.
- **Metrics Collector (`metrics-collector.js`)**: Feeds performance metrics to Prometheus scrapers under `/metrics`.
