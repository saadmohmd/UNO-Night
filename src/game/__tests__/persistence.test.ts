import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState, gameReducer, type GameAction } from '../reducer'
import {
  SAVED_GAME_KEY,
  SAVED_GAME_VERSION,
  clearSavedGame,
  loadSavedGame,
  parseSavedGame,
  saveGame,
  type StorageLike,
} from '../persistence'
import type { GameState, StartGamePayload } from '../types'

let clock = 1000
const now = () => (clock += 1000)

function must(state: GameState, action: GameAction): GameState {
  const result = gameReducer(state, action)
  if (result.error) throw new Error(`${action.type} failed: ${result.error.message}`)
  return result.state
}

function startPayload(names: string[], cutoff = 200): StartGamePayload {
  return {
    players: names.map((name, index) => ({ id: `p${index + 1}`, name })),
    name: 'Friday UNO',
    cutoff,
    at: now(),
  }
}

function startGame(names = ['Ana', 'Ben', 'Cara', 'Dev'], cutoff = 40): GameState {
  return must(createInitialGameState(), { type: 'START_GAME', payload: startPayload(names, cutoff) })
}

function begin(state: GameState): GameState {
  return must(state, { type: 'BEGIN_ROUND', at: now() })
}

function enterRound(
  state: GameState,
  winnerId: string,
  penalties: Record<string, number> = {},
): GameState {
  let next = must(state, { type: 'SET_WINNER', playerId: winnerId })
  for (const id of next.currentRound?.participants ?? []) {
    if (id === winnerId) continue
    next = must(next, { type: 'SET_PENALTY', playerId: id, penalty: penalties[id] ?? 0 })
  }
  return next
}

function playRound(
  state: GameState,
  winnerId: string,
  penalties: Record<string, number> = {},
): GameState {
  return must(enterRound(state, winnerId, penalties), { type: 'CONFIRM_ROUND', at: now() })
}

/** Minimal in-memory stand-in for localStorage. */
interface MemoryStorage extends StorageLike {
  data: Map<string, string>
}

function memoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

function readRecord(storage: MemoryStorage): Record<string, unknown> {
  const raw = storage.data.get(SAVED_GAME_KEY)
  if (!raw) throw new Error('nothing saved')
  return JSON.parse(raw) as Record<string, unknown>
}

