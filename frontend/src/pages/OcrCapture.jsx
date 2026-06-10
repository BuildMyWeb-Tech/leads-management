import { useState, useRef, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { runOCR, extractLeads, prepareImage } from '../utils/ocrEngine';
import ImageDropZone from '../components/ocr/ImageDropZone';
import OcrProgressBar from '../components/ocr/OcrProgressBar';
import ImportPreviewModal from '../components/ocr/ImportPreviewModal';
import toast from 'react-hot-toast';
import { getSharedImage } from '../utils/registerSW';

const STAGE = { IDLE: 'idle', LOADING: 'loading', EXTRACTED: 'extracted', DONE: 'done' };

function QueueItem({ item, onRemove }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
        <img src={item.preview} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{item.file.name}</p>
        <p className="text-xs text-gray-400">
          {item.status === 'pending'  && 'Waiting…'}
          {item.status === 'scanning' && (
            <span className="text-blue-500 font-medium">Scanning… {item.progress}%</span>
          )}
          {item.status === 'done'     && (
            <span className="text-green-600 font-medium">
              ✓ {item.leadsFound} lead{item.leadsFound !== 1 ? 's' : ''} found
            </span>
          )}
          {item.status === 'error' && <span className="text-red-500">Failed</span>}
        </p>
      </div>
      {item.status === 'pending' && (
        <button
          onClick={() => onRemove(item.id)}
          className="text-gray-300 hover:text-red-400 transition-colors touch-manipulation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function RawTextPanel({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1
                   touch-manipulation"
      >
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Hide' : 'Show'} raw OCR text
      </button>
      {open && (
        <pre className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200
                        rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono
                        scrollbar-thin">
          {text || '(empty)'}
        </pre>
      )}
    </div>
  );
}

export default function OcrCapture() {
const location = useLocation();

const [queue, setQueue] = useState([]);
const [stage, setStage] = useState(STAGE.IDLE);
const [ocrProgress, setOcrProgress] = useState(0);
const [ocrStage, setOcrStage] = useState('');
const [allLeads, setAllLeads] = useState([]);
const [showModal, setShowModal] = useState(false);
const [importedCount, setImportedCount] = useState(0);
const [currentImage, setCurrentImage] = useState(null);

const multiInputRef = useRef(null);

const addFiles = useCallback((files) => {
  const arr = Array.isArray(files) ? files : [files];

  const items = arr.map((f) => ({
    id: `${Date.now()}-${Math.random()}`,
    file: f,
    preview: URL.createObjectURL(f),
    status: 'pending',
    progress: 0,
    leadsFound: 0,
    rawText: '',
    leads: [],
  }));

  setQueue((prev) => [...prev, ...items]);
}, []);

useEffect(() => {
  const params = new URLSearchParams(location.search);

  if (params.get('shared') === '1') {
    getSharedImage()
      .then((file) => {
        if (file) {
          toast.success('Image received from share!');
          addFiles([file]);
        }
      })
      .catch((err) => {
        console.error('Failed to get shared image:', err);
      });
  }
}, [location.search, addFiles]);

useEffect(() => {
  return () => {
    queue.forEach((item) => {
      if (item.preview) {
        URL.revokeObjectURL(item.preview);
      }
    });
  };
}, [queue]);

  const removeFromQueue = (id) =>
    setQueue((prev) => prev.filter((i) => i.id !== id));

  const handleSingleFile = useCallback((file) => {
    addFiles([file]);
    setCurrentImage(URL.createObjectURL(file));
  }, [addFiles]);

  const handleMultiFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  const handleScanAll = async () => {
    const pending = queue.filter((i) => i.status === 'pending');
    if (pending.length === 0) { toast.error('No images to scan'); return; }

    setStage(STAGE.LOADING);
    const collectedLeads = [];

    for (const item of pending) {
      setQueue((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: 'scanning', progress: 0 } : i)
      );
      try {
        const prepared = await prepareImage(item.file);
        const rawText  = await runOCR(prepared, (pct) => {
          setOcrProgress(pct);
          setOcrStage('recognizing');
          setQueue((prev) =>
            prev.map((i) => i.id === item.id ? { ...i, progress: pct } : i)
          );
        });
        const leads = extractLeads(rawText);
        collectedLeads.push(...leads);
        setQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'done', leadsFound: leads.length, rawText, leads }
              : i
          )
        );
      } catch (err) {
        console.error('OCR error:', err);
        setQueue((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, status: 'error' } : i)
        );
        toast.error(`Failed to scan ${item.file.name}`);
      }
    }

    const seen  = new Set();
    const dedup = collectedLeads.filter((l) => {
      if (seen.has(l.phone)) return false;
      seen.add(l.phone);
      return true;
    });

    setAllLeads(dedup);
    setStage(STAGE.EXTRACTED);

    if (dedup.length === 0) {
      toast.error('No phone numbers found. Try a clearer screenshot.');
    } else {
      toast.success(`${dedup.length} lead${dedup.length !== 1 ? 's' : ''} extracted!`);
      setShowModal(true);
    }
  };

  const handleImported = (count) => {
    setImportedCount(count);
    setStage(STAGE.DONE);
  };

