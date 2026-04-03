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

export function useElevenLabsSTT(lang = 'fr'): UseElevenLabsSTTReturn {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

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
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start recording:', e);
    }
  }, [isSupported]);

  const stopRecording = useCallback((): Promise<Blob> => {
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
  }, []);

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
