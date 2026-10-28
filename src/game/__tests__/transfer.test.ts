import { beforeEach, describe, expect, it } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
import { packGame, unpackGame } from '../transferCodec'
import { parseGameState } from '../persistence'
import { createInitialGameState, gameReducer, type GameAction } from '../reducer'
import {
  MAX_PARTS,
  QR_CHAR_LIMIT,
  TRANSFER_VERSION,
  addScannedPart,
  assembleSession,
  buildTransferDocument,
  decodeTransfer,
  emptyScanSession,
  encodeTransfer,
  handoverCode,
  hashOf,
  normalizeHandoverCode,
  parseQrText,
  partQrText,
  planTransfer,
  readTransferInput,
  scanProgress,
  transferFileName,
} from '../transfer'
import type { GameState } from '../types'
import type { TransferPlan } from '../transfer'

/** Narrows a plan that is expected to contain QR codes. */
function planParts(plan: TransferPlan): string[] {
  if (plan.mode === 'too-large') throw new Error(plan.reason)
  return plan.parts
}

/** Wraps a packed game in a transfer envelope, for tampering tests. */
function envelopeOf(game: GameState, overrides: Record<string, unknown> = {}): string {
  return compressToEncodedURIComponent(
    JSON.stringify({ v: TRANSFER_VERSION, id: 'tx_tampered', at: 1, g: packGame(game), ...overrides }),
  )
}

let clock = 1000
const now = () => (clock += 1000)

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(`${action.type} failed: ${result.error.message}`)
  return result.state
}

function startGame(names = ['Ana', 'Ben', 'Cara', 'Dev'], cutoff = 40): GameState {
  return must(createInitialGameState(), {
    type: 'START_GAME',
    payload: {
      players: names.map((name, index) => ({ id: `p${index + 1}`, name })),
      name: 'Friday UNO',
      cutoff,
      at: now(),
    },
  })
}

function playRound(
  state: GameState,
  winnerId: string,
  penalties: Record<string, number> = {},
): GameState {
  let next = must(state, { type: 'BEGIN_ROUND', at: now() })
  next = must(next, { type: 'SET_WINNER', playerId: winnerId })
  for (const id of next.currentRound?.participants ?? []) {
    if (id === winnerId) continue
    next = must(next, { type: 'SET_PENALTY', playerId: id, penalty: penalties[id] ?? 0 })
  }
  return must(next, { type: 'CONFIRM_ROUND', at: now() })
}

/** A game with a transfer already opened, ready to encode. */
function transferable(state: GameState): GameState {
  return must(state, { type: 'BEGIN_TRANSFER', id: 'tx_handover01', at: now() })
}

/** A game long enough to need several QR codes. */
function longGame(rounds = 12): GameState {
  let game = startGame(['Ana', 'Ben', 'Cara', 'Dev'], 100000)
  for (let index = 0; index < rounds; index += 1) {
    const winner = `p${(index % 4) + 1}`
    game = playRound(game, winner, {
      // Two wild-type cards, a 3 and a Skip for p1; a wild4 plus 1–3 Reverses
      // for p2 — expressed the way the screen now takes them: total points.
      p1: (index % 5) * 40 + 16,
      p2: 40 + ((index % 3) + 1) * 10,
      p3: 38,
      p4: 43,
    })
  }
  return game
}

beforeEach(() => {
  clock = 1000
})

