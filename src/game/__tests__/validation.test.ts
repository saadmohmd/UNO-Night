import { describe, expect, it } from 'vitest'
import { emptyRemainingCards } from '../cards'
import {
  MAX_CUTOFF,
  MAX_NAME_LENGTH,
  parseCardCount,
  validateCutoff,
  validateRoster,
  validateRoundEntry,
} from '../validation'

describe('roster validation', () => {
  it('accepts 3 to 7 unique names', () => {
    expect(validateRoster(['Ana', 'Ben', 'Cara']).ok).toBe(true)
    expect(validateRoster(['Ana', 'Ben', 'Cara', 'Dev', 'Eve', 'Finn', 'Gia']).ok).toBe(true)
  })

  it('rejects fewer than three players', () => {
    const result = validateRoster(['Ana', 'Ben'])
    expect(result.ok).toBe(false)
    expect(result.errors.general.join(' ')).toMatch(/at least 3/i)
  })

  it('rejects more than seven players', () => {
    const result = validateRoster(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect(result.ok).toBe(false)
    expect(result.errors.general.join(' ')).toMatch(/at most 7/i)
  })

  it('rejects empty or whitespace-only names', () => {
    const result = validateRoster(['Ana', '   ', 'Cara'])
    expect(result.ok).toBe(false)
    expect(result.errors.byIndex[1]).toMatch(/enter a name/i)
  })

  it('rejects duplicate names, ignoring case and surrounding whitespace', () => {
    const result = validateRoster(['Ana', '  aNa  ', 'Cara'])
    expect(result.ok).toBe(false)
    expect(result.errors.byIndex[1]).toMatch(/duplicate/i)
    expect(result.errors.general.join(' ')).toMatch(/unique/i)
  })

  it('allows names that only share a prefix', () => {
    expect(validateRoster(['Ana', 'Anabel', 'Cara']).ok).toBe(true)
  })

  it('rejects names that are too long', () => {
    const result = validateRoster(['Ana', 'B'.repeat(MAX_NAME_LENGTH + 1), 'Cara'])
    expect(result.ok).toBe(false)
    expect(result.errors.byIndex[1]).toMatch(/characters/i)
  })
})

describe('cutoff validation', () => {
  it('accepts whole positive numbers within range', () => {
    expect(validateCutoff('200')).toEqual({ ok: true, value: 200, error: null })
    expect(validateCutoff(' 1 ').value).toBe(1)
    expect(validateCutoff(String(MAX_CUTOFF)).ok).toBe(true)
    expect(validateCutoff(300).value).toBe(300)
  })

  it('rejects empty input', () => {
    expect(validateCutoff('').ok).toBe(false)
    expect(validateCutoff('   ').error).toMatch(/enter a score cutoff/i)
  })

  it('rejects decimals, negatives, text and zero', () => {
    for (const raw of ['12.5', '-5', 'abc', '0', '1e3', '200,000']) {
      expect(validateCutoff(raw).ok, raw).toBe(false)
    }
  })

  it('rejects values above the maximum', () => {
    expect(validateCutoff(String(MAX_CUTOFF + 1)).ok).toBe(false)
  })
})

describe('card count validation', () => {
  it('accepts non-negative whole numbers', () => {
    expect(parseCardCount('0')).toEqual({ ok: true, value: 0, error: null })
    expect(parseCardCount(' 12 ').value).toBe(12)
    expect(parseCardCount('').value).toBe(0)
    expect(parseCardCount('99').ok).toBe(true)
  })

  it('rejects negatives with a clear message', () => {
    expect(parseCardCount('-1')).toEqual({
      ok: false,
      value: null,
      error: 'Cannot be negative.',
    })
  })

  it('rejects decimal and non-numeric input', () => {
    expect(parseCardCount('1.5').ok).toBe(false)
    expect(parseCardCount('two').ok).toBe(false)
    expect(parseCardCount('2e3').ok).toBe(false)
  })

  it('rejects values above the per-card maximum', () => {
    expect(parseCardCount('100').ok).toBe(false)
  })
})

describe('round entry validation', () => {
  const participants = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Ben' },
  ]
  const entries = {
    a: { counts: emptyRemainingCards(), confirmed: true },
    b: { counts: emptyRemainingCards(), confirmed: true },
  }

  it('accepts a complete round with one winner', () => {
    expect(validateRoundEntry({ participants, entries, winnerId: 'a' }).ok).toBe(true)
  })

  it('requires a winner', () => {
    const result = validateRoundEntry({ participants, entries, winnerId: null })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/select the round winner/i)
  })

  it('rejects a winner who is not in the round', () => {
    const result = validateRoundEntry({ participants, entries, winnerId: 'z' })
    expect(result.ok).toBe(false)
  })

  it('reports missing player entries', () => {
    const result = validateRoundEntry({
      participants,
      entries: { a: entries.a },
      winnerId: 'a',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/Ben.*remaining cards/i)
  })

  it('requires hands to be explicitly confirmed', () => {
    const result = validateRoundEntry({
      participants,
      entries: { a: entries.a, b: { ...entries.b, confirmed: false } },
      winnerId: 'a',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/confirm Ben/i)
  })

  it('rejects negative, decimal and oversized counts', () => {
    const bad = {
      a: { counts: { ...emptyRemainingCards(), wild: -1 }, confirmed: true },
      b: { counts: { ...emptyRemainingCards(), skip: 1.5 }, confirmed: true },
    } as typeof entries
    const result = validateRoundEntry({ participants, entries: bad, winnerId: 'a' })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/whole numbers/i)
  })
})
