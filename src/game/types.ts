import type { HandEntries, RemainingCards } from './cards'

export type ApprovalMode = 'manual' | 'automatic'

export interface GameConfig {
  name: string
  cutoff: number
  approvalMode: ApprovalMode
  startedAt: number
}

export interface PlayerRecord {
  id: string
  name: string
  cumulativeScore: number
  eliminated: boolean
  eliminatedAtRound: number | null
  eliminationOrder: number | null
}

export type RoundKind = 'round' | 'tie-break'
export type RoundStatus = 'draft' | 'pending' | 'rejected' | 'approved'

export interface RoundRejection {
  reason: string | null
  at: number
}

/** The round currently being entered / reviewed / approved. */
export interface CurrentRound {
  id: string
  kind: RoundKind
  /** For tie-break rounds this stays equal to the source round number. */
  roundNumber: number
  participants: string[]
  entries: HandEntries
  winnerId: string | null
  status: RoundStatus
  mode: ApprovalMode
  submittedAt: number | null
  approvedAt: number | null
  autoApproved: boolean
  rejection: RoundRejection | null
  /** The tied group this round is resolving, when kind === 'tie-break'. */
  tieBreakPlayerIds: string[] | null
}

/** One player's score line for a finalized round. */
export interface RoundScoreLine {
  playerId: string
  name: string
  counts: RemainingCards
  totalCards: number
  penalty: number
  previousTotal: number
  newTotal: number
  isWinner: boolean
}

export type EliminationVia = 'cutoff' | 'tie-break-replay' | 'tie-break-manual'

export interface EliminationRecord {
  playerId: string
  playerName: string
  cumulativeScore: number
  order: number
  roundNumber: number
  via: EliminationVia
}

export interface TieBreakHand {
  counts: RemainingCards
  totalCards: number
  penalty: number
}

export interface TieBreakRecord {
  kind: 'replay' | 'manual'
  playerIds: string[]
  /** First-out winner of a replay tie-break round (informational). */
  winnerId: string | null
  hands: Record<string, TieBreakHand> | null
  /** Null when a replay itself ended level and the tie remains unresolved. */
  eliminatedPlayerId: string | null
  note: string | null
  at: number
}

export type RoundOutcome =
  | 'continue'
  | 'tie-break'
  | 'insufficient-players'
  | 'champion'
  | 'game-ended'

export interface RoundRecord {
  id: string
  kind: 'round'
  roundNumber: number
  winnerId: string
  winnerName: string
  lines: RoundScoreLine[]
  cutoff: number
  mode: ApprovalMode
  autoApproved: boolean
  submittedAt: number | null
  approvedAt: number | null
  finalizedAt: number
  eliminations: EliminationRecord[]
  tieBreaks: TieBreakRecord[]
  outcome: RoundOutcome
  tieBreakPlayerIds: string[] | null
}

export interface TieBreakState {
  playerIds: string[]
  score: number
  sourceRoundId: string
  sourceRoundNumber: number
}

export interface DecisionState {
  kind: 'insufficient-players'
  activePlayerIds: string[]
  roundNumber: number
}

export type EndingVia = 'last-standing' | 'controller-end' | 'manual-end' | 'declared'

export interface GameEnding {
  kind: 'champion' | 'unresolved'
  championId: string | null
  /** The tied leaders when kind === 'unresolved'. */
  namedPlayerIds: string[]
  via: EndingVia
  atRound: number
  at: number
}

export type GamePhase = 'idle' | 'active' | 'finished'

export interface GameState {
  phase: GamePhase
  config: GameConfig | null
  players: PlayerRecord[]
  rounds: RoundRecord[]
  currentRound: CurrentRound | null
  tieBreak: TieBreakState | null
  decision: DecisionState | null
  ending: GameEnding | null
  allowTwoPlayerRounds: boolean
  nextEliminationOrder: number
  startedAt: number | null
}

export interface PlayerSeed {
  id: string
  name: string
}

export interface StartGamePayload {
  players: PlayerSeed[]
  name: string
  cutoff: number
  approvalMode: ApprovalMode
  at: number
}
