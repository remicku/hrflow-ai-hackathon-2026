import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Send, ChevronRight, AlertCircle, Loader2, Volume2, VolumeX,
} from 'lucide-react';
import Avatar from '../components/Avatar';
import { ScoreBar } from '../components/ScoreBar';
import { startInterview, submitAnswer, getReport, textToSpeech, playAudio } from '../api';
import { useElevenLabsSTT } from '../hooks/useElevenLabsSTT';
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
  experience_validation: 'Experience',
  skill_validation: 'Technical Skills',
  situational_or_technical: 'Situational',
  projection_motivation: 'Motivation',
};

const TOTAL_QUESTIONS = 5;

interface InterviewPageProps {
  sessionData: SessionData;
  onComplete: (report: Report) => void;
}

export default function InterviewPage({ sessionData, onComplete }: InterviewPageProps) {
  const { session_id: sessionId } = sessionData;

  const [state, setState] = useState<InterviewState>('loading');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [manualText, setManualText] = useState('');
  const [useManualInput, setUseManualInput] = useState(false);
  const allQuestionsRef = useRef<Question[]>([]);

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
  } = useElevenLabsSTT('fr');

  // Speak a question via TTS then transition to ready_to_record
  const speakQuestion = useCallback(
    async (question: Question) => {
      setState('speaking');
      if (audioEnabled) {
        const audio = await textToSpeech(question.question);
        if (audio) {
          await playAudio(audio);
        } else {
          // Simulate reading time
          await new Promise((r) => setTimeout(r, 2500));
        }
      } else {
        await new Promise((r) => setTimeout(r, 800));
      }
      setState('ready_to_record');
    },
    [audioEnabled],
  );

  // Load first question on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await startInterview(sessionId);
        if (cancelled) return;
        allQuestionsRef.current = data.generated_questions;
        setCurrentQuestion(data.current_question);
        setCurrentIndex(0);
        await speakQuestion(data.current_question);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to start interview');
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
      setState('evaluated');

      // Auto-advance after 4 seconds
      setTimeout(async () => {
        if (res.interview_completed || !res.next_question) {
          setState('fetching_report');
          try {
            const report = await getReport(sessionId);
            onComplete(report);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch report');
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
      }, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit answer');
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

  const avatarState = (() => {
    if (state === 'speaking') return 'speaking';
    if (state === 'listening') return 'listening';
    if (state === 'submitting' || state === 'fetching_report') return 'thinking';
    return 'idle';
  })();

  const activeTranscript = (transcript + (interimTranscript ? ' ' + interimTranscript : '')).trim();

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-indigo-600/6 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative border-b border-slate-800/50 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="text-slate-300 font-medium">{sessionData.candidate_brief.candidate_name}</span>
            <span>·</span>
            <span>{sessionData.candidate_brief.current_title || 'Candidate'}</span>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-500 ${
                  i < currentIndex
                    ? 'w-6 bg-emerald-500'
                    : i === currentIndex
                    ? 'w-6 bg-indigo-500 animate-pulse'
                    : 'w-2 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title={audioEnabled ? 'Mute audio' : 'Enable audio'}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-3xl mx-auto w-full">

        {/* Error state */}
        {state === 'error' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <AlertCircle className="w-12 h-12 text-rose-400" />
            <p className="text-rose-300 text-center">{error}</p>
            <button
              className="px-6 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-sm"
              onClick={() => window.location.reload()}
            >
              Restart
            </button>
          </div>
        )}

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            <p className="text-slate-400">Preparing your interview...</p>
          </div>
        )}

        {/* Fetching report */}
        {state === 'fetching_report' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
            <p className="text-slate-400">Generating your report...</p>
          </div>
        )}

        {/* Evaluated state */}
        {state === 'evaluated' && evaluation && (
          <div className="w-full max-w-lg animate-scale-in">
            {/* Score reveal */}
            <div className="glass-card rounded-2xl p-8 text-center mb-6">
              <p className="text-slate-400 text-sm mb-4">Answer evaluated</p>
              <div className="text-6xl font-extrabold mb-2">
                <span className={`
                  ${evaluation.normalized_score >= 75 ? 'text-emerald-400' :
                    evaluation.normalized_score >= 60 ? 'text-amber-400' : 'text-rose-400'}
                `}>
                  {Math.round(evaluation.normalized_score)}
                </span>
                <span className="text-slate-600 text-3xl">/100</span>
              </div>
              <p className="text-slate-500 text-sm">{evaluation.rationale}</p>
            </div>

            {/* Subscores */}
            <div className="glass-card rounded-2xl p-6 space-y-3 mb-6">
              <ScoreBar label="Relevance" value={evaluation.subscores.relevance} />
              <ScoreBar label="Specificity" value={evaluation.subscores.specificity} />
              <ScoreBar label="Consistency" value={evaluation.subscores.consistency_with_profile} />
              <ScoreBar label="Clarity" value={evaluation.subscores.clarity} />
              {evaluation.subscores.technical_accuracy !== null && (
                <ScoreBar label="Technical Accuracy" value={evaluation.subscores.technical_accuracy} />
              )}
            </div>

            {/* Strengths & Concerns */}
            <div className="grid grid-cols-2 gap-4">
              {evaluation.strengths.length > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-emerald-400 text-xs font-semibold mb-2 uppercase tracking-wider">Strengths</p>
                  <ul className="space-y-1">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i} className="text-slate-300 text-xs flex gap-2">
                        <span className="text-emerald-500 shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluation.concerns.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-amber-400 text-xs font-semibold mb-2 uppercase tracking-wider">To improve</p>
                  <ul className="space-y-1">
                    {evaluation.concerns.map((c, i) => (
                      <li key={i} className="text-slate-300 text-xs flex gap-2">
                        <span className="text-amber-500 shrink-0">!</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <p className="text-center text-slate-600 text-sm mt-6 animate-pulse">
              {currentIndex < TOTAL_QUESTIONS - 1 ? 'Next question in a moment...' : 'Generating final report...'}
            </p>
          </div>
        )}

        {/* Active interview state */}
        {(state === 'speaking' || state === 'ready_to_record' || state === 'listening' || state === 'submitting') && currentQuestion && (
          <div className="w-full flex flex-col items-center gap-8 animate-fade-in">
            {/* Question number badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Question {currentIndex + 1} of {TOTAL_QUESTIONS}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                {CATEGORY_LABELS[currentQuestion.category] || currentQuestion.category}
              </span>
            </div>

            {/* Avatar */}
            <Avatar state={avatarState} />

            {/* Question card */}
            <div className="w-full glass-card rounded-2xl p-6">
              <p className="text-white text-lg leading-relaxed text-center font-medium">
                {currentQuestion.question}
              </p>

              {/* Expected signals hint */}
              {state === 'ready_to_record' && currentQuestion.expected_signals.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <p className="text-slate-600 text-xs text-center">
                    Tip: mention relevant points like{' '}
                    {currentQuestion.expected_signals.slice(0, 2).map((s, i) => (
                      <span key={i} className="text-slate-500 italic">
                        {s}{i < 1 && currentQuestion.expected_signals.length > 1 ? ', ' : ''}
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>

            {/* Answer area */}
            {(state === 'ready_to_record' || state === 'listening' || state === 'submitting') && (
              <div className="w-full space-y-4">
                {/* Toggle manual input */}
                {!speechSupported && !useManualInput && (
                  <p className="text-amber-400 text-sm text-center">
                    Speech recognition not supported in this browser. Use text input below.
                  </p>
                )}

                {/* Transcript display */}
                {!useManualInput && (
                  <div
                    className={`w-full min-h-[100px] glass-card rounded-xl p-4 relative transition-all ${
                      isListening ? 'border-cyan-500/40' : isTranscribing ? 'border-indigo-500/40' : ''
                    }`}
                  >
                    {isListening && (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        <span className="recording-dot w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-xs text-rose-400">Recording</span>
                      </div>
                    )}
                    {isTranscribing && (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                        <span className="text-xs text-indigo-400">Transcribing...</span>
                      </div>
                    )}
                    <p className="text-slate-300 text-sm leading-relaxed">
                      {activeTranscript || (
                        <span className="text-slate-600 italic">
                          {isListening ? 'Speak now...' : isTranscribing ? 'Processing audio...' : 'Your transcription will appear here'}
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Manual text input */}
                {useManualInput && (
                  <textarea
                    className="w-full min-h-[100px] bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                    placeholder="Type your answer here..."
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    disabled={state === 'submitting'}
                  />
                )}

                {/* Toggle input mode */}
                <button
                  className="text-xs text-slate-600 hover:text-slate-400 transition-colors block mx-auto"
                  onClick={() => {
                    setUseManualInput(!useManualInput);
                    if (isListening) stopListening();
                  }}
                >
                  {useManualInput ? 'Switch to voice input' : 'Switch to text input'}
                </button>

                {/* Controls */}
                <div className="flex items-center gap-4">
                  {/* Mic button */}
                  {!useManualInput && (
                    <button
                      onClick={isListening ? handleStopRecording : handleStartRecording}
                      disabled={state === 'submitting'}
                      className={`
                        w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shrink-0
                        ${isListening
                          ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/30 scale-110'
                          : 'bg-slate-700 hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-500/30'
                        }
                      `}
                    >
                      {isListening ? (
                        <MicOff className="w-6 h-6 text-white" />
                      ) : (
                        <Mic className="w-6 h-6 text-white" />
                      )}
                    </button>
                  )}

                  {/* Submit button */}
                  <button
                    onClick={handleSubmit}
                    disabled={
                      state === 'submitting' ||
                      isTranscribing ||
                      (!useManualInput && !activeTranscript && !isListening) ||
                      (useManualInput && !manualText.trim())
                    }
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:shadow-none"
                  >
                    {state === 'submitting' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Evaluating...
                      </>
                    ) : isTranscribing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Transcribing...
                      </>
                    ) : (
                      <>
                        Submit Answer
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                {/* Send icon for quick submit (when recording) */}
                {isListening && (
                  <button
                    className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 mx-auto transition-colors"
                    onClick={handleSubmit}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Stop & submit
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
