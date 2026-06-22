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
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Analyzing failure logs & telemetry...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-6">
        <Link to="/" className="inline-flex items-center space-x-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <AlertOctagon className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900">Incident Report Not Found</h3>
          <p className="text-sm text-slate-500 mt-2">{error || 'The requested incident ID could not be matched.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-left">
      {/* Navigation & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div className="space-y-2">
          <Link to="/" className="inline-flex items-center space-x-2 text-xs text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 m-0 uppercase">
              Incident RCA Report
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-mono border font-semibold ${
              incident.resolved_at 
                ? 'bg-slate-100 text-slate-500 border-slate-200' 
                : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
            }`}>
              {incident.resolved_at ? 'Resolved' : 'Active'}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">ID: {incident.id}</p>
        </div>
      </div>

      {/* Overview Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* RCA Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Diagnostic Root Cause */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
              <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                <AlertOctagon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Root Cause Analysis (RCA)</h3>
                <p className="text-xs text-slate-400">Determined automatically by PipelineDoc failure agent</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm text-slate-700">
                <span className="text-rose-600 font-semibold block mb-1">RCA Summary:</span>
                {incident.root_cause || 'No clear error log identified.'}
              </div>

              {incident.details && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-400 tracking-wide uppercase">Raw Stacktrace / Log Snippet</span>
                  <pre className="p-4 bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto text-xs text-slate-600 font-mono leading-relaxed max-h-60 overflow-y-auto">
                    {typeof incident.details === 'string' 
                      ? incident.details 
                      : JSON.stringify(incident.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* AI-Suggested Fix / Mitigation */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
            <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
              <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">AI Actionable Remediations</h3>
                <p className="text-xs text-slate-400">Autonomous repair recommendations & script fixes</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 bg-purple-50 border border-purple-100 rounded-2xl text-slate-700 text-sm leading-relaxed">
                <span className="text-purple-700 font-semibold block mb-1">Suggested Fix:</span>
                {incident.suggested_fix || incident.resolution || 'No automated remediation plan generated yet.'}
              </div>

              <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
                <Cpu className="w-4 h-4 text-purple-600" />
                <span>Fix can be triggered automatically through our conversational Slack commands.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
          {/* Metadata Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 tracking-wider uppercase border-b border-slate-100 pb-3 m-0">
              Incident Info
            </h3>

            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-400 block font-medium">Anomaly Category</span>
                <span className="text-sm font-semibold text-slate-700 capitalize font-mono">
                  {incident.type.replace('_', ' ')}
                </span>
              </div>

              <div>
                <span className="text-xs text-slate-400 block font-medium">Triggered Timestamp</span>
                <span className="text-sm font-semibold text-slate-700 font-mono">
                  {new Date(incident.created_at).toLocaleString()}
                </span>
              </div>

              {incident.resolved_at && (
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Resolved Timestamp</span>
                  <span className="text-sm font-semibold text-emerald-600 font-mono">
                    {new Date(incident.resolved_at).toLocaleString()}
                  </span>
                </div>
              )}

              <div>
                <span className="text-xs text-slate-400 block font-medium">Mean Time to Resolution (MTTR)</span>
                <span className="text-sm font-semibold text-purple-600 font-mono">
                  {incident.resolved_at 
                    ? `${Math.round((new Date(incident.resolved_at).getTime() - new Date(incident.created_at).getTime()) / 1000)} seconds`
                    : 'Awaiting resolution...'}
                </span>
              </div>
            </div>
          </div>

          {/* Healing Policy Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-bold text-slate-900 m-0">Healing Policy Enforced</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              FailureDoctor and HealingFlow automatically triggered diagnostic orchestration via UiPath Maestro to query host logs and test environments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
