import { useState, useCallback, useEffect } from 'react';
import {
  BrainCircuit, Zap, Shield, BarChart3, AlertCircle, Loader2,
  KeyRound, Hash, AtSign, ChevronRight, Info, Briefcase,
} from 'lucide-react';
import { fetchHRFlowProfile, fetchHRFlowJob, createSession } from '../api';
import type { SessionData } from '../types';

interface LandingPageProps {
  onSessionCreated: (data: SessionData) => void;
}

interface FormState {
  source_key: string;
  profile_key: string;
  reference: string;
  user_email: string;
  board_key: string;
  job_key: string;
}

function getInitialForm(): FormState {
  const params = new URLSearchParams(window.location.search);
  return {
    source_key: params.get('source_key') ?? import.meta.env.VITE_HRFLOW_SOURCE_KEY ?? '',
    profile_key: params.get('profile_key') ?? '',
    reference: params.get('reference') ?? '',
    user_email: params.get('user_email') ?? '',
    board_key: params.get('board_key') ?? import.meta.env.VITE_HRFLOW_BOARD_KEY ?? '',
    job_key: params.get('job_key') ?? '',
  };
}

export default function LandingPage({ onSessionCreated }: LandingPageProps) {
  const [form, setForm] = useState<FormState>(getInitialForm);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    (Object.entries(form) as [keyof FormState, string][]).forEach(([key, value]) => {
      if (value.trim()) params.set(key, value.trim());
    });
    const search = params.toString();
    const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [form]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError(null);
  };

  const canSubmit =
    form.source_key.trim() !== '' &&
    (form.profile_key.trim() !== '' || form.reference.trim() !== '');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setLoading(true);
      setError(null);
      try {
        setLoadingStep('Fetching profile from HRFlow…');
        const profile = await fetchHRFlowProfile({
          source_key: form.source_key.trim(),
          profile_key: form.profile_key.trim() || undefined,
          reference: form.reference.trim() || undefined,
          user_email: form.user_email.trim() || undefined,
        });

        let jobOffer: Record<string, unknown> | null = null;
        if (form.job_key.trim() && form.board_key.trim()) {
          setLoadingStep('Fetching job offer from HRFlow…');
          jobOffer = await fetchHRFlowJob({
            board_key: form.board_key.trim(),
            job_key: form.job_key.trim(),
            user_email: form.user_email.trim() || undefined,
          });
        }

        setLoadingStep('Creating interview session…');
        const data = await createSession(profile, jobOffer);
        onSessionCreated(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch profile. Check your keys and try again.',
        );
      } finally {
        setLoading(false);
        setLoadingStep('');
      }
    },
    [form, canSubmit, onSessionCreated],
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-cyan-100/30 blur-3xl" />
      </div>

      <div className="relative">
        {/* Header */}
        <header className="border-b border-slate-200 px-8 py-5">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-lg text-slate-900">InterviewAI</span>
                <span className="ml-2 text-xs text-slate-400 font-medium">powered by HRFlow</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
        </header>

        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-full mb-8 font-medium">
            <Zap className="w-3.5 h-3.5" />
            HRFlow Hackathon 2026 — AI Interview Platform
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight mb-6">
            <span className="text-slate-900">Your next hire,</span>
            <br />
            <span className="gradient-text">AI-assessed.</span>
          </h1>
          <p className="text-slate-500 text-xl max-w-2xl mx-auto leading-relaxed">
            Enter the candidate's HRFlow profile details. Our AI will retrieve their profile,
            conduct a structured interview, and generate an automated scorecard.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            {[
              { icon: <BrainCircuit className="w-4 h-4" />, label: 'Profile-Aware Questions' },
              { icon: <Zap className="w-4 h-4" />, label: 'Voice Interaction' },
              { icon: <BarChart3 className="w-4 h-4" />, label: 'Automated Scoring' },
              { icon: <Shield className="w-4 h-4" />, label: 'HRFlow Powered' },
            ].map(({ icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm"
              >
                <span className="text-indigo-500">{icon}</span>
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* Form */}
        <section className="max-w-xl mx-auto px-6 pb-24 animate-slide-up">
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Candidate Profile Lookup</h2>
              <p className="text-slate-400 text-sm">
                Provide the HRFlow identifiers to retrieve the candidate's profile.
              </p>
            </div>

            {/* Source Key */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Source Key <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. source_abc123def456"
                  value={form.source_key}
                  onChange={set('source_key')}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
              <p className="text-slate-400 text-xs">The HRFlow source where the profile is indexed.</p>
            </div>

            {/* Profile Key or Reference */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Profile Identifier <span className="text-rose-500">*</span>
                <span className="ml-2 text-slate-400 font-normal text-xs">(key or reference — at least one required)</span>
              </p>

              <div className="space-y-2">
                <label className="block text-xs text-slate-400 font-medium uppercase tracking-wider">Profile Key</label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. profile_xyz789"
                    value={form.profile_key}
                    onChange={set('profile_key')}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-slate-400 text-xs">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-400 font-medium uppercase tracking-wider">Reference</label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. candidate-ref-42"
                    value={form.reference}
                    onChange={set('reference')}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Job Offer */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Job Offer
                <span className="ml-2 text-slate-400 font-normal text-xs">(optional — tailors questions to the role)</span>
              </p>

              <div className="space-y-2">
                <label className="block text-xs text-slate-400 font-medium uppercase tracking-wider">Board Key</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. board_abc123def456"
                    value={form.board_key}
                    onChange={set('board_key')}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs text-slate-400 font-medium uppercase tracking-wider">Job Key</label>
                <div className="relative">
                  <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. job_xyz789"
                    value={form.job_key}
                    onChange={set('job_key')}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <p className="text-slate-400 text-xs">Both fields are required to fetch the job offer.</p>
              </div>
            </div>

            {/* Advanced / User Email toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
                {showAdvanced ? 'Hide advanced options' : 'Advanced options (user email)'}
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-2 animate-fade-in">
                  <label className="block text-sm font-medium text-slate-700">
                    User Email
                    <span className="ml-2 text-slate-400 font-normal text-xs">(overrides HRFLOW_USER_EMAIL env var)</span>
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={form.user_email}
                      onChange={set('user_email')}
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <p className="text-slate-400 text-xs">
                    Required by HRFlow as the <code className="text-slate-500">X-USER-EMAIL</code> header.
                    Leave empty if set in the backend environment.
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-semibold text-base transition-all duration-200 shadow-lg shadow-indigo-500/20 disabled:shadow-none flex items-center justify-center gap-3 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {loadingStep || 'Loading…'}
                </>
              ) : (
                <>
                  Fetch & Start Interview
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <p className="text-slate-400 text-xs text-center">
              The profile is fetched directly from HRFlow in real time.
            </p>
          </form>

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { n: '5', label: 'Tailored questions' },
              { n: 'AI', label: 'Real-time scoring' },
              { n: '∞', label: 'Scalable interviews' },
            ].map(({ n, label }) => (
              <div
                key={label}
                className="text-center p-4 bg-white/60 rounded-xl border border-slate-200 shadow-sm"
              >
                <p className="text-2xl font-bold gradient-text">{n}</p>
                <p className="text-slate-400 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-6 text-center">
          <p className="text-sm text-slate-400">
            Built by <span className="font-semibold text-slate-600">404-job-not-found</span> — HRFlow Hackathon 2026
          </p>
        </footer>
      </div>
    </div>
  );
}
