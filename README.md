# UNO Night — Score Tracker

A single-device companion app for physical UNO games. One phone, tablet or laptop sits
on the table; everyone records the cards left in their hand after each round and the app
handles the maths and the knockout cutoff.

- 100% client-side. No backend, no accounts, no database, no network calls after load.
- The game in progress is saved in this browser on this device, so a refresh, a closed tab
  or a browser restart picks up exactly where the table left off.
- React 19 + TypeScript + Vite + Tailwind CSS v4, with shadcn-style primitives built on
  Radix UI and Lucide icons.

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173
```

Other scripts:

```bash
npm test               # unit + component test suite (Vitest)
npm run typecheck      # tsc project build check
npm run build          # typecheck + production bundle into dist/
npm run preview        # serve the production build
```

## Deploy the static frontend

The build output is a plain static bundle in `dist/` (relative asset paths, so it works
from any subdirectory). Host it anywhere that serves files:

- **Netlify / Vercel / Cloudflare Pages** — build command `npm run build`, publish directory `dist`.
- **GitHub Pages** — publish `dist/` (the Vite `base` is `./`, so no extra config is needed).
- **Any static host / S3 bucket / nginx** — upload the contents of `dist/`.

No environment variables, server routes or API keys are involved.

## Saving and restoring

The whole game lives in one `localStorage` record on this device.

- **What is saved** — phase, game name, cutoff, player names and count, each player's
  cumulative score and elimination state, every confirmed round, the open round (winner,
  card counts, confirmations), tie-break and controller-decision state, the ending, and the
  timestamps the scoreboard already shows. Nothing else — no emails, no accounts, no
  analytics, no history archive.
- **When** — synchronously after every state change (a count, a winner, a confirmed round),
  so a refresh loses nothing.
- **On load** — the record is validated field by field before it is used, then the app
  reopens the screen the game is in: score entry for an open round, the tie-break or
  controller decision when one is pending, the final standings for a finished game,
  otherwise the dashboard. A round confirmed just before a refresh reopens on the dashboard
  with its result in the round log.
- **When it goes wrong** — unreadable JSON, a payload that is not a real game, scores that
  are not whole numbers, missing players, unknown player references or a save written by a
  different version are all rejected. The app clears the record and says so on the home
  screen instead of restoring something half-broken.
- **Discarding** — the game menu's *Discard game* entry (or *Discard saved game* on the
  restored notice) asks for confirmation, then deletes the record from this device. The
  final screen asks before it replaces or deletes a saved result.
- **Privacy** — everything stays in this browser. Clearing site data, using a private
  window or a different browser/device starts fresh.

Storage can be unavailable (private mode, disabled site data, a full quota). The app keeps
working and shows a "Saving is off" notice; only then does it fall back to the browser's
leave-warning while a game is active.

## The game

### Setup
- 3–7 players with unique names (case and surrounding whitespace are ignored).
- Optional game name.
- Score cutoff (1–100,000) — preset chips or free entry.
- The roster locks once the game starts; leaving the page warns you first.

### Scoring (official point values)

| Card | Points |
| --- | --- |
| Number 0–9 | face value |
| Skip | 10 |
| Reverse | 10 |
| Draw Two (+2) | 20 |
| Wild | 40 |
| Wild Draw Four (+4) | 40 |

`round penalty = Σ (card count × card value)` for every player except the winner, whose
penalty is forced to 0 even if they still hold cards. Cumulative score = previous total +
round penalty. All maths lives in pure functions in `src/game/cards.ts` and is used by every
screen — there is no duplicated formula in the UI.

### Round flow
1. Begin round from the dashboard.
2. Pick the single round winner, then record and confirm each player's remaining cards
   (steppers plus direct numeric entry, live penalty preview).
3. Review the card-by-card breakdown in a confirmation sheet.
4. Confirm the round — the scores are applied immediately and the cutoff is evaluated.
5. Results are shown, and the next round can start once at least the minimum number of
   players remains.

Confirming is final: a round cannot be confirmed until every hand is valid, cannot be
confirmed twice, and a new round cannot start while one is open or awaiting a tie-break.

### Cutoff and eliminations
After a **confirmed** round, the eligible player with the highest cumulative score is
knocked out **only if** that score is greater than or equal to the cutoff.

- 199 at a cutoff of 200 → stays in. 200 → out. 215 → out.
- If the top score is shared, nobody is eliminated automatically. The app shows a
  tie-break screen where the table can either play a sudden-death replay (lowest hand
  penalty survives, cumulative totals unchanged) or record a manual decision.
- Eliminated players stay on the leaderboard and in the round history, marked `Out`.
- When only two players remain, a controller decision screen asks the table to either
  opt into two-player rounds or end the game. The 3-player minimum is never silently broken.
- Ends are honest: a unique lowest eligible score is a champion, a tie is an unresolved
  result unless the table explicitly declares a champion.

## Project layout

```
src/
  game/            pure engine — no React, fully unit tested
    cards.ts        card catalogue, penalty + breakdown maths
    validation.ts   roster, cutoff, count and round-entry validation
    rules.ts        scoring, cutoff evaluation, tie detection, standings
    reducer.ts      the game state machine (all mutations validated)
    selectors.ts    screen resolution and derived view data
    persistence.ts  versioned localStorage save, validation and clearing
    __tests__/      unit tests for every rule above
  components/      design system + game UI pieces
  screens/         Home, Setup, Dashboard, Score Entry, Results,
                   Leaderboard, Tie-break, Decision, Final
  hooks/           beforeunload guard (used only when saving is unavailable)
  __tests__/       full user-journey and persistence tests
```

## Notes and limits

- Saves are per browser profile and per device. Two tabs of the same game are not synced —
  the last write wins — and clearing site data deletes the saved game.
- A save from an incompatible version is discarded rather than migrated; the app never runs
  on data it does not understand.
- The `beforeunload` warning only arms when saving is unavailable, and it is best-effort:
  browsers decide whether to show it.
- Elimination uses the "single knockout" reading of the cutoff rule: only the worst eligible
  player leaves per confirmed round. Ties are surfaced rather than resolved arbitrarily.
- Two identical names are rejected; names are trimmed but otherwise preserved as typed.
