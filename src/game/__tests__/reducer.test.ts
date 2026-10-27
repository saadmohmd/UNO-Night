import { beforeEach, describe, expect, it } from 'vitest'
import type { CardKey } from '../cards'
import {
  createInitialGameState,
  gameReducer,
  type GameAction,
  type GameActionResult,
} from '../reducer'
import type { ApprovalMode, GameState, StartGamePayload } from '../types'

let clock = 1000
const now = () => (clock += 1000)

function apply(state: GameState, action: GameAction): GameActionResult {
  return gameReducer(state, action)
}

function must(state: GameState, action: GameAction): GameState {
  const result = apply(state, action)
  if (result.error) {
    throw new Error(`${action.type} failed: ${result.error.code} — ${result.error.message}`)
  }
  return result.state
}

function expectError(
  state: GameState,
  action: GameAction,
  code?: string,
): GameActionResult {
  const result = apply(state, action)
  expect(result.error, `${action.type} should fail`).not.toBeNull()
  if (code) expect(result.error?.code).toBe(code)
  expect(result.state).toBe(state)
  return result
}

interface StartOptions {
  cutoff?: number
  mode?: ApprovalMode
  name?: string
  ids?: string[]
}

function startPayload(names: string[], options: StartOptions = {}): StartGamePayload {
  return {
    players: names.map((name, index) => ({ id: options.ids?.[index] ?? `p${index + 1}`, name })),
    name: options.name ?? 'Friday UNO',
    cutoff: options.cutoff ?? 200,
    approvalMode: options.mode ?? 'automatic',
    at: now(),
  }
}

function startGame(names: string[], options: StartOptions = {}): GameState {
  return must(createInitialGameState(), {
    type: 'START_GAME',
    payload: startPayload(names, options),
  })
}

function begin(state: GameState): GameState {
  return must(state, { type: 'BEGIN_ROUND', at: now() })
}

function setHand(
  state: GameState,
  playerId: string,
  counts: Partial<Record<CardKey, number>>,
): GameState {
  let next = state
  for (const [card, value] of Object.entries(counts)) {
    next = must(next, {
      type: 'SET_COUNT',
      playerId,
      card: card as CardKey,
      value: value as number,
    })
  }
  return must(next, { type: 'CONFIRM_HAND', playerId, confirmed: true })
}

function enterRound(
  state: GameState,
  winnerId: string,
  hands: Record<string, Partial<Record<CardKey, number>>> = {},
): GameState {
  let next = must(state, { type: 'SET_WINNER', playerId: winnerId })
  const participants = next.currentRound?.participants ?? []
  for (const id of participants) {
    next = setHand(next, id, hands[id] ?? {})
  }
  return next
}

function submit(state: GameState): GameState {
  return must(state, { type: 'SUBMIT_ROUND', at: now() })
}

function finalize(state: GameState): GameState {
  return must(state, { type: 'FINALIZE_ROUND', at: now() })
}

/** Submits, approves when needed and finalizes the current round. */
function playRound(state: GameState): GameState {
  let next = submit(state)
  if (next.currentRound?.status === 'pending') {
    next = must(next, { type: 'APPROVE_ROUND', at: now() })
  }
  return finalize(next)
}

function play(state: GameState, winnerId: string, hands: Record<string, Partial<Record<CardKey, number>>> = {}): GameState {
  return playRound(enterRound(state, winnerId, hands))
}

beforeEach(() => {
  clock = 1000
})

