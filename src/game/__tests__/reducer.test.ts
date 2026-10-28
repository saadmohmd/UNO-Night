import { beforeEach, describe, expect, it } from 'vitest'
import {
  createInitialGameState,
  gameReducer,
  type GameAction,
  type GameActionResult,
} from '../reducer'
import type { GameState, StartGamePayload } from '../types'

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
  name?: string
  ids?: string[]
}

function startPayload(names: string[], options: StartOptions = {}): StartGamePayload {
  return {
    players: names.map((name, index) => ({ id: options.ids?.[index] ?? `p${index + 1}`, name })),
    name: options.name ?? 'Friday UNO',
    cutoff: options.cutoff ?? 200,
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

/** Picks the winner, then types a penalty for every other participant. */
function enterRound(
  state: GameState,
  winnerId: string,
  penalties: Record<string, number> = {},
): GameState {
  let next = must(state, { type: 'SET_WINNER', playerId: winnerId })
  const participants = next.currentRound?.participants ?? []
  for (const id of participants) {
    if (id === winnerId) continue
    next = must(next, {
      type: 'SET_PENALTY',
      playerId: id,
      penalty: penalties[id] ?? 0,
    })
  }
  return next
}

/** Validates and records the open round in a single step. */
function confirm(state: GameState): GameState {
  return must(state, { type: 'CONFIRM_ROUND', at: now() })
}

function play(
  state: GameState,
  winnerId: string,
  penalties: Record<string, number> = {},
): GameState {
  return confirm(enterRound(state, winnerId, penalties))
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
    const state = startGame(['Ana', 'Ben', 'Cara'], { cutoff: 250, name: '  Table 4 ' })
    expect(state.phase).toBe('active')
    expect(state.config).toMatchObject({ name: 'Table 4', cutoff: 250 })
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
  it('creates an open round for every eligible player', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expect(state.currentRound).toMatchObject({
      kind: 'round',
      roundNumber: 1,
      winnerId: null,
      participants: ['p1', 'p2', 'p3'],
    })
    // Nothing is entered yet: every penalty starts empty.
    expect(state.currentRound?.entries.p1.penalty).toBeNull()
    expect(state.currentRound?.entries.p2.penalty).toBeNull()
  })

  it('prevents starting a second round while one is in progress', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'ROUND_IN_PROGRESS')
  })

  it('accepts whole penalties and rejects negative, decimal and oversized ones', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    expect(must(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 25 }).currentRound?.entries.p1.penalty).toBe(25)
    expect(must(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 0 }).currentRound?.entries.p1.penalty).toBe(0)
    expect(must(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: null }).currentRound?.entries.p1.penalty).toBeNull()
    expectError(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: -1 }, 'INVALID_PENALTY')
    expectError(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 1.5 }, 'INVALID_PENALTY')
    expectError(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 10_000 }, 'INVALID_PENALTY')
    expectError(state, { type: 'SET_PENALTY', playerId: 'p9', penalty: 5 }, 'INVALID_PLAYER')
  })

  it('zeroes a new winner and frees the previous winner to enter a score', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'SET_PENALTY', playerId: 'p2', penalty: 35 })
    state = must(state, { type: 'SET_WINNER', playerId: 'p1' })
    expect(state.currentRound?.entries.p1.penalty).toBe(0)
    // A winner's score is not editable, and switching winners reopens the old one.
    expectError(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 20 }, 'INVALID_PENALTY')
    state = must(state, { type: 'SET_WINNER', playerId: 'p2' })
    expect(state.currentRound?.entries.p2.penalty).toBe(0)
    expect(state.currentRound?.entries.p1.penalty).toBeNull()
    expect(must(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 12 }).currentRound?.entries.p1.penalty).toBe(12)
  })

  it('requires a winner before the round can be confirmed', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 5 })
    state = must(state, { type: 'SET_PENALTY', playerId: 'p2', penalty: 10 })
    state = must(state, { type: 'SET_PENALTY', playerId: 'p3', penalty: 15 })
    const result = expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'INCOMPLETE_ROUND')
    expect(result.error?.message).toMatch(/select the round winner/i)
  })

  it('requires a penalty for every non-winning player', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'SET_WINNER', playerId: 'p1' })
    state = must(state, { type: 'SET_PENALTY', playerId: 'p2', penalty: 30 })
    const result = expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'INCOMPLETE_ROUND')
    expect(result.error?.message).toMatch(/cara/i)
    state = must(state, { type: 'SET_PENALTY', playerId: 'p3', penalty: 0 })
    expect(confirm(state).rounds).toHaveLength(1)
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

  it('cannot confirm a round with no entry at all', () => {
    const state = begin(startGame(['Ana', 'Ben', 'Cara']))
    const result = expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'INCOMPLETE_ROUND')
    expect(result.error?.message).toMatch(/select the round winner/i)
    expect(state.players.every((player) => player.cumulativeScore === 0)).toBe(true)
    expect(state.rounds).toHaveLength(0)
  })

  it('can discard an open round without changing scores', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = must(state, { type: 'DISCARD_ROUND' })
    expect(state.currentRound).toBeNull()
    expect(state.players.every((player) => player.cumulativeScore === 0)).toBe(true)
    expect(state.rounds).toHaveLength(0)
  })
})

