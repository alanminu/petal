import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { EraseSection, PinSection, Toggle } from '../components/SettingsParts';
import { SharingPanel } from '../components/SharingSheet';
import { Sheet } from '../components/Sheet';
import { PrivacySection } from '../components/Shell';
import { todayISO } from '../lib/dates';
import { download, toBackup, toCSV, toPDF } from '../lib/export';
import { notificationsSupported, requestNotifications } from '../lib/reminders';
import { useStore } from '../store';
import type { Supply } from '../types';
import { normalizeData } from '../types';

function RemindersSection() {
  const { data, update } = useStore();
  const r = data.reminders;
  const [note, setNote] = useState('');
  const set = (patch: Partial<typeof r>) => update((prev) => ({ ...prev, reminders: { ...prev.reminders, ...patch } }));

  const toggle = async (on: boolean) => {
    if (!on) return set({ periodHeadsUp: false });
    if (!notificationsSupported()) return setNote('This browser does not support notifications.');
    if (await requestNotifications()) {
      set({ periodHeadsUp: true });
      setNote('');
    } else {
      setNote('Notifications are blocked for Petal. Allow them in the browser or phone settings, then try again.');
    }
  };

  return (
    <section className="card">
      <h2>Reminders</h2>
      <Toggle label="Period heads-up" detail="A phone notification shortly before a period is expected" checked={r.periodHeadsUp} onChange={(v) => void toggle(v)} />
      {r.periodHeadsUp && (
        <>
          <label className="inline">
            <input type="number" min={1} max={5} value={r.daysBefore} aria-label="Days before" onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= 5) set({ daysBefore: Math.round(n) });
            }} />
            days before the earliest expected date
          </label>
          <Toggle label="Discreet wording" detail="The notification does not mention periods" checked={r.discreet} onChange={(discreet) => set({ discreet })} />
        </>
      )}
      {note && <p className="fine error" role="alert">{note}</p>}
      <p className="fine">
        Petal has no server sending reminders, so they arrive when the app is opened on or after that day. Installed on Android Chrome, they can also arrive in the background.
      </p>
    </section>
  );
}

function SuppliesSection() {
  const { data, update } = useStore();
  const patch = (id: string, p: Partial<Supply>) =>
    update((prev) => ({ ...prev, supplies: prev.supplies.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  if (data.supplies.length === 0) return null;
  return (
    <section className="card">
      <h2>Supplies</h2>
      <p className="muted">Correct the count, or choose when Petal should say an item is running low.</p>
      {data.supplies.map((s) => (
        <div key={s.id} className="supply-edit">
          <strong>{s.name}</strong>
          <label>
            In stock
            <input type="number" min={0} max={999} value={s.count} onChange={(e) => patch(s.id, { count: Math.max(0, Math.round(Number(e.target.value))) })} />
          </label>
          <label>
            Low at
            <input type="number" min={0} max={99} value={s.lowAt} onChange={(e) => patch(s.id, { lowAt: Math.max(0, Math.round(Number(e.target.value))) })} />
          </label>
          <button type="button" className="icon-btn" aria-label={`Remove ${s.name}`} onClick={() => window.confirm(`Remove ${s.name}?`) && update((prev) => ({ ...prev, supplies: prev.supplies.filter((x) => x.id !== s.id) }))}>×</button>
        </div>
      ))}
    </section>
  );
}

export function SettingsScreen() {
  const { data, updateSettings, replaceData } = useStore();
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stamp = todayISO();

  const exportPDF = async () => {
    setMessage('Preparing PDF…');
    download(`petal-summary-${stamp}.pdf`, await toPDF(data));
    setMessage('');
  };

  const importBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = normalizeData(JSON.parse(await file.text()));
      const count = Object.keys(next.logs).length;
      if (count === 0) return setMessage('That file has no logged days in it.');
      if (window.confirm(`Replace everything in Petal with the ${count} logged days from this backup?`)) {
        replaceData({ ...next, role: 'tracker' });
        setMessage('Backup restored.');
      }
    } catch {
      setMessage('That file could not be read as a Petal backup.');
    }
  };

  const removeTag = (tag: string) => updateSettings({ customTags: data.settings.customTags.filter((t) => t !== tag) });
  const sharedWith = data.shares.map((s) => s.label).join(', ');

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Settings</h1>
      </header>

      <section className="card">
        <h2>Sharing</h2>
        <p className="muted">
          {data.shares.length ? `Sharing with ${sharedWith}.` : 'Let a partner, parent or caregiver see only what you choose.'}
        </p>
        <button type="button" className="btn btn-soft" onClick={() => setSharing(true)}>
          Manage sharing
        </button>
      </section>

      <RemindersSection />
      <PinSection />
      <PrivacySection />
      <SuppliesSection />

      <section className="card">
        <h2>Your tags</h2>
        <p className="muted">Tags you create while logging appear here. Removing one keeps it on days already logged.</p>
        {data.settings.customTags.length === 0 ? (
          <p className="fine">No tags yet. Add one from any day's log.</p>
        ) : (
          <div className="chips">
            {data.settings.customTags.map((t) => (
              <span key={t} className="chip chip-static">
                {t}
                <button type="button" className="chip-x" aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)}>×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Cycle</h2>
        <label className="inline">
          <input
            type="number"
            min={15}
            max={60}
            value={data.settings.typicalCycleLength}
            aria-label="Typical cycle length in days"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 15 && n <= 60) updateSettings({ typicalCycleLength: Math.round(n) });
            }}
          />
          days in a typical cycle
        </label>
        <p className="fine">Used only until a few cycles have been logged.</p>
        <Toggle label="I'm new to periods" detail="Short explainers and gentler wording while cycles settle" checked={data.settings.firstPeriodMode} onChange={(firstPeriodMode) => updateSettings({ firstPeriodMode })} />
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">Your logs are stored on this device. Exports are always free and complete.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-soft" onClick={exportPDF}>Summary for a doctor (PDF)</button>
          <button type="button" className="btn btn-soft" onClick={() => download(`petal-log-${stamp}.csv`, new Blob([toCSV(data)], { type: 'text/csv' }))}>
            Daily log (CSV)
          </button>
          <button type="button" className="btn btn-soft" onClick={() => download(`petal-backup-${stamp}.json`, new Blob([toBackup(data)], { type: 'application/json' }))}>
            Backup file
          </button>
          <button type="button" className="btn btn-soft" onClick={() => fileRef.current?.click()}>Restore from backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
        </div>
        {message && <p className="fine" role="status">{message}</p>}
        <p className="fine">Export files are not encrypted, and the backup includes your sharing keys, so store them somewhere private.</p>
      </section>

      <EraseSection detail="Deletes all logs, tags and the PIN from this device. Stop sharing first if you also want shared copies removed from the server." />

      <p className="fine center">Petal gives estimates, not medical advice, and is not a method of contraception.</p>

      {sharing && (
        <Sheet title="Sharing" onClose={() => setSharing(false)}>
          <SharingPanel />
        </Sheet>
      )}
    </div>
  );
}
