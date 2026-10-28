/**
 * Compact projection of {@link GameState} for QR transfer.
 *
 * `JSON.stringify(game)` is far too fat for a QR code: every hand stores 15
 * named counters and every player id is repeated in entries, score lines and
 * eliminations. This module projects the game into short keys, positional
 * player references and sparse card counts, which typically shrinks a transfer
 * by 4–6× before compression.
 *
 * Two rules keep it safe:
 *  - Nothing derived by the engine is thrown away: penalties, cumulative totals,
 *    outcomes and confirmations are all carried explicitly, so an import can
 *    never silently recalculate a score.
 *  - Names of players and rounds *are* rebuilt from their owner records, because
 *    they are copies of those records rather than independent values.
 *
 * Unpacking returns a plain object in {@link GameState} shape. Callers must run
 * it through the persistence validator (`parseGameState`) before using it.
 */

import { CARD_KEYS, emptyRemainingCards, totalCards, type CardKey, type RemainingCards } from './cards'
import type {
  CurrentRound,
  DecisionState,
  EliminationRecord,
  EliminationVia,
  GameEnding,
  GameState,
  PlayerRecord,
  RoundOutcome,
  RoundRecord,
  RoundScoreLine,
  TieBreakHand,
  TieBreakRecord,
  TieBreakState,
} from './types'

export const PACKED_VERSION = 1

/** Thrown when a packed game does not have the expected shape. */
export class PackedGameError extends Error {}

const CARD_CODES: Record<CardKey, string> = {
  n0: '0',
  n1: '1',
  n2: '2',
  n3: '3',
  n4: '4',
  n5: '5',
  n6: '6',
  n7: '7',
  n8: '8',
  n9: '9',
  skip: 's',
  reverse: 'r',
  draw2: 'd',
  wild: 'w',
  wild4: 'W',
}

const CODE_CARDS = Object.entries(CARD_CODES).reduce<Record<string, CardKey>>(
  (acc, [card, code]) => {
    acc[code] = card as CardKey
    return acc
  },
  {},
)

const OUTCOME_CODES: Record<RoundOutcome, string> = {
  continue: 'c',
  'tie-break': 't',
  'insufficient-players': 'i',
  champion: 'w',
  'game-ended': 'e',
}
const CODE_OUTCOMES = Object.entries(OUTCOME_CODES).reduce<Record<string, RoundOutcome>>(
  (acc, [outcome, code]) => {
    acc[code] = outcome as RoundOutcome
    return acc
  },
  {},
)

const VIA_CODES: Record<EliminationVia, string> = {
  cutoff: 'c',
  'tie-break-replay': 'r',
  'tie-break-manual': 'm',
}
const CODE_VIAS = Object.entries(VIA_CODES).reduce<Record<string, EliminationVia>>(
  (acc, [via, code]) => {
    acc[code] = via as EliminationVia
    return acc
  },
  {},
)

const ENDING_CODES = {
  'last-standing': 'l',
  'controller-end': 'e',
  'manual-end': 'm',
  declared: 'd',
} as const
const CODE_ENDINGS = Object.entries(ENDING_CODES).reduce<Record<string, GameEnding['via']>>(
  (acc, [via, code]) => {
    acc[code] = via as GameEnding['via']
    return acc
  },
  {},
)

/* ------------------------------------------------------------------ helpers */

function fail(message: string): never {
  throw new PackedGameError(message)
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${field} is not an object`)
  return value as Record<string, unknown>
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`${field} is not a list`)
  return value
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} is not a number`)
  return value
}

function asIndex(value: unknown, field: string, max: number): number {
  const index = asNumber(value, field)
  if (!Number.isInteger(index) || index < 0 || index >= max) fail(`${field} is out of range`)
  return index
}

function asNullableIndex(value: unknown, field: string, max: number): number | null {
  return value === null || value === undefined ? null : asIndex(value, field, max)
}

