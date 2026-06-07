import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { LEAD_SOURCES, LEAD_STATUSES } from '../constants/leadConstants';
import toast from 'react-hot-toast';

const BUDGETS = ['Under 40L', '40L–60L', '60L–80L', '80L–1Cr', '1Cr–1.5Cr', '1.5Cr+'];
const PROPERTIES = ['2BHK Apartment', '3BHK Villa', 'Studio Flat', 'Plot / Land', 'Commercial Space', 'Other'];

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
    // Basic phone validation
    if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ''))) {
      toast.error('Enter a valid 10-digit mobile number');
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
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Name <span className="text-red-400">*</span></label>
                <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} />
              </div>
              <div>
                <label className="label">Phone <span className="text-red-400">*</span></label>
                <input className="input" placeholder="10-digit mobile" value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={10} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="Optional" value={form.email} onChange={set('email')} />
              </div>
            </div>
          </div>

          {/* Lead details */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Lead details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Source</label>
                <select className="input" value={form.source} onChange={set('source')}>
                  {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Initial status</label>
                <select className="input" value={form.status} onChange={set('status')}>
                  {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Property interest</label>
                <select className="input" value={form.propertyInterest} onChange={set('propertyInterest')}>
                  <option value="">— Select —</option>
                  {PROPERTIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Budget range</label>
                <select className="input" value={form.budget} onChange={set('budget')}>
                  <option value="">— Select —</option>
                  {BUDGETS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
            <textarea
              className="input"
              rows={3}
              placeholder="Any initial notes about this lead..."
              value={form.notes}
              onChange={set('notes')}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Saving...
                </>
              ) : 'Save Lead'}
            </button>
            <button
              type="button"
              onClick={() => setForm(INITIAL)}
              className="btn-ghost"
            >
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
