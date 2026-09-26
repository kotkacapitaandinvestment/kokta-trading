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

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify" element={<VerifyIdentity />} />

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
        <Route path="settings" element={<Settings />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="verifications" element={<AdminVerifications />} />
        <Route path="ai-usage" element={<AdminAIUsage />} />
        <Route path="trading-stats" element={<AdminTradingStats />} />
        <Route path="journal-stats" element={<AdminJournalStats />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="research" element={<AdminResearch />} />
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
