/**
 * Pure game rules: round arithmetic, cutoff evaluation, tie detection,
 * continuation decisions and standings. No React and no time-based logic.
 */

import type {
  GameState,
  PlayerRecord,
  RoundEntries,
  RoundRecord,
  RoundScoreLine,
} from './types'

export interface ComputeRoundInput {
  participants: string[]
  players: Pick<PlayerRecord, 'id' | 'name' | 'cumulativeScore'>[]
  entries: RoundEntries
  winnerId: string
  /**
   * When supplied, previous totals come from this snapshot instead of the
   * players array (used by the preview screens). Defaults to player scores.
   */
  previousTotals?: Record<string, number>
}

export interface ComputeRoundOutput {
  lines: RoundScoreLine[]
  penalties: Record<string, number>
  totals: Record<string, number>
}

/**
 * Calculates penalties and projected totals for a round.
 *
 * The typed-in penalty is the round score. The winner always receives zero,
 * whatever is stored against them, and a player whose penalty has not been
 * entered yet contributes nothing to the preview.
 */
export function computeRoundScores(input: ComputeRoundInput): ComputeRoundOutput {
  const playerById = new Map(input.players.map((player) => [player.id, player]))
  const lines: RoundScoreLine[] = []
  const penalties: Record<string, number> = {}
  const totals: Record<string, number> = {}

  for (const playerId of input.participants) {
    const player = playerById.get(playerId)
    if (!player) continue
    const isWinner = playerId === input.winnerId
    const entered = input.entries[playerId]?.penalty ?? null
    const penalty = isWinner ? 0 : (entered ?? 0)
    const previousTotal = input.previousTotals?.[playerId] ?? player.cumulativeScore
    lines.push({
      playerId,
      name: player.name,
      penalty,
      previousTotal,
      newTotal: previousTotal + penalty,
      isWinner,
    })
    penalties[playerId] = penalty
    totals[playerId] = previousTotal + penalty
  }

  return { lines, penalties, totals }
}

/** True when the score reaches or passes the cutoff. */
export function hasReachedCutoff(score: number, cutoff: number): boolean {
  return score >= cutoff
}

export function activePlayers(players: PlayerRecord[]): PlayerRecord[] {
  return players.filter((player) => !player.eliminated)
}

export function eliminatedPlayers(players: PlayerRecord[]): PlayerRecord[] {
  return players.filter((player) => player.eliminated)
}

export interface TopScoreEvaluation {
  /** The highest cumulative score among eligible players. */
  topScore: number | null
  /** True when that top score meets or exceeds the cutoff. */
  crossedCutoff: boolean
  /** All eligible players sharing the top score (length > 1 means a tie). */
  leaders: string[]
}

/**
 * Finds the worst cumulative score among eligible players. Only the player(s)
 * at that score are considered for elimination, and only if the cutoff is met.
 */
export function evaluateTopScore(
  players: PlayerRecord[],
  cutoff: number,
): TopScoreEvaluation {
  const active = activePlayers(players)
  if (active.length === 0) return { topScore: null, crossedCutoff: false, leaders: [] }
  const topScore = Math.max(...active.map((player) => player.cumulativeScore))
  return {
    topScore,
    crossedCutoff: hasReachedCutoff(topScore, cutoff),
    leaders: active
      .filter((player) => player.cumulativeScore === topScore)
      .map((player) => player.id),
  }
}

/** Finds the player(s) with the highest penalty in a tie-break hand. */
export function worstTieBreakPenalties(
  playerIds: string[],
  penalties: Record<string, number>,
): { worstPenalty: number; worstIds: string[] } {
  const scored = playerIds
    .filter((id) => penalties[id] !== undefined)
    .map((id) => ({ id, penalty: penalties[id] }))
  if (scored.length === 0) return { worstPenalty: 0, worstIds: [] }
  const worstPenalty = Math.max(...scored.map((entry) => entry.penalty))
  return {
    worstPenalty,
    worstIds: scored.filter((entry) => entry.penalty === worstPenalty).map((entry) => entry.id),
  }
}

export interface ContinuationResult {
  activeIds: string[]
  /** Set when exactly one eligible player remains — the last one standing wins. */
  championId: string | null
  /** True when only two eligible players remain and house rules are not enabled. */
  needsDecision: boolean
}

/**
 * Decides what happens after an elimination. A game cannot run with fewer than
 * three players unless the table explicitly opts into two-player rounds.
 */
