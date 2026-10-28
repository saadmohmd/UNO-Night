export interface GameConfig {
  name: string
  cutoff: number
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

/**
 * One player's entry in the round being recorded. The operator types the total
 * penalty directly, so nothing here depends on individual cards.
 *
 * `null` means "not entered yet" and is what blocks round confirmation. The
 * winner's entry is ignored by the rules and always scores zero.
 */
export interface RoundEntry {
  penalty: number | null
}

export type RoundEntries = Record<string, RoundEntry>

/**
 * The round currently being recorded. It exists only while penalties are being
 * entered; confirming it applies the scores and clears this object.
 */
export interface CurrentRound {
  id: string
  kind: RoundKind
  /** For tie-break rounds this stays equal to the source round number. */
  roundNumber: number
  participants: string[]
  entries: RoundEntries
  winnerId: string | null
  /** The tied group this round is resolving, when kind === 'tie-break'. */
  tieBreakPlayerIds: string[] | null
}

/** One player's score line for a finalized round. */
export interface RoundScoreLine {
  playerId: string
  name: string
  /** Points added to the cumulative total (always 0 for the round winner). */
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

/**
 * Handover bookkeeping for a QR transfer started on this device.
 *
 * The id is generated when the table starts a transfer and travels inside the
 * QR code, which lets the receiving phone show a short code derived from it.
 * `lockedAt` is only set when a human confirms that handover, and from then on
 * the game is read-only here.
 */
export interface GameTransfer {
  id: string
  lockedAt: number | null
}

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
  /** Set while this game is being (or has been) handed over to another device. */
  transfer: GameTransfer | null
}

export interface PlayerSeed {
  id: string
  name: string
}

export interface StartGamePayload {
  players: PlayerSeed[]
  name: string
  cutoff: number
  at: number
}