describe('round confirmation', () => {
  it('applies every penalty and records the round in one step', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = play(state, 'p1', { p2: 40, p3: 10 })

    expect(state.currentRound).toBeNull()
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 40, 10])
    expect(state.rounds).toHaveLength(1)
    expect(state.rounds[0].winnerId).toBe('p1')
    expect(state.rounds[0].lines.find((line) => line.playerId === 'p1')?.penalty).toBe(0)
    expect(state.rounds[0].finalizedAt).toBeGreaterThan(0)
  })

  it('does not touch scores while the round is still being entered', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = enterRound(state, 'p1', { p2: 80, p3: 27 })
    expect(state.currentRound).not.toBeNull()
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])
    expect(state.rounds).toHaveLength(0)
  })

  it('requires a complete entry on the confirming action itself', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = enterRound(state, 'p1', { p2: 40 })
    // Blanking an entered penalty makes the round unconfirmable again.
    state = must(state, { type: 'SET_PENALTY', playerId: 'p3', penalty: null })
    expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'INCOMPLETE_ROUND')
    expect(state.rounds).toHaveLength(0)
  })

  it('prevents confirming the same round twice', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = play(state, 'p1', { p2: 5 })
    expect(state.rounds).toHaveLength(1)
    const before = state.players.map((player) => player.cumulativeScore)
    expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expect(state.players.map((player) => player.cumulativeScore)).toEqual(before)
    expect(state.rounds).toHaveLength(1)
  })

  it('leaves no editable round behind after confirming', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = play(state, 'p1', { p2: 5 })
    expectError(state, { type: 'SET_PENALTY', playerId: 'p2', penalty: 2 }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'SET_WINNER', playerId: 'p2' }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'DISCARD_ROUND' }, 'NO_CURRENT_ROUND')
  })

  it('refuses to discard a round that was already confirmed', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = play(state, 'p1', { p2: 40 })
    const result = expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expect(result.state).toBe(state)
    expect(state.players.find((player) => player.id === 'p2')?.cumulativeScore).toBe(40)
  })

  it('confirms tie-break rounds through the same action', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 20 }))
    state = play(state, 'p1', { p2: 40, p3: 40 })
    expect(state.tieBreak).not.toBeNull()

    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    state = enterRound(state, 'p3', { p2: 9 })
    state = confirm(state)

    expect(state.currentRound).toBeNull()
    expect(state.tieBreak).toBeNull()
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)
    expect(state.rounds).toHaveLength(1)
  })
})

describe('cumulative scoring', () => {
  it('carries totals across rounds and records previous totals', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 500 }))
    state = play(state, 'p1', { p2: 40, p3: 20 })
    state = begin(state)
    state = play(state, 'p2', { p1: 28, p3: 10 })
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([28, 40, 30])
    expect(state.rounds).toHaveLength(2)
    expect(state.rounds[1].roundNumber).toBe(2)
    expect(state.rounds[1].lines.find((line) => line.playerId === 'p1')).toMatchObject({
      previousTotal: 0,
      penalty: 28,
      newTotal: 28,
    })
  })

  it('gives the winner a zero penalty even if points were entered for them', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 500 }))
    state = must(state, { type: 'SET_WINNER', playerId: 'p1' })
    state = must(state, { type: 'SET_PENALTY', playerId: 'p2', penalty: 5 })
    state = must(state, { type: 'SET_PENALTY', playerId: 'p3', penalty: 5 })
    // Simulate a stored value against the winner (e.g. an older save): the
    // rules still score them zero.
    state = {
      ...state,
      currentRound: state.currentRound
        ? { ...state.currentRound, entries: { ...state.currentRound.entries, p1: { penalty: 120 } } }
        : null,
    }
    state = confirm(state)
    expect(state.players.find((player) => player.id === 'p1')?.cumulativeScore).toBe(0)
    expect(state.rounds[0].lines.find((line) => line.playerId === 'p1')?.penalty).toBe(0)
  })
})

