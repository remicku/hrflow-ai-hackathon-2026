import { useState, useRef } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer,
} from 'recharts';
import {
  CheckCircle2, AlertTriangle, XCircle, TrendingUp, RotateCcw,
  Download, BrainCircuit, ThumbsUp, ThumbsDown, Eye, ChevronDown, MessageSquare,
} from 'lucide-react';
import { ScoreCircle, ScoreBar } from '../components/ScoreBar';
import type { Report } from '../types';

interface ReportPageProps {
  report: Report;
  candidateName: string;
  onRestart: () => void;
  backLabel?: string;
}

const REC_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode; className: string }
> = {
  strong_yes: {
    label: 'Vivement recommandé',
    color: '#10b981',
    icon: <CheckCircle2 className="w-6 h-6" />,
    className: 'rec-strong-yes',
  },
  yes: {
    label: 'Recommandé',
    color: '#34d399',
    icon: <ThumbsUp className="w-6 h-6" />,
    className: 'rec-yes',
  },
  mixed: {
    label: 'Mitigé',
    color: '#f59e0b',
    icon: <AlertTriangle className="w-6 h-6" />,
    className: 'rec-mixed',
  },
  no: {
    label: 'Non recommandé',
    color: '#ef4444',
    icon: <ThumbsDown className="w-6 h-6" />,
    className: 'rec-no',
  },
};

const Q_LABELS: Record<string, string> = {
  q1: 'Intro',
  q2: 'Experience',
  q3: 'Skills',
  q4: 'Situational',
  q5: 'Motivation',
};

const SCORE_COLOR = (s: number) =>
  s >= 75 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444';

function extractHrflowGrade(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const directKeys = ['score', 'grade', 'matching_score', 'overall_score', 'value'];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }

  const data = record.data;
  if (Array.isArray(data) && data.length > 0) {
    return extractHrflowGrade(data[0]);
  }
  if (data && typeof data === 'object') {
    return extractHrflowGrade(data);
  }

  return null;
}

function normalizeHrflowGrade(raw: unknown): number | null {
  const value = extractHrflowGrade(raw);
  if (value === null) return null;
  if (value >= 0 && value <= 1) return Math.round(value * 1000) / 10;
  return value;
}

function handlePrint() {
  window.print();
}

function TranscriptAccordion({ questionText, transcript }: { questionText?: string; transcript?: string }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!transcript) return null;

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors w-full text-left"
      >
        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Réponse du candidat</span>
        <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={contentRef} className="mt-3 space-y-2">
          {questionText && (
            <p className="text-xs text-slate-400 italic border-l-2 border-slate-200 pl-3">{questionText}</p>
          )}
          <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-3 leading-relaxed">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
}

