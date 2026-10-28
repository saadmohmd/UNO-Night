import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '@/App'
import { HAIR_STYLES, characterFor } from '@/lib/character'

type User = ReturnType<typeof userEvent.setup>

function avatarStyles(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-avatar-style]')].map(
    (node) => node.getAttribute('data-avatar-style') ?? '',
  )
}

async function startGame(user: User, names: string[], cutoff = '200') {
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

describe('player characters', () => {
  it('draws the same face for the same player every time', () => {
    expect(characterFor('Ana', 0)).toEqual(characterFor('Ana', 0))
    expect(characterFor('  ana  ', 0)).toEqual(characterFor('Ana', 0))
  })

  it('never gives two seats at one table the same haircut', () => {
    const styles = Array.from({ length: 7 }, (_, seat) => characterFor(`Player ${seat}`, seat).style)
    expect(new Set(styles).size).toBe(7)
    for (const style of styles) expect(HAIR_STYLES).toContain(style)
  })

  it('keeps the silhouette when only the name changes', () => {
    const first = characterFor('Ana', 1)
    const second = characterFor('Zoe', 1)
    expect(second.style).toBe(first.style)
    expect(second.skin).toEqual(first.skin)
  })

  it('cycles the pastel tile with the table order', () => {
    const seats = Array.from({ length: 5 }, (_, seat) => characterFor(`Seat ${seat}`, seat).background)
    expect(new Set(seats.slice(0, 4)).size).toBe(4)
    expect(seats[4]).toBe(seats[0])
  })

  it('renders decorative tiles with no text of their own', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'])

    const styles = avatarStyles(document.body)
    expect(styles.length).toBeGreaterThanOrEqual(4)

    const avatar = document.querySelector('[data-avatar-style]') as HTMLElement
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar.textContent).toBe('')
    expect(avatar.querySelector('svg')).not.toBeNull()
  })

  it('keeps each player in the same character from scoring to results', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '100')

    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /record the round/i })
    // Winner chips come first, then the penalty rows: the second half is the table order.
    const entryStyles = avatarStyles(document.body)
    const tableStyles = entryStyles.slice(entryStyles.length / 2)

    await user.click(screen.getByRole('button', { name: 'Ana wins the round' }))
    for (const [name, value] of [
      ['Ben', '20'],
      ['Cara', '10'],
      ['Dev', '5'],
    ] as const) {
      const input = screen.getByLabelText(`Penalty points for ${name}`)
      await user.clear(input)
      await user.type(input, value)
    }
    await user.click(screen.getByRole('button', { name: /^confirm round$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^confirm round$/i }))
    await screen.findByRole('heading', { name: /ana takes the round/i })

    // The breakdown shows the same four characters, in the same order.
    expect(avatarStyles(document.body)).toEqual(tableStyles)
    expect(tableStyles).toEqual(['Ana', 'Ben', 'Cara', 'Dev'].map((name, seat) => characterFor(name, seat).style))
  })

  it('keeps the character on the standings, dimmed, once a player is out', async () => {
    const user = userEvent.setup()
    await startGame(user, ['Ana', 'Ben', 'Cara', 'Dev'], '30')
    await playRound(user, 'Ana', { Ben: '40', Cara: '10', Dev: '5' })

    const splash = await screen.findByTestId('elimination-splash')
    await user.click(within(splash).getByRole('button', { name: /back to the results/i }))

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /dashboard/i }))
    await screen.findByRole('heading', { name: /round 2/i })

    const outSection = screen.getByText(/out of the running/i).closest('section') as HTMLElement
    const outRow = within(outSection).getByText('Ben').closest('li') as HTMLElement
    const avatar = outRow.querySelector('[data-avatar-style]') as HTMLElement
    expect(avatar.getAttribute('data-avatar-style')).toBe(characterFor('Ben', 1).style)
    expect(avatar.className).toContain('opacity-70')
  })
})
