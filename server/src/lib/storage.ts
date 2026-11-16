import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import type { Logger } from 'pino';
import type { Env } from '../config/env';
import { AppError } from './errors';

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Inspects file magic bytes instead of trusting Content-Type or filename extension.
 * Returns null if the buffer is not a valid JPEG, PNG, or WebP image.
 */
export function detectImageMime(buffer: Buffer): AllowedImageMime | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export interface UploadedAvatar {
  url: string;
  publicId: string;
}

export interface UploadedAttachment {
  storageKey: string;
  storageUrl: string;
}

export interface StorageService {
  isConfigured(): boolean;
  uploadAvatar(buffer: Buffer, userId: string): Promise<UploadedAvatar>;
  deleteAvatar(publicId: string): Promise<void>;
  uploadAttachment(
    buffer: Buffer,
    userId: string,
    kind: 'image' | 'document',
    extension: string,
  ): Promise<UploadedAttachment>;
  getSignedAttachmentUrl(storageKey: string, kind: 'image' | 'document'): string | null;
  readAttachmentBytes(storageKey: string, storageUrl: string, kind: 'image' | 'document'): Promise<Buffer>;
  deleteAttachment(storageKey: string, kind: 'image' | 'document'): Promise<void>;
}

const DEV_DIR = path.join(os.tmpdir(), 'learnspace-dev-attachments');

/**
 * Creates a Cloudinary-backed storage service.
 * In NODE_ENV=development only, if CLOUDINARY_URL is unset, chat attachments fall back
 * to a private temp directory served through authenticated API routes (never in production).
 */
export function createStorageService(env: Env, logger: Logger): StorageService {
  const configured = Boolean(env.CLOUDINARY_URL);
  const allowDevLocal = env.NODE_ENV === 'development' && !configured;

  if (configured && env.CLOUDINARY_URL) {
    try {
      const parsed = new URL(env.CLOUDINARY_URL);
      cloudinary.config({
        cloud_name: parsed.hostname,
        api_key: decodeURIComponent(parsed.username),
        api_secret: decodeURIComponent(parsed.password),
        secure: true,
      });
    } catch (err) {
      logger.warn({ err }, 'Invalid CLOUDINARY_URL format; cloud storage will be unavailable');
    }
  }

  const cloudinarySignedUrl = (storageKey: string, kind: 'image' | 'document'): string => {
    const resourceType = kind === 'image' ? 'image' : 'raw';
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    return cloudinary.url(storageKey, {
      resource_type: resourceType,
      type: 'authenticated',
      sign_url: true,
      secure: true,
      expires_at: expiresAt,
    });
  };

  return {
    isConfigured: () => configured || allowDevLocal,

    async uploadAvatar(buffer, userId) {
      if (!configured) {
        throw new AppError('STORAGE_UNAVAILABLE', 'Avatar storage is not configured');
      }

      const publicId = `learnspace/avatars/${userId}-${Date.now()}`;
      return new Promise<UploadedAvatar>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            overwrite: true,
            resource_type: 'image',
            transformation: [
              { width: 256, height: 256, crop: 'fill', gravity: 'face' },
              { fetch_format: 'webp', quality: 'auto' },
            ],
          },
          (error, result) => {
            if (error || !result?.secure_url) {
              logger.error({ err: error }, 'Cloudinary avatar upload failed');
              reject(new AppError('STORAGE_UNAVAILABLE', 'Could not upload avatar right now'));
              return;
            }
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        );
        stream.end(buffer);
      });
    },

    async deleteAvatar(publicId) {
      if (!configured || !publicId) return;
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      } catch (err) {
        logger.warn({ err, publicId }, 'Failed to delete avatar from Cloudinary');
      }
    },

    async uploadAttachment(buffer, userId, kind, extension) {
      const randomName = `${randomUUID()}${extension ? `.${extension}` : ''}`;

      if (configured) {
        const resourceType = kind === 'image' ? 'image' : 'raw';
        const publicId = `learnspace/attachments/${userId}/${randomName}`;
        return new Promise<UploadedAttachment>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              public_id: publicId,
              resource_type: resourceType,
              type: 'authenticated',
              overwrite: false,
            },
            (error, result) => {
              if (error || !result?.secure_url) {
                logger.error({ err: error }, 'Cloudinary attachment upload failed');
                reject(new AppError('STORAGE_UNAVAILABLE', 'Could not store attachment right now'));
                return;
              }
              resolve({ storageKey: result.public_id, storageUrl: result.secure_url });
            },
          );
          stream.end(buffer);
        });
      }

      if (allowDevLocal) {
        const userDir = path.join(DEV_DIR, userId);
        await fs.mkdir(userDir, { recursive: true });
        const storageKey = `local:${userId}/${randomName}`;
        await fs.writeFile(path.join(userDir, randomName), buffer);
        return { storageKey, storageUrl: storageKey };
      }

      throw new AppError('STORAGE_UNAVAILABLE', 'Object storage (CLOUDINARY_URL) is not configured');
    },

    getSignedAttachmentUrl(storageKey, kind) {
      if (!configured || storageKey.startsWith('local:')) return null;
      return cloudinarySignedUrl(storageKey, kind);
    },

    async readAttachmentBytes(storageKey, storageUrl, kind) {
      if (storageKey.startsWith('local:')) {
        const rel = storageKey.slice('local:'.length);
        const fullPath = path.resolve(DEV_DIR, rel);
        if (!fullPath.startsWith(path.resolve(DEV_DIR))) {
          throw new AppError('NOT_FOUND', 'Attachment not found');
        }
        return fs.readFile(fullPath);
      }

      if (!configured) {
        throw new AppError('STORAGE_UNAVAILABLE', 'Attachment storage is not configured');
      }

      const signed = cloudinarySignedUrl(storageKey, kind) || storageUrl;
      const res = await fetch(signed);
      if (!res.ok) {
        throw new AppError('STORAGE_UNAVAILABLE', 'Could not fetch attachment from storage');
      }
      return Buffer.from(await res.arrayBuffer());
    },

    async deleteAttachment(storageKey, kind) {
      if (!storageKey) return;
      if (storageKey.startsWith('local:')) {
        const rel = storageKey.slice('local:'.length);
        const fullPath = path.resolve(DEV_DIR, rel);
        if (fullPath.startsWith(path.resolve(DEV_DIR))) {
          await fs.unlink(fullPath).catch(() => undefined);
        }
        return;
      }

      if (!configured) return;
      try {
        await cloudinary.uploader.destroy(storageKey, {
          resource_type: kind === 'image' ? 'image' : 'raw',
          type: 'authenticated',
        });
      } catch (err) {
        logger.warn({ err, storageKey }, 'Failed to delete attachment from Cloudinary');
      }
    },
  };
}
