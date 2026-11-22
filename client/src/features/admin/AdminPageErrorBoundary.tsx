import { AlertTriangle, Bug, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, GlassCard } from '../../design';
import { request } from '../../lib/apiClient';

interface State {
  hasError: boolean;
  errorMessage: string;
  reported: boolean;
}

/**
 * Error boundary wrapping each admin page so a render crash never leaves a blank card.
 */
export class AdminPageErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { hasError: false, errorMessage: '', reported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message || 'Unexpected rendering error' };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminPageError]', error, info.componentStack);
  }

  private handleReport = async () => {
    try {
      await request('/feedback', {
        method: 'POST',
        body: {
          category: 'bug',
          subject: 'Admin page render crash',
          message: `Route: ${window.location.pathname}\nError: ${this.state.errorMessage}`.slice(
            0,
            1500,
          ),
        },
      });
    } catch {
      // Best-effort error report
    }
    this.setState({ reported: true });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <GlassCard className="mx-auto max-w-lg space-y-4 p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-danger/15 text-danger">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-fg">
              This admin page ran into a problem
            </h2>
            <p className="mt-1 text-xs text-muted">
              Something went wrong while rendering this view. Try retrying or report the issue.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => this.setState({ hasError: false, errorMessage: '', reported: false })}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={this.state.reported}
              onClick={() => void this.handleReport()}
            >
              <Bug className="h-3.5 w-3.5" aria-hidden="true" />
              {this.state.reported ? 'Problem reported' : 'Report problem'}
            </Button>
          </div>
        </GlassCard>
      );
    }
    return this.props.children;
  }
}
