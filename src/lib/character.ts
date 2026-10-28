import { accentForIndex } from '@/lib/utils'

/**
 * Players are drawn rather than photographed: every character is a small SVG
 * built from a curated palette, picked deterministically from the name and the
 * seat at the table. Same player, same face — on every screen, after a refresh,
 * and after a round is reopened from storage.
 */

export type HairStyle = 'crop' | 'side' | 'curls' | 'bun' | 'long' | 'buzz' | 'afro'
export type SmileStyle = 'soft' | 'open'

export interface SkinTone {
  /** Face, ears, neck highlight. */
  face: string
  /** Ears, neck and the shadow under the hairline. */
  shade: string
}

export interface CharacterSpec {
  style: HairStyle
  skin: SkinTone
  hairColor: string
  shirt: string
  background: string
  glasses: boolean
  smile: SmileStyle
}

const SKINS: SkinTone[] = [
  { face: '#f4cba6', shade: '#e3b48c' },
  { face: '#e6b184', shade: '#d29b6c' },
  { face: '#cb9268', shade: '#b67c53' },
  { face: '#a96f48', shade: '#945c37' },
  { face: '#83502f', shade: '#6d4025' },
]

const HAIR_COLORS = ['#38271f', '#221c19', '#6a3d27', '#95562f', '#c9a26a']

const SHIRTS = ['#3d2b24', '#25303e', '#2f4740', '#472d3b', '#403c35']

export const HAIR_STYLES: readonly HairStyle[] = [
  'crop',
  'side',
  'curls',
  'bun',
  'long',
  'buzz',
  'afro',
]

/** Pastel tile behind the bust, keyed to the player's accent so colours stay legible. */
const BACKGROUNDS = {
  red: '#f7dad5',
  yellow: '#f6ecd2',
  green: '#dbe9d5',
  blue: '#d6e6f2',
} as const

/** FNV-1a: small, fast, and stable across browsers. */
function hashName(name: string): number {
  const normalized = name.trim().toLowerCase()
  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function characterFor(name: string, index: number): CharacterSpec {
  const seed = hashName(name)
  const seat = ((index % 7) + 7) % 7
  // The seat drives the silhouette, with strides coprime with each palette, so a
  // table of up to seven players never shows the same face twice. The name hash
  // only shifts the colours, which keeps matches (and rematches) looking varied
  // while a player keeps the same face for the whole game.
  const style = HAIR_STYLES[(seat * 3) % HAIR_STYLES.length]
  const skin = SKINS[(seat * 2) % SKINS.length]
  const hairColor = HAIR_COLORS[(seat * 2 + Math.floor(seed / 7)) % HAIR_COLORS.length]
  const shirt = SHIRTS[(seat + Math.floor(seed / 13)) % SHIRTS.length]
  return {
    style,
    skin,
    hairColor,
    shirt,
    background: BACKGROUNDS[accentForIndex(index)],
    glasses: seat % 3 === 2,
    smile: Math.floor(seed / 19) % 3 === 0 ? 'open' : 'soft',
  }
}

export const FACE = { eyeY: 29.6, leftEyeX: 25.4, rightEyeX: 38.6, mouthY: 35.8 } as const
