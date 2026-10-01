import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './ui/Button';
import { CONTACT, mailto } from '../lib/contact';
import { reportError } from '../lib/errorReporter';

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
    reportError(error, { kind: 'page crashed' });
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
        <h1 className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-50">This page didn’t load properly</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          Nothing you saved was lost. Reload the page to try again. If it keeps happening, email{' '}
          <a className="font-medium text-accent-600 hover:underline dark:text-accent-400" href={mailto(CONTACT.support, 'A Kotka page didn’t load')}>{CONTACT.support}</a>{' '}
          and tell us what you were doing. We’ll fix it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Reload page</Button>
          <Button variant="secondary" onClick={this.handleReload}>Back to home</Button>
        </div>
      </div>
    );
  }
}
