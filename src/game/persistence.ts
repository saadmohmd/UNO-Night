/**
 * Local-only save game.
 *
 * The whole game lives in `localStorage` on this device — there is no server, no
 * account and no history archive. A save is a single JSON record holding the
 * exact `GameState` the UI renders, so a refresh (or a browser restart) can put
 * the table back where it was.
 *
 * Two rules keep this safe:
 *  - Saving is best effort. A blocked or full storage never breaks play; the app
 *    just reports that saving is off.
 *  - Loading trusts nothing. Saved data is re-validated field by field, version
 *    checked and rejected (then deleted) if it is damaged or from another build.
 *
 * Only gameplay data is stored: display names, round penalties, scores,
 * eliminations and the timestamps the scoreboard already shows. Nothing is sent
 * anywhere.
 *
 * Saves written before penalties were typed in directly stored per-card counts.
 * Those are migrated on load (see `migrateLegacyGame`) so an open game keeps the
 * exact scores it already had.
 */

import { legacyPenalty } from './legacy'
import { MAX_NAME_LENGTH, MAX_PENALTY, MAX_PLAYERS, MIN_PLAYERS, validateCutoff } from './validation'
import type {
  CurrentRound,
  DecisionState,
  EliminationRecord,
  EliminationVia,
  GameEnding,
  GamePhase,
  GameState,
  GameTransfer,
  PlayerRecord,
  RoundEntries,
  RoundKind,
  RoundOutcome,
  RoundRecord,
  RoundScoreLine,
  TieBreakHand,
  TieBreakRecord,
  TieBreakState,
} from './types'

export const SAVED_GAME_KEY = 'uno-night:game'
export const SAVED_GAME_VERSION = 2

/** Anything larger than this is not a genuine save; refuse to parse it. */
const MAX_SAVED_CHARS = 512 * 1024
const MAX_ID_LENGTH = 64
const MAX_LABEL_LENGTH = 80

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadResult =
  /** Nothing was saved on this device. */
  | { status: 'empty' }
  /** A valid game was restored. */
  | { status: 'restored'; game: GameState; savedAt: number }
  /** Data existed but was unusable; it has been deleted. */
  | { status: 'discarded'; reason: string }
  /** The browser blocks localStorage (private mode, disabled storage, ...). */
  | { status: 'unavailable' }

export type SaveResult =
  | { ok: true; savedAt: number }
  | { ok: false; error: string }

/** Thrown internally when saved data does not match the expected shape. */
class CorruptSave extends Error {}

/** Thrown when the record itself is fine but written by another build. */
class OutdatedSave extends Error {}

const SAVE_UNAVAILABLE = 'This browser is blocking local storage, so this game is not being saved.'
const SAVE_FAILED = 'This device refused the save. Keep this tab open so the scores are not lost.'

