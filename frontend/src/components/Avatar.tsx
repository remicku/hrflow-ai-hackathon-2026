import { useRef, useEffect } from 'react';
import Lottie, { LottieRefCurrentProps } from 'lottie-react';
import greenManAvatar from '../avatars/green_man_avatar.json';
import officeBackground from '../avatars/backgrouds/office_background_interview.jpg';
import { Mic } from 'lucide-react';

type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking';

interface AvatarProps {
  state: AvatarState;
  name?: string;
}

export default function Avatar({ state, name = 'Remi AI' }: AvatarProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';

  useEffect(() => {
    if (!lottieRef.current) return;
    if (isSpeaking) {
      lottieRef.current.play();
    } else {
      lottieRef.current.pause();
    }
  }, [isSpeaking]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Video feed area */}
      <div className="flex-1 relative bg-slate-100 flex items-end justify-center overflow-hidden">
        {/* Background */}
        <img src={officeBackground} alt="" className="absolute inset-0 w-full h-full object-cover" />
        {/* Lottie avatar */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ height: '75%', bottom: '40%', left: '0%' }}>
          <Lottie
            lottieRef={lottieRef}
            animationData={greenManAvatar}
            loop
            autoplay={false}
            style={{ width: '200%', height: '200%' }}
          />
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <div className="flex items-end gap-[2px] h-4">
              {[35, 70, 100, 55, 90].map((h, i) => (
                <div
                  key={i}
                  className="audio-bar"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: `${0.6 + i * 0.05}s`,
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Listening overlay */}
        {isListening && (
          <div className="absolute inset-0 bg-cyan-500/5 pointer-events-none">
            <div className="absolute bottom-4 left-4">
              <Mic className="w-5 h-5 text-cyan-500 animate-pulse" />
            </div>
          </div>
        )}

        {/* Thinking overlay */}
        {isThinking && (
          <div className="absolute inset-0 bg-white/30 flex items-center justify-center pointer-events-none">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Name tag */}
        <div className="absolute bottom-3 left-3 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-md shadow-sm">
          <span className="text-slate-700 text-sm font-medium">{name}</span>
        </div>
      </div>
    </div>
  );
}
