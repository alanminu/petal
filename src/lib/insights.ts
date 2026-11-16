import type { DayLog, ISODate, PainLevel, Supply } from '../types';
import type { Period } from './cycle';
import { computeStats } from './cycle';
import { addDays, diffDays } from './dates';

/** Front and back body regions for the pain map. */
export const PAIN_REGIONS = [
  { id: 'head', label: 'Head', side: 'front' },
  { id: 'breasts', label: 'Breasts', side: 'front' },
  { id: 'stomach', label: 'Stomach', side: 'front' },
  { id: 'abdomen', label: 'Lower abdomen', side: 'front' },
  { id: 'thighs', label: 'Thighs', side: 'front' },
  { id: 'shoulders', label: 'Neck and shoulders', side: 'back' },
  { id: 'upperback', label: 'Upper back', side: 'back' },
  { id: 'lowerback', label: 'Lower back', side: 'back' },
  { id: 'hips', label: 'Hips', side: 'back' },
  { id: 'legs', label: 'Legs', side: 'back' },
] as const;

export const regionLabel = (id: string): string => PAIN_REGIONS.find((r) => r.id === id)?.label ?? id;

const RECENT_PERIODS = 6;
const DAYS_BEFORE = 5;

export interface Insight {
  item: string;
  text: string;
  /** Number of cycles the pattern appeared in. */
  cycles: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/** Everything loggable on a day, as plain names. */
function itemsOf(l: DayLog): string[] {
  return [
    ...l.symptoms,
    ...l.moods.map((m) => `Feeling ${m.toLowerCase()}`),
    ...l.tags,
    ...Object.keys(l.pain ?? {}).map((id) => `${regionLabel(id)} pain`),
  ];
}

/**
 * Finds items that keep turning up at the same point in the cycle, e.g.
 * "Headache tends to appear about 2 days before your period".
 * Only looks at days whose position in a cycle is known, and needs the
 * pattern to repeat in at least two cycles.
 */
export function findInsights(logs: Record<ISODate, DayLog>, periods: Period[]): Insight[] {
  const recent = periods.slice(-RECENT_PERIODS);
  if (recent.length < 2) return [];
  const windowStart = addDays(recent[0].start, -DAYS_BEFORE);
  const lastEnd = recent[recent.length - 1].end;

  type Hit = { bucket: 'during' | 'before' | 'other'; cycle: ISODate; n: number };
  const hits = new Map<string, Hit[]>();

  for (const l of Object.values(logs)) {
    // After the latest period we cannot yet say how close the next one is.
    if (l.date < windowStart || l.date > lastEnd) continue;
    const during = recent.find((p) => l.date >= p.start && l.date <= p.end);
    const next = recent.find((p) => p.start > l.date);
    let hit: Hit;
    if (during) hit = { bucket: 'during', cycle: during.start, n: diffDays(l.date, during.start) + 1 };
    else if (next && diffDays(next.start, l.date) <= DAYS_BEFORE)
      hit = { bucket: 'before', cycle: next.start, n: diffDays(next.start, l.date) };
    else hit = { bucket: 'other', cycle: '', n: 0 };
    for (const item of itemsOf(l)) hits.set(item, [...(hits.get(item) ?? []), hit]);
  }

  const out: Insight[] = [];
  for (const [item, list] of hits) {
    if (list.length < 3) continue;
    for (const bucket of ['during', 'before'] as const) {
      const inBucket = list.filter((h) => h.bucket === bucket);
      const cycles = new Set(inBucket.map((h) => h.cycle)).size;
      if (cycles < 2 || inBucket.length / list.length < 0.6) continue;
      const n = median(inBucket.map((h) => h.n));
      const of = `${cycles} of your last ${recent.length} periods`;
      out.push({
        item,
        cycles,
        text:
          bucket === 'during'
            ? `${item} usually shows up during your period, most often on day ${n} (${of}).`
            : `${item} tends to appear about ${n} day${n === 1 ? '' : 's'} before your period (${of}).`,
      });
    }
  }
  return out.sort((a, b) => b.cycles - a.cycles || a.item.localeCompare(b.item)).slice(0, 6);
}

/** How often each body region was logged, and how strongly, over recent cycles. */
export function painSummary(logs: Record<ISODate, DayLog>, periods: Period[]) {
  const since = periods.slice(-RECENT_PERIODS)[0]?.start ?? '';
  const days: Record<string, number> = {};
  const peak: Record<string, PainLevel> = {};
  for (const l of Object.values(logs)) {
    if (l.date < since) continue;
    for (const [id, level] of Object.entries(l.pain ?? {})) {
      days[id] = (days[id] ?? 0) + 1;
      if (level > (peak[id] ?? 0)) peak[id] = level;
    }
  }
  return { days, peak };
}

export interface SupplyStatus {
  supply: Supply;
  low: boolean;
  /** Average used per period, from the last few periods with any use logged. */
  perPeriod?: number;
  periodsLeft?: number;
}

export function supplyStatus(supplies: Supply[], logs: Record<ISODate, DayLog>, periods: Period[]): SupplyStatus[] {
  return supplies.map((supply) => {
    const totals: number[] = [];
    for (const p of periods.slice(-4)) {
      let total = 0;
      // Count a day either side of the period so spotting days are included.
      for (let d = addDays(p.start, -1); d <= addDays(p.end, 1); d = addDays(d, 1)) total += logs[d]?.used?.[supply.id] ?? 0;
      if (total > 0) totals.push(total);
    }
    const perPeriod = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : undefined;
    return {
      supply,
      low: supply.count <= supply.lowAt,
      perPeriod,
      periodsLeft: perPeriod ? supply.count / perPeriod : undefined,
    };
  });
}

/** Signals worth mentioning to a doctor. These describe the logs; they are not a diagnosis. */
export function patternFlags(logs: Record<ISODate, DayLog>, periods: Period[]): ('irregular' | 'pain')[] {
  const flags: ('irregular' | 'pain')[] = [];
  const stats = computeStats(periods);
  if (
    stats.cyclesUsed >= 4 &&
    ((stats.variation ?? 0) > 7 || (stats.shortest ?? 28) < 21 || (stats.longest ?? 28) > 45)
  ) {
    flags.push('irregular');
  }
  const recent = periods.slice(-RECENT_PERIODS);
  const strongCycles = recent.filter((p, i) => {
    const until = recent[i + 1]?.start ?? '9999-12-31';
    return Object.values(logs).some(
      (l) => l.date >= addDays(p.start, -DAYS_BEFORE) && l.date < until && Object.values(l.pain ?? {}).includes(3),
    );
  }).length;
  if (strongCycles >= 3) flags.push('pain');
  return flags;
}
