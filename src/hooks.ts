import { useMemo } from 'react';
import { computeStats, deriveCycles, derivePeriods, forecast } from './lib/cycle';
import type { Forecast } from './lib/cycle';
import { todayISO } from './lib/dates';
import { useStore } from './store';

/** Everything derived from the raw day logs, recomputed only when the data changes. */
export function useCycle() {
  const { data } = useStore();
  const today = todayISO();
  return useMemo(() => {
    const periods = derivePeriods(data.logs);
    return {
      today,
      periods,
      cycles: deriveCycles(periods),
      stats: computeStats(periods),
      forecast: forecast(periods, data.settings.typicalCycleLength, today),
    };
  }, [data, today]);
}

export function phaseLabel(f: Forecast, today: string): string {
  const next = f.upcoming[0];
  if (f.onPeriod) return 'Period';
  if (f.daysLate > 0) return 'Past the expected range';
  if (today >= next.earliest) return 'Period expected';
  if (today >= next.fertileStart && today <= next.fertileEnd) return 'Fertile window (estimate)';
  return today < next.fertileStart ? 'Follicular phase' : 'Luteal phase';
}