describe('transfer encoding', () => {
  it('round-trips a game waiting for the next round', () => {
    const game = transferable(startGame())
    const encoded = encodeTransfer(game)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return

    const decoded = decodeTransfer(encoded.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.id).toBe('tx_handover01')
    expect(decoded.game.transfer).toBeNull()
    expect(decoded.game.config).toEqual(game.config)
    expect(decoded.game.players).toEqual(game.players)
  })

  it('carries cumulative scores, eliminations, round history and the open round', () => {
    let game = startGame()
    game = playRound(game, 'p1', { p2: 40, p3: 5, p4: 4 })
    // Ben is out at the 40 cutoff; Cara and Ana carry on.
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    game = must(game, { type: 'SET_WINNER', playerId: 'p3' })
    game = must(game, { type: 'SET_PENALTY', playerId: 'p1', penalty: 80 })
    game = transferable(game)

    const encoded = encodeTransfer(game)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const decoded = decodeTransfer(encoded.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return

    const received = decoded.game
    expect(received.rounds).toHaveLength(1)
    expect(received.rounds[0].lines).toHaveLength(4)
    expect(received.players.map((player) => player.cumulativeScore)).toEqual([0, 40, 5, 4])
    expect(received.players.find((player) => player.id === 'p2')?.eliminated).toBe(true)
    expect(received.currentRound?.winnerId).toBe('p3')
    expect(received.currentRound?.entries.p1.penalty).toBe(80)
    // Untouched fields stay untouched across the transfer.
    expect(received.currentRound?.entries.p4.penalty).toBeNull()
  })

  it('carries a finished game and its ending', () => {
    let game = startGame(['Ana', 'Ben', 'Cara'], 1000)
    game = playRound(game, 'p1', { p2: 1 })
    game = must(game, { type: 'END_GAME', at: now(), via: 'manual-end' })
    const encoded = encodeTransfer(transferable(game))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const decoded = decodeTransfer(encoded.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.game.phase).toBe('finished')
    expect(decoded.game.ending).toEqual(game.ending)
  })

  it('refuses to encode a game with no transfer started', () => {
    const encoded = encodeTransfer(startGame())
    expect(encoded.ok).toBe(false)
    if (encoded.ok) return
    expect(encoded.error).toMatch(/game menu/i)
  })

  it('refuses to encode an empty game', () => {
    const encoded = encodeTransfer(createInitialGameState())
    expect(encoded.ok).toBe(false)
  })

  it('never ships the sender’s lock, so the receiver stays editable', () => {
    const locked = must(transferable(startGame()), { type: 'MARK_TRANSFERRED', at: now() })
    expect(locked.transfer?.lockedAt).not.toBeNull()
    const encoded = encodeTransfer(locked)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const decoded = decodeTransfer(encoded.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.game.transfer).toBeNull()
  })
})

describe('transfer validation', () => {
  const game = transferable(startGame())
  const encoded = encodeTransfer(game)
  const payload = encoded.ok ? encoded.payload : ''

  it('rejects empty input', () => {
    expect(decodeTransfer('   ').ok).toBe(false)
  })

  it('rejects text that is not a transfer', () => {
    const result = decodeTransfer('this is definitely not a game')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/not a UNO Night transfer|damaged/i)
  })

  it('rejects a payload from another version', () => {
    const result = decodeTransfer(envelopeOf(game, { v: TRANSFER_VERSION + 1 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/different version/i)
  })

  it('rejects a corrupted payload', () => {
    const corrupted = `${payload.slice(0, 20)}${payload.slice(20, 24) === 'zzzz' ? 'yyyy' : 'zzzz'}${payload.slice(24)}`
    expect(decodeTransfer(corrupted).ok).toBe(false)
  })

  it('rejects a truncated payload', () => {
    expect(decodeTransfer(payload.slice(0, Math.floor(payload.length / 2))).ok).toBe(false)
  })

  it('rejects a game that fails field validation', () => {
    const broken = structuredClone(game) as GameState
    broken.players[0].cumulativeScore = -5
    const result = decodeTransfer(envelopeOf(broken))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/failed validation/i)
  })

  it('rejects a game with fewer than three players', () => {
    const broken = structuredClone(game) as GameState
    broken.players = broken.players.slice(0, 2)
    expect(decodeTransfer(envelopeOf(broken)).ok).toBe(false)
  })
})

describe('QR capacity planning', () => {
  it('uses one QR code for a short game', () => {
    const encoded = encodeTransfer(transferable(startGame()))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const plan = planTransfer(encoded.payload, encoded.id)
    expect(plan.mode).toBe('single')
    const parts = planParts(plan)
    expect(parts).toHaveLength(1)
    expect(parts[0].length).toBeLessThanOrEqual(QR_CHAR_LIMIT)
  })

  it('splits a long game into labelled parts that fit the scan limit', () => {
    const encoded = encodeTransfer(transferable(longGame()))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const plan = planTransfer(encoded.payload, encoded.id)
    expect(plan.mode).toBe('multi')
    const parts = planParts(plan)
    expect(plan.total).toBeGreaterThan(1)
    expect(plan.total).toBeLessThanOrEqual(MAX_PARTS)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(QR_CHAR_LIMIT)
    // Every part is labelled with its number and the total.
    expect(parts[0]).toContain(`1/${plan.total}`)
    expect(parts[parts.length - 1]).toContain(`${plan.total}/${plan.total}`)
  })

  it('refuses a payload that would need too many codes instead of truncating it', () => {
    const payload = 'a'.repeat(MAX_PARTS * QR_CHAR_LIMIT + 1)
    const plan = planTransfer(payload, 'tx_handover01')
    expect(plan.mode).toBe('too-large')
    if (plan.mode !== 'too-large') return
    expect(plan.total).toBeGreaterThan(MAX_PARTS)
    expect(plan.reason).toMatch(/file/i)
  })

  it('never loses data when splitting', () => {
    const encoded = encodeTransfer(transferable(longGame(12)))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const plan = planTransfer(encoded.payload, encoded.id)
    const rejoined = planParts(plan)
      .map((text) => {
        const scanned = parseQrText(text)
        if (scanned.kind !== 'part') throw new Error('unreadable part')
        return scanned.part
      })
      .sort((a, b) => a.index - b.index)
      .map((part) => part.chunk)
      .join('')
    expect(rejoined).toBe(encoded.payload)
  })
})

describe('scanned parts', () => {
  const encoded = (() => {
    const result = encodeTransfer(transferable(longGame(10)))
    if (!result.ok) throw new Error('encode failed')
    return result
  })()
  const plan = planTransfer(encoded.payload, encoded.id)
  const parts = planParts(plan).map((text) => {
    const scanned = parseQrText(text)
    if (scanned.kind !== 'part') throw new Error('unreadable part')
    return scanned.part
  })

  it('reads one QR code and knows its place in the set', () => {
    expect(parts[0]).toMatchObject({ index: 1, total: plan.total, id: encoded.id })
    expect(parts[0].hash).toBe(hashOf(encoded.payload))
  })

  it('reports which parts are still missing', () => {
    expect(plan.total).toBeGreaterThan(1)
    let session = emptyScanSession()
    session = addScannedPart(session, parts[0])
    const progress = scanProgress(session)
    expect(progress.scanned).toBe(1)
    expect(progress.total).toBe(plan.total)
    expect(progress.complete).toBe(false)
    expect(progress.missing).toEqual(
      Array.from({ length: plan.total - 1 }, (_, index) => index + 2),
    )

    const assembled = assembleSession(session)
    expect(assembled.ok).toBe(false)
    if (assembled.ok) return
    expect(assembled.error).toMatch(/missing/i)
    expect(assembled.missing).toContain(2)
  })

  it('assembles a complete set scanned out of order', () => {
    let session = emptyScanSession()
    const shuffled = [...parts].reverse()
    for (const part of shuffled) session = addScannedPart(session, part)
    expect(scanProgress(session).complete).toBe(true)

    const assembled = assembleSession(session)
    expect(assembled.ok).toBe(true)
    if (!assembled.ok) return
    expect(assembled.payload).toBe(encoded.payload)

    const decoded = decodeTransfer(assembled.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.game.rounds).toHaveLength(10)
  })

  it('tolerates a duplicated part but flags it', () => {
    let session = emptyScanSession()
    for (const part of parts) session = addScannedPart(session, part)
    session = addScannedPart(session, parts[1])
    const progress = scanProgress(session)
    expect(progress.complete).toBe(true)
    expect(progress.duplicates).toContain(2)
    expect(assembleSession(session).ok).toBe(true)
  })

  it('refuses parts from a different transfer', () => {
    let session = emptyScanSession()
    session = addScannedPart(session, parts[0])
    const foreign = { ...parts[1], id: 'tx_other', hash: 'deadbeef' }
    session = addScannedPart(session, foreign)
    expect(scanProgress(session).problems.join(' ')).toMatch(/different transfer/i)
    expect(Object.keys(session.chunks)).toHaveLength(1)
  })

  it('detects a payload that does not rebuild to the expected checksum', () => {
    let session = emptyScanSession()
    for (const part of parts) session = addScannedPart(session, part)
    const tampered = { ...session, hash: '00000000' }
    const assembled = assembleSession(tampered)
    expect(assembled.ok).toBe(false)
    if (assembled.ok) return
    expect(assembled.error).toMatch(/valid transfer/i)
  })

  it('rejects malformed QR text', () => {
    expect(parseQrText('hello').kind).toBe('invalid')
    expect(parseQrText('U1:1/1:tx:zz:chunk').kind).toBe('invalid')
    expect(parseQrText('U1:9/2:tx_1:deadbeef:chunk').kind).toBe('invalid')
    expect(parseQrText('U1:1/1:tx_1:deadbeef:').kind).toBe('invalid')
  })
})

describe('file fallback and handover codes', () => {
  it('round-trips through the exported document', () => {
    const game = transferable(startGame())
    const encoded = encodeTransfer(game)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return

    const document = buildTransferDocument(encoded.game, encoded)
    expect(document.format).toBe('uno-night-transfer')
    expect(document.rounds).toBe(0)

    const read = readTransferInput(JSON.stringify(document))
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const decoded = decodeTransfer(read.payload)
    expect(decoded.ok).toBe(true)
  })

  it('detects a tampered file', () => {
    const encoded = encodeTransfer(transferable(startGame()))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const document = { ...buildTransferDocument(encoded.game, encoded), checksum: 'deadbeef' }
    const read = readTransferInput(JSON.stringify(document))
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.error).toMatch(/damaged/i)
  })

  it('rejects a file from another app or version', () => {
    expect(readTransferInput('{"format":"something-else","version":1}').ok).toBe(false)
    const encoded = encodeTransfer(transferable(startGame()))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const document = {
      ...buildTransferDocument(encoded.game, encoded),
      version: TRANSFER_VERSION + 1,
    }
    const read = readTransferInput(JSON.stringify(document))
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.error).toMatch(/different version/i)
  })

  it('accepts a bare payload or a single QR string', () => {
    const encoded = encodeTransfer(transferable(startGame()))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return

    const fromPayload = readTransferInput(encoded.payload)
    expect(fromPayload.ok).toBe(true)

    const plan = planTransfer(encoded.payload, encoded.id)
    const fromQr = readTransferInput(planParts(plan)[0])
    expect(fromQr.ok).toBe(true)
    if (!fromQr.ok) return
    expect(fromQr.payload).toBe(encoded.payload)
  })

  it('explains that an incomplete multi-part paste is missing codes', () => {
    const encoded = encodeTransfer(transferable(longGame(10)))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const plan = planTransfer(encoded.payload, encoded.id)
    const read = readTransferInput(planParts(plan)[0])
    expect(read.ok).toBe(false)
    if (read.ok) return
    expect(read.error).toMatch(/remaining codes/i)
  })

  it('derives a stable, typo-resistant handover code', () => {
    const code = handoverCode('tx_handover01')
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(handoverCode('tx_handover01')).toBe(code)
    expect(handoverCode('tx_handover02')).not.toBe(code)
    expect(normalizeHandoverCode(` ${code.slice(0, 3)}-${code.slice(3)} `)).toBe(code)
    expect(normalizeHandoverCode(code.toLowerCase())).toBe(code)
  })

  it('names the export file after the game', () => {
    expect(transferFileName(startGame())).toBe('uno-night-friday-uno.json')
    const unnamed = must(createInitialGameState(), {
      type: 'START_GAME',
      payload: {
        players: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
        name: '',
        cutoff: 100,
        at: 1,
      },
    })
    expect(transferFileName(unnamed)).toBe('uno-night-game.json')
  })

  it('uses the same part format for single and multi transfers', () => {
    const part = { index: 1, total: 1, id: 'tx_1', hash: 'deadbeef', chunk: 'abc' }
    expect(partQrText(part)).toBe('U1:1/1:tx_1:deadbeef:abc')
  })
})

