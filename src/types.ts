/** Calendar date as YYYY-MM-DD in the user's local time. */
export type ISODate = string;

/** 0 none · 1 spotting · 2 light · 3 medium · 4 heavy */
export type Flow = 0 | 1 | 2 | 3 | 4;
export const FLOW_LABELS = ['None', 'Spotting', 'Light', 'Medium', 'Heavy'] as const;

/** 1 mild · 2 moderate · 3 strong */
export type PainLevel = 1 | 2 | 3;
export const PAIN_LABELS = ['', 'Mild', 'Moderate', 'Strong'] as const;

export const SYMPTOMS = [
  'Cramps',
  'Headache',
  'Backache',
  'Bloating',
  'Tender breasts',
  'Acne',
  'Fatigue',
  'Nausea',
  'Cravings',
  'Trouble sleeping',
] as const;

export const MOODS = ['Calm', 'Happy', 'Energetic', 'Irritable', 'Anxious', 'Sad', 'Low energy'] as const;

export interface DayLog {
  date: ISODate;
  flow?: Flow;
  symptoms: string[];
  moods: string[];
  /** User-defined tags (see Settings.customTags). */
  tags: string[];
  notes?: string;
  /** Pain map: body region id → level. */
  pain?: Record<string, PainLevel>;
  /** Supplies used this day: supply id → count. */
  used?: Record<string, number>;
}

export interface Settings {
  customTags: string[];
  /** Used for predictions until enough cycles are logged. */
  typicalCycleLength: number;
  /** Gentler wording and explainers for someone new to periods. */
  firstPeriodMode: boolean;
  /** Cover the screen whenever the app is not in front. */
  privacyBlur: boolean;
  /** Show a button that swaps Petal for a harmless-looking notes page. */
  quickHide: boolean;
}

export interface Supply {
  id: string;
  name: string;
  count: number;
  /** Show a low-stock note at or below this count. */
  lowAt: number;
}

export interface Reminders {
  periodHeadsUp: boolean;
  daysBefore: number;
  /** Notification text that does not mention periods. */
  discreet: boolean;
}

// ── Sharing ──────────────────────────────────────────────────────────────

export type ShareKind = 'partner' | 'parent';

/** What one supporter may see beyond the minimum (period started / period late). */
export interface Permissions {
  phase: boolean;
  predictions: boolean;
  mood: boolean;
  symptoms: boolean;
  pain: boolean;
  supplies: boolean;
  flags: boolean;
}

export const PERMISSION_LABELS: Record<keyof Permissions, [title: string, detail: string]> = {
  phase: ['Cycle day and phase', 'Where you are in your cycle today'],
  predictions: ['Period predictions', 'The expected date range for your next period'],
  mood: ["Today's mood", 'Moods you log today'],
  symptoms: ["Today's symptoms", 'Symptoms and tags you log today'],
  pain: ["Today's pain map", 'Where it hurts today'],
  supplies: ['Supply levels', 'Which supplies are running low, nothing else'],
  flags: ['Pattern prompts', 'A gentle note if cycles are very irregular or pain is often strong'],
};

export const DEFAULT_PERMISSIONS: Record<ShareKind, Permissions> = {
  partner: { phase: true, predictions: true, mood: true, symptoms: true, pain: false, supplies: false, flags: false },
  // Teen-led by default: a parent sees only "period started" and "period late" until more is switched on.
  parent: { phase: false, predictions: false, mood: false, symptoms: false, pain: false, supplies: false, flags: false },
};

/** One person the tracker shares with. Each has a separate room and key, so access is revoked individually. */
export interface Share {
  /** Room id on the server (random UUID). */
  id: string;
  /** AES-256 key, base64url. Never sent to the server. */
  key: string;
  /** Proves ownership of the room when writing or deleting. */
  writeToken: string;
  label: string;
  kind: ShareKind;
  perms: Permissions;
  paused: boolean;
  /** Highest message id already seen. */
  seen: number;
}

export interface PrefNote {
  id: string;
  when: 'period' | 'before' | 'any';
  text: string;
}

