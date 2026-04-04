import { useEffect, useRef } from 'react';

interface WebcamProps {
  videoRef?: React.RefObject<HTMLVideoElement>;
}

// Hidden camera stream — keeps the video feed active for gaze tracking
// without showing anything to the candidate.
export default function Webcam({ videoRef: externalRef }: WebcamProps) {
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

  // Rendered off-screen so MediaPipe can read frames (display:none blocks pixel access)
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{ position: 'fixed', left: -9999, top: 0, width: 1, height: 1 }}
    />
  );
}
