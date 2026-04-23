import { useEffect, useRef, useState } from 'react';

export type PermissionStatus = 'pending' | 'granted' | 'denied' | 'unavailable';

export interface MediaPermissions {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  allGranted: boolean;
}

export function useMediaPermissions(): MediaPermissions {
  const [camera, setCamera] = useState<PermissionStatus>('pending');
  const [microphone, setMicrophone] = useState<PermissionStatus>('pending');
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('unavailable');
      setMicrophone('unavailable');
      return;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setCamera('granted');
        setMicrophone('granted');
      })
      .catch((err: DOMException) => {
        if (cancelled) return;
        // Try to distinguish which device failed
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setCamera('unavailable');
          setMicrophone('unavailable');
        } else {
          // Permission denied — try individually to know which one
          navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then((s) => { s.getTracks().forEach((t) => t.stop()); if (!cancelled) setCamera('granted'); })
            .catch(() => { if (!cancelled) setCamera('denied'); });

          navigator.mediaDevices
            .getUserMedia({ video: false, audio: true })
            .then((s) => { s.getTracks().forEach((t) => t.stop()); if (!cancelled) setMicrophone('granted'); })
            .catch(() => { if (!cancelled) setMicrophone('denied'); });
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  return {
    camera,
    microphone,
    allGranted: camera === 'granted' && microphone === 'granted',
  };
}
