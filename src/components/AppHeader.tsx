import type { ReactNode } from 'react'
import { Brand } from './Brand'
import { cn } from '@/lib/utils'

export function AppHeader({
  onBrandClick,
  children,
  className,
  sticky = true,
}: {
  onBrandClick?: () => void
  children?: ReactNode
  className?: string
  sticky?: boolean
}) {
  return (
    <header
      className={cn(
        'z-30 border-b border-line/60 bg-bg/85 backdrop-blur-md',
        sticky && 'sticky top-0',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        {onBrandClick ? (
          <button
            type="button"
            onClick={onBrandClick}
            className="rounded-xl transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            aria-label="UNO Night — open dashboard"
          >
            <Brand compact />
          </button>
        ) : (
          <Brand compact />
        )}
        {children}
      </div>
    </header>
  )
}

export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/92 backdrop-blur-md',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-safe">
        <div className="flex items-center gap-2.5">{children}</div>
      </div>
    </div>
  )
}

export function ScreenShell({
  children,
  className,
  header,
}: {
  children: ReactNode
  className?: string
  header?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main
        className={cn(
          'mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-36 sm:pt-8',
          className,
        )}
      >
        {children}
      </main>
    </div>
  )
}
