import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

// Public platform switches (sign-ups open, KYC required, paid plans on).
// Defaults match the server's until the real values arrive.
const DEFAULTS = { paidPlansEnabled: false, signupsOpen: true, kycRequired: true, supportEmail: null, loaded: false };

const AppConfigContext = createContext(DEFAULTS);

export function AppConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    api
      .get('/app/config')
      .then((c) => setConfig({ ...DEFAULTS, ...c, loaded: true }))
      .catch(() => setConfig((prev) => ({ ...prev, loaded: true })));
  }, []);

  return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
