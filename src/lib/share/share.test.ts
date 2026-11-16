import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, Flow, Share } from '../../types';
import { DEFAULT_PERMISSIONS, emptyData } from '../../types';
import { addDays } from '../dates';
import { findInsights, patternFlags, supplyStatus } from '../insights';
import { derivePeriods } from '../cycle';
import { newSecrets, open, pairingCode, parsePairing, seal, sha256Hex } from './codec';
import { buildView } from './view';

const day = (date: string, extra: Partial<DayLog> = {}): DayLog => ({ date, symptoms: [], moods: [], tags: [], ...extra });

function dataWith(starts: string[], decorate?: (logs: Record<string, DayLog>, start: string) => void): AppData {
  const data = emptyData();
  for (const s of starts) {
    for (let i = 0; i < 5; i++) data.logs[addDays(s, i)] = day(addDays(s, i), { flow: 3 as Flow });
    decorate?.(data.logs, s);
  }
  return data;
}

const starts = ['2026-06-01', '2026-06-29', '2026-07-27', '2026-08-24'];
const share = (kind: 'partner' | 'parent', perms = DEFAULT_PERMISSIONS[kind]): Share => ({
  ...newSecrets(), label: 'Alex', kind, perms, paused: false, seen: 0,
});

describe('pairing codes and encryption', () => {
  it('round-trips a pairing code, bare or inside a link', () => {
    const s = newSecrets();
    const code = pairingCode(s.id, s.key);
    expect(parsePairing(code)).toEqual({ id: s.id, key: s.key });
    expect(parsePairing(`https://example.org/petal/#pair=${code}`)).toEqual({ id: s.id, key: s.key });
    expect(parsePairing('P1-nonsense')).toBeNull();
  });

  it('decrypts with the right key only', async () => {
    const a = newSecrets();
    const b = newSecrets();
    const sealed = await seal(a.key, { hello: 'there' });
    expect(sealed).not.toContain('hello');
    expect(await open(a.key, sealed)).toEqual({ hello: 'there' });
    expect(await open(b.key, sealed)).toBeNull();
  });

  it('hashes like Postgres sha256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('shared view respects permissions', () => {
  const today = '2026-08-25';
  const data = dataWith(starts);
  data.logs[today] = { ...data.logs[today], moods: ['Sad'], symptoms: ['Cramps'], pain: { abdomen: 3 } };
  data.supplies = [{ id: 'p', name: 'Pads', count: 2, lowAt: 4 }];
  data.prefNotes = [{ id: 'n', when: 'period', text: 'Heating pad please' }];

  it('gives a parent only the basics by default', () => {
    const v = buildView(data, share('parent'), today);
    expect(v).toMatchObject({ onPeriod: true, periodStart: '2026-08-24', daysLate: 0 });
    for (const k of ['cycleDay', 'bucket', 'next', 'moods', 'symptoms', 'pain', 'lowSupplies', 'flags'] as const) {
      expect(v[k]).toBeUndefined();
    }
    expect(JSON.stringify(v)).not.toContain('Cramps');
  });

  it('gives a partner phase, predictions, mood and symptoms but not pain or supplies', () => {
    const v = buildView(data, share('partner'), today);
    expect(v).toMatchObject({ cycleDay: 2, bucket: 'period', moods: ['Sad'], symptoms: ['Cramps'] });
    expect(v.next?.earliest).toBeDefined();
    expect(v.pain).toBeUndefined();
    expect(v.lowSupplies).toBeUndefined();
  });

  it('adds only what is switched on', () => {
    const v = buildView(data, share('parent', { ...DEFAULT_PERMISSIONS.parent, supplies: true, pain: true }), today);
    expect(v.lowSupplies).toEqual(['Pads']);
    expect(v.pain).toEqual({ abdomen: 3 });
    expect(v.moods).toBeUndefined();
  });

  it('shares nothing but the pause itself when paused', () => {
    const v = buildView(data, { ...share('partner'), paused: true }, today);
    expect(v).toEqual({ v: 1, date: today, kind: 'partner', name: undefined, notes: [], paused: true });
  });
});

describe('insights', () => {
  it('spots a symptom that recurs before each period', () => {
    const data = dataWith(starts, (logs, s) => {
      logs[addDays(s, -2)] = day(addDays(s, -2), { symptoms: ['Headache'] });
      logs[s] = { ...logs[s], symptoms: ['Cramps'] };
      logs[addDays(s, 1)] = { ...logs[addDays(s, 1)], symptoms: ['Cramps'] };
    });
    const texts = findInsights(data.logs, derivePeriods(data.logs)).map((i) => i.text);
    expect(texts).toContain('Headache tends to appear about 2 days before your period (4 of your last 4 periods).');
    expect(texts.some((t) => t.startsWith('Cramps usually shows up during your period, most often on day 1'))).toBe(true);
  });

  it('stays quiet without a repeated pattern', () => {
    const data = dataWith(starts, (logs, s) => {
      if (s === starts[0]) logs[addDays(s, 12)] = day(addDays(s, 12), { symptoms: ['Headache'] });
    });
    expect(findInsights(data.logs, derivePeriods(data.logs))).toEqual([]);
  });

  it('estimates supplies from recent use and flags low stock', () => {
    const data = dataWith(starts, (logs, s) => {
      for (let i = 0; i < 5; i++) logs[addDays(s, i)].used = { p: 4 };
    });
    const [status] = supplyStatus([{ id: 'p', name: 'Pads', count: 30, lowAt: 5 }], data.logs, derivePeriods(data.logs));
    expect(status).toMatchObject({ low: false, perPeriod: 20, periodsLeft: 1.5 });
  });

  it('flags strong pain across several cycles, and irregular cycles', () => {
    const painful = dataWith(starts, (logs, s) => { logs[s].pain = { abdomen: 3 }; });
    expect(patternFlags(painful.logs, derivePeriods(painful.logs))).toEqual(['pain']);
    const irregular = dataWith(['2026-01-01', '2026-01-20', '2026-03-08', '2026-03-30', '2026-05-18']);
    expect(patternFlags(irregular.logs, derivePeriods(irregular.logs))).toEqual(['irregular']);
    expect(patternFlags(dataWith(starts).logs, derivePeriods(dataWith(starts).logs))).toEqual([]);
  });
});
