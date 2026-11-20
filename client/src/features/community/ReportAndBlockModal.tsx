import { Flag, ShieldBan } from 'lucide-react';
import { useState } from 'react';
import { Button, Modal, Textarea, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { blockCommunityUser, reportCommunityContent } from './communityApi';

export function ReportModal({
  target,
  onClose,
}: {
  target: {
    type: 'post' | 'reply' | 'message' | 'resource' | 'user';
    id: string;
    label?: string;
  } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || reason.trim().length < 5) {
      toast.show({
        kind: 'error',
        title: 'Please enter at least 5 characters explaining the issue.',
      });
      return;
    }
    setBusy(true);
    try {
      await reportCommunityContent({
        targetType: target.type,
        targetId: target.id,
        reason: reason.trim(),
      });
      toast.show({ kind: 'success', title: 'Report submitted to moderators' });
      setReason('');
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not submit report',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Report content">
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <p className="text-xs text-muted">
          Tell moderators what is wrong{target?.label ? ` with "${target.label}"` : ''}. Reports are
          reviewed confidentially.
        </p>
        <Textarea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Harassment, exam cheating, spam, broken/pirated link, or copyright issue..."
          required
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={busy}>
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Submit report
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function BlockUserModal({
  user,
  onClose,
  onBlocked,
}: {
  user: { id: string; name: string } | null;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleBlock = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await blockCommunityUser(user.id);
      toast.show({ kind: 'success', title: `Blocked ${user.name}` });
      onBlocked?.();
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not block user',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(user)} onClose={onClose} title={`Block ${user?.name ?? 'user'}?`}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-muted">
          Blocking hides their posts, replies, and messages from you, and prevents them from
          replying to you.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            loading={busy}
            onClick={() => void handleBlock()}
          >
            <ShieldBan className="h-3.5 w-3.5" aria-hidden="true" />
            Block user
          </Button>
        </div>
      </div>
    </Modal>
  );
}
