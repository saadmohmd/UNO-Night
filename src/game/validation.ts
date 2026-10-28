/** Pure input validation helpers — no React, no side effects. */

import type { RoundEntries } from './types'

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 7
export const MAX_NAME_LENGTH = 24
export const DEFAULT_CUTOFF = 200
export const MIN_CUTOFF = 1
export const MAX_CUTOFF = 100000
/** Sanity ceiling for a single round's penalty. Far above any real hand. */
export const MAX_PENALTY = 9999

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

export interface PenaltyParseResult {
  ok: boolean
  /** `null` while the field is empty — the round simply is not ready yet. */
  value: number | null
  error: string | null
}

/**
 * Parses one penalty field. Empty is allowed while typing (it returns `null`
 * rather than zero, so an untouched field is never mistaken for a real score);
 * negatives, decimals and text are rejected.
 */
export function parsePenalty(raw: string): PenaltyParseResult {
  const text = raw.trim()
  if (text.length === 0) return { ok: true, value: null, error: null }
  if (text.startsWith('-')) return { ok: false, value: null, error: 'Cannot be negative.' }
  if (!/^\d+$/.test(text)) return { ok: false, value: null, error: 'Use whole numbers only.' }
  const value = Number(text)
  if (!Number.isSafeInteger(value)) {
    return { ok: false, value: null, error: 'That number is too large.' }
  }
  if (value > MAX_PENALTY) {
    return { ok: false, value: null, error: `Max ${MAX_PENALTY}.` }
  }
  return { ok: true, value, error: null }
}

/** Common messages for round review errors. */
export const ROUND_ERRORS = {
  noWinner: 'Select the round winner.',
  multipleWinners: 'Only one player can win a round.',
  missingPenalty: (name: string) => `Enter ${name}'s penalty points.`,
  invalidPenalty: (name: string) =>
    `Fix ${name}'s penalty — use a whole number from 0 to ${MAX_PENALTY}.`,
} as const

export interface RoundValidationContext {
  participants: { id: string; name: string }[]
  entries: RoundEntries
  winnerId: string | null
}

export interface RoundValidationResult {
  ok: boolean
  errors: string[]
  fieldErrors: Record<string, string>
}

/**
 * Validates the current round. A round is ready to confirm when exactly one of
 * its players is the winner and every other player has a whole, non-negative
 * penalty. The winner needs no entry: their score is always zero.
 */
export function validateRoundEntry(ctx: RoundValidationContext): RoundValidationResult {
  const errors: string[] = []
  const fieldErrors: Record<string, string> = {}
  const ids = new Set(ctx.participants.map((player) => player.id))

  if (!ctx.winnerId) {
    errors.push(ROUND_ERRORS.noWinner)
  } else if (!ids.has(ctx.winnerId)) {
    errors.push(ROUND_ERRORS.multipleWinners)
  }

  for (const player of ctx.participants) {
    if (player.id === ctx.winnerId) continue
    const entry = ctx.entries[player.id]
    if (!entry || entry.penalty === null) {
      errors.push(ROUND_ERRORS.missingPenalty(player.name))
      fieldErrors[player.id] = ROUND_ERRORS.missingPenalty(player.name)
      continue
    }
    const penalty = entry.penalty
    if (!Number.isInteger(penalty) || penalty < 0 || penalty > MAX_PENALTY) {
      errors.push(ROUND_ERRORS.invalidPenalty(player.name))
      fieldErrors[player.id] = ROUND_ERRORS.invalidPenalty(player.name)
    }
  }

  return { ok: errors.length === 0, errors, fieldErrors }
}
