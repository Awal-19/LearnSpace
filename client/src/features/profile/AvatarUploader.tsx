import { useRef, useState, type ChangeEvent } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { Avatar, Button, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function AvatarUploader() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.show({
        kind: 'error',
        title: 'Unsupported image format',
        description: 'Please choose a JPEG, PNG, or WebP image.',
      });
      return;
    }

    if (file.size > MAX_BYTES) {
      toast.show({
        kind: 'error',
        title: 'File too large',
        description: 'Avatars must be 2 MB or smaller.',
      });
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const result = await request<{ avatarUrl: string }>('/users/me/avatar', {
        method: 'POST',
        body: formData,
      });
      updateUser({ ...user, avatarUrl: result.avatarUrl });
      toast.show({ kind: 'success', title: 'Avatar updated' });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not upload your avatar right now.';
      toast.show({ kind: 'error', title: 'Upload failed', description: message });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await request<void>('/users/me/avatar', { method: 'DELETE' });
      updateUser({ ...user, avatarUrl: null });
      toast.show({ kind: 'success', title: 'Avatar removed' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not remove your avatar.';
      toast.show({ kind: 'error', title: 'Error', description: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar name={user.name} src={user.avatarUrl} size="lg" />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Upload avatar image"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          {user.avatarUrl ? 'Change photo' : 'Upload photo'}
        </Button>
        {user.avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

