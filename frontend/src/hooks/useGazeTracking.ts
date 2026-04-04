import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { GazeSummary, GazeEvent } from '../types';

// CDN for WASM runtime and model
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Iris landmark indices (478-point model with iris refinement)
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;
// Eye corner landmarks
const LEFT_EYE_CORNER_A = 33;
const LEFT_EYE_CORNER_B = 133;
const RIGHT_EYE_CORNER_A = 362;
const RIGHT_EYE_CORNER_B = 263;

// Frames (~30fps) before confirming a state change (~200ms)
const DEBOUNCE_FRAMES = 6;
// Minimum event duration to record
const MIN_EVENT_MS = 200;
// Gaze ratio outside [0.38, 0.62] → looking away
const GAZE_LOW = 0.45;
const GAZE_HIGH = 0.55;

type Landmark = { x: number; y: number; z: number };

function gazeRatio(irisX: number, aX: number, bX: number): number {
  const lo = Math.min(aX, bX);
  const hi = Math.max(aX, bX);
  const w = hi - lo;
  if (w < 0.005) return 0.5;
  return (irisX - lo) / w;
}

function isLookingAside(landmarks: Landmark[]): boolean {
  if (landmarks.length < 478) return false;
  const left = gazeRatio(
    landmarks[LEFT_IRIS].x,
    landmarks[LEFT_EYE_CORNER_A].x,
    landmarks[LEFT_EYE_CORNER_B].x,
  );
  const right = gazeRatio(
    landmarks[RIGHT_IRIS].x,
    landmarks[RIGHT_EYE_CORNER_A].x,
    landmarks[RIGHT_EYE_CORNER_B].x,
  );
  const avg = (left + right) / 2;
  return avg < GAZE_LOW || avg > GAZE_HIGH;
}

export function useGazeTracking(
  videoRef: React.RefObject<HTMLVideoElement>,
  questionIndex: number,
) {
  const [isLookingAway, setIsLookingAway] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const eventsRef = useRef<GazeEvent[]>([]);
  const rafRef = useRef<number>(0);
  const isAwayRef = useRef(false);
  const awayStartRef = useRef<number | null>(null);
  const awayReasonRef = useRef<'look_away' | 'no_face'>('look_away');
  const questionIndexRef = useRef(questionIndex);
  questionIndexRef.current = questionIndex;

  useEffect(() => {
    let cancelled = false;
    let landmarker: FaceLandmarker | null = null;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        if (cancelled) { landmarker.close(); return; }

        setIsReady(true);

        let lastVideoTime = -1;
        let awayFrames = 0;
        let presentFrames = 0;

        function frame() {
          if (cancelled || !landmarker) return;
          const video = videoRef.current;

          if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              const faces = result.faceLandmarks;

              let lookingAway: boolean;
              let reason: 'look_away' | 'no_face';

              if (faces.length === 0) {
                lookingAway = true;
                reason = 'no_face';
              } else {
                lookingAway = isLookingAside(faces[0]);
                reason = 'look_away';
              }

              if (lookingAway) {
                awayFrames++;
                presentFrames = 0;
                if (awayFrames >= DEBOUNCE_FRAMES && !isAwayRef.current) {
                  isAwayRef.current = true;
                  setIsLookingAway(true);
                  awayStartRef.current = performance.now() - DEBOUNCE_FRAMES * 33;
                  awayReasonRef.current = reason;
                }
              } else {
                presentFrames++;
                awayFrames = 0;
                if (presentFrames >= DEBOUNCE_FRAMES && isAwayRef.current) {
                  isAwayRef.current = false;
                  setIsLookingAway(false);
                  if (awayStartRef.current !== null) {
                    const duration = Math.round(performance.now() - awayStartRef.current);
                    if (duration >= MIN_EVENT_MS) {
                      eventsRef.current.push({
                        timestamp: awayStartRef.current,
                        duration_ms: duration,
                        question_index: questionIndexRef.current,
                        reason: awayReasonRef.current,
                      });
                    }
                    awayStartRef.current = null;
                  }
                }
              }
            } catch {
              // Ignore per-frame errors
            }
          }
          rafRef.current = requestAnimationFrame(frame);
        }

        rafRef.current = requestAnimationFrame(frame);
      } catch (e) {
        console.warn('GazeTracking: MediaPipe init failed', e);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarker?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getSummary = useCallback((): GazeSummary => {
    const events = [...eventsRef.current];
    // Flush any ongoing event
    if (isAwayRef.current && awayStartRef.current !== null) {
      const duration = Math.round(performance.now() - awayStartRef.current);
      if (duration >= MIN_EVENT_MS) {
        events.push({
          timestamp: awayStartRef.current,
          duration_ms: duration,
          question_index: questionIndexRef.current,
          reason: awayReasonRef.current,
        });
      }
    }
    return {
      events,
      total_look_away_ms: events.reduce((sum, e) => sum + e.duration_ms, 0),
      look_away_count: events.length,
    };
  }, []);

  return { isLookingAway, isReady, getSummary };
}
