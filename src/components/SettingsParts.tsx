import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useStore } from '../store';

function PinForm({ onDone }: { onDone(): void }) {
  const { setPin } = useStore();
  const [pin, setPinValue] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = again.length >= pin.length && again !== pin;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pin.length < 4 || pin !== again) return;
    setBusy(true);
    await setPin(pin);
    onDone();
  };
  const digits = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => set(e.target.value.replace(/\D/g, ''));

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        New PIN (4 to 8 digits)
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={digits(setPinValue)} />
      </label>
      <label>
        Repeat PIN
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={again} aria-invalid={mismatch} onChange={digits(setAgain)} />
      </label>
      {mismatch && <p className="fine error">The two PINs do not match.</p>}
      <p className="fine">A forgotten PIN cannot be recovered. Keep a backup file somewhere safe.</p>
      <button type="submit" className="btn btn-primary" disabled={busy || pin.length < 4 || pin !== again}>
        {busy ? 'Saving…' : 'Save PIN'}
      </button>
    </form>
  );
}

export function PinSection() {
  const { hasPin, removePin, lock } = useStore();
  const [editing, setEditing] = useState(false);
  return (
    <section className="card">
      <h2>PIN lock</h2>
      <p className="muted">
        {hasPin
          ? 'On. Your data is encrypted on this device and Petal locks after a minute in the background.'
          : 'Off. Set a PIN to encrypt your data on this device.'}
      </p>
      {editing ? (
        <PinForm onDone={() => setEditing(false)} />
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn-soft" onClick={() => setEditing(true)}>
            {hasPin ? 'Change PIN' : 'Set a PIN'}
          </button>
          {hasPin && (
            <>
              <button type="button" className="btn btn-soft" onClick={lock}>Lock now</button>
              <button type="button" className="btn btn-soft" onClick={() => window.confirm('Remove the PIN? Your data will no longer be encrypted.') && void removePin()}>
                Remove PIN
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function EraseSection({ detail }: { detail: string }) {
  const { eraseAll } = useStore();
  return (
    <section className="card">
      <h2>Erase everything</h2>
      <p className="muted">{detail} This cannot be undone.</p>
      <button type="button" className="btn btn-danger" onClick={() => window.confirm('Erase all Petal data on this device? This cannot be undone.') && void eraseAll()}>
        Erase all data
      </button>
    </section>
  );
}

/** A labelled on/off switch. */
export function Toggle({ label, detail, checked, onChange }: { label: string; detail?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="toggle">
      <span>
        <strong>{label}</strong>
        {detail && <span className="fine">{detail}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
