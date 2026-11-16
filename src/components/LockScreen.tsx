import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store';

export function LockScreen() {
  const { unlock, eraseAll } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await unlock(pin);
    setBusy(false);
    if (!ok) {
      setError(true);
      setPin('');
    }
  };

  const forgot = () => {
    if (window.confirm('There is no way to recover a forgotten PIN. Erase everything on this device and start again?')) {
      void eraseAll();
    }
  };

  return (
    <main className="lock">
      <img src="./icon.svg" alt="" width={72} height={72} />
      <h1>Petal</h1>
      <form onSubmit={submit}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          placeholder="PIN"
          aria-label="PIN"
          aria-invalid={error}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''));
            setError(false);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || pin.length < 4}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <p className="lock-error" role="alert">
          {error ? 'That PIN did not work. Try again.' : ''}
        </p>
      </form>
      <button type="button" className="link" onClick={forgot}>
        Forgot PIN?
      </button>
    </main>
  );
}
