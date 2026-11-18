const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

let workerInstance: Worker | null = null;
let workerJobId = 0;

function getImagePrepWorker(): Worker | null {
  if (
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined'
  ) {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./imagePrep.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
  }
  return workerInstance;
}

function toJpegFile(blob: Blob, originalName: string): File {
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

async function prepareOnMainThread(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) return file;

    return toJpegFile(blob, file.name);
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

/**
 * Resizes and compresses an image off the main thread via a Web Worker when
 * supported (falling back to main-thread canvas), preserving EXIF orientation.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const worker = getImagePrepWorker();
  if (!worker) {
    return prepareOnMainThread(file);
  }

  const jobId = ++workerJobId;
  const workerBlob = await new Promise<Blob | null>((resolve) => {
    const handleMessage = (event: MessageEvent<{ id: number; blob?: Blob; failed?: boolean }>) => {
      if (event.data.id !== jobId) return;
      cleanup();
      resolve(event.data.failed || !event.data.blob ? null : event.data.blob);
    };
    const handleError = () => {
      cleanup();
      resolve(null);
    };
    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ id: jobId, file });
  });

  if (workerBlob) {
    return toJpegFile(workerBlob, file.name);
  }
  return prepareOnMainThread(file);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