function asText(value: unknown, field: string): string {
  if (typeof value !== 'string') fail(`${field} is not text`)
  return value
}

function asCode<T>(value: unknown, field: string, table: Record<string, T>): T {
  const code = asText(value, field)
  const mapped = table[code]
  if (mapped === undefined) fail(`${field} has an unknown value`)
  return mapped
}

/* --------------------------------------------------------------- primitives */

/** Sparse `card=count` list; empty hands become an empty string. */
export function packCounts(counts: RemainingCards): string {
  return CARD_KEYS.filter((key) => counts[key] > 0)
    .map((key) => `${CARD_CODES[key]}=${counts[key]}`)
    .join(',')
}

export function unpackCounts(value: unknown): RemainingCards {
  const counts = emptyRemainingCards()
  const text = asText(value, 'card counts')
  if (text.length === 0) return counts
  for (const pair of text.split(',')) {
    const [code, raw] = pair.split('=')
    const card = CODE_CARDS[code]
    if (!card) fail(`unknown card "${code}"`)
    const count = Number(raw)
    if (!Number.isInteger(count) || count < 0 || count > 99) fail('a card count is invalid')
    if (card in counts && counts[card] > 0) fail('a card is counted twice')
    counts[card] = count
  }
  return counts
}

/** `[name, score, eliminated, eliminatedAtRound, eliminationOrder]` */
type PackedPlayer = [string, number, 0 | 1, number | null, number | null]

function packPlayer(player: PlayerRecord): PackedPlayer {
  return [
    player.name,
    player.cumulativeScore,
    player.eliminated ? 1 : 0,
    player.eliminatedAtRound,
    player.eliminationOrder,
  ]
}

function unpackPlayer(value: unknown, index: number): PlayerRecord {
  const tuple = asArray(value, 'player')
  if (tuple.length !== 5) fail('a player record is incomplete')
  const eliminatedFlag = asNumber(tuple[2], 'player elimination')
  if (eliminatedFlag !== 0 && eliminatedFlag !== 1) fail('a player elimination flag is invalid')
  return {
    id: `p${index + 1}`,
    name: asText(tuple[0], 'player name'),
    cumulativeScore: asNumber(tuple[1], 'player score'),
    eliminated: eliminatedFlag === 1,
    eliminatedAtRound: tuple[3] === null ? null : asNumber(tuple[3], 'player elimination round'),
    eliminationOrder: tuple[4] === null ? null : asNumber(tuple[4], 'player elimination order'),
  }
}

/* --------------------------------------------------------------------- pack */

export interface PackedGame {
  v: number
  g: Record<string, unknown>
}

