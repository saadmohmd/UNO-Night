import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { resetSoundsForTests } from '@/lib/sound'
import { SAVED_GAME_KEY } from '@/game/persistence'

type User = ReturnType<typeof userEvent.setup>

/** Every cue the app asked the browser to play, in order. */
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
  resetSoundsForTests()
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

async function playRound(user: User, winner: string, penalties: Record<string, string>) {
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

describe('sound cues', () => {
  it('plays the opening theme once when the app opens', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    await Promise.resolve()
    expect(played).toEqual(['vembanattu kayal.mp3'])
  })

  it('stays silent when only opening the setup screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    await user.click(screen.getByRole('button', { name: /new game/i }))
    await screen.findByRole('heading', { name: /set up the table/i })

    // No game has started yet, so only the opening theme has played.
    expect(played).toEqual(['vembanattu kayal.mp3'])
  })

  it('plays the new-game cue once the game actually starts', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    played = []

    await startGame(user)
    expect(played).toEqual(['ethra kunnakale.mp3'])
  })

  it('stays silent when setup is rejected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    played = []

    await user.click(screen.getByRole('button', { name: /new game/i }))
    await screen.findByRole('heading', { name: /set up the table/i })
    // Start with no names: the roster is invalid, so no game begins.
    await user.click(screen.getByRole('button', { name: /start game/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/things need attention/i)
    expect(played).toEqual([])
  })

  it('plays the begin-round cue each time a round starts, once per round', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    played = []

    await startGame(user)
    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /record the round/i })

    expect(played).toEqual(['ethra kunnakale.mp3', 'phone vilich paranjind.mp3'])
  })

  it('plays the elimination cue only once the knockout is confirmed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    played = []

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    played = []

    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /record the round/i })
    await user.click(screen.getByRole('button', { name: 'Ana wins the round' }))
    for (const [name, value] of [
      ['Ben', '45'],
      ['Cara', '10'],
      ['Dev', '5'],
    ] as const) {
      const input = screen.getByLabelText(`Penalty points for ${name}`)
      await user.clear(input)
      await user.type(input, value)
    }

    // Nothing is eliminated while the round is still being entered.
    expect(played).toEqual(['phone vilich paranjind.mp3'])

    await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^confirm round$/i }))

    expect(await screen.findByTestId('elimination-splash')).toBeInTheDocument()
    expect(played).toEqual(['phone vilich paranjind.mp3', 'thankan njanada.mp3'])
  })

  it('plays the elimination cue when the table settles a tie manually', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })

    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    played = []

    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /record the round/i })
    await user.click(screen.getByRole('button', { name: 'Ana wins the round' }))
    for (const [name, value] of [
      ['Ben', '40'],
      ['Cara', '40'],
      ['Dev', '5'],
    ] as const) {
      const input = screen.getByLabelText(`Penalty points for ${name}`)
      await user.clear(input)
      await user.type(input, value)
    }
    await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
    const confirm = await screen.findByRole('dialog')
    await user.click(within(confirm).getByRole('button', { name: /^confirm round$/i }))

    // A tie eliminates nobody yet, so no elimination cue.
    await screen.findByRole('heading', { name: /too close to call/i })
    expect(played).toEqual(['phone vilich paranjind.mp3'])

    await user.click(screen.getByRole('button', { name: /resolve manually/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: /ben is knocked out/i }))
    await user.click(within(dialog).getByRole('button', { name: /knock out ben/i }))

    expect(await screen.findByTestId('elimination-splash')).toBeInTheDocument()
    expect(played).toEqual(['phone vilich paranjind.mp3', 'thankan njanada.mp3'])
  })

  it('does not replay the elimination cue for a restored game', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '40')
    await playRound(user, 'Ana', { Ben: '45', Cara: '10', Dev: '5' })
    await screen.findByTestId('elimination-splash')

    const saved = window.localStorage.getItem(SAVED_GAME_KEY)
    expect(saved).not.toBeNull()

    // Reload with the same save: an app open, but no new game, round or knockout.
    cleanup()
    resetSoundsForTests()
    played = []
    render(<App />)

    await screen.findByRole('heading', { name: /round 2/i })
    expect(played).toEqual(['vembanattu kayal.mp3'])
    expect(screen.queryByTestId('elimination-splash')).not.toBeInTheDocument()
  })

  it('keeps playing when the audio files cannot be loaded', async () => {
    const user = userEvent.setup()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      const error = new Error('404') as Error & { name: string }
      error.name = 'NotSupportedError'
      return Promise.reject(error)
    })

    render(<App />)
    await screen.findByRole('heading', { name: /track the night/i })
    await startGame(user)
    await playRound(user, 'Ana', { Ben: '10', Cara: '5' })

    // The game behaves exactly as before, just silently.
    expect(await screen.findByRole('heading', { name: /ana takes the round/i })).toBeInTheDocument()
  })
})
