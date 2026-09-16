import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';

/**
 * CreateUserModal — modal for creating a new user.
 *
 * Props:
 *   type      — 'tl' | 'employee'
 *   onClose   — callback to close the modal
 *   onCreated — callback(newUser) called on success
 *   tls       — array of TL users (for admin creating employee)
 *   directors — array of Director users (for admin creating TL)
 */
export default function CreateUserModal({ type, onClose, onCreated, tls = [], directors = [] }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', managedBy: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    setForm({ name: '', email: '', password: '', managedBy: '' });
    setShowPass(false);
  }, [type]);

  const isAdmin    = user?.role === 'admin';
  const isEmployee = type === 'employee';

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Name, email, and password are required');
      return;
    }
    if (isAdmin && isEmployee && !form.managedBy) {
      toast.error('Please select a Team Lead for this employee');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name:     form.name.trim(),
        email:    form.email.trim(),
        password: form.password,
        role:     isEmployee ? 'telecaller' : 'tl',
      };
      if (isAdmin && isEmployee && form.managedBy) {
        payload.managedBy = form.managedBy;
      }
      // S.3: Admin creating TL can assign them to a Director
      if (isAdmin && !isEmployee && form.managedBy) {
        payload.managedBy = form.managedBy;
      }
      const { data } = await api.post('/users', payload);
      toast.success(`${isEmployee ? 'Employee' : 'Team Lead'} created successfully`);
      onCreated(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const title = isEmployee ? 'Create Employee' : 'Create Team Lead';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]" onClick={onClose} />

      {/* Modal — centered both axes, scroll-safe on short screens */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm pointer-events-auto
                        max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
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
                <label className="label">Password <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Set a password"
                    value={form.password}
                    onChange={set('password')}
                    required
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

              {/* Admin creating Employee → assign to TL */}
              {isAdmin && isEmployee && (
                <div>
                  <label className="label">Assign to Team Lead <span className="text-red-400">*</span></label>
                  <select className="input" value={form.managedBy} onChange={set('managedBy')} required>
                    <option value="">— Select Team Lead —</option>
                    {tls.map((tl) => (
                      <option key={tl._id} value={tl._id}>{tl.name} ({tl.email})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Admin creating TL → assign to Director (optional) */}
              {isAdmin && !isEmployee && (
                <div>
                  <label className="label">Assign to Director <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                  <select className="input" value={form.managedBy} onChange={set('managedBy')}>
                    <option value="">— Unassigned —</option>
                    {directors.map((d) => (
                      <option key={d._id} value={d._id}>{d.name} ({d.email})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex-1 justify-center"
                >
                  {loading ? 'Creating...' : `Create ${isEmployee ? 'Employee' : 'Team Lead'}`}
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
