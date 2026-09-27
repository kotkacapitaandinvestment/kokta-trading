import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppConfigProvider } from './context/AppConfigContext';
import AppRoutes from './routes/Routes';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogHost } from './lib/dialogs';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppConfigProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
              <DialogHost />
            </BrowserRouter>
          </AuthProvider>
        </AppConfigProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
