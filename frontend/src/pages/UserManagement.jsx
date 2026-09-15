import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import CreateUserModal from '../components/users/CreateUserModal';
import EditUserModal from '../components/users/EditUserModal';

const ROLE_LABEL = { admin: 'Admin', director: 'Director', tl: 'Team Lead', telecaller: 'Employee' };

const RoleBadge = ({ role }) => {
  const cls = {
    admin:      'bg-purple-100 text-purple-700',
    director:   'bg-blue-100 text-blue-700',
    tl:         'bg-teal-100 text-teal-700',
    telecaller: 'bg-green-100 text-green-700',
  }[role] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {ROLE_LABEL[role] || role}
    </span>
  );
};

/**
 * UserManagement — Admin + TL user management page.
 *
 * Admin: can create TL and Employee, assign Employee to TL, deactivate/reactivate users.
 * TL: can create Employee (auto-assigned to self), view own employees only.
 */
export default function UserManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers]         = useState([]);
  const [tls, setTls]             = useState([]);
  const [directors, setDirectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null); // 'tl' | 'employee' | null
  const [togglingId, setTogglingId] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // user object to edit
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // user to deactivate/activate

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTLs = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/users?role=tl');
      setTls(data);
    } catch {
      // non-fatal
    }
  }, [isAdmin]);

  const loadDirectors = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/users?role=director');
      setDirectors(data);
    } catch {
      // non-fatal
    }
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
    loadTLs();
    loadDirectors();
  }, [loadUsers, loadTLs, loadDirectors]);

  const handleCreated = (newUser) => {
    setUsers((prev) => [newUser, ...prev]);
    if (newUser.role === 'tl') {
      setTls((prev) => [newUser, ...prev]);
    }
  };

  const toggleActive = async (u) => {
    setConfirmDeactivate(null);
    setTogglingId(u._id);
    try {
      const { data } = await api.put(`/users/${u._id}`, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => x._id === u._id ? data : x));
      toast.success(`${data.name} ${data.isActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    } finally {
      setTogglingId(null);
    }
  };

  const handleUpdated = (updatedUser) => {
    setUsers((prev) => prev.map((x) => x._id === updatedUser._id ? updatedUser : x));
    if (updatedUser.role === 'tl') {
      setTls((prev) => prev.map((x) => x._id === updatedUser._id ? updatedUser : x));
    }
  };

  // Determine what roles are shown based on the current user's perspective
  // TL: only sees employees managed by themselves (backend already filters)
  // Admin: sees all users (from the GET /users endpoint)
  const visibleUsers = isAdmin
    ? users.filter((u) => ['tl', 'telecaller'].includes(u.role))
    : users; // TL backend already scopes to own employees

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="page-title">
          {isAdmin ? 'User Management' : 'My Employees'}
        </h2>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setModal('tl')}
              className="btn-ghost text-sm"
            >
              + Create Team Lead
            </button>
          )}
          <button
            onClick={() => setModal('employee')}
            className="btn-primary text-sm"
          >
            + Create Employee
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center py-12 text-gray-400 text-sm">
          Loading users...
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
          <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          No users found.
          {!isAdmin && <p className="text-xs mt-1">Create your first employee below.</p>}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  {isAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team Lead</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  {isAdmin && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleUsers.map((u) => {
                  const manager = u.managedBy ? tls.find((t) => t._id === u.managedBy || t._id === u.managedBy?._id) : null;
                  return (
                    <tr key={u._id} className={`hover:bg-gray-50 transition-colors ${!u.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {manager ? manager.name : (u.managedBy ? '—' : '—')}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium
                          ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Edit icon */}
                            <button
                              onClick={() => setEditTarget(u)}
                              title="Edit user"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                                     m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {/* Deactivate / Activate icon */}
                            <button
                              onClick={() => setConfirmDeactivate(u)}
                              disabled={togglingId === u._id}
                              title={u.isActive ? 'Deactivate user' : 'Activate user'}
                              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40
                                ${u.isActive
                                  ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                                }`}
                            >
                              {togglingId === u._id ? (
                                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : u.isActive ? (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636
                                       m12.728 12.728L5.636 5.636" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100">
            {visibleUsers.map((u) => {
              const manager = u.managedBy ? tls.find((t) => t._id === u.managedBy || t._id === u.managedBy?._id) : null;
              return (
                <div key={u._id} className={`px-4 py-3 ${!u.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <RoleBadge role={u.role} />
                      <span className={`text-xs px-2 py-0.5 rounded font-medium
                        ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  {isAdmin && manager && (
                    <p className="text-xs text-gray-400 mt-1">TL: {manager.name}</p>
                  )}
                  {isAdmin && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => setEditTarget(u)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                               m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeactivate(u)}
                        disabled={togglingId === u._id}
                        className={`flex items-center gap-1.5 text-xs transition-colors disabled:opacity-40
                          ${u.isActive ? 'text-gray-500 hover:text-red-600' : 'text-gray-500 hover:text-green-600'}`}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <CreateUserModal
          type={modal}
          tls={tls}
          onClose={() => setModal(null)}
          onCreated={handleCreated}
        />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          tls={tls}
          directors={directors}
          onClose={() => setEditTarget(null)}
          onUpdated={(updated) => { handleUpdated(updated); setEditTarget(null); }}
        />
      )}

      {/* Deactivate / Activate confirmation dialog */}
      {confirmDeactivate && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]"
            onClick={() => setConfirmDeactivate(null)} />
          <div className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2
                          sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:top-1/2
                          bg-white rounded-2xl shadow-xl max-w-sm w-full mx-auto p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {confirmDeactivate.isActive ? 'Deactivate User' : 'Activate User'}
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              {confirmDeactivate.isActive
                ? <>Are you sure you want to deactivate <strong>{confirmDeactivate.name}</strong>?
                   They will immediately lose access to the system. Historical data is preserved.</>
                : <>Reactivate <strong>{confirmDeactivate.name}</strong>? They will regain access to the system.</>
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => toggleActive(confirmDeactivate)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors
                  ${confirmDeactivate.isActive
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
              >
                {confirmDeactivate.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => setConfirmDeactivate(null)}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
