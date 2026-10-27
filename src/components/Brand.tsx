import { cn } from '@/lib/utils'

/**
 * Original UNO Night mark: four coloured card pips around a night-blue core,
 * topped with a crescent. Not derived from any official UNO artwork.
 */
export function BrandMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="14" fill="#0D1729" stroke="#26354F" strokeWidth="1.5" />
      <g>
        <rect x="11" y="12" width="10.5" height="10.5" rx="3.4" fill="#FF5F63" transform="rotate(-10 16.25 17.25)" />
        <rect x="26" y="11" width="10.5" height="10.5" rx="3.4" fill="#FFCF4D" transform="rotate(9 31.25 16.25)" />
        <rect x="11.5" y="27" width="10.5" height="10.5" rx="3.4" fill="#3DDC8C" transform="rotate(8 16.75 32.25)" />
        <rect x="26.5" y="26.5" width="10.5" height="10.5" rx="3.4" fill="#59A0FF" transform="rotate(-9 31.75 31.75)" />
      </g>
      <circle cx="24" cy="24" r="5.4" fill="#0A1220" />
      <path
        d="M31.4 20.2a5.1 5.1 0 1 0 4.2 7.9 5.7 5.7 0 0 1-4.2-7.9Z"
        fill="#F2F6FF"
        fillOpacity="0.92"
      />
    </svg>
  )
}

export function Brand({
  compact = false,
  subtitle,
  className,
}: {
  compact?: boolean
  subtitle?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={compact ? 32 : 40} />
      <div className="leading-none">
        <div
          className={cn(
            'font-display font-semibold tracking-tight text-ink',
            compact ? 'text-[17px]' : 'text-xl',
          )}
        >
          UNO <span className="text-brand">Night</span>
        </div>
        <div
          className={cn(
            'mt-1 text-[9px] font-semibold tracking-[0.22em] text-faint uppercase',
            compact && 'mt-0.5 text-[8px]',
          )}
        >
          {subtitle ?? 'Score Tracker'}
        </div>
      </div>
    </div>
  )
}
