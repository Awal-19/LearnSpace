import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../design';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
          >
            Go to dashboard
          </Link>
        }
      />
    </div>
  );
}
