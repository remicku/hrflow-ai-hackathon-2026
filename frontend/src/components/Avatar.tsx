import { BrainCircuit, Mic } from 'lucide-react';

type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking';

interface AvatarProps {
  state: AvatarState;
  name?: string;
}

const BAR_HEIGHTS = [35, 70, 100, 55, 90, 45, 75, 60, 85, 40];
const BAR_DELAYS = [0, 0.1, 0.2, 0.05, 0.15, 0.25, 0.08, 0.18, 0.03, 0.22];

export default function Avatar({ state, name = 'InterviewAI' }: AvatarProps) {
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar sphere */}
      <div className="relative flex items-center justify-center w-48 h-48">
        {/* Outer animated rings */}
        {isSpeaking && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute inset-[-12px] rounded-full border border-indigo-400/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
            <div className="absolute inset-[-24px] rounded-full border border-indigo-300/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
          </>
        )}
        {isListening && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-ping" style={{ animationDuration: '1.5s' }} />
            <div className="absolute inset-[-12px] rounded-full border border-cyan-400/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.2s' }} />
          </>
        )}

        {/* Main circle */}
        <div
          className={`
            relative w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500
            ${isSpeaking ? 'avatar-speaking bg-gradient-to-br from-indigo-600 to-violet-700' : ''}
            ${isListening ? 'avatar-listening bg-gradient-to-br from-cyan-500 to-teal-600' : ''}
            ${isThinking ? 'bg-gradient-to-br from-slate-600 to-slate-700 animate-pulse' : ''}
            ${state === 'idle' ? 'bg-gradient-to-br from-slate-700 to-slate-800' : ''}
          `}
        >
          {/* Icon */}
          {isListening ? (
            <Mic className="w-12 h-12 text-white drop-shadow-lg" />
          ) : (
            <BrainCircuit className="w-12 h-12 text-white drop-shadow-lg" />
          )}

          {/* Audio bars when speaking */}
          {isSpeaking && (
            <div className="flex items-end gap-[3px] h-6 px-2">
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="audio-bar"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${BAR_DELAYS[i]}s`,
                    animationDuration: `${0.6 + i * 0.05}s`,
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
          )}

          {/* Thinking dots */}
          {isThinking && (
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-white/70 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="text-slate-200 font-semibold text-lg">{name}</p>
        <p className="text-slate-500 text-sm">
          {isSpeaking && 'Asking a question...'}
          {isListening && 'Listening to your answer...'}
          {isThinking && 'Evaluating your response...'}
          {state === 'idle' && 'Ready'}
        </p>
      </div>
    </div>
  );
}
