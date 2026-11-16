import type { Forecast } from '../lib/cycle';
import { diffDays } from '../lib/dates';
import type { ISODate } from '../types';

const SIZE = 264;
const R = 108;
const STROKE = 20;
const C = 2 * Math.PI * R;
const MID = SIZE / 2;

function Segment({ from, to, className }: { from: number; to: number; className: string }) {
  const a = Math.max(0, Math.min(1, from));
  const b = Math.max(0, Math.min(1, to));
  if (b <= a) return null;
  const len = (b - a) * C;
  return (
    <circle
      className={className}
      cx={MID}
      cy={MID}
      r={R}
      fill="none"
      strokeWidth={STROKE}
      strokeDasharray={`${len} ${C - len}`}
      strokeDashoffset={-a * C}
      transform={`rotate(-90 ${MID} ${MID})`}
    />
  );
}

interface Props {
  forecast: Forecast | null;
  lastStart?: ISODate;
  avgPeriod: number;
  label: string;
}

/** A dial of the current cycle: period, estimated fertile window, expected next period, and today. */
export function CycleRing({ forecast, lastStart, avgPeriod, label }: Props) {
  if (!forecast || !lastStart) {
    return (
      <div className="ring">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="No cycle logged yet">
          <circle className="ring-track" cx={MID} cy={MID} r={R} fill="none" strokeWidth={STROKE} />
        </svg>
        <div className="ring-center">
          <span className="ring-label">Welcome</span>
          <span className="ring-sub">Log a period to begin</span>
        </div>
      </div>
    );
  }

  const next = forecast.upcoming[0];
  const day = forecast.cycleDay;
  const total = Math.max(diffDays(next.latest, lastStart), day);
  const at = (d: ISODate) => diffDays(d, lastStart) / total;
  const angle = ((day - 0.5) / total) * 2 * Math.PI - Math.PI / 2;

  return (
    <div className="ring">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Cycle day ${day}. ${label}.`}>
        <circle className="ring-track" cx={MID} cy={MID} r={R} fill="none" strokeWidth={STROKE} />
        <Segment className="ring-fertile" from={at(next.fertileStart)} to={at(next.fertileEnd) + 1 / total} />
        <Segment className="ring-predicted" from={at(next.earliest)} to={1} />
        <Segment className="ring-period" from={0} to={Math.round(avgPeriod) / total} />
        <circle
          className="ring-marker"
          cx={MID + R * Math.cos(angle)}
          cy={MID + R * Math.sin(angle)}
          r={STROKE / 2 + 3}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-eyebrow">Day</span>
        <span className="ring-day">{day}</span>
        <span className="ring-sub">{label}</span>
      </div>
    </div>
  );
}
