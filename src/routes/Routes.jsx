import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';
import AdminLayout from '../components/layout/AdminLayout';

import Landing from '../features/marketing/Landing';
import NotFound from '../features/marketing/NotFound';
import Login from '../features/auth/Login';
import Signup from '../features/auth/Signup';
import ForgotPassword from '../features/auth/ForgotPassword';

import Dashboard from '../features/dashboard/Dashboard';
import KotkaAI from '../features/ai/KotkaAI';
import Journal from '../features/journal/Journal';
import Checklist from '../features/checklist/Checklist';
import Analytics from '../features/analytics/Analytics';
import Calculators from '../features/calculators/Calculators';
import MarketIntelligence from '../features/market-intelligence/MarketIntelligence';
import TraderDNA from '../features/trader-dna/TraderDNA';
import Simulator from '../features/simulator/Simulator';
import Replay from '../features/replay/Replay';
import Settings from '../features/settings/Settings';
import Notifications from '../features/notifications/Notifications';

import AdminOverview from '../features/admin/AdminOverview';
import AdminUsers from '../features/admin/AdminUsers';
import AdminSubscriptions from '../features/admin/AdminSubscriptions';
import AdminAIUsage from '../features/admin/AdminAIUsage';
import AdminTradingStats from '../features/admin/AdminTradingStats';
import AdminJournalStats from '../features/admin/AdminJournalStats';
import AdminSimulatorStats from '../features/admin/AdminSimulatorStats';
import AdminRevenue from '../features/admin/AdminRevenue';
import AdminReports from '../features/admin/AdminReports';
import AdminAnnouncements from '../features/admin/AdminAnnouncements';
import AdminContent from '../features/admin/AdminContent';
import AdminCourses from '../features/admin/AdminCourses';
import AdminMarketNews from '../features/admin/AdminMarketNews';
import AdminFeatureFlags from '../features/admin/AdminFeatureFlags';
import AdminSupport from '../features/admin/AdminSupport';
import AdminAuditLogs from '../features/admin/AdminAuditLogs';
import AdminSystemHealth from '../features/admin/AdminSystemHealth';
import AdminApiUsage from '../features/admin/AdminApiUsage';
import AdminSettings from '../features/admin/AdminSettings';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

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
        <Route path="analytics" element={<Analytics />} />
        <Route path="calculators" element={<Calculators />} />
        <Route path="market" element={<MarketIntelligence />} />
        <Route path="trader-dna" element={<TraderDNA />} />
        <Route path="simulator" element={<Simulator />} />
        <Route path="replay" element={<Replay />} />
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="ai-usage" element={<AdminAIUsage />} />
        <Route path="trading-stats" element={<AdminTradingStats />} />
        <Route path="journal-stats" element={<AdminJournalStats />} />
        <Route path="simulator-stats" element={<AdminSimulatorStats />} />
        <Route path="revenue" element={<AdminRevenue />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="content" element={<AdminContent />} />
        <Route path="courses" element={<AdminCourses />} />
        <Route path="market-news" element={<AdminMarketNews />} />
        <Route path="feature-flags" element={<AdminFeatureFlags />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="system-health" element={<AdminSystemHealth />} />
        <Route path="api-usage" element={<AdminApiUsage />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
