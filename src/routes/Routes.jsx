import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import RequireSuperAdmin from './RequireSuperAdmin';
import AppLayout from '../components/layout/AppLayout';
import AdminLayout from '../components/layout/AdminLayout';

import Landing from '../features/marketing/Landing';
import NotFound from '../features/marketing/NotFound';
import Login from '../features/auth/Login';
import Signup from '../features/auth/Signup';
import ForgotPassword from '../features/auth/ForgotPassword';
import ResetPassword from '../features/auth/ResetPassword';
import VerifyEmail from '../features/auth/VerifyEmail';
import VerifyIdentity from '../features/verification/VerifyIdentity';

import Dashboard from '../features/dashboard/Dashboard';
import KotkaAI from '../features/ai/KotkaAI';
import Journal from '../features/journal/Journal';
import Checklist from '../features/checklist/Checklist';
import Analytics from '../features/analytics/Analytics';
import Calculators from '../features/calculators/Calculators';
import MarketIntelligence from '../features/market-intelligence/MarketIntelligence';
import Settings from '../features/settings/Settings';
import Notifications from '../features/notifications/Notifications';

import AdminOverview from '../features/admin/AdminOverview';
import AdminUsers from '../features/admin/AdminUsers';
import AdminAIUsage from '../features/admin/AdminAIUsage';
import AdminTradingStats from '../features/admin/AdminTradingStats';
import AdminJournalStats from '../features/admin/AdminJournalStats';
import AdminAnnouncements from '../features/admin/AdminAnnouncements';
import AdminAuditLogs from '../features/admin/AdminAuditLogs';
import AdminSystemHealth from '../features/admin/AdminSystemHealth';
import AdminSettings from '../features/admin/AdminSettings';
import AdminIntegrations from '../features/admin/AdminIntegrations';
import AdminResearch from '../features/admin/AdminResearch';
import AdminVerifications from '../features/admin/AdminVerifications';
import AdminBilling from '../features/admin/AdminBilling';
import AdminCommunity from '../features/admin/AdminCommunity';
import AdminUsage from '../features/admin/AdminUsage';
import AdminGame from '../features/admin/AdminGame';
import GameHome from '../features/game/GameHome';
import GameWallet from '../features/game/Wallet';
import GameMatch from '../features/game/MatchPage';
import GameHistory from '../features/game/History';
import GameProfile from '../features/game/Profile';
import CommunityLayout from '../features/community/CommunityLayout';
import ForYou from '../features/community/pages/ForYou';
import Markets from '../features/community/pages/Markets';
import MarketRoom from '../features/community/pages/MarketRoom';
import Ideas from '../features/community/pages/Ideas';
import PostPage from '../features/community/pages/PostPage';
import CommunityEvents from '../features/community/pages/Events';
import EventDetail from '../features/community/pages/EventDetail';
import Following from '../features/community/pages/Following';
import Messages from '../features/community/pages/Messages';
import Profile from '../features/community/pages/Profile';
import CommunitySearch from '../features/community/pages/Search';
import Saved from '../features/community/pages/Saved';
import NewsDetail from '../features/community/pages/NewsDetail';
import Guidelines from '../features/community/pages/Guidelines';
import Invite from '../features/community/pages/Invite';
import CommunityGoals from '../features/community/pages/Goals';
import GoalRoom from '../features/goals/GoalRoom';
import PublicAchievement from '../features/goals/PublicAchievement';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/verify" element={<VerifyIdentity />} />
      <Route path="/achievement/:slug" element={<PublicAchievement />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ai" element={<KotkaAI />} />
        <Route path="journal" element={<Journal />} />
        <Route path="checklist" element={<Checklist />} />
        <Route path="goals" element={<GoalRoom />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="calculators" element={<Calculators />} />
        <Route path="market" element={<MarketIntelligence />} />
        <Route path="game" element={<GameHome />} />
        <Route path="game/wallet" element={<GameWallet />} />
        <Route path="game/matches/:id" element={<GameMatch />} />
        <Route path="game/history" element={<GameHistory />} />
        <Route path="game/profile" element={<GameProfile />} />
        <Route path="game/traders/:username" element={<GameProfile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="community" element={<CommunityLayout />}>
          <Route index element={<ForYou />} />
          <Route path="markets" element={<Markets />} />
          <Route path="markets/:symbol" element={<MarketRoom />} />
          <Route path="ideas" element={<Ideas />} />
          <Route path="goals" element={<CommunityGoals />} />
          <Route path="ideas/:id" element={<PostPage />} />
          <Route path="posts/:id" element={<PostPage />} />
          <Route path="events" element={<CommunityEvents />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="following" element={<Following />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:id" element={<Messages />} />
          <Route path="u/:username" element={<Profile />} />
          <Route path="search" element={<CommunitySearch />} />
          <Route path="saved" element={<Saved />} />
          <Route path="news/:id" element={<NewsDetail />} />
          <Route path="guidelines" element={<Guidelines />} />
          <Route path="invite/:code" element={<Invite />} />
        </Route>
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="usage" element={<AdminUsage />} />
        <Route path="game" element={<AdminGame />} />
        <Route path="ai-usage" element={<AdminAIUsage />} />
        <Route path="trading-stats" element={<AdminTradingStats />} />
        <Route path="journal-stats" element={<AdminJournalStats />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="research" element={<AdminResearch />} />
        <Route path="community" element={<AdminCommunity />} />
        <Route path="billing" element={<AdminBilling />} />
        {['subscriptions', 'revenue'].map((p) => (
          <Route key={p} path={p} element={<Navigate to="/admin/billing" replace />} />
        ))}
        {['reports', 'content', 'courses', 'market-news', 'feature-flags', 'support', 'api-usage'].map((p) => (
          <Route key={p} path={p} element={<Navigate to="/admin/overview" replace />} />
        ))}
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="system-health" element={<AdminSystemHealth />} />
        <Route
          path="integrations"
          element={
            <RequireSuperAdmin>
              <AdminIntegrations />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="settings"
          element={
            <RequireSuperAdmin>
              <AdminSettings />
            </RequireSuperAdmin>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
