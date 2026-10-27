import { cn } from '@/lib/utils'

export function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
  label,
}: {
  value: number
  max?: number
  className?: string
  indicatorClassName?: string
  label?: string
}) {
  const safeMax = max <= 0 ? 1 : max
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100))
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3/80', className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn('h-full rounded-full bg-brand transition-[width] duration-500 ease-out', indicatorClassName)}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
