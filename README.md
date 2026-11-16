# Petal

A private cycle tracker that runs as an installable web app. Logs are stored on the device and there is no account. Sharing with a partner or parent is optional and end-to-end encrypted.

## Run it

```
npm install
npm run dev        # open the printed address in a browser
```

Other commands: `npm test` (cycle-logic tests), `npm run build` (production build in `dist/`), `npm run preview` (serve the build).

To install it on a phone, host the `dist/` folder on any HTTPS static host, open it in the phone's browser and choose "Add to Home screen". HTTPS (or localhost) is required for the PIN encryption and offline support.

## Features

Tracking
- Period and flow logging, symptoms, moods, notes and custom tags
- Pain map: tap front and back body areas for mild, moderate or strong pain
- Cycle ring, month calendar, history and averages
- Predictions as a date range with a confidence level, plus a rough fertile-window estimate
- Patterns: symptoms, moods, tags and pain that recur at the same point in the cycle
- Late-period calm mode, and a "new to periods" mode with short explainers
- Supply tracker with low-stock notes and an estimate of how long stock will last
- Period heads-up reminder (phone notification)
- No-guilt logging: no streaks, past periods can be added in any order, long gaps are left out of the averages
- PIN lock that encrypts the data on the device (AES-GCM, key derived from the PIN with PBKDF2)
- Export: doctor summary (PDF), daily log (CSV), full backup (JSON) and restore

Sharing with a partner, parent or caregiver
- The person tracking creates a pairing code per person and chooses exactly what each one sees
- A parent starts with the minimum (period started, period late); a partner starts with phase, predictions, mood and symptoms
- Pause or stop at any time; stopping deletes the shared copy from the server
- Supporters get a "how to help today" card, her own notes, heads-up alerts, a messages inbox with one-tap replies, a plans list that flags clashes with expected period days, and a private care checklist
- One-tap nudges from the tracker to her supporters

Privacy and install
- Discreet mode: cover the screen when switching apps, and a quick-hide button that swaps Petal for a plain notes page (press and hold "Notes" to return)
- Works fully offline once opened online a single time; the whole app is cached on the device
- A "new version is ready" notice with a Refresh button when an update has been published
- Loading screen while the app starts

## Sharing setup (Supabase)

Sharing is off until a Supabase project is connected. Tracking works without it.

1. Create a project at supabase.com.
2. Open SQL Editor, paste the contents of `supabase/schema.sql` and run it.
3. In Project Settings → API, copy the project URL and the anon public key.
4. Copy `.env.example` to `.env` and fill in both values.
5. Restart `npm run dev` (or rebuild).

How it stays private: every share has its own random AES-256 key that exists only on the two devices and inside the pairing code. The tracker's device builds the view for each supporter from her permissions, encrypts it and uploads only ciphertext. The server stores encrypted blobs under random room ids and cannot read them. Tables are closed to direct access; the functions in `schema.sql` are the only way in, and only the tracker's write token can replace or delete a room. Treat a pairing code like a password: anyone who has it can read that share until it is stopped.

Live updates use Supabase Realtime broadcast as a "something changed" signal, with a 45-second poll as a fallback. Alerts are in-app for now; push notifications to a closed app are planned for Phase 4.

## Layout

- `src/lib/cycle.ts` – periods, cycles, statistics and predictions (tested in `cycle.test.ts`)
- `src/lib/storage.ts`, `src/lib/crypto.ts` – local storage and PIN encryption
- `src/lib/export.ts` – CSV, PDF and backup
- `src/lib/insights.ts` – patterns, pain summary, supplies, doctor prompts
- `src/lib/reminders.ts`, `public/sw.js` – reminders and offline support
- `src/lib/share/` – pairing codes, encryption, the shared view, supporter guidance, Supabase calls
- `src/sync.ts` – keeps shared views and messages up to date
- `src/supporter/` – the app as a partner or parent sees it
- `supabase/schema.sql` – the sharing backend
- `src/lib/pwa.ts`, `src/components/Shell.tsx` – updates, offline notice, privacy cover, quick-hide
- `src/store.tsx` – app state
- `src/screens/`, `src/components/` – the interface
- `src/styles.css` – the rose and cream theme (light and dark)

Petal gives estimates, not medical advice, and is not a method of contraception.
