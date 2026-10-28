/**
 * Pure game state machine. Every mutation is validated and no action can
 * silently change a score, invent a winner or confirm a round twice.
 *
 * Round flow: enter the card counts, review them, then confirm. Confirming is a
 * single atomic step — it validates the entry, applies the penalties, evaluates
 * the cutoff and records the round. There is no submission or approval stage.
 *
 * Elimination rule: after a confirmed round, the eligible player with the
 * highest cumulative score is knocked out — but only once that score reaches
 * the cutoff. If that top score is shared, no one is eliminated until the tie
 * is resolved (replay or explicit controller decision).
 */

import { CARD_KEYS, emptyRemainingCards, type CardKey, type HandEntries } from './cards'
import { MAX_CARD_COUNT, validateRoster, validateRoundEntry, validateCutoff } from './validation'
import {
  activePlayers,
  computeRoundScores,
  determineContinuation,
  evaluateFinalLeaders,
  evaluateTopScore,
  worstTieBreakPenalties,
} from './rules'
import type {
  CurrentRound,
  EliminationRecord,
  EliminationVia,
  GameEnding,
  GameState,
  PlayerRecord,
  RoundRecord,
  StartGamePayload,
  TieBreakRecord,
} from './types'

export type GameErrorCode =
  | 'INVALID_PHASE'
  | 'INVALID_SETUP'
  | 'ROUND_IN_PROGRESS'
  | 'NO_CURRENT_ROUND'
  | 'NO_TIE_BREAK'
  | 'NO_DECISION'
  | 'INVALID_TIE_BREAK_RESOLUTION'
  | 'INCOMPLETE_ROUND'
  | 'NOT_FINISHED'
  | 'INVALID_PLAYER'
  | 'INVALID_COUNT'
  | 'INVALID_TIE_BREAK_PHASE'
  | 'GAME_TRANSFERRED'
  | 'TRANSFER_ALREADY_DONE'
  | 'INVALID_TRANSFER'

export interface GameError {
  code: GameErrorCode
  message: string
}

export interface GameActionResult {
  state: GameState
  error: GameError | null
}

export type GameAction =
  | { type: 'START_GAME'; payload: StartGamePayload }
  | { type: 'BEGIN_ROUND'; at: number }
  | { type: 'START_TIE_BREAK_REPLAY' }
  | { type: 'SET_COUNT'; playerId: string; card: CardKey; value: number }
  | { type: 'INCREMENT_COUNT'; playerId: string; card: CardKey; delta: number }
  | { type: 'CONFIRM_HAND'; playerId: string; confirmed: boolean }
  | { type: 'SET_WINNER'; playerId: string }
  | { type: 'CONFIRM_ROUND'; at: number }
  | { type: 'DISCARD_ROUND' }
  | { type: 'RESOLVE_TIE_BREAK_MANUAL'; playerId: string; at: number; note?: string | null }
  | { type: 'CONTINUE_WITH_TWO_PLAYERS' }
  | { type: 'END_GAME'; at: number; via?: 'controller-end' | 'manual-end' }
  | { type: 'DECLARE_CHAMPION'; playerId: string; at: number }
  | { type: 'BEGIN_TRANSFER'; id: string; at: number }
  | { type: 'CANCEL_TRANSFER' }
  | { type: 'MARK_TRANSFERRED'; at: number }
  | { type: 'IMPORT_GAME'; game: GameState; at: number }
  | { type: 'RESET_GAME' }

export function createInitialGameState(): GameState {
  return {
    phase: 'idle',
    config: null,
    players: [],
    rounds: [],
    currentRound: null,
    tieBreak: null,
    decision: null,
    ending: null,
    allowTwoPlayerRounds: false,
    nextEliminationOrder: 1,
    startedAt: null,
    transfer: null,
  }
}

const fail = (state: GameState, code: GameErrorCode, message: string): GameActionResult => ({
  state,
  error: { code, message },
})

const ok = (state: GameState): GameActionResult => ({ state, error: null })

function emptyEntries(participants: string[]): HandEntries {
  return participants.reduce<HandEntries>((acc, id) => {
    acc[id] = { counts: emptyRemainingCards(), confirmed: false }
    return acc
  }, {})
}

function makeEnding(
  kind: 'champion' | 'unresolved',
  championId: string | null,
  namedPlayerIds: string[],
  via: GameEnding['via'],
  atRound: number,
  at: number,
): GameEnding {
  return { kind, championId, namedPlayerIds, via, atRound, at }
}

