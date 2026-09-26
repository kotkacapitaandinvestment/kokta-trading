import { RealtimeProvider } from './realtime';
import { CommunityProvider } from './CommunityContext';

// Live updates and Community identity for every signed-in page (so the
// notification bell and message badges update anywhere in the app).
export default function CommunityShell({ children }) {
  return (
    <RealtimeProvider>
      <CommunityProvider>{children}</CommunityProvider>
    </RealtimeProvider>
  );
}
