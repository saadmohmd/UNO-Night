# UNO Night — Score Tracker

A single-device companion app for physical UNO games. One phone, tablet or laptop sits
on the table; after each round the table picks the winner, types in each player's penalty
points and the app handles the running totals and the knockout cutoff.

- 100% client-side. No backend, no accounts, no database, no network calls after load.
- Games move between phones with QR codes or a JSON file — a one-time handover, never a sync.
- The game in progress is saved in this browser on this device, so a refresh, a closed tab
  or a browser restart picks up exactly where the table left off.
- A knockout plays one short music sting; nothing else in the app makes a sound.
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
  cumulative score and elimination state, every confirmed round, the open round (winner and
  typed penalties), tie-break and controller-decision state, the ending, and the timestamps
  the scoreboard already shows. Nothing else — no emails, no accounts, no analytics, no
  history archive.
- **When** — synchronously after every state change (a penalty, a winner, a confirmed round),
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

## QR game transfer

Move a game from one phone to another without a server.

**On the old phone:** game menu ▸ *Transfer game*. The whole game is captured — players,
cumulative scores, cutoff, every confirmed round, eliminations, tie-break state and any open
round with the penalties typed in so far. It is encoded, compressed and shown as a QR code (or a set of
labelled parts), alongside a *Save game file* button.

**On the new phone:** *Import game* (home screen, or the game menu). Scan the code with the
camera, or paste/upload the file. The app validates the transfer and shows a preview — game
name, cutoff, every score, eliminations and the state of the current round. Nothing is
written until you confirm, and an existing game on that phone is only replaced after a second
confirmation.

**Two-step handover.** The phones never talk to each other, so the handover is finished by
hand: after importing, the receiving phone shows a six-character code, and the old phone is
locked to read-only when that code is entered there (game menu ▸ *Transfer game* ▸ *Mark as
transferred*). Until then the old phone stays editable. If the code is lost, a clearly
warned "mark without verification" path exists.

**What read-only means.** After the handover the old phone keeps a frozen copy it can still
read — dashboard, leaderboard, history and any unfinished round (the dashboard offers a
*Round snapshot* button while a round was mid-entry) — but every mutation is
refused by the game engine itself (not just hidden in the UI): no scoring, no round
finalisation, no endings, no second transfer. Discarding the local copy is still allowed.

### Capacity and integrity

| Situation | What happens |
| --- | --- |
| Payload fits one code (≤ 1100 characters) | One QR code, marked *Single code* |
| Longer game | Labelled parts: `Part 2 of 5`, one code at a time, scanned in any order |
| More than 24 codes would be needed | Refused with a clear message — use the game file. History is never truncated |
| Missing / repeated / corrupted part | Reported per part; a repeated part is ignored, a damaged set will not assemble |
| Foreign part (another transfer) | Refused so two handovers cannot be mixed |
| File import | Same payload plus a checksum; a tampered or truncated file is rejected |

A typical four-player game fits a single code up to roughly six confirmed rounds; a 12-round
game needs two, and 40 rounds about three.

Everything is validated on arrival: envelope version, handover id, then the game itself
through the same field-by-field validator used for saved games — 3–7 players, whole-number
penalties, cutoff range, consistent eliminations, and player references inside every round
and tie-break. Invalid transfers never reach the app state.

**Honest limitations.** This is a snapshot, not live synchronisation: two offline phones
cannot confirm each other, and scores entered on the old phone after the handover are simply
ignored (they never travel). The security is a six-character code and human care — it
prevents accidents, not a determined person. Loading a transfer replaces whatever is on the
receiving phone, so that confirmation is deliberate.

## Elimination music

One track ships with the app: `public/sounds/BALOR Music - Big B mass Dialogues.mp3`. The
name is kept exactly as uploaded and the spaces are URL-encoded in the app (`%20`), so the
browser requests `sounds/BALOR%20Music%20-%20Big%20B%20mass%20Dialogues.mp3`.

- It plays only after a knockout has been **recorded** — by the cutoff or by a table
  decision on a tie. Setting up a game, starting a round, confirming a round without a
  knockout, and restoring a saved game are all silent.
- It plays once per knockout. Going back to the results, revisiting the dashboard or
  refreshing never replays it, and the effect that triggers it cannot restart a track that
  is already sounding.
- The track is started by the tap that confirmed the round, so browsers allow it: there is
  no permission prompt and no unlock gesture.
- A missing or undecodable file is detected once and then skipped for the rest of the
  session. The knockout still lands with its splash, score and reason.

## The game

### Setup
- 3–7 players with unique names (case and surrounding whitespace are ignored).
- Optional game name.
- Score cutoff (1–100,000) — preset chips or free entry.
- The roster locks once the game starts; leaving the page warns you first.

### Scoring (direct penalty entry)

