import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { createInitialGameState, gameReducer, type GameAction } from '@/game/reducer'
import { SAVED_GAME_KEY, SAVED_GAME_VERSION, saveGame } from '@/game/persistence'
import type { GameState } from '@/game/types'

vi.setConfig({ testTimeout: 30000 })

type User = ReturnType<typeof userEvent.setup>

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(`${action.type}: ${result.error.message}`)
  return result.state
}

/** A real started game built with the real reducer. */
function freshGame(cutoff = 40, names = ['Ana', 'Ben', 'Cara', 'Dev']): GameState {
  return must(createInitialGameState(), {
    type: 'START_GAME',
    payload: {
      players: names.map((name, index) => ({ id: `p${index + 1}`, name })),
      name: 'Friday UNO',
      cutoff,
      at: 1000,
    },
  })
}

function playRound(
  state: GameState,
  winnerId: string,
  penalties: Record<string, number> = {},
): GameState {
  let next = must(state, { type: 'SET_WINNER', playerId: winnerId })
  for (const id of next.currentRound?.participants ?? []) {
    if (id === winnerId) continue
    next = must(next, { type: 'SET_PENALTY', playerId: id, penalty: penalties[id] ?? 0 })
  }
  return must(next, { type: 'CONFIRM_ROUND', at: 3000 })
}

/** Puts a game into localStorage the way a previous session would have. */
function seedSavedGame(game: GameState) {
  const result = saveGame(game, { storage: window.localStorage, now: Date.UTC(2026, 0, 2, 20, 15) })
  if (!result.ok) throw new Error(result.error)
}

function storedGame(): GameState | null {
  const raw = window.localStorage.getItem(SAVED_GAME_KEY)
  return raw ? (JSON.parse(raw) as { game: GameState }).game : null
}

async function fillSetup(
  user: User,
  names: string[],
  cutoff: string,
) {
  await user.click(screen.getByRole('button', { name: /new game/i }))
  await screen.findByRole('heading', { name: /set up the table/i })
  for (let index = 3; index < names.length; index += 1) {
    await user.click(screen.getByRole('button', { name: /add player/i }))
  }
  for (const [index, name] of names.entries()) {
    await user.type(screen.getByLabelText(`Player ${index + 1} name`), name)
  }
  const cutoffInput = screen.getByLabelText(/score cutoff/i)
  await user.clear(cutoffInput)
  await user.type(cutoffInput, cutoff)
  await user.click(screen.getByRole('button', { name: /start game/i }))
  await screen.findByRole('heading', { name: /table.*set/i })
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('writing the game to this device', () => {
  it('saves the game the moment it starts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fillSetup(user, ['Ana', 'Ben', 'Cara'], '77')

    const raw = window.localStorage.getItem(SAVED_GAME_KEY)
    expect(raw).not.toBeNull()
    const record = JSON.parse(raw as string) as { version: number; savedAt: number; game: GameState }
    expect(record.version).toBe(SAVED_GAME_VERSION)
    expect(record.savedAt).toEqual(expect.any(Number))
    expect(record.game.phase).toBe('active')
    expect(record.game.config).toMatchObject({ cutoff: 77, name: '' })
    expect(record.game.players.map((player) => player.name)).toEqual(['Ana', 'Ben', 'Cara'])
  })

  it('updates the saved copy while a round is being recorded', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fillSetup(user, ['Ana', 'Ben', 'Cara'], '200')
    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /record the round/i })

    const penalty = screen.getByLabelText('Penalty points for Ana')
    await user.clear(penalty)
    await user.type(penalty, '45')

    const game = storedGame()
    const first = game?.currentRound?.participants[0]
    expect(first).toBeDefined()
    expect(first && game?.currentRound?.entries[first]).toEqual({ penalty: 45 })
  })

  it('deletes the saved copy when the game is discarded', async () => {
    const user = userEvent.setup()
    render(<App />)
    await fillSetup(user, ['Ana', 'Ben', 'Cara'], '200')
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /discard game/i }))
    const dialog = await screen.findByRole('dialog')
    // Nothing is removed until the confirmation is accepted.
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).not.toBeNull()
    await user.click(within(dialog).getByRole('button', { name: /^discard game$/i }))

    await screen.findByRole('heading', { name: /track the night/i })
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })
})

