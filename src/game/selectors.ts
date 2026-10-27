import type { GameState, CurrentRound, RoundRecord } from './types'
import { computeRoundScores, projectedTotals, type ComputeRoundOutput } from './rules'

export type Screen =
  | 'home'
  | 'setup'
  | 'dashboard'
  | 'entry'
  | 'pending'
  | 'approved'
  | 'results'
  | 'tiebreak'
  | 'decision'
  | 'final'
  | 'leaderboard'

/**
 * A round in progress always owns the screen. Unresolved ties and controller
 * decisions block play until they are handled, so they also force their screen.
 */
export function resolveScreen(game: GameState, requested: Screen): Screen {
  if (!game.config || game.phase === 'idle') {
    return requested === 'setup' ? 'setup' : 'home'
  }
  if (game.phase === 'finished') return 'final'

  if (game.currentRound) {
    switch (game.currentRound.status) {
      case 'pending':
        return 'pending'
      case 'approved':
        return 'approved'
      default:
        return 'entry'
    }
  }

  if (game.decision) {
    return requested === 'leaderboard' ? 'leaderboard' : 'decision'
  }
  if (game.tieBreak) {
    return requested === 'leaderboard' ? 'leaderboard' : 'tiebreak'
  }

  if (requested === 'home' || requested === 'setup') return 'dashboard'
  if (requested === 'results' && game.rounds.length === 0) return 'dashboard'
  return requested
}

export function latestRound(game: GameState): RoundRecord | null {
  return game.rounds.length > 0 ? game.rounds[game.rounds.length - 1] : null
}

export function findRoundById(game: GameState, roundId: string | null): RoundRecord | null {
  if (!roundId) return null
  return game.rounds.find((round) => round.id === roundId) ?? null
}

export interface ScorePreview extends ComputeRoundOutput {
  projectedTotals: Record<string, number>
}

/** Calculates the preview shown in entry, review and approval screens. */
export function scorePreview(game: GameState, round: CurrentRound): ScorePreview {
  const lines = computeRoundScores({
    participants: round.participants,
    players: game.players,
    entries: round.entries,
    winnerId: round.winnerId ?? '',
  })
  return {
    ...lines,
    projectedTotals: projectedTotals(game.players, round.participants, lines.penalties),
  }
}

export function canBeginRound(game: GameState): { allowed: boolean; reason: string | null } {
  if (game.phase !== 'active') return { allowed: false, reason: 'No active game.' }
  if (game.currentRound) return { allowed: false, reason: 'A round is already open.' }
  if (game.tieBreak) return { allowed: false, reason: 'Resolve the tie-break first.' }
  if (game.decision) return { allowed: false, reason: 'Decide how to continue first.' }
  const active = game.players.filter((player) => !player.eliminated).length
  if (active < 2) return { allowed: false, reason: 'No players remain.' }
  if (active < 3 && !game.allowTwoPlayerRounds) {
    return { allowed: false, reason: 'Two players left — decide how to continue.' }
  }
  return { allowed: true, reason: null }
}

