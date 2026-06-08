import { useState, useEffect } from 'react';
import api from '../../utils/api';
import LeadPreviewCard from './LeadPreviewCard';
import toast from 'react-hot-toast';

/**
 * ImportPreviewModal — shows OCR-extracted leads before confirming import.
 *
 * Steps:
 *  1. On open: POST /api/ocr/check-duplicates  → mark duplicates
 *  2. User reviews / edits / deselects leads
 *  3. On confirm: POST /api/ocr/import → import selected non-duplicate leads
 */
export default function ImportPreviewModal({ leads: initialLeads, onClose, onImported }) {
  const [leads, setLeads]         = useState([]);
  const [checking, setChecking]   = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);

  // Step 1: duplicate check on mount
  useEffect(() => {
    if (!initialLeads?.length) return;

    const enriched = initialLeads.map((l, i) => ({
      ...l,
      id:       l.id || `ocr-${i}-${l.phone}`,
      source:   l.source || 'Other',
      selected: true,
      isDuplicate: false,
      existing: null,
    }));

    const phones = enriched.map((l) => l.phone);
    setLeads(enriched);
    setChecking(true);

    api.post('/ocr/check-duplicates', { phones })
      .then(({ data }) => {
        setLeads((prev) =>
          prev.map((lead) => {
            const hit = data.results.find((r) => r.normalised === lead.phone || r.phone === lead.phone);
            if (hit?.isDuplicate) {
              return { ...lead, isDuplicate: true, selected: false, existing: hit.existing };
            }
            return lead;
          })
        );
      })
      .catch(() => toast.error('Duplicate check failed — proceeding without check'))
      .finally(() => setChecking(false));
  }, [initialLeads]);

  const handleChange = (id, updated) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
  };

  const selectedLeads   = leads.filter((l) => l.selected && !l.isDuplicate);
  const duplicateCount  = leads.filter((l) => l.isDuplicate).length;
  const deselectedCount = leads.filter((l) => !l.selected && !l.isDuplicate).length;

  const selectAll   = () => setLeads((prev) => prev.map((l) => l.isDuplicate ? l : { ...l, selected: true  }));
  const deselectAll = () => setLeads((prev) => prev.map((l) => ({ ...l, selected: false })));

  // Step 3: import
  const handleImport = async () => {
    if (selectedLeads.length === 0) {
      toast.error('No leads selected to import');
      return;
    }

    // Validate phones
    const invalid = selectedLeads.filter((l) => !/^[6-9]\d{9}$/.test(l.phone));
    if (invalid.length > 0) {
      toast.error(`${invalid.length} lead(s) have invalid phone numbers`);
      return;
    }

    setImporting(true);
    try {
      const { data } = await api.post('/ocr/import', {
        leads: selectedLeads.map((l) => ({
          name:   l.name  || 'Unknown',
          phone:  l.phone,
          source: l.source || 'Other',
          notes:  l.extra  || '',
        })),
      });
      setResult(data);
      toast.success(data.message);
      onImported?.(data.imported);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && !importing) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [importing, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={!importing ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-4 bottom-4 max-w-2xl mx-auto bg-white z-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Review extracted leads</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {leads.length} found · {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} · {selectedLeads.length} ready to import
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-4 px-6 py-2.5 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs text-gray-600">{selectedLeads.length} selected</span>
          </div>
          {duplicateCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-xs text-gray-600">{duplicateCount} duplicate</span>
            </div>
          )}
          {deselectedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              <span className="text-xs text-gray-600">{deselectedCount} skipped</span>
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={selectAll}   className="text-xs text-blue-600 hover:underline">Select all</button>
            <span className="text-gray-300">·</span>
            <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">Deselect all</button>
          </div>
        </div>

        {/* Body — lead cards */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {checking ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm text-gray-500">Checking for duplicates…</p>
            </div>
          ) : result ? (
            /* Import result screen */
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{result.imported} lead{result.imported !== 1 ? 's' : ''} imported!</p>
                {result.skipped?.length > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    {result.skipped.length} skipped (duplicates)
                  </p>
                )}
              </div>
              <button onClick={onClose} className="btn-primary mt-2">
                Done
              </button>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-gray-400">No leads found in this image.</p>
              <p className="text-xs text-gray-400 mt-1">Try a clearer screenshot with visible phone numbers.</p>
            </div>
          ) : (
            leads.map((lead) => (
              <LeadPreviewCard
                key={lead.id}
                lead={lead}
                onChange={handleChange}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">
              Auto-allocates to directors using your configured ratios.
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={importing} className="btn-ghost">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || checking || selectedLeads.length === 0}
                className="btn-primary"
              >
                {importing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Importing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
