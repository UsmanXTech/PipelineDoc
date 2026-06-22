import { useEffect, useState } from 'react';
import { 
  getUiPathStatus, getUiPathJobs, getUiPathQueues, getUiPathSummary, triggerUiPathJob,
  type UiPathConfig, type UiPathJob, type UiPathQueueItem, type UiPathSummary 
} from '../services/api';
import { 
  Cpu, Play, RefreshCw, Terminal, 
  Layers, CheckCircle, AlertTriangle
} from 'lucide-react';

export default function UiPathHub() {
  const [config, setConfig] = useState<UiPathConfig | null>(null);
  const [jobs, setJobs] = useState<UiPathJob[]>([]);
  const [queues, setQueues] = useState<UiPathQueueItem[]>([]);
  const [summary, setSummary] = useState<UiPathSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringProcess, setTriggeringProcess] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    try {
      const [cfgData, jobsData, queuesData, summaryData] = await Promise.all([
        getUiPathStatus(),
        getUiPathJobs(),
        getUiPathQueues(),
        getUiPathSummary()
      ]);
      setConfig(cfgData);
      setJobs(jobsData);
      setQueues(queuesData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load UiPath data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async (processName: string) => {
    try {
      setTriggeringProcess(processName);
      setMessage(null);
      const res = await triggerUiPathJob(processName, { manualTrigger: true, triggeredAt: new Date().toISOString() });
      setMessage({ text: res.message || 'Job triggered successfully!', type: 'success' });
      fetchData();
    } catch (err: any) {
      console.error('Trigger job failed:', err);
      setMessage({ text: err.message || 'Failed to trigger RPA process.', type: 'error' });
    } finally {
      setTriggeringProcess(null);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Connecting to UiPath Orchestrator API...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-left">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 m-0">
          UiPath Orchestrator Hub
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Monitor unattended robot activities, transactional queues, and trigger healing workflows.
        </p>
      </div>

      {/* Toast Alert Banner */}
      {message && (
        <div className={`p-4 rounded-xl border flex items-start space-x-3 text-sm animate-fade-in ${
          message.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div>
            <span className="font-semibold">{message.type === 'success' ? 'Execution Dispatched: ' : 'Execution Failed: '}</span>
            {message.text}
          </div>
        </div>
      )}

      {/* Cloud Connectivity and Robots Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Connection Details Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 relative overflow-hidden shadow-sm lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-blue-600 font-mono tracking-wider uppercase">Orchestrator Connection API</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 m-0">Automation Cloud Live</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono pt-2">
                <div>
                  <span className="text-slate-400 block font-medium">Tenant Name</span>
                  <span className="text-slate-700 font-semibold">{config?.tenantName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Org Unit ID</span>
                  <span className="text-slate-700 font-semibold">{config?.organizationId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Connection State</span>
                  <span className="text-emerald-600 font-bold">{config?.connectionMode}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl font-mono text-xs text-left min-w-[200px] space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Folder path:</span>
                <span className="text-slate-700 font-semibold">{config?.folderPath}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Host URL:</span>
                <a href={config?.uipathHost} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 underline font-semibold">
                  cloud.uipath.com
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Scopes Auth:</span>
                <span className="text-emerald-600 font-bold">Token Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Robots Registry Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center space-x-2.5 border-b border-slate-100 pb-3 mb-4">
            <Cpu className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider m-0">Robot Registry</h3>
          </div>
          <div className="space-y-3">
            {config?.activeRobots.map((robot, i) => (
              <div key={i} className="flex justify-between items-center text-xs p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="font-semibold text-slate-700">{robot.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">{robot.type}</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[9px] font-semibold border border-emerald-100">
                    {robot.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Orchestrator Statistics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Total Robot Jobs</span>
          <span className="text-2xl font-mono font-bold block mt-2 text-slate-800">
            {summary?.jobs.total || 0}
          </span>
          <p className="text-[10px] text-emerald-600 mt-1 font-semibold">
            {summary?.jobs.success || 0} successful runs
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Queue Transactions</span>
          <span className="text-2xl font-mono font-bold block mt-2 text-slate-800">
            {summary?.queues.total || 0}
          </span>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">
            Success Rate: {summary?.queues.total ? ((summary.queues.success / summary.queues.total) * 100).toFixed(1) : '100'}%
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">RPA Exception Errors</span>
          <span className="text-2xl font-mono font-bold block mt-2 text-rose-600">
            {summary?.queues.failed || 0}
          </span>
          <p className="text-[10px] text-rose-600 mt-1 font-semibold">
            {summary?.queues.businessExceptions || 0} Biz / {summary?.queues.appExceptions || 0} App
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <span className="text-xs text-slate-400 block font-medium">Avg Robot Latency</span>
          <span className="text-2xl font-mono font-bold block mt-2 text-purple-600">
            {summary?.queues.avgDurationMs ? `${(summary.queues.avgDurationMs / 1000).toFixed(2)}s` : '1.50s'}
          </span>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">
            Average item verification cycle
          </p>
        </div>
      </div>

      {/* Manual Process Trigger Panels */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
          <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Play className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 m-0">Manual RPA Robot Dispatch</h3>
            <p className="text-xs text-slate-400">Dispatch unattended UiPath processes to execute infrastructure healing actions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {config?.mappedProcesses.map((proc) => (
            <div key={proc.key} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-4 hover:border-blue-600/40 transition-colors">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block">{proc.key}</span>
                <h4 className="text-sm font-bold text-slate-800 m-0">{proc.processName}</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">{proc.description}</p>
              </div>
              
              <button
                onClick={() => handleTrigger(proc.processName)}
                disabled={triggeringProcess !== null}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm disabled:opacity-40"
              >
                {triggeringProcess === proc.processName ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{triggeringProcess === proc.processName ? 'Triggering...' : 'Dispatch Robot'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Grid: Jobs execution log and Queue Transaction Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* RPA Robot Jobs execution logs */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 m-0">Robot Execution Logs</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">odata/Jobs Endpoint</span>
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto pr-2">
              {jobs.length === 0 ? (
                <div className="py-12 text-slate-400 text-center text-xs font-mono">No robot jobs recorded.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-mono tracking-wider uppercase">
                      <th className="pb-2">Process Release</th>
                      <th className="pb-2">Robot</th>
                      <th className="pb-2">State</th>
                      <th className="pb-2 text-right">Start Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 font-semibold text-slate-700">
                          <div className="flex flex-col">
                            <span>{job.process_name}</span>
                            <span className="text-[9px] text-slate-400">{job.job_id}</span>
                          </div>
                        </td>
                        <td className="py-3 text-slate-500">{job.robot_name || 'Robot_Maestro_01'}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            job.state === 'Successful' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                            job.state === 'Faulted' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                            'bg-blue-50 text-blue-700 border-blue-200/50 animate-pulse'
                          }`}>
                            {job.state}
                          </span>
                        </td>
                        <td className="py-3 text-right text-slate-400">
                          {job.start_time ? new Date(job.start_time).toLocaleTimeString() : 'n/a'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Transactional Queues logs */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900 m-0">Transactional Queue Items</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">odata/QueueItems Endpoint</span>
            </div>

            <div className="overflow-x-auto max-h-[400px] overflow-y-auto pr-2">
              {queues.length === 0 ? (
                <div className="py-12 text-slate-400 text-center text-xs font-mono">No queue items processed.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-mono tracking-wider uppercase">
                      <th className="pb-2">Queue Name</th>
                      <th className="pb-2">Ref</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Exception</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {queues.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 font-semibold text-slate-700 truncate max-w-[150px]" title={item.queue_name}>
                          {item.queue_name.replace('Deployment_', '').replace('_Queue', '')}
                        </td>
                        <td className="py-3 text-slate-400 text-[10px]">{item.reference ? item.reference.substring(0, 8) : '-'}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            item.status === 'Successful' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                            item.status === 'Failed' ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                            'bg-blue-50 text-blue-700 border-blue-200/50 animate-pulse'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {item.exception_type ? (
                            <div className="flex flex-col items-end">
                              <span className="text-rose-600 text-[10px] font-semibold">{item.exception_type}</span>
                              <span className="text-slate-400 text-[8px] max-w-[120px] truncate" title={item.exception_reason || ''}>
                                {item.exception_reason}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-semibold">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
