import { useState } from 'react';
import { SITE_VISIT_STATUS_LABELS, SITE_VISIT_BADGE_CLASSES } from '../../constants/leadConstants';

const toDatetimeLocal = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

/**
 * SiteVisitHistory — lists existing siteVisits entries (append-only,
 * backend-owned — Lead.js siteVisitSchema, Phase B/C) and offers a
 * small "Add site visit" form that POSTs a single new entry via the
 * existing PUT /api/leads/:id `siteVisit` field (leadsController.js /
 * telecallerController.js appendSiteVisit — never overwrites prior
 * entries, so rescheduling always preserves history). No separate
 * frontend-only site-visit model is created.
 */
export default function SiteVisitHistory({ lead, onSave, canEdit }) {
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState('planned');
  const [plannedDate, setPlannedDate] = useState('');
  const [completedDate, setCompletedDate] = useState('');
  const [assignedAgent, setAssignedAgent] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const visits = lead.siteVisits || [];

  const reset = () => {
    setStatus('planned'); setPlannedDate(''); setCompletedDate('');
    setAssignedAgent(''); setNotes(''); setAdding(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'planned' && !plannedDate) return;
    if (status === 'completed' && !completedDate) return;
    setSaving(true);
    try {
      await onSave(lead._id, {
        siteVisit: {
          status,
          plannedDate:   plannedDate   ? new Date(plannedDate).toISOString()   : null,
          completedDate: completedDate ? new Date(completedDate).toISOString() : null,
          assignedAgent,
          notes,
        },
      });
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {visits.length === 0 ? (
        <p className="text-sm text-gray-300">No site visits recorded yet.</p>
      ) : (
        <ol className="space-y-2">
          {[...visits].reverse().map((v, i) => {
            const cls = SITE_VISIT_BADGE_CLASSES[v.status] || 'bg-gray-100 text-gray-500 ring-gray-200';
            const label = SITE_VISIT_STATUS_LABELS[v.status] || v.status;
            return (
              <li key={v._id || i} className="flex items-start gap-3 text-sm bg-gray-50 rounded-lg p-2.5">
                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cls}`}>
                  {label}
                </span>
                <div className="min-w-0 flex-1">
                  {v.status === 'completed' && v.completedDate && (
                    <p className="text-xs text-gray-600">
                      Completed: <span className="font-medium">{new Date(v.completedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </p>
                  )}
                  {v.status !== 'completed' && v.plannedDate && (
                    <p className="text-xs text-gray-600">
                      Expected: <span className="font-medium">{new Date(v.plannedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </p>
                  )}
                  {v.assignedAgent && <p className="text-xs text-gray-500">Agent: {v.assignedAgent}</p>}
                  {v.notes && <p className="text-xs text-gray-500 mt-0.5 break-words">{v.notes}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canEdit && !adding && (
        <button type="button" onClick={() => setAdding(true)} className="btn-ghost text-xs px-2 py-1.5 min-h-0">
          + Add site visit
        </button>
      )}

      {canEdit && adding && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label text-xs">Status</label>
              <select className="input-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {status === 'completed' ? (
              <div>
                <label className="label text-xs">Completed date</label>
                <input type="date" className="input-sm" value={completedDate}
                  onChange={(e) => setCompletedDate(e.target.value)} required />
              </div>
            ) : (
              <div>
                <label className="label text-xs">Expected date</label>
                <input type="date" className="input-sm" value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  required={status === 'planned'} />
              </div>
            )}
          </div>
          <div>
            <label className="label text-xs">Assigned agent</label>
            <input className="input-sm" value={assignedAgent} onChange={(e) => setAssignedAgent(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="label text-xs">Notes</label>
            <textarea className="input-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : 'Save visit'}
            </button>
            <button type="button" onClick={reset} className="px-3 bg-gray-100 text-gray-600 text-xs font-medium py-2 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export { toDatetimeLocal };
