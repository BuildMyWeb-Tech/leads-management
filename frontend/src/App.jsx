import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './context/AuthContext';

import Sidebar                      from './components/layout/Sidebar';
import Login                        from './pages/Login';
import Dashboard                    from './pages/Dashboard';
import Leads                        from './pages/Leads';
import AddLead                      from './pages/AddLead';
import CSVUpload                    from './pages/CSVUpload';
import Allocate                     from './pages/Allocate';
import AllocationConfig             from './pages/AllocationConfig';
import DirectorDashboard            from './pages/DirectorDashboard';
import TelecallerPanel              from './pages/TelecallerPanel';
import OcrCapture                   from './pages/OcrCapture';
import SheetsSync                   from './pages/SheetsSync';
import NotificationSettings         from './pages/NotificationSettings';
import AuditLogs                    from './pages/AuditLogs';

import OfflineBanner                from './components/pwa/OfflineBanner';
import UpdateBanner                 from './components/pwa/UpdateBanner';
import InstallPrompt                from './components/pwa/InstallPrompt';
import NotificationPermissionBanner from './components/notifications/NotificationPermissionBanner';

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  // ── Mobile sidebar state — lives here so hamburger button can set it ──
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role))
    return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Sidebar — receives open/onClose for mobile drawer */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Right side: header + page content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Mobile sticky header (hidden on lg+) ─────────── */}
        <header className="lg:hidden flex-shrink-0 h-14 bg-white border-b border-gray-200
                           flex items-center justify-between px-4 z-30 relative">
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg
                       text-gray-600 hover:bg-gray-100 active:bg-gray-200
                       transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">A2S CRM</span>
          </div>

          {/* Right spacer — keeps brand centered */}
          <div className="w-10" />
        </header>

        {/* ── Page content ─────────────────────────────────── */}
        {/* pt-0 on desktop (no header), content fills full height */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <OfflineBanner />
      <UpdateBanner />
      <InstallPrompt />
      <NotificationPermissionBanner />

      <Routes>
        <Route path="/login" element={<Login />} />

        {/* All roles */}
        <Route path="/dashboard"
          element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/leads"
          element={<ProtectedRoute><Leads /></ProtectedRoute>} />
        <Route path="/notifications"
          element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />

        {/* Admin + Director */}
        <Route path="/leads/add"
          element={<ProtectedRoute allowedRoles={['admin','director']}><AddLead /></ProtectedRoute>} />
        <Route path="/allocate"
          element={<ProtectedRoute allowedRoles={['admin','director']}><Allocate /></ProtectedRoute>} />
        <Route path="/director-dashboard"
          element={<ProtectedRoute allowedRoles={['admin','director']}><DirectorDashboard /></ProtectedRoute>} />
        <Route path="/ocr-capture"
          element={<ProtectedRoute allowedRoles={['admin','director']}><OcrCapture /></ProtectedRoute>} />

        {/* Admin only */}
        <Route path="/leads/import"
          element={<ProtectedRoute allowedRoles={['admin']}><CSVUpload /></ProtectedRoute>} />
        <Route path="/allocation-config"
          element={<ProtectedRoute allowedRoles={['admin']}><AllocationConfig /></ProtectedRoute>} />
        <Route path="/sheets-sync"
          element={<ProtectedRoute allowedRoles={['admin']}><SheetsSync /></ProtectedRoute>} />
        <Route path="/audit-logs"
          element={<ProtectedRoute allowedRoles={['admin']}><AuditLogs /></ProtectedRoute>} />

        {/* Telecaller */}
        <Route path="/my-leads"
          element={<ProtectedRoute allowedRoles={['telecaller','admin']}><TelecallerPanel /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}