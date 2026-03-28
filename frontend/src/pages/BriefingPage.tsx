import { ArrowRight, BrainCircuit, Briefcase, Star, Clock, Award, Globe } from 'lucide-react';
import type { SessionData } from '../types';

interface BriefingPageProps {
  sessionData: SessionData;
  onStart: () => void;
}

const SENIORITY_COLOR: Record<string, string> = {
  junior: 'text-sky-600 bg-sky-50 border-sky-200',
  mid: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  senior: 'text-violet-600 bg-violet-50 border-violet-200',
};

const CATEGORY_LABELS: Record<string, string> = {
  intro_synthesis: 'Introduction',
  experience_validation: 'Experience',
  skill_validation: 'Technical Skills',
  situational_or_technical: 'Situational',
  projection_motivation: 'Motivation',
};

const INTERVIEW_STEPS = [
  { category: 'intro_synthesis', desc: "Your background & career trajectory" },
  { category: 'experience_validation', desc: "Deep-dive into your strongest project" },
  { category: 'skill_validation', desc: "Technical skills in real contexts" },
  { category: 'situational_or_technical', desc: "Problem-solving scenario" },
  { category: 'projection_motivation', desc: "Future goals & company fit" },
];

export default function BriefingPage({ sessionData, onStart }: BriefingPageProps) {
  const { candidate_brief: brief, normalized_profile: profile } = sessionData;
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
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-violet-200/30 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-12">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <BrainCircuit className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">InterviewAI</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500 text-sm">Candidate Briefing</span>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8">
          {/* Left column */}
          <div className="space-y-6 animate-slide-up">
            {/* Profile card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-start gap-5">
                {/* Avatar initials */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xl font-bold text-white shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-bold text-slate-900">{brief.candidate_name}</h1>
                      <p className="text-slate-500 text-sm mt-0.5">{brief.current_title || 'No title provided'}</p>
                    </div>
                    <span
                      className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full border capitalize ${SENIORITY_COLOR[brief.seniority] ?? 'text-slate-500 bg-slate-100 border-slate-200'}`}
                    >
                      {brief.seniority}
                    </span>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {Math.round(brief.years_of_experience)} yrs experience
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

              {/* Skills */}
              <div className="mt-6">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-3 font-semibold">Top Skills</p>
                <div className="flex flex-wrap gap-2">
                  {brief.top_skills.slice(0, 8).map((skill) => (
                    <span
                      key={skill}
                      className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-600 text-sm rounded-lg font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Experiences */}
            {profile.experiences.length > 0 && (
              <div className="glass-card rounded-2xl p-6">
                <p className="text-slate-400 text-xs uppercase tracking-wider mb-4 font-semibold flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" />
                  Experience
                </p>
                <div className="space-y-4">
                  {profile.experiences.slice(0, 3).map((exp, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        {i < profile.experiences.length - 1 && (
                          <div className="w-px flex-1 bg-slate-200 mt-2" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-slate-900 font-medium text-sm">{exp.title}</p>
                        <p className="text-slate-500 text-xs">{exp.company} · {Math.round(exp.duration_years * 10) / 10} yrs</p>
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

          {/* Right column - interview plan + start */}
          <div className="space-y-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {/* Interview structure */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <Star className="w-4 h-4 text-indigo-500" />
                <p className="text-slate-900 font-semibold">Interview Structure</p>
              </div>
              <div className="space-y-3">
                {INTERVIEW_STEPS.map((step, i) => (
                  <div key={step.category} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs text-slate-500 font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-slate-700 text-sm font-medium">{CATEGORY_LABELS[step.category]}</p>
                      <p className="text-slate-400 text-xs">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <p className="text-amber-700 text-sm font-semibold mb-2">Before you start</p>
              <ul className="text-slate-600 text-sm space-y-1.5">
                <li>• Make sure your microphone is connected</li>
                <li>• Find a quiet environment</li>
                <li>• Answer clearly and specifically</li>
                <li>• 5 questions, take your time</li>
              </ul>
            </div>

            {/* CTA */}
            <button
              onClick={onStart}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-base transition-all duration-200 shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-3 group"
            >
              Begin Interview
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <p className="text-slate-400 text-xs text-center">
              Estimated duration: 10–15 minutes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
