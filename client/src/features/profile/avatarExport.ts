import type { AvatarConfig } from './avatarTypes';

const EXPORT_SIZE = 512;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

async function encodeCanvasToAvatarFile(
  canvas: HTMLCanvasElement,
  baseName: string,
): Promise<File> {
  const webp = await canvasToBlob(canvas, 'image/webp', 0.92);
  if (webp && webp.type === 'image/webp' && webp.size > 0) {
    return new File([webp], `${baseName}.webp`, { type: 'image/webp' });
  }
  const png = await canvasToBlob(canvas, 'image/png');
  if (!png || png.size === 0) {
    throw new Error('Could not encode avatar image.');
  }
  return new File([png], `${baseName}.png`, { type: 'image/png' });
}

export interface CropFraming {
  /** Zoom multiplier >= 1 relative to the fit-cover base scale. */
  zoom: number;
  /** Pan offset normalized around the cropped square in viewport pixels. */
  offsetX: number;
  offsetY: number;
  /** Width/height of the square interactive viewport in CSS pixels. */
  viewportSize: number;
}

/**
 * Computes the base scale so an image completely covers a square viewport of `viewportSize`.
 */
export function computeCoverScale(
  naturalWidth: number,
  naturalHeight: number,
  viewportSize: number,
): number {
  if (naturalWidth <= 0 || naturalHeight <= 0) return 1;
  return Math.max(viewportSize / naturalWidth, viewportSize / naturalHeight);
}

/**
 * Clamps pan offsets so the scaled image always covers the circular crop area without gaps.
 */
export function clampCropOffsets(
  naturalWidth: number,
  naturalHeight: number,
  viewportSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { offsetX: number; offsetY: number } {
  const scale = computeCoverScale(naturalWidth, naturalHeight, viewportSize) * zoom;
  const renderedW = naturalWidth * scale;
  const renderedH = naturalHeight * scale;
  const maxX = Math.max(0, (renderedW - viewportSize) / 2);
  const maxY = Math.max(0, (renderedH - viewportSize) / 2);
  return {
    offsetX: Math.max(-maxX, Math.min(maxX, offsetX)),
    offsetY: Math.max(-maxY, Math.min(maxY, offsetY)),
  };
}

/**
 * Renders the currently framed circular photo crop at 512x512 WebP/PNG.
 */
export async function exportCroppedPhotoFile(
  image: HTMLImageElement,
  framing: CropFraming,
): Promise<File> {
  const { naturalWidth, naturalHeight } = image;
  if (!naturalWidth || !naturalHeight) {
    throw new Error('Image has not finished loading.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');

  const { viewportSize, zoom } = framing;
  const clamped = clampCropOffsets(
    naturalWidth,
    naturalHeight,
    viewportSize,
    zoom,
    framing.offsetX,
    framing.offsetY,
  );
  const scale = computeCoverScale(naturalWidth, naturalHeight, viewportSize) * zoom;
  const ratio = EXPORT_SIZE / viewportSize;

  const drawW = naturalWidth * scale * ratio;
  const drawH = naturalHeight * scale * ratio;
  const drawX = EXPORT_SIZE / 2 - drawW / 2 + clamped.offsetX * ratio;
  const drawY = EXPORT_SIZE / 2 - drawH / 2 + clamped.offsetY * ratio;

  ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  ctx.drawImage(image, drawX, drawY, drawW, drawH);

  return encodeCanvasToAvatarFile(canvas, 'profile-photo');
}

/**
 * Serializes the live SVG illustration element onto a 512x512 raster WebP/PNG file
 * for persistent upload alongside the AvatarConfig JSON.
 */
export async function exportAvatarSvgFile(
  svgElement: SVGSVGElement,
  _config: AvatarConfig,
): Promise<File> {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(EXPORT_SIZE));
  clone.setAttribute('height', String(EXPORT_SIZE));

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not render avatar illustration.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');
    ctx.drawImage(img, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

    return await encodeCanvasToAvatarFile(canvas, 'custom-avatar');
  } finally {
    URL.revokeObjectURL(url);
  }
}
