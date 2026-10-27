import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap',
    'transition-[background-color,color,border-color,transform,opacity,box-shadow] duration-150',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:not-disabled:scale-[0.985] select-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-brand-ink shadow-[0_10px_30px_-12px_rgba(255,201,77,0.55)] hover:bg-[#ffd776]',
        secondary:
          'border border-line bg-surface-2 text-ink hover:border-line-soft hover:bg-surface-3',
        outline:
          'border border-line bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
        ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
        danger:
          'border border-uno-red/30 bg-uno-red/12 text-uno-red hover:bg-uno-red/20',
        success:
          'bg-uno-green text-[#042416] shadow-[0_10px_30px_-12px_rgba(61,220,140,0.5)] hover:bg-[#5ce69f]',
        subtle: 'bg-surface-2/70 text-ink-soft hover:bg-surface-3 hover:text-ink',
      },
      size: {
        sm: 'h-9 px-3 text-[13px]',
        md: 'h-11 px-4 text-sm',
        lg: 'h-13 px-6 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-lg',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(asChild ? {} : { type: type ?? 'button' })}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
