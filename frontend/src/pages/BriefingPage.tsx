import { ArrowRight, BrainCircuit, Briefcase, Star, Clock, Award, Globe, Building2, CheckSquare, Camera, Mic, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { SessionData } from '../types';
import { useMediaPermissions, type PermissionStatus } from '../hooks/useMediaPermissions';

interface BriefingPageProps {
  sessionData: SessionData;
  onStart: () => void;
}

const SENIORITY_COLOR: Record<string, string> = {
  junior: 'text-sky-600 bg-sky-50 border-sky-200',
  mid: 'text-blue-600 bg-blue-50 border-blue-200',
  senior: 'text-blue-700 bg-blue-100 border-blue-300',
};

const INTERVIEW_STEPS = [
  {
    label: 'Introduction & parcours',
    desc: 'Présentez votre trajectoire et son adéquation avec le poste visé',
    lang: 'FR',
  },
  {
    label: 'Test de niveau d\'anglais',
    desc: 'Question posée en anglais — répondez en anglais',
    lang: 'EN',
  },
  {
    label: 'Validation des compétences clés',
    desc: 'Exemples concrets d\'utilisation des compétences attendues pour ce rôle',
    lang: 'FR',
  },
];

function PermissionRow({ status, label, icon }: { status: PermissionStatus; label: string; icon: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {status === 'pending' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
      {status === 'granted' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
      {(status === 'denied' || status === 'unavailable') && <XCircle className="w-4 h-4 text-rose-500 shrink-0" />}
      <span className="text-slate-400 shrink-0">{icon}</span>
      <span className={
        status === 'granted' ? 'text-slate-700' :
        status === 'pending' ? 'text-slate-500' :
        'text-rose-600'
      }>
        {label}
        {status === 'denied' && ' — accès refusé'}
        {status === 'unavailable' && ' — non disponible'}
      </span>
    </li>
  );
}

export default function BriefingPage({ sessionData, onStart }: BriefingPageProps) {
  const { candidate_brief: brief, normalized_profile: profile, normalized_job_offer: jobOffer } = sessionData;
  const targetJob = brief.target_job;
  const permissions = useMediaPermissions();

  const initials = brief.candidate_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-200/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-blue-100/30 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <BrainCircuit className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">Remi AI</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500 text-sm">Briefing candidat</span>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8">
          {/* Left column */}
          <div className="space-y-6 animate-slide-up">
            {/* Profile card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xl font-bold text-white shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold text-slate-900">{brief.candidate_name}</h1>
                      <p className="text-slate-500 text-sm mt-0.5">{brief.current_title || 'Titre non renseigné'}</p>
                    </div>
                    <span
                      className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border capitalize ${SENIORITY_COLOR[brief.seniority] ?? 'text-slate-500 bg-slate-100 border-slate-200'}`}
                    >
                      {brief.seniority}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {Math.round(brief.years_of_experience)} ans d'expérience
                    </span>
                    {profile.certifications.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5" />
                        {profile.certifications.length} certification{profile.certifications.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {profile.languages.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        {profile.languages.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-3 font-semibold">Compétences clés</p>
                <div className="flex flex-wrap gap-2">
                  {brief.top_skills.slice(0, 8).map((skill) => (
                    <span
                      key={skill}
                      className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-600 text-sm rounded-lg font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Job offer summary */}
            {(jobOffer?.title || targetJob?.target_role) && (
              <div className="glass-card rounded-2xl p-6">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-4 font-semibold flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  Poste visé
                </p>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-slate-900 font-bold text-base">
                      {jobOffer?.title ?? targetJob?.target_role}
                    </h2>
                    {(() => {
                      const company = jobOffer?.company ?? targetJob?.target_company;
                      return company && company !== 'jobs' ? (
                        <p className="text-slate-500 text-sm flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          {company}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {(jobOffer?.top_skills ?? targetJob?.target_skills ?? []).length > 0 && (
                    <div>
                      <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold">Compétences recherchées</p>
                      <div className="flex flex-wrap gap-2">
                        {(jobOffer?.top_skills ?? targetJob?.target_skills ?? []).map((skill) => (
                          <span
                            key={skill}
                            className="px-2.5 py-1 bg-blue-100 border border-blue-300 text-blue-700 text-xs rounded-lg font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {targetJob?.key_requirements && targetJob.key_requirements.length > 0 && (
                    <div>
                      <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5" />
                        Critères clés
                      </p>
                      <ul className="space-y-1.5">
                        {targetJob.key_requirements.slice(0, 4).map((req, i) => (
                          <li key={i} className="text-slate-600 text-sm flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                            {req}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Experiences */}
            {profile.experiences.length > 0 && (
              <div className="glass-card rounded-2xl p-6">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-4 font-semibold flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  Expériences
                </p>
                <div className="space-y-4">
                  {profile.experiences.slice(0, 3).map((exp, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        {i < Math.min(profile.experiences.length, 3) - 1 && (
                          <div className="w-px flex-1 bg-slate-200 mt-2" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-slate-900 font-medium text-sm">{exp.title}</p>
                        <p className="text-slate-500 text-xs">{exp.company} · {Math.round(exp.duration_years * 10) / 10} ans</p>
                        {exp.summary && (
                          <p className="text-slate-400 text-xs mt-1 line-clamp-2">{exp.summary}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {/* Interview structure */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Star className="w-4 h-4 text-blue-500" />
                <p className="text-slate-900 font-semibold">Déroulé de l'entretien</p>
              </div>
              <div className="space-y-3">
                {INTERVIEW_STEPS.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs text-slate-500 font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-700 text-sm font-medium">{step.label}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${step.lang === 'EN' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-500'}`}>
                          {step.lang}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions + instructions */}
            <div className={`rounded-xl p-5 border ${
              permissions.camera === 'denied' || permissions.microphone === 'denied'
                ? 'bg-rose-50 border-rose-200'
                : permissions.allGranted
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <p className={`text-sm font-semibold mb-3 ${
                permissions.camera === 'denied' || permissions.microphone === 'denied'
                  ? 'text-rose-700'
                  : permissions.allGranted ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                Avant de commencer
              </p>
              <ul className="space-y-2 mb-3">
                <PermissionRow
                  status={permissions.camera}
                  label="Caméra"
                  icon={<Camera className="w-3.5 h-3.5" />}
                />
                <PermissionRow
                  status={permissions.microphone}
                  label="Microphone"
                  icon={<Mic className="w-3.5 h-3.5" />}
                />
              </ul>
              <ul className="text-slate-600 text-sm space-y-1 pt-3 border-t border-current/10">
                <li>• Installez-vous dans un endroit calme</li>
                <li>• Répondez clairement et avec des exemples précis</li>
                <li>• 3 questions, prenez votre temps</li>
              </ul>
            </div>

            {/* CTA */}
            <button
              onClick={onStart}
              disabled={permissions.microphone === 'denied'}
              title={permissions.microphone === 'denied' ? 'Accès au microphone requis' : undefined}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-400 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base transition-all duration-200 shadow-lg shadow-blue-800/20 flex items-center justify-center gap-3 group"
            >
              Commencer l'entretien
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <p className="text-slate-400 text-xs text-center">
              Durée estimée : 10–15 minutes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
