import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App'

vi.setConfig({ testTimeout: 30000 })

type User = ReturnType<typeof userEvent.setup>

async function startGame(
  user: User,
  options: {
    names?: string[]
    cutoff?: string
  } = {},
) {
  const { names = ['Ana', 'Ben', 'Cara'], cutoff = '200' } = options
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

async function beginRound(user: User) {
  await user.click(screen.getByRole('button', { name: /begin round/i }))
  await screen.findByRole('heading', { name: /record the round/i })
}

async function selectWinner(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: `${name} wins the round` }))
}

/** Types one player's penalty points. Empty input clears the field. */
async function enterPenalty(user: User, name: string, value: string) {
  const input = screen.getByLabelText(`Penalty points for ${name}`)
  await user.clear(input)
  if (value) await user.type(input, value)
}

/** Opens the confirmation sheet and confirms the round in one step. */
async function confirmRound(user: User) {
  await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: /^confirm round$/i }))
}

describe('UNO Night app flow', () => {
  it('opens setup from home and validates the roster before starting', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /track the night/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new game/i }))
    await screen.findByRole('heading', { name: /set up the table/i })

    // Score submission / approval was removed; setup only configures the table.
    expect(screen.queryByText(/score submission/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start game/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/things need attention/i)
    expect(screen.getByRole('heading', { name: /set up the table/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add player/i }))
    expect(screen.getByLabelText('Player 4 name')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove player 4' }))
    expect(screen.queryByLabelText('Player 4 name')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Player 1 name'), 'Ana')
    await user.type(screen.getByLabelText('Player 2 name'), 'ana')
    await user.type(screen.getByLabelText('Player 3 name'), 'Cara')
    expect((await screen.findAllByText(/that name is already at the table/i)).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /start game/i }))
    expect(screen.getByRole('heading', { name: /set up the table/i })).toBeInTheDocument()

    const secondName = screen.getByLabelText('Player 2 name')
    await user.clear(secondName)
    await user.type(secondName, 'Ben')
    const cutoff = screen.getByLabelText(/score cutoff/i)
    await user.clear(cutoff)
    await user.type(cutoff, '250')

    await user.click(screen.getByRole('button', { name: /start game/i }))
    await screen.findByRole('heading', { name: /table.*set/i })
    expect(screen.getAllByText(/250/).length).toBeGreaterThan(0)
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('records a round with a zero-penalty winner and updates the leaderboard', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '200' })
    await beginRound(user)

    await selectWinner(user, 'Ana')
    await enterPenalty(user, 'Ben', '80')
    await enterPenalty(user, 'Cara', '0')

    await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /confirm round 1/i })).toBeInTheDocument()
    expect(within(dialog).getByText(/80 points are added/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument()
    // The sheet recaps every line that is about to be committed.
    expect(within(dialog).getByText('+80')).toBeInTheDocument()
    expect(within(dialog).getByText('winner')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^confirm round$/i }))

    expect(
      await screen.findByRole('heading', { name: /ana takes the round/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/80 points across the rest/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /see the updated leaderboard/i }))
    await screen.findByRole('heading', { name: /^leaderboard$/i })
    const benRow = screen.getByText('Ben').closest('li')
    expect(benRow).not.toBeNull()
    expect(within(benRow as HTMLElement).getByText('80')).toBeInTheDocument()
    expect(within(benRow as HTMLElement).getByText(/R1 \+80/i)).toBeInTheDocument()
  })

  it('confirms the round directly and applies the scores immediately', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await enterPenalty(user, 'Ben', '10')
    await enterPenalty(user, 'Cara', '0')

    await confirmRound(user)

    expect(
      await screen.findByRole('heading', { name: /ana takes the round/i }),
    ).toBeInTheDocument()
    const benRow = screen.getByText('Ben').closest('div')
    expect(screen.getByText(/10 points across the rest/i)).toBeInTheDocument()
    expect(benRow).not.toBeNull()

    // No approval surfaces remain anywhere in the flow.
    expect(screen.queryByText(/approval/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve|reject/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument()
  })

  it('flags a cutoff tie, resolves it manually and keeps the leaderboard honest', async () => {
    const user = userEvent.setup()
    await startGame(user, { names: ['Ana', 'Ben', 'Cara', 'Dev'], cutoff: '1' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await enterPenalty(user, 'Ben', '40')
    await enterPenalty(user, 'Cara', '40')
    await enterPenalty(user, 'Dev', '0')

    await confirmRound(user)

    expect(
      await screen.findByRole('heading', { name: /too close to call/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ben and Cara are tied/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /resolve manually/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /ben is knocked out/i }))
    await user.click(within(dialog).getByRole('button', { name: /knock out ben/i }))

    await screen.findByRole('heading', { name: /round 2/i })
    expect(screen.getAllByText(/Out · R1/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Ben knocked out after a tie-break/i)).toBeInTheDocument()
  })

  it('stops for a controller decision with two players and records a champion', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '1' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await enterPenalty(user, 'Ben', '10')
    await enterPenalty(user, 'Cara', '5')

    await confirmRound(user)

    expect(
      await screen.findByRole('heading', { name: /two players remain/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^end game$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^end game$/i }))

    expect(
      await screen.findByRole('heading', { name: /ana takes the night/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/final standings/i)).toBeInTheDocument()
    expect(screen.getByText(/elimination order/i)).toBeInTheDocument()
    expect(screen.getAllByText(/ben/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/ana survived to the end/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new game/i }))
    const newGameDialog = await screen.findByRole('dialog')
    await user.click(within(newGameDialog).getByRole('button', { name: /^new game$/i }))
    await screen.findByRole('heading', { name: /set up the table/i })
  })

  it('blocks confirmation until the winner and every penalty are entered', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)

    // No winner yet, so the fields stay closed and the action is unavailable.
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeDisabled()
    expect(screen.getAllByText(/pick the round winner/i).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await selectWinner(user, 'Ana')
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeDisabled()
    expect(screen.getAllByText(/2 penalties still to enter/i).length).toBeGreaterThan(0)

    await enterPenalty(user, 'Ben', '25')
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeDisabled()
    expect(screen.getAllByText(/1 penalty still to enter/i).length).toBeGreaterThan(0)

    await enterPenalty(user, 'Cara', '0')
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeEnabled()
    expect(screen.getAllByText(/ready — confirm the round/i).length).toBeGreaterThan(0)

    // Only digits can be entered, so negatives and decimals are impossible.
    await enterPenalty(user, 'Ben', '')
    await user.type(screen.getByLabelText('Penalty points for Ben'), '-1.5')
    expect(screen.getByLabelText('Penalty points for Ben')).toHaveValue('15')
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeEnabled()

    // Clearing a field makes the round incomplete again.
    await enterPenalty(user, 'Ben', '')
    expect(screen.getByLabelText('Penalty points for Ben')).toHaveValue('')
    expect(screen.getByRole('button', { name: /^confirm round$/i })).toBeDisabled()
  })

  it('shows no card-by-card controls anywhere in the entry screen', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)

    // The old per-card sections are gone for good.
    expect(screen.queryByText(/number cards/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/action cards/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/wild cards/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/draw two/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/confirm hand/i)).not.toBeInTheDocument()

    // Every participant has one plain penalty field, and one winner button.
    for (const name of ['Ana', 'Ben', 'Cara']) {
      expect(screen.getByLabelText(`Penalty points for ${name}`)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `${name} wins the round` })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { name: /wins the round$/ })).toHaveLength(3)
  })

  it('locks the winner at zero and frees the previous winner when the pick changes', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)

    await selectWinner(user, 'Ana')
    const ana = screen.getByLabelText('Penalty points for Ana')
    expect(ana).toBeDisabled()
    expect(ana).toHaveValue('0')
    expect(screen.getByLabelText('Penalty points for Ben')).toBeEnabled()

    await enterPenalty(user, 'Ben', '30')
    expect(screen.getByLabelText('Penalty points for Ben')).toHaveValue('30')

    // Ana is no longer the winner: her field reopens, Ben's locks at zero.
    await selectWinner(user, 'Ben')
    expect(screen.getByLabelText('Penalty points for Ana')).toBeEnabled()
    expect(screen.getByLabelText('Penalty points for Ana')).toHaveValue('')
    expect(screen.getByLabelText('Penalty points for Ben')).toBeDisabled()
    expect(screen.getByLabelText('Penalty points for Ben')).toHaveValue('0')

    await enterPenalty(user, 'Ana', '15')
    await enterPenalty(user, 'Cara', '5')

    const summary = screen.getByRole('region', { name: /summary/i })
    expect(within(summary).getByText('+15')).toBeInTheDocument()
    expect(within(summary).getByText('+0')).toBeInTheDocument()
    expect(screen.getByText(/3 players · 20 pts/i)).toBeInTheDocument()
  })

  it('adds the typed penalties to the cumulative scores exactly once', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '500' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await enterPenalty(user, 'Ben', '25')
    await enterPenalty(user, 'Cara', '10')

    // The summary previews the resulting totals before anything is committed.
    const summary = screen.getByRole('region', { name: /summary/i })
    expect(within(summary).getByText('25')).toBeInTheDocument()
    expect(within(summary).getByText('10')).toBeInTheDocument()

    await confirmRound(user)
    await screen.findByRole('heading', { name: /ana takes the round/i })
    expect(screen.getByText(/35 points across the rest/i)).toBeInTheDocument()

    // A second confirmation attempt is impossible: the round is no longer open.
    expect(screen.queryByRole('button', { name: /^confirm round$/i })).not.toBeInTheDocument()

    let saved = JSON.parse(window.localStorage.getItem('uno-night:game') as string) as {
      game: { players: { name: string; cumulativeScore: number }[] }
    }
    expect(saved.game.players.map((player) => player.cumulativeScore)).toEqual([0, 25, 10])
    expect(saved.game.players.map((player) => player.name)).toEqual(['Ana', 'Ben', 'Cara'])
  })

  it('prevents a second round from starting while a round is open', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)
    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /dashboard/i }))
    // The in-progress round owns the screen, so the dashboard never shows.
    expect(screen.getByRole('heading', { name: /record the round/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /begin round/i })).not.toBeInTheDocument()
  })

  it('discards a round entry without changing any scores', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)
    await selectWinner(user, 'Ben')
    await enterPenalty(user, 'Ana', '120')
    await user.click(screen.getByRole('button', { name: /discard/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /discard entry/i }))
    await screen.findByRole('heading', { name: /table.*set/i })
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    const bo = screen.getByText('Ben').closest('li')
    expect(within(bo as HTMLElement).getByText('0')).toBeInTheDocument()
  })

  it('renders the final screen with an unresolved tie and records a declared champion', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '500' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await enterPenalty(user, 'Ben', '0')
    await enterPenalty(user, 'Cara', '4')

    await confirmRound(user)
    await screen.findByRole('heading', { name: /ana takes the round/i })

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /end game/i }))
    const endDialog = await screen.findByRole('dialog')
    await user.click(within(endDialog).getByRole('button', { name: /^end game$/i }))

    expect(
      await screen.findByRole('heading', { name: /dead heat.*at the end/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no champion has been declared/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /declare a champion/i }))
    const declareDialog = await screen.findByRole('dialog')
    await user.click(within(declareDialog).getByRole('radio', { name: /ben is the champion/i }))
    await user.click(within(declareDialog).getByRole('button', { name: /record champion/i }))

    expect(
      await screen.findByRole('heading', { name: /ben takes.*the night/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/champion declared by the table/i)).toBeInTheDocument()
  })

  it('confirms before discarding an active game', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '200' })

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /discard game/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/deletes the saved game from this device/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^discard game$/i }))
    expect(
      await screen.findByRole('heading', { name: /track the night/i }),
    ).toBeInTheDocument()
  })
})