function applyElimination(
  state: GameState,
  playerId: string,
  roundNumber: number,
  via: EliminationVia,
): { state: GameState; record: EliminationRecord } | null {
  const player = state.players.find((entry) => entry.id === playerId)
  if (!player || player.eliminated) return null
  const order = state.nextEliminationOrder
  const record: EliminationRecord = {
    playerId: player.id,
    playerName: player.name,
    cumulativeScore: player.cumulativeScore,
    order,
    roundNumber,
    via,
  }
  return {
    state: {
      ...state,
      nextEliminationOrder: order + 1,
      players: state.players.map((entry) =>
        entry.id === playerId
          ? {
              ...entry,
              eliminated: true,
              eliminatedAtRound: roundNumber,
              eliminationOrder: order,
            }
          : entry,
      ),
    },
    record,
  }
}

function updateRound(
  state: GameState,
  roundId: string,
  update: (round: RoundRecord) => RoundRecord,
): RoundRecord[] {
  return state.rounds.map((round) => (round.id === roundId ? update(round) : round))
}

/** Resolves what happens after someone was eliminated (or a tie was resolved). */
function settleAfterElimination(
  state: GameState,
  roundId: string,
  roundNumber: number,
  at: number,
  extra: { elimination?: EliminationRecord; tieBreak?: TieBreakRecord },
): GameState {
  const sourceIndex = state.rounds.findIndex((round) => round.id === roundId)
  if (sourceIndex === -1) return state
  const continuation = determineContinuation(state.players, state.allowTwoPlayerRounds)
  let outcome: RoundRecord['outcome'] = 'continue'
  let ending: GameEnding | null = null
  let decision: GameState['decision'] = null
  let phase: GameState['phase'] = 'active'

  if (continuation.championId) {
    outcome = 'champion'
    phase = 'finished'
    ending = makeEnding('champion', continuation.championId, [], 'last-standing', roundNumber, at)
  } else if (continuation.needsDecision) {
    outcome = 'insufficient-players'
    decision = {
      kind: 'insufficient-players',
      activePlayerIds: continuation.activeIds,
      roundNumber,
    }
  }

  const rounds = state.rounds.map((round, index) => {
    if (index !== sourceIndex) return round
    return {
      ...round,
      eliminations: extra.elimination
        ? [...round.eliminations, extra.elimination]
        : round.eliminations,
      tieBreaks: extra.tieBreak ? [...round.tieBreaks, extra.tieBreak] : round.tieBreaks,
      outcome,
      tieBreakPlayerIds: null,
    }
  })

  return {
    ...state,
    phase,
    rounds,
    tieBreak: null,
    decision,
    ending,
    currentRound: null,
  }
}

/** Actions that may still run on a game locked by a completed handover. */
const ALLOWED_WHEN_TRANSFERRED: ReadonlySet<GameAction['type']> = new Set([
  'RESET_GAME',
  'IMPORT_GAME',
  'MARK_TRANSFERRED',
])

