import type { DayLog } from '../types';
import { FLOW_LABELS, PAIN_LABELS } from '../types';
import { regionLabel } from '../lib/insights';

/** Read-only view of what was logged on a day. */
export function DaySummary({ log, empty }: { log?: DayLog; empty: string }) {
  if (!log) return <p className="muted">{empty}</p>;
  const items = [
    ...log.symptoms,
    ...log.moods,
    ...log.tags,
    ...Object.entries(log.pain ?? {}).map(([id, level]) => `${regionLabel(id)} pain · ${PAIN_LABELS[level].toLowerCase()}`),
  ];
  return (
    <div className="summary">
      {log.flow ? (
        <p className="summary-flow">
          <span className={`flow-dot flow-dot-${log.flow}`} aria-hidden="true" />
          {log.flow === 1 ? 'Spotting' : `${FLOW_LABELS[log.flow]} flow`}
        </p>
      ) : null}
      {items.length > 0 && (
        <div className="chips">
          {items.map((i) => (
            <span key={i} className="chip chip-static">
              {i}
            </span>
          ))}
        </div>
      )}
      {log.notes && <p className="summary-notes">{log.notes}</p>}
    </div>
  );
}
