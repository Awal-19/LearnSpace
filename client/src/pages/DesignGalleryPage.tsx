import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../app/ThemeProvider';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  Spinner,
  Textarea,
  useToast,
} from '../design';
import { ApiError, request } from '../lib/apiClient';

/** Dev-only design system gallery (route is not compiled into production builds). */
export default function DesignGalleryPage() {
  const toast = useToast();
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const health = useQuery({
    queryKey: ['health-ready'],
    queryFn: () => request<{ status: string }>('/health/ready', { auth: false }),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Design system</h1>
        <div className="flex gap-2">
          <Link className="text-sm text-primary-600 underline dark:text-primary-400" to="/dev/shell">
            Preview layout shell
          </Link>
        </div>
      </header>

      <Card>
        <h2 className="mb-3 text-lg">API connection</h2>
        {health.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner label="Checking" /> Checking /api/v1/health/ready
          </p>
        )}
        {health.isSuccess && <Badge tone="success">API and database reachable</Badge>}
        {health.isError && (
          <ErrorState
            title="API not reachable"
            message={
              health.error instanceof ApiError
                ? `${health.error.code}: ${health.error.message}`
                : 'Unknown error'
            }
            onRetry={() => void health.refetch()}
          />
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Theme</h2>
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={preference === value ? 'primary' : 'secondary'}
              onClick={() => setPreference(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg sm:col-span-2">Fields</h2>
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          hint="Shown on your profile"
        />
        <Input label="Email" type="email" defaultValue="not-an-email" error="Enter a valid email" />
        <Textarea label="Bio" className="sm:col-span-2" hint="Up to 500 characters" />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg">Badges, avatars, skeletons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge tone="primary">Primary</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Avatar name="Ama Mensah" />
          <Avatar name="Kofi" size="lg" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState
          title="Nothing here yet"
          description="Empty states explain what belongs here and offer one clear action."
          action={<Button>Create something</Button>}
        />
        <ErrorState onRetry={() => toast.show({ kind: 'info', title: 'Retry clicked' })} />
      </div>

      <Card className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open modal
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.show({ kind: 'success', title: 'Saved', description: 'Toast example' })}
        >
          Success toast
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.show({ kind: 'error', title: 'Something failed' })}
        >
          Error toast
        </Button>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Example modal">
        <p className="text-sm text-muted">
          Built on the native dialog element: focus is trapped and Escape closes it.
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}