export function packGame(game: GameState): PackedGame {
  const indexOf = (playerId: string): number => {
    const index = game.players.findIndex((player) => player.id === playerId)
    if (index === -1) fail(`the game references an unknown player (${playerId})`)
    return index
  }

  const packLine = (line: RoundScoreLine) => ({
    p: indexOf(line.playerId),
    c: packCounts(line.counts),
    n: line.penalty,
    o: line.previousTotal,
    t: line.newTotal,
    w: line.isWinner ? 1 : 0,
  })

  const packElimination = (record: EliminationRecord) => [
    indexOf(record.playerId),
    record.cumulativeScore,
    record.order,
    record.roundNumber,
    VIA_CODES[record.via],
  ]

  const packTieBreak = (record: TieBreakRecord) => ({
    k: record.kind === 'replay' ? 'r' : 'm',
    p: record.playerIds.map(indexOf),
    w: record.winnerId === null ? null : indexOf(record.winnerId),
    h:
      record.hands === null
        ? null
        : record.playerIds.map((playerId) => {
            const hand = (record.hands as Record<string, TieBreakHand>)[playerId]
            if (!hand) fail('a tie-break hand is missing')
            return [packCounts(hand.counts), hand.penalty]
          }),
    e: record.eliminatedPlayerId === null ? null : indexOf(record.eliminatedPlayerId),
    x: record.note,
    t: record.at,
  })

  const packRound = (round: RoundRecord) => ({
    n: round.roundNumber,
    w: indexOf(round.winnerId),
    c: round.cutoff,
    f: round.finalizedAt,
    o: OUTCOME_CODES[round.outcome],
    l: round.lines.map(packLine),
    e: round.eliminations.map(packElimination),
    b: round.tieBreaks.map(packTieBreak),
    tb: round.tieBreakPlayerIds === null ? null : round.tieBreakPlayerIds.map(indexOf),
  })

  const packCurrentRound = (round: CurrentRound) => ({
    k: round.kind === 'round' ? 'r' : 't',
    n: round.roundNumber,
    p: round.participants.map(indexOf),
    e: round.participants.map((playerId) => {
      const entry = round.entries[playerId]
      if (!entry) fail('a hand entry is missing')
      return [packCounts(entry.counts), entry.confirmed ? 1 : 0]
    }),
    w: round.winnerId === null ? null : indexOf(round.winnerId),
    tb: round.tieBreakPlayerIds === null ? null : round.tieBreakPlayerIds.map(indexOf),
  })

  const packTieBreakState = (tie: TieBreakState) => ({
    p: tie.playerIds.map(indexOf),
    s: tie.score,
    r: tie.sourceRoundId,
    n: tie.sourceRoundNumber,
  })

  const packDecision = (decision: DecisionState) => ({
    a: decision.activePlayerIds.map(indexOf),
    n: decision.roundNumber,
  })

  const packEnding = (ending: GameEnding) => ({
    k: ending.kind === 'champion' ? 'c' : 'u',
    c: ending.championId === null ? null : indexOf(ending.championId),
    n: ending.namedPlayerIds.map(indexOf),
    v: ENDING_CODES[ending.via],
    r: ending.atRound,
    t: ending.at,
  })

  return {
    v: PACKED_VERSION,
    g: {
      p: game.phase === 'active' ? 'a' : 'f',
      n: game.config?.name ?? '',
      c: game.config?.cutoff ?? 0,
      s: game.config?.startedAt ?? 0,
      t: game.startedAt,
      a: game.allowTwoPlayerRounds ? 1 : 0,
      e: game.nextEliminationOrder,
      pl: game.players.map(packPlayer),
      r: game.rounds.map(packRound),
      cr: game.currentRound === null ? null : packCurrentRound(game.currentRound),
      tb: game.tieBreak === null ? null : packTieBreakState(game.tieBreak),
      d: game.decision === null ? null : packDecision(game.decision),
      en: game.ending === null ? null : packEnding(game.ending),
    },
  }
}

/* ------------------------------------------------------------------- unpack */

/**
 * Rebuilds a game-shaped object. The result is *not* trusted by itself: run it
 * through `parseGameState` to validate every score, count and reference.
 */
