import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../design';

interface State {
  failed: boolean;
}

/** Last-resort boundary so a rendering bug shows a recoverable screen, not a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Phase 8 forwards this to Sentry.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <ErrorState
            title="This page crashed"
            message="Reloading usually fixes it. Your saved work is safe."
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
