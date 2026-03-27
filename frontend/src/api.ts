import type { SessionData, StartResponse, AnswerResponse, Report } from './types';

const BASE = '/api';

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

export async function createSession(profile: Record<string, unknown>): Promise<SessionData> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  return handleResponse<SessionData>(res);
}

export async function createSessionFromHRFlow(params: {
  source_key: string;
  profile_key?: string;
  reference?: string;
  user_email?: string;
}): Promise<SessionData> {
  const res = await fetch(`${BASE}/sessions/from-hrflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
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

export function playAudio(base64: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}
