import { Camera, Check, RefreshCw, RotateCcw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../design';
import { useCameraStream } from '../../lib/useCameraStream';

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
  const capturedUrlRef = useRef<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const { videoRef, error, starting, toggleFacingMode, captureBlob } = useCameraStream({
    active: open && !capturedUrl,
    initialFacingMode: 'environment',
    unavailableHint: 'Use "Upload image" instead.',
  });

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
      clearCaptured();
    }
  }, [open, clearCaptured]);

  const handleCapture = async () => {
    const blob = await captureBlob(0.85);
    if (!blob) return;
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    capturedUrlRef.current = url;
    setCapturedBlob(blob);
    setCapturedUrl(url);
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
            {starting && !capturedUrl ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80">
                Starting camera…
              </div>
            ) : null}
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
            <Button type="button" variant="ghost" size="sm" onClick={toggleFacingMode}>
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
                <Button type="button" variant="secondary" onClick={clearCaptured}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Retake
                </Button>
                <Button type="button" onClick={handleUsePhoto}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Use photo
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={Boolean(error) || starting}
                onClick={() => void handleCapture()}
              >
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