export default function ReportPage({ report, candidateName, onRestart, backLabel }: ReportPageProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'questions'>('overview');
  const rec = REC_CONFIG[report.recommendation] ?? REC_CONFIG.mixed;
  const hrflowGrade = normalizeHrflowGrade(report.hrflow_profile_job_grade);
  const targetRole = report.candidate_summary.target_job?.target_role;

  // Radar data (averages of subscores)
  const avgSubscores = (() => {
    const evals = report.per_question_evaluations;
    const sum = (key: keyof typeof evals[0]['subscores']) =>
      evals.reduce((acc, e) => {
        const v = e.subscores[key];
        return acc + (v ?? 0);
      }, 0) / evals.length;

    return [
      { subject: 'Pertinence', value: Math.round(sum('relevance')) },
      { subject: 'Précision', value: Math.round(sum('specificity')) },
      { subject: 'Cohérence', value: Math.round(sum('consistency_with_profile')) },
      { subject: 'Adéquation', value: Math.round(sum('job_alignment')) },
      { subject: 'Clarté', value: Math.round(sum('clarity')) },
      {
        subject: 'Technique',
        value: Math.round(
          evals
            .filter((e) => e.subscores.technical_accuracy !== null)
            .reduce((acc, e) => acc + (e.subscores.technical_accuracy ?? 0), 0) /
            (evals.filter((e) => e.subscores.technical_accuracy !== null).length || 1),
        ),
      },
    ];
  })();

  // Bar chart data
  const barData = report.per_question_evaluations.map((e) => ({
    name: Q_LABELS[e.question_id] || e.question_id,
    score: Math.round(e.normalized_score),
  }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden print:bg-white print:text-black">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden print:hidden">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full bg-blue-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-100/30 blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">Remi AI</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-500 text-sm">Rapport d'entretien</span>
          </div>
          <div className="flex items-center gap-3">
            {report.cv_url && (
              <a
                href={report.cv_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300 text-sm font-medium transition-all"
              >
                <Download className="w-4 h-4" />
                CV du candidat
              </a>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 text-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Exporter en PDF
            </button>
            <button
              onClick={onRestart}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              {backLabel ?? 'Nouvel entretien'}
            </button>
          </div>
        </div>

        {/* Candidate header + recommendation */}
        <div className="glass-card rounded-2xl p-8 mb-8 animate-slide-up">
          {/* Top row: candidate info + recommendation badge */}
          <div className="flex items-start gap-6 mb-6">
            <div className="flex-1 min-w-0">
              <p className="text-slate-400 text-sm mb-1">Rapport d'entretien</p>
              <h1 className="text-3xl font-bold text-slate-900 mb-1">{candidateName}</h1>
              <p className="text-slate-500">{report.candidate_summary.current_title || 'Candidat'}</p>
              {targetRole && (
                <p className="text-slate-400 text-sm mt-1">Évalué pour : {targetRole}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-slate-400 capitalize">{report.candidate_summary.seniority}</span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400">
                  {Math.round(report.candidate_summary.years_of_experience)} ans d'exp.
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400">
                  {report.per_question_evaluations.length} questions répondues
                </span>
              </div>
            </div>

            {/* Recommendation badge */}
            <div
              className={`px-6 py-4 rounded-xl ${rec.className} flex flex-col items-center gap-2 text-white shrink-0`}
            >
              {rec.icon}
              <span className="font-bold text-lg whitespace-nowrap">{rec.label}</span>
            </div>
          </div>

          {/* Score circles row */}
          <div className="flex flex-wrap gap-6 justify-center border-t border-slate-100 pt-6">
            <ScoreCircle score={report.overall_score} size={100} label="Entretien" />
            {hrflowGrade !== null ? (
              <ScoreCircle score={hrflowGrade} size={100} label="HRFlow" />
            ) : (
              <div className="flex flex-col items-center gap-2 justify-center">
                <div className="w-[100px] h-[100px] rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center px-4 text-center">
                  <span className="text-xs text-slate-400">Score HRFlow indisponible</span>
                </div>
                <span className="text-slate-500 text-sm">HRFlow</span>
              </div>
            )}
            <ScoreCircle score={report.communication_score} size={80} label="Communication" />
            <ScoreCircle score={report.technical_score} size={80} label="Technique" />
            <ScoreCircle score={report.profile_consistency_score} size={80} label="Profil" />
          </div>

          {/* Summary */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-slate-500 text-sm leading-relaxed">{report.final_summary}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 print:hidden">
          {(['overview', 'questions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab === 'overview' ? 'Vue d\'ensemble' : 'Détail des réponses'}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Radar chart */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-slate-900 font-semibold mb-6 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  Scores par dimension
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={avgSubscores} cx="50%" cy="50%" outerRadius="80%">
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <Radar
                      name="Score"
                      dataKey="value"
                      stroke="#1C5289"
                      fill="#1C5289"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Bar chart */}
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-slate-900 font-semibold mb-6">Scores par question</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        color: '#1e293b',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={SCORE_COLOR(entry.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Strengths & Concerns */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-slate-900 font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Points forts
                </h3>
                {report.strengths.length === 0 ? (
                  <p className="text-slate-400 text-sm">Aucun point fort identifié.</p>
                ) : (
                  <ul className="space-y-3">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-slate-900 font-semibold mb-4 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-500" />
                  Points d'attention
                </h3>
                {report.concerns.length === 0 ? (
                  <p className="text-slate-400 text-sm">Aucun point d'attention majeur identifié.</p>
                ) : (
                  <ul className="space-y-3">
                    {report.concerns.map((c, i) => (
                      <li key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="text-amber-500 font-bold shrink-0">!</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Category scores */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-slate-900 font-semibold mb-5">Scores par catégorie</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <ScoreBar label="Score global" value={report.overall_score} />
                {hrflowGrade !== null && (
                  <ScoreBar label="Score HRFlow" value={hrflowGrade} />
                )}
                <ScoreBar label="Communication" value={report.communication_score} />
                <ScoreBar label="Aptitude technique" value={report.technical_score} />
                <ScoreBar label="Cohérence du profil" value={report.profile_consistency_score} />
                <ScoreBar label="Adéquation au poste" value={report.job_alignment_score} />
              </div>
            </div>

            {/* Behavioral signals */}
            {report.gaze_summary != null && (() => {
              const g = report.gaze_summary;
              const totalSec = Math.round(g.total_look_away_ms / 1000);
              // Verdict: suspicious if >15s total look-away
              const suspicious = g.total_look_away_ms > 15_000;
              return (
                <div className={`rounded-2xl px-5 py-4 flex items-center justify-between gap-6 border ${
                  suspicious ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Eye className={`w-4 h-4 shrink-0 ${suspicious ? 'text-rose-500' : 'text-emerald-500'}`} />
                    <div>
                      <p className={`text-sm font-semibold ${suspicious ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {suspicious ? 'Comportement suspect' : 'Aucun comportement suspect'}
                      </p>
                      {g.look_away_count > 0 && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {g.look_away_count} détournement{g.look_away_count > 1 ? 's' : ''} · {totalSec}s au total
                          {g.events.some(e => e.reason === 'no_face') ? ' · visage absent' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full shrink-0 ${
                    suspicious ? 'bg-rose-200 text-rose-800' : 'bg-emerald-200 text-emerald-800'
                  }`}>
                    {suspicious ? 'Triche probable' : 'Fiable'}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Q&A Breakdown tab */}
        {activeTab === 'questions' && (
          <div className="space-y-4 animate-fade-in">
            {report.per_question_evaluations.map((ev, idx) => (
              <div key={ev.question_id} className="glass-card rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs text-slate-400 uppercase tracking-wider">
                      {Q_LABELS[ev.question_id] || ev.question_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-2xl font-bold"
                      style={{ color: SCORE_COLOR(ev.normalized_score) }}
                    >
                      {Math.round(ev.normalized_score)}
                    </span>
                    <span className="text-slate-400 text-sm">/100</span>
                  </div>
                </div>

                <p className="text-slate-500 text-sm mb-4 italic">{ev.rationale}</p>

                <TranscriptAccordion questionText={ev.question_text} transcript={ev.transcript} />

                {/* Subscores */}
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  <ScoreBar label="Pertinence" value={ev.subscores.relevance} />
                  <ScoreBar label="Précision" value={ev.subscores.specificity} />
                  <ScoreBar label="Cohérence" value={ev.subscores.consistency_with_profile} />
                  <ScoreBar label="Adéquation au poste" value={ev.subscores.job_alignment} />
                  <ScoreBar label="Clarté" value={ev.subscores.clarity} />
                  {ev.subscores.technical_accuracy !== null && (
                    <ScoreBar label="Précision technique" value={ev.subscores.technical_accuracy} />
                  )}
                </div>

                {/* Strengths & Concerns */}
                {(ev.strengths.length > 0 || ev.concerns.length > 0) && (
                  <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-200">
                    {ev.strengths.length > 0 && (
                      <div className="flex-1">
                        <p className="text-emerald-600 text-xs font-semibold mb-1.5 uppercase tracking-wider">Points forts</p>
                        <ul className="space-y-1">
                          {ev.strengths.map((s, i) => (
                            <li key={i} className="text-slate-500 text-xs flex gap-2">
                              <span className="text-emerald-500">+</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ev.concerns.length > 0 && (
                      <div className="flex-1">
                        <p className="text-amber-600 text-xs font-semibold mb-1.5 uppercase tracking-wider">Points d'attention</p>
                        <ul className="space-y-1">
                          {ev.concerns.map((c, i) => (
                            <li key={i} className="text-slate-500 text-xs flex gap-2">
                              <span className="text-amber-500">!</span>{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