describe('game setup', () => {
  it('cannot start with fewer than three players', () => {
    expectError(createInitialGameState(), { type: 'START_GAME', payload: startPayload(['Ana', 'Ben']) }, 'INVALID_SETUP')
  })

  it('cannot start with more than seven players', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    expectError(createInitialGameState(), { type: 'START_GAME', payload: startPayload(names) }, 'INVALID_SETUP')
  })

  it('rejects duplicate names ignoring case and whitespace', () => {
    expectError(
      createInitialGameState(),
      { type: 'START_GAME', payload: startPayload(['Ana', '  aNa ', 'Cara']) },
      'INVALID_SETUP',
    )
  })

  it('rejects blank names', () => {
    expectError(
      createInitialGameState(),
      { type: 'START_GAME', payload: startPayload(['Ana', '  ', 'Cara']) },
      'INVALID_SETUP',
    )
  })

  it('rejects invalid cutoffs', () => {
    for (const cutoff of [0, -5, 12.5, Number.NaN, 100001]) {
      expectError(
        createInitialGameState(),
        { type: 'START_GAME', payload: startPayload(['Ana', 'Ben', 'Cara'], { cutoff }) },
        'INVALID_SETUP',
      )
    }
  })

  it('starts a locked, zero-scored game with the configured settings', () => {
    const state = startGame(['Ana', 'Ben', 'Cara'], { cutoff: 250, mode: 'manual', name: '  Table 4 ' })
    expect(state.phase).toBe('active')
    expect(state.config).toMatchObject({ name: 'Table 4', cutoff: 250, approvalMode: 'manual' })
    expect(state.players.map((player) => player.name)).toEqual(['Ana', 'Ben', 'Cara'])
    expect(state.players.every((player) => player.cumulativeScore === 0)).toBe(true)
    expect(state.currentRound).toBeNull()
    expectError(state, { type: 'START_GAME', payload: startPayload(['X', 'Y', 'Z']) }, 'INVALID_PHASE')
  })

  it('cannot begin a round without a game', () => {
    expectError(createInitialGameState(), { type: 'BEGIN_ROUND', at: now() }, 'INVALID_PHASE')
  })
})

describe('round entry and validation', () => {
  it('creates a draft round for every eligible player', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expect(state.currentRound).toMatchObject({
      kind: 'round',
      roundNumber: 1,
      status: 'draft',
      winnerId: null,
      participants: ['p1', 'p2', 'p3'],
    })
    expect(state.currentRound?.entries.p1.counts.wild).toBe(0)
    expect(state.currentRound?.entries.p1.confirmed).toBe(false)
  })

  it('prevents starting a second round while one is in progress', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'ROUND_IN_PROGRESS')
  })

  it('rejects negative, decimal and oversized counts', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expectError(state, { type: 'SET_COUNT', playerId: 'p1', card: 'wild', value: -1 }, 'INVALID_COUNT')
    expectError(state, { type: 'SET_COUNT', playerId: 'p1', card: 'wild', value: 1.5 }, 'INVALID_COUNT')
    expectError(state, { type: 'SET_COUNT', playerId: 'p1', card: 'wild', value: 1000 }, 'INVALID_COUNT')
    expectError(state, { type: 'SET_COUNT', playerId: 'p9', card: 'wild', value: 1 }, 'INVALID_PLAYER')
  })

  it('does not allow counts to fall below zero with the stepper', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expectError(
      state,
      { type: 'INCREMENT_COUNT', playerId: 'p1', card: 'skip', delta: -1 },
      'INVALID_COUNT',
    )
  })

  it('requires a winner before submission', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = setHand(state, 'p1', {})
    state = setHand(state, 'p2', {})
    state = setHand(state, 'p3', {})
    const result = expectError(state, { type: 'SUBMIT_ROUND', at: now() }, 'INCOMPLETE_ROUND')
    expect(result.error?.message).toMatch(/select the round winner/i)
  })

  it('requires every hand to be confirmed before submission', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'SET_WINNER', playerId: 'p1' })
    state = setHand(state, 'p1', {})
    state = setHand(state, 'p2', {})
    expectError(state, { type: 'SUBMIT_ROUND', at: now() }, 'INCOMPLETE_ROUND')
  })

  it('only allows a participant to be selected as winner', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expectError(state, { type: 'SET_WINNER', playerId: 'nope' }, 'INVALID_PLAYER')
  })

  it('allows only one winner and lets it be changed', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'SET_WINNER', playerId: 'p1' })
    state = must(state, { type: 'SET_WINNER', playerId: 'p2' })
    expect(state.currentRound?.winnerId).toBe('p2')
  })

  it('cannot finalize an incomplete or unapproved round', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    expectError(state, { type: 'FINALIZE_ROUND', at: now() }, 'NOT_APPROVED')
    state = enterRound(state, 'p1', { p2: { wild: 1 } })
    state = submit(state)
    expect(state.currentRound?.status).toBe('pending')
    expectError(state, { type: 'FINALIZE_ROUND', at: now() }, 'NOT_APPROVED')
  })

  it('locks the round while a submission is pending', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = enterRound(state, 'p1', { p2: { wild: 1 } })
    state = submit(state)
    expectError(state, { type: 'SET_COUNT', playerId: 'p2', card: 'wild', value: 2 }, 'ROUND_LOCKED')
    expectError(state, { type: 'CONFIRM_HAND', playerId: 'p2', confirmed: false }, 'ROUND_LOCKED')
    expectError(state, { type: 'SET_WINNER', playerId: 'p2' }, 'ROUND_LOCKED')
    expectError(state, { type: 'SUBMIT_ROUND', at: now() }, 'NOT_PENDING')
  })

  it('can discard a draft round without changing scores', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'DISCARD_ROUND' })
    expect(state.currentRound).toBeNull()
    expect(state.players.every((player) => player.cumulativeScore === 0)).toBe(true)
    expect(state.rounds).toHaveLength(0)
  })
})

