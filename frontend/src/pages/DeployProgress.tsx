import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeploymentStatus, triggerRollback, type Deployment } from '../services/api';
import { 
  ArrowLeft, RefreshCw, CheckCircle2, XCircle, 
  RotateCcw, Terminal 
} from 'lucide-react';

export default function DeployProgress() {
  const { id } = useParams<{ id: string }>();
  const [deploy, setDeploy] = useState<Partial<Deployment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const fetchStatus = async () => {
    if (!id) return;
    try {
      const data = await getDeploymentStatus(id);
      setDeploy(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching deployment status:', err);
      setError('Could not retrieve status logs for this deployment ID.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 3 seconds if status is running or rolling_back
    const interval = setInterval(() => {
      if (deploy?.status === 'running' || deploy?.status === 'rolling_back') {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id, deploy?.status]);

  const handleRollback = async () => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to trigger manual rollback for this deployment? This will run the healing flow sequence to restore the stable version.')) {
      return;
    }

    try {
      setTriggering(true);
      await triggerRollback(id);
      setRollbackSuccess(true);
      fetchStatus();
    } catch (err: any) {
      console.error('Rollback trigger failed:', err);
      alert('Failed to trigger automated rollback.');
    } finally {
      setTriggering(false);
    }
  };

  if (loading && !deploy) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
        <p className="text-slate-400 text-sm font-mono">Loading deployment pipeline details...</p>
      </div>
    );
  }

  if (error || !deploy) {
    return (
      <div className="space-y-6">
        <Link to="/" className="inline-flex items-center space-x-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white">Pipeline Session Not Found</h3>
          <p className="text-sm text-slate-400 mt-2">{error || 'Make sure the deployment ID is correct.'}</p>
        </div>
      </div>
    );
  }

  // Pre-configured list of pipeline stages for display
  const allStages = [
    { name: 'Risk Scoring & Pre-Checks', desc: 'Gatekeeper risk assessment, secrets scan, dependency audit', step: 1 },
    { name: 'VSIX Package Assembly', desc: 'UiPath automation uipcli pack execution', step: 2 },
    { name: 'Orchestrator Rollout', desc: 'Triggering execution process on UiPath Maestro Cloud', step: 3 },
    { name: 'Test Cloud verification', desc: 'Running integration test suites to confirm release safety', step: 4 },
  ];

  // Map database stages to our UI stages
  const getStageIndex = (currentStage: string | null) => {
    if (!currentStage) return 0;
    const stageLower = currentStage.toLowerCase();
    if (stageLower.includes('risk') || stageLower.includes('gate') || stageLower.includes('secret') || stageLower.includes('check')) return 1;
    if (stageLower.includes('vsix') || stageLower.includes('pack') || stageLower.includes('assembly')) return 2;
    if (stageLower.includes('orchestrator') || stageLower.includes('deploy') || stageLower.includes('maestro') || stageLower.includes('rollout')) return 3;
    if (stageLower.includes('test') || stageLower.includes('verification') || stageLower.includes('verify')) return 4;
    return 2; // Default fallback
  };

  const activeStageIndex = deploy.status === 'success' ? 5 : getStageIndex(deploy.current_stage || null);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Info */}
      <div className="space-y-2">
        <Link to="/" className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white m-0 uppercase flex items-center space-x-3">
              <span>Pipeline Run Tracking</span>
            </h1>
            <p className="text-xs text-slate-500 font-mono">Run UUID: {id}</p>
          </div>

          <div className="flex items-center space-x-3">
            {deploy.status === 'failure' && (
              <button
                onClick={handleRollback}
                disabled={triggering || rollbackSuccess}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-bold text-sm shadow-lg shadow-rose-500/20 flex items-center space-x-2 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${triggering ? 'animate-spin' : ''}`} />
                <span>{rollbackSuccess ? 'Rollback Triggered' : 'Force Safe Rollback'}</span>
              </button>
            )}
            
            <button 
              onClick={fetchStatus}
              className="p-2.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Overview Stat Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-slate-500 block">Status</span>
          <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold mt-2 ${
            deploy.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            deploy.status === 'failure' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
            deploy.status === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
            'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
          }`}>
            {deploy.status}
          </span>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-slate-500 block">Deploy Strategy</span>
          <span className="text-sm font-semibold text-slate-200 block mt-2 capitalize font-mono">{deploy.strategy || 'rolling'}</span>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-slate-500 block">Risk Score</span>
          <span className={`text-sm font-semibold block mt-2 font-mono ${
            (deploy.risk_score || 0) > 50 ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {deploy.risk_score !== null ? `${deploy.risk_score}/100` : 'Not Evaluated'}
          </span>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <span className="text-xs text-slate-500 block">Current Stage</span>
          <span className="text-sm font-semibold text-slate-200 block mt-2 truncate font-mono">
            {deploy.status === 'success' ? 'Pipeline Completed' : (deploy.current_stage || 'Queueing...')}
          </span>
        </div>
      </div>

      {/* Main Timeline Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pipeline Timeline */}
        <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6 md:p-8 space-y-8">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white m-0">Execution Roadmap</h3>
            <span className="text-xs font-mono text-slate-500">4 Core Milestones</span>
          </div>

          {/* Vertical progress flow */}
          <div className="relative pl-8 space-y-8 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
            {allStages.map((stage) => {
              const isPassed = activeStageIndex > stage.step;
              const isCurrent = activeStageIndex === stage.step && deploy.status === 'running';
              const isFailed = activeStageIndex === stage.step && deploy.status === 'failure';
              
              return (
                <div key={stage.step} className="relative group">
                  {/* Indicator Icon */}
                  <div className={`absolute -left-8 top-1 w-7 h-7 rounded-full border flex items-center justify-center transition-all ${
                    isPassed 
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                      : isCurrent 
                        ? 'bg-amber-500/25 border-amber-500 text-amber-400 animate-pulse' 
                        : isFailed 
                          ? 'bg-rose-500/25 border-rose-500 text-rose-400' 
                          : 'bg-slate-950 border-slate-800 text-slate-600'
                  }`}>
                    {isPassed ? <CheckCircle2 className="w-4 h-4" /> :
                     isFailed ? <XCircle className="w-4 h-4" /> :
                     isCurrent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> :
                     <span className="text-xs font-mono">{stage.step}</span>}
                  </div>

                  <div>
                    <h4 className={`text-sm font-bold m-0 ${
                      isPassed ? 'text-slate-200' :
                      isCurrent ? 'text-amber-300' :
                      isFailed ? 'text-rose-400' : 'text-slate-500'
                    }`}>
                      {stage.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">{stage.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deploy Logs & Details */}
        <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6 space-y-6">
          <h3 className="text-sm font-bold text-white tracking-wider uppercase border-b border-slate-800 pb-3 m-0 flex items-center justify-between">
            <span>Stage Logs</span>
            <Terminal className="w-4 h-4 text-slate-500" />
          </h3>

          <div className="space-y-4 font-mono text-xs max-h-96 overflow-y-auto pr-2">
            {deploy.deploy_history && Array.isArray(deploy.deploy_history) ? (
              deploy.deploy_history.map((log: any, i: number) => (
                <div key={i} className="border-l-2 border-purple-500 pl-3 py-1 bg-slate-900/20">
                  <span className="text-slate-500 block text-[10px]">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                  </span>
                  <p className="text-slate-300 m-0 mt-0.5">{log.message || log.stage || JSON.stringify(log)}</p>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center py-12">
                <span>No logs recorded for this pipeline run.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
