import { AddPeriodForm } from '../components/AddPeriodForm';
import { CycleRing } from '../components/CycleRing';
import { DaySummary } from '../components/DaySummary';
import { CalmCard, FirstPeriodCard, NudgeCard, SuppliesCard } from '../components/TodayCards';
import type { useOwnerSync } from '../sync';
import { phaseLabel, useCycle } from '../hooks';
import { diffDays, fmtLong, fmtRange } from '../lib/dates';
import { useStore } from '../store';
import type { ISODate } from '../types';

const CONFIDENCE = {
  low: 'Wide estimate',
  medium: 'Fair estimate',
  high: 'Close estimate',
} as const;

export function Today({ onLog, sync }: { onLog(date: ISODate): void; sync: ReturnType<typeof useOwnerSync> }) {
  const { data } = useStore();
  const { today, periods, stats, forecast } = useCycle();
  const last = periods[periods.length - 1];
  const next = forecast?.upcoming[0];

  let when = '';
  if (forecast && next) {
    const from = diffDays(next.earliest, today);
    const to = diffDays(next.latest, today);
    if (forecast.onPeriod) when = '';
    else if (forecast.daysLate > 0) when = '';
    else if (from <= 0) when = 'Could start any day now';
    else when = from === to ? `In ${from} days` : `In ${from}–${to} days`;
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <p className="eyebrow">{fmtLong(today)}</p>
        <h1>Today</h1>
      </header>

      <section className="card card-ring">
        <CycleRing
          forecast={forecast}
          lastStart={last?.start}
          avgPeriod={stats.avgPeriod ?? 5}
          label={forecast ? phaseLabel(forecast, today) : ''}
        />
        {forecast && (
          <ul className="legend">
            <li><span className="swatch swatch-period" />Period</li>
            <li><span className="swatch swatch-fertile" />Fertile estimate</li>
            <li><span className="swatch swatch-predicted" />Next period</li>
          </ul>
        )}
      </section>

      {forecast && forecast.daysLate > 0 && !forecast.onPeriod && (
        <CalmCard forecast={forecast} stats={stats} firstPeriodMode={data.settings.firstPeriodMode} onLog={() => onLog(today)} />
      )}

      {forecast && next ? (
        <section className="card">
          <div className="row">
            <div>
              <p className="eyebrow">Next period expected</p>
              <p className="big">{fmtRange(next.earliest, next.latest)}</p>
              {when && <p className="muted">{when}</p>}
            </div>
            <span className={`badge badge-${forecast.confidence}`}>{CONFIDENCE[forecast.confidence]}</span>
          </div>
          <p className="fine">
            {forecast.cyclesUsed === 0
              ? `Based on a typical ${data.settings.typicalCycleLength}-day cycle. The range narrows as more periods are logged.`
              : `Based on your last ${forecast.cyclesUsed} cycle${forecast.cyclesUsed === 1 ? '' : 's'}.`}
            {data.settings.firstPeriodMode && ' Early cycles often vary, so treat this as a rough guide.'}
            {!forecast.onPeriod && forecast.daysLate === 0 && diffDays(next.earliest, today) <= 2 && ' A good time to pack supplies.'}
          </p>
        </section>
      ) : (
        <section className="card">
          <h2>When did your last period start?</h2>
          <p className="muted">An approximate date is fine. You can correct it or add older periods whenever you like.</p>
          <AddPeriodForm />
        </section>
      )}

      <section className="card">
        <div className="row">
          <h2>Today's log</h2>
          <button type="button" className="btn btn-soft btn-small" onClick={() => onLog(today)}>
            {data.logs[today] ? 'Edit' : 'Log today'}
          </button>
        </div>
        <DaySummary log={data.logs[today]} empty="Nothing logged today. Log as much or as little as you like." />
      </section>

      <NudgeCard messages={sync.messages} error={sync.error} onSend={sync.sendNudge} onSeen={sync.markSeen} />

      <SuppliesCard periods={periods} today={today} />

      {data.settings.firstPeriodMode && periods.length < 3 && <FirstPeriodCard />}

      <p className="fine center">Predictions are estimates. Petal is not a method of contraception or a medical device.</p>
    </div>
  );
}
