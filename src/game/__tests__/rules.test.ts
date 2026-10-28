import { describe, expect, it } from 'vitest'
import {
  buildStandings,
  computeRoundScores,
  determineContinuation,
  evaluateFinalLeaders,
  evaluateTopScore,
  hasReachedCutoff,
  worstTieBreakPenalties,
} from '../rules'
import type { PlayerRecord, RoundEntries, RoundRecord } from '../types'

/** Builds the typed-in entries: `{ p2: 40 }` → a 40-point penalty for p2. */
function entriesFor(participants: string[], penalties: Record<string, number>): RoundEntries {
  return participants.reduce<RoundEntries>((acc, id) => {
    acc[id] = { penalty: penalties[id] ?? 0 }
    return acc
  }, {})
}

function player(id: string, name: string, score = 0, extra: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    id,
    name,
    cumulativeScore: score,
    eliminated: false,
    eliminatedAtRound: null,
    eliminationOrder: null,
    ...extra,
  }
}

function roundRecord(partial: Partial<RoundRecord> & { roundNumber: number }): RoundRecord {
  return {
    id: `round-${partial.roundNumber}`,
    kind: 'round',
    winnerId: 'a',
    winnerName: 'Ana',
    lines: [],
    cutoff: 200,
    finalizedAt: 2,
    eliminations: [],
    tieBreaks: [],
    outcome: 'continue',
    tieBreakPlayerIds: null,
    ...partial,
  }
}

describe('computeRoundScores', () => {
  const participants = ['a', 'b', 'c']
  const players = [
    player('a', 'Ana', 10),
    player('b', 'Ben', 20),
    player('c', 'Cara', 30),
  ]

  it('uses the entered penalties and adds them to cumulative totals', () => {
    const result = computeRoundScores({
      participants,
      players,
      entries: entriesFor(participants, { a: 0, b: 64, c: 60 }),
      winnerId: 'a',
    })
    expect(result.penalties).toEqual({ a: 0, b: 64, c: 60 })
    expect(result.totals).toEqual({ a: 10, b: 84, c: 90 })
    expect(result.lines.map((line) => line.previousTotal)).toEqual([10, 20, 30])
    expect(result.lines.map((line) => line.newTotal)).toEqual([10, 84, 90])
  })

  it('gives the winner zero penalty even when points are stored against them', () => {
    const result = computeRoundScores({
      participants,
      players,
      entries: entriesFor(participants, { a: 120, b: 5, c: 5 }),
      winnerId: 'a',
    })
    const winnerLine = result.lines.find((line) => line.playerId === 'a')
    expect(winnerLine?.penalty).toBe(0)
    expect(winnerLine?.isWinner).toBe(true)
    expect(result.totals.a).toBe(10)
  })

  it('treats a player whose penalty is not entered yet as zero in the preview', () => {
    const result = computeRoundScores({
      participants,
      players,
      entries: { b: { penalty: null } },
      winnerId: 'b',
    })
    expect(result.penalties).toEqual({ a: 0, b: 0, c: 0 })
    expect(result.lines).toHaveLength(3)
  })

  it('supports a supplied previous-total snapshot', () => {
    const result = computeRoundScores({
      participants: ['a'],
      players,
      entries: entriesFor(['a'], { a: 0 }),
      winnerId: 'b',
      previousTotals: { a: 500 },
    })
    expect(result.lines[0].previousTotal).toBe(500)
  })

  it('applies no penalty when the winner is not a participant', () => {
    const result = computeRoundScores({
      participants: ['b'],
      players,
      entries: entriesFor(['b'], { b: 9 }),
      winnerId: 'a',
    })
    expect(result.penalties.b).toBe(9)
  })
})

describe('cutoff boundaries', () => {
  it('treats a score exactly equal to the cutoff as reaching it', () => {
    expect(hasReachedCutoff(175, 200)).toBe(false)
    expect(hasReachedCutoff(199, 200)).toBe(false)
    expect(hasReachedCutoff(200, 200)).toBe(true)
    expect(hasReachedCutoff(215, 200)).toBe(true)
  })

  it('finds the highest eligible score and its holders', () => {
    const players = [
      player('a', 'Ana', 175),
      player('b', 'Ben', 215),
      player('c', 'Cara', 210),
      player('d', 'Dev', 999, { eliminated: true, eliminationOrder: 1 }),
    ]
    const result = evaluateTopScore(players, 200)
    expect(result.topScore).toBe(215)
    expect(result.crossedCutoff).toBe(true)
    expect(result.leaders).toEqual(['b'])
  })

  it('reports every tied leader at the top score', () => {
    const players = [player('a', 'Ana', 200), player('b', 'Ben', 200), player('c', 'Cara', 20)]
    const result = evaluateTopScore(players, 200)
    expect(result.topScore).toBe(200)
    expect(result.leaders).toEqual(['a', 'b'])
    expect(result.crossedCutoff).toBe(true)
  })

  it('does not flag a cutoff when the top score is below it', () => {
    const result = evaluateTopScore([player('a', 'Ana', 199)], 200)
    expect(result.crossedCutoff).toBe(false)
    expect(result.leaders).toEqual(['a'])
  })

  it('ignores eliminated players entirely', () => {
    const players = [
      player('a', 'Ana', 100),
      player('b', 'Ben', 250, { eliminated: true, eliminationOrder: 1 }),
    ]
    expect(evaluateTopScore(players, 200)).toEqual({
      topScore: 100,
      crossedCutoff: false,
      leaders: ['a'],
    })
  })
})

