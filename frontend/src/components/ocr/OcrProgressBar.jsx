export default function OcrProgressBar({ progress, stage }) {
  const stages = [
    { key: 'loading',      label: 'Loading OCR engine', pct: 10  },
    { key: 'initializing', label: 'Initialising',        pct: 25  },
    { key: 'recognizing',  label: 'Reading text',        pct: 90  },
    { key: 'done',         label: 'Done',                pct: 100 },
  ];

  const currentStage = stages.find((s) => stage?.includes(s.key)) || stages[0];
  const displayPct   = Math.max(progress || 0, currentStage.pct > progress ? 0 : currentStage.pct);

  return (
    <div className="bg-white rounded-2xl border border-blue-100 p-6 text-center space-y-4">
      <div className="flex justify-center">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 text-blue-100" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" />
          </svg>
          <svg className="w-14 h-14 text-blue-500 absolute inset-0 animate-spin"
            viewBox="0 0 56 56" fill="none" style={{ animationDuration: '1.5s' }}>
            <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4"
              strokeDasharray="30 120" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24"
              stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-800">{currentStage.label}…</p>
        <p className="text-xs text-gray-400 mt-0.5">Extracting phone numbers and names</p>
      </div>

      <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${displayPct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">{displayPct}%</p>
    </div>
  );
}