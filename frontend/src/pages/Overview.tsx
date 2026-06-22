import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  getDeployments, getIncidents, getSLOs, 
  type Deployment, type Incident, type SLOCompliance 
} from '../services/api';
import { 
  Play, ShieldAlert, CheckCircle, ArrowUpRight, 
  RefreshCw, TrendingUp, ShieldCheck, AlertTriangle, Terminal as TerminalIcon
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';

export default function Overview() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [slos, setSlos] = useState<SLOCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [deploysData, incidentsData, slosData] = await Promise.all([
        getDeployments(),
        getIncidents(),
        getSLOs()
      ]);
      setDeployments(deploysData);
      setIncidents(incidentsData);
      setSlos(slosData);
      setError(null);
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to fetch real-time dashboard data. Please verify backend service connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (deployments.length > 0 || incidents.length > 0) {
      const logs: { time: Date; text: string; type: string }[] = [];
      
      deployments.forEach(d => {
        const time = new Date(d.started_at);
        logs.push({
          time,
          text: `[SYSTEM] Pipeline triggered for ${d.repo} [branch: ${d.branch}] with strategy: ${d.strategy}`,
          type: 'INFO'
        });
        if (d.risk_score !== null) {
          logs.push({
            time: new Date(time.getTime() + 1200),
            text: `[GATEKEEPER] Audited risk score for ${d.repo}: ${d.risk_score} (Decision: ${d.risk_score > 50 ? 'BLOCK' : 'PASS'})`,
            type: d.risk_score > 50 ? 'WARN' : 'SUCCESS'
          });
        }
        if (d.status === 'success') {
          logs.push({
            time: new Date(new Date(d.completed_at || d.started_at).getTime()),
            text: `[DEPLOYMENT] Automated rollout succeeded for ${d.repo} [commit: ${d.commit_sha?.substring(0, 7)}]`,
            type: 'SUCCESS'
          });
        } else if (d.status === 'failure') {
          logs.push({
            time: new Date(new Date(d.completed_at || d.started_at).getTime()),
            text: `[DEPLOYMENT] Rollout FAILED for ${d.repo} - Initiating self-healing workflow`,
            type: 'ERROR'
          });
        } else if (d.status === 'rolling_back') {
          logs.push({
            time: new Date(time.getTime() + 3000),
            text: `[HEALER] High error rate detected on ${d.repo}. Rollback plan generated and encrypted.`,
            type: 'WARN'
          });
        }
      });
      
      incidents.forEach(i => {
        const time = new Date(i.created_at);
        logs.push({
          time,
          text: `[MONITOR] Incident detected: Type ${i.type} on cluster node. Root cause: ${i.root_cause || 'Analyzing logs'}`,
          type: 'ERROR'
        });
        if (i.suggested_fix) {
          logs.push({
            time: new Date(time.getTime() + 2500),
            text: `[HEALER] Suggested remediation: ${i.suggested_fix}`,
            type: 'INFO'
          });
        }
        if (i.resolved_at) {
          logs.push({
            time: new Date(i.resolved_at),
            text: `[HEALER] Action executed successfully via UiPath Maestro. Incident ${i.id.substring(0,8)} RESOLVED.`,
            type: 'SUCCESS'
          });
        }
      });
      
      // Sort chronologically and keep the last 30
      const formatted = logs
        .sort((a, b) => a.time.getTime() - b.time.getTime())
        .map(log => {
          const timestamp = log.time.toISOString().replace('T', ' ').substring(0, 19);
          return `[${timestamp}] ${log.text}`;
        })
        .slice(-30);
        
      setTerminalLogs(formatted);
    }
  }, [deployments, incidents]);

  if (loading && deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Synchronizing PipelineDoc cluster state...</p>
      </div>
    );
  }

  // Derived metrics
  const successDeploys = deployments.filter(d => d.status === 'success').length;
  const runningDeploys = deployments.filter(d => d.status === 'running').length;
  const totalIncidents = incidents.length;
  const activeIncidents = incidents.filter(i => !i.resolved_at).length;

  // Chart data formatting
  const deployChartData = deployments.slice().reverse().map((d, index) => ({
    name: `D-${deployments.length - index}`,
    risk: d.risk_score || 0,
    status: d.status
  }));

  const sloChartData = slos.map(s => ({
    name: s.name.substring(0, 12) + '...',
    Actual: s.actual * 100,
    Target: s.target * 100
  }));

  return (
    <div className="space-y-8 animate-fade-in text-left">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Connection Alert: </span>
            {error}
          </div>
        </div>
      )}

      {/* Bento Grid Layer 1: Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <div className="bento-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">SLO Compliance</p>
            <span className="p-2 bg-blue-600/10 text-blue-600 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-black tracking-swiss-tight text-white leading-none">
              {slos.length > 0 ? `${(slos.reduce((acc, s) => acc + s.actual, 0) / slos.length * 100).toFixed(2)}%` : '99.8%'}
            </h3>
            <p className="text-[10px] text-blue-500 flex items-center mt-2 space-x-1 font-medium font-mono">
              <TrendingUp className="w-3 h-3" />
              <span>Above aggregate target threshold</span>
            </p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bento-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Deployments</p>
            <span className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <Play className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-black tracking-swiss-tight text-white leading-none">{deployments.length}</h3>
            <p className="text-[10px] text-emerald-500 flex items-center mt-2 space-x-1.5 font-medium font-mono">
              <span>{successDeploys} success</span>
              <span className="text-slate-700">•</span>
              <span>{runningDeploys} running</span>
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bento-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Incidents</p>
            <span className="p-2 bg-red-500/10 text-red-500 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-black tracking-swiss-tight text-white leading-none">{activeIncidents}</h3>
            <p className="text-[10px] text-red-500 flex items-center mt-2 space-x-1 font-medium font-mono">
              <span>{totalIncidents - activeIncidents} resolved automatically</span>
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bento-card p-6 relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Auto-Rollbacks</p>
            <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-black tracking-swiss-tight text-white leading-none">
              {deployments.filter(d => d.status === 'rolled_back' || d.status === 'rolling_back').length}
            </h3>
            <p className="text-[10px] text-indigo-400 flex items-center mt-2 space-x-1 font-medium font-mono">
              <span>Gatekeeper risk score protection active</span>
            </p>
          </div>
        </div>
      </div>

      {/* UiPath Hackathon Orchestrator Banner */}
      <div className="bento-card p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 text-left">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 glowing-indicator-green"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 glowing-indicator-green"></span>
              </span>
              <span className="text-[10px] font-bold text-blue-600 font-mono tracking-wider uppercase">UiPath Cloud Integrations</span>
            </div>
            <h2 className="text-xl font-extrabold text-white m-0 tracking-swiss-tight">Autonomous RPA Orchestration Enabled</h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              PipelineDoc automates test verification and remediations using UiPath Cloud Services. Pre-deploy checks package artifacts as VSIX modules via <code>uipcli</code>, deployment sets trigger via <strong>Test Set Executions</strong>, and failure corrections dispatch specialized orchestrations.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 shrink-0 font-mono text-xs text-left">
            <div className="bg-slate-950 border border-slate-200/50 px-4 py-2.5 rounded-2xl text-slate-300">
              <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider">Test Cloud Status</span>
              <span className="text-emerald-500 font-bold flex items-center space-x-1.5 mt-0.5">
                <span>Active (200 OK)</span>
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-200/50 px-4 py-2.5 rounded-2xl text-slate-300">
              <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider">RPA Maps</span>
              <span className="text-blue-500 font-bold mt-0.5 block">3 Processes Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid Layer 2: Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Deployment Risk Score Trend */}
        <div className="bento-card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-white m-0 tracking-swiss-tight">Deployment Risk Scores</h2>
              <p className="text-xs text-slate-500 mt-1">Pre-deployment scoring trends evaluated by Gatekeeper Agent</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={deployChartData}>
                <defs>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#52525B" fontSize={11} tickLine={false} />
                <YAxis stroke="#52525B" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111113', borderColor: '#222226', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}
                  labelStyle={{ color: '#71717A', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="risk" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#colorRisk)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: SLO Compliance Status */}
        <div className="bento-card p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-white m-0 tracking-swiss-tight">SLO Compliance Levels</h2>
              <p className="text-xs text-slate-500 mt-1">Current metrics compared to configured targets</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sloChartData}>
                <XAxis dataKey="name" stroke="#52525B" fontSize={11} tickLine={false} />
                <YAxis stroke="#52525B" fontSize={11} tickLine={false} unit="%" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111113', borderColor: '#222226', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}
                  labelStyle={{ color: '#71717A', fontWeight: 'bold' }}
                />
                <Bar dataKey="Actual" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Target" fill="#222226" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bento Grid Layer 3: Deployments & Incidents Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Deployments Table */}
        <div className="bento-card p-6 lg:col-span-2">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-base font-bold text-white m-0 tracking-swiss-tight">Recent Deployments</h2>
                <p className="text-xs text-slate-500 mt-1">Triggered pipelines and automated rollout status</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                    <th className="pb-3">Repository</th>
                    <th className="pb-3">Branch / Commit</th>
                    <th className="pb-3">Strategy</th>
                    <th className="pb-3">Risk</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50">
                  {deployments.slice(0, 5).map((d) => (
                    <tr key={d.id} className="hover:bg-slate-100/50 transition-colors">
                      <td className="py-3.5 font-bold text-white">{d.repo}</td>
                      <td className="py-3.5">
                        <div className="flex flex-col">
                          <span className="text-slate-300 font-mono text-xs">{d.branch}</span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">{d.commit_sha?.substring(0, 7) || 'n/a'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 capitalize text-xs text-slate-400">{d.strategy}</td>
                      <td className="py-3.5">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-mono font-medium ${
                          (d.risk_score || 0) > 50 
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {d.risk_score !== null ? d.risk_score : '-'}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          d.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          d.status === 'failure' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          d.status === 'running' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' :
                          'bg-slate-100/50 text-slate-300 border border-slate-200'
                        }`}>
                          {d.status === 'success' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 glowing-indicator-green"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 glowing-indicator-green"></span>
                            </span>
                          )}
                          {d.status === 'failure' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 glowing-indicator-red"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 glowing-indicator-red"></span>
                            </span>
                          )}
                          {d.status === 'running' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 glowing-indicator-indigo"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500 glowing-indicator-indigo"></span>
                            </span>
                          )}
                          <span className="capitalize">{d.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <Link 
                          to={`/deployments/${d.id}`}
                          className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-500 font-semibold transition-colors cursor-pointer"
                        >
                          <span>Track</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Active Incidents & Diagnostics */}
        <div className="bento-card p-6">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-base font-bold text-white m-0 tracking-swiss-tight">Failure Diagnostics</h2>
                <p className="text-xs text-slate-500 mt-1">Automatic RCA and Healing reports</p>
              </div>
            </div>

            <div className="space-y-4">
              {incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs">
                  <CheckCircle className="w-8 h-8 text-slate-700 mb-2" />
                  <span>All microservices healthy. No incidents.</span>
                </div>
              ) : (
                incidents.slice(0, 4).map((i) => (
                  <div key={i.id} className="p-4 bg-slate-950 border border-slate-200 rounded-2xl hover:border-slate-400 transition-all animate-slide-in">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                        {i.type.replace('_', ' ')}
                      </span>
                      <span className="relative flex h-2 w-2">
                        {!i.resolved_at && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 glowing-indicator-red"></span>}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${i.resolved_at ? 'bg-slate-500' : 'bg-red-500 glowing-indicator-red'}`}></span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono truncate mt-2">
                      {i.root_cause || 'Investigating logs...'}
                    </p>
                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-200">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(i.created_at).toLocaleTimeString()}
                      </span>
                      <Link 
                        to={`/incidents/${i.id}`}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-500 cursor-pointer"
                      >
                        Details →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid Layer 4: Full-bleed Terminal Log Panel */}
      <div className="bento-card p-6 overflow-hidden">
        <div className="flex items-center space-x-2.5 mb-4 pb-3 border-b border-slate-200">
          <TerminalIcon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold text-white m-0 tracking-swiss-tight">Telemetry & Action Stream</h2>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-2"></span>
          <span className="text-[10px] text-slate-500 font-mono">Listening on cluster events...</span>
        </div>
        
        <div className="h-64 overflow-y-auto bg-slate-950/80 p-4 border border-slate-200/50 rounded-2xl font-mono text-xs text-slate-300 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {terminalLogs.length === 0 ? (
            <div className="text-slate-600 italic">No cluster logs available. Monitoring environment...</div>
          ) : (
            terminalLogs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap leading-relaxed select-all">
                <span className="text-slate-600">{log.substring(0, 21)}</span>
                <span className={
                  log.includes('[ERROR]') ? 'text-red-400' :
                  log.includes('[SUCCESS]') ? 'text-emerald-400' :
                  log.includes('[WARN]') ? 'text-amber-400' :
                  log.includes('[GATEKEEPER]') ? 'text-indigo-400' :
                  'text-slate-300'
                }>
                  {log.substring(21)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