export function gameReducer(state: GameState, action: GameAction): GameActionResult {
  // A handed-over game is a frozen copy: no scoring, no rounds, no ending.
  if (state.transfer?.lockedAt && !ALLOWED_WHEN_TRANSFERRED.has(action.type)) {
    return fail(
      state,
      'GAME_TRANSFERRED',
      'This game was transferred to another phone, so it is read-only here.',
    )
  }

  switch (action.type) {
    case 'BEGIN_TRANSFER': {
      if (!state.config || state.phase === 'idle') {
        return fail(state, 'INVALID_PHASE', 'Start a game before transferring it.')
      }
      if (state.transfer?.lockedAt) {
        return fail(
          state,
          'TRANSFER_ALREADY_DONE',
          'This game was already transferred and is read-only here.',
        )
      }
      if (state.transfer) return ok(state)
      const id = action.id.trim()
      if (!/^[\w-]{4,64}$/.test(id)) {
        return fail(state, 'INVALID_TRANSFER', 'The transfer could not be prepared.')
      }
      return ok({ ...state, transfer: { id, lockedAt: null } })
    }

    case 'CANCEL_TRANSFER': {
      if (!state.transfer) return ok(state)
      if (state.transfer.lockedAt) {
        return fail(
          state,
          'TRANSFER_ALREADY_DONE',
          'This game was already transferred and cannot be unlocked.',
        )
      }
      return ok({ ...state, transfer: null })
    }

    case 'MARK_TRANSFERRED': {
      if (!state.transfer) {
        return fail(state, 'INVALID_TRANSFER', 'Start a transfer before confirming a handover.')
      }
      if (state.transfer.lockedAt) {
        return fail(state, 'TRANSFER_ALREADY_DONE', 'This game is already marked as transferred.')
      }
      return ok({ ...state, transfer: { ...state.transfer, lockedAt: action.at } })
    }

    case 'IMPORT_GAME': {
      const incoming = action.game
      if (!incoming.config || incoming.phase === 'idle') {
        return fail(state, 'INVALID_TRANSFER', 'That transfer does not contain a game.')
      }
      if (incoming.players.length < 3 || incoming.players.length > 7) {
        return fail(state, 'INVALID_TRANSFER', 'A transferred game needs 3–7 players.')
      }
      // The receiver takes over: it owns the game from now on, with no lock.
      return ok({ ...incoming, transfer: null })
    }

    case 'START_GAME': {
      if (state.phase !== 'idle') {
        return fail(state, 'INVALID_PHASE', 'A game is already in progress. Reset it before starting a new one.')
      }
      const { payload } = action
      const names = payload.players.map((player) => player.name)
      const roster = validateRoster(names)
      if (!roster.ok) {
        const message =
          roster.errors.general[0] ??
          Object.values(roster.errors.byIndex)[0] ??
          'Fix the player list before starting.'
        return fail(state, 'INVALID_SETUP', message)
      }
      const cutoff = validateCutoff(payload.cutoff)
      if (!cutoff.ok || cutoff.value === null) {
        return fail(state, 'INVALID_SETUP', cutoff.error ?? 'Enter a valid score cutoff.')
      }
      const ids = payload.players.map((player) => player.id)
      if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) {
        return fail(state, 'INVALID_SETUP', 'Player identifiers must be unique.')
      }

      const players: PlayerRecord[] = payload.players.map((player) => ({
        id: player.id,
        name: player.name.trim(),
        cumulativeScore: 0,
        eliminated: false,
        eliminatedAtRound: null,
        eliminationOrder: null,
      }))

      return ok({
        ...createInitialGameState(),
        phase: 'active',
        config: {
          name: payload.name.trim(),
          cutoff: cutoff.value,
          startedAt: payload.at,
        },
        players,
        startedAt: payload.at,
      })
    }

    case 'BEGIN_ROUND': {
      if (!state.config || state.phase !== 'active') {
        return fail(state, 'INVALID_PHASE', 'Start a game before beginning a round.')
      }
      if (state.currentRound) {
        return fail(state, 'ROUND_IN_PROGRESS', 'Finish or discard the current round first.')
      }
      if (state.tieBreak) {
        return fail(state, 'INVALID_TIE_BREAK_PHASE', 'Resolve the tie-break before starting another round.')
      }
      if (state.decision) {
        return fail(state, 'INVALID_PHASE', 'Decide how to continue before starting another round.')
      }
      const active = activePlayers(state.players)
      if (active.length < 2 || (active.length < 3 && !state.allowTwoPlayerRounds)) {
        return fail(
          state,
          'INVALID_PHASE',
          'Too few eligible players remain to play another round.',
        )
      }
      const roundNumber = state.rounds.length + 1
      const participants = active.map((player) => player.id)
      const currentRound: CurrentRound = {
        id: `round-${roundNumber}`,
        kind: 'round',
        roundNumber,
        participants,
        entries: emptyEntries(participants),
        winnerId: null,
        tieBreakPlayerIds: null,
      }
      return ok({ ...state, currentRound })
    }

    case 'START_TIE_BREAK_REPLAY': {
      if (!state.config || state.phase !== 'active') {
        return fail(state, 'INVALID_PHASE', 'No active game.')
      }
      if (!state.tieBreak) {
        return fail(state, 'NO_TIE_BREAK', 'There is no tie to replay.')
      }
      if (state.currentRound) {
        return fail(state, 'ROUND_IN_PROGRESS', 'Finish the current entry first.')
      }
      const participants = state.tieBreak.playerIds
      const sourceRound = state.rounds.find((entry) => entry.id === state.tieBreak?.sourceRoundId)
      const currentRound: CurrentRound = {
        id: `tiebreak-${state.tieBreak.sourceRoundNumber}-${(sourceRound?.tieBreaks.length ?? 0) + 1}`,
        kind: 'tie-break',
        roundNumber: state.tieBreak.sourceRoundNumber,
        participants,
        entries: emptyEntries(participants),
        winnerId: null,
        tieBreakPlayerIds: [...participants],
      }
      return ok({ ...state, currentRound })
    }

    case 'SET_COUNT': {
      const round = state.currentRound
      if (!round) return fail(state, 'NO_CURRENT_ROUND', 'There is no round being recorded.')
      if (!round.participants.includes(action.playerId)) {
        return fail(state, 'INVALID_PLAYER', 'That player is not part of this round.')
      }
      if (!CARD_KEYS.includes(action.card)) {
        return fail(state, 'INVALID_COUNT', 'Unknown card type.')
      }
      if (
        !Number.isInteger(action.value) ||
        action.value < 0 ||
        action.value > MAX_CARD_COUNT
      ) {
        return fail(
          state,
          'INVALID_COUNT',
          `Card counts must be whole numbers from 0 to ${MAX_CARD_COUNT}.`,
        )
      }
      const entry = round.entries[action.playerId]
      if (!entry) return fail(state, 'INVALID_PLAYER', 'Missing entry for that player.')
      return ok({
        ...state,
        currentRound: {
          ...round,
          entries: {
            ...round.entries,
            [action.playerId]: {
              ...entry,
              counts: { ...entry.counts, [action.card]: action.value },
            },
          },
        },
      })
    }

    case 'INCREMENT_COUNT': {
      const round = state.currentRound
      if (!round) return fail(state, 'NO_CURRENT_ROUND', 'There is no round being recorded.')
      const entry = round.entries[action.playerId]
      if (!entry) return fail(state, 'INVALID_PLAYER', 'That player is not part of this round.')
      const next = (entry.counts[action.card] ?? 0) + action.delta
      if (!Number.isInteger(next) || next < 0 || next > MAX_CARD_COUNT) {
        return fail(state, 'INVALID_COUNT', 'Card counts must stay between 0 and 99.')
      }
      return ok({
        ...state,
        currentRound: {
          ...round,
          entries: {
            ...round.entries,
            [action.playerId]: {
              ...entry,
              counts: { ...entry.counts, [action.card]: next },
            },
          },
        },
      })
    }

    case 'CONFIRM_HAND': {
      const round = state.currentRound
      if (!round) return fail(state, 'NO_CURRENT_ROUND', 'There is no round being recorded.')
      const entry = round.entries[action.playerId]
      if (!entry) return fail(state, 'INVALID_PLAYER', 'That player is not part of this round.')
      return ok({
        ...state,
        currentRound: {
          ...round,
          entries: {
            ...round.entries,
            [action.playerId]: { ...entry, confirmed: action.confirmed },
          },
        },
      })
    }

    case 'SET_WINNER': {
      const round = state.currentRound
      if (!round) return fail(state, 'NO_CURRENT_ROUND', 'There is no round being recorded.')
      if (!round.participants.includes(action.playerId)) {
        return fail(state, 'INVALID_PLAYER', 'Choose the winner from this round’s players.')
      }
      return ok({
        ...state,
        currentRound: { ...round, winnerId: action.playerId },
      })
    }

    case 'CONFIRM_ROUND': {
      const round = state.currentRound
      if (!round) return fail(state, 'NO_CURRENT_ROUND', 'There is no round to confirm.')
      if (!state.config) return fail(state, 'INVALID_PHASE', 'No active game.')

      // Confirming is the only way a round can be recorded, so it validates the
      // full entry itself: complete hands, exactly one winner, valid counts.
      const validation = validateRoundEntry({
        participants: round.participants.map((id) => ({
          id,
          name: state.players.find((player) => player.id === id)?.name ?? 'Player',
        })),
        entries: round.entries,
        winnerId: round.winnerId,
      })
      if (!validation.ok) {
        return fail(state, 'INCOMPLETE_ROUND', validation.errors[0])
      }

      if (round.kind === 'tie-break') {
        return confirmTieBreakRound(state, round, action.at)
      }

      const { lines, penalties } = computeRoundScores({
        participants: round.participants,
        players: state.players,
        entries: round.entries,
        winnerId: round.winnerId ?? '',
      })
      const updatedPlayers = state.players.map((player) => {
        if (!round.participants.includes(player.id)) return player
        const penalty = penalties[player.id] ?? 0
        return { ...player, cumulativeScore: player.cumulativeScore + penalty }
      })

      let nextState: GameState = { ...state, players: updatedPlayers }
      let eliminations: EliminationRecord[] = []
      let tieBreakIds: string[] | null = null
      let tieBreakScore: number | null = null
      let outcome: RoundRecord['outcome'] = 'continue'

      const top = evaluateTopScore(updatedPlayers, state.config.cutoff)
      if (top.crossedCutoff && top.topScore !== null) {
        if (top.leaders.length > 1) {
          tieBreakIds = top.leaders
          tieBreakScore = top.topScore
          outcome = 'tie-break'
        } else {
          const result = applyElimination(
            nextState,
            top.leaders[0],
            round.roundNumber,
            'cutoff',
          )
          if (result) {
            nextState = result.state
            eliminations = [result.record]
          }
        }
      }

      const winner = updatedPlayers.find((player) => player.id === round.winnerId)
      const recordId = `round-${round.roundNumber}`
      let ending: GameEnding | null = null
      let decision: GameState['decision'] = null

      if (!tieBreakIds) {
        const continuation = determineContinuation(
          nextState.players,
          nextState.allowTwoPlayerRounds,
        )
        if (continuation.championId) {
          outcome = 'champion'
          ending = makeEnding(
            'champion',
            continuation.championId,
            [],
            'last-standing',
            round.roundNumber,
            action.at,
          )
        } else if (continuation.needsDecision) {
          outcome = 'insufficient-players'
          decision = {
            kind: 'insufficient-players',
            activePlayerIds: continuation.activeIds,
            roundNumber: round.roundNumber,
          }
        }
      }

      const record: RoundRecord = {
        id: recordId,
        kind: 'round',
        roundNumber: round.roundNumber,
        winnerId: round.winnerId ?? '',
        winnerName: winner?.name ?? 'Unknown',
        lines,
        cutoff: state.config.cutoff,
        finalizedAt: action.at,
        eliminations,
        tieBreaks: [],
        outcome,
        tieBreakPlayerIds: tieBreakIds,
      }

      const tieBreak = tieBreakIds
        ? {
            playerIds: tieBreakIds,
            score: tieBreakScore ?? 0,
            sourceRoundId: recordId,
            sourceRoundNumber: round.roundNumber,
          }
        : null

      return ok({
        ...nextState,
        phase: ending ? 'finished' : 'active',
        rounds: [...state.rounds, record],
        currentRound: null,
        tieBreak,
        decision,
        ending,
      })
    }

    case 'DISCARD_ROUND': {
      if (!state.currentRound) {
        return fail(state, 'NO_CURRENT_ROUND', 'There is no round to discard.')
      }
      return ok({ ...state, currentRound: null })
    }

    case 'RESOLVE_TIE_BREAK_MANUAL': {
      if (!state.tieBreak) return fail(state, 'NO_TIE_BREAK', 'There is no tie to resolve.')
      if (state.currentRound) {
        return fail(state, 'ROUND_IN_PROGRESS', 'Finish or discard the tie-break entry first.')
      }
      if (!state.tieBreak.playerIds.includes(action.playerId)) {
        return fail(
          state,
          'INVALID_TIE_BREAK_RESOLUTION',
          'Only one of the tied players can be selected.',
        )
      }
      const player = state.players.find((entry) => entry.id === action.playerId)
      if (!player) return fail(state, 'INVALID_PLAYER', 'That player no longer exists.')

      const result = applyElimination(state, action.playerId, state.tieBreak.sourceRoundNumber, 'tie-break-manual')
      if (!result) return fail(state, 'INVALID_PLAYER', 'That player is already eliminated.')

      const tieRecord: TieBreakRecord = {
        kind: 'manual',
        playerIds: [...state.tieBreak.playerIds],
        winnerId: null,
        hands: null,
        eliminatedPlayerId: action.playerId,
        note: action.note?.trim() ? action.note.trim().slice(0, 200) : null,
        at: action.at,
      }

      const nextState = settleAfterElimination(result.state, state.tieBreak.sourceRoundId, state.tieBreak.sourceRoundNumber, action.at, {
        elimination: result.record,
        tieBreak: tieRecord,
      })
      return ok(nextState)
    }

    case 'CONTINUE_WITH_TWO_PLAYERS': {
      if (!state.decision) {
        return fail(state, 'NO_DECISION', 'There is no pending controller decision.')
      }
      if (state.decision.activePlayerIds.length !== 2) {
        return fail(state, 'INVALID_PHASE', 'Two-player rounds only apply when exactly two players remain.')
      }
      return ok({ ...state, allowTwoPlayerRounds: true, decision: null })
    }

    case 'END_GAME': {
      if (state.phase !== 'active' || !state.config) {
        return fail(state, 'INVALID_PHASE', 'There is no active game to end.')
      }
      const leaders = evaluateFinalLeaders(state.players)
      const roundNumber = state.currentRound?.roundNumber ?? state.rounds.length
      const ending = makeEnding(
        leaders.championId ? 'champion' : 'unresolved',
        leaders.championId,
        leaders.namedPlayerIds,
        action.via ?? 'manual-end',
        roundNumber,
        action.at,
      )
      return ok({
        ...state,
        phase: 'finished',
        currentRound: null,
        tieBreak: null,
        decision: null,
        ending,
      })
    }

    case 'DECLARE_CHAMPION': {
      if (state.phase !== 'finished' || !state.ending) {
        return fail(state, 'NOT_FINISHED', 'The game is still in progress.')
      }
      if (state.ending.kind !== 'unresolved') {
        return fail(state, 'INVALID_PHASE', 'The game already has a champion.')
      }
      if (!state.ending.namedPlayerIds.includes(action.playerId)) {
        return fail(
          state,
          'INVALID_PLAYER',
          'Choose the champion from the tied leaders.',
        )
      }
      return ok({
        ...state,
        ending: {
          ...state.ending,
          kind: 'champion',
          championId: action.playerId,
          via: 'declared',
        },
      })
    }

    case 'RESET_GAME':
      return ok(createInitialGameState())

    default:
      return fail(state, 'INVALID_PHASE', 'Unknown action.')
  }
}

