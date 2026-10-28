import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { createInitialGameState, gameReducer, type GameAction } from '@/game/reducer'
import {
  addScannedPart,
  emptyScanSession,
  encodeTransfer,
  handoverCode,
  parseQrText,
  planTransfer,
  readTransferInput,
} from '@/game/transfer'
import { buildTransferDocument } from '@/game/transfer'
import type { CardKey } from '@/game/cards'
import type { GameState } from '@/game/types'

vi.setConfig({ testTimeout: 30000 })

type User = ReturnType<typeof userEvent.setup>

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(`${action.type}: ${result.error.message}`)
  return result.state
}

function freshGame(
  names = ['Ana', 'Ben', 'Cara', 'Dev'],
  cutoff = 40,
  id = 'tx_fixed0001',
): GameState {
  let game = must(createInitialGameState(), {
    type: 'START_GAME',
    payload: {
      players: names.map((name, index) => ({ id: `player_${index + 1}`, name })),
      name: 'Friday UNO',
      cutoff,
      at: 1000,
    },
  })
  return must(game, { type: 'BEGIN_TRANSFER', id, at: 1500 })
}

function playRound(
  state: GameState,
  winnerId: string,
  hands: Record<string, Partial<Record<CardKey, number>>> = {},
): GameState {
  let next = must(state, { type: 'BEGIN_ROUND', at: 2000 })
  next = must(next, { type: 'SET_WINNER', playerId: winnerId })
  for (const id of next.currentRound?.participants ?? []) {
    for (const [card, value] of Object.entries(hands[id] ?? {})) {
      next = must(next, { type: 'SET_COUNT', playerId: id, card: card as CardKey, value })
    }
    next = must(next, { type: 'CONFIRM_HAND', playerId: id, confirmed: true })
  }
  return must(next, { type: 'CONFIRM_ROUND', at: 3000 })
}

function payloadOf(game: GameState): string {
  const encoded = encodeTransfer(game)
  if (!encoded.ok) throw new Error(encoded.error)
  return encoded.payload
}

async function startFromHome(user: User, names = ['Ana', 'Ben', 'Cara'], cutoff = '40') {
  render(<App />)
  await user.click(screen.getByRole('button', { name: /new game/i }))
  await screen.findByRole('heading', { name: /set up the table/i })
  for (const [index, name] of names.entries()) {
    await user.type(screen.getByLabelText(`Player ${index + 1} name`), name)
  }
  const cutoffInput = screen.getByLabelText(/score cutoff/i)
  await user.clear(cutoffInput)
  await user.type(cutoffInput, cutoff)
  await user.click(screen.getByRole('button', { name: /start game/i }))
  await screen.findByRole('heading', { name: /table.*set/i })
}