beforeEach(() => {
  clock = 1000
  // Rejected saves are reported in the console; keep the test output tidy.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saving and loading', () => {
  it('round-trips a game that is waiting to begin a round', () => {
    const storage = memoryStorage()
    const game = startGame()
    expect(saveGame(game, { storage, now: 1234 })).toEqual({ ok: true, savedAt: 1234 })

    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return
    expect(loaded.savedAt).toBe(1234)
    expect(loaded.game).toEqual(game)
  })

  it('round-trips an open round with its typed-in penalties and winner', () => {
    const storage = memoryStorage()
    const game = enterRound(begin(startGame()), 'p1', { p2: 80, p4: 5 })
    saveGame(game, { storage })

    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return
    expect(loaded.game.currentRound).toEqual(game.currentRound)
    expect(loaded.game.currentRound?.entries.p2).toEqual({ penalty: 80 })
    expect(loaded.game.currentRound?.entries.p3).toEqual({ penalty: 0 })
    expect(loaded.game.currentRound?.winnerId).toBe('p1')
    expect(loaded.game.players.map((player) => player.cumulativeScore)).toEqual([0, 0, 0, 0])
  })

  it('round-trips confirmed rounds, cumulative scores and eliminations', () => {
    const storage = memoryStorage()
    // Ana wins, Ben and Cara tie at the 40 cutoff -> tie-break, then a manual call eliminates Cara.
    let game = startGame()
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    game = playRound(game, 'p1', { p2: 40, p3: 40, p4: 5 })
    expect(game.tieBreak?.playerIds).toEqual(['p2', 'p3'])
    game = must(game, {
      type: 'RESOLVE_TIE_BREAK_MANUAL',
      playerId: 'p3',
      note: 'coin flip',
      at: now(),
    })
    expect(game.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)

    saveGame(game, { storage })
    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return
    expect(loaded.game).toEqual(game)
    expect(loaded.game.rounds).toHaveLength(1)
    expect(loaded.game.players.map((player) => player.cumulativeScore)).toEqual([0, 40, 40, 5])
    expect(loaded.game.players.find((player) => player.id === 'p3')?.eliminated).toBe(true)
  })

  it('round-trips a finished game with its ending', () => {
    const storage = memoryStorage()
    let game = startGame(['Ana', 'Ben', 'Cara'], 1000)
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    game = playRound(game, 'p1', { p2: 1 })
    game = must(game, { type: 'END_GAME', at: now(), via: 'manual-end' })
    expect(game.phase).toBe('finished')

    saveGame(game, { storage })
    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return
    expect(loaded.game.phase).toBe('finished')
    expect(loaded.game.ending).toEqual(game.ending)
  })

  it('round-trips a tie-break replay in progress', () => {
    const storage = memoryStorage()
    let game = startGame()
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    game = playRound(game, 'p1', { p2: 40, p3: 40, p4: 5 })
    game = must(game, { type: 'START_TIE_BREAK_REPLAY' })
    game = must(game, { type: 'SET_WINNER', playerId: 'p2' })
    game = must(game, { type: 'SET_PENALTY', playerId: 'p3', penalty: 80 })

    saveGame(game, { storage })
    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return
    expect(loaded.game.currentRound?.kind).toBe('tie-break')
    expect(loaded.game.tieBreak).toEqual(game.tieBreak)
    expect(loaded.game).toEqual(game)
  })

  it('round-trips the two-player decision state', () => {
    const storage = memoryStorage()
    let game = startGame(['Ana', 'Ben', 'Cara'], 1)
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    // Ben leaves at 10, which drops the table to two players.
    game = playRound(game, 'p1', { p2: 10, p3: 5 })
    expect(game.decision?.kind).toBe('insufficient-players')

    saveGame(game, { storage })
    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return
    expect(loaded.game.decision).toEqual(game.decision)
  })

  it('clears the slot when the game is reset', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    expect(storage.data.has(SAVED_GAME_KEY)).toBe(true)

    const reset = must(startGame(), { type: 'RESET_GAME' })
    expect(saveGame(reset, { storage })).toEqual({ ok: true, savedAt: expect.any(Number) })
    expect(storage.data.has(SAVED_GAME_KEY)).toBe(false)
    expect(loadSavedGame(storage)).toEqual({ status: 'empty' })
  })

  it('reports an empty slot when nothing was ever saved', () => {
    expect(loadSavedGame(memoryStorage())).toEqual({ status: 'empty' })
  })

  it('keeps only gameplay fields and never stores extra personal data', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    const record = readRecord(storage)
    const saved = record.game as Record<string, unknown>
    expect(record.version).toBe(SAVED_GAME_VERSION)
    expect(Object.keys(saved).sort()).toEqual(
      [
        'allowTwoPlayerRounds',
        'config',
        'currentRound',
        'decision',
        'ending',
        'nextEliminationOrder',
        'phase',
        'players',
        'rounds',
        'startedAt',
        'tieBreak',
        'transfer',
      ].sort(),
    )
    const players = saved.players as Record<string, unknown>[]
    expect(Object.keys(players[0]).sort()).toEqual(
      ['cumulativeScore', 'eliminated', 'eliminatedAtRound', 'eliminationOrder', 'id', 'name'].sort(),
    )
  })
})

