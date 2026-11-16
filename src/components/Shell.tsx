import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { applyUpdate, useOnline, useUpdateReady } from '../lib/pwa';
import { useStore } from '../store';
import { Toggle } from './SettingsParts';

export function Splash() {
  return (
    <div className="splash">
      <img src="./icon.svg" width={84} height={84} alt="Petal is loading" />
    </div>
  );
}

/** Notices that sit above the tab bar: a new version is ready, or the device is offline. */
export function Notices() {
  const { data } = useStore();
  const updateReady = useUpdateReady();
  const online = useOnline();
  const usesSharing = data.shares.length > 0 || data.supporter.links.length > 0;
  if (!updateReady && (online || !usesSharing)) return null;
  return (
    <div className="notices" role="status">
      {updateReady && (
        <div className="notice">
          <span>A new version of Petal is ready.</span>
          <button type="button" className="btn btn-primary btn-small" onClick={applyUpdate}>
            Refresh
          </button>
        </div>
      )}
      {!online && usesSharing && (
        <div className="notice">
          <span>You're offline. Everything on this device still works; sharing catches up when you reconnect.</span>
        </div>
      )}
    </div>
  );
}

/** Covers the screen whenever Petal is not the app in front, so it does not show in the app switcher. */
export function PrivacyShield() {
  const { data } = useStore();
  const [covered, setCovered] = useState(false);
  const enabled = data.settings.privacyBlur;
  useEffect(() => {
    if (!enabled) return setCovered(false);
    const cover = () => setCovered(true);
    const reveal = () => !document.hidden && setCovered(false);
    const onVisibility = () => (document.hidden ? cover() : reveal());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', cover);
    window.addEventListener('pagehide', cover);
    window.addEventListener('focus', reveal);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', cover);
      window.removeEventListener('pagehide', cover);
      window.removeEventListener('focus', reveal);
    };
  }, [enabled]);
  return covered ? (
    <div className="shield" aria-hidden="true">
      <img src="./icon.svg" width={84} height={84} alt="" />
    </div>
  ) : null;
}

export function QuickHideButton({ onHide }: { onHide(): void }) {
  const { data } = useStore();
  if (!data.settings.quickHide) return null;
  return (
    <button type="button" className="quick-hide" aria-label="Hide Petal" onClick={onHide}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3l18 18M10.6 5.2A9.7 9.7 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3.2 4.2M6.3 6.4C4.2 7.8 2.7 9.9 2 12c1 2.500 5 7 10 7 1.500 0 2.900-.4 4.100-1M9.900 9.900a3 3 0 0 0 4.200 4.200" />
      </svg>
    </button>
  );
}

const HOLD_MS = 900;

/**
 * A plain notes page shown in place of Petal after "quick hide". It looks and
 * works like a simple notes app. Pressing and holding the title brings Petal
 * back (through the PIN screen if a PIN is set).
 */
export function Decoy({ onExit }: { onExit(): void }) {
  const [notes, setNotes] = useState(['Groceries: milk, eggs, bread, rice', 'Return library book', 'Call the bank about the card', 'Ideas for the weekend']);
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const title = document.title;
    document.title = 'Notes';
    return () => {
      document.title = title;
      clearTimeout(timer.current);
    };
  }, []);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setNotes((n) => [text.trim(), ...n]);
    setText('');
  };
  const hold = () => {
    timer.current = setTimeout(onExit, HOLD_MS);
  };
  const release = () => clearTimeout(timer.current);

  return (
    <main className="decoy">
      <h1 onPointerDown={hold} onPointerUp={release} onPointerLeave={release} onContextMenu={(e) => e.preventDefault()}>
        Notes
      </h1>
      <form onSubmit={add}>
        <input value={text} placeholder="New note" aria-label="New note" onChange={(e) => setText(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      <ul>
        {notes.map((n, i) => (
          <li key={`${i}-${n}`}>{n}</li>
        ))}
      </ul>
    </main>
  );
}

export function PrivacySection() {
  const { data, updateSettings, hasPin } = useStore();
  const s = data.settings;
  return (
    <section className="card">
      <h2>Discreet mode</h2>
      <Toggle
        label="Hide when switching apps"
        detail="Covers the screen whenever Petal is not in front"
        checked={s.privacyBlur}
        onChange={(privacyBlur) => updateSettings({ privacyBlur })}
      />
      <Toggle
        label="Quick-hide button"
        detail="One tap swaps Petal for a plain notes page"
        checked={s.quickHide}
        onChange={(quickHide) => updateSettings({ quickHide })}
      />
      {s.quickHide && (
        <p className="fine">
          To come back, press and hold the word "Notes" for a second.
          {hasPin ? ' Petal will then ask for your PIN.' : ' Set a PIN as well if you want coming back to need one.'}
        </p>
      )}
      {s.privacyBlur && (
        <p className="fine">Some phones take the app-switcher picture before a web app can react, so treat this as a help, not a guarantee.</p>
      )}
    </section>
  );
}
