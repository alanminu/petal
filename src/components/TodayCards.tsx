import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Forecast, Stats } from '../lib/cycle';
import { supplyStatus } from '../lib/insights';
import type { Period } from '../lib/cycle';
import { NUDGES } from '../lib/share/view';
import { useStore } from '../store';
import type { Message } from '../sync';
import { ago } from '../sync';
import type { ISODate } from '../types';
import { newId } from '../types';

/** Shown when a period is past its expected range. Informative, never alarming. */
export function CalmCard({ forecast, stats, firstPeriodMode, onLog }: { forecast: Forecast; stats: Stats; firstPeriodMode: boolean; onLog(): void }) {
  const n = forecast.daysLate;
  return (
    <section className="card card-calm">
      <h2>Running a little late</h2>
      <p>
        Your period is {n} day{n === 1 ? '' : 's'} past the expected range. Today is day {forecast.cycleDay}
        {stats.shortest !== undefined && stats.shortest !== stats.longest
          ? `, and your logged cycles have ranged from ${stats.shortest} to ${stats.longest} days.`
          : '.'}
      </p>
      <ul className="plain-list">
        <li>Cycles shift for ordinary reasons: stress, travel, illness, or changes in sleep, exercise or weight.</li>
        {firstPeriodMode && <li>In the first couple of years, irregular cycles are very common.</li>}
        <li>If pregnancy is possible, a home test is reliable from the first day of a missed period.</li>
        <li>If periods stop for three months, or this is worrying you, a doctor can help.</li>
      </ul>
      <button type="button" className="btn btn-soft" onClick={onLog}>
        My period started
      </button>
    </section>
  );
}

const FACTS = [
  ['What a first period looks like', 'Often light, and it can be brown or dark red rather than bright red. Both are normal.'],
  ['How long it lasts', 'Usually between two and seven days. Yours may be shorter or longer at first.'],
  ['How often it comes', 'Roughly once a month, but for the first couple of years the gap can vary a lot.'],
  ['Looking after yourself', 'Change a pad every few hours, or sooner when it feels full. Warmth and rest help with cramps.'],
  ['When to ask for help', 'Talk to a trusted adult or a doctor if pain stops you doing normal things, or bleeding is very heavy.'],
] as const;

export function FirstPeriodCard() {
  return (
    <section className="card">
      <h2>Good to know</h2>
      {FACTS.map(([title, body]) => (
        <details key={title}>
          <summary>{title}</summary>
          <p className="muted">{body}</p>
        </details>
      ))}
    </section>
  );
}

export function SuppliesCard({ periods, today }: { periods: Period[]; today: ISODate }) {
  const { data, update, logSupplyUse } = useStore();
  const [name, setName] = useState('');
  const [count, setCount] = useState(10);
  const [adding, setAdding] = useState(false);
  const [restock, setRestock] = useState<{ id: string; amount: number } | null>(null);
  const status = supplyStatus(data.supplies, data.logs, periods);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update((prev) => ({
      ...prev,
      supplies: [...prev.supplies, { id: newId(), name: name.trim().slice(0, 24), count: Math.max(0, count), lowAt: 4 }],
    }));
    setName('');
    setAdding(false);
  };

  const applyRestock = (e: FormEvent) => {
    e.preventDefault();
    if (!restock) return;
    update((prev) => ({
      ...prev,
      supplies: prev.supplies.map((s) => (s.id === restock.id ? { ...s, count: s.count + Math.max(0, restock.amount) } : s)),
    }));
    setRestock(null);
  };

  return (
    <section className="card">
      <div className="row">
        <h2>Supplies</h2>
        <button type="button" className="btn btn-soft btn-small" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Close' : 'Add item'}
        </button>
      </div>
      {adding && (
        <form className="period-form" onSubmit={add}>
          <label>
            Item
            <input value={name} maxLength={24} placeholder="Pads" required onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            In stock
            <input type="number" min={0} max={999} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      )}
      {status.length === 0 && !adding && <p className="muted">Keep count of pads, tampons or anything else, and see when to restock.</p>}
      {status.map(({ supply, low, periodsLeft }) => (
        <div key={supply.id} className="supply">
          <div className="row">
            <span>
              <strong>{supply.name}</strong> <span className="muted">· {supply.count} left</span>
              {low && <span className="badge badge-low">Running low</span>}
            </span>
            <span className="btn-row">
              <button type="button" className="btn btn-soft btn-small" disabled={supply.count === 0} onClick={() => logSupplyUse(today, supply.id, 1)}>
                Used one
              </button>
              <button type="button" className="btn btn-soft btn-small" onClick={() => setRestock({ id: supply.id, amount: 10 })}>
                Restock
              </button>
            </span>
          </div>
          {periodsLeft !== undefined && (
            <p className="fine">
              {periodsLeft < 1 ? 'Less than one period’s worth left.' : `About ${Math.floor(periodsLeft)} period${Math.floor(periodsLeft) === 1 ? '' : 's'}’ worth left, going by recent use.`}
            </p>
          )}
          {restock?.id === supply.id && (
            <form className="row" onSubmit={applyRestock}>
              <label className="inline">
                Add
                <input type="number" min={1} max={999} autoFocus value={restock.amount} onChange={(e) => setRestock({ id: supply.id, amount: Number(e.target.value) })} />
              </label>
              <button type="submit" className="btn btn-primary btn-small">Save</button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}

/** One-tap messages to the people she shares with, and their replies. */
export function NudgeCard({ messages, error, onSend, onSeen }: { messages: Message[]; error: string; onSend(text: string, shareIds: string[]): Promise<void>; onSeen(): void }) {
  const { data } = useStore();
  const active = data.shares.filter((s) => !s.paused);
  const [to, setTo] = useState<string[] | null>(null);
  const [custom, setCustom] = useState('');
  const [status, setStatus] = useState('');
  if (active.length === 0) return null;

  const recipients = to ?? active.map((s) => s.id);
  const send = async (text: string) => {
    if (!text.trim() || recipients.length === 0) return;
    setStatus('Sending…');
    try {
      await onSend(text.trim().slice(0, 140), recipients);
      const names = active.filter((s) => recipients.includes(s.id)).map((s) => s.label);
      setStatus(`Sent to ${names.join(' and ')}.`);
      setCustom('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not send.');
    }
  };

  const unseen = (m: Message) => !m.fromMe && m.id > (data.shares.find((s) => s.id === m.room)?.seen ?? 0);
  const recent = messages.slice(0, 4);

  return (
    <section className="card">
      <h2>Send a nudge</h2>
      {active.length > 1 && (
        <div className="chips" role="group" aria-label="Send to">
          {active.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              aria-pressed={recipients.includes(s.id)}
              onClick={() => setTo(recipients.includes(s.id) ? recipients.filter((x) => x !== s.id) : [...recipients, s.id])}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="chips">
        {NUDGES.map((n) => (
          <button key={n} type="button" className="chip" onClick={() => void send(n)}>
            {n}
          </button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void send(custom); }}>
        <input value={custom} maxLength={140} placeholder="Or write your own" aria-label="Your own message" onChange={(e) => setCustom(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-small" disabled={!custom.trim()}>Send</button>
      </form>
      {(status || error) && <p className="fine" role="status">{status || error}</p>}
      {recent.length > 0 && (
        <ul className="messages" onClick={onSeen}>
          {recent.map((m) => (
            <li key={`${m.room}-${m.id}`} className={unseen(m) ? 'is-new' : ''}>
              <span>
                <strong>{m.fromMe ? `You to ${m.label}` : m.label}:</strong> {m.text}
              </span>
              <span className="fine">{ago(m.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