describe('damaged or outdated saves', () => {
  it('rejects unparseable JSON without deleting it during the read', () => {
    const storage = memoryStorage({ [SAVED_GAME_KEY]: '{not json' })
    const result = loadSavedGame(storage)
    expect(result.status).toBe('discarded')
    expect(storage.data.has(SAVED_GAME_KEY)).toBe(true)
    // The caller clears it once it has decided to start fresh.
    expect(clearSavedGame(storage)).toBe(true)
    expect(loadSavedGame(storage)).toEqual({ status: 'empty' })
  })

  it('discards a save from another version', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    const record = readRecord(storage)
    storage.data.set(SAVED_GAME_KEY, JSON.stringify({ ...record, version: SAVED_GAME_VERSION + 1 }))
    const result = loadSavedGame(storage)
    expect(result.status).toBe('discarded')
    if (result.status !== 'discarded') return
    expect(result.reason).toMatch(/different version/i)
  })

  it('discards a save missing required fields', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    const record = readRecord(storage)
    const game = record.game as Record<string, unknown>
    delete game.players
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(record))
    const result = loadSavedGame(storage)
    expect(result.status).toBe('discarded')
    if (result.status !== 'discarded') return
    expect(result.reason).toMatch(/damaged|incomplete/i)
    // The technical reason is still logged for debugging.
    expect(console.warn).toHaveBeenCalledWith(
      '[UNO Night] Saved game rejected:',
      expect.stringContaining('players'),
    )
  })

  it('discards impossible penalties', () => {
    const storage = memoryStorage()
    const game = enterRound(begin(startGame()), 'p1', { p2: 40 })
    saveGame(game, { storage })
    const record = readRecord(storage)
    const saved = record.game as { currentRound: { entries: Record<string, { penalty: number | null }> } }
    saved.currentRound.entries.p2.penalty = -1
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(record))
    expect(loadSavedGame(storage).status).toBe('discarded')
  })

  it('discards scores that are not whole numbers', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    const record = readRecord(storage)
    const saved = record.game as { players: { cumulativeScore: number }[] }
    saved.players[0].cumulativeScore = 12.5
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(record))
    expect(loadSavedGame(storage).status).toBe('discarded')
  })

  it('discards a round that references an unknown player', () => {
    const storage = memoryStorage()
    const game = enterRound(begin(startGame()), 'p1')
    saveGame(game, { storage })
    const record = readRecord(storage)
    const saved = record.game as { currentRound: { participants: string[] } }
    saved.currentRound.participants[0] = 'ghost'
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(record))
    expect(loadSavedGame(storage).status).toBe('discarded')
  })

  it('discards a cutoff outside the allowed range', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    const record = readRecord(storage)
    const saved = record.game as { config: { cutoff: number } }
    saved.config.cutoff = 0
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(record))
    expect(loadSavedGame(storage).status).toBe('discarded')
  })

  it('refuses an absurdly large payload without parsing it', () => {
    const storage = memoryStorage({ [SAVED_GAME_KEY]: 'x'.repeat(600 * 1024) })
    const result = loadSavedGame(storage)
    expect(result.status).toBe('discarded')
    if (result.status !== 'discarded') return
    expect(result.reason).toMatch(/larger/i)
  })

  it('strips unknown fields instead of restoring them', () => {
    const storage = memoryStorage()
    saveGame(startGame(), { storage })
    const record = readRecord(storage)
    const saved = record.game as { players: Record<string, unknown>[]; notes?: string }
    saved.players[0].email = 'ana@example.com'
    saved.notes = 'anything personal'
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(record))

    const result = loadSavedGame(storage)
    expect(result.status).toBe('restored')
    if (result.status !== 'restored') return
    expect(result.game.players[0]).not.toHaveProperty('email')
    expect(result.game).not.toHaveProperty('notes')
  })
})

describe('storage that refuses to cooperate', () => {
  it('reports unavailable when storage cannot be read', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(loadSavedGame(storage)).toEqual({ status: 'unavailable' })
  })

  it('reports unavailable without storage at all', () => {
    expect(loadSavedGame(null)).toEqual({ status: 'unavailable' })
  })

  it('returns an error instead of throwing when the write quota is exceeded', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    const result = saveGame(startGame(), { storage })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/refused/i)
  })

  it('clears the slot safely and reports success', () => {
    const storage = memoryStorage({ [SAVED_GAME_KEY]: 'anything' })
    expect(clearSavedGame(storage)).toBe(true)
    expect(storage.data.size).toBe(0)
    expect(clearSavedGame(null)).toBe(false)
  })
})

