import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button, Modal, useToast } from '../../design';
import { acceptCommunityRules } from './communityApi';

export function CommunityRulesModal({
  open,
  onAccepted,
  onClose,
}: {
  open: boolean;
  onAccepted: () => void;
  onClose?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    setBusy(true);
    try {
      await acceptCommunityRules();
      toast.show({ kind: 'success', title: 'Welcome to the LearnSpace Community!' });
      onAccepted();
    } catch {
      toast.show({ kind: 'error', title: 'Could not save acceptance. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose ?? (() => {})} title="Community Rules">
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-xl bg-primary-500/10 p-3 text-xs text-fg">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-500" aria-hidden="true" />
          <p>
            LearnSpace Community is a safe, supportive space to learn together with your classmates.
            Please agree to these rules before posting:
          </p>
        </div>

        <ul className="space-y-2 text-xs text-fg/90">
          <li className="rounded-lg bg-surface2/60 px-3 py-2">
            <strong>1. Be respectful:</strong> No harassment, hate speech, or personal attacks.
          </li>
          <li className="rounded-lg bg-surface2/60 px-3 py-2">
            <strong>2. Academic integrity:</strong> No cheating or sharing live exam answers.
          </li>
          <li className="rounded-lg bg-surface2/60 px-3 py-2">
            <strong>3. Protect privacy:</strong> Never share private personal info (phone numbers,
            addresses, or emails).
          </li>
          <li className="rounded-lg bg-surface2/60 px-3 py-2">
            <strong>4. Share legally &amp; no spam:</strong> Only share study material you have the
            right to share, and avoid spam or piracy links.
          </li>
        </ul>

        <div className="flex justify-end gap-2 pt-2">
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Read only
            </Button>
          ) : null}
          <Button type="button" size="sm" loading={busy} onClick={() => void handleAccept()}>
            I agree &amp; continue
          </Button>
        </div>
      </div>
    </Modal>
  );
}
