import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/apiClient';

interface AuthenticatedCardImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Fetches card images using the in-memory Bearer token so protected local disk or
 * authenticated Cloudinary assets render seamlessly without exposing raw storage keys.
 */
export function AuthenticatedCardImage({ src, alt, className }: AuthenticatedCardImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    const controller = new AbortController();
    setFailed(false);

    async function load() {
      try {
        const token = getAccessToken();
        const res = await fetch(src, {
          credentials: 'include',
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('Image load failed');
        const blob = await res.blob();
        if (!active) return;
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setFailed(true);
        }
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
      if (createdUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  if (failed || !objectUrl) return null;

  return <img src={objectUrl} alt={alt} className={className} loading="lazy" />;
}