The round winner scores **0**. Every other player's score for the round is the total they
type in — the app never asks for individual cards and never re-derives the number, so
whatever the table counts (official values or house rules) is what gets recorded.

- One big numeric field per player, digits only: no negatives, no decimals.
- The winner's field is locked at 0 and cannot be edited.
- Changing the winner frees the previous winner's field so their score has to be entered.
- A round cannot be confirmed until one winner is picked and every other player has a
  whole number.
- Cumulative score = previous total + round penalty, calculated in pure functions in
  `src/game/rules.ts`; the UI never does its own arithmetic.

Games saved by an older build (which recorded per-card counts) are migrated on load using
a frozen copy of the old card values, so an open game keeps the exact scores it had.

### Round flow
1. Begin round from the dashboard.
2. Tap the round winner (their score is fixed at 0).
3. Type every other player's penalty points — the summary shows each new cumulative total.
4. Confirm the round; the scores are applied immediately and the cutoff is evaluated.
5. Results are shown, and the next round can start once enough players remain.

Confirming is final: a round cannot be confirmed until every non-winner has a valid
penalty, cannot be confirmed twice (the open round is cleared atomically), and a new round
cannot start while one is open or awaiting a tie-break.

### Cutoff and eliminations
After a **confirmed** round, the eligible player with the highest cumulative score is
knocked out **only if** that score is greater than or equal to the cutoff.

- 199 at a cutoff of 200 → stays in. 200 → out. 215 → out.
- If the top score is shared, nobody is eliminated automatically. The app shows a
  tie-break screen where the table can either play a sudden-death replay (lowest hand
  penalty survives, cumulative totals unchanged) or record a manual decision.
- Eliminated players stay on the leaderboard and in the round history, marked `Out`.
- Every player gets a drawn character (pastel tile, face, hair) instead of initials. It is
  generated from the name and the seat in `src/lib/character.ts`, so it is stable for the
  whole game, unique per seat at a table of up to seven, and needs no images or network.
- A knockout is animated: a splash lands over whatever screen is showing with the player's
  avatar, rings, a struck-through name and an `OUT` stamp, then clears itself after a few
  seconds (or on tap / Escape / Enter). It plays once per knockout — never again when you
  go back to the results or reopen the game — and the standings strike the name through.
  `prefers-reduced-motion` collapses every animation to nothing; the score, the cutoff and
  the reason are always on screen as text, so nothing is conveyed by motion alone.
- When only two players remain, a controller decision screen asks the table to either
  opt into two-player rounds or end the game. The 3-player minimum is never silently broken.
- Ends are honest: a unique lowest eligible score is a champion, a tie is an unresolved
  result unless the table explicitly declares a champion.

## Project layout

```
src/
  game/            pure engine — no React, fully unit tested
    validation.ts   roster, cutoff, penalty and round-entry validation
    legacy.ts       frozen card table, used only to read pre-penalty saves/codes
    rules.ts        scoring, cutoff evaluation, tie detection, standings
    reducer.ts      the game state machine (all mutations validated)
    selectors.ts    screen resolution and derived view data
    persistence.ts  versioned localStorage save, validation and clearing
    transfer.ts     QR payloads, part splitting, checksums, handover codes
    transferCodec.ts compact game projection used by the QR payload
    __tests__/      unit tests for every rule above
  components/      design system + game UI pieces (incl. transfer/QrCode)
  screens/         Home, Setup, Dashboard, Score Entry, Results, Leaderboard,
                   Tie-break, Decision, Final, Transfer, Import
  hooks/           beforeunload guard, camera QR scanner (jsQR)
  lib/             characters, ids, formatting, sound.ts (the knockout sting)
  __tests__/       full user-journey and persistence tests
```

## Notes and limits

- Sound is never required: a muted device, blocked autoplay or a missing file only makes the
  app quiet. Nothing in the game depends on the sting having played.
- Saves are per browser profile and per device. Two tabs of the same game are not synced —
  the last write wins — and clearing site data deletes the saved game.
- QR transfer is a handover, not a sync: the two phones never share state, and the old phone
  is only frozen when someone confirms the code on it.
- The camera needs `https://` (or `localhost`). Over plain HTTP on a LAN the scanner falls
  back automatically to the file/paste import.
- Saves from the previous (card-count) format are migrated once, on load; anything newer,
  damaged or unrecognised is discarded rather than guessed at. The app never runs on data
  it does not understand.
- The `beforeunload` warning only arms when saving is unavailable, and it is best-effort:
  browsers decide whether to show it.
- Elimination uses the "single knockout" reading of the cutoff rule: only the worst eligible
  player leaves per confirmed round. Ties are surfaced rather than resolved arbitrarily.
- Two identical names are rejected; names are trimmed but otherwise preserved as typed.
