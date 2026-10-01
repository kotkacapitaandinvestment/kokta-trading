import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppConfigProvider } from './context/AppConfigContext';
import AppRoutes from './routes/Routes';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogHost } from './lib/dialogs';

// Preview deployments run on the test database: say so on every screen.
const PREVIEW = import.meta.env.VITE_KOTKA_ENV === 'preview';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppConfigProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
              <DialogHost />
              {PREVIEW ? (
                <div role="note" className="pointer-events-none fixed left-1/2 top-0 z-[100] -translate-x-1/2 rounded-b-lg bg-amber-400 px-3 py-0.5 text-[11px] font-semibold text-ink-900 shadow">
                  Test copy of Kotka · test accounts and test money only
                </div>
              ) : null}
            </BrowserRouter>
          </AuthProvider>
        </AppConfigProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
