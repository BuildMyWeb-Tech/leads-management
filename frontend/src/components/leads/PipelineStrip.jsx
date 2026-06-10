import { STATUS_CONFIG, STATUS_BADGE_CLASSES } from '../../constants/leadConstants';

const PIPELINE_STAGES = [
  'New','Allocated','Called','Follow Up',
  'Site Visit Planned','Site Visit Done',
  'Interested','Negotiation','Booked',
];
const DEAD_STATUSES = ['Wrong Number','Not Interested','Closed'];

export default function PipelineStrip({ currentStatus }) {
  const config = STATUS_CONFIG?.[currentStatus] || {};
  const isDead = DEAD_STATUSES.includes(currentStatus);
  const currentStage = config.stage || 0;

  if (isDead) {
    const cls = STATUS_BADGE_CLASSES[currentStatus] || 'bg-gray-100 text-gray-500 ring-gray-200';
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cls}`}>
          {currentStatus}
        </span>
        <span className="text-xs text-gray-400">— lead closed</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {PIPELINE_STAGES.map((stage, i) => {
        const stageNum = i + 1;
        const isActive = stage === currentStatus;
        const isPast   = stageNum < currentStage;

        let dotClass = '';
        let lineClass = '';

        if (isActive) {
          dotClass = 'w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200';
        } else if (isPast) {
          dotClass = 'w-2 h-2 rounded-full bg-green-400';
        } else {
          dotClass = 'w-2 h-2 rounded-full bg-gray-200';
        }

        lineClass = isPast || isActive ? 'bg-green-300' : 'bg-gray-200';

        return (
          <div key={stage} className="flex items-center gap-0.5" title={stage}>
            <div className={`${dotClass} transition-all flex-shrink-0`} />
            {i < PIPELINE_STAGES.length - 1 && (
              <div className={`h-0.5 w-3 ${lineClass} transition-all flex-shrink-0`} />
            )}
          </div>
        );
      })}
      <span className="ml-1.5 text-xs text-gray-500">{currentStatus}</span>
    </div>
  );
}