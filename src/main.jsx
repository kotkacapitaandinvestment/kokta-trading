import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './assets/styles.css';
import { registerServiceWorker } from './lib/pwa';
import { startErrorReporting } from './lib/errorReporter';

startErrorReporting();

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline page, installability and push. Registered after load so it never
// competes with the first paint.
window.addEventListener('load', () => registerServiceWorker());
