import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats a number with thousands separators, e.g. 1234 -> "1,234". */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

/** 1st, 2nd, 3rd, 4th ... */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** Initials for avatars: "Maya Rose" -> "MR". */
export function initialsOf(name: string, max = 2): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, max).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).slice(0, max).toUpperCase()
}

/**
 * Deterministically picks one of the four UNO accent slots for a player, so each
 * player keeps a consistent colour for the whole session without storing extra state.
 */
const ACCENTS = ['red', 'yellow', 'green', 'blue'] as const
export type AccentName = (typeof ACCENTS)[number]

export function accentForIndex(index: number): AccentName {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]
}

export const accentClasses: Record<
  AccentName,
  { text: string; bg: string; border: string; dot: string; ring: string; softBg: string }
> = {
  red: {
    text: 'text-uno-red',
    bg: 'bg-uno-red',
    border: 'border-uno-red/40',
    dot: 'bg-uno-red',
    ring: 'ring-uno-red/45',
    softBg: 'bg-uno-red/12',
  },
  yellow: {
    text: 'text-uno-yellow',
    bg: 'bg-uno-yellow',
    border: 'border-uno-yellow/40',
    dot: 'bg-uno-yellow',
    ring: 'ring-uno-yellow/45',
    softBg: 'bg-uno-yellow/12',
  },
  green: {
    text: 'text-uno-green',
    bg: 'bg-uno-green',
    border: 'border-uno-green/40',
    dot: 'bg-uno-green',
    ring: 'ring-uno-green/45',
    softBg: 'bg-uno-green/12',
  },
  blue: {
    text: 'text-uno-blue',
    bg: 'bg-uno-blue',
    border: 'border-uno-blue/40',
    dot: 'bg-uno-blue',
    ring: 'ring-uno-blue/45',
    softBg: 'bg-uno-blue/12',
  },
}

/** Local clock time, e.g. "9:41 PM". */
export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