describe('manual approval workflow', () => {
  it('keeps scores unchanged until the round is approved and finalized', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = enterRound(state, 'p1', { p2: { wild: 1 }, p3: { n5: 2 } })
    state = submit(state)
    expect(state.currentRound?.status).toBe('pending')
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])

    state = must(state, { type: 'APPROVE_ROUND', at: now() })
    expect(state.currentRound?.status).toBe('approved')
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])

    state = finalize(state)
    expect(state.currentRound).toBeNull()
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 40, 10])
    expect(state.rounds).toHaveLength(1)
    expect(state.rounds[0].winnerId).toBe('p1')
    expect(state.rounds[0].lines.find((line) => line.playerId === 'p1')?.penalty).toBe(0)
  })

  it('does not allow approval of a non-pending round', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    expectError(state, { type: 'APPROVE_ROUND', at: now() }, 'NOT_PENDING')
    state = enterRound(state, 'p1', {})
    state = submit(state)
    state = must(state, { type: 'APPROVE_ROUND', at: now() })
    expectError(state, { type: 'APPROVE_ROUND', at: now() }, 'NOT_PENDING')
  })

  it('keeps rejected submissions out of the cumulative scores', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = enterRound(state, 'p1', { p2: { wild: 2 }, p3: { n9: 3 } })
    state = submit(state)
    state = must(state, { type: 'REJECT_ROUND', at: now(), reason: 'Ben had a +4 too' })
    expect(state.currentRound?.status).toBe('rejected')
    expect(state.currentRound?.rejection?.reason).toBe('Ben had a +4 too')
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])
    expect(state.rounds).toHaveLength(0)
    expectError(state, { type: 'FINALIZE_ROUND', at: now() }, 'NOT_APPROVED')
  })

  it('allows editing and resubmitting a rejected submission', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = enterRound(state, 'p1', { p2: { wild: 1 } })
    state = submit(state)
    state = must(state, { type: 'REJECT_ROUND', at: now(), reason: null })
    expect(state.currentRound?.rejection?.reason).toBeNull()
    state = setHand(state, 'p2', { wild: 2 })
    expect(state.currentRound?.status).toBe('rejected')
    state = submit(state)
    expect(state.currentRound?.status).toBe('pending')
    expect(state.currentRound?.rejection).toBeNull()
    state = must(state, { type: 'APPROVE_ROUND', at: now() })
    state = finalize(state)
    expect(state.players.find((player) => player.id === 'p2')?.cumulativeScore).toBe(80)
  })

  it('rejects non-pending submissions', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    expectError(state, { type: 'REJECT_ROUND', at: now(), reason: null }, 'NOT_PENDING')
    state = enterRound(state, 'p1', {})
    state = submit(state)
    state = must(state, { type: 'REJECT_ROUND', at: now(), reason: 'Misread a +4' })
    expect(state.currentRound?.status).toBe('rejected')
    expectError(state, { type: 'REJECT_ROUND', at: now(), reason: null }, 'NOT_PENDING')
  })

  it('prevents finalizing the same round twice', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = playRound(enterRound(state, 'p1', { p2: { n5: 1 } }))
    expect(state.rounds).toHaveLength(1)
    const before = state.players.map((player) => player.cumulativeScore)
    expectError(state, { type: 'FINALIZE_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expect(state.players.map((player) => player.cumulativeScore)).toEqual(before)
  })
})

