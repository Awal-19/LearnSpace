import { Camera, Palette, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Avatar, Button, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { AvatarStudioModal, type AvatarStudioTab } from './AvatarStudioModal';
import type { AvatarConfig } from './avatarTypes';

export function AvatarUploader() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<AvatarStudioTab>('upload');
  const [startCamera, setStartCamera] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!user) return null;

  const hasCustomAvatar = Boolean(user.avatarConfig);

  const openModal = (tab: AvatarStudioTab, withCamera = false) => {
    setInitialTab(tab);
    setStartCamera(withCamera);
    setModalOpen(true);
  };

  const handleSaved = (result: { avatarUrl: string; avatarConfig: AvatarConfig | null }) => {
    updateUser({
      ...user,
      avatarUrl: result.avatarUrl,
      avatarConfig: result.avatarConfig,
    });
    toast.show({
      kind: 'success',
      title: result.avatarConfig ? 'Avatar saved' : 'Profile photo updated',
    });
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await request<void>('/users/me/avatar', { method: 'DELETE' });
      updateUser({ ...user, avatarUrl: null, avatarConfig: null });
      toast.show({ kind: 'success', title: 'Avatar removed' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not remove your avatar.';
      toast.show({ kind: 'error', title: 'Error', description: message });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => openModal(hasCustomAvatar ? 'create' : 'upload', false)}
        aria-label="Change profile picture"
        className="group relative rounded-full p-0.5 ring-2 ring-primary-200/80 transition hover:ring-primary-500 focus-visible:outline-none focus-visible:ring-primary-600 dark:ring-primary-500/30"
      >
        <Avatar name={user.name} src={user.avatarUrl} size="lg" />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Camera className="h-5 w-5" />
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={removing}
          onClick={() => openModal('upload', false)}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {user.avatarUrl && !hasCustomAvatar ? 'Change photo' : 'Upload photo'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={removing}
          onClick={() => openModal('upload', true)}
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          Take photo
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={removing}
          onClick={() => openModal('create', false)}
        >
          <Palette className="h-4 w-4" aria-hidden="true" />
          {hasCustomAvatar ? 'Edit avatar' : 'Create avatar'}
        </Button>

        {user.avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={removing}
            onClick={() => void handleRemove()}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>

      <AvatarStudioModal
        open={modalOpen}
        initialTab={initialTab}
        initialStartCamera={startCamera}
        initialConfig={user.avatarConfig}
        userName={user.name}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
