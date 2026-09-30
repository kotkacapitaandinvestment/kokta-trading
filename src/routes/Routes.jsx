import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import RequireSuperAdmin from './RequireSuperAdmin';
import AppLayout from '../components/layout/AppLayout';
import AdminLayout from '../components/layout/AdminLayout';
import { lazyPage, PageLoading } from '../lib/lazyPage';

import Landing from '../features/marketing/Landing';
import NotFound from '../features/marketing/NotFound';
import Login from '../features/auth/Login';
import Signup from '../features/auth/Signup';
import ForgotPassword from '../features/auth/ForgotPassword';
import ResetPassword from '../features/auth/ResetPassword';
import VerifyEmail from '../features/auth/VerifyEmail';

import CommunityLayout from '../features/community/CommunityLayout';

const VerifyIdentity = lazyPage(() => import('../features/verification/VerifyIdentity'));
const Dashboard = lazyPage(() => import('../features/dashboard/Dashboard'));
const KotkaAI = lazyPage(() => import('../features/ai/KotkaAI'));
const Journal = lazyPage(() => import('../features/journal/Journal'));
const Checklist = lazyPage(() => import('../features/checklist/Checklist'));
const Analytics = lazyPage(() => import('../features/analytics/Analytics'));
const Calculators = lazyPage(() => import('../features/calculators/Calculators'));
const MarketIntelligence = lazyPage(() => import('../features/market-intelligence/MarketIntelligence'));
const Settings = lazyPage(() => import('../features/settings/Settings'));
const Notifications = lazyPage(() => import('../features/notifications/Notifications'));
const AdminOverview = lazyPage(() => import('../features/admin/AdminOverview'));
const AdminUsers = lazyPage(() => import('../features/admin/AdminUsers'));
const AdminAIUsage = lazyPage(() => import('../features/admin/AdminAIUsage'));
const AdminTradingStats = lazyPage(() => import('../features/admin/AdminTradingStats'));
const AdminJournalStats = lazyPage(() => import('../features/admin/AdminJournalStats'));
const AdminAnnouncements = lazyPage(() => import('../features/admin/AdminAnnouncements'));
const AdminAuditLogs = lazyPage(() => import('../features/admin/AdminAuditLogs'));
const AdminSystemHealth = lazyPage(() => import('../features/admin/AdminSystemHealth'));
const AdminSettings = lazyPage(() => import('../features/admin/AdminSettings'));
const AdminIntegrations = lazyPage(() => import('../features/admin/AdminIntegrations'));
const AdminResearch = lazyPage(() => import('../features/admin/AdminResearch'));
const AdminVerifications = lazyPage(() => import('../features/admin/AdminVerifications'));
const AdminBilling = lazyPage(() => import('../features/admin/AdminBilling'));
const AdminCommunity = lazyPage(() => import('../features/admin/AdminCommunity'));
const AdminUsage = lazyPage(() => import('../features/admin/AdminUsage'));
const AdminGame = lazyPage(() => import('../features/admin/AdminGame'));
const GameHome = lazyPage(() => import('../features/game/GameHome'));
const GameWallet = lazyPage(() => import('../features/game/Wallet'));
const GameMatch = lazyPage(() => import('../features/game/MatchPage'));
const GameHistory = lazyPage(() => import('../features/game/History'));
const GameProfile = lazyPage(() => import('../features/game/Profile'));
const GameLearn = lazyPage(() => import('../features/game/Learn'));
const GameLeaderboard = lazyPage(() => import('../features/game/Leaderboard'));
const ForYou = lazyPage(() => import('../features/community/pages/ForYou'));
const Markets = lazyPage(() => import('../features/community/pages/Markets'));
const MarketRoom = lazyPage(() => import('../features/community/pages/MarketRoom'));
const Ideas = lazyPage(() => import('../features/community/pages/Ideas'));
const PostPage = lazyPage(() => import('../features/community/pages/PostPage'));
const CommunityEvents = lazyPage(() => import('../features/community/pages/Events'));
const EventDetail = lazyPage(() => import('../features/community/pages/EventDetail'));
const Following = lazyPage(() => import('../features/community/pages/Following'));
const Messages = lazyPage(() => import('../features/community/pages/Messages'));
const Profile = lazyPage(() => import('../features/community/pages/Profile'));
const CommunitySearch = lazyPage(() => import('../features/community/pages/Search'));
const Saved = lazyPage(() => import('../features/community/pages/Saved'));
const NewsDetail = lazyPage(() => import('../features/community/pages/NewsDetail'));
const Guidelines = lazyPage(() => import('../features/community/pages/Guidelines'));
const Invite = lazyPage(() => import('../features/community/pages/Invite'));
const CommunityGoals = lazyPage(() => import('../features/community/pages/Goals'));
const GoalRoom = lazyPage(() => import('../features/goals/GoalRoom'));
const PublicAchievement = lazyPage(() => import('../features/goals/PublicAchievement'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-6"><PageLoading /></div>}>
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
        <Route path="game/learn" element={<GameLearn />} />
        <Route path="game/leaderboard" element={<GameLeaderboard />} />
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
    </Suspense>
  );
}
