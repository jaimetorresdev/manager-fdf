import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ error, onRetry, onGoHome }: { error: Error | null; onRetry: () => void; onGoHome: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md w-full bg-[var(--bg-surface)] rounded-2xl border border-[color-mix(in_srgb,var(--red-danger)_30%,transparent)] p-8 text-center space-y-5">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-[color-mix(in_srgb,var(--red-danger)_10%,transparent)]">
            <AlertTriangle size={36} className="text-[var(--red-danger)]" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold font-rajdhani text-[var(--text-primary)] mb-2">
            {t('gameplay:errorBoundary.title')}
          </h2>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            {error?.message ?? t('gameplay:errorBoundary.fallback')}
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[color-mix(in_srgb,var(--green-primary)_20%,transparent)] text-[var(--green-primary)] border border-[color-mix(in_srgb,var(--green-primary)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--green-primary)_30%,transparent)] transition-colors"
          >
            <RefreshCw size={14} />
            {t('gameplay:errorBoundary.retry')}
          </button>
          <button
            onClick={onGoHome}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[color-mix(in_srgb,var(--border-color)_40%,transparent)] transition-colors"
          >
            <Home size={14} />
            {t('gameplay:errorBoundary.goHome')}
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Render error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}