export function determineContinuation(
  players: PlayerRecord[],
  allowTwoPlayerRounds: boolean,
): ContinuationResult {
  const activeIds = activePlayers(players).map((player) => player.id)
  if (activeIds.length <= 1) {
    return { activeIds, championId: activeIds[0] ?? null, needsDecision: false }
  }
  return {
    activeIds,
    championId: null,
    needsDecision: activeIds.length === 2 && !allowTwoPlayerRounds,
  }
}

/** Unique lowest eligible score → champion; otherwise an unresolved tie. */
export function evaluateFinalLeaders(players: PlayerRecord[]): {
  championId: string | null
  namedPlayerIds: string[]
} {
  const active = activePlayers(players)
  if (active.length === 0) return { championId: null, namedPlayerIds: [] }
  const lowest = Math.min(...active.map((player) => player.cumulativeScore))
  const leaders = active.filter((player) => player.cumulativeScore === lowest)
  if (leaders.length === 1) return { championId: leaders[0].id, namedPlayerIds: [] }
  return { championId: null, namedPlayerIds: leaders.map((player) => player.id) }
}

export interface StandingRow {
  player: PlayerRecord
  rank: number
  /** True when this player shares their score with another player. */
  tiedOnScore: boolean
  /** Penalty per completed round (null when the player did not play that round). */
  history: { roundNumber: number; penalty: number | null; newTotal: number | null }[]
}

/**
 * Leaderboard ordering: eligible players first, ascending by cumulative score
 * (lowest is best), then eliminated players by elimination order (most recently
 * eliminated first). Ties share a rank.
 */
export function buildStandings(players: PlayerRecord[], rounds: RoundRecord[]): StandingRow[] {
  const active = activePlayers(players)
    .slice()
    .sort((a, b) => a.cumulativeScore - b.cumulativeScore || a.name.localeCompare(b.name))
  const eliminated = eliminatedPlayers(players)
    .slice()
    .sort(
      (a, b) =>
        (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0) ||
        a.cumulativeScore - b.cumulativeScore,
    )

  const scoreCounts = new Map<number, number>()
  for (const player of active) {
    scoreCounts.set(player.cumulativeScore, (scoreCounts.get(player.cumulativeScore) ?? 0) + 1)
  }

  const rankById = new Map<string, number>()
  let previousScore: number | null = null
  let previousRank = 0
  active.forEach((player, index) => {
    const rank = previousScore !== null && player.cumulativeScore === previousScore
      ? previousRank
      : index + 1
    rankById.set(player.id, rank)
    previousScore = player.cumulativeScore
    previousRank = rank
  })
  eliminated.forEach((player, index) => {
    rankById.set(player.id, active.length + index + 1)
  })

  const ordered = [...active, ...eliminated]
  return ordered.map((player) => ({
    player,
    rank: rankById.get(player.id) ?? 0,
    tiedOnScore:
      !player.eliminated && (scoreCounts.get(player.cumulativeScore) ?? 0) > 1,
    history: rounds.map((round) => {
      const line = round.lines.find((entry) => entry.playerId === player.id)
      return {
        roundNumber: round.roundNumber,
        penalty: line ? line.penalty : null,
        newTotal: line ? line.newTotal : null,
      }
    }),
  }))
}

/** A shallow summary used by the final screen. */
export interface FinalSummary {
  champion: PlayerRecord | null
  leaders: PlayerRecord[]
  unresolved: boolean
  completedRounds: number
  eliminationOrder: PlayerRecord[]
}

export function buildFinalSummary(state: GameState): FinalSummary {
  const champion =
    state.ending?.championId != null
      ? state.players.find((player) => player.id === state.ending?.championId) ?? null
      : null
  const namedIds = state.ending?.namedPlayerIds ?? []
  const leaders = state.players.filter((player) => namedIds.includes(player.id))
  const eliminationOrder = eliminatedPlayers(state.players)
    .slice()
    .sort((a, b) => (a.eliminationOrder ?? 0) - (b.eliminationOrder ?? 0))
  return {
    champion,
    leaders,
    unresolved: state.ending?.kind === 'unresolved',
    completedRounds: state.rounds.length,
    eliminationOrder,
  }
}

/** Projected totals for a not-yet-finalized round, used in review screens. */
export function projectedTotals(
  players: PlayerRecord[],
  participants: string[],
  penalties: Record<string, number>,
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const player of players) {
    map[player.id] =
      player.cumulativeScore + (participants.includes(player.id) ? penalties[player.id] ?? 0 : 0)
  }
  return map
}
