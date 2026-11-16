import { useCallback, useEffect, useState } from 'react';
import { DayEditor } from './components/DayEditor';
import { LockScreen } from './components/LockScreen';
import { Onboarding } from './components/Onboarding';
import { Sheet } from './components/Sheet';
import { Decoy, Notices, PrivacyShield, QuickHideButton, Splash } from './components/Shell';
import { useCycle } from './hooks';
import { fmtLong, todayISO } from './lib/dates';
import { buildReminder, syncReminder } from './lib/reminders';
import { CalendarScreen } from './screens/CalendarScreen';
import { History } from './screens/History';
import { SettingsScreen } from './screens/SettingsScreen';
import { Today } from './screens/Today';
import { useStore } from './store';
import { SupporterApp } from './supporter/SupporterApp';
import { useOwnerSync } from './sync';
import type { ISODate } from './types';

type Tab = 'today' | 'calendar' | 'history' | 'settings';

const ICONS: Record<Tab, string> = {
  today: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  calendar: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4',
  history: 'M5 20V10M12 20V4M19 20v-7',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

function TabButton({ id, label, active, onSelect }: { id: Tab; label: string; active: boolean; onSelect(t: Tab): void }) {
  return (
    <button type="button" className="tab" aria-current={active ? 'page' : undefined} onClick={() => onSelect(id)}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[id]} />
      </svg>
      {label}
    </button>
  );
}

export function App() {
  const { status, data, lock } = useStore();
  const [hidden, setHidden] = useState(false);

  // Quick hide: show the decoy at once, and lock behind it when a PIN is set.
  const hide = useCallback(() => {
    setHidden(true);
    lock();
  }, [lock]);

  if (hidden) return <Decoy onExit={() => setHidden(false)} />;
  if (status === 'loading') return <Splash />;
  if (status === 'locked') return <LockScreen />;
  if (!data.role) return <Onboarding />;
  return (
    <>
      {data.role === 'supporter' ? <SupporterApp /> : <TrackerApp />}
      <QuickHideButton onHide={hide} />
      <Notices />
      <PrivacyShield />
    </>
  );
}

function TrackerApp() {
  const { data } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const [logDate, setLogDate] = useState<ISODate | null>(null);
  const closeSheet = useCallback(() => setLogDate(null), []);
  const sync = useOwnerSync();
  const { forecast, periods, today } = useCycle();

  // Keep the period heads-up reminder in step with the latest prediction.
  const lastStart = periods[periods.length - 1]?.start;
  useEffect(() => {
    void syncReminder(buildReminder(data.reminders, forecast, lastStart), forecast, today).catch(() => undefined);
  }, [data.reminders, forecast, lastStart, today]);

  return (
    <div className="app">
      <main>
        {tab === 'today' && <Today onLog={setLogDate} sync={sync} />}
        {tab === 'calendar' && <CalendarScreen onLog={setLogDate} />}
        {tab === 'history' && <History />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.slice(0, 2).map((t) => (
          <TabButton key={t.id} {...t} active={tab === t.id} onSelect={setTab} />
        ))}
        <button type="button" className="fab" aria-label="Log today" onClick={() => setLogDate(todayISO())}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {TABS.slice(2).map((t) => (
          <TabButton key={t.id} {...t} active={tab === t.id} onSelect={setTab} />
        ))}
      </nav>

      {logDate && (
        <Sheet title={logDate === todayISO() ? 'Today' : fmtLong(logDate)} onClose={closeSheet}>
          <DayEditor date={logDate} />
        </Sheet>
      )}
    </div>
  );
}
