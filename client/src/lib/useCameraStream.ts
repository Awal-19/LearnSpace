import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraFacingMode = 'user' | 'environment';

export interface UseCameraStreamOptions {
  active: boolean;
  initialFacingMode?: CameraFacingMode;
  unavailableHint?: string;
}

export function useCameraStream({
  active,
  initialFacingMode = 'environment',
  unavailableHint = 'Choose an image file instead.',
}: UseCameraStreamOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<CameraFacingMode>(initialFacingMode);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    setFacingMode(initialFacingMode);
  }, [initialFacingMode]);

  useEffect(() => {
    if (!active) {
      stopStream();
      setStarting(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setError(
        'Camera access requires HTTPS (or localhost). Open the app over an HTTPS connection to use your camera.',
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(`Your browser does not support camera capture. ${unavailableHint}`);
      return;
    }

    setStarting(true);

    void (async () => {
      stopStream();
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1600 },
              height: { ideal: 1200 },
            },
            audio: false,
          });
        } catch (firstErr) {
          if (firstErr instanceof DOMException && firstErr.name === 'OverconstrainedError') {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            throw firstErr;
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError(
            'Camera permission was denied. Allow camera access in your browser settings and try again.',
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError(`No camera was found on this device. ${unavailableHint}`);
        } else {
          setError(`Could not start the camera right now. ${unavailableHint}`);
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [active, facingMode, unavailableHint, stopStream]);

  const toggleFacingMode = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  const captureBlob = useCallback((quality = 0.92): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
  }, []);

  return {
    videoRef,
    facingMode,
    toggleFacingMode,
    starting,
    error,
    captureBlob,
    stopStream,
  };
}
