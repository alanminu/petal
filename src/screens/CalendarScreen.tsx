import { useMemo, useState } from 'react';
import { DaySummary } from '../components/DaySummary';
import { useCycle } from '../hooks';
import { addDays, fmtLong, fmtRange, fromISO, toISO } from '../lib/dates';
import { useStore } from '../store';
import type { ISODate } from '../types';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function eachDay(from: ISODate, to: ISODate, fn: (d: ISODate) => void) {
  for (let d = from; d <= to; d = addDays(d, 1)) fn(d);
}

export function CalendarScreen({ onLog }: { onLog(date: ISODate): void }) {
  const { data } = useStore();
  const { today, periods, forecast } = useCycle();
  const [cursor, setCursor] = useState(() => {
    const t = fromISO(today);
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const [selected, setSelected] = useState<ISODate>(today);

  // Which future days fall in a predicted period range or an estimated fertile window.
  const marks = useMemo(() => {
    const predicted = new Set<ISODate>();
    const likely = new Set<ISODate>();
    const fertile = new Set<ISODate>();
    const lastEnd = periods[periods.length - 1]?.end ?? '';
    for (const p of forecast?.upcoming ?? []) {
      eachDay(p.earliest, p.latest, (d) => d > today && predicted.add(d));
      if (p.likely > today) likely.add(p.likely);
      eachDay(p.fertileStart, p.fertileEnd, (d) => d > lastEnd && fertile.add(d));
    }
    return { predicted, likely, fertile };
  }, [forecast, periods, today]);

  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (ISODate | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toISO(new Date(cursor.y, cursor.m, i + 1))),
  ];

  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const selectedPrediction = forecast?.upcoming.find((p) => selected >= p.earliest && selected <= p.latest);

  return (
    <div className="screen">
      <header className="screen-head row">
        <h1>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h1>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => move(-1)}>‹</button>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => move(1)}>›</button>
        </div>
      </header>

      <section className="card">
        <div className="cal">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="cal-weekday">{w}</span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={`blank-${i}`} />;
            const log = data.logs[d];
            const flow = log?.flow ?? 0;
            const cls = [
              'cal-day',
              flow >= 2 && 'is-period',
              flow === 1 && 'is-spotting',
              marks.predicted.has(d) && 'is-predicted',
              marks.likely.has(d) && 'is-likely',
              marks.fertile.has(d) && flow < 2 && 'is-fertile',
              d === today && 'is-today',
              d === selected && 'is-selected',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button key={d} type="button" className={cls} aria-label={fmtLong(d)} aria-pressed={d === selected} onClick={() => setSelected(d)}>
                {Number(d.slice(8))}
                {log && flow < 2 && <span className="cal-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <ul className="legend">
          <li><span className="swatch swatch-period" />Period</li>
          <li><span className="swatch swatch-predicted" />Expected range</li>
          <li><span className="swatch swatch-fertile" />Fertile estimate</li>
        </ul>
      </section>

      <section className="card">
        <div className="row">
          <h2>{fmtLong(selected)}</h2>
          {selected <= today && (
            <button type="button" className="btn btn-soft btn-small" onClick={() => onLog(selected)}>
              {data.logs[selected] ? 'Edit' : 'Log'}
            </button>
          )}
        </div>
        {selected <= today ? (
          <DaySummary log={data.logs[selected]} empty="Nothing logged for this day." />
        ) : selectedPrediction ? (
          <p className="muted">
            Inside the expected range for a period ({fmtRange(selectedPrediction.earliest, selectedPrediction.latest)}).
          </p>
        ) : marks.fertile.has(selected) ? (
          <p className="muted">Inside the estimated fertile window. This is a rough estimate only.</p>
        ) : (
          <p className="muted">Nothing expected on this day.</p>
        )}
      </section>
    </div>
  );
}
