import { useEffect, useRef } from 'react';

interface WebcamProps {
  videoRef?: React.RefObject<HTMLVideoElement>;
  isLookingAway?: boolean;
}

export default function Webcam({ videoRef: externalRef, isLookingAway }: WebcamProps) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? internalRef;

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(() => {
        // Camera not available — silently ignore
      });
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      {isLookingAway && (
        <div className="absolute inset-0 border-2 border-amber-400 rounded-xl pointer-events-none">
          <div className="absolute top-2 right-10 bg-amber-400 text-amber-900 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Regardez la caméra
          </div>
        </div>
      )}
    </>
  );
}
