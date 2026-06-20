# PipelineDoc API Reference

This document catalogs all endpoints exposed by the PipelineDoc API server.

## Authentication
Routes prefixed with `/api/*` require JWT Authentication.
Pass the token in the request headers:
```http
Authorization: Bearer <your_jwt_token>
```
For Server-Sent Events (SSE) connections where custom headers are not supported, tokens may be passed via query parameters:
```http
GET /api/chat?token=<your_jwt_token>
```

---

## 1. System Telemetry & Health

### `GET /health`
Returns server connection health state. (Unauthenticated)
- **Response (200 OK)**:
```json
{ "status": "ok" }
```

### `GET /metrics`
Exposes system metrics in Prometheus format. (Unauthenticated)
- **Response (200 OK)**:
```text
# HELP rca_requests_total Total number of RCA requests analyzed
# TYPE rca_requests_total counter
rca_requests_total 42
...
```

---

## 2. Deployments API

### `GET /api/deployments`
Retrieves a list of the 50 most recent deployments.
- **Response (200 OK)**:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "repo": "payment-service",
    "branch": "main",
    "commit_sha": "sha123456",
    "status": "success",
    "strategy": "canary",
    "risk_score": 12,
    "current_stage": "Pipeline Completed",
    "started_at": "2026-06-18T18:00:00Z",
    "completed_at": "2026-06-18T18:01:22Z"
  }
]
```

### `GET /api/deployments/:id/status`
Retrieves details, active stage status, and run logs of a specific deployment run.
- **Response (200 OK)**:
```json
{
  "status": "running",
  "strategy": "canary",
  "risk_score": 12,
  "current_stage": "Orchestrator Rollout",
  "deploy_history": [
    { "timestamp": "2026-06-18T18:00:02Z", "message": "Pre-deploy checks passed." }
  ]
}
```

### `POST /api/deployments/:id/rollback`
Manually triggers the auto-rollback sequence for a failed deployment.
- **Response (200 OK)**:
```json
{
  "success": true,
  "deploymentId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "rolling_back"
}
```

---

## 3. Incident Diagnostics API

### `GET /api/incidents`
Retrieves a list of microservices health incidents and logs.
- **Response (200 OK)**:
```json
[
  {
    "id": "51922729-b42f-470c-bcbf-3a84dbe4fbe6",
    "type": "test_failure",
    "root_cause": "connect ECONNREFUSED 127.0.0.1:5432",
    "resolution": "Restart PostgreSQL container",
    "created_at": "2026-06-18T18:00:00Z"
  }
]
```

### `GET /api/incidents/:id`
Retrieves the full diagnostic logs, AI postmortem, and recommended hotfixes for a specific incident.
- **Response (200 OK)**:
```json
{
  "id": "51922729-b42f-470c-bcbf-3a84dbe4fbe6",
  "type": "test_failure",
  "root_cause": "connect ECONNREFUSED 127.0.0.1:5432",
  "resolution": "Restart PostgreSQL container",
  "suggested_fix": "Verify Postgres port configuration and restart pod auth-db.",
  "details": "Stacktrace: ...",
  "created_at": "2026-06-18T18:00:00Z",
  "resolved_at": "2026-06-18T18:00:45Z"
}
```

---

## 4. SLO and Monitoring API

### `GET /api/slos`
Retrieves configured Service Level Objectives along with current compliance targets.
- **Response (200 OK)**:
```json
[
  {
    "name": "API Latency",
    "description": "95% of API requests completed under 200ms",
    "target": 0.95,
    "actual": 0.984,
    "compliant": true
  }
]
```

---

## 5. Conversational AI Assistant API

### `POST /api/chat`
Exposes the natural language SSE chatbot streaming endpoint.
- **Request Body**:
```json
{
  "message": "Verify SLO compliance levels.",
  "conversation_history": []
}
```
- **Response (SSE Event Stream)**:
```text
data: {"type": "text", "text": "Analyzing current Objectives..."}

data: {"type": "tool_start", "name": "get_slo_status", "input": {}}

data: {"type": "tool_result", "name": "get_slo_status", "result": [...]}

data: {"type": "text", "text": "All metrics are within stable boundaries."}

data: [DONE]
```

---

## 6. UiPath Cloud Orchestrator Integration API

### `GET /api/uipath`
Checks connection mode (mock/live) and lists active unattended robots and mapped processes.
- **Response (200 OK)**:
```json
{
  "status": "Connected",
  "connectionMode": "Simulation (Local Mock)",
  "organizationId": "pipelinedoc-org",
  "tenantName": "pipelinedoc-tenant",
  "clientIdObfuscated": "client...",
  "uipathHost": "https://cloud.uipath.com",
  "folderPath": "Shared/Orchestrator_Unit_1",
  "activeRobots": [
    { "name": "Robot_Maestro_01", "status": "Available", "type": "Unattended" }
  ],
  "mappedProcesses": [
    { "key": "FailureDoctorFlow", "processName": "UiPath_FailureDoctorFlowProcess", "description": "GitHub workflow failure diagnostics RCA agent" }
  ]
}
```

### `GET /api/uipath/jobs`
Fetches a list of executed unattended robot runs and their execution states.
- **Response (200 OK)**:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "job_id": "job-manual-1234",
    "process_name": "FailureDoctorFlow",
    "robot_name": "Robot_Maestro_01",
    "state": "Successful",
    "input_arguments": { "repo": "payment-service" },
    "output_arguments": { "rca_result": "Success" },
    "start_time": "2026-06-20T10:00:00Z",
    "end_time": "2026-06-20T10:00:15Z",
    "created_at": "2026-06-20T10:00:00Z"
  }
]
```

### `GET /api/uipath/queues`
Fetches items from the transaction processing queues tracking status and exceptions.
- **Response (200 OK)**:
```json
[
  {
    "id": "da6f7f46-fb4b-43b0-8ca9-79fba6deacbe",
    "queue_name": "Deployment_Artifact_Verification_Queue",
    "reference": "db79aca1-abce-4934-b642-844ff7c77b2a",
    "status": "InProgress",
    "exception_type": null,
    "exception_reason": null,
    "processing_duration_ms": null,
    "created_at": "2026-06-20T07:32:15Z"
  }
]
```

### `GET /api/uipath/summary`
Calculates and returns aggregated metrics for jobs and queue items.
- **Response (200 OK)**:
```json
{
  "jobs": {
    "total": 31,
    "success": 29,
    "faulted": 2
  },
  "queues": {
    "total": 18,
    "success": 16,
    "failed": 2,
    "businessExceptions": 1,
    "appExceptions": 1,
    "avgDurationMs": 1520
  }
}
```

### `POST /api/uipath/jobs/trigger`
Manually starts a specific unattended Orchestration process on an active robot.
- **Request Body**:
```json
{
  "processName": "FailureDoctorFlow",
  "inputArguments": { "repo": "payment-service" }
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "jobId": "job-manual-9012",
  "state": "Successful",
  "robot": "Robot_Maestro_01",
  "message": "Successfully executed manual UiPath job run job-manual-9012 for process FailureDoctorFlow"
}
```

---

## 7. AI Chatbot Autopilot Tools

The conversational AI chatbot uses the following built-in tools to interact with the UiPath cloud layer:
- **`get_uipath_status`**: Queries connection parameters, robot health status, and active mappings.
- **`get_uipath_jobs`**: Queries the status of running or completed unattended orchestrator jobs.
- **`trigger_uipath_job`**: Triggers a new unattended process run on a robot.

