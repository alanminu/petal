import type { AppData, ISODate, PainLevel, PrefNote, Share, ShareKind } from '../../types';
import type { Confidence } from '../cycle';
import { derivePeriods, forecast } from '../cycle';
import { diffDays } from '../dates';
import { patternFlags, supplyStatus } from '../insights';

export type PhaseBucket = 'period' | 'follicular' | 'fertile' | 'luteal' | 'before' | 'late';

/**
 * Exactly what one supporter receives. It is built on the tracker's device from
 * the permissions set for that person, then encrypted. Anything not switched on is
 * simply absent, so it never leaves the device.
 */
export interface SharedView {
  v: 1;
  /** Local date on the tracker's device when this was built. */
  date: ISODate;
  kind: ShareKind;
  name?: string;
  paused?: true;
  /** Always shared: the minimum a supporter gets. */
  onPeriod?: boolean;
  periodStart?: ISODate;
  daysLate?: number;
  /** perms.phase */
  cycleDay?: number;
  bucket?: PhaseBucket;
  /** perms.predictions */
  next?: { earliest: ISODate; latest: ISODate; confidence: Confidence };
  /** perms.mood / symptoms / pain: today's entries only */
  moods?: string[];
  symptoms?: string[];
  pain?: Record<string, PainLevel>;
  /** perms.supplies: names of supplies running low */
  lowSupplies?: string[];
  /** perms.flags */
  flags?: ('irregular' | 'pain')[];
  /** Notes written for supporters. */
  notes: PrefNote[];
}

export function phaseBucket(
  today: ISODate,
  f: { onPeriod: boolean; daysLate: number; upcoming: { earliest: ISODate; fertileStart: ISODate; fertileEnd: ISODate }[] },
): PhaseBucket {
  const next = f.upcoming[0];
  if (f.onPeriod) return 'period';
  if (f.daysLate > 0) return 'late';
  // Roughly the premenstrual days.
  if (diffDays(next.earliest, today) <= 5) return 'before';
  if (today >= next.fertileStart && today <= next.fertileEnd) return 'fertile';
  return today < next.fertileStart ? 'follicular' : 'luteal';
}

export function buildView(data: AppData, share: Share, today: ISODate): SharedView {
  const base: SharedView = { v: 1, date: today, kind: share.kind, name: data.displayName || undefined, notes: [] };
  if (share.paused) return { ...base, paused: true };

  const periods = derivePeriods(data.logs);
  const f = forecast(periods, data.settings.typicalCycleLength, today);
  const last = periods[periods.length - 1];
  const log = data.logs[today];
  const p = share.perms;

  const view: SharedView = { ...base, notes: data.prefNotes };
  if (f && last) {
    view.onPeriod = f.onPeriod;
    view.periodStart = last.start;
    view.daysLate = f.daysLate;
    if (p.phase) {
      view.cycleDay = f.cycleDay;
      view.bucket = phaseBucket(today, f);
    }
    if (p.predictions) {
      const n = f.upcoming[0];
      view.next = { earliest: n.earliest, latest: n.latest, confidence: f.confidence };
    }
  }
  if (p.mood && log?.moods.length) view.moods = log.moods;
  if (p.symptoms && (log?.symptoms.length || log?.tags.length)) view.symptoms = [...log.symptoms, ...log.tags];
  if (p.pain && log?.pain) view.pain = log.pain;
  if (p.supplies) {
    const low = supplyStatus(data.supplies, data.logs, periods).filter((s) => s.low).map((s) => s.supply.name);
    if (low.length) view.lowSupplies = low;
  }
  if (p.flags) {
    const flags = patternFlags(data.logs, periods);
    if (flags.length) view.flags = flags;
  }
  return view;
}

/** One nudge or reply, encrypted before it is sent. */
export interface Note {
  text: string;
  at: number;
}

export const NUDGES = [
  'Cramps are bad today',
  'Could use a hug',
  'Need some quiet time',
  'Craving something sweet',
  'Feeling low today',
  'Running low on supplies',
] as const;

export const REPLIES = ['On it', 'Thinking of you', 'Be there soon', 'Anything else you need?'] as const;
