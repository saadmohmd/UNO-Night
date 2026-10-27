# UNO Night — Score Tracker

A single-device companion app for physical UNO games. One phone, tablet or laptop sits
on the table; everyone records the cards left in their hand after each round and the app
handles the maths, approvals and the knockout cutoff.

- 100% client-side. No backend, no accounts, no database, no network calls after load.
- Sessions live in memory only. Refreshing, closing the tab or resetting clears everything.
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

## The game

### Setup
- 3–7 players with unique names (case and surrounding whitespace are ignored).
- Optional game name.
- Score cutoff (1–100,000) — preset chips or free entry.
- Submission mode: **manual approval** or **automatic approval**.
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
4. Submit — pending approval, or accepted immediately in automatic mode.
5. Approve / reject (rejections never touch cumulative scores), then finalize.
6. Scores are applied, the cutoff is evaluated, and results are shown.
7. Continue with the next round when at least the minimum number of players remains.

A round cannot be finalized before it is valid, cannot be finalized twice, and a new round
cannot start while one is open, pending, or awaiting a tie-break.

### Cutoff and eliminations
After a **finalized** round, the eligible player with the highest cumulative score is
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
    __tests__/      unit tests for every rule above
  components/      design system + game UI pieces
  screens/         Home, Setup, Dashboard, Score Entry, Approval, Results,
                   Leaderboard, Tie-break, Decision, Final
  hooks/           beforeunload guard
  __tests__/       full user-journey component tests
```

## Notes and limits

- The `beforeunload` warning is best-effort: browsers decide whether to show it, and a lost
  session cannot be recovered because nothing is persisted by design.
- Elimination uses the "single knockout" reading of the cutoff rule: only the worst eligible
  player leaves per finalized round. Ties are surfaced rather than resolved arbitrarily.
- Two identical names are rejected; names are trimmed but otherwise preserved as typed.
