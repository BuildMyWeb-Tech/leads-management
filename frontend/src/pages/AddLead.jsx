import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';

const SOURCES = ['YouTube', 'Google Ads', 'Facebook', 'Instagram', 'Referral', 'Walk-in', 'Website', 'Other'];
const STATUSES = ['New', 'Contacted', 'Interested', 'Not Interested', 'Closed'];

const INITIAL = {
  name: '', phone: '', email: '',
  source: 'Other', status: 'New',
  propertyInterest: '', budget: '', notes: '',
};

export default function AddLead() {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and Phone are required');
      return;
    }
    setLoading(true);
    try {
      await api.post('/leads', form);
      toast.success('Lead added successfully!');
      navigate('/leads');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add lead');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => setForm(INITIAL);

  return (
    <div className="max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/leads" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="page-title">Add New Lead</h2>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Basic Info */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Contact Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="input"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="e.g. Suresh Patel"
                  required
                />
              </div>
              <div>
                <label className="label">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="e.g. 9876543210"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="e.g. suresh@email.com"
                />
              </div>
            </div>
          </div>

          {/* Lead Details */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Lead Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Source</label>
                <select className="input" value={form.source} onChange={set('source')}>
                  {SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={set('status')}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Property Interest</label>
                <input
                  className="input"
                  value={form.propertyInterest}
                  onChange={set('propertyInterest')}
                  placeholder="e.g. 2BHK Apartment"
                />
              </div>
              <div>
                <label className="label">Budget Range</label>
                <input
                  className="input"
                  value={form.budget}
                  onChange={set('budget')}
                  placeholder="e.g. 60L–80L"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any additional information about this lead..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Saving...
                </>
              ) : (
                'Add Lead'
              )}
            </button>
            <button type="button" onClick={handleReset} className="btn-secondary">
              Reset
            </button>
            <Link to="/leads" className="btn-ghost ml-auto">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
