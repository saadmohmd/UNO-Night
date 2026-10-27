import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-surface-2 text-ink-soft',
        brand: 'border-brand/30 bg-brand/12 text-brand',
        red: 'border-uno-red/30 bg-uno-red/12 text-uno-red',
        green: 'border-uno-green/30 bg-uno-green/12 text-uno-green',
        blue: 'border-uno-blue/30 bg-uno-blue/12 text-uno-blue',
        yellow: 'border-uno-yellow/30 bg-uno-yellow/12 text-uno-yellow',
        outline: 'border-line bg-transparent text-muted',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