describe('restoring the game', () => {
  it('picks the same table back up after a reload', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await fillSetup(user, ['Ana', 'Ben', 'Cara'], '77')

    view.unmount()
    render(<App />)

    expect(await screen.findByRole('heading', { name: /table.*set/i })).toBeInTheDocument()
    expect(screen.getAllByText(/77/).length).toBeGreaterThan(0)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/saved game restored/i)
  })

  it('restores an open round with its winner and typed penalties', async () => {
    const user = userEvent.setup()
    const view = render(<App />)
    await fillSetup(user, ['Ana', 'Ben', 'Cara'], '200')
    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /record the round/i })

    await user.click(screen.getByRole('button', { name: /ben wins the round/i }))
    const penalty = screen.getByLabelText('Penalty points for Ana')
    await user.clear(penalty)
    await user.type(penalty, '60')

    view.unmount()
    render(<App />)

    expect(await screen.findByRole('heading', { name: /record the round/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ben wins the round/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByLabelText('Penalty points for Ana')).toHaveValue('60')
    // Ben is the winner, so his own field is locked at zero.
    expect(screen.getByLabelText('Penalty points for Ben')).toBeDisabled()
    expect(screen.getByLabelText('Penalty points for Ben')).toHaveValue('0')
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeInTheDocument()
  })

  it('restores cumulative scores and eliminations after a confirmed round', async () => {
    let game = must(freshGame(40), { type: 'BEGIN_ROUND', at: 2000 })
    game = playRound(game, 'p1', { p2: 40, p3: 5, p4: 4 })
    expect(game.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)
    seedSavedGame(game)

    const view = render(<App />)
    expect(await screen.findByRole('heading', { name: /ana leads the night/i })).toBeInTheDocument()
    expect(screen.getByText(/rounds played/i)).toBeInTheDocument()
    expect(screen.getByText(/out of the running/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Out · R1/).length).toBeGreaterThan(0)

    // And it survives a second reload unchanged.
    view.unmount()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /ana leads the night/i })).toBeInTheDocument()
    expect(screen.getAllByText(/Out · R1/).length).toBeGreaterThan(0)
  })

  it('restores a finished game on the final screen', async () => {
    let game = must(freshGame(500), { type: 'BEGIN_ROUND', at: 2000 })
    game = playRound(game, 'p1', { p2: 9, p3: 7, p4: 5 })
    game = must(game, { type: 'END_GAME', at: 4000, via: 'manual-end' })
    expect(game.phase).toBe('finished')
    seedSavedGame(game)

    render(<App />)
    expect(await screen.findByRole('heading', { name: /ana takes.*the night/i })).toBeInTheDocument()
    expect(screen.getByText(/rounds played|rounds/i)).toBeInTheDocument()
  })

  it('restores the two-player decision instead of dropping back to the dashboard', async () => {
    let game = must(freshGame(1, ['Ana', 'Ben', 'Cara']), { type: 'BEGIN_ROUND', at: 2000 })
    game = playRound(game, 'p1', { p2: 10 })
    expect(game.decision?.kind).toBe('insufficient-players')
    seedSavedGame(game)

    render(<App />)
    expect(await screen.findByRole('heading', { name: /two players remain/i })).toBeInTheDocument()
  })
})

describe('bad saved data', () => {
  it('clears an unusable save and says so', async () => {
    window.localStorage.setItem(SAVED_GAME_KEY, '{"version":1,"savedAt":1,"game":{}}')
    render(<App />)

    expect(await screen.findByRole('heading', { name: /track the night/i })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/saved game not restored/i)
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('clears a save from an unknown version', async () => {
    window.localStorage.setItem(
      SAVED_GAME_KEY,
      JSON.stringify({ version: SAVED_GAME_VERSION + 5, savedAt: 1, game: freshGame() }),
    )
    render(<App />)

    expect(await screen.findByRole('heading', { name: /track the night/i })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/saved game not restored/i)
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('starts clean when nothing was saved', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /track the night/i })).toBeInTheDocument()
    expect(screen.queryByText(/saved game restored/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/saved game not restored/i)).not.toBeInTheDocument()
  })

  it('lets the table discard a restored game from the notice', async () => {
    const user = userEvent.setup()
    seedSavedGame(must(freshGame(), { type: 'BEGIN_ROUND', at: 2000 }))
    render(<App />)
    await screen.findByRole('heading', { name: /record the round/i })

    await user.click(screen.getByRole('button', { name: /discard saved game/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/deletes the saved game from this device/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /^discard game$/i }))

    expect(await screen.findByRole('heading', { name: /track the night/i })).toBeInTheDocument()
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).toBeNull()
  })

  it('keeps playing when the discard is cancelled', async () => {
    const user = userEvent.setup()
    seedSavedGame(must(freshGame(), { type: 'BEGIN_ROUND', at: 2000 }))
    render(<App />)
    await screen.findByRole('heading', { name: /record the round/i })

    await user.click(screen.getByRole('button', { name: /discard saved game/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /keep playing/i }))

    expect(screen.getByRole('heading', { name: /record the round/i })).toBeInTheDocument()
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).not.toBeNull()
  })
})