/** localStorage when it is usable, otherwise null. Never throws. */
export function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    const probe = `${SAVED_GAME_KEY}:probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

function reject(message: string): never {
  throw new CorruptSave(message)
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject(`${field} is not an object`)
  }
  return value as Record<string, unknown>
}

function text(
  value: unknown,
  field: string,
  { min = 1, max = MAX_LABEL_LENGTH }: { min?: number; max?: number } = {},
): string {
  if (typeof value !== 'string') reject(`${field} is not text`)
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) reject(`${field} has an invalid length`)
  return trimmed
}

function integer(
  value: unknown,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    reject(`${field} is not a valid whole number`)
  }
  return value
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') reject(`${field} is not true/false`)
  return value
}

function list(value: unknown, field: string, { min = 0, max = 500 } = {}): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    reject(`${field} is not a valid list`)
  }
  return value
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    reject(`${field} has an unknown value`)
  }
  return value as T
}

function maybe<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === null || value === undefined ? null : parse(value)
}

const GAME_PHASES: readonly GamePhase[] = ['idle', 'active', 'finished']
const ROUND_KINDS: readonly RoundKind[] = ['round', 'tie-break']
const ROUND_OUTCOMES: readonly RoundOutcome[] = [
  'continue',
  'tie-break',
  'insufficient-players',
  'champion',
  'game-ended',
]
const ELIMINATION_VIA: readonly EliminationVia[] = ['cutoff', 'tie-break-replay', 'tie-break-manual']
const ENDING_VIA = ['last-standing', 'controller-end', 'manual-end', 'declared'] as const
const ENDING_KIND = ['champion', 'unresolved'] as const

function parsePlayerId(value: unknown, field: string): string {
  return text(value, field, { max: MAX_ID_LENGTH })
}

function parseEntries(value: unknown, participants: string[]): RoundEntries {
  const source = record(value, 'round entries')
  const entries: RoundEntries = {}
  for (const id of participants) {
    const entry = record(source[id], 'round entry')
    entries[id] = {
      // `null` is a field the operator has not filled in yet.
      penalty: maybe(entry.penalty, (item) =>
        integer(item, 'round penalty', { min: 0, max: MAX_PENALTY }),
      ),
    }
  }
  for (const key of Object.keys(source)) {
    if (!participants.includes(key)) reject('a hand is recorded for an unknown player')
  }
  return entries
}

function parseCurrentRound(value: unknown, knownIds: Set<string>): CurrentRound {
  const source = record(value, 'current round')
  const participants = list(source.participants, 'round players', { min: 2, max: MAX_PLAYERS }).map(
    (entry) => {
      const id = parsePlayerId(entry, 'round player')
      if (!knownIds.has(id)) reject('the open round references an unknown player')
      return id
    },
  )
  if (new Set(participants).size !== participants.length) reject('the open round repeats a player')

  const winnerId = maybe(source.winnerId, (entry) => {
    const id = parsePlayerId(entry, 'round winner')
    if (!participants.includes(id)) reject('the round winner is not part of the round')
    return id
  })

  return {
    id: text(source.id, 'round id', { max: MAX_ID_LENGTH }),
    kind: oneOf(source.kind, 'round kind', ROUND_KINDS),
    roundNumber: integer(source.roundNumber, 'round number', { min: 1, max: 999 }),
    participants,
    entries: parseEntries(source.entries, participants),
    winnerId,
    tieBreakPlayerIds: maybe(source.tieBreakPlayerIds, (entry) =>
      list(entry, 'tie-break players', { max: MAX_PLAYERS }).map((item) => {
        const id = parsePlayerId(item, 'tie-break player')
        if (!participants.includes(id)) reject('the tie-break group is not part of the round')
        return id
      }),
    ),
  }
}

function parseScoreLine(value: unknown, knownIds: Set<string>): RoundScoreLine {
  const source = record(value, 'score line')
  const playerId = parsePlayerId(source.playerId, 'score line player')
  if (!knownIds.has(playerId)) reject('a score line references an unknown player')
  return {
    playerId,
    name: text(source.name, 'score line name', { max: MAX_NAME_LENGTH }),
    penalty: integer(source.penalty, 'score line penalty', { max: 1_000_000 }),
    previousTotal: integer(source.previousTotal, 'score line previous total', { max: 10_000_000 }),
    newTotal: integer(source.newTotal, 'score line new total', { max: 10_000_000 }),
    isWinner: bool(source.isWinner, 'score line winner flag'),
  }
}

function parseElimination(value: unknown, knownIds: Set<string>): EliminationRecord {
  const source = record(value, 'elimination')
  const playerId = parsePlayerId(source.playerId, 'eliminated player')
  if (!knownIds.has(playerId)) reject('an elimination references an unknown player')
  return {
    playerId,
    playerName: text(source.playerName, 'eliminated player name', { max: MAX_NAME_LENGTH }),
    cumulativeScore: integer(source.cumulativeScore, 'elimination score', { max: 10_000_000 }),
    order: integer(source.order, 'elimination order', { min: 1, max: MAX_PLAYERS }),
    roundNumber: integer(source.roundNumber, 'elimination round', { min: 1, max: 999 }),
    via: oneOf(source.via, 'elimination reason', ELIMINATION_VIA),
  }
}

function parseTieBreakHand(value: unknown): TieBreakHand {
  const source = record(value, 'tie-break hand')
  return {
    penalty: integer(source.penalty, 'tie-break penalty', { min: 0, max: MAX_PENALTY }),
  }
}

function parseTieBreakRecord(value: unknown, knownIds: Set<string>): TieBreakRecord {
  const source = record(value, 'tie-break')
  const playerIds = list(source.playerIds, 'tie-break players', { min: 2, max: MAX_PLAYERS }).map(
    (entry) => {
      const id = parsePlayerId(entry, 'tie-break player')
      if (!knownIds.has(id)) reject('a tie-break references an unknown player')
      return id
    },
  )
  const hands = maybe(source.hands, (entry) => {
    const mapped = record(entry, 'tie-break hands')
    const parsed: Record<string, TieBreakHand> = {}
    for (const id of playerIds) parsed[id] = parseTieBreakHand(mapped[id])
    return parsed
  })
  return {
    kind: oneOf(source.kind, 'tie-break kind', ['replay', 'manual'] as const),
    playerIds,
    winnerId: maybe(source.winnerId, (entry) => {
      const id = parsePlayerId(entry, 'tie-break winner')
      if (!playerIds.includes(id)) reject('the tie-break winner is not part of the tie-break')
      return id
    }),
    hands,
    eliminatedPlayerId: maybe(source.eliminatedPlayerId, (entry) => {
      const id = parsePlayerId(entry, 'tie-break elimination')
      if (!playerIds.includes(id)) reject('the tie-break elimination is not part of the tie-break')
      return id
    }),
    note: maybe(source.note, (entry) => text(entry, 'tie-break note', { max: 200 })),
    at: integer(source.at, 'tie-break time', { max: 9_999_999_999_999 }),
  }
}

function parseRound(value: unknown, index: number, knownIds: Set<string>): RoundRecord {
  const source = record(value, 'round')
  const roundNumber = integer(source.roundNumber, 'round number', { min: 1, max: 999 })
  if (roundNumber !== index + 1) reject('rounds are out of sequence')
  const winnerId = parsePlayerId(source.winnerId, 'round winner')
  if (!knownIds.has(winnerId)) reject('a round winner is unknown')
  return {
    id: text(source.id, 'round id', { max: MAX_ID_LENGTH }),
    kind: oneOf(source.kind, 'round kind', ['round'] as const),
    roundNumber,
    winnerId,
    winnerName: text(source.winnerName, 'round winner name', { max: MAX_NAME_LENGTH }),
    lines: list(source.lines, 'round score lines', { min: 2, max: MAX_PLAYERS }).map((line) =>
      parseScoreLine(line, knownIds),
    ),
    cutoff: integer(source.cutoff, 'round cutoff', { min: 1, max: 100_000 }),
    finalizedAt: integer(source.finalizedAt, 'round time', { max: 9_999_999_999_999 }),
    eliminations: list(source.eliminations, 'eliminations', { max: MAX_PLAYERS }).map((entry) =>
      parseElimination(entry, knownIds),
    ),
    tieBreaks: list(source.tieBreaks, 'tie-breaks', { max: 200 }).map((entry) =>
      parseTieBreakRecord(entry, knownIds),
    ),
    outcome: oneOf(source.outcome, 'round outcome', ROUND_OUTCOMES),
    tieBreakPlayerIds: maybe(source.tieBreakPlayerIds, (entry) =>
      list(entry, 'tie-break players', { max: MAX_PLAYERS }).map((item) => {
        const id = parsePlayerId(item, 'tie-break player')
        if (!knownIds.has(id)) reject('a tie-break group references an unknown player')
        return id
      }),
    ),
  }
}

function parsePlayers(value: unknown): PlayerRecord[] {
  const source = list(value, 'players', { min: MIN_PLAYERS, max: MAX_PLAYERS })
  const players = source.map<PlayerRecord>((entry) => {
    const player = record(entry, 'player')
    const eliminated = bool(player.eliminated, 'player elimination flag')
    const eliminatedAtRound = maybe(player.eliminatedAtRound, (item) =>
      integer(item, 'elimination round', { min: 1, max: 999 }),
    )
    const eliminationOrder = maybe(player.eliminationOrder, (item) =>
      integer(item, 'elimination order', { min: 1, max: MAX_PLAYERS }),
    )
    if (eliminated && (eliminatedAtRound === null || eliminationOrder === null)) {
      reject('a player is marked out but has no elimination details')
    }
    if (!eliminated && (eliminatedAtRound !== null || eliminationOrder !== null)) {
      reject('a player still in the game has elimination details')
    }
    return {
      id: parsePlayerId(player.id, 'player id'),
      name: text(player.name, 'player name', { max: MAX_NAME_LENGTH }),
      cumulativeScore: integer(player.cumulativeScore, 'player score', { max: 10_000_000 }),
      eliminated,
      eliminatedAtRound,
      eliminationOrder,
    }
  })

  const ids = new Set(players.map((player) => player.id))
  if (ids.size !== players.length) reject('two players share an id')
  const names = new Set(players.map((player) => player.name.trim().toLowerCase()))
  if (names.size !== players.length) reject('two players share a name')
  return players
}

export function parseGameState(value: unknown): GameState {
  const source = record(value, 'game')
  const phase = oneOf(source.phase, 'game phase', GAME_PHASES)
  if (phase === 'idle') reject('the saved game has not started')

  const players = parsePlayers(source.players)
  const knownIds = new Set(players.map((player) => player.id))

  const configSource = maybe(source.config, (entry) => record(entry, 'game settings'))
  if (!configSource) reject('the saved game has no settings')
  const cutoffRaw =
    typeof configSource.cutoff === 'number' || typeof configSource.cutoff === 'string'
      ? configSource.cutoff
      : reject('the saved cutoff is not a number')
  const cutoff = validateCutoff(cutoffRaw)
  if (!cutoff.ok || cutoff.value === null) reject('the saved cutoff is out of range')

  const game: GameState = {
    phase,
    config: {
      name:
        configSource.name === undefined
          ? ''
          : text(configSource.name, 'game name', { min: 0, max: 60 }),
      cutoff: cutoff.value,
      startedAt: integer(configSource.startedAt, 'game start time', { max: 9_999_999_999_999 }),
    },
    players,
    rounds: list(source.rounds, 'rounds', { max: 1000 }).map((entry, index) =>
      parseRound(entry, index, knownIds),
    ),
    currentRound: maybe(source.currentRound, (entry) => parseCurrentRound(entry, knownIds)),
    tieBreak: maybe(source.tieBreak, (entry): TieBreakState => {
      const tie = record(entry, 'tie-break')
      return {
        playerIds: list(tie.playerIds, 'tied players', { min: 2, max: MAX_PLAYERS }).map((item) => {
          const id = parsePlayerId(item, 'tied player')
          if (!knownIds.has(id)) reject('a tie references an unknown player')
          return id
        }),
        score: integer(tie.score, 'tie score', { max: 10_000_000 }),
        sourceRoundId: text(tie.sourceRoundId, 'tie source round', { max: MAX_ID_LENGTH }),
        sourceRoundNumber: integer(tie.sourceRoundNumber, 'tie source round number', {
          min: 1,
          max: 999,
        }),
      }
    }),
    decision: maybe(source.decision, (entry): DecisionState => {
      const decision = record(entry, 'decision')
      return {
        kind: oneOf(decision.kind, 'decision kind', ['insufficient-players'] as const),
        activePlayerIds: list(decision.activePlayerIds, 'remaining players', {
          max: MAX_PLAYERS,
        }).map((item) => {
          const id = parsePlayerId(item, 'remaining player')
          if (!knownIds.has(id)) reject('the decision references an unknown player')
          return id
        }),
        roundNumber: integer(decision.roundNumber, 'decision round', { min: 0, max: 999 }),
      }
    }),
    ending: maybe(source.ending, (entry): GameEnding => {
      const ending = record(entry, 'game ending')
      const kind = oneOf(ending.kind, 'ending kind', ENDING_KIND)
      const championId = maybe(ending.championId, (item) => {
        const id = parsePlayerId(item, 'champion')
        if (!knownIds.has(id)) reject('the champion is unknown')
        return id
      })
      if (kind === 'champion' && !championId) reject('a champion ending has no champion')
      return {
        kind,
        championId,
        namedPlayerIds: list(ending.namedPlayerIds, 'named players', { max: MAX_PLAYERS }).map(
          (item) => {
            const id = parsePlayerId(item, 'named player')
            if (!knownIds.has(id)) reject('a named player is unknown')
            return id
          },
        ),
        via: oneOf(ending.via, 'ending reason', ENDING_VIA),
        atRound: integer(ending.atRound, 'ending round', { min: 0, max: 999 }),
        at: integer(ending.at, 'ending time', { max: 9_999_999_999_999 }),
      }
    }),
    transfer: maybe(source.transfer, (entry): GameTransfer => {
      const transfer = record(entry, 'transfer')
      const id = text(transfer.id, 'transfer id', { max: MAX_ID_LENGTH })
      return {
        id,
        lockedAt: maybe(transfer.lockedAt, (item) =>
          integer(item, 'transfer lock time', { min: 0, max: 9_999_999_999_999 }),
        ),
      }
    }),
    allowTwoPlayerRounds: bool(source.allowTwoPlayerRounds, 'two-player setting'),
    nextEliminationOrder: integer(source.nextEliminationOrder, 'elimination counter', {
      min: 1,
      max: MAX_PLAYERS + 1,
    }),
    startedAt: maybe(source.startedAt, (entry) =>
      integer(entry, 'start time', { max: 9_999_999_999_999 }),
    ),
  }

  if (phase === 'finished' && !game.ending) reject('the finished game has no recorded ending')
  if (phase === 'active' && game.ending) reject('an active game already has an ending')
  if (game.tieBreak && game.decision) reject('the game is both in a tie-break and a decision')
  return game
}

/**
 * Rewrites a version-1 game into the current shape.
 *
 * Version 1 recorded a counter per card type and derived the penalty from UNO's
 * card values. A finished round already carried its penalty, so only the open
 * round needs arithmetic; the frozen legacy table does that conversion once.
 * Anything malformed is left in place for `parseGameState` to reject.
 */
export function migrateLegacyGame(value: unknown): unknown {
  if (!isObject(value)) return value
  const game: Record<string, unknown> = { ...value }

  if (Array.isArray(game.rounds)) {
    game.rounds = game.rounds.map((round) => {
      if (!isObject(round)) return round
      const next: Record<string, unknown> = { ...round }
      if (Array.isArray(round.lines)) {
        next.lines = round.lines.map((line) => {
          if (!isObject(line)) return line
          const { counts: _counts, totalCards: _totalCards, ...rest } = line
          return rest
        })
      }
      if (Array.isArray(round.tieBreaks)) {
        next.tieBreaks = round.tieBreaks.map((tieBreak) => {
          if (!isObject(tieBreak)) return tieBreak
          const migrated: Record<string, unknown> = { ...tieBreak }
          if (isObject(tieBreak.hands)) {
            const hands: Record<string, { penalty: number | null }> = {}
            for (const [id, hand] of Object.entries(tieBreak.hands)) {
              hands[id] = {
                penalty: isObject(hand)
                  ? typeof hand.penalty === 'number'
                    ? hand.penalty
                    : legacyPenalty(hand.counts)
                  : null,
              }
            }
            migrated.hands = hands
          }
          return migrated
        })
      }
      return next
    })
  }

  if (isObject(game.currentRound) && isObject(game.currentRound.entries)) {
    const entries: Record<string, { penalty: number | null }> = {}
    for (const [id, entry] of Object.entries(game.currentRound.entries)) {
      entries[id] = {
        penalty: isObject(entry) ? legacyPenalty(entry.counts) : null,
      }
    }
    game.currentRound = { ...game.currentRound, entries }
  }

  return game
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validates and normalises a raw parsed record. Throws `CorruptSave` when unusable. */
export function parseSavedGame(value: unknown): { game: GameState; savedAt: number } {
  const source = record(value, 'saved game')
  const version = integer(source.version, 'save version', { min: 0, max: 1000 })
  if (version > SAVED_GAME_VERSION) {
    throw new OutdatedSave(`save version ${version}`)
  }
  const savedAt = integer(source.savedAt, 'save time', { min: 0, max: 9_999_999_999_999 })
  const game = version === SAVED_GAME_VERSION ? source.game : migrateLegacyGame(source.game)
  return { game: parseGameState(game), savedAt }
}

/**
 * Reads the saved game for this device. Never throws and never writes — the
 * caller decides when to clear a rejected record (the app does it on mount), so
 * reading stays safe to repeat during React's development double-render.
 */
export function loadSavedGame(storage: StorageLike | null = getBrowserStorage()): LoadResult {
  if (!storage) return { status: 'unavailable' }

  let raw: string | null
  try {
    raw = storage.getItem(SAVED_GAME_KEY)
  } catch {
    return { status: 'unavailable' }
  }
  if (!raw) return { status: 'empty' }
  if (raw.length > MAX_SAVED_CHARS) {
    return {
      status: 'discarded',
      reason: 'It was far larger than a real game and has been cleared.',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'discarded', reason: 'It could not be read and has been cleared.' }
  }

  try {
    const { game, savedAt } = parseSavedGame(parsed)
    return { status: 'restored', game, savedAt }
  } catch (error) {
    if (error instanceof OutdatedSave) {
      return {
        status: 'discarded',
        reason: 'It was saved by a different version of the app and has been cleared.',
      }
    }
    if (error instanceof CorruptSave) {
      // Keep the technical detail in the console; the table only needs the gist.
      console.warn('[UNO Night] Saved game rejected:', error.message)
      return { status: 'discarded', reason: 'It was incomplete or damaged and has been cleared.' }
    }
    return { status: 'discarded', reason: 'It could not be restored and has been cleared.' }
  }
}

/**
 * Writes the current game (or clears the slot when the game is over/reset).
 * Storage failures are reported, never thrown.
 */
export function saveGame(
  game: GameState,
  options: { storage?: StorageLike | null; now?: number } = {},
): SaveResult {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage
  const now = options.now ?? Date.now()
  if (!storage) return { ok: false, error: SAVE_UNAVAILABLE }

  if (game.phase === 'idle') {
    try {
      storage.removeItem(SAVED_GAME_KEY)
    } catch {
      return { ok: false, error: SAVE_FAILED }
    }
    return { ok: true, savedAt: now }
  }

  let payload: string
  try {
    payload = JSON.stringify({ version: SAVED_GAME_VERSION, savedAt: now, game })
  } catch {
    return { ok: false, error: SAVE_FAILED }
  }

  try {
    storage.setItem(SAVED_GAME_KEY, payload)
  } catch {
    return { ok: false, error: SAVE_FAILED }
  }
  return { ok: true, savedAt: now }
}

/** Deletes the saved game from this device. Never throws. */
export function clearSavedGame(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false
  try {
    storage.removeItem(SAVED_GAME_KEY)
    return true
  } catch {
    return false
  }
}
