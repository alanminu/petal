import { useMemo, useState } from 'react';
import { AddPeriodForm } from '../components/AddPeriodForm';
import { useCycle } from '../hooks';
import { BodyMap } from '../components/BodyMap';
import { fmtRange } from '../lib/dates';
import { findInsights, painSummary, regionLabel } from '../lib/insights';
import { useStore } from '../store';

const num = (n: number | undefined) => (n === undefined ? '–' : n.toFixed(1).replace(/\.0$/, ''));

export function History() {
  const { data } = useStore();
  const { cycles, periods, stats, forecast } = useCycle();
  const [adding, setAdding] = useState(false);
  const insights = useMemo(() => findInsights(data.logs, periods), [data.logs, periods]);
  const pain = useMemo(() => painSummary(data.logs, periods), [data.logs, periods]);
  const painRegions = Object.entries(pain.days).sort((a, b) => b[1] - a[1]);
  const longest = Math.max(35, ...cycles.filter((c) => c.counted).map((c) => c.length!));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>History</h1>
      </header>

      <section className="stats">
        <div className="card stat">
          <p className="eyebrow">Average cycle</p>
          <p className="big">{num(stats.avgCycle)}<small> days</small></p>
        </div>
        <div className="card stat">
          <p className="eyebrow">Variation</p>
          <p className="big">{stats.variation === undefined ? '–' : `±${num(stats.variation)}`}<small> days</small></p>
        </div>
        <div className="card stat">
          <p className="eyebrow">Average period</p>
          <p className="big">{num(stats.avgPeriod)}<small> days</small></p>
        </div>
        <div className="card stat">
          <p className="eyebrow">Cycles logged</p>
          <p className="big">{stats.totalCycles}</p>
        </div>
      </section>
      {stats.cyclesUsed > 0 && (
        <p className="fine">Averages use the {stats.cyclesUsed} most recent complete cycle{stats.cyclesUsed === 1 ? '' : 's'}.</p>
      )}

      <section className="card">
        <h2>Patterns</h2>
        {insights.length === 0 ? (
          <p className="muted">
            Patterns appear here once the same symptom, mood or tag has shown up at the same point in at least two cycles.
          </p>
        ) : (
          <ul className="plain-list">
            {insights.map((i) => (
              <li key={i.text}>{i.text}</li>
            ))}
          </ul>
        )}
      </section>

      {painRegions.length > 0 && (
        <section className="card">
          <h2>Where it hurts most</h2>
          <p className="fine">Strongest level logged in each area over recent cycles.</p>
          <BodyMap levels={pain.peak} />
          <ul className="plain-list">
            {painRegions.slice(0, 4).map(([id, days]) => (
              <li key={id}>
                {regionLabel(id)}: {days} day{days === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="row">
          <h2>Cycles</h2>
          <button type="button" className="btn btn-soft btn-small" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close' : 'Add past period'}
          </button>
        </div>
        {adding && <AddPeriodForm onDone={() => setAdding(false)} />}

        {cycles.length === 0 ? (
          <p className="muted">No periods logged yet. Add one above, in any order.</p>
        ) : (
          <ol className="cycles">
            {[...cycles].reverse().map((c) => {
              const length = c.length ?? forecast?.cycleDay ?? c.period.days;
              const width = Math.min(100, (length / longest) * 100);
              return (
                <li key={c.start}>
                  <div className="row">
                    <strong>{fmtRange(c.period.start, c.period.end)}</strong>
                    <span className="muted">
                      {c.length === undefined ? `Day ${forecast?.cycleDay ?? 1} so far` : `${c.length}-day cycle`}
                    </span>
                  </div>
                  <div className="bar" style={{ width: `${width}%` }}>
                    <span style={{ width: `${Math.min(100, (c.period.days / length) * 100)}%` }} />
                  </div>
                  <p className="fine">
                    {c.period.days}-day period
                    {c.length !== undefined && !c.counted && ' · long gap, left out of the averages'}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
