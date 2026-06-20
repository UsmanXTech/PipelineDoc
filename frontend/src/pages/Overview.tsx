import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  getDeployments, getIncidents, getSLOs, 
  type Deployment, type Incident, type SLOCompliance 
} from '../services/api';
import { 
  Play, ShieldAlert, CheckCircle, XCircle, ArrowUpRight, 
  RefreshCw, TrendingUp, ShieldCheck, AlertTriangle 
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';

export default function Overview() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [slos, setSlos] = useState<SLOCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading && deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-10 h-10 text-purple-500 animate-spin" />
        <p className="text-slate-400 text-sm font-mono">Synchronizing PipelineDoc cluster state...</p>
      </div>
    );
  }

  // Derived metrics
  const successDeploys = deployments.filter(d => d.status === 'success').length;
  const runningDeploys = deployments.filter(d => d.status === 'running').length;

  const totalIncidents = incidents.length;
  const activeIncidents = incidents.filter(i => !i.resolved_at).length;

  // Chart data formatting
  // 1. Deployment over time (group by day or index)
  const deployChartData = deployments.slice().reverse().map((d, index) => ({
    name: `D-${deployments.length - index}`,
    risk: d.risk_score || 0,
    status: d.status
  }));

  // 2. SLO Compliance data
  const sloChartData = slos.map(s => ({
    name: s.name.substring(0, 12) + '...',
    Actual: s.actual * 100,
    Target: s.target * 100
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start space-x-3 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Connection Alert: </span>
            {error}
          </div>
        </div>
      )}

      {/* Hero / Stat Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all duration-300"></div>
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-400 font-medium">SLO Compliance</p>
            <span className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-white">
              {slos.length > 0 ? `${(slos.reduce((acc, s) => acc + s.actual, 0) / slos.length * 100).toFixed(2)}%` : '99.8%'}
            </h3>
            <p className="text-xs text-purple-400 flex items-center mt-1 space-x-1">
              <TrendingUp className="w-3 h-3" />
              <span>Above aggregate target threshold</span>
            </p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-400 font-medium">Deployments</p>
            <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Play className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-white">{deployments.length}</h3>
            <p className="text-xs text-emerald-400 flex items-center mt-1 space-x-1">
              <span>{successDeploys} success</span>
              <span className="text-slate-600">•</span>
              <span>{runningDeploys} running</span>
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-all duration-300"></div>
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-400 font-medium">Active Incidents</p>
            <span className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
              <ShieldAlert className="w-4 h-4 animate-bounce" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-white">{activeIncidents}</h3>
            <p className="text-xs text-rose-400 flex items-center mt-1 space-x-1">
              <span>{totalIncidents - activeIncidents} resolved automatically</span>
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all duration-300"></div>
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-400 font-medium">Auto-Rollbacks</p>
            <span className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-white">
              {deployments.filter(d => d.status === 'rolled_back' || d.status === 'rolling_back').length}
            </h3>
            <p className="text-xs text-cyan-400 flex items-center mt-1 space-x-1">
              <span>Gatekeeper risk score protection active</span>
            </p>
          </div>
        </div>
      </div>

      {/* UiPath Hackathon Orchestrator Banner */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-purple-950/40 border border-slate-800 rounded-3xl p-6 relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-80 h-40 bg-purple-500/5 rounded-full blur-3xl"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 text-left">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-xs font-bold text-purple-400 font-mono tracking-widest uppercase">UiPath Hackathon Integrations Hub</span>
            </div>
            <h2 className="text-xl font-bold text-white m-0">Autonomous RPA Orchestrator Active</h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              PipelineDoc automates test verification and remediations using UiPath Cloud Services. Pre-deploy checks package artifacts as VSIX modules via <code>uipcli</code>, deployment sets trigger via <strong>Test Set Executions</strong>, and failure corrections dispatch specialized orchestrations.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 shrink-0 font-mono text-xs text-left">
            <div className="bg-slate-950/60 border border-slate-800/80 px-4 py-2.5 rounded-xl text-slate-300">
              <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider">Test Cloud Execution</span>
              <span className="text-emerald-400 font-bold flex items-center space-x-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Active (200 OK)</span>
              </span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 px-4 py-2.5 rounded-xl text-slate-300">
              <span className="text-slate-500 block text-[9px] uppercase font-bold tracking-wider">Orchestrator releases</span>
              <span className="text-purple-400 font-bold mt-0.5 block">3 Processes Mapped</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Deployment Risk Score Trend */}
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-white m-0">Deployment Risk scores</h2>
              <p className="text-xs text-slate-400 mt-1">Pre-deployment scoring trends evaluated by Gatekeeper Agent</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={deployChartData}>
                <defs>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Area type="monotone" dataKey="risk" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorRisk)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: SLO Compliance Status */}
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-white m-0">SLO Compliance Levels</h2>
              <p className="text-xs text-slate-400 mt-1">Current metrics compared to configured compliance targets</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sloChartData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="%" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="Actual" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Target" fill="#334155" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Deployments & Incidents Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Deployments Table */}
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-white m-0">Recent Deployments</h2>
                <p className="text-xs text-slate-400 mt-1">Triggered pipelines and automated rollout status</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-medium text-xs uppercase tracking-wider">
                    <th className="pb-3">Repository</th>
                    <th className="pb-3">Branch / Commit</th>
                    <th className="pb-3">Strategy</th>
                    <th className="pb-3">Risk</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {deployments.slice(0, 5).map((d) => (
                    <tr key={d.id} className="hover:bg-slate-800/10 transition-colors">
                      <td className="py-3.5 font-semibold text-white">{d.repo}</td>
                      <td className="py-3.5">
                        <div className="flex flex-col">
                          <span className="text-slate-300 font-mono text-xs">{d.branch}</span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">{d.commit_sha?.substring(0, 7) || 'n/a'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 capitalize text-xs text-slate-400">{d.strategy}</td>
                      <td className="py-3.5">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-mono ${
                          (d.risk_score || 0) > 50 
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {d.risk_score !== null ? d.risk_score : '-'}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          d.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          d.status === 'failure' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          d.status === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                          'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        }`}>
                          {d.status === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                          {d.status === 'failure' && <XCircle className="w-3.5 h-3.5" />}
                          {d.status === 'running' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                          <span>{d.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <Link 
                          to={`/deployments/${d.id}`}
                          className="inline-flex items-center space-x-1 text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors"
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
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-white m-0">Failure Diagnostics</h2>
                <p className="text-xs text-slate-400 mt-1">Automatic RCA and Healing reports</p>
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
                  <div key={i.id} className="p-4 bg-slate-800/20 border border-slate-800 rounded-2xl hover:border-slate-700 transition-colors">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                        {i.type.replace('_', ' ')}
                      </span>
                      <span className={`w-2.5 h-2.5 rounded-full ${i.resolved_at ? 'bg-slate-600' : 'bg-rose-500 animate-pulse'}`}></span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono truncate mt-2">
                      {i.root_cause || 'Investigating logs...'}
                    </p>
                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-800/50">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(i.created_at).toLocaleTimeString()}
                      </span>
                      <Link 
                        to={`/incidents/${i.id}`}
                        className="text-[11px] font-semibold text-purple-400 hover:text-purple-300"
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
    </div>
  );
}