describe('automatic approval workflow', () => {
  it('accepts a valid submission immediately but waits for finalization', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'automatic' }))
    state = enterRound(state, 'p1', { p2: { draw2: 1, wild4: 1 }, p3: { skip: 1 } })
    state = submit(state)
    expect(state.currentRound?.status).toBe('approved')
    expect(state.currentRound?.autoApproved).toBe(true)
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])
    expectError(state, { type: 'REJECT_ROUND', at: now(), reason: null }, 'NOT_PENDING')
    expectError(state, { type: 'SUBMIT_ROUND', at: now() }, 'NOT_APPROVED')
    state = finalize(state)
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 60, 10])
  })

  it('uses the same scoring engine as manual approval', () => {
    const hands = { p2: { n7: 2, skip: 1, wild: 1 } as const, p3: { draw2: 1 } as const }
    let auto = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'automatic' }))
    auto = play(auto, 'p1', hands)
    let manual = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    manual = play(manual, 'p1', hands)
    expect(auto.players.map((player) => player.cumulativeScore)).toEqual(
      manual.players.map((player) => player.cumulativeScore),
    )
    expect(auto.rounds[0].lines).toEqual(manual.rounds[0].lines)
  })
})

describe('cumulative scoring', () => {
  it('carries totals across rounds and records previous totals', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 500 }))
    state = play(state, 'p1', { p2: { wild: 1 }, p3: { draw2: 1 } })
    state = begin(state)
    state = play(state, 'p2', { p1: { n9: 2, skip: 1 }, p3: { reverse: 1 } })
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([28, 40, 30])
    expect(state.rounds).toHaveLength(2)
    expect(state.rounds[1].roundNumber).toBe(2)
    expect(state.rounds[1].lines.find((line) => line.playerId === 'p1')).toMatchObject({
      previousTotal: 0,
      penalty: 28,
      newTotal: 28,
    })
  })

  it('gives the winner a zero penalty even with remaining cards', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 500 }))
    state = play(state, 'p1', { p1: { wild4: 2, wild: 1 }, p2: { n5: 1 } })
    expect(state.players.find((player) => player.id === 'p1')?.cumulativeScore).toBe(0)
    expect(state.rounds[0].lines.find((line) => line.playerId === 'p1')?.penalty).toBe(0)
  })
})

describe('cutoff and elimination', () => {
  it('does not eliminate before the round is finalized', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10, mode: 'manual' }))
    state = enterRound(state, 'p1', { p2: { n9: 2 }, p3: { n5: 1 } })
    state = submit(state)
    state = must(state, { type: 'APPROVE_ROUND', at: now() })
    expect(state.players.every((player) => !player.eliminated)).toBe(true)
    state = finalize(state)
    expect(state.players.filter((player) => player.eliminated)).toHaveLength(1)
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)
  })

  it('eliminates the highest scorer when the score exactly reaches the cutoff', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 100 }))
    state = play(state, 'p1', { p2: { n9: 11 }, p3: { n9: 10, skip: 1 } })
    const ben = state.players.find((player) => player.id === 'p2')
    const cara = state.players.find((player) => player.id === 'p3')
    expect(ben?.cumulativeScore).toBe(99)
    expect(ben?.eliminated).toBe(false)
    expect(cara?.cumulativeScore).toBe(100)
    expect(cara?.eliminated).toBe(true)
    expect(cara?.eliminatedAtRound).toBe(1)
    expect(cara?.eliminationOrder).toBe(1)
    expect(state.rounds[0].eliminations[0]).toMatchObject({
      playerId: 'p3',
      cumulativeScore: 100,
      via: 'cutoff',
      roundNumber: 1,
    })
  })

  it('does not eliminate anyone below the cutoff', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 200 }))
    state = play(state, 'p1', { p2: { n7: 25 }, p3: { n9: 9 } })
    expect(state.players.every((player) => !player.eliminated)).toBe(true)
    expect(state.decision).toBeNull()
    expect(state.rounds[0].outcome).toBe('continue')
    expect(state.phase).toBe('active')
  })

  it('knocks out only the worst player each round', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 200 }))
    state = play(state, 'p1', { p2: { n5: 40 }, p3: { n5: 43 } })
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 200, 215])
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(false)
    expect(state.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)
    expect(state.decision?.activePlayerIds).toEqual(['p1', 'p2'])
  })

  it('records elimination order and keeps eliminated players in the roster', () => {
    let state = startGame(['Ana', 'Ben', 'Cara', 'Dev'], { cutoff: 20 })
    state = begin(state)
    state = play(state, 'p1', { p2: { wild: 1 }, p3: { n5: 1 }, p4: { n2: 1 } })
    expect(state.players.find((player) => player.id === 'p2')?.eliminationOrder).toBe(1)
    state = begin(state)
    state = play(state, 'p3', { p1: { n9: 1 }, p4: { n9: 3 } })
    expect(state.players.find((player) => player.id === 'p4')?.eliminationOrder).toBe(2)
    expect(state.players).toHaveLength(4)
    expect(state.rounds[1].eliminations[0].order).toBe(2)
  })
})