describe('read-only after handover', () => {
  function lockedGame(): GameState {
    return must(transferable(startGame()), { type: 'MARK_TRANSFERRED', at: 5000 })
  }

  it('blocks scoring, rounds and endings once transferred', () => {
    const game = lockedGame()
    const blocked: GameAction[] = [
      { type: 'BEGIN_ROUND', at: now() },
      { type: 'SET_PENALTY', playerId: 'p1', penalty: 10 },
      { type: 'SET_WINNER', playerId: 'p1' },
      { type: 'CONFIRM_ROUND', at: now() },
      { type: 'END_GAME', at: now(), via: 'manual-end' },
      { type: 'DECLARE_CHAMPION', playerId: 'p1', at: now() },
      { type: 'CONTINUE_WITH_TWO_PLAYERS' },
      { type: 'DISCARD_ROUND' },
      { type: 'BEGIN_TRANSFER', id: 'tx_second01', at: now() },
    ]
    for (const action of blocked) {
      const result = gameReducer(game, action)
      expect(result.error?.code, action.type).toBe('GAME_TRANSFERRED')
      expect(result.state).toBe(game)
      expect(result.state.transfer?.lockedAt).toBe(5000)
    }
  })

  it('blocks scoring on a round that was open when the transfer happened', () => {
    let game = startGame()
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    game = transferable(game)
    game = must(game, { type: 'MARK_TRANSFERRED', at: now() })
    const result = gameReducer(game, { type: 'SET_PENALTY', playerId: 'p1', penalty: 10 })
    expect(result.error?.code).toBe('GAME_TRANSFERRED')
  })

  it('still allows a local reset', () => {
    const game = lockedGame()
    const reset = must(game, { type: 'RESET_GAME' })
    expect(reset.phase).toBe('idle')
  })

  it('cannot be unlocked or cancelled once transferred', () => {
    const game = lockedGame()
    // Cancelling would unlock editing, so the read-only guard refuses it outright.
    expect(gameReducer(game, { type: 'CANCEL_TRANSFER' }).error?.code).toBe('GAME_TRANSFERRED')
    expect(gameReducer(game, { type: 'MARK_TRANSFERRED', at: now() }).error?.code).toBe(
      'TRANSFER_ALREADY_DONE',
    )
  })

  it('can be cancelled before the handover is confirmed', () => {
    const game = transferable(startGame())
    expect(game.transfer?.lockedAt).toBeNull()
    const cancelled = must(game, { type: 'CANCEL_TRANSFER' })
    expect(cancelled.transfer).toBeNull()
    // …and the game is editable again.
    expect(must(cancelled, { type: 'BEGIN_ROUND', at: now() }).currentRound).not.toBeNull()
  })

  it('keeps the same transfer id when the screen is reopened', () => {
    const first = transferable(startGame())
    const again = must(first, { type: 'BEGIN_TRANSFER', id: 'tx_ignored99', at: now() })
    expect(again.transfer?.id).toBe('tx_handover01')
  })

  it('requires a started transfer before a handover can be confirmed', () => {
    const result = gameReducer(startGame(), { type: 'MARK_TRANSFERRED', at: now() })
    expect(result.error?.code).toBe('INVALID_TRANSFER')
  })
})

