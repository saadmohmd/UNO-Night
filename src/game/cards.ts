/**
 * UNO card catalogue and penalty arithmetic.
 *
 * These values are the single source of truth for scoring across the whole app.
 * UI components must never re-declare card values — they read CARD_DEFS/CARD_KEYS.
 */

export const CARD_KEYS = [
  'n0',
  'n1',
  'n2',
  'n3',
  'n4',
  'n5',
  'n6',
  'n7',
  'n8',
  'n9',
  'skip',
  'reverse',
  'draw2',
  'wild',
  'wild4',
] as const

export type CardKey = (typeof CARD_KEYS)[number]

export type CardGroup = 'numbers' | 'actions' | 'wilds'

export interface CardDefinition {
  key: CardKey
  /** Human name used in breakdowns, e.g. "Draw Two". */
  label: string
  /** Compact name used on tiles, e.g. "+2". */
  short: string
  /** Points charged per remaining card. */
  value: number
  group: CardGroup
}

export const CARD_DEFS: Record<CardKey, CardDefinition> = {
  n0: { key: 'n0', label: 'Number 0', short: '0', value: 0, group: 'numbers' },
  n1: { key: 'n1', label: 'Number 1', short: '1', value: 1, group: 'numbers' },
  n2: { key: 'n2', label: 'Number 2', short: '2', value: 2, group: 'numbers' },
  n3: { key: 'n3', label: 'Number 3', short: '3', value: 3, group: 'numbers' },
  n4: { key: 'n4', label: 'Number 4', short: '4', value: 4, group: 'numbers' },
  n5: { key: 'n5', label: 'Number 5', short: '5', value: 5, group: 'numbers' },
  n6: { key: 'n6', label: 'Number 6', short: '6', value: 6, group: 'numbers' },
  n7: { key: 'n7', label: 'Number 7', short: '7', value: 7, group: 'numbers' },
  n8: { key: 'n8', label: 'Number 8', short: '8', value: 8, group: 'numbers' },
  n9: { key: 'n9', label: 'Number 9', short: '9', value: 9, group: 'numbers' },
  skip: { key: 'skip', label: 'Skip', short: 'Skip', value: 10, group: 'actions' },
  reverse: { key: 'reverse', label: 'Reverse', short: 'Reverse', value: 10, group: 'actions' },
  draw2: { key: 'draw2', label: 'Draw Two (+2)', short: '+2', value: 20, group: 'actions' },
  wild: { key: 'wild', label: 'Wild', short: 'Wild', value: 40, group: 'wilds' },
  wild4: {
    key: 'wild4',
    label: 'Wild Draw Four (+4)',
    short: '+4',
    value: 40,
    group: 'wilds',
  },
}

export const CARD_GROUPS: { id: CardGroup; title: string; keys: CardKey[] }[] = [
  {
    id: 'numbers',
    title: 'Number cards',
    keys: CARD_KEYS.filter((key) => CARD_DEFS[key].group === 'numbers'),
  },
  {
    id: 'actions',
    title: 'Action cards',
    keys: CARD_KEYS.filter((key) => CARD_DEFS[key].group === 'actions'),
  },
  {
    id: 'wilds',
    title: 'Wild cards',
    keys: CARD_KEYS.filter((key) => CARD_DEFS[key].group === 'wilds'),
  },
]

/** Remaining-card counts for one player's hand. Every key is required. */
export type RemainingCards = Record<CardKey, number>

/** A player's recorded hand entry for a round. */
export interface PlayerHandEntry {
  counts: RemainingCards
  /** True once the operator has explicitly reviewed this player's hand. */
  confirmed: boolean
}

export type HandEntries = Record<string, PlayerHandEntry>

export function emptyRemainingCards(): RemainingCards {
  return CARD_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as RemainingCards)
}

/** Total number of physical cards in a hand. */
export function totalCards(counts: RemainingCards): number {
  return CARD_KEYS.reduce((sum, key) => sum + counts[key], 0)
}

/** Penalty for a hand: sum of (card count × card value). */
export function calculatePenalty(counts: RemainingCards): number {
  return CARD_KEYS.reduce((sum, key) => sum + counts[key] * CARD_DEFS[key].value, 0)
}

export interface PenaltyLine {
  key: CardKey
  label: string
  short: string
  count: number
  value: number
  subtotal: number
}

/** Card-by-card maths, omitting card types with a count of zero. */
export function penaltyBreakdown(counts: RemainingCards): PenaltyLine[] {
  return CARD_KEYS.filter((key) => counts[key] > 0).map((key) => ({
    key,
    label: CARD_DEFS[key].label,
    short: CARD_DEFS[key].short,
    count: counts[key],
    value: CARD_DEFS[key].value,
    subtotal: counts[key] * CARD_DEFS[key].value,
  }))
}

/** "7 × 2 · Skip × 1 · Wild × 1" — empty hands produce "No cards". */
export function formatPenaltyBreakdown(counts: RemainingCards): string {
  const lines = penaltyBreakdown(counts)
  if (lines.length === 0) return 'No cards'
  return lines.map((line) => `${line.short} × ${line.count}`).join(' · ')
}