/** Supporter side: a person who shares with me. */
export interface Link {
  id: string;
  key: string;
  label: string;
  seen: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Plan {
  id: string;
  date: ISODate;
  title: string;
}

export interface SupporterData {
  links: Link[];
  checklist: ChecklistItem[];
  plans: Plan[];
}

export type Role = 'tracker' | 'supporter';

export interface AppData {
  version: 1;
  role?: Role;
  /** Shown to supporters. */
  displayName: string;
  logs: Record<ISODate, DayLog>;
  settings: Settings;
  supplies: Supply[];
  reminders: Reminders;
  shares: Share[];
  prefNotes: PrefNote[];
  supporter: SupporterData;
}

export const emptyData = (): AppData => ({
  version: 1,
  displayName: '',
  logs: {},
  settings: { customTags: [], typicalCycleLength: 28, firstPeriodMode: false, privacyBlur: false, quickHide: false },
  supplies: [],
  reminders: { periodHeadsUp: false, daysBefore: 2, discreet: true },
  shares: [],
  prefNotes: [],
  supporter: { links: [], checklist: [], plans: [] },
});

export const newId = (): string => crypto.randomUUID();

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strings = (v: unknown): string[] => arr<unknown>(v).map(String);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function numberMap(v: unknown, max: number): Record<string, number> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    const x = Math.round(Number(n));
    if (x >= 1) out[k] = Math.min(max, x);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Accepts anything shaped roughly like AppData (an older version, an imported backup) and fills gaps. */
export function normalizeData(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;

  const logs: Record<ISODate, DayLog> = {};
  for (const [date, l] of Object.entries(r.logs ?? {})) {
    if (!ISO.test(date) || !l || typeof l !== 'object') continue;
    const flow = Number(l.flow);
    logs[date] = {
      date,
      flow: flow >= 0 && flow <= 4 ? (Math.round(flow) as Flow) : undefined,
      symptoms: strings(l.symptoms),
      moods: strings(l.moods),
      tags: strings(l.tags),
      notes: typeof l.notes === 'string' && l.notes ? l.notes : undefined,
      pain: numberMap(l.pain, 3) as Record<string, PainLevel> | undefined,
      used: numberMap(l.used, 99),
    };
  }

  const len = Number(r.settings?.typicalCycleLength);
  const role: Role | undefined =
    r.role === 'tracker' || r.role === 'supporter' ? r.role : Object.keys(logs).length ? 'tracker' : undefined;

  return {
    version: 1,
    role,
    displayName: typeof r.displayName === 'string' ? r.displayName : '',
    logs,
    settings: {
      customTags: strings(r.settings?.customTags),
      typicalCycleLength: len >= 15 && len <= 60 ? Math.round(len) : base.settings.typicalCycleLength,
      firstPeriodMode: Boolean(r.settings?.firstPeriodMode),
      privacyBlur: Boolean(r.settings?.privacyBlur),
      quickHide: Boolean(r.settings?.quickHide),
    },
    supplies: arr<Supply>(r.supplies)
      .filter((s) => s && typeof s.name === 'string')
      .map((s) => ({
        id: String(s.id || newId()),
        name: s.name,
        count: Math.max(0, Math.round(Number(s.count) || 0)),
        lowAt: Math.max(0, Math.round(Number(s.lowAt) || 0)),
      })),
    reminders: { ...base.reminders, ...(r.reminders ?? {}) },
    shares: arr<Share>(r.shares)
      .filter((s) => s && s.id && s.key && s.writeToken)
      .map((s) => ({
        ...s,
        kind: s.kind === 'parent' ? 'parent' : 'partner',
        perms: { ...DEFAULT_PERMISSIONS.parent, ...(s.perms ?? {}) },
        paused: Boolean(s.paused),
        seen: Number(s.seen) || 0,
      })),
    prefNotes: arr<PrefNote>(r.prefNotes).filter((n) => n && typeof n.text === 'string'),
    supporter: {
      links: arr<Link>(r.supporter?.links)
        .filter((l) => l && l.id && l.key)
        .map((l) => ({ ...l, seen: Number(l.seen) || 0 })),
      checklist: arr<ChecklistItem>(r.supporter?.checklist).filter((c) => c && typeof c.text === 'string'),
      plans: arr<Plan>(r.supporter?.plans).filter((p) => p && ISO.test(p.date)),
    },
  };
}

export const isEmptyLog = (l: DayLog) =>
  !l.flow &&
  l.symptoms.length === 0 &&
  l.moods.length === 0 &&
  l.tags.length === 0 &&
  !l.notes &&
  !(l.pain && Object.keys(l.pain).length) &&
  !(l.used && Object.keys(l.used).length);
