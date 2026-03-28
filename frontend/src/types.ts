export type AppPage = 'landing' | 'briefing' | 'interview' | 'report';

export interface Experience {
  title: string;
  company: string;
  summary: string;
  duration_years: number;
}

export interface NormalizedProfile {
  profile_key: string | null;
  name: string;
  title: string | null;
  years_of_experience: number;
  top_skills: string[];
  experiences: Experience[];
  certifications: string[];
  languages: string[];
  profile_text: string;
}

export interface CandidateBrief {
  profile_key: string;
  candidate_name: string;
  current_title: string;
  years_of_experience: number;
  seniority: 'junior' | 'mid' | 'senior';
  top_skills: string[];
  strongest_experiences: Experience[];
  target_job?: {
    target_role?: string;
    target_company?: string | null;
    target_skills?: string[];
    key_requirements?: string[];
    job_text?: string;
  };
}

export interface SessionData {
  session_id: string;
  normalized_profile: NormalizedProfile;
  candidate_brief: CandidateBrief;
  normalized_job_offer?: {
    title?: string;
    company?: string | null;
    top_skills?: string[];
  } | null;
}

export interface Question {
  id: string;
  category:
    | 'intro_synthesis'
    | 'experience_validation'
    | 'skill_validation'
    | 'situational_or_technical'
    | 'projection_motivation';
  question: string;
  why_it_matters: string;
  expected_signals: string[];
  scoring_criteria: string[];
  priority: number;
}

export interface Subscores {
  relevance: number;
  specificity: number;
  consistency_with_profile: number;
  job_alignment: number;
  clarity: number;
  technical_accuracy: number | null;
}

export interface Evaluation {
  question_id: string;
  normalized_score: number;
  subscores: Subscores;
  strengths: string[];
  concerns: string[];
  rationale: string;
}

export interface AnswerResponse {
  evaluation: Evaluation;
  next_question: Question | null;
  interview_completed: boolean;
}

export interface StartResponse {
  generated_questions: Question[];
  current_question: Question;
  audio_base64: string | null;
}

export interface Report {
  session_id: string;
  candidate_summary: CandidateBrief;
  per_question_evaluations: Evaluation[];
  overall_score: number;
  communication_score: number;
  technical_score: number;
  profile_consistency_score: number;
  job_alignment_score: number;
  hrflow_profile_job_grade?: unknown;
  recommendation: 'strong_yes' | 'yes' | 'mixed' | 'no';
  strengths: string[];
  concerns: string[];
  final_summary: string;
}