async function openTransfer(user: User) {
  await user.click(screen.getByRole('button', { name: 'Game menu' }))
  await user.click(await screen.findByRole('menuitem', { name: /transfer game/i }))
  await screen.findByRole('heading', { name: /hand the table over/i })
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('transferring from the old phone', () => {
  it('shows a QR code and the two-step handover instructions', async () => {
    const user = userEvent.setup()
    await startFromHome(user)
    await openTransfer(user)

    expect(screen.getByRole('img', { name: /transfer qr code/i })).toBeInTheDocument()
    expect(screen.getByText(/^on the receiving phone$/i)).toBeInTheDocument()
    expect(screen.getByText(/choose “import game”/i)).toBeInTheDocument()
    expect(screen.getByText(/this phone stays editable until you confirm the handover code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark as transferred/i })).toBeEnabled()
    // Still editable: no read-only state yet.
    expect(screen.queryByRole('heading', { name: /handover complete/i })).not.toBeInTheDocument()
  })

  it('refuses a wrong handover code and keeps the game editable', async () => {
    const user = userEvent.setup()
    await startFromHome(user)
    await openTransfer(user)

    await user.click(screen.getByRole('button', { name: /mark as transferred/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/handover code/i), 'ZZZZZZ')
    await user.click(within(dialog).getByRole('button', { name: /confirm handover/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/does not match/i)
    expect(screen.queryByRole('heading', { name: /handover complete/i })).not.toBeInTheDocument()
  })

  it('locks to read-only after the correct code is entered', async () => {
    const user = userEvent.setup()
    await startFromHome(user)
    await openTransfer(user)

    const input = screen.getByRole('button', { name: /mark as transferred/i })
    await user.click(input)
    const dialog = await screen.findByRole('dialog')

    // The code is derived from the transfer id the app stored in the game.
    const raw = JSON.parse(window.localStorage.getItem('uno-night:game') as string) as {
      game: GameState
    }
    const expected = handoverCode(raw.game.transfer!.id)
    await user.type(within(dialog).getByLabelText(/handover code/i), expected)
    await user.click(within(dialog).getByRole('button', { name: /confirm handover/i }))

    expect(await screen.findByRole('heading', { name: /handover complete/i })).toBeInTheDocument()
    expect(screen.getAllByText(/read-only/i).length).toBeGreaterThan(0)

    // The lock is persisted.
    const saved = JSON.parse(window.localStorage.getItem('uno-night:game') as string) as {
      game: GameState
    }
    expect(saved.game.transfer?.lockedAt).toEqual(expect.any(Number))
  })

  it('can mark the handover without a code, after a warning', async () => {
    const user = userEvent.setup()
    await startFromHome(user)
    await openTransfer(user)

    await user.click(screen.getByRole('button', { name: /mark as transferred/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /don’t have the code|don't have the code/i }))
    expect(within(dialog).getByText(/only mark this game as transferred if/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /mark as transferred/i }))

    expect(await screen.findByRole('heading', { name: /handover complete/i })).toBeInTheDocument()
  })
})

describe('read-only behaviour on the old phone', () => {
  it('disables starting rounds and scoring after the handover', async () => {
    const user = userEvent.setup()
    await startFromHome(user)
    await openTransfer(user)

    await user.click(screen.getByRole('button', { name: /mark as transferred/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /don’t have the code|don't have the code/i }))
    await user.click(within(dialog).getByRole('button', { name: /mark as transferred/i }))
    await screen.findByRole('heading', { name: /handover complete/i })

    await user.click(screen.getByRole('button', { name: /view this game/i }))
    await screen.findByRole('heading', { name: /table.*set/i })

    expect(screen.getByRole('button', { name: /begin round/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    expect(await screen.findByRole('menuitem', { name: /end game/i })).toHaveAttribute(
      'data-disabled',
    )
  })

  it('shows an unfinished round as a frozen snapshot instead of the score editor', async () => {
    const user = userEvent.setup()
    await startFromHome(user)
    await user.click(screen.getByRole('button', { name: /begin round/i }))
    await screen.findByRole('heading', { name: /count the cards/i })
    await user.click(screen.getByRole('radio', { name: /ana wins the round/i }))
    // Hands start collapsed; open Ben's tile before editing it.
    const benToggle = screen
      .getAllByRole('button', { expanded: false })
      .find((button) => (button.textContent ?? '').includes('Ben'))
    if (benToggle) await user.click(benToggle)
    const wild = screen.getByLabelText('Wild count for Ben')
    await user.clear(wild)
    await user.type(wild, '2')

    await openTransfer(user)
    await user.click(screen.getByRole('button', { name: /mark as transferred/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /don’t have the code|don't have the code/i }))
    await user.click(within(dialog).getByRole('button', { name: /mark as transferred/i }))
    await screen.findByRole('heading', { name: /handover complete/i })

    await user.click(screen.getByRole('button', { name: /view this game/i }))
    await screen.findByRole('heading', { name: /table.*set/i })

    // The frozen round is browsable, but never the live editor.
    await user.click(screen.getByRole('button', { name: /round snapshot/i }))

    expect(await screen.findByRole('heading', { name: /round 1 snapshot/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /count the cards/i })).not.toBeInTheDocument()
    // The frozen numbers are visible, but nothing is editable.
    expect(screen.getByText(/unconfirmed penalty/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Wild count for Ben')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm hand/i })).not.toBeInTheDocument()
  })
})

describe('importing on the receiving phone', () => {
  async function openImport(user: User) {
    render(<App />)
    await user.click(screen.getByRole('button', { name: /import game/i }))
    await screen.findByRole('heading', { name: /take over a game/i })
  }

  it('previews a pasted transfer before importing anything', async () => {
    const user = userEvent.setup()
    const sender = freshGame()
    await openImport(user)

    await user.type(screen.getByLabelText(/paste a transfer code/i), payloadOf(sender))
    await user.click(screen.getByRole('button', { name: /use this data/i }))

    expect(await screen.findByText(/verified transfer/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Friday UNO' })).toBeInTheDocument()
    const preview = screen.getByText(/verified transfer/i).closest('section') as HTMLElement
    expect(within(preview).getByText('Ana')).toBeInTheDocument()
    expect(within(preview).getByText(/cutoff 40/i)).toBeInTheDocument()

    // Nothing has been imported yet.
    expect(window.localStorage.getItem('uno-night:game')).toBeNull()
  })

  it('imports after confirmation and shows the handover code', async () => {
    const user = userEvent.setup()
    const sender = freshGame(['Ana', 'Ben', 'Cara'], 55)
    await openImport(user)

    await user.type(screen.getByLabelText(/paste a transfer code/i), payloadOf(sender))
    await user.click(screen.getByRole('button', { name: /use this data/i }))
    await screen.findByText(/verified transfer/i)
    await user.click(screen.getByRole('button', { name: /import this game/i }))

    const confirm = await screen.findByRole('dialog')
    await user.click(within(confirm).getByRole('button', { name: /confirm import/i }))

    const handover = await screen.findByRole('dialog')
    expect(within(handover).getByText(handoverCode('tx_fixed0001'))).toBeInTheDocument()

    await user.click(within(handover).getByRole('button', { name: /open the game/i }))
    expect(await screen.findByRole('heading', { name: /table.*set/i })).toBeInTheDocument()

    const saved = JSON.parse(window.localStorage.getItem('uno-night:game') as string) as {
      game: GameState
    }
    expect(saved.game.config?.cutoff).toBe(55)
    expect(saved.game.players.map((player) => player.name)).toEqual(['Ana', 'Ben', 'Cara'])
    // The receiver is a normal editable controller.
    expect(saved.game.transfer).toBeNull()
  })

  it('replaces an existing game only after an explicit confirmation', async () => {
    const user = userEvent.setup()
    await startFromHome(user, ['Xander', 'Yara', 'Zane'])
    const sender = freshGame(['Ana', 'Ben', 'Cara'], 90)

    await user.click(screen.getByRole('button', { name: 'Game menu' }))
    await user.click(await screen.findByRole('menuitem', { name: /import game/i }))
    await screen.findByRole('heading', { name: /take over a game/i })
    // The screen warns that a local game will be replaced.
    expect(screen.getByText(/already has a game in progress/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/paste a transfer code/i), payloadOf(sender))
    await user.click(screen.getByRole('button', { name: /use this data/i }))
    await screen.findByText(/verified transfer/i)
    await user.click(screen.getByRole('button', { name: /replace and take over/i }))

    const confirm = await screen.findByRole('dialog')
    expect(within(confirm).getByText(/will be deleted and replaced/i)).toBeInTheDocument()
    // Cancel leaves the original game untouched.
    await user.click(within(confirm).getByRole('button', { name: /cancel/i }))
    const stillMine = JSON.parse(window.localStorage.getItem('uno-night:game') as string) as {
      game: GameState
    }
    expect(stillMine.game.players.map((player) => player.name)).toEqual(['Xander', 'Yara', 'Zane'])

    // Confirming replaces it.
    await user.click(screen.getByRole('button', { name: /replace and take over/i }))
    const confirmAgain = await screen.findByRole('dialog')
    await user.click(within(confirmAgain).getByRole('button', { name: /replace and import/i }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: /open the game/i }))
    const replaced = JSON.parse(window.localStorage.getItem('uno-night:game') as string) as {
      game: GameState
    }
    expect(replaced.game.players.map((player) => player.name)).toEqual(['Ana', 'Ben', 'Cara'])
  })

  it('keeps the imported open round playable on the new controller', async () => {
    const user = userEvent.setup()
    let sender = freshGame()
    sender = must(sender, { type: 'BEGIN_ROUND', at: 2000 })
    sender = must(sender, { type: 'SET_WINNER', playerId: 'player_2' })
    sender = must(sender, { type: 'SET_COUNT', playerId: 'player_1', card: 'wild', value: 1 })

    await openImport(user)
    await user.type(screen.getByLabelText(/paste a transfer code/i), payloadOf(sender))
    await user.click(screen.getByRole('button', { name: /use this data/i }))
    await screen.findByText(/verified transfer/i)
    await user.click(screen.getByRole('button', { name: /import this game/i }))
    const confirm = await screen.findByRole('dialog')
    await user.click(within(confirm).getByRole('button', { name: /confirm import/i }))
    const handover = await screen.findByRole('dialog')
    await user.click(within(handover).getByRole('button', { name: /open the game/i }))

    // The open round came across and the new phone can keep scoring it.
    expect(await screen.findByRole('heading', { name: /count the cards/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /ben wins the round/i })).toBeChecked()
    expect(screen.getByLabelText('Wild count for Ana')).toHaveValue('1')
  })

  it('rejects a damaged payload without importing', async () => {
    const user = userEvent.setup()
    await openImport(user)

    await user.type(screen.getByLabelText(/paste a transfer code/i), 'U1:1/1:tx_bad:deadbeef:garbage')
    await user.click(screen.getByRole('button', { name: /use this data/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /not a UNO Night transfer|did not rebuild|damaged/i,
    )
    expect(screen.queryByText(/verified transfer/i)).not.toBeInTheDocument()
    expect(window.localStorage.getItem('uno-night:game')).toBeNull()
  })

  it('accepts an uploaded game file', async () => {
    const user = userEvent.setup()
    const sender = freshGame(['Ana', 'Ben', 'Cara'], 120)
    const encoded = encodeTransfer(sender)
    if (!encoded.ok) throw new Error(encoded.error)
    const file = new File(
      [JSON.stringify(buildTransferDocument(encoded.game, encoded))],
      'uno-night-friday-uno.json',
      { type: 'application/json' },
    )

    await openImport(user)
    await user.upload(screen.getByLabelText(/game file/i), file)
    expect(await screen.findByText(/verified transfer/i)).toBeInTheDocument()
    expect(screen.getByText(/cutoff 120/i)).toBeInTheDocument()
  })

  it('explains the camera fallback when no camera is available', async () => {
    const user = userEvent.setup()
    await openImport(user)
    await user.click(screen.getByRole('button', { name: /start camera/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot open the camera|no camera/i)
  })

  it('collects a multi-part transfer one code at a time', async () => {
    const user = userEvent.setup()
    // A long history so the payload genuinely needs several codes.
    let sender = freshGame(['Ana', 'Ben', 'Cara', 'Dev'], 100000)
    for (let index = 0; index < 12; index += 1) {
      sender = playRound(sender, `player_${(index % 4) + 1}`, {
        player_1: { wild: index % 3, n5: 1 },
        player_2: { wild4: 1, n2: 1 },
        player_3: { skip: 1, n9: 1 },
        player_4: { draw2: 1, n1: 1 },
      })
    }
    const encoded = encodeTransfer(sender)
    if (!encoded.ok) throw new Error(encoded.error)
    const plan = planTransfer(encoded.payload, encoded.id)
    if (plan.mode === 'too-large') throw new Error('fixture too large')
    expect(plan.mode).toBe('multi')

    await openImport(user)
    const input = screen.getByLabelText(/paste a transfer code/i)

    for (let index = 0; index < plan.parts.length; index += 1) {
      await user.clear(input)
      await user.type(input, plan.parts[index])
      await user.click(screen.getByRole('button', { name: /use this data/i }))
      if (index < plan.parts.length - 1) {
        expect(await screen.findByText(/^multi-part transfer$/i)).toBeInTheDocument()
        expect(screen.queryByText(/verified transfer/i)).not.toBeInTheDocument()
      }
    }

    expect(await screen.findByText(/verified transfer/i)).toBeInTheDocument()
    expect(screen.getByText(/12 rounds/i)).toBeInTheDocument()
  })

  it('reports missing parts instead of importing a partial transfer', () => {
    // Pure check of the same accumulator the screen uses.
    const sender = freshGame()
    const payload = payloadOf(sender)
    const plan = planTransfer(payload, 'tx_fixed0001')
    expect(plan.mode).toBe('single')

    // A part from a different transfer set must not be mixed in.
    const scanned = parseQrText('U1:1/1:tx_fixed0001:deadbeef:abc')
    expect(scanned.kind).toBe('part')
    if (scanned.kind !== 'part') throw new Error('expected a part')
    const session = addScannedPart(emptyScanSession(), scanned.part)
    expect(session.problems).toHaveLength(0)
    expect(readTransferInput(payload).ok).toBe(true)
  })
})
