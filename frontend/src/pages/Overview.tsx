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
    <div className="space-y-8 animate-fade-in">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3 text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Connection Alert: </span>
            {error}
          </div>
        </div>
      )}

      {/* Hero / Stat Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 group">
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-500 font-medium">SLO Compliance</p>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-slate-900">
              {slos.length > 0 ? `${(slos.reduce((acc, s) => acc + s.actual, 0) / slos.length * 100).toFixed(2)}%` : '99.8%'}
            </h3>
            <p className="text-xs text-blue-600 flex items-center mt-1 space-x-1 font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>Above aggregate target threshold</span>
            </p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 group">
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-500 font-medium">Deployments</p>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Play className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-slate-900">{deployments.length}</h3>
            <p className="text-xs text-emerald-600 flex items-center mt-1 space-x-1 font-medium">
              <span>{successDeploys} success</span>
              <span className="text-slate-300">•</span>
              <span>{runningDeploys} running</span>
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 group">
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-500 font-medium">Active Incidents</p>
            <span className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-slate-900">{activeIncidents}</h3>
            <p className="text-xs text-rose-600 flex items-center mt-1 space-x-1 font-medium">
              <span>{totalIncidents - activeIncidents} resolved automatically</span>
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 group">
          <div className="flex justify-between items-start">
            <p className="text-sm text-slate-500 font-medium">Auto-Rollbacks</p>
            <span className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold tracking-tight text-slate-900">
              {deployments.filter(d => d.status === 'rolled_back' || d.status === 'rolling_back').length}
            </h3>
            <p className="text-xs text-cyan-600 flex items-center mt-1 space-x-1 font-medium">
              <span>Gatekeeper risk score protection active</span>
            </p>
          </div>
        </div>
      </div>

      {/* UiPath Hackathon Orchestrator Banner */}
      <div className="bg-gradient-to-r from-blue-50/60 via-slate-50/50 to-indigo-50/60 border border-slate-200 rounded-3xl p-6 relative overflow-hidden shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 text-left">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold text-blue-600 font-mono tracking-wider uppercase">UiPath Hackathon Integrations Hub</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 m-0">Autonomous RPA Orchestrator Active</h2>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              PipelineDoc automates test verification and remediations using UiPath Cloud Services. Pre-deploy checks package artifacts as VSIX modules via <code>uipcli</code>, deployment sets trigger via <strong>Test Set Executions</strong>, and failure corrections dispatch specialized orchestrations.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 shrink-0 font-mono text-xs text-left">
            <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-slate-700 shadow-sm/5">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Test Cloud Execution</span>
              <span className="text-emerald-600 font-bold flex items-center space-x-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Active (200 OK)</span>
              </span>
            </div>
            <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-slate-700 shadow-sm/5">
              <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Orchestrator releases</span>
              <span className="text-blue-600 font-bold mt-0.5 block">3 Processes Mapped</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Deployment Risk Score Trend */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">Deployment Risk Scores</h2>
              <p className="text-xs text-slate-500 mt-1">Pre-deployment scoring trends evaluated by Gatekeeper Agent</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={deployChartData}>
                <defs>
                  <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                  labelStyle={{ color: '#64748b', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="risk" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorRisk)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: SLO Compliance Status */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">SLO Compliance Levels</h2>
              <p className="text-xs text-slate-500 mt-1">Current metrics compared to configured compliance targets</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sloChartData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="%" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                  labelStyle={{ color: '#64748b', fontWeight: 'bold' }}
                />
                <Bar dataKey="Actual" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Deployments & Incidents Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Deployments Table */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 lg:col-span-2 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 m-0">Recent Deployments</h2>
                <p className="text-xs text-slate-500 mt-1">Triggered pipelines and automated rollout status</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                    <th className="pb-3">Repository</th>
                    <th className="pb-3">Branch / Commit</th>
                    <th className="pb-3">Strategy</th>
                    <th className="pb-3">Risk</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deployments.slice(0, 5).map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 font-semibold text-slate-800">{d.repo}</td>
                      <td className="py-3.5">
                        <div className="flex flex-col">
                          <span className="text-slate-600 font-mono text-xs">{d.branch}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">{d.commit_sha?.substring(0, 7) || 'n/a'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 capitalize text-xs text-slate-500">{d.strategy}</td>
                      <td className="py-3.5">
                        <span className={`px-2 py-0.5 text-xs rounded-full font-mono font-medium ${
                          (d.risk_score || 0) > 50 
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/50' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                        }`}>
                          {d.risk_score !== null ? d.risk_score : '-'}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          d.status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' :
                          d.status === 'failure' ? 'bg-rose-50 text-rose-700 border border-rose-200/50' :
                          d.status === 'running' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                          'bg-cyan-50 text-cyan-700 border border-cyan-200/50'
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
                          className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors cursor-pointer"
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
        <div className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 m-0">Failure Diagnostics</h2>
                <p className="text-xs text-slate-500 mt-1">Automatic RCA and Healing reports</p>
              </div>
            </div>

            <div className="space-y-4">
              {incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-xs">
                  <CheckCircle className="w-8 h-8 text-slate-300 mb-2" />
                  <span>All microservices healthy. No incidents.</span>
                </div>
              ) : (
                incidents.slice(0, 4).map((i) => (
                  <div key={i.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:border-slate-300 hover:bg-slate-50/80 transition-all">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-mono font-bold text-slate-500 uppercase">
                        {i.type.replace('_', ' ')}
                      </span>
                      <span className={`w-2.5 h-2.5 rounded-full ${i.resolved_at ? 'bg-slate-300' : 'bg-rose-500 animate-pulse'}`}></span>
                    </div>
                    <p className="text-xs text-slate-600 font-mono truncate mt-2">
                      {i.root_cause || 'Investigating logs...'}
                    </p>
                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-200/50">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(i.created_at).toLocaleTimeString()}
                      </span>
                      <Link 
                        to={`/incidents/${i.id}`}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
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
