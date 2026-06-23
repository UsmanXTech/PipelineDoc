import { useState, useEffect } from 'react';
import { getGitHubRepos, setupGitHubPipeline } from '../services/api';
import type { GitHubRepo, SetupPipelineResponse } from '../services/api';
import { GitBranch, Search, CheckCircle2, AlertCircle, Loader2, ArrowRight, ExternalLink } from 'lucide-react';

export default function GithubSetup() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<SetupPipelineResponse | null>(null);

  useEffect(() => {
    fetchRepos();
  }, []);

  const fetchRepos = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getGitHubRepos();
      setRepos(data);
    } catch (err: any) {
      console.error('Failed to load GitHub repositories:', err);
      setError(err.response?.data?.error || 'Failed to fetch repositories. Please ensure your GitHub account is connected.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPipeline = async (repoName: string) => {
    setConfiguring(repoName);
    setError('');
    setSetupResult(null);
    try {
      const result = await setupGitHubPipeline(repoName);
      setSetupResult(result);
    } catch (err: any) {
      console.error('Failed to configure pipeline:', err);
      setError(err.response?.data?.error || `Failed to configure pipeline for ${repoName}.`);
    } finally {
      setConfiguring(null);
    }
  };

  const filteredRepos = repos.filter(repo =>
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white m-0">GitHub Pipelines</h2>
          <p className="text-sm text-slate-500 mt-1">
            Connect repositories and automate CI/CD pipeline telemetry.
          </p>
        </div>
        <button
          onClick={fetchRepos}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
          <span>Refresh Repositories</span>
        </button>
      </div>

      {/* Setup notification banner */}
      {setupResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h4 className="text-base font-bold text-emerald-400 m-0">Pipeline Integrated Successfully!</h4>
            <p className="text-sm text-slate-400 m-0">{setupResult.message}</p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                Branch: {setupResult.branch}
              </span>
              <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                File: {setupResult.workflowFile}
              </span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-base font-bold text-red-400 m-0">Configuration Failed</h4>
            <p className="text-sm text-slate-400 mt-1 m-0">{error}</p>
          </div>
        </div>
      )}

      {/* Info card describing the integration */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
        <div className="space-y-2 max-w-2xl">
          <h3 className="text-lg font-bold text-white m-0">How PipelineDoc Automation Works</h3>
          <p className="text-sm text-slate-400 leading-relaxed m-0">
            Selecting a repository creates a new <code className="text-indigo-400 border-indigo-900/30 bg-indigo-950/20">pipelinedoc-ci</code> branch 
            and commits a GitHub Actions workflow file (<code className="text-indigo-400 border-indigo-900/30 bg-indigo-950/20">.github/workflows/pipelinedoc.yml</code>). 
            When your workflow runs in GitHub, it reports tests, logs, and deployment stats back to your dashboard in real-time.
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-3 py-1.5 rounded-full font-mono font-medium">
            GitHub Actions Integrated
          </span>
        </div>
      </div>

      {/* Repos list and search */}
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 border border-slate-200 hover:border-slate-300 focus:border-blue-600 focus:bg-white text-white rounded-xl py-3 pl-12 pr-4 text-sm font-medium outline-none transition-all"
          />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="text-slate-500 text-sm font-semibold">Fetching your GitHub repositories...</p>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
            <GitBranch className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-1">No Repositories Found</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
              {searchQuery ? "We couldn't find any repositories matching your search query." : "No repositories could be retrieved from your connected GitHub account."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRepos.map((repo) => {
              const isConfiguring = configuring === repo.full_name;
              return (
                <div 
                  key={repo.id}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <GitBranch className="w-6 h-6 text-slate-400" />
                      <a 
                        href={repo.html_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <h4 className="text-base font-bold text-white truncate m-0" title={repo.full_name}>
                      {repo.full_name.split('/')[1]}
                    </h4>
                    <span className="text-[11px] text-slate-500 font-medium block">
                      Owner: {repo.full_name.split('/')[0]}
                    </span>
                    <p className="text-sm text-slate-400 leading-relaxed line-clamp-2 h-10 mt-2 m-0">
                      {repo.description || "No description provided."}
                    </p>
                  </div>
                  
                  <div className="pt-6 border-t border-slate-200/50 mt-6 flex items-center justify-between">
                    <button
                      onClick={() => handleSetupPipeline(repo.full_name)}
                      disabled={configuring !== null}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isConfiguring ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Configuring...</span>
                        </>
                      ) : (
                        <>
                          <span>Connect Pipeline</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
