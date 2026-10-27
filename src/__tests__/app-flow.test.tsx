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
    mode?: 'manual' | 'automatic'
  } = {},
) {
  const { names = ['Ana', 'Ben', 'Cara'], cutoff = '200', mode = 'automatic' } = options
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
  if (mode === 'manual') {
    await user.click(screen.getByRole('radio', { name: /manual approval/i }))
  }
  await user.click(screen.getByRole('button', { name: /start game/i }))
  await screen.findByRole('heading', { name: /table.*set/i })
}

async function beginRound(user: User) {
  await user.click(screen.getByRole('button', { name: /begin round/i }))
  await screen.findByRole('heading', { name: /count the cards/i })
}

async function selectWinner(user: User, name: string) {
  await user.click(screen.getByRole('radio', { name: `${name} wins the round` }))
}

async function confirmOpenHand(
  user: User,
  card?: { label: string; value: string },
) {
  if (card) {
    const input = screen.getByLabelText(card.label)
    await user.clear(input)
    await user.type(input, card.value)
  }
  await user.click(screen.getByRole('button', { name: /confirm hand/i }))
}

async function submitAndFinalize(user: User, submitLabel: RegExp = /submit scores/i) {
  const review = await screen.findByRole('dialog')
  await user.click(within(review).getByRole('button', { name: submitLabel }))
  await screen.findByRole('heading', { name: /scores accepted/i })
  await user.click(screen.getByRole('button', { name: /finalize round/i }))
  const confirm = await screen.findByRole('dialog')
  await user.click(within(confirm).getByRole('button', { name: /finalize round/i }))
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

  it('records an automatic round with a zero-penalty winner and updates the leaderboard', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '200' })
    await beginRound(user)

    await selectWinner(user, 'Ana')
    await confirmOpenHand(user)
    await confirmOpenHand(user, { label: 'Wild count for Ben', value: '2' })
    await confirmOpenHand(user)

    await user.click(screen.getByRole('button', { name: 'Review' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /review round 1/i })).toBeInTheDocument()
    expect(within(dialog).getByText('+80')).toBeInTheDocument()
    expect(within(dialog).getByText(/winner — penalty locked at 0/i)).toBeInTheDocument()

    await submitAndFinalize(user)

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

  it('supports manual approval, rejection and resubmission', async () => {
    const user = userEvent.setup()
    await startGame(user, { mode: 'manual' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await confirmOpenHand(user)
    await confirmOpenHand(user, { label: 'Skip count for Ben', value: '1' })
    await confirmOpenHand(user)

    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('dialog')
    await user.click(within(review).getByRole('button', { name: /submit for approval/i }))

    expect(await screen.findByRole('heading', { name: /scores submitted/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^reject$/i }))
    const rejectDialog = await screen.findByRole('dialog')
    await user.type(
      within(rejectDialog).getByRole('textbox', { name: /reason/i }),
      'Wrong winner',
    )
    await user.click(within(rejectDialog).getByRole('button', { name: /reject scores/i }))

    await screen.findByRole('heading', { name: /count the cards/i })
    expect(screen.getByText(/these scores were sent back/i)).toBeInTheDocument()
    expect(screen.getByText(/wrong winner/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    const reviewAgain = await screen.findByRole('dialog')
    await user.click(within(reviewAgain).getByRole('button', { name: /submit for approval/i }))
    await screen.findByRole('heading', { name: /scores submitted/i })

    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    await screen.findByRole('heading', { name: /scores accepted/i })
    await user.click(screen.getByRole('button', { name: /finalize round/i }))
    const confirm = await screen.findByRole('dialog')
    await user.click(within(confirm).getByRole('button', { name: /finalize round/i }))
    expect(
      await screen.findByRole('heading', { name: /ana takes the round/i }),
    ).toBeInTheDocument()
  })

  it('flags a cutoff tie, resolves it manually and keeps the leaderboard honest', async () => {
    const user = userEvent.setup()
    await startGame(user, { names: ['Ana', 'Ben', 'Cara', 'Dev'], cutoff: '1' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await confirmOpenHand(user)
    await confirmOpenHand(user, { label: 'Wild count for Ben', value: '1' })
    await confirmOpenHand(user, { label: 'Wild count for Cara', value: '1' })
    await confirmOpenHand(user)

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await submitAndFinalize(user)

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
    await confirmOpenHand(user)
    await confirmOpenHand(user, { label: 'Skip count for Ben', value: '1' })
    await confirmOpenHand(user, { label: 'Number 5 count for Cara', value: '1' })

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await submitAndFinalize(user)

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

  it('blocks review until every hand is confirmed and shows the rejection state', async () => {
    const user = userEvent.setup()
    await startGame(user, { mode: 'manual' })
    await beginRound(user)
    await selectWinner(user, 'Ana')
    await confirmOpenHand(user)
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled()
    expect(screen.getAllByText(/2 hands left to confirm/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /review/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Counts cannot go below zero through the stepper.
    const minus = screen.getByRole('button', {
      name: /remove one wild from ben/i,
    })
    expect(minus).toBeDisabled()
    const plus = screen.getByRole('button', { name: /add one wild to ben/i })
    await user.click(plus)
    expect(screen.getByLabelText('Wild count for Ben')).toHaveValue('1')

    // Invalid direct entry is flagged and never committed as a negative count.
    const wildInput = screen.getByLabelText('Wild count for Ben')
    await user.clear(wildInput)
    await user.type(wildInput, '-2')
    expect(await screen.findByText(/cannot be negative/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove one wild from ben/i })).toBeDisabled()
    await user.tab()
    expect(wildInput).toHaveValue('0')
    expect(screen.queryByText(/cannot be negative/i)).not.toBeInTheDocument()
  })

  it('prevents a second round from starting while a round is open', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)
    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /dashboard/i }))
    // The in-progress round owns the screen, so the dashboard never shows.
    expect(screen.getByRole('heading', { name: /count the cards/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /begin round/i })).not.toBeInTheDocument()
  })

  it('discards a round entry without changing any scores', async () => {
    const user = userEvent.setup()
    await startGame(user)
    await beginRound(user)
    await selectWinner(user, 'Ben')
    await confirmOpenHand(user, { label: 'Wild count for Ana', value: '3' })
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
    await confirmOpenHand(user)
    await confirmOpenHand(user)
    await confirmOpenHand(user, { label: 'Number 4 count for Cara', value: '1' })

    await user.click(screen.getByRole('button', { name: 'Review' }))
    await submitAndFinalize(user)
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

  it('confirms before resetting an active game', async () => {
    const user = userEvent.setup()
    await startGame(user, { cutoff: '200' })

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /reset game/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/the current game will be lost/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^reset game$/i }))
    expect(
      await screen.findByRole('heading', { name: /track the night/i }),
    ).toBeInTheDocument()
  })
})