describe('tie handling', () => {
  function tieGame(): GameState {
    let state = startGame(['Ana', 'Ben', 'Cara', 'Dev'], { cutoff: 80 })
    state = begin(state)
    return play(state, 'p1', {
      p2: { wild: 1, wild4: 1 },
      p3: { wild: 2 },
      p4: { n5: 1 },
    })
  }

  it('flags a tie at the top score instead of eliminating arbitrarily', () => {
    const state = tieGame()
    expect(state.tieBreak).toMatchObject({
      playerIds: ['p2', 'p3'],
      score: 80,
      sourceRoundNumber: 1,
    })
    expect(state.players.every((player) => !player.eliminated)).toBe(true)
    expect(state.rounds[0].outcome).toBe('tie-break')
    expect(state.rounds[0].tieBreakPlayerIds).toEqual(['p2', 'p3'])
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'INVALID_TIE_BREAK_PHASE')
  })

  it('resolves a tie manually and records the outcome before continuing', () => {
    let state = tieGame()
    expectError(
      state,
      { type: 'RESOLVE_TIE_BREAK_MANUAL', playerId: 'p1', at: now() },
      'INVALID_TIE_BREAK_RESOLUTION',
    )
    state = must(state, {
      type: 'RESOLVE_TIE_BREAK_MANUAL',
      playerId: 'p3',
      note: 'Cara drew the high card',
      at: now(),
    })
    expect(state.tieBreak).toBeNull()
    expect(state.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(false)
    const tieRecord = state.rounds[0].tieBreaks[0]
    expect(tieRecord.kind).toBe('manual')
    expect(tieRecord.eliminatedPlayerId).toBe('p3')
    expect(tieRecord.note).toBe('Cara drew the high card')
    expect(state.rounds[0].eliminations[0].via).toBe('tie-break-manual')
    expect(state.rounds[0].outcome).toBe('continue')
    expect(state.phase).toBe('active')
  })

  it('plays a tie-break replay among the tied players only', () => {
    let state = tieGame()
    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    expect(state.currentRound).toMatchObject({
      kind: 'tie-break',
      roundNumber: 1,
      participants: ['p2', 'p3'],
      status: 'draft',
    })
    state = enterRound(state, 'p3', { p2: { n9: 1 }, p3: {} })
    state = playRound(state)
    expect(state.currentRound).toBeNull()
    expect(state.tieBreak).toBeNull()
    expect(state.rounds).toHaveLength(1)
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)
    expect(state.players.find((player) => player.id === 'p3')?.eliminated).toBe(false)
    const tieRecord = state.rounds[0].tieBreaks[0]
    expect(tieRecord.kind).toBe('replay')
    expect(tieRecord.eliminatedPlayerId).toBe('p2')
    expect(tieRecord.winnerId).toBe('p3')
    expect(tieRecord.hands?.p2.penalty).toBe(9)
  })

  it('does not change cumulative totals during a tie-break replay', () => {
    let state = tieGame()
    const before = state.players.map((player) => player.cumulativeScore)
    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    state = enterRound(state, 'p3', { p2: { wild: 1 }, p3: {} })
    state = playRound(state)
    const after = state.players.map((player) => player.cumulativeScore)
    expect(after).toEqual(before)
  })

  it('keeps the tie open when a replay is level', () => {
    let state = tieGame()
    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    state = enterRound(state, 'p3', {})
    state = playRound(state)
    expect(state.tieBreak?.playerIds).toEqual(['p2', 'p3'])
    expect(state.players.every((player) => !player.eliminated)).toBe(true)
    expect(state.rounds[0].tieBreaks[0].eliminatedPlayerId).toBeNull()
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'INVALID_TIE_BREAK_PHASE')
  })

  it('blocks tie-break replays when no tie exists', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expectError(state, { type: 'START_TIE_BREAK_REPLAY' }, 'NO_TIE_BREAK')
  })

  it('blocks starting a replay while another tie-break entry is open', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 20 }))
    state = play(state, 'p1', { p2: { wild: 1 }, p3: { wild: 1 } })
    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    expectError(state, { type: 'START_TIE_BREAK_REPLAY' }, 'ROUND_IN_PROGRESS')
  })
})

