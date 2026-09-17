import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../common/StatusBadge';
import FollowUpBadge from './FollowUpBadge';
import toast from 'react-hot-toast';
import { getWhatsAppUrl } from '../../utils/phoneUtils';

/**
 * KanbanBoard — three-column priority board.
 *
 * Columns: HOT | WARM | HOLD
 * Mapping: HOT→'Hot', WARM→'Warm', HOLD→'Cold'  (no new DB enum value)
 *
 * Drag-and-drop (admin/director/tl only):
 *   - Drop into a column → PUT /api/leads/:id { priority }
 *   - Optimistic update with rollback on API failure
 *
 * Employees (telecaller) can VIEW but not drag.
 */

// UI column → DB priority value mapping
const COLUMN_TO_PRIORITY = { HOT: 'Hot', WARM: 'Warm', HOLD: 'Cold' };
const PRIORITY_TO_COLUMN = { Hot: 'HOT', Warm: 'WARM', Cold: 'HOLD' };

const COLUMN_CONFIG = {
  HOT:  { label: 'HOT',  emoji: '🔥', color: 'border-red-300',    header: 'bg-red-50',    dot: 'bg-red-500'    },
  WARM: { label: 'WARM', emoji: '🌡️', color: 'border-orange-300', header: 'bg-orange-50', dot: 'bg-orange-400' },
  HOLD: { label: 'COLD', emoji: '❄️', color: 'border-blue-200',   header: 'bg-blue-50',   dot: 'bg-blue-400'   },
};

const COLUMNS = ['HOT', 'WARM', 'HOLD'];

function KanbanCard({ lead, index, canDrag, onClick }) {
  const card = (
    <div
      className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm
                 hover:shadow-md transition-shadow cursor-pointer select-none"
      onClick={() => onClick && onClick(lead)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{lead.name}</p>
        <StatusBadge status={lead.status} />
      </div>
      {lead.phone && (
        <div className="flex items-center gap-2 mb-1.5">
          <a
            href={`tel:${lead.phone}`}
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {lead.phone}
          </a>
          {getWhatsAppUrl(lead.phone) && (
            <a
              href={getWhatsAppUrl(lead.phone)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-green-500 hover:text-green-700"
              title="Open WhatsApp"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          )}
        </div>
      )}
      {lead.assignedTelecaller?.name && (
        <p className="text-xs text-gray-400 mb-1.5">
          👤 {lead.assignedTelecaller.name}
        </p>
      )}
      {lead.followUpDate && (
        <div className="mt-1.5">
          <FollowUpBadge followUpDate={lead.followUpDate} status={lead.status} size="sm" />
        </div>
      )}
      {lead.leadId && (
        <p className="text-xs font-mono text-gray-300 mt-1.5">{lead.leadId}</p>
      )}
    </div>
  );

  if (!canDrag) return card;

  return (
    <Draggable draggableId={lead._id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={snapshot.isDragging ? 'opacity-75 rotate-1' : ''}
        >
          {card}
        </div>
      )}
    </Draggable>
  );
}

export default function KanbanBoard({ leads, onPriorityChange, onCardClick }) {
  const { user } = useAuth();
  const canDrag = ['admin', 'director', 'tl'].includes(user?.role);

  // columns: { HOT: [leads], WARM: [leads], HOLD: [leads] }
  const [columns, setColumns] = useState({ HOT: [], WARM: [], HOLD: [] });

  useEffect(() => {
    const cols = { HOT: [], WARM: [], HOLD: [] };
    for (const lead of (leads || [])) {
      const col = PRIORITY_TO_COLUMN[lead.priority] || 'HOLD';
      cols[col].push(lead);
    }
    setColumns(cols);
  }, [leads]);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const srcCol  = source.droppableId;
    const dstCol  = destination.droppableId;
    const newPriority = COLUMN_TO_PRIORITY[dstCol];

    // Optimistic update
    const srcLeads  = [...columns[srcCol]];
    const dstLeads  = dstCol === srcCol ? srcLeads : [...columns[dstCol]];
    const [moved]   = srcLeads.splice(source.index, 1);
    const optimisticLead = { ...moved, priority: newPriority };

    if (dstCol === srcCol) {
      dstLeads.splice(destination.index, 0, optimisticLead);
      setColumns((prev) => ({ ...prev, [srcCol]: dstLeads }));
    } else {
      dstLeads.splice(destination.index, 0, optimisticLead);
      setColumns((prev) => ({ ...prev, [srcCol]: srcLeads, [dstCol]: dstLeads }));
    }

    try {
      await onPriorityChange(draggableId, newPriority);
    } catch {
      // Rollback on failure
      setColumns((prev) => {
        const rollback = { ...prev };
        // Re-derive from original leads
        const restored = { HOT: [], WARM: [], HOLD: [] };
        for (const lead of (leads || [])) {
          const col = PRIORITY_TO_COLUMN[lead.priority] || 'HOLD';
          restored[col].push(lead);
        }
        return restored;
      });
      toast.error('Failed to update priority — card returned to original position');
    }
  };

  return (
    <div className="w-full overflow-x-auto pb-4">
      {!canDrag && (
        <p className="text-xs text-gray-400 mb-3 text-center">
          View only — contact your Team Lead to change priority.
        </p>
      )}
      <DragDropContext onDragEnd={canDrag ? onDragEnd : () => {}}>
        <div className="flex gap-4 min-w-[680px]">
          {COLUMNS.map((colKey) => {
            const config = COLUMN_CONFIG[colKey];
            const colLeads = columns[colKey] || [];
            return (
              <div key={colKey} className={`flex-1 flex flex-col rounded-xl border-2 ${config.color} overflow-hidden`}>
                {/* Column header */}
                <div className={`flex items-center gap-2 px-4 py-2.5 ${config.header}`}>
                  <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                  <span className="text-sm font-bold text-gray-700 tracking-wide">
                    {config.emoji} {config.label}
                  </span>
                  <span className="ml-auto text-xs font-medium text-gray-400 bg-white/70
                                   rounded-full px-2 py-0.5">
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards drop zone */}
                <Droppable droppableId={colKey} isDropDisabled={!canDrag}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-3 space-y-2.5 min-h-[120px] transition-colors
                        ${snapshot.isDraggingOver && canDrag ? 'bg-gray-50' : 'bg-white/60'}`}
                    >
                      {colLeads.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-gray-300 text-center py-4">No leads</p>
                      )}
                      {colLeads.map((lead, idx) => (
                        <KanbanCard
                          key={lead._id}
                          lead={lead}
                          index={idx}
                          canDrag={canDrag}
                          onClick={onCardClick}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
