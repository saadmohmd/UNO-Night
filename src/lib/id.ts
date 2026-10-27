let sequence = 0

/** Collision-resistant client-side id generator (no server involvement). */
export function createId(prefix = 'p'): string {
  sequence += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${sequence.toString(36)}${random}`
}
