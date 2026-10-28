import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { resetSoundForTests } from '@/lib/sound'

type User = ReturnType<typeof userEvent.setup>

/** Every play() the app asked for, in order. */
let played: string[] = []

function fileOf(src: string): string {
  return decodeURIComponent(src.split('/').pop() ?? '')
}

beforeEach(() => {
  played = []
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
    this: HTMLMediaElement,
  ) {
    played.push(fileOf(this.src))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  resetSoundForTests()
  vi.restoreAllMocks()
})

async function startGame(user: User, names = ['Ana', 'Ben', 'Cara'], cutoff = '200') {
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

async function confirmRound(user: User, winner: string, penalties: Record<string, string>) {
  await user.click(screen.getByRole('button', { name: /begin round/i }))
  await screen.findByRole('heading', { name: /record the round/i })
  await user.click(screen.getByRole('button', { name: `${winner} wins the round` }))
  for (const [name, value] of Object.entries(penalties)) {
    const input = screen.getByLabelText(`Penalty points for ${name}`)
    await user.clear(input)
    await user.type(input, value)
  }
  await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: /^confirm round$/i }))
}

describe('elimination music', () => {
  it('stays silent while setting up and playing a round with no knockout', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '200')
    await confirmRound(user, 'Ana', { Ben: '20', Cara: '10', Dev: '5' })

    await screen.findByRole('heading', { name: /ana takes the round/i })
    expect(played).toEqual([])
  })

  it('plays the track once when a knockout is confirmed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await confirmRound(user, 'Ana', { Ben: '45', Cara: '10', Dev: '5' })

    expect(await screen.findByTestId('elimination-splash')).toBeInTheDocument()
    expect(played).toEqual(['BALOR Music - Big B mass Dialogues.mp3'])
  })

  it('does not play again when the splash is dismissed or the screen is revisited', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await confirmRound(user, 'Ana', { Ben: '45', Cara: '10', Dev: '5' })
    const splash = await screen.findByTestId('elimination-splash')
    await user.click(within(splash).getByRole('button', { name: /back to the results/i }))

    // Reopening the results of the same round is not a new knockout.
    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /dashboard/i }))
    await screen.findByRole('heading', { name: /round 2/i })
    await user.click(screen.getByRole('button', { name: /^results$/i }))
    await screen.findByRole('heading', { name: /ana takes the round/i })

    expect(played).toHaveLength(1)
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()
  })

  it('plays when the table settles a tie manually', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await confirmRound(user, 'Ana', { Ben: '40', Cara: '40', Dev: '5' })

    // A tie eliminates nobody yet.
    await screen.findByRole('heading', { name: /too close to call/i })
    expect(played).toEqual([])

    await user.click(screen.getByRole('button', { name: /resolve manually/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /ben is knocked out/i }))
    await user.click(within(dialog).getByRole('button', { name: /knock out ben/i }))

    expect(await screen.findByTestId('elimination-splash')).toBeInTheDocument()
    expect(played).toEqual(['BALOR Music - Big B mass Dialogues.mp3'])
  })

  it('stays silent when a restored game already has knockouts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await confirmRound(user, 'Ana', { Ben: '45', Cara: '10', Dev: '5' })
    await screen.findByTestId('elimination-splash')

    // Reload: the saved game has a knockout in its history, but nothing new happened.
    played = []
    cleanup()
    render(<App />)
    await screen.findByRole('heading', { name: /round 2/i })

    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()
    // Nothing new happened on reload, so nothing was played.
    expect(played).toEqual([])
  })

  it('keeps the game working when the file cannot be played', async () => {
    const user = userEvent.setup()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      const error = new Error('404') as Error & { name: string }
      error.name = 'NotSupportedError'
      return Promise.reject(error)
    })

    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await confirmRound(user, 'Ana', { Ben: '45', Cara: '10', Dev: '5' })

    // The knockout still lands: splash, score and reason are all there.
    expect(await screen.findByTestId('elimination-splash')).toBeInTheDocument()
    expect(screen.getByText(/45 points is past the 40-point cutoff/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /ana takes the round/i })).toBeInTheDocument()
  })
})