describe('tie-break scoring', () => {
  it('finds the worst (highest penalty) tied player', () => {
    expect(worstTieBreakPenalties(['a', 'b'], { a: 10, b: 40 })).toEqual({
      worstPenalty: 40,
      worstIds: ['b'],
    })
  })

  it('returns all players when the tie-break is level', () => {
    expect(worstTieBreakPenalties(['a', 'b'], { a: 20, b: 20 })).toEqual({
      worstPenalty: 20,
      worstIds: ['a', 'b'],
    })
  })
})

describe('continuation rules', () => {
  const active = (count: number) =>
    Array.from({ length: count }, (_, index) => player(`p${index}`, `P${index}`))

  it('continues with three or more eligible players', () => {
    expect(determineContinuation(active(3), false)).toEqual({
      activeIds: ['p0', 'p1', 'p2'],
      championId: null,
      needsDecision: false,
    })
  })

  it('requires a controller decision when only two players remain', () => {
    const result = determineContinuation(active(2), false)
    expect(result.needsDecision).toBe(true)
    expect(result.championId).toBeNull()
  })

  it('allows two-player rounds once the table has opted in', () => {
    expect(determineContinuation(active(2), true)).toEqual({
      activeIds: ['p0', 'p1'],
      championId: null,
      needsDecision: false,
    })
  })

  it('crowns the last eligible player', () => {
    expect(determineContinuation([player('a', 'Ana'), player('b', 'Ben', 0, { eliminated: true })], false)).toEqual({
      activeIds: ['a'],
      championId: 'a',
      needsDecision: false,
    })
  })
})

describe('final leaders', () => {
  it('crowns a unique lowest eligible score', () => {
    const players = [player('a', 'Ana', 10), player('b', 'Ben', 20), player('c', 'Cara', 30)]
    expect(evaluateFinalLeaders(players)).toEqual({ championId: 'a', namedPlayerIds: [] })
  })

  it('returns an unresolved tie when the lowest scores match', () => {
    const players = [player('a', 'Ana', 10), player('b', 'Ben', 10), player('c', 'Cara', 30)]
    expect(evaluateFinalLeaders(players)).toEqual({
      championId: null,
      namedPlayerIds: ['a', 'b'],
    })
  })
})

describe('standings', () => {
  it('sorts eligible players by ascending score and puts eliminated players last', () => {
    const players = [
      player('a', 'Ana', 0),
      player('b', 'Ben', 20),
      player('c', 'Cara', 40),
      player('d', 'Dev', 50, { eliminated: true, eliminationOrder: 1, eliminatedAtRound: 2 }),
      player('e', 'Eve', 30, { eliminated: true, eliminationOrder: 2, eliminatedAtRound: 3 }),
    ]
    const standings = buildStandings(players, [])
    expect(standings.map((row) => row.player.id)).toEqual(['a', 'b', 'c', 'e', 'd'])
    expect(standings.filter((row) => !row.player.eliminated).map((row) => row.rank)).toEqual([1, 2, 3])
    expect(standings.filter((row) => row.player.eliminated)).toHaveLength(2)
    expect(standings.every((row) => row.player.eliminated || row.rank <= 3)).toBe(true)
  })

  it('shares ranks between eligible players on the same score', () => {
    const players = [player('a', 'Ana', 20), player('b', 'Ben', 20), player('c', 'Cara', 30)]
    const standings = buildStandings(players, [])
    expect(standings.map((row) => row.rank)).toEqual([1, 1, 3])
    expect(standings[0].tiedOnScore).toBe(true)
    expect(standings[2].tiedOnScore).toBe(false)
  })

  it('includes a per-round penalty history', () => {
    const players = [player('a', 'Ana', 16), player('b', 'Ben', 10)]
    const record = roundRecord({
      roundNumber: 1,
      lines: [
        {
          playerId: 'a',
          name: 'Ana',
          penalty: 16,
          previousTotal: 0,
          newTotal: 16,
          isWinner: false,
        },
        {
          playerId: 'b',
          name: 'Ben',
          penalty: 0,
          previousTotal: 0,
          newTotal: 0,
          isWinner: true,
        },
      ],
    })
    const standings = buildStandings(players, [record])
    expect(standings.map((row) => row.player.id)).toEqual(['b', 'a'])
    expect(standings.find((row) => row.player.id === 'a')?.history).toEqual([
      { roundNumber: 1, penalty: 16, newTotal: 16 },
    ])
    expect(standings.find((row) => row.player.id === 'b')?.history).toEqual([
      { roundNumber: 1, penalty: 0, newTotal: 0 },
    ])
  })

  it('marks rounds a player did not participate in as null', () => {
    const players = [player('a', 'Ana', 0), player('b', 'Ben', 0)]
    const standings = buildStandings(players, [
      roundRecord({
        roundNumber: 1,
        lines: [
          {
            playerId: 'a',
            name: 'Ana',
            penalty: 0,
            previousTotal: 0,
            newTotal: 0,
            isWinner: true,
          },
        ],
      }),
    ])
    expect(standings.find((row) => row.player.id === 'b')?.history[0]).toEqual({
      roundNumber: 1,
      penalty: null,
      newTotal: null,
    })
  })
})
