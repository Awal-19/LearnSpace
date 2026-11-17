import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, PasswordInput, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { acceptAdminInvite } from '../admin/adminApi';

export function AcceptAdminInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') ?? '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Missing invite token.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await acceptAdminInvite({
        token,
        ...(name.trim() ? { name: name.trim() } : {}),
        password,
      });
      toast.show({
        kind: 'success',
        title: 'Admin account activated',
        description: `Signed up as ${res.role}. You can now log in.`,
      });
      navigate('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <Card className="w-full max-w-md p-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10 text-primary-600">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-center font-display text-xl font-semibold">
          Accept Admin Invitation
        </h1>
        <p className="mt-1 text-center text-sm text-muted">
          Set your password to activate your LearnSpace administrator account.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Input
            label="Full name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
          <PasswordInput
            label="Choose a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            error={error ?? undefined}
          />
          <div className="flex items-center justify-between">
            <Link to="/login" className="text-xs text-muted hover:text-fg">
              Back to login
            </Link>
            <Button type="submit" loading={busy}>
              Activate Account
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