const handleReset = () => {
  queue.forEach((item) => {
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
    }
  });

  setQueue([]);
  setAllLeads([]);
  setStage(STAGE.IDLE);
  setOcrProgress(0);
  setOcrStage('');
  setCurrentImage(null);
  setShowModal(false);
  setImportedCount(0);
};

  const pendingCount    = queue.filter((i) => i.status === 'pending').length;
  const doneCount       = queue.filter((i) => i.status === 'done').length;

  return (
    <>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link to="/leads" className="text-gray-400 hover:text-gray-600 touch-manipulation p-1 -m-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h2 className="page-title">OCR Lead Capture</h2>
            <p className="text-sm text-gray-400 mt-0.5 hidden sm:block">
              Extract leads from screenshots, WhatsApp contacts, or ad images
            </p>
          </div>
        </div>

        {/* Done state */}
        {stage === STAGE.DONE ? (
          <div className="card text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center
                            justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900">
              {importedCount} lead{importedCount !== 1 ? 's' : ''} imported!
            </h3>
            <p className="text-sm text-gray-400 mt-2 mb-6">
              Auto-allocated to directors via your ratio engine.
            </p>
            <div className="flex gap-3 justify-center">
              <Link to="/leads" className="btn-primary">View leads →</Link>
              <button onClick={handleReset} className="btn-ghost">Scan more</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {stage !== STAGE.LOADING && (
              <ImageDropZone onFile={handleSingleFile} disabled={stage === STAGE.LOADING} />
            )}

            {stage === STAGE.LOADING && (
              <OcrProgressBar progress={ocrProgress} stage={ocrStage} />
            )}

            {queue.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">
                    Queue ({queue.length})
                  </h3>
                  <div className="flex gap-2">
                    <input
                      ref={multiInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleMultiFiles}
                      capture="environment"
                    />
                    <button
                      onClick={() => multiInputRef.current?.click()}
                      disabled={stage === STAGE.LOADING}
                      className="btn-ghost text-xs py-1.5"
                    >
                      + Add more
                    </button>
                    {pendingCount > 0 && (
                      <button
                        onClick={handleScanAll}
                        disabled={stage === STAGE.LOADING}
                        className="btn-primary text-xs py-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                          stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Scan {pendingCount}
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {queue.map((item) => (
                    <QueueItem key={item.id} item={item} onRemove={removeFromQueue} />
                  ))}
                </div>
                {queue.filter((i) => i.rawText).map((item) => (
                  <RawTextPanel key={item.id} text={item.rawText} />
                ))}
              </div>
            )}

            {stage === STAGE.EXTRACTED && allLeads.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">
                      {allLeads.length} lead{allLeads.length !== 1 ? 's' : ''} found
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Across {doneCount} image{doneCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button onClick={() => setShowModal(true)} className="btn-primary text-sm">
                    Review & Import →
                  </button>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                  {allLeads.map((lead) => (
                    <div key={lead.id}
                      className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center
                                      justify-center text-xs font-bold text-blue-700 flex-shrink-0">
                        {(lead.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {lead.name || <span className="text-gray-400 italic">Unknown</span>}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-gray-500 flex-shrink-0">
                        {lead.phone}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stage === STAGE.IDLE && queue.length === 0 && (
              <div className="card">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  What works best
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: '📱', title: 'WhatsApp contacts',  desc: 'Contact card with name & number' },
                    { icon: '📋', title: 'Contact card',       desc: 'Screenshot from any app' },
                    { icon: '📢', title: 'Ad screenshots',     desc: 'Property ads with phone numbers' },
                    { icon: '🖼️', title: 'Multiple contacts',  desc: 'Group screenshot' },
                  ].map((tip) => (
                    <div key={tip.title} className="bg-gray-50 rounded-xl p-3">
                      <span className="text-xl">{tip.icon}</span>
                      <p className="text-xs font-semibold text-gray-700 mt-1">{tip.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{tip.desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">
                    💡 Tips for best results
                  </p>
                  <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
                    <li>Use high-resolution, unblurred screenshots</li>
                    <li>Ensure phone numbers are clearly visible</li>
                    <li>Can scan multiple images at once</li>
                    <li>Duplicate numbers are automatically detected</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <ImportPreviewModal
          leads={allLeads}
          onClose={() => setShowModal(false)}
          onImported={handleImported}
        />
      )}
    </>
  );
}