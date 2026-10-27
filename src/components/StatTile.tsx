import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-line/70 bg-surface/60 p-3.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className="mt-1.5 font-display text-xl font-semibold tracking-tight text-ink tabular-nums">
        {value}
      </div>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-3', className)}>
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {description && <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
