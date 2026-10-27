import { accentClasses, accentForIndex, cn, initialsOf } from '@/lib/utils'

const sizes = {
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-[13px]',
  lg: 'size-12 text-[15px]',
  xl: 'size-16 text-xl',
} as const

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
  const accent = accentClasses[accentForIndex(index)]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold tracking-wide',
        sizes[size],
        accent.border,
        accent.softBg,
        accent.text,
        dimmed && 'opacity-50 grayscale',
        className,
      )}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}
