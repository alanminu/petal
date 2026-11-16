import { useState } from 'react';
import type { FormEvent } from 'react';
import * as backend from '../lib/share/backend';
import { parsePairing } from '../lib/share/codec';
import { useStore } from '../store';
import { Toggle } from './SettingsParts';

/** Reads a pairing code from the page address (…#pair=CODE), if the app was opened from a pairing link. */
export const pairingFromAddress = (): string => new URLSearchParams(location.hash.slice(1)).get('pair') ?? '';

/** Connects this device to someone who shares with it. Used at first run and from supporter settings. */
export function ConnectForm({ onDone }: { onDone?(): void }) {
  const { data, update } = useStore();
  const [code, setCode] = useState(pairingFromAddress);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parsePairing(code);
    if (!parsed) return setError('That does not look like a Petal pairing code. Paste the whole code or link.');
    if (data.supporter.links.some((l) => l.id === parsed.id)) return setError('You are already connected with this code.');
    if (!backend.sharingConfigured) return setError('Sharing is not set up in this copy of Petal yet.');
    setBusy(true);
    setError('');
    try {
      if (!(await backend.getSnapshot(parsed.id))) {
        setError('This code is no longer active. Ask for a new one.');
      } else {
        update((prev) => ({
          ...prev,
          role: 'supporter',
          supporter: { ...prev.supporter, links: [...prev.supporter.links, { ...parsed, label: label.trim().slice(0, 24) || 'My person', seen: 0 }] },
        }));
        history.replaceState(null, '', location.pathname);
        onDone?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the sharing server.');
    }
    setBusy(false);
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Pairing code or link
        <textarea rows={3} value={code} required placeholder="P1-…" onChange={(e) => setCode(e.target.value)} />
      </label>
      <label>
        What do you call them?
        <input value={label} maxLength={24} placeholder="Their name" onChange={(e) => setLabel(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      {error && <p className="fine error" role="alert">{error}</p>}
    </form>
  );
}

export function Onboarding() {
  const { update } = useStore();
  const [step, setStep] = useState<'role' | 'tracker' | 'supporter'>(pairingFromAddress() ? 'supporter' : 'role');
  const [name, setName] = useState('');
  const [firstPeriod, setFirstPeriod] = useState(false);

  const startTracking = (e: FormEvent) => {
    e.preventDefault();
    update((prev) => ({
      ...prev,
      role: 'tracker',
      displayName: name.trim().slice(0, 24),
      settings: { ...prev.settings, firstPeriodMode: firstPeriod },
    }));
  };

  return (
    <main className="onboarding">
      <img src="./icon.svg" alt="" width={72} height={72} />
      <h1>Welcome to Petal</h1>

      {step === 'role' && (
        <>
          <p className="muted center">A private cycle tracker. Your data stays on this device unless you choose to share it.</p>
          <button type="button" className="card choice" onClick={() => setStep('tracker')}>
            <strong>I'm tracking my cycle</strong>
            <span className="muted">Log periods and symptoms, see predictions, and share only what you choose.</span>
          </button>
          <button type="button" className="card choice" onClick={() => setStep('supporter')}>
            <strong>I'm supporting someone</strong>
            <span className="muted">For a partner, parent or caregiver who has been given a pairing code.</span>
          </button>
        </>
      )}

      {step === 'tracker' && (
        <form className="card stack" onSubmit={startTracking}>
          <label>
            Your name (optional)
            <input value={name} maxLength={24} placeholder="Only shown to people you share with" onChange={(e) => setName(e.target.value)} />
          </label>
          <Toggle label="I'm new to periods" detail="Adds short explainers and gentler wording while cycles settle" checked={firstPeriod} onChange={setFirstPeriod} />
          <button type="submit" className="btn btn-primary">Start</button>
          <button type="button" className="link" onClick={() => setStep('role')}>Back</button>
        </form>
      )}

      {step === 'supporter' && (
        <div className="card stack">
          <p className="muted">Enter the code you were given. You will see only what they have chosen to share, and they can pause or stop at any time.</p>
          <ConnectForm />
          <button type="button" className="link" onClick={() => setStep('role')}>Back</button>
        </div>
      )}
    </main>
  );
}
