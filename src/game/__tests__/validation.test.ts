import { describe, expect, it } from 'vitest'
import {
  MAX_CUTOFF,
  MAX_NAME_LENGTH,
  MAX_PENALTY,
  parsePenalty,
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

describe('penalty validation', () => {
  it('accepts non-negative whole numbers', () => {
    expect(parsePenalty('0')).toEqual({ ok: true, value: 0, error: null })
    expect(parsePenalty(' 25 ').value).toBe(25)
    expect(parsePenalty('75').value).toBe(75)
    expect(parsePenalty(String(MAX_PENALTY)).ok).toBe(true)
  })

  it('leaves an empty field unset instead of guessing zero', () => {
    expect(parsePenalty('')).toEqual({ ok: true, value: null, error: null })
    expect(parsePenalty('   ').value).toBeNull()
  })

  it('rejects negatives with a clear message', () => {
    expect(parsePenalty('-1')).toEqual({
      ok: false,
      value: null,
      error: 'Cannot be negative.',
    })
  })

  it('rejects decimal and non-numeric input', () => {
    expect(parsePenalty('1.5').ok).toBe(false)
    expect(parsePenalty('two').ok).toBe(false)
    expect(parsePenalty('2e3').ok).toBe(false)
    expect(parsePenalty('25 pts').ok).toBe(false)
  })

  it('rejects values above the maximum', () => {
    expect(parsePenalty(String(MAX_PENALTY + 1)).ok).toBe(false)
  })
})

describe('round entry validation', () => {
  const participants = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Ben' },
  ]
  const entries = {
    a: { penalty: 0 },
    b: { penalty: 15 },
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

  it('ignores the winner’s own entry, which is always zero', () => {
    const result = validateRoundEntry({
      participants,
      entries: { b: { penalty: 15 } },
      winnerId: 'a',
    })
    expect(result.ok).toBe(true)
  })

  it('reports a missing penalty for a non-winning player', () => {
    const result = validateRoundEntry({
      participants,
      entries: { a: { penalty: 0 } },
      winnerId: 'a',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/Ben.*penalty points/i)
    expect(result.fieldErrors.b).toBeTruthy()
  })

  it('treats a cleared field as missing, not as zero', () => {
    const result = validateRoundEntry({
      participants,
      entries: { a: { penalty: 0 }, b: { penalty: null } },
      winnerId: 'a',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/Ben/i)
  })

  it('rejects negative, decimal and oversized penalties', () => {
    for (const penalty of [-1, 1.5, MAX_PENALTY + 1]) {
      const result = validateRoundEntry({
        participants,
        entries: { a: { penalty: 0 }, b: { penalty } },
        winnerId: 'a',
      })
      expect(result.ok, String(penalty)).toBe(false)
      expect(result.errors.join(' ')).toMatch(/whole number/i)
    }
  })
})
