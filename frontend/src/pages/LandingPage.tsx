import { useEffect, useRef, useState } from 'react';
import {
  BrainCircuit, Loader2, AlertCircle, Users, Upload, FileText, X,
  MapPin, Briefcase, ExternalLink, ChevronRight,
} from 'lucide-react';
import { fetchHRFlowProfile, fetchHRFlowJob, createSession, parseCV, fetchJobList } from '../api';
import type { SessionData, JobListing } from '../types';

interface LandingPageProps {
  onSessionCreated: (data: SessionData) => void;
  onOpenHR: () => void;
}

// ─── Auto-load mode ──────────────────────────────────────────────────────────

function AutoLoadView({
  onSessionCreated, sourceKey, profileKey, reference, userEmail, boardKey, jobKey,
}: {
  onSessionCreated: (data: SessionData) => void;
  sourceKey: string; profileKey: string; reference: string;
  userEmail: string; boardKey: string; jobKey: string;
}) {
  const [loadingStep, setLoadingStep] = useState('Chargement…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadingStep('Récupération du profil…');
        const profile = await fetchHRFlowProfile({
          source_key: sourceKey,
          profile_key: profileKey || undefined,
          reference: reference || undefined,
          user_email: userEmail || undefined,
        });
        let jobOffer: Record<string, unknown> | null = null;
        if (jobKey && boardKey) {
          setLoadingStep('Récupération de l\'offre…');
          jobOffer = await fetchHRFlowJob({ board_key: boardKey, job_key: jobKey, user_email: userEmail || undefined });
        }
        setLoadingStep('Préparation de l\'entretien…');
        const data = await createSession(profile, jobOffer);
        onSessionCreated(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue. Vérifiez le lien qui vous a été envoyé.');
      }
    })();
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center">
      {error ? (
        <div className="flex flex-col items-center gap-4 text-center px-6 animate-fade-in">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <p className="text-rose-600 max-w-sm">{error}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
          <p className="text-slate-500">{loadingStep}</p>
        </div>
      )}
    </div>
  );
}

// ─── Job detail modal (with CV upload) ───────────────────────────────────────

