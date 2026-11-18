import {
  Camera,
  ImagePlus,
  Move,
  RefreshCw,
  RotateCcw,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { Button, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { useCameraStream } from '../../lib/useCameraStream';
import { clampCropOffsets, computeCoverScale, exportCroppedPhotoFile } from './avatarExport';
import { uploadAvatarFile } from './avatarUploadApi';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PICK_BYTES = 12 * 1024 * 1024;
const VIEWPORT_SIZE = 248;
const PREVIEW_SIZE = 84;
const MINI_PREVIEW_SIZE = 36;

interface PhotoCropPanelProps {
  userName: string;
  initialStartCamera?: boolean;
  onSaved: (result: { avatarUrl: string; avatarConfig: null }) => void;
  onCancel: () => void;
}

export function PhotoCropPanel({
  userName,
  initialStartCamera = false,
  onSaved,
  onCancel,
}: PhotoCropPanelProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [cameraOpen, setCameraOpen] = useState(initialStartCamera);
  const [fromCamera, setFromCamera] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const {
    videoRef,
    starting: cameraStarting,
    error: cameraError,
    toggleFacingMode,
    captureBlob,
  } = useCameraStream({
    active: cameraOpen && !busy,
    initialFacingMode: 'user',
    unavailableHint: 'You can still upload a photo from your device.',
  });

  useEffect(() => {
    setCameraOpen(initialStartCamera);
  }, [initialStartCamera]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const loadSelectedFile = (file: File | undefined, capturedFromCam = false) => {
    if (!file) return;
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const validType =
      ALLOWED_TYPES.has(file.type) ||
      (file.type === '' && ['jpg', 'jpeg', 'png', 'webp'].includes(ext));

    if (!validType) {
      const msg = 'Please select a JPG, JPEG, PNG, or WEBP image.';
      setError(msg);
      toast.show({ kind: 'error', title: 'Unsupported file type', description: msg });
      return;
    }

    if (file.size > MAX_PICK_BYTES) {
      const msg = 'Please pick an image smaller than 12 MB.';
      setError(msg);
      toast.show({ kind: 'error', title: 'File too large', description: msg });
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setNaturalSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFromCamera(capturedFromCam);
    setCameraOpen(false);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextUrl;
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    loadSelectedFile(e.target.files?.[0], false);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    loadSelectedFile(e.dataTransfer.files?.[0], false);
  };

  const handleCapturePhoto = async () => {
    const blob = await captureBlob(0.92);
    if (!blob) return;
    const file = new File([blob], `camera-avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
    loadSelectedFile(file, true);
  };

  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const updateZoom = (nextZoomRaw: number) => {
    const nextZoom = Math.max(1, Math.min(3, Number(nextZoomRaw.toFixed(2))));
    setZoom(nextZoom);
    if (naturalSize) {
      const clamped = clampCropOffsets(
        naturalSize.w,
        naturalSize.h,
        VIEWPORT_SIZE,
        nextZoom,
        offset.x,
        offset.y,
      );
      setOffset({ x: clamped.offsetX, y: clamped.offsetY });
    }
  };

  const applyPanDelta = (dx: number, dy: number, baseX = offset.x, baseY = offset.y) => {
    if (!naturalSize) return;
    const clamped = clampCropOffsets(
      naturalSize.w,
      naturalSize.h,
      VIEWPORT_SIZE,
      zoom,
      baseX + dx,
      baseY + dy,
    );
    setOffset({ x: clamped.offsetX, y: clamped.offsetY });
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!naturalSize || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: offset.x,
      startY: offset.y,
    };
    setIsPanning(true);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    applyPanDelta(
      e.clientX - start.pointerX,
      e.clientY - start.pointerY,
      start.startX,
      start.startY,
    );
  };

  const handlePointerUp = () => {
    dragStartRef.current = null;
    setIsPanning(false);
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!naturalSize || busy) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    updateZoom(zoom + delta);
  };

  const handleCropKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!naturalSize || busy) return;
    const step = 10;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      applyPanDelta(-step, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      applyPanDelta(step, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      applyPanDelta(0, -step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      applyPanDelta(0, step);
    }
  };

  const handleSave = async () => {
    if (!imgRef.current || !naturalSize) return;
    setBusy(true);
    setError(null);
    setProgress(5);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const croppedFile = await exportCroppedPhotoFile(imgRef.current, {
        viewportSize: VIEWPORT_SIZE,
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
      });

      if (croppedFile.size > 5 * 1024 * 1024) {
        throw new Error('Cropped image exceeds the 5 MB limit.');
      }

      const result = await uploadAvatarFile(croppedFile, {
        onProgress: (pct) => setProgress(Math.max(10, pct)),
        signal: controller.signal,
      });

      onSaved({ avatarUrl: result.avatarUrl, avatarConfig: null });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      const msg = err instanceof Error ? err.message : 'Could not upload your photo right now.';
      setError(msg);
      toast.show({ kind: 'error', title: 'Upload failed', description: msg });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const baseScale = naturalSize
    ? computeCoverScale(naturalSize.w, naturalSize.h, VIEWPORT_SIZE)
    : 1;
  const imgWidth = naturalSize ? naturalSize.w * baseScale * zoom : VIEWPORT_SIZE;
  const imgHeight = naturalSize ? naturalSize.h * baseScale * zoom : VIEWPORT_SIZE;

  const renderScaledPreview = (size: number) => {
    const ratio = size / VIEWPORT_SIZE;
    return (
      <div
        className="relative overflow-hidden rounded-full border border-line bg-slate-100 dark:bg-surface2"
        style={{ width: size, height: size }}
      >
        {objectUrl && naturalSize ? (
          <img
            src={objectUrl}
            alt="Circular crop preview"
            draggable={false}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: imgWidth * ratio,
              height: imgHeight * ratio,
              maxWidth: 'none',
              maxHeight: 'none',
              transform: `translate(calc(-50% + ${offset.x * ratio}px), calc(-50% + ${offset.y * ratio}px))`,
            }}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choose profile photo"
        onChange={handleFileChange}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger"
        >
          {error}
        </div>
      ) : null}

      {cameraOpen ? (
        <div className="space-y-4">
          {cameraError ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger space-y-3"
            >
              <p>{cameraError}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Choose photo from device
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCameraOpen(false)}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-line bg-slate-950 shadow-inner sm:h-80">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {/* Subtle circular framing guide */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="h-52 w-52 rounded-full border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.38)] sm:h-60 sm:w-60" />
              </div>
              {cameraStarting ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60 text-xs font-medium text-white">
                  Starting camera…
                </div>
              ) : null}
            </div>
          )}

          {!cameraError ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={toggleFacingMode}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Switch camera
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCameraOpen(false)}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload file instead
                </Button>
              </div>
              <Button
                type="button"
                variant="primary"
                disabled={cameraStarting}
                onClick={() => void handleCapturePhoto()}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Capture photo
              </Button>
            </div>
          ) : null}
        </div>
      ) : !objectUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            isDraggingOver
              ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-500/10'
              : 'border-line bg-primary-50/30 hover:border-primary-300 dark:bg-surface2/50'
          }`}
        >
          <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100/80 text-primary-600 shadow-sm dark:bg-primary-500/20 dark:text-primary-400">
            <ImagePlus className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-fg">
            Drop a photo here, choose a file, or take one with your camera
          </p>
          <p className="mt-1 text-xs text-muted">Supports JPG, JPEG, PNG, and WEBP up to 12 MB</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="rounded-full px-5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Choose photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="rounded-full px-5"
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Take photo
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          {/* Interactive Circular Crop Canvas */}
          <div className="flex flex-col items-center gap-2.5">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Crop and reposition profile selection. Drag or use arrow keys to move."
              aria-valuemin={100}
              aria-valuemax={300}
              aria-valuenow={Math.round(zoom * 100)}
              aria-valuetext={`${Math.round(zoom * 100)}% zoom, horizontal ${Math.round(offset.x)}px, vertical ${Math.round(offset.y)}px`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              onKeyDown={handleCropKeyDown}
              className={`relative select-none overflow-hidden rounded-2xl border border-line bg-slate-900 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-primary-500 touch-none ${
                isPanning ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            >
              <img
                ref={imgRef}
                src={objectUrl}
                alt="Crop target"
                draggable={false}
                onLoad={handleImageLoad}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: imgWidth,
                  height: imgHeight,
                  maxWidth: 'none',
                  maxHeight: 'none',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
              {/* Circular Cutout Overlay */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/95 shadow-[0_0_0_9999px_rgba(15,23,42,0.52)]"
              />
            </div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
              <Move
                className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              Drag to reposition · Scroll or slide to zoom
            </p>
          </div>

          {/* Right Controls & Live Preview */}
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-line/80 bg-primary-50/40 p-3.5 dark:bg-surface2/60">
              {renderScaledPreview(PREVIEW_SIZE)}
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Live Circular Preview
                  </p>
                  <p className="text-xs text-muted">
                    Shown across your profile, sidebar, navbar, and chats.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 shadow-sm">
                  {renderScaledPreview(MINI_PREVIEW_SIZE)}
                  <span className="max-w-[140px] truncate text-xs font-medium text-fg">
                    {userName}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-fg">
                <label htmlFor="avatar-zoom-slider">Zoom</label>
                <span className="tabular-nums text-primary-600 dark:text-primary-400">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Zoom out"
                  disabled={busy || zoom <= 1}
                  onClick={() => updateZoom(zoom - 0.15)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:border-primary-300 hover:text-primary-600 disabled:opacity-40"
                >
                  <ZoomOut className="h-4 w-4" aria-hidden="true" />
                </button>
                <input
                  id="avatar-zoom-slider"
                  type="range"
                  min={1}
                  max={3}
                  step={0.02}
                  value={zoom}
                  disabled={busy}
                  onChange={(e) => updateZoom(Number(e.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-primary-600"
                />
                <button
                  type="button"
                  aria-label="Zoom in"
                  disabled={busy || zoom >= 3}
                  onClick={() => updateZoom(zoom + 0.15)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:border-primary-300 hover:text-primary-600 disabled:opacity-40"
                >
                  <ZoomIn className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                Replace image
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                {fromCamera ? 'Retake photo' : 'Use camera'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset crop
              </Button>
            </div>
          </div>
        </div>
      )}

      {busy ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>Uploading photo…</span>
            <span className="tabular-nums text-primary-600 dark:text-primary-400">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface2"
          >
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        {!cameraOpen ? (
          <Button
            type="button"
            variant="primary"
            loading={busy}
            disabled={!objectUrl || !naturalSize}
            onClick={() => void handleSave()}
          >
            Save photo
          </Button>
        ) : null}
      </div>
    </div>
  );
}