describe('every point of a real game can be restored', () => {
  it('saves a loadable copy after every state change', () => {
    const storage = memoryStorage()
    let game = startGame()

    const check = (label: string) => {
      const saved = saveGame(game, { storage })
      expect(saved.ok, `save failed at ${label}`).toBe(true)
      const loaded = loadSavedGame(storage)
      expect(loaded.status, `restore failed at ${label}`).toBe('restored')
      if (loaded.status !== 'restored') return
      expect(loaded.game, `state changed at ${label}`).toEqual(game)
    }

    check('start')
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    check('begin round')
    game = must(game, { type: 'SET_WINNER', playerId: 'p1' })
    check('winner')
    game = must(game, { type: 'SET_PENALTY', playerId: 'p2', penalty: 40 })
    check('one penalty')
    game = must(game, { type: 'SET_PENALTY', playerId: 'p3', penalty: 40 })
    game = must(game, { type: 'SET_PENALTY', playerId: 'p4', penalty: 0 })
    check('tied penalty')
    game = must(game, { type: 'CONFIRM_ROUND', at: now() })
    check('confirmed round')
    game = must(game, { type: 'RESOLVE_TIE_BREAK_MANUAL', playerId: 'p2', note: null, at: now() })
    check('manual tie-break')
    game = must(game, { type: 'BEGIN_ROUND', at: now() })
    game = enterRound(game, 'p1', { p3: 40, p4: 4 })
    check('second round entered')
    game = must(game, { type: 'DISCARD_ROUND' })
    check('round discarded')
    game = must(game, { type: 'END_GAME', at: now(), via: 'manual-end' })
    check('finished')
    game = must(game, { type: 'DECLARE_CHAMPION', playerId: 'p1', at: now() })
    check('declared champion')
  })

  it('restores a version-1 save by converting card counts into penalties', () => {
    const storage = memoryStorage()
    const zero = {
      n0: 0, n1: 0, n2: 0, n3: 0, n4: 0, n5: 0, n6: 0, n7: 0, n8: 0, n9: 0,
      skip: 0, reverse: 0, draw2: 0, wild: 0, wild4: 0,
    }
    const legacy = {
      version: 1,
      savedAt: 777,
      game: {
        phase: 'active',
        config: { name: 'Old night', cutoff: 200, startedAt: 5 },
        players: [
          { id: 'p1', name: 'Ana', cumulativeScore: 0, eliminated: false, eliminatedAtRound: null, eliminationOrder: null },
          { id: 'p2', name: 'Ben', cumulativeScore: 5, eliminated: false, eliminatedAtRound: null, eliminationOrder: null },
          { id: 'p3', name: 'Cara', cumulativeScore: 0, eliminated: false, eliminatedAtRound: null, eliminationOrder: null },
        ],
        rounds: [
          {
            id: 'round-1',
            kind: 'round',
            roundNumber: 1,
            winnerId: 'p1',
            winnerName: 'Ana',
            lines: [
              { playerId: 'p1', name: 'Ana', counts: { ...zero, wild: 2 }, totalCards: 2, penalty: 0, previousTotal: 0, newTotal: 0, isWinner: true },
              { playerId: 'p2', name: 'Ben', counts: { ...zero, n5: 1 }, totalCards: 1, penalty: 5, previousTotal: 0, newTotal: 5, isWinner: false },
              { playerId: 'p3', name: 'Cara', counts: zero, totalCards: 0, penalty: 0, previousTotal: 0, newTotal: 0, isWinner: false },
            ],
            cutoff: 200,
            finalizedAt: 6,
            eliminations: [],
            tieBreaks: [],
            outcome: 'continue',
            tieBreakPlayerIds: null,
          },
        ],
        currentRound: {
          id: 'round-2',
          kind: 'round',
          roundNumber: 2,
          participants: ['p1', 'p2', 'p3'],
          entries: {
            p1: { counts: { ...zero, wild4: 1 }, confirmed: true },
            p2: { counts: { ...zero, n7: 3 }, confirmed: true },
            p3: { counts: { ...zero, skip: 1, draw2: 1 }, confirmed: false },
          },
          winnerId: 'p1',
          tieBreakPlayerIds: null,
        },
        tieBreak: null,
        decision: null,
        ending: null,
        allowTwoPlayerRounds: false,
        nextEliminationOrder: 1,
        startedAt: 5,
        transfer: null,
      },
    }
    storage.data.set(SAVED_GAME_KEY, JSON.stringify(legacy))

    const loaded = loadSavedGame(storage)
    expect(loaded.status).toBe('restored')
    if (loaded.status !== 'restored') return

    expect(loaded.savedAt).toBe(777)
    // Finished rounds keep the score they already had, minus the card detail.
    expect(loaded.game.rounds[0].lines).toEqual([
      { playerId: 'p1', name: 'Ana', penalty: 0, previousTotal: 0, newTotal: 0, isWinner: true },
      { playerId: 'p2', name: 'Ben', penalty: 5, previousTotal: 0, newTotal: 5, isWinner: false },
      { playerId: 'p3', name: 'Cara', penalty: 0, previousTotal: 0, newTotal: 0, isWinner: false },
    ])
    // The open round's counters become the penalties they were worth.
    expect(loaded.game.currentRound?.entries).toEqual({
      p1: { penalty: 40 },
      p2: { penalty: 21 },
      p3: { penalty: 30 },
    })
    expect(loaded.game.currentRound?.winnerId).toBe('p1')
  })

  it('does not migrate a damaged legacy save silently', () => {
    const storage = memoryStorage()
    storage.data.set(
      SAVED_GAME_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 1,
        game: {
          phase: 'active',
          config: { name: '', cutoff: 200, startedAt: 1 },
          players: [],
          rounds: [],
          currentRound: null,
          allowTwoPlayerRounds: false,
          nextEliminationOrder: 1,
          startedAt: 1,
          transfer: null,
        },
      }),
    )
    expect(loadSavedGame(storage).status).toBe('discarded')
  })

  it('normalises a save instead of trusting it', () => {
    const game = startGame()
    const parsed = parseSavedGame({
      version: SAVED_GAME_VERSION,
      savedAt: 99,
      game: JSON.parse(JSON.stringify(game)),
    })
    expect(parsed.game).toEqual(game)
    expect(parsed.savedAt).toBe(99)
  })
})