function JobDetailModal({
  job, onSessionCreated, onClose,
}: {
  job: JobListing;
  onSessionCreated: (data: SessionData) => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, submitting]);

  function handleFile(f: File) { setError(null); setFile(f); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null); setSubmitting(true);
    try {
      const sourceKey = import.meta.env.VITE_HRFLOW_SOURCE_KEY || '';
      const data = await parseCV(file, sourceKey || undefined, job.board_key || undefined, job.key || undefined);
      onSessionCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'analyse du CV.');
      setSubmitting(false);
    }
  }

  const hasDetails = job.summary || job.sections.length > 0 || job.requirements || job.responsibilities || job.benefits;

  if (submitting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          <p className="text-white/80 text-sm">Analyse du CV en cours…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-white font-bold text-lg leading-tight">{job.title}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-indigo-100 text-sm">
                {job.company && <span>{job.company}</span>}
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />{job.location}
                  </span>
                )}
              </div>
              {job.contract_type && (
                <span className="inline-block mt-2 text-xs px-2.5 py-1 rounded-full bg-white/20 text-white font-medium">
                  {job.contract_type}
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/20 transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Job details */}
          {hasDetails && (
            <div className="px-6 py-6 space-y-6">
              {job.skills.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Compétences</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map((s) => (
                      <span key={s} className="text-sm px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {job.summary && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Résumé</h3>
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{job.summary}</p>
                </div>
              )}
              {job.sections.map((section, i) => (
                <div key={i}>
                  {section.title && <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{section.title}</h3>}
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{section.description}</p>
                </div>
              ))}
              {job.responsibilities && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Responsabilités</h3>
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{job.responsibilities}</p>
                </div>
              )}
              {job.requirements && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Prérequis</h3>
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{job.requirements}</p>
                </div>
              )}
              {job.benefits && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Avantages</h3>
                  <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{job.benefits}</p>
                </div>
              )}
            </div>
          )}

          {/* Divider + CV upload */}
          <div className="border-t border-slate-100 px-6 py-6">
            <p className="text-sm font-semibold text-slate-700 mb-4">Déposez votre CV pour postuler</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`relative flex flex-col items-center justify-center gap-2.5 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                  dragging ? 'border-indigo-400 bg-indigo-50'
                  : file ? 'border-indigo-300 bg-indigo-50/50'
                  : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/30'
                }`}
              >
                {file ? (
                  <>
                    <FileText className="w-7 h-7 text-indigo-500" />
                    <span className="text-slate-700 text-sm font-medium text-center break-all max-w-xs">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="absolute top-2 right-2 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <p className="text-slate-600 text-sm font-medium">
                      Glissez votre CV ou <span className="text-indigo-600">parcourez</span>
                    </p>
                    <p className="text-slate-400 text-xs">PDF, DOC, DOCX</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-rose-600 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!file}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                <BrainCircuit className="w-4 h-4" />
                Postuler et démarrer l'entretien
              </button>
            </form>
          </div>
        </div>

        {/* Footer — external link only */}
        {job.url && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Voir l'offre originale
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Job card ────────────────────────────────────────────────────────────────

function JobCard({ job, onOpen }: { job: JobListing; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-xl border-2 border-slate-200 bg-white p-5 transition-all duration-150 group hover:border-indigo-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate text-slate-800 group-hover:text-indigo-700 transition-colors">
            {job.title}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
            {job.company && <span className="truncate">{job.company}</span>}
            {job.location && (
              <span className="flex items-center gap-1 shrink-0">
                <MapPin className="w-3 h-3" />{job.location}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5 group-hover:text-indigo-400 transition-colors" />
      </div>

      {job.contract_type && (
        <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          {job.contract_type}
        </span>
      )}

      {job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {job.skills.slice(0, 4).map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-md font-medium border bg-slate-50 text-slate-500 border-slate-200">
              {s}
            </span>
          ))}
          {job.skills.length > 4 && (
            <span className="text-xs text-slate-400 self-center">+{job.skills.length - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Jobs view ────────────────────────────────────────────────────────────────

function JobsView({
  onSessionCreated, prefillBoardKey, prefillJobKey,
}: {
  onSessionCreated: (data: SessionData) => void;
  prefillBoardKey: string;
  prefillJobKey: string;
}) {
  const [openJob, setOpenJob] = useState<JobListing | null>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(false);

  const boardKey = prefillBoardKey || import.meta.env.VITE_HRFLOW_BOARD_KEY || '';

  useEffect(() => {
    fetchJobList(boardKey || undefined)
      .then((list) => { setJobs(list); setJobsLoading(false); })
      .catch(() => { setJobsError(true); setJobsLoading(false); });
  }, []);

  // Auto-open if job_key was in URL
  useEffect(() => {
    if (prefillJobKey && jobs.length) {
      const match = jobs.find((j) => j.key === prefillJobKey);
      if (match) setOpenJob(match);
    }
  }, [prefillJobKey, jobs]);

  return (
    <>
      {openJob && (
        <JobDetailModal
          job={openJob}
          onSessionCreated={onSessionCreated}
          onClose={() => setOpenJob(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-10 animate-fade-in">

          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-slate-900">Trouvez votre prochain poste</h1>
            <p className="text-slate-500 mt-2">
              Cliquez sur une offre pour consulter les détails et postuler avec votre CV.
            </p>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <h2 className="font-semibold text-slate-700 text-sm">Offres disponibles</h2>
            {!jobsLoading && jobs.length > 0 && (
              <span className="ml-auto text-xs text-slate-400">{jobs.length} offre{jobs.length > 1 ? 's' : ''}</span>
            )}
          </div>

          {jobsLoading && (
            <div className="flex items-center justify-center h-48 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement des offres…</span>
            </div>
          )}

          {!jobsLoading && jobsError && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Impossible de charger les offres. Veuillez réessayer.
            </div>
          )}

          {!jobsLoading && !jobsError && jobs.length === 0 && (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              Aucune offre disponible pour l'instant.
            </div>
          )}

          {!jobsLoading && jobs.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {jobs.map((job) => (
                <JobCard key={job.key} job={job} onOpen={() => setOpenJob(job)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function LandingPage({ onSessionCreated, onOpenHR }: LandingPageProps) {
  const params = new URLSearchParams(window.location.search);
  const sourceKey = params.get('source_key') ?? import.meta.env.VITE_HRFLOW_SOURCE_KEY ?? '';
  const profileKey = params.get('profile_key') ?? '';
  const reference = params.get('reference') ?? '';
  const userEmail = params.get('user_email') ?? '';
  const boardKey = params.get('board_key') ?? import.meta.env.VITE_HRFLOW_BOARD_KEY ?? '';
  const jobKey = params.get('job_key') ?? '';

  const canAutoLoad = Boolean(sourceKey && (profileKey || reference));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 px-8 py-5 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">InterviewAI</span>
          </div>
          <button
            onClick={onOpenHR}
            className="flex items-center gap-2 text-sm text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-4 py-2 rounded-xl shadow-md transition-all font-medium"
          >
            <Users className="w-4 h-4" />
            Tableau de bord RH
          </button>
        </div>
      </header>

      {canAutoLoad ? (
        <AutoLoadView
          onSessionCreated={onSessionCreated}
          sourceKey={sourceKey} profileKey={profileKey} reference={reference}
          userEmail={userEmail} boardKey={boardKey} jobKey={jobKey}
        />
      ) : (
        <JobsView
          onSessionCreated={onSessionCreated}
          prefillBoardKey={boardKey}
          prefillJobKey={jobKey}
        />
      )}
    </div>
  );
}
