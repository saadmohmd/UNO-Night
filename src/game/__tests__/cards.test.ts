import { describe, expect, it } from 'vitest'
import {
  CARD_DEFS,
  CARD_KEYS,
  calculatePenalty,
  emptyRemainingCards,
  formatPenaltyBreakdown,
  penaltyBreakdown,
  totalCards,
  type CardKey,
  type RemainingCards,
} from '../cards'

function hand(entries: Partial<Record<CardKey, number>>): RemainingCards {
  return { ...emptyRemainingCards(), ...entries }
}

describe('card point values', () => {
  it('uses the exact specified values for every card', () => {
    const expected: Record<CardKey, number> = {
      n0: 0,
      n1: 1,
      n2: 2,
      n3: 3,
      n4: 4,
      n5: 5,
      n6: 6,
      n7: 7,
      n8: 8,
      n9: 9,
      skip: 10,
      reverse: 10,
      draw2: 20,
      wild: 40,
      wild4: 40,
    }
    for (const key of CARD_KEYS) {
      expect(CARD_DEFS[key].value, key).toBe(expected[key])
    }
  })

  it('defines every card exactly once', () => {
    expect(new Set(CARD_KEYS).size).toBe(CARD_KEYS.length)
    expect(CARD_KEYS).toHaveLength(15)
  })

  it('starts with an all-zero hand', () => {
    const empty = emptyRemainingCards()
    expect(totalCards(empty)).toBe(0)
    expect(calculatePenalty(empty)).toBe(0)
    expect(penaltyBreakdown(empty)).toEqual([])
  })
})

describe('round penalty calculations', () => {
  it('scores zero for a hand of number 0 cards', () => {
    expect(calculatePenalty(hand({ n0: 4 }))).toBe(0)
    expect(totalCards(hand({ n0: 4 }))).toBe(4)
  })

  it('calculates the example from the rules: two 7s, a Skip and a Wild', () => {
    const cards = hand({ n7: 2, skip: 1, wild: 1 })
    expect(calculatePenalty(cards)).toBe(64)
    expect(totalCards(cards)).toBe(4)
  })

  it('calculates the example from the rules: Draw Two and Wild Draw Four', () => {
    const cards = hand({ draw2: 1, wild4: 1 })
    expect(calculatePenalty(cards)).toBe(60)
    expect(totalCards(cards)).toBe(2)
  })

  it('counts action cards at ten points each', () => {
    expect(calculatePenalty(hand({ skip: 3, reverse: 2 }))).toBe(50)
  })

  it('supports mixed hands and large counts', () => {
    const cards = hand({ n9: 9, reverse: 1, draw2: 2, wild: 1, wild4: 2 })
    expect(calculatePenalty(cards)).toBe(81 + 10 + 40 + 40 + 80)
    expect(totalCards(cards)).toBe(15)
  })

  it('returns a card-by-card breakdown, omitting zero counts', () => {
    const lines = penaltyBreakdown(hand({ n7: 2, skip: 1, wild: 1, draw2: 0 }))
    expect(lines).toEqual([
      { key: 'n7', label: 'Number 7', short: '7', count: 2, value: 7, subtotal: 14 },
      { key: 'skip', label: 'Skip', short: 'Skip', count: 1, value: 10, subtotal: 10 },
      { key: 'wild', label: 'Wild', short: 'Wild', count: 1, value: 40, subtotal: 40 },
    ])
  })

  it('formats a compact breakdown for summaries', () => {
    expect(formatPenaltyBreakdown(hand({ n7: 2, wild4: 1 }))).toBe('7 × 2 · +4 × 1')
    expect(formatPenaltyBreakdown(hand({}))).toBe('No cards')
  })
})
