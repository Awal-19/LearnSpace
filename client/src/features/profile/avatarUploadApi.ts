import { API_BASE_URL, ApiError, getAccessToken, tryRefreshSession } from '../../lib/apiClient';
import type { AvatarConfig } from './avatarTypes';

export interface UploadAvatarResult {
  avatarUrl: string;
  avatarConfig: AvatarConfig | null;
}

export interface UploadAvatarOptions {
  config?: AvatarConfig;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

function sendXhrUpload(file: File, options: UploadAvatarOptions): Promise<UploadAvatarResult> {
  const { config, onProgress, signal } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, 'ABORTED', 'Upload cancelled'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/users/me/avatar`);
    xhr.setRequestHeader('Accept', 'application/json');
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    let lastPercent = -1;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const pct = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      if (pct !== lastPercent) {
        lastPercent = pct;
        onProgress(pct);
      }
    };

    const handleAbort = () => {
      xhr.abort();
      reject(new ApiError(0, 'ABORTED', 'Upload cancelled'));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
    };

    xhr.onload = () => {
      cleanup();
      let payload: unknown = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload && typeof payload === 'object') {
        onProgress?.(100);
        const body = payload as { avatarUrl: string; avatarConfig?: AvatarConfig | null };
        resolve({
          avatarUrl: body.avatarUrl,
          avatarConfig: body.avatarConfig ?? null,
        });
        return;
      }

      const envelope = (payload ?? {}) as {
        error?: { code?: string; message?: string; details?: unknown; requestId?: string };
      };
      reject(
        new ApiError(
          xhr.status,
          envelope.error?.code ?? 'UNKNOWN',
          envelope.error?.message ?? `Upload failed (${xhr.status})`,
          envelope.error?.details,
          envelope.error?.requestId,
        ),
      );
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new ApiError(0, 'ABORTED', 'Upload cancelled'));
    };

    const formData = new FormData();
    formData.append('avatar', file);
    if (config) {
      formData.append('config', JSON.stringify(config));
    }
    xhr.send(formData);
  });
}

export async function uploadAvatarFile(
  file: File,
  options: UploadAvatarOptions = {},
): Promise<UploadAvatarResult> {
  try {
    return await sendXhrUpload(file, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && err.code === 'TOKEN_EXPIRED') {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return sendXhrUpload(file, options);
      }
    }
    throw err;
  }
}
