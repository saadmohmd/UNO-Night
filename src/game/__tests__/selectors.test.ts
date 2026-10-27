import { describe, expect, it } from 'vitest'
import type { CardKey } from '../cards'
import { createInitialGameState, gameReducer, type GameAction } from '../reducer'
import {
  canBeginRound,
  resolveScreen,
  scorePreview,
  type Screen,
} from '../selectors'
import type { ApprovalMode, GameState } from '../types'

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(result.error.message)
  return result.state
}

function start(names = ['Ana', 'Ben', 'Cara'], options: { cutoff?: number; mode?: ApprovalMode } = {}) {
  return must(createInitialGameState(), {
    type: 'START_GAME',
    payload: {
      players: names.map((name, index) => ({ id: `p${index + 1}`, name })),
      name: '',
      cutoff: options.cutoff ?? 200,
      approvalMode: options.mode ?? 'automatic',
      at: 1,
    },
  })
}

function fill(state: GameState, winnerId: string, counts: Record<string, Partial<Record<CardKey, number>>>) {
  let next = must(state, { type: 'SET_WINNER', playerId: winnerId })
  for (const id of next.currentRound?.participants ?? []) {
    for (const [card, value] of Object.entries(counts[id] ?? {})) {
      next = must(next, { type: 'SET_COUNT', playerId: id, card: card as CardKey, value: value as number })
    }
    next = must(next, { type: 'CONFIRM_HAND', playerId: id, confirmed: true })
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

  it('forces pending approval and approved screens', () => {
    let state = must(start(['Ana', 'Ben', 'Cara'], { mode: 'manual' }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', {})
    state = must(state, { type: 'SUBMIT_ROUND', at: 3 })
    expect(resolveScreen(state, requested)).toBe('pending')
    state = must(state, { type: 'APPROVE_ROUND', at: 4 })
    expect(resolveScreen(state, requested)).toBe('approved')
    expect(resolveScreen(state, 'leaderboard')).toBe('approved')
  })

  it('forces the tie-break screen but allows the leaderboard', () => {
    let state = must(start(['Ana', 'Ben', 'Cara', 'Dev'], { cutoff: 1 }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p2: { wild: 1 }, p3: { wild: 1 } })
    state = must(state, { type: 'SUBMIT_ROUND', at: 3 })
    state = must(state, { type: 'FINALIZE_ROUND', at: 4 })
    expect(resolveScreen(state, 'results')).toBe('tiebreak')
    expect(resolveScreen(state, 'leaderboard')).toBe('leaderboard')
  })

  it('forces the controller decision screen', () => {
    let state = must(start(['Ana', 'Ben', 'Cara'], { cutoff: 1 }), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p2: { wild: 1 }, p3: { n5: 1 } })
    state = must(state, { type: 'SUBMIT_ROUND', at: 3 })
    state = must(state, { type: 'FINALIZE_ROUND', at: 4 })
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
    state = fill(state, 'p1', { p2: { n5: 1 } })
    state = must(state, { type: 'SUBMIT_ROUND', at: 3 })
    state = must(state, { type: 'FINALIZE_ROUND', at: 4 })
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
    state = fill(state, 'p1', { p2: { wild: 1 }, p3: { n5: 1 } })
    state = must(state, { type: 'SUBMIT_ROUND', at: 3 })
    state = must(state, { type: 'FINALIZE_ROUND', at: 4 })
    expect(canBeginRound(state).allowed).toBe(false)
    state = must(state, { type: 'CONTINUE_WITH_TWO_PLAYERS' })
    expect(canBeginRound(state).allowed).toBe(true)
  })
})

describe('scorePreview', () => {
  it('zeroes the winner and projects cumulative totals', () => {
    let state = must(start(), { type: 'BEGIN_ROUND', at: 2 })
    state = fill(state, 'p1', { p1: { wild: 1 }, p2: { wild: 2 }, p3: { n5: 1 } })
    const preview = scorePreview(state, state.currentRound!)
    const byId = new Map(preview.lines.map((line) => [line.playerId, line]))
    expect(byId.get('p1')?.penalty).toBe(0)
    expect(byId.get('p2')?.penalty).toBe(80)
    expect(preview.projectedTotals).toEqual({ p1: 0, p2: 80, p3: 5 })
  })
})
