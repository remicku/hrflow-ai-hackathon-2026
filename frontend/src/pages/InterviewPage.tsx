import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Send, ChevronRight, AlertCircle, Loader2, Volume2, VolumeX,
  PhoneOff,
} from 'lucide-react';
import Avatar from '../components/Avatar';
import Webcam from '../components/Webcam';
import { startInterview, submitAnswer, getReport, textToSpeech, playAudio, submitGazeSummary } from '../api';
import { useElevenLabsSTT } from '../hooks/useElevenLabsSTT';
import { useGazeTracking } from '../hooks/useGazeTracking';
import type { SessionData, Question, Evaluation, Report } from '../types';

type InterviewState =
  | 'loading'
  | 'speaking'
  | 'ready_to_record'
  | 'listening'
  | 'submitting'
  | 'evaluated'
  | 'fetching_report'
  | 'error';

const CATEGORY_LABELS: Record<string, string> = {
  intro_synthesis: 'Introduction',
  experience_validation: 'Expérience',
  skill_validation: 'Compétences techniques',
  situational_or_technical: 'Situationnel',
  projection_motivation: 'Motivation',
};

const TOTAL_QUESTIONS = 3;

interface InterviewPageProps {
  sessionData: SessionData;
  onComplete: (report: Report) => void;
}