describe('too few players and game endings', () => {
  it('stops for a controller decision when only two players remain', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10 }))
    state = play(state, 'p1', { p2: { n9: 2 }, p3: { n5: 1 } })
    expect(state.decision).toMatchObject({
      kind: 'insufficient-players',
      activePlayerIds: ['p1', 'p3'],
      roundNumber: 1,
    })
    expect(state.rounds[0].outcome).toBe('insufficient-players')
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'INVALID_PHASE')
  })

  it('lets the table explicitly continue with two players', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10 }))
    state = play(state, 'p1', { p2: { n9: 2 }, p3: { n5: 1 } })
    state = must(state, { type: 'CONTINUE_WITH_TWO_PLAYERS' })
    expect(state.allowTwoPlayerRounds).toBe(true)
    expect(state.decision).toBeNull()
    state = begin(state)
    expect(state.currentRound?.participants).toEqual(['p1', 'p3'])
    state = play(state, 'p1', { p3: { n9: 1 } })
    expect(state.phase).toBe('finished')
    expect(state.ending).toMatchObject({ kind: 'champion', championId: 'p1', via: 'last-standing' })
    expect(state.rounds[1].outcome).toBe('champion')
    expect(state.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)
  })

  it('crowns the only eligible player when a decision leads to a single survivor', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10 }))
    state = play(state, 'p1', { p2: { n9: 2 }, p3: { n5: 1 } })
    state = must(state, { type: 'END_GAME', at: now(), via: 'controller-end' })
    expect(state.phase).toBe('finished')
    expect(state.ending).toMatchObject({ kind: 'champion', championId: 'p1', via: 'controller-end' })
  })

  it('ends a game without inventing a champion when the leaders are tied', () => {
    let state = startGame(['Ana', 'Ben', 'Cara'])
    state = must(state, { type: 'END_GAME', at: now() })
    expect(state.phase).toBe('finished')
    expect(state.ending).toMatchObject({
      kind: 'unresolved',
      championId: null,
      namedPlayerIds: ['p1', 'p2', 'p3'],
    })
  })

  it('allows an explicit champion declaration for unresolved ties', () => {
    let state = startGame(['Ana', 'Ben', 'Cara'])
    state = must(state, { type: 'END_GAME', at: now() })
    state = must(state, { type: 'DECLARE_CHAMPION', playerId: 'p3', at: now() })
    expect(state.ending).toMatchObject({ kind: 'champion', championId: 'p3', via: 'declared' })
    expectError(state, { type: 'DECLARE_CHAMPION', playerId: 'p1', at: now() })
  })

  it('does not allow ending a game that is not active', () => {
    expectError(createInitialGameState(), { type: 'END_GAME', at: now() }, 'INVALID_PHASE')
  })
})

describe('tie-break decision guards', () => {
  it('only allows continuing with two players when a decision is pending', () => {
    const state = startGame(['Ana', 'Ben', 'Cara'])
    expectError(state, { type: 'CONTINUE_WITH_TWO_PLAYERS' }, 'NO_DECISION')
  })

  it('does not allow manual tie-break resolution without a tie', () => {
    const state = startGame(['Ana', 'Ben', 'Cara'])
    expectError(
      state,
      { type: 'RESOLVE_TIE_BREAK_MANUAL', playerId: 'p1', at: now() },
      'NO_TIE_BREAK',
    )
  })
})

