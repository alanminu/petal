import type { DayLog, ISODate } from '../types';
import { addDays, diffDays } from './dates';

/** A run of bleeding days. Spotting alone never starts a period. */
export interface Period {
  start: ISODate;
  end: ISODate;
  days: number;
}

export interface Cycle {
  start: ISODate;
  /** Days from this period's start to the next one. Undefined for the current cycle. */
  length?: number;
  period: Period;
  /** False when the length is implausible — almost always a period that was not logged. */
  counted: boolean;
}

export const MIN_CYCLE = 15;
export const MAX_CYCLE = 60;
const RECENT = 6;

export function derivePeriods(logs: Record<ISODate, DayLog>): Period[] {
  const flowDays = Object.values(logs)
    .filter((l) => (l.flow ?? 0) >= 2)
    .map((l) => l.date)
    .sort();
  const periods: Period[] = [];
  for (const d of flowDays) {
    const cur = periods[periods.length - 1];
    // Allow a single flow-free day inside one period.
    if (cur && diffDays(d, cur.end) <= 2) {
      cur.end = d;
      cur.days = diffDays(cur.end, cur.start) + 1;
    } else {
      periods.push({ start: d, end: d, days: 1 });
    }
  }
  return periods;
}

export function deriveCycles(periods: Period[]): Cycle[] {
  return periods.map((p, i) => {
    const next = periods[i + 1];
    const length = next ? diffDays(next.start, p.start) : undefined;
    return {
      start: p.start,
      length,
      period: p,
      counted: length !== undefined && length >= MIN_CYCLE && length <= MAX_CYCLE,
    };
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdDev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export interface Stats {
  /** Number of complete cycles used for the averages (most recent six at most). */
  cyclesUsed: number;
  totalCycles: number;
  avgCycle?: number;
  shortest?: number;
  longest?: number;
  /** Standard deviation of cycle length in days. */
  variation?: number;
  avgPeriod?: number;
}

export function computeStats(periods: Period[]): Stats {
  const cycles = deriveCycles(periods);
  const lengths = cycles.filter((c) => c.counted).map((c) => c.length!);
  const recent = lengths.slice(-RECENT);
  const periodDays = periods.slice(-RECENT).map((p) => p.days);
  return {
    cyclesUsed: recent.length,
    totalCycles: lengths.length,
    avgCycle: recent.length ? mean(recent) : undefined,
    shortest: recent.length ? Math.min(...recent) : undefined,
    longest: recent.length ? Math.max(...recent) : undefined,
    variation: recent.length >= 2 ? stdDev(recent) : undefined,
    avgPeriod: periodDays.length ? mean(periodDays) : undefined,
  };
}

export type Confidence = 'low' | 'medium' | 'high';

export interface PredictedPeriod {
  earliest: ISODate;
  likely: ISODate;
  latest: ISODate;
  /** Estimated fertile window before this period. An estimate only. */
  fertileStart: ISODate;
  fertileEnd: ISODate;
}

export interface Forecast {
  upcoming: PredictedPeriod[];
  confidence: Confidence;
  cyclesUsed: number;
  /** 1-based day of the current cycle. */
  cycleDay: number;
  /** True while a period is being logged (within a day of the last flow day). */
  onPeriod: boolean;
  /** Days past the end of the predicted range with no period logged; 0 if not late. */
  daysLate: number;
}

/**
 * Predicts a date range for each upcoming period rather than a single day.
 * The range widens when there is little history or the cycles vary a lot.
 */
export function forecast(
  periods: Period[],
  typicalCycleLength: number,
  today: ISODate,
  count = 3,
): Forecast | null {
  const last = periods[periods.length - 1];
  if (!last) return null;

  const stats = computeStats(periods);
  const n = stats.cyclesUsed;
  const avg = stats.avgCycle ?? typicalCycleLength;
  const sd = stats.variation ?? 3;
  const half = n < 2 ? 3 : Math.min(10, Math.max(1, Math.round(sd) + (n < 4 ? 1 : 0)));

  let confidence: Confidence = 'medium';
  if (n < 3 || sd > 4) confidence = 'low';
  else if (n >= 6 && sd <= 2) confidence = 'high';

  const upcoming: PredictedPeriod[] = [];
  for (let k = 1; k <= count; k++) {
    const likely = addDays(last.start, Math.round(avg * k));
    const h = Math.round(half * Math.sqrt(k));
    const earliest = addDays(likely, -h);
    const latest = addDays(likely, h);
    upcoming.push({
      earliest,
      likely,
      latest,
      // Ovulation is roughly 14 days before a period; the fertile window is about
      // five days before to one day after it.
      fertileStart: addDays(earliest, -19),
      fertileEnd: addDays(latest, -13),
    });
  }

  return {
    upcoming,
    confidence,
    cyclesUsed: n,
    cycleDay: diffDays(today, last.start) + 1,
    onPeriod: diffDays(today, last.end) <= 1,
    daysLate: Math.max(0, diffDays(today, upcoming[0].latest)),
  };
}