export default function InterviewPage({ sessionData, onComplete }: InterviewPageProps) {
  const { session_id: sessionId } = sessionData;

  const VOICE_FR = '8_M2uwvmyM-BadY9';
  const VOICE_EN = 'HtgP9v8SoWbq_jxi';
  const getVoiceId = (question: Question) =>
    question.category === 'language_proficiency' ? VOICE_EN : VOICE_FR;

  const [state, setState] = useState<InterviewState>('loading');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAnswerRes = useRef<{ interview_completed: boolean; next_question: Question | null } | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [manualText, setManualText] = useState('');
  const [useManualInput, setUseManualInput] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const allQuestionsRef = useRef<Question[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;

  // Ref to always call the latest handleSubmit from the silence callback
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {});

  const { isLookingAway, getSummary } = useGazeTracking(videoRef, currentIndex);

  const {
    transcript,
    interimTranscript,
    isListening,
    isTranscribing,
    startListening,
    stopListening,
    stopAndGetTranscript,
    resetTranscript,
    isSupported: speechSupported,
  } = useElevenLabsSTT(
    currentQuestion?.category === 'language_proficiency' ? 'en' : 'fr',
    () => { handleSubmitRef.current(); },
  );

  // Speak a question via TTS then transition to ready_to_record
  const speakQuestion = useCallback(
    async (question: Question) => {
      const tts = await textToSpeech(question.question, getVoiceId(question));
      setState('speaking');
      if (tts) {
        const { promise, audio } = playAudio(tts);
        audio.muted = !audioEnabledRef.current;
        currentAudioRef.current = audio;
        await promise;
        currentAudioRef.current = null;
      } else {
        await new Promise((r) => setTimeout(r, 2500));
      }
      setState('ready_to_record');
    },
    [],
  );

  // Load first question on mount (use prefetched data if available)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await startInterview(sessionId);
        if (cancelled) return;
        allQuestionsRef.current = data.generated_questions;
        setCurrentQuestion(data.current_question);
        setCurrentIndex(0);
        // Pre-fetch TTS in parallel with a 2s delay so avatar+audio start together
        const [tts] = await Promise.all([
          textToSpeech(data.current_question.question, getVoiceId(data.current_question)),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
        if (cancelled) return;
        setState('speaking');
        if (tts) {
          const { promise, audio } = playAudio(tts);
          audio.muted = !audioEnabledRef.current;
          currentAudioRef.current = audio;
          await promise;
          currentAudioRef.current = null;
        } else {
          await new Promise((r) => setTimeout(r, 2500));
        }
        setState('ready_to_record');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Impossible de démarrer l'entretien");
          setState('error');
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleStartRecording = () => {
    resetTranscript();
    setManualText('');
    setState('listening');
    if (!useManualInput && speechSupported) {
      startListening();
    }
  };

  const handleStopRecording = () => {
    if (!useManualInput && speechSupported) {
      stopListening();
    }
    setState('ready_to_record');
  };

  const handleSubmit = useCallback(async () => {
    let answer: string;
    if (useManualInput) {
      answer = manualText.trim();
    } else if (isListening) {
      answer = await stopAndGetTranscript();
    } else {
      answer = transcript.trim();
    }
    if (!answer || !currentQuestion) return;

    setState('submitting');

    try {
      const res = await submitAnswer(sessionId, currentQuestion.id, answer);
      setEvaluation(res.evaluation);
      lastAnswerRes.current = { interview_completed: res.interview_completed, next_question: res.next_question };
      setState('evaluated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de soumettre la réponse');
      setState('error');
    }
  }, [
    useManualInput,
    manualText,
    transcript,
    currentQuestion,
    isListening,
    stopAndGetTranscript,
    sessionId,
    resetTranscript,
    speakQuestion,
    onComplete,
  ]);

  // Keep ref in sync so the silence callback always calls the latest handleSubmit
  handleSubmitRef.current = handleSubmit;

  const handleNextQuestion = useCallback(async () => {
    const res = lastAnswerRes.current;
    if (!res) return;
    if (res.interview_completed || !res.next_question) {
      setState('fetching_report');
      try {
        await submitGazeSummary(sessionId, getSummary());
        const report = await getReport(sessionId);
        onComplete(report);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de récupérer le rapport');
        setState('error');
      }
    } else {
      const next = res.next_question;
      setCurrentQuestion(next);
      setCurrentIndex((i) => i + 1);
      resetTranscript();
      setManualText('');
      setEvaluation(null);
      await speakQuestion(next);
    }
  }, [sessionId, resetTranscript, speakQuestion, onComplete, getSummary]);

  // Auto-start recording as soon as the interviewer finishes speaking
  const prevStateRef = useRef<InterviewState | null>(null);
  useEffect(() => {
    if (
      state === 'ready_to_record' &&
      prevStateRef.current === 'speaking' &&
      !useManualInput &&
      speechSupported
    ) {
      resetTranscript();
      setManualText('');
      setState('listening');
      startListening();
    }
    prevStateRef.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const avatarState = (() => {
    if (state === 'speaking') return 'speaking';
    if (state === 'listening') return 'listening';
    if (state === 'submitting' || state === 'fetching_report') return 'thinking';
    return 'idle';
  })();

  const activeTranscript = (transcript + (interimTranscript ? ' ' + interimTranscript : '')).trim();

  const candidateName = sessionData.candidate_brief.candidate_name;

  // --- Full-screen states ---
  if (state === 'error') {
    return (
      <div className="h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <AlertCircle className="w-12 h-12 text-rose-500" />
          <p className="text-rose-600 text-center">{error}</p>
          <button
            className="px-6 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm text-white"
            onClick={() => window.location.reload()}
          >
            Redémarrer
          </button>
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-slate-500">Connexion à l'entretien...</p>
        </div>
      </div>
    );
  }

  if (state === 'fetching_report') {
    return (
      <div className="h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-slate-500">Génération de votre rapport...</p>
        </div>
      </div>
    );
  }

  // --- Evaluated state: simple confirmation, no scores shown to candidate ---
  if (state === 'evaluated' && evaluation) {
    const nextQuestion = lastAnswerRes.current?.next_question;
    const nextIsEnglish = nextQuestion?.category === 'language_proficiency';
    return (
      <div className="h-screen bg-slate-50 text-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 animate-fade-in text-center px-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <ChevronRight className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="text-slate-600 text-lg font-medium">Réponse enregistrée</p>
          {nextIsEnglish && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 max-w-sm">
              <p className="text-amber-700 text-sm font-semibold mb-1">La prochaine question est en anglais</p>
              <p className="text-amber-600 text-xs">Vous devrez répondre en anglais. Prenez un moment pour vous préparer.</p>
            </div>
          )}
          <button
            onClick={handleNextQuestion}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            {currentIndex < TOTAL_QUESTIONS - 1 ? 'Question suivante' : 'Terminer l\'entretien'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // --- Main interview: Zoom-like layout ---
  return (
    <div className="h-screen bg-slate-100 text-slate-900 flex flex-col overflow-hidden">

      {/* Top bar - Zoom style */}
      <header className="relative bg-white/80 backdrop-blur-sm border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-slate-600 text-sm font-medium">Entretien en cours</span>
          <span className="text-slate-300 text-sm">|</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600">
            Q{currentIndex + 1}/{TOTAL_QUESTIONS} — {currentQuestion ? (CATEGORY_LABELS[currentQuestion.category] || currentQuestion.category) : ''}
          </span>
        </div>

        {/* Gaze warning */}
        {isLookingAway && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full shadow-md animate-pulse">
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Regardez la caméra
          </div>
        )}

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < currentIndex
                  ? 'w-5 bg-emerald-500'
                  : i === currentIndex
                  ? 'w-5 bg-blue-500 animate-pulse'
                  : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
      </header>

      {/* Video grid */}
      <div className="flex-1 flex flex-col md:flex-row gap-2 p-2 min-h-0">

        {/* Interviewer tile (main / large) */}
        <div className="flex-1 md:flex-[2] rounded-xl overflow-hidden border border-slate-200 bg-white flex flex-col min-h-0 shadow-sm">
          {/* Avatar area */}
          <div className="flex-1 min-h-0">
            <Avatar state={avatarState} name="Remi AI" />
          </div>

          {/* Question subtitle bar */}
          {currentQuestion && (
            <div className="bg-white/90 backdrop-blur-sm border-t border-slate-200 px-4 py-3 shrink-0">
              <p className="text-slate-800 text-sm md:text-base leading-relaxed text-center">
                {currentQuestion.question}
              </p>
              {state === 'ready_to_record' && Array.isArray(currentQuestion.expected_signals) && currentQuestion.expected_signals.length > 0 && (
                <p className="text-slate-400 text-xs text-center mt-1">
                  Conseil : {currentQuestion.expected_signals.slice(0, 2).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right column: transcript + webcam as separate tiles */}
        <div className="md:flex-1 flex flex-col gap-2 min-h-[200px] md:min-h-0">

          {/* Transcript tile */}
          <div className="flex-1 flex flex-col rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm min-h-0">
            {(state === 'ready_to_record' || state === 'listening' || state === 'submitting') ? (
              <div className="w-full h-full flex flex-col p-3">
                {!speechSupported && !useManualInput && (
                  <p className="text-amber-600 text-xs text-center mb-2">
                    Reconnaissance vocale non supportée. Utilisez la saisie texte.
                  </p>
                )}

                {/* Transcript display */}
                {!useManualInput ? (
                  <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg p-3 relative min-h-[80px] border border-slate-100">
                    {isListening && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <span className="recording-dot w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-xs text-rose-500">REC</span>
                      </div>
                    )}
                    {isTranscribing && (
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                        <span className="text-xs text-blue-500">Transcription...</span>
                      </div>
                    )}
                    <p className="text-slate-700 text-sm leading-relaxed">
                      {activeTranscript || (
                        <span className="text-slate-400 italic text-xs">
                          {isListening ? 'Parlez maintenant...' : isTranscribing ? 'Traitement...' : 'Votre réponse apparaîtra ici'}
                        </span>
                      )}
                    </p>
                  </div>
                ) : (
                  <textarea
                    className="flex-1 bg-white border border-slate-200 rounded-lg p-3 text-slate-700 text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400 min-h-[80px]"
                    placeholder="Écrivez votre réponse..."
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    disabled={state === 'submitting'}
                  />
                )}

                <button
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors mt-2 mx-auto"
                  onClick={() => {
                    setUseManualInput(!useManualInput);
                    if (isListening) stopListening();
                  }}
                >
                  {useManualInput ? 'Passer à la voix' : 'Passer au texte'}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-400 text-xs">
                  {state === 'speaking' ? 'Écoute de la question...' : 'En attente...'}
                </p>
              </div>
            )}
          </div>

          <Webcam videoRef={videoRef} />
        </div>
      </div>

      {/* Bottom toolbar - Zoom style */}
      <div className="bg-white/90 backdrop-blur-sm border-t border-slate-200 px-4 py-3 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-3">

          {/* Mic button */}
          {!useManualInput && (state === 'ready_to_record' || state === 'listening') && (
            <button
              onClick={isListening ? handleStopRecording : handleStartRecording}
              className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200
                ${isListening
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/30 scale-105'
                  : 'bg-slate-100 hover:bg-slate-200'
                }
              `}
              title={isListening ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
            >
              {isListening ? (
                <MicOff className="w-5 h-5 text-white" />
              ) : (
                <Mic className="w-5 h-5 text-slate-600" />
              )}
            </button>
          )}

          {/* Submit button */}
          {(state === 'ready_to_record' || state === 'listening' || state === 'submitting') && (
            <button
              onClick={handleSubmit}
              disabled={
                state === 'submitting' ||
                isTranscribing ||
                (!useManualInput && !activeTranscript && !isListening) ||
                (useManualInput && !manualText.trim())
              }
              className="px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-400 hover:to-blue-600 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-blue-800/20 disabled:shadow-none"
            >
              {state === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Évaluation...
                </>
              ) : isTranscribing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Transcription...
                </>
              ) : isListening ? (
                <>
                  <Send className="w-4 h-4" />
                  Arrêter & Envoyer
                </>
              ) : (
                <>
                  Envoyer la réponse
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {/* Audio toggle */}
          <button
            onClick={() => {
              const next = !audioEnabled;
              setAudioEnabled(next);
              if (currentAudioRef.current) {
                currentAudioRef.current.muted = !next;
              }
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              audioEnabled ? 'bg-slate-100 hover:bg-slate-200' : 'bg-rose-600 hover:bg-rose-500'
            }`}
            title={audioEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {audioEnabled ? <Volume2 className="w-5 h-5 text-slate-600" /> : <VolumeX className="w-5 h-5 text-white" />}
          </button>

          {/* End call (visual only for now) */}
          <button
            className="w-12 h-12 rounded-full bg-rose-100 hover:bg-rose-600 flex items-center justify-center transition-all group"
            title="Terminer l'entretien"
            onClick={() => window.location.reload()}
          >
            <PhoneOff className="w-5 h-5 text-rose-500 group-hover:text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
