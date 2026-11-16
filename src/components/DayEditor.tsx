import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../store';
import type { DayLog, Flow, ISODate } from '../types';
import { FLOW_LABELS, MOODS, PAIN_LABELS, SYMPTOMS } from '../types';
import { regionLabel } from '../lib/insights';
import { BodyMap } from './BodyMap';

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

function Chips({ options, selected, onToggle }: { options: readonly string[]; selected: string[]; onToggle(o: string): void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className="chip" aria-pressed={selected.includes(o)} onClick={() => onToggle(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** Edits one day's log. Every change saves immediately; there is nothing to submit. */
export function DayEditor({ date }: { date: ISODate }) {
  const { data, updateLog, updateSettings, logSupplyUse } = useStore();
  const log: DayLog = data.logs[date] ?? { date, symptoms: [], moods: [], tags: [] };
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Show tags used on this day even if they were later removed from settings.
  const tagOptions = [...new Set([...data.settings.customTags, ...log.tags])];

  const addTag = (e: FormEvent) => {
    e.preventDefault();
    const tag = newTag.trim().slice(0, 24);
    if (tag) {
      const existing = tagOptions.find((t) => t.toLowerCase() === tag.toLowerCase());
      if (!existing) updateSettings({ customTags: [...data.settings.customTags, tag] });
      const name = existing ?? tag;
      if (!log.tags.includes(name)) updateLog(date, { tags: [...log.tags, name] });
    }
    setNewTag('');
    setAdding(false);
  };

  return (
    <div className="editor">
      <section>
        <h3>Flow</h3>
        <div className="flow" role="radiogroup" aria-label="Flow">
          {FLOW_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={(log.flow ?? 0) === i}
              className={`flow-option flow-${i}`}
              onClick={() => updateLog(date, { flow: i as Flow })}
            >
              <span className="flow-dot" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Symptoms</h3>
        <Chips options={SYMPTOMS} selected={log.symptoms} onToggle={(s) => updateLog(date, { symptoms: toggle(log.symptoms, s) })} />
      </section>

      <section>
        <h3>Where it hurts</h3>
        <BodyMap levels={log.pain ?? {}} onChange={(pain) => updateLog(date, { pain: Object.keys(pain).length ? pain : undefined })} />
        {log.pain ? (
          <div className="chips">
            {Object.entries(log.pain).map(([id, level]) => (
              <span key={id} className="chip chip-static">
                {regionLabel(id)} · {PAIN_LABELS[level].toLowerCase()}
              </span>
            ))}
          </div>
        ) : (
          <p className="fine center">Tap an area. Tap again for moderate, strong, then off.</p>
        )}
      </section>

      <section>
        <h3>Mood</h3>
        <Chips options={MOODS} selected={log.moods} onToggle={(m) => updateLog(date, { moods: toggle(log.moods, m) })} />
      </section>

      <section>
        <h3>Your tags</h3>
        <div className="chips">
          {tagOptions.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={log.tags.includes(t)} onClick={() => updateLog(date, { tags: toggle(log.tags, t) })}>
              {t}
            </button>
          ))}
          {adding ? (
            <form className="tag-form" onSubmit={addTag}>
              <input autoFocus value={newTag} maxLength={24} placeholder="New tag" aria-label="New tag" onChange={(e) => setNewTag(e.target.value)} />
              <button type="submit" className="chip chip-add">Add</button>
            </form>
          ) : (
            <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
              + New tag
            </button>
          )}
        </div>
      </section>

      {data.supplies.length > 0 && (
        <section>
          <h3>Supplies used</h3>
          <div className="stack">
            {data.supplies.map((s) => (
              <div key={s.id} className="row">
                <span>
                  <strong>{s.name}</strong> <span className="muted">· {s.count} left</span>
                </span>
                <span className="stepper">
                  <button type="button" className="icon-btn" aria-label={`One fewer ${s.name}`} disabled={!log.used?.[s.id]} onClick={() => logSupplyUse(date, s.id, -1)}>−</button>
                  <output aria-label={`${s.name} used`}>{log.used?.[s.id] ?? 0}</output>
                  <button type="button" className="icon-btn" aria-label={`One more ${s.name}`} onClick={() => logSupplyUse(date, s.id, 1)}>+</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>Notes</h3>
        <textarea
          rows={3}
          value={log.notes ?? ''}
          placeholder="Anything worth remembering"
          aria-label="Notes"
          onChange={(e) => updateLog(date, { notes: e.target.value || undefined })}
        />
      </section>
    </div>
  );
}
