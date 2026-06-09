import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Sidebar                   from './components/layout/Sidebar';
import Login                     from './pages/Login';
import Dashboard                 from './pages/Dashboard';
import Leads                     from './pages/Leads';
import AddLead                   from './pages/AddLead';
import CSVUpload                 from './pages/CSVUpload';
import Allocate                  from './pages/Allocate';
import AllocationConfig          from './pages/AllocationConfig';
import DirectorDashboard         from './pages/DirectorDashboard';
import TelecallerPanel           from './pages/TelecallerPanel';
import OcrCapture                from './pages/OcrCapture';
import SheetsSync                from './pages/SheetsSync';
import NotificationSettings      from './pages/NotificationSettings';  // PHASE 9

// PWA overlays
import OfflineBanner             from './components/pwa/OfflineBanner';
import UpdateBanner              from './components/pwa/UpdateBanner';
import InstallPrompt             from './components/pwa/InstallPrompt';
import NotificationPermissionBanner from './components/notifications/NotificationPermissionBanner'; // PHASE 9

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Global overlays */}
      <OfflineBanner />
      <UpdateBanner />
      <InstallPrompt />
      <NotificationPermissionBanner />

      <Routes>
        <Route path="/login" element={<Login />} />

        {/* All roles */}
        <Route path="/dashboard"            element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/leads"                element={<ProtectedRoute><Leads /></ProtectedRoute>} />
        <Route path="/notifications"        element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />

        {/* Admin + Director */}
        <Route path="/leads/add"            element={<ProtectedRoute allowedRoles={['admin','director']}><AddLead /></ProtectedRoute>} />
        <Route path="/allocate"             element={<ProtectedRoute allowedRoles={['admin','director']}><Allocate /></ProtectedRoute>} />
        <Route path="/director-dashboard"   element={<ProtectedRoute allowedRoles={['admin','director']}><DirectorDashboard /></ProtectedRoute>} />
        <Route path="/ocr-capture"          element={<ProtectedRoute allowedRoles={['admin','director']}><OcrCapture /></ProtectedRoute>} />

        {/* Admin only */}
        <Route path="/leads/import"         element={<ProtectedRoute allowedRoles={['admin']}><CSVUpload /></ProtectedRoute>} />
        <Route path="/allocation-config"    element={<ProtectedRoute allowedRoles={['admin']}><AllocationConfig /></ProtectedRoute>} />
        <Route path="/sheets-sync"          element={<ProtectedRoute allowedRoles={['admin']}><SheetsSync /></ProtectedRoute>} />

        {/* Telecaller */}
        <Route path="/my-leads"             element={<ProtectedRoute allowedRoles={['telecaller','admin']}><TelecallerPanel /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
