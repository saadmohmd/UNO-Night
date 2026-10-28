import { useEffect, useRef } from 'react'
import { ArrowRight, Skull, UserMinus } from 'lucide-react'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { EliminationRecord } from '@/game/types'
import { cn, formatNumber } from '@/lib/utils'

const SPLASH_MS = 3800

function reasonFor(elimination: EliminationRecord, cutoff: number): string {
  if (elimination.via === 'tie-break-replay') return 'Lost the tie-break replay.'
  if (elimination.via === 'tie-break-manual') return 'Settled by the table after a cutoff tie.'
  return `Reached the ${formatNumber(cutoff)}-point cutoff.`
}

/**
 * The knockout moment.
 *
 * Shown once per elimination, right after a round is confirmed: the avatar
 * lands, rings pulse out of it, an OUT stamp slams down and the name is struck
 * through. It dismisses itself after a beat (or on tap / Escape) so the table
 * is never held hostage by an animation, and `prefers-reduced-motion` collapses
 * every keyframe to nothing at the CSS level.
 */
export function EliminationSplash({
  elimination,
  cutoff,
  accentIndex,
  onDismiss,
}: {
  elimination: EliminationRecord
  cutoff: number
  accentIndex: number
  onDismiss: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, SPLASH_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey)

    // Hold the page still behind the overlay, and put the table's focus on the
    // one control that gets them back — screen readers announce it from there.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cardRef.current?.focus({ preventScroll: true })

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onDismiss])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="elimination-title"
      data-testid="elimination-splash"
    >
      {/* Tapping anywhere gets the table back to the scoreboard. */}
      <button
        type="button"
        aria-label="Dismiss elimination"
        onClick={onDismiss}
        className="animate-fade-in absolute inset-0 cursor-default bg-bg/88 backdrop-blur-[3px]"
      />

      <div className="animate-elim-slam relative w-full max-w-sm">
        <div
          ref={cardRef}
          tabIndex={-1}
          aria-describedby="elimination-detail"
          className="animate-elim-shake relative overflow-hidden rounded-3xl border border-uno-red/30 bg-surface/95 p-6 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] outline-none"
        >
          {/* Pulsing red bloom behind the avatar. */}
          <div
            aria-hidden="true"
            className="animate-elim-glow pointer-events-none absolute top-4 left-1/2 size-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,95,99,0.45),transparent_68%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-uno-red/60 to-transparent"
          />

          <div className="relative">
            <div className="relative mx-auto flex size-20 items-center justify-center">
              <span
                aria-hidden="true"
                className="animate-elim-ring absolute inset-0 rounded-full border-2 border-uno-red/50"
              />
              <span
                aria-hidden="true"
                className="animate-elim-ring-late absolute inset-0 rounded-full border border-uno-red/35"
              />
              <span className="animate-elim-avatar relative flex size-20 items-center justify-center rounded-full border border-uno-red/35 bg-bg-soft">
                <PlayerAvatar name={elimination.playerName} index={accentIndex} size="lg" />
              </span>
            </div>

            <p className="animate-elim-rise mt-4 text-[10px] font-semibold tracking-[0.3em] text-uno-red uppercase">
              Knocked out
            </p>

            <h2
              id="elimination-title"
              className="relative mt-1 inline-block font-display text-[1.7rem] leading-tight font-semibold tracking-[-0.02em] text-ink"
            >
              <span className="strike-name">{elimination.playerName}</span>
            </h2>

            <div className="animate-elim-rise mt-4 flex items-center justify-center gap-2.5">
              <span className="font-display text-3xl font-semibold text-uno-red tabular-nums">
                {formatNumber(elimination.cumulativeScore)}
              </span>
              <span className="text-[11px] leading-tight text-faint">
                points
                <br />
                at the cutoff
              </span>
            </div>

            <p
              id="elimination-detail"
              className="animate-elim-rise mt-1 text-[12px] leading-relaxed text-muted"
            >
              {reasonFor(elimination, cutoff)}
            </p>

            {/* The stamp lands last, over everything else. */}
            <div
              aria-hidden="true"
              className="animate-elim-stamp mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-uno-red/70 px-4 py-1.5"
            >
              <UserMinus className="size-4 text-uno-red" />
              <span className="font-display text-lg font-bold tracking-[0.24em] text-uno-red">
                OUT
              </span>
              <Skull className="size-4 text-uno-red/70" />
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className={cn(
                'animate-elim-rise mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line/80 bg-surface-2/70 px-4 py-2.5',
                'text-[12px] font-medium text-ink-soft transition-colors hover:border-line-soft hover:text-ink',
              )}
            >
              Back to the results
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
