import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BodyMap } from '../components/BodyMap';
import { ConnectForm } from '../components/Onboarding';
import { EraseSection, PinSection } from '../components/SettingsParts';
import { PrivacySection } from '../components/Shell';
import { addDays, diffDays, fmtDate, fmtLong, fmtRange, todayISO } from '../lib/dates';
import { regionLabel } from '../lib/insights';
import { sharingConfigured } from '../lib/share/backend';
import { FLAG_TEXT, guidanceFor } from '../lib/share/guidance';
import type { SharedView } from '../lib/share/view';
import { REPLIES } from '../lib/share/view';
import { useStore } from '../store';
import type { LinkState, Message } from '../sync';
import { ago, useSupporterSync } from '../sync';
import type { Link, PrefNote } from '../types';
import { PAIN_LABELS, newId } from '../types';

type Tab = 'home' | 'plans' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Today', icon: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2' },
  { id: 'plans', label: 'Plans', icon: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4' },
  { id: 'settings', label: 'Settings', icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4' },
];

const CHECKLIST_IDEAS = ['Restock pads', 'Pain relief', 'Heating pad', 'Favourite snack'];

/** Which of the person's notes apply right now. */
function notesForNow(view: SharedView, today: string): PrefNote[] {
  const soon = view.next ? diffDays(view.next.earliest, today) <= 5 && !view.onPeriod : view.bucket === 'before';
  return view.notes.filter((n) => n.when === 'any' || (n.when === 'period' && view.onPeriod) || (n.when === 'before' && soon));
}

function StatusCard({ view, name, today }: { view: SharedView; name: string; today: string }) {
  const late = (view.daysLate ?? 0) > 0 && !view.onPeriod;
  let headline = 'No period right now';
  if (view.onPeriod) headline = 'On their period';
  else if (late) headline = 'Period is later than expected';
  if (view.periodStart === undefined) headline = 'Nothing logged yet';

  let when = '';
  if (view.next && !view.onPeriod && !late) {
    const from = diffDays(view.next.earliest, today);
    const to = diffDays(view.next.latest, today);
    when = from <= 0 ? 'Could start any day now' : from === to ? `In ${from} days` : `In ${from}–${to} days`;
  }

  return (
    <section className="card">
      <p className="eyebrow">{name} · right now</p>
      <p className="big">{headline}</p>
      {view.onPeriod && view.periodStart && <p className="muted">Started {fmtDate(view.periodStart)}</p>}
      {view.cycleDay !== undefined && <p className="muted">Day {view.cycleDay} of the cycle</p>}
      {view.next && !view.onPeriod && (
        <p>
          Next period expected <strong>{fmtRange(view.next.earliest, view.next.latest)}</strong>
          {when && <span className="muted"> · {when}</span>}
        </p>
      )}
      {late && <p className="muted">Cycles often shift by a few days. There is usually nothing to do.</p>}
    </section>
  );
}

function Inbox({ link, messages, onReply, onSeen }: { link: Link; messages: Message[]; onReply(text: string): Promise<void>; onSeen(): void }) {
  const [status, setStatus] = useState('');
  const mine = messages.filter((m) => m.room === link.id);
  const hasNew = mine.some((m) => !m.fromMe && m.id > link.seen);
  // Seeing the inbox counts as reading it.
  useEffect(() => {
    if (!hasNew) return;
    const t = setTimeout(onSeen, 4000);
    return () => clearTimeout(t);
  }, [hasNew, onSeen]);

  const send = async (text: string) => {
    setStatus('Sending…');
    try {
      await onReply(text);
      setStatus('Sent.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not send.');
    }
  };

  return (
    <section className="card">
      <div className="row">
        <h2>Messages</h2>
        {hasNew && <span className="badge badge-low">New</span>}
      </div>
      {mine.length === 0 ? (
        <p className="muted">Nudges from {link.label} appear here, live while Petal is open.</p>
      ) : (
        <ul className="messages">
          {mine.slice(0, 6).map((m) => (
            <li key={m.id} className={!m.fromMe && m.id > link.seen ? 'is-new' : ''}>
              <span>
                <strong>{m.fromMe ? 'You' : link.label}:</strong> {m.text}
              </span>
              <span className="fine">{ago(m.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="chips">
        {REPLIES.map((r) => (
          <button key={r} type="button" className="chip" onClick={() => void send(r)}>
            {r}
          </button>
        ))}
      </div>
      {status && <p className="fine" role="status">{status}</p>}
    </section>
  );
}

function Home({ link, state, messages, onReply, onSeen }: { link: Link; state: LinkState | undefined; messages: Message[]; onReply(text: string): Promise<void>; onSeen(): void }) {
  const { update } = useStore();
  const today = todayISO();
  const remove = () =>
    update((prev) => ({ ...prev, supporter: { ...prev.supporter, links: prev.supporter.links.filter((l) => l.id !== link.id) } }));

  if (!sharingConfigured) {
    return <section className="card"><h2>Sharing is not set up</h2><p className="muted">This copy of Petal has no sharing server configured.</p></section>;
  }
  if (!state || state.status === 'loading') return <section className="card"><p className="muted">Loading…</p></section>;
  if (state.status === 'ended') {
    return (
      <section className="card">
        <h2>Sharing has ended</h2>
        <p className="muted">{link.label} is no longer sharing with this device. That is their choice to make.</p>
        <button type="button" className="btn btn-soft" onClick={remove}>Remove {link.label}</button>
      </section>
    );
  }
  if (state.status === 'unreadable') {
    return <section className="card"><h2>Cannot read this share</h2><p className="muted">The pairing code does not match. Ask {link.label} for a new one.</p></section>;
  }
  if (state.status === 'waiting' || !state.view) {
    return (
      <section className="card">
        <h2>{state.status === 'error' ? 'Cannot connect right now' : 'Connected'}</h2>
        <p className="muted">{state.status === 'error' ? state.error : `Waiting for ${link.label} to open Petal. Their update will appear here.`}</p>
      </section>
    );
  }

  const view = state.view;
  const name = view.name || link.label;
  if (view.paused) {
    return (
      <>
        <section className="card">
          <p className="eyebrow">{name}</p>
          <p className="big">Sharing is paused</p>
          <p className="muted">{link.label} has paused sharing for now. It will pick up again when they switch it back on.</p>
        </section>
        <Inbox link={link} messages={messages} onReply={onReply} onSeen={onSeen} />
      </>
    );
  }

  const late = (view.daysLate ?? 0) > 0 && !view.onPeriod;
  const guidance = guidanceFor(view.kind, view.bucket, Boolean(view.onPeriod), late);
  const notes = notesForNow(view, today);
  const daysToEarliest = view.next && !view.onPeriod ? diffDays(view.next.earliest, today) : undefined;
  const logged = [...(view.moods ?? []), ...(view.symptoms ?? [])];
  const stale = view.date < addDays(today, -1);

  return (
    <>
      {daysToEarliest !== undefined && daysToEarliest >= 0 && daysToEarliest <= 2 && !late && (
        <section className="card card-calm" role="status">
          <strong>
            {daysToEarliest === 0 ? 'A period could start today.' : `A period is likely in the next ${daysToEarliest === 1 ? 'day' : '2 days'}.`}
          </strong>
          <span className="muted">
            {view.kind === 'parent' ? 'A good moment to check the school bag has a kit.' : 'A good moment to check supplies are stocked.'}
          </span>
        </section>
      )}

      <StatusCard view={view} name={name} today={today} />

      <section className="card">
        <p className="eyebrow">How to help today</p>
        <h2>{guidance.title}</h2>
        {notes.length > 0 && (
          <div className="stack">
            <p className="fine">In their words</p>
            {notes.map((n) => (
              <blockquote key={n.id}>{n.text}</blockquote>
            ))}
          </div>
        )}
        <ul className="plain-list">
          {guidance.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {(logged.length > 0 || view.pain) && (
        <section className="card">
          <h2>Logged today</h2>
          {logged.length > 0 && (
            <div className="chips">
              {logged.map((x) => (
                <span key={x} className="chip chip-static">{x}</span>
              ))}
            </div>
          )}
          {view.pain && (
            <>
              <BodyMap levels={view.pain} />
              <p className="fine center">
                {Object.entries(view.pain).map(([id, level]) => `${regionLabel(id)}: ${PAIN_LABELS[level].toLowerCase()}`).join(' · ')}
              </p>
            </>
          )}
        </section>
      )}

      {view.lowSupplies && (
        <section className="card">
          <h2>Running low</h2>
          <p>{view.lowSupplies.join(', ')}</p>
        </section>
      )}

      {view.flags?.map((f) => (
        <section key={f} className="card card-calm">
          <h2>Worth a conversation</h2>
          <p>{FLAG_TEXT[f]}</p>
        </section>
      ))}

      <Inbox link={link} messages={messages} onReply={onReply} onSeen={onSeen} />

      <p className="fine center">
        {stale ? `Last update from ${link.label} was on ${fmtDate(view.date)}; it refreshes when they open Petal.` : state.updatedAt ? `Updated ${ago(Date.parse(state.updatedAt))}.` : ''}
        {state.error ? ' Offline right now.' : ''}
      </p>
    </>
  );
}

function Plans({ view, label }: { view: SharedView | undefined; label: string }) {
  const { data, update } = useStore();
  const today = todayISO();
  const [date, setDate] = useState(addDays(today, 7));
  const [title, setTitle] = useState('');
  const [item, setItem] = useState('');
  const { plans, checklist } = data.supporter;
  const set = (patch: Partial<typeof data.supporter>) => update((prev) => ({ ...prev, supporter: { ...prev.supporter, ...patch } }));

  const addPlan = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    set({ plans: [...plans, { id: newId(), date, title: title.trim().slice(0, 60) }].sort((a, b) => a.date.localeCompare(b.date)) });
    setTitle('');
  };
  const addItem = (text: string) => {
    if (!text.trim() || checklist.some((c) => c.text === text.trim())) return;
    set({ checklist: [...checklist, { id: newId(), text: text.trim().slice(0, 60), done: false }] });
    setItem('');
  };
  const clash = (d: string) => view?.next && d >= view.next.earliest && d <= view.next.latest;
  const ideas = [...(view?.lowSupplies ?? []).map((s) => `Restock ${s.toLowerCase()}`), ...CHECKLIST_IDEAS].filter(
    (i, n, all) => all.indexOf(i) === n && !checklist.some((c) => c.text === i),
  );

  return (
    <>
      <section className="card">
        <h2>Plans</h2>
        <p className="muted">
          {view?.next
            ? `Add trips or events to see whether they land in ${label}'s expected period range (${fmtRange(view.next.earliest, view.next.latest)}).`
            : `Add trips or events. If ${label} shares predictions, Petal will flag any that land on expected period days.`}
        </p>
        {plans.filter((p) => p.date >= today).map((p) => (
          <div key={p.id} className="row">
            <span>
              <strong>{p.title}</strong>
              <br />
              <span className="fine">{fmtLong(p.date)}</span>
              {clash(p.date) && <span className="badge badge-low">In the expected period range</span>}
            </span>
            <button type="button" className="icon-btn" aria-label={`Remove ${p.title}`} onClick={() => set({ plans: plans.filter((x) => x.id !== p.id) })}>×</button>
          </div>
        ))}
        <form className="period-form" onSubmit={addPlan}>
          <label>
            What
            <input value={title} maxLength={60} placeholder="Weekend trip" required onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            When
            <input type="date" value={date} min={today} required onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-soft">Add plan</button>
        </form>
      </section>

      <section className="card">
        <h2>Care checklist</h2>
        {checklist.length === 0 && <p className="muted">Things to have ready. Only you see this list.</p>}
        {checklist.map((c) => (
          <div key={c.id} className="row">
            <label className="check">
              <input type="checkbox" checked={c.done} onChange={(e) => set({ checklist: checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })} />
              <span className={c.done ? 'is-done' : ''}>{c.text}</span>
            </label>
            <button type="button" className="icon-btn" aria-label={`Remove ${c.text}`} onClick={() => set({ checklist: checklist.filter((x) => x.id !== c.id) })}>×</button>
          </div>
        ))}
        {ideas.length > 0 && (
          <div className="chips">
            {ideas.map((i) => (
              <button key={i} type="button" className="chip chip-add" onClick={() => addItem(i)}>
                + {i}
              </button>
            ))}
          </div>
        )}
        <form className="row" onSubmit={(e) => { e.preventDefault(); addItem(item); }}>
          <input value={item} maxLength={60} placeholder="Add your own" aria-label="New checklist item" onChange={(e) => setItem(e.target.value)} />
          <button type="submit" className="btn btn-soft btn-small" disabled={!item.trim()}>Add</button>
        </form>
      </section>
    </>
  );
}

function SupporterSettings() {
  const { data, update } = useStore();
  const [adding, setAdding] = useState(false);
  const links = data.supporter.links;
  return (
    <>
      <section className="card">
        <h2>People</h2>
        {links.map((l) => (
          <div key={l.id} className="row">
            <strong>{l.label}</strong>
            <button
              type="button"
              className="btn btn-soft btn-small"
              onClick={() => window.confirm(`Disconnect from ${l.label}? You will need a new code to reconnect.`) && update((prev) => ({ ...prev, supporter: { ...prev.supporter, links: prev.supporter.links.filter((x) => x.id !== l.id) } }))}
            >
              Disconnect
            </button>
          </div>
        ))}
        {adding ? <ConnectForm onDone={() => setAdding(false)} /> : (
          <button type="button" className="btn btn-soft" onClick={() => setAdding(true)}>Connect with a code</button>
        )}
        <p className="fine">You see only what each person chooses to share. They can pause or stop at any time, and you cannot change what is shared.</p>
      </section>
      <PinSection />
      <PrivacySection />
      <EraseSection detail="Removes your connections, plans, checklist and PIN from this device." />
    </>
  );
}

/** The app as a partner, parent or caregiver sees it. */
export function SupporterApp() {
  const { data } = useStore();
  const sync = useSupporterSync();
  const [tab, setTab] = useState<Tab>('home');
  const links = data.supporter.links;
  const [selected, setSelected] = useState(links[0]?.id);
  const link = links.find((l) => l.id === selected) ?? links[0];
  const state = link ? sync.states[link.id] : undefined;
  const unread = (l: Link) => sync.messages.some((m) => m.room === l.id && !m.fromMe && m.id > l.seen);

  return (
    <div className="app">
      <main className="screen">
        <header className="screen-head">
          <p className="eyebrow">{fmtLong(todayISO())}</p>
          <h1>{tab === 'home' ? (link?.label ?? 'Petal') : tab === 'plans' ? 'Plans' : 'Settings'}</h1>
        </header>

        {tab !== 'settings' && links.length > 1 && (
          <div className="chips" role="group" aria-label="Person">
            {links.map((l) => (
              <button key={l.id} type="button" className="chip" aria-pressed={l.id === link?.id} onClick={() => setSelected(l.id)}>
                {l.label}
                {unread(l) && <span className="cal-dot dot-inline" aria-label="new message" />}
              </button>
            ))}
          </div>
        )}

        {tab === 'settings' ? (
          <SupporterSettings />
        ) : !link ? (
          <section className="card">
            <h2>Connect with someone</h2>
            <ConnectForm />
          </section>
        ) : tab === 'home' ? (
          <Home link={link} state={state} messages={sync.messages} onReply={(t) => sync.reply(link.id, t)} onSeen={() => sync.markSeen(link.id)} />
        ) : (
          <Plans view={state?.view?.paused ? undefined : state?.view} label={link.label} />
        )}
      </main>

      <nav className="tabbar tabbar-3" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
