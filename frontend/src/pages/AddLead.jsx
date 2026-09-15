import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
  LEAD_SOURCES, PROPERTY_TYPES, PURPOSE_OPTIONS,
} from '../constants/leadConstants';
import toast from 'react-hot-toast';

const BUDGETS = ['Under 40L', '40L–60L', '60L–80L', '80L–1Cr', '1Cr–1.5Cr', '1.5Cr+'];

const INITIAL = {
  name: '', phone: '', email: '',
  source: 'Other',
  propertyType: '', plotSquareFeet: '',
  targetLocation: '', budget: '', purpose: '',
  propertyInterest: '', remarks: '', notes: '',
  followUpDate: '',
  siteVisitDate: '',
};

/**
 * Validates a phone number for international support.
 * Accepts any number with 6–15 digits after stripping separators,
 * with an optional leading + (E.164 country-code prefix).
 */
const isValidPhone = (raw) => {
  if (!raw) return false;
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
};

/**
 * PHASE D / K2: Lead ID, Capture Date, and Priority are intentionally NOT
 * fields in this form — they are generated/controlled entirely by the
 * backend. The form never sends them.
 *
 * K2: plotSquareFeet is now free-text (no dropdown).
 * K2: siteVisitDate creates a siteVisits[] entry via appendSiteVisit.
 * K2: Employee (telecaller) can access this form; server enforces self-ownership.
 */
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
    // K2: plotSquareFeet is free-text — just require it is non-empty when propertyType is Plot
    if (form.propertyType === 'Plot' && !form.plotSquareFeet.trim()) {
      toast.error('Plot Area is required when Property Type is Plot');
      return false;
    }
    if (!form.targetLocation.trim()) {
      toast.error('Target Location is required');
      return false;
    }
    if (!form.budget) {
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
      // House (or unset) never carries a plot size
      if (payload.propertyType !== 'Plot') payload.plotSquareFeet = '';
      if (payload.followUpDate) payload.followUpDate = new Date(payload.followUpDate).toISOString();
      else delete payload.followUpDate;

      // K2: site visit date → siteVisit object using existing siteVisits[] architecture
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
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <Link to="/leads" className="text-gray-400 hover:text-gray-600 touch-manipulation p-1 -m-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="page-title">Add New Lead</h2>
      </div>

      {/* Add Leads from Image — OCR shortcut for admin/director/tl */}
      {!isEmployee && (
        <Link
          to="/ocr-capture"
          className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl
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
              Scan a brochure or business card to auto-fill lead details
            </p>
          </div>
          <svg className="w-4 h-4 text-blue-400 group-hover:text-blue-600 flex-shrink-0"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Contact details */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Contact details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Client Name <span className="text-red-400">*</span></label>
                <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} required />
              </div>
              <div>
                <label className="label">Mobile Number <span className="text-red-400">*</span></label>
                <input className="input" placeholder="+12025550123 or 9876543210" value={form.phone}
                  onChange={set('phone')} inputMode="tel" required />
                <p className="text-xs text-gray-400 mt-1">Any format — Indian or international</p>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="Optional" value={form.email} onChange={set('email')} />
              </div>
            </div>
          </div>

          {/* Requirement details */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Requirement details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Source</label>
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
              <div>
                <label className="label">Property Type <span className="text-red-400">*</span></label>
                <select className="input" value={form.propertyType} onChange={set('propertyType')} required>
                  <option value="">— Select —</option>
                  {PROPERTY_TYPES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              {form.propertyType === 'Plot' && (
                <div>
                  {/* K2: free-text input replaces fixed dropdown */}
                  <label className="label">Plot Area <span className="text-red-400">*</span></label>
                  <input
                    className="input"
                    placeholder="e.g. 1500 sq ft, 30×50 plot"
                    value={form.plotSquareFeet}
                    onChange={set('plotSquareFeet')}
                    maxLength={50}
                    required
                  />
                </div>
              )}
              <div>
                <label className="label">Target Location <span className="text-red-400">*</span></label>
                <input className="input" placeholder="e.g. Whitefield" value={form.targetLocation} onChange={set('targetLocation')} required />
              </div>
              <div>
                <label className="label">Budget <span className="text-red-400">*</span></label>
                <select className="input" value={form.budget} onChange={set('budget')} required>
                  <option value="">— Select —</option>
                  {BUDGETS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Property Interest (details)</label>
                <input className="input" placeholder="Optional free-text description"
                  value={form.propertyInterest} onChange={set('propertyInterest')} />
              </div>
            </div>
          </div>

          {/* Follow-up, Site Visit, Remarks */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Scheduling (optional)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Next Follow-Up Date &amp; Time</label>
                <input type="datetime-local" className="input" value={form.followUpDate} onChange={set('followUpDate')} />
              </div>
              {/* K2: Site Visit Date field */}
              <div>
                <label className="label">Site Visit Date &amp; Time</label>
                <input type="datetime-local" className="input" value={form.siteVisitDate} onChange={set('siteVisitDate')} />
                <p className="text-xs text-gray-400 mt-1">Creates a planned site visit entry</p>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Remarks / Objection</label>
                <input className="input" placeholder="Optional" value={form.remarks} onChange={set('remarks')} />
              </div>
            </div>
          </div>

          {/* Call Notes (K2: renamed from Notes) */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Call Notes
            </h3>
            <textarea className="input" rows={3} placeholder="Notes from initial call or enquiry..."
              value={form.notes} onChange={set('notes')} />
          </div>

          {/* Employee info banner — server will auto-assign this lead to you */}
          {isEmployee && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700">
              This lead will be assigned to your account automatically.
            </div>
          )}

          {/* Actions */}
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
