/** Pure input validation helpers — no React, no side effects. */

import { CARD_KEYS, type RemainingCards } from './cards'

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 7
export const MAX_NAME_LENGTH = 24
export const DEFAULT_CUTOFF = 200
export const MIN_CUTOFF = 1
export const MAX_CUTOFF = 100000
export const MAX_CARD_COUNT = 99

/** Canonical key used to compare names: trims and lower-cases. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function cleanName(name: string): string {
  return name.trim()
}

export interface RosterValidationResult {
  ok: boolean
  errors: {
    /** Global roster-level problems (count, duplicates, empties). */
    general: string[]
    /** Per-index field errors, keyed by player slot. */
    byIndex: Record<number, string>
  }
}

/** Validates 3–7 unique, non-empty display names. */
export function validateRoster(names: string[]): RosterValidationResult {
  const general: string[] = []
  const byIndex: Record<number, string> = {}

  if (names.length < MIN_PLAYERS) {
    general.push(`Add at least ${MIN_PLAYERS} players to start.`)
  }
  if (names.length > MAX_PLAYERS) {
    general.push(`A game supports at most ${MAX_PLAYERS} players.`)
  }

  const cleaned = names.map(cleanName)
  const seen = new Map<string, number>()

  cleaned.forEach((name, index) => {
    if (name.length === 0) {
      byIndex[index] = 'Enter a name.'
      return
    }
    if (name.length > MAX_NAME_LENGTH) {
      byIndex[index] = `Keep names under ${MAX_NAME_LENGTH} characters.`
      return
    }
    const key = normalizeName(name)
    const firstIndex = seen.get(key)
    if (firstIndex !== undefined) {
      byIndex[index] = 'Duplicate name.'
      byIndex[firstIndex] = byIndex[firstIndex] ?? 'Duplicate name.'
      general.push(`Two players are named “${name}”. Names must be unique.`)
    } else {
      seen.set(key, index)
    }
  })

  return {
    ok: general.length === 0 && Object.keys(byIndex).length === 0,
    errors: { general, byIndex },
  }
}

export interface CutoffValidationResult {
  ok: boolean
  value: number | null
  error: string | null
}

/** Accepts only whole numbers within [MIN_CUTOFF, MAX_CUTOFF]. */
export function validateCutoff(raw: string | number): CutoffValidationResult {
  const text = typeof raw === 'number' ? String(raw) : raw.trim()
  if (text.length === 0) {
    return { ok: false, value: null, error: 'Enter a score cutoff.' }
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, value: null, error: 'Use a whole number, e.g. 200.' }
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) {
    return { ok: false, value: null, error: 'That cutoff is too large.' }
  }
  if (value < MIN_CUTOFF) {
    return { ok: false, value: null, error: `Cutoff must be at least ${MIN_CUTOFF}.` }
  }
  if (value > MAX_CUTOFF) {
    return { ok: false, value: null, error: `Keep the cutoff at ${MAX_CUTOFF.toLocaleString()} or below.` }
  }
  return { ok: true, value, error: null }
}

export interface CountParseResult {
  ok: boolean
  value: number | null
  error: string | null
}

/**
 * Parses a single card-count field. Only non-negative whole numbers are valid.
 * Empty means zero while typing; negatives, decimals and text are rejected.
 */
export function parseCardCount(raw: string): CountParseResult {
  const text = raw.trim()
  if (text.length === 0) return { ok: true, value: 0, error: null }
  if (!/^\d+$/.test(text)) {
    if (text.startsWith('-')) return { ok: false, value: null, error: 'Cannot be negative.' }
    return { ok: false, value: null, error: 'Use a whole number.' }
  }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) {
    return { ok: false, value: null, error: 'That number is too large.' }
  }
  if (value > MAX_CARD_COUNT) {
    return { ok: false, value: null, error: `Max ${MAX_CARD_COUNT}.` }
  }
  return { ok: true, value, error: null }
}

/** Common messages for review/approval errors. */
export const ROUND_ERRORS = {
  noWinner: 'Select the round winner.',
  multipleWinners: 'Only one player can win a round.',
  missingPlayer: (name: string) => `Record ${name}'s remaining cards and confirm the hand.`,
  unconfirmedPlayer: (name: string) => `Confirm ${name}'s hand before submitting.`,
  invalidCount: (name: string) => `Fix ${name}'s card counts. Use whole numbers from 0–${MAX_CARD_COUNT}.`,
} as const

export interface RoundValidationContext {
  participants: { id: string; name: string }[]
  entries: Record<string, { counts: RemainingCards; confirmed: boolean } | undefined>
  winnerId: string | null
}

export interface RoundValidationResult {
  ok: boolean
  errors: string[]
  fieldErrors: Record<string, string>
}

/**
 * Validates the current round form. Card counts must exist for every participant,
 * be non-negative whole numbers and be explicitly confirmed. The winner is still
 * validated but their counts cannot change their zero penalty (enforced in rules).
 */
export function validateRoundEntry(ctx: RoundValidationContext): RoundValidationResult {
  const errors: string[] = []
  const fieldErrors: Record<string, string> = {}
  const ids = new Set(ctx.participants.map((p) => p.id))

  if (!ctx.winnerId) {
    errors.push(ROUND_ERRORS.noWinner)
  } else if (!ids.has(ctx.winnerId)) {
    errors.push(ROUND_ERRORS.multipleWinners)
  }

  for (const player of ctx.participants) {
    const entry = ctx.entries[player.id]
    if (!entry) {
      errors.push(ROUND_ERRORS.missingPlayer(player.name))
      fieldErrors[player.id] = ROUND_ERRORS.missingPlayer(player.name)
      continue
    }
    const invalidKeys = CARD_KEYS.filter((key) => {
      const count = entry.counts[key]
      return !Number.isInteger(count) || count < 0 || count > MAX_CARD_COUNT
    })
    if (invalidKeys.length > 0) {
      errors.push(ROUND_ERRORS.invalidCount(player.name))
      fieldErrors[player.id] = ROUND_ERRORS.invalidCount(player.name)
      continue
    }
    if (!entry.confirmed) {
      errors.push(ROUND_ERRORS.unconfirmedPlayer(player.name))
      fieldErrors[player.id] = ROUND_ERRORS.unconfirmedPlayer(player.name)
    }
  }

  return { ok: errors.length === 0, errors, fieldErrors }
}

