/**
 * Frozen card table, kept only to read data written by older builds.
 *
 * Earlier versions of the app asked the operator to count individual cards and
 * derived the penalty from UNO's card values. Scores are now typed in directly,
 * so nothing in the live game uses this table: it exists so a game saved (or a
 * transfer code generated) before that change can still be opened with the
 * same numbers it had on screen.
 *
 * Do not use these values anywhere else, and do not change them — they describe
 * what old data means, not what the app scores today.
 */

const LEGACY_CARD_VALUES: Record<string, number> = {
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

const LEGACY_CARD_KEYS = Object.keys(LEGACY_CARD_VALUES)

/**
 * Converts a legacy `{ n0, n1, …, wild4 }` counter object into the penalty it
 * used to be worth. Returns `null` when the value is not a complete, valid
 * counter object, so a damaged record is rejected instead of guessed at.
 */
export function legacyPenalty(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const counts = value as Record<string, unknown>
  let total = 0
  for (const key of LEGACY_CARD_KEYS) {
    const count = counts[key]
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 99) {
      return null
    }
    total += count * LEGACY_CARD_VALUES[key]
  }
  return total
}
