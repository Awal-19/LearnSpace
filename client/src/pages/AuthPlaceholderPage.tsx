import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../design';

interface AuthPlaceholderProps {
  title: string;
  description: string;
}

/**
 * Public auth routes exist from Phase 1 so routing and guards are real.
 * The forms themselves (and the backend they call) are built in Phase 2.
 */
export function AuthPlaceholderPage({ title, description }: AuthPlaceholderProps) {
  return (
    <Card className="text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:text-primary-300">
        <KeyRound className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <p className="mt-6 text-sm text-muted">
        Authentication is built in <strong>Phase 2</strong>.{' '}
        <Link to="/login" className="font-medium text-primary-600 underline dark:text-primary-400">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}
