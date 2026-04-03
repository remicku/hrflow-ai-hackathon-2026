import type { SessionData, StartResponse, AnswerResponse, Report, InterviewSummary } from './types';

const BASE = '/api';
const HRFLOW_BASE = '/hrflow-api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      msg = json.detail || json.message || text;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchHRFlowProfile(params: {
  source_key: string;
  profile_key?: string;
  reference?: string;
  api_key?: string;
  user_email?: string;
}): Promise<Record<string, unknown>> {
  const apiKey = params.api_key || import.meta.env.VITE_HRFLOW_API_KEY || '';
  const userEmail = params.user_email || import.meta.env.VITE_HRFLOW_USER_EMAIL || '';

  if (!apiKey) throw new Error('HRFlow API key is required.');

  const query = new URLSearchParams({ source_key: params.source_key });
  if (params.profile_key) query.set('profile_key', params.profile_key);
  if (params.reference) query.set('reference', params.reference);

  const res = await fetch(`${HRFLOW_BASE}/profile/indexing?${query}`, {
    headers: {
      'X-API-KEY': apiKey,
      ...(userEmail ? { 'X-USER-EMAIL': userEmail } : {}),
    },
  });

  const data = await handleResponse<Record<string, unknown>>(res);

  // HRFlow returns the profile directly under `data`
  const profile = data?.data as Record<string, unknown> | undefined;
  if (!profile || !profile.key) throw new Error('No profile found for the given identifiers.');
  return profile;
}

export async function fetchHRFlowJob(params: {
  board_key: string;
  job_key: string;
  user_email?: string;
}): Promise<Record<string, unknown>> {
  const apiKey = import.meta.env.VITE_HRFLOW_API_KEY || '';
  const userEmail = params.user_email || import.meta.env.VITE_HRFLOW_USER_EMAIL || '';

  if (!apiKey) throw new Error('HRFlow API key is required.');

  const query = new URLSearchParams({ board_key: params.board_key, job_key: params.job_key });

  const res = await fetch(`${HRFLOW_BASE}/job/indexing?${query}`, {
    headers: {
      'X-API-KEY': apiKey,
      ...(userEmail ? { 'X-USER-EMAIL': userEmail } : {}),
    },
  });

  const data = await handleResponse<Record<string, unknown>>(res);

  const job = data?.data as Record<string, unknown> | undefined;
  if (!job || !job.key) throw new Error('No job found for the given identifiers.');
  return job;
}

export async function createSession(
  profile: Record<string, unknown>,
  jobOffer?: Record<string, unknown> | null,
): Promise<SessionData> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, job_offer: jobOffer ?? null }),
  });
  return handleResponse<SessionData>(res);
}

export async function startInterview(sessionId: string): Promise<StartResponse> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/start`, {
    method: 'POST',
  });
  return handleResponse<StartResponse>(res);
}

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  transcript: string,
): Promise<AnswerResponse> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, transcript, audio_base64: null }),
  });
  return handleResponse<AnswerResponse>(res);
}

export async function getReport(sessionId: string): Promise<Report> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/report`);
  return handleResponse<Report>(res);
}

export async function textToSpeech(text: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.available ? data.audio_base64 : null;
  } catch {
    return null;
  }
}

export async function listInterviews(): Promise<InterviewSummary[]> {
  const res = await fetch(`${BASE}/hr/interviews`);
  return handleResponse<InterviewSummary[]>(res);
}

export async function getHRReport(sessionId: string): Promise<Report> {
  const res = await fetch(`${BASE}/hr/interviews/${sessionId}`);
  return handleResponse<Report>(res);
}

export function playAudio(base64: string): { promise: Promise<void>; audio: HTMLAudioElement } {
  const audio = new Audio(`data:audio/wav;base64,${base64}`);
  const promise = new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
  return { promise, audio };
}