function confirmTieBreakRound(
  state: GameState,
  round: CurrentRound,
  at: number,
): GameActionResult {
  if (!state.tieBreak) return fail(state, 'NO_TIE_BREAK', 'There is no tie to resolve.')
  const sourceRound = state.rounds.find((entry) => entry.id === state.tieBreak?.sourceRoundId)
  if (!sourceRound) return fail(state, 'NO_TIE_BREAK', 'The tied round could not be found.')

  const { lines, penalties } = computeRoundScores({
    participants: round.participants,
    players: state.players,
    entries: round.entries,
    winnerId: round.winnerId ?? '',
  })
  const hands = lines.reduce<NonNullable<TieBreakRecord['hands']>>((acc, line) => {
    acc[line.playerId] = {
      counts: line.counts,
      totalCards: line.totalCards,
      penalty: line.penalty,
    }
    return acc
  }, {})

  const worst = worstTieBreakPenalties(round.participants, penalties)
  if (worst.worstIds.length !== 1) {
    // The replay also ended level: keep the tie open with the narrowed group.
    const record: TieBreakRecord = {
      kind: 'replay',
      playerIds: [...round.participants],
      winnerId: round.winnerId,
      hands,
      eliminatedPlayerId: null,
      note: 'Replay ended level — the tie is still unresolved.',
      at,
    }
    return ok({
      ...state,
      players: state.players,
      rounds: updateRound(state, sourceRound.id, (entry) => ({
        ...entry,
        tieBreaks: [...entry.tieBreaks, record],
        outcome: 'tie-break',
      })),
      currentRound: null,
      tieBreak: { ...state.tieBreak, playerIds: worst.worstIds },
    })
  }

  const eliminatedId = worst.worstIds[0]
  const result = applyElimination(state, eliminatedId, state.tieBreak.sourceRoundNumber, 'tie-break-replay')
  if (!result) return fail(state, 'INVALID_PLAYER', 'That player is no longer eligible.')

  const record: TieBreakRecord = {
    kind: 'replay',
    playerIds: [...round.participants],
    winnerId: round.winnerId,
    hands,
    eliminatedPlayerId: eliminatedId,
    note: null,
    at,
  }

  return ok(
    settleAfterElimination(
      result.state,
      sourceRound.id,
      state.tieBreak.sourceRoundNumber,
      at,
      { elimination: result.record, tieBreak: record },
    ),
  )
}

export type GameStore = {
  game: GameState
  error: (GameError & { id: number }) | null
}

let errorSequence = 0

export function gameStoreReducer(store: GameStore, action: GameAction | { type: 'DISMISS_ERROR' }): GameStore {
  if (action.type === 'DISMISS_ERROR') {
    return { ...store, error: null }
  }
  const result = gameReducer(store.game, action)
  return {
    game: result.state,
    error: result.error ? { ...result.error, id: ++errorSequence } : null,
  }
}
