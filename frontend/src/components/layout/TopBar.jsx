import { useNavigate } from 'react-router-dom';

/**
 * TopBar — mobile-only sticky header (hidden on lg+).
 *
 * Props:
 *   onMenuOpen — callback to open the sidebar drawer
 */
export default function TopBar({ onMenuOpen }) {
  const navigate = useNavigate();

  // All roles can add leads
  return (
    <header className="lg:hidden flex-shrink-0 h-14 bg-white border-b border-gray-200
                       flex items-center justify-between px-4 z-30 relative">
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
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
        <span className="text-sm font-bold text-gray-900">VVMS CRM</span>
      </div>

      {/* Right side: notification bell + add lead (all roles) */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate('/add-lead')}
          className="w-9 h-9 flex items-center justify-center rounded-lg
                     text-blue-600 hover:bg-blue-50 active:bg-blue-100
                     transition-colors"
          aria-label="Add lead"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => navigate('/notification-settings')}
          className="w-9 h-9 flex items-center justify-center rounded-lg
                     text-gray-600 hover:bg-gray-100 active:bg-gray-200
                     transition-colors"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002
                 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388
                 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3
                 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
