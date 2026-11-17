import { Camera, Check, RefreshCw, RotateCcw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../design';

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export const CameraCaptureModal = memo(function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedUrlRef = useRef<string | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearCaptured = useCallback(() => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
      capturedUrlRef.current = null;
    }
    setCapturedUrl(null);
    setCapturedBlob(null);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      clearCaptured();
      return;
    }

    let cancelled = false;
    setError(null);

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setError('Camera access requires HTTPS (or localhost). Open the app over an HTTPS tunnel to use the camera.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Your browser does not support camera capture. Use "Upload image" instead.');
      return;
    }

    void (async () => {
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1600 }, height: { ideal: 1200 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
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
          setError('Camera permission was denied. Allow camera access in your browser settings and try again.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera was found on this device. Use "Upload image" instead.');
        } else {
          setError('Could not start the camera right now.');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facingMode, stopStream, clearCaptured]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        if (capturedUrlRef.current) {
          URL.revokeObjectURL(capturedUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        capturedUrlRef.current = url;
        setCapturedBlob(blob);
        setCapturedUrl(url);
      },
      'image/jpeg',
      0.85,
    );
  };

  const handleRetake = () => {
    clearCaptured();
  };

  const handleUsePhoto = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    clearCaptured();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Take a photo" className="max-w-lg">
      <div className="space-y-4 p-5 pt-3 sm:p-6 sm:pt-3">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger"
          >
            {error}
          </div>
        ) : (
          <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black sm:h-80">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={capturedUrl ? 'hidden' : 'h-full w-full object-contain'}
            />
            {capturedUrl ? (
              <img
                src={capturedUrl}
                alt="Captured preview"
                className="h-full w-full object-contain"
              />
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!capturedUrl && !error ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Switch camera
            </Button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {capturedUrl ? (
              <>
                <Button type="button" variant="secondary" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Retake
                </Button>
                <Button type="button" onClick={handleUsePhoto}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Use photo
                </Button>
              </>
            ) : (
              <Button type="button" disabled={Boolean(error)} onClick={handleCapture}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                Capture
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
});
