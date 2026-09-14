import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';

/**
 * CreateUserModal — modal/drawer for creating a new user.
 *
 * Props:
 *   type      — 'tl' | 'employee' — what kind of user to create
 *   onClose   — callback to close the modal
 *   onCreated — callback(newUser) called on success
 *   tls       — array of TL users (for admin creating employee; not shown to TL)
 */
export default function CreateUserModal({ type, onClose, onCreated, tls = [] }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', managedBy: '' });
  const [loading, setLoading] = useState(false);

  // When modal opens for a specific type, reset form
  useEffect(() => {
    setForm({ name: '', email: '', password: '', managedBy: '' });
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
      // Admin assigning employee to a TL
      if (isAdmin && isEmployee && form.managedBy) {
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
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2
                      sm:inset-auto sm:top-auto sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:top-1/2
                      bg-white rounded-2xl shadow-xl max-w-sm w-full mx-auto p-6">
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
            <input className="input" type="password" placeholder="Set a password" value={form.password} onChange={set('password')} required />
          </div>

          {/* Admin assigning employee to a TL — not shown when TL creates their own employee */}
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
    </>
  );
}
