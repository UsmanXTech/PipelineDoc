import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getIncidentDetails, type Incident } from '../services/api';
import { 
  ArrowLeft, RefreshCw, AlertOctagon, ShieldCheck, 
  Cpu, Sparkles 
} from 'lucide-react';

export default function IncidentDetails() {
  const { id } = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncident = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getIncidentDetails(id);
      setIncident(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching incident:', err);
      setError('Could not retrieve detailed report for this incident.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncident();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
        <p className="text-slate-400 text-sm font-mono">Analyzing failure logs & telemetry...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-6">
        <Link to="/" className="inline-flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <AlertOctagon className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white">Incident Report Not Found</h3>
          <p className="text-sm text-slate-400 mt-2">{error || 'The requested incident ID could not be matched.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Navigation & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div className="space-y-2">
          <Link to="/" className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white m-0 uppercase">
              Incident RCA Report
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-mono border ${
              incident.resolved_at 
                ? 'bg-slate-800/40 text-slate-400 border-slate-700' 
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
            }`}>
              {incident.resolved_at ? 'Resolved' : 'Active'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono">ID: {incident.id}</p>
        </div>
      </div>

      {/* Overview Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* RCA Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Diagnostic Root Cause */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
              <span className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl">
                <AlertOctagon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white m-0">Root Cause Analysis (RCA)</h3>
                <p className="text-xs text-slate-500">Determined automatically by PipelineDoc failure agent</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 bg-slate-950/60 border border-slate-900 rounded-2xl font-mono text-sm text-slate-200">
                <span className="text-rose-400 font-semibold block mb-1">RCA Summary:</span>
                {incident.root_cause || 'No clear error log identified.'}
              </div>

              {incident.details && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-400 tracking-wide uppercase">Raw Stacktrace / Log Snippet</span>
                  <pre className="p-4 bg-slate-950/80 border border-slate-900/60 rounded-xl overflow-x-auto text-xs text-slate-400 font-mono leading-relaxed max-h-60 overflow-y-auto">
                    {typeof incident.details === 'string' 
                      ? incident.details 
                      : JSON.stringify(incident.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* AI-Suggested Fix / Mitigation */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl"></div>
            <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
              <span className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white m-0">AI Actionable Remediations</h3>
                <p className="text-xs text-slate-500">Autonomous repair recommendations & script fixes</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 bg-purple-950/10 border border-purple-500/10 rounded-2xl text-slate-200 text-sm leading-relaxed">
                <span className="text-purple-400 font-semibold block mb-1">Suggested Fix:</span>
                {incident.suggested_fix || incident.resolution || 'No automated remediation plan generated yet.'}
              </div>

              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <Cpu className="w-4 h-4 text-purple-500" />
                <span>Fix can be triggered automatically through our conversational Slack commands.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
          {/* Metadata Card */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-6">
            <h3 className="text-sm font-bold text-white tracking-wider uppercase border-b border-slate-800 pb-3 m-0">
              Incident Info
            </h3>

            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 block">Anomaly Category</span>
                <span className="text-sm font-semibold text-slate-200 capitalize font-mono">
                  {incident.type.replace('_', ' ')}
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-500 block">Triggered Timestamp</span>
                <span className="text-sm font-semibold text-slate-200 font-mono">
                  {new Date(incident.created_at).toLocaleString()}
                </span>
              </div>

              {incident.resolved_at && (
                <div>
                  <span className="text-xs text-slate-500 block">Resolved Timestamp</span>
                  <span className="text-sm font-semibold text-emerald-400 font-mono">
                    {new Date(incident.resolved_at).toLocaleString()}
                  </span>
                </div>
              )}

              <div>
                <span className="text-xs text-slate-500 block">Mean Time to Resolution (MTTR)</span>
                <span className="text-sm font-semibold text-purple-400 font-mono">
                  {incident.resolved_at 
                    ? `${Math.round((new Date(incident.resolved_at).getTime() - new Date(incident.created_at).getTime()) / 1000)} seconds`
                    : 'Awaiting resolution...'}
                </span>
              </div>
            </div>
          </div>

          {/* Healing Policy Card */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-4">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h4 className="text-sm font-bold text-white m-0">Healing Policy Enforced</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              FailureDoctor and HealingFlow automatically triggered diagnostic orchestration via UiPath Maestro to query host logs and test environments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
