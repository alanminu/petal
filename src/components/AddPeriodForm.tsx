import { useState } from 'react';
import type { FormEvent } from 'react';
import { addDays, todayISO } from '../lib/dates';
import { useStore } from '../store';

/** Adds a whole past period in one go, so history can be filled in at any time. */
export function AddPeriodForm({ onDone }: { onDone?(): void }) {
  const { addPeriod } = useStore();
  const today = todayISO();
  const [start, setStart] = useState(addDays(today, -14));
  const [days, setDays] = useState(5);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!start || start > today) return;
    addPeriod(start, Math.min(14, Math.max(1, days)));
    onDone?.();
  };

  return (
    <form className="period-form" onSubmit={submit}>
      <label>
        First day
        <input type="date" value={start} max={today} required onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        How many days
        <input type="number" min={1} max={14} value={days} required onChange={(e) => setDays(Number(e.target.value))} />
      </label>
      <button type="submit" className="btn btn-primary">
        Add period
      </button>
    </form>
  );
}
