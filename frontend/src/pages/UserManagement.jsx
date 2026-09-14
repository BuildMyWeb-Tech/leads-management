import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import CreateUserModal from '../components/users/CreateUserModal';

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

  const [users, setUsers] = useState([]);
  const [tls, setTls]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null); // 'tl' | 'employee' | null
  const [togglingId, setTogglingId] = useState(null);

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

  useEffect(() => {
    loadUsers();
    loadTLs();
  }, [loadUsers, loadTLs]);

  const handleCreated = (newUser) => {
    setUsers((prev) => [newUser, ...prev]);
    if (newUser.role === 'tl') {
      setTls((prev) => [newUser, ...prev]);
    }
  };

  const toggleActive = async (u) => {
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
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={togglingId === u._id}
                            className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-40 transition-colors"
                          >
                            {togglingId === u._id ? '...' : (u.isActive ? 'Deactivate' : 'Activate')}
                          </button>
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
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={togglingId === u._id}
                      className="mt-2 text-xs text-gray-500 hover:text-blue-600 disabled:opacity-40"
                    >
                      {togglingId === u._id ? '...' : (u.isActive ? 'Deactivate' : 'Activate')}
                    </button>
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
    </div>
  );
}
