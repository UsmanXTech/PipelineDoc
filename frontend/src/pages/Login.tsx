import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getGitHubAuthUrl, loginWithGitHubCode } from '../services/api';
import { Activity, AlertCircle, ArrowRight } from 'lucide-react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  // Redirect target
  const from = (location.state as any)?.from?.pathname || '/';

  useEffect(() => {
    // Check if redirect code is present in URL
    const code = searchParams.get('code');
    if (code) {
      handleCallback(code);
    }
  }, [searchParams]);

  const handleCallback = async (code: string) => {
    setError('');
    setLoading(true);
    setStatusMessage('Exchanging credentials with GitHub...');

    try {
      await loginWithGitHubCode(code);
      setStatusMessage('Authenticated successfully. Redirecting...');
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 800);
    } catch (err: any) {
      console.error('GitHub authentication callback error:', err);
      setError(err.response?.data?.error || 'GitHub login failed. Please try again.');
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleGitHubLogin = async () => {
    setError('');
    setLoading(true);
    setStatusMessage('Contacting GitHub OAuth Gateway...');

    try {
      const response = await getGitHubAuthUrl();
      if (response.isMock) {
        // Mock flow: auto redirect to callback with mock code after a short delay
        setStatusMessage('OAuth app not configured. Launching Sandbox Mode...');
        setTimeout(() => {
          // Redirect to callback URL with mock code
          const search = new URLSearchParams(window.location.search);
          search.set('code', 'mock-github-code');
          navigate({ search: search.toString() });
        }, 1200);
      } else {
        // Real redirect to GitHub
        window.location.href = response.url;
      }
    } catch (err: any) {
      console.error('Error fetching GitHub URL:', err);
      setError('Unable to initialize GitHub login. Please ensure backend is running.');
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Gradient Blurs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md z-10">
        {/* Logo and Tagline */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-13 h-13 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4 border border-blue-400/20">
            <Activity className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white m-0">PipelineDoc</h2>
          <p className="text-sm text-slate-400 mt-1 uppercase tracking-wider font-mono text-center">
            Self-Healing CI/CD Platform
          </p>
        </div>

        {/* Auth Glassmorphism Card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-2 text-center">Welcome Back</h3>
          <p className="text-sm text-slate-400 text-center mb-8">
            Access secure telemetry, diagnostic logs, and self-healing automation.
          </p>

          {error && (
            <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-2xl text-sm mb-6">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              {/* Custom micro-animated spinner */}
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
              </div>
              <p className="text-sm text-blue-400 font-medium animate-pulse">{statusMessage}</p>
            </div>
          ) : (
            <button
              onClick={handleGitHubLogin}
              className="w-full bg-slate-950 hover:bg-slate-900 text-white py-3.5 px-4 rounded-2xl font-semibold border border-slate-800 hover:border-slate-700 flex items-center justify-center space-x-3 transition-all duration-200 shadow-xl cursor-pointer group"
            >
              {/* GitHub SVG Icon */}
              <svg className="w-5 h-5 fill-current text-white transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>Continue with GitHub</span>
              <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </button>
          )}
        </div>

        {/* Extra Footer Info */}
        <p className="text-center text-xs text-slate-500 mt-6 leading-relaxed">
          Access is managed via security tokens. By logging in, you agree to access telemetry, deployments, and self-healing action audits.
        </p>
      </div>
    </div>
  );
}
