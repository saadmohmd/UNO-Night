import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '@/App'
import { createInitialGameState, gameReducer, type GameAction } from '@/game/reducer'
import { SAVED_GAME_KEY, saveGame } from '@/game/persistence'
import type { GameState } from '@/game/types'

type User = ReturnType<typeof userEvent.setup>

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(`${action.type}: ${result.error.message}`)
  return result.state
}

async function startGame(user: User, names: string[], cutoff: string) {
  render(<App />)
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

async function enterRound(
  user: User,
  winner: string,
  penalties: Record<string, string>,
) {
  await user.click(screen.getByRole('button', { name: /begin round/i }))
  await screen.findByRole('heading', { name: /record the round/i })
  await user.click(screen.getByRole('button', { name: `${winner} wins the round` }))
  for (const [name, value] of Object.entries(penalties)) {
    const field = screen.getByLabelText(`Penalty points for ${name}`)
    await user.clear(field)
    await user.type(field, value)
  }
}

async function confirmRound(user: User) {
  await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: /^confirm round$/i }))
}

describe('elimination animations', () => {
  it('plays a knockout splash over the results when a player is eliminated', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '30')
    await enterRound(user, 'Ana', { Ben: '40', Cara: '5', Dev: '5' })
    await confirmRound(user)

    const splash = await screen.findByTestId('elimination-splash')
    expect(within(splash).getByText(/knocked out/i)).toBeInTheDocument()
    expect(within(splash).getByText('OUT')).toBeInTheDocument()
    expect(within(splash).getByText('Ben')).toBeInTheDocument()
    expect(within(splash).getByText(/reached the 30-point cutoff/i)).toBeInTheDocument()
    // The score that triggered it is on the splash.
    expect(within(splash).getByText('40')).toBeInTheDocument()
    // The underlying results screen is still rendered behind the splash.
    expect(screen.getByRole('heading', { name: /ana takes the round/i })).toBeInTheDocument()
  })

  it('does not animate anything when nobody was eliminated', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara'], '200')
    await enterRound(user, 'Ana', { Ben: '20', Cara: '5' })
    await confirmRound(user)

    await screen.findByRole('heading', { name: /ana takes the round/i })
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()
  })

  it('dismisses on tap and never replays for the same knockout', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '30')
    await enterRound(user, 'Ana', { Ben: '40', Cara: '5', Dev: '5' })
    await confirmRound(user)

    const splash = await screen.findByTestId('elimination-splash')
    await user.click(within(splash).getByRole('button', { name: /back to the results/i }))
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()

    // Leaving and coming back to the same results must not replay it.
    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /dashboard/i }))
    await screen.findByRole('heading', { name: /round 2/i })
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^results$/i }))
    await screen.findByRole('heading', { name: /ana takes the round/i })
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()

    // The knockout still reads on the results page itself.
    expect(screen.getByTestId('elimination-card')).toBeInTheDocument()
  })

  it('plays the same splash when the table settles a tie manually', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await enterRound(user, 'Ana', { Ben: '40', Cara: '40', Dev: '5' })
    await confirmRound(user)

    // No splash: a tie eliminates nobody automatically.
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: /too close to call/i })

    await user.click(screen.getByRole('button', { name: /resolve manually/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /ben is knocked out/i }))
    await user.click(within(dialog).getByRole('button', { name: /knock out ben/i }))

    const splash = await screen.findByTestId('elimination-splash')
    expect(within(splash).getByText(/settled by the table/i)).toBeInTheDocument()
    expect(within(splash).getByText('Ben')).toBeInTheDocument()
  })

  it('stays quiet when a restored game already has knockouts', async () => {
    let game = must(createInitialGameState(), {
      type: 'START_GAME',
      payload: {
        players: [
          { id: 'p1', name: 'Ana' },
          { id: 'p2', name: 'Ben' },
          { id: 'p3', name: 'Cara' },
          { id: 'p4', name: 'Dev' },
        ],
        name: '',
        cutoff: 40,
        at: 1000,
      },
    })
    game = must(game, { type: 'BEGIN_ROUND', at: 2000 })
    game = must(game, { type: 'SET_WINNER', playerId: 'p1' })
    game = must(game, { type: 'SET_PENALTY', playerId: 'p2', penalty: 40 })
    game = must(game, { type: 'SET_PENALTY', playerId: 'p3', penalty: 10 })
    game = must(game, { type: 'SET_PENALTY', playerId: 'p4', penalty: 5 })
    game = must(game, { type: 'CONFIRM_ROUND', at: 3000 })
    expect(game.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)

    const saved = saveGame(game, { storage: window.localStorage, now: 4000 })
    expect(saved.ok).toBe(true)

    render(<App />)
    await screen.findByRole('heading', { name: /round 2/i })
    expect(window.localStorage.getItem(SAVED_GAME_KEY)).not.toBeNull()
    // Opening the app is not a knockout: no splash.
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()
  })

  it('strikes through the name in the standings once someone is out', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '30')
    await enterRound(user, 'Ana', { Ben: '40', Cara: '5', Dev: '5' })
    await confirmRound(user)

    const splash = await screen.findByTestId('elimination-splash')
    await user.click(within(splash).getByRole('button', { name: /back to the results/i }))

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /dashboard/i }))
    await screen.findByRole('heading', { name: /round 2/i })

    // The eliminated row carries the strike animation and the OUT badge.
    const outSection = screen.getByText(/out of the running/i).closest('section')
    expect(outSection).not.toBeNull()
    const row = within(outSection as HTMLElement).getByText('Ben')
    expect(row).toHaveClass('strike-name')
    expect(within(outSection as HTMLElement).getAllByText(/out · r1/i).length).toBeGreaterThan(0)
  })
})