describe('cutoff and elimination', () => {
  it('does not eliminate before the round is confirmed', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10 }))
    state = enterRound(state, 'p1', { p2: 18, p3: 5 })
    expect(state.players.every((player) => !player.eliminated)).toBe(true)
    state = confirm(state)
    expect(state.players.filter((player) => player.eliminated)).toHaveLength(1)
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)
  })

  it('eliminates the highest scorer when the score exactly reaches the cutoff', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 100 }))
    state = play(state, 'p1', { p2: 99, p3: 100 })
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
    state = play(state, 'p1', { p2: 175, p3: 81 })
    expect(state.players.every((player) => !player.eliminated)).toBe(true)
    expect(state.decision).toBeNull()
    expect(state.rounds[0].outcome).toBe('continue')
    expect(state.phase).toBe('active')
  })

  it('knocks out only the worst player each round', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 200 }))
    state = play(state, 'p1', { p2: 200, p3: 215 })
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 200, 215])
    expect(state.players.find((player) => player.id === 'p2')?.eliminated).toBe(false)
    expect(state.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)
    expect(state.decision?.activePlayerIds).toEqual(['p1', 'p2'])
  })

  it('records elimination order and keeps eliminated players in the roster', () => {
    let state = startGame(['Ana', 'Ben', 'Cara', 'Dev'], { cutoff: 20 })
    state = begin(state)
    state = play(state, 'p1', { p2: 40, p3: 5, p4: 2 })
    expect(state.players.find((player) => player.id === 'p2')?.eliminationOrder).toBe(1)
    state = begin(state)
    state = play(state, 'p3', { p1: 9, p4: 27 })
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
      p2: 80,
      p3: 80,
      p4: 5,
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
    })
    state = enterRound(state, 'p3', { p2: 9 })
    state = confirm(state)
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
    state = enterRound(state, 'p3', { p2: 40 })
    state = confirm(state)
    const after = state.players.map((player) => player.cumulativeScore)
    expect(after).toEqual(before)
  })

  it('keeps the tie open when a replay is level', () => {
    let state = tieGame()
    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    state = enterRound(state, 'p3', {})
    state = confirm(state)
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
    state = play(state, 'p1', { p2: 40, p3: 40 })
    state = must(state, { type: 'START_TIE_BREAK_REPLAY' })
    expectError(state, { type: 'START_TIE_BREAK_REPLAY' }, 'ROUND_IN_PROGRESS')
  })
})

describe('too few players and game endings', () => {
  it('stops for a controller decision when only two players remain', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10 }))
    state = play(state, 'p1', { p2: 18, p3: 5 })
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
    state = play(state, 'p1', { p2: 18, p3: 5 })
    state = must(state, { type: 'CONTINUE_WITH_TWO_PLAYERS' })
    expect(state.allowTwoPlayerRounds).toBe(true)
    expect(state.decision).toBeNull()
    state = begin(state)
    expect(state.currentRound?.participants).toEqual(['p1', 'p3'])
    state = play(state, 'p1', { p3: 9 })
    expect(state.phase).toBe('finished')
    expect(state.ending).toMatchObject({ kind: 'champion', championId: 'p1', via: 'last-standing' })
    expect(state.rounds[1].outcome).toBe('champion')
    expect(state.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)
  })

  it('crowns the only eligible player when a decision leads to a single survivor', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara'], { cutoff: 10 }))
    state = play(state, 'p1', { p2: 18, p3: 5 })
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
      { type: 'START_GAME', payload: { players: [], name: '', cutoff: 200, at: 1 } },
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
          at: 1,
        },
      },
      'INVALID_SETUP',
    )
  })

  it('blocks every entry mutation without a current round', () => {
    const state = startGame(['Ana', 'Ben', 'Cara'])
    expectError(state, { type: 'SET_PENALTY', playerId: 'p1', penalty: 5 }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'SET_WINNER', playerId: 'p1' }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'DISCARD_ROUND' }, 'NO_CURRENT_ROUND')
  })

  it('does not allow editing or discarding after confirmation', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = play(state, 'p1', { p2: 5 })
    expectError(state, { type: 'SET_PENALTY', playerId: 'p2', penalty: 2 }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'DISCARD_ROUND' }, 'NO_CURRENT_ROUND')
    expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'NO_CURRENT_ROUND')
  })

  it('guards round actions after the game has ended but still allows a reset', () => {
    const state = must(startGame(['Ana', 'Ben', 'Cara']), { type: 'END_GAME', at: now() })
    expectError(state, { type: 'BEGIN_ROUND', at: now() }, 'INVALID_PHASE')
    expectError(state, { type: 'CONFIRM_ROUND', at: now() }, 'NO_CURRENT_ROUND')
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
    state = play(state, 'p1', { p2: 40, p3: 5 })
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

  it('discards an open round entry when the game ends', () => {
    let state = begin(startGame(['Ana', 'Ben', 'Cara']))
    state = enterRound(state, 'p1', { p2: 40 })
    state = must(state, { type: 'END_GAME', at: now() })
    expect(state.currentRound).toBeNull()
    expect(state.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0])
    expect(state.rounds).toHaveLength(0)
  })
})
