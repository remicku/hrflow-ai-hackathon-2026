import { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit, Users, RefreshCw, ChevronRight, ArrowLeft,
  CheckCircle2, ThumbsUp, AlertTriangle, ThumbsDown, Loader2,
  AlertCircle, Trophy, BarChart3,
} from 'lucide-react';
import { listInterviews, getHRReport } from '../api';
import type { InterviewSummary, Report } from '../types';
import ReportPage from './ReportPage';

interface HRDashboardProps {
  onBack: () => void;
}

const REC_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  strong_yes: {
    label: 'Strong Hire',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  yes: {
    label: 'Hire',
    icon: <ThumbsUp className="w-3.5 h-3.5" />,
    badgeClass: 'bg-green-100 text-green-700 border-green-200',
  },
  mixed: {
    label: 'Mixed',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  no: {
    label: 'No Hire',
    icon: <ThumbsDown className="w-3.5 h-3.5" />,
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
  },
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 68) return 'text-green-600';
  if (score >= 55) return 'text-amber-600';
  return 'text-rose-600';
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HRDashboard({ onBack }: HRDashboardProps) {
  const [interviews, setInterviews] = useState<InterviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedName, setSelectedName] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listInterviews();
      setInterviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interviews.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const handleOpenReport = async (interview: InterviewSummary) => {
    setLoadingReport(interview.session_id);
    try {
      const report = await getHRReport(interview.session_id);
      setSelectedName(interview.candidate_name);
      setSelectedReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report.');
    } finally {
      setLoadingReport(null);
    }
  };

  if (selectedReport) {
    return (
      <ReportPage
        report={selectedReport}
        candidateName={selectedName}
        onRestart={() => setSelectedReport(null)}
        backLabel="Retour au tableau de bord RH"
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="relative">
        {/* Header */}
        <header className="border-b border-slate-200 px-8 py-5">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="w-px h-5 bg-slate-200" />
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                  <BrainCircuit className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="font-bold text-lg text-slate-900">InterviewAI</span>
                  <span className="ml-2 text-xs text-slate-400 font-medium">Tableau de bord RH</span>
                </div>
              </div>
            </div>
            <button
              onClick={fetchInterviews}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </header>

        {/* Page title */}
        <section className="max-w-6xl mx-auto px-8 pt-10 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-6 h-6 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900">Entretiens réalisés</h1>
          </div>
          <p className="text-slate-500 text-sm">
            Retrouvez l'ensemble des entretiens IA complétés et consultez les rapports détaillés.
          </p>
        </section>

        {/* Stats bar */}
        {interviews.length > 0 && (
          <section className="max-w-6xl mx-auto px-8 mb-8">
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  label: 'Total entretiens',
                  value: interviews.length,
                  icon: <BarChart3 className="w-4 h-4 text-indigo-500" />,
                },
                {
                  label: 'Strong Hire',
                  value: interviews.filter((i) => i.recommendation === 'strong_yes').length,
                  icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
                },
                {
                  label: 'Hire',
                  value: interviews.filter((i) => i.recommendation === 'yes').length,
                  icon: <ThumbsUp className="w-4 h-4 text-green-500" />,
                },
                {
                  label: 'Score moyen',
                  value:
                    Math.round(
                      interviews.reduce((sum, i) => sum + i.overall_score, 0) / interviews.length,
                    ) + '/100',
                  icon: <Trophy className="w-4 h-4 text-amber-500" />,
                },
              ].map(({ label, value, icon }) => (
                <div
                  key={label}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
                    {icon}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Content */}
        <section className="max-w-6xl mx-auto px-8 pb-24">
          {error && (
            <div className="mb-6 flex items-start gap-3 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Chargement des entretiens…</span>
            </div>
          ) : interviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Users className="w-8 h-8 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-medium text-slate-500">Aucun entretien réalisé</p>
                <p className="text-sm mt-1">
                  Les rapports apparaîtront ici une fois les premiers entretiens complétés.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {interviews.map((interview) => {
                const rec = REC_CONFIG[interview.recommendation] ?? REC_CONFIG.no;
                const isLoadingThis = loadingReport === interview.session_id;
                return (
                  <button
                    key={interview.session_id}
                    onClick={() => handleOpenReport(interview)}
                    disabled={loadingReport !== null}
                    className="w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all duration-150 p-5 flex items-center gap-5 disabled:opacity-60 disabled:cursor-wait group"
                  >
                    {/* Avatar initials */}
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                      {interview.candidate_name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 truncate">
                          {interview.candidate_name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${rec.badgeClass}`}
                        >
                          {rec.icon}
                          {rec.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{formatDate(interview.completed_at)}</p>
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-bold ${scoreColor(interview.overall_score)}`}>
                        {Math.round(interview.overall_score)}
                      </p>
                      <p className="text-xs text-slate-400">/ 100</p>
                    </div>

                    {/* Arrow */}
                    <div className="shrink-0">
                      {isLoadingThis ? (
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
