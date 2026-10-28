import { describe, expect, it } from 'vitest'
import { createInitialGameState, gameReducer, type GameAction } from '../reducer'
import {
  canBeginRound,
  resolveScreen,
  scorePreview,
  type Screen,
} from '../selectors'
import type { GameState } from '../types'

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(result.error.message)
  return result.state
}

function start(names = ['Ana', 'Ben', 'Cara'], options: { cutoff?: number } = {}) {
  return must(createInitialGameState(), {
    type: 'START_GAME',
    payload: {
      players: names.map((name, index) => ({ id: `p${index + 1}`, name })),
      name: '',
      cutoff: options.cutoff ?? 200,
      at: 1,
    },
  })
}

function fill(state: GameState, winnerId: string, penalties: Record<string, number> = {}) {
  let next = must(state, { type: 'SET_WINNER', playerId: winnerId })
  for (const id of next.currentRound?.participants ?? []) {
    if (id === winnerId) continue
    next = must(next, { type: 'SET_PENALTY', playerId: id, penalty: penalties[id] ?? 0 })
  }
  return next
}

describe('resolveScreen', () => {
  const requested: Screen = 'dashboard'

  it('keeps the pre-game routes free', () => {
    expect(resolveScreen(createInitialGameState(), 'home')).toBe('home')
    expect(resolveScreen(createInitialGameState(), 'setup')).toBe('setup')
    expect(resolveScreen(createInitialGameState(), 'leaderboard')).toBe('home')
  })

  it('maps in-game requests to the dashboard', () => {
    const state = start()
    expect(resolveScreen(state, 'home')).toBe('dashboard')
    expect(resolveScreen(state, 'setup')).toBe('dashboard')
    expect(resolveScreen(state, 'leaderboard')).toBe('leaderboard')
    expect(resolveScreen(state, 'results')).toBe('dashboard')
  })

  it('forces the score-entry screen while a round is a draft', () => {
    const state = must(start(), { type: 'BEGIN_ROUND', at: 2 })
    expect(resolveScreen(state, requested)).toBe('entry')
    expect(resolveScreen(state, 'leaderboard')).toBe('entry')
  })

  it('keeps owning the screen until the round is confirmed', () => {
    let state = must(start(), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', {})
    expect(resolveScreen(state, requested)).toBe('entry')
    expect(resolveScreen(state, 'leaderboard')).toBe('entry')
    state = must(state, { type: 'CONFIRM_ROUND', at: 3 })
    expect(resolveScreen(state, requested)).toBe('dashboard')
    expect(resolveScreen(state, 'leaderboard')).toBe('leaderboard')
  })

  it('forces the tie-break screen but allows the leaderboard', () => {
    let state = must(start(['Ana', 'Ben', 'Cara', 'Dev'], { cutoff: 1 }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p2: 40, p3: 40 })
    state = must(state, { type: 'CONFIRM_ROUND', at: 3 })
    expect(resolveScreen(state, 'results')).toBe('tiebreak')
    expect(resolveScreen(state, 'leaderboard')).toBe('leaderboard')
  })

  it('forces the controller decision screen', () => {
    let state = must(start(['Ana', 'Ben', 'Cara'], { cutoff: 1 }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p2: 40, p3: 5 })
    state = must(state, { type: 'CONFIRM_ROUND', at: 3 })
    expect(resolveScreen(state, 'dashboard')).toBe('decision')
    expect(resolveScreen(state, 'leaderboard')).toBe('leaderboard')
  })

  it('always shows the final screen once the game ends', () => {
    const state = must(start(), { type: 'END_GAME', at: 3 })
    expect(resolveScreen(state, 'leaderboard')).toBe('final')
    expect(resolveScreen(state, 'home')).toBe('final')
  })

  it('shows the results screen when a finalized round exists', () => {
    let state = must(start(['Ana', 'Ben', 'Cara'], { cutoff: 999 }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p2: 5 })
    state = must(state, { type: 'CONFIRM_ROUND', at: 3 })
    expect(resolveScreen(state, 'results')).toBe('results')
  })
})

describe('canBeginRound', () => {
  it('allows a round with three eligible players', () => {
    expect(canBeginRound(start())).toEqual({ allowed: true, reason: null })
  })

  it('blocks while a round is open', () => {
    const state = must(start(), { type: 'BEGIN_ROUND', at: 2 })
    expect(canBeginRound(state).allowed).toBe(false)
  })

  it('blocks two-player rounds until the table opts in', () => {
    let state = must(start(['Ana', 'Ben', 'Cara'], { cutoff: 1 }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p2: 40, p3: 5 })
    state = must(state, { type: 'CONFIRM_ROUND', at: 3 })
    expect(canBeginRound(state).allowed).toBe(false)
    state = must(state, { type: 'CONTINUE_WITH_TWO_PLAYERS' })
    expect(canBeginRound(state).allowed).toBe(true)
  })
})

describe('scorePreview', () => {
  it('zeroes the winner and projects cumulative totals', () => {
    let state = must(start(), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p1: 40, p2: 80, p3: 5 })
    const preview = scorePreview(state, state.currentRound!)
    const byId = new Map(preview.lines.map((line) => [line.playerId, line]))
    expect(byId.get('p1')?.penalty).toBe(0)
    expect(byId.get('p2')?.penalty).toBe(80)
    expect(preview.projectedTotals).toEqual({ p1: 0, p2: 80, p3: 5 })
  })
})
