import { useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const BellIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const NAV_LINKS = [
  {
    to: '/dashboard', label: 'Dashboard',
    roles: ['admin','director','tl','telecaller'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>,
  },
  {
    to: '/director-dashboard', label: 'Director Panel',
    roles: ['admin','director'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>,
  },
  {
    to: '/director-dashboard', label: 'Team Panel',
    roles: ['tl'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>,
  },
  {
    to: '/my-leads', label: 'My Leads',
    roles: ['telecaller'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>,
  },
  {
    to: '/leads', label: 'All Leads',
    roles: ['admin','director','tl','telecaller'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>,
  },
  {
    to: '/leads/add', label: 'Add Lead',
    roles: ['admin','director','tl'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 4v16m8-8H4" />
    </svg>,
  },
  {
    to: '/ocr-capture', label: 'Upload Images',
    roles: ['admin','director','tl'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>,
  },
  {
    to: '/allocate', label: 'Allocate Leads',
    roles: ['admin','director'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>,
  },
  {
    to: '/leads/import', label: 'Import CSV',
    roles: ['admin'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>,
  },
  {
    to: '/allocation-config', label: 'Allocation Engine',
    roles: ['admin'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>,
  },
  {
    to: '/audit-logs', label: 'Audit Logs',
    roles: ['admin'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>,
  },
  {
    to: '/sheets-sync', label: 'Sheets Sync',
    roles: ['admin'],
    icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>,
  },
  {
    to: '/notifications', label: 'Notifications',
    roles: ['admin','director','tl','telecaller'],
    icon: <BellIcon />,
  },
];

const ROLE_BADGE = {
  admin:      'bg-purple-100 text-purple-700',
  director:   'bg-blue-100 text-blue-700',
  tl:         'bg-teal-100 text-teal-700',
  telecaller: 'bg-green-100 text-green-700',
};
const ROLE_LABEL  = { admin: 'Admin', director: 'Director', tl: 'Team Lead', telecaller: 'Telecaller' };
const ADMIN_ONLY  = ['Import CSV', 'Allocation Engine', 'Sheets Sync', 'Audit Logs'];

/**
 * Sidebar
 *
 * Props (from App.jsx / ProtectedRoute):
 *   open     – boolean  – whether mobile drawer is open
 *   onClose  – function – called to close the drawer
 *
 * Desktop (lg+): always visible, no drawer needed.
 * Mobile (<lg):  hidden by default, slides in when open=true.
 */
export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const location         = useLocation();

  // Close drawer when the route changes (user tapped a nav link)
  useEffect(() => {
    onClose();
  }, [location.pathname]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && open) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const visibleLinks = NAV_LINKS.filter((l) => l.roles.includes(user?.role));
  const mainLinks    = visibleLinks.filter((l) => !ADMIN_ONLY.includes(l.label));
  const adminLinks   = visibleLinks.filter((l) =>  ADMIN_ONLY.includes(l.label));

  // ── Shared nav content (same for desktop & mobile) ──────
  const NavItem = ({ link }) => (
    <NavLink
      to={link.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
         ${isActive
           ? 'bg-blue-50 text-blue-700 font-medium'
           : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
         }`
      }
    >
      {link.icon}
      {link.label}
    </NavLink>
  );

  const SidebarInner = () => (
    <div className="w-56 bg-white border-r border-gray-200 flex flex-col h-full">

      {/* Brand header */}
      <div className="flex items-center justify-between px-5 py-4
                      border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-none">VVMS CRM</h1>
            <p className="text-xs text-gray-400 mt-0.5">Real Estate CRM</p>
          </div>
        </div>

        {/* Close button — only visible on mobile */}
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center
                     rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          aria-label="Close menu"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {mainLinks.map((l) => <NavItem key={l.to} link={l} />)}

        {adminLinks.length > 0 && (
          <>
            {/* <div className="pt-3 pb-1">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Admin
              </p>
            </div> */}
            {adminLinks.map((l) => <NavItem key={l.to} link={l} />)}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center
                          text-xs font-semibold text-gray-600 flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium
              ${ROLE_BADGE[user?.role] || ''}`}>
              {ROLE_LABEL[user?.role] || user?.role}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-2 text-xs text-gray-400
                     hover:text-red-500 transition-colors py-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop: always visible ──────────────────────── */}
      <div className="hidden lg:flex h-full flex-shrink-0">
        <SidebarInner />
      </div>

      {/* ── Mobile: drawer + backdrop ────────────────────── */}

      {/* Backdrop — only rendered when open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel — slides in from left */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 lg:hidden
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarInner />
      </div>
    </>
  );
}