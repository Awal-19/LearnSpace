const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

interface WorkerRequest {
  id: number;
  file: File;
}

interface WorkerResponse {
  id: number;
  blob?: Blob;
  failed?: boolean;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file } = event.data;
  let bitmap: ImageBitmap | null = null;
  try {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      self.postMessage({ id, failed: true } satisfies WorkerResponse);
      return;
    }
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      self.postMessage({ id, failed: true } satisfies WorkerResponse);
      return;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    self.postMessage({ id, blob } satisfies WorkerResponse);
  } catch {
    self.postMessage({ id, failed: true } satisfies WorkerResponse);
  } finally {
    bitmap?.close();
  }
};
