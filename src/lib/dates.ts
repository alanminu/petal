import type { ISODate } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromISO = (s: ISODate): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = (): ISODate => toISO(new Date());

export const addDays = (s: ISODate, n: number): ISODate => {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const utc = (s: ISODate) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from b to a (a − b). Daylight-saving safe. */
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((utc(a) - utc(b)) / 86_400_000);

export const fmtDate = (s: ISODate, withYear = false): string =>
  fromISO(s).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });

export const fmtLong = (s: ISODate): string =>
  fromISO(s).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** "12–15 Dec" or "29 Nov – 2 Dec"; a single date when both ends match. */
export const fmtRange = (a: ISODate, b: ISODate): string => {
  if (a === b) return fmtDate(a);
  const da = fromISO(a);
  const db = fromISO(b);
  if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) {
    const month = db.toLocaleDateString(undefined, { month: 'short' });
    return `${da.getDate()}–${db.getDate()} ${month}`;
  }
  return `${fmtDate(a)} – ${fmtDate(b)}`;
};