describe('edge-case guards', () => {
  it('rejects starting a game with no players at all', () => {
    expectError(
      createInitialGameState(),
      { type: 'START_GAME', payload: { players: [], name: '', cutoff: 200, approvalMode: 'manual', at: 1 } },
      'INVALID_SETUP',
    )
  })

  it('rejects duplicate player ids at the boundary', () => {
    expectError(
      createInitialGameState(),
      {
        type: 'START_GAME',
        payload: {
          players: [
            { id: 'same', name: 'Ana' },
            { id: 'same', name: 'Ben' },
            { id: 'p3', name: 'Cara' },
          ],
          name: '',
          cutoff: 200,
          approvalMode: 'automatic',
          at: 1,
        },
      },
      'INVALID_SETUP',
    )
  })

  it('rejects an unknown submission mode', () => {
    expectError(
      createInitialGameState(),
      {
        type: 'START_GAME',
        payload: {
          players: [
            { id: 'a', name: 'Ana' },
            { id: 'b', name: 'Ben' },
            { id: 'c', name: 'Cara' },
          ],
          name: '',
          cutoff: 200,
          approvalMode: 'nobody-approves' as ApprovalMode,
          at: 1,
        },
      },
      'INVALID_SETUP',
    )
  })

  it('blocks every entry mutation without a current round', () => {
    const state = startGame(['Ana', 'Ben', 'Cara'])
    expectError(state, { type: 'SET_COUNT', playerId: 'p1', card: 'wild', value: 1 }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'INCREMENT_COUNT', playerId: 'p1', card: 'wild', delta: 1 }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'CONFIRM_HAND', playerId: 'p1', confirmed: true }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'SET_WINNER', playerId: 'p1' }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'SUBMIT_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'APPROVE_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'REJECT_ROUND', at: now(), reason: null }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'FINALIZE_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'DISCARD_ROUND' }, 'NO_CURRENT_ROUND')
  })

  it('does not allow steppers to exceed the per-card cap', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'SET_COUNT', playerId: 'p1', card: 'skip', value: 99 })
    expectError(state, { type: 'INCREMENT_COUNT', playerId: 'p1', card: 'skip', delta: 1 }, 'INVALID_COUNT')
    expect(state.currentRound?.entries.p1.counts.skip).toBe(99)
  })

  it('does not allow editing approved scores', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = enterRound(state, 'p1', { p2: { n5: 1 } })
    state = submit(state)
    expectError(state, { type: 'SET_COUNT', playerId: 'p2', card: 'n5', value: 2 }, 'ROUND_LOCKED')
    expectError(state, { type: 'DISCARD_ROUND' }, 'ROUND_LOCKED')
  })

  it('blocks a pending round from being discarded before rejection', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = enterRound(state, 'p1', {})
    state = submit(state)
    expectError(state, { type: 'DISCARD_ROUND' }, 'NOT_PENDING')
  })

  it('does not let manual approval be applied in automatic mode', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'automatic' }))
    state = enterRound(state, 'p1', {})
    state = submit(state)
    expectError(state, { type: 'APPROVE_ROUND', at: now() }, 'INVALID_PHASE')
  })

  it('guards round actions after the game has ended but still allows a reset', () => {
    const state = must(startGame(['Ana', 'Ben', 'Cara']), { type: 'END_GAME', at: now() })
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'INVALID_PHASE')
    expectError(state, { type: 'FINALIZE_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expect(must(state, { type: 'RESET_GAME' })).toEqual(createInitialGameState())
  })

  it('returns an error for unknown actions', () => {
    const state = startGame(['Ana', 'Ben', 'Cara'])
    const result = gameReducer(state, { type: 'NOT_A_REAL_ACTION' } as unknown as GameAction)
    expect(result.error?.code).toBe('INVALID_PHASE')
    expect(result.state).toBe(state)
  })
})

describe('reset behaviour', () => {
  it('clears every trace of the session', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 20 }))
    state = play(state, 'p1', { p2: { wild: 1 }, p3: { n5: 1 } })
    expect(state.players.some((player) => player.eliminated)).toBe(true)
    expect(state.rounds).toHaveLength(1)

    state = must(state, { type: 'RESET_GAME' })
    expect(state).toEqual(createInitialGameState())
    expect(state.phase).toBe('idle')
    expect(state.players).toEqual([])
    expect(state.rounds).toEqual([])
    expect(state.ending).toBeNull()
    expect(state.tieBreak).toBeNull()
    expect(state.decision).toBeNull()
  })

  it('can start a fresh game after a reset', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'RESET_GAME' })
    state = startGame(['Dev', 'Eve', 'Finn'], { name: 'Rematch' })
    expect(state.players.map((player) => player.name)).toEqual(['Dev', 'Eve', 'Finn'])
    expect(state.rounds).toHaveLength(0)
  })

  it('discards a pending submission when the game ends', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { mode: 'manual' }))
    state = enterRound(state, 'p1', { p2: { wild: 1 } })
    state = submit(state)
    state = must(state, { type: 'END_GAME', at: now() })
    expect(state.currentRound).toBeNull()
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])
    expect(state.rounds).toHaveLength(0)
  })
})