describe('importing', () => {
  it('replaces the local game with the transferred one', () => {
    const sender = transferable(startGame(['Ana', 'Ben', 'Cara'], 55))
    const encoded = encodeTransfer(sender)
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return

    const decoded = decodeTransfer(encoded.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return

    const receiver = startGame(['Xander', 'Yara', 'Zane'], 10)
    const imported = must(receiver, { type: 'IMPORT_GAME', game: decoded.game, at: now() })
    expect(imported.players.map((player) => player.name)).toEqual(['Ana', 'Ben', 'Cara'])
    expect(imported.config?.cutoff).toBe(55)
    expect(imported.transfer).toBeNull()
  })

  it('refuses an empty import', () => {
    const result = gameReducer(startGame(), {
      type: 'IMPORT_GAME',
      game: createInitialGameState(),
      at: now(),
    })
    expect(result.error?.code).toBe('INVALID_TRANSFER')
  })

  it('refuses an import with too few players', () => {
    const game = startGame()
    const broken = { ...game, players: game.players.slice(0, 2) }
    const result = gameReducer(createInitialGameState(), {
      type: 'IMPORT_GAME',
      game: broken,
      at: now(),
    })
    expect(result.error?.code).toBe('INVALID_TRANSFER')
  })

  it('lets the receiver continue the open round that arrived with the transfer', () => {
    let sender = startGame()
    sender = must(sender, { type: 'BEGIN_ROUND', at: now() })
    sender = must(sender, { type: 'SET_WINNER', playerId: 'p2' })
    sender = must(sender, { type: 'SET_PENALTY', playerId: 'p1', penalty: 20 })
    const encoded = encodeTransfer(transferable(sender))
    expect(encoded.ok).toBe(true)
    if (!encoded.ok) return
    const decoded = decodeTransfer(encoded.payload)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return

    let receiver = must(createInitialGameState(), {
      type: 'IMPORT_GAME',
      game: decoded.game,
      at: now(),
    })
    expect(receiver.currentRound?.winnerId).toBe('p2')
    // The receiving device can finish the round that came across.
    receiver = must(receiver, { type: 'SET_PENALTY', playerId: 'p1', penalty: 35 })
    expect(receiver.currentRound?.entries.p1.penalty).toBe(35)
  })
})

describe('legacy transfer codes', () => {
  const zero = {
    n0: 0,
    n1: 0,
    n2: 0,
    n3: 0,
    n4: 0,
    n5: 0,
    n6: 0,
    n7: 0,
    n8: 0,
    n9: 0,
    skip: 0,
    reverse: 0,
    draw2: 0,
    wild: 0,
    wild4: 0,
  }

  /** A format-1 packed game: per-card counters instead of typed penalties. */
  function legacyPacked() {
    return {
      v: 1,
      g: {
        p: 'a',
        n: 'Old night',
        c: 200,
        s: 10,
        t: 10,
        a: 0,
        e: 1,
        pl: [
          ['Ana', 0, 0, null, null],
          ['Ben', 5, 0, null, null],
          ['Cara', 0, 0, null, null],
        ],
        r: [
          {
            n: 1,
            w: 0,
            c: 200,
            f: 20,
            o: 'c',
            l: [
              { p: 0, c: '', n: 0, o: 0, t: 0, w: 1 },
              { p: 1, c: '5=1', n: 5, o: 0, t: 5, w: 0 },
              { p: 2, c: '', n: 0, o: 0, t: 0, w: 0 },
            ],
            e: [],
            b: [],
            tb: null,
          },
        ],
        cr: {
          k: 'r',
          n: 2,
          p: [0, 1, 2],
          e: [
            [{ ...zero, wild4: 2 }, 1],
            [{ ...zero, n7: 3 }, 1],
            [{ ...zero, wild: 1 }, 0],
          ],
          w: 0,
          tb: null,
        },
        tb: null,
        d: null,
        en: null,
      },
    }
  }

  it('reads a code sent before penalties were typed in', () => {
    const game = parseGameState(unpackGame(legacyPacked()))

    expect(game.rounds).toHaveLength(1)
    expect(game.rounds[0].lines.map((line) => line.penalty)).toEqual([0, 5, 0])
    expect(game.players.map((player) => player.cumulativeScore)).toEqual([0, 5, 0])
    // Counters become the totals they used to be worth.
    expect(game.currentRound?.entries.p1.penalty).toBe(80)
    expect(game.currentRound?.entries.p2.penalty).toBe(21)
    expect(game.currentRound?.entries.p3.penalty).toBe(40)
    expect(game.currentRound?.winnerId).toBe('p1')
  })

  it('rejects a format-1 code whose card record is damaged', () => {
    const packed = legacyPacked()
    packed.g.cr.e[1][0] = { ...zero, n7: -2 }
    expect(() => parseGameState(unpackGame(packed))).toThrow()
  })

  it('refuses an unknown packed format', () => {
    const packed = legacyPacked() as { v: number }
    packed.v = 99
    expect(() => unpackGame(packed)).toThrow(/unsupported format/i)
  })
})
