import { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const ROLE_OPTIONS = [
  { value: 'director',   label: 'Director' },
  { value: 'tl',         label: 'Team Lead' },
  { value: 'telecaller', label: 'Employee' },
];

/**
 * EditUserModal — allows Admin to edit an existing user.
 *
 * Props:
 *   user      — the user object to edit
 *   tls       — list of TL users for the managedBy dropdown
 *   onClose   — callback to close the modal
 *   onUpdated — callback(updatedUser) called on success
 */
export default function EditUserModal({ user: target, onClose, onUpdated, tls = [], directors = [] }) {
  const [form, setForm] = useState({
    name:      target.name  || '',
    email:     target.email || '',
    role:      target.role  || 'telecaller',
    managedBy: target.managedBy?._id || target.managedBy || '',
    password:  '',
  });
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Re-sync if target changes
  useEffect(() => {
    setForm({
      name:      target.name  || '',
      email:     target.email || '',
      role:      target.role  || 'telecaller',
      managedBy: target.managedBy?._id || target.managedBy || '',
      password:  '',
    });
    setShowPass(false);
  }, [target._id]);

  const set = (field) => (e) => {
    const value = e.target.value;
    if (field === 'role') {
      // Clear managedBy when role changes so the previous selection doesn't leak
      setForm({ ...form, role: value, managedBy: '' });
    } else {
      setForm({ ...form, [field]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name:  form.name.trim(),
        email: form.email.trim(),
        role:  form.role,
      };
      // Send managedBy for telecaller (→ TL) and tl (→ Director)
      if (form.role === 'telecaller' || form.role === 'tl') {
        payload.managedBy = form.managedBy || null;
      }
      // Only send password if a new one was entered
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }
      const { data } = await api.put(`/users/${target._id}`, payload);
      toast.success(`${data.name} updated successfully`);
      onUpdated(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm pointer-events-auto
                      max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Edit User</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name <span className="text-red-400">*</span></label>
            <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} required />
          </div>
          <div>
            <label className="label">Email <span className="text-red-400">*</span></label>
            <input className="input" type="email" placeholder="email@example.com" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={set('role')}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {form.role === 'tl' && (
            <div>
              <label className="label">Assign to Director</label>
              <select className="input" value={form.managedBy} onChange={set('managedBy')}>
                <option value="">— Unassigned —</option>
                {directors.map((d) => (
                  <option key={d._id} value={d._id}>{d.name} ({d.email})</option>
                ))}
              </select>
            </div>
          )}

          {form.role === 'telecaller' && (
            <div>
              <label className="label">Assign to Team Lead</label>
              <select className="input" value={form.managedBy} onChange={set('managedBy')}>
                <option value="">— Unassigned —</option>
                {tls.map((tl) => (
                  <option key={tl._id} value={tl._id}>{tl.name} ({tl.email})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">New Password <span className="text-gray-400 font-normal text-xs">(leave blank to keep current)</span></label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="Enter new password"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                           hover:text-gray-600 transition-colors p-1 touch-manipulation"
                tabIndex={-1}
              >
                {showPass ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7
                         a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878
                         l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59
                         3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025
                         10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943
                         9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-1 justify-center"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </form>
      </div>
      </div>
      </div>
    </>
  );
}
