import * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full resize-none rounded-xl border border-line bg-surface-2/60 px-3.5 py-3 text-sm text-ink',
        'placeholder:text-faint transition-colors',
        'hover:border-line-soft focus:border-brand/60 focus:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-brand/15',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { Textarea }
