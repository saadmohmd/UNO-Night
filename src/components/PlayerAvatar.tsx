import { useId } from 'react'
import { characterFor, type CharacterSpec, type HairStyle } from '@/lib/character'
import { cn } from '@/lib/utils'

const sizes = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
  xl: 'size-16',
} as const

/** Rounded head with a soft jaw — wider at the temples, narrower at the chin. */
const HEAD_PATH =
  'M17.6 25c0-9 6.6-14.8 14.4-14.8S46.4 16 46.4 25v7.4c0 8.4-6.4 14.1-14.4 14.1S17.6 40.8 17.6 32.4Z'

const EYES = { y: 29.4, left: 25.6, right: 38.4, r: 2.4 } as const

/**
 * The region above the hairline. Clipping the head to it means the hair always
 * meets the skull exactly — no skin peeking through at the crown — while the
 * curve itself decides how much forehead each cut shows.
 */
const HAIRLINES: Record<HairStyle, string> = {
  crop: 'M0 0H64V25Q32 18.5 0 25Z',
  bun: 'M0 0H64V25Q32 19.5 0 25Z',
  long: 'M0 0H64V24.5Q32 19 0 24.5Z',
  curls: 'M0 0H64V25Q32 20 0 25Z',
  side: 'M0 0H64V24Q18 30 0 26Z',
  buzz: 'M0 0H64V22.5Q32 16.5 0 22.5Z',
  afro: 'M0 0H64V26Q32 21 0 26Z',
}

/** Hair volume drawn behind the head, plus any style-specific extras. */
function HairBack({ character }: { character: CharacterSpec }) {
  const fill = character.hairColor
  switch (character.style) {
    case 'afro':
      return (
        <g fill={fill}>
          <circle cx="32" cy="25" r="20.6" />
          <circle cx="14.6" cy="17.6" r="5.2" />
          <circle cx="22" cy="8.6" r="5.6" />
          <circle cx="32" cy="5.6" r="6" />
          <circle cx="42" cy="8.6" r="5.6" />
          <circle cx="49.4" cy="17.6" r="5.2" />
        </g>
      )
    case 'bun':
      return (
        <g fill={fill}>
          <ellipse cx="32" cy="22.4" rx="17" ry="15" />
          <circle cx="32" cy="7.4" r="5.4" />
        </g>
      )
    case 'long':
      return (
        <g fill={fill}>
          <ellipse cx="32" cy="22.4" rx="17" ry="15" />
          <rect x="12.8" y="22" width="9" height="27" rx="4.5" />
          <rect x="42.2" y="22" width="9" height="27" rx="4.5" />
        </g>
      )
    case 'curls':
      return (
        <g fill={fill}>
          <ellipse cx="32" cy="23" rx="16.6" ry="14.2" />
          <circle cx="16.6" cy="19.4" r="4.8" />
          <circle cx="22.4" cy="11" r="5" />
          <circle cx="31.4" cy="7.6" r="5.4" />
          <circle cx="40.6" cy="10.4" r="5" />
          <circle cx="47.4" cy="18.6" r="4.6" />
        </g>
      )
    case 'side':
      return (
        <g fill={fill}>
          <ellipse cx="32.4" cy="22.2" rx="17.6" ry="15.4" />
          <ellipse cx="20" cy="20.4" rx="5" ry="4.2" />
        </g>
      )
    case 'buzz':
      return null
    case 'crop':
    default:
      return <ellipse cx="32" cy="22" rx="17.2" ry="15.2" fill={fill} />
  }
}

function Glasses() {
  return (
    <g fill="none" stroke="#332b26" strokeWidth="1.6" strokeLinecap="round">
      <circle cx={EYES.left} cy={EYES.y} r="5.7" />
      <circle cx={EYES.right} cy={EYES.y} r="5.7" />
      <path d="M30.7 29c1-.8 1.6-.8 2.6 0" />
      <path d="M19.9 28.4c-1.4-.6-2-1-2.5-1.8M44.1 28.4c1.4-.6 2-1 2.5-1.8" />
    </g>
  )
}

/** Cheeks, eyes, mouth and glasses — drawn last so nothing hides them. */
function FaceFeatures({ character }: { character: CharacterSpec }) {
  const { smile, glasses } = character
  return (
    <>
      <circle cx="21.2" cy="33.8" r="2.9" fill="#e8836b" opacity="0.42" />
      <circle cx="42.8" cy="33.8" r="2.9" fill="#e8836b" opacity="0.42" />

      <circle cx={EYES.left} cy={EYES.y} r={EYES.r} fill="#2b211c" />
      <circle cx={EYES.right} cy={EYES.y} r={EYES.r} fill="#2b211c" />

      {smile === 'open' ? (
        <g>
          <path d="M26.7 34.9c0 4.3 2.3 6.7 5.3 6.7s5.3-2.4 5.3-6.7Z" fill="#4b2b23" />
          <path d="M27.5 34.9h9v1.7c-2.9 1-6.1 1-9 0Z" fill="#fdf8f2" opacity="0.95" />
        </g>
      ) : (
        <path
          d="M27 35q5 4.6 10 0"
          fill="none"
          stroke="#432f26"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}

      {glasses && <Glasses />}
    </>
  )
}

/**
 * A player's character. Deterministic per name and seat, so the same face shows
 * up in setup, in the round, in the standings and in the knockout splash.
 * Purely decorative: the name is always rendered next to it.
 */
export function PlayerAvatar({
  name,
  index,
  size = 'md',
  dimmed = false,
  className,
}: {
  name: string
  index: number
  size?: keyof typeof sizes
  dimmed?: boolean
  className?: string
}) {
  const character = characterFor(name, index)
  const clipId = useId()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 overflow-hidden rounded-[30%]',
        sizes[size],
        dimmed && 'opacity-70 saturate-[0.65]',
        className,
      )}
      aria-hidden="true"
      data-avatar-style={character.style}
    >
      <svg viewBox="0 0 64 64" className="size-full" focusable="false">
        <defs>
          <clipPath id={clipId}>
            <path d={HAIRLINES[character.style]} />
          </clipPath>
        </defs>

        <rect width="64" height="64" fill={character.background} />

        {/* Neck and shoulders: the bust is cropped by the tile, as on a badge. */}
        <rect x="26.4" y="33" width="11.2" height="16" rx="4.4" fill={character.skin.shade} />
        <path d="M0 64c0-10.6 13.4-16.4 32-16.4s32 5.8 32 16.4Z" fill={character.shirt} />

        <g transform="translate(0,-2.4)">
          <HairBack character={character} />
          <path d={HEAD_PATH} fill={character.skin.face} />
          <g clipPath={`url(#${clipId})`}>
            <path d={HEAD_PATH} fill={character.hairColor} />
          </g>
          <FaceFeatures character={character} />
        </g>
      </svg>
    </span>
  )
}
