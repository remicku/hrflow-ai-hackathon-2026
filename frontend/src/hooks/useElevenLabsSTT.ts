import { useState, useRef, useCallback } from 'react';

const STT_URL = '/api/stt';

export interface UseElevenLabsSTTReturn {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isTranscribing: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  stopAndGetTranscript: () => Promise<string>;
  resetTranscript: () => void;
  isSupported: boolean;
}

export function useElevenLabsSTT(
  lang = 'fr',
  onSilenceDetected?: () => void,
  silenceThreshold = 0.01,
  silenceDelay = 2000,
  minDurationMs = 1000,
): UseElevenLabsSTTReturn {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);
  const onSilenceRef = useRef(onSilenceDetected);
  onSilenceRef.current = onSilenceDetected;

  const isSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const stopSilenceDetection = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const startSilenceDetection = useCallback((stream: MediaStream) => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const startTime = Date.now();
    let hasSpeaken = false;

    const check = () => {
      if (!isListeningRef.current) return;
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const elapsed = Date.now() - startTime;

      if (rms > silenceThreshold) {
        hasSpeaken = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (hasSpeaken && elapsed > minDurationMs) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            onSilenceRef.current?.();
          }, silenceDelay);
        }
      }

      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, [silenceThreshold, silenceDelay, minDurationMs]);

  const startListening = useCallback(async () => {
    if (!isSupported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      isListeningRef.current = true;
      setIsListening(true);
      startSilenceDetection(stream);
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [isSupported, startSilenceDetection]);

  const stopRecording = useCallback((): Promise<Blob> => {
    isListeningRef.current = false;
    stopSilenceDetection();
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob);
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        resolve(blob);
      };
      recorder.stop();
      setIsListening(false);
    });
  }, [stopSilenceDetection]);

  const transcribeAudio = useCallback(
    async (audioBlob: Blob): Promise<string> => {
      setIsTranscribing(true);
      try {
        const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const formData = new FormData();
        formData.append('audio', audioBlob, `audio.${ext}`);
        formData.append('lang', lang);

        const res = await fetch(STT_URL, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) return '';
        const data = await res.json();
        return data.available ? (data.text ?? '') : '';
      } catch {
        return '';
      } finally {
        setIsTranscribing(false);
      }
    },
    [lang],
  );

  const stopListening = useCallback(async () => {
    const blob = await stopRecording();
    const text = await transcribeAudio(blob);
    if (text) setTranscript((prev) => (prev + ' ' + text).trim());
  }, [stopRecording, transcribeAudio]);

  const stopAndGetTranscript = useCallback(async (): Promise<string> => {
    const blob = await stopRecording();
    const text = await transcribeAudio(blob);
    const full = text ? (transcript + ' ' + text).trim() : transcript;
    if (text) setTranscript(full);
    return full;
  }, [stopRecording, transcribeAudio, transcript]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    transcript,
    interimTranscript: '',
    isListening,
    isTranscribing,
    startListening,
    stopListening,
    stopAndGetTranscript,
    resetTranscript,
    isSupported,
  };
}
