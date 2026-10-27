import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'h-12 w-full rounded-xl border border-line bg-surface-2/60 px-3.5 text-[15px] text-ink',
        'placeholder:text-faint',
        'transition-colors duration-150',
        'hover:border-line-soft focus:border-brand/60 focus:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-uno-red/60 aria-invalid:focus:ring-uno-red/15',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
