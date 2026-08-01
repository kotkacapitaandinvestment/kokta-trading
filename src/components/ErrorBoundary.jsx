import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-ink-950">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-loss-50 dark:bg-loss-500/10">
          <AlertTriangle className="h-5 w-5 text-loss-500" strokeWidth={1.75} />
        </div>
        <span className="text-sm font-semibold text-accent-600 dark:text-accent-400">Something went wrong</span>
        <h1 className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">This page hit an unexpected error</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          Nothing was lost — try reloading. If this keeps happening, let us know what you were doing when it broke.
        </p>
        <Button onClick={this.handleReload} className="mt-6">
          Back to home
        </Button>
      </div>
    );
  }
}
