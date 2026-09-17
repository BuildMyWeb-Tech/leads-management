import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
  LEAD_SOURCES, PROPERTY_TYPES, PURPOSE_OPTIONS,
} from '../constants/leadConstants';
import toast from 'react-hot-toast';

const INITIAL = {
  name: '', phone: '', propertyType: '', targetLocation: '',
  plotSquareFeet: '', budget: '', followUpDate: '', siteVisitDate: '',
  notes: '', remarks: '', source: 'Other', purpose: '', email: '',
  propertyInterest: '',
};

const isValidPhone = (raw) => {
  if (!raw) return false;
  const digits = String(raw).trim().replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
};

export default function AddLead() {
  const navigate = useNavigate();
  const { user }  = useAuth();
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);

  const isEmployee = user?.role === 'telecaller';

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const validate = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Client Name and Mobile Number are required');
      return false;
    }
    if (!isValidPhone(form.phone)) {
      toast.error('Enter a valid mobile number (6–15 digits, e.g. +12025550123 or 9876543210)');
      return false;
    }
    if (!PROPERTY_TYPES.includes(form.propertyType)) {
      toast.error('Select a valid Property Type');
      return false;
    }
    if (form.propertyType === 'Plot' && !form.plotSquareFeet.trim()) {
      toast.error('Plot Area is required when Property Type is Plot');
      return false;
    }
    if (!form.targetLocation.trim()) {
      toast.error('Target Location is required');
      return false;
    }
    if (!form.budget.trim()) {
      toast.error('Budget is required');
      return false;
    }
    if (!PURPOSE_OPTIONS.includes(form.purpose)) {
      toast.error('Select a valid Purpose');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = { ...form };
      if (payload.propertyType !== 'Plot') payload.plotSquareFeet = '';
      if (payload.followUpDate) payload.followUpDate = new Date(payload.followUpDate).toISOString();
      else delete payload.followUpDate;

      if (payload.siteVisitDate) {
        payload.siteVisit = {
          plannedDate: new Date(payload.siteVisitDate).toISOString(),
          status: 'planned',
          notes: '',
        };
      }
      delete payload.siteVisitDate;

      const { data: created } = await api.post('/leads', payload);
      toast.success(
        created?.leadId ? `Lead added — ID ${created.leadId}` : 'Lead added successfully!'
      );
      navigate('/leads');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/leads" className="text-gray-400 hover:text-gray-600 touch-manipulation p-1 -m-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="page-title">Add New Lead</h2>
      </div>

      {/* Entry shortcuts for non-employee roles */}
      {!isEmployee && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {/* Add from Image */}
          <Link
            to="/ocr-capture"
            className="flex items-center gap-3 px-4 py-3 rounded-xl
                       bg-blue-50 border border-blue-100 hover:bg-blue-100
                       active:bg-blue-200 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0
                     0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07
                     7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-700">Add Leads from Image</p>
              <p className="text-xs text-blue-500 mt-0.5 truncate">
                Scan a brochure or business card
              </p>
            </div>
            <svg className="w-4 h-4 text-blue-400 group-hover:text-blue-600 flex-shrink-0"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {/* Import from CSV */}
          <Link
            to="/leads/import"
            className="flex items-center gap-3 px-4 py-3 rounded-xl
                       bg-green-50 border border-green-100 hover:bg-green-100
                       active:bg-green-200 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-700">Import from CSV</p>
              <p className="text-xs text-green-500 mt-0.5 truncate">
                Bulk import leads from a spreadsheet
              </p>
            </div>
            <svg className="w-4 h-4 text-green-400 group-hover:text-green-600 flex-shrink-0"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Row 1: Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <div>
              <label className="label">Client Name <span className="text-red-400">*</span></label>
              <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} required />
            </div>
            <div>
              <label className="label">Mobile Number <span className="text-red-400">*</span></label>
              <input className="input" placeholder="+12025550123 or 9876543210" value={form.phone}
                onChange={set('phone')} inputMode="tel" required />
            </div>
          </div>

          {/* Row 2: Property Type + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <div>
              <label className="label">Property Type <span className="text-red-400">*</span></label>
              <select className="input" value={form.propertyType} onChange={set('propertyType')} required>
                <option value="">— Select —</option>
                {PROPERTY_TYPES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Target Location <span className="text-red-400">*</span></label>
              <input className="input" placeholder="e.g. Whitefield" value={form.targetLocation} onChange={set('targetLocation')} required />
            </div>
          </div>

          {/* Row 3: Plot Area (conditional) + Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            {form.propertyType === 'Plot' && (
              <div>
                <label className="label">Plot Area / Square Feet <span className="text-red-400">*</span></label>
                <input
                  className="input"
                  placeholder="e.g. 1500 sq ft, 30×50 plot"
                  value={form.plotSquareFeet}
                  onChange={set('plotSquareFeet')}
                  maxLength={50}
                />
              </div>
            )}
            <div className={form.propertyType === 'Plot' ? '' : 'sm:col-span-2 lg:col-span-1'}>
              <label className="label">Budget <span className="text-red-400">*</span></label>
              <input
                className="input"
                placeholder="e.g. 50 Lakh, 1 Cr, ₹1.25 Cr"
                value={form.budget}
                onChange={set('budget')}
                maxLength={100}
              />
            </div>
          </div>

          {/* Row 4: Follow-up Date + Site Visit Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <div>
              <label className="label">Follow-up Date &amp; Time</label>
              <input type="datetime-local" className="input" value={form.followUpDate} onChange={set('followUpDate')} />
            </div>
            <div>
              <label className="label">Site Visit Date &amp; Time</label>
              <input type="datetime-local" className="input" value={form.siteVisitDate} onChange={set('siteVisitDate')} />
              <p className="text-xs text-gray-400 mt-1">Creates a planned site visit entry</p>
            </div>
          </div>

          {/* Row 5: Call Notes */}
          <div>
            <label className="label">Call Notes</label>
            <textarea className="input" rows={3} placeholder="Notes from initial call or enquiry..."
              value={form.notes} onChange={set('notes')} />
          </div>

          {/* Row 6: Remarks */}
          <div>
            <label className="label">Remarks / Objection</label>
            <input className="input" placeholder="Optional" value={form.remarks} onChange={set('remarks')} />
          </div>

          {/* Row 7: Lead Source + Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <div>
              <label className="label">Lead Source</label>
              <select className="input" value={form.source} onChange={set('source')}>
                {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Purpose <span className="text-red-400">*</span></label>
              <select className="input" value={form.purpose} onChange={set('purpose')} required>
                <option value="">— Select —</option>
                {PURPOSE_OPTIONS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Row 8: Email (last — optional) */}
          <div>
            <label className="label">Email <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
            <input className="input" type="email" placeholder="client@example.com" value={form.email} onChange={set('email')} />
          </div>

          {/* Employee info banner */}
          {isEmployee && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700">
              This lead will be assigned to your account automatically.
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
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
            <button type="button" onClick={() => setForm(INITIAL)} className="btn-ghost">Reset</button>
          </div>
        </form>
      </div>
    </div>
  );
}
