import { describe, expect, it } from 'vitest';
import type { DayLog, Flow } from '../types';
import { addDays, diffDays } from './dates';
import { computeStats, deriveCycles, derivePeriods, forecast } from './cycle';

const log = (date: string, flow: Flow): DayLog => ({ date, flow, symptoms: [], moods: [], tags: [] });

function logsFor(starts: string[], days = 5) {
  const logs: Record<string, DayLog> = {};
  for (const s of starts) for (let i = 0; i < days; i++) logs[addDays(s, i)] = log(addDays(s, i), 3);
  return logs;
}

describe('dates', () => {
  it('handles month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2026-03-01', '2026-02-27')).toBe(2);
  });
});

describe('derivePeriods', () => {
  it('groups consecutive flow days and tolerates a one-day gap', () => {
    const logs = {
      a: log('2026-10-01', 3),
      b: log('2026-10-02', 4),
      c: log('2026-10-04', 2),
      d: log('2026-10-29', 3),
    };
    const byDate = Object.fromEntries(Object.values(logs).map((l) => [l.date, l]));
    expect(derivePeriods(byDate)).toEqual([
      { start: '2026-10-01', end: '2026-10-04', days: 4 },
      { start: '2026-10-29', end: '2026-10-29', days: 1 },
    ]);
  });

  it('does not treat spotting as a period', () => {
    expect(derivePeriods({ '2026-10-10': log('2026-10-10', 1) })).toEqual([]);
  });
});

describe('cycles and stats', () => {
  it('leaves implausibly long gaps out of the averages', () => {
    const periods = derivePeriods(logsFor(['2026-05-01', '2026-05-29', '2026-08-20', '2026-09-17']));
    const cycles = deriveCycles(periods);
    expect(cycles.map((c) => c.length)).toEqual([28, 83, 28, undefined]);
    expect(cycles.map((c) => c.counted)).toEqual([true, false, true, false]);
    const stats = computeStats(periods);
    expect(stats.avgCycle).toBe(28);
    expect(stats.avgPeriod).toBe(5);
  });
});

describe('forecast', () => {
  it('returns null with nothing logged', () => {
    expect(forecast([], 28, '2026-11-17')).toBeNull();
  });

  it('uses the typical length and a wide range with one period', () => {
    const f = forecast(derivePeriods(logsFor(['2026-11-01'])), 30, '2026-11-10')!;
    expect(f.confidence).toBe('low');
    expect(f.cycleDay).toBe(10);
    expect(f.upcoming[0]).toMatchObject({ earliest: '2026-11-28', likely: '2026-12-01', latest: '2026-12-04' });
  });

  it('tightens the range and raises confidence for regular cycles', () => {
    const starts = Array.from({ length: 8 }, (_, i) => addDays('2026-03-01', i * 28));
    const f = forecast(derivePeriods(logsFor(starts)), 28, addDays(starts[7], 9))!;
    expect(f.confidence).toBe('high');
    expect(f.upcoming[0].likely).toBe(addDays(starts[7], 28));
    expect(diffDays(f.upcoming[0].latest, f.upcoming[0].earliest)).toBe(2);
    expect(diffDays(f.upcoming[2].latest, f.upcoming[2].earliest)).toBeGreaterThan(2);
  });

  it('widens the range for irregular cycles', () => {
    const starts = ['2026-04-01', '2026-04-25', '2026-06-02', '2026-06-28', '2026-08-06'];
    const f = forecast(derivePeriods(logsFor(starts)), 28, '2026-08-15')!;
    expect(f.confidence).toBe('low');
    expect(diffDays(f.upcoming[0].latest, f.upcoming[0].earliest)).toBeGreaterThanOrEqual(10);
  });

  it('reports days late and on-period state', () => {
    const periods = derivePeriods(logsFor(['2026-10-01']));
    expect(forecast(periods, 28, '2026-11-05')!.daysLate).toBe(4);
    expect(forecast(periods, 28, '2026-10-03')!.onPeriod).toBe(true);
    expect(forecast(periods, 28, '2026-10-12')!.onPeriod).toBe(false);
  });
});
