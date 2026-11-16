import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import * as backend from '../lib/share/backend';
import { newSecrets, pairingCode, pairingLink, sha256Hex } from '../lib/share/codec';
import { useStore } from '../store';
import type { Permissions, PrefNote, Share, ShareKind } from '../types';
import { DEFAULT_PERMISSIONS, PERMISSION_LABELS, newId } from '../types';
import { Toggle } from './SettingsParts';

const KIND_LABEL: Record<ShareKind, string> = { partner: 'Partner', parent: 'Parent or caregiver' };
const WHEN_LABEL: Record<PrefNote['when'], string> = { period: 'On my period', before: 'Just before my period', any: 'Any time' };

function Pairing({ share }: { share: Share }) {
  const code = pairingCode(share.id, share.key);
  const link = pairingLink(code);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#3d2b30', light: '#fffdf9' } }).then(setQr, () => setQr(''));
  }, [link]);
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what} copied.`);
    } catch {
      setCopied('Could not copy. Select the code and copy it by hand.');
    }
  };
  return (
    <div className="pairing">
      <p className="fine">
        Give this to {share.label} in person or over a private chat. Anyone with the code can see what you share here, so treat it like a password.
      </p>
      {qr && <img src={qr} width={180} height={180} alt="Pairing QR code" />}
      <code className="code">{code}</code>
      <div className="btn-row">
        <button type="button" className="btn btn-soft btn-small" onClick={() => void copy(link, 'Link')}>Copy link</button>
        <button type="button" className="btn btn-soft btn-small" onClick={() => void copy(code, 'Code')}>Copy code</button>
      </div>
      {copied && <p className="fine" role="status">{copied}</p>}
    </div>
  );
}

function ShareCard({ share }: { share: Share }) {
  const { update } = useStore();
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState('');
  const patch = (p: Partial<Share>) =>
    update((prev) => ({ ...prev, shares: prev.shares.map((s) => (s.id === share.id ? { ...s, ...p } : s)) }));

  const stop = async () => {
    if (!window.confirm(`Stop sharing with ${share.label}? They lose access straight away and the shared copy is deleted.`)) return;
    try {
      await backend.deleteRoom(share.id, share.writeToken);
      update((prev) => ({ ...prev, shares: prev.shares.filter((s) => s.id !== share.id) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the sharing server. Try again when online.');
    }
  };

  return (
    <section className="card">
      <div className="row">
        <h2>{share.label}</h2>
        <span className="badge">{KIND_LABEL[share.kind]}</span>
      </div>
      <Toggle label="Pause sharing" detail="They see only that sharing is paused" checked={share.paused} onChange={(paused) => patch({ paused })} />
      <p className="fine">Always shared while not paused: whether a period has started, and whether it is late.</p>
      {(Object.keys(PERMISSION_LABELS) as (keyof Permissions)[]).map((k) => (
        <Toggle
          key={k}
          label={PERMISSION_LABELS[k][0]}
          detail={PERMISSION_LABELS[k][1]}
          checked={share.perms[k]}
          onChange={(v) => patch({ perms: { ...share.perms, [k]: v } })}
        />
      ))}
      <div className="btn-row">
        <button type="button" className="btn btn-soft btn-small" onClick={() => setShowCode((s) => !s)}>
          {showCode ? 'Hide pairing code' : 'Show pairing code'}
        </button>
        <button type="button" className="btn btn-danger btn-small" onClick={() => void stop()}>Stop sharing</button>
      </div>
      {showCode && <Pairing share={share} />}
      {error && <p className="fine error" role="alert">{error}</p>}
    </section>
  );
}

function AddShare() {
  const { update } = useStore();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ShareKind>('partner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setError('');
    try {
      const secrets = newSecrets();
      await backend.createRoom(secrets.id, await sha256Hex(secrets.writeToken));
      const share: Share = { ...secrets, label: label.trim().slice(0, 24), kind, perms: DEFAULT_PERMISSIONS[kind], paused: false, seen: 0 };
      update((prev) => ({ ...prev, shares: [...prev.shares, share] }));
      setLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the sharing server.');
    }
    setBusy(false);
  };

  return (
    <section className="card">
      <h2>Share with someone</h2>
      <form className="stack" onSubmit={submit}>
        <label>
          Their name
          <input value={label} maxLength={24} placeholder="Alex" required onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="chips" role="radiogroup" aria-label="Relationship">
          {(Object.keys(KIND_LABEL) as ShareKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} aria-pressed={kind === k} className="chip" onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="fine">
          {kind === 'parent'
            ? 'A parent or caregiver starts with the minimum: period started and period late. You can switch on more.'
            : 'A partner starts with cycle phase, predictions, mood and symptoms. You can change every item.'}
        </p>
        <button type="submit" className="btn btn-primary" disabled={busy || !label.trim()}>
          {busy ? 'Creating…' : 'Create pairing code'}
        </button>
        {error && <p className="fine error" role="alert">{error}</p>}
      </form>
    </section>
  );
}

function PrefNotes() {
  const { data, update } = useStore();
  const [text, setText] = useState('');
  const [when, setWhen] = useState<PrefNote['when']>('period');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    update((prev) => ({ ...prev, prefNotes: [...prev.prefNotes, { id: newId(), when, text: text.trim().slice(0, 160) }] }));
    setText('');
  };
  return (
    <section className="card">
      <h2>Notes for the people you share with</h2>
      <p className="muted">Tell them what helps. Each note appears for them at the time you choose.</p>
      {data.prefNotes.map((n) => (
        <div key={n.id} className="row">
          <span>
            <span className="fine">{WHEN_LABEL[n.when]}</span>
            <br />
            {n.text}
          </span>
          <button type="button" className="icon-btn" aria-label={`Remove note: ${n.text}`} onClick={() => update((prev) => ({ ...prev, prefNotes: prev.prefNotes.filter((x) => x.id !== n.id) }))}>×</button>
        </div>
      ))}
      <form className="stack" onSubmit={add}>
        <div className="chips" role="radiogroup" aria-label="When to show this note">
          {(Object.keys(WHEN_LABEL) as PrefNote['when'][]).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={when === w} aria-pressed={when === w} className="chip" onClick={() => setWhen(w)}>
              {WHEN_LABEL[w]}
            </button>
          ))}
        </div>
        <input value={text} maxLength={160} placeholder="A heating pad and quiet, please" aria-label="Note" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-soft" disabled={!text.trim()}>Add note</button>
      </form>
    </section>
  );
}

/** Where the tracker decides who sees what. Nothing here can be changed by a supporter. */
export function SharingPanel() {
  const { data, update } = useStore();
  if (!backend.sharingConfigured) {
    return (
      <section className="card">
        <h2>Sharing is not set up yet</h2>
        <p className="muted">
          Sharing needs a Supabase project. Follow the "Sharing setup" steps in the README, add the two values to a <code>.env</code> file and rebuild.
        </p>
      </section>
    );
  }
  return (
    <div className="stack">
      <p className="muted">
        You decide who sees what, and you can pause or stop at any time. What you share is encrypted on this device; the server cannot read it.
      </p>
      <section className="card">
        <label>
          Your name, as they will see it (optional)
          <input value={data.displayName} maxLength={24} onChange={(e) => update((prev) => ({ ...prev, displayName: e.target.value }))} />
        </label>
      </section>
      {data.shares.map((s) => (
        <ShareCard key={s.id} share={s} />
      ))}
      <AddShare />
      <PrefNotes />
    </div>
  );
}
