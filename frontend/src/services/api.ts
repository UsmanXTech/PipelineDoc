import axios from 'axios';

const api = axios.create({
  baseURL: '', // Proxied via Vite
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Deployment {
  id: string;
  repo: string;
  branch: string;
  commit_sha: string;
  status: 'success' | 'failure' | 'running' | 'rolling_back' | 'rolled_back';
  risk_score: number | null;
  strategy: string;
  current_stage: string | null;
  deploy_history: any[] | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface Incident {
  id: string;
  type: string;
  root_cause: string | null;
  resolution: string | null;
  suggested_fix: string | null;
  details: any | null;
  created_at: string;
  resolved_at: string | null;
}

export interface SLOCompliance {
  name: string;
  description: string;
  target: number;
  actual: number;
  compliant: boolean;
}

export interface UiPathJob {
  id: string;
  job_id: string;
  process_name: string;
  robot_name: string;
  state: 'Pending' | 'Running' | 'Successful' | 'Faulted';
  input_arguments: any;
  output_arguments: any;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export interface UiPathQueueItem {
  id: string;
  queue_name: string;
  reference: string | null;
  status: 'New' | 'InProgress' | 'Successful' | 'Failed';
  exception_type: 'BusinessException' | 'ApplicationException' | null;
  exception_reason: string | null;
  processing_duration_ms: number | null;
  created_at: string;
}

export interface UiPathSummary {
  jobs: {
    total: number;
    success: number;
    faulted: number;
  };
  queues: {
    total: number;
    success: number;
    failed: number;
    businessExceptions: number;
    appExceptions: number;
    avgDurationMs: number;
  };
}

export interface UiPathConfig {
  status: string;
  connectionMode: string;
  organizationId: string;
  tenantName: string;
  clientIdObfuscated: string;
  uipathHost: string;
  folderPath: string;
  activeRobots: Array<{ name: string; status: string; type: string }>;
  mappedProcesses: Array<{ key: string; processName: string; description: string }>;
}

export const getDeployments = async (): Promise<Deployment[]> => {
  const response = await api.get('/api/deployments');
  return response.data;
};

export const getDeploymentStatus = async (id: string): Promise<Partial<Deployment>> => {
  const response = await api.get(`/api/deployments/${id}/status`);
  return response.data;
};

export const getIncidents = async (): Promise<Incident[]> => {
  const response = await api.get('/api/incidents');
  return response.data;
};

export const getIncidentDetails = async (id: string): Promise<Incident> => {
  const response = await api.get(`/api/incidents/${id}`);
  return response.data;
};

export const getSLOs = async (): Promise<SLOCompliance[]> => {
  const response = await api.get('/api/slos');
  return response.data;
};

export const triggerDeploy = async (repo: string, branch: string, strategy: string) => {
  const response = await api.post('/api/chat', {
    message: `Deploy branch ${branch} of repository ${repo} using strategy ${strategy}`
  });
  return response.data;
};

export const triggerRollback = async (id: string) => {
  const response = await api.post(`/api/deployments/${id}/rollback`);
  return response.data;
};

// UiPath Orchestrator API fetch calls
export const getUiPathStatus = async (): Promise<UiPathConfig> => {
  const response = await api.get('/api/uipath');
  return response.data;
};

export const getUiPathJobs = async (): Promise<UiPathJob[]> => {
  const response = await api.get('/api/uipath/jobs');
  return response.data;
};

export const getUiPathQueues = async (): Promise<UiPathQueueItem[]> => {
  const response = await api.get('/api/uipath/queues');
  return response.data;
};

export const getUiPathSummary = async (): Promise<UiPathSummary> => {
  const response = await api.get('/api/uipath/summary');
  return response.data;
};

export const triggerUiPathJob = async (processName: string, inputArguments?: any) => {
  const response = await api.post('/api/uipath/jobs/trigger', { processName, inputArguments });
  return response.data;
};

export default api;
