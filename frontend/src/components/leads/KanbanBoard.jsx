import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../common/StatusBadge';
import FollowUpBadge from './FollowUpBadge';
import toast from 'react-hot-toast';

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
  HOLD: { label: 'HOLD', emoji: '❄️', color: 'border-blue-200',   header: 'bg-blue-50',   dot: 'bg-blue-400'   },
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
        <a
          href={`tel:${lead.phone}`}
          className="text-xs text-blue-500 hover:underline block mb-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {lead.phone}
        </a>
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
