import { Camera, Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '../../design';
import { AvatarCreatorPanel } from './AvatarCreatorPanel';
import type { AvatarConfig } from './avatarTypes';
import { PhotoCropPanel } from './PhotoCropPanel';

export type AvatarStudioTab = 'upload' | 'create';

interface AvatarStudioModalProps {
  open: boolean;
  initialTab?: AvatarStudioTab;
  initialStartCamera?: boolean;
  initialConfig?: AvatarConfig | null;
  userName: string;
  onClose: () => void;
  onSaved: (result: { avatarUrl: string; avatarConfig: AvatarConfig | null }) => void;
}

export function AvatarStudioModal({
  open,
  initialTab = 'upload',
  initialStartCamera = false,
  initialConfig,
  userName,
  onClose,
  onSaved,
}: AvatarStudioModalProps) {
  const [tab, setTab] = useState<AvatarStudioTab>(initialTab);
  const [startCamera, setStartCamera] = useState(initialStartCamera);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setStartCamera(initialStartCamera);
    }
  }, [open, initialTab, initialStartCamera]);

  const handleSaved = (result: { avatarUrl: string; avatarConfig: AvatarConfig | null }) => {
    onSaved(result);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update profile picture"
      className="max-w-3xl rounded-2xl border-line/80 shadow-xl"
    >
      <div className="space-y-5">
        <div
          role="tablist"
          aria-label="Profile picture options"
          className="inline-flex w-full gap-1 rounded-xl border border-line bg-surface2/70 p-1 sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            onClick={() => {
              setTab('upload');
              setStartCamera(false);
            }}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-initial ${
              tab === 'upload'
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Upload a Photo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'create'}
            onClick={() => setTab('create')}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-initial ${
              tab === 'create'
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            <Palette className="h-4 w-4" aria-hidden="true" />
            {initialConfig ? 'Edit Your Avatar' : 'Create Your Avatar'}
          </button>
        </div>

        {open ? (
          tab === 'upload' ? (
            <PhotoCropPanel
              userName={userName}
              initialStartCamera={startCamera}
              onSaved={handleSaved}
              onCancel={onClose}
            />
          ) : (
            <AvatarCreatorPanel
              initialConfig={initialConfig}
              userName={userName}
              onSaved={handleSaved}
              onCancel={onClose}
            />
          )
        ) : null}
      </div>
    </Modal>
  );
}