export function unpackGame(value: unknown): unknown {
  const packed = asRecord(value, 'transfer')
  const version = asNumber(packed.v, 'transfer version')
  if (version !== PACKED_VERSION) fail('the transfer uses an unsupported format')

  const g = asRecord(packed.g, 'game')
  const phaseCode = asCode(g.p, 'game phase', { a: 'active', f: 'finished' } as const)

  const playerTuples = asArray(g.pl, 'players')
  const players: PlayerRecord[] = playerTuples.map(unpackPlayer)
  const playerCount = players.length
  const nameOf = (index: number): string => {
    const player = players[index]
    if (!player) fail('a player reference is out of range')
    return player.name
  }
  const idOf = (index: number): string => `p${index + 1}`

  const unpackLine = (value: unknown): RoundScoreLine => {
    const line = asRecord(value, 'score line')
    const counts = unpackCounts(line.c)
    const playerIndex = asIndex(line.p, 'score line player', playerCount)
    const winnerFlag = asNumber(line.w, 'score line winner')
    if (winnerFlag !== 0 && winnerFlag !== 1) fail('a score line winner flag is invalid')
    return {
      playerId: idOf(playerIndex),
      name: nameOf(playerIndex),
      counts,
      totalCards: totalCards(counts),
      penalty: asNumber(line.n, 'score line penalty'),
      previousTotal: asNumber(line.o, 'score line previous total'),
      newTotal: asNumber(line.t, 'score line new total'),
      isWinner: winnerFlag === 1,
    }
  }

  const unpackElimination = (value: unknown): EliminationRecord => {
    const tuple = asArray(value, 'elimination')
    if (tuple.length !== 5) fail('an elimination record is incomplete')
    const playerIndex = asIndex(tuple[0], 'eliminated player', playerCount)
    return {
      playerId: idOf(playerIndex),
      playerName: nameOf(playerIndex),
      cumulativeScore: asNumber(tuple[1], 'elimination score'),
      order: asNumber(tuple[2], 'elimination order'),
      roundNumber: asNumber(tuple[3], 'elimination round'),
      via: asCode(tuple[4], 'elimination reason', CODE_VIAS),
    }
  }

  const unpackTieBreak = (value: unknown): TieBreakRecord => {
    const record = asRecord(value, 'tie-break')
    const playerIds = asArray(record.p, 'tie-break players').map((entry) =>
      idOf(asIndex(entry, 'tie-break player', playerCount)),
    )
    const winnerIndex = asNullableIndex(record.w, 'tie-break winner', playerCount)
    const eliminatedIndex = asNullableIndex(record.e, 'tie-break elimination', playerCount)
    let hands: Record<string, TieBreakHand> | null = null
    if (record.h !== null && record.h !== undefined) {
      const tuples = asArray(record.h, 'tie-break hands')
      if (tuples.length !== playerIds.length) fail('a tie-break hand list does not match its players')
      hands = {}
      tuples.forEach((entry, index) => {
        const tuple = asArray(entry, 'tie-break hand')
        if (tuple.length !== 2) fail('a tie-break hand is incomplete')
        const counts = unpackCounts(tuple[0])
        hands![playerIds[index]] = {
          counts,
          totalCards: totalCards(counts),
          penalty: asNumber(tuple[1], 'tie-break penalty'),
        }
      })
    }
    return {
      kind: asCode(record.k, 'tie-break kind', { r: 'replay', m: 'manual' } as const),
      playerIds,
      winnerId: winnerIndex === null ? null : idOf(winnerIndex),
      hands,
      eliminatedPlayerId: eliminatedIndex === null ? null : idOf(eliminatedIndex),
      note: record.x === null || record.x === undefined ? null : asText(record.x, 'tie-break note'),
      at: asNumber(record.t, 'tie-break time'),
    }
  }

  const rounds: RoundRecord[] = asArray(g.r, 'rounds').map((value) => {
    const round = asRecord(value, 'round')
    const roundNumber = asNumber(round.n, 'round number')
    const winnerIndex = asIndex(round.w, 'round winner', playerCount)
    return {
      id: `round-${roundNumber}`,
      kind: 'round',
      roundNumber,
      winnerId: idOf(winnerIndex),
      winnerName: nameOf(winnerIndex),
      lines: asArray(round.l, 'score lines').map(unpackLine),
      cutoff: asNumber(round.c, 'round cutoff'),
      finalizedAt: asNumber(round.f, 'round time'),
      eliminations: asArray(round.e, 'eliminations').map(unpackElimination),
      tieBreaks: asArray(round.b, 'tie-breaks').map(unpackTieBreak),
      outcome: asCode(round.o, 'round outcome', CODE_OUTCOMES),
      tieBreakPlayerIds:
        round.tb === null || round.tb === undefined
          ? null
          : asArray(round.tb, 'tie-break players').map((entry) =>
              idOf(asIndex(entry, 'tie-break player', playerCount)),
            ),
    }
  })

  let currentRound: CurrentRound | null = null
  if (g.cr !== null && g.cr !== undefined) {
    const round = asRecord(g.cr, 'open round')
    const participants = asArray(round.p, 'open round players').map((entry) =>
      idOf(asIndex(entry, 'open round player', playerCount)),
    )
    const entryTuples = asArray(round.e, 'open round hands')
    if (entryTuples.length !== participants.length) fail('an open round is missing hand entries')
    const entries: CurrentRound['entries'] = {}
    participants.forEach((playerId, index) => {
      const tuple = asArray(entryTuples[index], 'open round hand')
      if (tuple.length !== 2) fail('an open round hand is incomplete')
      const confirmed = asNumber(tuple[1], 'hand confirmation')
      if (confirmed !== 0 && confirmed !== 1) fail('a hand confirmation flag is invalid')
      entries[playerId] = { counts: unpackCounts(tuple[0]), confirmed: confirmed === 1 }
    })
    const winnerIndex = asNullableIndex(round.w, 'open round winner', playerCount)
    const roundNumber = asNumber(round.n, 'open round number')
    currentRound = {
      id: `round-${roundNumber}`,
      kind: asCode(round.k, 'open round kind', { r: 'round', t: 'tie-break' } as const),
      roundNumber,
      participants,
      entries,
      winnerId: winnerIndex === null ? null : idOf(winnerIndex),
      tieBreakPlayerIds:
        round.tb === null || round.tb === undefined
          ? null
          : asArray(round.tb, 'tie-break players').map((entry) =>
              idOf(asIndex(entry, 'tie-break player', playerCount)),
            ),
    }
  }

  let tieBreak: TieBreakState | null = null
  if (g.tb !== null && g.tb !== undefined) {
    const tie = asRecord(g.tb, 'tie-break state')
    tieBreak = {
      playerIds: asArray(tie.p, 'tied players').map((entry) =>
        idOf(asIndex(entry, 'tied player', playerCount)),
      ),
      score: asNumber(tie.s, 'tie score'),
      sourceRoundId: asText(tie.r, 'tie source round'),
      sourceRoundNumber: asNumber(tie.n, 'tie source round number'),
    }
  }

  let decision: DecisionState | null = null
  if (g.d !== null && g.d !== undefined) {
    const record = asRecord(g.d, 'decision')
    decision = {
      kind: 'insufficient-players',
      activePlayerIds: asArray(record.a, 'remaining players').map((entry) =>
        idOf(asIndex(entry, 'remaining player', playerCount)),
      ),
      roundNumber: asNumber(record.n, 'decision round'),
    }
  }

  let ending: GameEnding | null = null
  if (g.en !== null && g.en !== undefined) {
    const record = asRecord(g.en, 'ending')
    const championIndex = asNullableIndex(record.c, 'champion', playerCount)
    ending = {
      kind: asCode(record.k, 'ending kind', { c: 'champion', u: 'unresolved' } as const),
      championId: championIndex === null ? null : idOf(championIndex),
      namedPlayerIds: asArray(record.n, 'named players').map((entry) =>
        idOf(asIndex(entry, 'named player', playerCount)),
      ),
      via: asCode(record.v, 'ending reason', CODE_ENDINGS),
      atRound: asNumber(record.r, 'ending round'),
      at: asNumber(record.t, 'ending time'),
    }
  }

  const allowFlag = asNumber(g.a, 'two-player setting')
  if (allowFlag !== 0 && allowFlag !== 1) fail('the two-player setting is invalid')

  return {
    phase: phaseCode,
    config: {
      name: asText(g.n, 'game name'),
      cutoff: asNumber(g.c, 'cutoff'),
      startedAt: asNumber(g.s, 'start time'),
    },
    players,
    rounds,
    currentRound,
    tieBreak,
    decision,
    ending,
    allowTwoPlayerRounds: allowFlag === 1,
    nextEliminationOrder: asNumber(g.e, 'elimination counter'),
    startedAt: g.t === null || g.t === undefined ? null : asNumber(g.t, 'session start'),
    transfer: null,
  }
}
