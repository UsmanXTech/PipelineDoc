import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach JWT token and automatically renew if it is at or past 50% of its lifetime
let isRefreshing = false;

api.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('pipelinedoc_token');
  if (token && config.headers) {
    try {
      // Decode JWT token locally from its base64 payload
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const decoded = JSON.parse(window.atob(payloadBase64));
        const iat = decoded.iat;
        const exp = decoded.exp;
        
        if (iat && exp) {
          const totalTtl = exp - iat;
          const currentTime = Math.floor(Date.now() / 1000);
          const remaining = exp - currentTime;
          
          if (remaining <= 0) {
            // Token is already expired, clear storage
            localStorage.removeItem('pipelinedoc_token');
            localStorage.removeItem('pipelinedoc_user');
          } else if (remaining <= 0.5 * totalTtl && !isRefreshing && config.url !== '/api/auth/renew' && config.url !== '/api/auth/github/callback') {
            isRefreshing = true;
            try {
              // Call renewal endpoint directly with vanilla Axios to prevent recursion
              const response = await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/auth/renew`, {}, {
                headers: {
                  Authorization: `Bearer ${token}`
                }
              });
              
              if (response.data && response.data.token) {
                localStorage.setItem('pipelinedoc_token', response.data.token);
                localStorage.setItem('pipelinedoc_user', JSON.stringify(response.data.user));
                config.headers.Authorization = `Bearer ${response.data.token}`;
              }
            } catch (err) {
              console.warn('Token renewal failed, continuing with current token:', err);
              config.headers.Authorization = `Bearer ${token}`;
            } finally {
              isRefreshing = false;
            }
          } else {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
      }
    } catch (e) {
      console.error('Error decoding JWT token in request interceptor:', e);
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface GitHubUrlResponse {
  success: boolean;
  isMock: boolean;
  url: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought_signature: string | null;
  created_at: string;
}

// Authentication API calls
export const getGitHubAuthUrl = async (): Promise<GitHubUrlResponse> => {
  const response = await api.get('/api/auth/github/url');
  return response.data;
};

export const loginWithGitHubCode = async (code: string): Promise<AuthResponse> => {
  const response = await api.post('/api/auth/github/callback', { code });
  if (response.data.token) {
    localStorage.setItem('pipelinedoc_token', response.data.token);
    localStorage.setItem('pipelinedoc_user', JSON.stringify(response.data.user));
  }
  return response.data;
};

export const renewToken = async (): Promise<AuthResponse> => {
  const response = await api.post('/api/auth/renew');
  if (response.data.token) {
    localStorage.setItem('pipelinedoc_token', response.data.token);
    localStorage.setItem('pipelinedoc_user', JSON.stringify(response.data.user));
  }
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('pipelinedoc_token');
  localStorage.removeItem('pipelinedoc_user');
};

export const getAuthenticatedUser = (): User | null => {
  const userStr = localStorage.getItem('pipelinedoc_user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('pipelinedoc_token');
};

// Chat Persistence API calls
export const getConversations = async (): Promise<Conversation[]> => {
  const response = await api.get('/api/chat/conversations');
  return response.data;
};

export const getConversationMessages = async (conversationId: string): Promise<Message[]> => {
  const response = await api.get(`/api/chat/conversations/${conversationId}`);
  return response.data;
};

export const createConversation = async (title: string): Promise<Conversation> => {
  const response = await api.post('/api/chat/conversations', { title });
  return response.data;
};

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
